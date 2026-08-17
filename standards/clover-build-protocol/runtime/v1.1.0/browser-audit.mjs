#!/usr/bin/env node
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { chromium, webkit } from '@playwright/test';

const [policyArg, outputDirArg] = process.argv.slice(2);
if (!policyArg || !outputDirArg) {
  console.error('Usage: browser-audit.mjs <policy.json> <output-dir>');
  process.exit(2);
}
const policy = JSON.parse(fs.readFileSync(path.resolve(policyArg), 'utf8'));
const outputDir = path.resolve(outputDirArg);
const screenshotsDir = path.join(outputDir, 'screenshots');
fs.mkdirSync(screenshotsDir, { recursive: true });
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const matches = (value, patterns = []) => patterns.some((pattern) => { try { return new RegExp(pattern, 'i').test(value); } catch { return value.includes(pattern); } });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const baseUrl = policy.browserAudit.baseUrl.replace(/\/$/, '');
const baseOrigin = new URL(baseUrl).origin;
const startedAt = new Date().toISOString();
const serverLog = fs.openSync(path.join(outputDir, 'preview-server.log'), 'w');
const server = spawn('bash', ['-lc', policy.commands.preview], { cwd: process.cwd(), env: process.env, detached: true, stdio: ['ignore', serverLog, serverLog] });
const stopServer = () => {
  if (!server.pid) return;
  try { process.kill(-server.pid, 'SIGTERM'); } catch {}
};
const waitForServer = async () => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try { const response = await fetch(`${baseUrl}/`, { redirect: 'manual' }); if (response.status < 500) return; } catch {}
    if (server.exitCode !== null) throw new Error(`Preview server exited with ${server.exitCode}.`);
    await sleep(1000);
  }
  throw new Error('Preview server did not become ready.');
};
const visibleMetrics = async (page, profile) => page.evaluate(({ isMobile }) => {
  const visible = (element) => { const style = getComputedStyle(element); const rect = element.getBoundingClientRect(); return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0 && rect.width > 0 && rect.height > 0; };
  const normalizeLabel = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const label = (element) => {
    const direct = normalizeLabel(element.getAttribute('aria-label') || element.getAttribute('title'));
    if (direct) return direct;
    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy) {
      const labelledText = labelledBy
        .split(/\s+/)
        .map((id) => normalizeLabel(document.getElementById(id)?.textContent))
        .filter(Boolean)
        .join(' ');
      if (labelledText) return labelledText;
    }
    const explicitLabels = element.labels
      ? [...element.labels].map((item) => normalizeLabel(item.textContent)).filter(Boolean).join(' ')
      : '';
    return normalizeLabel(explicitLabels || element.closest('label')?.textContent || element.textContent || element.querySelector('img')?.alt);
  };
  const ids = new Map();
  for (const element of document.querySelectorAll('[id]')) ids.set(element.id, (ids.get(element.id) || 0) + 1);
  const controls = [...document.querySelectorAll('button,input:not([type="hidden"]),select,textarea,a[href],[role="button"],[role="link"]')].filter(visible);
  const images = [...document.images].filter(visible);
  const scrollWidth = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0);
  return {
    title: document.title,
    horizontalOverflowPx: Math.max(0, Math.ceil(scrollWidth - innerWidth)),
    brokenImages: images.filter((image) => image.complete && image.naturalWidth === 0).map((image) => image.currentSrc || image.src),
    duplicateIds: [...ids].filter(([, count]) => count > 1).map(([id, count]) => ({ id, count })),
    unlabeledControls: controls.filter((element) => !label(element)).map((element) => ({ tag: element.tagName.toLowerCase(), id: element.id || null })),
    smallTouchTargets: isMobile ? controls.map((element) => { const rect = element.getBoundingClientRect(); return { label: label(element).slice(0, 100), width: Math.round(rect.width), height: Math.round(rect.height) }; }).filter((item) => item.width < 40 || item.height < 40) : [],
    headings: [...document.querySelectorAll('h1,h2,h3')].filter(visible).slice(0, 30).map((element) => ({ level: element.tagName.toLowerCase(), text: (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160) })),
    landmarks: { main: document.querySelectorAll('main,[role="main"]').length, nav: document.querySelectorAll('nav,[role="navigation"]').length },
    counts: { links: document.querySelectorAll('a[href]').length, buttons: document.querySelectorAll('button,[role="button"]').length, inputs: document.querySelectorAll('input:not([type="hidden"]),select,textarea').length, images: document.images.length }
  };
}, { isMobile: profile.isMobile });

