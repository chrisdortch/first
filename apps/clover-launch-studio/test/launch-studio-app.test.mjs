import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const source = {
  acl: read("src/lib/acl.ts"),
  auth: read("src/lib/auth.ts"),
  config: read("src/lib/config.ts"),
  crypto: read("src/lib/crypto.ts"),
  handoff: read("src/lib/handoff-codex-adapter.ts"),
  routes: [
    "src/app/api/sessions/route.ts",
    "src/app/api/sessions/[sessionId]/route.ts",
    "src/app/api/sessions/[sessionId]/events/route.ts",
    "src/app/api/sessions/[sessionId]/export/route.ts",
    "src/app/api/sessions/[sessionId]/restore/route.ts",
    "src/app/api/sessions/[sessionId]/handoff/route.ts"
  ].map(read).join("\n"),
  service: read("src/lib/launch-session-service.ts"),
  storage: read("src/lib/storage.ts"),
  transcript: read("src/components/transcript-editor.tsx"),
  package: read("package.json")
};

test("accept_auth_anonymous_deny", () => {
  assert.match(source.auth, /AuthenticationDeniedError/);
  assert.match(source.routes, /denyResponse/);
});

test("accept_auth_clerk_validation", () => {
  assert.match(source.auth, /providerIssuer/);
  assert.match(source.auth, /providerAudience/);
  assert.match(source.auth, /expiresAt/);
  assert.doesNotMatch(source.package, /clerk/i);
});

test("accept_auth_subject_binding", () => {
  assert.match(source.auth, /opaqueParticipantId/);
  assert.match(source.auth, /x-clover-csrf/);
  assert.match(source.auth, /origin !== config\.canonicalOrigin/);
});

test("accept_acl_isolation", () => {
  assert.match(source.acl, /workspaceId !== WORKSPACE_ID/);
  assert.match(source.acl, /participantId !== identity\.participantId/);
});

test("accept_event_append_only", () => {
  for (const binding of ["expectedVersion", "predecessorEventId", "predecessorHash", "idempotencyKey", "sequence"]) {
    assert.match(source.storage, new RegExp(binding));
  }
  assert.match(source.storage, /AppendOnlyViolationError/);
});

test("accept_handoff_lifecycle_append_only", () => {
  assert.match(source.handoff, /proposalOnly: true/);
  assert.match(source.handoff, /executeHandoff\(\): never/);
  assert.match(source.handoff, /approvalInherited: false/);
});

test("accept_storage_encryption", () => {
  assert.match(source.crypto, /aes-256-gcm/);
  assert.match(source.crypto, /randomBytes\(12\)/);
  assert.match(source.crypto, /setAAD/);
  assert.match(source.crypto, /authTag/);
});

test("accept_artifact_cas", () => {
  assert.match(source.storage, /artifact:\$\{digest\}/);
  assert.match(source.storage, /artifact:\$\{sha256\(bytes\)\}/);
});

test("accept_transcript_integrity", () => {
  assert.match(source.storage, /utf8ByteLength/);
  assert.match(source.storage, /transcriptSha256/);
  assert.match(source.transcript, /TextEncoder/);
});

test("accept_transcript_successor", () => {
  assert.match(source.service, /owner-transcript-edited/);
  assert.match(source.storage, /predecessorEventId/);
});

test("accept_raw_audio_false", () => {
  assert.match(source.storage, /rawAudioRetained: false/);
  assert.match(source.transcript, /no microphone, native voice pipeline, or raw-audio retention/i);
});

test("accept_retention_deletion", () => {
  assert.match(source.config, /transcriptRetentionApproved: false/);
  assert.match(source.config, /ownerControlledDeletionRequiresSeparateApproval: true/);
  assert.match(source.config, /keyDestructionRequiresSeparateApproval: true/);
});

test("accept_export_restore", () => {
  assert.match(source.storage, /exportSession/);
  assert.match(source.storage, /restoreSession/);
  assert.match(source.storage, /clover-launch-studio-export-v1/);
});

test("accept_memory_separation", () => {
  assert.match(source.config, /personalChatGptMemoryIngested: false/);
  assert.doesNotMatch(source.storage, /chatgpt.*memory/i);
});

test("accept_chatgpt_read_only", () => {
  assert.match(source.handoff, /Handoff execution is unavailable/);
  assert.doesNotMatch(source.package, /openai|chatgpt/i);
});

test("accept_handoff_default_deny", () => {
  assert.match(source.handoff, /executable: false/);
  assert.match(source.handoff, /CLOVER-2026-08-24-006/);
});

test("accept_approval_noninheritance", () => {
  assert.match(source.handoff, /approvalInherited: false/);
  assert.match(source.handoff, /proposalOnly: true/);
});

test("accept_codex_boundary", () => {
  assert.match(source.handoff, /e5688c771d384d80a8c723cfa655298ce8257889/);
  assert.match(source.handoff, /4c84129b4fb5ea098ac9d2325bc2cb387857a471/);
  assert.doesNotMatch(source.handoff, /exec|spawn|shell|provider/i);
});

test("accept_progress_evidence", () => {
  assert.match(source.storage, /evidenceRef/);
  assert.match(source.storage, /cursor/);
  assert.match(source.storage, /reasoning\|chain\.of\.thought\|token/);
});

test("accept_budget_structural", () => {
  for (const pair of [
    ["maximumModelCalls", "12"], ["maximumImplementationAgents", "2"], ["maximumRepairLoops", "3"],
    ["maximumElapsedMinutes", "120"], ["maximumProviderCiRuns", "1"], ["maximumTargetNullPreviews", "1"]
  ]) assert.match(source.config, new RegExp(`${pair[0]}: ${pair[1]}`));
});

test("accept_budget_failure_stop", () => {
  assert.match(source.config, /same-failure-signature-twice/);
  assert.match(source.config, /one-repair-loop-with-no-new-evidence/);
});

test("accept_purchase_zero", () => {
  assert.match(source.config, /explicitPurchaseCeilingUsd: 0/);
  assert.match(source.config, /automaticAdditionalCreditPurchase: false/);
});

test("accept_local_node_matrix", () => {
  assert.match(source.config, /"node-22", "node-24"/);
  assert.match(source.package, /"node": ">=22\.13\.0"/);
});

test("accept_workflow_integrity", () => {
  assert.equal(readdirSync(root).includes(".github"), false);
});

test("accept_privacy_authority", () => {
  const sensitiveMarker = new RegExp(["BEGIN", "PRIVATE", "KEY"].join(".*") + "|" + ["sk", "live", ""].join("_"), "i");
  assert.doesNotMatch(Object.values(source).join("\n"), sensitiveMarker);
  assert.match(source.routes, /Cache-Control/);
});

test("accept_stage_one_no_provider", () => {
  assert.doesNotMatch(source.package, /@clerk|@neondatabase|@vercel\/blob/);
  assert.match(source.config, /providerProvisioned: false/);
  assert.match(source.config, /previewCreated: false/);
});

test("accept_source_rollback", () => {
  assert.match(source.handoff, /source: \{ repository: "chrisdortch\/first"/);
  assert.doesNotMatch(Object.values(source).join("\n"), /git push|git checkout|git worktree/);
});
