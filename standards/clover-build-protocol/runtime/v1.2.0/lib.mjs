import { execFileSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
export const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
export const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  fs.writeFileSync(file, bytes);
  if (process.env.GITHUB_OUTPUT) {
    const outputName = `${path.basename(file, '.json').replace(/[^A-Za-z0-9_]/g, '_')}_sha256`;
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${outputName}=${sha256(bytes)}\n`);
  }
};
export const git = (root, ...args) => execFileSync('git', args, {
  cwd: root,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe']
}).trim();

export function assertFullSha(value, label) {
  if (!/^[0-9a-f]{40}$/.test(value || '')) throw new Error(`${label} must be an exact 40-character lowercase Git SHA.`);
}

export function resolveContainedPath(rootArg, relativeArg, label = 'path') {
  if (!relativeArg || path.isAbsolute(relativeArg)) throw new Error(`${label} must be a non-absolute path.`);
  const parts = relativeArg.split(/[\\/]+/);
  if (parts.some((part) => !part || part === '.' || part === '..')) throw new Error(`${label} contains a forbidden path segment.`);
  const root = fs.realpathSync(rootArg);
  let cursor = root;
  for (const part of parts) {
    cursor = path.join(cursor, part);
    const stat = fs.lstatSync(cursor);
    if (stat.isSymbolicLink()) throw new Error(`${label} traverses a symbolic link: ${part}`);
  }
  const resolved = fs.realpathSync(cursor);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error(`${label} escapes its root.`);
  return resolved;
}

const allowedExecutables = new Set(['npm', 'pnpm', 'yarn', 'bun']);
const forbiddenShellNames = new Set(['sh', 'bash', 'zsh', 'dash', 'fish', 'ksh', 'csh', 'cmd', 'powershell', 'pwsh']);
const forbiddenArg = /[\u0000\r\n;&|<>`$]/;

export function validateCommand(command) {
  if (!command || typeof command !== 'object' || Array.isArray(command)) throw new Error('Command must be an object.');
  const keys = Object.keys(command);
  if (keys.some((key) => !['executable', 'args', 'timeoutSeconds'].includes(key))) throw new Error('Command contains an unsupported property.');
  const executable = command.executable;
  if (typeof executable !== 'string' || path.basename(executable) !== executable || executable.includes('/') || executable.includes('\\')) throw new Error('Executable must be an unqualified basename.');
  if (forbiddenShellNames.has(executable) || !allowedExecutables.has(executable)) throw new Error(`Executable is not allowed: ${executable}`);
  if (!Array.isArray(command.args) || command.args.length < 1 || command.args.length > 64) throw new Error('Command args must contain 1 to 64 items.');
  for (const arg of command.args) {
    if (typeof arg !== 'string' || arg.length < 1 || arg.length > 256 || forbiddenArg.test(arg)) throw new Error(`Forbidden argv item: ${JSON.stringify(arg)}`);
  }
  const timeoutSeconds = command.timeoutSeconds ?? 900;
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 1800) throw new Error('timeoutSeconds must be an integer from 1 through 1800.');
  return { executable, args: [...command.args], timeoutSeconds };
}

export function commandList(policy, key) {
  const value = policy.commands?.[key];
  const values = Array.isArray(value) ? value : [value];
  if ((key === 'install' || key === 'preview') && values.length !== 1) throw new Error(`${key} must contain exactly one command.`);
  if (key === 'verify' && (values.length < 1 || values.length > 8)) throw new Error('verify must contain 1 to 8 commands.');
  return values.map((value) => validateCommandForRole(value, key));
}

