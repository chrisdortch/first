import crypto from "node:crypto";

const INTENTS = [
  {
    id: "launch_project",
    patterns: ["plant a seed", "new seed", "new project", "launch a new project", "start a project", "create an app"],
    requiresProject: false,
  },
  {
    id: "update_openai_site",
    patterns: ["openai site", "site update", "update the site", "edit site", "publish site"],
    requiresProject: true,
  },
  {
    id: "release_candidate",
    patterns: ["release", "publish", "promote", "merge", "deploy production", "launch production"],
    requiresProject: true,
  },
  {
    id: "diagnose_project",
    patterns: ["fix", "error", "errors", "log", "logs", "broken", "failing", "diagnose", "why is"],
    requiresProject: true,
  },
  {
    id: "inspect_status",
    patterns: ["status", "how complete", "completion", "what next", "where are we", "progress", "timeline"],
    requiresProject: false,
  },
  {
    id: "backup_project",
    patterns: ["backup", "back up", "vault", "archive", "preserve"],
    requiresProject: false,
  },
  {
    id: "restore_test",
    patterns: ["restore test", "test restore", "recovery test", "clean room restore"],
    requiresProject: true,
  },
  {
    id: "review_preview",
    patterns: ["review preview", "visual review", "inspect preview", "look at the preview", "test the preview"],
    requiresProject: true,
  },
  {
    id: "research",
    patterns: ["research", "deep dive", "analyze market", "investigate possibilities", "compare options"],
    requiresProject: false,
  },
  {
    id: "evolve_project",
    patterns: ["evolve", "improve", "update", "revise", "build", "add feature", "make better", "continue building"],
    requiresProject: true,
  },
];

const PROJECT_ALIASES = {
  "clover apps": "cloverapps-ai",
  cloverapps: "cloverapps-ai",
  warroom: "clover-warroom",
  "war room": "clover-warroom",
  "lakeside essentials": "lakeside-essentials",
  "serenity stores": "lakeside-essentials",
  songandstage: "songandstage",
  "song and stage": "songandstage",
  rollind: "rollindd",
  rollindd: "rollindd",
  "boat rentals": "boat-rentals",
  "cart waiver": "cart-waiver",
  "poolside pulse": "poolside-pulse",
  propertycare: "propertycare-booking-central",
  "booking central": "propertycare-booking-central",
  "vibe translator": "vibe-translator",
  "urim and thummim": "urim-and-thummim",
};

const STOPWORDS = new Set([
  "a", "an", "and", "app", "apps", "build", "clover", "cloverapps", "continue", "create",
  "evolve", "for", "from", "help", "improve", "in", "into", "make", "my", "new", "of",
  "on", "only", "please", "preview", "project", "revise", "site", "the", "this", "through",
  "to", "update", "use", "using", "with",
]);

