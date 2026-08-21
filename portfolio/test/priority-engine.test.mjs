import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validateJsonSchema } from "../core/lib/validators.mjs";
import {
  PRIORITY_WEIGHTS,
  WIP_LIMITS,
  assertSanitizedPriorityPayload,
  calculateWeightedMetric,
  computeSelfHash,
  scorePriorityTargets,
  validatePriorityInput
} from "../runtime/priority-engine.mjs";

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TEST_DIRECTORY, "../..");
const STATUS_PATH = "portfolio/status/candidates/2026-08-20/status.json";
const INPUT_PATH = "portfolio/status/candidates/2026-08-20/priority-input.json";
const OUTPUT_PATH = "portfolio/status/candidates/2026-08-20/priority-output.json";
const SCHEMA_DIRECTORY = path.join(ROOT, "portfolio/core/schemas");
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");
const readJson = (relativePath) => JSON.parse(read(relativePath));
const clone = (value) => structuredClone(value);
const hashBytes = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const withInputHash = (input) => ({ ...input, priorityInputHash: computeSelfHash(input, "priorityInputHash") });

const status = readJson(STATUS_PATH);
const input = readJson(INPUT_PATH);
const output = readJson(OUTPUT_PATH);

test("the August 20 model uses exact owner-authorized weights and WIP limits", () => {
  assert.deepEqual(PRIORITY_WEIGHTS, {
    deadlineSafetyContinuityRisk: 30,
    ownerCollaboratorWorkloadReduction: 25,
    revenueFinancialStability: 20,
    portfolioSynergyUnblockingValue: 15,
    readinessAndCostToFinish: 10
  });
  assert.equal(Object.values(PRIORITY_WEIGHTS).reduce((sum, value) => sum + value, 0), 100);
  assert.deepEqual(WIP_LIMITS, { coreTrunk: 1, affiliatedBranch: 1 });
});

test("priority input includes exactly all 19 current Registry 1.0 P0/P1 targets", () => {
  const currentRegistry = readJson("portfolio/registry/projects.json");
  const candidateRegistry = readJson("portfolio/registry/versions/2.0.0/registry.json");
  const expected = currentRegistry.projects.filter((project) => ["P0", "P1"].includes(project.priority)).map((project) => project.projectId).sort();
  const actual = input.targets.map((target) => target.targetId).sort();
  assert.equal(expected.length, 19);
  assert.deepEqual(actual, expected);
  assert.ok(actual.every((projectId) => candidateRegistry.records.some((record) => record.projectId === projectId)));
  for (const required of [
    "clover-warroom", "knowledge-hub-window-vault", "propertycare-booking-central",
    "lakeside-essentials", "songandstage", "boat-rentals"
  ]) assert.ok(actual.includes(required), `missing named P0/P1 target ${required}`);
});

test("every factor exposes a value or explicit unknown, rationale, classification, and evidence", () => {
  validatePriorityInput(input);
  const classes = new Set(["source-fact", "owner-direction", "AI-inference", "unknown"]);
  for (const target of input.targets) {
    assert.ok(["P0", "P1"].includes(target.priority));
    assert.ok(target.provenance.length > 0);
    assert.ok(target.freshness.label);
    assert.ok(Array.isArray(target.unknowns));
    for (const factor of Object.values(target.factors)) {
      assert.ok(factor.rationale.length > 0);
      assert.ok(classes.has(factor.evidenceClassification));
      if (factor.value === null) assert.equal(factor.evidenceClassification, "unknown");
      else {
        assert.ok(Number.isInteger(factor.value));
        assert.notEqual(factor.evidenceClassification, "unknown");
        assert.ok(factor.evidenceRefs.length > 0);
      }
    }
  }
});

test("stored output is an exact deterministic regeneration of the self-bound input", () => {
  assert.equal(input.priorityInputHash, computeSelfHash(input, "priorityInputHash"));
  assert.deepEqual(output, scorePriorityTargets(input));
  assert.equal(output.priorityOutputHash, computeSelfHash(output, "priorityOutputHash"));
  assert.equal(status.priorityArtifacts.priorityInputHash, input.priorityInputHash);
  assert.equal(status.priorityArtifacts.priorityOutputHash, output.priorityOutputHash);
});

