import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
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
  constructor(directory) {
    if (typeof directory !== "string" || directory.length === 0) {
      throw new TypeError("ChallengeStore requires a persistent directory");
    }
    Object.defineProperty(this, "directory", {
      value: path.resolve(directory),
      enumerable: true,
      writable: false,
      configurable: false
    });
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    Object.seal(this);
  }

  #paths(challengeId) {
    const key = sha256Bytes(challengeId);
    return {
      issued: path.join(this.directory, `${key}.challenge.json`),
      consumed: path.join(this.directory, `${key}.consumed.json`)
    };
  }

  #syncDirectory() {
    let descriptor;
    try {
      descriptor = fs.openSync(this.directory, "r");
      fs.fsyncSync(descriptor);
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor);
    }
  }

  #writeOnce(file, value, duplicateMessage) {
    let descriptor;
    try {
      descriptor = fs.openSync(file, "wx", 0o600);
      fs.writeFileSync(descriptor, `${canonicalize(value)}\n`, "utf8");
      fs.fsyncSync(descriptor);
    } catch (error) {
      if (error?.code === "EEXIST") throw new Error(duplicateMessage);
      throw error;
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor);
    }
    this.#syncDirectory();
  }

  #readIssued(challengeId) {
    const { issued } = this.#paths(challengeId);
    let challenge;
    try {
      challenge = JSON.parse(fs.readFileSync(issued, "utf8"));
    } catch (error) {
      if (error?.code === "ENOENT") throw new Error("Challenge is unknown");
      throw error;
    }
    if (challenge?.schemaVersion !== "0.2" || challenge.challengeId !== challengeId ||
        !/^[a-f0-9]{64}$/.test(challenge.nonceHash || "") ||
        !Number.isFinite(Date.parse(challenge.expiresAt))) {
      throw new Error("Persisted challenge record is invalid");
    }
    return challenge;
  }

  issue({ challengeId, nonce, expiresAt }) {
    if (!challengeId || !nonce || !Number.isFinite(Date.parse(expiresAt))) {
      throw new TypeError("Challenge requires an ID, nonce, and valid expiry");
    }
    const { issued } = this.#paths(challengeId);
    this.#writeOnce(issued, {
      schemaVersion: "0.2",
      challengeId,
      nonceHash: sha256Bytes(nonce),
      expiresAt
    }, "Challenge already exists");
  }

  verify(attestation, now = new Date().toISOString()) {
    const nowMs = Date.parse(now);
    if (!Number.isFinite(nowMs)) throw new Error("Challenge verification time is invalid");
    const challenge = this.#readIssued(attestation.challengeId);
    if (fs.existsSync(this.#paths(attestation.challengeId).consumed)) throw new Error("Challenge was already consumed");
    if (Date.parse(challenge.expiresAt) <= nowMs) throw new Error("Challenge expired");
    if (challenge.nonceHash !== attestation.nonceHash) throw new Error("Challenge nonce mismatch");
    return { consumable: true };
  }

  consume(attestation, now = new Date().toISOString()) {
    this.verify(attestation, now);
    const challenge = this.#readIssued(attestation.challengeId);
    const { consumed } = this.#paths(attestation.challengeId);
    this.#writeOnce(consumed, {
      schemaVersion: "0.2",
      challengeId: attestation.challengeId,
      nonceHash: challenge.nonceHash,
      consumedAt: now
    }, "Challenge was already consumed");
    return { consumed: true, consumedAt: now };
  }
}

Object.freeze(ChallengeStore.prototype);

export function authenticateAttestation(attestation, options) {
  if (!(options?.challengeStore instanceof ChallengeStore) ||
      Object.getPrototypeOf(options.challengeStore) !== ChallengeStore.prototype) {
    throw new Error("Authentication requires the process-persistent atomic ChallengeStore");
  }
  const verified = verifyAttestation(attestation, options);
  const consumed = options.challengeStore.consume(attestation, options.now);
  return { ...verified, ...consumed };
}
