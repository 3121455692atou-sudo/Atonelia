// 世界名字账本（规格 M.5.4）：送评时登记、撤回时释放、发布时转成正式名字；系列词、近似名和商标异议；发布当天的打榜分数。
// 名字查重同时看 normName、relId 和原样名字三样（normName 去括号，relId 不去，所以 Beta(1) 和 Beta1 会撞）。
// 真实发布表里的型号名永远保留；已发布的名字说清是谁的，正在送评的名字只说“被预订了”，不泄露别家在练什么。
import { FAMILIES, relId, setReleases } from '../data/rivals.js';
import { RELEASE_DAYS_OVERRIDES } from '../data/release_days_overrides.js';
import { BENCHMARKS, lastRefresh } from '../data/benchmarks.js';
import { BRAND_BLACKLIST } from '../data/selfplay.js';
import { TRADEMARK } from '../data/exchange.js';
import { scoreFromX, contamination } from '../sim/model.js';
import { ORG_BRANDS } from '../sim/naming.js';
import { hash01 } from '../sim/util.js';
import { addDays, daysBetween } from '../sim/clock.js';
import { applyEffects } from '../sim/effects.js';
import { registerKind } from '../sim/queue.js';
import { log } from '../sim/log.js';
import { P } from '../sim/provider.js';

const CJK = /[\u3400-\u9fff]/;
const SEP = /[\s\-_·.]+/;
const words = n => String(n).trim().split(SEP).filter(Boolean).map(w => w.toLowerCase());
export const normName = n => String(n ?? '').normalize('NFKC').toLowerCase().replace(/（.*?）|\(.*?\)/g, '').replace(/[\s\-_·.]/g, '');
const companyName = (world, org) => world.companies[org]?.name || FAMILIES[org]?.company || org;
const monthRevenue = s => (s?.history || []).at(-1)?.revenue || 0;
const BLACK = new Set(BRAND_BLACKLIST.map(x => String(x).toLowerCase()));

function ensure(world) {
  world.names ??= {};
  world.series ??= {};
  world.brandWords ??= [];
}

// ---------- 品牌词开头 ----------
// 和 sim/naming.js 的 brandHit 同一个判法：首词等于品牌词，或者首词去掉末尾数字等于品牌词。
function brandHit(w, n, b) {
  if (b.cjk) return n.startsWith(b.norm);
  if (w.length < b.words.length) return false;
  for (let i = 0; i < b.words.length - 1; i++) if (w[i] !== b.words[i]) return false;
  const last = w[b.words.length - 1], want = b.words[b.words.length - 1];
  return last === want || last.replace(/\d+$/, '') === want;
}
// 真实公司的品牌词（GPT、Claude……）在自洽世界里也是“别家”的品牌。
const REAL_BRANDS = Object.entries(ORG_BRANDS).flatMap(([org, list]) => list.map(text => ({ org, text, cjk: CJK.test(text), norm: normName(text), words: words(text) })));
function brandOwnerOf(world, org, name) {
  const n = normName(name), w = words(name);
  return P().brandOwner(w, n, org, REAL_BRANDS, brandHit);
}

