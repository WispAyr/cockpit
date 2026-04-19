"use client";
import { type WidgetInstance, type Binding } from "@cockpit/schema";
import { useEffect, useRef, useState } from "react";

/**
 * Widget registry — map of type → component. All widgets receive the full
 * WidgetInstance and a `data` prop populated by the binding resolver. Each
 * widget is responsible for its own presentation; the manifest just provides
 * the binding contract.
 *
 * This is the MVP stub set — real Prism/siphon data wiring replaces the
 * mock values in useBindingData below once the runtime has a live env.
 */

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
  if (bind.source === "camera") return { streamUrl: `/stream/${bind.vehicleCameraSlug}.m3u8` };
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

function Tile({ w, children }: { w: WidgetInstance; children: React.ReactNode }) {
  const style: React.CSSProperties = {
    gridColumn: `${w.grid.col} / span ${w.grid.w}`,
    gridRow: `${w.grid.row} / span ${w.grid.h}`,
  };
  return (
    <div className="tile" style={style}>
      {w.title && <div className="tile-title">{w.title}</div>}
      <div className="tile-body">{children}</div>
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

const Starlink = ({ w }: { w: WidgetInstance }) => {
  const d = useBindingData(w.bind);
  return <Tile w={w}><Metric label="Starlink downlink" value={d?.dlMbps ?? "—"} unit="Mbps" /></Tile>;
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
      <div className="flex gap-6">
        <Metric label="Temp" value={d?.tempC ?? "—"} unit="°C" />
        <Metric label="Humidity" value={d?.humidityPct ?? "—"} unit="%" />
        <Metric label="Wind" value={d?.windKph ?? "—"} unit="km/h" />
      </div>
    </Tile>
  );
};
const CameraTile = ({ w }: { w: WidgetInstance }) => {
  const d = useBindingData(w.bind);
  return (
    <Tile w={w}>
      {d?.streamUrl
        ? <video src={d.streamUrl} autoPlay muted playsInline className="w-full h-full object-cover" />
        : <div className="opacity-60 text-sm">Camera feed pending</div>}
    </Tile>
  );
};
const MapTile = ({ w }: { w: WidgetInstance }) => {
  const d = useBindingData(w.bind);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const maplibreRef = useRef<any>(null);
  const overlayIdRef = useRef<string>("overlay");

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
    const maplibre = maplibreRef.current;
    if (!map || !maplibre || !d) return;
    const applyGeo = (fc: any) => {
      if (!fc || !fc.type) return;
      const srcId = overlayIdRef.current + "-src";
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
    <Tile w={w}>
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
            osm: {
              type: "raster",
              tiles: ["https://a.tile.openstreetmap.org/{z}/{x}/{y}.png"],
              tileSize: 256,
              attribution: "© OpenStreetMap",
            },
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
      const el = document.createElement("div");
      el.style.cssText = "width:20px;height:20px;border-radius:50%;background:#ffae00;box-shadow:0 0 0 3px rgba(255,174,0,.3),0 0 12px rgba(255,174,0,.8);border:2px solid #111;";
      markerRef.current = new maplibre.Marker({ element: el }).setLngLat([-4.629, 55.458]).addTo(map);
    })();
    return () => { cancelled = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !d || typeof d.lat !== "number" || typeof d.lon !== "number") return;
    const lngLat: [number, number] = [d.lon, d.lat];
    if (markerRef.current) markerRef.current.setLngLat(lngLat);
    const heading = typeof d.headingDeg === "number" ? d.headingDeg : 0;
    map.easeTo({ center: lngLat, bearing: heading, duration: 800 });
    trailRef.current = [...trailRef.current.slice(-200), lngLat];
  }, [d?.lat, d?.lon, d?.headingDeg]);

  return (
    <Tile w={w}>
      <div className="relative w-full h-full">
        <div ref={containerRef} className="absolute inset-0 rounded-md overflow-hidden" />
        <div className="absolute bottom-1 right-2 text-[10px] font-mono opacity-80 pointer-events-none">
          {d?.lat?.toFixed?.(4) ?? "—"}, {d?.lon?.toFixed?.(4) ?? "—"} · {d?.speedKph ?? "—"} km/h · {d?.headingDeg ?? "—"}°
        </div>
      </div>
    </Tile>
  );
};
const Stormfront = ({ w }: { w: WidgetInstance }) => {
  const d = useBindingData(w.bind);
  return <Tile w={w}>
    <div className="text-center">
      <div className="text-4xl font-semibold">{d?.riskLabel ?? "—"}</div>
      <div className="text-xs opacity-70 mt-1">{d?.summary ?? ""}</div>
    </div>
  </Tile>;
};
const Dispatch = ({ w }: { w: WidgetInstance }) => {
  const d = useBindingData(w.bind);
  const items: any[] = Array.isArray(d?.events) ? d.events : [];
  return <Tile w={w}>
    <div className="w-full text-xs space-y-1 overflow-hidden">
      {items.slice(0, 3).map((e, i) => (
        <div key={i} className="truncate">· {e.title ?? e.message ?? "event"}</div>
      ))}
      {items.length === 0 && <div className="opacity-60">No dispatch events</div>}
    </div>
  </Tile>;
};
const Livestream = ({ w }: { w: WidgetInstance }) => (
  <Tile w={w}><div className="opacity-80 text-sm">⏺ On-air control</div></Tile>
);
const SarStatus = ({ w }: { w: WidgetInstance }) => {
  const d = useBindingData(w.bind);
  return <Tile w={w}>
    <div className="w-full text-center">
      <div className="text-xs opacity-70 uppercase">{d?.incidentRef ?? "standby"}</div>
      <div className="text-xl font-semibold mt-1">{d?.state ?? "No active callout"}</div>
    </div>
  </Tile>;
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
  <Tile w={w}><div className="text-sm opacity-90">{w.props?.text ?? ""}</div></Tile>
);
const Unknown = ({ w }: { w: WidgetInstance }) => (
  <Tile w={w}><div className="text-xs opacity-60">unknown type: {w.type}</div></Tile>
);

const components: Record<string, React.FC<{ w: WidgetInstance }>> = {
  starlink_status: Starlink,
  gps_position: Gps,
  gps_map3d: GpsMap3d,
  weather_tile: Weather,
  camera_tile: CameraTile,
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
};
