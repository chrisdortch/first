import { createHash, createHmac, hkdfSync, randomUUID, timingSafeEqual } from "node:crypto";
import type { OwnerScope } from "./acl";
import { assertOwnerScope } from "./acl";
import type { OwnerIdentity } from "./auth";
import { MAX_EXPORT_BYTES, MAX_TRANSCRIPT_BYTES } from "./config";
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

export type AppendProgressInput = Omit<MaterialProgress, "progressId" | "cursor" | "recordedAt"> & {
  expectedSessionVersion: number;
  expectedLastEventId: string | null;
  expectedLastEventHash: string | null;
};

export const LAUNCH_ARCHIVE_FORMAT = "clover-launch-studio-export-v2" as const;
const ARCHIVE_SEAL_ALGORITHM = "hmac-sha256-hkdf-v1" as const;
const ARCHIVE_SEAL_SALT = Buffer.from("clover-launch-studio:archive-seal:kdf:v2", "utf8");
const ARCHIVE_SEAL_DATA_DOMAIN = Buffer.from("clover-launch-studio:archive-seal:data:v2\0", "utf8");

type ArchivedArtifact = {
  sessionId: string;
  artifactId: string;
  mediaType: string;
  byteLength: number;
  encryptedPayload: EncryptedPayload;
};

type ArchiveSeal = {
  algorithm: typeof ARCHIVE_SEAL_ALGORITHM;
  keyRef: string;
  keyVersion: number;
  digest: string;
};

type UnsignedArchive = {
  format: typeof LAUNCH_ARCHIVE_FORMAT;
  session: LaunchSession;
  events: LaunchEvent[];
  progress: MaterialProgress[];
  artifacts: ArchivedArtifact[];
};

type ArchiveDocument = UnsignedArchive & { archiveSeal: ArchiveSeal };

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

function exactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value as Record<string, unknown>).sort().join("\0") === [...keys].sort().join("\0");
}

function parseJsonWithoutDuplicateKeys(source: string): unknown {
  let offset = 0;
  const whitespace = () => { while (/[\u0009\u000a\u000d\u0020]/u.test(source[offset] ?? "")) offset += 1; };
  const parseString = (): string => {
    if (source[offset] !== '"') throw new AppendOnlyViolationError();
    const start = offset;
    offset += 1;
    while (offset < source.length) {
      const character = source[offset];
      if (character.charCodeAt(0) < 0x20) throw new AppendOnlyViolationError();
      if (character === '"') {
        offset += 1;
        try { return JSON.parse(source.slice(start, offset)) as string; } catch { throw new AppendOnlyViolationError(); }
      }
      if (character === "\\") {
        offset += 2;
        continue;
      }
      offset += 1;
    }
    throw new AppendOnlyViolationError();
  };
  const parseValue = (): unknown => {
    whitespace();
    const character = source[offset];
    if (character === '"') return parseString();
    if (character === "{") {
      offset += 1;
      whitespace();
      const object = Object.create(null) as Record<string, unknown>;
      const seen = new Set<string>();
      if (source[offset] === "}") { offset += 1; return object; }
      while (offset < source.length) {
        const key = parseString();
        if (seen.has(key)) throw new AppendOnlyViolationError();
        seen.add(key);
        whitespace();
        if (source[offset] !== ":") throw new AppendOnlyViolationError();
        offset += 1;
        object[key] = parseValue();
        whitespace();
        if (source[offset] === "}") { offset += 1; return object; }
        if (source[offset] !== ",") throw new AppendOnlyViolationError();
        offset += 1;
        whitespace();
      }
      throw new AppendOnlyViolationError();
    }
    if (character === "[") {
      offset += 1;
      whitespace();
      const array: unknown[] = [];
      if (source[offset] === "]") { offset += 1; return array; }
      while (offset < source.length) {
        array.push(parseValue());
        whitespace();
        if (source[offset] === "]") { offset += 1; return array; }
        if (source[offset] !== ",") throw new AppendOnlyViolationError();
        offset += 1;
      }
      throw new AppendOnlyViolationError();
    }
    for (const [literal, value] of [["true", true], ["false", false], ["null", null]] as const) {
      if (source.startsWith(literal, offset)) { offset += literal.length; return value; }
    }
    const number = source.slice(offset).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u)?.[0];
    if (!number) throw new AppendOnlyViolationError();
    offset += number.length;
    const value = Number(number);
    if (!Number.isFinite(value)) throw new AppendOnlyViolationError();
    return value;
  };
  const value = parseValue();
  whitespace();
  if (offset !== source.length) throw new AppendOnlyViolationError();
  return value;
}

