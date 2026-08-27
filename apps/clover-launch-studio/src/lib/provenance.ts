export type BuildProvenance = {
  documentType: "clover-tree-build-provenance";
  schemaVersion: "0.2.0";
  commit: string;
  tree: string;
  parent: string;
  stackABase: string;
  cleanWorktree: true;
  changedPathCount: number;
  pathListSha256: string;
  sourceManifestSha256: string;
  packageLockSha256: string;
  treeProgramIndexId: string;
  treeProgramIndexHash: string;
  treeProgramIndexRawSha256: string;
  nodeVersion: string;
  nextVersion: string;
  buildMode: "vercel-prebuilt-preview";
  buildCommand: "npm run build";
  buildOutputCommand: "vercel build --yes";
  buildInvocationId: string;
  publicSanitized: true;
  privateDataAccessed: false;
  consequentialAuthorityGranted: false;
};

export type DeploymentAttestation = {
  documentType: "clover-tree-deployment-attestation";
  schemaVersion: "0.2.0";
  buildInvocationId: string;
  source: {
    commit: string;
    tree: string;
    parent: string;
    stackABase: string;
    changedPathCount: number;
    pathListSha256: string;
    sourceManifestSha256: string;
    packageLockSha256: string;
    treeProgramIndexId: string;
    treeProgramIndexHash: string;
    nodeVersion: string;
    nextVersion: string;
    buildMode: string;
  };
  output: {
    manifestRootSha256: string;
    regularFileCount: number;
    symlinkCount: number;
    aggregateRegularFileBytes: number;
    attestationExcludedPath: string;
  };
  normalization: Array<{
    path: string;
    classification: string;
    beforeSha256: string;
    afterSha256: string;
  }>;
  publicSanitized: true;
  privateDataAccessed: false;
  secretsIncluded: false;
  consequentialAuthorityGranted: false;
  attestationHash: string;
};

export type AttestationComparison = {
  status: "verified" | "unavailable" | "invalid" | "inconsistent";
  consistent: boolean;
  differences: string[];
  attestationHash: string | null;
  outputManifestRootSha256: string | null;
};

const HEX_40 = /^[0-9a-f]{40}$/u;
const HEX_64 = /^[0-9a-f]{64}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (isRecord(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function exactString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) throw new Error(`CLOVER_PROVENANCE_FIELD_REJECTED:${key}`);
  return value;
}

function exactBoolean(record: Record<string, unknown>, key: string, expected: boolean): void {
  if (record[key] !== expected) throw new Error(`CLOVER_PROVENANCE_FIELD_REJECTED:${key}`);
}

function exactInteger(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error(`CLOVER_PROVENANCE_FIELD_REJECTED:${key}`);
  return Number(value);
}

function exactHex(record: Record<string, unknown>, key: string, expression: RegExp): string {
  const value = exactString(record, key);
  if (!expression.test(value)) throw new Error(`CLOVER_PROVENANCE_FIELD_REJECTED:${key}`);
  return value;
}

export function parseBuildProvenance(value: unknown): BuildProvenance {
  if (!isRecord(value)) throw new Error("CLOVER_BUILD_PROVENANCE_REJECTED");
  if (value.documentType !== "clover-tree-build-provenance" || value.schemaVersion !== "0.2.0") {
    throw new Error("CLOVER_BUILD_PROVENANCE_REJECTED");
  }
  for (const key of ["commit", "tree", "parent", "stackABase"]) exactHex(value, key, HEX_40);
  for (const key of ["pathListSha256", "sourceManifestSha256", "packageLockSha256", "treeProgramIndexHash", "treeProgramIndexRawSha256"]) {
    exactHex(value, key, HEX_64);
  }
  exactBoolean(value, "cleanWorktree", true);
  exactBoolean(value, "publicSanitized", true);
  exactBoolean(value, "privateDataAccessed", false);
  exactBoolean(value, "consequentialAuthorityGranted", false);
  if (exactInteger(value, "changedPathCount") === 0) throw new Error("CLOVER_BUILD_PROVENANCE_REJECTED");
  if (value.buildMode !== "vercel-prebuilt-preview" || value.buildCommand !== "npm run build" || value.buildOutputCommand !== "vercel build --yes") {
    throw new Error("CLOVER_BUILD_PROVENANCE_REJECTED");
  }
  if (!/^v(?:22|24)\./u.test(exactString(value, "nodeVersion"))) throw new Error("CLOVER_BUILD_PROVENANCE_REJECTED");
  if (!/^clover-build:[0-9a-f]{64}$/u.test(exactString(value, "buildInvocationId"))) throw new Error("CLOVER_BUILD_PROVENANCE_REJECTED");
  exactString(value, "treeProgramIndexId");
  exactString(value, "nextVersion");
  return value as BuildProvenance;
}

