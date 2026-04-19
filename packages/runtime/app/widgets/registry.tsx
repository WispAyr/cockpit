"use client";
import { type WidgetInstance, type Binding } from "@cockpit/schema";
import { useEffect, useRef, useState } from "react";

function useBindingData(bind: Binding | undefined): any {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    if (!bind) return;
    let alive = true;
    const refreshMs = "refreshMs" in bind ? (bind.refreshMs ?? 5000) : 5000;
    async function tick() {
      const v = await resolveBinding(bind!);
      if (alive) setData(v);
    }
    tick();
    const id = setInterval(tick, refreshMs);
    return () => { alive = false; clearInterval(id); };
  }, [JSON.stringify(bind)]);
  return data;
}

async function resolveBinding(bind: Binding): Promise<any> {
  if (bind.source === "static") return bind.value;
  if (bind.source === "camera") return { streamUrl: `/stream/${bind.vehicleCameraSlug}.m3u8`, posterUrl: `/stream/${bind.vehicleCameraSlug}/frame.jpg` };
  const params = new URLSearchParams();
  params.set("source", bind.source);
  if (bind.source === "prism") params.set("lens", bind.lens);
  if (bind.source === "siphon") params.set("sourceId", bind.sourceId);
  if (bind.source === "local") params.set("sensor", bind.sensor);
  try {
    const r = await fetch(`/api/bind?${params.toString()}`, { cache: "no-store" });
    if (!r.ok) return { error: `bind ${r.status}` };
    return r.json();
  } catch (e: any) {
    return { error: e?.message ?? "bind_error" };
  }
}

function Tile({ w, children, pad }: { w: WidgetInstance; children: React.ReactNode; pad?: boolean }) {
  const style: React.CSSProperties = {
    gridColumn: `${w.grid.col} / span ${w.grid.w}`,
    gridRow: `${w.grid.row} / span ${w.grid.h}`,
  };
  return (
    <div className="tile" style={style}>
      {w.title && <div className="tile-title">{w.title}</div>}
      <div className={pad === false ? "tile-body nopad" : "tile-body"} style={pad === false ? { padding: 0 } : undefined}>{children}</div>
    </div>
  );
}

function Metric({ label, value, unit }: { label: string; value: React.ReactNode; unit?: string }) {
  return (
    <div className="text-center">
      <div className="text-3xl font-semibold tabular-nums">{value}{unit ? <span className="text-base opacity-70 ml-1">{unit}</span> : null}</div>
      <div className="text-[10px] uppercase opacity-60 tracking-wide mt-1">{label}</div>
    </div>
  );
}

export function renderWidget(w: WidgetInstance) {
  const Component = components[w.type] ?? Unknown;
  return <Component key={w.id} w={w} />;
}

/* ---------------------------- existing widgets ---------------------------- */

const Starlink = ({ w }: { w: WidgetInstance }) => {
  const d = useBindingData(w.bind);
  const dl = d?.dlMbps;
  const state = d?.state;
  const dead = state === "not_configured";
  return (
    <Tile w={w}>
      <div className="flex items-center justify-between w-full h-full gap-3">
        <div className="flex flex-col">
          <div className="text-[9px] uppercase tracking-[0.2em] opacity-50">Down</div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-semibold tabular-nums" style={{ color: dead ? "rgba(255,255,255,0.4)" : "#e7ecf3" }}>{dl ?? (dead ? "—" : "…")}</span>
            <span className="text-[10px] opacity-55">Mb/s</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 text-[10px] tabular-nums opacity-70">
          <div>{d?.latMs ?? "—"} <span className="opacity-55">ms</span></div>
          <div>{d?.obstructedPct ?? "—"}<span className="opacity-55">% obs</span></div>
          {dead && <div className="text-[9px] uppercase tracking-[0.15em] opacity-45">dish offline</div>}
        </div>
      </div>
    </Tile>
  );
};

const Gps = ({ w }: { w: WidgetInstance }) => {
  const d = useBindingData(w.bind);
  return (
    <Tile w={w}>
      <div className="text-center font-mono text-sm">
        <div>{d?.lat?.toFixed?.(4) ?? "—"}, {d?.lon?.toFixed?.(4) ?? "—"}</div>
        <div className="opacity-70 text-xs mt-1">{d?.speedKph ?? "—"} km/h · {d?.headingDeg ?? "—"}°</div>
      </div>
    </Tile>
  );
};

