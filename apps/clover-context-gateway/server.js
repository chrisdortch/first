import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { createAutoContextStore } from "./lib/context-store.js";
import { commandPrompt, prepareCommand } from "./lib/command-router.js";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const contextStore = createAutoContextStore({ appDir });
const configuredBaseUrl = process.env.PUBLIC_BASE_URL || "";
const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";
const maxBodyBytes = Number(process.env.MAX_BODY_BYTES || 65536);
const widgetHtml = readFileSync(path.join(appDir, "public", "command-center.html"), "utf8");
const WIDGET_URI = "ui://clover/command-center.html";
const MCP_PATH = "/mcp";
const VERSION = "0.3.1";

const SERVER_INSTRUCTIONS = [
  "When the user says 'Use CloverApps to…', call prepare_clover_command before planning execution.",
  "For project/status questions, search first and fetch only the target records needed for the current task.",
  "When the optional Clover Today candidate is available, treat it as a dated candidate sibling to the canonical Command Packet, never as a replacement for current status or as authority.",
  "Canonical Clover records preserve intent and dated state; before any mutation, refresh materially relevant live facts through the native GitHub, Vercel, Drive, Sites, analytics, or Vault connector available in the conversation.",
  "Treat unavailable or contradictory facts as unknown. Never infer merge, production deployment, production-data access, domain/DNS, secret, purchase, messaging, agreement, or publication authority.",
  "Use deterministic checks before model visual/browser review and return exact receipts and status evidence.",
].join(" ");

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
  idempotentHint: true,
};

function requestBaseUrl(req) {
  if (configuredBaseUrl) return configuredBaseUrl.replace(/\/$/, "");
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const protocol = forwardedProto || (req.socket?.encrypted ? "https" : "http");
  return `${protocol}://${req.headers.host || "localhost"}`;
}

function resultWithStructured(payload) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: payload,
  };
}

function firstPresent(record, keys) {
  if (!record || typeof record !== "object") return null;
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return null;
}

