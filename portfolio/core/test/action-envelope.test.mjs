import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { ChallengeStore, createEd25519Attestation } from "../lib/attestation.mjs";
import { sha256Canonical } from "../lib/canonical-json.mjs";
import {
  ActionExecutionError,
  ActionReplayError,
  ClosedHandlerRegistry,
  ClosedVerifierRegistry,
  LocalActionStateStore,
  actionApprovalPayload,
  createActionReceipt,
  createActionEnvelope,
  executeActionEnvelope,
  validateActionEnvelope,
  withActionApproval
} from "../lib/action-envelope.mjs";
import { validateJsonSchema } from "../lib/validators.mjs";

const CREATED_AT = "2026-08-18T17:00:00.000Z";
const NOW = "2026-08-18T17:05:00.000Z";
const EXPIRES_AT = "2026-08-18T17:10:00.000Z";
const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIRECTORY = path.resolve(TEST_DIRECTORY, "../schemas");

function readSchema(name) {
  return JSON.parse(fs.readFileSync(path.join(SCHEMA_DIRECTORY, name), "utf8"));
}

function policy(overrides = {}) {
  return {
    policyId: "policy.synthetic-preview",
    policyVersion: "v1",
    allowedOperations: ["write-synthetic-record"],
    deniedOperations: ["deploy-production", "reveal-secret"],
    allowedEnvironments: ["synthetic", "preview"],
    productionAllowed: false,
    allowedDataClasses: ["public-synthetic"],
    maxCostUsd: 0,
    purchaseApprovalRequiredAboveUsd: 0,
    rollbackRequired: false,
    authenticatedApprovalRequired: false,
    requiredStopConditions: ["target-version-changed", "readback-not-confirmed"],
    ...overrides
  };
}

function envelope(overrides = {}) {
  return createActionEnvelope({
    envelopeId: "act_synthetic_0001",
    requestId: "request-synthetic-0001",
    intent: "Write one synthetic record and verify exact readback.",
    createdAt: CREATED_AT,
    expiresAt: EXPIRES_AT,
    nonce: "one-time-nonce-0001",
    accountId: "acct_test_01",
    projectId: "project_test_01",
    environment: "preview",
    target: {
      resourceType: "synthetic-document",
      nativeResourceId: "doc_native_0001",
      expectedVersion: "sha256-version-0001"
    },
    operation: "write-synthetic-record",
    handlerId: "synthetic.write",
    tool: { toolId: "synthetic-store", toolVersion: "1.0.0" },
    verifierId: "synthetic.authoritative-readback",
    verificationTool: { toolId: "synthetic-readback", toolVersion: "1.0.0" },
    readbackSource: {
      systemId: "synthetic-authoritative-store",
      nativeResourceId: "doc_native_0001"
    },
    expectedPostcondition: { applied: true, version: "v2" },
    parameters: { recordId: "record-1", value: "synthetic" },
    dataClasses: ["public-synthetic"],
    cost: { currency: "USD", maxUsd: 0, purchaseApproved: false },
    rollback: { required: false, strategyId: null, rollbackAnchor: null },
    stopConditions: ["target-version-changed", "readback-not-confirmed"],
    policy: policy(),
    approvalRequired: false,
    ...overrides
  });
}

function registry(handlers = {}) {
  return new ClosedHandlerRegistry({
    "synthetic.write": {
      toolId: "synthetic-store",
      toolVersion: "1.0.0",
      execute: async () => ({ applied: true }),
      compensate: null,
      ...handlers
    }
  });
}

function verifierRegistry(overrides = {}) {
  return new ClosedVerifierRegistry({
    "synthetic.authoritative-readback": {
      toolId: "synthetic-readback",
      toolVersion: "1.0.0",
      sourceSystemId: "synthetic-authoritative-store",
      verify: async ({ phase }) => phase === "before-execute"
        ? {
            sourceSystemId: "synthetic-authoritative-store",
            nativeResourceId: "doc_native_0001",
            observedVersion: "sha256-version-0001",
            postcondition: { exists: true, version: "sha256-version-0001" }
          }
        : {
            sourceSystemId: "synthetic-authoritative-store",
            nativeResourceId: "doc_native_0001",
            observedVersion: "v2",
            postcondition: { applied: true, version: "v2" }
          },
      ...overrides
    }
  });
}

