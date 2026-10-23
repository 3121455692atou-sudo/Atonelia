// 行业大事（P1.5，规格 E4、E5）：by 和 target 拆分、按模态过滤、改成新闻并可点开短剧（不再弹窗）、
// rel 同日合并、ms 联动、死键和 decision 删除。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { WORLD_EVENTS } from '../../src/career/data/world.js';
import { FAMILIES, RELEASES } from '../../src/career/data/rivals.js';
import { COMPANIES } from '../../src/career/data/core.js';
import { SCENES } from '../../src/career/data/history.js';
import { MS_BY_ID } from '../../src/career/data/milestones.js';
import { TECH_SRC } from '../../src/career/data/techsrc.js';
import { applyWorldEvent, worldReach } from '../../src/career/sim/world.js';
import { validateEffects } from '../../src/career/sim/effects.js';
import { advance, playGame } from '../helpers/career_bot.mjs';

globalThis.document ??= { baseURI: 'http://localhost/' };
const { render: renderNews } = await import('../../src/career/ui/pages/news.js');

const W = id => WORLD_EVENTS.find(w => w.id === id);
const game = (company, scenario) => E.createGame(company, scenario, 1);
const until = (s, day) => { while (s.status === 'playing' && s.day < day) advance(s, 1); };
const worldNews = s => s.news.filter(n => n.w);
const RELS = WORLD_EVENTS.filter(w => w.rel);
const SCENE_LLM_ONLY = WORLD_EVENTS.filter(w => w.mod === 'llm' && SCENES[w.id]);
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);
// 整局玩下来，记下每件大事落在新闻里的每一条（新闻只留 100 条，所以每周看一遍）。
function playAndCollect(company, scenario, pick) {
  const seen = new Map();
  const events = [];
  const { s } = playGame(company, scenario, 1, {
    pick: ev => { events.push(ev); return pick?.(ev) ?? null; },
    onWeek: s => { for (const n of s.news) if (n.w) { if (!seen.has(n.w)) seen.set(n.w, new Set()); seen.get(n.w).add(n); } },
  });
  for (const n of s.news) if (n.w) { if (!seen.has(n.w)) seen.set(n.w, new Set()); seen.get(n.w).add(n); }
  return { s, seen, events };
}