const Weather = ({ w }: { w: WidgetInstance }) => {
  const d = useBindingData(w.bind);
  // Which cells to show is configurable so the tile can live at 2-cell
  // (header strip) or 6-cell (full outlook) sizes without a separate widget.
  const fields = ((w.props as any)?.fields as string[] | undefined) ?? ["temp", "hum", "wind"];
  const fmt = (v: any) => (v === null || v === undefined ? "—" : v);
  const map: Record<string, { label: string; value: any; unit: string }> = {
    temp:    { label: "TEMP",  value: fmt(d?.tempC),        unit: "°C" },
    hum:     { label: "HUM",   value: fmt(d?.humidityPct),  unit: "%" },
    dew:     { label: "DEW",   value: fmt(d?.dewC),         unit: "°C" },
    wind:    { label: "WIND",  value: fmt(d?.windKph),      unit: "km/h" },
    gust:    { label: "GUST",  value: fmt(d?.windGustKph),  unit: "km/h" },
    baro:    { label: "BARO",  value: fmt(d?.baroHpa),      unit: "hPa" },
    rain:    { label: "RAIN",  value: fmt(d?.rainRateMmHr), unit: "mm/h" },
    rain24h: { label: "24H",   value: fmt(d?.rain24hMm),    unit: "mm" },
    solar:   { label: "SOLAR", value: fmt(d?.solarWm2),     unit: "W/m²" },
    uv:      { label: "UV",    value: fmt(d?.uv),           unit: "" },
  };
  const cells = fields.map((k) => map[k]).filter(Boolean);
  return (
    <Tile w={w}>
      <div className="flex items-stretch justify-between w-full h-full gap-2">
        {cells.map((c, i) => (
          <div key={c.label} className="flex-1 flex flex-col items-center justify-center min-w-0"
               style={i < cells.length - 1 ? { borderRight: "1px solid rgba(255,255,255,0.05)" } : undefined}>
            <div className="text-[9px] uppercase tracking-[0.2em] opacity-50">{c.label}</div>
            <div className="text-xl font-semibold tabular-nums mt-0.5 truncate">
              {c.value}{c.unit && <span className="text-[11px] opacity-60 ml-0.5">{c.unit}</span>}
            </div>
          </div>
        ))}
      </div>
    </Tile>
  );
};

// Cabin/indoor conditions from the WLL indoor transmitter.
const Cabin = ({ w }: { w: WidgetInstance }) => {
  const d = useBindingData(w.bind);
  const cells = [
    { label: "CABIN",   value: d?.cabinTempC ?? "—", unit: "°C" },
    { label: "RH",      value: d?.cabinHumPct ?? "—", unit: "%" },
    { label: "DEW",     value: d?.cabinDewC ?? "—", unit: "°C" },
  ];
  return (
    <Tile w={w}>
      <div className="flex items-stretch justify-between w-full h-full gap-2">
        {cells.map((c, i) => (
          <div key={c.label} className="flex-1 flex flex-col items-center justify-center"
               style={i < cells.length - 1 ? { borderRight: "1px solid rgba(255,255,255,0.05)" } : undefined}>
            <div className="text-[9px] uppercase tracking-[0.2em] opacity-50">{c.label}</div>
            <div className="text-xl font-semibold tabular-nums mt-0.5">
              {c.value}<span className="text-[11px] opacity-60 ml-0.5">{c.unit}</span>
            </div>
          </div>
        ))}
      </div>
    </Tile>
  );
};

// Barometric pressure + trend. Trend is -60..+60 (2-h change, hPa-hundredths
// on Davis firmware) — we colour up/down and show the magnitude when present.
const Baro = ({ w }: { w: WidgetInstance }) => {
  const d = useBindingData(w.bind);
  const hpa = typeof d?.baroHpa === "number" ? d.baroHpa : null;
  const trend = typeof d?.baroTrend === "number" ? d.baroTrend : null;
  const trendLabel = trend === null ? "—" : trend > 0 ? "RISING" : trend < 0 ? "FALLING" : "STEADY";
  const trendColor = trend === null ? "rgba(255,255,255,0.5)" : trend > 0 ? "#2bd46d" : trend < 0 ? "#ff5a3a" : "#7cc3ff";
  return (
    <Tile w={w}>
      <div className="flex flex-col items-center justify-center h-full w-full">
        <div className="text-[9px] uppercase tracking-[0.3em] opacity-45">Barometer</div>
        <div className="text-4xl font-semibold tabular-nums mt-1 leading-none" style={{ color: "#e7ecf3" }}>
          {hpa ?? "—"}<span className="text-sm opacity-55 ml-1">hPa</span>
        </div>
        <div className="hud-chip mt-2" style={{ color: trendColor, borderColor: `${trendColor}40` }}>{trendLabel}</div>
      </div>
    </Tile>
  );
};

// Weather-station link health (rx_state + battery).
const WllLink = ({ w }: { w: WidgetInstance }) => {
  const d = useBindingData(w.bind);
  const rx = d?.rxState as number | null | undefined;
  const batt = d?.batteryOk as boolean | undefined;
  const state = rx === 0 ? "SYNCED" : rx === 1 ? "RESCAN" : rx === 2 ? "LOST" : "—";
  const color = rx === 0 ? "#2bd46d" : rx === 1 ? "#ffae00" : rx === 2 ? "#ff5a3a" : "rgba(255,255,255,.4)";
  return (
    <Tile w={w}>
      <div className="flex items-center justify-between h-full w-full gap-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}AA` }} />
          <div>
            <div className="text-[9px] uppercase tracking-[0.2em] opacity-55 leading-none">ISS Link</div>
            <div className="text-base font-semibold tabular-nums leading-tight mt-0.5" style={{ color }}>{state}</div>
          </div>
        </div>
        <div className="flex flex-col items-end">
          <div className="text-[9px] uppercase tracking-[0.2em] opacity-55">Batt</div>
          <div className="text-[11px] font-semibold" style={{ color: batt === false ? "#ff5a3a" : "#2bd46d" }}>{batt === undefined ? "—" : batt ? "OK" : "LOW"}</div>
        </div>
      </div>
    </Tile>
  );
};

