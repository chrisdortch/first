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
const source = { repository: "chrisdortch/first", ref: "main", commit: "a".repeat(40), mode: "github" };

test("prepares an evolve command for a named project", () => {
  const packet = prepareCommand({
    request: "Use CloverApps to evolve SongAndStage and build a preview only",
    projects,
    status,
    pointer,
    source,
  });
  assert.equal(packet.intent.id, "evolve_project");
  assert.equal(packet.project.projectId, "songandstage");
  assert.equal(packet.authority.productionDeploymentApproved, false);
  assert.ok(packet.freshness.requiredSources.includes("runtime_errors"));
  assert.ok(packet.freshness.sourcePlan.some((item) => item.connector === "vercel"));
  assert.equal(packet.canonicalContext.sourceCommit, source.commit);
  assert.match(commandPrompt(packet), /Clover command:/);
  assert.doesNotMatch(commandPrompt(packet), /Use CloverApps to Use CloverApps to/);
});

test("recognizes a new seed without requiring an existing project", () => {
  const packet = prepareCommand({
    request: "Use CloverApps to plant a new seed for a communication app",
    projects,
    status,
    pointer,
    source,
  });
  assert.equal(packet.intent.id, "launch_project");
  assert.equal(packet.state, "refresh-required-before-execution");
  assert.equal(packet.project, null);
  assert.equal(packet.resolution.state, "unresolved");
});

test("marks a release request as owner-gated", () => {
  const packet = prepareCommand({
    request: "Use CloverApps to release RollinD to production",
    projects,
    status,
    pointer,
    source,
  });
  assert.equal(packet.intent.id, "release_candidate");
  assert.equal(packet.project.projectId, "rollindd");
  assert.equal(packet.authority.mergeApproved, false);
  assert.equal(packet.authority.productionDeploymentApproved, false);
});

test("does not confuse the CloverApps trigger phrase with the target project", () => {
  const packet = prepareCommand({
    request: "Use CloverApps to evolve RollinD through a preview only",
    projects,
    status,
    pointer,
    source,
  });
  assert.equal(packet.project.projectId, "rollindd");
});

test("fails closed on an unresolved generic project instruction", () => {
  const packet = prepareCommand({
    request: "Use CloverApps to improve the project",
    projects,
    status,
    pointer,
    source,
  });
  assert.equal(packet.state, "needs-project-resolution");
  assert.equal(packet.project, null);
  assert.ok(packet.ownerActionCards.some((card) => card.id === "resolve-project"));
});

test("creates an exact conditional Sites action card", () => {
  const packet = prepareCommand({
    request: "Use CloverApps to update the OpenAI Site for RollinD",
    projects,
    status,
    pointer,
    source,
  });
  assert.equal(packet.intent.id, "update_openai_site");
  assert.equal(packet.cost.additionalPurchaseExpected, "conditional");
  assert.ok(packet.ownerActionCards.some((card) => card.id === "official-sites-gate" && card.exactPrompt));
});

test("routes all five Clover Today questions without requiring a project", () => {
  const cases = [
    [
      "Use CloverApps to tell me what I should know today across my current priorities, grounded in current sources and without changing anything.",
      "brief",
      "source_health",
    ],
    [
      "Use CloverApps to explain why the most important item matters, show its sources, freshness, uncertainty, and consequences, without changing anything.",
      "explain_priority",
      "recent_decisions",
    ],
    [
      "Use CloverApps to recommend the smallest highest-value next step, considering deadlines, risk, cash, owner attention, and project dependencies. Prepare only.",
      "recommend_next",
      "financial_constraints",
    ],
    [
      "Use CloverApps to do only the safe, reversible, preview-only parts of the recommended step, preserve rollback, and stop before any approval-gated action.",
      "execute_safe_parts",
      "capability_registry",
    ],
    [
      "Use CloverApps to report what changed, what was verified, what remains unknown, what authority was used, and what should be recorded in today's log.",
      "report_activity",
      "daily_log",
    ],
  ];

  for (const [request, mode, expectedSource] of cases) {
    const packet = prepareCommand({ request, projects, status, pointer, source });
    assert.equal(packet.intent.id, "portfolio_operating_loop");
    assert.equal(packet.intent.mode, mode);
    assert.equal(packet.intent.requiresProject, false);
    assert.equal(packet.resolution.state, "resolved");
    assert.equal(packet.project, null);
    assert.equal(packet.state, "refresh-required-before-execution");
    assert.equal(packet.ownerActionCards.length, 0);
    assert.ok(packet.freshness.requiredSources.includes(expectedSource));
    assert.equal(packet.authority.mergeApproved, false);
    assert.equal(packet.authority.productionDeploymentApproved, false);
    assert.match(commandPrompt(packet), new RegExp(`Portfolio operating mode: ${mode}`));
  }
});