function canonicalTimestamp(value: unknown): string {
  if (typeof value !== "string") throw new AppendOnlyViolationError();
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) throw new AppendOnlyViolationError();
  return value;
}

function assertArchiveKey(material: { keyRef: string; version: number; key: Buffer }) {
  if (
    !material ||
    typeof material.keyRef !== "string" ||
    !/^[A-Za-z0-9:_.@/-]{1,160}$/u.test(material.keyRef) ||
    !Number.isSafeInteger(material.version) ||
    material.version < 1 ||
    !Buffer.isBuffer(material.key) ||
    material.key.byteLength !== 32
  ) throw new AppendOnlyViolationError();
  return material;
}

function derivedArchiveSealKey(material: { keyRef: string; version: number; key: Buffer }): Buffer {
  assertArchiveKey(material);
  const info = Buffer.from(`clover-launch-studio:archive-seal:key:v2\0${material.keyRef}\0${material.version}`, "utf8");
  return Buffer.from(hkdfSync("sha256", material.key, ARCHIVE_SEAL_SALT, info, 32));
}

function archiveDigest(unsigned: UnsignedArchive, material: { keyRef: string; version: number; key: Buffer }): string {
  return createHmac("sha256", derivedArchiveSealKey(material))
    .update(ARCHIVE_SEAL_DATA_DOMAIN)
    .update(canonicalJson(unsigned), "utf8")
    .digest("hex");
}

async function sealArchive(unsigned: UnsignedArchive, keys: KeyProvider): Promise<ArchiveDocument> {
  const material = assertArchiveKey(await keys.current());
  return {
    ...unsigned,
    archiveSeal: {
      algorithm: ARCHIVE_SEAL_ALGORITHM,
      keyRef: material.keyRef,
      keyVersion: material.version,
      digest: archiveDigest(unsigned, material)
    }
  };
}

async function verifyArchiveSeal(unsigned: UnsignedArchive, seal: ArchiveSeal, keys: KeyProvider): Promise<void> {
  if (
    !exactKeys(seal, ["algorithm", "keyRef", "keyVersion", "digest"]) ||
    seal.algorithm !== ARCHIVE_SEAL_ALGORITHM ||
    typeof seal.keyRef !== "string" ||
    !Number.isSafeInteger(seal.keyVersion) ||
    seal.keyVersion < 1 ||
    typeof seal.digest !== "string" ||
    !/^[a-f0-9]{64}$/u.test(seal.digest)
  ) throw new AppendOnlyViolationError();
  const material = await keys.resolve(seal.keyRef, seal.keyVersion);
  if (!material || material.keyRef !== seal.keyRef || material.version !== seal.keyVersion) throw new AppendOnlyViolationError();
  const expected = Buffer.from(archiveDigest(unsigned, assertArchiveKey(material)), "hex");
  const actual = Buffer.from(seal.digest, "hex");
  if (expected.byteLength !== actual.byteLength || !timingSafeEqual(expected, actual)) throw new AppendOnlyViolationError();
}

async function completeArchiveBytes(
  keys: KeyProvider,
  session: LaunchSession,
  events: LaunchEvent[],
  progress: MaterialProgress[],
  artifacts: ArchivedArtifact[]
): Promise<Buffer> {
  const document = await sealArchive({ format: LAUNCH_ARCHIVE_FORMAT, session, events, progress, artifacts }, keys);
  const bytes = Buffer.from(canonicalJson(document), "utf8");
  if (bytes.byteLength > MAX_EXPORT_BYTES) throw new AppendOnlyViolationError();
  return bytes;
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
    Array.isArray(item) ||
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
    typeof item.recordedAt !== "string" ||
    !Number.isFinite(Date.parse(item.recordedAt)) ||
    new Date(Date.parse(item.recordedAt)).toISOString() !== item.recordedAt
  ) throw new AppendOnlyViolationError();
  const { progressId, ...unsigned } = item;
  if (progressId !== `progress:${sha256(canonicalJson(unsigned))}`) throw new AppendOnlyViolationError();
}

