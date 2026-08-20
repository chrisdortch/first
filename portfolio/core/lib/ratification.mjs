import fs from "node:fs";
import path from "node:path";
import { canonicalize, cloneJson, sha256Bytes, sha256Canonical } from "./canonical-json.mjs";
import { ChallengeStore, verifyAttestation } from "./attestation.mjs";
import { validateJsonSchema } from "./validators.mjs";

const PURPOSE = "clover-constitution-ratification";
const AFFIRMATIVE_DECISION = "ratify-exact-artifact";
const DECISION_TYPES = new Set([AFFIRMATIVE_DECISION, "reject", "defer"]);
const VALIDATION_RECEIPT_KEYS = [
  "documentType", "schemaVersion", "result", "policyValidation", "artifactSha256",
  "validatorId", "validatedAt", "authorityGranted"
];

function assertNonemptyString(value, label) {
  if (typeof value !== "string" || value.length === 0) throw new TypeError(`${label} must be a non-empty string`);
}

function validatePolicyReceipt(receipt, artifactSha256) {
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) {
    throw new TypeError("Ratification policy validation receipt must be an object");
  }
  const keys = Object.keys(receipt).sort();
  const expected = [...VALIDATION_RECEIPT_KEYS].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new Error("Ratification policy validation receipt has unexpected or missing fields");
  }
  if (receipt.documentType !== "clover-constitution-validation-receipt" ||
      receipt.schemaVersion !== "0.2" ||
      receipt.result !== "passed" ||
      receipt.policyValidation !== "passed") {
    throw new Error("Ratification policy validation receipt did not pass");
  }
  if (receipt.artifactSha256 !== artifactSha256) {
    throw new Error("Ratification policy validation receipt is bound to a different artifact");
  }
  assertNonemptyString(receipt.validatorId, "validationReceipt.validatorId");
  if (!Number.isFinite(Date.parse(receipt.validatedAt))) {
    throw new Error("Ratification policy validation receipt timestamp is invalid");
  }
  if (!Array.isArray(receipt.authorityGranted) || receipt.authorityGranted.length !== 0) {
    throw new Error("Ratification policy validation receipt cannot grant operational authority");
  }
  return cloneJson(receipt);
}

function assertSafeRepositoryPath(relativePath) {
  assertNonemptyString(relativePath, "artifact path");
  if (relativePath.includes("\0") || relativePath.includes("\\") || path.posix.isAbsolute(relativePath)) {
    throw new Error("Ratification artifact path must be a safe repository-relative path");
  }
  const segments = relativePath.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new Error("Ratification artifact path contains an unsafe segment");
  }
  return relativePath;
}

function assertNoSymlinkPath(repositoryRoot, relativePath) {
  let current = repositoryRoot;
  for (const segment of relativePath.split("/")) {
    current = path.join(current, segment);
    if (fs.lstatSync(current).isSymbolicLink()) {
      throw new Error("Ratification artifact path contains a symbolic link");
    }
  }
}

function readSchema(repositoryRoot, name) {
  const schemaDirectory = path.join(repositoryRoot, "portfolio/core/schemas");
  const schemaPath = path.join(schemaDirectory, name);
  assertNoSymlinkPath(repositoryRoot, path.relative(repositoryRoot, schemaPath).split(path.sep).join("/"));
  return {
    schemaDirectory,
    schema: JSON.parse(fs.readFileSync(schemaPath, "utf8"))
  };
}

function validateActivationRegistries(lifecycle, trustRegistry, options) {
  const repositoryRoot = path.resolve(options.repositoryRoot);
  const lifecycleSchema = readSchema(repositoryRoot, "constitution-lifecycle.v0.2.schema.json");
  const trustSchema = readSchema(repositoryRoot, "ratifier-trust.v0.2.schema.json");
  validateJsonSchema(lifecycleSchema.schema, lifecycle, {
    schemaDirectory: lifecycleSchema.schemaDirectory,
    label: "trusted-lifecycle-registry"
  });
  validateJsonSchema(trustSchema.schema, trustRegistry, {
    schemaDirectory: trustSchema.schemaDirectory,
    label: "trusted-ratifier-registry"
  });

  const lifecycleHash = sha256Canonical(lifecycle);
  const trustRegistryHash = sha256Canonical(trustRegistry);
  if (lifecycleHash !== options.expectedLifecycleHash || trustRegistryHash !== options.expectedTrustRegistryHash) {
    throw new Error("Activation registry does not match the trusted canonical registry hash");
  }
  if (lifecycle.documentType !== "clover-constitution-lifecycle-registry-candidate" ||
      lifecycle.status !== "draft-unratified" ||
      lifecycle.authorityGrantedByCandidate.length !== 0) {
    throw new Error("Lifecycle registry is not an authority-neutral draft registry");
  }
  const currentEntries = lifecycle.versions.filter((entry) => entry.current === true);
  if (currentEntries.length !== 1 ||
      currentEntries[0].version !== lifecycle.currentVersion ||
      currentEntries[0].lifecycleStatus !== "ratified-active") {
    throw new Error("Lifecycle registry has an inconsistent current version");
  }
  if (trustRegistry.documentType !== "clover-ratifier-trust-registry-candidate" ||
      trustRegistry.status !== "configured-active" ||
      trustRegistry.authorityGrantedByCandidate.length !== 0) {
    throw new Error("Ratifier trust registry is not configured, active, and authority-neutral");
  }
  return { lifecycleHash, trustRegistryHash };
}