test("overall risk ranking, eligible ranking, and pending-gate recommendation remain distinct", () => {
  assert.deepEqual(output.top3Overall.map((target) => [target.targetId, target.status]), [
    ["clover-core", "active"],
    ["lakeside-essentials", "blocked"],
    ["boat-rentals", "blocked"]
  ]);
  assert.ok(output.top3Overall.every((target) => Object.keys(target.rationales).length === 5));
  assert.deepEqual(output.top3Eligible.map((target) => target.targetId), [
    "clover-core", "clover-warroom", "knowledge-hub-window-vault"
  ]);
  assert.equal(output.recommendedAffiliatedTargetId, "clover-warroom");
  const warRoom = output.ranking.find((target) => target.targetId === "clover-warroom");
  assert.equal(warRoom.status, "selected-pending-owner-gate");
  assert.equal(warRoom.laneReservation, true);
  assert.deepEqual(output.activeByLane, { coreTrunk: ["clover-core"], affiliatedBranch: [] });
  assert.deepEqual(output.reservedByLane, { coreTrunk: [], affiliatedBranch: ["clover-warroom"] });
  const rollindd = output.ranking.find((target) => target.targetId === "rollindd");
  assert.equal(rollindd.status, "blocked");
  assert.equal(rollindd.selected, false);
});

test("a null factor is unknown, unranked, and never converted to zero", () => {
  const modified = clone(input);
  const warRoom = modified.targets.find((target) => target.targetId === "clover-warroom");
  warRoom.factors.readinessAndCostToFinish = {
    value: null,
    rationale: "Exact source readiness remains unknown.",
    evidenceClassification: "unknown",
    evidenceRefs: ["registry-candidate-2.0.0"]
  };
  const result = scorePriorityTargets(withInputHash(modified));
  const evaluated = result.ranking.find((target) => target.targetId === "clover-warroom");
  assert.equal(evaluated.weightedScore, null);
  assert.equal(evaluated.rank, null);
  assert.equal(evaluated.status, "blocked-unknown");
  assert.equal(evaluated.factorContributions.readinessAndCostToFinish, null);
  assert.notEqual(result.recommendedAffiliatedTargetId, "clover-warroom");
});

test("ranking is deterministic under input reordering and ties use target ID", () => {
  const modified = clone(input);
  const tiedIds = ["clover-warroom", "knowledge-hub-window-vault", "cloverapps-ai"];
  for (const target of modified.targets.filter((entry) => tiedIds.includes(entry.targetId))) {
    for (const factor of Object.values(target.factors)) {
      factor.value = 50;
      factor.evidenceClassification = "AI-inference";
    }
  }
  const first = scorePriorityTargets(withInputHash(modified));
  modified.targets.reverse();
  const second = scorePriorityTargets(withInputHash(modified));
  assert.deepEqual(first.ranking.map((target) => target.targetId), second.ranking.map((target) => target.targetId));
  const tiedOrder = first.ranking.filter((target) => tiedIds.includes(target.targetId)).map((target) => target.targetId);
  assert.deepEqual(tiedOrder, [...tiedIds].sort((left, right) => left.localeCompare(right, "en")));
});

test("WIP limits reject two active affiliated targets and do not auto-start a reservation", () => {
  const modified = clone(input);
  modified.targets.find((target) => target.targetId === "clover-warroom").requestedState = "active";
  const cloverApps = modified.targets.find((target) => target.targetId === "cloverapps-ai");
  cloverApps.requestedState = "active";
  assert.throws(() => validatePriorityInput(withInputHash(modified)), /affiliatedBranch active work exceeds WIP limit/);
  assert.equal(output.activeByLane.affiliatedBranch.length, 0);
});

