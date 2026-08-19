import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import { canonicalize, sha256Canonical } from "../lib/canonical-json.mjs";
import {
  ChallengeStore,
  authenticateAttestation,
  createEd25519Attestation,
  verifyAttestation
} from "../lib/attestation.mjs";

test("canonical JSON is deterministic and rejects ambiguous values", () => {
  const left = { z: [3, { b: true, a: "same" }], a: 1 };
  const right = { a: 1, z: [3, { a: "same", b: true }] };
  assert.equal(canonicalize(left), canonicalize(right));
  assert.equal(sha256Canonical(left), sha256Canonical(right));
  assert.throws(() => canonicalize({ value: Number.NaN }), /non-finite/);
  assert.throws(() => canonicalize({ value: undefined }), /unsupported/);
  assert.throws(() => canonicalize({ value: "\ud800" }), /unpaired high surrogate/);
  const cycle = {};
  cycle.self = cycle;
  assert.throws(() => canonicalize(cycle), /cycles/);
});

function ceremonyFixture(overrides = {}) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const publicDer = publicKey.export({ type: "spki", format: "der" });
  const fingerprint = crypto.createHash("sha256").update(publicDer).digest("hex");
  const payload = {
    ceremonyId: "ceremony_synthetic_001",
    artifact: {
      version: "0.2",
      path: "portfolio/core/constitution/versions/0.2.md",
      byteCount: 1234,
      sha256: "a".repeat(64)
    },
    displayedDecisionSha256: "b".repeat(64)
  };
  const options = {
    privateKey,
    publicKey,
    purpose: "constitution-ratification",
    principalId: "owner:synthetic",
    credentialId: "cred_synthetic_001",
    challengeId: "challenge_synthetic_001",
    nonce: "nonce-that-is-never-persisted",
    issuedAt: "2026-08-18T20:00:00.000Z",
    expiresAt: "2026-08-18T20:05:00.000Z",
    ...overrides
  };
  const trustedCredentials = [{
    credentialId: options.credentialId,
    principalId: options.principalId,
    fingerprint,
    status: "active"
  }];
  return { payload, options, trustedCredentials };
}

test("Ed25519 attestation binds the exact payload and an active trusted credential", () => {
  const fixture = ceremonyFixture();
  const attestation = createEd25519Attestation(fixture.payload, fixture.options);
  const verified = verifyAttestation(attestation, {
    trustedCredentials: fixture.trustedCredentials,
    expectedPurpose: "constitution-ratification",
    now: "2026-08-18T20:01:00.000Z"
  });
  assert.equal(verified.valid, true);

  const altered = structuredClone(attestation);
  altered.payload.artifact.byteCount += 1;
  assert.throws(() => verifyAttestation(altered, {
    trustedCredentials: fixture.trustedCredentials,
    now: "2026-08-18T20:01:00.000Z"
  }), /payload was altered/);

  const forgedSignature = structuredClone(attestation);
  forgedSignature.signatureBase64 = Buffer.alloc(64, 1).toString("base64");
  assert.throws(() => verifyAttestation(forgedSignature, {
    trustedCredentials: fixture.trustedCredentials,
    now: "2026-08-18T20:01:00.000Z"
  }), /signature is invalid/);

  assert.throws(() => verifyAttestation(attestation, {
    trustedCredentials: [],
    now: "2026-08-18T20:01:00.000Z"
  }), /not trusted/);
});

test("expired attestations and consumed challenges fail closed", () => {
  const fixture = ceremonyFixture();
  const attestation = createEd25519Attestation(fixture.payload, fixture.options);
  assert.throws(() => verifyAttestation(attestation, {
    trustedCredentials: fixture.trustedCredentials,
    now: "2026-08-18T20:06:00.000Z"
  }), /expired/);

  const store = new ChallengeStore();
  store.issue({
    challengeId: fixture.options.challengeId,
    nonce: fixture.options.nonce,
    expiresAt: fixture.options.expiresAt
  });
  const authenticated = authenticateAttestation(attestation, {
    trustedCredentials: fixture.trustedCredentials,
    expectedPurpose: "constitution-ratification",
    challengeStore: store,
    now: "2026-08-18T20:01:00.000Z"
  });
  assert.equal(authenticated.consumed, true);
  assert.throws(() => authenticateAttestation(attestation, {
    trustedCredentials: fixture.trustedCredentials,
    expectedPurpose: "constitution-ratification",
    challengeStore: store,
    now: "2026-08-18T20:02:00.000Z"
  }), /already consumed/);
});

test("an unknown key cannot borrow a trusted credential identity", () => {
  const trustedFixture = ceremonyFixture();
  const attackerFixture = ceremonyFixture({
    credentialId: trustedFixture.options.credentialId,
    principalId: trustedFixture.options.principalId
  });
  const forged = createEd25519Attestation(trustedFixture.payload, attackerFixture.options);
  assert.throws(() => verifyAttestation(forged, {
    trustedCredentials: trustedFixture.trustedCredentials,
    now: "2026-08-18T20:01:00.000Z"
  }), /not trusted/);
});
