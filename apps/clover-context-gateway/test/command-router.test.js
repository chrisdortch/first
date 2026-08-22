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
  {
    projectId: "lakeside-essentials",
    title: "Lakeside Essentials / Serenity Stores",
    repository: "chrisdortch/serenity-stores",
    publicUrl: "https://lakesideessentials.com",
    priority: "P0",
    completionEstimate: 74,
    estimateAsOf: "2026-08-02",
    verificationStatus: "needs-current-production-readback",
  },
];
const status = { asOf: "2026-08-17", overallMissionCompletionEstimate: 41 };
const pointer = { currentVersion: "1.0.0", repository: "chrisdortch/first" };
const source = { repository: "chrisdortch/first", ref: "main", commit: "a".repeat(40), mode: "github" };
const expectedReadOnlyAuthority = {
  previewOnlyByDefault: true,
  mergeApproved: false,
  productionDeploymentApproved: false,
  productionDataAccessApproved: false,
  domainOrDnsChangeApproved: false,
  secretChangeApproved: false,
  purchaseApproved: false,
  externalMessageApproved: false,
};

function prepare(request) {
  return prepareCommand({ request, projects, status, pointer, source });
}

function assertNonAuthorizing(packet) {
  assert.deepEqual(packet.authority, expectedReadOnlyAuthority);
  assert.equal(Object.hasOwn(packet, "actionId"), false);
  assert.equal(packet.state, "refresh-required-before-execution");
}

