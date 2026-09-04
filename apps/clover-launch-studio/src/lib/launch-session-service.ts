import { authenticateOwner, type OwnerIdentity } from "./auth";
import { ownerScope } from "./acl";
import { ExplicitSyntheticKeyProvider } from "./crypto";
import {
  MAX_EXPORT_BYTES,
  MAX_REQUEST_BYTES,
  MAX_RESTORE_ARCHIVE_BASE64URL_BYTES,
  MAX_TRANSCRIPT_BYTES,
  MAX_TRANSCRIPT_REQUEST_BYTES,
  readRuntimeConfig
} from "./config";
import { prepareProposalOnlyHandoff } from "./handoff-codex-adapter";
import {
  InMemorySyntheticLaunchStudioStore,
  LAUNCH_ARCHIVE_FORMAT,
  isLaunchEventType,
  parseJsonWithoutDuplicateKeys,
  type AppendEventInput,
  type LaunchEventType,
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
const TRANSCRIPT_REQUEST_KEY_SETS = new Set([
  ["operation", "reviewedText"].sort().join("\0"),
  ["operation", "reviewedText", "expectedVersion", "predecessorEventId", "predecessorHash", "idempotencyKey"].sort().join("\0")
]);

export function registerLaunchStudioStore(store: LaunchStudioStore) {
  runtime.__cloverLaunchStudioPorts = { store };
}

async function readBoundedRequestBody(request: Request, maximumBytes: number): Promise<Buffer> {
  const body = request.body;
  if (body === null) return Buffer.alloc(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  let failed = false;
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  const onAbort = () => cancel();
  request.signal.addEventListener("abort", onAbort, { once: true });
  try {
    if (request.signal.aborted) throw new RequestRejectedError();
    for (;;) {
      const { done, value } = await reader.read();
      if (request.signal.aborted) throw new RequestRejectedError();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > maximumBytes) throw new RequestRejectedError();
      chunks.push(value);
    }
    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), byteLength);
  } catch {
    failed = true;
    cancel();
    throw new RequestRejectedError();
  } finally {
    request.signal.removeEventListener("abort", onAbort);
    if (failed || request.signal.aborted) cancel();
    try { reader.releaseLock(); } catch { /* A cancelled reader may already be detached. */ }
  }
}

function rejectRequestBody(request: Request): never {
  if (request.body !== null) {
    try { void request.body.cancel().catch(() => undefined); } catch { /* A substituted request body may already be locked. */ }
  }
  throw new RequestRejectedError();
}

function store(): LaunchStudioStore {
  const configured = runtime.__cloverLaunchStudioPorts?.store;
  if (configured) return configured;
  const config = readRuntimeConfig();
  if (config.authMode !== "synthetic" || !config.syntheticArchiveKey) throw new RequestRejectedError();
  const generated = new InMemorySyntheticLaunchStudioStore(new ExplicitSyntheticKeyProvider(config.syntheticArchiveKey));
  runtime.__cloverLaunchStudioPorts = { store: generated };
  return generated;
}

export async function exactJson(
  request: Request,
  allowedKeys: readonly string[],
  maximumBytes = MAX_REQUEST_BYTES
): Promise<Record<string, unknown>> {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) return rejectRequestBody(request);
  const allowedKeySignature = [...new Set(allowedKeys)].sort().join("\0");
  const effectiveMaximumBytes = maximumBytes === MAX_REQUEST_BYTES && TRANSCRIPT_REQUEST_KEY_SETS.has(allowedKeySignature)
    ? MAX_TRANSCRIPT_REQUEST_BYTES
    : maximumBytes;
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isSafeInteger(declared) || declared < 0 || declared > effectiveMaximumBytes) return rejectRequestBody(request);
  const bytes = await readBoundedRequestBody(request, effectiveMaximumBytes);
  let value: unknown;
  try {
    value = parseJsonWithoutDuplicateKeys(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new RequestRejectedError();
  }
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

function requireEventType(value: unknown): LaunchEventType {
  if (!isLaunchEventType(value)) throw new RequestRejectedError();
  return value;
}

export function decodeArchiveBase64url(value: unknown): Buffer {
  const encoded = requireString(value, MAX_RESTORE_ARCHIVE_BASE64URL_BYTES);
  const archive = Buffer.from(encoded, "base64url");
  if (archive.byteLength > MAX_EXPORT_BYTES || archive.toString("base64url") !== encoded) throw new RequestRejectedError();
  return archive;
}

function requireArchiveSessionId(archive: Uint8Array): string {
  let parsed: unknown;
  try {
    parsed = parseJsonWithoutDuplicateKeys(new TextDecoder("utf-8", { fatal: true }).decode(archive));
  } catch {
    throw new RequestRejectedError();
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new RequestRejectedError();
  const document = parsed as { format?: unknown; session?: unknown };
  if (document.format !== LAUNCH_ARCHIVE_FORMAT || !document.session || typeof document.session !== "object" || Array.isArray(document.session)) {
    throw new RequestRejectedError();
  }
  return requireString((document.session as { sessionId?: unknown }).sessionId);
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
      type: requireEventType(body.type),
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
    const archive = await this.repository.exportSession(this.identity, sessionId);
    if (!(archive instanceof Uint8Array) || archive.byteLength === 0 || archive.byteLength > MAX_EXPORT_BYTES) {
      throw new RequestRejectedError();
    }
    return archive;
  }

  async restore(expectedSessionId: string, archive: Uint8Array) {
    if (!(archive instanceof Uint8Array) || archive.byteLength === 0 || archive.byteLength > MAX_EXPORT_BYTES) {
      throw new RequestRejectedError();
    }
    const expected = requireString(expectedSessionId);
    if (requireArchiveSessionId(archive) !== expected) throw new RequestRejectedError();
    return this.repository.restoreSession(this.identity, expected, archive);
  }

  async prepareHandoff(sessionId: string) {
    const session = await this.repository.getSession(this.identity, sessionId);
    const proposal = prepareProposalOnlyHandoff(session);
    await this.repository.appendHandoffProposal(this.identity, sessionId, {
      expectedSessionVersion: session.version,
      expectedLastEventId: session.lastEventId,
      expectedLastEventHash: session.lastEventHash,
      proposal,
      progress: {
        label: "Handoff proposal prepared",
        state: "proposed"
      }
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
