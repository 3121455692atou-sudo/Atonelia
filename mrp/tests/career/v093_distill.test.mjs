// v0.9.3 合并 M5：蒸馏小模型立项冻结老师快照（审查 B3），先修 G1-4、G4-12、G1-11，保留蒸馏至少 7 天（决定第 6 项）。
// 第 1 条迁自外部 v0.9.2 改动包 test_distillation_provenance.mjs 的“自家老师蒸馏也不能冒充从零预训练”（该文件其余用例依赖生成任务和蒸馏账本，不收）。
// 第 2–4 条按改动包 test_scaling_balance.mjs 的三条快照用例改写：去掉 capTechs、distillation.gap 等不收的字段，换成我们的场景和种子。
// 其余按审查 B3 的先修和不收项（G2-1 差距公式）补写。
import { describe, it } from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { loadSave, baseJob } from '../helpers/career_util.mjs';
import { RELEASES } from '../../src/career/data/rivals.js';
import { MS_BY_ID } from '../../src/career/data/milestones.js';
import { structureForRelease } from '../../src/career/data/model_structure.js';
import { playerMatch } from '../../src/career/sim/milestones.js';
import { advance, resolveAll } from '../helpers/career_bot.mjs';
import { studentGap } from '../../src/career/sim/model.js';
import * as L from '../helpers/legacy_jobs.mjs';

const clone = v => JSON.parse(JSON.stringify(v));
const readSrc = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const fresh = (char, scenario, seed) => { const s = E.createGame(char, scenario, seed); resolveAll(s); return s; };
const Q = (s, dims) => E.qOf('llm', dims);
const cfg = (teacher, total, tokens = 1.5) => ({ teacher, total, active: total, arch: 'dense', tokens, open: true });
// 一直推进到项目结束（小模型练好），返回用了几天。
function finish(s, maxDays = 400, each = () => {}) {
  let days = 0;
  while (E.hasBaseJob(s) && s.status === 'playing' && days < maxDays) { advance(s, 1); days += 1; each(); }
  assert.equal(E.hasBaseJob(s), false, `项目没跑完：${s.day}`);
  return days;
}
// 把一局改成 v0.9 存档的样子：进行中的蒸馏项目没有老师快照、没有 7 天计时，算力需求只算学生（v0.9 的公式）。
function v09Distill(s, c, frac) {
  const need = 6 * c.active * 1e9 * c.tokens * 1e12 * 0.45;
  const o = { ...clone(s), v: 3 };
  // P2.4a 以前的存档：项目在 s.project、团队任务在 s.focus，没有作业表。
  for (const k of ['jobs', 'evals', 'prevWorking', 'smallShelf']) delete o[k];
  delete o.mig.jobs;
  o.focus = { kind: 'research', since: s.day };
  o.project = { type: 'distill', cfg: { ...c }, structure: { total: c.total, active: c.active, arch: c.arch }, tokens: c.tokens, open: c.open, need, done: need * frac, start: s.date, teacher: c.teacher };
  return o;
}

