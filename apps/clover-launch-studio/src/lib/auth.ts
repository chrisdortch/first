import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { PROJECT_ID, readRuntimeConfig, type RuntimeConfig } from "./config";

export class AuthenticationDeniedError extends Error {
  constructor() {
    super("Request denied");
    this.name = "AuthenticationDeniedError";
  }
}

export type VerifiedProviderSession = {
  subject: string;
  issuer: string;
  audience: string;
  expiresAt: string;
};

export type ProviderSessionVerifier = {
  verify(request: Request, expected: { issuer: string; audience: string; now: Date }): Promise<VerifiedProviderSession>;
};

export type OwnerIdentity = {
  providerSubject: string;
  participantId: string;
  projectId: typeof PROJECT_ID;
  authenticationMode: "provider" | "synthetic";
};

type RuntimeRegistry = { providerVerifier?: ProviderSessionVerifier };
const registry = globalThis as typeof globalThis & { __cloverLaunchStudioAuth?: RuntimeRegistry };
const MAX_PROVIDER_SUBJECT_BYTES = 4 * 1024;

export function registerProviderSessionVerifier(verifier: ProviderSessionVerifier) {
  registry.__cloverLaunchStudioAuth = { providerVerifier: verifier };
}

function exactEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function opaqueParticipantId(subject: string): string {
  return `participant:${createHash("sha256").update(`${PROJECT_ID}\0${subject}`, "utf8").digest("hex")}`;
}

function bearer(request: Request): string | null {
  const value = request.headers.get("authorization");
  return value?.startsWith("Bearer ") ? value.slice(7) : null;
}

async function verifySubject(request: Request, config: RuntimeConfig): Promise<{ subject: string; mode: "provider" | "synthetic" }> {
  if (config.authMode === "provider") {
    const verifier = registry.__cloverLaunchStudioAuth?.providerVerifier;
    if (!verifier || !config.providerIssuer || !config.providerAudience) throw new AuthenticationDeniedError();
    const verificationNow = Date.now();
    let session: unknown;
    try {
      session = await verifier.verify(request, {
        issuer: config.providerIssuer,
        audience: config.providerAudience,
        now: new Date(verificationNow)
      });
    } catch {
      throw new AuthenticationDeniedError();
    }
    if (
      !session ||
      typeof session !== "object" ||
      Array.isArray(session)
    ) throw new AuthenticationDeniedError();
    let subject: unknown;
    let issuer: unknown;
    let audience: unknown;
    let expiration: unknown;
    try {
      const record = session as Record<string, unknown>;
      subject = record.subject;
      issuer = record.issuer;
      audience = record.audience;
      expiration = record.expiresAt;
    } catch {
      throw new AuthenticationDeniedError();
    }
    if (
      typeof subject !== "string" ||
      subject.length === 0 ||
      subject.length > MAX_PROVIDER_SUBJECT_BYTES
    ) throw new AuthenticationDeniedError();
    const subjectBytes = Buffer.from(subject, "utf8");
    const expiresAt = Date.parse(typeof expiration === "string" ? expiration : "");
    const validationNow = Date.now();
    if (
      subjectBytes.byteLength > MAX_PROVIDER_SUBJECT_BYTES ||
      subjectBytes.toString("utf8") !== subject ||
      issuer !== config.providerIssuer ||
      audience !== config.providerAudience ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= validationNow
    ) throw new AuthenticationDeniedError();
    return { subject, mode: "provider" };
  }

  const token = bearer(request);
  if (!token || !config.syntheticBearerToken || !config.syntheticOwnerSubject) throw new AuthenticationDeniedError();
  if (!exactEqual(token, config.syntheticBearerToken)) throw new AuthenticationDeniedError();
  return { subject: config.syntheticOwnerSubject, mode: "synthetic" };
}

function verifyMutationBoundary(request: Request, config: RuntimeConfig, subject: string) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== config.canonicalOrigin) throw new AuthenticationDeniedError();
  const expected = createHmac("sha256", config.csrfSecret).update(subject, "utf8").digest("hex");
  const supplied = request.headers.get("x-clover-csrf");
  if (!supplied || !exactEqual(supplied, expected)) throw new AuthenticationDeniedError();
}

export async function authenticateOwner(request: Request, options: { mutation: boolean }): Promise<OwnerIdentity> {
  const config = readRuntimeConfig();
  const verified = await verifySubject(request, config);
  if (options.mutation) verifyMutationBoundary(request, config, verified.subject);
  return {
    providerSubject: verified.subject,
    participantId: opaqueParticipantId(verified.subject),
    projectId: PROJECT_ID,
    authenticationMode: verified.mode
  };
}
