import assert from "node:assert/strict";
import { createHmac, hkdfSync } from "node:crypto";
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

    const validProviderSession = (subject) => ({
      subject,
      issuer: "https://issuer.example",
      audience: "clover-owner",
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    });
    for (const [label, subject] of [
      ["undefined subject", undefined],
      ["null subject", null],
      ["empty subject", ""],
      ["array subject", ["owner"]],
      ["object subject one", { owner: 1 }],
      ["object subject two", { owner: 2 }],
      ["number subject", 7],
      ["boolean subject", true],
      ["function subject", () => "owner"],
      ["oversized subject", "s".repeat(4 * 1024 + 1)],
      ["unbounded subject", "s".repeat(1024 * 1024)],
      ["leading lone surrogate", "\ud800"],
      ["trailing lone surrogate", "\udfff"]
    ]) {
      runtime.auth.registerProviderSessionVerifier({ verify: async () => validProviderSession(subject) });
      let rejectedIdentity;
      await assert.rejects(async () => {
        rejectedIdentity = await runtime.auth.authenticateOwner(request, { mutation: false });
      }, runtime.auth.AuthenticationDeniedError, label);
      assert.equal(rejectedIdentity, undefined, label);
    }
    for (const [label, override] of [
      ["issuer substitution", { issuer: "https://substituted.example" }],
      ["audience substitution", { audience: "substituted-owner" }]
    ]) {
      runtime.auth.registerProviderSessionVerifier({
        verify: async () => ({ ...validProviderSession("owner-subject"), ...override })
      });
      await assert.rejects(runtime.auth.authenticateOwner(request, { mutation: false }), runtime.auth.AuthenticationDeniedError, label);
    }
    runtime.auth.registerProviderSessionVerifier({ verify: async () => { throw new Error("provider detail must not escape"); } });
    await assert.rejects(runtime.auth.authenticateOwner(request, { mutation: false }), runtime.auth.AuthenticationDeniedError);

    runtime.auth.registerProviderSessionVerifier({
      verify: async (_request, expected) => {
        const session = {
          subject: "owner-subject",
          issuer: expected.issuer,
          audience: expected.audience,
          expiresAt: new Date(expected.now.getTime() + 5).toISOString()
        };
        await new Promise((resolve) => setTimeout(resolve, 25));
        return session;
      }
    });
    let expiredDuringVerificationIdentity;
    await assert.rejects(async () => {
      expiredDuringVerificationIdentity = await runtime.auth.authenticateOwner(request, { mutation: false });
    }, runtime.auth.AuthenticationDeniedError, "expires during provider verification");
    assert.equal(expiredDuringVerificationIdentity, undefined);

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

    let subjectReads = 0;
    const accessorSession = validProviderSession("unused");
    Object.defineProperty(accessorSession, "subject", {
      enumerable: true,
      get() {
        subjectReads += 1;
        return subjectReads === 1 ? " exact owner \ud83c\udf40 " : "substituted-owner";
      }
    });
    runtime.auth.registerProviderSessionVerifier({ verify: async () => accessorSession });
    const exactAccessorIdentity = await runtime.auth.authenticateOwner(request, { mutation: false });
    assert.equal(subjectReads, 1);
    assert.equal(exactAccessorIdentity.providerSubject, " exact owner \ud83c\udf40 ");
    const repeatedAccessorSubject = "exact-owner-\ud83c\udf40";
    runtime.auth.registerProviderSessionVerifier({ verify: async () => validProviderSession(repeatedAccessorSubject) });
    const firstExactIdentity = await runtime.auth.authenticateOwner(request, { mutation: false });
    const secondExactIdentity = await runtime.auth.authenticateOwner(request, { mutation: false });
    assert.deepEqual(secondExactIdentity, firstExactIdentity);
    assert.equal(firstExactIdentity.providerSubject, repeatedAccessorSubject);

    const csrf = createHmac("sha256", "synthetic-csrf-secret").update(repeatedAccessorSubject, "utf8").digest("hex");
    const mutationRequest = new Request("https://clover-owner.example/api/sessions", {
      method: "POST",
      headers: { origin: "https://clover-owner.example", "x-clover-csrf": csrf }
    });
    assert.equal((await runtime.auth.authenticateOwner(mutationRequest, { mutation: true })).participantId, firstExactIdentity.participantId);
    for (const invalidMutation of [
      new Request("https://clover-owner.example/api/sessions", { method: "POST", headers: { origin: "https://wrong.example", "x-clover-csrf": csrf } }),
      new Request("https://clover-owner.example/api/sessions", { method: "POST", headers: { origin: "https://clover-owner.example", "x-clover-csrf": "0".repeat(64) } })
    ]) {
      await assert.rejects(runtime.auth.authenticateOwner(invalidMutation, { mutation: true }), runtime.auth.AuthenticationDeniedError);
    }
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
  assert.match(source.storage, /clover-launch-studio-export-v2/);
  assert.match(source.storage, /hmac-sha256-hkdf-v1/);
  assert.match(source.storage, /archiveSeal/);
  assert.match(source.storage, /artifacts/);
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

    const archiveKeyBytes = Buffer.alloc(32, 7);
    const archiveKeyRef = "synthetic-local-key";
    const archiveKeyVersion = 1;
    const keys = new ExplicitSyntheticKeyProvider(archiveKeyBytes, archiveKeyRef, archiveKeyVersion);
    const sealArchiveDocument = (document) => {
      const unsigned = {
        format: document.format,
        session: document.session,
        events: document.events,
        progress: document.progress,
        artifacts: document.artifacts
      };
      const derived = Buffer.from(hkdfSync(
        "sha256",
        archiveKeyBytes,
        Buffer.from("clover-launch-studio:archive-seal:kdf:v2", "utf8"),
        Buffer.from(`clover-launch-studio:archive-seal:key:v2\0${archiveKeyRef}\0${archiveKeyVersion}`, "utf8"),
        32
      ));
      document.archiveSeal = {
        algorithm: "hmac-sha256-hkdf-v1",
        keyRef: archiveKeyRef,
        keyVersion: archiveKeyVersion,
        digest: createHmac("sha256", derived)
          .update(Buffer.from("clover-launch-studio:archive-seal:data:v2\0", "utf8"))
          .update(canonicalJson(unsigned), "utf8")
          .digest("hex")
      };
      return Buffer.from(canonicalJson(document), "utf8");
    };
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

    let eventKeyReads = 0;
    const eventMaterial = { keyRef: "event-idempotency-key", version: 1, key: Buffer.alloc(32, 21) };
    const eventKeys = {
      current: async () => { eventKeyReads += 1; return eventMaterial; },
      resolve: async (keyRef, version) => keyRef === eventMaterial.keyRef && version === eventMaterial.version ? eventMaterial : null
    };
    const eventStore = new InMemorySyntheticLaunchStudioStore(eventKeys);
    const eventSession = await eventStore.createSession(
      identity,
      creationScope,
      "event idempotency source",
      "event-idempotency-create-0001"
    );
    const exactEventInput = {
      type: "owner-feedback-recorded",
      expectedVersion: eventSession.version,
      predecessorEventId: eventSession.lastEventId,
      predecessorHash: eventSession.lastEventHash,
      idempotencyKey: "event-idempotency-replay-0001",
      payload: { reviewedText: "immutable replay result", nested: { accepted: true } }
    };
    const firstEventResult = await eventStore.appendEvent(identity, eventSession.sessionId, exactEventInput);
    const keyReadsAfterFirstEvent = eventKeyReads;
    const exactReplayResult = await eventStore.appendEvent(identity, eventSession.sessionId, structuredClone(exactEventInput));
    assert.deepEqual(exactReplayResult, firstEventResult);
    assert.equal(eventKeyReads, keyReadsAfterFirstEvent);
    assert.equal((await eventStore.getSession(identity, eventSession.sessionId)).version, 2);
    assert.equal((await eventStore.readEvents(identity, eventSession.sessionId)).length, 2);

    const afterFirstEvent = await eventStore.getSession(identity, eventSession.sessionId);
    await eventStore.appendEvent(identity, eventSession.sessionId, {
      type: "understanding-reviewed",
      expectedVersion: afterFirstEvent.version,
      predecessorEventId: afterFirstEvent.lastEventId,
      predecessorHash: afterFirstEvent.lastEventHash,
      idempotencyKey: "event-idempotency-later-0001",
      payload: { reviewedText: "later immutable event" }
    });
    const archiveBeforeLateReplay = await eventStore.exportSession(identity, eventSession.sessionId);
    assert.deepEqual(
      await eventStore.appendEvent(identity, eventSession.sessionId, structuredClone(exactEventInput)),
      firstEventResult
    );
    assert.deepEqual(await eventStore.exportSession(identity, eventSession.sessionId), archiveBeforeLateReplay);

    const assertEventConflictWithoutMutation = async (mutate, label) => {
      const candidate = structuredClone(exactEventInput);
      mutate(candidate);
      const before = await eventStore.exportSession(identity, eventSession.sessionId);
      await assert.rejects(eventStore.appendEvent(identity, eventSession.sessionId, candidate), AppendOnlyViolationError, label);
      assert.deepEqual(await eventStore.exportSession(identity, eventSession.sessionId), before, label);
    };
    for (const [label, mutate] of [
      ["event type conflict", (candidate) => { candidate.type = "context-pack-proposed"; }],
      ["event payload conflict", (candidate) => { candidate.payload.nested.accepted = false; }],
      ["event expected version conflict", (candidate) => { candidate.expectedVersion += 1; }],
      ["event predecessor id conflict", (candidate) => { candidate.predecessorEventId = `event:${"1".repeat(64)}`; }],
      ["event predecessor hash conflict", (candidate) => { candidate.predecessorHash = "2".repeat(64); }],
      ["event field addition", (candidate) => { candidate.authority = false; }],
      ["event field deletion", (candidate) => { delete candidate.payload; }]
    ]) await assertEventConflictWithoutMutation(mutate, label);

    const explicitSnapshot = await eventStore.getSession(identity, eventSession.sessionId);
    const explicitCreatedAt = new Date(Date.parse(explicitSnapshot.updatedAt) + 1).toISOString();
    const explicitInput = {
      type: "owner-feedback-recorded",
      expectedVersion: explicitSnapshot.version,
      predecessorEventId: explicitSnapshot.lastEventId,
      predecessorHash: explicitSnapshot.lastEventHash,
      idempotencyKey: "event-idempotency-explicit-time-0001",
      payload: { reviewedText: "explicit timestamp" },
      createdAt: explicitCreatedAt
    };
    const explicitResult = await eventStore.appendEvent(identity, eventSession.sessionId, explicitInput);
    assert.deepEqual(await eventStore.appendEvent(identity, eventSession.sessionId, explicitInput), explicitResult);
    const changedExplicit = { ...explicitInput, createdAt: new Date(Date.parse(explicitCreatedAt) + 1).toISOString() };
    const beforeChangedExplicit = await eventStore.exportSession(identity, eventSession.sessionId);
    await assert.rejects(eventStore.appendEvent(identity, eventSession.sessionId, changedExplicit), AppendOnlyViolationError);
    assert.deepEqual(await eventStore.exportSession(identity, eventSession.sessionId), beforeChangedExplicit);

    const concurrentSession = await eventStore.createSession(
      identity,
      creationScope,
      "concurrent event replay source",
      "event-idempotency-concurrent-create-0001"
    );
    const concurrentInput = {
      type: "owner-feedback-recorded",
      expectedVersion: concurrentSession.version,
      predecessorEventId: concurrentSession.lastEventId,
      predecessorHash: concurrentSession.lastEventHash,
      idempotencyKey: "event-idempotency-concurrent-0001",
      payload: { reviewedText: "one concurrent result" }
    };
    const concurrentExactResults = await Promise.all([
      eventStore.appendEvent(identity, concurrentSession.sessionId, structuredClone(concurrentInput)),
      eventStore.appendEvent(identity, concurrentSession.sessionId, structuredClone(concurrentInput))
    ]);
    assert.deepEqual(concurrentExactResults[1], concurrentExactResults[0]);
    assert.equal((await eventStore.getSession(identity, concurrentSession.sessionId)).version, 2);
    assert.equal((await eventStore.readEvents(identity, concurrentSession.sessionId)).length, 2);

    let releaseSnapshotGate;
    let signalSnapshotGate;
    const snapshotGateEntered = new Promise((resolve) => { signalSnapshotGate = resolve; });
    const snapshotGate = new Promise((resolve) => { releaseSnapshotGate = resolve; });
    let gateSnapshotCurrent = false;
    const snapshotMaterial = { keyRef: "event-snapshot-key", version: 1, key: Buffer.alloc(32, 22) };
    const snapshotStore = new InMemorySyntheticLaunchStudioStore({
      current: async () => {
        if (gateSnapshotCurrent) {
          gateSnapshotCurrent = false;
          signalSnapshotGate();
          await snapshotGate;
        }
        return snapshotMaterial;
      },
      resolve: async (keyRef, version) => keyRef === snapshotMaterial.keyRef && version === snapshotMaterial.version ? snapshotMaterial : null
    });
    const snapshotSession = await snapshotStore.createSession(
      identity,
      creationScope,
      "call-time input snapshot source",
      "event-snapshot-create-0001"
    );
    const snapshotReplayInput = {
      type: "owner-feedback-recorded",
      expectedVersion: snapshotSession.version,
      predecessorEventId: snapshotSession.lastEventId,
      predecessorHash: snapshotSession.lastEventHash,
      idempotencyKey: "event-snapshot-replay-0001",
      payload: { reviewedText: "captured before queued mutation" }
    };
    const snapshotOriginalEvent = await snapshotStore.appendEvent(identity, snapshotSession.sessionId, snapshotReplayInput);
    const snapshotCurrent = await snapshotStore.getSession(identity, snapshotSession.sessionId);
    gateSnapshotCurrent = true;
    const blockingAppend = snapshotStore.appendEvent(identity, snapshotSession.sessionId, {
      type: "understanding-reviewed",
      expectedVersion: snapshotCurrent.version,
      predecessorEventId: snapshotCurrent.lastEventId,
      predecessorHash: snapshotCurrent.lastEventHash,
      idempotencyKey: "event-snapshot-blocker-0001",
      payload: { reviewedText: "block queued retry" }
    });
    await snapshotGateEntered;
    const callerMutableRetry = structuredClone(snapshotReplayInput);
    const snapshottedRetry = snapshotStore.appendEvent(identity, snapshotSession.sessionId, callerMutableRetry);
    callerMutableRetry.type = "impact-scan-proposed";
    callerMutableRetry.expectedVersion = 99;
    callerMutableRetry.predecessorEventId = `event:${"3".repeat(64)}`;
    callerMutableRetry.predecessorHash = "4".repeat(64);
    callerMutableRetry.idempotencyKey = "event-snapshot-substituted-0001";
    callerMutableRetry.payload.reviewedText = "mutated after invocation";
    releaseSnapshotGate();
    await blockingAppend;
    assert.deepEqual(await snapshottedRetry, snapshotOriginalEvent);
    assert.equal((await snapshotStore.getSession(identity, snapshotSession.sessionId)).version, 3);
    assert.equal((await snapshotStore.readEvents(identity, snapshotSession.sessionId)).length, 3);

    const conflictSession = await eventStore.createSession(
      identity,
      creationScope,
      "concurrent event conflict source",
      "event-idempotency-conflict-create-0001"
    );
    const conflictBase = {
      type: "owner-feedback-recorded",
      expectedVersion: conflictSession.version,
      predecessorEventId: conflictSession.lastEventId,
      predecessorHash: conflictSession.lastEventHash,
      idempotencyKey: "event-idempotency-conflict-0001"
    };
    const concurrentConflicts = await Promise.allSettled([
      eventStore.appendEvent(identity, conflictSession.sessionId, { ...conflictBase, payload: { reviewedText: "candidate A" } }),
      eventStore.appendEvent(identity, conflictSession.sessionId, { ...conflictBase, payload: { reviewedText: "candidate B" } })
    ]);
    assert.equal(concurrentConflicts.filter(({ status }) => status === "fulfilled").length, 1);
    assert.equal(concurrentConflicts.filter(({ status }) => status === "rejected").length, 1);
    assert.equal((await eventStore.getSession(identity, conflictSession.sessionId)).version, 2);
    assert.equal((await eventStore.readEvents(identity, conflictSession.sessionId)).length, 2);

    const independentSession = await eventStore.createSession(
      identity,
      creationScope,
      "independent event key scope",
      "event-idempotency-independent-create-0001"
    );
    const independentEvent = await eventStore.appendEvent(identity, independentSession.sessionId, {
      ...exactEventInput,
      expectedVersion: independentSession.version,
      predecessorEventId: independentSession.lastEventId,
      predecessorHash: independentSession.lastEventHash
    });
    assert.equal(independentEvent.idempotencyKey, firstEventResult.idempotencyKey);
    assert.notEqual(independentEvent.eventId, firstEventResult.eventId);

    const restoredEventArchive = await eventStore.exportSession(identity, eventSession.sessionId);
    const restoredEventStore = new InMemorySyntheticLaunchStudioStore(eventKeys);
    await restoredEventStore.restoreSession(identity, eventSession.sessionId, restoredEventArchive);
    assert.deepEqual(
      await restoredEventStore.appendEvent(identity, eventSession.sessionId, structuredClone(exactEventInput)),
      firstEventResult
    );
    assert.deepEqual(await restoredEventStore.exportSession(identity, eventSession.sessionId), restoredEventArchive);
    const beforeRestoredConflict = await restoredEventStore.exportSession(identity, eventSession.sessionId);
    await assert.rejects(restoredEventStore.appendEvent(identity, eventSession.sessionId, {
      ...exactEventInput,
      payload: { reviewedText: "restored conflict" }
    }), AppendOnlyViolationError);
    assert.deepEqual(await restoredEventStore.exportSession(identity, eventSession.sessionId), beforeRestoredConflict);

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

    let releaseArtifactSnapshotGate;
    let signalArtifactSnapshotGate;
    const artifactSnapshotGateEntered = new Promise((resolve) => { signalArtifactSnapshotGate = resolve; });
    const artifactSnapshotGate = new Promise((resolve) => { releaseArtifactSnapshotGate = resolve; });
    let gateArtifactSnapshotCurrent = false;
    const artifactSnapshotMaterial = { keyRef: "artifact-snapshot-key", version: 1, key: Buffer.alloc(32, 23) };
    const artifactSnapshotKeys = {
      current: async () => {
        if (gateArtifactSnapshotCurrent) {
          gateArtifactSnapshotCurrent = false;
          signalArtifactSnapshotGate();
          await artifactSnapshotGate;
        }
        return artifactSnapshotMaterial;
      },
      resolve: async (keyRef, version) => keyRef === artifactSnapshotMaterial.keyRef && version === artifactSnapshotMaterial.version
        ? artifactSnapshotMaterial
        : null
    };
    const artifactSnapshotStore = new InMemorySyntheticLaunchStudioStore(artifactSnapshotKeys);
    const artifactSnapshotSession = await artifactSnapshotStore.createSession(
      identity,
      ownerScope(identity),
      "artifact call-time snapshot source",
      "artifact-snapshot-create-0001"
    );
    const callerOwnedArtifactBytes = Buffer.from("bytes captured at invocation", "utf8");
    const expectedArtifactBytes = Buffer.from(callerOwnedArtifactBytes);
    gateArtifactSnapshotCurrent = true;
    const pendingSnapshottedArtifact = artifactSnapshotStore.putArtifact(
      identity,
      artifactSnapshotSession.sessionId,
      callerOwnedArtifactBytes,
      "application/octet-stream"
    );
    await artifactSnapshotGateEntered;
    callerOwnedArtifactBytes.fill(0x78);
    releaseArtifactSnapshotGate();
    const snapshottedArtifact = await pendingSnapshottedArtifact;
    assert.equal(snapshottedArtifact.artifactId, `artifact:${sha256(expectedArtifactBytes)}`);
    assert.deepEqual(
      await artifactSnapshotStore.readArtifact(identity, artifactSnapshotSession.sessionId, snapshottedArtifact.artifactId),
      expectedArtifactBytes
    );
    const artifactSnapshotArchive = await artifactSnapshotStore.exportSession(identity, artifactSnapshotSession.sessionId);
    const artifactSnapshotDestination = new InMemorySyntheticLaunchStudioStore(artifactSnapshotKeys);
    await artifactSnapshotDestination.restoreSession(identity, artifactSnapshotSession.sessionId, artifactSnapshotArchive);
    assert.deepEqual(
      await artifactSnapshotDestination.readArtifact(identity, artifactSnapshotSession.sessionId, snapshottedArtifact.artifactId),
      expectedArtifactBytes
    );
    assert.deepEqual(
      await artifactSnapshotDestination.exportSession(identity, artifactSnapshotSession.sessionId),
      artifactSnapshotArchive
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
    let gateNextCurrentKey = false;
    const gatedKeys = {
      current: async () => {
        if (gateNextCurrentKey) {
          gateNextCurrentKey = false;
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
    gateNextCurrentKey = true;
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
    let rejectedProgress = null;
    let beforeRejectedProgress = boundedArchive;
    let acceptedProgressCount = 0;
    for (let offset = 0; offset < 32; offset += 1) {
      beforeRejectedProgress = await growthService.export(growthSession.sessionId);
      try {
        await growthStore.appendProgress(identity, growthSession.sessionId, {
          sessionId: growthSession.sessionId,
          expectedSessionVersion: growthSession.version,
          expectedLastEventId: growthSession.lastEventId,
          expectedLastEventHash: growthSession.lastEventHash,
          label: `Bounded progress ${offset}`,
          state: "proposed",
          evidenceRef: `${"e".repeat(4_000)}:${offset}`
        });
        acceptedProgressCount += 1;
      } catch (error) {
        rejectedProgress = error;
        break;
      }
    }
    assert.equal(rejectedProgress instanceof AppendOnlyViolationError, true);
    assert.equal(acceptedProgressCount > 0, true);
    assert.deepEqual(await growthService.export(growthSession.sessionId), beforeRejectedProgress);
    const recoveredProgress = await growthStore.appendProgress(identity, growthSession.sessionId, {
      sessionId: growthSession.sessionId,
      expectedSessionVersion: growthSession.version,
      expectedLastEventId: growthSession.lastEventId,
      expectedLastEventHash: growthSession.lastEventHash,
      label: "Small progress after rejected oversize",
      state: "proposed",
      evidenceRef: "synthetic-small-progress-0001"
    });
    assert.equal(recoveredProgress.cursor, acceptedProgressCount + 1);

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
    const unknownTypeArchive = sealArchiveDocument(unknownTypeDocument);
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
      return sealArchiveDocument(document);
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
      sealArchiveDocument(topLevelSessionSubstitution),
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
      await assertRestoreRejectedWithoutMutation(sealArchiveDocument(document), `progress ${field}`);
    }
    const addedProgressField = structuredClone(sourceDocument);
    addedProgressField.progress[0].unexpected = false;
    await assertRestoreRejectedWithoutMutation(sealArchiveDocument(addedProgressField), "progress field addition");
    const deletedProgressField = structuredClone(sourceDocument);
    delete deletedProgressField.progress[0].label;
    await assertRestoreRejectedWithoutMutation(sealArchiveDocument(deletedProgressField), "progress field deletion");

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
    const compactArchive = Buffer.from(`{"format":"clover-launch-studio-export-v2","session":${JSON.stringify(canonicalOversizeSession)},"events":[],"progress":[${compactProgress}],"artifacts":[],"archiveSeal":{}}`, "utf8");
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
      format: "clover-launch-studio-export-v2",
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

test("complete v2 archives authenticate session metadata and every session artifact", async () => {
  const runtime = await loadCompiledRuntime();
  try {
    const { MAX_EXPORT_BYTES, PROJECT_ID } = runtime.config;
    const { ownerScope } = runtime.acl;
    const { ExplicitSyntheticKeyProvider } = runtime.crypto;
    const {
      AppendOnlyViolationError,
      InMemorySyntheticLaunchStudioStore,
      SessionNotFoundError,
      canonicalJson,
      sha256
    } = runtime.storage;
    const identity = {
      providerSubject: "synthetic-archive-owner",
      participantId: `participant:${"7".repeat(64)}`,
      projectId: PROJECT_ID,
      authenticationMode: "synthetic"
    };
    const archiveKey = Buffer.alloc(32, 29);
    const keyRef = "synthetic-archive-v2-key";
    const keyVersion = 3;
    const keys = new ExplicitSyntheticKeyProvider(archiveKey, keyRef, keyVersion);
    const seal = (document) => {
      const unsigned = {
        format: document.format,
        session: document.session,
        events: document.events,
        progress: document.progress,
        artifacts: document.artifacts
      };
      const derived = Buffer.from(hkdfSync(
        "sha256",
        archiveKey,
        Buffer.from("clover-launch-studio:archive-seal:kdf:v2", "utf8"),
        Buffer.from(`clover-launch-studio:archive-seal:key:v2\0${keyRef}\0${keyVersion}`, "utf8"),
        32
      ));
      document.archiveSeal = {
        algorithm: "hmac-sha256-hkdf-v1",
        keyRef,
        keyVersion,
        digest: createHmac("sha256", derived)
          .update(Buffer.from("clover-launch-studio:archive-seal:data:v2\0", "utf8"))
          .update(canonicalJson(unsigned), "utf8")
          .digest("hex")
      };
      return Buffer.from(canonicalJson(document), "utf8");
    };
    const create = (store, transcript, idempotencyKey) =>
      store.createSession(identity, ownerScope(identity), transcript, idempotencyKey);

    const zeroSource = new InMemorySyntheticLaunchStudioStore(keys);
    const zeroSession = await create(zeroSource, "zero-artifact archive", "archive-v2-zero-create-0001");
    const zeroArchive = await zeroSource.exportSession(identity, zeroSession.sessionId);
    const zeroDocument = JSON.parse(zeroArchive.toString("utf8"));
    assert.deepEqual(Object.keys(zeroDocument).sort(), ["archiveSeal", "artifacts", "events", "format", "progress", "session"]);
    assert.equal(zeroDocument.format, "clover-launch-studio-export-v2");
    assert.deepEqual(zeroDocument.artifacts, []);
    assert.deepEqual(Object.keys(zeroDocument.archiveSeal).sort(), ["algorithm", "digest", "keyRef", "keyVersion"]);
    assert.equal(zeroDocument.archiveSeal.algorithm, "hmac-sha256-hkdf-v1");
    assert.equal(zeroDocument.archiveSeal.keyRef, keyRef);
    assert.equal(zeroDocument.archiveSeal.keyVersion, keyVersion);
    assert.match(zeroDocument.archiveSeal.digest, /^[a-f0-9]{64}$/u);
    assert.equal(zeroArchive.includes(archiveKey), false);
    assert.deepEqual(await zeroSource.exportSession(identity, zeroSession.sessionId), zeroArchive);
    const zeroDestination = new InMemorySyntheticLaunchStudioStore(keys);
    await zeroDestination.restoreSession(identity, zeroSession.sessionId, zeroArchive);
    assert.deepEqual(await zeroDestination.exportSession(identity, zeroSession.sessionId), zeroArchive);

    const oneSource = new InMemorySyntheticLaunchStudioStore(keys);
    const oneTranscript = "one-artifact archive";
    const oneCreationKey = "archive-v2-one-create-0001";
    const oneSession = await create(oneSource, oneTranscript, oneCreationKey);
    const oneBytes = Buffer.from("exact restored artifact bytes", "utf8");
    const oneArtifact = await oneSource.putArtifact(identity, oneSession.sessionId, oneBytes, "text/plain");
    const oneArchive = await oneSource.exportSession(identity, oneSession.sessionId);
    const oneDocument = JSON.parse(oneArchive.toString("utf8"));
    assert.equal(oneDocument.artifacts.length, 1);
    assert.equal(oneDocument.artifacts[0].mediaType, "text/plain");
    assert.equal(oneDocument.artifacts[0].byteLength, oneBytes.byteLength);
    const oneDestination = new InMemorySyntheticLaunchStudioStore(keys);
    await oneDestination.restoreSession(identity, oneSession.sessionId, oneArchive);
    assert.deepEqual(await oneDestination.readArtifact(identity, oneSession.sessionId, oneArtifact.artifactId), oneBytes);
    assert.deepEqual(await oneDestination.exportSession(identity, oneSession.sessionId), oneArchive);
    const restoredRetry = await oneDestination.createSession(identity, ownerScope(identity), oneTranscript, oneCreationKey);
    assert.equal(restoredRetry.sessionId, oneSession.sessionId);
    assert.equal((await oneDestination.readEvents(identity, oneSession.sessionId)).length, 1);
    await assert.rejects(
      oneDestination.createSession(identity, ownerScope(identity), "conflicting restored transcript", oneCreationKey),
      AppendOnlyViolationError
    );
    assert.equal((await oneDestination.readEvents(identity, oneSession.sessionId)).length, 1);

    const multiSource = new InMemorySyntheticLaunchStudioStore(keys);
    const multiSession = await create(multiSource, "multiple-artifact archive", "archive-v2-multi-create-0001");
    const artifactInputs = [
      [Buffer.from("zeta artifact", "utf8"), "application/octet-stream"],
      [Buffer.from("alpha artifact", "utf8"), "text/plain"],
      [Buffer.from("middle artifact", "utf8"), "application/json"],
      [Buffer.alloc(0), "application/octet-stream"]
    ];
    const multiArtifacts = [];
    for (const [bytes, mediaType] of artifactInputs) {
      multiArtifacts.push(await multiSource.putArtifact(identity, multiSession.sessionId, bytes, mediaType));
    }
    const multiArchive = await multiSource.exportSession(identity, multiSession.sessionId);
    const multiDocument = JSON.parse(multiArchive.toString("utf8"));
    assert.equal(multiDocument.artifacts.length, 4);
    assert.deepEqual(
      multiDocument.artifacts.map(({ artifactId }) => artifactId),
      multiDocument.artifacts.map(({ artifactId }) => artifactId).toSorted((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)))
    );
    const multiDestination = new InMemorySyntheticLaunchStudioStore(keys);
    await multiDestination.restoreSession(identity, multiSession.sessionId, multiArchive);
    for (const [offset, artifact] of multiArtifacts.entries()) {
      assert.deepEqual(
        await multiDestination.readArtifact(identity, multiSession.sessionId, artifact.artifactId),
        artifactInputs[offset][0]
      );
    }
    assert.deepEqual(await multiDestination.exportSession(identity, multiSession.sessionId), multiArchive);
    const unrelatedSession = await create(multiDestination, "unrelated scope", "archive-v2-unrelated-create-0001");
    await assert.rejects(
      multiDestination.readArtifact(identity, unrelatedSession.sessionId, multiArtifacts[0].artifactId),
      SessionNotFoundError
    );

    const sameBytes = Buffer.from("same bytes, separately restored", "utf8");
    const sameSourceA = new InMemorySyntheticLaunchStudioStore(keys);
    const sameSourceB = new InMemorySyntheticLaunchStudioStore(keys);
    const sameSessionA = await create(sameSourceA, "same artifact A", "archive-v2-same-a-create-0001");
    const sameSessionB = await create(sameSourceB, "same artifact B", "archive-v2-same-b-create-0001");
    const sameArtifactA = await sameSourceA.putArtifact(identity, sameSessionA.sessionId, sameBytes, "text/plain");
    const sameArtifactB = await sameSourceB.putArtifact(identity, sameSessionB.sessionId, sameBytes, "text/plain");
    const sameSessionBOnlyBytes = Buffer.from("artifact present only in restored session B", "utf8");
    const sameSessionBOnlyArtifact = await sameSourceB.putArtifact(
      identity,
      sameSessionB.sessionId,
      sameSessionBOnlyBytes,
      "application/octet-stream"
    );
    assert.equal(sameArtifactA.artifactId, sameArtifactB.artifactId);
    const sameDestination = new InMemorySyntheticLaunchStudioStore(keys);
    await sameDestination.restoreSession(identity, sameSessionA.sessionId, await sameSourceA.exportSession(identity, sameSessionA.sessionId));
    await sameDestination.restoreSession(identity, sameSessionB.sessionId, await sameSourceB.exportSession(identity, sameSessionB.sessionId));
    assert.deepEqual(await sameDestination.readArtifact(identity, sameSessionA.sessionId, sameArtifactA.artifactId), sameBytes);
    assert.deepEqual(await sameDestination.readArtifact(identity, sameSessionB.sessionId, sameArtifactB.artifactId), sameBytes);
    assert.deepEqual(
      await sameDestination.readArtifact(identity, sameSessionB.sessionId, sameSessionBOnlyArtifact.artifactId),
      sameSessionBOnlyBytes
    );
    await assert.rejects(
      sameDestination.readArtifact(identity, sameSessionA.sessionId, sameSessionBOnlyArtifact.artifactId),
      SessionNotFoundError
    );
    const otherIdentity = { ...identity, providerSubject: "other", participantId: `participant:${"8".repeat(64)}` };
    await assert.rejects(
      sameDestination.readArtifact(otherIdentity, sameSessionA.sessionId, sameArtifactA.artifactId),
      runtime.acl.AccessDeniedError
    );

    const assertRejectedWithoutMutation = async (candidate, label, expectedSessionId = multiSession.sessionId) => {
      const destination = new InMemorySyntheticLaunchStudioStore(keys);
      const sentinel = await create(destination, `sentinel ${label}`, `archive-v2-sentinel-${sha256(label).slice(0, 24)}`);
      const before = await destination.exportSession(identity, sentinel.sessionId);
      await assert.rejects(destination.restoreSession(identity, expectedSessionId, candidate), undefined, label);
      assert.deepEqual(await destination.exportSession(identity, sentinel.sessionId), before, label);
      await assert.rejects(destination.getSession(identity, expectedSessionId), SessionNotFoundError, label);
      await assert.rejects(
        destination.readArtifact(identity, expectedSessionId, multiDocument.artifacts[0].artifactId),
        SessionNotFoundError,
        label
      );
    };
    const resealedMutation = (mutate) => {
      const document = structuredClone(multiDocument);
      mutate(document);
      return seal(document);
    };

    const artifactMutations = [
      ["artifact sessionId", (document) => { document.artifacts[0].sessionId = `session:${"9".repeat(64)}`; }],
      ["artifactId", (document) => { document.artifacts[0].artifactId = `artifact:${"a".repeat(64)}`; }],
      ["artifact mediaType", (document) => { document.artifacts[0].mediaType = "text/html"; }],
      ["artifact byteLength", (document) => { document.artifacts[0].byteLength += 1; }],
      ["artifact ciphertext", (document) => {
        const ciphertext = document.artifacts[0].encryptedPayload.ciphertext;
        document.artifacts[0].encryptedPayload.ciphertext = `${ciphertext[0] === "A" ? "B" : "A"}${ciphertext.slice(1)}`;
      }],
      ["artifact keyRef", (document) => { document.artifacts[0].encryptedPayload.keyRef = "substituted-key"; }],
      ["artifact keyVersion", (document) => { document.artifacts[0].encryptedPayload.keyVersion += 1; }],
      ["artifact encrypted field deletion", (document) => { delete document.artifacts[0].encryptedPayload.authTag; }],
      ["artifact field addition", (document) => { document.artifacts[0].scope = "forbidden"; }]
    ];
    for (const [label, mutate] of artifactMutations) {
      await assertRejectedWithoutMutation(resealedMutation(mutate), label);
    }
    await assertRejectedWithoutMutation(resealedMutation((document) => { document.artifacts.reverse(); }), "artifact order");
    await assertRejectedWithoutMutation(resealedMutation((document) => {
      document.artifacts.splice(1, 0, structuredClone(document.artifacts[0]));
    }), "duplicate artifact");
    const omittedArtifact = structuredClone(multiDocument);
    omittedArtifact.artifacts.pop();
    await assertRejectedWithoutMutation(Buffer.from(canonicalJson(omittedArtifact), "utf8"), "omitted artifact with stale seal");

    const sessionMutations = [
      ["session terminal", (document) => { document.session.terminal = true; }],
      ["session createdAt", (document) => { document.session.createdAt = "2026-08-29T00:00:00.000Z"; }],
      ["session updatedAt", (document) => { document.session.updatedAt = "2026-08-29T00:00:01.000Z"; }],
      ["session malformed timestamp", (document) => { document.session.updatedAt = "not-a-time"; }],
      ["session version", (document) => { document.session.version += 1; }],
      ["session lastEventId", (document) => { document.session.lastEventId = `event:${"b".repeat(64)}`; }],
      ["session lastEventHash", (document) => { document.session.lastEventHash = "c".repeat(64); }],
      ["session workspaceId", (document) => { document.session.workspaceId = "workspace:substituted"; }],
      ["session projectId", (document) => { document.session.projectId = "project:substituted"; }],
      ["session participantId", (document) => { document.session.participantId = `participant:${"d".repeat(64)}`; }],
      ["session field addition", (document) => { document.session.authority = true; }],
      ["session field deletion", (document) => { delete document.session.updatedAt; }]
    ];
    for (const [label, mutate] of sessionMutations) {
      await assertRejectedWithoutMutation(resealedMutation(mutate), label);
    }
    const substitutedSessionId = `session:${"e".repeat(64)}`;
    await assertRejectedWithoutMutation(
      resealedMutation((document) => { document.session.sessionId = substitutedSessionId; }),
      "session sessionId",
      substitutedSessionId
    );

    for (const [label, mutate] of [
      ["seal algorithm", (document) => { document.archiveSeal.algorithm = "sha256"; }],
      ["seal keyRef", (document) => { document.archiveSeal.keyRef = "substituted-key"; }],
      ["seal keyVersion", (document) => { document.archiveSeal.keyVersion += 1; }],
      ["seal digest", (document) => { document.archiveSeal.digest = "0".repeat(64); }],
      ["seal field addition", (document) => { document.archiveSeal.extra = false; }],
      ["seal field deletion", (document) => { delete document.archiveSeal.digest; }]
    ]) {
      const document = structuredClone(multiDocument);
      mutate(document);
      await assertRejectedWithoutMutation(Buffer.from(canonicalJson(document), "utf8"), label);
    }
    const staleSealDocument = structuredClone(multiDocument);
    staleSealDocument.session.terminal = true;
    await assertRejectedWithoutMutation(Buffer.from(canonicalJson(staleSealDocument), "utf8"), "complete document with stale seal");
    const unkeyedSealDocument = structuredClone(multiDocument);
    const unkeyedUnsigned = structuredClone(unkeyedSealDocument);
    delete unkeyedUnsigned.archiveSeal;
    unkeyedSealDocument.archiveSeal.digest = sha256(canonicalJson(unkeyedUnsigned));
    await assertRejectedWithoutMutation(Buffer.from(canonicalJson(unkeyedSealDocument), "utf8"), "attacker-recomputed unkeyed seal");
    const extraTopLevel = structuredClone(multiDocument);
    extraTopLevel.authority = false;
    await assertRejectedWithoutMutation(seal(extraTopLevel), "top-level field addition");
    const missingTopLevel = structuredClone(multiDocument);
    delete missingTopLevel.artifacts;
    await assertRejectedWithoutMutation(Buffer.from(canonicalJson(missingTopLevel), "utf8"), "top-level field deletion");
    const unsupported = structuredClone(multiDocument);
    unsupported.format = "clover-launch-studio-export-v1";
    await assertRejectedWithoutMutation(Buffer.from(canonicalJson(unsupported), "utf8"), "unsupported archive format");
    const duplicateKeySource = multiArchive.toString("utf8").replace(
      '"format":"clover-launch-studio-export-v2"',
      '"format":"clover-launch-studio-export-v2","\\u0066ormat":"clover-launch-studio-export-v2"'
    );
    await assertRejectedWithoutMutation(Buffer.from(duplicateKeySource, "utf8"), "duplicate decoded JSON key");
    const duplicateSealKeySource = multiArchive.toString("utf8").replace(
      /"digest":"([a-f0-9]{64})"/u,
      '"digest":"$1","\\u0064igest":"$1"'
    );
    await assertRejectedWithoutMutation(Buffer.from(duplicateSealKeySource, "utf8"), "duplicate decoded seal field");

    const reordered = Object.fromEntries(Object.entries(structuredClone(multiDocument)).reverse());
    reordered.session = Object.fromEntries(Object.entries(reordered.session).reverse());
    reordered.artifacts = reordered.artifacts.map((artifact) => Object.fromEntries(Object.entries(artifact).reverse()));
    const reorderedArchive = Buffer.from(JSON.stringify(reordered), "utf8");
    assert.notDeepEqual(reorderedArchive, multiArchive);
    const reorderedDestination = new InMemorySyntheticLaunchStudioStore(keys);
    await reorderedDestination.restoreSession(identity, multiSession.sessionId, reorderedArchive);
    assert.deepEqual(await reorderedDestination.exportSession(identity, multiSession.sessionId), multiArchive);

    const chronologyStore = new InMemorySyntheticLaunchStudioStore(keys);
    const chronologySession = await create(chronologyStore, "chronology source", "archive-v2-chronology-create-0001");
    await assert.rejects(chronologyStore.appendEvent(identity, chronologySession.sessionId, {
      type: "owner-feedback-recorded",
      expectedVersion: chronologySession.version,
      predecessorEventId: chronologySession.lastEventId,
      predecessorHash: chronologySession.lastEventHash,
      idempotencyKey: "archive-v2-past-event-0001",
      payload: { reviewedText: "past" },
      createdAt: new Date(Date.parse(chronologySession.updatedAt) - 1).toISOString()
    }), AppendOnlyViolationError);
    assert.equal((await chronologyStore.getSession(identity, chronologySession.sessionId)).version, 1);

    const boundaryStore = new InMemorySyntheticLaunchStudioStore(keys);
    const boundarySession = await create(boundaryStore, "artifact boundary", "archive-v2-boundary-create-0001");
    const oversizedBytes = Buffer.alloc(MAX_EXPORT_BYTES, 0xa5);
    const oversizedArtifactId = `artifact:${sha256(oversizedBytes)}`;
    await assert.rejects(
      boundaryStore.putArtifact(identity, boundarySession.sessionId, oversizedBytes, "application/octet-stream"),
      AppendOnlyViolationError
    );
    await assert.rejects(
      boundaryStore.readArtifact(identity, boundarySession.sessionId, oversizedArtifactId),
      SessionNotFoundError
    );
    const smallerBytes = Buffer.from("smaller mutation survives rejected oversize", "utf8");
    const smallerArtifact = await boundaryStore.putArtifact(identity, boundarySession.sessionId, smallerBytes, "text/plain");
    assert.deepEqual(await boundaryStore.readArtifact(identity, boundarySession.sessionId, smallerArtifact.artifactId), smallerBytes);
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
