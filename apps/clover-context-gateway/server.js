import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { createContextStore } from "./lib/context-store.js";
import { commandPrompt, prepareCommand } from "./lib/command-router.js";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const contextRoot = process.env.CONTEXT_ROOT
  ? path.resolve(process.env.CONTEXT_ROOT)
  : path.resolve(appDir, "../..");
const widgetHtml = readFileSync(path.join(appDir, "public", "command-center.html"), "utf8");
const WIDGET_URI = "ui://clover/command-center.html";
const MCP_PATH = "/mcp";
const GATEWAY_VERSION = "0.1.1";

function store() {
  return createContextStore({ root: contextRoot });
}

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
  idempotentHint: true,
};

function textResult(payload) {
  return { content: [{ type: "text", text: JSON.stringify(payload) }] };
}

function headerValue(value) {
  const raw = Array.isArray(value) ? value[0] : String(value || "");
  return raw.split(",")[0].trim();
}

function requestBaseUrl(req) {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
  const protocol = headerValue(req.headers["x-forwarded-proto"]) || (req.socket.encrypted ? "https" : "http");
  const host = headerValue(req.headers["x-forwarded-host"]) || headerValue(req.headers.host) || `localhost:${process.env.PORT || 8787}`;
  return `${protocol}://${host}`;
}

function createCloverServer({ baseUrl = "https://github.com/chrisdortch/first" } = {}) {
  const server = new McpServer({ name: "clover-context-gateway", version: GATEWAY_VERSION });

  registerAppResource(
    server,
    "clover-command-center",
    WIDGET_URI,
    {},
    async () => ({
      contents: [
        {
          uri: WIDGET_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: widgetHtml,
          _meta: {
            ui: {
              prefersBorder: false,
              csp: { connectDomains: [], resourceDomains: [] },
            },
            "openai/widgetDescription": "Clover command center for choosing a project, speaking or typing guidance, and sending a bounded follow-up request.",
          },
        },
      ],
    })
  );

  registerAppTool(
    server,
    "search",
    {
      title: "Search Clover context",
      description: "Use this when the user asks about a Clover project, current plan, status, protocol, goal, next step, or portfolio relationship. Returns canonical Clover document IDs for a later fetch.",
      inputSchema: { query: z.string().min(1) },
      annotations: readOnlyAnnotations,
    },
    async ({ query }) => textResult({ results: store().search(query) })
  );

  registerAppTool(
    server,
    "fetch",
    {
      title: "Fetch Clover context item",
      description: "Use this after search when the model needs the complete canonical Clover item for source-grounded planning or execution.",
      inputSchema: { id: z.string().min(1) },
      annotations: readOnlyAnnotations,
    },
    async ({ id }) => {
      const item = store().fetch(id);
      if (!item) return textResult({ id, title: "Not found", text: "", url: `${baseUrl}/`, metadata: { found: false } });
      return textResult(item);
    }
  );

  registerAppTool(
    server,
    "prepare_clover_command",
    {
      title: "Prepare Clover command packet",
      description: "Use this when the user says 'Use CloverApps to…', asks to plant a new seed, evolve a project, inspect status, diagnose errors, build a preview, review a preview, back up a project, or prepare a release. It reads canonical context and produces a read-only, preview-first command packet; it does not change any project.",
      inputSchema: { request: z.string().min(1).max(12000) },
      annotations: readOnlyAnnotations,
    },
    async ({ request }) => {
      const snapshot = store().snapshot();
      const packet = prepareCommand({ request, projects: snapshot.projects, status: snapshot.status, pointer: snapshot.pointer });
      return {
        content: [{ type: "text", text: commandPrompt(packet) }],
        structuredContent: { packet, followUpPrompt: commandPrompt(packet) },
      };
    }
  );

  registerAppTool(
    server,
    "render_clover_command_center",
    {
      title: "Open Clover command center",
      description: "Use this to render the Clover command interface after canonical context has been searched or fetched, or when the user wants to speak or type a project-building instruction.",
      inputSchema: { request: z.string().max(12000).optional() },
      annotations: readOnlyAnnotations,
      _meta: { ui: { resourceUri: WIDGET_URI } },
    },
    async ({ request = "" }) => {
      const snapshot = store().snapshot();
      const packet = request
        ? prepareCommand({ request, projects: snapshot.projects, status: snapshot.status, pointer: snapshot.pointer })
        : null;
      return {
        content: [{ type: "text", text: "Opened the Clover command center." }],
        structuredContent: {
          status: snapshot.status,
          projects: snapshot.projects.map(({ projectId, title, priority, completionEstimate, estimateAsOf, verificationStatus }) => ({
            projectId,
            title,
            priority,
            completionEstimate,
            estimateAsOf,
            verificationStatus,
          })),
          packet,
          followUpPrompt: packet ? commandPrompt(packet) : "",
        },
        _meta: { ui: { resourceUri: WIDGET_URI } },
      };
    }
  );

  return server;
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function json(res, status, payload) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
  });
  res.end(JSON.stringify(payload));
}

const port = Number(process.env.PORT || 8787);
const httpServer = createServer(async (req, res) => {
  if (!req.url) return res.writeHead(400).end("Missing URL");
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const baseUrl = requestBaseUrl(req);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
      "access-control-allow-headers": "content-type, mcp-session-id",
      "access-control-expose-headers": "Mcp-Session-Id",
    });
    return res.end();
  }

  if (req.method === "GET" && url.pathname === "/") {
    return json(res, 200, {
      service: "clover-context-gateway",
      version: GATEWAY_VERSION,
      mode: "read-only",
      mcp: `${baseUrl}${MCP_PATH}`,
      commandCenter: `${baseUrl}/command-center`,
    });
  }

  if (req.method === "GET" && url.pathname === "/command-center") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    return res.end(widgetHtml);
  }

  if (req.method === "GET" && url.pathname === "/api/context") {
    return json(res, 200, store().snapshot());
  }

  if (req.method === "POST" && url.pathname === "/api/prepare-command") {
    try {
      const body = await readJsonBody(req);
      const snapshot = store().snapshot();
      const packet = prepareCommand({ request: body.request, projects: snapshot.projects, status: snapshot.status, pointer: snapshot.pointer });
      return json(res, 200, { packet, followUpPrompt: commandPrompt(packet) });
    } catch (error) {
      return json(res, 400, { error: error instanceof Error ? error.message : String(error) });
    }
  }

  if (url.pathname === MCP_PATH && ["GET", "POST", "DELETE"].includes(req.method || "")) {
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("access-control-expose-headers", "Mcp-Session-Id");
    const server = createCloverServer({ baseUrl });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (error) {
      console.error("MCP request failed", error);
      if (!res.headersSent) res.writeHead(500).end("Internal server error");
    }
    return;
  }

  res.writeHead(404).end("Not Found");
});

httpServer.listen(port, () => {
  console.log(`Clover Context Gateway listening on http://localhost:${port}`);
});