function validationOptions(action, extra = {}) {
  return {
    now: NOW,
    maxAgeMs: 10 * 60 * 1000,
    expectedContext: {
      accountId: "acct_test_01",
      projectId: "project_test_01",
      environment: "preview"
    },
    currentTarget: {
      resourceType: "synthetic-document",
      nativeResourceId: "doc_native_0001",
      version: "sha256-version-0001"
    },
    trustedPolicy: policy(),
    registry: registry(),
    verifierRegistry: verifierRegistry(),
    ...extra
  };
}

test("authority binds exact parameters, identities, target version, handler/tool, and trusted policy", () => {
  const action = envelope();
  const result = validateActionEnvelope(action, validationOptions(action));
  assert.equal(result.valid, true);

  const parameterSubstitution = JSON.parse(JSON.stringify(action));
  parameterSubstitution.parameters.value = "substituted";
  assert.throws(
    () => validateActionEnvelope(parameterSubstitution, validationOptions(action)),
    /Parameters were substituted/
  );

  assert.throws(
    () => validateActionEnvelope(action, validationOptions(action, {
      expectedContext: {
        accountId: "acct_test_01",
        projectId: "lookalike-project-alias",
        environment: "preview"
      }
    })),
    (error) => error.code === "ACTION_TARGET_SUBSTITUTION" && /projectId/.test(error.message)
  );

  assert.throws(
    () => validateActionEnvelope(action, validationOptions(action, {
      currentTarget: {
        resourceType: "synthetic-document",
        nativeResourceId: "doc_native_0001",
        version: "changed-version"
      }
    })),
    (error) => error.code === "ACTION_STALE_TARGET"
  );

  assert.throws(
    () => validateActionEnvelope(action, validationOptions(action, {
      trustedPolicy: policy({ maxCostUsd: 1 })
    })),
    (error) => error.code === "ACTION_TARGET_SUBSTITUTION" && /policyHash/.test(error.message)
  );

  const wrongTool = envelope({ tool: { toolId: "synthetic-store", toolVersion: "2.0.0" } });
  assert.throws(
    () => validateActionEnvelope(wrongTool, validationOptions(wrongTool)),
    (error) => error.code === "ACTION_TOOL_SUBSTITUTION"
  );

  const wrongVerifier = envelope({
    verificationTool: { toolId: "synthetic-readback", toolVersion: "2.0.0" }
  });
  assert.throws(
    () => validateActionEnvelope(wrongVerifier, validationOptions(wrongVerifier)),
    (error) => error.code === "ACTION_VERIFIER_SUBSTITUTION"
  );
});

test("expiry and age are separate fail-closed stale checks", () => {
  const action = envelope();
  assert.throws(
    () => validateActionEnvelope(action, validationOptions(action, { now: EXPIRES_AT })),
    (error) => error.code === "ACTION_EXPIRED"
  );
  assert.throws(
    () => validateActionEnvelope(action, validationOptions(action, {
      now: "2026-08-18T17:06:00.000Z",
      maxAgeMs: 5 * 60 * 1000
    })),
    (error) => error.code === "ACTION_STALE"
  );
});

test("deny overrides allow and production needs policy plus explicit runtime authority", () => {
  const conflictedPolicy = policy({
    deniedOperations: ["write-synthetic-record", "deploy-production"]
  });
  assert.throws(
    () => envelope({ policy: conflictedPolicy }),
    (error) => error.code === "ACTION_POLICY_CONFLICT" && /deny takes precedence/.test(error.message)
  );

  const productionPolicy = policy({ allowedEnvironments: ["production"], productionAllowed: true });
  const production = envelope({ environment: "production", policy: productionPolicy });
  assert.throws(
    () => validateActionEnvelope(production, validationOptions(production, {
      expectedContext: {
        accountId: "acct_test_01",
        projectId: "project_test_01",
        environment: "production"
      },
      trustedPolicy: productionPolicy
    })),
    (error) => error.code === "ACTION_POLICY_DENIED" && /Production/.test(error.message)
  );
});

