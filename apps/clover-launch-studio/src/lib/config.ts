export const PROJECT_ID = "clover-launch-studio-private-owner";
export const WORKSPACE_ID = "workspace:clover-launch-studio-private-owner";
export const MAX_REQUEST_BYTES = 64 * 1024;
export const MAX_TRANSCRIPT_BYTES = 48 * 1024;
export const MAX_EXPORT_BYTES = 1024 * 1024;
export const MAX_RESTORE_ARCHIVE_BASE64URL_BYTES = Math.ceil(MAX_EXPORT_BYTES * 4 / 3);
const RESTORE_JSON_OVERHEAD_BYTES = '{"archiveBase64url":""}'.length;
export const MAX_RESTORE_REQUEST_BYTES = RESTORE_JSON_OVERHEAD_BYTES + MAX_RESTORE_ARCHIVE_BASE64URL_BYTES;

export const FUTURE_SESSION_BUDGET = Object.freeze({
  maximumModelCalls: 12,
  maximumImplementationAgents: 2,
  maximumRepairLoops: 3,
  maximumElapsedMinutes: 120,
  maximumProviderCiRuns: 1,
  maximumTargetNullPreviews: 1,
  explicitPurchaseCeilingUsd: 0,
  automaticAdditionalCreditPurchase: false,
  repeatedFailureStop: "same-failure-signature-twice",
  noNewEvidenceStop: "one-repair-loop-with-no-new-evidence"
});

export const FUTURE_VALIDATION_RUNTIMES = Object.freeze(["node-22", "node-24"] as const);

export const PRIVATE_DATA_BOUNDARY = Object.freeze({
  personalChatGptMemoryIngested: false,
  nativeInAppVoice: false,
  rawAudioRetained: false,
  transcriptRetentionApproved: false,
  ownerControlledDeletionRequiresSeparateApproval: true,
  keyDestructionRequiresSeparateApproval: true
});

export type AuthMode = "provider" | "synthetic";

export type RuntimeConfig = {
  authMode: AuthMode;
  canonicalOrigin: string;
  providerIssuer: string | null;
  providerAudience: string | null;
  syntheticOwnerSubject: string | null;
  syntheticBearerToken: string | null;
  csrfSecret: string;
};

export class ConfigurationError extends Error {
  constructor(message = "Launch Studio is not configured") {
    super(message);
    this.name = "ConfigurationError";
  }
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new ConfigurationError();
  return value;
}

export function readRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const authMode = env.CLOVER_LAUNCH_STUDIO_AUTH_MODE?.trim();
  if (authMode !== "provider" && authMode !== "synthetic") {
    throw new ConfigurationError();
  }
  if (authMode === "synthetic" && env.NODE_ENV === "production") {
    throw new ConfigurationError("Synthetic authentication is forbidden in production");
  }

  return {
    authMode,
    canonicalOrigin: new URL(required(env, "CLOVER_LAUNCH_STUDIO_ORIGIN")).origin,
    providerIssuer: authMode === "provider" ? required(env, "CLOVER_LAUNCH_STUDIO_AUTH_ISSUER") : null,
    providerAudience: authMode === "provider" ? required(env, "CLOVER_LAUNCH_STUDIO_AUTH_AUDIENCE") : null,
    syntheticOwnerSubject: authMode === "synthetic" ? required(env, "CLOVER_LAUNCH_STUDIO_SYNTHETIC_SUBJECT") : null,
    syntheticBearerToken: authMode === "synthetic" ? required(env, "CLOVER_LAUNCH_STUDIO_SYNTHETIC_TOKEN") : null,
    csrfSecret: required(env, "CLOVER_LAUNCH_STUDIO_CSRF_SECRET")
  };
}

export function publicReadiness(dimensions: {
  applicationSourceValidated: true;
  treeProgramBaselineLoaded: true;
  treePreviewRuntimeObserved: boolean;
  liveGithubOverlayStatus: "current" | "stale" | "unavailable" | "unknown";
  deploymentAttestationStatus: "verified" | "unavailable" | "invalid" | "inconsistent";
  ownerConsoleGroundingRequired: true;
  privateOwnerAuthenticationConfigured: false;
  durablePrivateStorageConfigured: false;
  realParticipantRuntimeConfigured: false;
  realProviderExecutionConfigured: false;
  productionAuthorized: false;
}) {
  return {
    service: PROJECT_ID,
    version: "0.2.0",
    ...dimensions,
    privateDataAccessed: false,
    consequentialAuthorityGranted: false
  } as const;
}
