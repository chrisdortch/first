import fs from "node:fs";
import path from "node:path";

const REPOSITORY = "chrisdortch/first";
const DEFAULT_REF = process.env.CONTEXT_SOURCE_REF || "main";
const DEFAULT_CACHE_TTL_MS = Number(process.env.CONTEXT_CACHE_TTL_MS || 300000);

const CORE_DOCUMENTS = [
  { id: "clover://master-pointer", title: "Clover Master Plan Pointer", relativePath: "CLOVER_MASTER_PLAN_POINTER.json", kind: "json", keywords: "master pointer canonical current plan start here" },
  { id: "clover://status/current", title: "Current Clover Portfolio Status", relativePath: "portfolio/status/current.json", kind: "json", keywords: "status completion percentage progress program areas blockers" },
  { id: "clover://master-plan/current", title: "Current Clover Master Plan", relativePath: "portfolio/master-plan/CURRENT.md", kind: "text", keywords: "master plan current version mission north star phases" },
  { id: "clover://master-plan/v1.0.0", title: "Clover Master Plan 1.0.0", relativePath: "portfolio/master-plan/versions/1.0.0/MASTER_PLAN.md", kind: "text", keywords: "master plan architecture outcomes phases complete" },
  { id: "clover://projects", title: "Clover Portfolio Project Registry", relativePath: "portfolio/registry/projects.json", kind: "json", keywords: "projects apps repositories priorities completion next milestone" },
  { id: "clover://next", title: "Current Prioritized Work Queue", relativePath: "portfolio/NEXT.md", kind: "text", keywords: "next priority queue p0 p1 roadmap" },
  { id: "clover://progress-methodology", title: "Clover Progress Methodology", relativePath: "portfolio/PROGRESS_METHODOLOGY.md", kind: "text", keywords: "completion percentage methodology confidence scoring" },
  { id: "clover://build-protocol", title: "Current Clover Build Protocol", relativePath: "standards/clover-build-protocol/CURRENT.md", kind: "text", keywords: "build preview branch tests visual qa release protocol" },
  { id: "clover://data-protocol", title: "Current Clover Data Change Protocol", relativePath: "standards/clover-data-change-protocol/CURRENT.md", kind: "text", keywords: "database migration schema backup restore reconciliation protocol" },
  { id: "clover://context-control-plane", title: "Clover Context Control Plane", relativePath: "portfolio/context/CONTROL_PLANE_ARCHITECTURE.md", kind: "text", keywords: "context gateway command center voice adapters current logs errors traffic" },
  { id: "clover://command-grammar", title: "Clover Command Grammar", relativePath: "portfolio/context/COMMAND_GRAMMAR.md", kind: "text", keywords: "use cloverapps plant seed evolve diagnose backup release" },
  { id: "clover://freshness-policy", title: "Clover Context Freshness Policy", relativePath: "portfolio/context/FRESHNESS_POLICY.md", kind: "text", keywords: "freshness current stale unknown contradictory refresh" },
  { id: "clover://cost-policy", title: "Clover Cost and Token Policy", relativePath: "portfolio/context/COST_POLICY.md", kind: "text", keywords: "cost token credits chat pro codex work sites voice" },
  { id: "clover://live-adapters", title: "Clover Live Adapter Registry", relativePath: "portfolio/context/LIVE_ADAPTER_REGISTRY.json", kind: "json", keywords: "github vercel drive sites logs errors traffic adapters" },
];

