import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createContextStore, createGitHubContextStore } from "../lib/context-store.js";

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
    "portfolio/context/CONTROL_PLANE_ARCHITECTURE.md": "# Context Control Plane\n",
    "portfolio/context/COMMAND_GRAMMAR.md": "# Command Grammar\n",
    "portfolio/context/FRESHNESS_POLICY.md": "# Freshness\n",
    "portfolio/context/COST_POLICY.md": "# Cost\n",
    "portfolio/context/LIVE_ADAPTER_REGISTRY.json": { adapters: [] },
  })) write(relativePath, content);
  return root;
}

test("local search and fetch use canonical IDs", () => {
  const root = fixtureRoot();
  try {
    const store = createContextStore({ root, sourceRef: "fixture", sourceCommit: "b".repeat(40) });
    const results = store.search("RollinD");
    assert.ok(results.some((result) => result.id === "clover://project/rollindd"));
    const fetched = store.fetch("clover://project/rollindd");
    assert.equal(fetched.metadata.projectId, "rollindd");
    assert.equal(fetched.metadata.commit, "b".repeat(40));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("local snapshot returns status and projects", () => {
  const root = fixtureRoot();
  try {
    const snapshot = createContextStore({ root, sourceRef: "fixture" }).snapshot();
    assert.equal(snapshot.status.overallMissionCompletionEstimate, 41);
    assert.equal(snapshot.projects.length, 2);
    assert.equal(snapshot.source.mode, "local");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("remote store lazily reads canonical GitHub context and binds the commit", async () => {
  const commit = "c".repeat(40);
  const documents = new Map([
    ["CLOVER_MASTER_PLAN_POINTER.json", JSON.stringify({ currentVersion: "1.0.0", repository: "chrisdortch/first" })],
    ["portfolio/status/current.json", JSON.stringify({ asOf: "2026-08-17", overallMissionCompletionEstimate: 41 })],
    ["portfolio/registry/projects.json", JSON.stringify({ projects: [{ projectId: "rollindd", title: "RollinD", repository: "chrisdortch/rollindd-platform" }] })],
    ["portfolio/NEXT.md", "# Current Next Work\n"],
  ]);
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url).includes("api.github.com/repos/chrisdortch/first/commits/main")) {
      return new Response(JSON.stringify({ sha: commit }), { status: 200, headers: { "content-type": "application/json" } });
    }
    const prefix = `https://raw.githubusercontent.com/chrisdortch/first/${commit}/`;
    const relativePath = String(url).slice(prefix.length);
    if (!documents.has(relativePath)) return new Response("not found", { status: 404 });
    return new Response(documents.get(relativePath), { status: 200, headers: { "content-type": "text/plain" } });
  };

  const store = createGitHubContextStore({ fetchImpl, cacheTtlMs: 60000 });
  const results = await store.search("RollinD");
  assert.ok(results.some((result) => result.id === "clover://project/rollindd"));
  assert.equal(calls.some((url) => url.includes("raw.githubusercontent.com/chrisdortch/first/main/")), false);
  assert.equal(calls.filter((url) => url.includes("portfolio/registry/projects.json")).length, 1);
  assert.equal(calls.some((url) => url.includes("portfolio/NEXT.md")), false);

  const fetched = await store.fetch("clover://next");
  assert.match(fetched.text, /Current Next Work/);
  assert.equal(fetched.metadata.commit, commit);

  const snapshot = await store.snapshot();
  assert.equal(snapshot.source.commit, commit);
  assert.equal(snapshot.status.overallMissionCompletionEstimate, 41);
});

test("remote documents fail closed instead of attributing mutable-ref bytes to a commit", async () => {
  const store = createGitHubContextStore({
    fetchImpl: async (url) => {
      if (String(url).includes("api.github.com/repos/chrisdortch/first/commits/main")) {
        return new Response(JSON.stringify({ sha: null }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`Document fetch must not run without a bound commit: ${url}`);
    },
  });

  await assert.rejects(
    () => store.fetch("clover://status/current"),
    /full Git commit SHA/,
  );
});