function componentPointer(component) {
  return {
    id: component?.id || null,
    available: component?.available === true,
    metadata: component?.metadata || null,
  };
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function documentSelfHash(document, field, { prefix = false } = {}) {
  if (!document || typeof document !== "object" || Array.isArray(document)) return null;
  const clone = structuredClone(document);
  delete clone[field];
  const digest = createHash("sha256").update(canonicalJson(clone)).digest("hex");
  return prefix ? `sha256:${digest}` : digest;
}

function componentHasIdentity(component, id, relativePath) {
  return component?.id === id
    && component?.metadata?.relativePath === relativePath;
}

function candidateStatusContract(component) {
  const data = component?.data;
  return componentHasIdentity(component, "clover://status/candidate/2026-08-20", "portfolio/status/candidates/2026-08-20/status.json")
    && data?.documentType === "clover-master-status-candidate"
    && data?.schemaVersion === "0.2-candidate"
    && data?.status === "candidate-unmerged-undeployed"
    && data?.statusHash === documentSelfHash(data, "statusHash", { prefix: true });
}

function registryCandidateContract(component) {
  const data = component?.data;
  return componentHasIdentity(component, "clover://registry/candidate/2.0.0", "portfolio/registry/projections/core-project-index.v2.json")
    && data?.documentType === "clover-core-portfolio-projection"
    && data?.schemaVersion === "2.0.0"
    && data?.status === "candidate-unmerged-undeployed"
    && data?.projectionPolicy?.rawCellDataIncluded === false
    && data?.architecture?.rawCellDataStoredInKernel === false
    && Array.isArray(data?.projects)
    && data.projects.length === 45;
}

function sessionContract(component) {
  const data = component?.data;
  return componentHasIdentity(component, "clover://today/candidate/2026-08-20", "portfolio/core/today/2026-08-20/session.json")
    && data?.documentType === "clover-today-owner-session"
    && data?.schemaVersion === "0.1.0"
    && /^[a-f0-9]{64}$/.test(data?.sessionHash || "")
    && data?.sessionHash !== "0".repeat(64)
    && data?.sessionHash === documentSelfHash(data, "sessionHash");
}

function handoffContract(component) {
  const data = component?.data;
  return componentHasIdentity(component, "clover://handoff/index", "portfolio/core/handoff/index.json")
    && data?.documentType === "clover-handoff-action-receipt-index"
    && data?.schemaVersion === "0.1.0"
    && /^[a-f0-9]{64}$/.test(data?.indexHash || "")
    && data?.indexHash === documentSelfHash(data, "indexHash")
    && Array.isArray(data?.entries);
}

function componentsShareExactSource(components) {
  const metadata = components.map((component) => component?.metadata);
  if (metadata.some((item) => !item || item.found !== true)) return false;
  const [{ repository, commit }] = metadata;
  return typeof repository === "string"
    && repository.length > 0
    && /^[a-f0-9]{40}$/.test(commit || "")
    && metadata.every((item) => item.repository === repository && item.commit === commit);
}

function matchesPendingHandoff(entry, { actionId, envelopePath, envelopeHash }) {
  return entry?.actionId === actionId
    && entry?.envelopePath === envelopePath
    && entry?.envelopeHash === envelopeHash
    && entry?.status === "pending"
    && entry?.outcome === "pending"
    && entry?.lifecycle?.state === "proposed"
    && entry?.lifecycle?.singleUse === true
    && entry?.lifecycle?.consumedAt === null
    && entry?.lifecycle?.consumedByReceiptId === null
    && entry?.lifecycle?.revokedAt === null
    && entry?.lifecycle?.revocationEvidenceHash === null
    && entry?.ownerApproval?.status === "pending"
    && entry?.receiptId === null
    && entry?.receiptPath === null
    && entry?.receiptHash === null;
}

export function composeTodaySibling(snapshot = {}) {
  const session = snapshot.today || { id: "clover://today/candidate/2026-08-20", available: false, data: null, metadata: null };
  const candidateStatus = snapshot.candidateStatus || { available: false, data: null, metadata: null };
  const registryCandidate = snapshot.registryCandidate || { available: false, data: null, metadata: null };
  const handoff = snapshot.handoff || { available: false, data: null, metadata: null };
  const source = session.available === true && session.data && typeof session.data === "object" ? session.data : null;
  const action = firstPresent(source, ["action", "recommendedAction", "actionEnvelope"]);
  const topPriorities = firstPresent(source, ["topPriorities"]);
  const recommendation = firstPresent(source, ["recommendation"]);
  const actionId = firstPresent(source, ["actionId"]) ?? firstPresent(action, ["actionId", "id", "envelopeId"]);
  const envelopePath = firstPresent(source, ["envelopePath"]) ?? firstPresent(action, ["envelopePath", "path"]);
  const envelopeHash = firstPresent(source, ["envelopeHash"]) ?? firstPresent(action, ["envelopeHash", "hash"]);
  const handoffIndexPath = firstPresent(source, ["handoffIndexPath"]);
  const handoffIndexHash = firstPresent(source, ["handoffIndexHash"]);
  const connectorPlan = firstPresent(source, ["connectorPlan"]);
  const authorityRequired = firstPresent(source, ["authorityRequired"]);
  const sourceFreshness = firstPresent(source, ["sourceFreshness"]);
  const privacy = firstPresent(source, ["privacy"]);
  const handoffEntries = Array.isArray(handoff?.data?.entries) ? handoff.data.entries : [];
  const handoffMatches = handoffEntries.filter((entry) => matchesPendingHandoff(entry, {
    actionId,
    envelopePath,
    envelopeHash,
  }));
  const componentSourcesExact = componentsShareExactSource([session, candidateStatus, registryCandidate, handoff]);
  const complete = session.available === true
    && candidateStatus.available === true
    && registryCandidate.available === true
    && handoff.available === true
    && Array.isArray(topPriorities)
    && topPriorities.length === 3
    && recommendation !== null
    && typeof actionId === "string"
    && /^CLOVER-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{3}$/.test(actionId)
    && typeof envelopePath === "string"
    && envelopePath.length > 0
    && typeof envelopeHash === "string"
    && /^[a-f0-9]{64}$/.test(envelopeHash)
    && typeof handoffIndexPath === "string"
    && /^portfolio\/core\/handoff\/versions\/0\.1\.0\/indexes\/action-receipt-index-[0-9]{4}\.json$/.test(handoffIndexPath)
    && typeof handoffIndexHash === "string"
    && /^[a-f0-9]{64}$/.test(handoffIndexHash)
    && handoffIndexHash === handoff?.data?.indexHash
    && Array.isArray(connectorPlan)
    && connectorPlan.length > 0
    && Array.isArray(authorityRequired)
    && authorityRequired.length > 0
    && sourceFreshness !== null
    && privacy?.publicSanitizedProjection === true
    && privacy?.containsRawCellData === false
    && privacy?.containsPlaintextSecrets === false
    && privacy?.containsProductionPrivateData === false
    && handoffMatches.length === 1
    && componentSourcesExact
    && candidateStatusContract(candidateStatus)
    && registryCandidateContract(registryCandidate)
    && sessionContract(session)
    && handoffContract(handoff);

  return {
    id: session.id || "clover://today/candidate/2026-08-20",
    available: complete,
    data: complete
      ? {
          ...source,
          candidateStatus: candidateStatus.data,
          topPriorities,
          recommendation,
          actionId,
          envelopePath,
          envelopeHash,
          connectorPlan,
          authorityRequired,
        }
      : null,
    metadata: {
      ...(session.metadata || {}),
      complete,
      contract: "minimum-useful-core-2026-08-20",
    },
    components: {
      candidateStatus: componentPointer(candidateStatus),
      registryCandidate: componentPointer(registryCandidate),
      session: componentPointer(session),
      handoff: componentPointer(handoff),
    },
  };
}

function createCloverServer(baseUrl) {
  const server = new McpServer(
    { name: "clover-context-gateway", version: VERSION },
    { instructions: SERVER_INSTRUCTIONS }
  );

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
            "openai/widgetDescription": "Clover command center for speaking or typing one instruction and binding it to current canonical project context, freshness requirements, cost lanes, and owner-only safety gates.",
          },
        },
      ],
    })
  );

  server.registerTool(
    "search",
    {
      title: "Search Clover context",
      description: "Use this when the user asks about a Clover project, current plan, status, protocol, goal, next step, portfolio relationship, or the phrase 'Use CloverApps to…'. Return stable canonical IDs, then call fetch only for the relevant items.",
      inputSchema: { query: z.string().min(1), limit: z.number().int().min(1).max(25).optional() },
      annotations: readOnlyAnnotations,
    },
    async ({ query, limit = 10 }) => resultWithStructured({ results: await contextStore.search(query, limit) })
  );

  server.registerTool(
    "fetch",
    {
      title: "Fetch Clover context item",
      description: "Use this after search when the model needs the complete canonical Clover item for source-grounded planning or execution. Stable project IDs use clover://project/<projectId>.",
      inputSchema: { id: z.string().min(1) },
      annotations: readOnlyAnnotations,
    },
    async ({ id }) => {
      const item = await contextStore.fetch(id);
      if (!item) return resultWithStructured({ id, title: "Not found", text: "", url: `${baseUrl}/`, metadata: { found: false } });
      return resultWithStructured(item);
    }
  );

  server.registerTool(
    "prepare_clover_command",
    {
      title: "Prepare Clover command packet",
      description: "Use this when the user says 'Use CloverApps to…', plants a seed, evolves or diagnoses a project, inspects status, builds or reviews a preview, backs up or restore-tests a project, or prepares a release. It returns a read-only command packet and exact live-source refresh plan; it changes nothing.",
      inputSchema: { request: z.string().min(1).max(12000) },
      annotations: readOnlyAnnotations,
    },
    async ({ request }) => {
      const snapshot = await contextStore.snapshot();
      const today = composeTodaySibling(snapshot);
      const packet = prepareCommand({
        request,
        projects: snapshot.projects,
        status: snapshot.status,
        pointer: snapshot.pointer,
        source: snapshot.source,
      });
      return {
        content: [{ type: "text", text: commandPrompt(packet) }],
        structuredContent: {
          packet,
          today,
          followUpPrompt: commandPrompt(packet),
        },
      };
    }
  );

  registerAppTool(
    server,
    "render_clover_command_center",
    {
      title: "Open Clover command center",
      description: "Use this when the user wants a visible Clover building interface for speaking or typing a project instruction. It renders current public portfolio context and can prepare, but not execute, a bounded command.",
      inputSchema: { request: z.string().max(12000).optional() },
      annotations: readOnlyAnnotations,
      _meta: { ui: { resourceUri: WIDGET_URI } },
    },
    async ({ request = "" }) => {
      const snapshot = await contextStore.snapshot();
      const today = composeTodaySibling(snapshot);
      const packet = request
        ? prepareCommand({ request, projects: snapshot.projects, status: snapshot.status, pointer: snapshot.pointer, source: snapshot.source })
        : null;
      return {
        content: [{ type: "text", text: "Opened the read-only Clover command center." }],
        structuredContent: {
          status: snapshot.status,
          source: snapshot.source,
          projects: snapshot.projects.map(({ projectId, title, priority, completionEstimate, estimateAsOf, verificationStatus }) => ({
            projectId,
            title,
            priority,
            completionEstimate,
            estimateAsOf,
            verificationStatus,
          })),
          today,
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
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > maxBodyBytes) throw new Error(`Request body exceeds ${maxBodyBytes} bytes.`);
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function securityHeaders() {
  return {
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "permissions-policy": "camera=(), geolocation=(), payment=()",
    "content-security-policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors https://chatgpt.com https://chat.openai.com",
  };
}

function json(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": allowedOrigin,
    ...securityHeaders(),
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload));
}

export async function handler(req, res) {
  try {
    if (!req.url) return res.writeHead(400).end("Missing URL");
    const baseUrl = requestBaseUrl(req);
    const url = new URL(req.url, baseUrl);

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": allowedOrigin,
        "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
        "access-control-allow-headers": "content-type, accept, authorization, mcp-session-id, mcp-protocol-version",
        "access-control-expose-headers": "Mcp-Session-Id",
        ...securityHeaders(),
      });
      return res.end();
    }

    if (req.method === "GET" && url.pathname === "/") {
      let source = null;
      try {
        source = (await contextStore.snapshot()).source;
      } catch (error) {
        source = { mode: contextStore.mode, error: error instanceof Error ? error.message : String(error) };
      }
      return json(res, 200, {
        service: "clover-context-gateway",
        version: VERSION,
        mode: "read-only",
        contextMode: contextStore.mode,
        contextSource: source,
        mcp: `${baseUrl}${MCP_PATH}`,
        commandCenter: `${baseUrl}/command-center`,
        authority: { writeToolsEnabled: false, standingProductionAuthority: false },
      });
    }

    if (req.method === "GET" && url.pathname === "/command-center") {
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        ...securityHeaders(),
      });
      return res.end(widgetHtml);
    }

    if (req.method === "GET" && url.pathname === "/api/context") {
      return json(res, 200, await contextStore.snapshot());
    }

    if (req.method === "GET" && url.pathname === "/api/search") {
      const query = url.searchParams.get("q") || "";
      if (!query.trim()) return json(res, 400, { error: "Query parameter q is required." });
      const limit = Number(url.searchParams.get("limit") || 10);
      return json(res, 200, { results: await contextStore.search(query, limit) });
    }

    if (req.method === "GET" && url.pathname === "/api/fetch") {
      const id = url.searchParams.get("id") || "";
      if (!id.trim()) return json(res, 400, { error: "Query parameter id is required." });
      const item = await contextStore.fetch(id);
      return item ? json(res, 200, item) : json(res, 404, { error: "Context item not found.", id });
    }

    if (req.method === "POST" && url.pathname === "/api/prepare-command") {
      try {
        const body = await readJsonBody(req);
        const snapshot = await contextStore.snapshot();
        const today = composeTodaySibling(snapshot);
        const packet = prepareCommand({
          request: body.request,
          projects: snapshot.projects,
          status: snapshot.status,
          pointer: snapshot.pointer,
          source: snapshot.source,
        });
        return json(res, 200, {
          packet,
          today,
          followUpPrompt: commandPrompt(packet),
        });
      } catch (error) {
        return json(res, 400, { error: error instanceof Error ? error.message : String(error) });
      }
    }

    if (url.pathname === MCP_PATH && ["GET", "DELETE"].includes(req.method || "")) {
      return json(
        res,
        405,
        {
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Method not allowed. Use POST for this stateless serverless MCP endpoint.",
          },
          id: null,
        },
        { allow: "POST, OPTIONS" }
      );
    }

    if (url.pathname === MCP_PATH && req.method === "POST") {
      res.setHeader("access-control-allow-origin", allowedOrigin);
      res.setHeader("access-control-expose-headers", "Mcp-Session-Id");
      const server = createCloverServer(baseUrl);
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
        if (!res.headersSent) json(res, 500, { error: "Internal MCP server error." });
      }
      return;
    }

    res.writeHead(404, { ...securityHeaders(), "content-type": "text/plain; charset=utf-8" }).end("Not Found");
  } catch (error) {
    console.error("HTTP request failed", error);
    if (!res.headersSent) json(res, 500, { error: "Internal server error." });
  }
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirectRun) {
  const port = Number(process.env.PORT || 8787);
  createServer(handler).listen(port, () => {
    console.log(`Clover Context Gateway ${VERSION} listening on http://localhost:${port}`);
  });
}
