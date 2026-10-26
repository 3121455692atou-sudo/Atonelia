// 里程碑与弹窗预算（规格 F2 P1.4、E2、E4、E5、E8）：
// 没有玩家干预时每个“行业第一次”归现实里做到的那家；QwQ-32B-Preview 只拿到“第一个开源推理模型”；同一个钩子最多一张卡片（fire、supersedes）；
// 开局首月不触发超事件；super_sota 按 SOTA 标签判定；开局就是 ★ 的公司不弹 ms_first_sota；读旧档以后 60 天不补弹 ms_first_sota；
// 超事件选项只有 applyEffects 效果或白名单 action，不凭空加估值、加技术积累；读旧档丢掉 superEarned。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as E from '../../src/career/engine.js';
import { COMPANIES, SCENARIOS } from '../../src/career/data/core.js';
import { FAMILIES, RELEASES } from '../../src/career/data/rivals.js';
import { TECH_SRC } from '../../src/career/data/techsrc.js';
import { MILESTONES, MS_BY_ID, msMods } from '../../src/career/data/milestones.js';
import { MS_TEXT } from '../../src/career/data/milestones_gen.js';
import { SUPER_EVENTS, SUPER_BY_ID } from '../../src/career/data/super.js';
import { POPUP_PER_HOOK } from '../../src/career/data/balance.js';
import { rivalMatch, playerMatch, playerCond, initMilestones, milestoneCandidates } from '../../src/career/sim/milestones.js';
import { realOf } from '../../src/career/sim/milestone_view.js';
import { fire, prioOf, registerKind, closePopupDay } from '../../src/career/sim/queue.js';
import { releaseScheduled } from '../../src/career/sim/loop.js';
import { checkSuperEvents } from '../../src/career/sim/super.js';
import { realQ, sotaMade } from '../../src/career/sim/sota.js';
import { validateCond } from '../../src/career/sim/cond.js';
import { validateChoice } from '../../src/career/sim/effects.js';
import { addDays, dayInMonth } from '../../src/career/sim/clock.js';
import { setStance } from '../../src/career/sim/route.js';
import { resolveAll, advance, advanceMonth, playGame } from '../helpers/career_bot.mjs';
import { clone, loadSave, pendingEvents } from '../helpers/career_util.mjs';
import * as L from '../helpers/legacy_jobs.mjs';

const MODS = ['llm', 'image', 'music', 'speech'];
const orgOfFam = fam => FAMILIES[fam]?.org ?? null;
// 现实里做到的那家（org）：现实对照（real，没有时取史实）里的家族；史实没写家族的是微软 Phi（教科书级合成数据）。
const realOrg = ms => orgOfFam(realOf(ms)?.realFam ?? 'phi');
// 不扮演任何公司的“全行业观察者”。
const observer = (mod, day) => ({ charId: '__observer__', mod, date: day.slice(0, 7), day, company: { company: '观察者', country: 'US', open: false }, models: [], published: {} });
const byDay = mod => RELEASES.filter(r => r.mod === mod).sort((a, b) => a.day.localeCompare(b.day) || E.qOf(mod, b.dims) - E.qOf(mod, a.dims));
// 没有玩家时，这个“行业第一次”第一个做到的发布（或公开技术的家族）。
function firstHolder(ms) {
  if (ms.rival) {
    const r = byDay(ms.mod).find(x => rivalMatch(observer(ms.mod, x.day), ms, x));
    return r ? { fam: r.family, name: r.name, day: r.day } : null;
  }
  const src = (TECH_SRC[ms.rivalTech] || []).find(([, , lv]) => lv !== 'proof');
  return src ? { fam: src[1], day: dayInMonth(src[0], `${ms.rivalTech}|${src[1]}`) } : null;
}
// 不发布、不蒸馏，一路往前走（董事会目标清空、现金加满，免得半路被撤换或破产）；里程碑卡一律“先不跟”。
const skipAll = ev => ev.choices.find(c => c.id === 'skip' || c.id === 'ok' || c.id === 'hold' || c.id === 'quiet') || null;
function idle(charId, scenario, until) {
  const s = E.createGame(charId, scenario, 1);
  s.goals = [];
  while (s.status === 'playing' && s.day < until) {
    s.cash = Math.max(s.cash, 1e12);
    resolveAll(s, skipAll);
    E.tickDay(s);
  }
  resolveAll(s, skipAll);
  return s;
}
const firstsOf = mod => MILESTONES.filter(m => m.type === 'first' && msMods(m).includes(mod));
const cardsOf = s => pendingEvents(s).filter(q => ['milestone', 'super', 'exclusive', 'strategy'].includes(q.kind));