function assertSessionRecord(session: LaunchSession): void {
  if (
    !exactKeys(session, [
      "workspaceId", "projectId", "participantId", "sessionId", "version", "lastEventId",
      "lastEventHash", "createdAt", "updatedAt", "terminal"
    ]) ||
    typeof session.workspaceId !== "string" ||
    typeof session.projectId !== "string" ||
    !/^participant:[a-f0-9]{64}$/u.test(session.participantId) ||
    !/^session:[a-f0-9]{64}$/u.test(session.sessionId) ||
    !Number.isSafeInteger(session.version) ||
    session.version < 1 ||
    !/^event:[a-f0-9]{64}$/u.test(session.lastEventId ?? "") ||
    !/^[a-f0-9]{64}$/u.test(session.lastEventHash ?? "") ||
    session.terminal !== false
  ) throw new AppendOnlyViolationError();
  canonicalTimestamp(session.createdAt);
  canonicalTimestamp(session.updatedAt);
}

function canonicalBase64url(value: unknown, expectedBytes: number | null = null): Buffer {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]*$/u.test(value)) throw new AppendOnlyViolationError();
  const bytes = Buffer.from(value, "base64url");
  if (bytes.toString("base64url") !== value || (expectedBytes !== null && bytes.byteLength !== expectedBytes)) {
    throw new AppendOnlyViolationError();
  }
  return bytes;
}

function assertEncryptedPayload(payload: EncryptedPayload, expectedAad: string): void {
  if (
    !exactKeys(payload, ["algorithm", "keyRef", "keyVersion", "iv", "aad", "ciphertext", "authTag", "plaintextSha256"]) ||
    payload.algorithm !== "aes-256-gcm" ||
    typeof payload.keyRef !== "string" ||
    !/^[A-Za-z0-9:_.@/-]{1,160}$/u.test(payload.keyRef) ||
    !Number.isSafeInteger(payload.keyVersion) ||
    payload.keyVersion < 1 ||
    payload.aad !== expectedAad ||
    typeof payload.plaintextSha256 !== "string" ||
    !/^[a-f0-9]{64}$/u.test(payload.plaintextSha256)
  ) throw new AppendOnlyViolationError();
  canonicalBase64url(payload.iv, 12);
  canonicalBase64url(payload.authTag, 16);
  canonicalBase64url(payload.ciphertext);
}

function assertMediaType(mediaType: unknown): asserts mediaType is string {
  if (
    typeof mediaType !== "string" ||
    Buffer.byteLength(mediaType, "utf8") > 255 ||
    !/^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*$/u.test(mediaType)
  ) throw new AppendOnlyViolationError();
}

function assertCreationPayload(value: unknown): { text: string; transcriptDigest: string } {
  if (!exactKeys(value, [
    "text", "utf8ByteLength", "transcriptSha256", "reviewedByOwner",
    "hostAssistedSpeechToReviewedTranscript", "nativeInAppVoice", "rawAudioRetained"
  ])) throw new AppendOnlyViolationError();
  const text = value.text;
  if (typeof text !== "string") throw new AppendOnlyViolationError();
  const bytes = Buffer.from(text, "utf8");
  if (
    bytes.byteLength === 0 ||
    bytes.byteLength > MAX_TRANSCRIPT_BYTES ||
    value.utf8ByteLength !== bytes.byteLength ||
    value.transcriptSha256 !== sha256(bytes) ||
    value.reviewedByOwner !== true ||
    value.hostAssistedSpeechToReviewedTranscript !== true ||
    value.nativeInAppVoice !== false ||
    value.rawAudioRetained !== false
  ) throw new AppendOnlyViolationError();
  return { text, transcriptDigest: value.transcriptSha256 as string };
}

export interface LaunchStudioStore {
  createSession(identity: OwnerIdentity, scope: OwnerScope, reviewedTranscript: string, idempotencyKey: string): Promise<LaunchSession>;
  getSession(identity: OwnerIdentity, sessionId: string): Promise<LaunchSession>;
  appendEvent(identity: OwnerIdentity, sessionId: string, input: AppendEventInput): Promise<LaunchEvent>;
  readEvents(identity: OwnerIdentity, sessionId: string): Promise<LaunchEvent[]>;
  readPayload(identity: OwnerIdentity, event: LaunchEvent): Promise<unknown>;
  putArtifact(identity: OwnerIdentity, sessionId: string, bytes: Uint8Array, mediaType: string): Promise<{ artifactId: string; digest: string; byteLength: number; mediaType: string }>;
  readArtifact(identity: OwnerIdentity, sessionId: string, artifactId: string): Promise<Buffer>;
  appendProgress(identity: OwnerIdentity, sessionId: string, item: AppendProgressInput): Promise<MaterialProgress>;
  exportSession(identity: OwnerIdentity, sessionId: string): Promise<Buffer>;
  restoreSession(identity: OwnerIdentity, expectedSessionId: string, archive: Uint8Array): Promise<LaunchSession>;
}

