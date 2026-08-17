import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptsDir, "..");
const repositoryRoot = path.resolve(appDir, "../..");
const snapshotRoot = path.join(appDir, "context-snapshot");
const manifestPath = path.join(snapshotRoot, "manifest.json");

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const hash = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");
const failures = [];

for (const file of manifest.files) {
  const snapshotPath = path.join(snapshotRoot, file.path);
  if (!fs.existsSync(snapshotPath)) {
    failures.push(`Missing snapshot file: ${file.path}`);
    continue;
  }

  const snapshotBytes = fs.readFileSync(snapshotPath);
  const snapshotHash = hash(snapshotBytes);
  if (file.sha256 && file.sha256 !== snapshotHash) {
    failures.push(`Snapshot hash mismatch: ${file.path}`);
  }

  const canonicalPath = path.join(repositoryRoot, file.path);
  if (fs.existsSync(canonicalPath)) {
    const canonicalBytes = fs.readFileSync(canonicalPath);
    if (!canonicalBytes.equals(snapshotBytes)) {
      failures.push(`Snapshot differs from canonical source: ${file.path}`);
    }
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "passed",
  sourceRepository: manifest.sourceRepository,
  sourceCommit: manifest.sourceCommit,
  files: manifest.files.length,
  canonicalSourceAvailable: fs.existsSync(path.join(repositoryRoot, "CLOVER_MASTER_PLAN_POINTER.json")),
}));