const CameraTile = ({ w }: { w: WidgetInstance }) => {
  const d = useBindingData(w.bind);
  const rotate = (w.props as any)?.rotate as number | undefined;
  const objectFit = ((w.props as any)?.objectFit as "cover" | "contain") ?? "cover";
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [err, setErr] = useState(false);

  // Lazy-load hls.js when the browser can't do native HLS (most desktops).
  // On fatal errors (go2rtc cold-start, network blip, RTSP drop), try hls.js's
  // built-in recovery then tear down and rebuild once before surfacing an error.
  useEffect(() => {
    const v = videoRef.current;
    const url = d?.streamUrl as string | undefined;
    if (!v || !url) return;
    setErr(false);
    let hls: any = null;
    let cancelled = false;
    let rebuildTimer: any = null;
    let rebuildCount = 0;

    const build = async () => {
      if (cancelled) return;
      if (v.canPlayType("application/vnd.apple.mpegurl")) {
        v.src = url;
        return;
      }
      try {
        const mod = await import("hls.js");
        if (cancelled) return;
        const Hls = mod.default;
        if (!Hls.isSupported()) { v.src = url; return; }
        hls = new Hls({ liveDurationInfinity: true, lowLatencyMode: true });
        hls.loadSource(url);
        hls.attachMedia(v);
        hls.on(Hls.Events.ERROR, (_e: any, data: any) => {
          if (!data?.fatal) return;
          if (data.type === "networkError") { try { hls.startLoad(); } catch {} return; }
          if (data.type === "mediaError") { try { hls.recoverMediaError(); } catch {} return; }
          // other fatal — tear down and rebuild after a short delay, capped.
          try { hls.destroy(); } catch {}
          hls = null;
          if (rebuildCount++ < 6) {
            rebuildTimer = setTimeout(() => { if (!cancelled) build(); }, 2000);
          } else {
            setErr(true);
          }
        });
      } catch {
        v.src = url;
      }
    };
    build();

    return () => {
      cancelled = true;
      if (rebuildTimer) clearTimeout(rebuildTimer);
      if (hls) hls.destroy();
    };
  }, [d?.streamUrl]);

  const style: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit,
    transform: rotate ? `rotate(${rotate}deg)` : undefined,
  };

  return (
    <Tile w={w} pad={false}>
      <div className="relative w-full h-full overflow-hidden rounded-md bg-black">
        {d?.streamUrl && !err ? (
          <video
            ref={videoRef}
            poster={d?.posterUrl}
            autoPlay
            muted
            playsInline
            style={style}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[11px] uppercase tracking-[0.2em] opacity-45">
            {err ? "stream error" : "camera pending"}
          </div>
        )}
        {/* subtle live indicator — title is rendered by the tile chrome above */}
        {d?.streamUrl && !err && (
          <div className="absolute top-1.5 right-1.5 flex items-center gap-1.5 hud-chip">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#ff3939", boxShadow: "0 0 6px rgba(255,57,57,.7)" }} />
            <span>LIVE</span>
          </div>
        )}
      </div>
    </Tile>
  );
};

// Dark raster style used by both MapTile + GpsMap3d. Uses CARTO's free
// raster tiles (attribution per OSM + CARTO). They match the dash visually
// far better than vanilla OSM.
function darkRasterStyle(): any {
  return {
    version: 8,
    sources: {
      base: {
        type: "raster",
        tiles: [
          "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
          "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
          "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
          "https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
        ],
        tileSize: 256,
        attribution: "© OpenStreetMap © CARTO",
      },
    },
    layers: [{ id: "base", type: "raster", source: "base" }],
  };
}