type Artifact = { sessionId: string; scope: OwnerScope; mediaType: string; byteLength: number; encrypted: EncryptedPayload };
type SessionCreationBinding = {
  scope: OwnerScope;
  transcriptDigest: string;
  result: Promise<LaunchSession>;
};
type PreparedAppendEventInput = {
  type: LaunchEventType;
  expectedVersion: number;
  predecessorEventId: string | null;
  predecessorHash: string | null;
  idempotencyKey: string;
  payloadBytes: Buffer;
  payloadDigest: string;
  requestedCreatedAt: string | null;
};
type EventIdempotencyBinding = {
  sessionId: string;
  type: LaunchEventType;
  expectedVersion: number;
  predecessorEventId: string | null;
  predecessorHash: string | null;
  idempotencyKey: string;
  payloadDigest: string;
  resultEvent: LaunchEvent;
};

function prepareAppendEventInput(input: AppendEventInput): PreparedAppendEventInput {
  try {
    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      !exactKeys(input, Object.prototype.hasOwnProperty.call(input, "createdAt")
        ? ["type", "expectedVersion", "predecessorEventId", "predecessorHash", "idempotencyKey", "payload", "createdAt"]
        : ["type", "expectedVersion", "predecessorEventId", "predecessorHash", "idempotencyKey", "payload"])
    ) throw new AppendOnlyViolationError();
    const type = input.type;
    const expectedVersion = input.expectedVersion;
    const predecessorEventId = input.predecessorEventId;
    const predecessorHash = input.predecessorHash;
    const idempotencyKey = input.idempotencyKey;
    if (
      !isLaunchEventType(type) ||
      !Number.isSafeInteger(expectedVersion) ||
      expectedVersion < 0 ||
      (predecessorEventId !== null && !/^event:[a-f0-9]{64}$/u.test(predecessorEventId)) ||
      (predecessorHash !== null && !/^[a-f0-9]{64}$/u.test(predecessorHash))
    ) throw new AppendOnlyViolationError();
    assertIdempotencyKey(idempotencyKey);
    const requestedCreatedAt = Object.prototype.hasOwnProperty.call(input, "createdAt")
      ? canonicalTimestamp(input.createdAt)
      : null;
    const payloadSource = canonicalJson(input.payload);
    if (typeof payloadSource !== "string") throw new AppendOnlyViolationError();
    const parsedPayload = parseJsonWithoutDuplicateKeys(payloadSource);
    if (canonicalJson(parsedPayload) !== payloadSource) throw new AppendOnlyViolationError();
    const payloadBytes = Buffer.from(payloadSource, "utf8");
    return {
      type,
      expectedVersion,
      predecessorEventId,
      predecessorHash,
      idempotencyKey,
      payloadBytes,
      payloadDigest: sha256(payloadBytes),
      requestedCreatedAt
    };
  } catch (error) {
    if (error instanceof AppendOnlyViolationError) throw error;
    throw new AppendOnlyViolationError();
  }
}

function eventBinding(event: LaunchEvent): EventIdempotencyBinding {
  return {
    sessionId: event.sessionId,
    type: event.type,
    expectedVersion: event.expectedVersion,
    predecessorEventId: event.predecessorEventId,
    predecessorHash: event.predecessorHash,
    idempotencyKey: event.idempotencyKey,
    payloadDigest: event.payloadDigest,
    resultEvent: clone(event)
  };
}

function exactEventRetry(binding: EventIdempotencyBinding, sessionId: string, input: PreparedAppendEventInput): boolean {
  return binding.sessionId === sessionId &&
    binding.type === input.type &&
    binding.expectedVersion === input.expectedVersion &&
    binding.predecessorEventId === input.predecessorEventId &&
    binding.predecessorHash === input.predecessorHash &&
    binding.idempotencyKey === input.idempotencyKey &&
    binding.payloadDigest === input.payloadDigest &&
    (input.requestedCreatedAt === null || input.requestedCreatedAt === binding.resultEvent.createdAt);
}

