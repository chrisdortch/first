import crypto from "node:crypto";

const PORTFOLIO_INTENT_ID = "portfolio_operating_loop";

const INTENTS = [
  {
    id: PORTFOLIO_INTENT_ID,
    patterns: [
      "what should i know",
      "what do i need to know",
      "what matters today",
      "across my current priorities",
      "daily brief",
      "morning brief",
      "brief me",
      "most important item",
      "what do you recommend",
      "highest value next step",
      "do the safe parts",
      "safe reversible",
      "recommended step",
      "what happened",
      "what changed today",
      "today s log",
      "daily log",
    ],
    requiresProject: false,
  },
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

const PORTFOLIO_MODE_CUES = Object.freeze({
  report_activity: Object.freeze([
    "what happened",
    "what changed today",
    "what changed since",
    "show activity since",
    "what was completed and verified",
    "update today s log",
    "report what changed",
    "today s log",
    "daily log",
    "last accepted receipt",
    "last receipt",
    "latest accepted receipt",
  ]),
  execute_safe_parts: Object.freeze([
    "do only the safe",
    "do only the safe parts",
    "do the safe parts",
    "complete only the reversible parts",
    "move forward with what is already authorized and safe",
    "prepare the safe preview only parts",
    "do what you can safely do without creating new risk",
    "do the recommended safe step",
  ]),
  recommend_next: Object.freeze([
    "what is the single best next thing",
    "single best next thing",
    "best next thing",
    "what should i do next",
    "one best next action",
    "one next action",
    "what do you recommend now",
    "what do you recommend",
    "highest value next step",
    "smallest highest value next step",
    "smartest next",
    "recommended step",
    "feel overloaded",
    "overloaded",
    "overwhelmed",
    "too much to manage",
    "reduce this to one decision",
    "one decision",
    "safest thing you can do now",
    "just recommend",
    "recommend only",
  ]),
  explain_priority: Object.freeze([
    "priority",
    "priorities",
    "ranked",
    "ranking",
    "dependency",
    "dependencies",
    "evidence behind",
    "evidence is driving",
    "readiness",
    "most important item",
    "top priority",
  ]),
  brief: Object.freeze([
    "what matters today",
    "what should i know",
    "what do i need to know",
    "brief me",
    "daily brief",
    "morning brief",
    "across my priorities",
    "across my current priorities",
    "help me understand today",
  ]),
});

const EXPLAIN_PRIORITY_WHEN_NONTECHNICAL_CUES = Object.freeze([
  "blocked",
  "explain why",
  "why it matters",
]);

const DIAGNOSTIC_CUES = Object.freeze([
  "fix",
  "error",
  "errors",
  "broken",
  "failing",
  "failure",
  "crash",
  "bug",
  "runtime failure",
  "build failing",
  "checkout failing",
  "log",
  "logs",
  "reproduce the failure",
  "diagnose",
]);

const NONAFFIRMATIVE_SAFE_PREFIXES = Object.freeze([
  "do not",
  "don t",
  "dont",
  "never",
  "should i",
  "should we",
  "would i",
  "would we",
  "could i",
  "could we",
]);

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
  priority_context: { connector: "clover-context", action: "fetch clover://next plus current status priorities and known gaps", freshness: "current-canonical-snapshot" },
  recent_decisions: { connector: "clover-context-and-github", action: "read current append-only decision ledger and applicable constitutional status", freshness: "current-task" },
  recent_events: { connector: "clover-context-github-and-receipts", action: "read recent sanitized events and evidence-bound receipts; do not infer unrecorded activity", freshness: "current-task" },
  daily_log: { connector: "clover-context-and-github", action: "read the current daily-log projection and its event/receipt basis", freshness: "current-task" },
  source_health: { connector: "clover-context-and-native-connectors", action: "read connector availability, coverage, last successful observation, and delta cursor before opening raw content", freshness: "current-task" },
  financial_constraints: { connector: "finances", action: "read an owner-authorized minimized cash/risk projection and account coverage; keep raw transactions inside the financial Cell", freshness: "current-task" },
  deadline_constraints: { connector: "warroom-calendar-and-gmail", action: "read owner-authorized minimized deadline and commitment projections; keep raw legal evidence and private messages in their source Cells", freshness: "current-task" },
  capability_registry: { connector: "clover-context", action: "read current capability and authority registry; default deny when unavailable", freshness: "current-task" },
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

const PORTFOLIO_SOURCE_REQUIREMENTS = {
  brief: ["canonical_status", "project_registry", "priority_context", "latest_receipts", "recent_events", "source_health"],
  explain_priority: ["canonical_status", "project_registry", "priority_context", "latest_receipts", "recent_events", "recent_decisions", "source_health"],
  recommend_next: ["canonical_status", "project_registry", "priority_context", "latest_receipts", "recent_events", "recent_decisions", "source_health", "financial_constraints", "deadline_constraints", "cost_policy"],
  execute_safe_parts: ["canonical_status", "project_registry", "priority_context", "latest_receipts", "recent_events", "recent_decisions", "source_health", "capability_registry", "backup_status", "project_vision"],
  report_activity: ["recent_events", "latest_receipts", "daily_log", "canonical_status", "source_health"],
};

function normalize(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function includesCue(normalized, cue) {
  return ` ${normalized} `.includes(` ${normalize(cue)} `);
}

function includesAnyCue(normalized, cues) {
  return cues.some((cue) => includesCue(normalized, cue));
}

function startsWithCue(normalized, cue) {
  const normalizedCue = normalize(cue);
  return normalized === normalizedCue || normalized.startsWith(`${normalizedCue} `);
}

function affirmativeSafeImperative(normalized) {
  const withoutCourtesy = normalized.startsWith("please ") ? normalized.slice("please ".length) : normalized;
  if (NONAFFIRMATIVE_SAFE_PREFIXES.some((cue) => startsWithCue(withoutCourtesy, cue))) return false;
  return PORTFOLIO_MODE_CUES.execute_safe_parts.some((cue) => startsWithCue(withoutCourtesy, cue));
}

function meaningfulTokens(value) {
  return normalize(value)
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

function detectExplicitIntent(normalized) {
  const scored = INTENTS
    .filter((intent) => ![PORTFOLIO_INTENT_ID, "diagnose_project"].includes(intent.id))
    .map((intent, index) => ({
    intent,
    index,
    score: intent.patterns.reduce((total, pattern) => total + (includesCue(normalized, pattern) ? normalize(pattern).length : 0), 0),
  })).sort((a, b) => b.score - a.score || a.index - b.index);
  return scored[0]?.score > 0 ? scored[0].intent : null;
}

function detectPortfolioMode(request) {
  const normalized = normalize(request);
  const technicalFailure = includesAnyCue(normalized, DIAGNOSTIC_CUES);
  if (includesAnyCue(normalized, PORTFOLIO_MODE_CUES.report_activity)) return "report_activity";
  if (affirmativeSafeImperative(normalized)) return "execute_safe_parts";
  if (includesAnyCue(normalized, PORTFOLIO_MODE_CUES.recommend_next)) return "recommend_next";
  if (includesAnyCue(normalized, PORTFOLIO_MODE_CUES.brief)) return "brief";
  if (!technicalFailure && (
    includesAnyCue(normalized, PORTFOLIO_MODE_CUES.explain_priority)
    || includesAnyCue(normalized, EXPLAIN_PRIORITY_WHEN_NONTECHNICAL_CUES)
  )) return "explain_priority";
  return null;
}

function detectRouting(request) {
  const normalized = normalize(request);
  const portfolioMode = detectPortfolioMode(normalized);
  if (portfolioMode) {
    return {
      intent: INTENTS.find((intent) => intent.id === PORTFOLIO_INTENT_ID),
      portfolioMode,
    };
  }
  if (includesAnyCue(normalized, DIAGNOSTIC_CUES)) {
    return {
      intent: INTENTS.find((intent) => intent.id === "diagnose_project"),
      portfolioMode: null,
    };
  }
  const explicitIntent = detectExplicitIntent(normalized);
  if (explicitIntent) return { intent: explicitIntent, portfolioMode: null };
  return {
    intent: INTENTS.find((intent) => intent.id === PORTFOLIO_INTENT_ID),
    portfolioMode: "brief",
  };
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

function requiredSourcesFor(intentId, portfolioMode) {
  if (intentId === PORTFOLIO_INTENT_ID) return PORTFOLIO_SOURCE_REQUIREMENTS[portfolioMode] || PORTFOLIO_SOURCE_REQUIREMENTS.brief;
  return LIVE_SOURCE_REQUIREMENTS[intentId] || [];
}

function costLane(intentId) {
  if ([PORTFOLIO_INTENT_ID, "inspect_status", "backup_project"].includes(intentId)) {
    return {
      defaultLane: "deterministic-and-chat-pro",
      additionalPurchaseExpected: false,
      purchaseTrigger: null,
      explanation: "Use canonical records, connector delta/coverage metadata, deterministic checks, and ordinary Chat Pro reasoning first.",
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

function portfolioExecutionSteps(mode) {
  const common = [
    "Read canonical Clover status, current priorities, known gaps, recent decisions, source-health metadata, and evidence-bound receipts.",
    "Refresh only sources required for this operating mode; inspect coverage and deltas first, and label unavailable or stale sources as unknown.",
    "Keep raw legal, financial, health, family, guest, staff, credential, and production data inside their responsible Cells; return only minimized authorized projections.",
  ];
  const specific = {
    brief: [
      "Rank one primary item and no more than two secondary material items.",
      "Explain what changed, why each item matters now, and what remains uncertain.",
      "Do not change any external system.",
    ],
    explain_priority: [
      "Trace the selected priority to its exact evidence, freshness, dependencies, and prior decisions.",
      "Show which deadline, risk, cash, strategic, confidence, reversibility, and owner-attention factors drove its position.",
      "Identify the evidence that would materially change the conclusion.",
    ],
    recommend_next: [
      "Compare the smallest credible next actions across the current priorities.",
      "Select one highest-value reversible step using deadlines, harm avoided, cash constraints, strategic compounding, dependencies, confidence, cost, and owner attention.",
      "Reduce the owner-facing result to one decision while preserving the complete source, uncertainty, alternative, authority, and rollback record.",
      "Prepare the exact next command or Action Envelope, but do not execute it.",
    ],
    execute_safe_parts: [
      "Resolve one exact target from the accepted recommendation and current evidence without asking the owner to repeat known context.",
      "Create one narrow, expiring, single-use Action Envelope with exact resources, operations, cost, rollback, stop conditions, and approval gates.",
      "Perform only currently authorized safe work such as readback, organization, drafting, testing, isolated branches, synthetic rehearsal, and preview preparation.",
      "Stop before merge, production, private-data movement, secret reveal, spending, messaging, domain, permission, credential, or OpenAI Site changes, then return a readback receipt.",
    ],
    report_activity: [
      "Reconstruct activity only from events, exact source readback, and receipts.",
      "Separate completed, verified, failed, rolled-back, pending, and unknown work.",
      "Project the result into today's human-readable log without inventing unrecorded activity.",
    ],
  };
  return [...common, ...(specific[mode] || specific.brief)];
}

function executionSteps(intentId, project, portfolioMode) {
  if (intentId === PORTFOLIO_INTENT_ID) return portfolioExecutionSteps(portfolioMode);

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
  const { intent, portfolioMode } = detectRouting(requestBody);
  const resolution = resolveProject(requestBody, projects || []);
  const project = resolution.project;
  const isPortfolio = intent.id === PORTFOLIO_INTENT_ID;
  const requiresProjectResolution = intent.requiresProject && !project;
  const requiredSources = requiredSourcesFor(intent.id, portfolioMode);
  const sourceIdentity = source?.commit || source?.ref || pointer?.currentVersion || "unknown";
  const targetIdentity = isPortfolio ? "portfolio" : project?.projectId || "portfolio";
  const sourceFingerprint = `${sourceIdentity}:${status?.asOf || "unknown"}:${targetIdentity}:${normalize(requestBody)}`;
  const commandId = `clover-${crypto.createHash("sha256").update(sourceFingerprint).digest("hex").slice(0, 16)}`;

  return {
    schemaVersion: "1.2",
    commandId,
    createdAt: new Date().toISOString(),
    originalRequest,
    requestBody,
    normalizedRequest: normalize(requestBody),
    intent: {
      id: intent.id,
      requiresProject: intent.requiresProject,
      ...(portfolioMode ? { mode: portfolioMode } : {}),
    },
    resolution: isPortfolio
      ? {
          state: "resolved",
          confidence: project ? "portfolio-scope-with-project-context" : "portfolio-scope",
          candidates: project ? [project.projectId] : [],
        }
      : {
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
      firstPassItems: isPortfolio
        ? ["clover://master-pointer", "clover://status/current", "clover://projects", "clover://next"]
        : ["clover://master-pointer", "clover://status/current", project ? `clover://project/${project.projectId}` : "clover://projects"],
      instruction: isPortfolio
        ? "Compile the smallest portfolio-wide capsule needed for this mode. Read source-health and delta metadata before raw content; open private Cells only when the source plan, purpose, and current authority permit a minimized projection."
        : "Fetch only the target project and policies needed for the current intent. Open full logs, traces, screenshots, or source trees only after a concrete failure or ambiguity is identified.",
    },
    freshness: {
      policy: "live-readback-before-mutation",
      requiredSources,
      sourcePlan: requiredSources.map((sourceId) => ({ sourceId, ...(SOURCE_ADAPTERS[sourceId] || { connector: "unresolved", action: "resolve supported authoritative source", freshness: "current-task" }) })),
      rule: "A source is current only when the execution thread reads it during the current task or imports a still-valid exact receipt.",
    },
    cost: costLane(intent.id),
    executionPlan: executionSteps(intent.id, project, portfolioMode),
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
      "Project identity or production baseline cannot be verified when a concrete project action is selected.",
      "Required live context is stale, contradictory, or unavailable and would materially affect safety.",
      "The requested action crosses into production, private data, payment, messaging, domains, secrets, or legal commitments without exact approval.",
      "The candidate cannot be backed out to a verified rollback anchor.",
    ],
  };
}

export function commandPrompt(packet) {
  const isPortfolio = packet.intent?.id === PORTFOLIO_INTENT_ID;
  const project = isPortfolio ? "the Clover portfolio" : packet.project?.title || "the portfolio or a new seed";
  const requiredConnectors = [...new Set(packet.freshness.sourcePlan.map((item) => item.connector))].join(", ");
  const lines = [
    `Use CloverApps to ${packet.requestBody}`,
    `Clover command: ${packet.commandId}. Target: ${project}.`,
  ];
  if (isPortfolio) lines.push(`Portfolio operating mode: ${packet.intent.mode}.`);
  lines.push(
    "Canonical context is already bound through the Clover context app; fetch only the records required by this command.",
    `Refresh live state through: ${requiredConnectors || "the supported authoritative connectors"}. Treat unavailable facts as unknown.`,
    "Keep raw private records in their source Cells and use only minimized, purpose-bound projections.",
    "Proceed read-only or preview-only unless I separately approve an exact irreversible action.",
    "Return source identities, evidence, freshness, changes, checks, cost lane, blockers, receipt, and any evidence-backed daily-log or status change.",
  );
  return lines.join("\n");
}
