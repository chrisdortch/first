import { denyResponse, exactJson, privateNoStoreJson, serviceFor } from "@/lib/launch-session-service";

export const runtime = "nodejs";
type Context = { params: Promise<{ sessionId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { sessionId } = await context.params;
    const service = await serviceFor(request, false);
    return privateNoStoreJson(await service.get(sessionId));
  } catch {
    return denyResponse();
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { sessionId } = await context.params;
    const body = await exactJson(request, ["operation", "reviewedText", "expectedVersion", "predecessorEventId", "predecessorHash", "idempotencyKey"]);
    if (body.operation !== "edit-reviewed-transcript") return denyResponse();
    const service = await serviceFor(request, true);
    const event = await service.editTranscript(sessionId, body);
    return privateNoStoreJson({ eventId: event.eventId, sequence: event.sequence, canonicalHash: event.canonicalHash });
  } catch {
    return denyResponse();
  }
}
