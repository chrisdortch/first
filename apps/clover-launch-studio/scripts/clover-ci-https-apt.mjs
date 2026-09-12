import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const reject = () => { throw new Error("CLOVER_HTTPS_APT_POLICY_REJECTED"); };
const atom = /^[A-Za-z0-9][A-Za-z0-9+_.-]*$/u;
const destinations = new Set([
  "https://azure.archive.ubuntu.com/ubuntu",
  "https://packages.microsoft.com/ubuntu/24.04/prod",
  "https://dl.google.com/linux/chrome-stable/deb"
]);
const fields = new Set(["Types", "URIs", "Suites", "Components", "Architectures", "Architectures-Add", "Architectures-Remove", "Signed-By", "Enabled"]);
const options = new Map([["arch", "Architectures"], ["arch+", "Architectures-Add"], ["arch-", "Architectures-Remove"], ["signed-by", "Signed-By"]]);
const methodFrameLimit = 256 * 1024;
const nativeHttpsMethod = "/usr/lib/apt/methods/https";
const methodRejection = "CLOVER_HTTPS_APT_METHOD_REJECTED\n";
const requiredMethodConfiguration = new Map([
  ["acquire::https::verify-peer", "true"], ["acquire::https::verify-host", "true"],
  ["acquire::https::allowredirect", "false"], ["acquire::https::proxy", "DIRECT"],
  ["acquire::http::allowredirect", "false"], ["acquire::http::proxy", "DIRECT"], ["acquire::retries", "0"],
  ["acquire::allowinsecurerepositories", "false"], ["acquire::allowweakrepositories", "false"],
  ["acquire::allowdowngradetoinsecurerepositories", "false"], ["apt::get::allowunauthenticated", "false"]
]);

