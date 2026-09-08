import { PROJECT_ID, WORKSPACE_ID } from "./config";
import type { OwnerIdentity } from "./auth";

export class AccessDeniedError extends Error {
  constructor() {
    super("Request denied");
    this.name = "AccessDeniedError";
  }
}

export type OwnerScope = {
  workspaceId: string;
  projectId: string;
  participantId: string;
};

export function ownerScope(identity: OwnerIdentity): OwnerScope {
  return { workspaceId: WORKSPACE_ID, projectId: PROJECT_ID, participantId: identity.participantId };
}

export function assertOwnerScope(identity: OwnerIdentity, scope: OwnerScope): void {
  if (
    scope.workspaceId !== WORKSPACE_ID ||
    scope.projectId !== PROJECT_ID ||
    scope.participantId !== identity.participantId ||
    identity.projectId !== PROJECT_ID
  ) throw new AccessDeniedError();
}

export function assertOpaqueId(value: string, prefix: string): void {
  if (!new RegExp(`^${prefix}:[a-f0-9]{64}$`).test(value)) throw new AccessDeniedError();
}
