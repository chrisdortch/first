import AxeBuilder from "@axe-core/playwright";
import { createHash } from "node:crypto";
import path from "node:path";
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

const exactViews = [
  "Today", "Tree", "Master Plan", "Branches", "Roots and Source Coverage", "Captain's Log", "Fruit Ledger",
  "Collaboration and JV Center", "Action Center", "System Health", "Launch Studio session"
] as const;
const exactSyntheticOwnerText = "Create a new synthetic SongAndStage collaboration opportunity with no private data.";
const expectedAxeScansPerViewport = 30;
const runtimeFindings = new WeakMap<Page, string[]>();
const fixtureCommit = "a".repeat(40);
const fixtureTree = "b".repeat(40);
const fixtureParent = "c".repeat(40);
const fixtureStackA = "f7b9b7fe3d6d95365e145930f4576b3e97a799b9";
const fixtureIndexHash = "897b7967069f9ec699fcef76175dcdee8a91513b43b3cbf046f840760c7d34d0";
const fixtureRuntimeDeploymentKey = `clover-${fixtureCommit.slice(0, 24)}`;

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue((value as Record<string, unknown>)[key])]));
  return value;
}

function canonicalJson(value: unknown) {
  return JSON.stringify(canonicalValue(value));
}

function liveTruthFixtures({ attestationSourceCommit = fixtureCommit } = {}) {
  const provenance = {
    documentType: "clover-tree-build-provenance", schemaVersion: "0.3.0", commit: fixtureCommit, tree: fixtureTree, parent: fixtureParent,
    stackABase: fixtureStackA, runtimeDeploymentKey: fixtureRuntimeDeploymentKey, cleanWorktree: true, changedPathCount: 17, pathListSha256: "1".repeat(64), sourceManifestSha256: "2".repeat(64),
    packageLockSha256: "3".repeat(64), treeProgramIndexId: "tree-program:index:0001", treeProgramIndexHash: fixtureIndexHash,
    treeProgramIndexRawSha256: "5".repeat(64), nodeVersion: "v24.16.0", nextVersion: "16.3.3", buildMode: "vercel-prebuilt-preview",
    buildCommand: "npm run build", buildOutputCommand: "vercel build --yes", buildInvocationId: `clover-build:${"6".repeat(64)}`,
    publicSanitized: true, privateDataAccessed: false, consequentialAuthorityGranted: false
  };
  const attestationBody = {
    documentType: "clover-tree-deployment-attestation", schemaVersion: "0.3.0", buildInvocationId: provenance.buildInvocationId,
    source: {
      commit: attestationSourceCommit, tree: provenance.tree, parent: provenance.parent, stackABase: provenance.stackABase,
      runtimeDeploymentKey: `clover-${attestationSourceCommit.slice(0, 24)}`,
      changedPathCount: provenance.changedPathCount, pathListSha256: provenance.pathListSha256, sourceManifestSha256: provenance.sourceManifestSha256,
      packageLockSha256: provenance.packageLockSha256, treeProgramIndexId: provenance.treeProgramIndexId, treeProgramIndexHash: provenance.treeProgramIndexHash,
      nodeVersion: provenance.nodeVersion, nextVersion: provenance.nextVersion, buildMode: provenance.buildMode
    },
    output: { manifestRootSha256: "7".repeat(64), regularFileCount: 100, symlinkCount: 2, aggregateRegularFileBytes: 1024, attestationExcludedPath: "static/__clover/deployment-attestation.json" },
    normalization: [], publicSanitized: true, privateDataAccessed: false, secretsIncluded: false, consequentialAuthorityGranted: false
  };
  const attestation = { ...attestationBody, attestationHash: createHash("sha256").update(`${canonicalJson(attestationBody)}\n`).digest("hex") };
  const github = {
    sourceId: "github-public-api", sourceIdentity: "github:chrisdortch/first", evidenceClass: "public-unauthenticated-github-api", status: "current", freshness: "current", observedAt: "2026-08-26T21:00:00.000Z", errorCode: null,
    endpoints: [], unauthenticated: true, retriesMaximum: 1, revalidateSeconds: 60, failures: [],
    main: { sha: "7d067d79bbff872846d6673b5f852518ba00fa7e", tree: "d7c62bee356474d055e501ff185a1b3358657d06", protected: true, defaultBranch: "main" },
    pull34: { number: 34, state: "open", draft: true, merged: false, mergeable: true, updatedAt: "2026-08-26T20:58:00.000Z", headSha: fixtureStackA, headRef: "feature/clover-evidence-scope-firewall-launch-pin-v0.1-20260826", headRepository: "chrisdortch/first", baseSha: "7d067d79bbff872846d6673b5f852518ba00fa7e", baseRef: "main", baseRepository: "chrisdortch/first" },
    pull35: { number: 35, state: "open", draft: true, merged: false, mergeable: true, updatedAt: "2026-08-26T20:59:00.000Z", headSha: fixtureCommit, headRef: "feature/clover-tree-command-center-launch-studio-v0.1-20260826", headRepository: "chrisdortch/first", baseSha: fixtureStackA, baseRef: "feature/clover-evidence-scope-firewall-launch-pin-v0.1-20260826", baseRepository: "chrisdortch/first" },
    exactHeadChecks: { sha: fixtureCommit, state: "success", requiredNames: ["Clover required main gate (Node 22)", "Clover required main gate (Node 24)", "Tree Command Center (Node 22)", "Tree Command Center (Node 24)", "Tree browser and accessibility"], checks: [] }
  };
  const deploymentSelf = {
    sourceId: "vercel-deployment-self", sourceIdentity: "vercel-functions-get-env", evidenceClass: "deployment-self-observation", status: "current", freshness: "current", observedAt: null, errorCode: null, environment: "preview",
    hostname: "clover-tree-command-center-abc.vercel.app", runtimeHostname: "clover-tree-command-center-abc.vercel.app", requestHostname: "clover-tree-command-center-abc.vercel.app",
    projectId: "prj_1lfjYV2FehNxEyW9hGqNwAe7a8xZ", deploymentId: null, runtimeDeploymentKey: fixtureRuntimeDeploymentKey, region: "iad1", regionStatus: "current", skewProtectionState: "enabled",
    gitCommitSha: fixtureCommit, sourceBindingMode: "vercel-git-commit-sha-and-build-provenance", observationMethod: "vercel-functions-get-env-and-request-host",
    externalProviderIdentity: { evidenceClass: "external-provider-verification", verifiedByWebRuntime: false, providerDeploymentId: null, providerUrl: null, target: null, aliases: null, providerSourceSha: null, protectionState: null },
    failures: [], environmentKeysRead: ["VERCEL_ENV", "VERCEL_URL", "VERCEL_PROJECT_ID", "VERCEL_DEPLOYMENT_ID", "VERCEL_REGION", "VERCEL_GIT_COMMIT_SHA", "VERCEL_SKEW_PROTECTION_ENABLED"]
  };
  const authority = { publicMetadataObserved: true, sourceMutationAuthorized: false, mergeAuthorized: false, productionAuthorized: false, privateDataAuthorized: false, externalMessagingAuthorized: false, paymentAuthorized: false, purchaseAuthorized: false };
  const readback = {
    schemaVersion: "clover-tree-live-readback-v0.2",
    baseline: {
      baselineObservedAt: "2026-08-26T19:55:59.000Z",
      indexId: "tree-program:index:0001",
      indexHash: fixtureIndexHash,
      classification: "historical-source-bound-baseline",
      immutableRecords: {
        index: { indexId: "tree-program:index:0001", indexHash: fixtureIndexHash, publicSanitized: true, privateDataAccessed: false },
        branches: Array.from({ length: 22 }, (_, index) => ({ recordId: `branch:${index + 1}` })),
        relationships: Array.from({ length: 21 }, (_, index) => ({ recordId: `relationship:${index + 1}` }))
      }
    },
    observations: { github, deploymentSelf, clover: { sourceId: "clover-context-gateway", sourceIdentity: "external-owner-console", evidenceClass: "external-owner-console-required", status: "external-owner-console-required", freshness: "unknown", observedAt: null, errorCode: null, webRuntimeConnectorInvoked: false, statement: "no Clover connector was invoked by the web runtime" } },
    reconciled: { currentActionCard: { action: "HOLD" } },
    requestObservedAt: "2026-08-26T21:00:01.000Z",
    authority
  };
  return { provenance: { schemaVersion: "clover-tree-provenance-readback-v0.2", provenance, authority }, attestation, readback };
}