describe('里程碑数据（规格 E2、E5）', () => {
  it('player 写成 { on, ...cond }，交给 cond 的部分都在词表里；没有日期门槛、没有名字正则、没有绝对的综合分', () => {
    for (const ms of MILESTONES) {
      assert.ok(ms.player, ms.id);
      for (const on of [].concat(ms.player.on)) assert.ok(['release', 'tech', 'paper', 'month', 'rival', 'reopen'].includes(on), `${ms.id} 的钩子 ${on}`);
      validateCond(playerCond(ms));
      assert.ok(!('since' in ms.player) && !('minQ' in ms.player) && !('names' in (ms.rival || {})) && !('since' in (ms.rival || {})) && !('minQ' in (ms.rival || {})), ms.id);
      for (const k of Object.keys(ms.rival || {})) assert.ok(['open', 'cls', 'tag', 'anyTag', 'reasoning', 'atLeast', 'gap', 'rank', 'dims', 'closeToTop'].includes(k), `${ms.id} 的对手条件 ${k}`);
      if (ms.rival?.atLeast) assert.ok(realQ(ms.rival.atLeast.name) !== null, ms.id);
    }
    // E5：ms_export_resume 删除；不再有按名字认推理模型的正则。
    assert.ok(!MS_BY_ID.ms_export_resume);
    assert.ok(!fs.readFileSync(new URL('../../src/career/data/milestones.js', import.meta.url), 'utf8').includes('REASONING_NAME'));
  });
  it('门槛按规格改成相对的：ms_gpt4 看 GPT-4 −0.5，可商用看 Llama 2 70B，小而强看 Mistral 7B，追近前沿看 Llama 3.1 405B；百万上下文、万亿开源看 C、T 标签', () => {
    assert.deepEqual(MS_BY_ID.ms_gpt4.rival.atLeast, { name: 'GPT-4', d: 0.5 });
    assert.deepEqual(MS_BY_ID.ms_gpt4.player.model.atLeast, { name: 'GPT-4', d: 0.5 });
    assert.equal(MS_BY_ID.ms_open_commercial.rival.atLeast.name, 'Llama 2 70B');
    assert.equal(MS_BY_ID.ms_small_strong.rival.atLeast.name, 'Mistral 7B');
    assert.equal(realQ('Mistral 7B') - MS_BY_ID.ms_small_strong.rival.atLeast.d, 38.88);
    assert.equal(MS_BY_ID.ms_open_frontier.rival.atLeast.name, 'Llama 3.1 405B');
    assert.equal(MS_BY_ID.ms_million_ctx.rival.tag, 'C');
    assert.equal(MS_BY_ID.ms_trillion_open.rival.tag, 'T');
    assert.deepEqual(MS_BY_ID.ms_open_reasoning_frontier.rival, { open: true, reasoning: true, gap: 4 });
    assert.deepEqual(MS_BY_ID.ms_first_sota.player, { on: ['release', 'month', 'rival'], sotaMade: 'first' });
    assert.deepEqual(msMods(MS_BY_ID.ms_first_sota), MODS);
  });
  it('新增的两条有文案，不写死公司和年份；ms_first_sota 是自家的事，不放现实对照', () => {
    for (const id of ['ms_open_reasoning_frontier', 'ms_first_sota']) {
      const t = MS_TEXT[id];
      assert.ok(t?.mine?.scene?.length >= 3, id);
      assert.ok(!/DeepSeek|OpenAI|Anthropic|谷歌|月之暗面|智谱|20[12]\d 年/.test(JSON.stringify(t)), id);
    }
    assert.ok(MS_TEXT.ms_open_reasoning_frontier.rival);
    assert.deepEqual(Object.keys(MS_TEXT.ms_first_sota.mine.choices), ['ok']);
    assert.equal(realOf(MS_BY_ID.ms_first_sota), null);
    assert.equal(realOf(MS_BY_ID.ms_open_reasoning).realFam, 'qwen');
    assert.equal(realOf(MS_BY_ID.ms_open_reasoning_frontier).realFam, 'deepseek_pro');
  });
});

