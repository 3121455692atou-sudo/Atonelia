import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { POST_CARD_CATALOG, POST_CARD_RECIPES, CATALOG_FINGERPRINT } from '../../src/career/data/post_card_catalog.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = path.join(ROOT, 'scripts/card_catalog_fingerprint.py');
const DATA = 'src/career/data/post_card_catalog.js';
const RULES = 'src/career/sim/post_catalog.js';
const PYTHON = process.env.PYTHON || 'python3';
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const clone = value => structuredClone(value);
const serialize = (c, r, fingerprint = CATALOG_FINGERPRINT) => [
  '// Test fixture: runtime data only; no external design or audit source.',
  `export const CATALOG_FINGERPRINT = ${JSON.stringify(fingerprint)};`,
  `export const POST_CARD_CATALOG = ${JSON.stringify(c)};`,
  `export const POST_CARD_RECIPES = ${JSON.stringify(r)};`,
  '',
].join('\n');
function run(script, mode = 'check', extra = [], cwd = os.tmpdir()) {
  const result = spawnSync(PYTHON, [script, mode, ...extra], { cwd, encoding: 'utf8', timeout: 15000 });
  assert.ifError(result.error);
  return result;
}
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mrp-card-identity-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const put = (relative, content) => {
    const full = path.join(root, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  };
  put('scripts/card_catalog_fingerprint.py', fs.readFileSync(SCRIPT));
  put(RULES, "export const CATALOG_RULES = 'bounded-dsl-v1';\n");
  const save = (c = POST_CARD_CATALOG, r = POST_CARD_RECIPES, identity = CATALOG_FINGERPRINT) => put(DATA, serialize(c, r, identity));
  save();
  return { root, put, save, run: (mode = 'check', args = []) => run(path.join(root, 'scripts/card_catalog_fingerprint.py'), mode, args) };
}
function expectStatus(result, status) {
  assert.equal(result.status, status, result.stdout + result.stderr);
}

test('main shipped runtime data verifies without depending on current working directory', () => {
  const result = run(SCRIPT);
  expectStatus(result, 0);
  const report = JSON.parse(result.stdout);
  assert.equal(report.algorithm, 'mrp-card-mechanical-projection-v1');
  assert.equal(report.computed, CATALOG_FINGERPRINT);
  assert.equal(report.embedded, CATALOG_FINGERPRINT);
  assert.equal(report.readOnly, true);
  if (POST_CARD_CATALOG.version === '166-card-draft-3') {
    assert.equal(report.computed, 'f270106f1693043eaee61f773a60e460c1d95171bc666148e13f8c61c906a6f8');
  }
});

test('generation and exact canonical bytes reproduce the same identity without writes', t => {
  const f = fixture(t), before = fs.readFileSync(path.join(f.root, DATA));
  const generated = f.run('generate'), canonical = f.run('canonical');
  expectStatus(generated, 0); expectStatus(canonical, 0);
  assert.equal(generated.stdout.trim(), CATALOG_FINGERPRINT);
  assert.equal(sha(Buffer.from(canonical.stdout, 'utf8')), CATALOG_FINGERPRINT);
  assert.equal(canonical.stdout.endsWith('\n'), false);
  assert.deepEqual(fs.readFileSync(path.join(f.root, DATA)), before);
  assert.equal(fs.existsSync(path.join(f.root, 'game_qa_large_card_catalog')), false);
});

test('portable tool is self-contained with only runtime data and explicit rules version', t => {
  const f = fixture(t);
  expectStatus(f.run(), 0);
  const result = run(SCRIPT, 'check', ['--root', f.root]);
  expectStatus(result, 0);
  assert.equal(JSON.parse(result.stdout).computed, CATALOG_FINGERPRINT);
});

test('all mechanical field classes and recipe roles change identity and fail stale check', t => {
  const f = fixture(t);
  const edits = {
    version: c => { c.version = '166-card-draft-4'; },
    cap: c => { c.caps.flow -= 1; },
    cost: c => { c.cards[0].cost += 1; },
    kind: c => { c.cards[0].kind = c.cards[0].kind === 'train' ? 'prepare' : 'train'; },
    modality: c => { c.cards[0].modalities = ['speech']; },
    tags: c => { c.cards[0].archetypeTags.push('finish'); },
    historyTags: c => { c.cards[0].historyTags.push('finish'); },
    effect: c => { c.cards.find(x => x.id === 'ptc_elevenlabs_acting_tags').effects[0].amount += 1; },
    condition: c => { c.cards.find(x => x.id === 'ptc_elevenlabs_acting_tags').effects[1].condition.all[0].value = 'calibration'; },
    unlock: c => { c.cards[0].unlock.all.push({ type: 'completedTech', id: 'rlhf' }); },
    fallback: c => { c.fallback.base += 1; },
    policy: c => { c.policy.executionRateRange[0] = .96; },
    recipe: (_c, r) => { r.recipes[0].roles[0].tags = ['finish']; },
    recipeIdentity: (_c, r) => { r.recipes[0].id += '_changed'; },
  };
  for (const [label, edit] of Object.entries(edits)) {
    const c = clone(POST_CARD_CATALOG), r = clone(POST_CARD_RECIPES);
    edit(c, r); f.save(c, r);
    const result = f.run(); expectStatus(result, 1);
    assert.notEqual(JSON.parse(result.stdout).computed, CATALOG_FINGERPRINT, label);
  }
});

