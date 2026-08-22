#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createActionEnvelope } from "../lib/action-envelope.mjs";
import { canonicalize, sha256Bytes } from "../lib/canonical-json.mjs";
import { verifyConstitutionState } from "../lib/constitution.mjs";
import { createPreparedAnchor, decodeLedger } from "../lib/ledger.mjs";
import { runTrustSlice } from "../lib/trust-slice.mjs";
import { validateJsonSchema, verifyJsonCatalog, verifySchemaCatalog } from "../lib/validators.mjs";
import { validateCoreActivation } from "../../runtime/validate-core-activation.mjs";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIRECTORY, "../../..");
const CORE_DIRECTORY = path.join(REPOSITORY_ROOT, "portfolio/core");
const SCHEMA_DIRECTORY = path.join(CORE_DIRECTORY, "schemas");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(REPOSITORY_ROOT, relativePath), "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function verifyActionFixture() {
  const fixture = readJson("portfolio/core/fixtures/action-envelope.v0.2.synthetic.json");
  validateJsonSchema(readJson("portfolio/core/schemas/action-envelope.v0.2.schema.json"), fixture, {
    schemaDirectory: SCHEMA_DIRECTORY,
    label: "action-envelope"
  });
  const rebuilt = createActionEnvelope({
    envelopeId: fixture.envelopeId,
    requestId: fixture.requestId,
    intent: fixture.intent,
    createdAt: fixture.createdAt,
    expiresAt: fixture.expiresAt,
    nonce: fixture.nonce,
    singleUse: fixture.singleUse,
    accountId: fixture.accountId,
    projectId: fixture.projectId,
    environment: fixture.environment,
    target: fixture.target,
    operation: fixture.operation,
    handlerId: fixture.handlerId,
    tool: fixture.tool,
    verifierId: fixture.verifierId,
    verificationTool: fixture.verificationTool,
    readbackSource: fixture.readbackSource,
    expectedPostcondition: fixture.expectedPostcondition,
    parameters: fixture.parameters,
    dataClasses: fixture.dataClasses,
    cost: fixture.cost,
    rollback: fixture.rollback,
    stopConditions: fixture.stopConditions,
    policy: fixture.policy,
    approvalRequired: fixture.approvalRequired,
    approval: fixture.approval
  });
  assert(canonicalize(rebuilt) === canonicalize(fixture), "Action Envelope fixture is not constructor-canonical");
  return fixture;
}

function verifyCandidateLedger() {
  const relativeLedgerPath = "portfolio/core/ledger/event-ledger.v0.2.candidate.jsonl";
  const ledgerBytes = fs.readFileSync(path.join(REPOSITORY_ROOT, relativeLedgerPath), "utf8");
  const events = decodeLedger(ledgerBytes);
  const eventSchema = readJson("portfolio/core/schemas/core-event.v0.2.schema.json");
  for (const event of events) validateJsonSchema(eventSchema, event, { schemaDirectory: SCHEMA_DIRECTORY, label: event.eventId });
  for (const event of events) {
    for (const source of event.sources) {
      const sourcePath = path.join(REPOSITORY_ROOT, source.sourceId);
      assert(fs.existsSync(sourcePath), `Ledger source is absent: ${source.sourceId}`);
      assert(sha256Bytes(fs.readFileSync(sourcePath)) === source.contentHash,
        `Ledger source hash mismatch: ${source.sourceId}`);
    }
  }
  const anchor = readJson("portfolio/core/ledger/anchors/first-v0.2.anchor-request.json");
  validateJsonSchema(readJson("portfolio/core/schemas/ledger-anchor.v0.2.schema.json"), anchor, {
    schemaDirectory: SCHEMA_DIRECTORY,
    label: "ledger-anchor"
  });
  const rebuilt = createPreparedAnchor(events, ledgerBytes, anchor.recordedAt);
  assert(canonicalize(rebuilt) === canonicalize(anchor), "Prepared anchor does not match candidate ledger bytes");
  assert(anchor.status === "prepared-unanchored" && anchor.independentAttestation === null,
    "Local anchor must not claim independent anchoring");
  assert(events[1].payload.correctReceiptContentHash === "8b0dbf7a34ce18409cad36929e4b2b04a17c033f44e32e21c2c751109a81ccbb",
    "Legacy receipt-hash correction is absent");
  assert(events[1].payload.legacyBytesChanged === false, "Legacy correction must be append-only");
  return { events, anchor };
}

function verifyDeterministicTrustSlice() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "clover-core-verify-"));
  try {
    const result = runTrustSlice({ workspaceDirectory: path.join(directory, "run") });
    const expected = readJson("portfolio/core/trust-slice/expected/trust-slice-receipt.json");
    assert(canonicalize(result.receipt) === canonicalize(expected), "Trust Slice receipt changed");
    return result.receipt;
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

const constitution = verifyConstitutionState(REPOSITORY_ROOT);
const jsonCatalog = verifyJsonCatalog(CORE_DIRECTORY);
const schemaCatalog = verifySchemaCatalog(path.join(CORE_DIRECTORY, "schemas"));
const action = verifyActionFixture();
const ledger = verifyCandidateLedger();
const trustSlice = verifyDeterministicTrustSlice();
const coreActivation = validateCoreActivation();
const reconciliation = readJson("portfolio/core/evidence/ratification-reconciliation.2026-08-18.json");
for (const [artifact, schema] of [
  [readJson("portfolio/core/constitution/LIFECYCLE_CANDIDATE_V0.2.json"), readJson("portfolio/core/schemas/constitution-lifecycle.v0.2.schema.json")],
  [readJson("portfolio/core/constitution/RATIFIER_TRUST_CANDIDATE_V0.2.json"), readJson("portfolio/core/schemas/ratifier-trust.v0.2.schema.json")],
  [reconciliation, readJson("portfolio/core/schemas/evidence-report.v0.1.schema.json")]
]) validateJsonSchema(schema, artifact, { schemaDirectory: SCHEMA_DIRECTORY, label: "core-artifact" });
assert(Array.isArray(reconciliation.authorityGranted) && reconciliation.authorityGranted.length === 0,
  "Reconciliation evidence must grant no authority");

process.stdout.write(`${JSON.stringify({
  status: "passed",
  node: process.version,
  constitution,
  jsonCatalog: {
    jsonDocuments: jsonCatalog.jsonDocuments,
    jsonlRecords: jsonCatalog.jsonlRecords
  },
  schemaCount: schemaCatalog.schemaCount,
  actionEnvelope: {
    envelopeId: action.envelopeId,
    authorityHash: action.authorityHash,
    environment: action.environment,
    approvalRequired: action.approvalRequired
  },
  ledger: {
    eventCount: ledger.events.length,
    headEventHash: ledger.events.at(-1).eventHash,
    anchorStatus: ledger.anchor.status,
    independentlyAnchored: false
  },
  trustSlice: {
    result: trustSlice.result,
    receiptHash: trustSlice.receiptHash,
    synthetic: trustSlice.synthetic,
    localAbsenceVerified: trustSlice.postDeletion.localAbsenceVerified,
    externalCopiesUnknown: trustSlice.postDeletion.externalCopiesUnknown
  },
  coreActivation,
  authorityGranted: [],
  mergePerformed: false,
  deploymentPerformed: false
}, null, 2)}\n`);