function readUtf8(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function canonicalUrl(relativePath, ref = DEFAULT_REF) {
  return `https://github.com/${REPOSITORY}/blob/${encodeURIComponent(ref)}/${relativePath}`;
}

function rawUrl(relativePath, ref = DEFAULT_REF) {
  return `https://raw.githubusercontent.com/${REPOSITORY}/${encodeURIComponent(ref)}/${relativePath}`;
}

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokens(value) {
  return [...new Set(normalizeText(value).split(/\s+/).filter((token) => token.length > 1))];
}

function scoreDocument(document, queryTokens) {
  const title = normalizeText(document.title);
  const searchText = normalizeText(document.searchText || document.text || "");
  const id = normalizeText(document.id);
  let score = 0;
  for (const token of queryTokens) {
    if (title.includes(token)) score += 8;
    if (id.includes(token)) score += 5;
    if (searchText.includes(token)) score += 2;
  }
  return score;
}

function projectDocument(project, sourceRef, sourceCommit = null) {
  return {
    id: `clover://project/${project.projectId}`,
    title: project.title,
    text: JSON.stringify(project, null, 2),
    parsed: project,
    searchText: [project.projectId, project.title, project.repository, project.publicUrl, project.portfolioArea, project.nextMilestone, project.verificationStatus].filter(Boolean).join(" "),
    url: canonicalUrl("portfolio/registry/projects.json", sourceCommit || sourceRef),
    metadata: {
      repository: REPOSITORY,
      ref: sourceRef,
      commit: sourceCommit,
      relativePath: "portfolio/registry/projects.json",
      sourceType: "canonical-project-record",
      projectId: project.projectId,
    },
  };
}

function coreSearchDocument(definition, sourceRef, sourceCommit = null) {
  return {
    id: definition.id,
    title: definition.title,
    searchText: `${definition.keywords || ""} ${definition.relativePath}`,
    url: canonicalUrl(definition.relativePath, sourceCommit || sourceRef),
  };
}

function rankDocuments(documents, query, limit = 10) {
  const queryTokens = tokens(query);
  return documents
    .map((document) => ({ document, score: scoreDocument(document, queryTokens) }))
    .filter(({ score }) => queryTokens.length === 0 || score > 0)
    .sort((a, b) => b.score - a.score || a.document.title.localeCompare(b.document.title))
    .slice(0, Math.max(1, Math.min(Number(limit) || 10, 25)))
    .map(({ document }) => ({ id: document.id, title: document.title, url: document.url }));
}

export function createContextStore({ root, sourceRef = DEFAULT_REF, sourceCommit = null } = {}) {
  if (!root) throw new Error("A context root is required.");
  const resolvedRoot = path.resolve(root);

  function loadDocument(definition) {
    const absolutePath = path.join(resolvedRoot, definition.relativePath);
    if (!fs.existsSync(absolutePath)) return null;
    const raw = readUtf8(absolutePath);
    const parsed = definition.kind === "json" ? JSON.parse(raw) : null;
    return {
      ...definition,
      text: definition.kind === "json" ? JSON.stringify(parsed, null, 2) : raw,
      parsed,
      searchText: `${definition.keywords || ""} ${raw}`,
      url: canonicalUrl(definition.relativePath, sourceCommit || sourceRef),
      metadata: {
        repository: REPOSITORY,
        ref: sourceRef,
        commit: sourceCommit,
        relativePath: definition.relativePath,
        sourceType: "canonical-repository",
      },
    };
  }

  function loadProjects() {
    const registry = loadDocument(CORE_DOCUMENTS.find((item) => item.id === "clover://projects"));
    const projects = registry?.parsed?.projects;
    return Array.isArray(projects) ? projects : [];
  }

  function allDocuments() {
    return [...CORE_DOCUMENTS.map(loadDocument).filter(Boolean), ...loadProjects().map((project) => projectDocument(project, sourceRef, sourceCommit))];
  }

  function search(query, limit = 10) {
    return rankDocuments(allDocuments(), query, limit);
  }

  function fetchItem(id) {
    const document = allDocuments().find((item) => item.id === id);
    if (!document) return null;
    return { id: document.id, title: document.title, text: document.text, url: document.url, metadata: document.metadata };
  }

  function snapshot() {
    const status = fetchItem("clover://status/current")?.text;
    const pointer = fetchItem("clover://master-pointer")?.text;
    const projects = loadProjects();
    return {
      status: status ? JSON.parse(status) : null,
      pointer: pointer ? JSON.parse(pointer) : null,
      projects,
      source: { repository: REPOSITORY, ref: sourceRef, commit: sourceCommit, mode: "local", root: resolvedRoot },
    };
  }

  return { search, fetch: fetchItem, snapshot, loadProjects, allDocuments, mode: "local" };
}

export function createGitHubContextStore({
  repository = REPOSITORY,
  sourceRef = DEFAULT_REF,
  fetchImpl = globalThis.fetch,
  cacheTtlMs = DEFAULT_CACHE_TTL_MS,
  token = process.env.CONTEXT_GITHUB_TOKEN || "",
} = {}) {
  if (typeof fetchImpl !== "function") throw new Error("A fetch implementation is required for GitHub context mode.");
  const cache = new Map();
  let commitCache = null;
  let commitLoad = null;

  function headers(accept = "text/plain") {
    return {
      accept,
      "user-agent": "clover-context-gateway/0.3.0",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    };
  }

  async function cached(key, loader) {
    const now = Date.now();
    const existing = cache.get(key);
    if (existing && existing.expiresAt > now) return existing.value;
    const value = await loader();
    cache.set(key, { value, expiresAt: now + cacheTtlMs });
    return value;
  }

  async function sourceIdentity() {
    if (commitCache && commitCache.expiresAt > Date.now()) return commitCache.value;
    if (commitLoad) return commitLoad;
    commitLoad = (async () => {
      const response = await fetchImpl(`https://api.github.com/repos/${repository}/commits/${encodeURIComponent(sourceRef)}`, {
        headers: headers("application/vnd.github+json"),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`Canonical source identity fetch failed: HTTP ${response.status}`);
      const commit = (await response.json())?.sha || null;
      if (!/^[a-f0-9]{40}$/.test(commit || "")) {
        throw new Error("Canonical source identity did not resolve to a full Git commit SHA.");
      }
      const value = { repository, ref: sourceRef, commit, mode: "github" };
      commitCache = { value, expiresAt: Date.now() + cacheTtlMs };
      return value;
    })();
    try {
      return await commitLoad;
    } finally {
      commitLoad = null;
    }
  }

  async function loadDocument(definition) {
    const source = await sourceIdentity();
    return cached(`document:${source.commit}:${definition.relativePath}`, async () => {
      const response = await fetchImpl(`https://raw.githubusercontent.com/${repository}/${source.commit}/${definition.relativePath}`, {
        headers: headers("text/plain"),
        signal: AbortSignal.timeout(10000),
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Canonical context fetch failed for ${definition.relativePath}: HTTP ${response.status}`);
      const raw = await response.text();
      const parsed = definition.kind === "json" ? JSON.parse(raw) : null;
      return {
        ...definition,
        text: definition.kind === "json" ? JSON.stringify(parsed, null, 2) : raw,
        parsed,
        searchText: `${definition.keywords || ""} ${raw}`,
        url: `https://github.com/${repository}/blob/${source.commit}/${definition.relativePath}`,
        metadata: {
          repository,
          ref: sourceRef,
          commit: source.commit,
          relativePath: definition.relativePath,
          sourceType: "canonical-repository-remote",
        },
      };
    });
  }

  async function loadProjects() {
    const registry = await loadDocument(CORE_DOCUMENTS.find((item) => item.id === "clover://projects"));
    const projects = registry?.parsed?.projects;
    return Array.isArray(projects) ? projects : [];
  }

  async function search(query, limit = 10) {
    const [projects, source] = await Promise.all([loadProjects(), sourceIdentity()]);
    const documents = [
      ...CORE_DOCUMENTS.map((definition) => coreSearchDocument(definition, sourceRef, source.commit)),
      ...projects.map((project) => projectDocument(project, sourceRef, source.commit)),
    ];
    return rankDocuments(documents, query, limit);
  }

  async function fetchItem(id) {
    const core = CORE_DOCUMENTS.find((item) => item.id === id);
    if (core) {
      const document = await loadDocument(core);
      return document ? { id: document.id, title: document.title, text: document.text, url: document.url, metadata: document.metadata } : null;
    }
    if (id.startsWith("clover://project/")) {
      const projectId = id.slice("clover://project/".length);
      const [projects, source] = await Promise.all([loadProjects(), sourceIdentity()]);
      const project = projects.find((item) => item.projectId === projectId);
      if (!project) return null;
      const document = projectDocument(project, sourceRef, source.commit);
      return { id: document.id, title: document.title, text: document.text, url: document.url, metadata: document.metadata };
    }
    return null;
  }

  async function snapshot() {
    const pointerDef = CORE_DOCUMENTS.find((item) => item.id === "clover://master-pointer");
    const statusDef = CORE_DOCUMENTS.find((item) => item.id === "clover://status/current");
    const [pointerDoc, statusDoc, projects, source] = await Promise.all([
      loadDocument(pointerDef),
      loadDocument(statusDef),
      loadProjects(),
      sourceIdentity(),
    ]);
    return {
      status: statusDoc?.parsed || null,
      pointer: pointerDoc?.parsed || null,
      projects,
      source,
    };
  }

  return { search, fetch: fetchItem, snapshot, loadProjects, sourceIdentity, mode: "github" };
}

export function createAutoContextStore({
  appDir,
  root = process.env.CONTEXT_ROOT || "",
  sourceRef = DEFAULT_REF,
  fetchImpl = globalThis.fetch,
} = {}) {
  const inferredRoot = root ? path.resolve(root) : appDir ? path.resolve(appDir, "../..") : null;
  const forcedMode = process.env.CONTEXT_SOURCE_MODE || "auto";
  const localAvailable = inferredRoot && fs.existsSync(path.join(inferredRoot, "CLOVER_MASTER_PLAN_POINTER.json"));
  if (forcedMode === "local" && !localAvailable) throw new Error(`CONTEXT_SOURCE_MODE=local but canonical root is unavailable: ${inferredRoot}`);
  if (forcedMode === "local" || (forcedMode === "auto" && localAvailable)) {
    return createContextStore({ root: inferredRoot, sourceRef, sourceCommit: process.env.CONTEXT_SOURCE_COMMIT || null });
  }
  return createGitHubContextStore({ sourceRef, fetchImpl });
}

export { CORE_DOCUMENTS };