export function readBuildProvenance(encoded = process.env.CLOVER_BUILD_PROVENANCE_JSON): BuildProvenance {
  if (!encoded || encoded.length > 32 * 1024) throw new Error("CLOVER_BUILD_PROVENANCE_UNAVAILABLE");
  try {
    return parseBuildProvenance(JSON.parse(encoded));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("CLOVER_")) throw error;
    throw new Error("CLOVER_BUILD_PROVENANCE_REJECTED");
  }
}

export function parseDeploymentAttestation(value: unknown): DeploymentAttestation {
  if (!isRecord(value) || value.documentType !== "clover-tree-deployment-attestation" || value.schemaVersion !== "0.2.0") {
    throw new Error("CLOVER_DEPLOYMENT_ATTESTATION_REJECTED");
  }
  if (!isRecord(value.source) || !isRecord(value.output) || !Array.isArray(value.normalization)) {
    throw new Error("CLOVER_DEPLOYMENT_ATTESTATION_REJECTED");
  }
  exactHex(value, "attestationHash", HEX_64);
  if (!/^clover-build:[0-9a-f]{64}$/u.test(exactString(value, "buildInvocationId"))) throw new Error("CLOVER_DEPLOYMENT_ATTESTATION_REJECTED");
  for (const key of ["commit", "tree", "parent", "stackABase"]) exactHex(value.source, key, HEX_40);
  for (const key of ["pathListSha256", "sourceManifestSha256", "packageLockSha256", "treeProgramIndexHash"]) exactHex(value.source, key, HEX_64);
  for (const key of ["manifestRootSha256"]) exactHex(value.output, key, HEX_64);
  for (const key of ["changedPathCount"]) exactInteger(value.source, key);
  for (const key of ["regularFileCount", "symlinkCount", "aggregateRegularFileBytes"]) exactInteger(value.output, key);
  if (value.output.attestationExcludedPath !== "static/__clover/deployment-attestation.json") throw new Error("CLOVER_DEPLOYMENT_ATTESTATION_REJECTED");
  exactBoolean(value, "publicSanitized", true);
  exactBoolean(value, "privateDataAccessed", false);
  exactBoolean(value, "secretsIncluded", false);
  exactBoolean(value, "consequentialAuthorityGranted", false);
  for (const item of value.normalization) {
    if (!isRecord(item)) throw new Error("CLOVER_DEPLOYMENT_ATTESTATION_REJECTED");
    exactString(item, "path");
    exactString(item, "classification");
    exactHex(item, "beforeSha256", HEX_64);
    exactHex(item, "afterSha256", HEX_64);
  }
  return value as DeploymentAttestation;
}

export async function compareDeploymentAttestation(build: BuildProvenance, candidate: unknown): Promise<AttestationComparison> {
  if (candidate === null || candidate === undefined) {
    return { status: "unavailable", consistent: false, differences: ["attestation-unavailable"], attestationHash: null, outputManifestRootSha256: null };
  }
  let attestation: DeploymentAttestation;
  try {
    attestation = parseDeploymentAttestation(candidate);
  } catch {
    return { status: "invalid", consistent: false, differences: ["attestation-structure-invalid"], attestationHash: null, outputManifestRootSha256: null };
  }
  const { attestationHash, ...body } = attestation;
  const computedHash = await sha256(`${canonicalJson(body)}\n`);
  const differences: string[] = [];
  if (computedHash !== attestationHash) differences.push("attestation-self-hash");
  const exactBindings: Array<[string, unknown, unknown]> = [
    ["build-invocation", attestation.buildInvocationId, build.buildInvocationId],
    ["source-commit", attestation.source.commit, build.commit],
    ["source-tree", attestation.source.tree, build.tree],
    ["source-parent", attestation.source.parent, build.parent],
    ["stack-a-base", attestation.source.stackABase, build.stackABase],
    ["changed-path-count", attestation.source.changedPathCount, build.changedPathCount],
    ["path-list", attestation.source.pathListSha256, build.pathListSha256],
    ["source-manifest", attestation.source.sourceManifestSha256, build.sourceManifestSha256],
    ["package-lock", attestation.source.packageLockSha256, build.packageLockSha256],
    ["tree-program-index-id", attestation.source.treeProgramIndexId, build.treeProgramIndexId],
    ["tree-program-index-hash", attestation.source.treeProgramIndexHash, build.treeProgramIndexHash],
    ["node-version", attestation.source.nodeVersion, build.nodeVersion],
    ["next-version", attestation.source.nextVersion, build.nextVersion],
    ["build-mode", attestation.source.buildMode, build.buildMode]
  ];
  for (const [label, actual, expected] of exactBindings) if (actual !== expected) differences.push(label);
  return {
    status: differences.length === 0 ? "verified" : "inconsistent",
    consistent: differences.length === 0,
    differences,
    attestationHash,
    outputManifestRootSha256: attestation.output.manifestRootSha256
  };
}
