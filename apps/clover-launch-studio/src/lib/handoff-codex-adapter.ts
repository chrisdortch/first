import { canonicalJson, sha256, type LaunchSession } from "./storage";

const ACTION_ID = "CLOVER-2026-08-24-006";
const ENVELOPE_ID = "handoff-action:006:launch-studio-phase-b-source";
const SOURCE_COMMIT = "e5688c771d384d80a8c723cfa655298ce8257889";
const SOURCE_TREE = "4c84129b4fb5ea098ac9d2325bc2cb387857a471";

export type HandoffProposal = {
  proposalOnly: true;
  executable: false;
  approvalInherited: false;
  actionId: typeof ACTION_ID;
  envelopeId: typeof ENVELOPE_ID;
  source: { repository: "chrisdortch/first"; branchProvenance: "main"; commit: typeof SOURCE_COMMIT; tree: typeof SOURCE_TREE };
  sessionId: string;
  sessionVersion: number;
  lastEventHash: string | null;
  proposedAt: string;
  proposalHash: string;
};

export function prepareProposalOnlyHandoff(session: LaunchSession, proposedAt = new Date().toISOString()): HandoffProposal {
  const unsigned = {
    proposalOnly: true as const,
    executable: false as const,
    approvalInherited: false as const,
    actionId: ACTION_ID,
    envelopeId: ENVELOPE_ID,
    source: { repository: "chrisdortch/first" as const, branchProvenance: "main" as const, commit: SOURCE_COMMIT, tree: SOURCE_TREE },
    sessionId: session.sessionId,
    sessionVersion: session.version,
    lastEventHash: session.lastEventHash,
    proposedAt
  };
  return { ...unsigned, proposalHash: sha256(canonicalJson(unsigned)) };
}

export function executeHandoff(): never {
  throw new Error("Launch Studio exposes proposal preparation only; Handoff execution is unavailable");
}