describe('蒸馏立项冻结老师快照（审查 B3）', () => {
  it('自家老师蒸馏也不能冒充从零预训练，却不误报借用了他家老师', () => {
    const s = fresh('gpt', 'y2025', 312);
    // P1.2 换成规格 D7 的学生差距以后，3B、0.3T 的学生写作只有 46 左右；换成 14B、1.5T，写作条件满足，拒绝原因才确实是来源。
    L.startDistill(s, { teacher: 'self', total: 14, active: 14, arch: 'dense', tokens: 1.5 });
    for (let day = 0; day < 100 && !E.smallWorking(s); day++) advance(s, 1);
    const student = E.smallWorking(s);
    assert.ok(student);
    assert.equal(student.teacher, 'self');
    assert.ok(student.dims.writing >= 55, '满足写作条件，拒绝原因确实是来源');
    assert.equal(playerMatch(s, MS_BY_ID.ms_from_scratch, { on: 'release', model: student }), false);
    assert.equal(playerMatch(s, MS_BY_ID.ms_on_shoulders, { on: 'release', model: student }), false);
  });

  it('自蒸馏至少 7 天：算力一天就够也要等满；成品就是立项时的预估，新模型带上 teacher 和老师快照', () => {
    const s = fresh('gpt', 'y2025', 312);
    L.decide(s, 'maintain');
    const teacher = clone(E.liveModel(s));
    const c = cfg('self', 3, .3);
    const pv = E.previewDistill(s, c);
    // P2.4a 起作业有“想要卡”（T2.1）：蒸馏最多拿到 7 天正好跑完的卡数，多给也没用，所以算力也是约 7 天跑完。
    assert.ok(pv.computeDays <= E.DISTILL_MIN_DAYS + 1e-6 && pv.days === E.DISTILL_MIN_DAYS && pv.months === E.DISTILL_MIN_DAYS / 30, '3 万张卡上只占一小部分，工期按 7 天流程下限');
    assert.ok(pv.gpus < E.allocJobs(s).T / 10, `只占 ${pv.gpus} 张卡`);
    L.startDistill(s, c);
    assert.deepEqual([baseJob(s).pj.minDays, baseJob(s).pj.elapsedDays, baseJob(s).pj.preview.teacher.name], [7, 0, teacher.name]);
    advance(s, 6);
    assert.ok(E.hasBaseJob(s) && !E.smallWorking(s), '第 6 天还在项目里');
    assert.ok(E.projectProgress(baseJob(s).pj) < 1 && E.projectEta(s) > 0, '进度和剩余天数按 7 天算');
    advance(s, 1);
    const m = E.smallWorking(s);
    assert.ok(m, '第 7 天出小模型');
    assert.deepEqual(m.dims, pv.dims);
    assert.equal(m.teacher, 'self');
    assert.deepEqual([m.distillation.teacher.name, m.distillation.teacher.dims, m.distillation.tokens], [teacher.name, teacher.dims, .3]);
  });

  it('项目期间自家发布了新旗舰：学生仍用开工时的老师，不免费升级', () => {
    const s = fresh('novelai', 'y2025', 71);
    L.decide(s, 'train', { dir: 'writing' });
    advance(s, 14);
    const original = clone(E.liveModel(s));
    const c = cfg('self', 3);
    const pv = E.previewDistill(s, c);
    L.startDistill(s, c);
    L.decide(s, 'release', { open: true });
    resolveAll(s);
    L.decide(s, 'maintain');
    finish(s, 120);
    assert.notEqual(E.liveModel(s).id, original.id);
    assert.ok(E.liveModel(s).dims.writing > original.dims.writing);
    assert.deepEqual(E.smallWorking(s).dims, pv.dims);
    assert.deepEqual(E.smallWorking(s).distillation.teacher.dims, original.dims);
  });

  it('别家老师出了新款、后来又掉出名单：完工时能力照旧（不免费升级、不清空）', () => {
    // RWKV y2025：Llama 4 月出了 Llama 4 Maverick；Mistral Large 2 到 7 月被新出的几家挤出前六。推理份额调高，让项目真实跨过这些月份。
    for (const [teacher, total, share, check] of [['llama', 3, 0.3, 'changed'], ['mistral', 8, 0.9, 'vanished']]) {
      const s = fresh('rwkv', 'y2025', 71);
      L.decide(s, 'maintain');
      E.setInferShare(s, share);
      const c = cfg(teacher, total);
      const pv = E.previewDistill(s, c);
      L.startDistill(s, c);
      let changed = false, vanished = false;
      finish(s, 400, () => {
        const t = E.distillTeachers(s).find(x => x.id === teacher);
        if (!t) vanished = true; else if (t.name !== pv.teacher.name) changed = true;
      });
      assert.ok(check === 'changed' ? changed : vanished, `${teacher}：这个种子应该跨过老师${check === 'changed' ? '换新款' : '掉出名单'}的月份`);
      const m = E.smallWorking(s);
      assert.deepEqual(m.dims, pv.dims, teacher);
      assert.ok(Object.keys(m.dims).length >= 5 && Object.values(m.dims).every(Number.isFinite), '各维都有数');
      assert.deepEqual([m.teacher, m.distillation.teacher.name], [teacher, pv.teacher.name]);
    }
  });

  it('老师快照的总/激活参数取自统一结构解析；自家旗舰总在名单里，不会被六家更强的开源模型挤掉', () => {
    const s = fresh('rwkv', 'y2025', 71);
    const list = E.distillTeachers(s);
    assert.equal(list.length, 7, '六家开源 + 自家');
    const own = list.find(t => t.own);
    assert.deepEqual([own.id, own.name, own.modelId], ['self', E.liveModel(s).name, E.liveModel(s).id]);
    // 对手按日可见（规格 D2）：2025-01-01 开局时 R1 还没发布（01-20），DeepSeek 的开源老师是 V3。
    for (const name of ['DeepSeek-V3', 'Llama 3.1 405B', 'Qwen2.5-72B']) {
      const t = list.find(x => x.name === name), st = structureForRelease('llm', RELEASES.find(r => r.name === name));
      assert.deepEqual([t.total, t.active, t.arch], [st.total, st.active, st.arch], name);
    }
    const pv = E.previewDistill(s, cfg('deepseek_pro', 8));
    assert.deepEqual([pv.teacher.name, pv.teacher.total, pv.teacher.active, pv.teacher.date], ['DeepSeek-V3', 671, 37, RELEASES.find(r => r.name === 'DeepSeek-V3').date]);
  });

  it('distillCheck 给出不能立项的原因，startDistill 报同样的原因；检查和预估都不改存档', () => {
    const s = fresh('deepseek', 'y2025', 9);
    const bad = [
      [{ ...cfg('nobody', 7) }, /没有这个老师/],
      [{ ...cfg('qwen', 72) }, /学生要比老师小：Qwen2\.5-72B 总共 72B/],
      [{ ...cfg('self', 700) }, /学生要比老师小：DeepSeek-V3/],
      [{ ...cfg('self', 14), arch: 'rnn' }, /RWKV/],
      [{ ...cfg('self', 14), tokens: 0 }, /token/],
      [{ ...cfg('self', 14), total: '14', active: '14' }, /0\.5B/],
    ];
    const before = clone(s);
    for (const [c, why] of bad) {
      const chk = E.distillCheck(s, c);
      assert.equal(chk.ok, false, JSON.stringify(c));
      assert.match(chk.reason, why);
      assert.throws(() => L.startDistill(s, c), err => err.message === chk.reason);
      E.previewDistill(s, c);
    }
    assert.deepEqual(s, before, '检查、预估、被拒的立项都不改存档');
    // 没研究 MoE 不能蒸 MoE 学生；非语言模型不能蒸；有项目、有待发布小模型时不能再立项。
    const old = fresh('rwkv', 'y2023', 9);
    assert.ok(!old.techs.includes('moe'));
    assert.match(E.distillCheck(old, { teacher: 'llama', total: 30, active: 3, arch: 'moe', tokens: 1.5 }).reason, /需要先研究/);
    assert.match(E.distillCheck(fresh('midjourney', 'y2025', 9), cfg('self', 3)).reason, /只有语言模型/);
    // P2.4a：小模型线最多 3 个（T2.3），在蒸馏的和待发布的都算；满了才拒绝。
    L.startDistill(s, cfg('self', 14));
    assert.equal(E.distillCheck(s, cfg('self', 7)).ok, true);
    finish(s, 60);
    assert.ok(E.smallWorking(s));
    L.startDistill(s, cfg('self', 7));
    L.startDistill(s, cfg('self', 3));
    assert.match(E.distillCheck(s, cfg('self', 7)).reason, /小模型线已满（3 个）/);
  });

  it('学生差距按规格 D7 的等效参数算（总参和激活都看，G2-1 那个稀疏学生仍然很弱）；老师前向的算力照付', () => {
    // 审查 G2-1 的例子：GLM y2025，老师 DeepSeek-R1（按日可见以后开局那天是 V3，结构一样是 671B/37B）。改动包里 120B 总参、0.5B 激活的学生 7 天练出 Q72.8，比自家旗舰高 13 分。
    const s = fresh('glm', 'y2025', 312);
    const pv = c => E.previewDistill(s, { teacher: 'deepseek_pro', tokens: 1.5, ...c });
    const sparse = pv({ total: 120, active: 0.5, arch: 'moe' }), wide = pv({ total: 120, active: 37, arch: 'moe' }), dense = pv({ total: 32, active: 32, arch: 'dense' });
    // P1.2：N_eff = min(总参^0.7 × 激活^0.3, 10 × 激活)，gapQ = max(2.5, 25 · N_eff^−0.55 · (D / 36T)^−0.2)。外包那个学生 N_eff 约 5B，1.5T 时差距约 20。
    assert.equal(sparse.gap, studentGap(120, 0.5, 1.5));
    assert.ok(sparse.gap > 19 && sparse.gap < 21, `稀疏学生差距 ${sparse.gap}`);
    assert.ok(Q(s, sparse.dims) < Q(s, dense.dims) - 10 && Q(s, sparse.dims) < Q(s, wide.dims) - 10, '同样 120B 总参，激活 0.5B 的学生明显更弱');
    assert.ok(Q(s, sparse.dims) < Q(s, E.liveModel(s).dims) + 1, '不会比自家旗舰高一截');
    for (const p of [sparse, wide, dense]) {
      assert.equal(p.teacherNeed, 2 * 37 * 1e9 * 1.5e12, '老师给每个 token 跑一遍前向');
      assert.equal(p.need, p.studentNeed + p.teacherNeed);
    }
    assert.ok(Math.abs(sparse.studentNeed * 74 / wide.studentNeed - 1) < 1e-12, '学生训练按激活参数付');
  });
});

