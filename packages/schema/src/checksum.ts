import { createHash } from "node:crypto";
import type { Manifest } from "./manifest";

/**
 * Deterministic checksum over a manifest — used by the edge runtime to skip
 * re-render when the upstream version is cosmetically identical. Stable JSON
 * stringify so key order doesn't change the hash.
 */
export function checksumManifest(m: Manifest): string {
  return createHash("sha256").update(stableStringify(m)).digest("hex");
}

function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  const keys = Object.keys(v as Record<string, unknown>).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify((v as any)[k])).join(",") + "}";
}
