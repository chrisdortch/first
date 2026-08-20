import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createAutoContextStore, createContextStore, createGitHubContextStore, resolveDefaultSourceRef } from "../lib/context-store.js";

test("deployment source selection prefers exact commit bindings over mutable refs", () => {
  assert.equal(resolveDefaultSourceRef({ CONTEXT_SOURCE_REF: "main" }), "main");
  assert.equal(
    resolveDefaultSourceRef({ CONTEXT_SOURCE_REF: "main", VERCEL_GIT_COMMIT_SHA: "a".repeat(40) }),
    "a".repeat(40),
  );
  assert.equal(
    resolveDefaultSourceRef({
      CONTEXT_SOURCE_REF: "main",
      VERCEL_GIT_COMMIT_SHA: "a".repeat(40),
      CONTEXT_SOURCE_COMMIT: "b".repeat(40),
    }),
    "b".repeat(40),
  );
  assert.throws(() => resolveDefaultSourceRef({ CONTEXT_SOURCE_COMMIT: "short" }), /full lowercase Git commit SHA/);
  assert.throws(() => resolveDefaultSourceRef({ VERCEL_GIT_COMMIT_SHA: "short" }), /full lowercase Git commit SHA/);
});

function fixtureRoot({ withCandidates = false } = {}) {
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
  if (withCandidates) {
    for (const [relativePath, content] of Object.entries({
      "portfolio/status/candidates/2026-08-20/status.json": {
        documentType: "clover-master-status-candidate",
        asOf: "2026-08-20",
        status: "candidate-unmerged-undeployed",
      },
      "portfolio/registry/projections/core-project-index.v2.json": {
        documentType: "clover-core-portfolio-projection",
        schemaVersion: "2.0.0",
        projects: [{ projectId: "synthetic-cell", title: "Synthetic Cell" }],
      },
      "portfolio/core/today/2026-08-20/session.json": {
        documentType: "clover-today-owner-session",
        asOf: "2026-08-20",
        topPriorities: ["Synthetic priority"],
        recommendedNextAction: "Review the synthetic candidate.",
      },
      "portfolio/core/handoff/index.json": {
        documentType: "clover-handoff-ledger-index",
        schemaVersion: "0.1.0",
        entries: [],
      },
      "CLOVER_OWNER_START.md": "# Clover Owner Start\n",
      "CHATGPT_PROJECT_INSTRUCTIONS.md": "# ChatGPT Project Instructions\n",
      "CODEX_CLOVER_OPERATOR.md": "# Codex Clover Operator\n",
      "CLOVER_CONNECTOR_ROUTING.md": "# Clover Connector Routing\n",
    })) write(relativePath, content);
  }
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

test("local snapshot preserves canonical v1 status and projects while optional candidates fail closed", () => {
  const root = fixtureRoot();
  try {
    const snapshot = createContextStore({ root, sourceRef: "fixture" }).snapshot();
    assert.equal(snapshot.status.overallMissionCompletionEstimate, 41);
    assert.equal(snapshot.projects.length, 2);
    assert.equal(snapshot.source.mode, "local");
    assert.equal(Object.hasOwn(snapshot.source, "root"), false);
    for (const key of ["candidateStatus", "registryCandidate", "today", "handoff"]) {
      assert.equal(snapshot[key].available, false, `${key} must be unavailable`);
      assert.equal(snapshot[key].data, null, `${key} must not fall back to canonical data`);
      assert.equal(snapshot[key].metadata.found, false);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("local candidate artifacts are optional, source-bound siblings", () => {
  const root = fixtureRoot({ withCandidates: true });
  try {
    const commit = "d".repeat(40);
    const store = createContextStore({ root, sourceRef: "fixture", sourceCommit: commit });
    const snapshot = store.snapshot();

    assert.equal(snapshot.status.overallMissionCompletionEstimate, 41);
    assert.equal(snapshot.projects.length, 2);
    assert.equal(snapshot.candidateStatus.available, true);
    assert.equal(snapshot.candidateStatus.data.asOf, "2026-08-20");
    assert.equal(snapshot.registryCandidate.available, true);
    assert.equal(snapshot.registryCandidate.data.projects[0].projectId, "synthetic-cell");
    assert.equal(snapshot.today.available, true);
    assert.equal(snapshot.today.data.topPriorities[0], "Synthetic priority");
    assert.equal(snapshot.handoff.available, true);
    assert.equal(snapshot.handoff.metadata.commit, commit);
    assert.equal(snapshot.handoff.metadata.relativePath, "portfolio/core/handoff/index.json");
    assert.equal(snapshot.handoff.metadata.repository, "chrisdortch/first");

    const ownerGuide = store.fetch("clover://owner/start");
    assert.equal(ownerGuide.metadata.relativePath, "CLOVER_OWNER_START.md");
    assert.equal(ownerGuide.metadata.commit, commit);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("auto local mode binds Vercel's exact Git commit as component metadata", () => {
  const root = fixtureRoot({ withCandidates: true });
  try {
    const commit = "9".repeat(40);
    const store = createAutoContextStore({
      root,
      environment: {
        CONTEXT_SOURCE_MODE: "local",
        CONTEXT_SOURCE_REF: "main",
        VERCEL_GIT_COMMIT_SHA: commit,
      },
    });
    const snapshot = store.snapshot();
    assert.equal(snapshot.source.ref, commit);
    assert.equal(snapshot.source.commit, commit);
    for (const key of ["candidateStatus", "registryCandidate", "today", "handoff"]) {
      assert.equal(snapshot[key].metadata.commit, commit);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("corrupt optional candidate JSON fails closed without replacing canonical v1 context", () => {
  const root = fixtureRoot();
  try {
    const relativePath = "portfolio/core/today/2026-08-20/session.json";
    const file = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "{not-json\n");
    const commit = "e".repeat(40);
    const store = createContextStore({ root, sourceRef: "fixture", sourceCommit: commit });
    const snapshot = store.snapshot();

    assert.equal(snapshot.status.overallMissionCompletionEstimate, 41);
    assert.equal(snapshot.projects.length, 2);
    assert.equal(snapshot.today.available, false);
    assert.equal(snapshot.today.data, null);
    assert.equal(snapshot.today.metadata.commit, commit);
    assert.equal(snapshot.today.metadata.relativePath, relativePath);
    assert.equal(store.fetch("clover://today/candidate/2026-08-20"), null);
    assert.equal(store.search("owner session").some((item) => item.id === "clover://today/candidate/2026-08-20"), false);
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
    ["portfolio/status/candidates/2026-08-20/status.json", JSON.stringify({ documentType: "clover-master-status-candidate", asOf: "2026-08-20" })],
    ["portfolio/core/today/2026-08-20/session.json", JSON.stringify({ documentType: "clover-today-owner-session", topPriorities: ["Synthetic priority"] })],
    ["portfolio/core/handoff/index.json", JSON.stringify({ documentType: "clover-handoff-ledger-index", entries: [] })],
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

  const store = createGitHubContextStore({ sourceRef: "main", fetchImpl, cacheTtlMs: 60000 });
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
  assert.equal(snapshot.candidateStatus.available, true);
  assert.equal(snapshot.candidateStatus.data.asOf, "2026-08-20");
  assert.equal(snapshot.today.available, true);
  assert.equal(snapshot.today.data.topPriorities[0], "Synthetic priority");
  assert.equal(snapshot.handoff.available, true);
  assert.equal(snapshot.registryCandidate.available, false);
  assert.equal(snapshot.registryCandidate.data, null);
});

test("remote documents fail closed instead of attributing mutable-ref bytes to a commit", async () => {
  const store = createGitHubContextStore({
    sourceRef: "main",
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
