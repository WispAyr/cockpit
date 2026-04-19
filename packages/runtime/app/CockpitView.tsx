"use client";
import { renderWidget } from "./widgets/registry";
import type { Manifest } from "@cockpit/schema";
import { useEffect, useState } from "react";

export default function CockpitView({ manifest: initial, source }: { manifest: Manifest; source: string }) {
  const [m, setM] = useState(initial);
  const [status, setStatus] = useState(source);

  useEffect(() => {
    const pollMs = Number(process.env.NEXT_PUBLIC_MANIFEST_POLL_MS ?? 30000);
    let alive = true;
    const id = setInterval(async () => {
      try {
        const r = await fetch("/api/manifest/current", { cache: "no-store" });
        if (!r.ok) return;
        const { manifest, source: s, checksum } = await r.json();
        if (!alive) return;
        if (manifest && checksum !== (m as any).__checksum) {
          setM({ ...manifest, __checksum: checksum });
          setStatus(s);
        }
      } catch { /* stay on current */ }
    }, pollMs);
    return () => { alive = false; clearInterval(id); };
  }, [m]);

  const accent = m.theme?.accent ?? "#ff7a29";
  const bg = m.theme?.background ?? "#0b0d10";
  const fg = m.theme?.foreground ?? "#e7ecf3";
  const cols = m.grid?.cols ?? 12;
  const rowH = m.grid?.rowHeightPx ?? 120;
  const gap = m.grid?.gapPx ?? 12;

  return (
    <div
      className="cockpit-grid"
      style={{
        ["--cockpit-bg" as any]: bg,
        ["--cockpit-fg" as any]: fg,
        ["--gap" as any]: `${gap}px`,
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridAutoRows: `${rowH}px`,
        background: bg,
        color: fg,
      }}
    >
      {m.widgets.map((w) => renderWidget(w))}
      <div style={{
        position: "fixed", right: 8, bottom: 6, fontSize: 10, opacity: 0.5,
        color: fg, textShadow: `0 0 2px ${bg}`,
      }}>
        <span style={{ color: accent }}>●</span> cockpit · {m.name} · {status}
      </div>
    </div>
  );
}
