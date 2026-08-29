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
    import(pathToFileURL(join(directory, "acl.mjs")).href),
    import(pathToFileURL(join(directory, "crypto.mjs")).href),
    import(pathToFileURL(join(directory, "storage.mjs")).href),
    import(pathToFileURL(join(directory, "launch-session-service.mjs")).href)
  ]);
  return {
    directory,
    config: imported[0],
    acl: imported[1],
    crypto: imported[2],
    storage: imported[3],
    service: imported[4]
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
  assert.doesNotMatch(source.package, /clerk/i);
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
      label: "Oversized synthetic progress",
      state: "proposed",
      evidenceRef: "e".repeat(MAX_EXPORT_BYTES)
    }), AppendOnlyViolationError);
    assert.deepEqual(await growthService.export(growthSession.sessionId), boundedArchive);

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
    assert.equal((await restoreStore.readEvents(identity, session.sessionId)).length, 1);

    const unknownTypeDocument = JSON.parse(archive.toString("utf8"));
    unknownTypeDocument.events[0].type = "owner-authority-granted";
    const unsignedUnknownEvent = { ...unknownTypeDocument.events[0] };
    delete unsignedUnknownEvent.canonicalHash;
    unknownTypeDocument.events[0].canonicalHash = sha256(canonicalJson(unsignedUnknownEvent));
    unknownTypeDocument.session.lastEventHash = unknownTypeDocument.events[0].canonicalHash;
    const unknownTypeArchive = Buffer.from(canonicalJson(unknownTypeDocument), "utf8");
    const unknownTypeStore = new InMemorySyntheticLaunchStudioStore(keys);
    await assert.rejects(
      unknownTypeStore.restoreSession(identity, session.sessionId, unknownTypeArchive),
      AppendOnlyViolationError
    );
    await assert.rejects(unknownTypeStore.getSession(identity, session.sessionId), SessionNotFoundError);

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