const SOURCE_ADAPTERS = {
  canonical_plan: { connector: "clover-context", action: "search/fetch", freshness: "canonical-current-version" },
  canonical_status: { connector: "clover-context", action: "fetch clover://status/current", freshness: "current-canonical-snapshot" },
  project_registry: { connector: "clover-context", action: "fetch clover://projects", freshness: "current-canonical-snapshot" },
  related_projects: { connector: "clover-context", action: "search then fetch relevant project records", freshness: "current-canonical-snapshot" },
  cost_policy: { connector: "clover-context", action: "fetch clover://cost-policy", freshness: "current-canonical-version" },
  project_vision: { connector: "clover-context-and-drive", action: "fetch canonical project record; read exact approved Drive sources only when needed", freshness: "canonical plus task-specific readback" },
  repository: { connector: "github", action: "read repository, default branch, current head, and target branch", freshness: "current-task" },
  open_pull_requests: { connector: "github", action: "read open pull requests and review state", freshness: "current-task" },
  build_logs: { connector: "github-and-vercel", action: "read current workflow/build logs for the exact commit", freshness: "current-task" },
  runtime_errors: { connector: "vercel", action: "read grouped runtime errors before raw logs", freshness: "current-task" },
  open_issues: { connector: "github", action: "read current open issues relevant to the target", freshness: "current-task" },
  production_deployment: { connector: "vercel-or-sites", action: "read current production deployment and exact source identity", freshness: "current-task" },
  latest_deployment: { connector: "vercel-or-sites", action: "read latest deployment and exact source identity", freshness: "current-task" },
  preview_deployment: { connector: "vercel-or-sites", action: "read exact preview candidate and source commit", freshness: "current-task" },
  candidate_commit: { connector: "github", action: "read exact candidate commit and diff", freshness: "current-task" },
  changed_files: { connector: "github", action: "read exact candidate diff", freshness: "current-task" },
  test_receipt: { connector: "github-actions-and-vault", action: "read exact test artifact/receipt", freshness: "current-task-or-still-valid-receipt" },
  visual_evidence: { connector: "github-actions-vercel-browser", action: "read contact sheet first; open detailed evidence only for a concrete finding", freshness: "candidate-bound" },
  backup_status: { connector: "clover-vault-and-drive", action: "read latest backup and restore receipt", freshness: "7-days-low-risk-current-task-before-destructive-work" },
  backup_anchor: { connector: "clover-vault-and-provider", action: "read exact rollback/backup anchor", freshness: "current-task" },
  backup_manifest: { connector: "clover-vault-and-drive", action: "read exact backup manifest and checksums", freshness: "current-task" },
  restore_instructions: { connector: "clover-vault-and-repository", action: "read exact restore instructions", freshness: "current-task" },
  isolated_environment: { connector: "github-actions-or-approved-sandbox", action: "create/read disposable restore environment", freshness: "current-task" },
  repository_inventory: { connector: "github", action: "inventory repositories, branches, tags, releases, and current heads", freshness: "current-task" },
  deployment_inventory: { connector: "vercel-and-sites", action: "inventory projects, deployments, aliases, and source identities", freshness: "current-task" },
  data_store_inventory: { connector: "project-policy-and-provider", action: "identify database/storage engines and names without exposing secrets", freshness: "current-task" },
  vault_status: { connector: "clover-vault-and-drive", action: "read current backup coverage", freshness: "current-task" },
  latest_receipts: { connector: "github-actions-drive-and-registry", action: "read latest evidence-bound receipts", freshness: "current-task" },
  rollback_plan: { connector: "repository-provider-and-vault", action: "read exact rollback candidate and data rollback boundary", freshness: "current-task" },
  owner_release_authority: { connector: "owner-decision-gate", action: "request exact candidate-specific approval only after evidence", freshness: "current-task" },
  site_identity: { connector: "official-openai-sites-editor", action: "read exact referenced Site identity", freshness: "current-task" },
  site_version: { connector: "official-openai-sites-editor", action: "read exact saved/deployed Site versions", freshness: "current-task" },
  approved_source_commit: { connector: "github-and-owner-decision", action: "read exact approved source commit", freshness: "current-task" },
  sites_allowance: { connector: "official-openai-sites-ui", action: "test official Site editing availability", freshness: "current-task" },
  market_research: { connector: "web", action: "research current authoritative market sources", freshness: "current-task" },
  current_external_sources: { connector: "web", action: "research current primary/authoritative sources", freshness: "current-task" },
};

const LIVE_SOURCE_REQUIREMENTS = {
  launch_project: ["canonical_plan", "related_projects", "market_research", "cost_policy"],
  evolve_project: ["repository", "production_deployment", "open_pull_requests", "build_logs", "runtime_errors", "backup_status", "project_vision"],
  diagnose_project: ["repository", "latest_deployment", "build_logs", "runtime_errors", "open_issues"],
  inspect_status: ["canonical_status", "project_registry", "latest_receipts"],
  backup_project: ["repository_inventory", "deployment_inventory", "data_store_inventory", "vault_status"],
  restore_test: ["backup_manifest", "restore_instructions", "isolated_environment"],
  review_preview: ["preview_deployment", "changed_files", "test_receipt", "visual_evidence"],
  release_candidate: ["candidate_commit", "preview_deployment", "test_receipt", "backup_anchor", "rollback_plan", "owner_release_authority"],
  update_openai_site: ["site_identity", "site_version", "approved_source_commit", "sites_allowance", "owner_release_authority"],
  research: ["canonical_plan", "related_projects", "current_external_sources"],
};

