import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptsDir, "..");
const repositoryRoot = path.resolve(appDir, "../..");
const bundledContextRoot = path.join(appDir, "context-snapshot");

if (!process.env.CONTEXT_ROOT) {
  const repositoryPointer = path.join(repositoryRoot, "CLOVER_MASTER_PLAN_POINTER.json");
  process.env.CONTEXT_ROOT = fs.existsSync(repositoryPointer)
    ? repositoryRoot
    : bundledContextRoot;
}

await import("../server.js");
