// A stateless serverless MCP endpoint must reject optional standalone SSE streams immediately.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
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

function addPublicationReadback(snapshot, {
  recordName = "core-trunk-activation-publication-readback-0001",
  recordId = "core-trunk-activation-publication-readback:2026-08-20:0001",
  sequence = 1,
  previousIndexHash = null,
} = {}) {
  const metadata = snapshot.today.metadata;
  const versionRoot = "portfolio/core/publication/versions/0.1.0";
  const recordPath = `portfolio/core/publication/versions/0.1.0/records/${recordName}.json`;
  const pointer = (artifactType, id, artifactPath, hash, hashMode, mediaType) => ({
    artifactType,
    recordId: id,
    path: artifactPath,
    hash,
    hashMode,
    mediaType,
  });
  const current = {
    finalReport: pointer("mirrored-final-report", "external-final-report:2026-08-20", `${versionRoot}/mirrors/Clover_Core_Trunk_Activation_Report_2026-08-20.md`, "b".repeat(64), "sha256-bytes", "text/markdown"),
    sourceBoundReceipt: pointer("mirrored-source-bound-receipt", "external-source-bound-receipt:2026-08-20", `${versionRoot}/mirrors/Clover_Core_Trunk_Activation_Source_Bound_Receipt_2026-08-20.json`, "c".repeat(64), "sha256-bytes", "application/json"),
    reviewPrompt: pointer("mirrored-review-prompt", "external-review-prompt:2026-08-20", `${versionRoot}/mirrors/Chat_Pro_Core_Trunk_Activation_Review_Prompt_2026-08-20.md`, "d".repeat(64), "sha256-bytes", "text/markdown"),
    reviewPointer: pointer("structured-review-pointer", "core-trunk-activation-review-pointer:2026-08-20:0.1.0", `${versionRoot}/records/core-trunk-activation-review-pointer.json`, "e".repeat(64), "sha256-canonical-without-self-hash-field", "application/json"),
    publicationReadback: pointer("publication-readback", recordId, recordPath, "", "sha256-canonical-without-self-hash-field", "application/json"),
  };
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
  const reviewDecision = {
    documentType: "clover-core-publication-review-pointer",
    schemaVersion: "0.1.0",
    reviewPointerId: current.reviewPointer.recordId,
    recordedAt: "2026-08-20T23:15:00.000Z",
    reviewedImplementation,
    reviewTarget: current.sourceBoundReceipt,
    reviewEvidence: {
      reviewPrompt: current.reviewPrompt,
      finalReport: current.finalReport,
    },
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
    authority: {
      mergeApproved: false,
      productionApproved: false,
      action002Approved: false,
    },
    reviewPointerHash: "",
  };
  reviewDecision.reviewPointerHash = selfHash(reviewDecision, "reviewPointerHash");
  current.reviewPointer.hash = reviewDecision.reviewPointerHash;
  const workflow = (name, id, node) => ({
    name,
    runId: id,
    conclusion: "success",
    jobs: [{ jobId: id + 100, node, conclusion: "success" }],
    artifacts: [],
  });
  const readback = {
    documentType: "clover-core-publication-readback",
    schemaVersion: "0.1.0",
    readbackId: recordId,
    observedAt: "2026-08-20T23:15:00.000Z",
    evidenceStatus: "current-for-reviewed-implementation-head",
    verdict: "AMEND",
    reviewedImplementation,
    mirroredIssuanceArtifacts: {
      finalReport: current.finalReport,
      sourceBoundReceipt: current.sourceBoundReceipt,
      reviewPrompt: current.reviewPrompt,
      changedPathAllowlistScope: {
        repository: reviewedImplementation.repository,
        baseCommit: reviewedImplementation.baseCommit,
        reviewedHeadCommit: reviewedImplementation.headCommit,
        changedPathCount: 62,
        status: "exactly-matches-mirrored-receipt-and-reviewed-head-diff",
      },
    },
    reviewPointer: current.reviewPointer,
    github: {
      observedAt: "2026-08-20T23:10:00.000Z",
      sourceCommit: reviewedImplementation.headCommit,
      workflows: [
        workflow("Validate Clover master plan", 101, null),
        workflow("Validate Clover Context Gateway", 102, 22),
        workflow("Validate Clover Core Candidate", 103, 24),
      ],
    },
    vercel: {
      observedAt: "2026-08-20T23:15:00.000Z",
      deploymentId: "dpl_SyntheticReadback1",
      immutableUrl: "https://clover-context-gateway-preview-synthetic.vercel.app",
      projectId: "prj_SyntheticReadback1",
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
      today: { path: snapshot.today.metadata.relativePath, hash: snapshot.today.data.sessionHash },
      status: { path: snapshot.candidateStatus.metadata.relativePath, hash: snapshot.candidateStatus.data.statusHash.replace(/^sha256:/, "") },
      handoffIndex: { path: snapshot.handoff.metadata.relativePath, hash: snapshot.handoff.data.indexHash },
    },
    action002: {
      actionId: snapshot.today.data.actionId,
      envelopeHash: snapshot.today.data.envelopeHash,
      indexHash: snapshot.handoff.data.indexHash,
      status: "pending",
      lifecycleState: "proposed",
      ownerApprovalStatus: "pending",
      consumed: false,
      revoked: false,
    },
    precedence: {
      scope: "publication-readback-only",
      supersedes: [{
        path: snapshot.today.metadata.relativePath,
        hash: snapshot.today.data.sessionHash,
        claimScope: "exact-head-ci-and-gateway-preview-readback",
        reason: "Later exact-source readback replaces only the dated session's prepublication evidence claims.",
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
  current.publicationReadback.hash = readback.publicationReadbackHash;
  const entries = Object.values(current).map((item, offset) => ({
    sequence: offset + 1,
    ...item,
    recordedAt: "2026-08-20T23:16:00.000Z",
    status: "current",
  }));
  const index = {
    documentType: "clover-core-publication-index",
    schemaVersion: "0.1.0",
    indexId: "core-publication-index:2026-08-20",
    updatedAt: "2026-08-20T23:16:00.000Z",
    reviewedImplementationHead: reviewedImplementation.headCommit,
    lifecycle: {
      mode: "append-only-records-with-advancing-root-pointer",
      sequence,
      stableRootPath: "portfolio/core/publication/index.json",
      immutableSnapshotPath: `portfolio/core/publication/versions/0.1.0/records/core-publication-index-${String(sequence).padStart(4, "0")}.json`,
      previousIndexPath: sequence === 1
        ? null
        : `portfolio/core/publication/versions/0.1.0/records/core-publication-index-${String(sequence - 1).padStart(4, "0")}.json`,
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
  const artifactMetadata = (item) => ({
    repository: metadata.repository,
    ref: metadata.ref,
    commit: metadata.commit,
    relativePath: item.path,
    sourceType: "validated-publication-artifact",
    found: true,
    hashVerified: true,
    contentHash: item.hash,
    hashMode: item.hashMode,
    mediaType: item.mediaType,
    artifactType: item.artifactType,
    recordId: item.recordId,
  });
  const artifactState = (id, item, data = null) => ({
    id,
    available: true,
    data,
    url: null,
    metadata: artifactMetadata(item),
  });
  snapshot.publicationReadback = {
    id: "clover://publication/readback",
    available: true,
    data: readback,
    url: null,
    metadata: artifactMetadata(current.publicationReadback),
    index: {
      id: "clover://publication/index",
      available: true,
      data: index,
      url: null,
      metadata: {
        ...metadata,
        sourceType: "optional-candidate-repository-record",
        relativePath: "portfolio/core/publication/index.json",
        hashVerified: true,
        contentHash: index.publicationIndexHash,
        hashMode: "sha256-canonical-without-self-hash-field",
        immutableSnapshotPath: index.lifecycle.immutableSnapshotPath,
        immutableSnapshotByteIdentical: true,
        chainVerified: true,
        ancestorArtifactsVerified: true,
      },
    },
    artifacts: {
      report: artifactState("clover://publication/report", current.finalReport),
      receipt: artifactState("clover://publication/receipt", current.sourceBoundReceipt),
      reviewPrompt: artifactState("clover://publication/review-prompt", current.reviewPrompt),
      reviewDecision: artifactState("clover://publication/review-decision", current.reviewPointer, reviewDecision),
    },
  };
  return snapshot;
}

function resealPublication(snapshot) {
  const component = snapshot.publicationReadback;
  const review = component.artifacts?.reviewDecision;
  if (review?.data) {
    review.data.reviewPointerHash = selfHash(review.data, "reviewPointerHash");
    const reviewPointer = component.index.data.current.reviewPointer;
    reviewPointer.hash = review.data.reviewPointerHash;
    component.index.data.connectorIds["clover://publication/review-decision"].hash = reviewPointer.hash;
    const reviewEntry = component.index.data.entries.find((item) => item.path === reviewPointer.path);
    if (reviewEntry) reviewEntry.hash = reviewPointer.hash;
    review.metadata.contentHash = reviewPointer.hash;
    component.data.reviewPointer = structuredClone(reviewPointer);
  }
  component.data.publicationReadbackHash = selfHash(component.data, "publicationReadbackHash");
  const pointer = component.index.data.current.publicationReadback;
  pointer.hash = component.data.publicationReadbackHash;
  component.index.data.connectorIds["clover://publication/readback"].hash = pointer.hash;
  const entry = component.index.data.entries.find((item) => item.path === pointer.path);
  if (entry) entry.hash = pointer.hash;
  component.metadata.contentHash = pointer.hash;
  component.index.data.publicationIndexHash = selfHash(component.index.data, "publicationIndexHash");
  component.index.metadata.contentHash = component.index.data.publicationIndexHash;
  return snapshot;
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
  Object.assign(snapshot.handoff.metadata, {
    sourceType: "validated-historical-handoff-binding",
    view: "historical-source-binding",
    resolvedSnapshotPath: snapshot.today.data.handoffIndexPath,
    historicalIndexHash: snapshot.handoff.data.indexHash,
    currentSnapshotPath: "portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0003.json",
    currentIndexHash: "9".repeat(64),
    chainDepth: 3,
    chainVerified: true,
    stableRootByteIdentical: true,
  });
  snapshot.currentHandoff = structuredClone(snapshot.handoff);
  snapshot.currentHandoff.data.indexId = "handoff-index:synthetic:0003";
  snapshot.currentHandoff.data.entries[0].status = "completed";
  snapshot.currentHandoff.data.entries[0].lifecycle = {
    state: "consumed",
    singleUse: true,
    consumedAt: "2026-08-21T20:04:59.000Z",
    consumedByReceiptId: "handoff-receipt:synthetic:002",
    revokedAt: null,
    revocationEvidenceHash: null,
  };
  snapshot.currentHandoff.data.entries[0].ownerApproval = { status: "approved" };
  snapshot.currentHandoff.data.entries[0].receiptId = "handoff-receipt:synthetic:002";
  snapshot.currentHandoff.data.entries[0].receiptPath = "portfolio/core/handoff/versions/0.1.0/demonstration/action-receipt.json";
  snapshot.currentHandoff.data.entries[0].receiptHash = "8".repeat(64);
  snapshot.currentHandoff.data.entries[0].outcome = "succeeded";
  snapshot.currentHandoff.data.indexHash = selfHash(snapshot.currentHandoff.data, "indexHash");
  Object.assign(snapshot.currentHandoff.metadata, {
    sourceType: "validated-current-handoff-root",
    view: "current-stable-root",
    resolvedSnapshotPath: snapshot.handoff.metadata.currentSnapshotPath,
    currentIndexHash: snapshot.currentHandoff.data.indexHash,
  });
  snapshot.handoff.metadata.currentIndexHash = snapshot.currentHandoff.data.indexHash;

  const today = composeTodaySibling(snapshot);
  assert.equal(today.available, true);
  assert.equal(today.data.candidateStatus.asOf, "2026-08-20");
  assert.deepEqual(today.data.topPriorities, ["P0 trunk", "P1 branch", "P1 queued"]);
  assert.equal(today.data.recommendation, "Complete the exact candidate gate.");
  assert.equal(today.data.actionId, "CLOVER-2026-08-20-002");
  assert.equal(today.data.envelopeHash, "a".repeat(64));
  assert.equal(today.components.session.metadata.commit, commit);
  assert.equal(today.components.handoff.metadata.relativePath, "portfolio/core/handoff/index.json");
  assert.equal(today.publicationReadback.available, false);
  assert.equal(today.evidencePrecedence.applied, false);
  assert.equal(today.evidencePrecedence.status, "dated-session-only");

  const successor = composeTodaySibling(structuredClone(snapshot));
  assert.equal(successor.available, true, "a current lifecycle successor must not require a server.js change");
  assert.equal(successor.data.handoffIndexHash, snapshot.handoff.data.indexHash);
  assert.equal(successor.components.handoff.metadata.view, "historical-source-binding");
  assert.equal(successor.components.handoff.metadata.resolvedSnapshotPath, snapshot.today.data.handoffIndexPath);
  assert.equal(successor.components.handoff.metadata.currentIndexHash, snapshot.currentHandoff.data.indexHash);
  assert.equal(successor.components.handoff.metadata.chainVerified, true);
  assert.equal(successor.data.actionId, "CLOVER-2026-08-20-002");

  const publicationSnapshot = addPublicationReadback(structuredClone(snapshot));
  const withPublication = composeTodaySibling(publicationSnapshot);
  assert.equal(withPublication.available, true);
  assert.equal(withPublication.publicationReadback.available, true);
  assert.equal(withPublication.evidencePrecedence.applied, true);
  assert.equal(withPublication.evidencePrecedence.status, "verified-publication-readback-preferred");
  assert.equal(withPublication.publicationReadback.data.reviewedImplementation.headCommit, "2309bbc61dc8fcc7f2167c6c47db4a8b11cd8334");
  assert.equal(withPublication.publicationReadback.metadata.commit, commit, "container source must remain distinct from the reviewed implementation head");
  assert.equal(withPublication.components.handoff.metadata.currentIndexHash, snapshot.currentHandoff.data.indexHash);
  assert.equal(withPublication.components.handoff.metadata.view, "historical-source-binding");
  assert.deepEqual(withPublication.publicationReadback.metadata.containerSource, {
    repository: "chrisdortch/first",
    ref: "candidate",
    commit,
    relationship: "contains-finalization-records",
  });
  assert.equal(Object.hasOwn(withPublication.data, "publicationReadback"), false, "publication evidence must not be spread over the dated session");
  assert.deepEqual(withPublication.data.topPriorities, snapshot.today.data.topPriorities);
  assert.equal(withPublication.data.actionId, snapshot.today.data.actionId);

  const publicationSuccessor = addPublicationReadback(structuredClone(snapshot), {
    recordName: "core-trunk-activation-publication-readback-successor",
    recordId: "core-trunk-activation-publication-readback:2026-08-20:successor",
    sequence: 2,
    previousIndexHash: "9".repeat(64),
  });
  const successorProjection = composeTodaySibling(publicationSuccessor);
  assert.equal(successorProjection.publicationReadback.available, true, "the root pointer must select a successor without a hardcoded record filename");
  assert.match(successorProjection.publicationReadback.metadata.relativePath, /publication-readback-successor\.json$/);

  const publicationContradictions = [
    (value) => { value.publicationReadback.data.sourceBindings.today.hash = "6".repeat(64); },
    (value) => { value.publicationReadback.data.action002.ownerApprovalStatus = "approved"; },
    (value) => { value.publicationReadback.data.precedence.doesNotSupersede = ["historical-records"]; },
    (value) => { value.publicationReadback.data.vercel.standingProductionAuthority = true; },
    (value) => { value.publicationReadback.data.containerBinding.commit = "7".repeat(40); },
    (value) => { value.publicationReadback.index.data.reviewedImplementationHead = "8".repeat(40); },
    (value) => { value.publicationReadback.data.customerRecord = { name: "must-not-leak" }; },
    (value) => { value.publicationReadback.metadata.commit = "e".repeat(40); },
    (value) => { value.publicationReadback.artifacts.reviewDecision.data.decision.bindingApproval = true; },
    (value) => { value.publicationReadback.artifacts.reviewDecision.data.authority.productionApproved = true; },
    (value) => {
      value.publicationReadback.artifacts.reviewDecision.data.decision.decisionEvidenceStatus = "preserved";
      value.publicationReadback.artifacts.reviewDecision.data.decision.evidencePath = "conversation.txt";
      value.publicationReadback.artifacts.reviewDecision.data.decision.evidenceHash = "9".repeat(64);
    },
  ];
  for (const contradict of publicationContradictions) {
    const mutated = structuredClone(publicationSnapshot);
    contradict(mutated);
    resealPublication(mutated);
    const rejected = composeTodaySibling(mutated);
    assert.equal(rejected.available, true, "a bad optional overlay must not erase the dated Today session");
    assert.equal(rejected.data.actionId, snapshot.today.data.actionId);
    assert.equal(rejected.publicationReadback.available, false);
    assert.equal(rejected.publicationReadback.data, null);
    assert.equal(rejected.evidencePrecedence.status, "invalid-publication-readback-failed-closed");
  }

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

test("HTTP search and fetch expose only index-bound publication IDs with exact sanitized bytes", async () => {
  await withGateway(async (baseUrl) => {
    const searchResponse = await fetch(`${baseUrl}/api/search?q=publication&limit=25`);
    assert.equal(searchResponse.status, 200);
    const search = await searchResponse.json();
    const ids = new Set(search.results.map((item) => item.id));
    const expected = [
      "clover://publication/report",
      "clover://publication/receipt",
      "clover://publication/review-prompt",
      "clover://publication/review-decision",
      "clover://publication/readback",
    ];
    for (const id of expected) assert.ok(ids.has(id), `search omitted ${id}`);

    for (const id of expected) {
      const response = await fetch(`${baseUrl}/api/fetch?id=${encodeURIComponent(id)}`);
      assert.equal(response.status, 200, id);
      const item = await response.json();
      assert.equal(item.id, id);
      assert.equal(item.metadata.hashVerified, true);
      assert.equal(item.text.includes("/Users/"), false);
      assert.equal(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(item.text), false);
      assert.equal(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(item.text), false);
    }

    for (const id of [
      "clover://publication/readback/current",
      "clover://publication/../../private",
      "clover://publication/arbitrary",
    ]) {
      const response = await fetch(`${baseUrl}/api/fetch?id=${encodeURIComponent(id)}`);
      assert.equal(response.status, 404, `unbound ID unexpectedly resolved: ${id}`);
    }
  });
});

test("MCP fetch resolves the stable publication readback and rejects an unbound alias", async () => {
  await withGateway(async (baseUrl) => {
    const client = new Client({ name: "publication-readback-test", version: "0.1.0" });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`)));
      const fetched = await client.callTool({
        name: "fetch",
        arguments: { id: "clover://publication/readback" },
      });
      assert.equal(fetched.isError, undefined);
      assert.equal(fetched.structuredContent.id, "clover://publication/readback");
      assert.equal(fetched.structuredContent.metadata.hashVerified, true);
      const parsed = JSON.parse(fetched.structuredContent.text);
      assert.equal(parsed.documentType, "clover-core-publication-readback");
      assert.equal(parsed.reviewedImplementation.headCommit, "2309bbc61dc8fcc7f2167c6c47db4a8b11cd8334");

      const unbound = await client.callTool({
        name: "fetch",
        arguments: { id: "clover://publication/readback/current" },
      });
      assert.equal(unbound.structuredContent.metadata.found, false);
      assert.equal(unbound.structuredContent.text, "");
    } finally {
      await client.close();
    }
  });
});

test("POST /api/prepare-command routes the exact Day-1 matrix beside, never inside, Today", async () => {
  await withGateway(async (baseUrl) => {
    const authority = {
      previewOnlyByDefault: true,
      mergeApproved: false,
      productionDeploymentApproved: false,
      productionDataAccessApproved: false,
      domainOrDnsChangeApproved: false,
      secretChangeApproved: false,
      purchaseApproved: false,
      externalMessageApproved: false,
    };
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
      },
    ];

    for (const item of cases) {
      const response = await fetch(`${baseUrl}/api/prepare-command`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ request: item.request }),
      });
      assert.equal(response.status, 200, item.request);
      const body = await response.json();

      assert.equal(body.packet.schemaVersion, "1.2", item.request);
      assert.equal(Object.hasOwn(body.packet, "today"), false, item.request);
      assert.equal(Object.hasOwn(body.packet, "actionId"), false, item.request);
      assert.equal(body.packet.intent.id, "portfolio_operating_loop", item.request);
      assert.equal(body.packet.intent.mode, item.mode, item.request);
      assert.equal(body.packet.intent.requiresProject, false, item.request);
      assert.equal(body.packet.resolution.state, "resolved", item.request);
      assert.equal(body.packet.project?.projectId || null, item.projectId, item.request);
      assert.equal(body.packet.ownerActionCards.length, 0, item.request);
      assert.equal(body.packet.state, "refresh-required-before-execution", item.request);
      assert.deepEqual(body.packet.freshness.requiredSources, item.sources, item.request);
      assert.deepEqual(body.packet.freshness.sourcePlan.map(({ sourceId }) => sourceId), item.sources, item.request);
      assert.equal(body.packet.freshness.sourcePlan.some(({ connector }) => connector === "unresolved"), false, item.request);
      assert.deepEqual(body.packet.authority, authority, item.request);
      assert.equal(typeof body.today?.available, "boolean", item.request);
      if (!body.today.available) assert.equal(body.today.data, null, item.request);
      assert.equal(typeof body.followUpPrompt, "string", item.request);
      assert.ok(body.followUpPrompt.length > 0, item.request);
      assert.doesNotMatch(body.followUpPrompt, /\/Users\/|[a-f0-9]{40,64}|password|secret value|private key/i, item.request);
    }
  });
});