export function validateHttpsAptAcquisition(uri) {
  if (typeof uri !== "string" || uri.length > 8192 || !/^[\x21-\x7e]+$/u.test(uri) || /[?#\\]/u.test(uri)) reject();
  const base = [...destinations].find((destination) => uri === destination || uri.startsWith(`${destination}/`));
  if (!base) reject();
  const suffix = uri.slice(base.length);
  if (suffix) for (const segment of suffix.slice(1).split("/")) {
    let decoded;
    try { decoded = decodeURIComponent(segment); } catch { reject(); }
    if (!decoded || decoded === "." || decoded === ".." || !/^[A-Za-z0-9._+~:@-]+$/u.test(decoded)) reject();
  }
  return uri;
}

export function validateHttpsAptMethodFrame(frame, configured = false) {
  if (!Buffer.isBuffer(frame) || frame.length > methodFrameLimit || !frame.subarray(-2).equals(Buffer.from("\n\n")) || [...frame].some((byte) => byte !== 10 && byte !== 9 && (byte < 32 || byte > 126))) reject();
  const lines = frame.toString("ascii").slice(0, -2).split("\n");
  const verb = lines.shift();
  if (!["601 Configuration", "600 URI Acquire"].includes(verb) || !lines.length || lines.some((line) => !/^[A-Za-z][A-Za-z0-9-]*: [^\r\n]+$/u.test(line))) reject();
  if (verb === "601 Configuration") {
    const observed = new Map();
    for (const line of lines) {
      const match = /^Config-Item: ([A-Za-z0-9:_.+-]+)=(.*)$/u.exec(line);
      if (!match) reject();
      const key = match[1].toLowerCase();
      if (/^acquire::https?::/u.test(key) && !requiredMethodConfiguration.has(key)) reject();
      if (requiredMethodConfiguration.has(key)) {
        if (observed.has(key) || match[2] !== requiredMethodConfiguration.get(key)) reject();
        observed.set(key, match[2]);
      }
    }
    if (observed.size !== requiredMethodConfiguration.size) reject();
    return true;
  }
  if (!configured) reject();
  const uriLines = lines.filter((line) => /^URI:/iu.test(line));
  if (uriLines.length !== 1 || !uriLines[0].startsWith("URI: ")) reject();
  validateHttpsAptAcquisition(uriLines[0].slice(5));
  return true;
}

export async function runHttpsAptMethod({ input = process.stdin, output = process.stdout, errorOutput = process.stderr, launch = spawn } = {}) {
  let child;
  let exited = false;
  let inputEnded = false;
  let stopped = false;
  try {
    child = launch(nativeHttpsMethod, [], { stdio: ["pipe", "pipe", "pipe"] });
    const completed = new Promise((resolve, rejectChild) => {
      child.once("error", () => { exited = true; rejectChild(new Error(methodRejection)); });
      child.once("exit", (code, signal) => {
        exited = true;
        if (code !== 0 || signal || !inputEnded) rejectChild(new Error(methodRejection));
      });
      child.once("close", (code, signal) => {
        exited = true;
        if (code === 0 && !signal && inputEnded) resolve(); else rejectChild(new Error(methodRejection));
      });
      for (const stream of [input, output, errorOutput, child.stdin, child.stdout, child.stderr]) stream.once("error", () => rejectChild(new Error(methodRejection)));
    });
    child.stdout.pipe(output, { end: false });
    child.stderr.pipe(errorOutput, { end: false });
    const forward = async () => {
      let buffered = Buffer.alloc(0);
      let configured = false;
      for await (const chunk of input) {
        if (stopped) return;
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        if (bytes.length > methodFrameLimit) reject();
        buffered = Buffer.concat([buffered, bytes]);
        let end;
        while ((end = buffered.indexOf("\n\n")) !== -1) {
          const frame = buffered.subarray(0, end + 2);
          configured = validateHttpsAptMethodFrame(frame, configured);
          if (!child.stdin.write(frame)) await Promise.race([once(child.stdin, "drain"), completed]);
          buffered = buffered.subarray(end + 2);
        }
        if (buffered.length > methodFrameLimit) reject();
      }
      if (stopped) return;
      if (buffered.length || !configured) reject();
      inputEnded = true;
      child.stdin.end();
    };
    await Promise.race([forward(), completed]);
    await completed;
    return 0;
  } catch {
    stopped = true;
    if (child && !exited) child.kill("SIGKILL");
    if (child?.stdin) child.stdin.destroy();
    input.destroy();
    try { errorOutput.write(methodRejection); } catch { /* A closed diagnostic stream cannot authorize acquisition. */ }
    return 1;
  }
}

function tokens(value) {
  const result = value.trim().split(/\s+/u);
  if (!result.length || result.some((item) => !atom.test(item) || item === "..")) reject();
  return result;
}

function signedBy(value) {
  const result = value.trim().split(/\s+/u);
  if (result.some((item) => !/^(?:\/(?:usr\/share|etc\/apt)\/keyrings\/[A-Za-z0-9][A-Za-z0-9_.-]*\.(?:gpg|asc)|[A-Fa-f0-9]{40}!?)$/u.test(item))) reject();
  return result.join(" ");
}

export function httpsAptDestination(value) {
  if (typeof value !== "string" || /[\s\u0000-\u001f\u007f]/u.test(value)) reject();
  // Compare the complete URI: credentials, ports, queries, escapes and path tricks fail closed.
  let normalized = value.endsWith("/") ? value.slice(0, -1) : value;
  if (normalized === "http://azure.archive.ubuntu.com/ubuntu") normalized = "https://azure.archive.ubuntu.com/ubuntu";
  if (!destinations.has(normalized)) reject();
  return normalized;
}

function validateStanza(stanza) {
  if (Object.keys(stanza).some((key) => !fields.has(key))) reject();
  if (stanza.Enabled !== undefined && !["yes", "no"].includes(stanza.Enabled)) reject();
  if (stanza.Enabled === "no") return null;
  for (const key of ["Types", "URIs", "Suites", "Components"]) if (!stanza[key]) reject();
  const types = tokens(stanza.Types);
  if (types.some((type) => !["deb", "deb-src"].includes(type)) || new Set(types).size !== types.length) reject();
  // One URI per stanza prevents fallback/mixed-origin acquisition; split sources explicitly instead.
  const result = { Types: types.join(" "), URIs: httpsAptDestination(stanza.URIs), Suites: tokens(stanza.Suites).join(" "), Components: tokens(stanza.Components).join(" ") };
  for (const key of ["Architectures", "Architectures-Add", "Architectures-Remove"]) {
    if (stanza[key] !== undefined) result[key] = tokens(stanza[key]).join(" ");
  }
  if (stanza["Signed-By"] !== undefined) result["Signed-By"] = signedBy(stanza["Signed-By"]);
  return result;
}

export function parseAptSources(text, format) {
  if (typeof text !== "string" || Buffer.byteLength(text) > 1024 * 1024 || /[^\x09\x0a\x20-\x7e]/u.test(text) || !["list", "sources"].includes(format)) reject();
  const result = [];
  if (format === "list") {
    for (const raw of text.split("\n")) {
      const line = raw.split("#", 1)[0].trim();
      if (!line) continue;
      const match = /^(deb|deb-src)\s+(?:\[([^\[\]]+)\]\s+)?(\S+)\s+(\S+)\s+(.+)$/u.exec(line);
      if (!match) reject();
      const stanza = { Types: match[1], URIs: match[3], Suites: match[4], Components: match[5] };
      if (match[2]) for (const item of match[2].trim().split(/\s+/u)) {
        const option = /^([a-z+-]+)=([^=]+)$/u.exec(item);
        const key = option && options.get(option[1]);
        if (!key || Object.hasOwn(stanza, key)) reject();
        stanza[key] = option[2].replaceAll(",", " ");
      }
      result.push(validateStanza(stanza));
    }
  } else {
    let stanza = {};
    let previous = null;
    const flush = () => {
      if (Object.keys(stanza).length) result.push(validateStanza(stanza));
      stanza = {};
      previous = null;
    };
    for (const line of [...text.split("\n"), ""]) {
      if (!line.trim()) { flush(); continue; }
      if (line.trimStart().startsWith("#")) continue;
      if (/^[ \t]/u.test(line)) {
        if (!previous) reject();
        stanza[previous] += ` ${line.trim()}`;
        continue;
      }
      const match = /^([A-Za-z][A-Za-z-]*):[ \t]*(.*)$/u.exec(line);
      if (!match || !fields.has(match[1]) || Object.hasOwn(stanza, match[1])) reject();
      previous = match[1];
      stanza[previous] = match[2].trim();
    }
  }
  return result.filter(Boolean);
}

function safeDirectory(directory) {
  if (typeof directory !== "string" || !path.isAbsolute(directory) || path.normalize(directory) !== directory || !/^[A-Za-z0-9/_.-]+$/u.test(directory)) reject();
  const metadata = lstatSync(directory);
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || realpathSync(directory) !== directory) reject();
  return directory;
}

function readSource(target) {
  const metadata = lstatSync(target);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1 || metadata.size > 1024 * 1024) reject();
  return readFileSync(target, "utf8");
}

