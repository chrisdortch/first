// A stateless serverless MCP endpoint must reject optional standalone SSE streams immediately.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import test from "node:test";
import { composeTodaySibling, handler } from "../server.js";

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function selfHash(document, field, prefix = false) {
  const clone = structuredClone(document);
  delete clone[field];
  const digest = createHash("sha256").update(canonicalJson(clone)).digest("hex");
  return prefix ? `sha256:${digest}` : digest;
}

async function withGateway(run) {
  const server = createServer(handler);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test("Today sibling exposes the complete minimum-useful contract and fails closed when incomplete", () => {
  const commit = "f".repeat(40);
  const metadata = (relativePath) => ({
    repository: "chrisdortch/first",
    ref: "candidate",
    commit,
    relativePath,
    found: true,
  });
  const available = (id, relativePath, data) => ({ id, available: true, data, url: null, metadata: metadata(relativePath) });
  const snapshot = {
    candidateStatus: available("clover://status/candidate/2026-08-20", "portfolio/status/candidates/2026-08-20/status.json", {
      documentType: "clover-master-status-candidate",
      schemaVersion: "0.2-candidate",
      status: "candidate-unmerged-undeployed",
      statusHash: "",
      asOf: "2026-08-20",
      metrics: [{ id: "broad-mission-completion", completionEstimate: 45 }],
    }),
    registryCandidate: available("clover://registry/candidate/2.0.0", "portfolio/registry/projections/core-project-index.v2.json", {
      documentType: "clover-core-portfolio-projection",
      schemaVersion: "2.0.0",
      status: "candidate-unmerged-undeployed",
      architecture: { rawCellDataStoredInKernel: false },
      projectionPolicy: { rawCellDataIncluded: false },
      projects: Array.from({ length: 45 }, (_, index) => ({ projectId: `synthetic-${index}` })),
    }),
    today: available("clover://today/candidate/2026-08-20", "portfolio/core/today/2026-08-20/session.json", {
      documentType: "clover-today-owner-session",
      schemaVersion: "0.1.0",
      sessionHash: "",
      topPriorities: ["P0 trunk", "P1 branch", "P1 queued"],
      recommendation: "Complete the exact candidate gate.",
      actionId: "CLOVER-2026-08-20-002",
      envelopePath: "portfolio/core/handoff/versions/0.1.0/demonstration/action-envelope.json",
      envelopeHash: "a".repeat(64),
      handoffIndexPath: "portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0001.json",
      handoffIndexHash: "",
      connectorPlan: ["clover-context", "github"],
      authorityRequired: ["separate-owner-approval-before-mutation"],
      sourceFreshness: { label: "current-task" },
      privacy: {
        containsRawCellData: false,
        containsPlaintextSecrets: false,
        containsProductionPrivateData: false,
        publicSanitizedProjection: true,
      },
    }),
    handoff: available("clover://handoff/index", "portfolio/core/handoff/index.json", {
      documentType: "clover-handoff-action-receipt-index",
      schemaVersion: "0.1.0",
      indexHash: "",
      entries: [{
        actionId: "CLOVER-2026-08-20-002",
        envelopePath: "portfolio/core/handoff/versions/0.1.0/demonstration/action-envelope.json",
        envelopeHash: "a".repeat(64),
        status: "pending",
        lifecycle: {
          state: "proposed",
          singleUse: true,
          consumedAt: null,
          consumedByReceiptId: null,
          revokedAt: null,
          revocationEvidenceHash: null,
        },
        ownerApproval: { status: "pending" },
        receiptId: null,
        receiptPath: null,
        receiptHash: null,
        outcome: "pending",
      }],
    }),
  };
  snapshot.candidateStatus.data.statusHash = selfHash(snapshot.candidateStatus.data, "statusHash", true);
  snapshot.handoff.data.indexHash = selfHash(snapshot.handoff.data, "indexHash");
  snapshot.today.data.handoffIndexHash = snapshot.handoff.data.indexHash;
  snapshot.today.data.sessionHash = selfHash(snapshot.today.data, "sessionHash");

  const today = composeTodaySibling(snapshot);
  assert.equal(today.available, true);
  assert.equal(today.data.candidateStatus.asOf, "2026-08-20");
  assert.deepEqual(today.data.topPriorities, ["P0 trunk", "P1 branch", "P1 queued"]);
  assert.equal(today.data.recommendation, "Complete the exact candidate gate.");
  assert.equal(today.data.actionId, "CLOVER-2026-08-20-002");
  assert.equal(today.data.envelopeHash, "a".repeat(64));
  assert.equal(today.components.session.metadata.commit, commit);
  assert.equal(today.components.handoff.metadata.relativePath, "portfolio/core/handoff/index.json");

  const successor = structuredClone(snapshot);
  successor.handoff.data.indexId = "handoff-index:synthetic:successor";
  successor.handoff.data.indexHash = selfHash(successor.handoff.data, "indexHash");
  successor.today.data.handoffIndexPath = "portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0002.json";
  successor.today.data.handoffIndexHash = successor.handoff.data.indexHash;
  successor.today.data.sessionHash = selfHash(successor.today.data, "sessionHash");
  assert.equal(composeTodaySibling(successor).available, true, "a source-bound successor index must not require a Gateway code change");

  const incomplete = composeTodaySibling({
    ...snapshot,
    today: { ...snapshot.today, data: { ...snapshot.today.data, envelopeHash: null } },
  });
  assert.equal(incomplete.available, false);
  assert.equal(incomplete.data, null);
  assert.equal(incomplete.components.candidateStatus.available, true);

  const contradictions = [
    (value) => { value.today.data.envelopeHash = "b".repeat(64); },
    (value) => { value.handoff.data.entries[0].envelopePath = "portfolio/core/handoff/wrong.json"; },
    (value) => { value.handoff.data.entries[0].lifecycle.state = "consumed"; },
    (value) => { value.handoff.data.entries[0].ownerApproval.status = "approved"; },
    (value) => { value.today.data.privacy.containsRawCellData = true; },
    (value) => { value.handoff.metadata.commit = "e".repeat(40); },
    (value) => { value.today.data.documentType = "attacker-today"; },
    (value) => { value.candidateStatus.data.statusHash = "sha256:" + "0".repeat(64); },
    (value) => { value.registryCandidate.metadata.relativePath = "portfolio/registry/wrong.json"; },
    (value) => { value.handoff.data.indexHash = "0".repeat(64); },
    (value) => { value.today.data.handoffIndexHash = "0".repeat(64); },
    (value) => { value.today.data.handoffIndexPath = "portfolio/core/handoff/index.json"; },
  ];
  for (const contradict of contradictions) {
    const mutated = structuredClone(snapshot);
    contradict(mutated);
    const rejected = composeTodaySibling(mutated);
    assert.equal(rejected.available, false);
    assert.equal(rejected.data, null);
  }
});

test("anonymous command-center response embeds no registry payload, project names, or source hashes", async () => {
  await withGateway(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/command-center`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.equal(html.includes("fetch('/api/context')"), false);
    assert.equal(html.includes("innerHTML"), false);
    for (const name of ["RollinD", "Serenity", "Lakeside", "SongAndStage"]) {
      assert.equal(html.includes(name), false, `anonymous response embeds ${name}`);
    }
    assert.equal(/[a-f0-9]{40,64}/.test(html), false);
  });
});

for (const method of ["GET", "DELETE"]) {
  test(`${method} /mcp returns an immediate serverless-safe 405`, async () => {
    await withGateway(async (baseUrl) => {
      const started = Date.now();
      const response = await fetch(`${baseUrl}/mcp`, {
        method,
        headers: { accept: "text/event-stream" },
      });
      const elapsedMs = Date.now() - started;
      assert.equal(response.status, 405);
      assert.equal(response.headers.get("allow"), "POST, OPTIONS");
      assert.ok(elapsedMs < 2000, `Expected an immediate response, observed ${elapsedMs}ms`);
      const body = await response.json();
      assert.equal(body.jsonrpc, "2.0");
      assert.equal(body.id, null);
      assert.match(body.error?.message || "", /Use POST/);
    });
  });
}

test("GET /api/context preserves canonical v1 context and exposes optional candidates fail closed", async () => {
  await withGateway(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/context`);
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.equal(text.includes('"root"'), false);
    assert.equal(text.includes("/Users/"), false);
    assert.equal(text.includes("BEGIN PRIVATE KEY"), false);
    assert.equal(/Bearer\s+[A-Za-z0-9._~-]+/.test(text), false);
    const body = JSON.parse(text);

    assert.equal(body.status.overallMissionCompletionEstimate, 41);
    assert.ok(Array.isArray(body.projects));
    for (const key of ["candidateStatus", "registryCandidate", "today", "handoff"]) {
      assert.equal(typeof body[key]?.available, "boolean", `${key} availability must be explicit`);
      if (!body[key].available) assert.equal(body[key].data, null, `${key} must not silently fall back`);
    }
  });
});

