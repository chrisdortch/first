import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const exactViews = [
  "Today", "Tree", "Master Plan", "Branches", "Roots and Source Coverage", "Captain's Log", "Fruit Ledger",
  "Collaboration and JV Center", "Action Center", "System Health", "Launch Studio session"
];
const runtimeFindings = new WeakMap<Page, string[]>();

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
  await page.screenshot({ path: testInfo.outputPath(`tree-command-center-${testInfo.project.name}.png`), fullPage: true });
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
  await input.fill("Create a new synthetic SongAndStage collaboration opportunity with no private data.");
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

test("mobile layout has no horizontal document overflow", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"), "mobile project only");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.getByRole("button", { name: "Tree", exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