export function validateCommandForRole(commandArg, role) {
  const command = validateCommand(commandArg);
  const [verb, script, separator] = command.args;
  const scriptName = /^[A-Za-z0-9:_-]+$/;
  if (role === 'install') {
    const allowedFlags = new Set(['--ignore-scripts', '--prefer-offline', '--offline', '--audit=false', '--fund=false', '--frozen-lockfile', '--immutable']);
    const validVerb = (command.executable === 'npm' && verb === 'ci') || (command.executable !== 'npm' && verb === 'install');
    const requiredLockFlag = command.executable === 'pnpm' || command.executable === 'bun' ? '--frozen-lockfile' : command.executable === 'yarn' ? '--immutable' : null;
    if (!validVerb || command.args.slice(1).some((arg) => !allowedFlags.has(arg)) || (requiredLockFlag && !command.args.includes(requiredLockFlag))) throw new Error(`Install command violates the ${command.executable} locked-install grammar.`);
    return command;
  }
  if (!['verify', 'preview'].includes(role)) throw new Error(`Unknown command role: ${role}`);
  const testForm = role === 'verify' && verb === 'test' && (command.args.length === 1 || script === '--');
  const runForm = verb === 'run' && scriptName.test(script || '') && (command.args.length === 2 || separator === '--');
  if (!testForm && !runForm) throw new Error(`${role} command must use a package-manager test or run-script grammar with an explicit -- before script argv.`);
  return command;
}

function trackedEntries(root) {
  const raw = execFileSync('git', ['ls-files', '-s', '-z'], { cwd: root });
  const items = raw.toString('utf8').split('\0').filter(Boolean);
  return items.map((item) => {
    const match = /^(\d+) ([0-9a-f]+) (\d+)\t([\s\S]+)$/.exec(item);
    if (!match) throw new Error(`Could not parse tracked entry: ${item}`);
    const [, mode, indexObject, stage, relative] = match;
    const absolute = path.join(root, relative);
    let observedType = 'missing';
    let observedSha256 = null;
    try {
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) {
        observedType = 'symlink';
        observedSha256 = sha256(Buffer.from(fs.readlinkSync(absolute)));
      } else if (stat.isFile()) {
        observedType = 'file';
        observedSha256 = sha256(fs.readFileSync(absolute));
      } else if (stat.isDirectory()) {
        observedType = 'directory';
        observedSha256 = indexObject;
      } else {
        observedType = 'other';
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    return { path: relative, mode, indexObject, stage, observedType, observedSha256 };
  });
}

export function snapshotSource(rootArg, policyArg) {
  const root = fs.realpathSync(rootArg);
  const policy = fs.realpathSync(policyArg);
  if (policy !== root && !policy.startsWith(`${root}${path.sep}`)) throw new Error('Policy path escapes the candidate root.');
  const tracked = snapshotTrackedGitRoot(root);
  return {
    schemaVersion: '1.2',
    protocolVersion: '1.2.0',
    capturedAt: new Date().toISOString(),
    source: tracked.source,
    tracked: tracked.tracked,
    policy: {
      path: path.relative(root, policy).split(path.sep).join('/'),
      sha256: sha256(fs.readFileSync(policy))
    }
  };
}

export function snapshotTrackedGitRoot(rootArg) {
  const root = fs.realpathSync(rootArg);
  const entries = trackedEntries(root);
  const statusRaw = execFileSync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=no'], { cwd: root });
  return {
    source: { commit: git(root, 'rev-parse', 'HEAD'), tree: git(root, 'rev-parse', 'HEAD^{tree}') },
    tracked: {
      entryCount: entries.length,
      treeSha256: sha256(Buffer.from(`${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`)),
      statusSha256: sha256(statusRaw),
      statusBase64: statusRaw.toString('base64')
    }
  };
}

export function snapshotProtocolCheckout() {
  const root = process.env.CLOVER_PROTOCOL_CHECKOUT;
  const expectedCommit = process.env.CLOVER_PROTOCOL_REF;
  if (!root || !expectedCommit) throw new Error('CLOVER_PROTOCOL_CHECKOUT and CLOVER_PROTOCOL_REF are required for protocol integrity checks.');
  assertFullSha(expectedCommit, 'CLOVER_PROTOCOL_REF');
  const snapshot = snapshotTrackedGitRoot(root);
  const tooling = snapshotDirectoryTree(path.join(root, 'node_modules'));
  return { ...snapshot, tooling, expectedCommit, exactCommit: snapshot.source.commit === expectedCommit, trackedClean: snapshot.tracked.statusBase64 === '' };
}

function snapshotDirectoryTree(root) {
  if (!fs.existsSync(root)) return { present: false, entryCount: 0, treeSha256: null };
  const entries = [];
  const visit = (directory, prefix = '') => {
    for (const name of fs.readdirSync(directory).sort()) {
      const absolute = path.join(directory, name);
      const relative = prefix ? `${prefix}/${name}` : name;
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) entries.push({ path: relative, type: 'symlink', mode: stat.mode, sha256: sha256(Buffer.from(fs.readlinkSync(absolute))) });
      else if (stat.isDirectory()) { entries.push({ path: relative, type: 'directory', mode: stat.mode }); visit(absolute, relative); }
      else if (stat.isFile()) entries.push({ path: relative, type: 'file', mode: stat.mode, size: stat.size, sha256: sha256(fs.readFileSync(absolute)) });
      else entries.push({ path: relative, type: 'other', mode: stat.mode });
    }
  };
  visit(root);
  return { present: true, entryCount: entries.length, treeSha256: sha256(Buffer.from(`${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`)) };
}