function sameOwnerScope(left: OwnerScope, right: OwnerScope): boolean {
  return left.workspaceId === right.workspaceId && left.projectId === right.projectId && left.participantId === right.participantId;
}

function artifactStorageKey(sessionId: string, artifactId: string): string {
  return `${sessionId}\0${artifactId}`;
}

export class InMemorySyntheticLaunchStudioStore implements LaunchStudioStore {
  readonly #sessions = new Map<string, LaunchSession>();
  readonly #events = new Map<string, LaunchEvent[]>();
  readonly #idempotency = new Map<string, EventIdempotencyBinding>();
  readonly #sessionCreations = new Map<string, SessionCreationBinding>();
  readonly #sessionMutations = new Map<string, Promise<unknown>>();
  readonly #artifacts = new Map<string, Artifact>();
  readonly #progress = new Map<string, MaterialProgress[]>();

  constructor(private readonly keys: KeyProvider) {
    if (process.env.NODE_ENV === "production") throw new AppendOnlyViolationError();
  }

  #archivedArtifacts(sessionId: string): ArchivedArtifact[] {
    const artifacts: ArchivedArtifact[] = [];
    for (const [storageKey, artifact] of this.#artifacts) {
      if (artifact.sessionId !== sessionId) continue;
      const separator = storageKey.indexOf("\0");
      const artifactId = storageKey.slice(separator + 1);
      if (separator < 0 || storageKey !== artifactStorageKey(sessionId, artifactId)) throw new AppendOnlyViolationError();
      artifacts.push({
        sessionId,
        artifactId,
        mediaType: artifact.mediaType,
        byteLength: artifact.byteLength,
        encryptedPayload: clone(artifact.encrypted)
      });
    }
    return artifacts.sort((left, right) =>
      Buffer.compare(Buffer.from(left.artifactId, "utf8"), Buffer.from(right.artifactId, "utf8"))
    );
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
    if (transcriptBytes.byteLength === 0 || transcriptBytes.byteLength > MAX_TRANSCRIPT_BYTES) {
      throw new AppendOnlyViolationError();
    }
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
    const prepared = prepareAppendEventInput(input);
    return this.#withSessionMutation(sessionId, async () => {
      const session = this.#sessions.get(sessionId);
      if (!session) throw new SessionNotFoundError();
      assertOwnerScope(identity, session);
      const scopedIdempotency = `${sessionId}\0${prepared.idempotencyKey}`;
      const priorResult = this.#idempotency.get(scopedIdempotency);
      if (priorResult) {
        if (!exactEventRetry(priorResult, sessionId, prepared)) throw new AppendOnlyViolationError();
        return clone(priorResult.resultEvent);
      }
      if (session.terminal) throw new AppendOnlyViolationError();
      if (
        prepared.expectedVersion !== session.version ||
        prepared.predecessorEventId !== session.lastEventId ||
        prepared.predecessorHash !== session.lastEventHash
      ) throw new AppendOnlyViolationError();

