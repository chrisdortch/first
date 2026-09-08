import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(appRoot, "../..");
const readApp = (relative) => fs.readFileSync(path.join(appRoot, relative), "utf8");
const readRepositoryJson = (relative) => JSON.parse(fs.readFileSync(path.join(repositoryRoot, relative), "utf8"));
const source = {
  command: readApp("src/components/tree-command-center.tsx"),
  owner: readApp("src/components/owner-input-panel.tsx"),
  intake: readApp("src/lib/owner-intake.ts"),
  packets: readApp("src/lib/model-launch-packets.ts"),
  pod: readApp("src/components/personal-launch-pod.tsx"),
  collaboration: readApp("src/components/collaboration-center.tsx"),
  tree: readApp("src/lib/tree-program.ts"),
  live: readApp("src/lib/live-truth.ts"),
  provenance: readApp("src/lib/provenance.ts"),
  route: readApp("src/app/api/tree/route.ts"),
  provenanceRoute: readApp("src/app/api/provenance/route.ts")
};

test("Tree Command Center exposes every exact owner view", () => {
  for (const view of [
    "Today", "Tree", "Master Plan", "Branches", "Roots and Source Coverage", "Captain's Log", "Fruit Ledger",
    "Collaboration and JV Center", "Action Center", "System Health", "Launch Studio session"
  ]) assert.match(source.command, new RegExp(`"${view.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}"`));
  assert.match(source.command, /sourceFreshness/);
  assert.match(source.command, /provider-degraded/);
  assert.match(source.command, /Source-bound, not scored/);
});

test("UI derives canonical state from the complete Tree Program catalog", () => {
  const imports = source.tree.match(/portfolio\/core\/tree-program\/versions\/0\.1\.0\/records\/[a-z0-9-]+\.json/gu) ?? [];
  assert.equal(imports.length, 14);
  assert.equal(new Set(imports).size, 14);
  assert.match(source.tree, /portfolio\/core\/tree-program\/index\.json/);
  const index = readRepositoryJson("portfolio/core/tree-program/index.json");
  assert.equal(index.indexId, "tree-program:index:0001");
  assert.equal(index.recordFiles.length, 14);
  assert.equal(index.publicSanitized, true);
  assert.equal(index.privateDataAccessed, false);
  assert.match(source.route, /Cache-Control.*no-store/su);
  for (const field of ["baseline", "observations", "reconciled", "requestObservedAt", "authority"]) assert.match(source.route, new RegExp(field));
  assert.match(source.provenanceRoute, /Cache-Control.*no-store/su);
  assert.match(source.command, /\/__clover\/deployment-attestation\.json/);
  assert.match(source.command, /compareDeploymentAttestation/);
});

test("live truth uses fixed public readbacks and never promotes request time to source time", () => {
  for (const endpoint of ["branches/main", "pulls/34", "pulls/35", "commits/${candidateCommit}/check-runs?per_page=100"]) assert.match(source.live, new RegExp(endpoint.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")));
  assert.match(source.live, /credentials: "omit"/);
  assert.match(source.live, /revalidate: GITHUB_REVALIDATE_SECONDS/);
  assert.doesNotMatch(source.live, /Authorization|GITHUB_TOKEN|process\.env\.GITHUB/iu);
  assert.match(source.live, /observedAt: null/);
  assert.match(source.route, /const requestObservedAt = new Date\(\)\.toISOString\(\)/);
  assert.doesNotMatch(source.live, /observedAt:\s*new Date/);
  assert.match(source.live, /ACCEPT SOURCE-GROUNDED TREE PREVIEW/);
  assert.match(source.command, /currentActionCard/);
  assert.match(source.route, /CLOVER_EXTERNAL_OBSERVATION/);
  assert.match(source.route, /historical-source-bound-baseline/);
  assert.match(source.command, /immutable baseline \/ observed/);
});

test("provenance and attestation fail closed without widening authority", () => {
  for (const binding of ["buildInvocationId", "sourceManifestSha256", "pathListSha256", "packageLockSha256", "treeProgramIndexHash", "attestation-self-hash"]) assert.match(source.provenance, new RegExp(binding));
  for (const field of ["mergeAuthorized", "productionAuthorized", "privateDataAuthorized", "purchaseAuthorized"]) assert.match(source.command, new RegExp(`${field} !== false`));
  assert.match(source.command, /credentials: "same-origin"/);
  assert.doesNotMatch(source.command, /x-vercel-protection-bypass|authorization/iu);
});

test("owner intake is editable, hash-visible, classified and append-only in local state", () => {
  for (const category of ["new project", "existing project update", "branch relationship", "collaboration opportunity", "Captain's Log observation", "no-build idea"]) {
    assert.match(source.intake, new RegExp(category.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")));
  }
  assert.match(source.intake, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(source.intake, /predecessorSha256/);
  assert.match(source.owner, /SpeechRecognition|webkitSpeechRecognition/);
  assert.match(source.owner, /Raw audio retained: false|raw audio is never retained/i);
  assert.match(source.owner, /Understanding Check/);
  for (const decision of ["Approve packet", "Amend", "Decline", "Not now"]) assert.match(source.owner, new RegExp(decision));
  assert.match(source.owner, /grants no execution, merge, production, messaging, payment or spending authority/);
});

test("model launch packets use supported copy-and-open behavior and complete boundaries", () => {
  for (const target of ["ChatGPT Personal Pro", "Codex 5.6 Sol Ultra", "Personal Sites Studio", "CloverApps collaboration"]) assert.match(source.packets, new RegExp(target.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")));
  for (const field of ["targetModelProduct", "targetThreadOrProject", "requiredConnectors", "exactTarget", "outcome", "mode", "sourceAnchors", "preservationRules", "cost", "risk", "rollback", "stopConditions", "requiredReceipt"]) assert.match(source.packets, new RegExp(field));
  assert.match(source.packets, /copy-then-open-supported-product/);
  assert.match(source.packets, /promptPrefillSupported: false/);
  assert.doesNotMatch(source.packets, /api\.openai\.com|oauth|prompt=/iu);
});

test("Personal Launch Pod is synthetic, revocable and participant-isolated", () => {
  for (const expected of ["No real account connected", "Personal-memory ingestion: false", "Cross-participant access: false", "Raw audio retained: false", "Revoke synthetic approval", "Project Delta"]) assert.match(source.pod, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")));
  assert.doesNotMatch(source.pod, /fetch\(|localStorage|sessionStorage/);
});

test("Collaboration prototype exposes consent, burdens, exit and signature state without execution", () => {
  for (const expected of ["Opportunity", "Proposed participants", "Stated goal", "Contributions", "Ownership / IP", "Costs / revenue", "Decision rights", "Visibility", "Consent / attribution", "Exit", "Dispute path", "Predicted fruit", "Risks / burdens", "Signature required"]) assert.match(source.collaboration, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")));
  assert.match(source.collaboration, /nothing was signed or published/);
  assert.doesNotMatch(source.collaboration, /fetch\(|mailto:|payment|checkout/iu);
});

test("provider-degraded historical runs remain nonblocking source truth", () => {
  const provider = readRepositoryJson("portfolio/core/tree-program/versions/0.1.0/records/provider-degraded-status.json");
  const degraded = provider.records.filter(({ status }) => status === "provider-degraded");
  assert.deepEqual(degraded.map(({ recordId }) => recordId), ["provider-degraded:core-32984759023", "provider-degraded:master-32984759211"]);
  for (const record of degraded) assert.equal(record.details.find(({ key }) => key === "sourceFailure")?.value, "false");
});
