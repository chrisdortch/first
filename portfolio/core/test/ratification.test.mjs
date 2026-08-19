import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { ChallengeStore, createEd25519Attestation } from "../lib/attestation.mjs";
import { sha256Bytes, sha256Canonical } from "../lib/canonical-json.mjs";
import {
  assembleRatificationEvidence,
  createRatificationPayload,
  inspectRatificationEvidence,
  ratificationPurpose,
  verifyRatificationEvidence
} from "../lib/ratification.mjs";

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(TEST_DIRECTORY, "../../..");
const ARTIFACT_PATH = "portfolio/core/constitution/versions/0.2.md";
const ISSUED_AT = "2026-08-18T22:00:00-05:00";
const EXPIRES_AT = "2026-08-18T22:10:00-05:00";
const NOW = "2026-08-18T22:05:00-05:00";

function fixture() {
  const artifactBytes = fs.readFileSync(path.join(REPOSITORY_ROOT, ARTIFACT_PATH));
  const payload = createRatificationPayload({
    ceremonyId: "ceremony_synthetic_ratification_001",
    version: "0.2",
    artifactPath: ARTIFACT_PATH,
    artifactBytes,
    displayedDecision: "Synthetic test only: ratify the exact displayed Constitution 0.2 artifact.",
    validationReceipt: {
      documentType: "clover-constitution-validation-receipt",
      schemaVersion: "0.2",
      result: "passed",
      policyValidation: "passed",
      artifactSha256: sha256Bytes(artifactBytes),
      validatorId: "synthetic-constitution-validator",
      validatedAt: "2026-08-18T21:59:59-05:00",
      authorityGranted: []
    }
  });
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const attestation = createEd25519Attestation(payload, {
    privateKey,
    publicKey,
    purpose: ratificationPurpose,
    principalId: "owner:synthetic-test",
    credentialId: "credential:synthetic-test",
    challengeId: "challenge:synthetic-ratification-001",
    nonce: "synthetic-ratification-challenge-nonce",
    issuedAt: ISSUED_AT,
    expiresAt: EXPIRES_AT
  });
  const trustedCredentials = [{
    credentialId: attestation.credentialId,
    principalId: attestation.principalId,
    fingerprint: attestation.credentialFingerprint,
    status: "active",
    roles: ["constitution-ratifier"],
    assurance: "phishing-resistant-owner-authentication"
  }];
  const challengeStore = new ChallengeStore();
  challengeStore.issue({
    challengeId: attestation.challengeId,
    nonce: "synthetic-ratification-challenge-nonce",
    expiresAt: EXPIRES_AT
  });
  const evidence = assembleRatificationEvidence(payload, attestation);
  const lifecycle = JSON.parse(fs.readFileSync(
    path.join(REPOSITORY_ROOT, "portfolio/core/constitution/LIFECYCLE_CANDIDATE_V0.2.json"),
    "utf8"
  ));
  const trustRegistry = {
    documentType: "clover-ratifier-trust-registry-candidate",
    schemaVersion: "0.2",
    status: "configured-active",
    principalBindings: [{
      principalId: attestation.principalId,
      role: "constitution-ratifier",
      bindingStatus: "active"
    }],
    trustedCredentials,
    minimumAssuranceForRatification: "phishing-resistant-owner-authentication",
    activationRule: "Synthetic test registry is active only for this challenge-bound ceremony.",
    privateKeyPolicy: "Synthetic private key exists only in this ephemeral test process.",
    authorityGrantedByCandidate: []
  };
  return { evidence, trustedCredentials, challengeStore, lifecycle, trustRegistry };
}

function activationOptions(value) {
  return {
    repositoryRoot: REPOSITORY_ROOT,
    lifecycle: value.lifecycle,
    trustRegistry: value.trustRegistry,
    expectedLifecycleHash: sha256Canonical(value.lifecycle),
    expectedTrustRegistryHash: sha256Canonical(value.trustRegistry),
    challengeStore: value.challengeStore,
    now: NOW
  };
}

