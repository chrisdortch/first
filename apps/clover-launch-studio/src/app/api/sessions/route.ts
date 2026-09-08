import { denyResponse, exactJson, privateNoStoreJson, serviceFor } from "@/lib/launch-session-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await exactJson(request, ["operation", "reviewedText"]);
    if (body.operation !== "create") return denyResponse();
    const idempotencyKey = request.headers.get("x-idempotency-key");
    const service = await serviceFor(request, true);
    const session = await service.create(body.reviewedText, idempotencyKey);
    return privateNoStoreJson({ sessionId: session.sessionId, version: session.version }, 201);
  } catch {
    return denyResponse();
  }
}
