import fs from "node:fs";
import path from "node:path";

const UNIVERSAL_FORBIDDEN_SQL = [
  /\bDROP\s+DATABASE\b/i,
  /\bCREATE\s+DATABASE\b/i,
  /\bDROP\s+SCHEMA\b/i,
  /\bALTER\s+SYSTEM\b/i,
  /\bCREATE\s+(?:USER|ROLE)\b/i,
  /\bALTER\s+(?:USER|ROLE)\b/i,
  /\bGRANT\b/i,
  /\bREVOKE\b/i,
  /\bCOPY\b[\s\S]*\bPROGRAM\b/i,
  /\bCREATE\s+EXTENSION\b/i,
  /\b(?:dblink|postgres_fdw|file_fdw)\b/i,
  /\bpg_(?:read_file|read_binary_file|ls_dir|stat_file)\s*\(/i,
  /\blo_(?:import|export)\s*\(/i,
  /\bTRUNCATE\b/i
];

function assertInside(rootDirectory, candidatePath, label) {
  if (candidatePath !== rootDirectory && !candidatePath.startsWith(`${rootDirectory}${path.sep}`)) {
    throw new Error(`${label} escapes repository`);
  }
}

export function resolveSqlFile(rootDirectory, relativePath) {
  if (typeof relativePath !== "string" || relativePath.length === 0) {
    throw new Error("SQL path must be a non-empty string");
  }
  if (relativePath.includes("\0") || path.isAbsolute(relativePath)) {
    throw new Error(`SQL path must be a safe relative path: ${relativePath}`);
  }

  const root = path.resolve(rootDirectory);
  const rootStat = fs.lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error("Repository root must be a non-symbolic directory");
  }

  const absolute = path.resolve(root, relativePath);
  assertInside(root, absolute, `SQL path ${relativePath}`);

  let cursor = root;
  for (const segment of path.relative(root, absolute).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    const stat = fs.lstatSync(cursor);
    if (stat.isSymbolicLink()) {
      throw new Error(`SQL path contains symbolic link: ${relativePath}`);
    }
  }

  const realRoot = fs.realpathSync(root);
  const realFile = fs.realpathSync(absolute);
  assertInside(realRoot, realFile, `SQL real path ${relativePath}`);
  const fileStat = fs.lstatSync(realFile);
  if (!fileStat.isFile() || fileStat.isSymbolicLink()) {
    throw new Error(`SQL path is not a regular file: ${relativePath}`);
  }
  return realFile;
}

export function screenSqlText(stage, content, { allowDropTableInRollback = false } = {}) {
  if (typeof content !== "string") throw new TypeError("SQL content must be a string");

  // psql recognizes backslash meta-commands even when they share a line with SQL.
  // Version 1.0.1 therefore rejects every backslash byte instead of attempting to
  // distinguish commands such as \!, \include, \connect, and \gexec from SQL text.
  if (content.includes("\\")) {
    throw new Error(`${stage} SQL contains a prohibited psql backslash meta-command or escape`);
  }

  for (const pattern of UNIVERSAL_FORBIDDEN_SQL) {
    if (pattern.test(content)) {
      throw new Error(`${stage} SQL contains prohibited operation: ${pattern}`);
    }
  }
  if (stage === "forward" && /\b(?:DROP\s+TABLE|DROP\s+COLUMN|DELETE\s+FROM)\b/i.test(content)) {
    throw new Error("Forward SQL contains a destructive operation prohibited by the preserve-mode pilot");
  }
  if (stage === "rollback" && !allowDropTableInRollback && /\bDROP\s+TABLE\b/i.test(content)) {
    throw new Error("Rollback SQL may not drop tables under this policy");
  }
  return true;
}

export function screenSqlFile(stage, filePath, options) {
  return screenSqlText(stage, fs.readFileSync(filePath, "utf8"), options);
}