describe('行业大事：数据', () => {
  const FIELDS = ['date', 'id', 'by', 'target', 'mod', 'rel', 'ms', 'type', 'title', 'detail', 'mine', 'effects', 'region', 'major'];
  const EFFECT_KEYS = ['valMult', 'copyrightRisk', 'musicRisk', 'imageRisk', 'voiceRisk', 'minorRisk', 'piracyRisk', 'routingScrutiny', 'abuseRisk', 'tosRisk', 'openBoost', 'poaching', 'gpuBan', 'world'];

  it('字段只有认得的那些：没有 about 和 decision，效果里没有死键', () => {
    assert.ok(WORLD_EVENTS.length >= 60);
    for (const w of WORLD_EVENTS) {
      for (const k of Object.keys(w)) assert.ok(FIELDS.includes(k), `${w.id} 有不认识的字段 ${k}`);
      for (const k of Object.keys(w.effects || {})) assert.ok(EFFECT_KEYS.includes(k), `${w.id} 的效果里有没人读的键 ${k}`);
      assert.ok(w.title && w.detail && w.type, w.id);
      assert.ok(/^\d{4}-\d{2}$/.test(w.date), w.id);
    }
  });
  it('by、target 指向真实的模型家族；mod、region 的取值合法', () => {
    for (const w of WORLD_EVENTS) {
      for (const f of [].concat(w.by || [], w.target || [])) assert.ok(FAMILIES[f], `${w.id} → ${f}`);
      for (const m of [].concat(w.mod || [])) assert.ok(['llm', 'image', 'music', 'speech'].includes(m), `${w.id} 的 mod ${m}`);
      if (w.region) assert.ok(['CN', 'US', 'EU'].includes(w.region), `${w.id} 的 region ${w.region}`);
    }
  });
  it('target 的事件都写了 mine（标题和正文都带 {company}）；mine 只出现在 target 的事件上', () => {
    const targets = WORLD_EVENTS.filter(w => w.target);
    assert.deepEqual(targets.map(w => w.id).sort(), ['w_ant_pentagon', 'w_bartz', 'w_fable_export', 'w_fl_probe', 'w_nyt', 'w_riaa', 'w_suicide_suits']);
    for (const w of targets) {
      assert.ok(w.mine?.title.includes('{company}') && w.mine.detail.includes('{company}'), w.id);
      assert.ok(!w.by, `${w.id} 不能既是 by 又是 target`);
    }
    for (const w of WORLD_EVENTS.filter(x => !x.target)) assert.equal(w.mine, undefined, w.id);
  });
  it('rel 是同一个月里真实存在的对手发布；有 rel 的事件一定写了 by', () => {
    assert.ok(RELS.length >= 15);
    for (const w of RELS) {
      const r = RELEASES.find(x => x.name === w.rel);
      assert.ok(r, `${w.id} 的 rel「${w.rel}」不在对手表里`);
      assert.equal(r.date, w.date, `${w.id} 和 ${w.rel} 不在同一个月`);
      assert.ok(w.by, `${w.id} 有 rel 但没有 by`);
      assert.ok([].concat(w.by).some(f => FAMILIES[f].org === FAMILIES[r.family].org), `${w.id} 的 by 和 ${w.rel} 不是同一家`);
    }
  });
  it('ms 是真实的里程碑；带 ms 的事件一定有 by 和 rel', () => {
    const withMs = WORLD_EVENTS.filter(w => w.ms);
    assert.deepEqual(withMs.map(w => w.id).sort(), ['w_gpt4', 'w_r1']);
    for (const w of withMs) {
      assert.ok(MS_BY_ID[w.ms], `${w.id} 的 ms ${w.ms} 不存在`);
      assert.ok(w.by && w.rel, w.id);
    }
  });
  it('world 效果能通过效果词表的校验；有短剧的 w_ 开头的 id 都对得上一件大事', () => {
    for (const w of WORLD_EVENTS.filter(x => x.effects?.world)) validateEffects({ world: w.effects.world }, { source: 'world' });
    for (const id of Object.keys(SCENES).filter(k => k.startsWith('w_'))) assert.ok(W(id), `短剧 ${id} 没有对应的行业大事`);
  });
  it('价格战把世界标记 priceWar 立起来（E5 的经营事件读它）；R1 带 hype 0.92 和 ms', () => {
    assert.deepEqual(W('w_pricewar').effects.world, { priceWar: true });
    assert.equal(W('w_pricewar').by, 'deepseek_pro');
    assert.equal(W('w_pricewar').region, 'CN');
    assert.equal(W('w_r1').by, 'deepseek_pro');
    assert.equal(W('w_r1').ms, 'ms_open_reasoning_frontier');
    assert.equal(W('w_r1').effects.world.hype, 0.92);
  });
});