test("POST /api/prepare-command returns Today beside, never inside, Command Packet 1.2", async () => {
  await withGateway(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/prepare-command`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        request: "What matters today? Show current versus candidate truth, the three highest priorities, one recommended next action, and the exact Action ID. Do not execute anything.",
      }),
    });
    assert.equal(response.status, 200);
    const body = await response.json();

    assert.equal(body.packet.schemaVersion, "1.2");
    assert.equal(Object.hasOwn(body.packet, "today"), false);
    assert.equal(body.packet.intent.id, "portfolio_operating_loop");
    assert.equal(body.packet.intent.mode, "brief");
    assert.equal(body.packet.intent.requiresProject, false);
    assert.equal(body.packet.resolution.state, "resolved");
    assert.equal(body.packet.project, null);
    assert.equal(body.packet.ownerActionCards.length, 0);
    assert.ok(body.packet.freshness.requiredSources.includes("canonical_status"));
    assert.equal(body.packet.freshness.requiredSources.includes("repository"), false);
    assert.equal(body.packet.freshness.requiredSources.includes("build_logs"), false);
    assert.equal(body.packet.freshness.requiredSources.includes("runtime_errors"), false);
    assert.equal(typeof body.today?.available, "boolean");
    if (!body.today.available) assert.equal(body.today.data, null);
    assert.equal(typeof body.followUpPrompt, "string");
    assert.ok(body.followUpPrompt.length > 0);
  });
});