const MapTile = ({ w }: { w: WidgetInstance }) => {
  const d = useBindingData(w.bind);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const maplibreRef = useRef<any>(null);
  const [debug, setDebug] = useState<string>("init");

  useEffect(() => {
    let cancelled = false;
    let ro: ResizeObserver | null = null;
    let tilesFetched = 0;
    let tilesOk = 0;
    let tilesErr = 0;
    (async () => {
      if (!containerRef.current) return;
      // Probe WebGL before importing maplibre. Some firefox kiosk profiles
      // disable WebGL — maplibre silently initialises as a black canvas.
      try {
        const probe = document.createElement("canvas");
        const gl = (probe.getContext("webgl2") || probe.getContext("webgl")) as any;
        if (!gl) { setDebug("no webgl"); return; }
      } catch { setDebug("webgl blocked"); return; }

      try {
        setDebug("importing");
        const maplibre = await import("maplibre-gl");
        if (cancelled || mapRef.current) return;
        maplibreRef.current = maplibre;
        const el = containerRef.current!;
        const map = new maplibre.Map({
          container: el,
          style: darkRasterStyle(),
          center: [-4.629, 55.458],
          zoom: 7,
          attributionControl: false,
        });
        mapRef.current = map;
        map.on("error", (e: any) => {
          const msg = e?.error?.message ?? e?.message ?? "unknown";
          setDebug("err: " + String(msg).slice(0, 80));
        });
        map.on("load", () => setDebug(`loaded ${el.clientWidth}x${el.clientHeight}`));
        map.on("dataloading", (e: any) => {
          if (e.dataType === "source" && e.tile) {
            tilesFetched++;
            setDebug(`req ${tilesFetched} ok ${tilesOk} err ${tilesErr}`);
          }
        });
        map.on("data", (e: any) => {
          if (e.dataType === "source" && e.tile) {
            tilesOk++;
            setDebug(`req ${tilesFetched} ok ${tilesOk} err ${tilesErr}`);
          }
        });
        // Count tile request failures separately so silence vs. network-fail
        // vs. WebGL-fail are distinguishable.
        const origErr = map.on.bind(map);
        origErr("error", (e: any) => {
          if (e?.tile) tilesErr++;
        });
        ro = new ResizeObserver(() => { try { map.resize(); } catch {} });
        ro.observe(el);
        setTimeout(() => { try { map.resize(); } catch {} }, 120);
      } catch (e: any) {
        setDebug("ex: " + (e?.message ?? "unknown").slice(0, 80));
      }
    })();
    return () => {
      cancelled = true;
      if (ro) ro.disconnect();
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !d) return;
    const applyGeo = (fc: any) => {
      if (!fc || !fc.type) return;
      const srcId = "overlay-src";
      const existing = map.getSource(srcId);
      if (existing) { existing.setData(fc); return; }
      const onReady = () => {
        if (!map.getSource(srcId)) map.addSource(srcId, { type: "geojson", data: fc });
        if (!map.getLayer("overlay-fill")) map.addLayer({ id: "overlay-fill", type: "fill", source: srcId, filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": ["coalesce", ["get", "color"], "#ffae00"], "fill-opacity": 0.25 } });
        if (!map.getLayer("overlay-line")) map.addLayer({ id: "overlay-line", type: "line", source: srcId, paint: { "line-color": ["coalesce", ["get", "color"], "#ffae00"], "line-width": 2 } });
        if (!map.getLayer("overlay-point")) map.addLayer({ id: "overlay-point", type: "circle", source: srcId, filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 5, "circle-color": ["coalesce", ["get", "color"], "#ffae00"], "circle-stroke-width": 1, "circle-stroke-color": "#111" } });
      };
      if (map.isStyleLoaded()) onReady(); else map.once("load", onReady);
    };
    const fc = d.features ? { type: "FeatureCollection", features: d.features } : (d.geojson ?? d);
    applyGeo(fc);
  }, [d]);

  return (
    <Tile w={w} pad={false}>
      <div className="relative w-full h-full">
        <div ref={containerRef} className="absolute inset-0 rounded-md overflow-hidden" />
        <div className="absolute bottom-1 left-1 hud-chip pointer-events-none" style={{ color: debug.startsWith("err") || debug.startsWith("ex") ? "#ff5a3a" : "#7cc3ff" }}>
          {debug}
        </div>
      </div>
    </Tile>
  );
};

const GpsMap3d = ({ w }: { w: WidgetInstance }) => {
  const d = useBindingData(w.bind);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const trailRef = useRef<[number, number][]>([]);

  useEffect(() => {
    let cancelled = false;
    let ro: ResizeObserver | null = null;
    (async () => {
      if (!containerRef.current) return;
      const maplibre = await import("maplibre-gl");
      if (cancelled || mapRef.current) return;
      const map = new maplibre.Map({
        container: containerRef.current,
        style: darkRasterStyle(),
        center: [-4.629, 55.458],
        zoom: 13,
        pitch: 45,
        bearing: 0,
        attributionControl: false,
      });
      mapRef.current = map;
      // Arrow-shaped marker (rotates with heading)
      const el = document.createElement("div");
      el.style.cssText = "width:0;height:0;border-left:10px solid transparent;border-right:10px solid transparent;border-bottom:22px solid #ffae00;filter:drop-shadow(0 0 4px rgba(255,174,0,.8));transform-origin:50% 66%;";
      markerRef.current = new maplibre.Marker({ element: el, rotationAlignment: "map" }).setLngLat([-4.629, 55.458]).addTo(map);
      map.on("load", () => {
        if (!map.getSource("trail")) map.addSource("trail", { type: "geojson", data: { type: "Feature", geometry: { type: "LineString", coordinates: [] }, properties: {} } });
        if (!map.getLayer("trail-line")) map.addLayer({ id: "trail-line", type: "line", source: "trail", paint: { "line-color": "#ffae00", "line-width": 3, "line-opacity": 0.75 } });
      });
      ro = new ResizeObserver(() => { try { map.resize(); } catch {} });
      if (containerRef.current) ro.observe(containerRef.current);
      setTimeout(() => { try { map.resize(); } catch {} }, 120);
    })();
    return () => {
      cancelled = true;
      if (ro) ro.disconnect();
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !d || typeof d.lat !== "number" || typeof d.lon !== "number") return;
    const lngLat: [number, number] = [d.lon, d.lat];
    if (markerRef.current) {
      markerRef.current.setLngLat(lngLat);
      const heading = typeof d.headingDeg === "number" ? d.headingDeg : 0;
      markerRef.current.setRotation(heading);
    }
    const heading = typeof d.headingDeg === "number" ? d.headingDeg : 0;
    map.easeTo({ center: lngLat, bearing: heading, duration: 800 });
    // Append to trail if we actually moved (avoid repeated same-point churn)
    const prev = trailRef.current[trailRef.current.length - 1];
    if (!prev || prev[0] !== lngLat[0] || prev[1] !== lngLat[1]) {
      trailRef.current = [...trailRef.current.slice(-500), lngLat];
      const src = map.getSource("trail");
      if (src) src.setData({ type: "Feature", geometry: { type: "LineString", coordinates: trailRef.current }, properties: {} });
    }
  }, [d?.lat, d?.lon, d?.headingDeg]);

  const fixBadge = (() => {
    const m = d?.fixMode;
    if (m === 3) return { text: "3D FIX", color: "#2bd46d" };
    if (m === 2) return { text: "2D FIX", color: "#ffae00" };
    return { text: "NO FIX", color: "#ff3939" };
  })();

  return (
    <Tile w={w} pad={false}>
      <div className="relative w-full h-full">
        <div ref={containerRef} className="absolute inset-0 rounded-md overflow-hidden" />
        <div className="absolute top-1.5 left-1.5 hud-chip flex items-center gap-1.5" style={{ color: fixBadge.color, borderColor: `${fixBadge.color}40` }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: fixBadge.color, boxShadow: `0 0 6px ${fixBadge.color}AA` }} />
          {fixBadge.text} · {d?.satellites ?? "—"} SATS
        </div>
        <div className="absolute bottom-1.5 right-1.5 hud-chip pointer-events-none">
          {d?.lat?.toFixed?.(4) ?? "—"}, {d?.lon?.toFixed?.(4) ?? "—"} · {d?.speedKph ?? "—"} KM/H · {d?.headingDeg ?? "—"}°
        </div>
      </div>
    </Tile>
  );
};