async function installLiveTruthRoutes(page: Page, options: { attestationStatus?: number; attestationSourceCommit?: string } = {}) {
  const fixtures = liveTruthFixtures({ attestationSourceCommit: options.attestationSourceCommit });
  await page.route("**/api/tree", (route) => route.fulfill({ status: 200, contentType: "application/json", headers: { "Cache-Control": "no-store" }, body: JSON.stringify(fixtures.readback) }));
  await page.route("**/api/provenance", (route) => route.fulfill({ status: 200, contentType: "application/json", headers: { "Cache-Control": "no-store" }, body: JSON.stringify(fixtures.provenance) }));
  await page.route("**/__clover/deployment-attestation.json", (route) => options.attestationStatus === 204
    ? route.fulfill({ status: 204 })
    : route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixtures.attestation) }));
}

async function resetLiveTruthRoutes(page: Page, options: { attestationStatus?: number; attestationSourceCommit?: string } = {}) {
  await page.unroute("**/api/tree");
  await page.unroute("**/api/provenance");
  await page.unroute("**/__clover/deployment-attestation.json");
  await installLiveTruthRoutes(page, options);
}

function screenshotPath(testInfo: TestInfo, filename: string) {
  return process.env.CLOVER_SCREENSHOT_DIR ? path.join(process.env.CLOVER_SCREENSHOT_DIR, filename) : testInfo.outputPath(filename);
}

