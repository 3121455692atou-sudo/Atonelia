// 真实年代经营模式（v0.7）：剧情。原来在 career.test.mjs 里，按 describe 拆成单独的文件。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { COMPANIES, END, characterById, personaPlate } from '../../src/career/data/core.js';
import { FAMILIES, ownerOf } from '../../src/career/data/rivals.js';
import { WORLD_EVENTS } from '../../src/career/data/world.js';
import { SCENES } from '../../src/career/data/history.js';
import { GEN_HISTORY } from '../../src/career/data/history_gen.js';
import { HISTORY_FACTS } from '../../src/career/data/history_facts.js';
import { named } from '../../src/career/sim/queue.js';
import { worldReach } from '../../src/career/sim/world.js';

describe('剧情', () => {
  it('行业大事 id 唯一、日期在游戏期内，by、target 指向真实的模型家族', () => {
    const ids = new Set();
    for (const w of WORLD_EVENTS) {
      assert.ok(!ids.has(w.id), w.id);
      ids.add(w.id);
      assert.ok(w.date >= '2023-01' && w.date <= END, w.id);
      for (const f of [].concat(w.by || [], w.target || [])) assert.ok(FAMILIES[f], `${w.id} → ${f}`);
    }
  });
  // 旧版按日期弹的“历史时刻”已删除（E7）；64 段个人短剧的文案和短剧留作专属事件素材。
  it('个人短剧素材都有标题、正文和选项文案，短剧里的角色都存在', () => {
    for (const h of GEN_HISTORY) {
      assert.ok(h.title && h.body, h.id);
      assert.ok(h.choices.length >= 1, h.id);
      for (const c of h.choices) assert.ok(c.label, `${h.id}/${c.id}`);
    }
    for (const [id, lines] of Object.entries(SCENES)) {
      assert.ok(lines.length >= 3, id);
      for (const l of lines) {
        assert.ok(l.text, `${id} 空台词`);
        assert.ok(['narr', 'self', 'small'].includes(l.who) || characterById(l.who), `${id} 未知角色 ${l.who}`);
      }
    }
  });
  it('DeepSeek Flash 自己的短剧由小模型立绘出场', () => {
    const who = SCENES.personal_deepseek_math.map(l => l.who);
    assert.ok(who.includes('small') && !who.includes('self'));
  });
  // 每家公司会看到的短剧：别家的行业大事（by 是自己这条线的不播，模态不对的不播）和自己的历史时刻。
  const viewsOf = c => {
    const out = [];
    for (const w of WORLD_EVENTS.filter(x => x.major && SCENES[x.id])) {
      const s = E.createGame(c.id, 'y2023', 1);
      if (worldReach(s, w) === 'off') continue;
      s.queue = [{ kind: 'world', id: w.id }];
      out.push({ id: w.id, date: w.date, raw: SCENES[w.id], view: E.currentEvent(s), s });
    }
    for (const f of HISTORY_FACTS.filter(x => x.character && ownerOf(x.character) === c.id && SCENES[x.id])) {
      const s = E.createGame(c.id, 'y2023', 1);
      const date = f.date.slice(0, 7);
      out.push({ id: f.id, date, raw: SCENES[f.id], view: { scene: named(s, SCENES[f.id], date), lines: [] }, s });
    }
    return out;
  };
  it('名牌按事件月份换成当年的叫法，不会提前露出以后才有的型号名', () => {
    const LATE = { 'DeepSeek Flash': '2026-04', 'DeepSeek Pro': '2026-04', 'Image 2': '2026-04', 'Fable 5': '2026-06', Astra: '2026-09', '哈基米 · Argon': '2026-10' };
    for (const c of COMPANIES) for (const { id, date, view } of viewsOf(c)) {
      for (const l of [...view.scene, ...view.lines]) {
        if (l.who === 'narr') continue;
        assert.ok(l.name, `${c.id} 看 ${id}：${l.who} 没有名牌`);
        if (LATE[l.name]) assert.ok(date >= LATE[l.name], `${c.id} 看 ${id}（${date}）：名牌提前出现 ${l.name}`);
      }
    }
    const names = (c, id) => Object.fromEntries(viewsOf(COMPANIES.find(x => x.id === c)).find(x => x.id === id).view.scene.map(l => [l.who, l.name]));
    assert.equal(names('deepseek', 'personal_deepseek_math').small, '小肥鱼');
    assert.equal(names('deepseek', 'personal_deepseek_math').deepseek_pro, 'DeepSeek');
    assert.equal(names('deepseek', 'personal_deepseek_flash').small, 'DeepSeek Flash');
    assert.equal(names('claude', 'w_ghibli').image2, 'GPT-4o 图像');
    assert.equal(names('image2', 'personal_image2_letters').self, 'GPT-4o 图像');
    // 主界面和选人界面的名牌也按月份：2023 年的 GPT 还没有 Astra 这个称号。
    assert.deepEqual(personaPlate(E.createGame('gpt', 'y2023', 1).persona, '2023-01'), { name: 'GPT', label: '' });
    assert.deepEqual(personaPlate(E.createGame('gpt', 'y2026', 1).persona, '2026-09'), { name: 'GPT', label: 'Astra' });
    assert.equal(personaPlate(E.createGame('fable', 'y2026', 1).persona, '2026-01').name, 'Fable');
    assert.equal(personaPlate(E.createGame('deepseek', 'y2024', 1).persona, '2024-01').name, 'DeepSeek');
  });
  it('玩家自己的角色出现在别家的行业大事里，不会和旁观的 self 撞成同一个人', () => {
    const KEEP_BYSTANDER = ['w_pricewar', 'w_distill_war'];
    let clashes = 0;
    for (const c of COMPANIES) for (const { id, raw, view, s } of viewsOf(c).filter(x => x.id.startsWith('w_'))) {
      const mine = new Set([s.charId, s.persona.artId, s.persona.smallArtId].filter(Boolean));
      const own = raw.filter(l => mine.has(l.who)).map(l => l.text);
      const bystander = raw.filter(l => l.who === 'self').map(l => l.text);
      const selfNow = view.scene.filter(l => l.who === 'self' || l.who === 'small').map(l => l.text);
      assert.ok(!view.scene.some(l => mine.has(l.who)), `${c.id} 看 ${id}：自己的角色没换成 self`);
      if (!own.length || !bystander.length) { assert.equal(selfNow.length, own.length + bystander.length, `${c.id} 看 ${id}`); continue; }
      clashes += 1;
      // 价格战跟不跟、有没有蒸馏由玩家决定：留下旁观者；其余去掉旁观者，玩家的角色自己说。
      assert.deepEqual(selfNow, KEEP_BYSTANDER.includes(id) ? bystander : own, `${c.id} 看 ${id}：自己吐槽自己`);
    }
    assert.ok(clashes >= 10, `撞车的情况只有 ${clashes} 处`);
    // GPT-4o 画图刷屏是 OpenAI 自家的事，GPT 玩家不播。
    assert.ok(viewsOf(COMPANIES.find(x => x.id === 'gpt')).every(x => x.id !== 'w_ghibli'));
  });
  it('“跟不跟降价”的正文不点玩家自家的名：不能先说自己降过价，再问跟不跟', () => {
    const OWN = { deepseek: ['DeepSeek', '深度求索'], qwen: ['阿里', '千问', '通义'], seed: ['字节', '豆包', 'Seed'], ernie: ['百度', '文心'] };
    for (const [id, names] of Object.entries(OWN)) {
      // 价格战不再按日期强制弹出（E5，等 P2.3 改成条件触发）：这里直接排一张，只看正文。
      const s = E.createGame(id, 'y2024', 1);
      s.queue = [{ kind: 'event', id: 'price_war', params: { ratio: 4 } }];
      const ev = E.currentEvent(s);
      const words = [ev.text, ...ev.choices.flatMap(c => [c.label, c.hint])].join('\n');
      for (const n of names) assert.ok(!words.includes(n), `${id} 的价格战正文出现了自家的“${n}”：${ev.text}`);
      assert.match(ev.text, /随即跟进/);
      assert.doesNotMatch(ev.text, /\{\w+\}/);
    }
  });
});