test('independent artwork, credits and player-facing wording do not change mechanical identity', t => {
  const f = fixture(t), c = clone(POST_CARD_CATALOG), r = clone(POST_CARD_RECIPES);
  c.cards[0].art.source_url = 'https://example.invalid/new-art-credit';
  c.cards[0].art.originalCredit = 'Test-only credit';
  c.cards[0].art.brief = 'Test-only art brief';
  c.cards[0].name = '展示名修订';
  c.cards[0].rulesText = '仅展示文字测试';
  c.cards[0].mechanicalIntent = '仅设计文字测试';
  c.cards[0].unlockEvidence.note = '仅来源说明测试';
  r.recipes[0].name = '配方显示名修订';
  f.save(c, r);
  // The separate art registry must not even be parsed by this tool.
  f.put('src/career/data/post_card_art.js', 'deliberately not JavaScript: independently managed art');
  expectStatus(f.run(), 0);
});

test('formatting, key order and comments are not mechanical changes', t => {
  const f = fixture(t);
  const c = Object.fromEntries(Object.entries(POST_CARD_CATALOG).reverse());
  f.put(DATA, `/* archive comment */\nexport const CATALOG_FINGERPRINT = ${JSON.stringify(CATALOG_FINGERPRINT)};\n` +
    `export const POST_CARD_CATALOG = ${JSON.stringify(c, null, 2)}; // data\n` +
    `export const POST_CARD_RECIPES = ${JSON.stringify(POST_CARD_RECIPES, null, 2)};\n`);
  expectStatus(f.run(), 0);
});

test('wrong embedded fingerprint fails without modifying runtime data', t => {
  const f = fixture(t); f.save(POST_CARD_CATALOG, POST_CARD_RECIPES, '0'.repeat(64));
  const before = fs.readFileSync(path.join(f.root, DATA));
  expectStatus(f.run(), 1);
  expectStatus(f.run('generate'), 0);
  assert.deepEqual(fs.readFileSync(path.join(f.root, DATA)), before);
});

test('legacy draft2 is explicitly rejected in every mode, not migrated or relabelled', t => {
  const f = fixture(t), c = clone(POST_CARD_CATALOG); c.version = '166-card-draft-2';
  f.save(c, POST_CARD_RECIPES, '095955c92dfce152f415d078e7d6fc75da9214f0d5d4d2b30485832f7e2395da');
  const before = fs.readFileSync(path.join(f.root, DATA));
  for (const mode of ['check', 'generate', 'canonical']) {
    const result = f.run(mode); expectStatus(result, 2);
    assert.match(result.stderr, /Legacy draft2/); assert.equal(result.stdout, '');
  }
  assert.deepEqual(fs.readFileSync(path.join(f.root, DATA)), before);
});

test('unknown catalogue or DSL schema requires deliberate review, not silent projection', t => {
  const f = fixture(t), c = clone(POST_CARD_CATALOG); c.version = 'unreviewed';
  f.save(c); expectStatus(f.run(), 2);
  c.version = POST_CARD_CATALOG.version; c.schema = 'unknown';
  f.save(c); expectStatus(f.run(), 2);
  f.save(); f.put(RULES, "export const CATALOG_RULES = 'bounded-dsl-v2';\n");
  expectStatus(f.run(), 2);
});

test('unclassified card fields and newly meaningful comboPartners fail closed', t => {
  const f = fixture(t), c = clone(POST_CARD_CATALOG);
  c.cards[0].futureAbilityMultiplier = 2;
  f.save(c); expectStatus(f.run(), 2);
  delete c.cards[0].futureAbilityMultiplier; c.cards[0].comboPartners = ['basic'];
  f.save(c); expectStatus(f.run(), 2);
});

test('duplicate JSON keys and duplicate exports are rejected', t => {
  const f = fixture(t), text = serialize(POST_CARD_CATALOG, POST_CARD_RECIPES);
  f.put(DATA, text.replace('"schema":', '"schema":"shadow","schema":'));
  expectStatus(f.run(), 2);
  f.put(DATA, text + `export const CATALOG_FINGERPRINT = ${JSON.stringify(CATALOG_FINGERPRINT)};\n`);
  expectStatus(f.run(), 2);
});

test('data module expressions and trailing executable JS are never evaluated', t => {
  const f = fixture(t), text = serialize(POST_CARD_CATALOG, POST_CARD_RECIPES);
  f.put(DATA, text.replace('export const POST_CARD_CATALOG = ', 'export const POST_CARD_CATALOG = (() => '));
  expectStatus(f.run(), 2);
  f.put(DATA, text + '\nthrow new Error("must not execute");\n');
  const result = f.run(); expectStatus(result, 2);
  assert.match(result.stderr, /JSON-literal/);
});

test('missing runtime files and malformed embedded identities fail clearly', t => {
  const f = fixture(t); f.save(POST_CARD_CATALOG, POST_CARD_RECIPES, 'bad-hash');
  expectStatus(f.run(), 2);
  f.save(); fs.unlinkSync(path.join(f.root, RULES));
  expectStatus(f.run(), 2);
});


test('integer-valued floats normalize, but array order remains bound to identity', t => {
  const f = fixture(t), text = serialize(POST_CARD_CATALOG, POST_CARD_RECIPES);
  assert.ok(text.includes('"base":1'));
  f.put(DATA, text.replace('"base":1', '"base":1.0'));
  expectStatus(f.run(), 0);
  const c = clone(POST_CARD_CATALOG); c.cards.reverse();
  f.save(c); expectStatus(f.run(), 1);
});