type AxeScanEvidence = {
  view: (typeof exactViews)[number];
  state: string;
  viewport: { width: number; height: number };
  violations: Awaited<ReturnType<InstanceType<typeof AxeBuilder>["analyze"]>>["violations"];
  incomplete: Awaited<ReturnType<InstanceType<typeof AxeBuilder>["analyze"]>>["incomplete"];
};

async function activateView(page: Page, view: (typeof exactViews)[number]) {
  const viewButton = page.getByRole("button", { name: view, exact: true });
  await viewButton.click();
  await expect(viewButton).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { level: 1, name: view, exact: true })).toBeVisible();
  return viewButton;
}

async function pressNamedButton(page: Page, name: string) {
  const button = page.getByRole("button", { name, exact: true });
  await button.focus();
  await expect(button).toBeFocused();
  await page.keyboard.press("Enter");
}

async function expectVisibleFocus(locator: Locator) {
  await expect(locator).toBeFocused();
  const focusStyle = await locator.evaluate((node) => {
    const style = getComputedStyle(node);
    return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
  });
  expect(focusStyle.outlineStyle).not.toBe("none");
  expect(Number.parseFloat(focusStyle.outlineWidth)).toBeGreaterThanOrEqual(3);
}

async function scanWithCompleteAxePayload(
  page: Page,
  scans: AxeScanEvidence[],
  view: (typeof exactViews)[number],
  state: string,
  viewport: { width: number; height: number }
) {
  const result = await new AxeBuilder({ page }).analyze();
  const evidence = { view, state, viewport, violations: result.violations, incomplete: result.incomplete };
  scans.push(evidence);
  expect(result.violations, JSON.stringify(evidence, null, 2)).toEqual([]);
}

