// M0 世界接缝：史实 Provider 的每个口子都和直接读原数据一致；E5 门槛逐日相同；sim/ 的检索验收。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { COMPANIES, SCENARIOS, TECHS, addMonths } from '../../src/career/data/core.js';
import { RELEASES, relId, FAMILIES } from '../../src/career/data/rivals.js';
import { WORLD_EVENTS, MARKET, API_PRICE, TICKERS, interp } from '../../src/career/data/world.js';
import { TECH_SRC } from '../../src/career/data/techsrc.js';
import { quotaFor, RENT_QUOTA } from '../../src/career/data/supply.js';
import { GOAL_TEMPLATES, SCENARIO_GOALS } from '../../src/career/data/goals.js';
import { SOTA } from '../../src/career/data/balance.js';
import { qOf } from '../../src/career/sim/sota.js';
import { addDays } from '../../src/career/sim/clock.js';
import { P, setProvider, HistoryProvider, GATE_KEYS } from '../../src/career/sim/provider.js';
import { createGame, tickDay, currentEvent, resolveEvent } from '../../src/career/engine.js';
import { resolveAll } from '../helpers/career_bot.mjs';

const orgOf = s => s.company?.org ?? FAMILIES[s.charId]?.org ?? null;
const famOrg = f => FAMILIES[f]?.org ?? f;

