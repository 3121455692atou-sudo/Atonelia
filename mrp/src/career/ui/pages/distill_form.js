// 后台 · 训练页里的蒸馏表单：蒸馏小模型（普惠 SKU），进小模型线（最多 3 个）。草稿放在后台的 st.distill 里。
// 规格 D7：学生离老师差多少按等效参数和 token 算；别家老师蒸出来的、被污染的自家老师蒸出来的学生被污染，表单写明这条路最多走到哪。
// 规格 T10.2：多一栏“优先级”和“最多 N 张”，实时显示按现在的分卡约几天、占几张卡、对别的作业的影响（和底座表单同一套小函数）。
// 工期和占卡写在“预计耗时”“算力”两行里，下面的检查几行不再重复（工期只说一次）。
import * as E from '../../engine.js';
import { after } from '../act.js';
import { MODALITIES, ARCHS, PARAM_TOTALS, PARAM_ACTIVES } from '../../data/core.js';
import { esc, usd, count, params } from '../fmt.js';
import { optFields, optOf, optChange, checkLines, formCheck, startNew, draftField } from './project_form.js';

// 蒸馏工期只说一次（G4-12）。工期、占卡和下面“对别的作业的影响”都读同一个立项检查（jobCheck），按表单里选的优先级和“最多 N 张”估（T4.4、T10.2）：
// 算力跑完和流程下限取长的，按天向上取整（第几天练完）；下限起作用时注明是流程时间。c 是 formCheck 的结果（有 cards 时才画这两行）。
const distillDays = c => (!Number.isFinite(c.eta) ? '排队等卡'
  : c.eta <= (c.job?.pj?.minDays ?? 0) + 1e-9 ? `约 ${Math.ceil(c.eta - 1e-9)} 天（整理数据、评测最少也要这么久）` : `约 ${Math.ceil(c.eta - 1e-9)} 天`);
// 算力换成玩家能比的说法：按现在的分卡占几张训练卡（最低、想要）；跑多久上面已经说了，这里不再写。
const distillLoad = c => (c.cards.got > 0 ? `约占 ${count(c.cards.got)} 张卡（最低 ${count(c.cards.min)}、想要 ${c.cards.want === null ? '—' : count(c.cards.want)}）`
  : `现在分不到训练卡（最低要 ${count(c.cards.min)} 张）`);