describe('先修 G1-4：旧档里进行中的蒸馏项目', () => {
  it('老师不在新名单里：按老师家族从历史目录补快照，31% 进度原样保留，完工时能力完整', () => {
    // 按日可见、固定权重以后，2025-01-01 的前六家开源老师里有混元，没有 Cohere：换成 Cohere 测“不在名单里”的情形。
    const s = fresh('jev', 'y2025', 7);
    assert.ok(!E.distillTeachers(s).some(t => t.id === 'cohere'), 'Cohere 不在新名单的前六');
    const save = v09Distill(s, cfg('cohere', 32), 0.31);
    const g = loadSave(save);
    const pj = baseJob(g).pj;
    assert.equal(pj.preview.teacher.name, 'Command R+');
    assert.deepEqual([pj.preview.teacher.total, pj.preview.teacher.active], [104, 104]);
    assert.deepEqual([pj.need, pj.done, pj.minDays], [save.project.need, save.project.done, 7], '进度和算力需求不动');
    assert.ok(!g.queue.some(q => q.kind === 'notice'), '没有取消、也没有“暂停”提示');
    assert.deepEqual(loadSave(clone(g)), g, '已有快照的项目再读一遍不变');
    finish(g, 120);
    const m = E.smallWorking(g);
    assert.equal(m.teacher, 'cohere');
    assert.deepEqual(m.dims, pj.preview.dims);
    assert.ok(m.dims.knowledge > 60 && Object.values(m.dims).every(Number.isFinite), 'v0.9 在这里会练出空能力');
  });

  it('自家老师的旧项目：用在线旗舰补快照', () => {
    const s = fresh('deepseek', 'y2025', 9);
    const g = loadSave(v09Distill(s, cfg('self', 14), 0.5));
    const pj = baseJob(g).pj;
    assert.deepEqual([pj.preview.teacher.own, pj.preview.teacher.name, pj.preview.teacher.modelId], [true, 'DeepSeek-V3', E.liveModel(g).id]);
    assert.equal(pj.done / pj.need, 0.5);
  });

  it('实在找不到老师才取消：提示写“已取消”和作废了多少进度，已有模型不受影响', () => {
    // Claude 从没放过开源权重，历史目录里找不到可下载的一款；另一个是不存在的家族。
    for (const teacher of ['claude', 'gone_family']) {
      const s = fresh('jev', 'y2025', 7);
      const models = clone(s.models);
      const g = loadSave(v09Distill(s, cfg(teacher, 8), 0.31));
      assert.equal(E.hasBaseJob(g), false, teacher);
      const note = g.queue.find(q => q.kind === 'notice');
      assert.equal(note.title, '蒸馏项目已取消');
      assert.match(note.text, /已经跑完的 31% 作废/);
      assert.doesNotMatch(`${note.title}${note.text}`, /暂停/);
      assert.deepEqual(g.models, models);
      assert.match(g.log.at(-1).text, /蒸馏项目已取消/);
      assert.ok(E.validateGame(g));
    }
  });
});