export function compareProtocolSnapshots(before, after) {
  const changed = before.source.commit !== after.source.commit || before.source.tree !== after.source.tree || before.tracked.treeSha256 !== after.tracked.treeSha256 || before.tracked.statusSha256 !== after.tracked.statusSha256 || before.tooling.treeSha256 !== after.tooling.treeSha256;
  const valid = !changed && before.exactCommit && before.trackedClean && before.tooling.present && after.exactCommit && after.trackedClean && after.tooling.present;
  return {
    state: changed ? 'observed' : valid ? 'not-observed' : 'unknown',
    basis: 'Compared exact protocol HEAD/tree, all tracked bytes/modes/index objects, tracked status, and the installed protocol-tooling tree before and after the project process.',
    expectedCommit: before.expectedCommit,
    before: { commit: before.source.commit, tree: before.source.tree, trackedTreeSha256: before.tracked.treeSha256, trackedStatusSha256: before.tracked.statusSha256, toolingTreeSha256: before.tooling.treeSha256, exactCommit: before.exactCommit, trackedClean: before.trackedClean },
    after: { commit: after.source.commit, tree: after.source.tree, trackedTreeSha256: after.tracked.treeSha256, trackedStatusSha256: after.tracked.statusSha256, toolingTreeSha256: after.tooling.treeSha256, exactCommit: after.exactCommit, trackedClean: after.trackedClean }
  };
}

export function compareSnapshots(before, after) {
  const trackedChanged = before.tracked.treeSha256 !== after.tracked.treeSha256 || before.tracked.statusSha256 !== after.tracked.statusSha256;
  const policyChanged = before.policy.sha256 !== after.policy.sha256;
  const commitChanged = before.source.commit !== after.source.commit || before.source.tree !== after.source.tree;
  const basis = (fields) => `Compared ${fields.join(', ')} before and after execution.`;
  return {
    trackedTreeMutation: {
      state: trackedChanged ? 'observed' : 'not-observed',
      basis: basis(['tracked entry bytes/modes/index objects', 'tracked porcelain status']),
      beforeSha256: before.tracked.treeSha256,
      afterSha256: after.tracked.treeSha256,
      beforeStatusSha256: before.tracked.statusSha256,
      afterStatusSha256: after.tracked.statusSha256
    },
    policyMutation: {
      state: policyChanged ? 'observed' : 'not-observed',
      basis: basis(['raw policy SHA-256']),
      beforeSha256: before.policy.sha256,
      afterSha256: after.policy.sha256
    },
    sourceCommitMutation: {
      state: commitChanged ? 'observed' : 'not-observed',
      basis: basis(['HEAD commit', 'HEAD committed tree']),
      beforeCommit: before.source.commit,
      afterCommit: after.source.commit,
      beforeTree: before.source.tree,
      afterTree: after.source.tree
    }
  };
}

export const localStatePassed = (observations) => [observations.trackedTreeMutation, observations.policyMutation, observations.sourceCommitMutation].every((item) => item.state === 'not-observed');

function commandEnvironment() {
  const names = ['PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP', 'CI', 'NODE_ENV', 'LANG', 'LC_ALL', 'TERM', 'NO_COLOR', 'CLOVER_BUILD_MODE'];
  return Object.fromEntries(names.filter((name) => typeof process.env[name] === 'string').map((name) => [name, process.env[name]]));
}

