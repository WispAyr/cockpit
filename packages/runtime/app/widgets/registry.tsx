"use client";
import { type WidgetInstance, type Binding } from "@cockpit/schema";
import { useEffect, useState } from "react";

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
const MapTile = ({ w }: { w: WidgetInstance }) => (
  <Tile w={w}><div className="opacity-60 text-sm">Map surface (bind: {w.bind && "source" in w.bind ? (w.bind as any).source : "none"})</div></Tile>
);
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
  const label = t ? t.toLocaleTimeString("en-GB", { hour12: false }) : "—";
  return <Tile w={w}><div className="text-4xl tabular-nums" suppressHydrationWarning>{label}</div></Tile>;
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
