import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const restoreRoute = read("src/app/api/sessions/[sessionId]/restore/route.ts");
const source = {
  acl: read("src/lib/acl.ts"),
  auth: read("src/lib/auth.ts"),
  config: read("src/lib/config.ts"),
  crypto: read("src/lib/crypto.ts"),
  handoff: read("src/lib/handoff-codex-adapter.ts"),
  routes: [
    "src/app/api/sessions/route.ts",
    "src/app/api/sessions/[sessionId]/route.ts",
    "src/app/api/sessions/[sessionId]/events/route.ts",
    "src/app/api/sessions/[sessionId]/export/route.ts",
    "src/app/api/sessions/[sessionId]/restore/route.ts",
    "src/app/api/sessions/[sessionId]/handoff/route.ts"
  ].map(read).join("\n"),
  restoreRoute,
  service: read("src/lib/launch-session-service.ts"),
  storage: read("src/lib/storage.ts"),
  transcript: read("src/components/transcript-editor.tsx"),
  package: read("package.json")
};

async function loadCompiledRuntime() {
  const directory = mkdtempSync(join(tmpdir(), "clover-launch-studio-runtime-"));
  const moduleNames = [
    "config",
    "auth",
    "acl",
    "crypto",
    "storage",
    "handoff-codex-adapter",
    "launch-session-service"
  ];
  for (const moduleName of moduleNames) {
    const compiled = ts.transpileModule(read(`src/lib/${moduleName}.ts`), {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022
      },
      fileName: `${moduleName}.ts`,
      reportDiagnostics: true
    });
    assert.deepEqual(compiled.diagnostics ?? [], []);
    const withExtensions = compiled.outputText.replace(
      /from "(\.\/[^"\n]+)"/gu,
      (_match, specifier) => `from "${specifier}.mjs"`
    );
    writeFileSync(join(directory, `${moduleName}.mjs`), withExtensions);
  }
  const imported = await Promise.all([
    import(pathToFileURL(join(directory, "config.mjs")).href),
    import(pathToFileURL(join(directory, "auth.mjs")).href),
    import(pathToFileURL(join(directory, "acl.mjs")).href),
    import(pathToFileURL(join(directory, "crypto.mjs")).href),
    import(pathToFileURL(join(directory, "storage.mjs")).href),
    import(pathToFileURL(join(directory, "launch-session-service.mjs")).href)
  ]);
  return {
    directory,
    config: imported[0],
    auth: imported[1],
    acl: imported[2],
    crypto: imported[3],
    storage: imported[4],
    service: imported[5]
  };
}

test("accept_auth_anonymous_deny", () => {
  assert.match(source.auth, /AuthenticationDeniedError/);
  assert.match(source.routes, /denyResponse/);
});

test("accept_auth_clerk_validation", () => {
  assert.match(source.auth, /providerIssuer/);
  assert.match(source.auth, /providerAudience/);
  assert.match(source.auth, /expiresAt/);
  assert.equal(source.auth.match(/Date\.parse\(/gu)?.length, 1);
  assert.match(source.auth, /Number\.isFinite\(expiresAt\)/u);
  assert.doesNotMatch(source.package, /clerk/i);
});

test("provider session expiration rejects every non-future value without returning an identity", async () => {
  const runtime = await loadCompiledRuntime();
  const environmentKeys = [
    "NODE_ENV",
    "CLOVER_LAUNCH_STUDIO_AUTH_MODE",
    "CLOVER_LAUNCH_STUDIO_ORIGIN",
    "CLOVER_LAUNCH_STUDIO_AUTH_ISSUER",
    "CLOVER_LAUNCH_STUDIO_AUTH_AUDIENCE",
    "CLOVER_LAUNCH_STUDIO_CSRF_SECRET"
  ];
  const originalEnvironment = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]));
  try {
    Object.assign(process.env, {
      NODE_ENV: "test",
      CLOVER_LAUNCH_STUDIO_AUTH_MODE: "provider",
      CLOVER_LAUNCH_STUDIO_ORIGIN: "https://clover-owner.example",
      CLOVER_LAUNCH_STUDIO_AUTH_ISSUER: "https://issuer.example",
      CLOVER_LAUNCH_STUDIO_AUTH_AUDIENCE: "clover-owner",
      CLOVER_LAUNCH_STUDIO_CSRF_SECRET: "synthetic-csrf-secret"
    });
    const request = new Request("https://clover-owner.example/api/sessions");
    const rejectedExpirations = [
      ["missing", () => undefined],
      ["empty", () => ""],
      ["malformed", () => "2026-13-99T99:99:99Z"],
      ["NaN-producing", () => "NaN"],
      ["past", (now) => new Date(now.getTime() - 1).toISOString()],
      ["current", (now) => now.toISOString()]
    ];
    for (const [label, expiration] of rejectedExpirations) {
      runtime.auth.registerProviderSessionVerifier({
        verify: async (_request, expected) => ({
          subject: "owner-subject",
          issuer: expected.issuer,
          audience: expected.audience,
          expiresAt: expiration(expected.now)
        })
      });
      let identity;
      await assert.rejects(async () => {
        identity = await runtime.auth.authenticateOwner(request, { mutation: false });
      }, runtime.auth.AuthenticationDeniedError, label);
      assert.equal(identity, undefined, label);
    }
    for (const [label, session] of [["missing verifier result", undefined], ["null verifier result", null], ["non-object verifier result", "invalid"]]) {
      runtime.auth.registerProviderSessionVerifier({ verify: async () => session });
      await assert.rejects(runtime.auth.authenticateOwner(request, { mutation: false }), runtime.auth.AuthenticationDeniedError, label);
    }

    runtime.auth.registerProviderSessionVerifier({
      verify: async (_request, expected) => ({
        subject: "owner-subject",
        issuer: expected.issuer,
        audience: expected.audience,
        expiresAt: new Date(expected.now.getTime() + 60_000).toISOString()
      })
    });
    const identity = await runtime.auth.authenticateOwner(request, { mutation: false });
    assert.equal(identity.providerSubject, "owner-subject");
    assert.equal(identity.authenticationMode, "provider");
  } finally {
    for (const key of environmentKeys) {
      if (originalEnvironment[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnvironment[key];
    }
    rmSync(runtime.directory, { recursive: true, force: true });
  }
});

