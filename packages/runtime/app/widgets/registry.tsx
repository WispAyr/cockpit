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
      <div className="tile-body" style={pad === false ? { padding: 0 } : undefined}>{children}</div>
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
  return (
    <Tile w={w}>
      <div className="flex flex-col items-center">
        <div className="text-3xl font-semibold tabular-nums">{dl ?? (state === "not_configured" ? "—" : "…")}<span className="text-base opacity-70 ml-1">Mbps</span></div>
        <div className="text-[10px] uppercase opacity-60 tracking-wide mt-1">
          {state === "not_configured" ? "dishy api off" : `${d?.latMs ?? "—"} ms · ${d?.obstructedPct ?? "—"}% obs`}
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
  return (
    <Tile w={w}>
      <div className="flex gap-6 items-center justify-center">
        <Metric label="Temp" value={d?.tempC ?? "—"} unit="°C" />
        <Metric label="Humidity" value={d?.humidityPct ?? "—"} unit="%" />
        <Metric label="Wind" value={d?.windKph ?? "—"} unit="km/h" />
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
          <div className="absolute inset-0 flex items-center justify-center text-xs opacity-50">
            {err ? "stream error" : "camera pending"}
          </div>
        )}
        {w.title ? (
          <div className="absolute top-1 left-2 text-[10px] uppercase tracking-wider opacity-80 bg-black/40 px-1 rounded">
            {w.title}
          </div>
        ) : null}
      </div>
    </Tile>
  );
};