test("raw-sensitive and unsupported nested fields are rejected", () => {
  assertSanitizedPriorityPayload(input);
  assertSanitizedPriorityPayload(output);
  const sensitive = clone(input);
  sensitive.targets[0].customerRecords = [];
  assert.throws(() => validatePriorityInput(sensitive), /prohibited raw-sensitive field/);
  const nested = clone(input);
  nested.targets[0].factors.deadlineSafetyContinuityRisk.unexpected = true;
  assert.throws(() => validatePriorityInput(withInputHash(nested)), /unsupported field/);
  assert.ok(input.targets.every((target) => !Object.hasOwn(target, "title")));
  assert.ok(output.ranking.every((target) => !Object.hasOwn(target, "title")));
});

test("all four stored metrics recalculate exactly and carry required evidence metadata", () => {
  assert.deepEqual(status.metrics.map((metric) => [metric.id, metric.completionEstimate, metric.weightedRawCompletion]), [
    ["broad-mission-completion", 45, 45.4],
    ["owner-usable-operating-loop-completion", 25, 25],
    ["live-production-completion", 35, 35],
    ["verified-candidate-completion", 70, 70]
  ]);
  const evidenceIds = new Set(status.evidence.map((entry) => entry.sourceId));
  for (const metric of status.metrics) {
    assert.equal(metric.asOf, "2026-08-20");
    assert.ok(metric.scope.length > 0);
    assert.ok(metric.weightingMethod.length > 0);
    assert.ok(metric.confidence.length > 0);
    assert.ok(metric.sourceFreshness.notes.length > 0);
    assert.ok(metric.exclusions.length > 0);
    assert.deepEqual(calculateWeightedMetric(metric.components), {
      weightedRawCompletion: metric.weightedRawCompletion,
      completionEstimate: metric.completionEstimate
    });
    for (const component of metric.components) {
      assert.equal(component.contribution, Math.round(component.weight * component.completionEstimate) / 100);
      assert.ok(component.evidenceBasis.every((sourceId) => evidenceIds.has(sourceId)), `unknown evidence reference in ${metric.id}`);
    }
  }
});

test("current owner usability does not promote candidate capability into the installed path", () => {
  const metric = status.metrics.find((entry) => entry.id === "owner-usable-operating-loop-completion");
  assert.equal(metric.stateClass, "current");
  assert.equal(metric.sourceFreshness.label, "mixed");
  assert.equal(metric.sourceFreshness.oldestMaterialEvidenceAt, "2026-08-17");
  assert.ok(metric.components.every((component) => component.completionEstimate <= 25));
  assert.ok(metric.components.every((component) => !component.evidenceClass.includes("current-implemented")));
});

test("live, current, candidate, historical, and uncertainty labels remain distinct", () => {
  assert.deepEqual(Object.keys(status.stateDefinitions).sort(), [
    "candidate", "current", "historical", "live", "partially-verified", "reported", "unknown", "unverified"
  ]);
  assert.equal(status.historicalPreservation.stateClass, "historical");
  assert.equal(status.reconciliation.registries.current.stateClass, "current");
  assert.equal(status.reconciliation.registries.candidate.stateClass, "candidate");
  assert.equal(status.reconciliation.cloverApps.live.stateClass, "live");
  assert.equal(status.reconciliation.cloverApps.baseCheckpoint.stateClass, "historical");
  assert.equal(status.reconciliation.cloverApps.savedCandidate.stateClass, "candidate");
  assert.equal(status.reconciliation.gateway.baselineCandidate.version, "0.3.0");
  assert.equal(status.reconciliation.gateway.trunkActivationCandidate.version, "0.3.1");
  assert.equal(status.reconciliation.gateway.trunkActivationCandidate.exactFinalHead, null);
  assert.equal(status.reconciliation.gateway.trunkActivationCandidate.previewDeploymentId, null);
});