const Stormfront = ({ w }: { w: WidgetInstance }) => {
  const d = useBindingData(w.bind);
  const stale = d?.__stale;
  const risk = (d?.riskLabel as string | undefined)?.toUpperCase() ?? "—";
  const riskColor = (() => {
    const r = risk.toLowerCase();
    if (r.includes("high") || r.includes("severe") || r.includes("extreme")) return "#ff5a3a";
    if (r.includes("elevated") || r.includes("slight") || r.includes("moderate")) return "#ffae00";
    if (r.includes("low") || r.includes("marginal")) return "#7cc3ff";
    return "rgba(255,255,255,0.6)";
  })();
  return (
    <Tile w={w}>
      <div className="flex flex-col items-center justify-center h-full w-full text-center gap-1.5 px-2">
        <div className="text-[9px] uppercase tracking-[0.3em] opacity-45">Convective outlook</div>
        <div className="text-3xl font-semibold tracking-tight" style={{ color: riskColor, textShadow: `0 0 12px ${riskColor}30` }}>{risk}</div>
        {d?.summary && <div className="text-[11px] opacity-65 leading-snug line-clamp-2">{d.summary}</div>}
        {typeof stale === "number" && stale > 60 && (
          <div className="hud-chip mt-0.5" style={{ color: "#ffae00", borderColor: "rgba(255,174,0,0.3)" }}>STALE · {Math.round(stale / 60)}m</div>
        )}
      </div>
    </Tile>
  );
};