describe('行业大事：谁会收到', () => {
  it('worldReach：模态不对或者这条线就是自己 → off；是当事人 → target；其余 on（逐家公司逐条核对）', () => {
    let off = 0, target = 0, on = 0;
    for (const c of COMPANIES) {
      const s = game(c.id, 'y2024');
      for (const w of WORLD_EVENTS) {
        const modOk = !w.mod || [].concat(w.mod).includes(c.modality);
        const own = [].concat(w.by || []).some(f => FAMILIES[f].org === c.org);
        const hit = [].concat(w.target || []).some(f => FAMILIES[f].org === c.org);
        const want = !modOk || own ? 'off' : hit ? 'target' : 'on';
        assert.equal(worldReach(s, w), want, `${c.id} 看 ${w.id}`);
        if (want === 'off') off++; else if (want === 'target') target++; else on++;
      }
    }
    assert.ok(off > 200 && target >= 10 && on > 1000, `off ${off} target ${target} on ${on}`);
  });
  it('Suno 不收到任何 LLM 的世界事件，也不收到图像和语音专属的；音乐的照收', () => {
    const s = game('suno', 'y2023');
    for (const w of WORLD_EVENTS.filter(x => x.mod)) {
      const modOk = [].concat(w.mod).includes('music');
      assert.equal(worldReach(s, w) === 'off', !modOk, w.id);
    }
    assert.equal(worldReach(s, W('w_riaa')), 'target');
    assert.equal(worldReach(s, W('w_gpt4')), 'off');
    assert.equal(worldReach(s, W('w_robocall')), 'off');
    assert.equal(worldReach(s, W('w_ghibli')), 'off');
    assert.equal(worldReach(s, W('w_nyt')), 'on');
    assert.equal(worldReach(game('elevenlabs', 'y2024'), W('w_robocall')), 'on');
    assert.equal(worldReach(game('midjourney', 'y2024'), W('w_ghibli')), 'on');
  });
  it('by 按 org 认：DeepSeek 玩家没有 w_pricewar、w_r1、w_v3；Claude 和 Fable 同属 Anthropic，互相不播对方的发布', () => {
    for (const id of ['w_pricewar', 'w_r1', 'w_v3', 'w_v4_preview']) {
      assert.equal(worldReach(game('deepseek', 'y2024'), W(id)), 'off', id);
      assert.equal(worldReach(game('qwen', 'y2024'), W(id)), 'on', id);
    }
    assert.equal(worldReach(game('fable', 'y2026'), W('w_claude3')), 'off');
    assert.equal(worldReach(game('claude', 'y2026'), W('w_claude3')), 'off');
    assert.equal(worldReach(game('gpt', 'y2024'), W('w_claude3')), 'on');
    // 画图是 GPT-4o 上线的：image2 和 gpt 同属 openai，GPT 玩家也不播。
    assert.equal(worldReach(game('gpt', 'y2025'), W('w_ghibli')), 'off');
    assert.equal(worldReach(game('image2', 'y2025'), W('w_ghibli')), 'off');
  });
  it('自家做的事不当别家新闻：GPT 玩家收不到“OpenAI 推出函数调用”，Claude、Fable 玩家收不到“亚马逊投资 Anthropic”，别家照收', () => {
    assert.equal(W('w_funccall').by, 'gpt');
    assert.equal(W('w_amazon_anthropic').by, 'claude');
    assert.equal(worldReach(game('gpt', 'y2023'), W('w_funccall')), 'off');
    for (const c of ['claude', 'fable']) assert.equal(worldReach(game(c, 'y2023'), W('w_amazon_anthropic')), 'off', c);
    assert.equal(worldReach(game('gpt', 'y2023'), W('w_amazon_anthropic')), 'on');
    assert.equal(worldReach(game('claude', 'y2023'), W('w_funccall')), 'on');
    // 真的玩到 2023 年 10 月：新闻里看得到的只有别家的那一条。
    const got = c => { const s = game(c, 'y2023'); until(s, '2023-10-01'); return ['w_funccall', 'w_amazon_anthropic'].filter(id => s.news.some(n => n.w === id)); };
    assert.deepEqual(got('gpt'), ['w_amazon_anthropic']);
    assert.deepEqual(got('claude'), ['w_funccall']);
    assert.deepEqual(got('fable'), ['w_funccall']);
    assert.deepEqual(got('qwen'), ['w_funccall', 'w_amazon_anthropic']);
  });
  it('target 按 org 认：GPT 是 w_nyt 的当事人；Claude 和 Fable 都是 w_bartz 的当事人，别家不是', () => {
    assert.equal(worldReach(game('gpt', 'y2023'), W('w_nyt')), 'target');
    assert.equal(worldReach(game('claude', 'y2023'), W('w_nyt')), 'on');
    assert.equal(worldReach(game('claude', 'y2025'), W('w_bartz')), 'target');
    assert.equal(worldReach(game('fable', 'y2026'), W('w_bartz')), 'target');
    assert.equal(worldReach(game('gpt', 'y2025'), W('w_bartz')), 'on');
  });
});