test("ratification verification binds artifact bytes, displayed decision, trusted key, and one-time challenge", () => {
  const value = fixture();
  const verified = verifyRatificationEvidence(value.evidence, activationOptions(value));
  assert.equal(verified.valid, true);
  assert.equal(verified.version, "0.2");
  assert.equal(verified.challenge.consumed, true);
  assert.throws(() => verifyRatificationEvidence(value.evidence, activationOptions(value)), /already consumed/);
});

test("altered artifact or decision and an untrusted credential fail closed", () => {
  const artifact = fixture();
  const wrongArtifact = structuredClone(artifact.evidence);
  wrongArtifact.artifact.sha256 = "0".repeat(64);
  assert.throws(() => inspectRatificationEvidence(wrongArtifact, {
    repositoryRoot: REPOSITORY_ROOT,
    trustedCredentials: artifact.trustedCredentials,
    challengeStore: artifact.challengeStore,
    now: NOW
  }), /artifact hash mismatch/);

  const decision = fixture();
  const alteredDecision = structuredClone(decision.evidence);
  alteredDecision.displayedDecision.statement += " altered";
  assert.throws(() => inspectRatificationEvidence(alteredDecision, {
    repositoryRoot: REPOSITORY_ROOT,
    trustedCredentials: decision.trustedCredentials,
    challengeStore: decision.challengeStore,
    now: NOW
  }), /decision was altered/);

  const untrusted = fixture();
  assert.throws(() => inspectRatificationEvidence(untrusted.evidence, {
    repositoryRoot: REPOSITORY_ROOT,
    trustedCredentials: [],
    challengeStore: untrusted.challengeStore,
    now: NOW
  }), /not enrolled|not trusted/);
});

test("the public draft cannot activate because its ratifier trust registry is empty", () => {
  const value = fixture();
  const registry = JSON.parse(fs.readFileSync(
    path.join(REPOSITORY_ROOT, "portfolio/core/constitution/RATIFIER_TRUST_CANDIDATE_V0.2.json"),
    "utf8"
  ));
  assert.equal(registry.trustedCredentials.length, 0);
  value.trustRegistry = registry;
  assert.throws(() => verifyRatificationEvidence(value.evidence, {
    ...activationOptions(value)
  }), /not configured|not enrolled|not trusted/);
});

test("activation rejects schema-invalid, authority-bearing, or unbound registries", () => {
  const authorityBearing = fixture();
  authorityBearing.trustRegistry.authorityGrantedByCandidate = ["production"];
  assert.throws(
    () => verifyRatificationEvidence(authorityBearing.evidence, activationOptions(authorityBearing)),
    /Schema violation|authority-neutral/
  );

  const unbound = fixture();
  const expectedTrustRegistryHash = sha256Canonical(unbound.trustRegistry);
  unbound.trustRegistry.activationRule += " altered";
  assert.throws(
    () => verifyRatificationEvidence(unbound.evidence, {
      ...activationOptions(unbound),
      expectedTrustRegistryHash
    }),
    /trusted canonical registry hash/
  );

  const malformedLifecycle = fixture();
  malformedLifecycle.lifecycle.currentVersion = "0.2";
  assert.throws(
    () => verifyRatificationEvidence(malformedLifecycle.evidence, activationOptions(malformedLifecycle)),
    /inconsistent current version/
  );
});

test("validation receipt and exact evidence shape are signed and fail closed", () => {
  const receiptMutation = fixture();
  receiptMutation.evidence.validationReceipt.policyValidation = "attacker-replaced";
  receiptMutation.evidence.validationReceipt.authorityGranted = ["production"];
  assert.throws(
    () => verifyRatificationEvidence(receiptMutation.evidence, activationOptions(receiptMutation)),
    /Schema violation|validation receipt|payload mismatch/
  );

  const extraField = fixture();
  extraField.evidence.unsignedAttackerField = true;
  assert.throws(
    () => inspectRatificationEvidence(extraField.evidence, {
      repositoryRoot: REPOSITORY_ROOT,
      trustedCredentials: extraField.trustedCredentials,
      challengeStore: extraField.challengeStore,
      now: NOW
    }),
    /Schema violation/
  );
});
