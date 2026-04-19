/**
 * Runtime binding resolver. Widgets call /api/bind?source=<kind>&... to fetch
 * live data. The runtime is the only thing that knows how to reach the local
 * sensor bus, the Prism URL, and the siphon URL (via WG).
 *
 * Real-source wiring:
 *   - local.gps      → gpsd over TCP (127.0.0.1:2947)
 *   - local.starlink → dishy gRPC at 192.168.100.1:9200 (future; mocked when off)
 *   - local.weather  → Davis WLL /v1/current_conditions (WLL_URL)
 *   - prism.<lens>   → PRISM_URL /api/lenses/<lens>/latest with last-good cache
 *   - siphon.<id>    → SIPHON_URL /v1/sources/<id>/latest (best-effort)
 *
 * All upstream calls fall through to a last-known-good cache on failure so
 * the dashboard degrades gracefully when the van loses an uplink.
 */
import { NextResponse } from "next/server";
import net from "net";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/* ----------------------------- gpsd singleton ----------------------------- */

type GpsState = {
  lat?: number;
  lon?: number;
  altM?: number;
  speedKph?: number;
  headingDeg?: number;
  fixMode?: number;
  satellites?: number;
  ts?: string;
  updatedAt?: number;
};

const g: { gpsState: GpsState; gpsdClient?: net.Socket; gpsdReconnectAt?: number } =
  (globalThis as any).__cockpitBindState ?? { gpsState: {} };
(globalThis as any).__cockpitBindState = g;

