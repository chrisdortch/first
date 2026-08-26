import { NextResponse } from "next/server";
import { getTreeProgramSnapshot } from "@/lib/tree-program";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    ...getTreeProgramSnapshot(),
    readback: {
      observedAt: new Date().toISOString(),
      mode: "source-bound-public-sanitized",
      durablePrivateStorageClaimed: false
    }
  }, {
    headers: {
      "Cache-Control": "no-store",
      "Vary": "Accept"
    }
  });
}