      const sequence = session.version + 1;
      const createdAt = prepared.requestedCreatedAt ?? new Date().toISOString();
      if (Date.parse(createdAt) < Date.parse(session.updatedAt)) throw new AppendOnlyViolationError();
      const eventId = `event:${sha256(`${sessionId}\0${sequence}\0${prepared.payloadDigest}\0${prepared.idempotencyKey}`)}`;
      const encryptedPayload = await encryptPrivateBytes(prepared.payloadBytes, `${sessionId}:${eventId}:${prepared.type}`, this.keys);
      const unsigned: Omit<LaunchEvent, "canonicalHash"> = {
        workspaceId: session.workspaceId,
        projectId: session.projectId,
        participantId: session.participantId,
        sessionId,
        eventId,
        type: prepared.type,
        sequence,
        expectedVersion: prepared.expectedVersion,
        predecessorEventId: prepared.predecessorEventId,
        predecessorHash: prepared.predecessorHash,
        idempotencyKey: prepared.idempotencyKey,
        payloadDigest: prepared.payloadDigest,
        encryptedPayload,
        createdAt
      };
      const event: LaunchEvent = { ...unsigned, canonicalHash: eventHash(unsigned) };
      const events = this.#events.get(sessionId)!;
      const nextSession = { ...session, version: sequence, lastEventId: eventId, lastEventHash: event.canonicalHash, updatedAt: createdAt };
      await completeArchiveBytes(
        this.keys,
        nextSession,
        [...events, event],
        this.#progress.get(sessionId) ?? [],
        this.#archivedArtifacts(sessionId)
      );
      this.#idempotency.set(scopedIdempotency, eventBinding(event));
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
    if (!(bytes instanceof Uint8Array)) throw new AppendOnlyViolationError();
    const artifactBytes = Buffer.from(bytes);
    assertMediaType(mediaType);
    return this.#withSessionMutation(sessionId, async () => {
      const session = this.#sessions.get(sessionId);
      if (!session) throw new SessionNotFoundError();
      assertOwnerScope(identity, session);
      const digest = sha256(artifactBytes);
      const artifactId = `artifact:${digest}`;
      const storageKey = artifactStorageKey(sessionId, artifactId);
      const existing = this.#artifacts.get(storageKey);
      if (existing) {
        if (existing.mediaType !== mediaType || existing.byteLength !== artifactBytes.byteLength) throw new AppendOnlyViolationError();
        const restored = await decryptPrivateBytes(existing.encrypted, `${sessionId}:${artifactId}:${mediaType}`, this.keys);
        if (!artifactBytes.equals(restored)) throw new AppendOnlyViolationError();
        return { artifactId, digest, byteLength: artifactBytes.byteLength, mediaType };
      }
      const encrypted = await encryptPrivateBytes(artifactBytes, `${sessionId}:${artifactId}:${mediaType}`, this.keys);
      const archived: ArchivedArtifact = {
        sessionId,
        artifactId,
        mediaType,
        byteLength: artifactBytes.byteLength,
        encryptedPayload: encrypted
      };
      const artifacts = [...this.#archivedArtifacts(sessionId), archived]
        .sort((left, right) => Buffer.compare(Buffer.from(left.artifactId, "utf8"), Buffer.from(right.artifactId, "utf8")));
      await completeArchiveBytes(
        this.keys,
        session,
        this.#events.get(sessionId) ?? [],
        this.#progress.get(sessionId) ?? [],
        artifacts
      );
      this.#artifacts.set(storageKey, {
        sessionId,
        scope: clone(session),
        mediaType,
        byteLength: artifactBytes.byteLength,
        encrypted
      });
      return { artifactId, digest, byteLength: artifactBytes.byteLength, mediaType };
    });
  }

  async readArtifact(identity: OwnerIdentity, sessionId: string, artifactId: string) {
    const artifact = this.#artifacts.get(artifactStorageKey(sessionId, artifactId));
    if (!artifact) throw new SessionNotFoundError();
    assertOwnerScope(identity, artifact.scope);
    const bytes = await decryptPrivateBytes(artifact.encrypted, `${sessionId}:${artifactId}:${artifact.mediaType}`, this.keys);
    if (`artifact:${sha256(bytes)}` !== artifactId || bytes.byteLength !== artifact.byteLength) throw new AppendOnlyViolationError();
    return bytes;
  }

  async appendProgress(identity: OwnerIdentity, sessionId: string, item: AppendProgressInput) {
    return this.#withSessionMutation(sessionId, async () => {
      if (
        !item ||
        typeof item !== "object" ||
        Array.isArray(item) ||
        Object.keys(item).sort().join("\0") !== "evidenceRef\0expectedLastEventHash\0expectedLastEventId\0expectedSessionVersion\0label\0sessionId\0state"
      ) throw new AppendOnlyViolationError();
      const session = this.#sessions.get(sessionId);
      if (!session) throw new SessionNotFoundError();
      assertOwnerScope(identity, session);
      if (
        item.sessionId !== sessionId ||
        item.expectedSessionVersion !== session.version ||
        item.expectedLastEventId !== session.lastEventId ||
        item.expectedLastEventHash !== session.lastEventHash
      ) throw new AppendOnlyViolationError();
      const existing = this.#progress.get(sessionId) ?? [];
      const cursor = existing.length + 1;
      const recordedAt = new Date().toISOString();
      const unsigned: Omit<MaterialProgress, "progressId"> = {
        sessionId: item.sessionId,
        cursor,
        label: item.label,
        state: item.state,
        evidenceRef: item.evidenceRef,
        recordedAt
      };
      const progress: MaterialProgress = { ...unsigned, progressId: `progress:${sha256(canonicalJson(unsigned))}` };
      assertProgressRecord(progress, sessionId, existing.length);
      await completeArchiveBytes(
        this.keys,
        session,
        this.#events.get(sessionId) ?? [],
        [...existing, progress],
        this.#archivedArtifacts(sessionId)
      );
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
        progress: clone(this.#progress.get(sessionId) ?? []),
        artifacts: clone(this.#archivedArtifacts(sessionId))
      };
      return completeArchiveBytes(this.keys, snapshot.session, snapshot.events, snapshot.progress, snapshot.artifacts);
    });
  }

  async restoreSession(identity: OwnerIdentity, expectedSessionId: string, archive: Uint8Array) {
    return this.#withSessionMutation(expectedSessionId, async () => {
      if (archive.byteLength === 0 || archive.byteLength > MAX_EXPORT_BYTES) throw new AppendOnlyViolationError();
      let parsed: ArchiveDocument;
      try {
        const source = new TextDecoder("utf-8", { fatal: true }).decode(archive);
        parsed = parseJsonWithoutDuplicateKeys(source) as ArchiveDocument;
      } catch {
        throw new AppendOnlyViolationError();
      }
      if (
        !exactKeys(parsed, ["format", "session", "events", "progress", "artifacts", "archiveSeal"]) ||
        parsed.format !== LAUNCH_ARCHIVE_FORMAT ||
        !parsed.session ||
        !Array.isArray(parsed.events) ||
        !Array.isArray(parsed.progress) ||
        !Array.isArray(parsed.artifacts) ||
        !parsed.archiveSeal
      ) {
        throw new AppendOnlyViolationError();
      }
      const unsignedArchive: UnsignedArchive = {
        format: LAUNCH_ARCHIVE_FORMAT,
        session: parsed.session,
        events: parsed.events,
        progress: parsed.progress,
        artifacts: parsed.artifacts
      };
      await verifyArchiveSeal(unsignedArchive, parsed.archiveSeal, this.keys);
      if (Buffer.byteLength(canonicalJson(parsed), "utf8") > MAX_EXPORT_BYTES) throw new AppendOnlyViolationError();
      assertSessionRecord(parsed.session);
      assertOwnerScope(identity, parsed.session);
      if (parsed.session.sessionId !== expectedSessionId) throw new AppendOnlyViolationError();
      if (this.#sessions.has(parsed.session.sessionId)) throw new AppendOnlyViolationError();
      if (parsed.events.length === 0) throw new AppendOnlyViolationError();
      let predecessorId: string | null = null;
      let predecessorHash: string | null = null;
      let priorCreatedAt: string | null = null;
      const restoredIdempotency = new Map<string, EventIdempotencyBinding>();
      const restoredPayloads: unknown[] = [];
      for (const [offset, event] of parsed.events.entries()) {
        if (!exactKeys(event, [
          "workspaceId", "projectId", "participantId", "sessionId", "eventId", "type", "sequence",
          "expectedVersion", "predecessorEventId", "predecessorHash", "idempotencyKey", "payloadDigest",
          "encryptedPayload", "createdAt", "canonicalHash"
        ])) throw new AppendOnlyViolationError();
        const { canonicalHash, ...unsigned } = event;
        const createdAt = canonicalTimestamp(event.createdAt);
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
          !/^[a-f0-9]{64}$/u.test(event.payloadDigest) ||
          !/^[a-f0-9]{64}$/u.test(event.canonicalHash) ||
          (priorCreatedAt !== null && Date.parse(createdAt) < Date.parse(priorCreatedAt)) ||
          eventHash(unsigned) !== canonicalHash
        ) throw new AppendOnlyViolationError();
        assertEncryptedPayload(event.encryptedPayload, `${event.sessionId}:${event.eventId}:${event.type}`);
        assertIdempotencyKey(event.idempotencyKey);
        const scopedIdempotency = `${event.sessionId}\0${event.idempotencyKey}`;
        if (restoredIdempotency.has(scopedIdempotency) || this.#idempotency.has(scopedIdempotency)) {
          throw new AppendOnlyViolationError();
        }
        restoredIdempotency.set(scopedIdempotency, eventBinding(event));
        let payloadBytes: Buffer;
        try {
          payloadBytes = await decryptPrivateBytes(event.encryptedPayload, `${event.sessionId}:${event.eventId}:${event.type}`, this.keys);
        } catch {
          throw new AppendOnlyViolationError();
        }
        if (sha256(payloadBytes) !== event.payloadDigest) throw new AppendOnlyViolationError();
        let payload: unknown;
        try {
          const payloadSource = new TextDecoder("utf-8", { fatal: true }).decode(payloadBytes);
          payload = parseJsonWithoutDuplicateKeys(payloadSource);
          if (canonicalJson(payload) !== payloadSource) throw new AppendOnlyViolationError();
        } catch {
          throw new AppendOnlyViolationError();
        }
        restoredPayloads.push(payload);
        predecessorId = event.eventId;
        predecessorHash = event.canonicalHash;
        priorCreatedAt = createdAt;
      }
      if (parsed.events[0].type !== "owner-transcript-captured") throw new AppendOnlyViolationError();
      parsed.progress.forEach((item, offset) => assertProgressRecord(item, parsed.session!.sessionId, offset));
      if (
        parsed.session.version !== parsed.events.length ||
        parsed.session.lastEventId !== predecessorId ||
        parsed.session.lastEventHash !== predecessorHash ||
        parsed.session.createdAt !== parsed.events[0].createdAt ||
        parsed.session.updatedAt !== parsed.events.at(-1)!.createdAt ||
        parsed.session.terminal !== false
      ) {
        throw new AppendOnlyViolationError();
      }
      const stagedArtifacts = new Map<string, Artifact>();
      let priorArtifactId: string | null = null;
      for (const artifact of parsed.artifacts) {
        if (!exactKeys(artifact, ["sessionId", "artifactId", "mediaType", "byteLength", "encryptedPayload"])) {
          throw new AppendOnlyViolationError();
        }
        if (
          artifact.sessionId !== parsed.session.sessionId ||
          !/^artifact:[a-f0-9]{64}$/u.test(artifact.artifactId) ||
          !Number.isSafeInteger(artifact.byteLength) ||
          artifact.byteLength < 0 ||
          (priorArtifactId !== null &&
            Buffer.compare(Buffer.from(priorArtifactId, "utf8"), Buffer.from(artifact.artifactId, "utf8")) >= 0)
        ) throw new AppendOnlyViolationError();
        assertMediaType(artifact.mediaType);
        assertEncryptedPayload(artifact.encryptedPayload, `${artifact.sessionId}:${artifact.artifactId}:${artifact.mediaType}`);
        let bytes: Buffer;
        try {
          bytes = await decryptPrivateBytes(
            artifact.encryptedPayload,
            `${artifact.sessionId}:${artifact.artifactId}:${artifact.mediaType}`,
            this.keys
          );
        } catch {
          throw new AppendOnlyViolationError();
        }
        if (bytes.byteLength !== artifact.byteLength || artifact.artifactId !== `artifact:${sha256(bytes)}`) {
          throw new AppendOnlyViolationError();
        }
        const storageKey = artifactStorageKey(parsed.session.sessionId, artifact.artifactId);
        if (stagedArtifacts.has(storageKey)) throw new AppendOnlyViolationError();
        stagedArtifacts.set(storageKey, {
          sessionId: parsed.session.sessionId,
          scope: clone(parsed.session),
          mediaType: artifact.mediaType,
          byteLength: artifact.byteLength,
          encrypted: clone(artifact.encryptedPayload)
        });
        priorArtifactId = artifact.artifactId;
      }
      const creation = assertCreationPayload(restoredPayloads[0]);
      const creationKey = parsed.events[0].idempotencyKey;
      if (this.#sessionCreations.has(creationKey)) throw new AppendOnlyViolationError();

      // The complete archive is authenticated and staged before any persistent collection changes.
      this.#sessions.set(parsed.session.sessionId, clone(parsed.session));
      this.#events.set(parsed.session.sessionId, clone(parsed.events));
      this.#progress.set(parsed.session.sessionId, clone(parsed.progress));
      for (const [storageKey, artifact] of stagedArtifacts) this.#artifacts.set(storageKey, artifact);
      for (const [scopedIdempotency, binding] of restoredIdempotency) {
        this.#idempotency.set(scopedIdempotency, binding);
      }
      this.#sessionCreations.set(creationKey, {
        scope: clone(parsed.session),
        transcriptDigest: creation.transcriptDigest,
        result: Promise.resolve(clone(parsed.session))
      });
      return clone(parsed.session);
    });
  }
}