describe('行业大事：落到一局里', () => {
  it('玩 DeepSeek 时 w_pricewar 和 w_r1 都不发生：没有新闻，没有世界标记，也没有品牌加成', () => {
    for (const id of ['w_pricewar', 'w_r1']) {
      const s = game('deepseek', 'y2024');
      const before = JSON.stringify([s.news, s.world, s.risk, s.brand, s.queue, s.flags]);
      applyWorldEvent(s, W(id));
      assert.equal(JSON.stringify([s.news, s.world, s.risk, s.brand, s.queue, s.flags]), before, id);
    }
    // 整局玩下来也一样（价格战的决策事件也不再按日期弹出）。
    const { s, seen, events } = playAndCollect('deepseek', 'y2024');
    for (const id of ['w_pricewar', 'w_r1', 'w_v3']) assert.ok(!seen.has(id), `${id} 还是发生了`);
    assert.ok(!s.world?.priceWar);
    assert.ok(!events.some(e => ['price_war', 'open_question', 'reasoning_race'].includes(e.id)));
  });
  it('别家的中国公司照常收到价格战：新闻 + 世界标记 priceWar；美国公司只有新闻（标记只对中国公司）', () => {
    const cn = game('qwen', 'y2024');
    applyWorldEvent(cn, W('w_pricewar'));
    assert.equal(cn.news[0].w, 'w_pricewar');
    assert.equal(cn.world.priceWar, true);
    const us = game('gpt', 'y2024');
    applyWorldEvent(us, W('w_pricewar'));
    assert.equal(us.news[0].w, 'w_pricewar');
    assert.ok(!us.world?.priceWar);
  });
  it('GPT 玩家吃到 w_nyt 的效果（版权风险 ×1.3），新闻改写成“OpenAI 被……”；Claude 玩家同样吃效果，新闻照原文', () => {
    const gpt = game('gpt', 'y2023');
    applyWorldEvent(gpt, W('w_nyt'));
    near(gpt.risk.copyright, 1.3);
    assert.equal(gpt.news[0].title, 'OpenAI 被《纽约时报》起诉');
    assert.ok(gpt.news[0].detail.startsWith('《纽约时报》连同微软一起起诉 OpenAI'));
    const claude = game('claude', 'y2023');
    applyWorldEvent(claude, W('w_nyt'));
    near(claude.risk.copyright, 1.3);
    assert.equal(claude.news[0].title, W('w_nyt').title);
    // 真的玩一段：2023 年 12 月以后风险已经在了。
    const s = game('gpt', 'y2023');
    until(s, '2024-01-01');
    near(s.risk.copyright, 1.3);
    assert.equal(worldNews(s).filter(n => n.w === 'w_nyt').length, 1);
    assert.equal(s.news.find(n => n.w === 'w_nyt').title, 'OpenAI 被《纽约时报》起诉');
    assert.ok(!worldNews(s).some(n => n.w === 'w_gpt4'), 'GPT 玩家不该收到自己这条线的 GPT-4 发布大事');
  });
  it('Suno 玩 y2023：LLM 的大事一条都没有，w_riaa 效果生效、新闻改写成“Suno 被……”', () => {
    const { s, seen } = playAndCollect('suno', 'y2023');
    const got = [...seen.keys()];
    assert.ok(got.length >= 15, `只收到 ${got.length} 条`);
    for (const id of got) assert.ok(![].concat(W(id).mod || []).includes('llm'), `Suno 收到了 LLM 的 ${id}`);
    for (const w of SCENE_LLM_ONLY) assert.ok(!seen.has(w.id), w.id);
    assert.ok(seen.has('w_riaa'));
    assert.equal([...seen.get('w_riaa')][0].title, 'Suno 被唱片业起诉');
    near(s.risk.music, 1.6);
    // 全行业的照收：芯片出口、欧盟法案、版权判例。
    for (const id of ['w_export_2', 'w_euact', 'w_nyt', 'w_ross']) assert.ok(seen.has(id), id);
  });
  it('区域只管效果：美国公司收到中国备案的新闻但没有估值加成；中国公司碰上出口管制排一张经营事件，别国不排', () => {
    const us = game('gpt', 'y2023');
    applyWorldEvent(us, W('w_cn_rules'));
    assert.equal(us.news[0].w, 'w_cn_rules');
    const cn = game('qwen', 'y2025');
    applyWorldEvent(cn, W('w_llama4'));
    assert.deepEqual(cn.queue.filter(q => q.id === 'export_ban').map(q => q.params.gpus), ['H20']);
    const mistral = game('mistral', 'y2025');
    applyWorldEvent(mistral, W('w_llama4'));
    assert.ok(!mistral.queue.some(q => q.id === 'export_ban'));
    const hk = game('qwen', 'y2026');
    applyWorldEvent(hk, W('w_hk_ipo'));
    near(hk.flags.valMult, 1.25);
  });
  it('世界大事不再往队列里排任何东西：没有 world 弹窗，也没有开源抉择、推理竞赛两张日期事件（价格战改成看局面，P2.3 的 events.test.mjs 测）', () => {
    for (const [c, sc] of [['qwen', 'y2023'], ['llama', 'y2023'], ['seed', 'y2024'], ['claude', 'y2025']]) {
      const { events } = playAndCollect(c, sc);
      assert.ok(events.length > 5, `${c} 只遇到 ${events.length} 个事件`);
      // 视图的 kind 是 world 的还有“别家先做到”的里程碑卡（tag 是行业第一次）；行业大事自己的 tag 是行业大事。
      assert.ok(!events.some(e => e.tag === '行业大事'), `${c} 还在弹行业大事`);
      assert.ok(!events.some(e => ['open_question', 'reasoning_race'].includes(e.id)), `${c} 还在弹日期抉择`);
    }
  });
});

