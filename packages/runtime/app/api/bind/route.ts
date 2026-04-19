/**
 * Runtime binding resolver. Widgets call /api/bind?source=<kind>&... to fetch
 * live data. The runtime is the only thing that knows how to reach the local
 * sensor bus, the Prism URL, and the siphon URL (via WG).
 *
 * This is the MVP stub: returns plausible mock values so the dashboard renders
 * before the edge node is live. Replace each branch with the real upstream
 * call when wiring the vehicle.
 */
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const source = u.searchParams.get("source");

  switch (source) {
    case "local": {
      const sensor = u.searchParams.get("sensor");
      if (sensor === "starlink") return NextResponse.json({ dlMbps: 82, ulMbps: 14, latMs: 41, obstructedPct: 0 });
      if (sensor === "gps") return NextResponse.json({ lat: 55.458, lon: -4.629, speedKph: 42, headingDeg: 87 });
      if (sensor === "weather") return NextResponse.json({ tempC: 11.4, humidityPct: 84, windKph: 23 });
      if (sensor === "roof") return NextResponse.json({ tempC: 9.1 });
      return NextResponse.json({ error: "unknown_sensor" }, { status: 400 });
    }
    case "prism": {
      const lens = u.searchParams.get("lens");
      if (lens === "stormfront_outlook") return NextResponse.json({ riskLabel: "Marginal", summary: "Isolated showers, no organised convection." });
      if (lens === "stormfront_risk_surface") return NextResponse.json({ ok: true });
      if (lens === "stormfront_lightning_jump") return NextResponse.json({ items: [], lastTs: null });
      if (lens === "sar_active_callout") return NextResponse.json({ state: "No active callout", incidentRef: null });
      if (lens === "sar_search_map") return NextResponse.json({ ok: true });
      return NextResponse.json({ ok: true });
    }
    case "siphon": {
      return NextResponse.json({ events: [] });
    }
    default:
      return NextResponse.json({ error: "unknown_source" }, { status: 400 });
  }
}
