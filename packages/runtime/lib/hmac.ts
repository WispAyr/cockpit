import { createHmac } from "node:crypto";

export function signManifestFetch(secret: string, ts: string): string {
  return createHmac("sha256", secret).update(`${ts}.manifest`).digest("hex");
}