const Dispatch = ({ w }: { w: WidgetInstance }) => {
  const d = useBindingData(w.bind);
  const items: any[] = Array.isArray(d?.events) ? d.events : [];
  return (
    <Tile w={w}>
      <div className="w-full h-full text-xs overflow-hidden fade-bottom">
        {items.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[11px] opacity-45 uppercase tracking-[0.15em]">Standby</div>
        ) : (
          <div className="flex flex-col gap-1">
            {items.slice(0, 6).map((e, i) => (
              <div key={i} className="flex items-start gap-2 truncate">
                <span className="mt-[6px] w-1 h-1 rounded-full flex-shrink-0" style={{ background: "#ffae00", boxShadow: "0 0 4px rgba(255,174,0,0.7)" }} />
                <span className="truncate">{e.title ?? e.message ?? "event"}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Tile>
  );
};

const Livestream = ({ w }: { w: WidgetInstance }) => (
  <Tile w={w}><div className="opacity-80 text-sm">⏺ On-air control</div></Tile>
);

const SarStatus = ({ w }: { w: WidgetInstance }) => {
  const d = useBindingData(w.bind);
  return (
    <Tile w={w}>
      <div className="w-full text-center">
        <div className="text-xs opacity-70 uppercase">{d?.incidentRef ?? "standby"}</div>
        <div className="text-xl font-semibold mt-1">{d?.state ?? "No active callout"}</div>
      </div>
    </Tile>
  );
};

const Clock = ({ w }: { w: WidgetInstance }) => {
  const [t, setT] = useState<Date | null>(null);
  useEffect(() => {
    setT(new Date());
    const id = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const tz = (w.props as any)?.tz as string | undefined;
  const showDate = (w.props as any)?.showDate !== false;
  const tOpts: Intl.DateTimeFormatOptions = { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit", ...(tz ? { timeZone: tz } : {}) };
  const dOpts: Intl.DateTimeFormatOptions = { weekday: "short", day: "2-digit", month: "short", ...(tz ? { timeZone: tz } : {}) };
  const time = t ? t.toLocaleTimeString("en-GB", tOpts) : "—";
  const date = t ? t.toLocaleDateString("en-GB", dOpts) : "";
  const label = tz ? tz.split("/").pop()?.replace(/_/g, " ") : null;
  return (
    <Tile w={w}>
      <div className="flex flex-col items-center justify-center h-full w-full">
        <div className="text-[36px] leading-none font-light tabular-nums tracking-tight" style={{ fontFeatureSettings: '"tnum", "ss01"' }} suppressHydrationWarning>{time}</div>
        {showDate && <div className="text-[11px] opacity-65 mt-2 tabular-nums" suppressHydrationWarning>{date}</div>}
        {label && <div className="text-[9px] uppercase tracking-[0.25em] opacity-40 mt-1">{label}</div>}
      </div>
    </Tile>
  );
};

const Roof = ({ w }: { w: WidgetInstance }) => {
  const d = useBindingData(w.bind);
  return <Tile w={w}><Metric label="Roof" value={d?.tempC ?? "—"} unit="°C" /></Tile>;
};

const AdsbStrip = ({ w }: { w: WidgetInstance }) => {
  const d = useBindingData(w.bind);
  return <Tile w={w}><div className="text-sm opacity-80">{d?.items?.length ?? 0} items · last {d?.lastTs ?? "—"}</div></Tile>;
};

const VanSpectrum = ({ w }: { w: WidgetInstance }) => (
  <Tile w={w}><div className="opacity-60 text-sm">Van-spectrum slot</div></Tile>
);

const TextBlock = ({ w }: { w: WidgetInstance }) => (
  <Tile w={w}><div className="text-sm opacity-90">{(w.props as any)?.text ?? ""}</div></Tile>
);

/* ----------------------------- new widgets ----------------------------- */

// Multi-camera strip — sources[] of {slug, label, rotate?}
const CameraStrip = ({ w }: { w: WidgetInstance }) => {
  const sources = ((w.props as any)?.sources ?? []) as Array<{ slug: string; label?: string; rotate?: number }>;
  return (
    <Tile w={w} pad={false}>
      <div className="grid gap-1 w-full h-full" style={{ gridTemplateColumns: `repeat(${sources.length || 1}, 1fr)` }}>
        {sources.map((s, i) => (
          <StripCell key={s.slug + i} slug={s.slug} label={s.label ?? s.slug} rotate={s.rotate} />
        ))}
      </div>
    </Tile>
  );
};

function StripCell({ slug, label, rotate }: { slug: string; label: string; rotate?: number }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const url = `/stream/${slug}.m3u8`;
    let hls: any = null;
    let cancelled = false;
    let rebuildTimer: any = null;
    let rebuildCount = 0;
    const build = async () => {
      if (cancelled) return;
      if (v.canPlayType("application/vnd.apple.mpegurl")) { v.src = url; return; }
      try {
        const mod = await import("hls.js");
        if (cancelled) return;
        const Hls = mod.default;
        if (!Hls.isSupported()) { v.src = url; return; }
        hls = new Hls({ liveDurationInfinity: true, lowLatencyMode: true });
        hls.loadSource(url);
        hls.attachMedia(v);
        hls.on(Hls.Events.ERROR, (_e: any, data: any) => {
          if (!data?.fatal) return;
          if (data.type === "networkError") { try { hls.startLoad(); } catch {} return; }
          if (data.type === "mediaError") { try { hls.recoverMediaError(); } catch {} return; }
          try { hls.destroy(); } catch {}
          hls = null;
          if (rebuildCount++ < 6) {
            rebuildTimer = setTimeout(() => { if (!cancelled) build(); }, 2000);
          } else {
            setErr(true);
          }
        });
      } catch { v.src = url; }
    };
    build();
    return () => { cancelled = true; if (rebuildTimer) clearTimeout(rebuildTimer); if (hls) hls.destroy(); };
  }, [slug]);
  return (
    <div className="relative w-full h-full overflow-hidden rounded bg-black">
      {err ? (
        <div className="absolute inset-0 flex items-center justify-center text-[10px] opacity-60">stream error</div>
      ) : (
        <video ref={videoRef} poster={`/stream/${slug}/frame.jpg`} autoPlay muted playsInline
               style={{ width: "100%", height: "100%", objectFit: "cover", transform: rotate ? `rotate(${rotate}deg)` : undefined }} />
      )}
      <div className="absolute bottom-1 left-1 text-[10px] uppercase tracking-wider bg-black/55 px-1 rounded">{label}</div>
    </div>
  );
}

// Compass rose — vehicle heading. Matches WindVector visual language.
const CompassRose = ({ w }: { w: WidgetInstance }) => {
  const d = useBindingData(w.bind);
  const heading = typeof d?.headingDeg === "number" ? d.headingDeg : null;
  const h = heading ?? 0;
  const cardinal = (hh: number | null) => {
    if (hh === null) return "—";
    const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    return dirs[Math.round(((hh % 360) / 45)) % 8];
  };
  return (
    <Tile w={w} pad={false}>
      <div className="relative w-full h-full flex items-center justify-center p-2">
        <svg viewBox="-50 -50 100 100" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
          <circle cx="0" cy="0" r="44" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
          <circle cx="0" cy="0" r="38" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
          {Array.from({ length: 12 }).map((_, i) => {
            const a = (i * 30 * Math.PI) / 180;
            const major = i % 3 === 0;
            const r1 = major ? 40 : 42;
            return (
              <line key={i}
                x1={Math.sin(a) * r1} y1={-Math.cos(a) * r1}
                x2={Math.sin(a) * 44} y2={-Math.cos(a) * 44}
                stroke="rgba(255,255,255,0.35)" strokeWidth={major ? 1.2 : 0.6} />
            );
          })}
          <text x="0" y="-29" textAnchor="middle" fontSize="7" fill="rgba(255,255,255,0.55)" fontWeight="600">N</text>
          <text x="29" y="2.5" textAnchor="middle" fontSize="6" fill="rgba(255,255,255,0.35)">E</text>
          <text x="0" y="33" textAnchor="middle" fontSize="6" fill="rgba(255,255,255,0.35)">S</text>
          <text x="-29" y="2.5" textAnchor="middle" fontSize="6" fill="rgba(255,255,255,0.35)">W</text>
          {heading !== null && (
            <g transform={`rotate(${h})`}>
              <polygon points="0,-26 4,4 0,1 -4,4" fill="#ffae00" filter="drop-shadow(0 0 3px rgba(255,174,0,0.6))" />
            </g>
          )}
          <text x="0" y="-1" textAnchor="middle" fontSize="13" fill="#e7ecf3" fontWeight="600" style={{ fontVariantNumeric: "tabular-nums" }}>{heading === null ? "—" : Math.round(h)}</text>
          <text x="0" y="7.5" textAnchor="middle" fontSize="4" fill="rgba(255,255,255,0.5)" letterSpacing="0.8">DEG</text>
        </svg>
        <div className="absolute bottom-1.5 left-0 right-0 flex justify-center">
          <div className="hud-chip">{cardinal(heading)}</div>
        </div>
      </div>
    </Tile>
  );
};

// Big speed readout for driver screen — ghost "88" behind live digits
const SpeedHud = ({ w }: { w: WidgetInstance }) => {
  const d = useBindingData(w.bind);
  const kph = typeof d?.speedKph === "number" ? d.speedKph : null;
  const unit = ((w.props as any)?.unit as "kph" | "mph") ?? "kph";
  const val = kph === null ? null : unit === "mph" ? Math.round(kph * 0.621371) : Math.round(kph);
  const display = val === null ? "—" : String(val).padStart(val > 99 ? 3 : 2, "0");
  const ghost = val === null ? "888" : "8".repeat(display.length);
  return (
    <Tile w={w}>
      <div className="flex flex-col items-center justify-center h-full w-full">
        <div className="relative leading-none" style={{ fontFamily: 'ui-monospace, "JetBrains Mono", monospace', fontWeight: 600 }}>
          <span className="tabular-nums text-[68px]" style={{ color: "rgba(255,255,255,0.04)", letterSpacing: ".02em" }}>{ghost}</span>
          <span className="tabular-nums text-[68px] absolute inset-0 flex items-center justify-center" style={{ color: "#ffae00", textShadow: "0 0 12px rgba(255,174,0,0.35)", letterSpacing: ".02em" }}>{display}</span>
        </div>
        <div className="text-[10px] uppercase tracking-[0.3em] opacity-50 mt-2">{unit === "mph" ? "miles · hour" : "kilometres · hour"}</div>
      </div>
    </Tile>
  );
};

// Uplink / wg / cellular signal chiclets
const SignalBar = ({ w }: { w: WidgetInstance }) => {
  const sl = useBindingData({ source: "local", sensor: "starlink", refreshMs: 3000 } as any);
  const dots = [
    { label: "WG", ok: true, value: "up" },
    { label: "SL", ok: sl?.state !== "not_configured" && sl?.dlMbps != null, value: sl?.dlMbps != null ? `${sl.dlMbps} Mb` : (sl?.state === "not_configured" ? "off" : "…") },
    { label: "LTE", ok: false, value: "—" },
  ];
  return (
    <Tile w={w}>
      <div className="flex items-center justify-between h-full w-full gap-2">
        {dots.map((d) => (
          <div key={d.label} className="flex-1 flex items-center gap-2 rounded-md px-2 py-1.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{
              background: d.ok ? "#2bd46d" : "rgba(255,255,255,0.18)",
              boxShadow: d.ok ? "0 0 8px rgba(43,212,109,.7)" : "none"
            }} />
            <div className="min-w-0">
              <div className="text-[9px] uppercase tracking-[0.15em] opacity-55 leading-none">{d.label}</div>
              <div className="text-[11px] opacity-90 tabular-nums leading-tight mt-0.5 truncate">{d.value}</div>
            </div>
          </div>
        ))}
      </div>
    </Tile>
  );
};

// Host compute stats (load / mem / uptime)
const SystemStats = ({ w }: { w: WidgetInstance }) => {
  const d = useBindingData({ source: "local", sensor: "compute", refreshMs: 5000 } as any);
  const up = (d?.uptimeSec as number | undefined) ?? 0;
  const upStr = up < 60 ? `${up}s` : up < 3600 ? `${Math.round(up / 60)}m` : up < 86400 ? `${Math.round(up / 3600)}h` : `${Math.round(up / 86400)}d`;
  const memPct = typeof d?.memUsedPct === "number" ? d.memUsedPct : null;
  const loadAvg = typeof d?.loadAvg1 === "number" ? d.loadAvg1 : null;
  const cells = [
    { label: "LOAD", value: loadAvg === null ? "—" : loadAvg.toFixed(2), unit: "" },
    { label: "MEM", value: memPct === null ? "—" : memPct, unit: "%" },
    { label: "UP", value: upStr, unit: "" },
  ];
  return (
    <Tile w={w}>
      <div className="flex items-stretch justify-between w-full h-full gap-2">
        {cells.map((c, i) => (
          <div key={c.label} className="flex-1 flex flex-col items-center justify-center" style={i < cells.length - 1 ? { borderRight: "1px solid rgba(255,255,255,0.05)" } : undefined}>
            <div className="text-[9px] uppercase tracking-[0.2em] opacity-50">{c.label}</div>
            <div className="text-xl font-semibold tabular-nums mt-0.5">
              {c.value}{c.unit && <span className="text-xs opacity-60 ml-0.5">{c.unit}</span>}
            </div>
          </div>
        ))}
      </div>
    </Tile>
  );
};

// Wind vector — meteorological convention: arrow points in the direction the
// wind is GOING (downwind). Dial shows cardinal marks, centre shows speed.
const WindVector = ({ w }: { w: WidgetInstance }) => {
  const d = useBindingData(w.bind);
  const dir = typeof d?.windDirDeg === "number" ? d.windDirDeg : null;
  const kph = typeof d?.windKph === "number" ? d.windKph : null;
  const cardinal = (h: number | null) => {
    if (h === null) return "—";
    const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    return dirs[Math.round(((h % 360) / 45)) % 8];
  };
  const rot = dir ?? 0;
  return (
    <Tile w={w} pad={false}>
      <div className="relative w-full h-full flex items-center justify-center p-2">
        <svg viewBox="-50 -50 100 100" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
          {/* Outer ring */}
          <circle cx="0" cy="0" r="44" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
          <circle cx="0" cy="0" r="38" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
          {/* Tick marks every 30° */}
          {Array.from({ length: 12 }).map((_, i) => {
            const a = (i * 30 * Math.PI) / 180;
            const major = i % 3 === 0;
            const r1 = major ? 40 : 42;
            const r2 = 44;
            return (
              <line key={i}
                x1={Math.sin(a) * r1} y1={-Math.cos(a) * r1}
                x2={Math.sin(a) * r2} y2={-Math.cos(a) * r2}
                stroke="rgba(255,255,255,0.35)"
                strokeWidth={major ? 1.2 : 0.6} />
            );
          })}
          {/* Cardinal letters */}
          <text x="0" y="-29" textAnchor="middle" fontSize="7" fill="rgba(255,255,255,0.55)" fontWeight="600">N</text>
          <text x="29" y="2.5" textAnchor="middle" fontSize="6" fill="rgba(255,255,255,0.35)">E</text>
          <text x="0" y="33" textAnchor="middle" fontSize="6" fill="rgba(255,255,255,0.35)">S</text>
          <text x="-29" y="2.5" textAnchor="middle" fontSize="6" fill="rgba(255,255,255,0.35)">W</text>
          {/* Wind arrow — slim shaft + head, rotates with direction */}
          {dir !== null && (
            <g transform={`rotate(${rot})`}>
              <line x1="0" y1="-18" x2="0" y2="20" stroke="#7cc3ff" strokeWidth="1.6" strokeLinecap="round" />
              <polygon points="0,-24 4,-16 -4,-16" fill="#7cc3ff" />
              <circle cx="0" cy="0" r="2" fill="#7cc3ff" />
            </g>
          )}
          {/* Centre speed readout */}
          <text x="0" y="-1" textAnchor="middle" fontSize="13" fill="#e7ecf3" fontWeight="600" style={{ fontVariantNumeric: "tabular-nums" }}>{kph ?? "—"}</text>
          <text x="0" y="7.5" textAnchor="middle" fontSize="4" fill="rgba(255,255,255,0.5)" letterSpacing="0.8">KM/H</text>
        </svg>
        <div className="absolute bottom-1.5 left-0 right-0 flex justify-center">
          <div className="hud-chip">{cardinal(dir)} · {dir === null ? "—" : Math.round(dir) + "°"}</div>
        </div>
      </div>
    </Tile>
  );
};

const Unknown = ({ w }: { w: WidgetInstance }) => (
  <Tile w={w}><div className="text-xs opacity-60">unknown type: {w.type}</div></Tile>
);

const components: Record<string, React.FC<{ w: WidgetInstance }>> = {
  starlink_status: Starlink,
  gps_position: Gps,
  gps_map3d: GpsMap3d,
  weather_tile: Weather,
  camera_tile: CameraTile,
  camera_strip: CameraStrip,
  map_tile: MapTile,
  stormfront_outlook: Stormfront,
  dispatch_feed: Dispatch,
  livestream_control: Livestream,
  sar_status: SarStatus,
  clock: Clock,
  roof_environment: Roof,
  adsb_strip: AdsbStrip,
  van_spectrum_slot: VanSpectrum,
  text_block: TextBlock,
  compass_rose: CompassRose,
  speed_hud: SpeedHud,
  signal_bar: SignalBar,
  system_stats: SystemStats,
  wind_vector: WindVector,
  cabin_status: Cabin,
  baro_tile: Baro,
  wll_link: WllLink,
};
