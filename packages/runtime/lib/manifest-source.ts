import fs from "node:fs/promises";
import path from "node:path";
import { safeParseManifest, type Manifest } from "@cockpit/schema";
import { signManifestFetch } from "./hmac";

/**
 * Returns the current manifest for the vehicle.
 * Priority:
 *   1. Live fetch from Outrider (HMAC-signed) — cache to disk on success.
 *   2. Disk cache if offline.
 *   3. Bundled fallback template (chase) if no cache yet.
 */
export async function loadManifest(): Promise<{ manifest: Manifest; source: string }> {
  const outrider = process.env.OUTRIDER_ORIGIN;
  const vehicleId = process.env.VEHICLE_ID;
  const key = process.env.DEVICE_KEY;
  const cachePath = process.env.MANIFEST_CACHE_PATH ?? "/var/lib/cockpit/manifest.json";

  if (outrider && vehicleId && key) {
    try {
      const ts = String(Date.now());
      const sig = signManifestFetch(key, ts);
      const res = await fetch(`${outrider}/api/manifest/${vehicleId}`, {
        headers: { "x-ts": ts, "x-sig": sig },
        cache: "no-store",
      });
      if (res.ok) {
        const body = await res.json();
        const parsed = safeParseManifest(body.manifest);
        if (parsed.success) {
          await fs.mkdir(path.dirname(cachePath), { recursive: true }).catch(() => {});
          await fs.writeFile(cachePath, JSON.stringify(body.manifest), "utf8").catch(() => {});
          return { manifest: parsed.data, source: `outrider v${body.version}` };
        }
      }
    } catch { /* fall through to cache */ }
  }

  try {
    const cached = JSON.parse(await fs.readFile(cachePath, "utf8"));
    const parsed = safeParseManifest(cached);
    if (parsed.success) return { manifest: parsed.data, source: "cache" };
  } catch { /* fall through to bundled */ }

  const bundled = JSON.parse(
    await fs.readFile(path.resolve(process.cwd(), "../../templates/chase.json"), "utf8"),
  );
  return { manifest: safeParseManifest(bundled).data as Manifest, source: "bundled-chase" };
}
