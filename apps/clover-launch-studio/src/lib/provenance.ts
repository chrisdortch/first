export type BuildProvenance = {
  documentType: "clover-tree-build-provenance";
  schemaVersion: "0.3.0";
  commit: string;
  tree: string;
  parent: string;
  stackABase: string;
  runtimeDeploymentKey: string;
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
  buildOutputCommand: "npx --yes vercel@59.6.2 build --yes";
  buildOutputToolPackage: "vercel";
  buildOutputToolVersion: "59.6.2";
  buildOutputToolIntegrity: "sha512-lChRklfQeumAGYSMiur5DUbUNFMxvuaoaAffOeO/BcDEgp1hOzq3wo6fejsOWcMcCewibl4OsfP9LM27xb3PzQ==";
  buildProjectSettingsSha256: string;
  buildInvocationId: string;
  publicSanitized: true;
  privateDataAccessed: false;
  consequentialAuthorityGranted: false;
};

export type DeploymentAttestation = {
  documentType: "clover-tree-deployment-attestation";
  schemaVersion: "0.3.0";
  buildInvocationId: string;
  source: {
    commit: string;
    tree: string;
    parent: string;
    stackABase: string;
    runtimeDeploymentKey: string;
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
const RUNTIME_DEPLOYMENT_KEY = /^clover-[0-9a-f]{24}$/u;
const BUILD_PROVENANCE_SOURCE_KEYS = [
  "commit", "tree", "parent", "stackABase", "runtimeDeploymentKey", "cleanWorktree", "changedPathCount",
  "pathListSha256", "sourceManifestSha256", "packageLockSha256", "treeProgramIndexId", "treeProgramIndexHash", "treeProgramIndexRawSha256",
  "nodeVersion", "nextVersion", "buildMode", "buildCommand", "buildOutputCommand", "buildOutputToolPackage", "buildOutputToolVersion",
  "buildOutputToolIntegrity", "buildProjectSettingsSha256"
] as const;
const BUILD_PROVENANCE_KEYS = [
  "documentType", "schemaVersion", ...BUILD_PROVENANCE_SOURCE_KEYS, "buildInvocationId", "publicSanitized", "privateDataAccessed",
  "consequentialAuthorityGranted"
] as const;

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

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const closed = [...expected].sort();
  return actual.length === closed.length && actual.every((key, index) => key === closed[index]);
}

function synchronousSha256(value: string): string {
  const bytes = new TextEncoder().encode(value);
  const bitLength = bytes.length * 8;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x1_0000_0000), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);
  const constants = new Uint32Array([
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ]);
  const state = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
  const words = new Uint32Array(64);
  const rotateRight = (word: number, count: number) => (word >>> count) | (word << (32 - count));
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4, false);
    for (let index = 16; index < 64; index += 1) {
      const s0 = rotateRight(words[index - 15], 7) ^ rotateRight(words[index - 15], 18) ^ (words[index - 15] >>> 3);
      const s1 = rotateRight(words[index - 2], 17) ^ rotateRight(words[index - 2], 19) ^ (words[index - 2] >>> 10);
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
    }
    let [a,b,c,d,e,f,g,h] = state;
    for (let index = 0; index < 64; index += 1) {
      const upper = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choose = (e & f) ^ (~e & g);
      const first = (h + upper + choose + constants[index] + words[index]) >>> 0;
      const lower = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const second = (lower + majority) >>> 0;
      h = g; g = f; f = e; e = (d + first) >>> 0; d = c; c = b; b = a; a = (first + second) >>> 0;
    }
    state[0] = (state[0] + a) >>> 0; state[1] = (state[1] + b) >>> 0; state[2] = (state[2] + c) >>> 0; state[3] = (state[3] + d) >>> 0;
    state[4] = (state[4] + e) >>> 0; state[5] = (state[5] + f) >>> 0; state[6] = (state[6] + g) >>> 0; state[7] = (state[7] + h) >>> 0;
  }
  return Array.from(state, (word) => word.toString(16).padStart(8, "0")).join("");
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
  if (!hasExactKeys(value, BUILD_PROVENANCE_KEYS) || value.documentType !== "clover-tree-build-provenance" || value.schemaVersion !== "0.3.0") {
    throw new Error("CLOVER_BUILD_PROVENANCE_REJECTED");
  }
  for (const key of ["commit", "tree", "parent", "stackABase"]) exactHex(value, key, HEX_40);
  for (const key of ["pathListSha256", "sourceManifestSha256", "packageLockSha256", "treeProgramIndexHash", "treeProgramIndexRawSha256", "buildProjectSettingsSha256"]) {
    exactHex(value, key, HEX_64);
  }
  exactBoolean(value, "cleanWorktree", true);
  exactBoolean(value, "publicSanitized", true);
  exactBoolean(value, "privateDataAccessed", false);
  exactBoolean(value, "consequentialAuthorityGranted", false);
  const runtimeDeploymentKey = exactString(value, "runtimeDeploymentKey");
  if (!RUNTIME_DEPLOYMENT_KEY.test(runtimeDeploymentKey) || runtimeDeploymentKey !== `clover-${exactString(value, "commit").slice(0, 24)}`) {
    throw new Error("CLOVER_RUNTIME_DEPLOYMENT_KEY_REJECTED");
  }
  if (exactInteger(value, "changedPathCount") === 0) throw new Error("CLOVER_BUILD_PROVENANCE_REJECTED");
  if (
    value.buildMode !== "vercel-prebuilt-preview" || value.buildCommand !== "npm run build" ||
    value.buildOutputCommand !== "npx --yes vercel@59.6.2 build --yes" || value.buildOutputToolPackage !== "vercel" ||
    value.buildOutputToolVersion !== "59.6.2" ||
    value.buildOutputToolIntegrity !== "sha512-lChRklfQeumAGYSMiur5DUbUNFMxvuaoaAffOeO/BcDEgp1hOzq3wo6fejsOWcMcCewibl4OsfP9LM27xb3PzQ=="
  ) {
    throw new Error("CLOVER_BUILD_PROVENANCE_REJECTED");
  }
  if (!/^v(?:22|24)\./u.test(exactString(value, "nodeVersion"))) throw new Error("CLOVER_BUILD_PROVENANCE_REJECTED");
  const sourceDomain = Object.fromEntries(BUILD_PROVENANCE_SOURCE_KEYS.map((key) => [key, value[key]]));
  const expectedBuildInvocationId = `clover-build:${synchronousSha256(`${canonicalJson(sourceDomain)}\n`)}`;
  if (exactString(value, "buildInvocationId") !== expectedBuildInvocationId) throw new Error("CLOVER_BUILD_PROVENANCE_REJECTED");
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
  if (!isRecord(value) || value.documentType !== "clover-tree-deployment-attestation" || value.schemaVersion !== "0.3.0") {
    throw new Error("CLOVER_DEPLOYMENT_ATTESTATION_REJECTED");
  }
  if (!hasExactKeys(value, ["documentType", "schemaVersion", "buildInvocationId", "source", "output", "normalization", "publicSanitized", "privateDataAccessed", "secretsIncluded", "consequentialAuthorityGranted", "attestationHash"]) ||
    !isRecord(value.source) || !hasExactKeys(value.source, ["commit", "tree", "parent", "stackABase", "runtimeDeploymentKey", "changedPathCount", "pathListSha256", "sourceManifestSha256", "packageLockSha256", "treeProgramIndexId", "treeProgramIndexHash", "nodeVersion", "nextVersion", "buildMode"]) ||
    !isRecord(value.output) || !hasExactKeys(value.output, ["manifestRootSha256", "regularFileCount", "symlinkCount", "aggregateRegularFileBytes", "attestationExcludedPath"]) || !Array.isArray(value.normalization)) {
    throw new Error("CLOVER_DEPLOYMENT_ATTESTATION_REJECTED");
  }
  exactHex(value, "attestationHash", HEX_64);
  if (!/^clover-build:[0-9a-f]{64}$/u.test(exactString(value, "buildInvocationId"))) throw new Error("CLOVER_DEPLOYMENT_ATTESTATION_REJECTED");
  for (const key of ["commit", "tree", "parent", "stackABase"]) exactHex(value.source, key, HEX_40);
  const runtimeDeploymentKey = exactString(value.source, "runtimeDeploymentKey");
  if (!RUNTIME_DEPLOYMENT_KEY.test(runtimeDeploymentKey) || runtimeDeploymentKey !== `clover-${exactString(value.source, "commit").slice(0, 24)}`) {
    throw new Error("CLOVER_DEPLOYMENT_ATTESTATION_REJECTED");
  }
  for (const key of ["pathListSha256", "sourceManifestSha256", "packageLockSha256", "treeProgramIndexHash"]) exactHex(value.source, key, HEX_64);
  for (const key of ["manifestRootSha256"]) exactHex(value.output, key, HEX_64);
  for (const key of ["changedPathCount"]) exactInteger(value.source, key);
  for (const key of ["regularFileCount", "symlinkCount", "aggregateRegularFileBytes"]) exactInteger(value.output, key);
  if (value.output.attestationExcludedPath !== "static/__clover/deployment-attestation.json") throw new Error("CLOVER_DEPLOYMENT_ATTESTATION_REJECTED");
  exactBoolean(value, "publicSanitized", true);
  exactBoolean(value, "privateDataAccessed", false);
  exactBoolean(value, "secretsIncluded", false);
  exactBoolean(value, "consequentialAuthorityGranted", false);
  let previousPath: string | null = null;
  for (const item of value.normalization) {
    if (!isRecord(item) || !hasExactKeys(item, ["path", "classification", "beforeSha256", "afterSha256"])) throw new Error("CLOVER_DEPLOYMENT_ATTESTATION_REJECTED");
    const itemPath = exactString(item, "path");
    if (itemPath !== itemPath.normalize("NFC") || itemPath.startsWith("/") || itemPath.includes("\\") || /[\0\r\n]/u.test(itemPath) || itemPath.split("/").some((segment) => segment.length === 0 || segment === "." || segment === "..") || previousPath !== null && previousPath >= itemPath) throw new Error("CLOVER_DEPLOYMENT_ATTESTATION_REJECTED");
    const expectedClassification = itemPath === "builds.json" || itemPath === "diagnostics/cli_traces.json"
      ? "vercel-cli-metadata-root"
      : /^functions\/.+\/apps\/clover-launch-studio\/___next_launcher\.cjs$/u.test(itemPath) ? "next-launcher-runtime-root" : null;
    if (item.classification !== expectedClassification) throw new Error("CLOVER_DEPLOYMENT_ATTESTATION_REJECTED");
    exactHex(item, "beforeSha256", HEX_64);
    exactHex(item, "afterSha256", HEX_64);
    if (item.beforeSha256 === item.afterSha256) throw new Error("CLOVER_DEPLOYMENT_ATTESTATION_REJECTED");
    previousPath = itemPath;
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
    ["runtime-deployment-key", attestation.source.runtimeDeploymentKey, build.runtimeDeploymentKey],
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
