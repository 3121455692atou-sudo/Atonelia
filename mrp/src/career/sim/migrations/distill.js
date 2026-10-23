// 读档特性步骤「distill」（规格 E8，P1.2）：只在结构版本到 4 以后执行（见 migrate.js）。要求幂等：同一份存档跑两遍结果相同。
//   1. 旧 teacherCap 和旧的平铺 data.distill 合成一位老师 legacy：dims = teacherCap，q = min(qOf(teacherCap), 存档日的当前最强)；
//      data.distill 改成 { 类别: { legacy: 等级 } }，删掉 teacherCap。
//   2. 在练模型当时用着蒸馏数据（BASE 下某类蒸馏等级高过自有等级，才真的用了蒸馏）、而且还在 legacy 的上限以下的，记为被污染，老师是 legacy；
//      别家老师蒸出来的小模型记为被污染，老师是那一家。
//   3. 所有模型补 m.techs = s.techs、m.train = { 0, 0 }、m.cleanStreak = {}、m.post；补 capTechs（底座里已经含着上限效果的技术：
//      开局继承的型号取开局时的技术，蒸馏出来的取存档时的技术，自己预训练的是 []）。
//   4. 在途订单：BASE 的蒸馏订单（kind distill）保留原到货日，到期按 D7 的规则入库，进度不清零；
//      已删除的“R1 开源推理链”和改成蒸馏通道的“调用 GPT-4 生成合成数据”，在途的转成同一到货日的蒸馏订单。
import { TECHS, SCENARIOS, addMonths } from '../../data/core.js';
import { FAMILIES } from '../../data/rivals.js';
import { APPROACH } from '../../data/balance.js';
import { qOf, familyBest, relDims, worldSota } from '../sota.js';
import { normalizeDistill, recordTeacher } from '../data_ops.js';
import { licenseOf } from '../model.js';

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
// 开局时就会的技术（和 createGame 同一个规则）。
function startTechs(s) {
  const start = SCENARIOS.find(x => x.id === s.scenario)?.start;
  if (!start) return Array.isArray(s.techs) ? [...s.techs] : [];
  return TECHS.filter(t => t.mod === s.mod && (t.start || t.from <= addMonths(start, -3))).map(t => t.id);
}
// 旧档里在途的“R1 开源推理链”“调用 GPT-4 生成合成数据”：转成按原到货日交付的蒸馏订单。
const CONVERT = {
  ds_r1_traces: { fam: 'deepseek_pro', open: true, name: 'R1 开源推理链', posts: { math: 1.2, code: 0.6 } },
  ds_gpt4_distill: { fam: 'gpt', open: false, name: '调用 OpenAI 的模型生成合成数据', posts: { chat: 1, code: 0.6, math: 0.5, knowledge: 0.4 } },
};

export function run(s) {
  if (!isObj(s.data)) return;
  // BASE 只在某类数据的蒸馏等级高过自有等级时才真用蒸馏（postPreview 的 useDistill = dist > own），别的存档只是“池子里有”，模型没用过。
  const post = isObj(s.data.post) ? s.data.post : {};
  const usedDistill = isObj(s.data.distill) && Object.entries(s.data.distill).some(([c, v]) => Number.isFinite(v) && v > 0 && v > (Number.isFinite(post[c]) ? post[c] : 0));
  normalizeDistill(s);
  const models = Array.isArray(s.models) ? s.models.filter(isObj) : [];
  const techs = Array.isArray(s.techs) ? s.techs : [];
  const atStart = startTechs(s);
  for (const m of models) {
    if (!Array.isArray(m.techs)) m.techs = [...techs];
    if (!Array.isArray(m.capTechs)) {
      const selfMade = (m.structureSource ?? 'player-design') === 'player-design' && !m.distillation && m.role !== 'small' && !m.realName && !m.hist;
      m.capTechs = selfMade ? [] : m.distillation || m.role === 'small' ? [...techs] : [...atStart];
    }
    if (!isObj(m.train)) m.train = { minor: 0, severe: 0 };
    if (!isObj(m.cleanStreak)) m.cleanStreak = {};
    if (!isObj(m.post)) m.post = { own: 0, dist: 0, teachers: {} };
    if (!isObj(m.post.teachers)) m.post.teachers = {};
    if (m.tainted === undefined) m.tainted = false;
    // 别家老师蒸出来的小模型：被污染，老师快照在 m.distillation 里。
    const fam = typeof m.teacher === 'string' && m.teacher !== 'self' ? m.teacher : null;
    if (fam && !m.tainted) {
      m.tainted = true;
      m.post.teachers = { [fam]: 1 };
      const t = m.distillation?.teacher;
      if (t?.dims && FAMILIES[fam]) recordTeacher(s, fam, { relId: t.relId ?? null, name: t.name || fam, day: s.day, dims: { ...t.dims }, q: qOf(s.mod, t.dims), kind: 'weights', license: t.license ?? null });
    }
    // 快照的 SOTA 记录（sota 步骤写的）留在最后：sota 步骤再跑一遍时会删了重写，字段顺序和这里一致，存档 JSON 才逐字相同。
    if (m.sota !== undefined) { const v = m.sota; delete m.sota; m.sota = v; }
  }
  // 在练模型当时用着蒸馏数据：记为被污染（老师 legacy）。两种情形不记：
  //   BASE 下并没有用蒸馏（各类自有数据都不低于蒸馏）；模型已经在 legacy 的上限 min(legacy, 当前最强) − APPROACH 之上——
  //   BASE 的 teacherCap 只钳主维，旧数据本来就没限制它，记了污染反而一迁移就被整体冻住（弱老师卡死）。
  const w = models.find(m => m.id === s.working);
  if (w && usedDistill && !w.tainted && w.stage !== 'pretrain' && isObj(w.dims)) {
    const t = s.data.teachers?.legacy;
    const cap = Math.min(Number.isFinite(t?.q) ? t.q : Infinity, worldSota(s)?.q ?? Infinity) - APPROACH;
    if (!(qOf(s.mod, w.dims) >= cap)) { w.tainted = true; w.post.teachers = { ...w.post.teachers, legacy: 1 }; }
  }
  // 在途订单。
  if (Array.isArray(s.orders)) {
    for (const o of s.orders) {
      if (!isObj(o)) continue;
      const c = o.kind === 'data' && CONVERT[o.ref];
      if (c) {
        const r = c.open ? familyBest(s, c.fam, s.day, { open: true }) : familyBest(s, c.fam, s.day, { open: false, api: true });
        const dims = r ? relDims(s, r) : {};
        Object.assign(o, { kind: 'distill', ref: `distill:${c.fam}${c.open ? '' : ':api'}`, name: `${c.name}（${r?.name || FAMILIES[c.fam]?.name || c.fam}）`, teacher: c.fam, open: c.open,
          posts: { ...c.posts }, teacherDims: { ...dims }, teacherName: r?.name || c.name, relId: r?.id ?? null, license: c.open ? licenseOf(r) : null });
        continue;
      }
      // BASE 的蒸馏订单原样保留（到期由 applyDistill 按 D7 入库：老师名、许可按订单名和对手表补）；只有坏掉的字段补成空的。
      if (o.kind === 'distill' && !o.gen) {
        if (!isObj(o.teacherDims)) o.teacherDims = {};
        if (!isObj(o.posts)) o.posts = {};
        if (typeof o.teacher !== 'string' || !o.teacher) o.teacher = 'legacy';
      }
    }
  }
}
