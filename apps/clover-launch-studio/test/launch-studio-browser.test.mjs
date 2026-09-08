import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const shell = read("src/components/tree-command-center.tsx");
const ownerInput = read("src/components/owner-input-panel.tsx");
const css = read("src/app/globals.css");
const layout = read("src/app/layout.tsx");
const middleware = read("src/middleware.ts");

test("accept_browser_desktop", () => {
  assert.match(css, /tree-command-center/);
  for (const view of ["Today", "Tree", "Master Plan", "Branches", "Roots and Source Coverage", "Captain's Log", "Fruit Ledger", "Collaboration and JV Center", "Action Center", "System Health", "Launch Studio session"]) {
    assert.match(shell, new RegExp(view.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")));
  }
});

test("accept_browser_mobile", () => {
  assert.match(css, /@media \(max-width:/);
  assert.match(css, /grid-template-columns: 1fr/);
  assert.match(css, /overflow-wrap|word-break/);
});

test("accept_accessibility", () => {
  assert.match(layout, /Skip to Tree Command Center/);
  assert.match(`${shell}\n${ownerInput}`, /aria-live="polite"/);
  assert.match(ownerInput, /aria-labelledby/);
  assert.match(css, /focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
});

test("accept_browser_runtime", () => {
  assert.match(middleware, /origin !== request\.nextUrl\.origin/);
  assert.match(middleware, /Cache-Control/);
  assert.match(read("next.config.mjs"), /Content-Security-Policy/);
  assert.match(read("next.config.mjs"), /microphone=\(self\)/);
});