export function prepareHttpsApt({ aptDirectory, workDirectory, methodsDirectory }) {
  safeDirectory(aptDirectory);
  safeDirectory(workDirectory);
  safeDirectory(methodsDirectory);
  const sources = [];
  const main = path.join(aptDirectory, "sources.list");
  if (readdirSync(aptDirectory).includes("sources.list")) sources.push(...parseAptSources(readSource(main), "list"));
  const parts = path.join(aptDirectory, "sources.list.d");
  safeDirectory(parts);
  for (const name of readdirSync(parts).sort()) {
    if (!/\.(?:list|sources)$/u.test(name)) continue; // The same inactive suffixes apt ignores.
    if (!/^[A-Za-z0-9_.-]+\.(?:list|sources)$/u.test(name)) reject();
    sources.push(...parseAptSources(readSource(path.join(parts, name)), name.endsWith(".list") ? "list" : "sources"));
  }
  if (!sources.length) reject();
  // Validate all sources before creating anything. No native apt/configuration is changed here.
  const root = mkdtempSync(path.join(workDirectory, "clover-ci-https-apt-"));
  chmodSync(root, 0o755); // apt's _apt user must be able to traverse its method/source directory.
  const configurationParts = path.join(root, "empty-conf.d");
  const sourceParts = path.join(root, "sources.list.d");
  const methods = path.join(root, "methods");
  for (const directory of [configurationParts, sourceParts, methods]) mkdirSync(directory, { mode: 0o755 });
  const write = (name, value) => writeFileSync(path.join(root, name), value, { mode: 0o644, flag: "wx" });
  write("empty.conf", "");
  write("empty.list", "");
  write("sources.list.d/validated.sources", `${sources.map((source) => Object.entries(source).map(([key, value]) => `${key}: ${value}`).join("\n")).join("\n\n")}\n`);
  // No HTTP/FTP/mirror method is available. Every HTTPS acquisition is gated before native transport.
  // Ubuntu's native https entry may itself be a symlink to its http binary.
  for (const name of ["https", "gpgv", "store", "copy", "rred"]) {
    const target = path.join(methodsDirectory, name);
    if (!readdirSync(methodsDirectory).includes(name)) {
      if (["https", "gpgv"].includes(name)) reject();
      continue;
    }
    const resolved = realpathSync(target);
    if (!resolved.startsWith(`${methodsDirectory}/`) || !statSync(target).isFile() || !(statSync(target).mode & 0o111)) reject();
    if (name === "https") {
      const node = realpathSync(process.execPath);
      const helper = fileURLToPath(import.meta.url);
      const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
      writeFileSync(path.join(methods, name), `#!/bin/sh\nexec ${quote(node)} ${quote(helper)} --apt-https-method\n`, { mode: 0o755, flag: "wx" });
    } else symlinkSync(target, path.join(methods, name));
  }
  const config = [
    // APT_CONFIG is read first: isolate later main/parts files so ambient settings cannot override it.
    `Dir::Etc::main "${root}/empty.conf";`,
    `Dir::Etc::parts "${configurationParts}";`,
    `Dir::Etc::netrc "${root}/empty.conf";`,
    `Dir::Etc::netrcparts "${configurationParts}";`,
    `Dir::Etc::sourcelist "${root}/empty.list";`,
    `Dir::Etc::sourceparts "${sourceParts}";`,
    `Dir::Bin::methods "${methods}";`,
    'Acquire::https::Verify-Peer "true";',
    'Acquire::https::Verify-Host "true";',
    'Acquire::https::AllowRedirect "false";',
    'Acquire::http::AllowRedirect "false";',
    'Acquire::https::Proxy "DIRECT";',
    'Acquire::http::Proxy "DIRECT";',
    'Acquire::Retries "0";',
    'Acquire::AllowInsecureRepositories "false";',
    'Acquire::AllowWeakRepositories "false";',
    'Acquire::AllowDowngradeToInsecureRepositories "false";',
    'APT::Get::AllowUnauthenticated "false";'
  ].join("\n");
  write("apt.conf", `${config}\n`);
  return { root, configPath: path.join(root, "apt.conf"), sourceCount: sources.length };
}