const f1 = v => (Math.round(v * 10) / 10).toFixed(1);
// 被污染的学生后训练能走到哪：min(老师, 当前最强) − 0.3。
function capLine(pv) {
  if (!pv?.taint || !Number.isFinite(pv.capQ)) return '';
  if (pv.teacher.own) return '';
  const ws = Number.isFinite(pv.worldQ) ? `和当前最强 ${f1(pv.worldQ)} ` : '';
  return `这条路最多走到 ${f1(pv.capQ)}（老师 ${f1(pv.teacherQ)} ${ws}里取低的，再减 0.3），永远过不去。`;
}
function distillForm(S, st) {
  const teachers = E.distillTeachers(S);
  st.distill = st.distill || { teacher: 'self', total: 7, active: 7, arch: 'dense', tokens: 1.5 };
  const c = st.distill;
  if (!teachers.find(t => t.id === c.teacher)) c.teacher = teachers[0]?.id;
  const actives = c.arch === 'moe' ? PARAM_ACTIVES.filter(a => a <= c.total / 3) : [c.total];
  if (!actives.includes(c.active)) c.active = actives.at(-1) || c.total;
  const pv = c.teacher ? E.previewDistill(S, c) : null;
  const opt = optOf(st, 'distill', 'high');
  const chk = c.teacher ? formCheck(S, { kind: 'distill', cfg: c, ...opt }) : E.distillCheck(S, c);
  return `<div class="card"><div class="card-head"><b>蒸馏小模型（普惠 SKU）</b><small>真正的厂商不会只有旗舰</small></div>
    <div class="form">
      ${draftField(st, 'distill')}
      <label>老师<select data-dist="teacher">${teachers.map(t => `<option value="${t.id}" ${t.id === c.teacher ? 'selected' : ''}>${esc(t.name)}${t.own ? '（自家旗舰）' : '（开源）'}</option>`).join('')}</select></label>
      <label>学生总参数<select data-dist="total">${PARAM_TOTALS.filter(t => t <= 120).map(t => `<option value="${t}" ${t === c.total ? 'selected' : ''}>${params(t)}</option>`).join('')}</select></label>
      <label>架构<select data-dist="arch">${['dense', ...(S.techs.includes('moe') ? ['moe'] : [])].map(k => `<option value="${k}" ${k === c.arch ? 'selected' : ''}>${ARCHS[k].label}</option>`).join('')}</select></label>
      <label>激活参数<select data-dist="active" ${c.arch === 'moe' ? '' : 'disabled'}>${actives.map(a => `<option value="${a}" ${a === c.active ? 'selected' : ''}>${params(a)}</option>`).join('')}</select></label>
      ${optFields(st, 'distill', 'high', chk.minCards)}</div>
    ${pv ? `<ul class="kv"><li><span>老师</span><b>${esc(pv.teacher.name)} · 总参数 ${params(pv.teacher.total)} / 激活 ${params(pv.teacher.active)}</b></li>
      ${chk.cards ? `<li><span>预计耗时</span><b>${distillDays(chk)}</b></li>
      <li><span>算力</span><b>${distillLoad(chk)}</b></li>` : ''}
      <li><span>推理成本</span><b>${usd(E.costPerMillion(S, pv.structure))} / 百万 token</b></li></ul>
      <div class="dims-mini">${Object.entries(pv.dims).filter(([k]) => E.dimUnlocked(S, 'llm', k)).map(([k, v]) => `<span>${esc(MODALITIES.llm.dims.find(d => d.key === k).label)} <b>${v.toFixed(1)}</b></span>`).join('')}</div>
      ${chk.cards ? checkLines(chk, { cards: false }) : ''}
      <p class="muted">学生比老师差约 ${f1(pv.gap)} 分：学生越小、蒸馏的 token 越少，差得越多；整体最多到老师和当前最强里低的那个减 2.5。算力里除了训练学生，还有老师给每条数据跑一遍。立项时锁定老师和这份能力预估，老师之后出了新款也不会自动变强。</p>
      <p class="muted">开不开源到发布时再定。${esc(E.releaseOpenRule(S, 'small').why)}。</p>
      <p class="muted">${c.teacher === 'self' ? '用自家旗舰当老师，不影响技术积累。' : '用别家开源模型当老师：合法，但团队会更依赖别人的成果，学生也算被污染（拿不到同类徽章）。'}</p>
      ${capLine(pv) ? `<p class="warn">${esc(capLine(pv))}</p>` : ''}${chk.warn && !chk.cards ? `<p class="warn">${esc(chk.warn)}</p>` : ''}` : ''}
    <button class="btn btn--primary" data-blocked="${pv && chk.ok ? '0' : '1'}" data-op="start-distill" ${pv && chk.ok ? '' : 'disabled'}>开始蒸馏</button>${chk.ok ? '' : `<span class="bad"> ${esc(chk.reason)}</span>`}</div>`;
}
// 名字保留成 distillForm：tests/career/v093_distill.test.mjs 按这个名字截取表单本体，工期和算力两个函数截到 const f1 为止。
export { distillForm as render };

export function click(S, t, { st, guard }) {
  if (t.closest('[data-op]')?.dataset.op === 'start-distill') guard(() => after(startNew(S, { kind: 'distill', cfg: st.distill, ...optOf(st, 'distill', 'high') }), () => { st.newJob = null; return { note: '蒸馏开始了，练完是一个待发布的小模型' }; }));
}
export function change(S, t, { st, draw }) {
  if (optChange(st, t, draw)) return;
  if (t.dataset.draft === 'distill') { const c = st.distill || (st.distill = {}); c.draftName = t.value; draw(); return; }
  if (t.dataset.dist === undefined) return;
  const k = t.dataset.dist; st.distill[k] = k === 'arch' || k === 'teacher' ? t.value : Number(t.value); if (k === 'arch' || k === 'total') st.distill.active = st.distill.arch === 'moe' ? Math.min(st.distill.active, st.distill.total / 3) : st.distill.total; draw();
}