test("closed handler registry accepts functions only and has no string/shell dispatch", () => {
  assert.throws(
    () => new ClosedHandlerRegistry({
      "synthetic.write": {
        toolId: "synthetic-store",
        toolVersion: "1.0.0",
        execute: "sh -c anything",
        compensate: null
      }
    }),
    (error) => error.code === "ACTION_HANDLER_INVALID"
  );
  const closed = registry();
  assert.equal("register" in closed, false);
  assert.throws(
    () => closed.resolve("synthetic.unknown", { toolId: "synthetic-store", toolVersion: "1.0.0" }),
    (error) => error.code === "ACTION_HANDLER_UNKNOWN"
  );
  assert.throws(() => new ClosedVerifierRegistry({
    "synthetic.authoritative-readback": {
      toolId: "synthetic-readback",
      toolVersion: "1.0.0",
      sourceSystemId: "synthetic-authoritative-store",
      verify: "trust me"
    }
  }), (error) => error.code === "ACTION_VERIFIER_INVALID");
});

test("Ed25519 approval is trusted and bound to the exact authority hash and nonce", (t) => {
  const unsigned = envelope({ approvalRequired: true });
  const trustedKeys = crypto.generateKeyPairSync("ed25519");
  const attestation = createEd25519Attestation(actionApprovalPayload(unsigned), {
    privateKey: trustedKeys.privateKey,
    purpose: "clover-action-envelope-approval",
    principalId: "principal_owner_01",
    credentialId: "credential_owner_01",
    challengeId: "challenge_action_01",
    nonce: "approval-challenge-nonce",
    issuedAt: CREATED_AT,
    expiresAt: EXPIRES_AT
  });
  const signed = withActionApproval(unsigned, attestation);
  const challengeDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "clover-action-challenge-"));
  t.after(() => fs.rmSync(challengeDirectory, { recursive: true, force: true }));
  const challengeStore = new ChallengeStore(challengeDirectory);
  challengeStore.issue({
    challengeId: attestation.challengeId,
    nonce: "approval-challenge-nonce",
    expiresAt: EXPIRES_AT
  });
  const trustedCredentials = [{
    credentialId: attestation.credentialId,
    principalId: attestation.principalId,
    fingerprint: attestation.credentialFingerprint,
    status: "active",
    roles: ["action-approver"],
    assurance: "phishing-resistant-owner-authentication",
    accountIds: ["acct_test_01"],
    projectIds: ["project_test_01"],
    environments: ["preview"]
  }];
  assert.equal(
    validateActionEnvelope(signed, validationOptions(signed, { trustedCredentials, challengeStore })).valid,
    true
  );
  const wrongScope = structuredClone(trustedCredentials);
  wrongScope[0].projectIds = ["different-project"];
  assert.throws(
    () => validateActionEnvelope(signed, validationOptions(signed, {
      trustedCredentials: wrongScope,
      challengeStore
    })),
    (error) => error.code === "ACTION_APPROVER_SCOPE_DENIED"
  );
  const missingRole = structuredClone(trustedCredentials);
  missingRole[0].roles = ["viewer"];
  assert.throws(
    () => validateActionEnvelope(signed, validationOptions(signed, {
      trustedCredentials: missingRole,
      challengeStore
    })),
    (error) => error.code === "ACTION_APPROVER_SCOPE_DENIED"
  );

  const forged = JSON.parse(JSON.stringify(signed));
  forged.approval.payload.authorityHash = "0".repeat(64);
  assert.throws(
    () => validateActionEnvelope(forged, validationOptions(forged, { trustedCredentials, challengeStore })),
    /Attestation payload was altered/
  );

  const attackerKeys = crypto.generateKeyPairSync("ed25519");
  const attackerAttestation = createEd25519Attestation(actionApprovalPayload(unsigned), {
    privateKey: attackerKeys.privateKey,
    purpose: "clover-action-envelope-approval",
    principalId: "principal_owner_01",
    credentialId: "credential_owner_01",
    challengeId: "challenge_action_02",
    nonce: "attacker-nonce",
    issuedAt: CREATED_AT,
    expiresAt: EXPIRES_AT
  });
  const attackerSigned = withActionApproval(unsigned, attackerAttestation);
  assert.throws(
    () => validateActionEnvelope(attackerSigned, validationOptions(attackerSigned, { trustedCredentials, challengeStore })),
    /not trusted and active/
  );
  assert.throws(
    () => validateActionEnvelope(signed, validationOptions(signed, { trustedCredentials })),
    (error) => error.code === "ACTION_APPROVAL_CHALLENGE_REQUIRED"
  );
  assert.throws(
    () => validateActionEnvelope(signed, validationOptions(signed, {
      trustedCredentials,
      challengeStore: {
        verify() { return { consumable: true }; },
        consume() { return { consumed: true }; }
      }
    })),
    (error) => error.code === "ACTION_APPROVAL_CHALLENGE_REQUIRED"
  );
});