const results = [];
try {
  await waitForServer();
  for (const profile of policy.browserAudit.profiles) {
    const engine = profile.browser === 'webkit' ? webkit : chromium;
    const browser = await engine.launch({ headless: true });
    try {
      for (const route of policy.browserAudit.routes) {
        const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height }, deviceScaleFactor: profile.deviceScaleFactor || 1, isMobile: Boolean(profile.isMobile), hasTouch: Boolean(profile.hasTouch), reducedMotion: 'reduce', locale: 'en-US', timezoneId: 'America/Chicago' });
        const page = await context.newPage();
        const consoleErrors = [], pageErrors = [], requestFailures = [], httpErrors = [];
        page.on('console', (message) => { if (message.type() === 'error' && !matches(message.text(), policy.browserAudit.ignoreConsolePatterns)) consoleErrors.push(message.text()); });
        page.on('pageerror', (error) => pageErrors.push(error?.stack || error?.message || String(error)));
        page.on('requestfailed', (request) => { try { if (new URL(request.url()).origin === baseOrigin && !matches(request.url(), policy.browserAudit.ignoreRequestPatterns)) requestFailures.push({ url: request.url(), method: request.method(), error: request.failure()?.errorText }); } catch {} });
        page.on('response', (response) => { try { if (new URL(response.url()).origin === baseOrigin && response.status() >= 400 && !matches(response.url(), policy.browserAudit.ignoreRequestPatterns)) httpErrors.push({ url: response.url(), status: response.status() }); } catch {} });
        let navigationStatus = null;
        const issues = [];
        try {
          const response = await page.goto(new URL(route.path, `${baseUrl}/`).toString(), { waitUntil: 'domcontentloaded', timeout: 45000 });
          navigationStatus = response?.status() ?? null;
          if (route.waitForSelector) await page.locator(route.waitForSelector).first().waitFor({ state: 'visible', timeout: 15000 });
          if (route.waitForText) await page.getByText(route.waitForText, { exact: false }).first().waitFor({ state: 'visible', timeout: 15000 });
          await page.waitForTimeout(policy.browserAudit.stabilizationMs || 700);
        } catch (error) { issues.push({ id: 'navigation', severity: 'error', detail: error?.message || String(error) }); }
        for (const selector of route.requiredSelectors || []) if (!await page.locator(selector).first().isVisible().catch(() => false)) issues.push({ id: 'required-selector', severity: 'error', detail: selector });
        for (const text of route.requiredText || []) if (!await page.getByText(text, { exact: false }).first().isVisible().catch(() => false)) issues.push({ id: 'required-text', severity: 'error', detail: text });
        const metrics = await visibleMetrics(page, profile);
        const budgets = policy.browserAudit.budgets;
        const over = (items, maximum, id) => { if (items.length > maximum) issues.push({ id, severity: 'error', detail: { count: items.length, maximum, sample: items.slice(0, 12) } }); };
        if (navigationStatus === null || navigationStatus >= 400) issues.push({ id: 'http-status', severity: 'error', detail: navigationStatus });
        over(consoleErrors, budgets.maxConsoleErrors, 'console-errors');
        over(pageErrors, budgets.maxPageErrors, 'page-errors');
        over(requestFailures, budgets.maxFirstPartyRequestFailures, 'request-failures');
        over(httpErrors, budgets.maxHttpErrors, 'http-errors');
        over(metrics.brokenImages, budgets.maxBrokenImages, 'broken-images');
        if (metrics.horizontalOverflowPx > budgets.maxHorizontalOverflowPx) issues.push({ id: 'horizontal-overflow', severity: 'error', detail: metrics.horizontalOverflowPx });
        if (metrics.duplicateIds.length > (budgets.maxDuplicateIds ?? 0)) issues.push({ id: 'duplicate-ids', severity: 'warning', detail: metrics.duplicateIds.slice(0, 12) });
        if (metrics.unlabeledControls.length > (budgets.maxUnlabeledControls ?? 0)) issues.push({ id: 'unlabeled-controls', severity: 'warning', detail: metrics.unlabeledControls.slice(0, 12) });
        if (metrics.smallTouchTargets.length) issues.push({ id: 'small-touch-targets', severity: 'warning', detail: metrics.smallTouchTargets.slice(0, 12) });
        const screenshotName = `${profile.id}__${route.id}.png`.replace(/[^a-zA-Z0-9_.-]/g, '-');
        const screenshotPath = path.join(screenshotsDir, screenshotName);
        await page.screenshot({ path: screenshotPath, fullPage: false, animations: 'disabled', caret: 'hide' });
        const semanticHash = hash(JSON.stringify({ title: metrics.title, headings: metrics.headings, landmarks: metrics.landmarks, counts: metrics.counts }));
        const errorCount = issues.filter((item) => item.severity === 'error').length;
        results.push({ profileId: profile.id, browser: profile.browser, routeId: route.id, path: route.path, status: errorCount ? 'failed' : 'passed', navigationStatus, issues, metrics, semanticHash, screenshot: `screenshots/${screenshotName}`, screenshotHash: hash(fs.readFileSync(screenshotPath)) });
        await context.close();
      }
    } finally { await browser.close(); }
  }
} finally {
  stopServer();
  fs.closeSync(serverLog);
}
const receipt = { schemaVersion: '1.1', protocolVersion: '1.1.0', generatedAt: new Date().toISOString(), startedAt, project: policy.project, source: { commit: process.env.GITHUB_SHA || null, baselineCommit: policy.source.baselineCommit, productionCommitAtEnrollment: policy.source.productionCommitAtEnrollment }, status: results.every((result) => result.status === 'passed') ? 'passed' : 'failed', authority: { releaseState: 'not-authorized', productionEligible: false }, safety: { navigationOnly: true, clicksAttempted: false, formSubmissionsAttempted: false, credentialsRequested: false, externalWritesAttempted: false, productionDataMutationAttempted: false }, results, summary: { total: results.length, passed: results.filter((result) => result.status === 'passed').length, failed: results.filter((result) => result.status === 'failed').length, warnings: results.reduce((sum, result) => sum + result.issues.filter((item) => item.severity === 'warning').length, 0), aiReviewRecommended: results.some((result) => result.issues.length > 0) } };
fs.writeFileSync(path.join(outputDir, 'browser-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
const cards = results.map((result) => `<article><h2>${result.routeId} · ${result.profileId}</h2><img src="${result.screenshot}" alt="${result.routeId} ${result.profileId}"><p>${result.status.toUpperCase()} · HTTP ${result.navigationStatus ?? 'none'} · ${result.issues.length} issue(s)</p></article>`).join('');
fs.writeFileSync(path.join(outputDir, 'contact-sheet.html'), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Clover browser audit</title><style>body{font-family:system-ui;background:#eef3f1;color:#17211b;margin:0;padding:22px}main{max-width:1400px;margin:auto}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:18px}article{background:white;border:1px solid #cad8d0;border-radius:14px;overflow:hidden}h1,h2,p{margin:14px}img{width:100%;display:block;border-block:1px solid #dae5df}</style><main><h1>${policy.project.title} — Clover browser audit</h1><p>${receipt.status.toUpperCase()} · ${receipt.summary.passed}/${receipt.summary.total} passed · production not authorized</p><section class="grid">${cards}</section></main>`);
const sheetBrowser = await chromium.launch({ headless: true });
try { const page = await sheetBrowser.newPage({ viewport: { width: 1500, height: 1000 } }); await page.goto(pathToFileURL(path.join(outputDir, 'contact-sheet.html')).href); await page.screenshot({ path: path.join(outputDir, 'contact-sheet.png'), fullPage: true }); } finally { await sheetBrowser.close(); }
console.log(`Clover browser audit: ${receipt.status}`);
if (receipt.status !== 'passed') process.exit(1);
