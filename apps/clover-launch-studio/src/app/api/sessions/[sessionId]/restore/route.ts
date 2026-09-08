import { MAX_RESTORE_REQUEST_BYTES } from "@/lib/config";
import { decodeArchiveBase64url, denyResponse, exactJson, privateNoStoreJson, serviceFor } from "@/lib/launch-session-service";

export const runtime = "nodejs";
type Context = { params: Promise<{ sessionId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const { sessionId } = await context.params;
    const body = await exactJson(request, ["archiveBase64url"], MAX_RESTORE_REQUEST_BYTES);
    const archive = decodeArchiveBase64url(body.archiveBase64url);
    const service = await serviceFor(request, true);
    const restored = await service.restore(sessionId, archive);
    if (restored.sessionId !== sessionId) return denyResponse();
    return privateNoStoreJson({ sessionId: restored.sessionId, version: restored.version }, 201);
  } catch {
    return denyResponse();
  }
}