test("cost, data class, rollback, stop conditions, and intent are authority-bound", () => {
  const action = envelope();
  for (const mutation of [
    (copy) => { copy.intent = "Different intent"; },
    (copy) => {
      copy.cost = { currency: "USD", maxUsd: 50, purchaseApproved: true };
      copy.approvalRequired = true;
    },
    (copy) => { copy.dataClasses = ["secret"]; },
    (copy) => { copy.stopConditions = ["target-version-changed"]; },
    (copy) => { copy.rollback = { required: true, strategyId: "different", rollbackAnchor: "v0" }; },
    (copy) => { copy.expectedPostcondition = { applied: false, version: "v2" }; }
  ]) {
    const copy = JSON.parse(JSON.stringify(action));
    mutation(copy);
    assert.throws(() => validateActionEnvelope(copy, validationOptions(copy)), /substituted|altered|binding/i);
  }

  const rollbackRequired = envelope({
    rollback: { required: true, strategyId: "restore-version", rollbackAnchor: "sha256-version-0001" }
  });
  assert.throws(
    () => validateActionEnvelope(rollbackRequired, validationOptions(rollbackRequired)),
    (error) => error.code === "ACTION_ROLLBACK_UNAVAILABLE"
  );
});

test("atomic reservation spends authority before side effect and concurrent replay calls one handler", async () => {
  const action = envelope({ envelopeId: "act_concurrent_0001" });
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "clover-action-concurrency-"));
  const stateStore = new LocalActionStateStore(temporaryDirectory);
  let executeCalls = 0;
  const closed = registry({
    execute: async () => {
      executeCalls += 1;
      const inFlight = stateStore.read(action.envelopeId);
      assert.equal(inFlight.phase, "executing");
      assert.equal(inFlight.handlerCalls, 1);
      assert.equal(inFlight.authoritySpentAt, NOW);
      await new Promise((resolve) => setTimeout(resolve, 25));
      return { applied: true };
    }
  });
  const options = {
    ...validationOptions(action, { registry: closed }),
    stateStore,
    clock: () => NOW
  };

  try {
    const attempts = await Promise.allSettled(
      Array.from({ length: 16 }, () => executeActionEnvelope(action, options))
    );
    const successes = attempts.filter((attempt) => attempt.status === "fulfilled");
    const replays = attempts.filter((attempt) =>
      attempt.status === "rejected" && attempt.reason instanceof ActionReplayError
    );
    assert.equal(successes.length, 1);
    assert.equal(replays.length, 15);
    assert.equal(executeCalls, 1);
    const state = stateStore.read(action.envelopeId);
    assert.equal(state.phase, "succeeded");
    assert.equal(state.terminal, true);
    assert.equal(state.handlerCalls, 1);
    assert.equal(state.readbackCalls, 2);
    assert.equal(state.preflightReadback.observedVersion, action.target.expectedVersion);
    assert.equal(state.effect, "applied-confirmed");
    assert.equal(state.executionMode, "verified-precondition-write");
    assert.match(state.handlerResult.evidenceHash, /^[a-f0-9]{64}$/);
    const receipt = createActionReceipt(action, stateStore);
    assert.equal(receipt.phase, "succeeded");
    assert.equal(receipt.verification.verifierId, "synthetic.authoritative-readback");
    assert.equal(receipt.stateHash, sha256Canonical(receipt.terminalState));
    assert.equal(receipt.historyLength, stateStore.history(action.envelopeId).length);
    assert.match(receipt.historyHash, /^[a-f0-9]{64}$/);
    assert.match(receipt.receiptHash, /^[a-f0-9]{64}$/);
    const reopened = new LocalActionStateStore(temporaryDirectory);
    assert.deepEqual(createActionReceipt(action, reopened), receipt);
    validateJsonSchema(readSchema("action-envelope-state.v0.2.schema.json"), state, {
      schemaDirectory: SCHEMA_DIRECTORY,
      label: "executed-action-state"
    });
    validateJsonSchema(readSchema("action-receipt.v0.2.schema.json"), receipt, {
      schemaDirectory: SCHEMA_DIRECTORY,
      label: "action-receipt"
    });
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test("execution snapshots authority before asynchronous side effects", async () => {
  const mutable = JSON.parse(JSON.stringify(envelope({ envelopeId: "act_snapshot_0001" })));
  const originalExpectedVersion = mutable.target.expectedVersion;
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "clover-action-snapshot-"));
  const stateStore = new LocalActionStateStore(temporaryDirectory);
  let releaseHandler;
  let announceHandler;
  const handlerEntered = new Promise((resolve) => { announceHandler = resolve; });
  const handlerRelease = new Promise((resolve) => { releaseHandler = resolve; });
  const closed = registry({
    execute: async ({ target }) => {
      assert.equal(target.expectedVersion, originalExpectedVersion);
      announceHandler();
      await handlerRelease;
      return { applied: true };
    }
  });
  const execution = executeActionEnvelope(mutable, {
    ...validationOptions(mutable, { registry: closed }),
    stateStore,
    clock: () => NOW
  });

  try {
    await handlerEntered;
    mutable.target.expectedVersion = "attacker-substituted-version";
    releaseHandler();
    const result = await execution;
    assert.equal(result.receipt.target.expectedVersion, originalExpectedVersion);
    assert.equal(result.state.authorityHash, result.receipt.authorityHash);
    assert.throws(
      () => createActionReceipt(mutable, stateStore),
      /Authority binding was altered/
    );
  } finally {
    releaseHandler?.();
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test("schemas reject impossible compensation evidence and contradictory receipt outcomes", async (t) => {
  const action = envelope({ envelopeId: "act_schema_outcome_0001" });
  const impossibleCompensationFailure = {
    schemaVersion: "0.2",
    envelopeId: action.envelopeId,
    authorityHash: action.authorityHash,
    phase: "compensation-failed",
    terminal: true,
    reservedAt: NOW,
    authoritySpentAt: NOW,
    sideEffectStartedAt: NOW,
    sideEffectFinishedAt: NOW,
    completedAt: NOW,
    handlerCalls: 1,
    readbackCalls: 1,
    compensationCalls: 0,
    effect: "unknown-or-partial",
    executionMode: "verified-precondition-write",
    handlerResult: null,
    preflightReadback: { label: "preflight", evidenceHash: "a".repeat(64) },
    readback: null,
    compensation: null,
    error: { name: "Error", message: "compensation was never attempted" }
  };
  assert.throws(
    () => validateJsonSchema(readSchema("action-envelope-state.v0.2.schema.json"), impossibleCompensationFailure, {
      schemaDirectory: SCHEMA_DIRECTORY,
      label: "impossible-compensation-failure"
    }),
    /compensationCalls|compensation/i
  );

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "clover-action-schema-outcome-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const result = await executeActionEnvelope(action, {
    ...validationOptions(action),
    stateStore: new LocalActionStateStore(directory),
    clock: () => NOW
  });
  const contradictoryReceipt = structuredClone(result.receipt);
  contradictoryReceipt.phase = "rolled-back";
  contradictoryReceipt.effect = "rolled-back-confirmed";
  assert.equal(contradictoryReceipt.terminalState.phase, "succeeded");
  assert.throws(
    () => validateJsonSchema(readSchema("action-receipt.v0.2.schema.json"), contradictoryReceipt, {
      schemaDirectory: SCHEMA_DIRECTORY,
      label: "contradictory-action-receipt"
    }),
    /terminalState|phase|const/i
  );
});

