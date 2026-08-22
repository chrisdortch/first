import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { verifyConstitutionState } from "../lib/constitution.mjs";

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(TEST_DIRECTORY, "../../..");

test("Constitution 0.1 remains byte-identical and current while 0.2 remains an unauthenticated draft", () => {
  const result = verifyConstitutionState(REPOSITORY_ROOT);
  assert.equal(result.valid, true);
  assert.equal(result.currentVersion, "0.1");
  assert.equal(result.currentConstitutionSha256, "82b90697389503182e44838df537268510680acffdff95b924967d11bb44169e");
  assert.equal(result.draftVersion, "0.2");
  assert.equal(result.trustedRatifierCredentialCount, 0);
});

test("draft 0.2 covers the missing governance boundaries without granting authority", () => {
  const text = fs.readFileSync(path.join(REPOSITORY_ROOT, "portfolio/core/constitution/versions/0.2.md"), "utf8");
  for (const concept of [
    /third-party information/i,
    /retention, deletion, legal hold/i,
    /emergency suspension/i,
    /recovery and succession/i,
    /authenticated approval and ratification/i,
    /policy precedence and default denial/i,
    /partial failure and replay resistance/i,
    /imported content is untrusted/i
  ]) {
    assert.match(text, concept);
  }
});
