import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const endpoint = new URL(process.env.CLOVER_MCP_URL || "http://127.0.0.1:8787/mcp");
const ownerEndpoint = new URL(process.env.CLOVER_OWNER_MCP_URL || "/owner-mcp", endpoint);
const client = new Client({ name: "clover-context-gateway-smoke", version: "0.1.0" });
const ownerClient = new Client({ name: "clover-owner-gateway-smoke", version: "0.1.0" });

try {
  await client.connect(new StreamableHTTPClientTransport(endpoint));
  const listed = await client.listTools();
  const names = listed.tools.map((tool) => tool.name).sort();
  assert.deepEqual(names, ["fetch", "prepare_clover_command", "render_clover_command_center", "search"]);

  const command = await client.callTool({
    name: "prepare_clover_command",
    arguments: { request: "Use CloverApps to evolve RollinD through a preview only" },
  });
  assert.equal(command.isError, undefined);
  assert.equal(command.structuredContent.packet.project.projectId, "rollindd");
  assert.equal(command.structuredContent.packet.authority.productionDeploymentApproved, false);
  assert.equal(command.structuredContent.packet.schemaVersion, "1.2");

  const search = await client.callTool({ name: "search", arguments: { query: "RollinD" } });
  assert.ok(search.structuredContent.results.some((item) => item.id === "clover://project/rollindd"));

  const publication = await client.callTool({ name: "fetch", arguments: { id: "clover://publication/readback" } });
  assert.equal(publication.isError, undefined);
  assert.equal(publication.structuredContent.id, "clover://publication/readback");
  assert.equal(publication.structuredContent.metadata.hashVerified, true);
  assert.equal(publication.structuredContent.metadata.contentHash, "1c0e95512f90d4cc99bfcc616823d70895c8923df23c06ece7a074b72fedec3a");
  const publicationRecord = JSON.parse(publication.structuredContent.text);
  assert.equal(publicationRecord.reviewedImplementation.headCommit, "2309bbc61dc8fcc7f2167c6c47db4a8b11cd8334");
  assert.equal(publicationRecord.action002.ownerApprovalStatus, "pending");

  const unbound = await client.callTool({ name: "fetch", arguments: { id: "clover://publication/readback/current" } });
  assert.equal(unbound.structuredContent.metadata.found, false);

  await ownerClient.connect(new StreamableHTTPClientTransport(ownerEndpoint));
  const ownerListed = await ownerClient.listTools();
  const ownerNames = ownerListed.tools.map((tool) => tool.name).sort();
  assert.deepEqual(ownerNames, ["clover_owner_request"]);

  const ownerRequest = "  I need some perspective. ☘️  ";
  const owner = await ownerClient.callTool({ name: "clover_owner_request", arguments: { request: ownerRequest } });
  assert.equal(owner.isError, undefined);
  assert.equal(owner.structuredContent.requestIntegrity.receivedRequest, ownerRequest);
  assert.equal(owner.structuredContent.requestIntegrity.utf8Bytes, Buffer.byteLength(ownerRequest, "utf8"));
  assert.equal(owner.structuredContent.requestIntegrity.sha256, createHash("sha256").update(ownerRequest, "utf8").digest("hex"));
  assert.equal(owner.structuredContent.requestIntegrity.callerClaimedOrigin, "chat-host-or-widget-direct");
  assert.equal(owner.structuredContent.sourceHeader.intent, "portfolio_operating_loop");
  assert.equal(owner.structuredContent.sourceHeader.mode, "brief");
  assert.equal(owner.structuredContent.sourceHeader.consequentialAuthorityGranted, false);
  assert.equal(owner.structuredContent.answerContract.packetControlsRouting, true);
  assert.equal(owner.structuredContent.answerContract.memoryMayOverridePacket, false);
  const ownerFetch = await ownerClient.callTool({ name: "fetch", arguments: { id: "clover://projects" } });
  assert.equal(ownerFetch.isError, true);

  console.log(JSON.stringify({
    status: "passed",
    technical: { endpoint: endpoint.toString(), tools: names },
    owner: { endpoint: ownerEndpoint.toString(), tools: ownerNames },
  }));
} finally {
  await ownerClient.close();
  await client.close();
}
