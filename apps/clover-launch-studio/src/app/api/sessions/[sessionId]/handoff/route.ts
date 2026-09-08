import { denyResponse, privateNoStoreJson, serviceFor } from "@/lib/launch-session-service";

export const runtime = "nodejs";
type Context = { params: Promise<{ sessionId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    if (Number(request.headers.get("content-length") ?? "0") !== 0) return denyResponse();
    const { sessionId } = await context.params;
    const service = await serviceFor(request, true);
    const proposal = await service.prepareHandoff(sessionId);
    return privateNoStoreJson(proposal, 201);
  } catch {
    return denyResponse();
  }
}
