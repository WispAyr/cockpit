import { NextResponse } from "next/server";
import { loadManifest } from "@/lib/manifest-source";
import { checksumManifest } from "@cockpit/schema";

export async function GET() {
  const { manifest, source } = await loadManifest();
  return NextResponse.json({ manifest, source, checksum: checksumManifest(manifest) });
}