test("accept_auth_subject_binding", () => {
  assert.match(source.auth, /opaqueParticipantId/);
  assert.match(source.auth, /x-clover-csrf/);
  assert.match(source.auth, /origin !== config\.canonicalOrigin/);
});

test("accept_acl_isolation", () => {
  assert.match(source.acl, /workspaceId !== WORKSPACE_ID/);
  assert.match(source.acl, /participantId !== identity\.participantId/);
});

test("accept_event_append_only", () => {
  for (const binding of ["expectedVersion", "predecessorEventId", "predecessorHash", "idempotencyKey", "sequence"]) {
    assert.match(source.storage, new RegExp(binding));
  }
  assert.match(source.storage, /AppendOnlyViolationError/);
  assert.match(source.storage, /LAUNCH_EVENT_TYPES/);
  assert.match(source.service, /requireEventType\(body\.type\)/);
  assert.doesNotMatch(source.service, /body\.type\) as AppendEventInput/);
});

test("accept_handoff_lifecycle_append_only", () => {
  assert.match(source.handoff, /proposalOnly: true/);
  assert.match(source.handoff, /executeHandoff\(\): never/);
  assert.match(source.handoff, /approvalInherited: false/);
});

test("accept_storage_encryption", () => {
  assert.match(source.crypto, /aes-256-gcm/);
  assert.match(source.crypto, /randomBytes\(12\)/);
  assert.match(source.crypto, /setAAD/);
  assert.match(source.crypto, /authTag/);
});

test("accept_artifact_cas", () => {
  assert.match(source.storage, /artifact:\$\{digest\}/);
  assert.match(source.storage, /artifact:\$\{sha256\(bytes\)\}/);
  assert.match(source.storage, /artifactStorageKey\(sessionId, artifactId\)/);
});

test("accept_transcript_integrity", () => {
  assert.match(source.storage, /utf8ByteLength/);
  assert.match(source.storage, /transcriptSha256/);
  assert.match(source.transcript, /TextEncoder/);
});

test("accept_transcript_successor", () => {
  assert.match(source.service, /owner-transcript-edited/);
  assert.match(source.storage, /predecessorEventId/);
});

test("accept_raw_audio_false", () => {
  assert.match(source.storage, /rawAudioRetained: false/);
  assert.match(source.transcript, /no native voice pipeline and never retains raw audio/i);
});

test("accept_retention_deletion", () => {
  assert.match(source.config, /transcriptRetentionApproved: false/);
  assert.match(source.config, /ownerControlledDeletionRequiresSeparateApproval: true/);
  assert.match(source.config, /keyDestructionRequiresSeparateApproval: true/);
});

test("accept_export_restore", () => {
  assert.match(source.storage, /exportSession/);
  assert.match(source.storage, /restoreSession/);
  assert.match(source.storage, /clover-launch-studio-export-v1/);
  assert.match(source.config, /MAX_EXPORT_BYTES = 1024 \* 1024/);
  assert.match(source.restoreRoute, /MAX_RESTORE_REQUEST_BYTES/);
  assert.match(source.restoreRoute, /service\.restore\(sessionId, archive\)/);
  assert.match(source.storage, /parsed\.session\.sessionId !== expectedSessionId/);
});

test("transcript request ceiling accepts every valid 48 KiB transcript without widening generic requests", async () => {
  const runtime = await loadCompiledRuntime();
  try {
    const {
      MAX_REQUEST_BYTES,
      MAX_TRANSCRIPT_BYTES,
      MAX_TRANSCRIPT_REQUEST_BYTES,
      PROJECT_ID
    } = runtime.config;
    const { LaunchSessionService, RequestRejectedError, exactJson } = runtime.service;
    assert.equal(MAX_TRANSCRIPT_REQUEST_BYTES, MAX_REQUEST_BYTES + (6 * MAX_TRANSCRIPT_BYTES));
    assert.equal(MAX_TRANSCRIPT_REQUEST_BYTES, 360_448);

    const createKeys = ["operation", "reviewedText"];
    const editKeys = ["operation", "reviewedText", "expectedVersion", "predecessorEventId", "predecessorHash", "idempotencyKey"];
    const requestFor = (body, declared = body.byteLength) => new Request("http://127.0.0.1/api/sessions", {
      method: "POST",
      headers: { "content-length": String(declared) },
      body
    });
    const parse = (document, allowedKeys) => {
      const body = Buffer.from(JSON.stringify(document), "utf8");
      return exactJson(requestFor(body), allowedKeys);
    };
    const maximumTranscripts = [
      ["ASCII", "a".repeat(MAX_TRANSCRIPT_BYTES)],
      ["newline", "\n".repeat(MAX_TRANSCRIPT_BYTES)],
      ["quote", "\"".repeat(MAX_TRANSCRIPT_BYTES)],
      ["backslash", "\\".repeat(MAX_TRANSCRIPT_BYTES)],
      ["control-character", "\0".repeat(MAX_TRANSCRIPT_BYTES)],
      ["Unicode", "é".repeat(MAX_TRANSCRIPT_BYTES / 2)]
    ];
    for (const [label, reviewedText] of maximumTranscripts) {
      assert.equal(Buffer.byteLength(reviewedText, "utf8"), MAX_TRANSCRIPT_BYTES, label);
      assert.equal((await parse({ operation: "create", reviewedText }, createKeys)).reviewedText, reviewedText, `${label} create`);
      assert.equal((await parse({
        operation: "edit-reviewed-transcript",
        reviewedText,
        expectedVersion: Number.MAX_SAFE_INTEGER,
        predecessorEventId: `event:${"a".repeat(64)}`,
        predecessorHash: "b".repeat(64),
        idempotencyKey: "maximum-transcript-edit-0001"
      }, editKeys)).reviewedText, reviewedText, `${label} edit`);
    }

    const identity = {
      providerSubject: "synthetic-transcript-owner",
      participantId: `participant:${"a".repeat(64)}`,
      projectId: PROJECT_ID,
      authenticationMode: "synthetic"
    };
    const createCalls = [];
    const editCalls = [];
    const transcriptService = new LaunchSessionService(identity, {
      createSession: async (_identity, _scope, reviewedText, idempotencyKey) => {
        createCalls.push({ reviewedText, idempotencyKey });
        return { sessionId: `session:${"a".repeat(64)}`, version: 1 };
      },
      appendEvent: async (_identity, _sessionId, input) => {
        editCalls.push(input);
        return input;
      }
    });
    const maximumControlTranscript = maximumTranscripts.find(([label]) => label === "control-character")[1];
    await transcriptService.create(maximumControlTranscript, "maximum-transcript-create-0001");
    await transcriptService.editTranscript(`session:${"a".repeat(64)}`, {
      reviewedText: maximumControlTranscript,
      expectedVersion: 1,
      predecessorEventId: `event:${"b".repeat(64)}`,
      predecessorHash: "c".repeat(64),
      idempotencyKey: "maximum-transcript-edit-0002"
    });
    assert.equal(Buffer.byteLength(createCalls[0].reviewedText, "utf8"), MAX_TRANSCRIPT_BYTES);
    assert.equal(Buffer.byteLength(editCalls[0].payload.text, "utf8"), MAX_TRANSCRIPT_BYTES);

    for (const overflow of ["a".repeat(MAX_TRANSCRIPT_BYTES + 1), `${"é".repeat(MAX_TRANSCRIPT_BYTES / 2)}é`]) {
      await assert.rejects(transcriptService.create(overflow, "overflow-transcript-create-0001"), RequestRejectedError);
      await assert.rejects(transcriptService.editTranscript(`session:${"a".repeat(64)}`, {
        reviewedText: overflow,
        expectedVersion: 1,
        predecessorEventId: `event:${"b".repeat(64)}`,
        predecessorHash: "c".repeat(64),
        idempotencyKey: "overflow-transcript-edit-0001"
      }), RequestRejectedError);
    }
    assert.equal(createCalls.length, 1);
    assert.equal(editCalls.length, 1);

    await assert.rejects(parse({ operation: "create", reviewedText: "allowed", extra: true }, createKeys), RequestRejectedError);
    const malformed = Buffer.from('{"operation":"create","reviewedText":', "utf8");
    await assert.rejects(exactJson(requestFor(malformed), createKeys), RequestRejectedError);
    const genericOversize = Buffer.from(JSON.stringify({ payload: "x".repeat(MAX_REQUEST_BYTES) }), "utf8");
    assert.equal(genericOversize.byteLength > MAX_REQUEST_BYTES, true);
    assert.equal(genericOversize.byteLength < MAX_TRANSCRIPT_REQUEST_BYTES, true);
    await assert.rejects(exactJson(requestFor(genericOversize), ["payload"]), RequestRejectedError);
    await assert.rejects(exactJson(requestFor(Buffer.from("{}", "utf8"), MAX_TRANSCRIPT_REQUEST_BYTES + 1), createKeys), RequestRejectedError);
  } finally {
    rmSync(runtime.directory, { recursive: true, force: true });
  }
});

