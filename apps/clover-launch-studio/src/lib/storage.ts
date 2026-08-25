import { createHash, randomUUID } from "node:crypto";
import type { OwnerScope } from "./acl";
import { assertOwnerScope } from "./acl";
import type { OwnerIdentity } from "./auth";
import { decryptPrivateBytes, encryptPrivateBytes, type EncryptedPayload, type KeyProvider } from "./crypto";

export type LaunchEventType =
  | "owner-transcript-captured"
  | "owner-transcript-edited"
  | "understanding-reviewed"
  | "context-pack-proposed"
  | "impact-scan-proposed"
  | "build-charter-proposed"
  | "owner-feedback-recorded"
  | "handoff-proposal-prepared";

export type LaunchSession = OwnerScope & {
  sessionId: string;
  version: number;
  lastEventId: string | null;
  lastEventHash: string | null;
  createdAt: string;
  updatedAt: string;
  terminal: boolean;
};

export type LaunchEvent = OwnerScope & {
  sessionId: string;
  eventId: string;
  type: LaunchEventType;
  sequence: number;
  expectedVersion: number;
  predecessorEventId: string | null;
  predecessorHash: string | null;
  idempotencyKey: string;
  payloadDigest: string;
  encryptedPayload: EncryptedPayload;
  createdAt: string;
  canonicalHash: string;
};

export type AppendEventInput = {
  type: LaunchEventType;
  expectedVersion: number;
  predecessorEventId: string | null;
  predecessorHash: string | null;
  idempotencyKey: string;
  payload: unknown;
  createdAt?: string;
};

export type MaterialProgress = {
  progressId: string;
  sessionId: string;
  cursor: number;
  label: string;
  state: "proposed" | "available" | "hold" | "complete";
  evidenceRef: string;
  recordedAt: string;
};

export class AppendOnlyViolationError extends Error {
  constructor() {
    super("Append-only boundary rejected the request");
    this.name = "AppendOnlyViolationError";
  }
}

