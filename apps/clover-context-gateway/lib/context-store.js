import fs from "node:fs";
import path from "node:path";

const REPOSITORY = "chrisdortch/first";
const FULL_COMMIT_PATTERN = /^[a-f0-9]{40}$/;

export function resolveDefaultSourceRef(environment = process.env) {
  const explicitCommit = String(environment.CONTEXT_SOURCE_COMMIT || "").trim();
  if (explicitCommit && !FULL_COMMIT_PATTERN.test(explicitCommit)) {
    throw new Error("CONTEXT_SOURCE_COMMIT must be a full lowercase Git commit SHA.");
  }
  const vercelCommit = String(environment.VERCEL_GIT_COMMIT_SHA || "").trim();
  if (vercelCommit && !FULL_COMMIT_PATTERN.test(vercelCommit)) {
    throw new Error("VERCEL_GIT_COMMIT_SHA must be a full lowercase Git commit SHA.");
  }
  return explicitCommit || vercelCommit || String(environment.CONTEXT_SOURCE_REF || "main").trim() || "main";
}

const DEFAULT_REF = resolveDefaultSourceRef();
const DEFAULT_CACHE_TTL_MS = Number(process.env.CONTEXT_CACHE_TTL_MS || 300000);

const CORE_DOCUMENTS = [
  { id: "clover://master-pointer", title: "Clover Master Plan Pointer", relativePath: "CLOVER_MASTER_PLAN_POINTER.json", kind: "json", keywords: "master pointer canonical current plan start here" },
  { id: "clover://status/current", title: "Current Clover Portfolio Status", relativePath: "portfolio/status/current.json", kind: "json", keywords: "status completion percentage progress program areas blockers" },
  { id: "clover://status/candidate/2026-08-20", title: "August 20 Clover Portfolio Status Candidate", relativePath: "portfolio/status/candidates/2026-08-20/status.json", kind: "json", optional: true, keywords: "candidate status completion current live historical unknown source freshness" },
  { id: "clover://master-plan/current", title: "Current Clover Master Plan", relativePath: "portfolio/master-plan/CURRENT.md", kind: "text", keywords: "master plan current version mission north star phases" },
  { id: "clover://master-plan/v1.0.0", title: "Clover Master Plan 1.0.0", relativePath: "portfolio/master-plan/versions/1.0.0/MASTER_PLAN.md", kind: "text", keywords: "master plan architecture outcomes phases complete" },
  { id: "clover://projects", title: "Clover Portfolio Project Registry", relativePath: "portfolio/registry/projects.json", kind: "json", keywords: "projects apps repositories priorities completion next milestone" },
  { id: "clover://registry/candidate/2.0.0", title: "Clover Federated Portfolio Projection Candidate 2.0.0", relativePath: "portfolio/registry/projections/core-project-index.v2.json", kind: "json", optional: true, keywords: "candidate registry federated core projection relationships identities unknowns" },
  { id: "clover://next", title: "Current Prioritized Work Queue", relativePath: "portfolio/NEXT.md", kind: "text", keywords: "next priority queue p0 p1 roadmap" },
  { id: "clover://progress-methodology", title: "Clover Progress Methodology", relativePath: "portfolio/PROGRESS_METHODOLOGY.md", kind: "text", keywords: "completion percentage methodology confidence scoring" },
  { id: "clover://build-protocol", title: "Current Clover Build Protocol", relativePath: "standards/clover-build-protocol/CURRENT.md", kind: "text", keywords: "build preview branch tests visual qa release protocol" },
  { id: "clover://data-protocol", title: "Current Clover Data Change Protocol", relativePath: "standards/clover-data-change-protocol/CURRENT.md", kind: "text", keywords: "database migration schema backup restore reconciliation protocol" },
  { id: "clover://context-control-plane", title: "Clover Context Control Plane", relativePath: "portfolio/context/CONTROL_PLANE_ARCHITECTURE.md", kind: "text", keywords: "context gateway command center voice adapters current logs errors traffic" },
  { id: "clover://command-grammar", title: "Clover Command Grammar", relativePath: "portfolio/context/COMMAND_GRAMMAR.md", kind: "text", keywords: "use cloverapps plant seed evolve diagnose backup release" },
  { id: "clover://freshness-policy", title: "Clover Context Freshness Policy", relativePath: "portfolio/context/FRESHNESS_POLICY.md", kind: "text", keywords: "freshness current stale unknown contradictory refresh" },
  { id: "clover://cost-policy", title: "Clover Cost and Token Policy", relativePath: "portfolio/context/COST_POLICY.md", kind: "text", keywords: "cost token credits chat pro codex work sites voice" },
  { id: "clover://live-adapters", title: "Clover Live Adapter Registry", relativePath: "portfolio/context/LIVE_ADAPTER_REGISTRY.json", kind: "json", keywords: "github vercel drive sites logs errors traffic adapters" },
  { id: "clover://today/candidate/2026-08-20", title: "Clover Today Owner Session Candidate", relativePath: "portfolio/core/today/2026-08-20/session.json", kind: "json", optional: true, keywords: "today owner session priorities recommended action connector plan authority unknowns" },
  { id: "clover://handoff/index", title: "Clover Handoff Ledger Index", relativePath: "portfolio/core/handoff/index.json", kind: "json", optional: true, keywords: "handoff action envelope execution receipt review decision branch capsule index" },
  { id: "clover://owner/start", title: "Clover Owner Start", relativePath: "CLOVER_OWNER_START.md", kind: "text", optional: true, keywords: "owner start compact prompt use clover core" },
  { id: "clover://operator/chatgpt", title: "ChatGPT Clover Project Instructions", relativePath: "CHATGPT_PROJECT_INSTRUCTIONS.md", kind: "text", optional: true, keywords: "chatgpt project owner console instructions" },
  { id: "clover://operator/codex", title: "Codex Clover Operator", relativePath: "CODEX_CLOVER_OPERATOR.md", kind: "text", optional: true, keywords: "codex operator approved action id receipt" },
  { id: "clover://operator/connectors", title: "Clover Connector Routing", relativePath: "CLOVER_CONNECTOR_ROUTING.md", kind: "text", optional: true, keywords: "connector routing github vercel context gateway minimum necessary" },
];

