import { denyResponse, serviceFor } from "@/lib/launch-session-service";

export const runtime = "nodejs";
type Context = { params: Promise<{ sessionId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { sessionId } = await context.params;
    const service = await serviceFor(request, false);
    const archive = await service.export(sessionId);
    return new Response(archive, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(sessionId)}.clover.json"`,
        "Content-Type": "application/vnd.clover.launch-studio+json",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch {
    return denyResponse();
  }
}
