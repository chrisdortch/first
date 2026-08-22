import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(process.cwd(), "../..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("candidate verification receipt fails closed on every consequential authority", () => {
  const receipt = JSON.parse(read("portfolio/core/evidence/2026-08-18-core-candidate-verification.json"));
  assert.equal(receipt.status, "deterministic-passed-preview-pending");
  assert.equal(receipt.candidate.rollbackAnchor, "be62b3d8dfb07eecb52628f1b629fd308eb3cb24");
  assert.equal(receipt.candidate.implementationCommit, "a731ebb291c47ebca69a178f9d667a81608a8c31");
  assert.equal(receipt.liveUseObservation.deployedCorrectionClaimed, false);
  assert.ok(receipt.githubActions.length >= 3);
  for (const run of receipt.githubActions) assert.equal(run.conclusion, "success");
  for (const [key, value] of Object.entries(receipt.authority)) {
    assert.equal(value, false, `${key} must remain false`);
  }
  assert.equal(receipt.gates.exactCommitPreview, "pending");
  assert.equal(receipt.gates.desktopVisual, "pending");
  assert.equal(receipt.gates.mobileVisual, "pending");
  assert.equal(receipt.gates.merge, "not-authorized");
  assert.equal(receipt.gates.production, "not-authorized");
  assert.equal(receipt.missionCompletionEstimate, 41);
  assert.equal(receipt.missionEstimateChanged, false);
});

test("receipt event segment is parseable, unique, and contains no synthetic claims", () => {
  const events = read("portfolio/core/events/2026-08-18-candidate-receipts.jsonl")
    .trim()
    .split(/\r?\n/)
    .map(JSON.parse);
  assert.equal(events.length, 7);
  assert.equal(new Set(events.map((event) => event.eventId)).size, events.length);
  assert.ok(events.every((event) => event.schemaVersion === "0.1"));
  assert.ok(events.every((event) => event.synthetic === false));
  assert.ok(events.some((event) => event.eventId === "evt_20260818_live_use_gap"));
  assert.ok(events.some((event) => event.eventId === "evt_20260818_corrected_ci_verified"));
  assert.ok(events.some((event) => event.eventId === "evt_20260818_preview_pending"));
  assert.ok(events.some((event) => event.eventId === "evt_20260818_daily_log_projected"));
});

test("daily projection distinguishes today's usable mode from pending deployment", () => {
  const daily = read("portfolio/daily/2026-08-18.md");
  assert.ok(daily.includes("Mission completion: remains **41%**"));
  assert.ok(daily.includes("a731ebb291c47ebca69a178f9d667a81608a8c31"));
  assert.ok(daily.includes("Candidate preview deployment: not created"));
  assert.ok(daily.includes("No continuous scheduler or monitor is claimed today"));
  assert.ok(daily.includes("Explicitly not authorized or not performed"));

  const pulse = read("portfolio/core/SOURCE_PULSE_MATRIX_CANDIDATE_V0.1.md");
  assert.ok(pulse.includes("Check health and deltas first"));
  assert.ok(pulse.includes("No continuous monitor or scheduler is claimed"));
});