async function expectNoHorizontalOverflow(page: Page, view: string) {
  const widths = await page.evaluate((activeView) => {
    const measure = (element: Element | null) => {
      if (!(element instanceof HTMLElement)) return null;
      const bounds = element.getBoundingClientRect();
      return {
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        left: bounds.left,
        right: bounds.right,
        width: bounds.width
      };
    };
    return {
      view: activeView,
      viewportWidth: window.innerWidth,
      document: measure(document.documentElement),
      body: measure(document.body),
      main: measure(document.querySelector(".command-main")),
      panels: Array.from(document.querySelectorAll(".command-panel, .prototype-card, .owner-input-card, .understanding-card, .recommended-packet")).map((panel, index) => {
        const measured = measure(panel);
        if (!measured) throw new Error(`Expected an HTML panel at index ${index}`);
        return { label: panel.querySelector("h2, h3")?.textContent?.trim() ?? `panel-${index + 1}`, ...measured };
      })
    };
  }, view);
  const diagnostic = JSON.stringify(widths, null, 2);
  for (const [label, measured] of [["document", widths.document], ["body", widths.body], ["main", widths.main]] as const) {
    expect(measured, `${label} missing\n${diagnostic}`).not.toBeNull();
    expect(measured!.scrollWidth, `${label} overflow in ${view}\n${diagnostic}`).toBeLessThanOrEqual(measured!.clientWidth);
    expect(measured!.right, `${label} exceeds viewport in ${view}\n${diagnostic}`).toBeLessThanOrEqual(widths.viewportWidth + 0.5);
  }
  for (const panel of widths.panels) {
    expect(panel.scrollWidth, `panel ${panel.label} overflow in ${view}\n${diagnostic}`).toBeLessThanOrEqual(panel.clientWidth);
    expect(panel.left, `panel ${panel.label} starts outside viewport in ${view}\n${diagnostic}`).toBeGreaterThanOrEqual(-0.5);
    expect(panel.right, `panel ${panel.label} exceeds viewport in ${view}\n${diagnostic}`).toBeLessThanOrEqual(widths.viewportWidth + 0.5);
  }
}