describe('行业大事：新闻里点开短剧', () => {
  it('有短剧的大事，新闻带着换好名牌的台词（self 已经是玩家自己）；没有短剧的不带', () => {
    const { seen } = playAndCollect('claude', 'y2023');
    let withScene = 0;
    for (const [id, set] of seen) {
      assert.equal(set.size, 1, `${id} 的新闻不止一条`);
      const n = [...set][0];
      if (!SCENES[id]) { assert.equal(n.scene, undefined, id); continue; }
      withScene++;
      assert.ok(n.scene.length >= 3, id);
      for (const l of n.scene) { assert.ok(l.text, id); if (l.who !== 'narr') assert.ok(l.name, `${id} 的 ${l.who} 没有名牌`); }
      // 玩家是 Claude：台词里不会再有 claude 这个角色（已经换成 self）。
      assert.ok(!n.scene.some(l => l.who === 'claude'), id);
    }
    assert.ok(withScene >= 15, `只有 ${withScene} 条新闻带短剧`);
  });
  it('新闻页：带短剧的新闻有可以点开的「看当时的短剧」，日期带年份（P0.4）；坏的 scene 不会让页面画不出来', () => {
    const s = game('claude', 'y2023');
    until(s, '2023-04-01');
    const html = renderNews(s);
    assert.match(html, /<details class="ev-fact news-scene"><summary>看当时的短剧<\/summary>/);
    assert.match(html, /<span>2023<br>3\/14<\/span>/);
    // 没有短剧的新闻不出现这一行。
    const plain = game('claude', 'y2023');
    plain.news = [{ date: '2023-01', day: '2023-01-10', type: 'tech', title: '一条普通新闻', detail: '没有短剧' }];
    assert.ok(!renderNews(plain).includes('<details'));
    const bad = game('claude', 'y2023');
    bad.news = [{ date: '2023-01', day: '2023-01-10', type: 'market', title: 'a', detail: 'b', scene: 'oops' }, { date: '2023-01', type: 'market', title: 'c', scene: [null, { who: 'gpt' }, { who: 'narr', text: '旁白' }, { who: 'nobody', text: '陌生人', name: '路人' }] }];
    const out = renderNews(bad);
    assert.ok(out.includes('旁白') && out.includes('陌生人'));
    assert.equal((out.match(/<details/g) || []).length, 1);
    assert.match(renderNews({ ...bad, news: [] }), /暂无/);
  });
  it('旧存档里排着的 world 弹窗还能照常弹出来看（只是不再有新的）', () => {
    const s = game('claude', 'y2023');
    s.queue = [{ kind: 'world', id: 'w_gpt4' }];
    const v = E.currentEvent(s);
    assert.equal(v.kind, 'world');
    assert.ok(v.scene.length >= 3);
  });
});