export function createRatificationPayload({
  ceremonyId,
  version,
  artifactPath,
  artifactBytes,
  decisionType,
  displayedDecision,
  validationReceipt
}) {
  assertNonemptyString(ceremonyId, "ceremonyId");
  assertNonemptyString(version, "version");
  assertSafeRepositoryPath(artifactPath);
  assertNonemptyString(decisionType, "decisionType");
  if (!DECISION_TYPES.has(decisionType)) {
    throw new Error("decisionType must be ratify-exact-artifact, reject, or defer");
  }
  assertNonemptyString(displayedDecision, "displayedDecision");
  const bytes = Buffer.isBuffer(artifactBytes) ? artifactBytes : Buffer.from(artifactBytes);
  const artifactSha256 = sha256Bytes(bytes);
  const receipt = validatePolicyReceipt(validationReceipt, artifactSha256);
  return {
    schemaVersion: "0.2",
    purpose: PURPOSE,
    ceremonyId,
    artifact: {
      version,
      path: artifactPath,
      byteCount: bytes.length,
      sha256: artifactSha256
    },
    displayedDecision: {
      decisionType,
      statement: displayedDecision,
      statementSha256: sha256Bytes(displayedDecision)
    },
    validationReceipt: receipt,
    validationReceiptHash: sha256Canonical(receipt)
  };
}

export function assembleRatificationEvidence(payload, attestation) {
  if (payload?.purpose !== PURPOSE || attestation?.purpose !== PURPOSE) throw new Error("Ratification purpose mismatch");
  if (canonicalize(attestation.payload) !== canonicalize(payload)) {
    throw new Error("Ratification attestation is not bound to the exact ceremony payload");
  }
  return {
    documentType: "clover-ratification-evidence",
    schemaVersion: "0.2",
    ceremonyId: payload.ceremonyId,
    artifact: cloneJson(payload.artifact),
    displayedDecision: cloneJson(payload.displayedDecision),
    validationReceipt: cloneJson(payload.validationReceipt),
    validationReceiptHash: payload.validationReceiptHash,
    attestation: cloneJson(attestation),
    authorityGranted: []
  };
}

