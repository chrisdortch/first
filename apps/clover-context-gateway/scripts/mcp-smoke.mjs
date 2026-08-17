import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const endpoint = new URL(process.env.CLOVER_MCP_URL || "http://127.0.0.1:8787/mcp");
const client = new Client({ name: "clover-context-gateway-smoke", version: "0.1.0" });

try {
  await client.connect(new StreamableHTTPClientTransport(endpoint));
  const listed = await client.listTools();
  const names = listed.tools.map((tool) => tool.name).sort();
  for (const expected of ["fetch", "prepare_clover_command", "render_clover_command_center", "search"]) {
    assert.ok(names.includes(expected), `Missing MCP tool: ${expected}`);
  }

  const command = await client.callTool({
    name: "prepare_clover_command",
    arguments: { request: "Use CloverApps to evolve RollinD through a preview only" },
  });
  assert.equal(command.isError, undefined);
  assert.equal(command.structuredContent.packet.project.projectId, "rollindd");
  assert.equal(command.structuredContent.packet.authority.productionDeploymentApproved, false);
  assert.equal(command.structuredContent.packet.schemaVersion, "1.1");

  const search = await client.callTool({ name: "search", arguments: { query: "RollinD" } });
  assert.ok(search.structuredContent.results.some((item) => item.id === "clover://project/rollindd"));

  console.log(JSON.stringify({ status: "passed", endpoint: endpoint.toString(), tools: names }));
} finally {
  await client.close();
}
