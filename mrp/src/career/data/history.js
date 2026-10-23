// 史实对照：各公司真实发生过的事（来自已核对出处的史料），给里程碑卡片的“现实中”一行和选项效果用；以及各段短剧（SCENES）。
// 旧版按日期弹出的“历史时刻”已经删除（规格 E7）。history_gen.js 里 64 段个人短剧的文案（GEN_HISTORY）留作专属事件的素材，这里不再读。
import { HISTORY_FACTS, HISTORY_SOURCE_BY_ID } from './history_facts.js';
import { COMPANY_BY_ID, OWNER_OF } from './core.js';
import { GEN_SCENES } from './history_gen.js';

const MAP = {
  llm: { creative_writing: 'writing', expression: 'writing', coding: 'code', tool_use: 'agent', mathematics: 'math', reasoning: 'math', knowledge: 'knowledge', context: 'knowledge', safety_alignment: 'safety', reliability: 'safety' },
  image: { creative_writing: 'aesthetics', expression: 'text', coding: 'adherence', tool_use: 'adherence', mathematics: 'adherence', reasoning: 'adherence', knowledge: 'realism', context: 'realism', safety_alignment: 'safety', reliability: 'safety' },
  music: { creative_writing: 'lyrics', expression: 'vocals', coding: 'composition', tool_use: 'composition', mathematics: 'composition', reasoning: 'composition', knowledge: 'fidelity', context: 'fidelity', safety_alignment: 'safety', reliability: 'safety' },
  speech: { creative_writing: 'expressive', expression: 'expressive', coding: 'cloning', tool_use: 'cloning', mathematics: 'multilingual', reasoning: 'multilingual', knowledge: 'multilingual', context: 'naturalness', safety_alignment: 'safety', reliability: 'safety' },
};

// 史料里的旧数值（stats、cost_kc、readiness、reputation、trust）直接换算成效果词表（规格 E1）的写法，由 applyEffects 结算：
// 能力加在在练模型上（没有就加在在线模型上）；占用研究团队的时间折成在研项目推迟的天数；准备度折成集群健康；名声折成品牌；信任折成士气。
function factEffects(old, mod) {
  const dims = {};
  for (const [k, v] of Object.entries(old.stats || {})) {
    const key = MAP[mod][k];
    if (key) dims[key] = Math.round(((dims[key] || 0) + v * 0.32) * 10) / 10;
  }
  const e = { dims };
  if (old.cost_kc) e.delayResearch = Math.round(old.cost_kc * 1.5) / 2;
  if (old.readiness) e.health = old.readiness * 4;
  if (old.reputation) e.brand = 1 + 0.04 * old.reputation;
  if (old.trust) e.morale = old.trust;
  return e;
}

// 事件属于角色所在的公司（DeepSeek 的 Pro 与 Flash 同属一家）；小模型角色自己的短剧由“小模型”立绘出场（场景里的 self 换成 small）。
const companyOf = id => COMPANY_BY_ID[OWNER_OF[id] || id];
const SMALL_SPEAKER = new Set(HISTORY_FACTS.filter(e => e.character && companyOf(e.character)?.smallArt === e.character).map(e => e.id));
// 场景里的 self 指玩家扮演的角色。
export const SCENES = Object.fromEntries(Object.entries(GEN_SCENES || {}).map(([id, lines]) => [id, SMALL_SPEAKER.has(id) ? lines.map(l => (l.who === 'self' ? { ...l, who: 'small' } : l)) : lines]));

// 里程碑用：任意一段史实（包括不属于可玩公司的 Phi 等）换算成指定模态的事实与选项效果（提示由 sim 层的 describeEffects 生成）。
export function histInfo(id, mod) {
  const e = HISTORY_FACTS.find(x => x.id === id);
  if (!e) return null;
  const sources = (e.sources || []).map(sid => HISTORY_SOURCE_BY_ID[sid]).filter(Boolean).map(x => ({ title: x.title || x.id, url: x.url }));
  const choices = e.choices.map((c, i) => ({ id: `c${i}`, label: c.label, effects: factEffects(c.effects, mod), result: '' }));
  choices.push({ id: 'skip', label: '按原计划推进', hint: '不额外投入', effects: {}, result: '' });
  return { id, realFam: e.realFam, realModel: e.model, choices, fact: { date: e.date, title: e.title, text: e.fact, sources } };
}