describe('先修 G4-12：蒸馏表单的工期和算力', () => {
  // 从蒸馏表单（ui/pages/distill_form.js）摘出工期和算力两个文字函数来跑。P2.4b 审查修复起两行都读立项检查（jobCheck，按表单的优先级和“最多 N 张”估），
  // 工期按天向上取整；算力写成“约占 N 张卡（最低 a、想要 b）”，跑几周不再另写（工期只说一次）。
  const src = readSrc('../../src/career/ui/pages/distill_form.js');
  const { distillDays, distillLoad } = new Function('count', `${src.slice(src.indexOf('const distillDays ='), src.indexOf('const f1 ='))}; return { distillDays, distillLoad };`)(v => String(Math.round(v)));

  it('工期只说一次；算力写成“约占 N 张卡（最低 a、想要 b）”，不再出现 H100·月', () => {
    const bs = fresh('gpt', 'y2025', 312);
    const big = E.jobCheck(bs, { kind: 'distill', cfg: cfg('self', 3, .3) });
    assert.equal(distillDays(big), '约 7 天（整理数据、评测最少也要这么久）');
    // 想要卡（T2.1）：大公司蒸一个 3B 只占几百张卡，正好 7 天左右跑完。
    assert.match(distillLoad(big), /^约占 \d+ 张卡（最低 \d+、想要 \d+）$/);
    assert.ok(big.cards.got < 1000, `${big.cards.got}`);
    const small = E.jobCheck(fresh('rwkv', 'y2025', 71), { kind: 'distill', cfg: cfg('llama', 3) });
    assert.ok(small.eta > 7);
    assert.equal(distillDays(small), `约 ${Math.ceil(small.eta)} 天`);
    assert.equal(distillLoad(small), `约占 ${small.cards.got} 张卡（最低 ${small.cards.min}、想要 ${small.cards.want}）`);
    const form = src.slice(src.indexOf('function distillForm('), src.indexOf('export { distillForm as render }'));
    assert.doesNotMatch(form, /H100·月|最少 7 天/);
    for (const text of [distillDays(big), distillDays(small), distillLoad(big), distillLoad(small)]) assert.ok((text.match(/\d+ 天|\d+ 周/g) || []).length <= 1, text);
    assert.doesNotMatch(distillLoad(small), /周/);
  });
});

