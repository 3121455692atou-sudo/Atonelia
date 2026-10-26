// Product save/import boundaries must accept current manual-card sessions, not
// just reject old saves. Use the same constructors and confirmation flow as UI.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { restoreHistory } from '../helpers/world_provider.mjs';
import { setState, getState, setWorld, getWorld } from '../../src/career/ui/state.js';
import { SAVE_KEY, WORLD_META_KEY, readSaved, safeLoadState, preflightSoloPostPlanSave, loadWorld } from '../../src/career/ui/storage.js';
globalThis.document = { baseURI: 'http://localhost/' };
const { startSolo, defaultSolo } = await import('../../src/career/ui/pages/solo_setup.js');
const settings = await import('../../src/career/ui/pages/settings.js');
afterEach(() => { setState(null); setWorld(null); restoreHistory(); delete globalThis.localStorage; });

test('malformed product saves use the same readable JSON error without installing state or touching storage', () => {
  const s = E.createSinglePlayerGame('deepseek', 'y2025', 67), provider = E.P();
  setState(s);
  for (const text of ['garbage<<<', '{', ' ']) {
    const writes = [], mem = new Map([[SAVE_KEY, text]]);
    globalThis.localStorage = { getItem: k => mem.get(k) ?? null, setItem: (...args) => writes.push(args) };
    const direct = preflightSoloPostPlanSave(text), saved = readSaved();
    assert.equal(direct.ok, false); assert.equal(saved.ok, false);
    assert.equal(direct.reason, safeLoadState(text).reason);
    assert.equal(saved.reason, direct.reason); assert.match(saved.reason, /不是有效的 JSON/);
    assert.equal(mem.get(SAVE_KEY), text); assert.deepEqual(writes, []);
    assert.equal(E.P(), provider); assert.equal(getState(), s);
  }
});

test('current solo export → preview → confirm → persisted reload preserves the pending manual session', { timeout: 10000 }, async () => {
  const candidate = startSolo({ ...defaultSolo(false,'post'), mode: 'fork', fork: 'deepseek', forkKeep: 3, year: '2025', years: 1 }, 68);
  candidate.s.queue = [];
  const opened = E.applyCommand(candidate.s, { name: 'postPlan.open', args: { modelId: candidate.s.working, expectedModelToken: null } });
  assert.equal(opened.ok, true, opened.err);
  const ledger = structuredClone(candidate.s.postPlanSessions), text = E.serialize(candidate.world);
  restoreHistory();
  const current = E.createSinglePlayerGame('qwen', 'y2025', 69); current.queue = [];
  setState(current); setWorld(null);
  const provider = E.P(), before = JSON.stringify(current), notices = [];
  const mem = new Map([[SAVE_KEY, before]]);
  let written;
  const persisted = new Promise(resolve => { written = resolve; });
  globalThis.localStorage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => { mem.set(k, String(v)); if (k === WORLD_META_KEY) written(); }, removeItem: k => mem.delete(k) };
  // Post-only resume now presents the saved manual session. Model the real
  // overlay node instead of returning null after assigning non-empty HTML.
  const office={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[]};
  const overlay={isConnected:true,addEventListener(){},removeEventListener(){},querySelector:q=>q==='.office'?office:null,querySelectorAll:()=>[],classList:{contains:()=>true}};
  const overlayRoot = { innerHTML: '', get firstElementChild(){return this.innerHTML?overlay:null;} };
  globalThis.document = { baseURI: 'http://localhost/', createElement: () => ({ classList: { add() {} }, remove() {} }), getElementById: id => id === 'overlay-root' ? overlayRoot : { append: e => notices.push(e.textContent) } };
  const st = {}, ctx = { st, draw() {} };
  await settings.change(current, { dataset: { import: '' }, value: 'file', files: [{ text: async () => text }] }, ctx);
  assert.ok(st.importing?.world, notices.join('|'));
  assert.equal(E.P(), provider); assert.equal(getState(), current); assert.equal(getWorld(), null);
  assert.equal(JSON.stringify(current), before); assert.equal(mem.get(SAVE_KEY), before);
  await settings.click(current, { closest: () => ({ dataset: { op: 'import-confirm' } }) }, ctx);
  await persisted;
  assert.ok(getWorld()); assert.equal(getState().charId, candidate.playerId);
  assert.deepEqual(getState().postPlanSessions, ledger);
  assert.deepEqual(getState(),candidate.s,'import/resume presents the existing hand without running an economic day');
  assert.equal(mem.get(SAVE_KEY), before, '世界导入不能覆盖另一份史实主档');
  const loaded = await loadWorld();
  assert.equal(loaded.ok, true, loaded.reason); assert.equal(loaded.playerId, candidate.playerId);
  assert.deepEqual(loaded.s.postPlanSessions, ledger);
  assert.deepEqual(loaded.s,candidate.s,'persisted re-open is exact, not an extra simulation step');
  assert.equal(loaded.s.postPlanSessions.sessions[opened.result.sessionId].controlMode, 'manual');
  assert.equal(notices.length, 0, notices.join('|'));
});

