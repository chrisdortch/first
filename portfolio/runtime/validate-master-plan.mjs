#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
const fail = (message) => {
  console.error(`Clover master-plan validation failed: ${message}`);
  process.exit(1);
};
const assert = (condition, message) => {
  if (!condition) fail(message);
};
const round2 = (value) => Math.round(value * 100) / 100;

const pointer = readJson('CLOVER_MASTER_PLAN_POINTER.json');
const status = readJson('portfolio/status/current.json');
const projectsRegistry = readJson('portfolio/registry/projects.json');

assert(pointer.documentType === 'clover-master-plan-pointer', 'unexpected pointer document type');
assert(pointer.currentVersion === status.masterPlanVersion, 'pointer and status versions differ');
for (const target of [
  pointer.currentDocument,
  pointer.currentStatus,
  pointer.projectRegistry,
  pointer.progressMethodology,
  pointer.nextWork,
  pointer.aiHandoff,
  pointer.history
]) {
  assert(fs.existsSync(path.join(root, target)), `pointer target is missing: ${target}`);
}

assert(Array.isArray(status.programAreas) && status.programAreas.length > 0, 'program areas are missing');
const ids = new Set();
let weightTotal = 0;
let weightedTotal = 0;
for (const area of status.programAreas) {
  assert(typeof area.id === 'string' && area.id.length > 0, 'program area id is missing');
  assert(!ids.has(area.id), `duplicate program area id: ${area.id}`);
  ids.add(area.id);
  assert(Number.isFinite(area.weight) && area.weight > 0, `invalid weight for ${area.id}`);
  assert(Number.isFinite(area.completionEstimate) && area.completionEstimate >= 0 && area.completionEstimate <= 100, `invalid completion for ${area.id}`);
  weightTotal += area.weight;
  weightedTotal += area.weight * area.completionEstimate / 100;
}
assert(weightTotal === 100, `program-area weights total ${weightTotal}, not 100`);
assert(round2(weightedTotal) === status.weightedRawCompletion, 'weighted raw completion is stale');
assert(Math.round(weightedTotal) === status.overallMissionCompletionEstimate, 'overall mission completion is stale');
assert(pointer.overallMissionCompletionEstimate === status.overallMissionCompletionEstimate, 'pointer mission completion is stale');

assert(projectsRegistry.documentType === 'clover-portfolio-project-registry', 'unexpected project registry type');
assert(Array.isArray(projectsRegistry.projects) && projectsRegistry.projects.length > 0, 'project registry is empty');
const projectIds = new Set();
const scored = [];
for (const project of projectsRegistry.projects) {
  assert(typeof project.projectId === 'string' && project.projectId.length > 0, 'project id is missing');
  assert(!projectIds.has(project.projectId), `duplicate project id: ${project.projectId}`);
  projectIds.add(project.projectId);
  assert(['P0', 'P1', 'P2', 'P3'].includes(project.priority), `invalid priority for ${project.projectId}`);
  if (project.completionEstimate !== null) {
    assert(Number.isFinite(project.completionEstimate) && project.completionEstimate >= 0 && project.completionEstimate <= 100, `invalid project completion for ${project.projectId}`);
    assert(project.estimateAsOf, `scored project lacks estimate date: ${project.projectId}`);
    scored.push(project.completionEstimate);
  } else {
    assert(project.verificationStatus === 'not-scored', `unscored project must use not-scored verification status: ${project.projectId}`);
  }
}
const scoredAverage = Math.round(scored.reduce((sum, value) => sum + value, 0) / scored.length);
assert(projectsRegistry.projects.length === status.portfolioMetrics.trackedProjects, 'tracked project count is stale');
assert(scored.length === status.portfolioMetrics.projectsWithCompletionEstimate, 'scored project count is stale');
assert(scoredAverage === status.portfolioMetrics.scoredProjectsUnweightedAverage, 'scored project average is stale');

for (const ledgerPath of [
  'portfolio/ledger/progress-history.jsonl',
  'portfolio/ledger/decisions.jsonl'
]) {
  const lines = fs.readFileSync(path.join(root, ledgerPath), 'utf8').split(/\r?\n/).filter(Boolean);
  assert(lines.length > 0, `ledger is empty: ${ledgerPath}`);
  lines.forEach((line, index) => {
    try {
      JSON.parse(line);
    } catch (error) {
      fail(`${ledgerPath} line ${index + 1} is invalid JSON: ${error.message}`);
    }
  });
}

const aiStart = fs.readFileSync(path.join(root, 'AI_START_HERE.md'), 'utf8');
assert(aiStart.includes('CLOVER_MASTER_PLAN_POINTER.json'), 'AI_START_HERE does not reference the master pointer');
assert(aiStart.includes('portfolio/status/current.json'), 'AI_START_HERE does not reference current status');

console.log(JSON.stringify({
  status: 'passed',
  masterPlanVersion: status.masterPlanVersion,
  overallMissionCompletionEstimate: status.overallMissionCompletionEstimate,
  weightedRawCompletion: status.weightedRawCompletion,
  programAreas: status.programAreas.length,
  trackedProjects: projectsRegistry.projects.length,
  scoredProjects: scored.length,
  scoredProjectsAverage: scoredAverage,
  authority: {
    standingProductionAuthority: false
  }
}));
