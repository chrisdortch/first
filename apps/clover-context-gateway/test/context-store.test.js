import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createAutoContextStore, createContextStore, createGitHubContextStore, resolveDefaultSourceRef } from "../lib/context-store.js";

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function selfHash(document, field) {
  const clone = structuredClone(document);
  delete clone[field];
  return sha256(canonicalJson(clone));
}

function writeFixture(root, relativePath, content) {
  const file = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof content === "string" ? content : `${JSON.stringify(content, null, 2)}\n`);
}

const HANDOFF_INDEX_DIRECTORY = "portfolio/core/handoff/versions/0.1.0/indexes";

function sealHandoffIndex(index) {
  const sealed = structuredClone(index);
  sealed.indexHash = selfHash(sealed, "indexHash");
  return sealed;
}

function syntheticHandoffGenesis() {
  return sealHandoffIndex({
    documentType: "clover-handoff-action-receipt-index",
    schemaVersion: "0.1.0",
    indexId: "handoff-index:synthetic:0001",
    createdAt: "2026-08-20T21:19:45.000Z",
    previousIndexPath: null,
    previousIndexHash: null,
    entries: [{
      sequence: 1,
      recordedAt: "2026-08-20T21:19:45.000Z",
      actionId: "CLOVER-2026-08-20-002",
      branchCapsuleId: "cell-capsule:synthetic:20260820",
      branchCapsuleHash: "b".repeat(64),
      envelopeId: "handoff-action:synthetic:002",
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
      ownerApproval: {
        status: "pending",
        approverId: "owner:chris-dortch",
        approvedAt: null,
        approvedEnvelopeHash: null,
        approvalEvidenceHash: null,
        attestationId: null,
        attestationPath: null,
        attestationHash: null,
      },
      receiptId: null,
      receiptPath: null,
      receiptHash: null,
      outcome: "pending",
      review: {
        status: "pending",
        decisionId: null,
        decisionPath: null,
        decisionHash: null,
      },
    }],
    indexHash: "",
  });
}

function writeConsumedHandoffSuccessors(root) {
  const genesisPath = `${HANDOFF_INDEX_DIRECTORY}/action-receipt-index-0001.json`;
  const approvedPath = `${HANDOFF_INDEX_DIRECTORY}/action-receipt-index-0002.json`;
  const consumedPath = `${HANDOFF_INDEX_DIRECTORY}/action-receipt-index-0003.json`;
  const genesis = JSON.parse(fs.readFileSync(path.join(root, genesisPath), "utf8"));
  const approved = structuredClone(genesis);
  approved.indexId = "handoff-index:synthetic:0002";
  approved.createdAt = "2026-08-21T20:00:00.000Z";
  approved.previousIndexPath = genesisPath;
  approved.previousIndexHash = genesis.indexHash;
  approved.entries[0].recordedAt = approved.createdAt;
  approved.entries[0].lifecycle.state = "available";
  approved.entries[0].ownerApproval = {
    status: "approved",
    approverId: "owner:chris-dortch",
    approvedAt: "2026-08-21T19:59:59.000Z",
    approvedEnvelopeHash: approved.entries[0].envelopeHash,
    approvalEvidenceHash: "c".repeat(64),
    attestationId: "handoff-approval:synthetic:002",
    attestationPath: "portfolio/core/handoff/versions/0.1.0/approvals/action-002.json",
    attestationHash: "d".repeat(64),
  };
  const sealedApproved = sealHandoffIndex(approved);

  const consumed = structuredClone(sealedApproved);
  consumed.indexId = "handoff-index:synthetic:0003";
  consumed.createdAt = "2026-08-21T20:05:00.000Z";
  consumed.previousIndexPath = approvedPath;
  consumed.previousIndexHash = sealedApproved.indexHash;
  consumed.entries[0].recordedAt = consumed.createdAt;
  consumed.entries[0].status = "completed";
  consumed.entries[0].lifecycle = {
    state: "consumed",
    singleUse: true,
    consumedAt: "2026-08-21T20:04:59.000Z",
    consumedByReceiptId: "handoff-receipt:synthetic:002",
    revokedAt: null,
    revocationEvidenceHash: null,
  };
  consumed.entries[0].receiptId = "handoff-receipt:synthetic:002";
  consumed.entries[0].receiptPath = "portfolio/core/handoff/versions/0.1.0/demonstration/action-receipt.json";
  consumed.entries[0].receiptHash = "e".repeat(64);
  consumed.entries[0].outcome = "succeeded";
  const sealedConsumed = sealHandoffIndex(consumed);

  writeFixture(root, approvedPath, sealedApproved);
  writeFixture(root, consumedPath, sealedConsumed);
  writeFixture(root, "portfolio/core/handoff/index.json", sealedConsumed);
  return { genesis, approved: sealedApproved, consumed: sealedConsumed, genesisPath, approvedPath, consumedPath };
}