test('旧版/未知单机与世界导入在预览前拒绝，不覆盖当前状态、Provider 或原档', async () => {
  const candidate = startSolo({ ...defaultSolo(false,'post'), mode: 'fork', fork: 'deepseek', year: '2025', years: 1 }, 70);
  const worldDoc = JSON.parse(E.serialize(candidate.world));
  restoreHistory();
  const current = E.createSinglePlayerGame('qwen', 'y2025', 71); current.queue = [];
  setState(current); setWorld(null);
  const provider = E.P(), before = JSON.stringify(current), notices = [], writes = [];
  const mem = new Map([[SAVE_KEY, before]]);
  globalThis.localStorage = { getItem: k => mem.get(k) ?? null, setItem: (...a) => writes.push(a), removeItem: (...a) => writes.push(a) };
  globalThis.document = { baseURI: 'http://localhost/', createElement: () => ({ classList: { add() {} }, remove() {} }), getElementById: () => ({ append: e => notices.push(e.textContent) }) };
  const st = {}, ctx = { st, draw() {} };
  for (const base of [current, worldDoc]) {
    const currentVersion = base.kind === 'world' ? E.WORLD_SAVE_VERSION : E.SAVE_VERSION;
    for (const v of [undefined, null, currentVersion - 1, currentVersion + 1, String(currentVersion), currentVersion + 0.5]) {
      const obj = { ...structuredClone(base), v }, text = JSON.stringify(obj);
      // Even a stale previous preview must not remain confirmable after selecting an invalid file.
      st.importing = { s: structuredClone(current), ok: true };
      await settings.change(current, { dataset: { import: '' }, value: 'file', files: [{ text: async () => text }] }, ctx);
      assert.equal(st.importing, undefined); assert.match(notices.at(-1), /请新开一局/);
      await settings.click(current, { closest: () => ({ dataset: { op: 'import-confirm' } }) }, ctx);
      assert.equal(E.P(), provider); assert.equal(getState(), current); assert.equal(getWorld(), null);
      assert.equal(JSON.stringify(current), before); assert.equal(mem.get(SAVE_KEY), before); assert.deepEqual(writes, []);
      assert.equal(JSON.stringify(obj), text);
    }
  }
});

test('同版导入确认重新验证数值，损坏候选与联机档均不能覆盖单机状态', async () => {
  const candidate = startSolo({ ...defaultSolo(false,'post'), year: '2025', years: 1 }, 72);
  const worldDoc = JSON.parse(E.serialize(candidate.world));
  restoreHistory();
  const current = E.createSinglePlayerGame('qwen', 'y2025', 73); current.queue = [];
  setState(current); setWorld(null);
  const provider = E.P(), before = JSON.stringify(current), notices = [], writes = [];
  const mem = new Map([[SAVE_KEY, before]]);
  globalThis.localStorage = { getItem: k => mem.get(k) ?? null, setItem: (...a) => writes.push(a), removeItem: (...a) => writes.push(a) };
  globalThis.document = { baseURI: 'http://localhost/', createElement: () => ({ classList: { add() {} }, remove() {} }), getElementById: () => ({ append: e => notices.push(e.textContent) }) };
  const st = {}, ctx = { st, draw() {} };
  await settings.change(current, { dataset: { import: '' }, value: 'file', files: [{ text: async () => before }] }, ctx);
  assert.ok(st.importing?.s);
  st.importing.s.cash = NaN;
  await settings.click(current, { closest: () => ({ dataset: { op: 'import-confirm' } }) }, ctx);
  assert.match(notices.at(-1), /导入失败/);
  candidate.s.cash = NaN;
  st.importing = { world: candidate.world, s: candidate.s, playerId: candidate.playerId };
  await settings.click(current, { closest: () => ({ dataset: { op: 'import-confirm' } }) }, ctx);
  assert.match(notices.at(-1), /导入失败/);
  assert.equal(E.P(), provider, '损坏的同版世界候选不能重置当前 Provider');
  const unbound = structuredClone(worldDoc); delete unbound.world.settings.you;
  await settings.change(current, { dataset: { import: '' }, value: 'file', files: [{ text: async () => JSON.stringify(unbound) }] }, ctx);
  assert.equal(st.importing, undefined); assert.match(notices.at(-1), /缺少玩家公司/);
  worldDoc.settings.mp = worldDoc.world.settings.mp = true;
  await settings.change(current, { dataset: { import: '' }, value: 'file', files: [{ text: async () => JSON.stringify(worldDoc) }] }, ctx);
  assert.equal(st.importing, undefined); assert.match(notices.at(-1), /联机存档不能/);
  assert.equal(E.P(), provider); assert.equal(getState(), current); assert.equal(getWorld(), null);
  assert.equal(JSON.stringify(current), before); assert.equal(mem.get(SAVE_KEY), before); assert.deepEqual(writes, []);
});