describe('没有玩家干预时，每个“行业第一次”归现实里做到的那家', () => {
  it('全行业观察者：按发布日逐条过，第一个做到的 org 就是现实持有者', () => {
    const got = {};
    for (const ms of MILESTONES.filter(m => m.type === 'first')) {
      const h = firstHolder(ms);
      assert.ok(h, `${ms.id} 没人做到`);
      got[ms.id] = h.name || h.fam;
      assert.equal(orgOfFam(h.fam), realOrg(ms), `${ms.id} 归了 ${h.fam}（${h.name || ''}）`);
    }
    assert.equal(got.ms_gpt4, 'GPT-4');
    assert.equal(got.ms_open_research, 'LLaMA 65B');
    assert.equal(got.ms_open_commercial, 'Llama 2 70B');
    assert.equal(got.ms_small_strong, 'Mistral 7B');
    assert.equal(got.ms_moe_open, 'Mixtral 8x7B');
    assert.equal(got.ms_million_ctx, 'Gemini 1.5 Pro');
    assert.equal(got.ms_open_frontier, 'Llama 3.1 405B');
    assert.equal(got.ms_reasoning, 'o1-preview');
    assert.equal(got.ms_computer, 'Claude 3.5 Sonnet（新版）');
    assert.equal(got.ms_open_reasoning, 'QwQ-32B-Preview');
    assert.equal(got.ms_open_reasoning_frontier, 'DeepSeek-R1');
    assert.equal(got.ms_trillion_open, 'Kimi K2');
    assert.equal(got.ms_text_image, 'GPT-4o 图像生成');
    assert.equal(got.ms_full_song, 'Suno v3');
  });
  it('QwQ-32B-Preview 只拿到“第一个开源推理模型”；离世界最强差 11 分以上，追不上前沿', () => {
    const qwq = MILESTONES.filter(m => m.type === 'first' && firstHolder(m)?.name === 'QwQ-32B-Preview').map(m => m.id);
    assert.deepEqual(qwq, ['ms_open_reasoning']);
    const r = RELEASES.find(x => x.name === 'QwQ-32B-Preview');
    assert.equal(rivalMatch(observer('llm', r.day), MS_BY_ID.ms_open_reasoning_frontier, r), false);
    assert.ok(E.worldSota(observer('llm', r.day)).q - E.qOf('llm', r.dims) > 11);
  });
  it('开局账本（24 家 × 4 个剧本）：开局前已经发生的，记在现实做到的那家名下；本公司自己做到的记成 me', () => {
    for (const c of COMPANIES) for (const sc of SCENARIOS) {
      const s = E.createGame(c.id, sc.id, 1);
      const start = `${s.start}-01`;
      for (const ms of firstsOf(s.mod)) {
        const e = s.ms[ms.id];
        const h = firstHolder(ms);
        const own = realOrg(ms) === s.company.org;
        // 现实里在开局之前就做到了的，开局账本一定有。
        if (h && h.day < start) assert.ok(e, `${c.id} ${sc.id} ${ms.id} 开局前就该有人做到`);
        if (!e) continue;
        assert.ok(e.silent, `${c.id} ${sc.id} ${ms.id}`);
        if (own) {
          // 现实里就是自己：开局前做到的记成 me；开局前还没做到的，归下一家（玩家不干预时）。
          if (h && h.day < start) assert.equal(e.who, 'me', `${c.id} ${sc.id} ${ms.id}`);
          continue;
        }
        assert.notEqual(e.who, 'me', `${c.id} ${sc.id} ${ms.id}`);
        assert.equal(orgOfFam(e.who), realOrg(ms), `${c.id} ${sc.id} ${ms.id} 记在 ${e.who}（${e.model || ''}）`);
      }
    }
    const llama = E.createGame('llama', 'y2025', 1);
    assert.deepEqual([llama.ms.ms_open_frontier.who, llama.ms.ms_open_frontier.model], ['me', 'Llama 3.1 405B']);
    const ds = E.createGame('deepseek', 'y2026', 1);
    assert.deepEqual([ds.ms.ms_open_reasoning_frontier.who, ds.ms.ms_open_reasoning_frontier.model], ['me', 'DeepSeek-R1']);
    // P1.1 留下的：GPT-4 级的“行业第一次”重新归 GPT（玩千问 2025 开局，记在 GPT-4 名下）。
    const qwen = E.createGame('qwen', 'y2025', 1);
    assert.deepEqual([qwen.ms.ms_gpt4.who, qwen.ms.ms_gpt4.model, qwen.ms.ms_gpt4.silent], ['gpt', 'GPT-4', true]);
    const kimi = E.createGame('kimi', 'y2026', 1);
    assert.equal(kimi.ms.ms_open_reasoning.model, 'QwQ-32B-Preview');
    assert.equal(kimi.ms.ms_open_reasoning_frontier.model, 'DeepSeek-R1');
    assert.equal(kimi.ms.ms_gpt4.model, 'GPT-4');
    assert.ok(Object.entries(kimi.ms).every(([id, e]) => e.model !== 'QwQ-32B-Preview' || id === 'ms_open_reasoning'));
  });
  it('局内：RWKV 2023 开局一直不发布，走到 2025-08，语言模型的“行业第一次”全部按现实归属；Midjourney 2023 的“会写字的生图模型”归 OpenAI', () => {
    const s = idle('rwkv', 'y2023', '2025-08-01');
    assert.equal(s.status, 'playing');
    for (const ms of firstsOf('llm')) {
      const e = s.ms[ms.id];
      assert.ok(e && e.who !== 'me', `${ms.id}：${JSON.stringify(e)}`);
      assert.equal(orgOfFam(e.who), realOrg(ms), `${ms.id} 归了 ${e.who}（${e.model || e.note || ''}）`);
    }
    assert.ok(Object.entries(s.ms).every(([id, e]) => e.model !== 'QwQ-32B-Preview' || id === 'ms_open_reasoning'));
    const mj = idle('midjourney', 'y2023', '2025-04-01');
    assert.equal(mj.ms.ms_text_image?.who, 'image2');
  });
});