test("partial failure compensates and records verified rollback as the precise terminal state", async () => {
  const action = envelope({ envelopeId: "act_rollback_0001" });
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "clover-action-rollback-"));
  const stateStore = new LocalActionStateStore(temporaryDirectory);
  let applied = false;
  const closed = registry({
    execute: async () => {
      applied = true;
      throw new Error("synthetic failure after a partial write");
    },
    compensate: async () => {
      applied = false;
      return { restored: true };
    }
  });
  const verifiers = verifierRegistry({
    verify: async ({ phase }) => phase === "before-execute"
      ? {
          sourceSystemId: "synthetic-authoritative-store",
          nativeResourceId: "doc_native_0001",
          observedVersion: "sha256-version-0001",
          postcondition: { exists: true, version: "sha256-version-0001" }
        }
      : phase === "after-compensation" && applied === false
        ? {
          sourceSystemId: "synthetic-authoritative-store",
          nativeResourceId: "doc_native_0001",
          observedVersion: "sha256-version-0001",
          postcondition: { rolledBack: true, version: "sha256-version-0001" }
        }
        : {
          sourceSystemId: "synthetic-authoritative-store",
          nativeResourceId: "doc_native_0001",
          observedVersion: "unknown",
          postcondition: { rolledBack: false }
        }
  });

  try {
    await assert.rejects(
      executeActionEnvelope(action, {
        ...validationOptions(action, { registry: closed, verifierRegistry: verifiers }),
        stateStore,
        clock: () => NOW
      }),
      (error) => error instanceof ActionExecutionError && error.state.phase === "rolled-back" && /^[a-f0-9]{64}$/.test(error.receipt.receiptHash)
    );
    const state = stateStore.read(action.envelopeId);
    assert.equal(applied, false);
    assert.equal(state.phase, "rolled-back");
    assert.equal(state.terminal, true);
    assert.equal(state.effect, "rolled-back-confirmed");
    assert.equal(state.handlerCalls, 1);
    assert.equal(state.compensationCalls, 1);
    assert.equal(state.readbackCalls, 2);
    assert.match(state.error.message, /partial write/);
    assert.match(state.compensation.evidenceHash, /^[a-f0-9]{64}$/);
    assert.match(state.readback.evidenceHash, /^[a-f0-9]{64}$/);
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test("compensation after a failed post-write readback records the third authoritative readback", async (t) => {
  const action = envelope({ envelopeId: "act_post_readback_rollback_0001" });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "clover-action-post-readback-rollback-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const stateStore = new LocalActionStateStore(directory);
  let applied = false;
  const closed = registry({
    execute: async () => { applied = true; return { applied: true }; },
    compensate: async () => { applied = false; return { restored: true }; }
  });
  const verifiers = verifierRegistry({
    verify: async ({ phase }) => {
      if (phase === "before-execute") {
        return {
          sourceSystemId: "synthetic-authoritative-store",
          nativeResourceId: "doc_native_0001",
          observedVersion: "sha256-version-0001",
          postcondition: { exists: true, version: "sha256-version-0001" }
        };
      }
      if (phase === "after-compensation" && applied === false) {
        return {
          sourceSystemId: "synthetic-authoritative-store",
          nativeResourceId: "doc_native_0001",
          observedVersion: "sha256-version-0001",
          postcondition: { rolledBack: true, version: "sha256-version-0001" }
        };
      }
      return {
        sourceSystemId: "synthetic-authoritative-store",
        nativeResourceId: "doc_native_0001",
        observedVersion: "unexpected-version",
        postcondition: { applied: false, version: "unexpected-version" }
      };
    }
  });

  await assert.rejects(
    executeActionEnvelope(action, {
      ...validationOptions(action, { registry: closed, verifierRegistry: verifiers }),
      stateStore,
      clock: () => NOW
    }),
    (error) => error instanceof ActionExecutionError &&
      error.state.phase === "rolled-back" &&
      error.state.readbackCalls === 3
  );
  assert.equal(applied, false);
  const state = stateStore.read(action.envelopeId);
  assert.equal(state.effect, "rolled-back-confirmed");
  assert.equal(state.readbackCalls, 3);
  validateJsonSchema(readSchema("action-envelope-state.v0.2.schema.json"), state, {
    schemaDirectory: SCHEMA_DIRECTORY,
    label: "post-readback-rollback-state"
  });
});

test("uncompensated readback failure is terminal and cannot be replayed", async () => {
  const action = envelope({ envelopeId: "act_unverified_0001" });
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "clover-action-unverified-"));
  const stateStore = new LocalActionStateStore(temporaryDirectory);
  const closed = registry();
  const verifiers = verifierRegistry({
    verify: async ({ phase }) => phase === "before-execute"
      ? {
          sourceSystemId: "synthetic-authoritative-store",
          nativeResourceId: "doc_native_0001",
          observedVersion: "sha256-version-0001",
          postcondition: { exists: true, version: "sha256-version-0001" }
        }
      : {
          sourceSystemId: "synthetic-authoritative-store",
          nativeResourceId: "doc_native_0001",
          observedVersion: "unexpected-version",
          postcondition: { applied: false, version: "unexpected-version" }
        }
  });
  const options = {
    ...validationOptions(action, { registry: closed, verifierRegistry: verifiers }),
    stateStore,
    clock: () => NOW
  };
  try {
    await assert.rejects(
      executeActionEnvelope(action, options),
      (error) => error instanceof ActionExecutionError && error.state.phase === "partial-failure-uncompensated"
    );
    assert.equal(stateStore.read(action.envelopeId).terminal, true);
    await assert.rejects(
      executeActionEnvelope(action, options),
      (error) => error instanceof ActionReplayError
    );
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

test("policy digest is deterministic and not inferred from an envelope's own claim", () => {
  const action = envelope();
  assert.equal(action.policyHash, sha256Canonical(policy()));
  const noTrustedPolicy = validationOptions(action);
  delete noTrustedPolicy.trustedPolicy;
  assert.throws(
    () => validateActionEnvelope(action, noTrustedPolicy),
    /externally loaded trusted policy is required/i
  );
});

test("a non-zero cost ceiling fails closed without explicit purchase approval", () => {
  assert.throws(
    () => envelope({ cost: { currency: "USD", maxUsd: 1, purchaseApproved: false } }),
    (error) => error.code === "ACTION_COST_NOT_APPROVED"
  );
  assert.throws(
    () => envelope({ cost: { currency: "USD", maxUsd: 1, purchaseApproved: true } }),
    (error) => error.code === "ACTION_APPROVAL_REQUIRED"
  );
  assert.throws(
    () => envelope({ stopConditions: ["target-version-changed", "unknown-condition"] }),
    (error) => error.code === "ACTION_STOP_CONDITION_UNSUPPORTED"
  );
});

test("caller-constructed success cannot produce an Action Receipt", async () => {
  const action = envelope({ envelopeId: "act_forged_success_0001" });
  const forged = {
    schemaVersion: "0.2",
    envelopeId: action.envelopeId,
    authorityHash: action.authorityHash,
    phase: "succeeded",
    terminal: true,
    reservedAt: NOW,
    authoritySpentAt: NOW,
    sideEffectStartedAt: NOW,
    sideEffectFinishedAt: NOW,
    completedAt: NOW,
    handlerCalls: 1,
    readbackCalls: 1,
    compensationCalls: 0,
    effect: "applied-confirmed",
    handlerResult: { label: "forged", evidenceHash: "a".repeat(64) },
    readback: { label: "forged", evidenceHash: "b".repeat(64) },
    compensation: null,
    error: null
  };
  assert.throws(
    () => createActionReceipt(action, forged),
    /persisted|trusted execution history|state store/i
  );
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "clover-action-forged-store-"));
  try {
    const store = new LocalActionStateStore(directory);
    assert.throws(
      () => store.reserve(action, NOW),
      (error) => error.code === "ACTION_STATE_TRANSITION_DENIED"
    );
    class CallerStateStore extends LocalActionStateStore {}
    await assert.rejects(
      executeActionEnvelope(action, {
        ...validationOptions(action, { registry: registry() }),
        stateStore: new CallerStateStore(path.join(directory, "caller-subclass")),
        clock: () => NOW
      }),
      /native persisted LocalActionStateStore/
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("target version and expiry are rechecked immediately before the side effect", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clover-action-pre-effect-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const staleTargetAction = envelope({ envelopeId: "act_pre_effect_target_0001" });
  let staleTargetHandlerCalls = 0;
  await assert.rejects(
    executeActionEnvelope(staleTargetAction, {
      ...validationOptions(staleTargetAction, {
        registry: registry({ execute: async () => { staleTargetHandlerCalls += 1; return { applied: true }; } }),
        verifierRegistry: verifierRegistry({
          verify: async () => ({
            sourceSystemId: "synthetic-authoritative-store",
            nativeResourceId: "doc_native_0001",
            observedVersion: "changed-after-validation",
            postcondition: { applied: false, version: "changed-after-validation" }
          })
        })
      }),
      stateStore: new LocalActionStateStore(path.join(root, "stale-target")),
      clock: () => NOW
    }),
    (error) => error instanceof ActionExecutionError && error.state.phase === "failed-before-side-effect"
  );
  assert.equal(staleTargetHandlerCalls, 0);

  const expiredAction = envelope({ envelopeId: "act_pre_effect_expiry_0001" });
  let expiredHandlerCalls = 0;
  let clockCalls = 0;
  await assert.rejects(
    executeActionEnvelope(expiredAction, {
      ...validationOptions(expiredAction, {
        registry: registry({ execute: async () => { expiredHandlerCalls += 1; return { applied: true }; } })
      }),
      stateStore: new LocalActionStateStore(path.join(root, "expired")),
      clock: () => (clockCalls++ === 0 ? NOW : EXPIRES_AT)
    }),
    (error) => error instanceof ActionExecutionError && error.state.phase === "failed-before-side-effect"
  );
  assert.equal(expiredHandlerCalls, 0);
});

test("a closed handler uses its native conditional-write path when available", async (t) => {
  const action = envelope({ envelopeId: "act_native_cas_0001" });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "clover-action-native-cas-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  let ordinaryCalls = 0;
  let conditionalCalls = 0;
  const closed = registry({
    execute: async () => { ordinaryCalls += 1; throw new Error("ordinary write path must not run"); },
    executeConditional: async ({ precondition }) => {
      conditionalCalls += 1;
      assert.equal(precondition.expectedVersion, action.target.expectedVersion);
      assert.equal(precondition.nativeResourceId, action.target.nativeResourceId);
      assert.equal(precondition.nativeConditionalWriteRequired, true);
      return { applied: true, compareAndSwapMatched: true };
    }
  });
  const result = await executeActionEnvelope(action, {
    ...validationOptions(action, { registry: closed }),
    stateStore: new LocalActionStateStore(directory),
    clock: () => NOW
  });
  assert.equal(ordinaryCalls, 0);
  assert.equal(conditionalCalls, 1);
  assert.equal(result.state.executionMode, "native-conditional-write");
  assert.equal(result.receipt.phase, "succeeded");
});
