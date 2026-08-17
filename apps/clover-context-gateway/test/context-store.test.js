import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createContextStore } from "../lib/context-store.js";

function fixtureRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clover-context-"));
  const write = (relativePath, content) => {
    const file = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof content === "string" ? content : `${JSON.stringify(content, null, 2)}\n`);
  };
  write("CLOVER_MASTER_PLAN_POINTER.json", {
    documentType: "clover-master-plan-pointer",
    currentVersion: "1.0.0",
    repository: "chrisdortch/first",
  });
  write("portfolio/status/current.json", { asOf: "2026-08-17", overallMissionCompletionEstimate: 41 });
  write("portfolio/registry/projects.json", {
    projects: [
      { projectId: "rollindd", title: "RollinD", repository: "chrisdortch/rollindd-platform", priority: "P1", completionEstimate: 62 },
      { projectId: "songandstage", title: "SongAndStage.com", publicUrl: "https://www.songandstage.com", priority: "P0", completionEstimate: 80 },
    ],
  });
  for (const [relativePath, content] of Object.entries({
    "portfolio/master-plan/CURRENT.md": "# Current Master Plan\n",
    "portfolio/master-plan/versions/1.0.0/MASTER_PLAN.md": "# Clover Master Plan 1.0.0\n",
    "portfolio/NEXT.md": "# Next\n",
    "portfolio/PROGRESS_METHODOLOGY.md": "# Progress\n",
    "standards/clover-build-protocol/CURRENT.md": "# Build Protocol\n",
    "standards/clover-data-change-protocol/CURRENT.md": "# Data Protocol\n",
    "portfolio/context/COMMAND_GRAMMAR.md": "# Command Grammar\n",
    "portfolio/context/FRESHNESS_POLICY.md": "# Freshness\n",
    "portfolio/context/COST_POLICY.md": "# Cost\n",
  })) write(relativePath, content);
  return root;
}

test("search and fetch use canonical IDs", () => {
  const root = fixtureRoot();
  try {
    const store = createContextStore({ root, sourceRef: "fixture" });
    const results = store.search("RollinD");
    assert.ok(results.some((result) => result.id === "clover://project/rollindd"));
    const fetched = store.fetch("clover://project/rollindd");
    assert.equal(fetched.metadata.projectId, "rollindd");
    assert.match(fetched.url, /portfolio\/registry\/projects\.json/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("snapshot returns status and projects", () => {
  const root = fixtureRoot();
  try {
    const snapshot = createContextStore({ root, sourceRef: "fixture" }).snapshot();
    assert.equal(snapshot.status.overallMissionCompletionEstimate, 41);
    assert.equal(snapshot.projects.length, 2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
