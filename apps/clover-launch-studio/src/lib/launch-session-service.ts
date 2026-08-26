import { randomBytes } from "node:crypto";
import { authenticateOwner, type OwnerIdentity } from "./auth";
import { ownerScope } from "./acl";
import { ExplicitSyntheticKeyProvider } from "./crypto";
import { MAX_REQUEST_BYTES, MAX_TRANSCRIPT_BYTES, readRuntimeConfig } from "./config";
import { prepareProposalOnlyHandoff } from "./handoff-codex-adapter";
import {
  InMemorySyntheticLaunchStudioStore,
  type AppendEventInput,
  type LaunchStudioStore,
  sha256
} from "./storage";

export class RequestRejectedError extends Error {
  constructor() {
    super("Request rejected");
    this.name = "RequestRejectedError";
  }
}

type RuntimePorts = { store?: LaunchStudioStore };
const runtime = globalThis as typeof globalThis & { __cloverLaunchStudioPorts?: RuntimePorts };

export function registerLaunchStudioStore(store: LaunchStudioStore) {
  runtime.__cloverLaunchStudioPorts = { store };
}

function store(): LaunchStudioStore {
  const configured = runtime.__cloverLaunchStudioPorts?.store;
  if (configured) return configured;
  const config = readRuntimeConfig();
  if (config.authMode !== "synthetic") throw new RequestRejectedError();
  const generated = new InMemorySyntheticLaunchStudioStore(new ExplicitSyntheticKeyProvider(randomBytes(32)));
  runtime.__cloverLaunchStudioPorts = { store: generated };
  return generated;
}

export async function exactJson(request: Request, allowedKeys: readonly string[]): Promise<Record<string, unknown>> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(declared) || declared < 0 || declared > MAX_REQUEST_BYTES) throw new RequestRejectedError();
  const bytes = Buffer.from(await request.arrayBuffer());
  if (bytes.byteLength > MAX_REQUEST_BYTES) throw new RequestRejectedError();
  const value = JSON.parse(bytes.toString("utf8")) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new RequestRejectedError();
  const object = value as Record<string, unknown>;
  if (Object.keys(object).some((key) => !allowedKeys.includes(key))) throw new RequestRejectedError();
  return object;
}

function requireString(value: unknown, maximum = 256): string {
  if (typeof value !== "string" || value.length === 0 || Buffer.byteLength(value, "utf8") > maximum) throw new RequestRejectedError();
  return value;
}

function requireVersion(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new RequestRejectedError();
  return value as number;
}

function nullableString(value: unknown): string | null {
  if (value === null) return null;
  return requireString(value);
}

export class LaunchSessionService {
  constructor(readonly identity: OwnerIdentity, readonly repository: LaunchStudioStore) {}

  async create(reviewedText: unknown, idempotencyKey: unknown) {
    const text = requireString(reviewedText, MAX_TRANSCRIPT_BYTES);
    if (Buffer.byteLength(text, "utf8") > MAX_TRANSCRIPT_BYTES) throw new RequestRejectedError();
    return this.repository.createSession(this.identity, ownerScope(this.identity), text, requireString(idempotencyKey, 160));
  }

  async get(sessionId: string) {
    const session = await this.repository.getSession(this.identity, sessionId);
    return { ...session, providerSubject: undefined };
  }

  async append(sessionId: string, body: Record<string, unknown>) {
    const input: AppendEventInput = {
      type: requireString(body.type) as AppendEventInput["type"],
      expectedVersion: requireVersion(body.expectedVersion),
      predecessorEventId: nullableString(body.predecessorEventId),
      predecessorHash: nullableString(body.predecessorHash),
      idempotencyKey: requireString(body.idempotencyKey, 160),
      payload: body.payload
    };
    return this.repository.appendEvent(this.identity, sessionId, input);
  }

  async editTranscript(sessionId: string, body: Record<string, unknown>) {
    const reviewedText = requireString(body.reviewedText, MAX_TRANSCRIPT_BYTES);
    const bytes = Buffer.from(reviewedText, "utf8");
    return this.append(sessionId, {
      ...body,
      type: "owner-transcript-edited",
      payload: {
        text: reviewedText,
        utf8ByteLength: bytes.byteLength,
        transcriptSha256: sha256(bytes),
        reviewedByOwner: true,
        nativeInAppVoice: false,
        rawAudioRetained: false
      }
    });
  }

  async export(sessionId: string) {
    return this.repository.exportSession(this.identity, sessionId);
  }

  async restore(archive: Uint8Array) {
    return this.repository.restoreSession(this.identity, archive);
  }

  async prepareHandoff(sessionId: string) {
    const session = await this.repository.getSession(this.identity, sessionId);
    const proposal = prepareProposalOnlyHandoff(session);
    await this.repository.appendProgress(this.identity, sessionId, {
      sessionId,
      label: "Handoff proposal prepared",
      state: "proposed",
      evidenceRef: proposal.proposalHash
    });
    return proposal;
  }
}

export async function serviceFor(request: Request, mutation: boolean) {
  const identity = await authenticateOwner(request, { mutation });
  return new LaunchSessionService(identity, store());
}

export function privateNoStoreJson(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "Content-Security-Policy": "default-src 'none'",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "Vary": "Cookie, Authorization"
    }
  });
}

export function denyResponse(): Response {
  return privateNoStoreJson({ error: "Request denied" }, 403);
}
