import test from "node:test";
import assert from "node:assert/strict";
import { commandPrompt, prepareCommand } from "../lib/command-router.js";

const projects = [
  {
    projectId: "cloverapps-ai",
    title: "CloverApps.ai",
    publicUrl: "https://cloverapps.ai",
    priority: "P0",
    completionEstimate: 68,
  },
  {
    projectId: "songandstage",
    title: "SongAndStage.com",
    repository: null,
    publicUrl: "https://www.songandstage.com",
    priority: "P0",
    completionEstimate: 80,
    estimateAsOf: "2026-08-02",
    verificationStatus: "needs-current-production-readback",
    nextMilestone: "Build a preview-only next version.",
  },
  {
    projectId: "rollindd",
    title: "RollinD",
    repository: "chrisdortch/rollindd-platform",
    priority: "P1",
    completionEstimate: 62,
  },
];
const status = { asOf: "2026-08-17", overallMissionCompletionEstimate: 41 };
const pointer = { currentVersion: "1.0.0", repository: "chrisdortch/first" };

test("prepares an evolve command for a named project", () => {
  const packet = prepareCommand({
    request: "Use CloverApps to evolve SongAndStage and build a preview only",
    projects,
    status,
    pointer,
  });
  assert.equal(packet.intent.id, "evolve_project");
  assert.equal(packet.project.projectId, "songandstage");
  assert.equal(packet.authority.productionDeploymentApproved, false);
  assert.ok(packet.freshness.requiredSources.includes("runtime_errors"));
  assert.match(commandPrompt(packet), /Command ID:/);
  assert.doesNotMatch(commandPrompt(packet), /Use CloverApps to Use CloverApps to/);
});

test("recognizes a new seed without requiring an existing project", () => {
  const packet = prepareCommand({
    request: "Use CloverApps to plant a new seed for a communication app",
    projects,
    status,
    pointer,
  });
  assert.equal(packet.intent.id, "launch_project");
  assert.equal(packet.state, "refresh-required-before-execution");
  assert.equal(packet.project, null);
});

test("marks a release request as owner-gated", () => {
  const packet = prepareCommand({
    request: "Use CloverApps to release RollinD to production",
    projects,
    status,
    pointer,
  });
  assert.equal(packet.intent.id, "release_candidate");
  assert.equal(packet.project.projectId, "rollindd");
  assert.equal(packet.authority.mergeApproved, false);
  assert.equal(packet.authority.productionDeploymentApproved, false);
});
