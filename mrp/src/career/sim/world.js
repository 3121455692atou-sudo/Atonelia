// 行业大事落到这一局，以及榜单换题。
// 行业大事不弹窗，只进新闻（有短剧的新闻在新闻页点开看）。by、target、mod、rel、ms 各自的规矩写在 data/world.js 文首。
import { REFRESH_NOTES } from '../data/benchmarks.js';
import { FAMILIES } from '../data/rivals.js';
import { SCENES } from '../data/history.js';
import { rand } from './util.js';
import { liveModel, playerScore } from './model.js';
import { MS_BY_ID } from '../data/milestones.js';
import { orgOf } from './sota.js';
import { applyEffects, isWorldFlag } from './effects.js';
import { worldScene } from './queue.js';
import { openStance } from './route.js';
import { P, relId } from './provider.js';

// 榜单换题：之前的成绩作废，针对旧题训练出来的分数原形毕露。
export function benchRefresh(s, b) {
  const note = typeof REFRESH_NOTES[b.id] === 'string' ? REFRESH_NOTES[b.id] : REFRESH_NOTES[b.id]?.[s.date] || '更新了题目，排名重新计算。';
  s.news.unshift({ date: s.date, type: 'benchmark', title: `${b.name} 换题重排`, detail: note });
  const m = liveModel(s);
  const pub = s.published[b.id];
  if (m && pub && m.boost?.[b.id]?.pts >= 4) {
    const now = playerScore(s, b, { ...m, boost: {} });
    if (rand(s) < 0.65) s.queue.push({ kind: 'event', id: 'benchmax_exposed', params: { bench: b.name, old: pub.score, now } });
  }
}

// ---------- 行业大事 ----------
const fams = v => [].concat(v ?? []);
const famOrg = f => FAMILIES[f]?.org ?? f;
// 玩家的 org 在不在这些家族里：by、target 都按 org 认（Claude 和 Fable 同属 Anthropic，Gemini 和 Gemma 同属 Google）。
const inLine = (s, list) => fams(list).some(f => famOrg(f) === orgOf(s));
// 这件大事对这一局怎么算：'off' 不发生（模态不对，或者这件事就是玩家自己这条线做的）；'target' 发生在玩家公司身上；'on' 照常。
export function worldReach(s, w) {
  if (w.mod && !fams(w.mod).includes(s.mod)) return 'off';
  if (inLine(s, w.by)) return 'off';
  return inLine(s, w.target) ? 'target' : 'on';
}
// ms 联动：这个里程碑记在 by 这条线（同 org）名下，才算这次关联发布认领了它；玩家或别家抢先拿走了就不算。
// 里程碑还没有定义的（P1.4 才新增 ms_open_reasoning_frontier）不设门槛，合入以后自然生效。
function claimed(s, w) {
  if (!MS_BY_ID[w.ms]) return true;
  const c = s.ms?.[w.ms];
  return !!c && c.who !== 'me' && (!w.by || fams(w.by).some(f => famOrg(f) === famOrg(c.who)));
}
// 发布新闻：对手发布那天放出的那一条（loop.js 的 releaseEntry）。
export const releaseNews = (s, r) => s.news.find(n => n.type === 'release' && n.family === r.family && n.day === r.day && n.title.endsWith(` 发布 ${r.name}`));

// 开局（createGame，排在 initMilestones 之后）：开局之前已经发生的行业大事留下的世界标记补进 s.world（规格 E5）。
// 只补标记类键（priceWar 等），hype 这类乘数不补（开局的行业热度另有 hypeIndex）。哪些局补，口径和 applyWorldEvent 让效果生效的条件一样：
// 这件事对这一局不是 'off'（模态对、不是玩家自己这条线做的），region 对得上，带 ms 的要那个里程碑确实记在 by 名下。
// 开局当月的行业大事照常由 startOfMonth 排期，不在这里补。所以 2025、2026 年开局的中国公司开局就有 priceWar，满足其余条件照样会遇到价格战。
export function seedWorldFlags(s) {
  for (const w of P().worldEvents(null)) {
    if (w.date >= s.date) continue;
    const flags = Object.entries(w.effects?.world || {}).filter(([k]) => isWorldFlag(k));
    if (!flags.length || worldReach(s, w) === 'off' || (w.region && w.region !== s.company.country) || (w.ms && !claimed(s, w))) continue;
    applyEffects(s, { world: Object.fromEntries(flags) }, { source: 'world', id: w.id });
  }
}

export function applyWorldEvent(s, w) {
  const reach = worldReach(s, w);
  if (reach === 'off') return;
  // rel：关联的发布还没到，这件事改挂到发布那天（发布排在前面，所以到时候发布新闻已经在了）。
  const r = w.rel ? P().relById(relId(w.rel)) : null;
  if (r && r.day > s.day && s.scheduled.some(x => x.news && x.rel === r.name)) { s.scheduled.push({ at: r.day, world: w.id }); return; }
  // 玩家就是当事人（诉讼、监管）：效果照常生效，新闻按 mine 改写成“{company} 被……”。
  const co = FAMILIES[fams(w.target).find(f => famOrg(f) === orgOf(s))]?.company ?? s.company.company;
  const say = t => t.replaceAll('{company}', co);
  const asTarget = reach === 'target' && w.mine;
  const title = asTarget ? say(w.mine.title) : w.title;
  const detail = asTarget ? say(w.mine.detail) : w.detail;
  const scene = SCENES[w.id] ? worldScene(s, w) : null;
  // 同一件事只发一条：发布新闻已经在了，就把大事的说明、短剧并进去（标题不动）；否则单独发一条。
  const rn = r && r.day <= s.day ? releaseNews(s, r) : null;
  if (rn) {
    rn.detail = `${/[。！？]$/.test(detail) ? detail : `${detail}。`}${rn.detail || ''}`;
    if (w.major) rn.major = true;
    if (scene) rn.scene = scene;
    rn.w = w.id;
  } else s.news.unshift({ date: w.date, day: s.day, type: w.type, title, detail, major: w.major, ...(scene ? { scene } : {}), w: w.id });
  if (w.region && w.region !== s.company.country) return;
  // ms：这次关联发布没有认领那个里程碑，就只发新闻。
  if (w.ms && !claimed(s, w)) return;
  const e = w.effects || {};
  if (e.valMult?.[s.company.country]) s.flags.valMult = (s.flags.valMult || 1) * e.valMult[s.company.country];
  // 风险乘子写进 s.risk、世界状态、品牌夹逼，都走统一的 applyEffects。openBoost 只给旗舰开放权重的路线（受限许可开源、完全开源，规格 B3）。
  const risk = {};
  for (const [k, key] of [['copyrightRisk', 'copyright'], ['musicRisk', 'music'], ['imageRisk', 'image'], ['voiceRisk', 'voice'], ['minorRisk', 'minor'], ['piracyRisk', 'piracy'], ['routingScrutiny', 'routing'], ['abuseRisk', 'abuse'], ['tosRisk', 'tos']])
    if (e[k]) risk[key] = e[k];
  const fx = {};
  if (Object.keys(risk).length) fx.risk = risk;
  if (e.world) fx.world = e.world;
  if (e.openBoost && openStance(s)) fx.brand = e.openBoost;
  if (Object.keys(fx).length) applyEffects(s, fx, { source: 'world', id: w.id });
  if (e.poaching) s.flags.poachingEra = true;
  if (e.gpuBan && s.company.country === 'CN') s.queue.push({ kind: 'event', id: 'export_ban', params: { gpus: e.gpuBan.join('、') } });
}
