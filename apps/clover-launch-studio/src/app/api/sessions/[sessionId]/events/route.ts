import { denyResponse, exactJson, privateNoStoreJson, serviceFor } from "@/lib/launch-session-service";

export const runtime = "nodejs";
type Context = { params: Promise<{ sessionId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const { sessionId } = await context.params;
    const body = await exactJson(request, ["type", "expectedVersion", "predecessorEventId", "predecessorHash", "idempotencyKey", "payload"]);
    const service = await serviceFor(request, true);
    const event = await service.append(sessionId, body);
    return privateNoStoreJson({ eventId: event.eventId, sequence: event.sequence, canonicalHash: event.canonicalHash }, 201);
  } catch {
    return denyResponse();
  }
}