test("event and restore runtime boundaries reject substitutions before mutation", async () => {
  const runtime = await loadCompiledRuntime();
  try {
    const { MAX_EXPORT_BYTES, MAX_REQUEST_BYTES, MAX_RESTORE_REQUEST_BYTES, MAX_TRANSCRIPT_BYTES, PROJECT_ID } = runtime.config;
    const { ownerScope } = runtime.acl;
    const { ExplicitSyntheticKeyProvider } = runtime.crypto;
    const {
      AppendOnlyViolationError,
      InMemorySyntheticLaunchStudioStore,
      LAUNCH_EVENT_TYPES,
      SessionNotFoundError,
      canonicalJson,
      sha256
    } = runtime.storage;
    const { LaunchSessionService, RequestRejectedError, decodeArchiveBase64url, exactJson } = runtime.service;
    assert.equal(MAX_RESTORE_REQUEST_BYTES, 1_398_125);

    const expectedEventTypes = [
      "owner-transcript-captured",
      "owner-transcript-edited",
      "understanding-reviewed",
      "context-pack-proposed",
      "impact-scan-proposed",
      "build-charter-proposed",
      "owner-feedback-recorded",
      "handoff-proposal-prepared"
    ];
    assert.deepEqual([...LAUNCH_EVENT_TYPES], expectedEventTypes);

    const identity = {
      providerSubject: "synthetic-owner",
      participantId: `participant:${"a".repeat(64)}`,
      projectId: PROJECT_ID,
      authenticationMode: "synthetic"
    };
    const appended = [];
    const eventService = new LaunchSessionService(identity, {
      appendEvent: async (_identity, _sessionId, input) => {
        appended.push(input);
        return input;
      }
    });
    for (const [offset, type] of expectedEventTypes.entries()) {
      await eventService.append("session:allowlist", {
        type,
        expectedVersion: offset,
        predecessorEventId: null,
        predecessorHash: null,
        idempotencyKey: `allowlisted-event-${String(offset).padStart(2, "0")}`,
        payload: { synthetic: true }
      });
    }
    assert.deepEqual(appended.map(({ type }) => type), expectedEventTypes);
    await assert.rejects(eventService.append("session:allowlist", {
      type: "owner-authority-granted",
      expectedVersion: expectedEventTypes.length,
      predecessorEventId: null,
      predecessorHash: null,
      idempotencyKey: "unknown-event-type-0001",
      payload: { synthetic: true }
    }), RequestRejectedError);
    assert.equal(appended.length, expectedEventTypes.length);

    const keys = new ExplicitSyntheticKeyProvider(Buffer.alloc(32, 7));
    const creationStore = new InMemorySyntheticLaunchStudioStore(keys);
    const creationScope = ownerScope(identity);
    const creationKey = "lost-response-create-0001";
    const firstCreation = await creationStore.createSession(identity, creationScope, "exact reviewed transcript", creationKey);
    const retryCreation = await creationStore.createSession(identity, creationScope, "exact reviewed transcript", creationKey);
    assert.equal(retryCreation.sessionId, firstCreation.sessionId);
    assert.equal((await creationStore.readEvents(identity, firstCreation.sessionId)).length, 1);
    assert.equal((await creationStore.getSession(identity, firstCreation.sessionId)).version, 1);
    await assert.rejects(
      creationStore.createSession(identity, creationScope, "substituted reviewed transcript", creationKey),
      AppendOnlyViolationError
    );
    assert.equal((await creationStore.readEvents(identity, firstCreation.sessionId)).length, 1);
    const concurrentCreations = await Promise.all([
      creationStore.createSession(identity, creationScope, "concurrent exact transcript", "concurrent-create-key-0001"),
      creationStore.createSession(identity, creationScope, "concurrent exact transcript", "concurrent-create-key-0001")
    ]);
    assert.equal(concurrentCreations[0].sessionId, concurrentCreations[1].sessionId);
    assert.equal((await creationStore.readEvents(identity, concurrentCreations[0].sessionId)).length, 1);
    const secondIdentity = {
      ...identity,
      providerSubject: "synthetic-owner-two",
      participantId: `participant:${"b".repeat(64)}`
    };
    await assert.rejects(
      creationStore.createSession(secondIdentity, ownerScope(secondIdentity), "exact reviewed transcript", creationKey),
      AppendOnlyViolationError
    );
    await assert.rejects(
      creationStore.createSession(identity, { ...creationScope, projectId: "project:substituted" }, "exact reviewed transcript", creationKey),
      runtime.acl.AccessDeniedError
    );
    assert.equal((await creationStore.readEvents(identity, firstCreation.sessionId)).length, 1);

    const sharedArtifactBytes = Buffer.from("session-scoped shared artifact", "utf8");
    const [firstArtifact, secondArtifact] = await Promise.all([
      creationStore.putArtifact(identity, firstCreation.sessionId, sharedArtifactBytes, "text/plain"),
      creationStore.putArtifact(identity, concurrentCreations[0].sessionId, sharedArtifactBytes, "text/plain")
    ]);
    assert.equal(firstArtifact.artifactId, secondArtifact.artifactId);
    assert.equal(firstArtifact.byteLength, sharedArtifactBytes.byteLength);
    assert.equal(firstArtifact.mediaType, "text/plain");
    assert.deepEqual(await creationStore.readArtifact(identity, firstCreation.sessionId, firstArtifact.artifactId), sharedArtifactBytes);
    assert.deepEqual(await creationStore.readArtifact(identity, concurrentCreations[0].sessionId, secondArtifact.artifactId), sharedArtifactBytes);
    const secondOnlyArtifact = await creationStore.putArtifact(
      identity,
      concurrentCreations[0].sessionId,
      Buffer.from("second-session-only", "utf8"),
      "application/octet-stream"
    );
    await assert.rejects(
      creationStore.readArtifact(identity, firstCreation.sessionId, secondOnlyArtifact.artifactId),
      SessionNotFoundError
    );
    await assert.rejects(
      creationStore.readArtifact(secondIdentity, firstCreation.sessionId, firstArtifact.artifactId),
      runtime.acl.AccessDeniedError
    );

    const artifactKey = Buffer.alloc(32, 17);
    let resolvedArtifactKey = artifactKey;
    const tamperArtifactStore = new InMemorySyntheticLaunchStudioStore({
      current: async () => ({ keyRef: "artifact-tamper-key", version: 1, key: artifactKey }),
      resolve: async () => ({ keyRef: "artifact-tamper-key", version: 1, key: resolvedArtifactKey })
    });
    const tamperArtifactSession = await tamperArtifactStore.createSession(
      identity,
      ownerScope(identity),
      "artifact tamper source",
      "artifact-tamper-create-0001"
    );
    const tamperArtifact = await tamperArtifactStore.putArtifact(
      identity,
      tamperArtifactSession.sessionId,
      Buffer.from("authenticated artifact", "utf8"),
      "text/plain"
    );
    resolvedArtifactKey = Buffer.alloc(32, 18);
    await assert.rejects(
      tamperArtifactStore.readArtifact(identity, tamperArtifactSession.sessionId, tamperArtifact.artifactId),
      runtime.crypto.CiphertextRejectedError
    );
    resolvedArtifactKey = artifactKey;
    assert.deepEqual(
      await tamperArtifactStore.readArtifact(identity, tamperArtifactSession.sessionId, tamperArtifact.artifactId),
      Buffer.from("authenticated artifact", "utf8")
    );

    const sourceStore = new InMemorySyntheticLaunchStudioStore(keys);
    const sourceService = new LaunchSessionService(identity, sourceStore);
    const session = await sourceStore.createSession(
      identity,
      ownerScope(identity),
      "x".repeat(MAX_TRANSCRIPT_BYTES),
      "maximum-transcript-session-0001"
    );
    const beforeUnknownAppend = await sourceStore.getSession(identity, session.sessionId);
    await assert.rejects(sourceStore.appendEvent(identity, session.sessionId, {
      type: "owner-authority-granted",
      expectedVersion: beforeUnknownAppend.version,
      predecessorEventId: beforeUnknownAppend.lastEventId,
      predecessorHash: beforeUnknownAppend.lastEventHash,
      idempotencyKey: "unknown-direct-event-0001",
      payload: { synthetic: true }
    }), AppendOnlyViolationError);
    assert.equal((await sourceStore.getSession(identity, session.sessionId)).version, beforeUnknownAppend.version);
    assert.equal((await sourceStore.readEvents(identity, session.sessionId)).length, 1);

    const beforeConcurrentAppend = await sourceStore.getSession(identity, session.sessionId);
    const concurrentAppends = await Promise.allSettled([
      sourceStore.appendEvent(identity, session.sessionId, {
        type: "owner-feedback-recorded",
        expectedVersion: beforeConcurrentAppend.version,
        predecessorEventId: beforeConcurrentAppend.lastEventId,
        predecessorHash: beforeConcurrentAppend.lastEventHash,
        idempotencyKey: "concurrent-append-event-0001",
        payload: { reviewedText: "first concurrent candidate" }
      }),
      sourceStore.appendEvent(identity, session.sessionId, {
        type: "owner-feedback-recorded",
        expectedVersion: beforeConcurrentAppend.version,
        predecessorEventId: beforeConcurrentAppend.lastEventId,
        predecessorHash: beforeConcurrentAppend.lastEventHash,
        idempotencyKey: "concurrent-append-event-0002",
        payload: { reviewedText: "second concurrent candidate" }
      })
    ]);
    assert.equal(concurrentAppends.filter(({ status }) => status === "fulfilled").length, 1);
    assert.equal(concurrentAppends.filter(({ status }) => status === "rejected").length, 1);
    const afterConcurrentAppend = await sourceStore.getSession(identity, session.sessionId);
    assert.equal(afterConcurrentAppend.version, beforeConcurrentAppend.version + 1);
    assert.equal((await sourceStore.readEvents(identity, session.sessionId)).length, afterConcurrentAppend.version);

    let signalEncryptionEntered;
    let releaseEncryption;
    const encryptionEntered = new Promise((resolve) => { signalEncryptionEntered = resolve; });
    const encryptionGate = new Promise((resolve) => { releaseEncryption = resolve; });
    const gatedMaterial = { keyRef: "synthetic-gated-key", version: 1, key: Buffer.alloc(32, 9) };
    let currentKeyCalls = 0;
    const gatedKeys = {
      current: async () => {
        currentKeyCalls += 1;
        if (currentKeyCalls === 2) {
          signalEncryptionEntered();
          await encryptionGate;
        }
        return gatedMaterial;
      },
      resolve: async (keyRef, version) => keyRef === gatedMaterial.keyRef && version === gatedMaterial.version ? gatedMaterial : null
    };
    const exportRaceStore = new InMemorySyntheticLaunchStudioStore(gatedKeys);
    const exportRaceSession = await exportRaceStore.createSession(
      identity,
      ownerScope(identity),
      "export race source",
      "export-race-create-0001"
    );
    const racingAppend = exportRaceStore.appendEvent(identity, exportRaceSession.sessionId, {
      type: "owner-feedback-recorded",
      expectedVersion: exportRaceSession.version,
      predecessorEventId: exportRaceSession.lastEventId,
      predecessorHash: exportRaceSession.lastEventHash,
      idempotencyKey: "export-race-append-0001",
      payload: { reviewedText: "gated append" }
    });
    await encryptionEntered;
    let racingExportSettled = false;
    const racingExport = exportRaceStore.exportSession(identity, exportRaceSession.sessionId).then((value) => {
      racingExportSettled = true;
      return value;
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(racingExportSettled, false);
    releaseEncryption();
    await racingAppend;
    const racingArchive = JSON.parse((await racingExport).toString("utf8"));
    assert.equal(racingArchive.session.version, 2);
    assert.equal(racingArchive.events.length, 2);
    assert.equal(racingArchive.session.version, racingArchive.events.length);

    const handoffStore = new InMemorySyntheticLaunchStudioStore(keys);
    const handoffSession = await handoffStore.createSession(
      identity,
      ownerScope(identity),
      "handoff snapshot source",
      "handoff-snapshot-create-0001"
    );
    let signalProgressEntered;
    let releaseProgress;
    const progressEntered = new Promise((resolve) => { signalProgressEntered = resolve; });
    const progressGate = new Promise((resolve) => { releaseProgress = resolve; });
    const staleHandoffService = new LaunchSessionService(identity, {
      getSession: (...args) => handoffStore.getSession(...args),
      appendProgress: async (...args) => {
        signalProgressEntered();
        await progressGate;
        return handoffStore.appendProgress(...args);
      }
    });
    const staleHandoff = staleHandoffService.prepareHandoff(handoffSession.sessionId);
    await progressEntered;
    await handoffStore.appendEvent(identity, handoffSession.sessionId, {
      type: "owner-feedback-recorded",
      expectedVersion: handoffSession.version,
      predecessorEventId: handoffSession.lastEventId,
      predecessorHash: handoffSession.lastEventHash,
      idempotencyKey: "handoff-snapshot-race-0001",
      payload: { reviewedText: "concurrent owner edit" }
    });
    releaseProgress();
    await assert.rejects(staleHandoff, AppendOnlyViolationError);
    const afterStaleHandoff = JSON.parse((await handoffStore.exportSession(identity, handoffSession.sessionId)).toString("utf8"));
    assert.equal(afterStaleHandoff.progress.length, 0);

    let currentProgressExpectation;
    const currentHandoffService = new LaunchSessionService(identity, {
      getSession: (...args) => handoffStore.getSession(...args),
      appendProgress: async (...args) => {
        currentProgressExpectation = structuredClone(args[2]);
        return handoffStore.appendProgress(...args);
      }
    });
    const currentHandoffSnapshot = await handoffStore.getSession(identity, handoffSession.sessionId);
    const currentProposal = await currentHandoffService.prepareHandoff(handoffSession.sessionId);
    assert.equal(currentProposal.sessionId, currentHandoffSnapshot.sessionId);
    assert.equal(currentProposal.sessionVersion, currentProgressExpectation.expectedSessionVersion);
    assert.equal(currentProposal.lastEventHash, currentProgressExpectation.expectedLastEventHash);
    assert.equal(currentProgressExpectation.expectedLastEventId, currentHandoffSnapshot.lastEventId);
    assert.equal(currentProgressExpectation.evidenceRef, currentProposal.proposalHash);
    const afterCurrentHandoff = JSON.parse((await handoffStore.exportSession(identity, handoffSession.sessionId)).toString("utf8"));
    assert.equal(afterCurrentHandoff.progress.length, 1);
    assert.equal(afterCurrentHandoff.progress[0].evidenceRef, currentProposal.proposalHash);

    const growthStore = new InMemorySyntheticLaunchStudioStore(keys);
    const growthService = new LaunchSessionService(identity, growthStore);
    let growthSession = await growthStore.createSession(
      identity,
      ownerScope(identity),
      "bounded synthetic session",
      "bounded-export-session-0001"
    );
    let growthRejection = null;
    let rejectedGrowthKey = null;
    for (let offset = 0; offset < 32; offset += 1) {
      const idempotencyKey = `bounded-growth-event-${String(offset).padStart(2, "0")}`;
      try {
        await growthStore.appendEvent(identity, growthSession.sessionId, {
          type: "owner-feedback-recorded",
          expectedVersion: growthSession.version,
          predecessorEventId: growthSession.lastEventId,
          predecessorHash: growthSession.lastEventHash,
          idempotencyKey,
          payload: { reviewedText: "y".repeat(MAX_TRANSCRIPT_BYTES) }
        });
        growthSession = await growthStore.getSession(identity, growthSession.sessionId);
      } catch (error) {
        growthRejection = error;
        rejectedGrowthKey = idempotencyKey;
        break;
      }
    }
    assert.equal(growthRejection instanceof AppendOnlyViolationError, true);
    assert.equal(typeof rejectedGrowthKey, "string");
    const boundedSession = await growthStore.getSession(identity, growthSession.sessionId);
    assert.equal(boundedSession.version, growthSession.version);
    assert.equal((await growthStore.readEvents(identity, growthSession.sessionId)).length, growthSession.version);
    const retryVersion = growthSession.version;
    await growthStore.appendEvent(identity, growthSession.sessionId, {
      type: "owner-feedback-recorded",
      expectedVersion: growthSession.version,
      predecessorEventId: growthSession.lastEventId,
      predecessorHash: growthSession.lastEventHash,
      idempotencyKey: rejectedGrowthKey,
      payload: { reviewedText: "small" }
    });
    growthSession = await growthStore.getSession(identity, growthSession.sessionId);
    assert.equal(growthSession.version, retryVersion + 1);
    const boundedArchive = await growthService.export(growthSession.sessionId);
    assert.equal(boundedArchive.byteLength <= MAX_EXPORT_BYTES, true);
    await assert.rejects(growthStore.appendProgress(identity, growthSession.sessionId, {
      sessionId: growthSession.sessionId,
      expectedSessionVersion: growthSession.version,
      expectedLastEventId: growthSession.lastEventId,
      expectedLastEventHash: growthSession.lastEventHash,
      label: "Oversized synthetic progress",
      state: "proposed",
      evidenceRef: "e".repeat(MAX_EXPORT_BYTES)
    }), AppendOnlyViolationError);
    assert.deepEqual(await growthService.export(growthSession.sessionId), boundedArchive);

    const sourceProgressSnapshot = await sourceStore.getSession(identity, session.sessionId);
    await sourceStore.appendProgress(identity, session.sessionId, {
      sessionId: session.sessionId,
      expectedSessionVersion: sourceProgressSnapshot.version,
      expectedLastEventId: sourceProgressSnapshot.lastEventId,
      expectedLastEventHash: sourceProgressSnapshot.lastEventHash,
      label: "Synthetic source prepared",
      state: "proposed",
      evidenceRef: "synthetic-evidence-reference-0001"
    });
    const archive = await sourceService.export(session.sessionId);
    const encodedArchive = archive.toString("base64url");
    const restoreBody = Buffer.from(JSON.stringify({ archiveBase64url: encodedArchive }), "utf8");
    assert.equal(archive.byteLength <= MAX_EXPORT_BYTES, true);
    assert.equal(restoreBody.byteLength > MAX_REQUEST_BYTES, true);
    assert.equal(restoreBody.byteLength <= MAX_RESTORE_REQUEST_BYTES, true);
    const parsedRestoreBody = await exactJson(new Request("http://127.0.0.1/restore", {
      method: "POST",
      headers: { "content-length": String(restoreBody.byteLength) },
      body: restoreBody
    }), ["archiveBase64url"], MAX_RESTORE_REQUEST_BYTES);
    const decodedArchive = decodeArchiveBase64url(parsedRestoreBody.archiveBase64url);
    assert.deepEqual(decodedArchive, archive);

    let adapterMutationCalls = 0;
    const adapterProbeService = new LaunchSessionService(identity, {
      restoreSession: async (_identity, expectedSessionId) => {
        adapterMutationCalls += 1;
        return { sessionId: expectedSessionId };
      }
    });
    const wrongSessionId = `session:${"f".repeat(64)}`;
    await assert.rejects(adapterProbeService.restore(wrongSessionId, decodedArchive), RequestRejectedError);
    assert.equal(adapterMutationCalls, 0);
    assert.equal((await adapterProbeService.restore(session.sessionId, decodedArchive)).sessionId, session.sessionId);
    assert.equal(adapterMutationCalls, 1);

    const restoreStore = new InMemorySyntheticLaunchStudioStore(keys);
    const restoreService = new LaunchSessionService(identity, restoreStore);
    await assert.rejects(restoreService.restore(wrongSessionId, decodedArchive), RequestRejectedError);
    await assert.rejects(
      restoreStore.restoreSession(identity, wrongSessionId, decodedArchive),
      AppendOnlyViolationError
    );
    await assert.rejects(restoreStore.getSession(identity, session.sessionId), SessionNotFoundError);
    const restored = await restoreService.restore(session.sessionId, decodedArchive);
    assert.equal(restored.sessionId, session.sessionId);
    assert.equal((await restoreStore.readEvents(identity, session.sessionId)).length, afterConcurrentAppend.version);

    const unknownTypeDocument = JSON.parse(archive.toString("utf8"));
    const unknownEventOffset = unknownTypeDocument.events.length - 1;
    unknownTypeDocument.events[unknownEventOffset].type = "owner-authority-granted";
    const unsignedUnknownEvent = { ...unknownTypeDocument.events[unknownEventOffset] };
    delete unsignedUnknownEvent.canonicalHash;
    unknownTypeDocument.events[unknownEventOffset].canonicalHash = sha256(canonicalJson(unsignedUnknownEvent));
    unknownTypeDocument.session.lastEventHash = unknownTypeDocument.events[unknownEventOffset].canonicalHash;
    const unknownTypeArchive = Buffer.from(canonicalJson(unknownTypeDocument), "utf8");
    const unknownTypeStore = new InMemorySyntheticLaunchStudioStore(keys);
    await assert.rejects(
      unknownTypeStore.restoreSession(identity, session.sessionId, unknownTypeArchive),
      AppendOnlyViolationError
    );
    await assert.rejects(unknownTypeStore.getSession(identity, session.sessionId), SessionNotFoundError);

    const sourceDocument = JSON.parse(archive.toString("utf8"));
    const { progressId: sourceProgressId, ...unsignedSourceProgress } = sourceDocument.progress[0];
    assert.equal(sourceProgressId, `progress:${sha256(canonicalJson(unsignedSourceProgress))}`);
    assert.equal(sourceProgressId, `progress:${sha256(canonicalJson(structuredClone(unsignedSourceProgress)))}`);
    const resealLastEvent = (document) => {
      const offset = document.events.length - 1;
      const unsigned = { ...document.events[offset] };
      delete unsigned.canonicalHash;
      document.events[offset].canonicalHash = sha256(canonicalJson(unsigned));
      document.session.lastEventHash = document.events[offset].canonicalHash;
      return Buffer.from(canonicalJson(document), "utf8");
    };
    const assertRestoreRejectedWithoutMutation = async (candidateArchive, label, expectedSessionId = session.sessionId) => {
      const destination = new InMemorySyntheticLaunchStudioStore(keys);
      const sentinel = await destination.createSession(
        identity,
        ownerScope(identity),
        `sentinel ${label}`,
        `restore-sentinel-${sha256(label).slice(0, 24)}`
      );
      const before = await destination.exportSession(identity, sentinel.sessionId);
      await assert.rejects(
        destination.restoreSession(identity, expectedSessionId, candidateArchive),
        AppendOnlyViolationError,
        label
      );
      assert.deepEqual(await destination.exportSession(identity, sentinel.sessionId), before, label);
      await assert.rejects(destination.getSession(identity, expectedSessionId), SessionNotFoundError, label);
    };
    const substitutedTopLevelSessionId = `session:${"c".repeat(64)}`;
    const topLevelSessionSubstitution = structuredClone(sourceDocument);
    topLevelSessionSubstitution.session.sessionId = substitutedTopLevelSessionId;
    await assertRestoreRejectedWithoutMutation(
      Buffer.from(canonicalJson(topLevelSessionSubstitution), "utf8"),
      "top-level sessionId with untouched events",
      substitutedTopLevelSessionId
    );
    for (const [field, replacement] of [
      ["sessionId", `session:${"d".repeat(64)}`],
      ["workspaceId", "workspace:substituted"],
      ["projectId", "project:substituted"],
      ["participantId", `participant:${"e".repeat(64)}`]
    ]) {
      const document = structuredClone(sourceDocument);
      document.events.at(-1)[field] = replacement;
      await assertRestoreRejectedWithoutMutation(resealLastEvent(document), `event ${field}`);
    }
    for (const [field, replacement] of [
      ["cursor", 2],
      ["progressId", `progress:${"f".repeat(64)}`],
      ["state", "complete"],
      ["state", "executed"],
      ["label", "Synthetic source altered"],
      ["label", "private reasoning token"],
      ["recordedAt", "2026-08-29T12:00:00.000Z"],
      ["recordedAt", "not-a-timestamp"],
      ["evidenceRef", "synthetic-evidence-reference-substituted"],
      ["sessionId", `session:${"e".repeat(64)}`]
    ]) {
      const document = structuredClone(sourceDocument);
      document.progress[0][field] = replacement;
      await assertRestoreRejectedWithoutMutation(Buffer.from(canonicalJson(document), "utf8"), `progress ${field}`);
    }
    const addedProgressField = structuredClone(sourceDocument);
    addedProgressField.progress[0].unexpected = false;
    await assertRestoreRejectedWithoutMutation(Buffer.from(canonicalJson(addedProgressField), "utf8"), "progress field addition");
    const deletedProgressField = structuredClone(sourceDocument);
    delete deletedProgressField.progress[0].label;
    await assertRestoreRejectedWithoutMutation(Buffer.from(canonicalJson(deletedProgressField), "utf8"), "progress field deletion");

    const reorderedProgressDocument = structuredClone(sourceDocument);
    reorderedProgressDocument.progress[0] = Object.fromEntries(Object.entries(reorderedProgressDocument.progress[0]).reverse());
    const reorderedProgressArchive = Buffer.from(JSON.stringify(reorderedProgressDocument), "utf8");
    assert.notDeepEqual(reorderedProgressArchive, archive);
    const reorderedProgressStore = new InMemorySyntheticLaunchStudioStore(keys);
    await reorderedProgressStore.restoreSession(identity, session.sessionId, reorderedProgressArchive);
    assert.deepEqual(await reorderedProgressStore.exportSession(identity, session.sessionId), archive);

    const canonicalOversizeSessionId = `session:${"c".repeat(64)}`;
    const canonicalOversizeSession = {
      ...ownerScope(identity),
      sessionId: canonicalOversizeSessionId,
      version: 0,
      lastEventId: null,
      lastEventHash: null,
      createdAt: "2026-08-29T00:00:00.000Z",
      updatedAt: "2026-08-29T00:00:00.000Z",
      terminal: false
    };
    const compactProgress = Array.from({ length: 60_000 }, () => "1e20").join(",");
    const compactArchive = Buffer.from(`{"format":"clover-launch-studio-export-v1","session":${JSON.stringify(canonicalOversizeSession)},"events":[],"progress":[${compactProgress}]}`, "utf8");
    assert.equal(compactArchive.byteLength < MAX_EXPORT_BYTES, true);
    assert.equal(Buffer.byteLength(canonicalJson(JSON.parse(compactArchive.toString("utf8"))), "utf8") > MAX_EXPORT_BYTES, true);
    const canonicalOversizeStore = new InMemorySyntheticLaunchStudioStore(keys);
    await assert.rejects(
      canonicalOversizeStore.restoreSession(identity, canonicalOversizeSessionId, compactArchive),
      AppendOnlyViolationError
    );
    await assert.rejects(
      canonicalOversizeStore.getSession(identity, canonicalOversizeSessionId),
      SessionNotFoundError
    );

    const maximumArchive = Buffer.alloc(MAX_EXPORT_BYTES, 0xa5);
    const maximumEncodedArchive = maximumArchive.toString("base64url");
    const maximumRestoreBody = Buffer.from(JSON.stringify({ archiveBase64url: maximumEncodedArchive }), "utf8");
    assert.equal(maximumRestoreBody.byteLength, MAX_RESTORE_REQUEST_BYTES);
    const maximumParsed = await exactJson(new Request("http://127.0.0.1/restore", {
      method: "POST",
      headers: { "content-length": String(maximumRestoreBody.byteLength) },
      body: maximumRestoreBody
    }), ["archiveBase64url"], MAX_RESTORE_REQUEST_BYTES);
    assert.deepEqual(decodeArchiveBase64url(maximumParsed.archiveBase64url), maximumArchive);

    const oversizedArchive = Buffer.alloc(MAX_EXPORT_BYTES + 1, 0xa5);
    const oversizedRestoreBody = Buffer.from(JSON.stringify({ archiveBase64url: oversizedArchive.toString("base64url") }), "utf8");
    await assert.rejects(exactJson(new Request("http://127.0.0.1/restore", {
      method: "POST",
      headers: { "content-length": "1" },
      body: oversizedRestoreBody
    }), ["archiveBase64url"], MAX_RESTORE_REQUEST_BYTES), RequestRejectedError);
    await assert.rejects(exactJson(new Request("http://127.0.0.1/restore", {
      method: "POST",
      headers: { "content-length": String(MAX_RESTORE_REQUEST_BYTES + 1) },
      body: Buffer.from("{}", "utf8")
    }), ["archiveBase64url"], MAX_RESTORE_REQUEST_BYTES), RequestRejectedError);
    assert.throws(() => decodeArchiveBase64url(`${encodedArchive}=`), RequestRejectedError);
    assert.throws(() => decodeArchiveBase64url(`${encodedArchive} `), RequestRejectedError);
    assert.throws(() => decodeArchiveBase64url("+/8"), RequestRejectedError);
    assert.throws(() => decodeArchiveBase64url("!"), RequestRejectedError);

    const exactBoundaryDocument = {
      format: "clover-launch-studio-export-v1",
      session: { sessionId: session.sessionId },
      padding: ""
    };
    const exactBoundaryBase = Buffer.from(JSON.stringify(exactBoundaryDocument), "utf8");
    exactBoundaryDocument.padding = "p".repeat(MAX_EXPORT_BYTES - exactBoundaryBase.byteLength);
    const exactBoundaryArchive = Buffer.from(JSON.stringify(exactBoundaryDocument), "utf8");
    assert.equal(exactBoundaryArchive.byteLength, MAX_EXPORT_BYTES);

    let restoreCalls = 0;
    let exportedArchive = maximumArchive;
    const boundaryService = new LaunchSessionService(identity, {
      restoreSession: async (_identity, expectedSessionId, bytes) => {
        restoreCalls += 1;
        return { sessionId: expectedSessionId, byteLength: bytes.byteLength };
      },
      exportSession: async () => exportedArchive
    });
    assert.equal((await boundaryService.restore(session.sessionId, exactBoundaryArchive)).byteLength, MAX_EXPORT_BYTES);
    assert.equal(restoreCalls, 1);
    assert.equal((await boundaryService.export(session.sessionId)).byteLength, MAX_EXPORT_BYTES);
    await assert.rejects(boundaryService.restore(session.sessionId, Buffer.alloc(0)), RequestRejectedError);
    await assert.rejects(boundaryService.restore(session.sessionId, Buffer.from("{}", "utf8")), RequestRejectedError);
    await assert.rejects(boundaryService.restore(session.sessionId, oversizedArchive), RequestRejectedError);
    assert.equal(restoreCalls, 1);
    exportedArchive = oversizedArchive;
    await assert.rejects(boundaryService.export(session.sessionId), RequestRejectedError);
  } finally {
    rmSync(runtime.directory, { recursive: true, force: true });
  }
});

test("accept_memory_separation", () => {
  assert.match(source.config, /personalChatGptMemoryIngested: false/);
  assert.doesNotMatch(source.storage, /chatgpt.*memory/i);
});

test("accept_chatgpt_read_only", () => {
  assert.match(source.handoff, /Handoff execution is unavailable/);
  assert.doesNotMatch(source.package, /openai|chatgpt/i);
});

test("accept_handoff_default_deny", () => {
  assert.match(source.handoff, /executable: false/);
  assert.match(source.handoff, /CLOVER-2026-08-24-006/);
});

test("accept_approval_noninheritance", () => {
  assert.match(source.handoff, /approvalInherited: false/);
  assert.match(source.handoff, /proposalOnly: true/);
});

test("accept_codex_boundary", () => {
  assert.match(source.handoff, /e5688c771d384d80a8c723cfa655298ce8257889/);
  assert.match(source.handoff, /4c84129b4fb5ea098ac9d2325bc2cb387857a471/);
  assert.doesNotMatch(source.handoff, /child_process|spawn\s*\(|exec\s*\(|shell\s*:/i);
});

test("accept_progress_evidence", () => {
  assert.match(source.storage, /evidenceRef/);
  assert.match(source.storage, /cursor/);
  assert.match(source.storage, /reasoning\|chain\.of\.thought\|token/);
});

test("accept_budget_structural", () => {
  for (const pair of [
    ["maximumModelCalls", "12"], ["maximumImplementationAgents", "2"], ["maximumRepairLoops", "3"],
    ["maximumElapsedMinutes", "120"], ["maximumProviderCiRuns", "1"], ["maximumTargetNullPreviews", "1"]
  ]) assert.match(source.config, new RegExp(`${pair[0]}: ${pair[1]}`));
});

test("accept_budget_failure_stop", () => {
  assert.match(source.config, /same-failure-signature-twice/);
  assert.match(source.config, /one-repair-loop-with-no-new-evidence/);
});

test("accept_purchase_zero", () => {
  assert.match(source.config, /explicitPurchaseCeilingUsd: 0/);
  assert.match(source.config, /automaticAdditionalCreditPurchase: false/);
});

test("accept_local_node_matrix", () => {
  assert.match(source.config, /"node-22", "node-24"/);
  assert.match(source.package, /"node": ">=22\.13\.0"/);
});

test("accept_workflow_integrity", () => {
  assert.equal(readdirSync(root).includes(".github"), false);
});

test("accept_privacy_authority", () => {
  const sensitiveMarker = new RegExp(["BEGIN", "PRIVATE", "KEY"].join(".*") + "|" + ["sk", "live", ""].join("_"), "i");
  assert.doesNotMatch(Object.values(source).join("\n"), sensitiveMarker);
  assert.match(source.routes, /Cache-Control/);
});

test("accept_stage_one_no_provider", () => {
  assert.doesNotMatch(source.package, /@clerk|@neondatabase|@vercel\/blob/);
  for (const field of ["privateOwnerAuthenticationConfigured", "durablePrivateStorageConfigured", "realParticipantRuntimeConfigured", "realProviderExecutionConfigured", "productionAuthorized"]) assert.match(source.config, new RegExp(`${field}: false`));
  assert.doesNotMatch(source.config, /previewCreated: false/);
});

test("accept_source_rollback", () => {
  assert.match(source.handoff, /source: \{ repository: "chrisdortch\/first"/);
  assert.doesNotMatch(Object.values(source).join("\n"), /git push|git checkout|git worktree/);
});
