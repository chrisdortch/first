import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const pointer = JSON.parse(fs.readFileSync(path.join(here, "CURRENT.json"), "utf8"));
const receipt = JSON.parse(fs.readFileSync(path.join(repoRoot, pointer.ratificationReceipt), "utf8"));
const constitution = fs.readFileSync(path.join(repoRoot, pointer.constitutionPath));
const sha256 = crypto.createHash("sha256").update(constitution).digest("hex");

assert.equal(pointer.status, "ratified-active");
assert.equal(pointer.currentVersion, "0.1");
assert.equal(sha256, pointer.constitutionSha256);
assert.equal(sha256, receipt.approvedArtifact.sha256);
assert.equal(receipt.owner.decision, "approved-unchanged");
assert.equal(receipt.approvedArtifact.textModifiedByRatification, false);
assert.equal(receipt.ratificationEffect.futureAmendmentsAllowed, true);
assert.equal(receipt.ratificationEffect.silentAmendmentAllowed, false);
assert.deepEqual(receipt.ratificationEffect.operationalAuthorityGranted, []);
assert.equal(pointer.standingProductionAuthority, false);
assert.equal(pointer.mergeAuthorityGranted, false);
assert.equal(pointer.productionDeploymentAuthorityGranted, false);
assert.equal(pointer.privateDataAuthorityGranted, false);
assert.equal(pointer.secretRevealAuthorityGranted, false);

for (const file of [
  "portfolio/ledger/decisions.jsonl",
  "portfolio/core/event-ledger.candidate.jsonl"
]) {
  const lines = fs.readFileSync(path.join(repoRoot, file), "utf8").trim().split(/\r?\n/);
  for (const line of lines) JSON.parse(line);
}

console.log(JSON.stringify({
  status: "passed",
  constitutionVersion: pointer.currentVersion,
  constitutionSha256: sha256,
  approvedUnchanged: true,
  futureAmendmentsRequireNewVersion: true,
  standingProductionAuthority: false,
  mergeAuthorityGranted: false
}, null, 2));