export function executeCommand(commandArg, { cwd, logFd }) {
  const command = validateCommand(commandArg);
  return new Promise((resolve) => {
    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    let timedOut = false;
    let spawnError = null;
    const child = spawn(command.executable, command.args, {
      cwd,
      env: commandEnvironment(),
      shell: false,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const write = (chunk, destination) => {
      destination.write(chunk);
      if (logFd !== undefined) fs.writeSync(logFd, chunk);
    };
    child.stdout.on('data', (chunk) => write(chunk, process.stdout));
    child.stderr.on('data', (chunk) => write(chunk, process.stderr));
    child.on('error', (error) => { spawnError = error?.message || String(error); });
    const timer = setTimeout(() => {
      timedOut = true;
      if (child.pid) { try { process.kill(-child.pid, 'SIGTERM'); } catch {} }
      setTimeout(() => { if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} } }, 5000).unref();
    }, command.timeoutSeconds * 1000);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      let processGroupTermination = 'not-needed-or-not-observed';
      if (child.pid) {
        try { process.kill(-child.pid, 'SIGTERM'); processGroupTermination = 'signal-sent'; } catch (error) { if (error?.code === 'ESRCH') processGroupTermination = 'no-remaining-process-group'; else processGroupTermination = `error:${error?.code || 'unknown'}`; }
      }
      setTimeout(() => resolve({
        executable: command.executable,
        args: command.args,
        shell: false,
        startedAt,
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - startedMs,
        processStarted: child.pid !== undefined,
        pidObserved: child.pid ?? null,
        exitCode: code,
        signal: signal || null,
        timedOut,
        processGroupTermination,
        error: spawnError,
        status: code === 0 && !timedOut && !spawnError ? 'passed' : 'failed'
      }), 250);
    });
  });
}

export const unknownExternalObservation = () => ({
  state: 'unknown',
  basis: 'No provider-specific readback or external side-effect telemetry was available to this isolated runner.'
});

export function globToRegExp(glob) {
  let source = '^';
  for (let index = 0; index < glob.length; index += 1) {
    const character = glob[index];
    if (character === '*' && glob[index + 1] === '*') { source += '.*'; index += 1; }
    else if (character === '*') source += '[^/]*';
    else if (character === '?') source += '[^/]';
    else source += character.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
  }
  return new RegExp(`${source}$`);
}

export const matchesAny = (file, patterns) => patterns.some((pattern) => globToRegExp(pattern).test(file));

export function resolveLoopbackRoute(baseUrl, routePath) {
  const base = new URL(baseUrl);
  if (base.protocol !== 'http:' || base.hostname !== '127.0.0.1' || !base.port) throw new Error('Browser base URL must be loopback HTTP with an explicit port.');
  if (typeof routePath !== 'string' || !routePath.startsWith('/') || routePath.startsWith('//') || routePath.includes('\\') || /[\r\n]/.test(routePath)) throw new Error(`Invalid loopback route path: ${JSON.stringify(routePath)}`);
  const resolved = new URL(routePath, `${base.toString().replace(/\/$/, '')}/`);
  if (resolved.origin !== base.origin) throw new Error(`Route escaped loopback origin: ${routePath}`);
  return resolved;
}

export function assertUrlOrigin(url, expectedOrigin, label = 'URL') {
  const observed = new URL(url).origin;
  if (observed !== expectedOrigin) throw new Error(`${label} escaped loopback origin: ${observed} expected ${expectedOrigin}`);
}

export function changedFilesBetween(root, range) {
  const tokens = execFileSync('git', ['diff', '--name-status', '-z', range], { cwd: root }).toString('utf8').split('\0').filter(Boolean);
  const entries = [];
  for (let index = 0; index < tokens.length;) {
    const status = tokens[index++];
    const pathCount = /^[RC]/.test(status) ? 2 : 1;
    const paths = tokens.slice(index, index + pathCount);
    if (paths.length !== pathCount) throw new Error(`Incomplete Git name-status record for ${status}.`);
    index += pathCount;
    entries.push({ status, paths });
  }
  return entries;
}
