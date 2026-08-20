import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createActionEnvelope } from "../lib/action-envelope.mjs";
import { canonicalize, sha256Bytes, sha256Canonical } from "../lib/canonical-json.mjs";
import { createPreparedAnchor, decodeLedger } from "../lib/ledger.mjs";
import { validateJsonSchema, verifyJsonCatalog, verifySchemaCatalog } from "../lib/validators.mjs";

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(TEST_DIRECTORY, "../../..");
const CORE_DIRECTORY = path.join(REPOSITORY_ROOT, "portfolio/core");
const SCHEMA_DIRECTORY = path.join(CORE_DIRECTORY, "schemas");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(REPOSITORY_ROOT, relativePath), "utf8"));
}

test("all Core JSON, JSONL, and schema documents parse with unique canonical schema IDs", () => {
  const json = verifyJsonCatalog(CORE_DIRECTORY);
  const schemas = verifySchemaCatalog(path.join(CORE_DIRECTORY, "schemas"));
  assert.ok(json.jsonDocuments >= 20);
  assert.ok(json.jsonlRecords >= 9);
  assert.ok(schemas.schemaCount >= 14);
});

test("the v0.2 action fixture is the exact output of the hardened constructor and matches its root schema", () => {
  const fixture = readJson("portfolio/core/fixtures/action-envelope.v0.2.synthetic.json");
  const schema = readJson("portfolio/core/schemas/action-envelope.v0.2.schema.json");
  validateJsonSchema(schema, fixture, { schemaDirectory: SCHEMA_DIRECTORY, label: "action-envelope" });
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
  assert.equal(canonicalize(rebuilt), canonicalize(fixture));

  for (const mutate of [
    (copy) => { copy.environment = 7; },
    (copy) => { copy.singleUse = false; },
    (copy) => { copy.target = null; },
    (copy) => { copy.authorityHash = "not-a-hash"; }
  ]) {
    const invalid = structuredClone(fixture);
    mutate(invalid);
    assert.throws(
      () => validateJsonSchema(schema, invalid, { schemaDirectory: SCHEMA_DIRECTORY, label: "negative-action-envelope" }),
      /JSON Schema violation/
    );
  }
});

test("candidate v0.2 ledger anchors the legacy bytes and records the receipt hash correction", () => {
  const ledgerPath = path.join(CORE_DIRECTORY, "ledger/event-ledger.v0.2.candidate.jsonl");
  const ledgerBytes = fs.readFileSync(ledgerPath, "utf8");
  const events = decodeLedger(ledgerBytes);
  assert.equal(events[0].payload.legacyLedgerSha256, "b5218d898bab0aa37ef761e2a9670fd51fc4f56d43f899b44a7a0c32f1aea4f7");
  assert.equal(events[1].payload.legacyEventId, "evt_20260818_daily_log_ratification_0002");
  assert.equal(events[1].payload.correctReceiptContentHash, "8b0dbf7a34ce18409cad36929e4b2b04a17c033f44e32e21c2c751109a81ccbb");
  assert.equal(events[1].payload.legacyBytesChanged, false);
  const reconciliationPath = path.join(CORE_DIRECTORY, "evidence/ratification-reconciliation.2026-08-18.json");
  assert.equal(events[2].sources[0].contentHash, sha256Bytes(fs.readFileSync(reconciliationPath)));

  const storedAnchor = readJson("portfolio/core/ledger/anchors/first-v0.2.anchor-request.json");
  const rebuiltAnchor = createPreparedAnchor(events, ledgerBytes, storedAnchor.recordedAt);
  assert.equal(canonicalize(storedAnchor), canonicalize(rebuiltAnchor));
  assert.equal(storedAnchor.status, "prepared-unanchored");
  assert.equal(storedAnchor.independentAttestation, null);
  const eventSchema = readJson("portfolio/core/schemas/core-event.v0.2.schema.json");
  for (const event of events) validateJsonSchema(eventSchema, event, { schemaDirectory: SCHEMA_DIRECTORY, label: event.eventId });
  const anchorSchema = readJson("portfolio/core/schemas/ledger-anchor.v0.2.schema.json");
  validateJsonSchema(anchorSchema, storedAnchor, { schemaDirectory: SCHEMA_DIRECTORY, label: "ledger-anchor" });
});

test("expected Trust Slice receipt is self-hashed and limits deletion claims", () => {
  const receipt = readJson("portfolio/core/trust-slice/expected/trust-slice-receipt.json");
  const schema = readJson("portfolio/core/schemas/trust-slice-receipt.v0.1.schema.json");
  validateJsonSchema(schema, receipt, { schemaDirectory: SCHEMA_DIRECTORY, label: "trust-slice-receipt" });
  const { receiptHash, ...unsigned } = receipt;
  assert.equal(receiptHash, sha256Canonical(unsigned));
  assert.equal(receipt.postDeletion.localAbsenceVerified, true);
  assert.equal(receipt.postDeletion.externalCopiesUnknown, true);
  assert.equal(receipt.postDeletion.externalErasureClaimed, false);
});

test("lifecycle, ratifier trust, and reconciliation evidence satisfy their full schemas", () => {
  for (const [artifactPath, schemaPath] of [
    ["portfolio/core/constitution/LIFECYCLE_CANDIDATE_V0.2.json", "portfolio/core/schemas/constitution-lifecycle.v0.2.schema.json"],
    ["portfolio/core/constitution/RATIFIER_TRUST_CANDIDATE_V0.2.json", "portfolio/core/schemas/ratifier-trust.v0.2.schema.json"],
    ["portfolio/core/evidence/ratification-reconciliation.2026-08-18.json", "portfolio/core/schemas/evidence-report.v0.1.schema.json"],
    ["portfolio/core/trust-slice/fixtures/retention-policy.synthetic.json", "portfolio/core/schemas/retention-policy.v0.1.schema.json"]
  ]) {
    validateJsonSchema(readJson(schemaPath), readJson(artifactPath), {
      schemaDirectory: SCHEMA_DIRECTORY,
      label: artifactPath
    });
  }
});
