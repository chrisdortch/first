import { publicReadiness } from "@/lib/config";

export const runtime = "nodejs";

export function GET() {
  return Response.json(publicReadiness(), {
    status: 200,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
  });
}