function writePublicationFixture(root, {
  generation = 1,
  previousIndexPath = null,
  previousIndexHash = null,
  readbackName = "core-trunk-activation-publication-readback-0001",
} = {}) {
  const previousIndex = generation > 1 && previousIndexPath
    ? JSON.parse(fs.readFileSync(path.join(root, previousIndexPath), "utf8"))
    : null;
  const versionRoot = "portfolio/core/publication/versions/0.1.0";
  const reportPath = `${versionRoot}/mirrors/Clover_Core_Trunk_Activation_Report_2026-08-20.md`;
  const receiptPath = `${versionRoot}/mirrors/Clover_Core_Trunk_Activation_Source_Bound_Receipt_2026-08-20.json`;
  const promptPath = `${versionRoot}/mirrors/Chat_Pro_Core_Trunk_Activation_Review_Prompt_2026-08-20.md`;
  const reviewPath = `${versionRoot}/records/core-trunk-activation-review-pointer.json`;
  const readbackPath = `${versionRoot}/records/${readbackName}.json`;
  const report = "# Synthetic publication report\n\nPublic sanitized evidence only.\n";
  const receipt = `${JSON.stringify({ documentType: "synthetic-source-bound-receipt", privacy: "public-sanitized" }, null, 2)}\n`;
  const prompt = "# Synthetic independent review prompt\n\nRead-only review.\n";
  const pointer = (artifactType, recordId, artifactPath, hash, hashMode, mediaType) => ({
    artifactType,
    recordId,
    path: artifactPath,
    hash,
    hashMode,
    mediaType,
  });
  const finalReport = previousIndex?.current.finalReport
    || pointer("mirrored-final-report", "synthetic-report", reportPath, sha256(report), "sha256-bytes", "text/markdown");
  const sourceBoundReceipt = previousIndex?.current.sourceBoundReceipt
    || pointer("mirrored-source-bound-receipt", "synthetic-receipt", receiptPath, sha256(receipt), "sha256-bytes", "application/json");
  const reviewPrompt = previousIndex?.current.reviewPrompt
    || pointer("mirrored-review-prompt", "synthetic-review-prompt", promptPath, sha256(prompt), "sha256-bytes", "text/markdown");
  const reviewedImplementation = {
    repository: "chrisdortch/first",
    branch: "platform/clover-core-trunk-activation-v0.1-20260820",
    headCommit: "2309bbc61dc8fcc7f2167c6c47db4a8b11cd8334",
    tree: "a027db19d8b177fe52d45fc0c0153ca1189f728e",
    directParent: "9006dcb78ee9412b57321cbd0fbdfa617d7bf96c",
    baseBranch: "platform/clover-core-trust-slice-v0.2-20260818",
    baseCommit: "364a9a96829f323aa00a679804fdd7ed879043b5",
    pullRequest: {
      number: 17,
      url: "https://github.com/chrisdortch/first/pull/17",
      state: "open",
      draft: true,
      merged: false,
    },
  };
  const review = {
    documentType: "clover-core-publication-review-pointer",
    schemaVersion: "0.1.0",
    reviewPointerId: "synthetic-review-decision",
    recordedAt: "2026-08-21T00:30:00Z",
    reviewedImplementation,
    reviewTarget: sourceBoundReceipt,
    reviewEvidence: { reviewPrompt, finalReport },
    decision: {
      verdict: "AMEND",
      assurance: "owner-provided-noncryptographic-independent-review",
      bindingApproval: false,
      source: "owner-provided-chatgpt-personal-pro-output",
      decisionEvidenceStatus: "owner-reported-in-chat-not-preserved",
      evidencePath: null,
      evidenceHash: null,
      findingsNormalization: "normalized-summary",
      findings: [
        { findingId: "external-only-final-evidence", summary: "Synthetic normalized finding." },
        { findingId: "committed-prepublication-staleness", summary: "Synthetic normalized finding." },
      ],
    },
    authority: { mergeApproved: false, productionApproved: false, action002Approved: false },
    reviewPointerHash: "",
  };
  review.reviewPointerHash = selfHash(review, "reviewPointerHash");
  const reviewRaw = `${JSON.stringify(review, null, 2)}\n`;
  const reviewPointer = previousIndex?.current.reviewPointer
    || pointer("structured-review-pointer", review.reviewPointerId, reviewPath, review.reviewPointerHash, "sha256-canonical-without-self-hash-field", "application/json");
  const today = JSON.parse(fs.readFileSync(path.join(root, "portfolio/core/today/2026-08-20/session.json"), "utf8"));
  const status = JSON.parse(fs.readFileSync(path.join(root, "portfolio/status/candidates/2026-08-20/status.json"), "utf8"));
  const handoff = JSON.parse(fs.readFileSync(path.join(root, today.handoffIndexPath), "utf8"));
  const workflow = (name) => ({
    name,
    runId: 1,
    conclusion: "success",
    jobs: [{ jobId: 2, node: null, conclusion: "success" }],
    artifacts: [],
  });
  const readback = {
    documentType: "clover-core-publication-readback",
    schemaVersion: "0.1.0",
    readbackId: `synthetic-readback:${generation}`,
    observedAt: "2026-08-21T00:30:00Z",
    evidenceStatus: "current-for-reviewed-implementation-head",
    verdict: "AMEND",
    reviewedImplementation,
    mirroredIssuanceArtifacts: {
      finalReport,
      sourceBoundReceipt,
      reviewPrompt,
      changedPathAllowlistScope: {
        repository: "chrisdortch/first",
        baseCommit: reviewedImplementation.baseCommit,
        reviewedHeadCommit: reviewedImplementation.headCommit,
        changedPathCount: 62,
        status: "exactly-matches-mirrored-receipt-and-reviewed-head-diff",
      },
    },
    reviewPointer,
    github: {
      observedAt: "2026-08-21T00:30:00Z",
      sourceCommit: reviewedImplementation.headCommit,
      workflows: [
        workflow("Validate Clover master plan"),
        workflow("Validate Clover Context Gateway"),
        workflow("Validate Clover Core Candidate"),
      ],
    },
    vercel: {
      observedAt: "2026-08-21T00:30:00Z",
      deploymentId: "dpl_Synthetic",
      immutableUrl: "https://synthetic.vercel.app",
      projectId: "prj_Synthetic",
      sourceCommit: reviewedImplementation.headCommit,
      sourceRef: reviewedImplementation.branch,
      sourceType: "cli",
      state: "READY",
      target: null,
      aliases: [],
      gatewayVersion: "0.3.1",
      mode: "read-only",
      writeToolsEnabled: false,
      standingProductionAuthority: false,
    },
    sourceBindings: {
      today: { path: "portfolio/core/today/2026-08-20/session.json", hash: today.sessionHash },
      status: { path: "portfolio/status/candidates/2026-08-20/status.json", hash: status.statusHash.replace(/^sha256:/, "") },
      handoffIndex: { path: "portfolio/core/handoff/index.json", hash: handoff.indexHash },
    },
    action002: {
      actionId: today.actionId,
      envelopeHash: today.envelopeHash,
      indexHash: handoff.indexHash,
      status: "pending",
      lifecycleState: "proposed",
      ownerApprovalStatus: "pending",
      consumed: false,
      revoked: false,
    },
    precedence: {
      scope: "publication-readback-only",
      supersedes: [{
        path: "portfolio/core/today/2026-08-20/session.json",
        hash: today.sessionHash,
        claimScope: "exact-head-ci-and-gateway-preview-readback",
        reason: "Synthetic later evidence.",
      }],
      doesNotSupersede: ["owner-authority", "handoff-lifecycle", "production-state", "historical-records"],
    },
    containerBinding: {
      status: "pending-external-publication-receipt",
      commit: null,
      tree: null,
      reviewedImplementationRelation: "The reviewed implementation head identifies the code and provider evidence under review; it is not the later commit that first contains this finalization record.",
      recordingRule: "After these bytes are committed, refreshed GitHub/Vercel/PR metadata must bind the exact container commit and tree in a post-commit source-bound readback; an optional later append-only record may persist it. Never use a local attachment.",
    },
    publicationReadbackHash: "",
  };
  readback.publicationReadbackHash = selfHash(readback, "publicationReadbackHash");
  const readbackRaw = `${JSON.stringify(readback, null, 2)}\n`;
  const current = {
    finalReport,
    sourceBoundReceipt,
    reviewPrompt,
    reviewPointer,
    publicationReadback: pointer("publication-readback", readback.readbackId, readbackPath, readback.publicationReadbackHash, "sha256-canonical-without-self-hash-field", "application/json"),
  };
  const entries = previousIndex
    ? [
        ...previousIndex.entries.map((entry) => entry.artifactType === "publication-readback" && entry.status === "current"
          ? { ...entry, status: "superseded" }
          : entry),
        {
          sequence: previousIndex.entries.length + 1,
          ...current.publicationReadback,
          recordedAt: "2026-08-21T00:30:00Z",
          status: "current",
        },
      ]
    : Object.values(current).map((item, indexValue) => ({
        sequence: indexValue + 1,
        ...item,
        recordedAt: "2026-08-21T00:30:00Z",
        status: "current",
      }));
  const snapshotPath = `${versionRoot}/records/core-publication-index-${String(generation).padStart(4, "0")}.json`;
  const index = {
    documentType: "clover-core-publication-index",
    schemaVersion: "0.1.0",
    indexId: "core-publication-index:2026-08-20",
    updatedAt: "2026-08-21T00:30:00Z",
    reviewedImplementationHead: "2309bbc61dc8fcc7f2167c6c47db4a8b11cd8334",
    lifecycle: {
      mode: "append-only-records-with-advancing-root-pointer",
      sequence: generation,
      stableRootPath: "portfolio/core/publication/index.json",
      immutableSnapshotPath: snapshotPath,
      previousIndexPath,
      previousIndexHash,
      immutableRecordPolicy: "The stable root must be byte-identical to this immutable numbered snapshot. A successor preserves prior records, appends a new numbered snapshot, and advances the stable root with an exact previous path and hash.",
    },
    current,
    connectorIds: {
      "clover://publication/report": current.finalReport,
      "clover://publication/receipt": current.sourceBoundReceipt,
      "clover://publication/review-prompt": current.reviewPrompt,
      "clover://publication/review-decision": current.reviewPointer,
      "clover://publication/readback": current.publicationReadback,
    },
    entries,
    publicationIndexHash: "",
  };
  index.publicationIndexHash = selfHash(index, "publicationIndexHash");
  const indexRaw = `${JSON.stringify(index, null, 2)}\n`;
  writeFixture(root, reportPath, report);
  writeFixture(root, receiptPath, receipt);
  writeFixture(root, promptPath, prompt);
  writeFixture(root, reviewPath, reviewRaw);
  writeFixture(root, readbackPath, readbackRaw);
  writeFixture(root, snapshotPath, indexRaw);
  writeFixture(root, "portfolio/core/publication/index.json", indexRaw);
  return { index, paths: { reportPath, receiptPath, promptPath, reviewPath, readbackPath, snapshotPath } };
}

