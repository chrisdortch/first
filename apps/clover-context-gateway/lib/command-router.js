import crypto from "node:crypto";

const INTENTS = [
  {
    id: "launch_project",
    patterns: ["plant a seed", "new seed", "new project", "launch a new project", "start a project", "create an app"],
    requiresProject: false,
  },
  {
    id: "evolve_project",
    patterns: ["evolve", "improve", "update", "revise", "build", "add feature", "make better", "continue building"],
    requiresProject: true,
  },
  {
    id: "diagnose_project",
    patterns: ["fix", "error", "errors", "log", "logs", "broken", "failing", "diagnose", "why is"],
    requiresProject: true,
  },
  {
    id: "inspect_status",
    patterns: ["status", "how complete", "completion", "what next", "where are we", "progress"],
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
    id: "release_candidate",
    patterns: ["release", "publish", "promote", "merge", "deploy production", "launch production"],
    requiresProject: true,
  },
  {
    id: "update_openai_site",
    patterns: ["openai site", "site update", "update the site", "edit site"],
    requiresProject: true,
  },
  {
    id: "research",
    patterns: ["research", "deep dive", "analyze market", "investigate possibilities", "compare options"],
    requiresProject: false,
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

function detectIntent(request) {
  const normalized = normalize(request);
  const scored = INTENTS.map((intent) => ({
    intent,
    score: intent.patterns.reduce((total, pattern) => total + (normalized.includes(normalize(pattern)) ? pattern.length : 0), 0),
  })).sort((a, b) => b.score - a.score);
  return scored[0].score > 0 ? scored[0].intent : INTENTS.find((intent) => intent.id === "evolve_project");
}

function projectTokens(project) {
  return [project.projectId, project.title, project.repository, project.publicUrl]
    .filter(Boolean)
    .flatMap((value) => normalize(value).split(/\s+/))
    .filter(Boolean);
}

function resolveProject(request, projects) {
  const normalized = normalize(request);
  for (const [alias, projectId] of Object.entries(PROJECT_ALIASES)) {
    if (normalized.includes(normalize(alias))) {
      const match = projects.find((project) => project.projectId === projectId);
      if (match) return { project: match, confidence: "alias-exact" };
    }
  }

  const ranked = projects
    .map((project) => {
      const tokenSet = new Set(projectTokens(project));
      const requestTokens = normalize(request).split(/\s+/).filter(Boolean);
      const score = requestTokens.reduce((total, token) => total + (tokenSet.has(token) ? token.length : 0), 0);
      return { project, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  if (!ranked.length) return { project: null, confidence: "unresolved" };
  return { project: ranked[0].project, confidence: ranked[0].score >= 12 ? "high" : "medium-low" };
}

function costLane(intentId) {
  if (["inspect_status", "backup_project"].includes(intentId)) {
    return {
      defaultLane: "deterministic-and-chat-pro",
      additionalPurchaseExpected: false,
      explanation: "Use canonical files, connected read tools, CI, and ordinary Chat Pro reasoning first.",
    };
  }
  if (intentId === "update_openai_site") {
    return {
      defaultLane: "prepare-in-chat-pro-then-official-sites-gate",
      additionalPurchaseExpected: "only-if-sites-or-agentic-allowance-is-exhausted",
      explanation: "Prepare and verify the exact candidate outside Sites; spend Sites/Work capacity only on the authenticated save/deploy gate.",
    };
  }
  if (intentId === "review_preview") {
    return {
      defaultLane: "deterministic-first-bounded-vision-second",
      additionalPurchaseExpected: false,
      explanation: "Use screenshots, tests, and contact sheets first; full browser control is an escalation, not the default.",
    };
  }
  return {
    defaultLane: "chat-pro-with-connected-tools",
    additionalPurchaseExpected: false,
    explanation: "Use Chat Pro for architecture and bounded repository work; escalate to Codex/Work only for capabilities unavailable here.",
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

export function prepareCommand({ request, projects, status, pointer }) {
  const originalRequest = String(request || "").trim();
  if (!originalRequest) throw new Error("A command request is required.");
  const intent = detectIntent(originalRequest);
  const resolution = resolveProject(originalRequest, projects || []);
  const project = resolution.project;
  const requiresProjectResolution = intent.requiresProject && !project;
  const requiredSources = LIVE_SOURCE_REQUIREMENTS[intent.id] || [];
  const sourceFingerprint = `${pointer?.currentVersion || "unknown"}:${status?.asOf || "unknown"}:${project?.projectId || "portfolio"}:${normalize(originalRequest)}`;
  const commandId = `clover-${crypto.createHash("sha256").update(sourceFingerprint).digest("hex").slice(0, 16)}`;

  return {
    schemaVersion: "1.0",
    commandId,
    createdAt: new Date().toISOString(),
    originalRequest,
    normalizedRequest: normalize(originalRequest),
    intent: {
      id: intent.id,
      requiresProject: intent.requiresProject,
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
    },
    freshness: {
      policy: "live-readback-before-mutation",
      requiredSources,
      rule: "A source is current only when the execution thread reads it during the current task or imports a still-valid signed receipt.",
    },
    cost: costLane(intent.id),
    executionPlan: executionSteps(intent.id, project),
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
  return [
    `Use CloverApps to ${packet.originalRequest}`,
    "Read the current Clover Master Plan, status, project registry, Build Protocol, and Data Change Protocol through the Clover context app.",
    `Target: ${project}. Command ID: ${packet.commandId}.`,
    "Refresh the required live sources before changing anything. Treat unavailable facts as unknown.",
    "Proceed preview-only unless I separately approve an exact irreversible action.",
    "Return the exact source identity, changes, checks, preview, cost lane, blockers, receipt, and updated completion evidence.",
  ].join("\n");
}
