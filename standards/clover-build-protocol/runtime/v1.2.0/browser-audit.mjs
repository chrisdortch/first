#!/usr/bin/env node
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { chromium, webkit } from '@playwright/test';
import { assertUrlOrigin, commandList, compareProtocolSnapshots, compareSnapshots, localStatePassed, readJson, resolveLoopbackRoute, sha256, snapshotProtocolCheckout, snapshotSource, unknownExternalObservation, writeJson } from './lib.mjs';

const [policyArg, outputDirArg] = process.argv.slice(2);
if (!policyArg || !outputDirArg) {
  console.error('Usage: browser-audit.mjs <policy.json> <output-dir>');
  process.exit(2);
}
const policyPath = path.resolve(policyArg);
const policy = readJson(policyPath);
const preview = commandList(policy, 'preview')[0];
const outputDir = path.resolve(outputDirArg);
const screenshotsDir = path.join(outputDir, 'screenshots');
fs.mkdirSync(screenshotsDir, { recursive: true });
const before = snapshotSource(process.cwd(), policyPath);
const protocolBefore = snapshotProtocolCheckout();
if (!protocolBefore.exactCommit || !protocolBefore.trackedClean) throw new Error('Protocol checkout is not exact and clean before browser execution.');
const baseUrl = policy.browserAudit.baseUrl.replace(/\/$/, '');
const baseOrigin = new URL(baseUrl).origin;
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(baseOrigin)) throw new Error('Browser base URL must be loopback HTTP.');
const safeEnvNames = ['PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP', 'CI', 'NODE_ENV', 'LANG', 'LC_ALL', 'TERM', 'NO_COLOR', 'CLOVER_BUILD_MODE'];
const safeEnv = Object.fromEntries(safeEnvNames.filter((name) => typeof process.env[name] === 'string').map((name) => [name, process.env[name]]));
const logFd = fs.openSync(path.join(outputDir, 'preview-server.log'), 'w');
const startedAt = new Date().toISOString();
let spawnError = null;
const server = spawn(preview.executable, preview.args, { cwd: process.cwd(), env: safeEnv, shell: false, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
server.stdout.on('data', (chunk) => fs.writeSync(logFd, chunk));
server.stderr.on('data', (chunk) => fs.writeSync(logFd, chunk));
server.on('error', (error) => { spawnError = error?.message || String(error); });
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
let previewTimedOut = false;
const previewTimer = setTimeout(() => {
  previewTimedOut = true;
  if (server.pid) { try { process.kill(-server.pid, 'SIGTERM'); } catch {} }
}, preview.timeoutSeconds * 1000);
previewTimer.unref();
const waitForExit = async (milliseconds) => {
  if (server.exitCode !== null || server.signalCode !== null) return;
  await Promise.race([
    new Promise((resolve) => server.once('close', resolve)),
    sleep(milliseconds)
  ]);
};
const waitForServer = async () => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/`, { redirect: 'manual' });
      if (response.status < 500) return;
    } catch {}
    if (server.exitCode !== null) throw new Error(`Preview process exited with ${server.exitCode}.`);
    await sleep(1000);
  }
  throw new Error('Preview server did not become ready.');
};
const matchesIgnored = (value, patterns = []) => patterns.some((pattern) => String(value).includes(pattern));
const results = [];
let runtimeError = null;
try {
  await waitForServer();
  for (const profile of policy.browserAudit.profiles) {
    const engine = profile.browser === 'webkit' ? webkit : chromium;
    const browser = await engine.launch({ headless: true });
    try {
      for (const route of policy.browserAudit.routes) {
        const context = await browser.newContext({ viewport: { width: profile.width, height: profile.height }, deviceScaleFactor: profile.deviceScaleFactor || 1, isMobile: Boolean(profile.isMobile), hasTouch: Boolean(profile.hasTouch), reducedMotion: 'reduce', locale: 'en-US', timezoneId: 'America/Chicago' });
        const page = await context.newPage();
        const consoleErrors = [];
        const pageErrors = [];
        const requestFailures = [];
        const httpErrors = [];
        const offOriginNavigations = [];
        page.on('console', (message) => { if (message.type() === 'error' && !matchesIgnored(message.text(), policy.browserAudit.ignoreConsolePatterns)) consoleErrors.push(message.text()); });
        page.on('pageerror', (error) => pageErrors.push(error?.message || String(error)));
        page.on('requestfailed', (request) => { try { if (new URL(request.url()).origin === baseOrigin && !matchesIgnored(request.url(), policy.browserAudit.ignoreRequestPatterns)) requestFailures.push(request.url()); } catch {} });
        page.on('response', (response) => { try { if (new URL(response.url()).origin === baseOrigin && response.status() >= 400 && !matchesIgnored(response.url(), policy.browserAudit.ignoreRequestPatterns)) httpErrors.push({ url: response.url(), status: response.status() }); } catch {} });
        page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) { try { if (new URL(frame.url()).origin !== baseOrigin) offOriginNavigations.push(frame.url()); } catch {} } });
        const issues = [];
        let navigationStatus = null;
        try {
          const routeUrl = resolveLoopbackRoute(baseUrl, route.path);
          const response = await page.goto(routeUrl.toString(), { waitUntil: 'domcontentloaded', timeout: 45000 });
          assertUrlOrigin(page.url(), baseOrigin, 'Final page URL');
          if (response) assertUrlOrigin(response.url(), baseOrigin, 'Final navigation response');
          navigationStatus = response?.status() ?? null;
          if (route.waitForSelector) await page.locator(route.waitForSelector).first().waitFor({ state: 'visible', timeout: 15000 });
          if (route.waitForText) await page.getByText(route.waitForText, { exact: false }).first().waitFor({ state: 'visible', timeout: 15000 });
          await page.waitForTimeout(policy.browserAudit.stabilizationMs || 700);
        } catch (error) {
          issues.push({ id: 'navigation', detail: error?.message || String(error) });
        }
        for (const selector of route.requiredSelectors || []) if (!await page.locator(selector).first().isVisible().catch(() => false)) issues.push({ id: 'required-selector', detail: selector });
        for (const text of route.requiredText || []) if (!await page.getByText(text, { exact: false }).first().isVisible().catch(() => false)) issues.push({ id: 'required-text', detail: text });
        if (offOriginNavigations.length) issues.push({ id: 'off-origin-navigation', detail: offOriginNavigations });
        try { assertUrlOrigin(page.url(), baseOrigin, 'Stabilized page URL'); } catch (error) { issues.push({ id: 'off-origin-navigation', detail: error?.message || String(error) }); }
        const metrics = await page.evaluate(() => {
          const images = [...document.images];
          const ids = new Map();
          for (const element of document.querySelectorAll('[id]')) ids.set(element.id, (ids.get(element.id) || 0) + 1);
          const width = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0);
          return { brokenImages: images.filter((image) => image.complete && image.naturalWidth === 0).length, horizontalOverflowPx: Math.max(0, Math.ceil(width - innerWidth)), duplicateIds: [...ids.values()].filter((count) => count > 1).length };
        });
        const budgets = policy.browserAudit.budgets;
        const enforce = (id, observed, maximum) => { if (observed > maximum) issues.push({ id, detail: { observed, maximum } }); };
        enforce('console-errors', consoleErrors.length, budgets.maxConsoleErrors);
        enforce('page-errors', pageErrors.length, budgets.maxPageErrors);
        enforce('request-failures', requestFailures.length, budgets.maxFirstPartyRequestFailures);
        enforce('http-errors', httpErrors.length, budgets.maxHttpErrors);
        enforce('broken-images', metrics.brokenImages, budgets.maxBrokenImages);
        enforce('horizontal-overflow', metrics.horizontalOverflowPx, budgets.maxHorizontalOverflowPx);
        enforce('duplicate-ids', metrics.duplicateIds, budgets.maxDuplicateIds ?? 0);
        if (navigationStatus === null || navigationStatus >= 400) issues.push({ id: 'http-status', detail: navigationStatus });
        const screenshotName = `${profile.id}__${route.id}.png`.replace(/[^A-Za-z0-9_.-]/g, '-');
        const screenshotPath = path.join(screenshotsDir, screenshotName);
        await page.screenshot({ path: screenshotPath, fullPage: false, animations: 'disabled', caret: 'hide' });
        results.push({ profileId: profile.id, browser: profile.browser, routeId: route.id, path: route.path, navigationStatus, status: issues.length ? 'failed' : 'passed', issues, metrics, screenshot: `screenshots/${screenshotName}`, screenshotSha256: crypto.createHash('sha256').update(fs.readFileSync(screenshotPath)).digest('hex') });
        await context.close();
      }
    } finally {
      await browser.close();
    }
  }
} catch (error) {
  runtimeError = error?.message || String(error);
} finally {
  clearTimeout(previewTimer);
  if (server.pid) {
    try { process.kill(-server.pid, 'SIGTERM'); } catch {}
    await waitForExit(5000);
    if (server.exitCode === null && server.signalCode === null) {
      try { process.kill(-server.pid, 'SIGKILL'); } catch {}
      await waitForExit(2000);
    }
  }
  fs.closeSync(logFd);
}
const after = snapshotSource(process.cwd(), policyPath);
const protocolAfter = snapshotProtocolCheckout();
const stateObservations = compareSnapshots(before, after);
const protocolObservation = compareProtocolSnapshots(protocolBefore, protocolAfter);
const previewExecution = { executable: preview.executable, args: preview.args, shell: false, processStarted: server.pid !== undefined, pidObserved: server.pid ?? null, startedAt, finishedAt: new Date().toISOString(), exitCodeAfterProtocolTermination: server.exitCode, signalAfterProtocolTermination: server.signalCode, timedOut: previewTimedOut, spawnError, status: !spawnError && !runtimeError && !previewTimedOut ? 'observed-and-protocol-terminated' : 'failed' };
const status = !runtimeError && !previewTimedOut && results.length > 0 && results.every((result) => result.status === 'passed') && localStatePassed(stateObservations) && protocolObservation.state === 'not-observed' ? 'passed' : 'failed';
const receipt = { schemaVersion: '1.2', protocolVersion: '1.2.0', generatedAt: new Date().toISOString(), status, runtimeError, authority: { releaseState: 'not-authorized', productionEligible: false }, operationsObserved: { navigations: results.map((result) => ({ routeId: result.routeId, profileId: result.profileId, status: result.navigationStatus })), screenshots: results.map((result) => ({ path: result.screenshot, sha256: result.screenshotSha256 })) }, processExecution: previewExecution, observations: { ...stateObservations, protocolCheckoutMutation: protocolObservation, externalProviderSideEffects: unknownExternalObservation() }, results, summary: { total: results.length, passed: results.filter((result) => result.status === 'passed').length, failed: results.filter((result) => result.status === 'failed').length } };
const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const cards = results.map((result) => `<article><h2>${escape(result.routeId)} · ${escape(result.profileId)}</h2><img src="${escape(result.screenshot)}" alt="${escape(result.routeId)} ${escape(result.profileId)}"><p>${escape(result.status.toUpperCase())} · HTTP ${escape(result.navigationStatus ?? 'none')} · ${result.issues.length} issue(s)</p></article>`).join('');
fs.writeFileSync(path.join(outputDir, 'contact-sheet.html'), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Clover browser audit</title><style>body{font-family:system-ui;background:#eef3f1;color:#17211b;margin:0;padding:22px}main{max-width:1400px;margin:auto}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:18px}article{background:white;border:1px solid #cad8d0;border-radius:14px;overflow:hidden}h1,h2,p{margin:14px}img{width:100%;display:block}</style><main><h1>${escape(policy.project.title)} — Clover browser audit</h1><p>${escape(status.toUpperCase())} · production not authorized</p><section class="grid">${cards}</section></main>`);
if (results.length) {
  const sheetBrowser = await chromium.launch({ headless: true });
  try {
    const page = await sheetBrowser.newPage({ viewport: { width: 1500, height: 1000 } });
    await page.goto(pathToFileURL(path.join(outputDir, 'contact-sheet.html')).href);
    await page.screenshot({ path: path.join(outputDir, 'contact-sheet.png'), fullPage: true });
  } finally {
    await sheetBrowser.close();
  }
}
writeJson(path.join(outputDir, 'browser-receipt.json'), receipt);
if (process.env.GITHUB_OUTPUT) {
  for (const [name, relative] of [
    ['preview_log_sha256', 'preview-server.log'],
    ['contact_sheet_html_sha256', 'contact-sheet.html'],
    ['contact_sheet_png_sha256', 'contact-sheet.png']
  ]) {
    const absolute = path.join(outputDir, relative);
    if (fs.existsSync(absolute)) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${sha256(fs.readFileSync(absolute))}\n`);
  }
}
console.log(`Clover browser audit: ${status}`);
if (status !== 'passed') process.exit(1);