export function inspectRatificationEvidence(evidence, options) {
  const repositoryRoot = path.resolve(options.repositoryRoot);
  const evidenceSchema = readSchema(repositoryRoot, "ratification-evidence.v0.2.schema.json");
  validateJsonSchema(evidenceSchema.schema, evidence, {
    schemaDirectory: evidenceSchema.schemaDirectory,
    label: "ratification-evidence"
  });
  if (evidence?.documentType !== "clover-ratification-evidence" || evidence?.schemaVersion !== "0.2") {
    throw new Error("Unsupported ratification evidence");
  }
  const relativePath = assertSafeRepositoryPath(evidence.artifact?.path);
  assertNoSymlinkPath(repositoryRoot, relativePath);
  const artifactPath = path.resolve(repositoryRoot, ...relativePath.split("/"));
  if (!artifactPath.startsWith(`${repositoryRoot}${path.sep}`)) throw new Error("Ratification artifact escapes repository root");
  const bytes = fs.readFileSync(artifactPath);
  if (bytes.length !== evidence.artifact.byteCount) throw new Error("Ratification artifact byte count mismatch");
  if (sha256Bytes(bytes) !== evidence.artifact.sha256) throw new Error("Ratification artifact hash mismatch");
  if (sha256Bytes(evidence.displayedDecision.statement) !== evidence.displayedDecision.statementSha256) {
    throw new Error("Displayed ratification decision was altered");
  }
  if (!DECISION_TYPES.has(evidence.displayedDecision.decisionType)) {
    throw new Error("Displayed ratification decision type is unsupported");
  }
  const validationReceipt = validatePolicyReceipt(evidence.validationReceipt, evidence.artifact.sha256);
  if (sha256Canonical(validationReceipt) !== evidence.validationReceiptHash) {
    throw new Error("Ratification policy validation receipt hash mismatch");
  }
  if (!Array.isArray(evidence.authorityGranted) || evidence.authorityGranted.length !== 0) {
    throw new Error("Ratification evidence cannot grant operational authority");
  }
  const expectedPayload = {
    schemaVersion: "0.2",
    purpose: PURPOSE,
    ceremonyId: evidence.ceremonyId,
    artifact: evidence.artifact,
    displayedDecision: evidence.displayedDecision,
    validationReceipt: evidence.validationReceipt,
    validationReceiptHash: evidence.validationReceiptHash
  };
  if (canonicalize(evidence.attestation.payload) !== canonicalize(expectedPayload)) {
    throw new Error("Ratification attestation payload mismatch");
  }
  const verification = verifyAttestation(evidence.attestation, {
    trustedCredentials: options.trustedCredentials || [],
    expectedPurpose: PURPOSE,
    now: options.now
  });
  if (!(options.challengeStore instanceof ChallengeStore) ||
      Object.getPrototypeOf(options.challengeStore) !== ChallengeStore.prototype) {
    throw new Error("Ratification requires the native process-persistent ChallengeStore");
  }
  options.challengeStore.verify(evidence.attestation, options.now);
  return {
    valid: true,
    ceremonyId: evidence.ceremonyId,
    version: evidence.artifact.version,
    artifactSha256: evidence.artifact.sha256,
    decisionType: evidence.displayedDecision.decisionType,
    displayedDecisionSha256: evidence.displayedDecision.statementSha256,
    principalId: verification.principalId,
    challenge: { consumable: true, consumed: false }
  };
}

export function verifyRatificationEvidence(evidence, options) {
  const lifecycle = options.lifecycle;
  const trustRegistry = options.trustRegistry;
  if (!lifecycle || !trustRegistry) throw new Error("Activation requires exact lifecycle and ratifier trust registries");
  const registryVerification = validateActivationRegistries(lifecycle, trustRegistry, options);

  const lifecycleEntry = lifecycle.versions?.find((entry) => entry.version === evidence.artifact.version);
  if (!lifecycleEntry || lifecycleEntry.lifecycleStatus !== "draft" || lifecycleEntry.current !== false) {
    throw new Error("Ratification evidence does not target a lifecycle draft");
  }
  if (lifecycleEntry.path !== evidence.artifact.path || lifecycleEntry.sha256 !== evidence.artifact.sha256) {
    throw new Error("Ratification artifact does not match the lifecycle draft entry");
  }

  const credential = trustRegistry.trustedCredentials?.find((entry) =>
    entry.credentialId === evidence.attestation.credentialId &&
    entry.principalId === evidence.attestation.principalId &&
    entry.fingerprint === evidence.attestation.credentialFingerprint &&
    entry.status === "active"
  );
  if (!credential) throw new Error("Ratification credential is not enrolled and active");
  if (!Array.isArray(credential.roles) || !credential.roles.includes("constitution-ratifier")) {
    throw new Error("Credential lacks the constitution-ratifier role");
  }
  if (credential.assurance !== trustRegistry.minimumAssuranceForRatification) {
    throw new Error("Credential does not meet ratification assurance");
  }
  const binding = trustRegistry.principalBindings?.find((entry) =>
    entry.principalId === credential.principalId &&
    entry.role === "constitution-ratifier" &&
    entry.bindingStatus === "active"
  );
  if (!binding) throw new Error("Ratifier principal binding is not active");

  const inspected = inspectRatificationEvidence(evidence, {
    ...options,
    trustedCredentials: trustRegistry.trustedCredentials
  });
  if (inspected.decisionType !== AFFIRMATIVE_DECISION) {
    throw new Error("Constitution activation requires an affirmative ratify-exact-artifact decision");
  }
  const challenge = options.challengeStore.consume(evidence.attestation, options.now);
  return { ...inspected, ...registryVerification, challenge, activationEligible: true };
}

export const ratificationPurpose = PURPOSE;
export const affirmativeRatificationDecision = AFFIRMATIVE_DECISION;