test("prepares an evolve command for a named project", () => {
  const packet = prepareCommand({
    request: "Use CloverApps to evolve SongAndStage and build a preview only",
    projects,
    status,
    pointer,
    source,
  });
  assert.equal(packet.schemaVersion, "1.2");
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

test("routes the owner's natural what-matters-today prompt to the portfolio brief", () => {
  const packet = prepareCommand({
    request: "What matters today? Show current versus candidate truth, the three highest priorities, one recommended next action, and the exact Action ID. Do not execute anything.",
    projects,
    status,
    pointer,
    source,
  });

  assert.equal(packet.intent.id, "portfolio_operating_loop");
  assert.equal(packet.intent.mode, "brief");
  assert.equal(packet.intent.requiresProject, false);
  assert.equal(packet.resolution.state, "resolved");
  assert.equal(packet.project, null);
  assert.equal(packet.ownerActionCards.length, 0);
  assert.ok(packet.freshness.requiredSources.includes("canonical_status"));
  assert.ok(packet.freshness.requiredSources.includes("project_registry"));
  assert.equal(packet.freshness.requiredSources.includes("repository"), false);
  assert.equal(packet.freshness.requiredSources.includes("build_logs"), false);
  assert.equal(packet.freshness.requiredSources.includes("runtime_errors"), false);
});

test("routes the exact owner Day-1 acceptance matrix with portfolio evidence and no authority", () => {
  const cases = [
    {
      request: "What matters today?",
      mode: "brief",
      projectId: null,
      sources: ["canonical_status", "project_registry", "priority_context", "latest_receipts", "recent_events", "source_health"],
    },
    {
      request: "Why is Lakeside Essentials blocked?",
      mode: "explain_priority",
      projectId: "lakeside-essentials",
      sources: ["canonical_status", "project_registry", "priority_context", "latest_receipts", "recent_events", "recent_decisions", "source_health"],
      excludedSources: ["repository", "latest_deployment", "production_deployment", "build_logs", "runtime_errors"],
    },
    {
      request: "What is the single best next thing for me to do?",
      mode: "recommend_next",
      projectId: null,
      sources: ["canonical_status", "project_registry", "priority_context", "latest_receipts", "recent_events", "recent_decisions", "source_health", "financial_constraints", "deadline_constraints", "cost_policy"],
    },
    {
      request: "Do only the safe parts of today's top priority.",
      mode: "execute_safe_parts",
      projectId: null,
      sources: ["canonical_status", "project_registry", "priority_context", "latest_receipts", "recent_events", "recent_decisions", "source_health", "capability_registry", "backup_status", "project_vision"],
    },
    {
      request: "What changed since the last accepted receipt?",
      mode: "report_activity",
      projectId: null,
      sources: ["recent_events", "latest_receipts", "daily_log", "canonical_status", "source_health"],
    },
    {
      request: "I feel overloaded. Reduce this to one decision without losing anything.",
      mode: "recommend_next",
      projectId: null,
      sources: ["canonical_status", "project_registry", "priority_context", "latest_receipts", "recent_events", "recent_decisions", "source_health", "financial_constraints", "deadline_constraints", "cost_policy"],
      oneDecision: true,
    },
  ];

  for (const item of cases) {
    const packet = prepare(item.request);
    assert.equal(packet.intent.id, "portfolio_operating_loop", item.request);
    assert.equal(packet.intent.mode, item.mode, item.request);
    assert.equal(packet.intent.requiresProject, false, item.request);
    assert.equal(packet.resolution.state, "resolved", item.request);
    assert.equal(packet.project?.projectId || null, item.projectId, item.request);
    assert.equal(packet.ownerActionCards.length, 0, item.request);
    assert.deepEqual(packet.freshness.requiredSources, item.sources, item.request);
    for (const sourceId of item.excludedSources || []) {
      assert.equal(packet.freshness.requiredSources.includes(sourceId), false, `${item.request}: ${sourceId}`);
    }
    if (item.oneDecision) {
      assert.ok(packet.executionPlan.some((step) => /one decision.*source.*rollback/i.test(step)), item.request);
    }
    assertNonAuthorizing(packet);
  }
});

test("recognizes natural portfolio paraphrases without broadening safe execution", () => {
  const cases = [
    ["I am overwhelmed; tell me the one decision that matters.", "recommend_next"],
    ["I feel overloaded.", "recommend_next"],
    ["There is too much to manage. Give me one decision.", "recommend_next"],
    ["Reduce this to one decision.", "recommend_next"],
    ["Give me one next action.", "recommend_next"],
    ["What is the best next thing?", "recommend_next"],
    ["What is the safest thing you can do now?", "recommend_next"],
    ["What changed since the last receipt?", "report_activity"],
    ["What changed since the latest accepted receipt?", "report_activity"],
    ["Why is the highest priority blocked?", "explain_priority"],
    ["Why is this project ranked this high?", "explain_priority"],
    ["Explain the evidence behind the priority.", "explain_priority"],
    ["Why is this project blocked?", "explain_priority"],
    ["Help me understand today.", "brief"],
  ];

  for (const [request, mode] of cases) {
    const packet = prepare(request);
    assert.equal(packet.intent.id, "portfolio_operating_loop", request);
    assert.equal(packet.intent.mode, mode, request);
    assert.equal(packet.intent.requiresProject, false, request);
    assert.equal(packet.resolution.state, "resolved", request);
    assert.equal(packet.ownerActionCards.length, 0, request);
    assertNonAuthorizing(packet);
  }
});

test("preserves diagnostic and explicit project-action precedence", () => {
  const cases = [
    ["Why is RollinD's build failing?", "diagnose_project", "rollindd"],
    ["Why is Lakeside Essentials checkout failing?", "diagnose_project", "lakeside-essentials"],
    ["Why is RollinD's top-priority build failing?", "diagnose_project", "rollindd"],
    ["Diagnose the current RollinD error.", "diagnose_project", "rollindd"],
    ["Show me the runtime logs for the broken RollinD preview.", "diagnose_project", "rollindd"],
    ["Improve RollinD and create a preview only.", "evolve_project", "rollindd"],
    ["Build a new SongAndStage feature.", "evolve_project", "songandstage"],
    ["Release RollinD to production.", "release_candidate", "rollindd"],
    ["Restore-test the Lakeside backup.", "restore_test", "lakeside-essentials"],
  ];

  for (const [request, intentId, projectId] of cases) {
    const packet = prepare(request);
    assert.equal(packet.intent.id, intentId, request);
    assert.equal(packet.project?.projectId, projectId, request);
    assert.equal(packet.resolution.state, "resolved", request);
    assertNonAuthorizing(packet);
  }

  const priority = prepare("Why is Lakeside Essentials blocked in the priority ranking?");
  assert.equal(priority.intent.id, "portfolio_operating_loop");
  assert.equal(priority.intent.mode, "explain_priority");
  assert.equal(priority.project.projectId, "lakeside-essentials");
  assert.equal(priority.ownerActionCards.length, 0);
  assertNonAuthorizing(priority);

  const unresolved = prepare("Improve the project.");
  assert.equal(unresolved.intent.id, "evolve_project");
  assert.equal(unresolved.project, null);
  assert.equal(unresolved.resolution.state, "unresolved");
  assert.equal(unresolved.state, "needs-project-resolution");
  assert.ok(unresolved.ownerActionCards.some((card) => card.id === "resolve-project"));
  assert.deepEqual(unresolved.authority, expectedReadOnlyAuthority);

  const site = prepare("Update the OpenAI Site for RollinD.");
  assert.equal(site.intent.id, "update_openai_site");
  assert.equal(site.project.projectId, "rollindd");
  assert.ok(site.ownerActionCards.some((card) => card.id === "official-sites-gate"));
  assertNonAuthorizing(site);
});

test("distinguishes recommendation from imperative safe work and defaults unmatched language safely", () => {
  const recommendation = prepare("What is the recommended step?");
  assert.equal(recommendation.intent.id, "portfolio_operating_loop");
  assert.equal(recommendation.intent.mode, "recommend_next");
  assertNonAuthorizing(recommendation);

  const safeWork = prepare("Do the recommended safe step and stop before approval.");
  assert.equal(safeWork.intent.id, "portfolio_operating_loop");
  assert.equal(safeWork.intent.mode, "execute_safe_parts");
  assertNonAuthorizing(safeWork);

  const negatedSafeWork = prepare("Do not do the safe parts; just recommend.");
  assert.equal(negatedSafeWork.intent.id, "portfolio_operating_loop");
  assert.equal(negatedSafeWork.intent.mode, "recommend_next");
  assert.equal(negatedSafeWork.executionPlan.some((step) => /perform only currently authorized safe work/i.test(step)), false);
  assertNonAuthorizing(negatedSafeWork);

  const questionedSafeWork = prepare("Should I do the safe parts?");
  assert.equal(questionedSafeWork.intent.id, "portfolio_operating_loop");
  assert.equal(questionedSafeWork.intent.mode, "brief");
  assert.equal(questionedSafeWork.executionPlan.some((step) => /perform only currently authorized safe work/i.test(step)), false);
  assertNonAuthorizing(questionedSafeWork);

  const unmatched = prepare("I need some perspective.");
  assert.equal(unmatched.intent.id, "portfolio_operating_loop");
  assert.equal(unmatched.intent.mode, "brief");
  assert.equal(unmatched.intent.requiresProject, false);
  assert.equal(unmatched.project, null);
  assert.equal(unmatched.ownerActionCards.length, 0);
  assertNonAuthorizing(unmatched);
});
