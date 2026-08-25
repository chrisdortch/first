import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const shell = read("src/components/launch-studio-shell.tsx");
const css = read("src/app/globals.css");
const layout = read("src/app/layout.tsx");
const middleware = read("src/middleware.ts");

test("accept_browser_desktop", () => {
  assert.match(css, /studio-grid/);
  assert.match(shell, /Evidence timeline/);
  assert.match(shell, /Decision rails/);
  assert.match(shell, /Preview/);
});

test("accept_browser_mobile", () => {
  assert.match(css, /@media \(max-width:/);
  assert.match(css, /grid-template-columns: 1fr/);
  assert.match(css, /overflow-wrap|word-break/);
});

test("accept_accessibility", () => {
  assert.match(layout, /Skip to Launch Studio/);
  assert.match(shell, /aria-live="polite"/);
  assert.match(css, /focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
});

test("accept_browser_runtime", () => {
  assert.match(middleware, /origin !== request\.nextUrl\.origin/);
  assert.match(middleware, /Cache-Control/);
  assert.match(read("next.config.mjs"), /Content-Security-Policy/);
});
