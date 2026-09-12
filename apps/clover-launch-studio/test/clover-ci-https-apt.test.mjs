import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough, Writable } from "node:stream";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { load as loadYaml } from "js-yaml";
import { dependencyInstallInvocation, httpsAptDestination, installHttpsAptDependencies, parseAptSources, prepareHttpsApt, runHttpsAptMethod, validateHttpsAptAcquisition, validateHttpsAptMethodFrame } from "../scripts/clover-ci-https-apt.mjs";

const ubuntu = "http://azure.archive.ubuntu.com/ubuntu";
const keyring = "/usr/share/keyrings/ubuntu-archive-keyring.gpg";
const deb822 = `Types: deb deb-src\nURIs: ${ubuntu}\nSuites: noble noble-updates noble-backports\nComponents: main restricted universe multiverse\nArchitectures: amd64 arm64\nSigned-By: ${keyring}\n`;
const policyRejected = { message: "CLOVER_HTTPS_APT_POLICY_REJECTED" };

function fixture(t) {
  const root = mkdtempSync(path.join(realpathSync(tmpdir()), "clover-https-apt-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const aptDirectory = path.join(root, "apt");
  const workDirectory = path.join(root, "work");
  const methodsDirectory = path.join(root, "methods");
  for (const directory of [aptDirectory, workDirectory, methodsDirectory, path.join(aptDirectory, "sources.list.d")]) mkdirSync(directory);
  writeFileSync(path.join(aptDirectory, "sources.list.d/ubuntu.sources"), deb822);
  for (const name of ["http", "gpgv", "store", "copy", "file", "rred", "ftp", "mirror"]) {
    writeFileSync(path.join(methodsDirectory, name), "synthetic executable, never run\n", { mode: 0o755 });
  }
  symlinkSync("http", path.join(methodsDirectory, "https"));
  return { root, aptDirectory, workDirectory, methodsDirectory };
}

test("HTTPS apt: exact URI policy upgrades only the approved Ubuntu origin", () => {
  assert.equal(httpsAptDestination(`${ubuntu}/`), "https://azure.archive.ubuntu.com/ubuntu");
  for (const uri of ["https://azure.archive.ubuntu.com/ubuntu", "https://packages.microsoft.com/ubuntu/24.04/prod", "https://dl.google.com/linux/chrome-stable/deb"]) assert.equal(httpsAptDestination(uri), uri);
  for (const uri of [
    "http://packages.microsoft.com/ubuntu/24.04/prod", "http://dl.google.com/linux/chrome-stable/deb",
    "http://archive.ubuntu.com/ubuntu", "https://security.ubuntu.com/ubuntu", `${ubuntu}/evil`,
    "https://user:secret@azure.archive.ubuntu.com/ubuntu", "https://azure.archive.ubuntu.com:443/ubuntu",
    `${ubuntu}?token=secret`, `${ubuntu}#fragment`, `${ubuntu}/../evil`, `${ubuntu}/%2e%2e/evil`,
    "https://azure.archive.ubuntu.com.evil/ubuntu", `${ubuntu}\n`, `${ubuntu} https://dl.google.com/linux/chrome-stable/deb`,
    "ftp://azure.archive.ubuntu.com/ubuntu", "file:/etc/passwd", "https://AZURE.ARCHIVE.UBUNTU.COM/ubuntu"
  ]) assert.throws(() => httpsAptDestination(uri), policyRejected, uri);
});

test("HTTPS apt: one-line sources preserve source types, suites, components and signature/architecture options", () => {
  const result = parseAptSources(`# disabled unknown source\n# deb http://unapproved.example stable main\ndeb [arch=amd64,arm64 arch+=riscv64 arch-=i386 signed-by=${keyring}] ${ubuntu} noble-updates main universe # public comment\ndeb-src https://dl.google.com/linux/chrome-stable/deb stable main\n`, "list");
  assert.deepEqual(result, [{ Types: "deb", URIs: "https://azure.archive.ubuntu.com/ubuntu", Suites: "noble-updates", Components: "main universe", Architectures: "amd64 arm64", "Architectures-Add": "riscv64", "Architectures-Remove": "i386", "Signed-By": keyring }, { Types: "deb-src", URIs: "https://dl.google.com/linux/chrome-stable/deb", Suites: "stable", Components: "main" }]);
});

test("HTTPS apt: deb822 continuations, separate stanzas, disabled sources and signature fingerprints", () => {
  const result = parseAptSources(`${deb822}\nTypes: deb\nURIs: https://packages.microsoft.com/ubuntu/24.04/prod\nSuites: noble\nComponents: main\nArchitectures-Add: amd64\n arm64\nArchitectures-Remove: i386\nSigned-By: /etc/apt/keyrings/microsoft.asc\n 0123456789ABCDEF0123456789ABCDEF01234567!\nEnabled: yes\n\nTypes: deb\nURIs: http://disabled.example/repo\nEnabled: no\n`, "sources");
  assert.equal(result.length, 2);
  assert.deepEqual(result[0], { Types: "deb deb-src", URIs: "https://azure.archive.ubuntu.com/ubuntu", Suites: "noble noble-updates noble-backports", Components: "main restricted universe multiverse", Architectures: "amd64 arm64", "Signed-By": keyring });
  assert.equal(result[1]["Architectures-Add"], "amd64 arm64");
  assert.equal(result[1]["Architectures-Remove"], "i386");
  assert.equal(result[1]["Signed-By"], "/etc/apt/keyrings/microsoft.asc 0123456789ABCDEF0123456789ABCDEF01234567!");
});

test("HTTPS apt: malformed, ambiguous and signature-weakening sources fail closed", () => {
  const badDeb822 = [
    deb822.replace("Types: deb deb-src", "Types: deb deb"),
    deb822.replace("URIs:", "Unknown:"),
    `${deb822}URIs: ${ubuntu}\n`,
    deb822.replace(`URIs: ${ubuntu}`, `URIs: ${ubuntu} https://azure.archive.ubuntu.com/ubuntu`),
    deb822.replace(`URIs: ${ubuntu}`, `URIs: https://azure.archive.ubuntu.com/ubuntu\n http://unapproved.example/repo`),
    deb822.replace("Components: main restricted universe multiverse\n", ""),
    `${deb822}Trusted: yes\n`, `${deb822}Check-Valid-Until: no\n`, `${deb822}Allow-Insecure: yes\n`,
    `${deb822}Enabled: maybe\n`, deb822.replace(keyring, "/etc/apt/keyrings/../secret.gpg"),
    deb822.replace(keyring, "https://secret.example/key.gpg"), deb822.replace(keyring, "-----BEGIN PGP PUBLIC KEY BLOCK-----"),
    ` continuation-without-field\n${deb822}`, deb822.replace("noble noble-updates noble-backports", "../other"),
    deb822.replace("Types:", "Types"), `${deb822}\0`, deb822.replace("Components:", "Components:\u001b")
  ];
  for (const content of badDeb822) assert.throws(() => parseAptSources(content, "sources"), policyRejected);
  for (const content of [
    `deb [trusted=yes] ${ubuntu} noble main`, `deb [allow-insecure=yes] ${ubuntu} noble main`,
    `deb [arch=amd64 arch=arm64] ${ubuntu} noble main`, `deb [unknown=value] ${ubuntu} noble main`,
    `deb [signed-by=/tmp/secret.gpg] ${ubuntu} noble main`, `deb ${ubuntu} noble`,
    `deb [arch=amd64 ${ubuntu} noble main`, `deb ${ubuntu} noble main\r`,
    `deb ${ubuntu} noble main;touch`, `deb ${ubuntu} noble main\u007f`
  ]) assert.throws(() => parseAptSources(content, "list"), policyRejected);
});

test("HTTPS apt: isolated policy prevents redirects/downgrades and ambient config overrides", (t) => {
  const inputs = fixture(t);
  writeFileSync(path.join(inputs.aptDirectory, "sources.list"), "deb https://dl.google.com/linux/chrome-stable/deb stable main\n");
  writeFileSync(path.join(inputs.aptDirectory, "apt.conf"), 'Acquire::https::Verify-Peer "false";\n');
  mkdirSync(path.join(inputs.aptDirectory, "apt.conf.d"));
  writeFileSync(path.join(inputs.aptDirectory, "apt.conf.d/99unsafe"), 'Acquire::https::AllowRedirect "true";\n');
  writeFileSync(path.join(inputs.aptDirectory, "sources.list.d/old.list.save"), "deb http://inactive.example stable main\n");
  const result = prepareHttpsApt(inputs);
  assert.equal(result.sourceCount, 2);
  assert.equal(lstatSync(result.root).mode & 0o777, 0o755);
  const config = readFileSync(result.configPath, "utf8");
  for (const line of [
    `Dir::Etc::main "${result.root}/empty.conf";`, `Dir::Etc::parts "${result.root}/empty-conf.d";`,
    `Dir::Etc::netrc "${result.root}/empty.conf";`, `Dir::Etc::netrcparts "${result.root}/empty-conf.d";`,
    `Dir::Etc::sourcelist "${result.root}/empty.list";`, `Dir::Etc::sourceparts "${result.root}/sources.list.d";`,
    `Dir::Bin::methods "${result.root}/methods";`,
    'Acquire::https::Verify-Peer "true";', 'Acquire::https::Verify-Host "true";',
    'Acquire::https::AllowRedirect "false";', 'Acquire::http::AllowRedirect "false";',
    'Acquire::https::Proxy "DIRECT";', 'Acquire::Retries "0";',
    'Acquire::AllowInsecureRepositories "false";', 'Acquire::AllowWeakRepositories "false";',
    'Acquire::AllowDowngradeToInsecureRepositories "false";', 'APT::Get::AllowUnauthenticated "false";'
  ]) assert.ok(config.includes(`${line}\n`), line);
  assert.deepEqual(readdirSync(path.join(result.root, "empty-conf.d")), []);
  assert.equal(readFileSync(path.join(result.root, "empty.conf"), "utf8"), "");
  assert.deepEqual(readdirSync(path.join(result.root, "methods")).sort(), ["copy", "gpgv", "https", "rred", "store"]);
  assert.equal(lstatSync(path.join(result.root, "methods/https")).isSymbolicLink(), false);
  assert.equal(lstatSync(path.join(result.root, "methods/https")).mode & 0o777, 0o755);
  const launcher = readFileSync(path.join(result.root, "methods/https"), "utf8");
  assert.ok(launcher.startsWith("#!/bin/sh\nexec '"));
  assert.ok(launcher.endsWith(" --apt-https-method\n"));
  assert.ok(launcher.includes("clover-ci-https-apt.mjs'"));
  assert.equal(parseAptSources(readFileSync(path.join(result.root, "sources.list.d/validated.sources"), "utf8"), "sources").length, 2);
  assert.match(readFileSync(path.join(inputs.aptDirectory, "apt.conf"), "utf8"), /Verify-Peer "false"/u);
});

test("HTTPS apt: unsafe files/directories, empty source sets and unavailable methods are rejected", (t) => {
  const inputs = fixture(t);
  const source = path.join(inputs.aptDirectory, "sources.list.d/ubuntu.sources");
  rmSync(source);
  assert.throws(() => prepareHttpsApt(inputs), policyRejected);
  assert.deepEqual(readdirSync(inputs.workDirectory), []);
  const target = path.join(inputs.root, "outside.sources");
  writeFileSync(target, deb822);
  symlinkSync(target, source);
  assert.throws(() => prepareHttpsApt(inputs), policyRejected);
  rmSync(source);
  writeFileSync(source, deb822.replace(ubuntu, "http://unknown.example/repo"));
  assert.throws(() => prepareHttpsApt(inputs), policyRejected);
  assert.deepEqual(readdirSync(inputs.workDirectory), []);
  writeFileSync(source, deb822);
  assert.throws(() => prepareHttpsApt({ ...inputs, workDirectory: `${inputs.workDirectory}/../work` }), policyRejected);
  chmodSync(path.join(inputs.methodsDirectory, "http"), 0o644);
  assert.throws(() => prepareHttpsApt(inputs), policyRejected);
});

test("HTTPS apt: privileged installer explicitly selects validated config after sudo environment handling", () => {
  const inputs = { configPath: "/tmp/validated/apt.conf", nodeExecutable: "/opt/node/24.16.0/bin/node", playwrightCli: "/work/app/node_modules/playwright/cli.js" };
  const expected = { executable: "/usr/bin/sudo", args: ["--", "/usr/bin/env", "-i", "PATH=/usr/sbin:/usr/bin:/sbin:/bin", "LANG=C", "DEBIAN_FRONTEND=noninteractive", "APT_CONFIG=/tmp/validated/apt.conf", inputs.nodeExecutable, inputs.playwrightCli, "install-deps", "chromium"] };
  assert.deepEqual(dependencyInstallInvocation(inputs), expected);
  const calls = [];
  installHttpsAptDependencies(inputs, (executable, args, options) => { calls.push({ executable, args, options }); return { status: 0, signal: null }; });
  assert.deepEqual(calls, [{ ...expected, options: { stdio: "inherit" } }]);
  for (const result of [{ status: 1 }, { status: 128 }, { status: null, signal: "SIGTERM" }, { status: null, error: new Error("secret raw spawn text") }]) {
    let count = 0;
    assert.throws(() => installHttpsAptDependencies(inputs, () => { count += 1; return result; }), { message: "CLOVER_HTTPS_APT_DEPENDENCIES_REJECTED" });
    assert.equal(count, 1);
  }
  assert.throws(() => dependencyInstallInvocation({ ...inputs, configPath: "/tmp/../unsafe/apt.conf" }), policyRejected);
});

test("HTTPS apt: installed Playwright consumes inherited config as root; workflow separates one dependency install from browser download", () => {
  const app = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const bundle = readFileSync(path.join(app, "node_modules/playwright-core/lib/coreBundle.js"), "utf8");
  assert.match(bundle, /const isRoot = process\.getuid\?\.\(\) === 0;\s+if \(isRoot\)\s+return \{ command: "sh", args: \["-c",/u);
  assert.match(bundle, /commands2\.push\("apt-get update"\);/u);
  assert.match(bundle, /childProcess2\.spawn\(command, args, \{ stdio: "inherit" \}\)/u);
  const workflow = loadYaml(readFileSync(path.resolve(app, "../../.github/workflows/validate-clover-tree-command-center.yml"), "utf8"));
  const steps = workflow.jobs.browser.steps;
  const helper = steps.findIndex((step) => step.name === "Install Chromium system dependencies over validated HTTPS");
  const browser = steps.findIndex((step) => step.name === "Install Chromium browser runtime");
  assert.ok(helper > steps.findIndex((step) => step.name === "Install exact locked dependencies"));
  assert.equal(browser, helper + 1);
  assert.equal(steps[helper].run, 'node scripts/clover-ci-https-apt.mjs "$RUNNER_TEMP"');
  assert.equal(steps[browser].run, "npx playwright install chromium");
  assert.equal(steps[helper]["working-directory"], "apps/clover-launch-studio");
  assert.ok(browser < steps.findIndex((step) => step.name === "Verify clean source provenance before browser build"));
  assert.equal(steps.filter((step) => typeof step.run === "string" && /playwright install/u.test(step.run)).length, 1);
});

const methodConfiguration = Buffer.from(`601 Configuration\nConfig-Item: Acquire::https::Verify-Peer=true\nConfig-Item: Acquire::https::Verify-Host=true\nConfig-Item: Acquire::https::AllowRedirect=false\nConfig-Item: Acquire::https::Proxy=DIRECT\nConfig-Item: Acquire::http::AllowRedirect=false\nConfig-Item: Acquire::http::Proxy=DIRECT\nConfig-Item: Acquire::Retries=0\nConfig-Item: Acquire::AllowInsecureRepositories=false\nConfig-Item: Acquire::AllowWeakRepositories=false\nConfig-Item: Acquire::AllowDowngradeToInsecureRepositories=false\nConfig-Item: APT::Get::AllowUnauthenticated=false\nConfig-Item: APT::Architecture=amd64\n\n`);
const acquisition = (uri = "https://azure.archive.ubuntu.com/ubuntu/dists/noble/InRelease") => Buffer.from(`600 URI Acquire\nURI: ${uri}\nFilename: /tmp/synthetic-index\nIndex-File: true\n\n`);

function methodDouble({ backpressure = false } = {}) {
  const child = new EventEmitter();
  const forwarded = [];
  const killed = [];
  const launchCalls = [];
  let completed = false;
  const finish = (status, signal = null) => {
    if (completed) return;
    completed = true;
    child.stdout.end();
    child.stderr.end();
    child.emit("exit", status, signal);
    child.emit("close", status, signal);
  };
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = new Writable({
    highWaterMark: backpressure ? 1 : 16384,
    write(chunk, encoding, callback) {
      forwarded.push(Buffer.from(chunk));
      if (backpressure) setImmediate(callback); else callback();
    },
    final(callback) { callback(); setImmediate(() => finish(0)); }
  });
  child.kill = (signal) => { killed.push(signal); setImmediate(() => finish(null, signal)); return true; };
  const input = new PassThrough();
  const output = new PassThrough();
  const errorOutput = new PassThrough();
  const stdout = [];
  const stderr = [];
  output.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
  errorOutput.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
  const launch = (...args) => { launchCalls.push(args); return child; };
  return { child, input, output, errorOutput, launch, finish, forwarded, killed, launchCalls, stdout, stderr };
}

test("HTTPS apt method: every acquisition URI remains inside the allowed HTTPS repository paths", () => {
  for (const uri of ["https://azure.archive.ubuntu.com/ubuntu/pool/main/a/a_1.0+2_amd64.deb", "https://azure.archive.ubuntu.com/ubuntu/pool/main/a/a_1%3a1.0%2b2_amd64.deb", "https://packages.microsoft.com/ubuntu/24.04/prod/dists/noble/InRelease", "https://dl.google.com/linux/chrome-stable/deb/dists/stable/main/binary-amd64/Packages.gz"]) assert.equal(validateHttpsAptAcquisition(uri), uri);
  for (const uri of [
    "http://azure.archive.ubuntu.com/ubuntu/dists/noble/InRelease", "https://unapproved.example/package.deb",
    "https://azure.archive.ubuntu.com/ubuntu-other/file", "https://azure.archive.ubuntu.com/ubuntu/../private",
    "https://azure.archive.ubuntu.com/ubuntu/%2e%2e/private", "https://azure.archive.ubuntu.com/ubuntu/pool%2fprivate",
    "https://azure.archive.ubuntu.com/ubuntu/pool%5cprivate", "https://azure.archive.ubuntu.com/ubuntu//private",
    "https://azure.archive.ubuntu.com/ubuntu/pool%252fprivate", "https://azure.archive.ubuntu.com/ubuntu/pool%2", "https://azure.archive.ubuntu.com/ubuntu/pool%3fprivate",
    "https://user:secret@azure.archive.ubuntu.com/ubuntu/pool/x.deb", "https://azure.archive.ubuntu.com:443/ubuntu/pool/x.deb",
    "https://azure.archive.ubuntu.com/ubuntu/pool/x.deb?secret", "https://azure.archive.ubuntu.com/ubuntu/pool/x.deb#secret",
    "https://azure.archive.ubuntu.com/ubuntu/./private", "https://azure.archive.ubuntu.com/ubuntu/pool\\private"
  ]) assert.throws(() => validateHttpsAptAcquisition(uri), policyRejected);
});

test("HTTPS apt method: malformed protocol and weakening configuration are rejected before forwarding", () => {
  assert.equal(validateHttpsAptMethodFrame(methodConfiguration), true);
  assert.equal(validateHttpsAptMethodFrame(acquisition(), true), true);
  assert.throws(() => validateHttpsAptMethodFrame(acquisition()), policyRejected);
  for (const frame of [
    Buffer.from("602 Something Else\nURI: https://azure.archive.ubuntu.com/ubuntu/file\n\n"),
    Buffer.from(acquisition().toString().replace("Index-File: true", "URI: https://unapproved.example/x")),
    Buffer.from(acquisition().toString().replace("URI:", "Uri:")),
    Buffer.from(acquisition().toString().replace("Filename:", "malformed")),
    Buffer.from(acquisition().toString().replace("Index-File: true", "Index-File: true\u0000private")),
    acquisition().subarray(0, -1), Buffer.alloc(256 * 1024 + 1, 65),
    Buffer.from(methodConfiguration.toString().replace("Verify-Peer=true", "Verify-Peer=false")),
    Buffer.from(methodConfiguration.toString().replace("AllowRedirect=false", "AllowRedirect=true")),
    Buffer.from(methodConfiguration.toString().replace("APT::Architecture=amd64", "Acquire::https::Proxy::unknown=secret")),
    Buffer.from(methodConfiguration.toString().replace("APT::Architecture=amd64", "Acquire::http::Proxy::unknown=secret")),
    Buffer.from(methodConfiguration.toString().replace("Acquire::http::AllowRedirect=false", "Acquire::http::AllowRedirect=true")),
    Buffer.from(methodConfiguration.toString().replace("Acquire::http::Proxy=DIRECT", "Acquire::http::Proxy=http://unapproved.example")),
    Buffer.from(methodConfiguration.toString().replace("Acquire::Retries=0", "Acquire::Retries=1")),
    Buffer.from(methodConfiguration.toString().replace("APT::Architecture=amd64", "Acquire::https::Verify-Peer=true"))
  ]) assert.throws(() => validateHttpsAptMethodFrame(frame, true), policyRejected);
});

test("HTTPS apt method: chunk boundaries, backpressure and native output preserve ordered complete frames", async () => {
  const fake = methodDouble({ backpressure: true });
  const pending = runHttpsAptMethod(fake);
  fake.child.stdout.write("100 Capabilities\nVersion: 1.2\n\n");
  fake.child.stderr.write("synthetic native diagnostic\n");
  const second = acquisition("https://packages.microsoft.com/ubuntu/24.04/prod/dists/noble/InRelease");
  const bytes = Buffer.concat([methodConfiguration, acquisition(), second]);
  for (let offset = 0; offset < bytes.length; offset += 7) fake.input.write(bytes.subarray(offset, offset + 7));
  fake.input.end();
  assert.equal(await pending, 0);
  assert.deepEqual(fake.forwarded, [methodConfiguration, acquisition(), second]);
  assert.deepEqual(fake.killed, []);
  assert.deepEqual(fake.launchCalls, [["/usr/lib/apt/methods/https", [], { stdio: ["pipe", "pipe", "pipe"] }]]);
  assert.equal(Buffer.concat(fake.stdout).toString(), "100 Capabilities\nVersion: 1.2\n\n");
  assert.equal(Buffer.concat(fake.stderr).toString(), "synthetic native diagnostic\n");
});

test("HTTPS apt method: unknown acquisition or redirect hop, incomplete and oversized input terminate only the owned child", async () => {
  for (const bad of [acquisition("https://unapproved.example/private-secret"), acquisition("http://azure.archive.ubuntu.com/ubuntu/file"), acquisition().subarray(0, -1), Buffer.alloc(256 * 1024 + 1, 65)]) {
    const fake = methodDouble();
    const pending = runHttpsAptMethod(fake);
    fake.input.write(methodConfiguration);
    await new Promise(setImmediate);
    fake.input.end(bad);
    assert.equal(await pending, 1);
    assert.deepEqual(fake.forwarded, [methodConfiguration]);
    assert.deepEqual(fake.killed, ["SIGKILL"]);
    assert.equal(Buffer.concat(fake.stderr).toString(), "CLOVER_HTTPS_APT_METHOD_REJECTED\n");
  }
});

test("HTTPS apt method: spawn, signal and early child exit remain failures without private error disclosure or retry", async () => {
  for (const trigger of [(fake) => fake.child.emit("error", new Error("private-secret-spawn-error")), (fake) => fake.finish(null, "SIGTERM"), (fake) => fake.finish(1), (fake) => fake.finish(0)]) {
    const fake = methodDouble();
    const pending = runHttpsAptMethod(fake);
    trigger(fake);
    assert.equal(await pending, 1);
    assert.equal(fake.launchCalls.length, 1);
    assert.equal(Buffer.concat(fake.stderr).toString(), "CLOVER_HTTPS_APT_METHOD_REJECTED\n");
    assert.deepEqual(fake.forwarded, []);
  }
});