describe('先修 G1-11：里程碑蒸馏按钮读冻结的老师快照', () => {
  it('弹出时冻结老师：之后这家换了最强的一款，按钮写的和实际下单的仍是弹出时那一款', () => {
    const s = fresh('rwkv', 'y2025', 7);
    // QwQ-32B-Preview（2024-11）补进数据后，“第一个开源推理模型”开局前就记在千问名下；清掉它，让 R1（2025-01-20）来触发，测的是冻结老师本身。
    delete s.ms.ms_open_reasoning;
    let q = null;
    for (let i = 0; i < 40 && !q; i++) {
      while (s.queue.length && !q) {
        if (s.queue[0].kind === 'milestone' && s.queue[0].fam === 'deepseek_pro') q = s.queue[0];
        else E.resolveEvent(s, E.currentEvent(s).choices.find(c => !c.disabled).id);
      }
      if (!q) E.tickDay(s);
    }
    assert.ok(q, 'DeepSeek-R1 开源推理模型的里程碑');
    assert.deepEqual([q.rel, q.distill.teacherName], ['DeepSeek-R1', 'DeepSeek-R1']);
    // 模拟弹窗晚几个月才处理：到 6 月，这家综合最强的开源一款已经是 R1-0528（V3-0324 改值后比 R1 弱，接不了班）。
    s.date = '2025-06';
    s.day = '2025-06-02';
    assert.equal(E.distillOptions(s).find(o => o.teacher === 'deepseek_pro').teacherName, 'DeepSeek-R1-0528');
    const choice = E.currentEvent(s).choices.find(c => c.id === 'distill');
    assert.match(choice.hint, /老师是 DeepSeek-R1/);
    assert.doesNotMatch(`${choice.label} ${choice.hint}`, /R1-0528/);
    E.resolveEvent(s, 'distill');
    const order = s.orders.find(o => o.kind === 'distill');
    assert.deepEqual([order.name, order.teacherDims], ['蒸馏 DeepSeek-R1', RELEASES.find(r => r.name === 'DeepSeek-R1').dims]);
  });

  it('同一家的蒸馏数据已经在跑时，另一张里程碑卡上的“下载权重做蒸馏”不可选（不再重复下单抛错）', () => {
    const s = fresh('rwkv', 'y2025', 7);
    delete s.ms.ms_open_reasoning;
    for (let i = 0; i < 40 && !(s.queue[0]?.kind === 'milestone' && s.queue[0].fam === 'deepseek_pro'); i++) {
      while (s.queue.length && !(s.queue[0].kind === 'milestone' && s.queue[0].fam === 'deepseek_pro')) E.resolveEvent(s, E.currentEvent(s).choices.find(c => !c.disabled).id);
      if (!s.queue.length) E.tickDay(s);
    }
    assert.equal(s.queue[0]?.fam, 'deepseek_pro');
    assert.equal(E.currentEvent(s).choices.find(c => c.id === 'distill').disabled, '');
    s.orders.push({ kind: 'distill', ref: 'distill:deepseek_pro', eta: s.day, name: '蒸馏 DeepSeek-R1', teacher: 'deepseek_pro', open: true, posts: {}, teacherDims: {} });
    assert.match(E.currentEvent(s).choices.find(c => c.id === 'distill').disabled, /已经在跑/);
  });
});