describe('行业大事：rel 同一天合并成一条', () => {
  it('Claude 玩一整局：每件没被静音的大事恰好一条新闻；带 rel 的并进了发布新闻（标题不动、日期是发布日、说明排在前面）', () => {
    const { seen, s: end } = playAndCollect('claude', 'y2023');
    const s = game('claude', 'y2023');
    // 只看对局结束（打完或被撤换）以前的大事。P2.2 起机器人落后时会蒸馏开源老师，这一局曾在 2026 年 2 月被撤换，下限临时降到 30；
    // P4.2 前沿档不再蒸馏（A10）、底座 token 加了 500× 档，这一局能打完，下限改回 45。
    assert.equal(end.result?.reason, 'complete', `这一局应该打完：${end.result?.reason}`);
    const expected = WORLD_EVENTS.filter(w => worldReach(s, w) !== 'off' && (end.result?.reason === 'complete' || w.date < end.date));
    assert.ok(expected.length >= 45, `只查到 ${expected.length} 件`);
    let merged = 0;
    for (const w of expected) {
      const set = seen.get(w.id);
      assert.ok(set, `${w.id} 没有新闻`);
      assert.equal(set.size, 1, `${w.id} 有 ${set?.size} 条新闻`);
      const n = [...set][0];
      if (!w.rel) { assert.equal(n.title, worldReach(s, w) === 'target' ? w.mine.title.replace('{company}', 'Anthropic') : w.title, w.id); continue; }
      const r = RELEASES.find(x => x.name === w.rel);
      merged++;
      assert.equal(n.type, 'release', w.id);
      assert.equal(n.family, r.family, w.id);
      assert.equal(n.day, r.day, `${w.id} 不在发布日`);
      assert.equal(n.title, `${FAMILIES[r.family].company} 发布 ${r.name}`, w.id);
      assert.ok(n.detail.startsWith(w.detail), w.id);
    }
    assert.ok(merged >= 12, `合并了 ${merged} 条`);
    // 合并掉的大事自己的标题不会再单独出现。
    const titles = new Set([...seen.values()].flatMap(set => [...set].map(n => n.title)));
    for (const w of expected.filter(x => x.rel)) assert.ok(!titles.has(w.title), `${w.id} 的标题还单独出现`);
  });
  it('大事比发布早到：先挂到发布那天，到那天并进发布新闻；大事比发布晚到：直接并进已经发出的发布新闻；找不到发布新闻：单独发', () => {
    const w = W('w_gpt4');
    const prep = day => {
      const s = game('claude', 'y2023');
      until(s, day);
      s.scheduled = s.scheduled.filter(x => x.world !== w.id);   // 自然排的那一份拿掉，改成手动落
      return s;
    };
    // 早到
    const a = prep('2023-03-02');
    const n0 = a.news.length;
    applyWorldEvent(a, w);
    assert.equal(a.news.length, n0);
    assert.deepEqual(a.scheduled.filter(x => x.world === w.id), [{ at: '2023-03-14', world: w.id }]);
    until(a, '2023-03-15');
    const hit = a.news.filter(n => n.w === w.id);
    assert.equal(hit.length, 1);
    assert.equal(hit[0].title, 'OpenAI 发布 GPT-4');
    assert.equal(hit[0].day, '2023-03-14');
    assert.ok(hit[0].scene.length >= 3 && hit[0].major);
    // 晚到
    const b = prep('2023-03-20');
    const n1 = b.news.length;
    applyWorldEvent(b, w);
    assert.equal(b.news.length, n1);
    assert.deepEqual(b.scheduled.filter(x => x.world === w.id), []);
    assert.equal(b.news.filter(n => n.w === w.id).length, 1);
    assert.ok(b.news.find(n => n.w === w.id).detail.startsWith(w.detail));
    // 找不到发布新闻（比如读档前就被挤出了新闻条）：单独发一条
    const c = prep('2023-03-20');
    c.news = c.news.filter(n => n.type !== 'release');
    applyWorldEvent(c, w);
    assert.equal(c.news[0].w, w.id);
    assert.equal(c.news[0].title, w.title);
    assert.equal(c.news[0].type, 'release');
  });
  it('P4.1（规格 F2、D2）：TECH_SRC 按 rel 挂到发布那天，和对手发布新闻合成一条（data/techsrc.js、loop.js 的 startOfMonth）', () => {
    // 带关联发布的条目：发布名在发布表里、而且同月。
    let n = 0;
    for (const [id, list] of Object.entries(TECH_SRC)) for (const [d, , , , rel] of list) {
      if (!rel) continue;
      n += 1;
      const r = RELEASES.find(x => x.name === rel);
      assert.ok(r, `${id} 的关联发布 ${rel} 不在发布表里`);
      assert.equal(r.date, d, `${id} 的关联发布 ${rel} 不在同一个月`);
    }
    assert.ok(n >= 20, `只有 ${n} 条带关联发布`);
    // Mixtral 8x7B（2023-12-11）随发布开源 MoE：发布新闻里写着，当月不再单独发一条 MoE 的技术新闻。
    const s = game('qwen', 'y2023');
    until(s, '2023-12-20');
    const rel = RELEASES.find(x => x.name === 'Mixtral 8x7B');
    const rn = s.news.find(x => x.type === 'release' && x.title.endsWith(' 发布 Mixtral 8x7B'));
    assert.ok(rn, '有 Mixtral 8x7B 的发布新闻');
    assert.equal(rn.day, rel.day);
    assert.ok((rn.techs || []).includes('moe'), JSON.stringify(rn));
    assert.match(rn.detail, /Mixtral 8x7B 开源：/);
    assert.ok(!s.news.some(x => x.type === 'tech' && x.title.includes('Mixtral')), '没有单独的技术新闻');
  });
});