// ---- 直接读原数据（测试里的参照实现） ----
const directHistOther = (s, { day = s.day, mod = s.mod } = {}) => {
  let best = null;
  for (const r of RELEASES) if (r.mod === mod && r.day <= day && famOrg(r.family) !== orgOf(s)) best = Math.max(best ?? -Infinity, qOf(r.mod, r.dims));
  return best;
};
const directOwnHist = (s, { day = s.day, mod = s.mod } = {}) => {
  const until = addDays(day, SOTA.HIST_LOOKAHEAD);
  let best = null;
  for (const r of RELEASES) if (r.mod === mod && r.day <= until && famOrg(r.family) === orgOf(s)) best = Math.max(best ?? -Infinity, qOf(r.mod, r.dims));
  return best;
};
const directTempAnchor = (s, { day = s.day, mod = s.mod } = {}) => {
  let best = null, first = null;
  for (const r of RELEASES) if (r.mod === mod) {
    if (r.day <= day) best = Math.max(best ?? -Infinity, qOf(r.mod, r.dims));
    if (!first || r.day < first.day) first = r;
  }
  return best ?? (first ? qOf(first.mod, first.dims) : 0);
};
// Independent rule oracle: explicit fictional-world exceptions, not the implementation/table under test.
const LEADER_REF = [
  ['deepseek', 'y2025', '2025-01', 'llm', ['fp8', 'mtp']],
  ['claude', 'y2025', '2025-01', 'llm', ['mcp']],
  ['mistral', 'y2024', '2024-01', 'llm', ['moe']],
];
const directStartTechs = s => {
  const base = TECHS.filter(t => t.mod === s.mod && !t.internalPractice && (t.start || t.from <= addMonths(s.start, -3))).map(t => t.id);
  const extra = LEADER_REF.find(([id, sc, start, mod]) => s.charId === id && s.scenario === sc && s.start === start && s.mod === mod)?.[4] || [];
  return [...new Set([...base, ...extra])];
};
const directLegacy = (s, m) => !m?.releasedDay && RELEASES.some(r => r.name === m?.name && r.date <= s.start);
const directPrice = (id, date) => {
  const t = TICKERS.find(x => x.id === id);
  if (!t || (t.listed && date < t.listed)) return 0;
  let base;
  if (t.monthly) {
    base = t.monthly[date];
    if (base === undefined) { const ks = Object.keys(t.monthly).sort(); base = t.monthly[date > ks.at(-1) ? ks.at(-1) : ks[0]]; }
  } else base = interp(t.anchors, date);
  let h = 2166136261;
  for (const ch of `${id}${date}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  const noise = ((h >>> 0) % 100000) / 100000;
  return Math.round(base * (1 + 0.03 * (noise - 0.5)) * 100) / 100;
};
// E5 表的史实判断（和原代码里的字面日期一一对应）。
const GATE_REF = {
  cnFiling: s => s.date >= '2023-08',
  ipoWindow: s => s.date >= '2024-01',
  ipoAdvice: s => s.date >= '2024-06',
  botIpo: s => s.date >= '2025-01',
  agentW: s => s.date >= '2024-06',
  agentW2: s => s.date >= '2025-06',
  contentStorm: s => s.date >= '2023-03',
  integrations: s => s.date >= '2025-07',
  distilledBy: s => s.date >= '2023-06',
  booksSuit: s => s.date >= '2023-12',
  booksSuit2: s => s.date >= '2025-09',
  tosSuit: s => s.date >= '2024-06',
  musicSuit: s => s.date >= '2024-06',
  arenaScandal: s => s.date >= '2025-04',
  govContract: s => s.date >= '2024-06',
  licenseFork: s => s.date >= '2023-07',
  booksPrecedent: s => s.date >= '2025-09',
  trillion: s => s.date >= '2024-06',
  bigDense: s => s.date >= '2023-06',
  usageBoard: s => s.date >= '2023-06',
  boardBench: s => s.date >= '2024-07',
  cnGpuSwap: s => s.date >= '2025-01',
};

function checkPorts(s, where) {
  assert.equal(P().mode, 'history', where);
  assert.equal(P().labelMode, 'replay', where);
  assert.equal(P().techSelf, false, where);
  assert.equal(P().followerClamp, true, where);
  assert.equal(P().scheduleRivals, true, where);
  assert.equal(P().standIns, true, where);
  assert.equal(P().queueBlocks, true, where);
  assert.equal(P().version(), 0, where);
  assert.equal(P().defendOk(), true, where);
  assert.equal(P().labelGate(s.mod, s.day), -Infinity, where);
  assert.equal(P().anchorSkip(s, null), false, where);
  assert.equal(P().birthMode(s, null), 'clamp', where);
  assert.equal(P().isNpc('academia'), false, where);
  assert.equal(P().tierOf(s), s.company.tier, where);
  assert.equal(P().marketDate(s), s.date, where);
  assert.equal(P().ipoOpen(s), s.date >= '2024-01', where);
  assert.throws(() => P().appendRelease({}), where);
  assert.throws(() => P().registerCompany({}), where);

  for (const r of RELEASES.slice(0, 8)) assert.equal(P().relById(r.id), r, where);
  assert.equal(P().relById('__nope__'), null, where);
  for (const id of Object.keys(TECH_SRC)) assert.deepEqual(P().techSources(id), TECH_SRC[id], where);
  assert.equal(P().techSources('__nope__'), undefined, where);
  assert.deepEqual(P().worldEvents(s.date), WORLD_EVENTS.filter(w => w.date === s.date), where);
  assert.deepEqual(P().worldEvents(null), [...WORLD_EVENTS], where);
  for (const w of WORLD_EVENTS.slice(0, 5)) assert.equal(P().worldEvent(w.id), w, where);
  assert.equal(P().worldEvent('__nope__'), null, where);
  for (const product of ['chat', 'api', 'coding_plan', 'subscription']) for (const region of ['global', 'CN']) {
    if (!MARKET[product]?.[region]) continue;
    assert.equal(P().market(product, region, s), interp(MARKET[product][region], s.date), where);
  }
  assert.equal(P().apiPrice('global', s), interp(API_PRICE.global, s.date), where);
  assert.equal(P().apiPrice('CN', s), interp(API_PRICE.CN, s.date), where);
  assert.equal(P().tickers(), TICKERS, where);
  assert.equal(P().price('NVDA', s.date), directPrice('NVDA', s.date), where);
  assert.equal(P().gpuQuota(s, 'H100'), quotaFor(s.company.tier, 'H100', s.date), where);
  assert.equal(P().rentQuota(s), RENT_QUOTA[s.company.tier] || 256, where);
  assert.equal(P().realQ(RELEASES[0].name), qOf(RELEASES[0].mod, RELEASES[0].dims), where);
  assert.equal(P().realQ('__nope__'), null, where);
  assert.equal(P().benchOf(RELEASES[0], 'arena'), null, where);
  assert.deepEqual(P().startTechs(s), directStartTechs(s), where);
  assert.equal(P().goals(s), SCENARIO_GOALS[s.scenario]?.[s.mod] || GOAL_TEMPLATES[s.mod], where);
  assert.equal(P().histOther(s), directHistOther(s), where);
  assert.equal(P().ownHist(s), directOwnHist(s), where);
  assert.equal(P().tempAnchor(s), directTempAnchor(s), where);
  for (const m of s.models || []) assert.equal(P().isLegacy(s, m), directLegacy(s, m), where);
  for (const key of GATE_KEYS) assert.equal(P().gate(key, s), GATE_REF[key](s), `${where} gate ${key}`);
}

describe('M0 世界接缝', () => {
  it('24 家公司 × 4 个剧本推进 120 天：HistoryProvider 每个口子都和直接读原数据一致', () => {
    const provider = setProvider(new HistoryProvider());
    try {
      for (const c of COMPANIES) for (const sc of SCENARIOS) {
        const s = createGame(c.id, sc.id, 11);
        for (let d = 0; d < 120; d++) {
          resolveAll(s);
          if (s.status !== 'playing') break;
          for (const key of GATE_KEYS) assert.equal(P().gate(key, s), GATE_REF[key](s), `${c.id}/${sc.id}/${s.day} gate ${key}`);
          if (d % 15 === 0) checkPorts(s, `${c.id}/${sc.id}/${s.day}`);
          tickDay(s);
        }
        assert.equal(s.day, addDays(`${sc.start}-01`, 120), `${c.id}/${sc.id} 应推进 120 天`);
        checkPorts(s, `${c.id}/${sc.id}/最终`);
      }
    } finally { setProvider(provider); }
  });

  it('E5 门槛表：每个 key 逐日等于原来的字面日期判断', () => {
    for (const s of [createGame('deepseek', 'y2023', 1), createGame('gpt', 'y2024', 2), createGame('qwen', 'y2025', 3)])
      for (let d = 0; d < 120; d++) {
        for (const key of GATE_KEYS) assert.equal(P().gate(key, s), GATE_REF[key](s), `${s.charId}/${s.scenario}/${s.day} ${key}`);
        tickDay(s);
        resolveAll(s);
      }
  });

  it('按名字找发布改成 relById(relId(名字))：史实下与原 find 结果相同', () => {
    for (const r of RELEASES) {
      assert.equal(P().relById(relId(r.name)), RELEASES.find(x => x.name === r.name));
      assert.equal(relId(r.name), r.id);
    }
  });

  it('sim/ 检索验收：不直接读世界表、不按名字找发布、字面日期只在白名单行', () => {
    const root = new URL('../../src/career/sim/', import.meta.url).pathname;
    const files = [];
    const walk = dir => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (name.endsWith('.js') && !p.includes('/migrations/') && !p.endsWith('/provider.js')) files.push(p);
      }
    };
    walk(root);
    const strip = text => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    const banned = [/\bTECH_SRC\b/, /\bWORLD_EVENTS\b/, /\bTICKERS\b/, /\bMARKET\b/, /\bAPI_PRICE\b/, /\bTECH_POOL\b/, /\bQUOTA\b/];
    const nameFind = /RELEASES\s*\.\s*find\([\s\S]{0,240}?\bname\s*===/;
    const dateLit = /['"](?:19|20)\d{2}-\d{2}['"]/g;
    const dateWhitelist = new Set([`${root}research.js`, `${root}sota.js`]);
    for (const file of files) {
      const code = strip(readFileSync(file, 'utf8'));
      for (const re of banned) assert.doesNotMatch(code, re, `${file} 直接读了世界表：${re}`);
      assert.doesNotMatch(code, nameFind, `${file} 还在按名字找发布`);
      if (!dateWhitelist.has(file)) assert.deepEqual(code.match(dateLit) || [], [], `${file} 还有字面日期`);
    }
    for (const file of [`${root}research.js`, `${root}sota.js`]) {
      const dates = strip(readFileSync(file, 'utf8')).match(dateLit) || [];
      assert.ok(dates.length <= 1, `${file} 只应有 E5 白名单里的那一个字面日期`);
    }
    assert.ok(!files.some(f => f.endsWith('/engine.js')));
    assert.ok(files.length > 30);
  });
});