describe('弹窗预算：同一个钩子最多一张卡片（fire、supersedes，规格 E4）', () => {
  // GPT 2023 开局把在练的 GPT-4 开源发布：好几个“行业第一次”和自家里程碑同时成立。
  function bigRelease() {
    const s = E.createGame('gpt', 'y2023', 4);
    resolveAll(s);
    s.queue = [];
    const w = E.workingModel(s);
    w.postDays = (w.postDays || 0) + 40;
    // 旗舰开不开源由开源路线定（P1.3）：GPT 开局闭源，这里把路线设成完全开源，这一版旗舰才会开放权重。
    setStance(s, 'open', { src: 'start' });
    L.decide(s, 'release', { open: true });
    return s;
  }
  it('同时做到好几件：只弹一张（行业第一次优先，同级先弹现实里更晚的），其余行业第一次照记、只发快讯，自家里程碑撤回等下次', () => {
    assert.equal(POPUP_PER_HOOK, 1);
    const s = bigRelease();
    const cards = s.queue.filter(q => q.kind === 'milestone');
    assert.equal(cards.length, 1);
    const mine = MILESTONES.filter(m => m.type === 'first' && s.ms[m.id]?.who === 'me' && s.ms[m.id].day === s.day);
    assert.ok(mine.length >= 2, mine.map(m => m.id).join(','));
    assert.ok(mine.some(m => m.id === 'ms_open_commercial') && mine.some(m => m.id === 'ms_open_research'));
    const latest = mine.slice().sort((a, b) => realOf(b).date.localeCompare(realOf(a).date))[0];
    assert.equal(cards[0].id, latest.id, '同级先弹现实里更晚的那件');
    for (const m of mine.filter(x => x.id !== latest.id)) {
      assert.ok(s.ms[m.id].silent, m.id);
      assert.ok(s.news.some(n => n.title === `行业第一次：${m.title}`), m.id);
    }
    // 自家里程碑（第一次开源权重）这一次没弹，也没记，下次满足条件时再说。
    assert.equal(s.ms.ms_staged_open, undefined);
    assert.equal(s.popup.day, s.day);
    assert.equal(s.popup.cards.length, 1);
    // 同一天别的钩子再来一张不那么要紧的：不弹（当天的名额用完了）。
    const before = s.queue.length;
    fire(s, { on: 'month', milestones: false, cards: [{ kind: 'super', id: 'super_billion', params: {} }] });
    assert.equal(s.queue.length, before);
    assert.ok(s.scheduled.some(x => x.item?.id === 'super_billion' && x.at === addDays(s.day, 3)), '带选项的顺延 3 天');
  });
  it('优先级：专属事件 > 行业第一次 > 公司策略 > 自家里程碑 > 超事件；更要紧的卡把当天还没处理的那张挤下来', () => {
    assert.ok(prioOf({ kind: 'exclusive' }) < prioOf({ kind: 'milestone', id: 'ms_gpt4' }));
    assert.ok(prioOf({ kind: 'milestone', id: 'ms_gpt4' }) < prioOf({ kind: 'strategy' }));
    assert.ok(prioOf({ kind: 'strategy' }) < prioOf({ kind: 'milestone', id: 'ms_staged_open' }));
    assert.ok(prioOf({ kind: 'milestone', id: 'ms_staged_open' }) < prioOf({ kind: 'super' }));
    const s = E.createGame('qwen', 'y2025', 2);
    resolveAll(s);
    s.queue = [];
    s.popup = null;
    fire(s, { on: 'month', milestones: false, cards: [{ kind: 'super', id: 'super_router', params: {} }] });
    assert.deepEqual(s.queue.map(q => q.id), ['super_router']);
    // 同一天一张专属事件（P2.2 用）来了：超事件被挤下来顺延，专属事件入队。
    fire(s, { on: 'release', milestones: false, cards: [{ kind: 'exclusive', id: 'ex_test' }] });
    assert.deepEqual(s.queue.map(q => q.id), ['ex_test']);
    assert.ok(s.scheduled.some(x => x.item?.id === 'super_router'));
    assert.equal(s.popup.cards.length, 1);
  });
  it('supersedes：吞并同一时刻的里程碑弹窗，账本照记、只发一条快讯；吞并排着的经营事件', () => {
    const s = bigRelease();
    const id = s.queue.find(q => q.kind === 'milestone').id;
    s.scheduled.push({ at: addDays(s.day, 5), item: { kind: 'event', id: 'price_war' } });
    const shown = fire(s, { on: 'release', milestones: false, cards: [{ kind: 'exclusive', id: 'ex_test', supersedes: { milestone: [id], event: ['price_war'] } }] });
    assert.deepEqual(shown.map(c => c.id), ['ex_test']);
    assert.ok(!s.queue.some(q => q.kind === 'milestone'));
    assert.ok(!s.scheduled.some(x => x.item?.id === 'price_war'));
    assert.equal(s.ms[id].who, 'me');
    assert.ok(s.ms[id].silent);
    assert.ok(s.news.some(n => n.title === `行业第一次：${MS_BY_ID[id].title}`));
    // 入队的卡片不带 supersedes（只给 fire 看）；plain、news 留着，以后落选时要用。
    assert.deepEqual(Object.keys(s.queue.at(-1)).sort(), ['id', 'kind']);
  });
  it('没有选项的卡片落选时只发新闻；正在结算的那张不会被挤掉', () => {
    const s = E.createGame('qwen', 'y2025', 2);
    resolveAll(s);
    s.queue = [];
    s.popup = null;
    fire(s, { on: 'month', milestones: false, cards: [{ kind: 'super', id: 'super_router', params: {} }] });
    fire(s, { on: 'month', milestones: false, cards: [{ kind: 'super', id: 'super_billion', plain: true, news: { title: '测试新闻', detail: '' } }] });
    assert.ok(s.news.some(n => n.title === '测试新闻'));
    assert.ok(!s.scheduled.some(x => x.item?.id === 'super_billion'));
    // 结算眼前这张时又触发了更要紧的卡（P2.2 的专属事件之类）：眼前这张已经弹出来了，不会被挤掉；结算完拿掉的就是它，新卡顺延。
    registerKind('test_resolve_fire', {
      view: () => ({ kind: 'test_resolve_fire', title: '测试', text: '', lines: [], choices: [{ id: 'a', label: '好', hint: '' }] }),
      resolve: st => { fire(st, { on: 'strategy', milestones: false, cards: [{ kind: 'exclusive', id: 'ex_test' }] }); return ''; },
    });
    s.queue = [{ kind: 'test_resolve_fire', id: 'x' }];
    s.scheduled = [];
    s.popup = { day: s.day, cards: [{ kind: 'test_resolve_fire', id: 'x', v: null, p: prioOf({ kind: 'test_resolve_fire' }) }] };
    E.resolveEvent(s, 'a');
    assert.ok(s.scheduled.some(x => x.item?.id === 'ex_test'));
    assert.equal(s.queue.length, 0);
  });
  it('机器人整局：任何一天由 fire 入队的卡片都不超过一张', () => {
    for (const [c, sc] of [['deepseek', 'y2024'], ['gpt', 'y2023'], ['qwen', 'y2025'], ['suno', 'y2024'], ['kimi', 'y2026']]) {
      let worst = 0;
      const check = s => { if (s.popup?.cards) worst = Math.max(worst, s.popup.cards.length); };
      playGame(c, sc, 1, { onWeek: check, onMonth: check });
      assert.ok(worst <= 1, `${c} ${sc}`);
    }
  });
  // 下面几条是 G1 遗留 #24、#27：名额按卡片弹出来（处理）的那天算，排期放出来的卡也算。
  const fresh = () => { const s = E.createGame('qwen', 'y2025', 2); resolveAll(s); s.queue = []; s.scheduled = []; s.popup = null; return s; };
  const card = id => ({ kind: 'super', id, params: {} });
  const resolveTop = s => E.resolveEvent(s, E.currentEvent(s).choices.find(c => !c.disabled).id);
  it('队列里还没处理的卡也占当天的名额：昨天推进途中入队、今天才弹的那张没记在今天，新来的不更要紧就顺延', () => {
    const s = fresh();
    // 昨天推进途中入队的超事件：记在昨天，今天才弹。
    s.queue = [card('super_router')];
    s.popup = { day: addDays(s.day, -1), cards: [{ kind: 'super', id: 'super_router', v: null, p: 4 }] };
    fire(s, { on: 'rival', milestones: false, cards: [card('super_billion')] });
    assert.deepEqual(s.queue.map(q => q.id), ['super_router']);
    assert.ok(s.scheduled.some(x => x.item?.id === 'super_billion' && x.at === addDays(s.day, 3)));
    // 处理掉以后，今天的名额仍然用掉了：今天处理过的也算。
    resolveTop(s);
    assert.equal(s.queue.length, 0);
    fire(s, { on: 'release', milestones: false, cards: [card('super_soldout')] });
    assert.equal(s.queue.length, 0);
    assert.ok(s.scheduled.some(x => x.item?.id === 'super_soldout'));
    // 第二天推进开始（closePopupDay）以后才有新名额。
    closePopupDay(s);
    fire(s, { on: 'tech', milestones: false, cards: [card('super_tenx')] });
    assert.deepEqual(s.queue.map(q => q.id), ['super_tenx']);
    // 更要紧的照样能把还没处理的那张挤下来。
    fire(s, { on: 'strategy', milestones: false, cards: [{ kind: 'exclusive', id: 'ex_test' }] });
    assert.deepEqual(s.queue.map(q => q.id), ['ex_test']);
    assert.ok(s.scheduled.some(x => x.item?.id === 'super_tenx'));
  });
  it('排期放出来的卡（月结散出去的、顺延的）走同一套名额：当天已经有一张就再顺延，没有选项的进新闻，经营事件照常入队', () => {
    const s = fresh();
    // 当天已经有一张最要紧的（专属事件），排期里的都挤不动它。
    s.queue = [{ kind: 'exclusive', id: 'ex_test' }];
    s.scheduled = [
      { at: s.day, item: card('super_billion') },
      { at: s.day, item: { kind: 'strategy', id: 'node_x', plain: true, news: { title: '策略完成：测试节点', detail: '' } } },
      { at: s.day, item: { kind: 'event', id: 'media_interview' } },
    ];
    releaseScheduled(s);
    assert.deepEqual(s.queue.map(q => q.id), ['ex_test', 'media_interview']);
    assert.ok(s.scheduled.some(x => x.item?.id === 'super_billion' && x.at === addDays(s.day, 3)));
    assert.ok(!s.scheduled.some(x => x.item?.id === 'node_x'));
    assert.ok(s.news.some(n => n.title === '策略完成：测试节点'));
    // 名额空着的时候照常入队，并记进当天的名额。
    const s2 = fresh();
    s2.scheduled = [{ at: s2.day, item: card('super_billion') }];
    releaseScheduled(s2);
    assert.deepEqual(s2.queue.map(q => q.id), ['super_billion']);
    assert.equal(s2.popup.cards.length, 1);
  });
  it('没有选项的卡片被更要紧的卡挤下来：进新闻，不顺延（plain、news 留在入队的卡片上）', () => {
    const s = fresh();
    fire(s, { on: 'strategy', milestones: false, cards: [{ kind: 'strategy', id: 'node_x', plain: true, news: { title: '策略完成：测试节点', detail: '说明' } }] });
    assert.deepEqual(s.queue.map(q => [q.id, q.plain, q.news?.title]), [['node_x', true, '策略完成：测试节点']]);
    fire(s, { on: 'strategy', milestones: false, cards: [{ kind: 'exclusive', id: 'ex_test' }] });
    assert.deepEqual(s.queue.map(q => q.id), ['ex_test']);
    assert.ok(!s.scheduled.some(x => x.item?.id === 'node_x'), '没有选项的不顺延');
    assert.ok(s.news.some(n => n.title === '策略完成：测试节点' && n.type === 'strategy'));
  });
  it('机器人整局按处理那天数：同一天处理的 fire 类卡片不超过一张（G1 校准里出过两张的几局）', () => {
    for (const [c, sc, seed] of [['claude', 'y2023', 31676], ['deepseek', 'y2026', 7919], ['gemini', 'y2026', 15838]]) {
      let S = null;
      const per = {};
      playGame(c, sc, seed, {
        onWeek: s => { S = s; },
        pick: () => { const q = S?.queue[0]; if (q && ['milestone', 'super', 'exclusive', 'strategy'].includes(q.kind)) per[S.day] = (per[S.day] || 0) + 1; return null; },
      });
      const bad = Object.entries(per).filter(([, n]) => n > 1);
      assert.ok(Object.keys(per).length > 0, `${c} ${sc} 一张卡都没弹`);
      assert.deepEqual(bad, [], `${c} ${sc} ${seed}`);
    }
  });
});

