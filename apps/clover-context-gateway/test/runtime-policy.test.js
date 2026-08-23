import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readJson(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, import.meta.url), "utf8"));
}

test("Gateway runtime policy stays bounded and install scripts stay disabled", async () => {
  const [packageJson, vercelConfig] = await Promise.all([
    readJson("../package.json"),
    readJson("../vercel.json")
  ]);

  assert.equal(packageJson.engines?.node, ">=20 <25");
  assert.equal(vercelConfig.installCommand, "npm ci --ignore-scripts --no-audit --no-fund");
});