test("same-day CI readback corrects only standard-CI truth while pilots remain pending", () => {
  const build = status.reconciliation.buildProtocol;
  const data = status.reconciliation.dataProtocol;
  assert.equal(build.current.version, "1.1.0");
  assert.equal(build.candidate.standardCI, "success");
  assert.equal(build.candidate.runId, 32376233048);
  assert.equal(build.candidate.projectPilot, "pending");
  assert.equal(build.candidate.storedPointerStandardCI, "not-run");
  assert.equal(data.current.version, "1.0.0");
  assert.equal(data.candidate.standardCI, "success");
  assert.equal(data.candidate.runId, 32376232998);
  assert.equal(data.candidate.disposableProjectPilot, "pending");
});

test("Serenity and RollinD remain evidence-only with exact candidate separation", () => {
  assert.equal(status.reconciliation.serenity.modifiedByThisGate, false);
  assert.equal(status.reconciliation.serenity.candidate.exactHead, "0c2cddaf12a683cfa5ecb39aeced01ec13bd0c03");
  assert.equal(status.reconciliation.serenity.candidate.tree, "37fcabb90c3accbeff63173a270a30d5002b87ab");
  assert.equal(status.reconciliation.serenity.candidate.exactHeadRunId, 32392241490);
  assert.deepEqual(status.reconciliation.serenity.candidate.targets, [null, null]);
  assert.equal(status.reconciliation.rollindd.production.unchanged, true);
  assert.equal(status.reconciliation.rollindd.pr3.exactHead, "8db83f9c526915d2d58385b78da71ff344b18c99");
  assert.equal(status.reconciliation.rollindd.pr6Reconciliation.exactHead, "ae2f1b0d2a649e645b1d2445b482f539670c6275");
  assert.equal(status.reconciliation.rollindd.pr6Reconciliation.buildProtocol1_2EnrollmentPerformed, false);
});

test("evidence freshness never labels retained older evidence as same-day", () => {
  for (const entry of status.evidence) {
    if (entry.observedAt < "2026-08-20") assert.equal(entry.freshness, "historical", entry.sourceId);
    if (["same-day", "current-task"].includes(entry.freshness)) assert.equal(entry.observedAt, "2026-08-20", entry.sourceId);
  }
});

test("historical bytes and all three artifact self-hashes remain exact", () => {
  assert.equal(hashBytes(read("portfolio/status/snapshots/2026-08-17.json")), status.historicalPreservation.sha256);
  assert.equal(status.historicalPreservation.modifiedByThisCandidate, false);
  assert.equal(status.statusHash, computeSelfHash(status, "statusHash"));
  const stale = clone(status);
  stale.scope = "changed";
  assert.notEqual(stale.statusHash, computeSelfHash(stale, "statusHash"));
});

test("closed schemas accept stored artifacts and reject nested additions", () => {
  const cases = [
    ["clover-priority-input.v0.1.schema.json", input],
    ["clover-priority-output.v0.1.schema.json", output],
    ["clover-status-candidate.v0.1.schema.json", status]
  ];
  for (const [schemaFile, document] of cases) {
    const schema = readJson(`portfolio/core/schemas/${schemaFile}`);
    assert.doesNotThrow(() => validateJsonSchema(schema, document, { schemaDirectory: SCHEMA_DIRECTORY, label: schemaFile }));
  }
  const invalidOutput = clone(output);
  invalidOutput.ranking[0].factorContributions.unexpected = 1;
  assert.throws(() => validateJsonSchema(
    readJson("portfolio/core/schemas/clover-priority-output.v0.1.schema.json"),
    invalidOutput,
    { schemaDirectory: SCHEMA_DIRECTORY, label: "invalid-output" }
  ), /additional property/);
  const invalidStatus = clone(status);
  invalidStatus.reconciliation.gateway.baselineCandidate.unexpected = true;
  assert.throws(() => validateJsonSchema(
    readJson("portfolio/core/schemas/clover-status-candidate.v0.1.schema.json"),
    invalidStatus,
    { schemaDirectory: SCHEMA_DIRECTORY, label: "invalid-status" }
  ), /additional property/);
});

test("authority remains false across the candidate status", () => {
  assert.ok(Object.values(status.authority).every((value) => value === false));
  assert.equal(status.reconciliation.gateway.baselineCandidate.standingProductionAuthority, false);
});
