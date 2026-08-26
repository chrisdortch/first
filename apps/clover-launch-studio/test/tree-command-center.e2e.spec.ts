import AxeBuilder from "@axe-core/playwright";
import path from "node:path";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

const exactViews = [
  "Today", "Tree", "Master Plan", "Branches", "Roots and Source Coverage", "Captain's Log", "Fruit Ledger",
  "Collaboration and JV Center", "Action Center", "System Health", "Launch Studio session"
];
const exactSyntheticOwnerText = "Create a new synthetic SongAndStage collaboration opportunity with no private data.";
const runtimeFindings = new WeakMap<Page, string[]>();

function screenshotPath(testInfo: TestInfo, filename: string) {
  return process.env.CLOVER_SCREENSHOT_DIR ? path.join(process.env.CLOVER_SCREENSHOT_DIR, filename) : testInfo.outputPath(filename);
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
  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(/\/Users\/|BEGIN [A-Z ]*PRIVATE KEY|sk-(?:proj-)?[A-Za-z0-9_-]{20,}/u);
  if (testInfo.project.name === "desktop-chromium") {
    await page.screenshot({ path: screenshotPath(testInfo, "clover-tree-command-center-desktop-today.png"), fullPage: true });
  }
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

test("Tree API is no-store, canonical and public-sanitized", async ({ request }) => {
  const response = await request.get("/api/tree");
  expect(response.ok()).toBe(true);
  expect(response.headers()["cache-control"]).toContain("no-store");
  const body = await response.json();
  expect(body.index.indexId).toBe("tree-program:index:0001");
  expect(body.index.publicSanitized).toBe(true);
  expect(body.index.privateDataAccessed).toBe(false);
  expect(body.branches).toHaveLength(22);
  expect(body.relationships).toHaveLength(21);
  expect(body.readback.durablePrivateStorageClaimed).toBe(false);
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
