import type { TreeBranch } from "./tree-program";

export const OWNER_EVENT_CATEGORIES = [
  "new project",
  "existing project update",
  "branch relationship",
  "collaboration opportunity",
  "Captain's Log observation",
  "no-build idea"
] as const;

export type OwnerEventCategory = (typeof OWNER_EVENT_CATEGORIES)[number];

export type OwnerInputAnalysis = {
  category: OwnerEventCategory;
  confidence: "rule-match" | "fallback";
  understandingCheck: string;
  affectedBranchIds: string[];
  sourceCoverageRequirements: string[];
  predictedFruit: string;
  recommendedOption: string;
};

export type OwnerTextRevision = {
  revision: number;
  text: string;
  byteCount: number;
  sha256: string;
  predecessorSha256: string | null;
  rawAudioRetained: false;
};

const categoryRules: Array<[OwnerEventCategory, RegExp]> = [
  ["no-build idea", /\b(?:no[- ]build|do not build|idea only|parking lot)\b/iu],
  ["Captain's Log observation", /\b(?:captain(?:'s)? log|observ(?:e|ed|ation)|learned|actual result)\b/iu],
  ["collaboration opportunity", /\b(?:collaborat\w*|partner\w*|joint venture|jv|contributor\w*|revenue share)\b/iu],
  ["branch relationship", /\b(?:depend(?:s|ency)?|relat(?:e|ion)|feeds|connects?|blocks?|parent|child branch)\b/iu],
  ["existing project update", /\b(?:update|repair|improve|change|existing|current|release)\b/iu],
  ["new project", /\b(?:new project|start|create|launch|build|prototype)\b/iu]
];

const normalize = (value: string) => value.trim().replace(/\s+/gu, " ");

export function classifyOwnerInput(value: string): { category: OwnerEventCategory; confidence: "rule-match" | "fallback" } {
  const normalized = normalize(value);
  for (const [category, pattern] of categoryRules) {
    if (pattern.test(normalized)) return { category, confidence: "rule-match" };
  }
  return { category: "no-build idea", confidence: "fallback" };
}

export function analyzeOwnerInput(value: string, branches: TreeBranch[]): OwnerInputAnalysis {
  const normalized = normalize(value);
  const classification = classifyOwnerInput(normalized);
  const lower = normalized.toLocaleLowerCase("en-US");
  const affected = branches.filter((branch) => {
    const tokens = branch.title.toLocaleLowerCase("en-US").split(/[^a-z0-9]+/u).filter((token) => token.length > 3);
    return tokens.some((token) => lower.includes(token));
  }).map(({ branchId }) => branchId).slice(0, 4);
  const affectedBranchIds = affected.length > 0 ? affected : ["branch:clover-core"];
  return {
    ...classification,
    understandingCheck: normalized
      ? `I understand this as a ${classification.category} affecting ${affectedBranchIds.length} governed branch${affectedBranchIds.length === 1 ? "" : "es"}. No action has been executed.`
      : "Add reviewed synthetic text before classification. No action has been executed.",
    affectedBranchIds,
    sourceCoverageRequirements: [
      "Bind the exact reviewed text and SHA-256.",
      "Refresh public source identity for every affected branch.",
      "Keep unavailable or private sources explicitly unavailable."
    ],
    predictedFruit: normalized
      ? `A bounded ${classification.category} packet could clarify one safe next decision; no causal outcome is yet observed.`
      : "No forecast exists without reviewed input.",
    recommendedOption: classification.category === "no-build idea"
      ? "Record the idea without opening a build gate."
      : "Prepare one source-bound review packet; keep execution, merge and production separate."
  };
}

export async function sha256Text(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (part) => part.toString(16).padStart(2, "0")).join("");
}

export async function createOwnerTextRevision(value: string, history: OwnerTextRevision[]): Promise<OwnerTextRevision> {
  const text = value;
  const sha256 = await sha256Text(text);
  return {
    revision: history.length + 1,
    text,
    byteCount: new TextEncoder().encode(text).byteLength,
    sha256,
    predecessorSha256: history.at(-1)?.sha256 ?? null,
    rawAudioRetained: false
  };
}
