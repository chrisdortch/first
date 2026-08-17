import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { handler } from "../server.js";

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
