import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const appRoot = process.cwd();
const repoRoot = path.resolve(appRoot, '../..');
const coreRoot = path.join(repoRoot, 'portfolio/core');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('Clover Today exposes the five owner questions and fail-closed authority', () => {
  const html = read('apps/clover-context-gateway/public/command-center.html');
  for (const phrase of [
    'What should I know?',
    'Why?',
    'What do you recommend?',
    'Do the safe parts.',
    'What happened?',
    'Truth Loop active',
    'Action Loop locked',
    'No production authority',
    'One decision at a time',
    'Minimum Useful Core',
    'What works now',
    'What changed',
    'Live versus candidate',
    'Source freshness',
    'Top three priorities',
    'Recommended next action',
    'Action ID and envelope',
    'Connector plan and authority',
    'Publication readback verified',
    'it does not replace priorities, Action ID, Handoff lifecycle, or authority'
  ]) {
    assert.ok(html.includes(phrase), `missing ${phrase}`);
  }
  assert.ok(html.includes('textContent'));
  assert.ok(html.includes('window.openai?.toolOutput'));
  assert.ok(html.includes('renderOwnerSession'));
  assert.equal(html.includes("fetch('/api/context')"), false);
  assert.equal(html.includes('innerHTML'), false);
  for (const privateName of ['RollinD', 'Serenity', 'Lakeside', 'SongAndStage']) {
    assert.equal(html.includes(privateName), false, `anonymous surface embeds ${privateName}`);
  }
  assert.equal(/[a-f0-9]{40,64}/.test(html), false, 'anonymous surface embeds a source hash');
  assert.ok(!html.includes('standingProductionAuthority: true'));
});

test('Core candidate JSON and JSONL records are parseable and public-safe', () => {
  const jsonFiles = [
    'portfolio/core/CAPABILITY_AUTHORITY_REGISTRY.json',
    'portfolio/core/schemas/core-event.schema.json',
    'portfolio/core/schemas/action-envelope.schema.json',
    'portfolio/core/schemas/context-capsule.schema.json',
    'portfolio/core/schemas/knowledge-projection.schema.json',
    'portfolio/core/fixtures/action-envelope.synthetic.json',
    'portfolio/core/fixtures/context-capsule.synthetic.json',
    'portfolio/core/fixtures/knowledge-projection.synthetic.json'
  ];

  for (const file of jsonFiles) JSON.parse(read(file));

  for (const file of [
    'portfolio/core/fixtures/events.synthetic.jsonl',
    'portfolio/core/event-ledger.candidate.jsonl',
    'portfolio/ledger/decisions.jsonl'
  ]) {
    const lines = read(file).trim().split(/\r?\n/);
    assert.ok(lines.length > 0, `${file} is empty`);
    for (const line of lines) JSON.parse(line);
  }

  const combined = fs.readdirSync(coreRoot, { recursive: true })
    .filter((entry) => typeof entry === 'string')
    .map((entry) => path.join(coreRoot, entry))
    .filter((entry) => fs.statSync(entry).isFile())
    .map((entry) => fs.readFileSync(entry, 'utf8'))
    .join('\n');

  const forbiddenPatterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}/,
    /\bgh[pousr]_[A-Za-z0-9]{20,}/,
    /\bAIza[A-Za-z0-9_-]{20,}/
  ];
  for (const pattern of forbiddenPatterns) assert.equal(pattern.test(combined), false, `forbidden secret-like pattern: ${pattern}`);
});

test('Authority registry and schemas preserve non-authority invariants', () => {
  const registry = JSON.parse(read('portfolio/core/CAPABILITY_AUTHORITY_REGISTRY.json'));
  assert.equal(registry.defaultDeny, true);
  assert.equal(registry.standingProductionAuthority, false);
  assert.equal(registry.standingPrivateDataAuthority, false);
  assert.equal(registry.standingSecretRevealAuthority, false);

  for (const system of registry.systems) {
    assert.notEqual(system.capabilities.execute_production, 'allow');
  }

  const capsule = JSON.parse(read('portfolio/core/schemas/context-capsule.schema.json'));
  assert.equal(capsule.properties.containsPlaintextSecrets.const, false);
  assert.equal(capsule.properties.authority.properties.standingProductionAuthority.const, false);

  const projection = JSON.parse(read('portfolio/core/schemas/knowledge-projection.schema.json'));
  assert.equal(projection.properties.containsRawSource.const, false);
  assert.equal(projection.properties.containsPlaintextSecrets.const, false);

  const action = JSON.parse(read('portfolio/core/schemas/action-envelope.schema.json'));
  assert.equal(action.properties.singleUse.const, true);

  const actionFixture = JSON.parse(read('portfolio/core/fixtures/action-envelope.synthetic.json'));
  assert.equal(actionFixture.environment, 'preview');
  assert.equal(actionFixture.singleUse, true);
  assert.equal(actionFixture.cost.purchaseApproved, false);

  const capsuleFixture = JSON.parse(read('portfolio/core/fixtures/context-capsule.synthetic.json'));
  assert.equal(capsuleFixture.containsPlaintextSecrets, false);
  assert.equal(capsuleFixture.authority.standingProductionAuthority, false);

  const projectionFixture = JSON.parse(read('portfolio/core/fixtures/knowledge-projection.synthetic.json'));
  assert.equal(projectionFixture.containsRawSource, false);
  assert.equal(projectionFixture.containsPlaintextSecrets, false);
});

test('Synthetic fixtures are unmistakably synthetic', () => {
  const lines = read('portfolio/core/fixtures/events.synthetic.jsonl').trim().split(/\r?\n/).map(JSON.parse);
  assert.ok(lines.length >= 3);
  for (const event of lines) {
    assert.equal(event.synthetic, true);
    assert.ok(event.eventId.startsWith('evt_synthetic_'));
  }
});

test('Constitution 0.1 is ratified externally without rewriting the approved artifact', () => {
  const constitution = read('portfolio/core/CLOVER_CONSTITUTION_CANDIDATE_V0.1.md');
  assert.ok(constitution.includes('not yet ratified'));
  assert.ok(constitution.includes('No silent self-modification'));

  const pointer = JSON.parse(read('portfolio/core/constitution/CURRENT.json'));
  const receipt = JSON.parse(read('portfolio/core/constitution/ratifications/2026-08-18-v0.1.json'));
  assert.equal(pointer.status, 'ratified-active');
  assert.equal(pointer.currentVersion, '0.1');
  assert.equal(pointer.constitutionSha256, '82b90697389503182e44838df537268510680acffdff95b924967d11bb44169e');
  assert.equal(receipt.owner.decision, 'approved-unchanged');
  assert.equal(receipt.approvedArtifact.textModifiedByRatification, false);
  assert.equal(receipt.ratificationEffect.futureAmendmentsAllowed, true);
  assert.deepEqual(receipt.ratificationEffect.operationalAuthorityGranted, []);
  assert.equal(pointer.standingProductionAuthority, false);
  assert.equal(pointer.mergeAuthorityGranted, false);

  const daily = read('portfolio/daily/2026-08-18.md');
  assert.ok(daily.includes('Constitution ratification — 6:58 p.m. CDT'));
  assert.ok(daily.includes('Mission completion: remains **41%**'));
  assert.ok(daily.includes('does **not** approve merge'));
});
