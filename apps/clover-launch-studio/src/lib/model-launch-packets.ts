import type { OwnerEventCategory } from "./owner-intake";

export type ModelLaunchTarget = "ChatGPT Personal Pro" | "Codex 5.6 Sol Ultra" | "Personal Sites Studio" | "CloverApps collaboration";

export type ModelLaunchPacket = {
  packetId: string;
  targetModelProduct: ModelLaunchTarget;
  targetThreadOrProject: string;
  requiredConnectors: string[];
  exactTarget: string;
  outcome: string;
  mode: "copy-then-open-supported-product";
  sourceAnchors: string[];
  preservationRules: string[];
  cost: { explicitPurchaseCeilingUsd: 0; automaticAdditionalCreditPurchase: false };
  risk: string[];
  rollback: string;
  stopConditions: string[];
  requiredReceipt: string;
  productUrl: string;
  promptPrefillSupported: false;
  consequentialAuthorityGranted: false;
};

const common = {
  mode: "copy-then-open-supported-product" as const,
  sourceAnchors: [
    "main@7d067d79bbff872846d6673b5f852518ba00fa7e",
    "tree-program:index:0001"
  ],
  preservationRules: [
    "Preserve protected main and historical Handoff bytes.",
    "Use synthetic or public-sanitized data only.",
    "Do not infer merge, production, messaging, payment or spending authority."
  ],
  cost: { explicitPurchaseCeilingUsd: 0 as const, automaticAdditionalCreditPurchase: false as const },
  risk: ["Source freshness can degrade.", "A product link does not convey authority."],
  rollback: "Discard unapproved local or synthetic state; preserve source evidence.",
  stopConditions: ["Exact identity mismatch", "Privacy boundary breach", "Authority widening", "Spending required"],
  requiredReceipt: "Return exact source, outcome, effects, unknowns and authority used.",
  promptPrefillSupported: false as const,
  consequentialAuthorityGranted: false as const
};

export const MODEL_LAUNCH_PACKETS: ModelLaunchPacket[] = [
  {
    ...common,
    packetId: "packet:chatgpt-personal-pro-review",
    targetModelProduct: "ChatGPT Personal Pro",
    targetThreadOrProject: "Clover Tree — Owner Console",
    requiredConnectors: ["github", "clover-context-gateway"],
    exactTarget: "Independent source-bound review of the current Tree Action Card",
    outcome: "Return one approve, amend or hold decision with exact evidence.",
    productUrl: "https://chatgpt.com/"
  },
  {
    ...common,
    packetId: "packet:codex-source-candidate",
    targetModelProduct: "Codex 5.6 Sol Ultra",
    targetThreadOrProject: "Existing exact repository task",
    requiredConnectors: ["github", "local-canonical-checkout"],
    exactTarget: "One frozen source boundary and exact candidate head",
    outcome: "Implement, test and return a draft candidate without merge or production.",
    productUrl: "https://chatgpt.com/codex"
  },
  {
    ...common,
    packetId: "packet:personal-sites-studio",
    targetModelProduct: "Personal Sites Studio",
    targetThreadOrProject: "Participant-owned Sites workspace",
    requiredConnectors: [],
    exactTarget: "A participant-authorized synthetic Personal Launch Pod packet",
    outcome: "Prepare a participant-owned Sites preview and receipt; release remains separate.",
    productUrl: "https://chatgpt.com/"
  },
  {
    ...common,
    packetId: "packet:cloverapps-project-delta",
    targetModelProduct: "CloverApps collaboration",
    targetThreadOrProject: "Explicit participant-scoped project",
    requiredConnectors: ["clover-context-gateway"],
    exactTarget: "One permissioned Project Delta with no personal-memory ingestion",
    outcome: "Present the exact delta for participant and owner review without publishing it.",
    productUrl: "https://chatgpt.com/"
  }
];

export function packetForCategory(category: OwnerEventCategory): ModelLaunchPacket {
  if (category === "collaboration opportunity" || category === "branch relationship") return MODEL_LAUNCH_PACKETS[3];
  if (category === "new project" || category === "existing project update") return MODEL_LAUNCH_PACKETS[1];
  return MODEL_LAUNCH_PACKETS[0];
}

export function serializeModelLaunchPacket(packet: ModelLaunchPacket): string {
  return JSON.stringify(packet, null, 2);
}
