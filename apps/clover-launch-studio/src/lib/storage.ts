import { createHash, randomUUID } from "node:crypto";
import type { OwnerScope } from "./acl";
import { assertOwnerScope } from "./acl";
import type { OwnerIdentity } from "./auth";
import { MAX_EXPORT_BYTES } from "./config";
import { decryptPrivateBytes, encryptPrivateBytes, type EncryptedPayload, type KeyProvider } from "./crypto";

export const LAUNCH_EVENT_TYPES = Object.freeze([
  "owner-transcript-captured",
  "owner-transcript-edited",
  "understanding-reviewed",
  "context-pack-proposed",
  "impact-scan-proposed",
  "build-charter-proposed",
  "owner-feedback-recorded",
  "handoff-proposal-prepared"
] as const);

export type LaunchEventType = (typeof LAUNCH_EVENT_TYPES)[number];

export function isLaunchEventType(value: unknown): value is LaunchEventType {
  return typeof value === "string" && (LAUNCH_EVENT_TYPES as readonly string[]).includes(value);
}

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

function assertExportWithinLimit(session: LaunchSession, events: LaunchEvent[], progress: MaterialProgress[]) {
  const bytes = Buffer.byteLength(canonicalJson({
    format: "clover-launch-studio-export-v1",
    session,
    events,
    progress
  }), "utf8");
  if (bytes > MAX_EXPORT_BYTES) throw new AppendOnlyViolationError();
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

const MATERIAL_PROGRESS_STATES = new Set<MaterialProgress["state"]>(["proposed", "available", "hold", "complete"]);

function assertProgressRecord(item: MaterialProgress, sessionId: string, offset: number) {
  const cursor = offset + 1;
  if (
    !item ||
    typeof item !== "object" ||
    Object.keys(item).sort().join("\0") !== "cursor\0evidenceRef\0label\0progressId\0recordedAt\0sessionId\0state" ||
    item.sessionId !== sessionId ||
    item.cursor !== cursor ||
    typeof item.label !== "string" ||
    item.label.length === 0 ||
    Buffer.byteLength(item.label, "utf8") > 1024 ||
    /reasoning|chain.of.thought|token/i.test(item.label) ||
    !MATERIAL_PROGRESS_STATES.has(item.state) ||
    typeof item.evidenceRef !== "string" ||
    item.evidenceRef.length === 0 ||
    Buffer.byteLength(item.evidenceRef, "utf8") > 4096 ||
    item.progressId !== `progress:${sha256(`${sessionId}\0${cursor}\0${item.evidenceRef}`)}` ||
    typeof item.recordedAt !== "string" ||
    !Number.isFinite(Date.parse(item.recordedAt))
  ) throw new AppendOnlyViolationError();
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
  restoreSession(identity: OwnerIdentity, expectedSessionId: string, archive: Uint8Array): Promise<LaunchSession>;
}

type Artifact = { sessionId: string; scope: OwnerScope; mediaType: string; byteLength: number; encrypted: EncryptedPayload };
type SessionCreationBinding = {
  scope: OwnerScope;
  transcriptDigest: string;
  result: Promise<LaunchSession>;
};

function sameOwnerScope(left: OwnerScope, right: OwnerScope): boolean {
  return left.workspaceId === right.workspaceId && left.projectId === right.projectId && left.participantId === right.participantId;
}

export class InMemorySyntheticLaunchStudioStore implements LaunchStudioStore {
  readonly #sessions = new Map<string, LaunchSession>();
  readonly #events = new Map<string, LaunchEvent[]>();
  readonly #idempotency = new Set<string>();
  readonly #sessionCreations = new Map<string, SessionCreationBinding>();
  readonly #sessionMutations = new Map<string, Promise<unknown>>();
  readonly #artifacts = new Map<string, Artifact>();
  readonly #progress = new Map<string, MaterialProgress[]>();

  constructor(private readonly keys: KeyProvider) {
    if (process.env.NODE_ENV === "production") throw new AppendOnlyViolationError();
  }

  async #withSessionMutation<T>(sessionId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.#sessionMutations.get(sessionId) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    this.#sessionMutations.set(sessionId, current);
    try {
      return await current;
    } finally {
      if (this.#sessionMutations.get(sessionId) === current) this.#sessionMutations.delete(sessionId);
    }
  }

  async createSession(identity: OwnerIdentity, scope: OwnerScope, reviewedTranscript: string, idempotencyKey: string) {
    assertOwnerScope(identity, scope);
    assertIdempotencyKey(idempotencyKey);
    const transcriptBytes = Buffer.from(reviewedTranscript, "utf8");
    const transcriptDigest = sha256(transcriptBytes);
    const existing = this.#sessionCreations.get(idempotencyKey);
    if (existing) {
      if (!sameOwnerScope(existing.scope, scope) || existing.transcriptDigest !== transcriptDigest) {
        throw new AppendOnlyViolationError();
      }
      return clone(await existing.result);
    }

    const result = (async () => {
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
            transcriptSha256: transcriptDigest,
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
    })();
    this.#sessionCreations.set(idempotencyKey, { scope: clone(scope), transcriptDigest, result });
    try {
      return clone(await result);
    } catch (error) {
      if (this.#sessionCreations.get(idempotencyKey)?.result === result) this.#sessionCreations.delete(idempotencyKey);
      throw error;
    }
  }

  async getSession(identity: OwnerIdentity, sessionId: string) {
    const session = this.#sessions.get(sessionId);
    if (!session) throw new SessionNotFoundError();
    assertOwnerScope(identity, session);
    return clone(session);
  }

  async appendEvent(identity: OwnerIdentity, sessionId: string, input: AppendEventInput) {
    return this.#withSessionMutation(sessionId, async () => {
      const session = this.#sessions.get(sessionId);
      if (!session) throw new SessionNotFoundError();
      assertOwnerScope(identity, session);
      if (session.terminal || !isLaunchEventType(input.type)) throw new AppendOnlyViolationError();
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
      const events = this.#events.get(sessionId)!;
      const nextSession = { ...session, version: sequence, lastEventId: eventId, lastEventHash: event.canonicalHash, updatedAt: createdAt };
      assertExportWithinLimit(nextSession, [...events, event], this.#progress.get(sessionId) ?? []);
      this.#idempotency.add(scopedIdempotency);
      events.push(event);
      this.#sessions.set(sessionId, nextSession);
      return clone(event);
    });
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
    return this.#withSessionMutation(sessionId, async () => {
      const session = await this.getSession(identity, sessionId);
      const existing = this.#progress.get(sessionId) ?? [];
      const cursor = existing.length + 1;
      const recordedAt = new Date().toISOString();
      const progress: MaterialProgress = {
        ...item,
        progressId: `progress:${sha256(`${sessionId}\0${cursor}\0${item.evidenceRef}`)}`,
        cursor,
        recordedAt
      };
      assertProgressRecord(progress, sessionId, existing.length);
      assertExportWithinLimit(session, this.#events.get(sessionId) ?? [], [...existing, progress]);
      existing.push(progress);
      this.#progress.set(sessionId, existing);
      return clone(progress);
    });
  }

  async exportSession(identity: OwnerIdentity, sessionId: string) {
    return this.#withSessionMutation(sessionId, async () => {
      const session = this.#sessions.get(sessionId);
      if (!session) throw new SessionNotFoundError();
      assertOwnerScope(identity, session);
      const snapshot = {
        session: clone(session),
        events: clone(this.#events.get(sessionId) ?? []),
        progress: clone(this.#progress.get(sessionId) ?? [])
      };
      assertExportWithinLimit(snapshot.session, snapshot.events, snapshot.progress);
      const body = canonicalJson({ format: "clover-launch-studio-export-v1", ...snapshot });
      return Buffer.from(body, "utf8");
    });
  }

  async restoreSession(identity: OwnerIdentity, expectedSessionId: string, archive: Uint8Array) {
    return this.#withSessionMutation(expectedSessionId, async () => {
      if (archive.byteLength === 0 || archive.byteLength > MAX_EXPORT_BYTES) throw new AppendOnlyViolationError();
      let parsed: { format?: string; session?: LaunchSession; events?: LaunchEvent[]; progress?: MaterialProgress[] };
      try {
        parsed = JSON.parse(Buffer.from(archive).toString("utf8")) as typeof parsed;
      } catch {
        throw new AppendOnlyViolationError();
      }
      if (parsed.format !== "clover-launch-studio-export-v1" || !parsed.session || !Array.isArray(parsed.events) || !Array.isArray(parsed.progress)) {
        throw new AppendOnlyViolationError();
      }
      assertOwnerScope(identity, parsed.session);
      if (parsed.session.sessionId !== expectedSessionId) throw new AppendOnlyViolationError();
      if (this.#sessions.has(parsed.session.sessionId)) throw new AppendOnlyViolationError();
      let predecessorId: string | null = null;
      let predecessorHash: string | null = null;
      const restoredIdempotency = new Set<string>();
      for (const [offset, event] of parsed.events.entries()) {
        const { canonicalHash, ...unsigned } = event;
        if (
          event.sessionId !== parsed.session.sessionId ||
          event.workspaceId !== parsed.session.workspaceId ||
          event.projectId !== parsed.session.projectId ||
          event.participantId !== parsed.session.participantId ||
          !isLaunchEventType(event.type) ||
          event.sequence !== offset + 1 ||
          event.expectedVersion !== offset ||
          event.predecessorEventId !== predecessorId ||
          event.predecessorHash !== predecessorHash ||
          event.eventId !== `event:${sha256(`${event.sessionId}\0${event.sequence}\0${event.payloadDigest}\0${event.idempotencyKey}`)}` ||
          typeof event.createdAt !== "string" ||
          !Number.isFinite(Date.parse(event.createdAt)) ||
          eventHash(unsigned) !== canonicalHash
        ) throw new AppendOnlyViolationError();
        assertIdempotencyKey(event.idempotencyKey);
        if (restoredIdempotency.has(event.idempotencyKey)) throw new AppendOnlyViolationError();
        restoredIdempotency.add(event.idempotencyKey);
        let payloadBytes: Buffer;
        try {
          payloadBytes = await decryptPrivateBytes(event.encryptedPayload, `${event.sessionId}:${event.eventId}:${event.type}`, this.keys);
        } catch {
          throw new AppendOnlyViolationError();
        }
        if (sha256(payloadBytes) !== event.payloadDigest) throw new AppendOnlyViolationError();
        predecessorId = event.eventId;
        predecessorHash = event.canonicalHash;
      }
      parsed.progress.forEach((item, offset) => assertProgressRecord(item, parsed.session!.sessionId, offset));
      if (parsed.session.version !== parsed.events.length || parsed.session.lastEventId !== predecessorId || parsed.session.lastEventHash !== predecessorHash) {
        throw new AppendOnlyViolationError();
      }
      assertExportWithinLimit(parsed.session, parsed.events, parsed.progress);
      this.#sessions.set(parsed.session.sessionId, clone(parsed.session));
      this.#events.set(parsed.session.sessionId, clone(parsed.events));
      this.#progress.set(parsed.session.sessionId, clone(parsed.progress));
      for (const event of parsed.events) this.#idempotency.add(`${parsed.session.sessionId}\0${event.idempotencyKey}`);
      return clone(parsed.session);
    });
  }
}