const SNAPSHOT_DOCUMENTS = {
  candidateStatus: "clover://status/candidate/2026-08-20",
  registryCandidate: "clover://registry/candidate/2.0.0",
  today: "clover://today/candidate/2026-08-20",
  handoff: "clover://handoff/index",
};

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

function optionalDocumentState(definition, document, source = {}) {
  const sourceMetadata = {
    repository: document?.metadata?.repository || source.repository || REPOSITORY,
    ref: document?.metadata?.ref ?? source.ref ?? null,
    commit: document?.metadata?.commit ?? source.commit ?? null,
    relativePath: definition.relativePath,
    sourceType: document?.metadata?.sourceType || "optional-candidate-repository-record",
  };
  if (!document) {
    return {
      id: definition.id,
      available: false,
      data: null,
      url: null,
      metadata: {
        ...sourceMetadata,
        found: false,
      },
    };
  }
  return {
    id: document.id,
    available: true,
    data: document.parsed ?? document.text,
    url: document.url,
    metadata: {
      ...sourceMetadata,
      found: true,
    },
  };
}

export function createContextStore({ root, sourceRef = DEFAULT_REF, sourceCommit = null } = {}) {
  if (!root) throw new Error("A context root is required.");
  const resolvedRoot = path.resolve(root);

  function loadDocument(definition) {
    const absolutePath = path.join(resolvedRoot, definition.relativePath);
    if (!fs.existsSync(absolutePath)) return null;
    const raw = readUtf8(absolutePath);
    let parsed = null;
    try {
      parsed = definition.kind === "json" ? JSON.parse(raw) : null;
    } catch (error) {
      if (definition.optional === true) return null;
      throw error;
    }
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
    const source = { repository: REPOSITORY, ref: sourceRef, commit: sourceCommit, mode: "local" };
    const optional = Object.fromEntries(Object.entries(SNAPSHOT_DOCUMENTS).map(([key, id]) => {
      const definition = CORE_DOCUMENTS.find((item) => item.id === id);
      return [key, optionalDocumentState(definition, loadDocument(definition), source)];
    }));
    return {
      status: status ? JSON.parse(status) : null,
      pointer: pointer ? JSON.parse(pointer) : null,
      projects,
      source,
      ...optional,
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
      "user-agent": "clover-context-gateway/0.3.1",
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
      if (!response.ok) {
        if (definition.optional === true) return null;
        throw new Error(`Canonical context fetch failed for ${definition.relativePath}: HTTP ${response.status}`);
      }
      const raw = await response.text();
      let parsed = null;
      try {
        parsed = definition.kind === "json" ? JSON.parse(raw) : null;
      } catch (error) {
        if (definition.optional === true) return null;
        throw error;
      }
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
    const optionalDefinitions = CORE_DOCUMENTS.filter((definition) => definition.optional === true);
    const [projects, source, optionalDocuments] = await Promise.all([
      loadProjects(),
      sourceIdentity(),
      Promise.all(optionalDefinitions.map(loadDocument)),
    ]);
    const documents = [
      ...CORE_DOCUMENTS.filter((definition) => definition.optional !== true)
        .map((definition) => coreSearchDocument(definition, sourceRef, source.commit)),
      ...optionalDocuments.filter(Boolean)
        .map((document) => coreSearchDocument(document, sourceRef, source.commit)),
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
    const snapshotDefinitions = Object.fromEntries(Object.entries(SNAPSHOT_DOCUMENTS).map(([key, id]) => [
      key,
      CORE_DOCUMENTS.find((item) => item.id === id),
    ]));
    const [pointerDoc, statusDoc, projects, source, optionalDocuments] = await Promise.all([
      loadDocument(pointerDef),
      loadDocument(statusDef),
      loadProjects(),
      sourceIdentity(),
      Promise.all(Object.values(snapshotDefinitions).map(loadDocument)),
    ]);
    const optional = Object.fromEntries(Object.keys(snapshotDefinitions).map((key, index) => [
      key,
      optionalDocumentState(snapshotDefinitions[key], optionalDocuments[index], source),
    ]));
    return {
      status: statusDoc?.parsed || null,
      pointer: pointerDoc?.parsed || null,
      projects,
      source,
      ...optional,
    };
  }

  return { search, fetch: fetchItem, snapshot, loadProjects, sourceIdentity, mode: "github" };
}

export function createAutoContextStore({
  appDir,
  root,
  sourceRef,
  fetchImpl = globalThis.fetch,
  environment = process.env,
} = {}) {
  const selectedRoot = root ?? environment.CONTEXT_ROOT ?? "";
  const selectedRef = sourceRef ?? resolveDefaultSourceRef(environment);
  const inferredRoot = selectedRoot ? path.resolve(selectedRoot) : appDir ? path.resolve(appDir, "../..") : null;
  const forcedMode = environment.CONTEXT_SOURCE_MODE || "auto";
  const localAvailable = inferredRoot && fs.existsSync(path.join(inferredRoot, "CLOVER_MASTER_PLAN_POINTER.json"));
  if (forcedMode === "local" && !localAvailable) throw new Error(`CONTEXT_SOURCE_MODE=local but canonical root is unavailable: ${inferredRoot}`);
  if (forcedMode === "local" || (forcedMode === "auto" && localAvailable)) {
    return createContextStore({
      root: inferredRoot,
      sourceRef: selectedRef,
      sourceCommit: FULL_COMMIT_PATTERN.test(selectedRef) ? selectedRef : null,
    });
  }
  return createGitHubContextStore({ sourceRef: selectedRef, fetchImpl });
}

export { CORE_DOCUMENTS };
