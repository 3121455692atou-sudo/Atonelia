// 几个测试共用的小函数（原来写在 career.test.mjs 开头，拆分后放在这里）。
import { addMonths } from '../../src/career/data/core.js';
import { RELEASES } from '../../src/career/data/rivals.js';
import { migrateGame, decide, _finishEvalNow } from '../../src/career/engine.js';
import { guardOldFields, baseJob as baseJobOf } from '../../src/career/sim/jobs.js';

// 测试环境：读写已经删掉的 s.project、s.focus 直接抛错（规格 T11.2），免得 while (s.project) 这类写法悄悄失效。
globalThis.__MRP_STRICT__ = true;

// 深拷贝；拷的是游戏状态（有 charId）时同样装上读旧字段报错的取值器。
export const clone = v => { const c = JSON.parse(JSON.stringify(v)); return c && typeof c === 'object' && !Array.isArray(c) && typeof c.charId === 'string' ? guardOldFields(c) : c; };
// 主线（默认）或某条线的底座类作业；line 传 null 取第一项。替代原来的 s.project（读它的 pj）。
export const baseJob = (s, line = 'main') => baseJobOf(s, line) || (line === 'main' ? baseJobOf(s, null) : null);
// 需要“评完发布”（不是跳过评测）的场景：先按快速档送评，再当天评完发布。返回发布结果。
export function releaseEvaluated(s, opts = {}) {
  const r = decide(s, 'submit', { tier: 'quick', ...opts });
  if (r.kind === 'release') return r;
  return _finishEvalNow(s, r.eval.id);
}
export const months = (from, to) => { const out = []; for (let d = from; d <= to; d = addMonths(d, 1)) out.push(d); return out; };
export const rel = name => RELEASES.find(r => r.name === name);
// 按天推进以后，月结时触发的事件会排到下个月的某一天：眼前的和排着的一起看。
export const pendingEvents = s => [...s.queue, ...s.scheduled.map(x => x.item).filter(Boolean)];
// 测试里直接跳到某个月：日期和“今天”一起改。
export const jumpTo = (s, ym) => { s.date = ym; s.day = `${ym}-01`; };
// 读档：migrateGame 返回 { ok, s, notes, reason }（规格 E8，P0.3a 起），原档不动。读不了就抛错，测试直接失败并带上原因。
export function loadSave(raw) {
  const r = migrateGame(raw);
  if (!r.ok) throw new Error(`读档失败：${r.reason}`);
  return r.s;
}
// 把新开局的命名改回 P2.1 以前的样子（规格 C5 删掉的那一套），用来造 v0.9 旧档和开发期存档（会改动传进来的 s）：
// 在练的下一代叫“真实型号名（训练中）”、带 realName 和命名用的 lineage 字符串；从在线旗舰复制出来接着练的那份和在线旗舰同名；
// 自己练的新底座叫“角色名 N.0（训练中）”；发布出去的快照带着 realName、lineage（复制自在练模型）；m.minor 记发布过几次，存档带 s.verNext。
export function asOldNaming(s) {
  for (const m of s.models) {
    const real = m.hint?.realName;
    if (real) Object.assign(m, { realName: real, lineage: real });
    delete m.hint;
    if (m.stage !== 'released') {
      const base = m.id.endsWith('w') ? s.models.find(x => x.id === m.id.slice(0, -1)) : null;
      if (base) Object.assign(m, { name: base.name, lineage: base.name.replace(/（.*?）/g, '').trim() });
      else m.name = `${real || `${s.persona.name} ${m.gen}.0`}（训练中）`;
    }
    m.minor = m.releases || 0;
    delete m.releases;
  }
  s.verNext = 2;
  return s;
}