function normalize(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function meaningfulTokens(value) {
  return normalize(value)
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

function detectIntent(request) {
  const normalized = normalize(request);
  const scored = INTENTS.map((intent, index) => ({
    intent,
    index,
    score: intent.patterns.reduce((total, pattern) => total + (normalized.includes(normalize(pattern)) ? normalize(pattern).length : 0), 0),
  })).sort((a, b) => b.score - a.score || a.index - b.index);
  return scored[0].score > 0 ? scored[0].intent : INTENTS.find((intent) => intent.id === "evolve_project");
}

function instructionBody(request) {
  const original = String(request || "").trim();
  const stripped = original.replace(/^\s*(?:please\s+)?use\s+clover\s*apps(?:\.ai)?\s+to\s+/i, "").trim();
  return stripped || original;
}

function projectSearchText(project) {
  return normalize([project.projectId, project.title, project.repository, project.publicUrl].filter(Boolean).join(" "));
}

function resolveProject(request, projects) {
  const normalized = normalize(request);
  for (const [alias, projectId] of Object.entries(PROJECT_ALIASES)) {
    const aliasNormalized = normalize(alias);
    if (normalized.includes(aliasNormalized)) {
      const match = projects.find((project) => project.projectId === projectId);
      if (match) return { project: match, confidence: "alias-exact", candidates: [match.projectId] };
    }
  }

  const requestTokens = meaningfulTokens(request);
  const ranked = projects
    .map((project) => {
      const searchText = projectSearchText(project);
      const title = normalize(project.title);
      const projectId = normalize(project.projectId);
      const repoName = normalize(String(project.repository || "").split("/").pop());
      let score = 0;
      if (projectId && normalized.includes(projectId)) score += 40;
      if (title && normalized.includes(title)) score += 35;
      if (repoName && normalized.includes(repoName)) score += 30;
      for (const token of requestTokens) {
        if (searchText.split(/\s+/).includes(token)) score += token.length;
        else if (searchText.includes(token)) score += Math.max(2, Math.floor(token.length / 2));
      }
      return { project, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.project.title.localeCompare(b.project.title));

  if (!ranked.length || ranked[0].score < 8) return { project: null, confidence: "unresolved", candidates: [] };
  const tied = ranked.filter(({ score }) => score >= ranked[0].score - 2).slice(0, 5);
  if (tied.length > 1) {
    return { project: null, confidence: "ambiguous", candidates: tied.map(({ project }) => project.projectId) };
  }
  return {
    project: ranked[0].project,
    confidence: ranked[0].score >= 24 ? "high" : "medium",
    candidates: [ranked[0].project.projectId],
  };
}

function costLane(intentId) {
  if (["inspect_status", "backup_project"].includes(intentId)) {
    return {
      defaultLane: "deterministic-and-chat-pro",
      additionalPurchaseExpected: false,
      purchaseTrigger: null,
      explanation: "Use canonical files, connected read tools, CI, and ordinary Chat Pro reasoning first.",
    };
  }
  if (intentId === "update_openai_site") {
    return {
      defaultLane: "prepare-in-chat-pro-then-official-sites-gate",
      additionalPurchaseExpected: "conditional",
      purchaseTrigger: "Only if the official Sites editor refuses the exact save/deploy step because the shared agentic allowance is exhausted.",
      explanation: "Prepare and verify the exact candidate outside Sites; spend Sites/Work capacity only on the authenticated save/deploy gate.",
    };
  }
  if (intentId === "review_preview") {
    return {
      defaultLane: "deterministic-first-bounded-vision-second",
      additionalPurchaseExpected: false,
      purchaseTrigger: null,
      explanation: "Use screenshots, tests, and contact sheets first; full browser control is an escalation, not the default.",
    };
  }
  return {
    defaultLane: "chat-pro-with-connected-tools",
    additionalPurchaseExpected: false,
    purchaseTrigger: null,
    explanation: "Use Chat Pro for architecture and bounded repository work; escalate to Codex/Work only for a capability unavailable here.",
  };
}

function executionSteps(intentId, project) {
  const projectLabel = project?.title || "the selected project";
  const common = [
    `Read the canonical Clover context for ${projectLabel}.`,
    "Refresh every required live source and mark unavailable sources as unknown rather than guessing.",
    "Confirm exact project identity, production baseline, data boundary, backup status, and owner-only actions.",
  ];
  const specific = {
    launch_project: ["Check adjacent projects and duplication risk.", "Create a versioned seed packet and isolated source target.", "Build a preview only after the owner-approved objective is explicit."],
    evolve_project: ["Propose the smallest high-value change.", "Create an isolated branch, validate, preview, and return a receipt.", "Stop before merge or production."],
    diagnose_project: ["Reproduce the failure from logs and tests.", "Patch only the verified cause on an isolated branch.", "Return failure and repair evidence."],
    inspect_status: ["Recalculate status only from dated evidence.", "Report broad mission, program area, project score, confidence, and blockers."],
    backup_project: ["Build an inventory and coverage gap report.", "Create independent archives and checksums.", "Prove restoration in a clean environment."],
    restore_test: ["Restore into an isolated environment.", "Run project-specific checks and reconcile expected artifacts.", "Do not connect the restore to production."],
    review_preview: ["Run deterministic browser checks first.", "Review only changed or failed visual states.", "Convert accepted findings into repeatable tests."],
    release_candidate: ["Verify the exact candidate and rollback anchor.", "Present an owner release card.", "Do not release without separate exact approval."],
    update_openai_site: ["Prepare an approved Git-backed candidate where possible.", "Use the official Sites editor only for identity check, save, and deploy gates.", "Never bypass Sites authentication or internal APIs."],
    research: ["Search current authoritative sources.", "Relate findings to the existing portfolio and constraints.", "Return an evidence-backed recommendation and next packet."],
  };
  return [...common, ...(specific[intentId] || specific.evolve_project)];
}

function ownerActionCards(intentId, project) {
  const cards = [];
  if (!project && ["evolve_project", "diagnose_project", "restore_test", "review_preview", "release_candidate", "update_openai_site"].includes(intentId)) {
    cards.push({
      id: "resolve-project",
      required: true,
      cost: "none",
      title: "Choose the exact project",
      instruction: "Select one canonical project ID from the candidates or provide the exact project URL/repository.",
    });
  }
  if (intentId === "update_openai_site") {
    cards.push({
      id: "official-sites-gate",
      required: true,
      cost: "uses-included-agentic-allowance-or-manually-purchased-credits-only-if-exhausted",
      title: "Run the official Sites save-only gate",
      instruction: "Open the exact Site in the official editor, verify its identity, build from the approved source candidate, save a new reviewable version, and stop before deployment.",
      exactPrompt: "OWNER-AUTHORIZED SAVE-ONLY SITE UPDATE. Verify the exact referenced Site and approved source commit. Make only the approved change, save a new reviewable version, and do not deploy, publish, change access, domains, DNS, secrets, storage, or production data. Return the saved-version identity and test evidence.",
    });
  }
  return cards;
}

export function prepareCommand({ request, projects, status, pointer, source = null }) {
  const originalRequest = String(request || "").trim();
  if (!originalRequest) throw new Error("A command request is required.");
  const requestBody = instructionBody(originalRequest);
  const intent = detectIntent(requestBody);
  const resolution = resolveProject(requestBody, projects || []);
  const project = resolution.project;
  const requiresProjectResolution = intent.requiresProject && !project;
  const requiredSources = LIVE_SOURCE_REQUIREMENTS[intent.id] || [];
  const sourceIdentity = source?.commit || source?.ref || pointer?.currentVersion || "unknown";
  const sourceFingerprint = `${sourceIdentity}:${status?.asOf || "unknown"}:${project?.projectId || "portfolio"}:${normalize(requestBody)}`;
  const commandId = `clover-${crypto.createHash("sha256").update(sourceFingerprint).digest("hex").slice(0, 16)}`;

  return {
    schemaVersion: "1.1",
    commandId,
    createdAt: new Date().toISOString(),
    originalRequest,
    requestBody,
    normalizedRequest: normalize(requestBody),
    intent: {
      id: intent.id,
      requiresProject: intent.requiresProject,
    },
    resolution: {
      state: project ? "resolved" : resolution.confidence === "ambiguous" ? "ambiguous" : "unresolved",
      confidence: resolution.confidence,
      candidates: resolution.candidates,
    },
    project: project
      ? {
          projectId: project.projectId,
          title: project.title,
          repository: project.repository || null,
          publicUrl: project.publicUrl || null,
          priority: project.priority || null,
          completionEstimate: project.completionEstimate ?? null,
          estimateAsOf: project.estimateAsOf || null,
          verificationStatus: project.verificationStatus || null,
          nextMilestone: project.nextMilestone || null,
          resolutionConfidence: resolution.confidence,
        }
      : null,
    state: requiresProjectResolution ? "needs-project-resolution" : "refresh-required-before-execution",
    canonicalContext: {
      masterPlanVersion: pointer?.currentVersion || null,
      statusAsOf: status?.asOf || null,
      overallMissionCompletionEstimate: status?.overallMissionCompletionEstimate ?? null,
      sourceRepository: pointer?.repository || "chrisdortch/first",
      sourceRef: source?.ref || "main",
      sourceCommit: source?.commit || null,
    },
    contextBudget: {
      strategy: "pointer-first-target-only",
      firstPassItems: ["clover://master-pointer", "clover://status/current", project ? `clover://project/${project.projectId}` : "clover://projects"],
      instruction: "Fetch only the target project and policies needed for the current intent. Open full logs, traces, screenshots, or source trees only after a concrete failure or ambiguity is identified.",
    },
    freshness: {
      policy: "live-readback-before-mutation",
      requiredSources,
      sourcePlan: requiredSources.map((sourceId) => ({ sourceId, ...(SOURCE_ADAPTERS[sourceId] || { connector: "unresolved", action: "resolve supported authoritative source", freshness: "current-task" }) })),
      rule: "A source is current only when the execution thread reads it during the current task or imports a still-valid exact receipt.",
    },
    cost: costLane(intent.id),
    executionPlan: executionSteps(intent.id, project),
    ownerActionCards: ownerActionCards(intent.id, project),
    authority: {
      previewOnlyByDefault: true,
      mergeApproved: false,
      productionDeploymentApproved: false,
      productionDataAccessApproved: false,
      domainOrDnsChangeApproved: false,
      secretChangeApproved: false,
      purchaseApproved: false,
      externalMessageApproved: false,
    },
    stopConditions: [
      "Project identity or production baseline cannot be verified.",
      "Required live context is stale, contradictory, or unavailable and would materially affect safety.",
      "The requested action crosses into production, private data, payment, messaging, domains, secrets, or legal commitments without exact approval.",
      "The candidate cannot be backed out to a verified rollback anchor.",
    ],
  };
}

export function commandPrompt(packet) {
  const project = packet.project?.title || "the portfolio or a new seed";
  const requiredConnectors = [...new Set(packet.freshness.sourcePlan.map((item) => item.connector))].join(", ");
  return [
    `Use CloverApps to ${packet.requestBody}`,
    `Clover command: ${packet.commandId}. Target: ${project}.`,
    `Canonical context is already bound through the Clover context app; fetch only the target records required by this command.`,
    `Refresh live state through: ${requiredConnectors || "the supported authoritative connectors"}. Treat unavailable facts as unknown.`,
    "Proceed preview-only unless I separately approve an exact irreversible action.",
    "Return source identities, changes, checks, preview, cost lane, blockers, receipt, and any evidence-backed status change.",
  ].join("\n");
}
