import crypto from "node:crypto";
import { canonicalize, sha256Bytes, sha256Canonical } from "./canonical-json.mjs";

function publicKeyDer(publicKey) {
  const keyObject = publicKey?.type === "public" ? publicKey : crypto.createPublicKey(publicKey);
  return keyObject.export({ type: "spki", format: "der" });
}

function signingRecord(attestation) {
  return {
    schemaVersion: attestation.schemaVersion,
    purpose: attestation.purpose,
    principalId: attestation.principalId,
    credentialId: attestation.credentialId,
    credentialFingerprint: attestation.credentialFingerprint,
    challengeId: attestation.challengeId,
    nonceHash: attestation.nonceHash,
    issuedAt: attestation.issuedAt,
    expiresAt: attestation.expiresAt,
    payloadHash: attestation.payloadHash
  };
}

export function createEd25519Attestation(payload, options) {
  const {
    privateKey,
    publicKey = crypto.createPublicKey(privateKey),
    purpose,
    principalId,
    credentialId,
    challengeId,
    nonce,
    issuedAt,
    expiresAt
  } = options;
  if (!privateKey || !purpose || !principalId || !credentialId || !challengeId || !nonce || !issuedAt || !expiresAt) {
    throw new TypeError("Attestation requires a key, purpose, principal, credential, challenge, nonce, issue time, and expiry");
  }
  if (!Number.isFinite(Date.parse(issuedAt)) || !Number.isFinite(Date.parse(expiresAt))) {
    throw new TypeError("Attestation timestamps must be valid ISO date-time values");
  }
  if (Date.parse(expiresAt) <= Date.parse(issuedAt)) throw new TypeError("Attestation expiry must follow issuance");
  const der = publicKeyDer(publicKey);
  const attestation = {
    schemaVersion: "0.2",
    algorithm: "Ed25519",
    purpose,
    principalId,
    credentialId,
    credentialFingerprint: sha256Bytes(der),
    publicKeySpkiBase64: der.toString("base64"),
    challengeId,
    nonceHash: sha256Bytes(nonce),
    issuedAt,
    expiresAt,
    payload,
    payloadHash: sha256Canonical(payload),
    signatureBase64: null
  };
  attestation.signatureBase64 = crypto.sign(
    null,
    Buffer.from(canonicalize(signingRecord(attestation)), "utf8"),
    privateKey
  ).toString("base64");
  return attestation;
}

export function verifyAttestation(attestation, options = {}) {
  const { trustedCredentials = [], now = new Date().toISOString(), expectedPurpose } = options;
  if (attestation?.schemaVersion !== "0.2" || attestation?.algorithm !== "Ed25519") {
    throw new Error("Unsupported attestation format or algorithm");
  }
  if (expectedPurpose && attestation.purpose !== expectedPurpose) throw new Error("Attestation purpose mismatch");
  const issuedAtMs = Date.parse(attestation.issuedAt);
  const expiresAtMs = Date.parse(attestation.expiresAt);
  const nowMs = Date.parse(now);
  if (![issuedAtMs, expiresAtMs, nowMs].every(Number.isFinite)) throw new Error("Attestation contains an invalid timestamp");
  if (expiresAtMs <= issuedAtMs) throw new Error("Attestation expiry does not follow issuance");
  if (issuedAtMs > nowMs) throw new Error("Attestation is not yet valid");
  if (expiresAtMs <= nowMs) throw new Error("Attestation expired");
  if (sha256Canonical(attestation.payload) !== attestation.payloadHash) throw new Error("Attestation payload was altered");

  const der = Buffer.from(attestation.publicKeySpkiBase64, "base64");
  if (sha256Bytes(der) !== attestation.credentialFingerprint) throw new Error("Credential fingerprint mismatch");
  const trusted = trustedCredentials.find((credential) =>
    credential.credentialId === attestation.credentialId &&
    credential.principalId === attestation.principalId &&
    credential.fingerprint === attestation.credentialFingerprint &&
    credential.status === "active"
  );
  if (!trusted) throw new Error("Attestation credential is not trusted and active");

  const publicKey = crypto.createPublicKey({ key: der, type: "spki", format: "der" });
  const valid = crypto.verify(
    null,
    Buffer.from(canonicalize(signingRecord(attestation)), "utf8"),
    publicKey,
    Buffer.from(attestation.signatureBase64, "base64")
  );
  if (!valid) throw new Error("Attestation signature is invalid");
  return { valid: true, payloadHash: attestation.payloadHash, principalId: attestation.principalId };
}

export class ChallengeStore {
  #challenges = new Map();

  issue({ challengeId, nonce, expiresAt }) {
    if (!challengeId || !nonce || !Number.isFinite(Date.parse(expiresAt))) {
      throw new TypeError("Challenge requires an ID, nonce, and valid expiry");
    }
    if (this.#challenges.has(challengeId)) throw new Error("Challenge already exists");
    this.#challenges.set(challengeId, { nonceHash: sha256Bytes(nonce), expiresAt, consumedAt: null });
  }

  verify(attestation, now = new Date().toISOString()) {
    const challenge = this.#challenges.get(attestation.challengeId);
    if (!challenge) throw new Error("Challenge is unknown");
    if (challenge.consumedAt) throw new Error("Challenge was already consumed");
    if (Date.parse(challenge.expiresAt) <= Date.parse(now)) throw new Error("Challenge expired");
    if (challenge.nonceHash !== attestation.nonceHash) throw new Error("Challenge nonce mismatch");
    return { consumable: true };
  }

  consume(attestation, now = new Date().toISOString()) {
    this.verify(attestation, now);
    const challenge = this.#challenges.get(attestation.challengeId);
    challenge.consumedAt = now;
    return { consumed: true, consumedAt: now };
  }
}

export function authenticateAttestation(attestation, options) {
  const verified = verifyAttestation(attestation, options);
  const consumed = options.challengeStore.consume(attestation, options.now);
  return { ...verified, ...consumed };
}