describe('ms_first_sota：开局以后第一次炼出 SOTA（规格 E4、D10）', () => {
  it('开局就是 ★ 的公司从不弹（机器人整局）', () => {
    let n = 0;
    for (const c of COMPANIES) for (const sc of SCENARIOS) {
      const s0 = E.createGame(c.id, sc.id, 1);
      if (s0.sota.seed !== '★') continue;
      n += 1;
      let popped = false;
      const { s } = playGame(c.id, sc.id, 1, { pick: ev => { if (ev.id === 'ms_first_sota') popped = true; return null; } });
      assert.ok(!popped && !s.ms.ms_first_sota, `${c.id} ${sc.id}`);
    }
    assert.equal(n, 3 + 5 + 8 + 9);
  });
  it('没炼出过的公司发布一款拿到算数标签的模型：弹一次（被更要紧的卡挤掉就下个月结补弹），{model} 是那一款，技术积累 +20', () => {
    const s = E.createGame('qwen', 'y2025', 3);
    resolveAll(s);
    assert.equal(s.sota.seed, '—');
    advanceMonth(s);
    s.queue = [];
    const w = E.workingModel(s);
    for (const k of Object.keys(w.dims)) w.dims[k] = 99;
    w.postDays = (w.postDays || 0) + 40;
    const r = L.decide(s, 'release', { open: false });
    assert.ok(sotaMade(s) && s.sota.made.length === 1);
    let seen = null;
    const know0 = s.know;
    const pick = ev => { if (ev.id === 'ms_first_sota') { seen = ev; return ev.choices.find(c => c.id === 'ok'); } return null; };
    advance(s, 40, pick);
    assert.ok(seen, '应当弹出');
    assert.ok(seen.title.length > 0 && !/\{model\}|\{field\}/.test(`${seen.title}${seen.text}`));
    assert.ok(`${seen.title}${seen.text}${seen.scene?.map(l => l.text).join('')}`.includes(r.model.name) || s.ms.ms_first_sota.model === r.model.name);
    assert.equal(s.ms.ms_first_sota.who, 'me');
    assert.equal(s.ms.ms_first_sota.modelId, r.model.id);
    assert.ok(s.know >= know0 + 20 - 1e-9);
    let again = 0;
    advance(s, 60, ev => { if (ev.id === 'ms_first_sota') again += 1; return null; });
    assert.equal(again, 0, '只弹一次');
  });
  it('缺少里程碑版本时拒绝，不按过去日期静默补账', () => {
    const s = E.createGame('qwen', 'y2025', 3); delete s.msVer; const before = JSON.stringify(s);
    assert.throws(() => milestoneCandidates(s, { on: 'tech' }), /不支持|旧版/);
    assert.equal(JSON.stringify(s), before); assert.equal(E.migrateGame(s).ok, false);
  });
});

