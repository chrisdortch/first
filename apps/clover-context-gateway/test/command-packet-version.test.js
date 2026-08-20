import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validateJsonSchema } from "../../../portfolio/core/lib/validators.mjs";
import { prepareCommand } from "../lib/command-router.js";

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TEST_DIRECTORY, "../../..");
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath));
const readJson = (relativePath) => JSON.parse(read(relativePath));

const status = { asOf: "2026-08-17", overallMissionCompletionEstimate: 41 };
const pointer = { currentVersion: "1.0.0", repository: "chrisdortch/first" };
const source = { ref: "candidate", commit: "a".repeat(40) };

test("Command Packet 1.1 schema bytes remain the deployed contract", () => {
  const digest = crypto.createHash("sha256").update(read("portfolio/schemas/clover-command-packet.schema.json")).digest("hex");
  assert.equal(digest, "b22cdb1a82852bc7fe419257d1bc79c9537a5483c753b79b5ac08002c14a1a36");
  assert.equal(readJson("portfolio/schemas/clover-command-packet.schema.json").properties.schemaVersion.const, "1.1");
});

test("candidate router emits Command Packet 1.2 and validates the portfolio loop contract", () => {
  const packet = prepareCommand({
    request: "Use CloverApps to tell me what I should know today across my current priorities",
    projects: [],
    status,
    pointer,
    source
  });
  const schema = readJson("portfolio/schemas/clover-command-packet-1.2.schema.json");
  assert.equal(packet.schemaVersion, "1.2");
  assert.equal(packet.intent.id, "portfolio_operating_loop");
  assert.equal(packet.intent.mode, "brief");
  assert.doesNotThrow(() => validateJsonSchema(schema, packet, {
    schemaDirectory: path.join(ROOT, "portfolio/schemas"),
    label: "command-packet-1.2"
  }));
});

test("Command Packet 1.2 rejects undeclared root, authority, and nested capability aliases", () => {
  const packet = prepareCommand({
    request: "Use CloverApps to tell me what I should know today across my current priorities",
    projects: [],
    status,
    pointer,
    source
  });
  const schema = readJson("portfolio/schemas/clover-command-packet-1.2.schema.json");
  const validate = (candidate) => validateJsonSchema(schema, candidate, {
    schemaDirectory: path.join(ROOT, "portfolio/schemas"),
    label: "command-packet-1.2"
  });

  const rootAlias = structuredClone(packet);
  rootAlias.productionWriteApproved = true;
  assert.throws(() => validate(rootAlias), /productionWriteApproved.*additional property/);

  const rootMergeAlias = structuredClone(packet);
  rootMergeAlias.mergeApproved = true;
  assert.throws(() => validate(rootMergeAlias), /mergeApproved.*additional property/);

  const authorityAlias = structuredClone(packet);
  authorityAlias.authority.secretRevealApproved = true;
  assert.throws(() => validate(authorityAlias), /secretRevealApproved.*additional property/);

  const nestedAlias = structuredClone(packet);
  nestedAlias.freshness.sourcePlan[0].productionWriteApproved = true;
  assert.throws(() => validate(nestedAlias), /productionWriteApproved.*additional property/);

  const canonicalEscalation = structuredClone(packet);
  canonicalEscalation.authority.mergeApproved = true;
  assert.throws(() => validate(canonicalEscalation), /must equal const false/);
});

test("the preserved 1.1 schema rejects the changed portfolio-loop contract", () => {
  const packet = prepareCommand({
    request: "Use CloverApps to tell me what should I know today across my current priorities",
    projects: [],
    status,
    pointer,
    source
  });
  assert.equal(packet.intent.id, "portfolio_operating_loop");
  packet.schemaVersion = "1.1";
  const legacySchema = readJson("portfolio/schemas/clover-command-packet.schema.json");
  assert.throws(() => validateJsonSchema(legacySchema, packet, {
    schemaDirectory: path.join(ROOT, "portfolio/schemas"),
    label: "legacy-command-packet"
  }), /is not in enum/);
});