function writeResealedPublicationIndex(root, index) {
  index.publicationIndexHash = selfHash(index, "publicationIndexHash");
  const raw = `${JSON.stringify(index, null, 2)}\n`;
  writeFixture(root, "portfolio/core/publication/index.json", raw);
  writeFixture(root, index.lifecycle.immutableSnapshotPath, raw);
}

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
    const candidateStatus = {
      documentType: "clover-master-status-candidate",
      schemaVersion: "0.2-candidate",
      asOf: "2026-08-20",
      status: "candidate-unmerged-undeployed",
      statusHash: "",
    };
    candidateStatus.statusHash = `sha256:${selfHash(candidateStatus, "statusHash")}`;
    const handoff = syntheticHandoffGenesis();
    const handoffSnapshotPath = `${HANDOFF_INDEX_DIRECTORY}/action-receipt-index-0001.json`;
    const today = {
      documentType: "clover-today-owner-session",
      schemaVersion: "0.1.0",
      asOf: "2026-08-20",
      actionId: "CLOVER-2026-08-20-002",
      envelopePath: handoff.entries[0].envelopePath,
      envelopeHash: handoff.entries[0].envelopeHash,
      handoffIndexPath: handoffSnapshotPath,
      handoffIndexHash: handoff.indexHash,
      topPriorities: ["Synthetic priority"],
      recommendedNextAction: "Review the synthetic candidate.",
      sessionHash: "",
    };
    today.sessionHash = selfHash(today, "sessionHash");
    for (const [relativePath, content] of Object.entries({
      "portfolio/status/candidates/2026-08-20/status.json": candidateStatus,
      "portfolio/registry/projections/core-project-index.v2.json": {
        documentType: "clover-core-portfolio-projection",
        schemaVersion: "2.0.0",
        projects: [{ projectId: "synthetic-cell", title: "Synthetic Cell" }],
      },
      "portfolio/core/today/2026-08-20/session.json": today,
      "portfolio/core/handoff/index.json": handoff,
      [handoffSnapshotPath]: handoff,
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
    for (const key of ["candidateStatus", "registryCandidate", "today", "handoff", "currentHandoff"]) {
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
    assert.equal(snapshot.handoff.metadata.view, "historical-source-binding");
    assert.equal(snapshot.handoff.metadata.resolvedSnapshotPath, `${HANDOFF_INDEX_DIRECTORY}/action-receipt-index-0001.json`);
    assert.equal(snapshot.handoff.metadata.chainVerified, true);
    assert.equal(snapshot.currentHandoff.available, true);
    assert.equal(snapshot.currentHandoff.data.indexHash, snapshot.handoff.data.indexHash);
    assert.equal(snapshot.currentHandoff.metadata.view, "current-stable-root");

    const ownerGuide = store.fetch("clover://owner/start");
    assert.equal(ownerGuide.metadata.relativePath, "CLOVER_OWNER_START.md");
    assert.equal(ownerGuide.metadata.commit, commit);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("local Handoff successors preserve historical Today bindings while canonical fetch remains current", () => {
  const root = fixtureRoot({ withCandidates: true });
  try {
    writePublicationFixture(root);
    const chain = writeConsumedHandoffSuccessors(root);
    const commit = "4".repeat(40);
    const store = createContextStore({ root, sourceRef: "fixture", sourceCommit: commit });
    const snapshot = store.snapshot();

    assert.equal(snapshot.today.available, true);
    assert.equal(snapshot.today.data.handoffIndexHash, chain.genesis.indexHash);
    assert.equal(snapshot.handoff.available, true);
    assert.equal(snapshot.handoff.data.indexHash, chain.genesis.indexHash);
    assert.equal(snapshot.handoff.data.entries[0].lifecycle.state, "proposed");
    assert.equal(snapshot.handoff.data.entries[0].ownerApproval.status, "pending");
    assert.equal(snapshot.handoff.metadata.relativePath, "portfolio/core/handoff/index.json");
    assert.equal(snapshot.handoff.metadata.resolvedSnapshotPath, chain.genesisPath);
    assert.equal(snapshot.handoff.metadata.currentSnapshotPath, chain.consumedPath);
    assert.equal(snapshot.handoff.metadata.currentIndexHash, chain.consumed.indexHash);
    assert.equal(snapshot.handoff.metadata.chainDepth, 3);
    assert.equal(snapshot.handoff.metadata.chainVerified, true);

    assert.equal(snapshot.currentHandoff.available, true);
    assert.equal(snapshot.currentHandoff.data.indexHash, chain.consumed.indexHash);
    assert.equal(snapshot.currentHandoff.data.entries[0].lifecycle.state, "consumed");
    assert.equal(snapshot.currentHandoff.data.entries[0].ownerApproval.status, "approved");
    assert.equal(snapshot.currentHandoff.metadata.view, "current-stable-root");
    assert.equal(snapshot.publicationReadback.available, true, "a current lifecycle successor must not invalidate historical publication evidence");

    const fetched = store.fetch("clover://handoff/index");
    assert.equal(JSON.parse(fetched.text).indexHash, chain.consumed.indexHash);
    assert.equal(fetched.metadata.relativePath, "portfolio/core/handoff/index.json");
    assert.equal(fetched.metadata.sourceType, "canonical-repository");
    assert.equal(store.search("handoff action envelope").filter((item) => item.id === "clover://handoff/index").length, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Handoff chain contradictions fail closed without rewriting the canonical fetch identity", () => {
  const contradictions = [
    {
      label: "missing historical ancestor",
      mutate(root, chain) {
        fs.rmSync(path.join(root, chain.genesisPath));
      },
    },
    {
      label: "broken predecessor hash",
      mutate(root, chain) {
        const current = structuredClone(chain.consumed);
        current.previousIndexHash = "0".repeat(64);
        const resealed = sealHandoffIndex(current);
        writeFixture(root, chain.consumedPath, resealed);
        writeFixture(root, "portfolio/core/handoff/index.json", resealed);
      },
    },
    {
      label: "stable root differs from immutable current snapshot",
      mutate(root) {
        fs.appendFileSync(path.join(root, "portfolio/core/handoff/index.json"), "\n");
      },
    },
    {
      label: "Today points at a substituted historical path",
      mutate(root) {
        const todayPath = "portfolio/core/today/2026-08-20/session.json";
        const today = JSON.parse(fs.readFileSync(path.join(root, todayPath), "utf8"));
        today.handoffIndexPath = `${HANDOFF_INDEX_DIRECTORY}/action-receipt-index-0002.json`;
        today.sessionHash = selfHash(today, "sessionHash");
        writeFixture(root, todayPath, today);
      },
    },
    {
      label: "resealed proposed-to-consumed lifecycle jump",
      mutate(root, chain) {
        const direct = structuredClone(chain.genesis);
        direct.indexId = "handoff-index:synthetic:illegal-direct-consumption";
        direct.createdAt = "2026-08-21T20:00:00.000Z";
        direct.previousIndexPath = chain.genesisPath;
        direct.previousIndexHash = chain.genesis.indexHash;
        direct.entries[0].recordedAt = direct.createdAt;
        direct.entries[0].status = "completed";
        direct.entries[0].lifecycle = {
          state: "consumed",
          singleUse: true,
          consumedAt: "2026-08-21T19:59:59.000Z",
          consumedByReceiptId: "handoff-receipt:synthetic:illegal",
          revokedAt: null,
          revocationEvidenceHash: null,
        };
        direct.entries[0].receiptId = "handoff-receipt:synthetic:illegal";
        direct.entries[0].receiptPath = "portfolio/core/handoff/versions/0.1.0/demonstration/illegal-receipt.json";
        direct.entries[0].receiptHash = "7".repeat(64);
        direct.entries[0].outcome = "succeeded";
        const resealed = sealHandoffIndex(direct);
        writeFixture(root, chain.approvedPath, resealed);
        writeFixture(root, "portfolio/core/handoff/index.json", resealed);
      },
    },
    {
      label: "sensitive-looking value in a resealed index",
      mutate(root, chain) {
        const current = structuredClone(chain.consumed);
        current.indexId = `ghp_${"x".repeat(24)}`;
        const resealed = sealHandoffIndex(current);
        writeFixture(root, chain.consumedPath, resealed);
        writeFixture(root, "portfolio/core/handoff/index.json", resealed);
      },
    },
  ];

  for (const contradiction of contradictions) {
    const root = fixtureRoot({ withCandidates: true });
    try {
      writePublicationFixture(root);
      const chain = writeConsumedHandoffSuccessors(root);
      contradiction.mutate(root, chain);
      const store = createContextStore({ root, sourceRef: "fixture", sourceCommit: "5".repeat(40) });
      const snapshot = store.snapshot();
      assert.equal(snapshot.handoff.available, false, contradiction.label);
      assert.equal(snapshot.currentHandoff.available, false, contradiction.label);
      assert.equal(snapshot.publicationReadback.available, false, contradiction.label);
      assert.equal(store.fetch("clover://handoff/index").id, "clover://handoff/index", contradiction.label);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test("known Handoff genesis requires exact historical bytes in addition to its canonical hash", () => {
  const root = fixtureRoot({ withCandidates: true });
  try {
    const genesisPath = `${HANDOFF_INDEX_DIRECTORY}/action-receipt-index-0001.json`;
    const productionGenesis = JSON.parse(fs.readFileSync(
      new URL("../../../portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0001.json", import.meta.url),
      "utf8",
    ));
    const rewrittenBytes = JSON.stringify(productionGenesis);
    writeFixture(root, genesisPath, rewrittenBytes);
    writeFixture(root, "portfolio/core/handoff/index.json", rewrittenBytes);
    const todayPath = "portfolio/core/today/2026-08-20/session.json";
    const today = JSON.parse(fs.readFileSync(path.join(root, todayPath), "utf8"));
    const action002 = productionGenesis.entries.find((entry) => entry.actionId === "CLOVER-2026-08-20-002");
    today.envelopePath = action002.envelopePath;
    today.envelopeHash = action002.envelopeHash;
    today.handoffIndexPath = genesisPath;
    today.handoffIndexHash = productionGenesis.indexHash;
    today.sessionHash = selfHash(today, "sessionHash");
    writeFixture(root, todayPath, today);

    const store = createContextStore({ root, sourceRef: "fixture", sourceCommit: "5".repeat(40) });
    const snapshot = store.snapshot();
    assert.equal(snapshot.handoff.available, false);
    assert.equal(snapshot.currentHandoff.available, false);
    assert.equal(JSON.parse(store.fetch("clover://handoff/index").text).indexHash, productionGenesis.indexHash);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("publication artifacts resolve through a self-hashed byte-identical index and retain exact bytes", () => {
  const root = fixtureRoot({ withCandidates: true });
  try {
    const fixture = writePublicationFixture(root);
    const commit = "7".repeat(40);
    const store = createContextStore({ root, sourceRef: "fixture", sourceCommit: commit });
    const snapshot = store.snapshot();
    assert.equal(snapshot.publicationReadback.available, true);
    assert.equal(snapshot.publicationReadback.index.available, true);
    assert.equal(snapshot.publicationReadback.index.metadata.immutableSnapshotByteIdentical, true);
    assert.equal(snapshot.publicationReadback.metadata.commit, commit);
    for (const [key, state] of Object.entries(snapshot.publicationReadback.artifacts)) {
      assert.equal(state.available, true);
      assert.equal(state.metadata.hashVerified, true);
      assert.equal(state.metadata.commit, commit);
      if (key === "reviewDecision") {
        assert.equal(state.data.documentType, "clover-core-publication-review-pointer");
        assert.equal(state.data.decision.bindingApproval, false);
      } else {
        assert.equal(state.data, null, "large mirror bytes must stay fetch-only in the snapshot");
      }
    }

    const report = store.fetch("clover://publication/report");
    assert.equal(report.text, fs.readFileSync(path.join(root, fixture.paths.reportPath), "utf8"));
    assert.equal(sha256(report.text), fixture.index.current.finalReport.hash);
    assert.equal(store.fetch("clover://publication/receipt").id, "clover://publication/receipt");
    assert.equal(store.fetch("clover://publication/review-prompt").id, "clover://publication/review-prompt");
    assert.equal(store.fetch("clover://publication/review-decision").id, "clover://publication/review-decision");
    assert.equal(store.fetch("clover://publication/readback").id, "clover://publication/readback");
    assert.equal(store.fetch("clover://publication/readback/current"), null, "an unbound connector alias must remain impossible");

    const firstIndexHash = fixture.index.publicationIndexHash;
    writePublicationFixture(root, {
      generation: 2,
      previousIndexPath: fixture.paths.snapshotPath,
      previousIndexHash: firstIndexHash,
      readbackName: "core-trunk-activation-publication-readback-0002",
    });
    const successor = createContextStore({ root, sourceRef: "fixture", sourceCommit: commit }).snapshot();
    assert.equal(successor.publicationReadback.available, true);
    assert.match(successor.publicationReadback.metadata.relativePath, /publication-readback-0002\.json$/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("publication pointer and byte contradictions fail closed without hiding canonical context", () => {
  const root = fixtureRoot({ withCandidates: true });
  try {
    const fixture = writePublicationFixture(root);
    fs.appendFileSync(path.join(root, fixture.paths.reportPath), "tampered\n");
    let store = createContextStore({ root, sourceRef: "fixture", sourceCommit: "8".repeat(40) });
    let snapshot = store.snapshot();
    assert.equal(snapshot.status.overallMissionCompletionEstimate, 41);
    assert.equal(snapshot.today.available, true);
    assert.equal(snapshot.publicationReadback.available, false);
    assert.equal(snapshot.publicationReadback.artifacts.report.available, false);
    assert.equal(store.fetch("clover://publication/report"), null);
    assert.equal(store.fetch("clover://publication/receipt"), null, "one catalog contradiction must close every publication relay ID");

    writePublicationFixture(root);
    const index = JSON.parse(fs.readFileSync(path.join(root, "portfolio/core/publication/index.json"), "utf8"));
    index.current.publicationReadback.path = "../../private.json";
    index.publicationIndexHash = selfHash(index, "publicationIndexHash");
    const unsafeRaw = `${JSON.stringify(index, null, 2)}\n`;
    writeFixture(root, "portfolio/core/publication/index.json", unsafeRaw);
    writeFixture(root, fixture.paths.snapshotPath, unsafeRaw);
    store = createContextStore({ root, sourceRef: "fixture", sourceCommit: "8".repeat(40) });
    snapshot = store.snapshot();
    assert.equal(snapshot.status.overallMissionCompletionEstimate, 41);
    assert.equal(snapshot.publicationReadback.available, false);
    assert.equal(store.fetch("clover://publication/readback"), null);

    writePublicationFixture(root);
    fs.appendFileSync(path.join(root, fixture.paths.snapshotPath), "\n");
    store = createContextStore({ root, sourceRef: "fixture", sourceCommit: "8".repeat(40) });
    assert.equal(store.snapshot().publicationReadback.available, false, "stable root and immutable snapshot must remain byte-identical");

    const strictFixture = writePublicationFixture(root);
    const readback = JSON.parse(fs.readFileSync(path.join(root, strictFixture.paths.readbackPath), "utf8"));
    readback.unexpectedAuthorityAlias = false;
    readback.publicationReadbackHash = selfHash(readback, "publicationReadbackHash");
    writeFixture(root, strictFixture.paths.readbackPath, readback);
    const resealedIndex = structuredClone(strictFixture.index);
    resealedIndex.current.publicationReadback.hash = readback.publicationReadbackHash;
    resealedIndex.connectorIds["clover://publication/readback"].hash = readback.publicationReadbackHash;
    const readbackEntry = resealedIndex.entries.find((entry) => entry.artifactType === "publication-readback" && entry.status === "current");
    readbackEntry.hash = readback.publicationReadbackHash;
    writeResealedPublicationIndex(root, resealedIndex);
    store = createContextStore({ root, sourceRef: "fixture", sourceCommit: "8".repeat(40) });
    snapshot = store.snapshot();
    assert.equal(snapshot.today.available, true);
    assert.equal(snapshot.publicationReadback.available, false, "a resealed structured record with an undeclared field must fail closed");
    assert.equal(store.fetch("clover://publication/readback"), null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("local publication index, snapshot, and artifacts fail closed when any resolved path is a symlink", () => {
  for (const target of ["index", "snapshot", "artifact"]) {
    const root = fixtureRoot({ withCandidates: true });
    try {
      const fixture = writePublicationFixture(root);
      const relativePath = target === "index"
        ? "portfolio/core/publication/index.json"
        : target === "snapshot"
          ? fixture.paths.snapshotPath
          : fixture.paths.reportPath;
      const filePath = path.join(root, relativePath);
      const realPath = `${filePath}.real`;
      fs.renameSync(filePath, realPath);
      fs.symlinkSync(path.basename(realPath), filePath);

      const store = createContextStore({ root, sourceRef: "fixture", sourceCommit: "8".repeat(40) });
      const snapshot = store.snapshot();
      assert.equal(snapshot.status.overallMissionCompletionEstimate, 41, `${target} symlink must not hide canonical context`);
      assert.equal(snapshot.publicationReadback.available, false, `${target} symlink must invalidate publication readback`);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test("publication index rejects sequence gaps, duplicate record IDs, malformed historical entries, and chain rewrites", () => {
  const contradictions = [
    (index) => { index.entries[1].sequence = 9; },
    (index) => { index.entries[1].recordId = index.entries[0].recordId; },
    (index) => { index.entries[1].mediaType = "text/markdown"; },
    (index) => { index.connectorIds["clover://publication/report"] = index.current.sourceBoundReceipt; },
  ];
  for (const contradict of contradictions) {
    const root = fixtureRoot({ withCandidates: true });
    try {
      const fixture = writePublicationFixture(root);
      const index = structuredClone(fixture.index);
      contradict(index);
      writeResealedPublicationIndex(root, index);
      assert.equal(
        createContextStore({ root, sourceRef: "fixture", sourceCommit: "8".repeat(40) }).snapshot().publicationReadback.available,
        false,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }

  const root = fixtureRoot({ withCandidates: true });
  try {
    const first = writePublicationFixture(root);
    const second = writePublicationFixture(root, {
      generation: 2,
      previousIndexPath: first.paths.snapshotPath,
      previousIndexHash: first.index.publicationIndexHash,
      readbackName: "core-trunk-activation-publication-readback-0002",
    });
    const allowed = structuredClone(second.index);
    allowed.entries[4].status = "superseded";
    writeResealedPublicationIndex(root, allowed);
    assert.equal(
      createContextStore({ root, sourceRef: "fixture", sourceCommit: "8".repeat(40) }).snapshot().publicationReadback.available,
      true,
      "a predecessor current entry may narrow to superseded when a successor becomes current",
    );

    const rewritten = structuredClone(allowed);
    rewritten.entries[4].recordedAt = "2026-08-21T00:31:00Z";
    writeResealedPublicationIndex(root, rewritten);
    assert.equal(
      createContextStore({ root, sourceRef: "fixture", sourceCommit: "8".repeat(40) }).snapshot().publicationReadback.available,
      false,
      "a successor may not rewrite any prior entry field other than current to superseded",
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("tampering a superseded local publication artifact closes the overlay and every publication relay ID", () => {
  const root = fixtureRoot({ withCandidates: true });
  try {
    const first = writePublicationFixture(root);
    writePublicationFixture(root, {
      generation: 2,
      previousIndexPath: first.paths.snapshotPath,
      previousIndexHash: first.index.publicationIndexHash,
      readbackName: "core-trunk-activation-publication-readback-0002",
    });
    const superseded = JSON.parse(fs.readFileSync(path.join(root, first.paths.readbackPath), "utf8"));
    superseded.verdict = "APPROVE";
    writeFixture(root, first.paths.readbackPath, superseded);

    const store = createContextStore({ root, sourceRef: "fixture", sourceCommit: "8".repeat(40) });
    const snapshot = store.snapshot();
    assert.equal(snapshot.today.available, true);
    assert.equal(snapshot.publicationReadback.available, false);
    for (const id of [
      "clover://publication/report",
      "clover://publication/receipt",
      "clover://publication/review-prompt",
      "clover://publication/review-decision",
      "clover://publication/readback",
    ]) assert.equal(store.fetch(id), null, id);
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
    for (const key of ["candidateStatus", "registryCandidate", "today", "handoff", "currentHandoff"]) {
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
  const handoff = syntheticHandoffGenesis();
  const handoffSnapshotPath = `${HANDOFF_INDEX_DIRECTORY}/action-receipt-index-0001.json`;
  const documents = new Map([
    ["CLOVER_MASTER_PLAN_POINTER.json", JSON.stringify({ currentVersion: "1.0.0", repository: "chrisdortch/first" })],
    ["portfolio/status/current.json", JSON.stringify({ asOf: "2026-08-17", overallMissionCompletionEstimate: 41 })],
    ["portfolio/registry/projects.json", JSON.stringify({ projects: [{ projectId: "rollindd", title: "RollinD", repository: "chrisdortch/rollindd-platform" }] })],
    ["portfolio/NEXT.md", "# Current Next Work\n"],
    ["portfolio/status/candidates/2026-08-20/status.json", JSON.stringify({ documentType: "clover-master-status-candidate", asOf: "2026-08-20" })],
    ["portfolio/core/today/2026-08-20/session.json", JSON.stringify({
      documentType: "clover-today-owner-session",
      topPriorities: ["Synthetic priority"],
      handoffIndexPath: handoffSnapshotPath,
      handoffIndexHash: handoff.indexHash,
    })],
    ["portfolio/core/handoff/index.json", JSON.stringify(handoff)],
    [handoffSnapshotPath, JSON.stringify(handoff)],
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
  assert.equal(snapshot.currentHandoff.available, true);
  assert.equal(snapshot.handoff.metadata.resolvedSnapshotPath, handoffSnapshotPath);
  assert.equal(snapshot.registryCandidate.available, false);
  assert.equal(snapshot.registryCandidate.data, null);
});

test("remote publication mirrors are fetched only from the resolved commit and exact validated pointers", async () => {
  const root = fixtureRoot({ withCandidates: true });
  try {
    const first = writePublicationFixture(root);
    writePublicationFixture(root, {
      generation: 2,
      previousIndexPath: first.paths.snapshotPath,
      previousIndexHash: first.index.publicationIndexHash,
      readbackName: "core-trunk-activation-publication-readback-0002",
    });
    const handoffChain = writeConsumedHandoffSuccessors(root);
    const commit = "6".repeat(40);
    const documents = new Map([
      ["CLOVER_MASTER_PLAN_POINTER.json", fs.readFileSync(path.join(root, "CLOVER_MASTER_PLAN_POINTER.json"), "utf8")],
      ["portfolio/status/current.json", fs.readFileSync(path.join(root, "portfolio/status/current.json"), "utf8")],
      ["portfolio/registry/projects.json", fs.readFileSync(path.join(root, "portfolio/registry/projects.json"), "utf8")],
      ["portfolio/status/candidates/2026-08-20/status.json", fs.readFileSync(path.join(root, "portfolio/status/candidates/2026-08-20/status.json"), "utf8")],
      ["portfolio/core/today/2026-08-20/session.json", fs.readFileSync(path.join(root, "portfolio/core/today/2026-08-20/session.json"), "utf8")],
      ["portfolio/core/handoff/index.json", fs.readFileSync(path.join(root, "portfolio/core/handoff/index.json"), "utf8")],
    ]);
    for (const entry of fs.readdirSync(path.join(root, HANDOFF_INDEX_DIRECTORY), { recursive: true })) {
      const absolute = path.join(root, HANDOFF_INDEX_DIRECTORY, entry);
      if (fs.statSync(absolute).isFile()) {
        documents.set(`${HANDOFF_INDEX_DIRECTORY}/${entry}`, fs.readFileSync(absolute, "utf8"));
      }
    }
    for (const entry of fs.readdirSync(path.join(root, "portfolio/core/publication"), { recursive: true })) {
      const absolute = path.join(root, "portfolio/core/publication", entry);
      if (fs.statSync(absolute).isFile()) {
        documents.set(`portfolio/core/publication/${entry}`, fs.readFileSync(absolute, "utf8"));
      }
    }
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(String(url));
      if (String(url).includes(`/commits/${commit}`)) {
        return new Response(JSON.stringify({ sha: commit }), { status: 200, headers: { "content-type": "application/json" } });
      }
      const prefix = `https://raw.githubusercontent.com/chrisdortch/first/${commit}/`;
      if (!String(url).startsWith(prefix)) return new Response("not found", { status: 404 });
      const relativePath = String(url).slice(prefix.length);
      return documents.has(relativePath)
        ? new Response(documents.get(relativePath), { status: 200, headers: { "content-type": "text/plain" } })
        : new Response("not found", { status: 404 });
    };
    const store = createGitHubContextStore({ sourceRef: commit, fetchImpl, cacheTtlMs: 60000 });
    const snapshot = await store.snapshot();
    assert.equal(snapshot.publicationReadback.available, true);
    assert.equal(snapshot.handoff.data.indexHash, handoffChain.genesis.indexHash);
    assert.equal(snapshot.currentHandoff.data.indexHash, handoffChain.consumed.indexHash);
    assert.equal(snapshot.handoff.metadata.chainDepth, 3);
    assert.equal(snapshot.publicationReadback.metadata.commit, commit);
    assert.equal((await store.fetch("clover://publication/report")).metadata.commit, commit);
    assert.equal((await store.fetch("clover://publication/receipt")).metadata.commit, commit);
    assert.equal((await store.fetch("clover://publication/review-prompt")).metadata.commit, commit);
    assert.equal((await store.fetch("clover://publication/review-decision")).metadata.commit, commit);
    assert.equal(JSON.parse((await store.fetch("clover://handoff/index")).text).indexHash, handoffChain.consumed.indexHash);
    assert.equal(calls.some((url) => url.includes("raw.githubusercontent.com/chrisdortch/first/main/")), false);

    const missingAncestorDocuments = new Map(documents);
    missingAncestorDocuments.delete(handoffChain.approvedPath);
    const missingAncestorStore = createGitHubContextStore({
      sourceRef: commit,
      cacheTtlMs: 60000,
      fetchImpl: async (url) => {
        if (String(url).includes(`/commits/${commit}`)) {
          return new Response(JSON.stringify({ sha: commit }), { status: 200, headers: { "content-type": "application/json" } });
        }
        const prefix = `https://raw.githubusercontent.com/chrisdortch/first/${commit}/`;
        const relativePath = String(url).slice(prefix.length);
        return missingAncestorDocuments.has(relativePath)
          ? new Response(missingAncestorDocuments.get(relativePath), { status: 200, headers: { "content-type": "text/plain" } })
          : new Response("not found", { status: 404 });
      },
    });
    const missingAncestor = await missingAncestorStore.snapshot();
    assert.equal(missingAncestor.handoff.available, false);
    assert.equal(missingAncestor.currentHandoff.available, false);
    assert.equal(missingAncestor.publicationReadback.available, false);
    assert.equal(JSON.parse((await missingAncestorStore.fetch("clover://handoff/index")).text).indexHash, handoffChain.consumed.indexHash);

    const superseded = JSON.parse(documents.get(first.paths.readbackPath));
    superseded.verdict = "APPROVE";
    documents.set(first.paths.readbackPath, `${JSON.stringify(superseded, null, 2)}\n`);
    const contradictedStore = createGitHubContextStore({ sourceRef: commit, fetchImpl, cacheTtlMs: 60000 });
    const contradicted = await contradictedStore.snapshot();
    assert.equal(contradicted.today.available, true);
    assert.equal(contradicted.publicationReadback.available, false);
    for (const id of [
      "clover://publication/report",
      "clover://publication/receipt",
      "clover://publication/review-prompt",
      "clover://publication/review-decision",
      "clover://publication/readback",
    ]) assert.equal(await contradictedStore.fetch(id), null, id);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
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