export function dependencyInstallInvocation({ configPath, nodeExecutable, playwrightCli }) {
  for (const value of [configPath, nodeExecutable, playwrightCli]) {
    if (typeof value !== "string" || !path.isAbsolute(value) || path.normalize(value) !== value || !/^[A-Za-z0-9/_.-]+$/u.test(value)) reject();
  }
  return {
    executable: "/usr/bin/sudo",
    args: ["--", "/usr/bin/env", "-i", "PATH=/usr/sbin:/usr/bin:/sbin:/bin", "LANG=C", "DEBIAN_FRONTEND=noninteractive", `APT_CONFIG=${configPath}`, nodeExecutable, playwrightCli, "install-deps", "chromium"]
  };
}

export function installHttpsAptDependencies(inputs, run = spawnSync) {
  const invocation = dependencyInstallInvocation(inputs);
  // env runs AFTER sudo; Playwright is already root and its apt children inherit this exact policy.
  const result = run(invocation.executable, invocation.args, { stdio: "inherit" });
  if (result.error || result.signal || result.status !== 0) throw new Error("CLOVER_HTTPS_APT_DEPENDENCIES_REJECTED");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href && process.argv[2] === "--apt-https-method") {
  if (process.platform !== "linux" || process.argv.length !== 3) reject();
  process.exitCode = await runHttpsAptMethod();
} else if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.platform !== "linux" || process.argv.length !== 3) reject();
  const app = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const nodeExecutable = realpathSync(process.execPath);
  const playwrightCli = path.join(app, "node_modules/playwright/cli.js");
  if (lstatSync(playwrightCli).isSymbolicLink() || !lstatSync(playwrightCli).isFile() || realpathSync(playwrightCli) !== playwrightCli) reject();
  const policy = prepareHttpsApt({ aptDirectory: "/etc/apt", workDirectory: process.argv[2], methodsDirectory: "/usr/lib/apt/methods" });
  installHttpsAptDependencies({ configPath: policy.configPath, nodeExecutable, playwrightCli });
}