describe('里程碑旧存档明确不支持', () => {
  it('历史 v3 夹具明确拒绝，原始 JSON 不改写', () => {
    const dir = new URL('../fixtures/saves/', import.meta.url);
    for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json') && !x.startsWith('.'))) {
      const raw = JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8')), before = JSON.stringify(raw);
      const r = E.migrateGame(raw); assert.equal(r.ok, false, f); assert.match(r.reason, /不支持|版本|旧存档/);
      assert.equal(JSON.stringify(raw), before, f);
    }
  });
});

describe('超事件（规格 E4、E5、F6）', () => {
  it('清理：删掉推理先行者、开源之王，东方登顶并进新王登基（中国公司的文案变体）', () => {
    for (const id of ['super_reasoning_pioneer', 'super_open_crown', 'super_cn_first']) assert.ok(!SUPER_BY_ID[id], id);
    assert.ok(SUPER_BY_ID.super_sota.cn?.title === '东方登顶');
    const s = E.createGame('deepseek', 'y2025', 71);
    s.queue = [{ kind: 'super', id: 'super_sota', v: 'cn', params: {} }];
    assert.equal(E.currentEvent(s).title, '东方登顶');
    s.queue = [{ kind: 'super', id: 'super_sota', params: {} }];
    assert.equal(E.currentEvent(s).title, '新王登基');
  });
  it('选项只有 applyEffects 效果或白名单 action，不凭空加估值、加技术积累；每个超事件都有一个不花钱的选项；提示由 describeEffects 生成', () => {
    for (const e of SUPER_EVENTS) {
      const sets = [e.choices, ...(e.cn?.choices ? [e.cn.choices] : [])];
      for (const choices of sets) {
        for (const c of choices) {
          validateChoice(c, { source: 'super' });
          for (const k of ['valuation', 'rp', 'know']) assert.ok(!(k in (c.effects || {})), `${e.id}.${c.id} 有 ${k}`);
        }
        assert.ok(choices.some(c => !c.action && !((c.effects?.cash ?? 0) < 0) && !((c.effects?.cashOfStart ?? 0) < 0)), `${e.id} 缺不花钱的选项`);
      }
      if (e.cn) assert.deepEqual(e.cn.choices.map(c => c.id), e.choices.map(c => c.id), `${e.id} 的变体选项 id 要和原版一致`);
    }
    const s = E.createGame('qwen', 'y2025', 2);
    s.queue = [{ kind: 'super', id: 'super_small_giant', params: {} }];
    const v = E.currentEvent(s);
    assert.match(v.choices.find(c => c.id === 'focus').hint, /士气/);
    assert.match(v.choices.find(c => c.id === 'raise').hint, /融资/);
  });
  it('开局首月不触发超事件（24 家 × 4 个剧本；规格审计里的 gpt y2023、deepseek y2025、kimi y2026 都在内）', () => {
    for (const c of COMPANIES) for (const sc of SCENARIOS) {
      const s = E.createGame(c.id, sc.id, 1);
      resolveAll(s);
      const start = s.date;
      advanceMonth(s);
      assert.notEqual(s.date, start);
      assert.ok(!cardsOf(s).some(q => q.kind === 'super'), `${c.id} ${sc.id}`);
      assert.equal(s.flags.superLast, undefined, `${c.id} ${sc.id}`);
    }
  });
  it('新王登基按 SOTA 标签判定：开局后发布的旗舰持有算数标签满 30 天、领先世界最强 1.0 以上、至少 3 家对手；开局继承的型号、领先不够、刚拿到的都不算', () => {
    const s = E.createGame('qwen', 'y2025', 3);
    resolveAll(s);
    advanceMonth(s);
    s.queue = [];
    for (const e of SUPER_EVENTS) if (e.id !== 'super_sota') s.marks[`super:${e.id}`] = s.day;
    const w = E.workingModel(s);
    for (const k of Object.keys(w.dims)) w.dims[k] = 99;
    w.postDays = (w.postDays || 0) + 40;
    L.decide(s, 'release', { open: false });
    assert.equal(s.sota.holder.by, 'me');
    const hit = st => { const t = clone(st); t.queue = []; t.scheduled = []; checkSuperEvents(t, {}); return pendingEvents(t).find(q => q.id === 'super_sota') || null; };
    assert.equal(hit(s), null, '刚拿到标签，还没满 30 天');
    const later = clone(s);
    later.day = addDays(s.day, 31);
    later.date = later.day.slice(0, 7);
    const item = hit(later);
    assert.ok(item);
    assert.equal(item.v, 'cn', '中国公司用“东方登顶”');
    // 领先不到 1.0：不算。
    const close = clone(later);
    const m = close.models.find(x => x.id === close.sota.holder.id);
    const ws = E.worldSota(close);
    for (const k of Object.keys(m.dims)) m.dims[k] = 0;
    m.dims.knowledge = (ws.q + 0.5) / 0.22;
    assert.equal(hit(close), null);
    // 持标的是开局继承的型号：不算。
    const inh = clone(later);
    inh.models.find(x => x.id === inh.sota.holder.id).hist = true;
    assert.equal(hit(inh), null);
    // 规则本身：满 30 天、领先 1.0、至少 3 家对手，缺一不可。
    const when = SUPER_BY_ID.super_sota.when;
    assert.ok(when(s, { sota: { days: 30, lead: 1, rivals: 3 } }));
    assert.ok(!when(s, { sota: { days: 29, lead: 5, rivals: 9 } }));
    assert.ok(!when(s, { sota: { days: 90, lead: 0.9, rivals: 9 } }));
    assert.ok(!when(s, { sota: { days: 90, lead: 5, rivals: 2 } }));
    assert.ok(!when(s, { sota: null }));
  });
});
