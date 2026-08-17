import fs from "node:fs";
import path from "node:path";

const REPOSITORY = "chrisdortch/first";
const DEFAULT_REF = process.env.CONTEXT_SOURCE_REF || "main";

const CORE_DOCUMENTS = [
  {
    id: "clover://master-pointer",
    title: "Clover Master Plan Pointer",
    relativePath: "CLOVER_MASTER_PLAN_POINTER.json",
    kind: "json",
  },
  {
    id: "clover://status/current",
    title: "Current Clover Portfolio Status",
    relativePath: "portfolio/status/current.json",
    kind: "json",
  },
  {
    id: "clover://master-plan/current",
    title: "Current Clover Master Plan",
    relativePath: "portfolio/master-plan/CURRENT.md",
    kind: "text",
  },
  {
    id: "clover://master-plan/v1.0.0",
    title: "Clover Master Plan 1.0.0",
    relativePath: "portfolio/master-plan/versions/1.0.0/MASTER_PLAN.md",
    kind: "text",
  },
  {
    id: "clover://projects",
    title: "Clover Portfolio Project Registry",
    relativePath: "portfolio/registry/projects.json",
    kind: "json",
  },
  {
    id: "clover://next",
    title: "Current Prioritized Work Queue",
    relativePath: "portfolio/NEXT.md",
    kind: "text",
  },
  {
    id: "clover://progress-methodology",
    title: "Clover Progress Methodology",
    relativePath: "portfolio/PROGRESS_METHODOLOGY.md",
    kind: "text",
  },
  {
    id: "clover://build-protocol",
    title: "Current Clover Build Protocol",
    relativePath: "standards/clover-build-protocol/CURRENT.md",
    kind: "text",
  },
  {
    id: "clover://data-protocol",
    title: "Current Clover Data Change Protocol",
    relativePath: "standards/clover-data-change-protocol/CURRENT.md",
    kind: "text",
  },
  {
    id: "clover://command-grammar",
    title: "Clover Command Grammar",
    relativePath: "portfolio/context/COMMAND_GRAMMAR.md",
    kind: "text",
  },
  {
    id: "clover://freshness-policy",
    title: "Clover Context Freshness Policy",
    relativePath: "portfolio/context/FRESHNESS_POLICY.md",
    kind: "text",
  },
  {
    id: "clover://cost-policy",
    title: "Clover Cost and Token Policy",
    relativePath: "portfolio/context/COST_POLICY.md",
    kind: "text",
  },
];

function readUtf8(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function canonicalUrl(relativePath, ref = DEFAULT_REF) {
  return `https://github.com/${REPOSITORY}/blob/${encodeURIComponent(ref)}/${relativePath}`;
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(value) {
  return [...new Set(normalizeText(value).split(/\s+/).filter((token) => token.length > 1))];
}

function scoreDocument(document, queryTokens) {
  const title = normalizeText(document.title);
  const body = normalizeText(document.text);
  const id = normalizeText(document.id);
  let score = 0;
  for (const token of queryTokens) {
    if (title.includes(token)) score += 8;
    if (id.includes(token)) score += 5;
    if (body.includes(token)) score += 1;
  }
  return score;
}

export function createContextStore({ root, sourceRef = DEFAULT_REF } = {}) {
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
      url: canonicalUrl(definition.relativePath, sourceRef),
      metadata: {
        repository: REPOSITORY,
        ref: sourceRef,
        relativePath: definition.relativePath,
        sourceType: "canonical-repository",
      },
    };
  }

  function loadCoreDocuments() {
    return CORE_DOCUMENTS.map(loadDocument).filter(Boolean);
  }

  function loadProjects() {
    const registry = loadDocument(CORE_DOCUMENTS.find((item) => item.id === "clover://projects"));
    const projects = registry?.parsed?.projects;
    return Array.isArray(projects) ? projects : [];
  }

  function projectDocument(project) {
    return {
      id: `clover://project/${project.projectId}`,
      title: project.title,
      text: JSON.stringify(project, null, 2),
      parsed: project,
      url: canonicalUrl("portfolio/registry/projects.json", sourceRef),
      metadata: {
        repository: REPOSITORY,
        ref: sourceRef,
        relativePath: "portfolio/registry/projects.json",
        sourceType: "canonical-project-record",
        projectId: project.projectId,
      },
    };
  }

  function allDocuments() {
    return [...loadCoreDocuments(), ...loadProjects().map(projectDocument)];
  }

  function search(query, limit = 10) {
    const queryTokens = tokens(query);
    const documents = allDocuments();
    const ranked = documents
      .map((document) => ({ document, score: scoreDocument(document, queryTokens) }))
      .filter(({ score }) => queryTokens.length === 0 || score > 0)
      .sort((a, b) => b.score - a.score || a.document.title.localeCompare(b.document.title))
      .slice(0, Math.max(1, Math.min(Number(limit) || 10, 25)));

    return ranked.map(({ document }) => ({
      id: document.id,
      title: document.title,
      url: document.url,
    }));
  }

  function fetch(id) {
    const document = allDocuments().find((item) => item.id === id);
    if (!document) return null;
    return {
      id: document.id,
      title: document.title,
      text: document.text,
      url: document.url,
      metadata: document.metadata,
    };
  }

  function snapshot() {
    const status = fetch("clover://status/current")?.text;
    const pointer = fetch("clover://master-pointer")?.text;
    const projects = loadProjects();
    return {
      status: status ? JSON.parse(status) : null,
      pointer: pointer ? JSON.parse(pointer) : null,
      projects,
      source: {
        repository: REPOSITORY,
        ref: sourceRef,
        root: resolvedRoot,
      },
    };
  }

  return { search, fetch, snapshot, loadProjects, allDocuments };
}