// ---------- 编辑距离与近似名 ----------
function distance(a, b) {
  const A = [...a], B = [...b];
  let prev = Array.from({ length: B.length + 1 }, (_, i) => i);
  for (let i = 1; i <= A.length; i++) {
    const cur = [i];
    for (let j = 1; j <= B.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[B.length];
}
// 前缀相同（首字相同）而且编辑距离不超过 2；已经以品牌词开头的不算近似，那种直接拒。
function similarTo(world, org, name) {
  const n = normName(name);
  let best = null;
  for (const b of world.brandWords || []) {
    if (!b || b.org === org) continue;
    const w = normName(b.text);
    if (!w || !n || n[0] !== w[0]) continue;
    if (n.startsWith(w) || w.startsWith(n)) continue;
    const d = distance(n, w);
    if (d > TRADEMARK.dist) continue;
    if (!best || d < best.distance) best = { owner: b.org, word: b.text, distance: d };
  }
  return best;
}

// ---------- 查重 ----------
// 已发布、送评中、真实型号名三样都查。返回中文原因，没问题返回 null。
export function nameTakenMessage(world, org, name, modelId = null) {
  ensure(world);
  const n = normName(name), rid = relId(name), raw = String(name ?? '').trim();
  for (const [key, e] of Object.entries(world.names)) {
    if (!e) continue;
    const en = e.name ? normName(e.name) : key;
    const er = e.relId || (e.name ? relId(e.name) : null);
    if (en !== n && er !== rid && (e.name || '') !== raw) continue;
    // 只跳过“同一家公司、同一个模型”的重复登记。分岔局里不同公司的模型 id 可能碰巧一样
    // （都从 m1_… 起），不能因为 modelId 相同就把别家占着的名字当成自己的。
    if (modelId && e.modelId === modelId && e.org === org) continue;
    if (e.evalId) return '这个名字已经被别家预订了';
    const who = companyName(world, e.org);
    const used = e.name || world.relMeta?.[e.relId]?.name || name;
    return `「${used}」已经被 ${who} 公司的 ${used} 用了`;
  }
  // 冻结的真实发布表：永远保留。world.names 里已有的（比如同一个候选再登记一次）不按真实名处理。
  const real = P().reservedNames?.() || new Map();
  if (!world.names[n] && real.has(n)) return `「${real.get(n)}」是现实里的型号名，换一个吧`;
  return null;
}

// 送评时登记（M.5.4）。同一个候选再登记一次是空操作。skipSimilar 只给“被异议后改名”用。
export function claimName(world, org, name, { evalId = null, modelId = null, day = world.day, skipSimilar = false } = {}) {
  ensure(world);
  const n = normName(name);
  if (!n) return '名字里要有字母或汉字';
  const taken = nameTakenMessage(world, org, name, modelId);
  if (taken) return taken;
  const b = brandOwnerOf(world, org, name);
  if (b) return `「${b.text}」是别家的品牌词，不能放在名字开头`;
  const e = world.names[n] || {};
  const next = { ...e, org, name: String(name).trim(), relId: relId(name), modelId: modelId ?? e.modelId ?? null };
  if (evalId) next.evalId = evalId;
  if (!skipSimilar && !e.similar) {
    const sim = similarTo(world, org, name);
    if (sim) next.similar = { ...sim, day, until: addDays(day, TRADEMARK.days), filed: false };
  }
  world.names[n] = next;
  return null;
}

// 撤回送评时释放；只释放这个候选占的那一条。
export function releaseName(world, name, evalId = null) {
  ensure(world);
  const n = normName(name);
  const e = world.names[n];
  if (!e || !e.evalId) return false;
  if (evalId && e.evalId !== evalId) return false;
  delete world.names[n];
  return true;
}

// 发布时把预订转成正式名字（appendRelease 也会写一条，这里补上原样名字与系列词）。
export function noteRelease(world, org, name) {
  ensure(world);
  const n = normName(name);
  const prev = world.names[n] || {};
  world.names[n] = {
    org, name: String(name).trim(), relId: relId(name), released: true,
    ...(prev.modelId ? { modelId: prev.modelId } : {}),
    ...(prev.similar ? { similar: prev.similar } : {}),
    ...(prev.objected ? { objected: prev.objected } : {}),
  };
  // 学界是一组发布者，不是公司，不登记系列词。
  if (org !== 'academia') registerSeries(world, org, name);
  return world.names[n];
}

// ---------- 系列词 ----------
// 每家最多登记 2 个，第一次用某个词发布时登记；至少 3 个字母或 2 个汉字，不在黑名单里。
function seriesWordOf(name) {
  const core = String(name ?? '').replace(/（.*?）|\(.*?\)/g, '').trim();
  const first = core.split(SEP).filter(Boolean)[0] || '';
  const word = first.replace(/\d+$/, '').trim();
  if (!word) return null;
  if (/^[A-Za-z]+$/.test(word)) return word.length >= 3 && !BLACK.has(word.toLowerCase()) ? word : null;
  if (CJK.test(word) && !/[A-Za-z0-9]/.test(word)) return [...word].length >= 2 && !BLACK.has(word) ? word : null;
  return null;
}
export function registerSeries(world, org, name) {
  ensure(world);
  const word = seriesWordOf(name);
  if (!word) return null;
  const list = (world.series[org] ??= []);
  const key = word.toLowerCase();
  if (list.some(x => x.toLowerCase() === key)) return word;
  if (list.length >= 2) return null;
  list.push(word);
  if (!world.brandWords.some(b => b.org === org && normName(b.text) === normName(word))) {
    world.brandWords.push({ org, text: word, series: true });
  }
  return word;
}
export const seriesWords = (world, org) => [...(world.series?.[org] || [])];

// ---------- 商标异议 ----------
// 近似名可以起；品牌词的所有者 30 天内可以提一次异议。同一个名字只能被异议一次。
// 电脑公司遇到异议时按现金流做确定性选择：交得起两个月和解金就付，否则改名。
export function objectionTick(world, day = world.day) {
  ensure(world);
  const out = [];
  for (const [n, e] of Object.entries(world.names)) {
    const sim = e?.similar;
    if (!sim || sim.filed) continue;
    if (daysBetween(sim.day, day) > TRADEMARK.days) { sim.filed = true; continue; }
    const owner = world.companies[sim.owner];
    const c = world.companies[e.org];
    if (!owner || !c || c.s.status !== 'playing') { sim.filed = true; continue; }
    sim.filed = true;
    e.objected = true;
    const settle = Math.max(0, Math.round(monthRevenue(c.s) * TRADEMARK.settle));
    const params = {
      org: e.org, name: e.name || n, owner: sim.owner, ownerName: owner.name,
      settle, modelId: e.modelId || null, evalId: e.evalId || null, relId: e.relId || null,
    };
    if (c.kind === 'bot') {
      const choice = settle > 0 && c.s.cash >= settle * 2 ? 'settle' : 'rename';
      applyTrademark(world, c.s, params, choice);
    } else {
      c.s.queue.push({ kind: 'trademark', id: 'trademark', params });
    }
    out.push({ org: e.org, name: params.name, owner: sim.owner, choice: c.kind === 'bot' ? (settle > 0 && c.s.cash >= settle * 2 ? 'settle' : 'rename') : 'ask' });
  }
  return out;
}

// 改名候选：在原名后面加序号，避开已用名（近似名检查跳过，免得新名字又被同一家异议）。
function freeName(world, org, oldName) {
  const base = String(oldName).replace(/\s+\d+$/, '').trim() || 'Model';
  for (let k = 2; k < 100; k++) {
    const cand = `${base} ${k}`.slice(0, 32);
    if (!nameTakenMessage(world, org, cand, null)) return cand;
  }
  return `${base} ${world.day.replace(/-/g, '')}`.slice(0, 32);
}

function renameLedger(world, params) {
  const oldName = params.name;
  const newName = freeName(world, params.org, oldName);
  const oldNorm = normName(oldName), newNorm = normName(newName);
  delete world.names[oldNorm];
  world.names[newNorm] = {
    org: params.org, name: newName, relId: relId(newName),
    ...(params.modelId ? { modelId: params.modelId } : {}),
    ...(params.evalId ? { evalId: params.evalId } : {}),
    objected: true,
  };
  const s = world.companies[params.org]?.s;
  if (params.evalId) {
    const ev = (s?.evals || []).find(x => x.id === params.evalId);
    if (ev?.plan) ev.plan.name = newName;
  }
  if (params.modelId && s) {
    const m = (s.models || []).find(x => x.id === params.modelId);
    if (m && m.stage === 'released') m.name = newName;
  }
  if (params.relId && world.relMeta[params.relId]) {
    const meta = world.relMeta[params.relId];
    const newId = relId(newName);
    meta.name = newName;
    meta.relId = newId;
    delete world.relMeta[params.relId];
    world.relMeta[newId] = meta;
    if (world.relIds[params.relId]) { world.relIds[newId] = world.relIds[params.relId]; delete world.relIds[params.relId]; }
    const row = (world.rels || []).find(x => x?.[2] === oldName);
    if (row) row[2] = newName;
    RELEASE_DAYS_OVERRIDES[newName] = { day: meta.day };
    setReleases(world.rels);
  }
  return newName;
}

function applyTrademark(world, s, params, choiceId) {
  if (choiceId === 'settle') {
    const amt = Math.max(0, params.settle || 0);
    if (amt > 0) applyEffects(s, { cash: -amt }, { source: 'world', id: 'trademark' });
    // 和解金付给品牌词的所有者，收盘入账六成（M.5.9）。
    if (amt > 0) P().transfer(s, params.owner, amt, 'trademark');
    log(s, `商标异议和解：「${params.name}」付了 ${Math.round(amt / 1e4).toLocaleString('zh-CN')} 万美元`);
    s.news.unshift({ date: s.date, day: s.day, type: 'trademark', title: '商标异议和解', detail: `${params.ownerName}认为「${params.name}」和他们的名字太像，双方谈成了和解。` });
    return { choice: 'settle', amount: amt };
  }
  const newName = renameLedger(world, params);
  log(s, `商标异议：把「${params.name}」改成「${newName}」`);
  s.news.unshift({ date: s.date, day: s.day, type: 'trademark', title: '改了个名字', detail: `${params.ownerName}认为「${params.name}」和他们的名字太像，你们换成了「${newName}」。` });
  return { choice: 'rename', name: newName };
}

registerKind('trademark', {
  view(s, q) {
    const p = q.params || {};
    const settle = p.settle || 0;
    const choices = [
      { id: 'settle', label: `付和解金 ${Math.round(settle / 1e4).toLocaleString('zh-CN')} 万美元`, hint: '按你们月收入的 10% 算，名字照用。' },
      { id: 'rename', label: '改个名字', hint: '把这一款的名字换掉，不用付钱，但已经发出去的排名和新闻还带着旧名字。' },
    ];
    return {
      kind: 'trademark', tag: '商标异议', title: '商标异议',
      text: `${p.ownerName || '别家'}认为「${p.name || '这一款'}」和他们的品牌太像，发来了商标异议。二选一：付和解金，或者改名。`,
      lines: [], choices,
    };
  },
  resolve(s, q, choiceId) {
    const world = P().world;
    const r = applyTrademark(world, s, q.params || {}, choiceId);
    return r.choice === 'settle' ? '和解金付了，名字照用。' : `改成了「${r.name}」。`;
  },
});

// ---------- 打榜（M.5.4） ----------
// 发布那天给这一款的每个已上线基准打一次分，写进发布行。分数只由发布行的能力和 (relId, 基准) 的散列决定，
// 所以所有公司看到同一个数；刷榜增益只加在这个发布行上，SOTA 只看 qOf，刷榜对标签没用。
const noiseScale = b => (b.s ? Math.max(0.35, Math.min(1, b.s / 5)) : 1);
const benchX = (b, dims) => {
  let x = 0;
  for (const [k, w] of Object.entries(b.w || {})) x += w * (dims?.[k] || 0);
  return x;
};
export function scoreRelease(world, meta, model = null) {
  if (!meta) return meta;
  meta.bench ??= {};
  meta.contam ??= {};
  for (const b of BENCHMARKS) {
    if (b.mod !== world.mod || b.from > meta.date) continue;
    const noise = (hash01(`${meta.relId}|${b.id}`) - 0.5) * 3 * noiseScale(b);
    const boost = model?.boost?.[b.id] && model.boost[b.id].since >= lastRefresh(b, meta.date) ? model.boost[b.id].pts : 0;
    meta.bench[b.id] = scoreFromX(b, benchX(b, meta.dims) + noise + boost);
    meta.contam[b.id] = Math.round(contamination(b, { family: meta.org, date: meta.date }, meta.date) * 100) / 100;
  }
  return meta.bench;
}
