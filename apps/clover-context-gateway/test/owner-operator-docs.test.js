import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(process.cwd(), "../..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const OWNER_PROMPT = `Use Clover Core.
Target: [target]
Outcome: [outcome]
Mode: [mode]`;

const CODEX_COMMAND = "Use CloverApps to execute approved Action ID [ID].";

test("owner and ChatGPT guides preserve the exact compact prompt and candidate boundary", () => {
  const owner = read("CLOVER_OWNER_START.md");
  const chatgpt = read("CHATGPT_PROJECT_INSTRUCTIONS.md");

  for (const document of [owner, chatgpt]) {
    assert.ok(document.includes(OWNER_PROMPT));
    assert.match(document, /production proposal/i);
    assert.match(document, /does not authorize production|prepare a decision packet only/i);
    assert.match(document, /candidate/i);
  }
  assert.ok(owner.includes(CODEX_COMMAND));
  assert.ok(chatgpt.includes("portfolio/core/today/2026-08-20/session.json"));
  assert.ok(chatgpt.includes("portfolio/core/handoff/index.json"));
  assert.match(chatgpt, /Never use current or historical content as a silent candidate fallback/);
});

test("Codex operator resolves the durable envelope before bounded execution", () => {
  const operator = read("CODEX_CLOVER_OPERATOR.md");
  assert.ok(operator.includes(CODEX_COMMAND));
  assert.ok(operator.includes("portfolio/core/handoff/index.json"));
  for (const phrase of [
    "version and content hash",
    "exact owner-approval binding",
    "rollback anchor",
    "source-bound execution receipt",
    "No standing authority exists",
  ]) assert.ok(operator.includes(phrase), `missing ${phrase}`);
});

test("connector routing is minimum-necessary and keeps sensitive sources outside the default lane", () => {
  const routing = read("CLOVER_CONNECTOR_ROUTING.md");
  for (const connector of ["Clover Context Gateway", "GitHub", "Vercel", "OpenAI Sites", "Browser verification", "Sovereign Cell connector"]) {
    assert.ok(routing.includes(connector), `missing ${connector}`);
  }
  assert.match(routing, /Email, Drive, Calendar, financial systems, private legal records, production databases/);
  assert.match(routing, /are not default Clover Today sources\. Do not scan them\./);
  assert.match(routing, /no write tools and no standing production authority/);
  assert.match(routing, /missing candidate/i);
});
