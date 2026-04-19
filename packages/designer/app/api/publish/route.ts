import { NextResponse } from "next/server";
import { safeParseManifest, checksumManifest } from "@cockpit/schema";

export async function POST(req: Request) {
  const { vehicleId, stage, manifest } = await req.json().catch(() => ({}));
  if (!vehicleId || !stage || !manifest) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  const parsed = safeParseManifest(manifest);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_manifest", issues: parsed.error.issues }, { status: 400 });
  }
  const checksum = checksumManifest(parsed.data);

  const outriderRes = await fetch(`${process.env.OUTRIDER_ORIGIN}/api/admin/manifest`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-admin-token": process.env.OUTRIDER_ADMIN_TOKEN!,
    },
    body: JSON.stringify({ vehicleId, stage, manifest: parsed.data, checksum }),
  });
  if (!outriderRes.ok) {
    return NextResponse.json(
      { error: "outrider_reject", status: outriderRes.status, body: await outriderRes.text() },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, checksum, stage });
}
