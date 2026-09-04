import { NextResponse } from "next/server";
import { READ_ONLY_AUTHORITY } from "@/lib/live-truth";
import { readBuildProvenance } from "@/lib/provenance";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return NextResponse.json({
    schemaVersion: "clover-tree-provenance-readback-v0.2",
    provenance: readBuildProvenance(),
    authority: READ_ONLY_AUTHORITY
  }, {
    headers: {
      "Cache-Control": "no-store",
      "Vary": "Accept",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
