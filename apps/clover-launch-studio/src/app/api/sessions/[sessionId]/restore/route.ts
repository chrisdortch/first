import { denyResponse, exactJson, privateNoStoreJson, serviceFor } from "@/lib/launch-session-service";

export const runtime = "nodejs";
type Context = { params: Promise<{ sessionId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const { sessionId } = await context.params;
    const body = await exactJson(request, ["archiveBase64url"]);
    if (typeof body.archiveBase64url !== "string") return denyResponse();
    const archive = Buffer.from(body.archiveBase64url, "base64url");
    const service = await serviceFor(request, true);
    const restored = await service.restore(archive);
    if (restored.sessionId !== sessionId) return denyResponse();
    return privateNoStoreJson({ sessionId: restored.sessionId, version: restored.version }, 201);
  } catch {
    return denyResponse();
  }
}