describe('行业大事：ms 联动', () => {
  const play = (company, scenario, day, ms) => {
    const s = game(company, scenario);
    s.day = day; s.date = day.slice(0, 7);
    s.ms = ms;
    return s;
  };
  const hypeOf = (company, scenario, day, ms, id) => {
    const s = play(company, scenario, day, ms);
    applyWorldEvent(s, W(id));
    assert.equal(s.news.filter(n => n.w === id).length, 1, `${id} 没认领也要发新闻`);
    return s.world?.hype;
  };
  it('关联发布认领了里程碑：效果生效；没认领（没人、玩家抢先、别家抢先）：只发新闻（w_gpt4 和 ms_gpt4）', () => {
    assert.ok(MS_BY_ID.ms_gpt4);
    near(hypeOf('claude', 'y2023', '2023-03-15', { ms_gpt4: { who: 'gpt', model: 'GPT-4', day: '2023-03-14' } }, 'w_gpt4'), 1.1);
    assert.equal(hypeOf('claude', 'y2023', '2023-03-15', {}, 'w_gpt4'), undefined);
    assert.equal(hypeOf('claude', 'y2023', '2023-03-15', { ms_gpt4: { who: 'me', day: '2023-03-01' } }, 'w_gpt4'), undefined);
    assert.equal(hypeOf('claude', 'y2023', '2023-03-15', { ms_gpt4: { who: 'gemini', model: 'Gemini Ultra' } }, 'w_gpt4'), undefined);
    // 同一个 org 的另一条线认领也算（by 按 org 认）。
    near(hypeOf('claude', 'y2023', '2023-03-15', { ms_gpt4: { who: 'gpt', model: 'GPT-4' } }, 'w_gpt4'), 1.1);
  });
  it('w_r1 和 ms_open_reasoning_frontier：只有 R1 认领了才生效', () => {
    assert.ok(MS_BY_ID.ms_open_reasoning_frontier);
    const R1 = { who: 'deepseek_pro', model: 'DeepSeek-R1', day: '2025-01-20' };
    const at = ms => hypeOf('qwen', 'y2024', '2025-01-21', ms, 'w_r1');
    near(at({ ms_open_reasoning_frontier: R1 }), 0.92);
    for (const ms of [{}, { ms_open_reasoning_frontier: { who: 'me', day: '2025-01-05' } }, { ms_open_reasoning_frontier: { who: 'qwen', model: 'Qwen3-235B-A22B' } }]) {
      assert.equal(at(ms), undefined, JSON.stringify(ms));
    }
  });
  it('w_gpt4 的结论和真实局面一致：Claude 玩 y2023，GPT-4 认领了 ms_gpt4 世界热度才多 ×1.1', () => {
    const real = game('claude', 'y2023');
    until(real, '2023-04-01');
    const byGpt = !!real.ms.ms_gpt4 && real.ms.ms_gpt4.who === 'gpt';
    near(real.world.hype ?? 1, 1.15 * (byGpt ? 1.1 : 1));
  });
  // 和 w_gpt4 那条一样只核对“效果跟着实际认领走”：规格只要求没有玩家干预时归 R1，Qwen 机器人自己先发了开源推理模型、抢先认领也是合法结局。
  it('R1 的真实局面：玩 Qwen 到 2025 年 3 月，世界热度 ×0.92 和认领情况一致（谁认领都行）', () => {
    const s = game('qwen', 'y2024');
    until(s, '2025-03-01');
    const c = s.ms.ms_open_reasoning_frontier;
    const byDs = !!c && c.who !== 'me' && FAMILIES[c.who].org === 'deepseek';
    const hyped = s.world.hype !== undefined && Math.abs(s.world.hype - 0.92) < 1e-9;
    assert.equal(hyped, byDs, JSON.stringify({ claim: c ?? null, hype: s.world.hype ?? null }));
  });
});