function ensureGpsd() {
  if (g.gpsdClient) return;
  if (g.gpsdReconnectAt && Date.now() < g.gpsdReconnectAt) return;
  const host = process.env.GPSD_HOST ?? "127.0.0.1";
  const port = Number(process.env.GPSD_PORT ?? 2947);
  const client = net.createConnection({ host, port });
  let buf = "";
  client.setKeepAlive(true, 30_000);
  client.on("connect", () => {
    client.write('?WATCH={"enable":true,"json":true}\n');
  });
  client.on("data", (chunk) => {
    buf += chunk.toString("utf8");
    let idx: number;
    while ((idx = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (!line.trim()) continue;
      try {
        const m = JSON.parse(line);
        if (m.class === "TPV") {
          const s = g.gpsState;
          if (typeof m.lat === "number") s.lat = m.lat;
          if (typeof m.lon === "number") s.lon = m.lon;
          if (typeof m.altHAE === "number") s.altM = m.altHAE;
          else if (typeof m.alt === "number") s.altM = m.alt;
          if (typeof m.speed === "number") s.speedKph = Math.round(m.speed * 3.6 * 10) / 10;
          if (typeof m.track === "number") s.headingDeg = Math.round(m.track);
          if (typeof m.mode === "number") s.fixMode = m.mode;
          if (m.time) s.ts = m.time;
          s.updatedAt = Date.now();
        } else if (m.class === "SKY" && Array.isArray(m.satellites)) {
          g.gpsState.satellites = m.satellites.filter((x: any) => x.used).length;
        }
      } catch {}
    }
  });
  const onDead = () => {
    g.gpsdClient = undefined;
    g.gpsdReconnectAt = Date.now() + 3_000;
  };
  client.on("error", onDead);
  client.on("close", onDead);
  g.gpsdClient = client;
}

function readGps() {
  ensureGpsd();
  const s = g.gpsState;
  const stale = s.updatedAt ? Math.round((Date.now() - s.updatedAt) / 1000) : null;
  return {
    lat: s.lat ?? null,
    lon: s.lon ?? null,
    altM: s.altM ?? null,
    speedKph: s.speedKph ?? null,
    headingDeg: s.headingDeg ?? null,
    fixMode: s.fixMode ?? 0,        // 0=no fix, 1=no fix, 2=2D, 3=3D
    satellites: s.satellites ?? null,
    ts: s.ts ?? null,
    staleSec: stale,
  };
}

/* ----------------------------- generic fetch ----------------------------- */

async function fetchJson(url: string, timeoutMs = 1500): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { cache: "no-store", signal: ctrl.signal });
    if (!r.ok) throw new Error(`http ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

/* ----------------------------- prism + siphon ----------------------------- */

const lastGood: Record<string, { data: any; ts: number }> = {};

async function fetchPrism(lens: string): Promise<any> {
  const base = process.env.PRISM_URL ?? "http://10.200.0.10:3885";
  const url = `${base}/api/lenses/${encodeURIComponent(lens)}/latest`;
  try {
    const data = await fetchJson(url);
    lastGood[`prism:${lens}`] = { data, ts: Date.now() };
    return data;
  } catch {
    const c = lastGood[`prism:${lens}`];
    if (c) return { ...c.data, __stale: Math.round((Date.now() - c.ts) / 1000) };
    return { error: "prism_unreachable" };
  }
}

async function fetchSiphon(sourceId: string): Promise<any> {
  const base = process.env.SIPHON_URL ?? "http://10.200.0.10:3884";
  const url = `${base}/v1/sources/${encodeURIComponent(sourceId)}/latest`;
  try {
    const data = await fetchJson(url);
    lastGood[`siphon:${sourceId}`] = { data, ts: Date.now() };
    return data;
  } catch {
    const c = lastGood[`siphon:${sourceId}`];
    if (c) return { ...c.data, __stale: Math.round((Date.now() - c.ts) / 1000) };
    return { events: [], error: "siphon_unreachable" };
  }
}

/* ----------------------------- local sensors ----------------------------- */

async function readWeather(): Promise<any> {
  const base = process.env.WLL_URL;
  if (!base) return { error: "wll_not_configured" };
  try {
    const data = await fetchJson(`${base}/v1/current_conditions`, 1200);
    // WLL payload: data.data.conditions[] — first element is ISS roof block.
    const conditions = data?.data?.conditions ?? [];
    const iss = conditions.find((c: any) => c.data_structure_type === 1) ?? conditions[0];
    if (!iss) return { error: "wll_empty" };
    // Davis reports temp_out in °F, wind_speed in mph — convert to °C / km/h.
    const fToC = (f: number | null) => (typeof f === "number" ? Math.round((f - 32) * 5 / 9 * 10) / 10 : null);
    const mphToKph = (m: number | null) => (typeof m === "number" ? Math.round(m * 1.609344 * 10) / 10 : null);
    return {
      tempC: fToC(iss.temp ?? iss.temp_out ?? null),
      humidityPct: iss.hum ?? iss.hum_out ?? null,
      windKph: mphToKph(iss.wind_speed_last ?? iss.wind_speed_avg_last_1_min ?? null),
      windDirDeg: iss.wind_dir_last ?? iss.wind_dir_at_hi_speed_last_10_min ?? null,
      rainRateMm: iss.rain_rate_last_mm ?? null,
      solarWm2: iss.solar_rad ?? null,
      uv: iss.uv_index ?? null,
    };
  } catch (e: any) {
    return { error: "wll_unreachable", detail: e?.message ?? String(e) };
  }
}

async function readStarlink(): Promise<any> {
  const base = process.env.STARLINK_PROXY_URL;
  if (base) {
    try { return await fetchJson(`${base}/status`, 1200); } catch {}
  }
  // No proxy configured — Starlink gRPC isn't trivial from Next.js without a
  // companion service. Return a placeholder so the tile doesn't render blank.
  return { dlMbps: null, ulMbps: null, latMs: null, obstructedPct: null, state: "not_configured" };
}

/* ----------------------------- route ----------------------------- */

export async function GET(req: Request) {
  const u = new URL(req.url);
  const source = u.searchParams.get("source");

  switch (source) {
    case "local": {
      const sensor = u.searchParams.get("sensor");
      if (sensor === "gps") return NextResponse.json(readGps());
      if (sensor === "starlink") return NextResponse.json(await readStarlink());
      if (sensor === "weather") return NextResponse.json(await readWeather());
      if (sensor === "roof") {
        const w = await readWeather();
        return NextResponse.json({ tempC: w.tempC ?? null, error: w.error });
      }
      if (sensor === "compute") {
        // Lazy imports — node fs/os — cheap to read each poll.
        const os = await import("node:os");
        const loads = os.loadavg();
        return NextResponse.json({
          hostname: os.hostname(),
          loadAvg1: Math.round(loads[0] * 100) / 100,
          loadAvg5: Math.round(loads[1] * 100) / 100,
          loadAvg15: Math.round(loads[2] * 100) / 100,
          memUsedPct: Math.round((1 - os.freemem() / os.totalmem()) * 100),
          uptimeSec: Math.round(os.uptime()),
        });
      }
      return NextResponse.json({ error: "unknown_sensor" }, { status: 400 });
    }
    case "prism": {
      const lens = u.searchParams.get("lens");
      if (!lens) return NextResponse.json({ error: "lens_required" }, { status: 400 });
      return NextResponse.json(await fetchPrism(lens));
    }
    case "siphon": {
      const sourceId = u.searchParams.get("sourceId");
      if (!sourceId) return NextResponse.json({ error: "sourceId_required" }, { status: 400 });
      return NextResponse.json(await fetchSiphon(sourceId));
    }
    default:
      return NextResponse.json({ error: "unknown_source" }, { status: 400 });
  }
}