const MapTile = ({ w }: { w: WidgetInstance }) => {
  const d = useBindingData(w.bind);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const maplibreRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!containerRef.current) return;
      const maplibre = await import("maplibre-gl");
      await import("maplibre-gl/dist/maplibre-gl.css" as any).catch(() => {});
      if (cancelled || mapRef.current) return;
      maplibreRef.current = maplibre;
      const map = new maplibre.Map({
        container: containerRef.current,
        style: {
          version: 8,
          sources: {
            osm: { type: "raster", tiles: ["https://a.tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap" },
          },
          layers: [{ id: "osm", type: "raster", source: "osm" }],
        },
        center: [-4.629, 55.458],
        zoom: 7,
        attributionControl: false,
      });
      mapRef.current = map;
    })();
    return () => { cancelled = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
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
    (async () => {
      if (!containerRef.current) return;
      const maplibre = await import("maplibre-gl");
      await import("maplibre-gl/dist/maplibre-gl.css" as any).catch(() => {});
      if (cancelled || mapRef.current) return;
      const map = new maplibre.Map({
        container: containerRef.current,
        style: {
          version: 8,
          sources: {
            osm: { type: "raster", tiles: ["https://a.tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap" },
          },
          layers: [{ id: "osm", type: "raster", source: "osm" }],
        },
        center: [-4.629, 55.458],
        zoom: 13,
        pitch: 60,
        bearing: 0,
        attributionControl: false,
      });
      mapRef.current = map;
      // Arrow-shaped marker (rotates with heading)
      const el = document.createElement("div");
      el.style.cssText = "width:0;height:0;border-left:10px solid transparent;border-right:10px solid transparent;border-bottom:22px solid #ffae00;filter:drop-shadow(0 0 4px rgba(255,174,0,.8));transform-origin:50% 66%;";
      markerRef.current = new maplibre.Marker({ element: el, rotationAlignment: "map" }).setLngLat([-4.629, 55.458]).addTo(map);
      // Trail line source + layer
      map.on("load", () => {
        if (!map.getSource("trail")) map.addSource("trail", { type: "geojson", data: { type: "Feature", geometry: { type: "LineString", coordinates: [] }, properties: {} } });
        if (!map.getLayer("trail-line")) map.addLayer({ id: "trail-line", type: "line", source: "trail", paint: { "line-color": "#ffae00", "line-width": 3, "line-opacity": 0.75 } });
      });
    })();
    return () => { cancelled = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
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
        <div className="absolute top-1 left-2 text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "rgba(0,0,0,.55)", color: fixBadge.color }}>
          {fixBadge.text} · {d?.satellites ?? "—"} sats
        </div>
        <div className="absolute bottom-1 right-2 text-[10px] font-mono opacity-90 pointer-events-none px-1.5 py-0.5 rounded" style={{ background: "rgba(0,0,0,.55)" }}>
          {d?.lat?.toFixed?.(4) ?? "—"}, {d?.lon?.toFixed?.(4) ?? "—"} · {d?.speedKph ?? "—"} km/h · {d?.headingDeg ?? "—"}°
        </div>
      </div>
    </Tile>
  );
};

const Stormfront = ({ w }: { w: WidgetInstance }) => {
  const d = useBindingData(w.bind);
  const stale = d?.__stale;
  return (
    <Tile w={w}>
      <div className="text-center">
        <div className="text-4xl font-semibold">{d?.riskLabel ?? "—"}</div>
        <div className="text-xs opacity-70 mt-1">{d?.summary ?? ""}</div>
        {typeof stale === "number" && stale > 60 && (
          <div className="text-[10px] mt-1" style={{ color: "#ffae00" }}>STALE · {Math.round(stale / 60)}m old</div>
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
      <div className="w-full text-xs space-y-1 overflow-hidden">
        {items.slice(0, 4).map((e, i) => (
          <div key={i} className="truncate">· {e.title ?? e.message ?? "event"}</div>
        ))}
        {items.length === 0 && <div className="opacity-60">No dispatch events</div>}
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
      <div className="flex flex-col items-center justify-center h-full">
        <div className="text-4xl tabular-nums" suppressHydrationWarning>{time}</div>
        {showDate && <div className="text-[11px] opacity-70 mt-1" suppressHydrationWarning>{date}</div>}
        {label && <div className="text-[10px] uppercase tracking-wide opacity-50 mt-0.5">{label}</div>}
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

// Compass rose — bearing from GPS heading
const CompassRose = ({ w }: { w: WidgetInstance }) => {
  const d = useBindingData(w.bind);
  const heading = typeof d?.headingDeg === "number" ? d.headingDeg : 0;
  const cardinal = (h: number) => {
    const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    return dirs[Math.round(((h % 360) / 45)) % 8];
  };
  return (
    <Tile w={w} pad={false}>
      <div className="relative w-full h-full flex items-center justify-center">
        <svg viewBox="-50 -50 100 100" className="w-full h-full" style={{ maxHeight: "90%" }}>
          <circle cx="0" cy="0" r="44" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
            const rad = (a * Math.PI) / 180;
            const x1 = Math.sin(rad) * 40;
            const y1 = -Math.cos(rad) * 40;
            const x2 = Math.sin(rad) * 44;
            const y2 = -Math.cos(rad) * 44;
            return <line key={a} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeOpacity="0.4" strokeWidth="1" />;
          })}
          <text x="0" y="-32" textAnchor="middle" fontSize="10" fill="currentColor" opacity="0.7">N</text>
          <text x="34" y="4" textAnchor="middle" fontSize="8" fill="currentColor" opacity="0.5">E</text>
          <text x="0" y="38" textAnchor="middle" fontSize="8" fill="currentColor" opacity="0.5">S</text>
          <text x="-34" y="4" textAnchor="middle" fontSize="8" fill="currentColor" opacity="0.5">W</text>
          <g transform={`rotate(${heading})`}>
            <polygon points="0,-30 6,6 0,2 -6,6" fill="#ffae00" />
          </g>
        </svg>
        <div className="absolute bottom-1 text-[11px] font-mono tabular-nums">
          {cardinal(heading)} · {Math.round(heading)}°
        </div>
      </div>
    </Tile>
  );
};

// Big speed readout for driver screen
const SpeedHud = ({ w }: { w: WidgetInstance }) => {
  const d = useBindingData(w.bind);
  const kph = typeof d?.speedKph === "number" ? d.speedKph : null;
  const unit = ((w.props as any)?.unit as "kph" | "mph") ?? "kph";
  const val = kph === null ? null : unit === "mph" ? Math.round(kph * 0.621371) : Math.round(kph);
  return (
    <Tile w={w}>
      <div className="flex flex-col items-center justify-center h-full">
        <div className="text-[64px] leading-none font-semibold tabular-nums">{val ?? "—"}</div>
        <div className="text-[10px] uppercase tracking-widest opacity-60 mt-1">{unit === "mph" ? "mph" : "km/h"}</div>
      </div>
    </Tile>
  );
};

// Uplink / wg / cellular signal chiclets
const SignalBar = ({ w }: { w: WidgetInstance }) => {
  const sl = useBindingData({ source: "local", sensor: "starlink", refreshMs: 3000 } as any);
  const dots = [
    { label: "WG", ok: true, value: "up" },
    { label: "SL", ok: sl?.state !== "not_configured" && sl?.dlMbps != null, value: sl?.dlMbps != null ? `${sl.dlMbps}` : (sl?.state === "not_configured" ? "off" : "…") },
    { label: "LTE", ok: false, value: "—" },
  ];
  return (
    <Tile w={w}>
      <div className="flex items-center justify-around h-full w-full">
        {dots.map((d) => (
          <div key={d.label} className="flex flex-col items-center">
            <div className="w-2.5 h-2.5 rounded-full mb-1" style={{ background: d.ok ? "#2bd46d" : "#ff3939", boxShadow: d.ok ? "0 0 6px rgba(43,212,109,.6)" : "0 0 6px rgba(255,57,57,.6)" }} />
            <div className="text-[10px] uppercase tracking-wider opacity-80">{d.label}</div>
            <div className="text-[10px] opacity-60 tabular-nums">{d.value}</div>
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
  return (
    <Tile w={w}>
      <div className="flex gap-4 items-center justify-center w-full">
        <Metric label="Load" value={d?.loadAvg1 ?? "—"} />
        <Metric label="Mem" value={d?.memUsedPct ?? "—"} unit="%" />
        <Metric label="Up" value={upStr} />
      </div>
    </Tile>
  );
};

// Wind vector — dial + gust readout, binds to local.weather
const WindVector = ({ w }: { w: WidgetInstance }) => {
  const d = useBindingData(w.bind);
  const dir = typeof d?.windDirDeg === "number" ? d.windDirDeg : 0;
  const kph = typeof d?.windKph === "number" ? d.windKph : null;
  return (
    <Tile w={w} pad={false}>
      <div className="relative w-full h-full flex items-center justify-center">
        <svg viewBox="-50 -50 100 100" className="w-full h-full" style={{ maxHeight: "80%" }}>
          <circle cx="0" cy="0" r="42" fill="none" stroke="currentColor" strokeOpacity="0.2" />
          <g transform={`rotate(${dir})`}>
            <line x1="0" y1="30" x2="0" y2="-30" stroke="#7cc3ff" strokeWidth="3" strokeLinecap="round" />
            <polygon points="0,-34 5,-26 -5,-26" fill="#7cc3ff" />
          </g>
        </svg>
        <div className="absolute bottom-1 text-[11px] font-mono tabular-nums">
          {kph ?? "—"} km/h · {Math.round(dir)}°
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
};