export class SessionNotFoundError extends Error {
  constructor() {
    super("Session unavailable");
    this.name = "SessionNotFoundError";
  }
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(",")}}`;
}

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function clone<T>(value: T): T { return structuredClone(value); }

function eventHash(event: Omit<LaunchEvent, "canonicalHash">): string {
  return sha256(canonicalJson(event));
}

function assertIdempotencyKey(value: string) {
  if (!/^[A-Za-z0-9:_-]{16,160}$/.test(value)) throw new AppendOnlyViolationError();
}

export interface LaunchStudioStore {
  createSession(identity: OwnerIdentity, scope: OwnerScope, reviewedTranscript: string, idempotencyKey: string): Promise<LaunchSession>;
  getSession(identity: OwnerIdentity, sessionId: string): Promise<LaunchSession>;
  appendEvent(identity: OwnerIdentity, sessionId: string, input: AppendEventInput): Promise<LaunchEvent>;
  readEvents(identity: OwnerIdentity, sessionId: string): Promise<LaunchEvent[]>;
  readPayload(identity: OwnerIdentity, event: LaunchEvent): Promise<unknown>;
  putArtifact(identity: OwnerIdentity, sessionId: string, bytes: Uint8Array, mediaType: string): Promise<{ artifactId: string; digest: string; byteLength: number; mediaType: string }>;
  readArtifact(identity: OwnerIdentity, sessionId: string, artifactId: string): Promise<Buffer>;
  appendProgress(identity: OwnerIdentity, sessionId: string, item: Omit<MaterialProgress, "progressId" | "cursor" | "recordedAt">): Promise<MaterialProgress>;
  exportSession(identity: OwnerIdentity, sessionId: string): Promise<Buffer>;
  restoreSession(identity: OwnerIdentity, archive: Uint8Array): Promise<LaunchSession>;
}

type Artifact = { sessionId: string; scope: OwnerScope; mediaType: string; byteLength: number; encrypted: EncryptedPayload };

export class InMemorySyntheticLaunchStudioStore implements LaunchStudioStore {
  readonly #sessions = new Map<string, LaunchSession>();
  readonly #events = new Map<string, LaunchEvent[]>();
  readonly #idempotency = new Set<string>();
  readonly #artifacts = new Map<string, Artifact>();
  readonly #progress = new Map<string, MaterialProgress[]>();

  constructor(private readonly keys: KeyProvider) {
    if (process.env.NODE_ENV === "production") throw new AppendOnlyViolationError();
  }

  async createSession(identity: OwnerIdentity, scope: OwnerScope, reviewedTranscript: string, idempotencyKey: string) {
    assertOwnerScope(identity, scope);
    assertIdempotencyKey(idempotencyKey);
    const transcriptBytes = Buffer.from(reviewedTranscript, "utf8");
    const sessionId = `session:${sha256(`${scope.participantId}\0${idempotencyKey}\0${randomUUID()}`)}`;
    const now = new Date().toISOString();
    const session: LaunchSession = { ...scope, sessionId, version: 0, lastEventId: null, lastEventHash: null, createdAt: now, updatedAt: now, terminal: false };
    this.#sessions.set(sessionId, session);
    this.#events.set(sessionId, []);
    try {
      await this.appendEvent(identity, sessionId, {
        type: "owner-transcript-captured",
        expectedVersion: 0,
        predecessorEventId: null,
        predecessorHash: null,
        idempotencyKey,
        payload: {
          text: reviewedTranscript,
          utf8ByteLength: transcriptBytes.byteLength,
          transcriptSha256: sha256(transcriptBytes),
          reviewedByOwner: true,
          hostAssistedSpeechToReviewedTranscript: true,
          nativeInAppVoice: false,
          rawAudioRetained: false
        },
        createdAt: now
      });
    } catch (error) {
      this.#sessions.delete(sessionId);
      this.#events.delete(sessionId);
      throw error;
    }
    return clone(this.#sessions.get(sessionId)!);
  }

  async getSession(identity: OwnerIdentity, sessionId: string) {
    const session = this.#sessions.get(sessionId);
    if (!session) throw new SessionNotFoundError();
    assertOwnerScope(identity, session);
    return clone(session);
  }

  async appendEvent(identity: OwnerIdentity, sessionId: string, input: AppendEventInput) {
    const session = this.#sessions.get(sessionId);
    if (!session) throw new SessionNotFoundError();
    assertOwnerScope(identity, session);
    if (session.terminal) throw new AppendOnlyViolationError();
    assertIdempotencyKey(input.idempotencyKey);
    const scopedIdempotency = `${sessionId}\0${input.idempotencyKey}`;
    if (this.#idempotency.has(scopedIdempotency)) throw new AppendOnlyViolationError();
    if (
      input.expectedVersion !== session.version ||
      input.predecessorEventId !== session.lastEventId ||
      input.predecessorHash !== session.lastEventHash
    ) throw new AppendOnlyViolationError();

    const sequence = session.version + 1;
    const createdAt = input.createdAt ?? new Date().toISOString();
    const payloadBytes = Buffer.from(canonicalJson(input.payload), "utf8");
    const payloadDigest = sha256(payloadBytes);
    const eventId = `event:${sha256(`${sessionId}\0${sequence}\0${payloadDigest}\0${input.idempotencyKey}`)}`;
    const encryptedPayload = await encryptPrivateBytes(payloadBytes, `${sessionId}:${eventId}:${input.type}`, this.keys);
    const unsigned: Omit<LaunchEvent, "canonicalHash"> = {
      workspaceId: session.workspaceId,
      projectId: session.projectId,
      participantId: session.participantId,
      sessionId,
      eventId,
      type: input.type,
      sequence,
      expectedVersion: input.expectedVersion,
      predecessorEventId: input.predecessorEventId,
      predecessorHash: input.predecessorHash,
      idempotencyKey: input.idempotencyKey,
      payloadDigest,
      encryptedPayload,
      createdAt
    };
    const event: LaunchEvent = { ...unsigned, canonicalHash: eventHash(unsigned) };
    this.#idempotency.add(scopedIdempotency);
    this.#events.get(sessionId)!.push(event);
    this.#sessions.set(sessionId, { ...session, version: sequence, lastEventId: eventId, lastEventHash: event.canonicalHash, updatedAt: createdAt });
    return clone(event);
  }

  async readEvents(identity: OwnerIdentity, sessionId: string) {
    await this.getSession(identity, sessionId);
    return clone(this.#events.get(sessionId) ?? []);
  }

  async readPayload(identity: OwnerIdentity, event: LaunchEvent) {
    const session = await this.getSession(identity, event.sessionId);
    assertOwnerScope(identity, session);
    const bytes = await decryptPrivateBytes(event.encryptedPayload, `${event.sessionId}:${event.eventId}:${event.type}`, this.keys);
    if (sha256(bytes) !== event.payloadDigest) throw new AppendOnlyViolationError();
    return JSON.parse(bytes.toString("utf8"));
  }

  async putArtifact(identity: OwnerIdentity, sessionId: string, bytes: Uint8Array, mediaType: string) {
    const session = await this.getSession(identity, sessionId);
    const digest = sha256(bytes);
    const artifactId = `artifact:${digest}`;
    const encrypted = await encryptPrivateBytes(bytes, `${sessionId}:${artifactId}:${mediaType}`, this.keys);
    this.#artifacts.set(artifactId, { sessionId, scope: session, mediaType, byteLength: bytes.byteLength, encrypted });
    return { artifactId, digest, byteLength: bytes.byteLength, mediaType };
  }

  async readArtifact(identity: OwnerIdentity, sessionId: string, artifactId: string) {
    const artifact = this.#artifacts.get(artifactId);
    if (!artifact || artifact.sessionId !== sessionId) throw new SessionNotFoundError();
    assertOwnerScope(identity, artifact.scope);
    const bytes = await decryptPrivateBytes(artifact.encrypted, `${sessionId}:${artifactId}:${artifact.mediaType}`, this.keys);
    if (`artifact:${sha256(bytes)}` !== artifactId || bytes.byteLength !== artifact.byteLength) throw new AppendOnlyViolationError();
    return bytes;
  }

  async appendProgress(identity: OwnerIdentity, sessionId: string, item: Omit<MaterialProgress, "progressId" | "cursor" | "recordedAt">) {
    await this.getSession(identity, sessionId);
    if (item.sessionId !== sessionId || /reasoning|chain.of.thought|token/i.test(item.label)) throw new AppendOnlyViolationError();
    const existing = this.#progress.get(sessionId) ?? [];
    const cursor = existing.length + 1;
    const recordedAt = new Date().toISOString();
    const progress: MaterialProgress = {
      ...item,
      progressId: `progress:${sha256(`${sessionId}\0${cursor}\0${item.evidenceRef}`)}`,
      cursor,
      recordedAt
    };
    existing.push(progress);
    this.#progress.set(sessionId, existing);
    return clone(progress);
  }

  async exportSession(identity: OwnerIdentity, sessionId: string) {
    const session = await this.getSession(identity, sessionId);
    const events = await this.readEvents(identity, sessionId);
    const progress = clone(this.#progress.get(sessionId) ?? []);
    const body = canonicalJson({ format: "clover-launch-studio-export-v1", session, events, progress });
    return Buffer.from(body, "utf8");
  }

  async restoreSession(identity: OwnerIdentity, archive: Uint8Array) {
    const parsed = JSON.parse(Buffer.from(archive).toString("utf8")) as { format?: string; session?: LaunchSession; events?: LaunchEvent[]; progress?: MaterialProgress[] };
    if (parsed.format !== "clover-launch-studio-export-v1" || !parsed.session || !Array.isArray(parsed.events) || !Array.isArray(parsed.progress)) {
      throw new AppendOnlyViolationError();
    }
    assertOwnerScope(identity, parsed.session);
    if (this.#sessions.has(parsed.session.sessionId)) throw new AppendOnlyViolationError();
    let predecessorId: string | null = null;
    let predecessorHash: string | null = null;
    parsed.events.forEach((event, offset) => {
      const { canonicalHash, ...unsigned } = event;
      if (
        event.sequence !== offset + 1 ||
        event.expectedVersion !== offset ||
        event.predecessorEventId !== predecessorId ||
        event.predecessorHash !== predecessorHash ||
        eventHash(unsigned) !== canonicalHash
      ) throw new AppendOnlyViolationError();
      predecessorId = event.eventId;
      predecessorHash = event.canonicalHash;
    });
    if (parsed.session.version !== parsed.events.length || parsed.session.lastEventId !== predecessorId || parsed.session.lastEventHash !== predecessorHash) {
      throw new AppendOnlyViolationError();
    }
    this.#sessions.set(parsed.session.sessionId, clone(parsed.session));
    this.#events.set(parsed.session.sessionId, clone(parsed.events));
    this.#progress.set(parsed.session.sessionId, clone(parsed.progress));
    for (const event of parsed.events) this.#idempotency.add(`${parsed.session.sessionId}\0${event.idempotencyKey}`);
    return clone(parsed.session);
  }
}