test.beforeEach(async ({ page }) => {
  const runtimeErrors: string[] = [];
  runtimeFindings.set(page, runtimeErrors);
  page.on("console", (message) => { if (message.type() === "error") runtimeErrors.push(message.text()); });
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("requestfailed", (request) => runtimeErrors.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? "failed"}`));
  page.on("response", (response) => { if (response.status() >= 500) runtimeErrors.push(`${response.status()} ${response.request().method()} ${response.url()}`); });
  await installLiveTruthRoutes(page, { attestationSourceCommit: "f".repeat(40) });
  await page.goto("/", { waitUntil: "networkidle" });
});

test.afterEach(async ({ page }) => {
  await page.waitForTimeout(25);
  const findings = runtimeFindings.get(page) ?? [];
  expect(findings, findings.join("\n")).toEqual([]);
});

test("renders the exact source-bound command center without runtime or privacy leakage", async ({ page }, testInfo) => {
  await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
  for (const view of exactViews) await expect(page.getByRole("button", { name: view, exact: true })).toBeVisible();
  await expect(page.getByText("tree-program:index:0001")).toBeVisible();
  await expect(page.getByText("Private data accessed: false")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "HOLD" })).toBeVisible();
  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(/\/Users\/|BEGIN [A-Z ]*PRIVATE KEY|sk-(?:proj-)?[A-Za-z0-9_-]{20,}/u);
  if (testInfo.project.name === "desktop-chromium") {
    await page.screenshot({ path: screenshotPath(testInfo, "clover-tree-command-center-desktop-today.png"), fullPage: true });
  }
});

test("same-origin deployment attestation unlocks only the preview Action Card when every source agrees", async ({ page }) => {
  const attestationRequests: Array<Record<string, string>> = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/__clover/deployment-attestation.json")) attestationRequests.push(request.headers());
  });
  await resetLiveTruthRoutes(page);
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { level: 2, name: "ACCEPT SOURCE-GROUNDED TREE PREVIEW" })).toBeVisible();
  expect(attestationRequests.length).toBeGreaterThan(0);
  for (const headers of attestationRequests) {
    expect(headers.authorization).toBeUndefined();
    expect(headers["x-vercel-protection-bypass"]).toBeUndefined();
  }
  await page.getByRole("button", { name: "System Health", exact: true }).click();
  await expect(page.locator("[data-readiness=ready]")).toHaveCount(13);
  await expect(page.locator("[data-readiness=ready]").filter({ hasText: /^verified$/u })).toHaveCount(2);
  await expect(page.getByRole("definition").filter({ hasText: /^2026-08-26T21:00:00\.000Z$/u })).toBeVisible();
  await expect(page.getByRole("definition").filter({ hasText: /^2026-08-26T21:00:01\.000Z$/u })).toBeVisible();
});

test("attestation unavailability or source substitution leaves the current Action Card on HOLD", async ({ page }) => {
  await resetLiveTruthRoutes(page, { attestationStatus: 204 });
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { level: 2, name: "HOLD" })).toBeVisible();
  await resetLiveTruthRoutes(page, { attestationSourceCommit: "f".repeat(40) });
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { level: 2, name: "HOLD" })).toBeVisible();
  await page.getByRole("button", { name: "System Health", exact: true }).click();
  await expect(page.locator("[data-readiness=hold]").filter({ hasText: /^inconsistent$/u })).toBeVisible();
});

test("Tree and status views preserve held, candidate, unknown and provider-degraded truth", async ({ page }) => {
  await page.getByRole("button", { name: "Tree", exact: true }).click();
  await expect(page.getByRole("heading", { level: 2, name: "The Clover Tree" })).toBeVisible();
  await expect(page.locator('.tree-node[data-status="hold"]').filter({ hasText: "Handoff, privacy, consent, backups and rollback" })).toBeVisible();
  await expect(page.locator('.tree-node[data-status="candidate"]').filter({ hasText: "Launch Studio" })).toBeVisible();
  await expect(page.locator('.tree-node[data-status="unknown"]').filter({ hasText: "WarRoom" })).toBeVisible();
  await page.getByRole("button", { name: "System Health", exact: true }).click();
  await expect(page.getByText("Degraded is not failed")).toBeVisible();
  await expect(page.getByText("Core workflow runner allocation")).toBeVisible();
  await expect(page.getByText("Master workflow runner allocation")).toBeVisible();
});

test("owner input classifies reviewed text, hashes it and records only a local successor", async ({ page }) => {
  await page.getByRole("button", { name: "Action Center", exact: true }).click();
  const input = page.getByLabel("Exact editable text");
  await input.fill(exactSyntheticOwnerText);
  await expect(page.getByRole("heading", { name: "collaboration opportunity" })).toBeVisible();
  await expect(page.locator(".metric code").nth(1)).toHaveText(/^[a-f0-9]{64}$/u);
  await page.getByRole("button", { name: "Save immutable successor" }).click();
  await expect(page.getByText("Revision 1")).toBeVisible();
  await page.getByRole("button", { name: "Not now" }).click();
  await expect(page.getByText(/Decision: not-now/u)).toBeVisible();
  await expect(page.getByText(/grants no execution, merge, production, messaging, payment or spending authority/u)).toBeVisible();
});

test("synthetic Personal Launch Pod and collaboration flows never send or sign", async ({ page }) => {
  await page.getByRole("button", { name: "Collaboration and JV Center", exact: true }).click();
  await expect(page.getByText("No real account connected")).toBeVisible();
  await page.getByRole("button", { name: "Approve synthetic packet" }).click();
  await page.getByRole("button", { name: "Share synthetic Project Delta" }).click();
  await expect(page.getByText(/nothing was sent/u)).toBeVisible();
  await page.getByRole("button", { name: "Decline" }).click();
  await expect(page.getByText(/nothing was signed or published/u)).toBeVisible();
});

test("Tree API is no-store, canonical and public-sanitized", async ({ page }) => {
  const response = await page.evaluate(async () => {
    const result = await fetch("/api/tree");
    return { ok: result.ok, cacheControl: result.headers.get("cache-control"), body: await result.json() };
  });
  expect(response.ok).toBe(true);
  expect(response.cacheControl).toContain("no-store");
  const { body } = response;
  expect(body.schemaVersion).toBe("clover-tree-live-readback-v0.2");
  expect(body.baseline.indexId).toBe("tree-program:index:0001");
  expect(body.baseline.classification).toBe("historical-source-bound-baseline");
  expect(body.baseline.immutableRecords.index.publicSanitized).toBe(true);
  expect(body.baseline.immutableRecords.index.privateDataAccessed).toBe(false);
  expect(body.baseline.immutableRecords.branches).toHaveLength(22);
  expect(body.baseline.immutableRecords.relationships).toHaveLength(21);
  expect(body.observations.github.sourceId).toBe("github-public-api");
  expect(body.observations.deploymentSelf.observedAt).toBeNull();
  expect(body.observations.clover.status).toBe("external-owner-console-required");
  expect(body.observations.clover.webRuntimeConnectorInvoked).toBe(false);
  expect(body.reconciled.currentActionCard.action).toBe("HOLD");
  expect(body.authority.mergeAuthorized).toBe(false);
  expect(body.authority.productionAuthorized).toBe(false);
  expect(Date.parse(body.requestObservedAt)).not.toBeNaN();
});

test("security and accessibility boundaries hold on the rendered command center", async ({ page }) => {
  const response = await page.goto("/", { waitUntil: "networkidle" });
  expect(response?.status()).toBe(200);
  const headers = response?.headers() ?? {};
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["permissions-policy"]).toContain("microphone=(self)");
  expect(headers["permissions-policy"]).toContain("payment=()");
  expect(headers["x-frame-options"]).toBe("DENY");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("all views and material states close Axe findings with visible keyboard entry and exit", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const viewport = testInfo.project.name.startsWith("mobile") ? { width: 390, height: 844 } : { width: 1440, height: 1000 };
  const scans: AxeScanEvidence[] = [];
  let branchOverflowEvidence: { clientWidth: number; scrollWidth: number; overflowing: boolean; keyboardEntryRequired: boolean } | null = null;
  await page.setViewportSize(viewport);

  for (const view of exactViews) {
    await activateView(page, view);
    await scanWithCompleteAxePayload(page, scans, view, "base-view", viewport);
  }

  await activateView(page, "Collaboration and JV Center");
  await expect(page.getByRole("heading", { level: 2, name: "Collaboration & JV Center", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Personal Launch Pod", exact: true })).toBeVisible();
  await scanWithCompleteAxePayload(page, scans, "Collaboration and JV Center", "collaboration-initial-draft", viewport);
  await pressNamedButton(page, "Keep draft");
  await expect(page.getByText("Draft retained in local preview state; no agreement exists.", { exact: true })).toBeVisible();
  await scanWithCompleteAxePayload(page, scans, "Collaboration and JV Center", "collaboration-keep-draft", viewport);
  await pressNamedButton(page, "Not now");
  await expect(page.getByText("Synthetic opportunity paused; nothing was sent.", { exact: true })).toBeVisible();
  await scanWithCompleteAxePayload(page, scans, "Collaboration and JV Center", "collaboration-not-now", viewport);
  await pressNamedButton(page, "Decline");
  await expect(page.getByText("Synthetic opportunity declined; nothing was signed or published.", { exact: true })).toBeVisible();
  await scanWithCompleteAxePayload(page, scans, "Collaboration and JV Center", "collaboration-decline", viewport);

  const projectDeltaButton = page.getByRole("button", { name: "Share synthetic Project Delta", exact: true });
  await expect(projectDeltaButton).toBeDisabled();
  await scanWithCompleteAxePayload(page, scans, "Collaboration and JV Center", "pod-initial-disabled", viewport);
  await pressNamedButton(page, "Approve synthetic packet");
  await expect(page.getByText("Synthetic participant approved locally; no account or Site was changed.", { exact: true })).toBeVisible();
  await expect(projectDeltaButton).toBeEnabled();
  await scanWithCompleteAxePayload(page, scans, "Collaboration and JV Center", "pod-approved", viewport);
  await pressNamedButton(page, "Share synthetic Project Delta");
  await expect(page.getByText("Synthetic Project Delta prepared locally; nothing was sent.", { exact: true })).toBeVisible();
  await scanWithCompleteAxePayload(page, scans, "Collaboration and JV Center", "pod-project-delta", viewport);
  await pressNamedButton(page, "Withdraw synthetic delta");
  await expect(page.getByText("Synthetic participant approved locally; no account or Site was changed.", { exact: true })).toBeVisible();
  await scanWithCompleteAxePayload(page, scans, "Collaboration and JV Center", "pod-delta-withdrawn", viewport);
  await pressNamedButton(page, "Revoke synthetic approval");
  await expect(page.getByText("Awaiting synthetic participant approval.", { exact: true })).toBeVisible();
  await scanWithCompleteAxePayload(page, scans, "Collaboration and JV Center", "pod-approval-revoked", viewport);
  await expect(page.getByRole("button", { name: "Share synthetic Project Delta", exact: true })).toBeDisabled();
  await scanWithCompleteAxePayload(page, scans, "Collaboration and JV Center", "pod-disabled-after-revocation", viewport);

  await activateView(page, "Action Center");
  await expect(page.getByRole("heading", { level: 2, name: "Owner signal", exact: true })).toBeVisible();
  await page.getByLabel("Exact editable text").fill(exactSyntheticOwnerText);
  const actionDigest = page.locator(".owner-input-card .metric").filter({ hasText: "SHA-256" }).locator("code");
  await expect(actionDigest).toHaveText(/^[a-f0-9]{64}$/u);
  await scanWithCompleteAxePayload(page, scans, "Action Center", "action-exact-signal-64hex", viewport);

  const recommendedPacket = page.locator(".recommended-packet details");
  const packetSummary = recommendedPacket.locator("summary");
  await packetSummary.focus();
  await expect(packetSummary).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(recommendedPacket).toHaveAttribute("open", "");
  const packetRegion = page.getByRole("region", { name: "CloverApps collaboration exact packet content", exact: true });
  await packetSummary.focus();
  await page.keyboard.press("Tab");
  await expectVisibleFocus(packetRegion);
  await page.keyboard.press("Tab");
  await expect(packetRegion).not.toBeFocused();
  await scanWithCompleteAxePayload(page, scans, "Action Center", "action-recommended-packet-expanded", viewport);

  await pressNamedButton(page, "Save immutable successor");
  await expect(page.getByText("Revision 1", { exact: true })).toBeVisible();
  await scanWithCompleteAxePayload(page, scans, "Action Center", "action-successor-saved", viewport);
  for (const [buttonName, decision] of [["Approve packet", "approved"], ["Amend", "amend"], ["Decline", "declined"], ["Not now", "not-now"]] as const) {
    await pressNamedButton(page, buttonName);
    await expect(page.getByText(new RegExp(`Decision: ${decision}`, "u"))).toBeVisible();
    await scanWithCompleteAxePayload(page, scans, "Action Center", `action-decision-${decision}`, viewport);
  }

  const branchesButton = await activateView(page, "Branches");
  const branchRegion = page.getByRole("region", { name: "Canonical public-sanitized branch table", exact: true });
  const branchDimensions = await branchRegion.evaluate((node) => ({ clientWidth: node.clientWidth, scrollWidth: node.scrollWidth }));
  const branchOverflows = branchDimensions.scrollWidth > branchDimensions.clientWidth;
  branchOverflowEvidence = { ...branchDimensions, overflowing: branchOverflows, keyboardEntryRequired: branchOverflows };
  if (branchOverflows) {
    await expect(branchRegion).toHaveAttribute("tabindex", "0");
    await branchesButton.focus();
    let enteredBranchRegion = false;
    for (let index = 0; index < exactViews.length + 4; index += 1) {
      await page.keyboard.press("Tab");
      if (await branchRegion.evaluate((node) => document.activeElement === node)) {
        enteredBranchRegion = true;
        break;
      }
    }
    expect(enteredBranchRegion, "Overflowing Branch table region was not reachable from the view navigation by keyboard.").toBe(true);
    await expectVisibleFocus(branchRegion);
    await page.keyboard.press("Tab");
    await expect(branchRegion).not.toBeFocused();
  } else {
    await expect(branchRegion).not.toHaveAttribute("tabindex");
  }
  await scanWithCompleteAxePayload(page, scans, "Branches", "branch-keyboard-entry-exit", viewport);

  await activateView(page, "Launch Studio session");
  await page.getByLabel("Reviewed instruction or transcript").fill(exactSyntheticOwnerText);
  const launchDigest = page.locator("#transcript-integrity .metric").filter({ hasText: "SHA-256" }).locator("code");
  await expect(launchDigest).toHaveText(/^[a-f0-9]{64}$/u);
  await scanWithCompleteAxePayload(page, scans, "Launch Studio session", "launch-integrity-64hex", viewport);

  expect(scans).toHaveLength(expectedAxeScansPerViewport);
  expect(scans.flatMap(({ violations }) => violations)).toEqual([]);
  await testInfo.attach(`clover-axe-closure-${testInfo.project.name}.json`, {
    body: Buffer.from(`${JSON.stringify({ axeVersion: "4.13.0", project: testInfo.project.name, viewport, exactViews, expectedScanCount: expectedAxeScansPerViewport, actualScanCount: scans.length, branchOverflowEvidence, scans }, null, 2)}\n`),
    contentType: "application/json"
  });
});

test("mobile 390x844 preserves all views, full integrity digests and shrink boundaries", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"), "mobile project only");
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page, "Today");
  await page.screenshot({ path: screenshotPath(testInfo, "clover-tree-command-center-mobile-today.png"), fullPage: true });

  for (const view of exactViews) {
    const viewButton = page.getByRole("button", { name: view, exact: true });
    await viewButton.click();
    await expect(viewButton).toHaveAttribute("aria-current", "page");

    if (view === "Action Center") {
      await page.getByLabel("Exact editable text").fill(exactSyntheticOwnerText);
      const digestNode = page.locator(".owner-input-card .metric").filter({ hasText: "SHA-256" }).locator("code");
      await expect(digestNode).toHaveText(/^[a-f0-9]{64}$/u);
      const digest = await digestNode.textContent();
      expect(digest).toMatch(/^[a-f0-9]{64}$/u);
      await expect(digestNode).toHaveAttribute("title", digest!);
      expect(await digestNode.evaluate((node) => node.textContent)).toBe(digest);
      await expectNoHorizontalOverflow(page, view);
      await page.screenshot({ path: screenshotPath(testInfo, "clover-tree-command-center-mobile-action-center.png"), fullPage: true });
      continue;
    }

    if (view === "Launch Studio session") {
      const transcript = page.getByLabel("Reviewed instruction or transcript");
      await transcript.fill(exactSyntheticOwnerText);
      const integrityGrid = page.locator("#transcript-integrity");
      await expect(integrityGrid).toBeVisible();
      const digestNode = integrityGrid.locator(".metric").filter({ hasText: "SHA-256" }).locator("code");
      await expect(digestNode).toHaveText(/^[a-f0-9]{64}$/u);
      const digest = await digestNode.textContent();
      expect(digest).toMatch(/^[a-f0-9]{64}$/u);
      await expect(digestNode).toHaveAttribute("title", digest!);
      expect(await digestNode.evaluate((node) => node.textContent)).toBe(digest);
      await expectNoHorizontalOverflow(page, view);
      await page.screenshot({ path: screenshotPath(testInfo, "clover-tree-command-center-mobile-launch-studio.png"), fullPage: true });
      continue;
    }

    await expectNoHorizontalOverflow(page, view);
  }
});
