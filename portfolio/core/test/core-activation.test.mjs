import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { sha256Canonical } from "../lib/canonical-json.mjs";
import { validateJsonSchema } from "../lib/validators.mjs";
import { assertTodayHandoffBinding, validateCoreActivation } from "../../runtime/validate-core-activation.mjs";

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TEST_DIRECTORY, "../../..");
const SCHEMA_DIRECTORY = path.join(ROOT, "portfolio/core/schemas");
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));

test("the integrated Core activation candidate is source-bound and fail-closed", () => {
  const result = validateCoreActivation();
  assert.equal(result.status, "passed");
  assert.equal(result.actionId, "CLOVER-2026-08-20-002");
  assert.match(result.envelopeHash, /^[a-f0-9]{64}$/);
  assert.equal(result.protectedArtifactCount, 11);
  assert.equal(result.branchCapsuleCount, 6);
  assert.deepEqual(result.authorityGranted, []);
  assert.equal(result.mergePerformed, false);
  assert.equal(result.productionDeploymentPerformed, false);
});

test("Today is self-bound and rejects widened privacy or malformed identity", () => {
  const schema = readJson("portfolio/core/schemas/today-session.v0.1.schema.json");
  const session = readJson("portfolio/core/today/2026-08-20/session.json");
  const unsigned = structuredClone(session);
  delete unsigned.sessionHash;
  assert.equal(session.sessionHash, sha256Canonical(unsigned));
  validateJsonSchema(schema, session, { schemaDirectory: SCHEMA_DIRECTORY, label: "today-session" });

  for (const mutate of [
    (value) => { value.privacy.containsRawCellData = true; },
    (value) => { value.sessionId = "clover-today:malformed.0.1"; },
    (value) => { value.topPriorities[0].customerRecords = []; },
  ]) {
    const changed = structuredClone(session);
    mutate(changed);
    assert.throws(() => validateJsonSchema(schema, changed, {
      schemaDirectory: SCHEMA_DIRECTORY,
      label: "mutated-today-session",
    }), /JSON Schema violation/);
  }
});

test("the first proposed action resolves exactly once and remains non-authorizing", () => {
  const session = readJson("portfolio/core/today/2026-08-20/session.json");
  const index = readJson(session.handoffIndexPath);
  const matching = index.entries.filter((entry) => entry.actionId === session.actionId);
  assert.equal(matching.length, 1);
  const [entry] = matching;
  assert.equal(entry.envelopePath, session.envelopePath);
  assert.equal(entry.envelopeHash, session.envelopeHash);
  assert.equal(entry.status, "pending");
  assert.equal(entry.lifecycle.state, "proposed");
  assert.equal(entry.lifecycle.singleUse, true);
  assert.equal(entry.lifecycle.consumedAt, null);
  assert.equal(entry.lifecycle.revokedAt, null);
  assert.equal(entry.ownerApproval.status, "pending");
  assert.equal(entry.receiptHash, null);
});

test("a dated Today snapshot remains valid beneath an append-only successor root", () => {
  const session = readJson("portfolio/core/today/2026-08-20/session.json");
  const snapshot = readJson(session.handoffIndexPath);
  const successor = structuredClone(snapshot);
  successor.indexHash = "f".repeat(64);
  successor.previousIndexPath = session.handoffIndexPath;
  successor.previousIndexHash = snapshot.indexHash;
  const chain = [
    { path: "portfolio/core/handoff/versions/0.1.0/indexes/action-receipt-index-0002.json", index: successor },
    { path: session.handoffIndexPath, index: snapshot },
  ];
  assert.equal(assertTodayHandoffBinding(session, snapshot, chain).actionId, session.actionId);
  assert.throws(() => assertTodayHandoffBinding(session, snapshot, chain.slice(0, 1)), /not in the current append-only index chain/);
  const substituted = structuredClone(snapshot);
  substituted.indexHash = "0".repeat(64);
  assert.throws(() => assertTodayHandoffBinding(session, substituted, chain), /snapshot hash is stale/);
});
