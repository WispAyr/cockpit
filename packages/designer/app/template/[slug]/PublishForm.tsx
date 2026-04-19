"use client";
import { useState } from "react";

export default function PublishForm({ manifest }: { manifest: any }) {
  const [vehicleId, setVehicleId] = useState("");
  const [stage, setStage] = useState<"draft" | "published" | "live">("draft");
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  async function publish() {
    setErr(null);
    const r = await fetch("/api/publish", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ vehicleId, stage, manifest }),
    });
    if (!r.ok) { setErr(await r.text()); return; }
    setResult(await r.json());
  }

  return (
    <div className="mt-3 space-y-3 text-sm">
      <label className="block">
        <div className="opacity-70 mb-1">Vehicle ID (uuid)</div>
        <input className="w-full rounded bg-white/5 border border-white/10 px-3 py-2 font-mono"
               value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} />
      </label>
      <label className="block">
        <div className="opacity-70 mb-1">Stage</div>
        <select value={stage} onChange={(e) => setStage(e.target.value as any)}
                className="rounded bg-white/5 border border-white/10 px-3 py-2">
          <option value="draft">draft</option>
          <option value="published">published</option>
          <option value="live">live</option>
        </select>
      </label>
      <button onClick={publish}
              className="rounded bg-orange-500 text-black font-medium px-4 py-2">
        Publish to Outrider
      </button>
      {err && <p className="text-red-400">{err}</p>}
      {result && (
        <pre className="mt-3 overflow-auto rounded bg-black/60 border border-white/10 p-3">
{JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
