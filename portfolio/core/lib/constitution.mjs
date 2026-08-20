import fs from "node:fs";
import path from "node:path";
import { sha256Bytes } from "./canonical-json.mjs";

export const constitutionV01Invariant = Object.freeze({
  path: "portfolio/core/CLOVER_CONSTITUTION_CANDIDATE_V0.1.md",
  byteCount: 4995,
  sha256: "82b90697389503182e44838df537268510680acffdff95b924967d11bb44169e",
  receiptPath: "portfolio/core/constitution/ratifications/2026-08-18-v0.1.json",
  receiptSha256: "8b0dbf7a34ce18409cad36929e4b2b04a17c033f44e32e21c2c751109a81ccbb",
  legacyLedgerPath: "portfolio/core/event-ledger.candidate.jsonl",
  legacyLedgerSha256: "b5218d898bab0aa37ef761e2a9670fd51fc4f56d43f899b44a7a0c32f1aea4f7"
});

function readJson(repositoryRoot, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function verifyConstitutionState(repositoryRoot) {
  const invariant = constitutionV01Invariant;
  const v01Bytes = fs.readFileSync(path.join(repositoryRoot, invariant.path));
  assert(v01Bytes.length === invariant.byteCount, "Constitution 0.1 byte count changed");
  assert(sha256Bytes(v01Bytes) === invariant.sha256, "Constitution 0.1 hash changed");

  const receiptBytes = fs.readFileSync(path.join(repositoryRoot, invariant.receiptPath));
  assert(sha256Bytes(receiptBytes) === invariant.receiptSha256, "Constitution 0.1 receipt changed");
  const legacyLedgerBytes = fs.readFileSync(path.join(repositoryRoot, invariant.legacyLedgerPath));
  assert(sha256Bytes(legacyLedgerBytes) === invariant.legacyLedgerSha256, "Legacy event ledger changed");

  const current = readJson(repositoryRoot, "portfolio/core/constitution/CURRENT.json");
  assert(current.currentVersion === "0.1", "CURRENT must remain at Constitution 0.1");
  assert(current.status === "ratified-active", "CURRENT 0.1 must remain ratified-active");
  assert(current.constitutionSha256 === invariant.sha256, "CURRENT has the wrong Constitution 0.1 hash");

  const lifecycle = readJson(repositoryRoot, "portfolio/core/constitution/LIFECYCLE_CANDIDATE_V0.2.json");
  assert(lifecycle.status === "draft-unratified", "Lifecycle candidate must remain draft-unratified");
  assert(Array.isArray(lifecycle.authorityGrantedByCandidate) && lifecycle.authorityGrantedByCandidate.length === 0,
    "Lifecycle candidate must grant no authority");
  const versionsById = new Map(lifecycle.versions.map((entry) => [entry.version, entry]));
  assert(versionsById.size === lifecycle.versions.length, "Lifecycle versions must be unique");
  const currentEntries = lifecycle.versions.filter((entry) => entry.current === true);
  assert(currentEntries.length === 1, "Lifecycle must have exactly one current version");
  assert(currentEntries[0].version === lifecycle.currentVersion, "Lifecycle currentVersion disagrees with current entry");
  assert(currentEntries[0].lifecycleStatus === "ratified-active", "Only a ratified-active Constitution may be current");
  assert(lifecycle.currentVersion === current.currentVersion, "Lifecycle candidate disagrees with CURRENT");

  for (const version of lifecycle.versions) {
    const bytes = fs.readFileSync(path.join(repositoryRoot, version.path));
    assert(version.sha256 === sha256Bytes(bytes), `Lifecycle artifact hash mismatch for ${version.version}`);
  }
  const v02 = versionsById.get("0.2");
  assert(v02?.lifecycleStatus === "draft" && v02.current === false, "Constitution 0.2 must remain a non-current draft");
  assert(v02.ownerDecision === null && v02.ratificationEvidence === null, "Draft 0.2 must not claim a ratification decision");
  assert(v02.authenticationAssurance === "none", "Draft 0.2 must not claim authentication assurance");
  assert(v02.runtimeEnforcementStatus === "none", "Draft 0.2 must not claim runtime enforcement");

  const v02Text = fs.readFileSync(path.join(repositoryRoot, v02.path), "utf8");
  assert(!/^\s*(?:status|effective(?:\s+at)?|ratified(?:\s+at)?):/im.test(v02Text),
    "Normative Constitution 0.2 must not embed mutable lifecycle metadata");
  assert(!/\b(?:pending ratification|hereby ratified|current governing version)\b/i.test(v02Text),
    "Normative Constitution 0.2 must remain lifecycle-state-neutral");

  const trust = readJson(repositoryRoot, "portfolio/core/constitution/RATIFIER_TRUST_CANDIDATE_V0.2.json");
  assert(trust.status === "configuration-required", "Ratifier trust must remain configuration-required");
  assert(Array.isArray(trust.trustedCredentials) && trust.trustedCredentials.length === 0,
    "The public candidate must not enroll a ratifier credential");
  assert(Array.isArray(trust.authorityGrantedByCandidate) && trust.authorityGrantedByCandidate.length === 0,
    "Ratifier trust candidate must grant no authority");

  return {
    valid: true,
    currentVersion: "0.1",
    currentConstitutionSha256: invariant.sha256,
    draftVersion: "0.2",
    draftConstitutionSha256: v02.sha256,
    trustedRatifierCredentialCount: 0,
    legacyLedgerSha256: invariant.legacyLedgerSha256
  };
}
