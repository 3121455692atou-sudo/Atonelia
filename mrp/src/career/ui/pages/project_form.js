// 后台 · 训练页里的底座表单（规格 T10.2）：主线预训练下一代旗舰；line 'small' 是小模型线从零练的小底座（只有语言模型有）。
// 草稿放在后台的 st.proj（主线）、st.small（小底座）里，“下一步”按钮也会带推荐配置过来。
// 多一栏“优先级”和“最多 N 张”；实时显示按现在的分卡约几天、占几张卡、对别的作业的影响、用掉的试验结论；超过 270 天标黄，超过 365 天按钮置灰并写原因。
// 下面几个小函数（优先级和“最多 N 张”、表单检查、立项检查那几行、开作业）训练页的蒸馏、后训练、试验、续训表单也用。
import * as E from '../../engine.js';
import { MODALITIES, ARCHS, SCALES, PARAM_TOTALS, PARAM_ACTIVES } from '../../data/core.js';
import { JOBS } from '../../data/balance.js';
import { esc, usd, pct, count, params, dimLockText } from '../fmt.js';
import { after, jobAct } from '../act.js';

const dayN = d => Math.max(1, Math.round(d));
// 代号（选填，规格 C1）：立项、蒸馏都可以先起个代号，练完写进模型的 draftName。
// 只查长度、字符集和“训练中”（引擎的 draftNameError），不查重名和保留名；真正立项时 projectCheck、distillCheck 还会再查一次。
// 输入时当场在下面写原因，不合法时立项按钮置灰；判断和文案都用引擎的，界面不另写规则。
const DRAFT_HINT = '选填。练完在送评面板起正式名字；填了代号，在练模型和提示里就叫这个。';
let formSt = null;
let draftWired = false;
export function draftField(st, key) {
  formSt = st;
  if (!draftWired && typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    draftWired = true;
    document.addEventListener('input', ev => {
      const t = ev.target;
      if (!t?.dataset?.draft || !formSt) return;
      const rec = formSt[t.dataset.draft];
      if (!rec) return;
      rec.draftName = t.value;
      const err = E.draftNameError(t.value);
      const el = t.closest('label')?.querySelector('[data-draft-err]');
      if (el) { el.textContent = err || DRAFT_HINT; el.classList.toggle('is-bad', !!err); }
      t.classList.toggle('is-bad', !!err);
      const btn = t.closest('.card')?.querySelector('[data-op]');
      if (btn) btn.disabled = btn.dataset.blocked === '1' || !!err;
    });
  }
  const v = st[key]?.draftName ?? '';
  const err = E.draftNameError(v);
  return `<label>代号（选填）<input type="text" data-draft="${key}" value="${esc(v)}" maxlength="32" placeholder="例如：夜航" autocomplete="off" />
    <small class="${err ? 'is-bad' : 'muted'}" data-draft-err>${esc(err || DRAFT_HINT)}</small></label>`;
}

// 优先级和“最多 N 张”（每种新作业一份草稿，放在后台的 st.opt 里）。min 是这项作业的最低卡（formCheck 的 minCards），输入框不让填得比它少，旁边写明。
export function optFields(st, kind, def, min = null) {
  const o = (st.opt ||= {})[kind] ||= { prio: def, cap: '' };
  const lo = Number.isFinite(min) && min > 0 ? min : 1;
  return `<label>优先级<select data-opt="prio" data-kind="${kind}"><option value="high" ${o.prio === 'high' ? 'selected' : ''}>优先</option><option value="normal" ${o.prio !== 'high' ? 'selected' : ''}>正常</option></select></label>
    <label>最多几张卡<input type="number" inputmode="numeric" min="${lo}" step="1" value="${esc(o.cap)}" placeholder="不限" data-opt="cap" data-kind="${kind}" />${Number.isFinite(min) && min > 0 ? `<small>最少 ${count(min)} 张，不填就是不限</small>` : ''}</label>`;
}
export function optOf(st, kind, def) {
  const o = st.opt?.[kind] || { prio: def, cap: '' };
  const cap = o.cap === '' || o.cap === null || o.cap === undefined ? null : Math.floor(Number(o.cap));
  return { prio: o.prio || def, cap: Number.isFinite(cap) && cap > 0 ? cap : null };
}
export function optChange(st, t, draw) {
  if (!t.dataset.opt) return false;
  ((st.opt ||= {})[t.dataset.kind] ||= { prio: 'normal', cap: '' })[t.dataset.opt] = t.value;
  draw();
  return true;
}
// 立项检查（jobCheck）的结果写成几行：按现在的分卡约几天、占几张卡（最低、想要）；对别的作业的影响；用掉的试验结论。
// opts.base 是同一个优先级和“最多 N 张”、只是不扣试验省下的算力时的天数（底座表单的 etaNoLab），fast 是最快天数；
// 两个数口径一样才写“约 A → B 天”（A ≥ B），A 算不出来或比 B 少时只写省下多少算力。opts.cards = false 时不写第一行（蒸馏表单的工期和占卡在上面的表里已经说了）。
export function checkLines(c, { base = null, fast = null, cards = true } = {}) {
  if (!c) return '';
  const lines = [];
  if (c.cards && cards) {
    const eta = Number.isFinite(c.eta) ? `约 ${dayN(c.eta)} 天，` : c.eta === null || c.eta === undefined ? '' : '排队等卡，';
    lines.push(`按现在的分卡${eta}占 ${count(c.cards.got)} 张卡（最低 ${count(c.cards.min)}、想要 ${c.cards.want === null ? '—' : count(c.cards.want)}）`);
  }
  if (c.lab?.save > 0) {
    const pc = Math.round(c.lab.save * 100);
    const known = Number.isFinite(base) && Number.isFinite(c.eta) && dayN(base) >= dayN(c.eta);
    if (!known) lines.push(`试验省下 ${pc}% 的算力`);
    else if (dayN(base) > dayN(c.eta)) lines.push(`试验省下 ${pc}%：约 ${dayN(base)} → ${dayN(c.eta)} 天`);
    else if (Number.isFinite(fast) && c.eta <= fast + 0.5) lines.push(`试验省下 ${pc}% 的算力：工期已经卡在最快天数（约 ${dayN(c.eta)} 天），省下的是卡`);
    else lines.push(`试验省下 ${pc}% 的算力：工期差不到 1 天（约 ${dayN(c.eta)} 天）`);
  }
  const short = l => l.replace(/^[^·]+ · /, '');
  for (const e of c.effects || []) lines.push(e.queued ? `加了它，「${short(e.label)}」要排队（现在 ${count(e.before)} 张）` : `加了它，${e.label.split(' · ')[0]}「${short(e.label)}」从 ${count(e.before)} 张降到 ${count(e.after)} 张`);
  return `<ul class="check-lines">${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>${c.warn ? `<p class="warn">${esc(c.warn)}</p>` : ''}`;
}
// “试验省下 x%：约 A → B 天”的 A（T4.4、T5.5）：同一个草稿、同一个优先级和“最多 N 张”，只是算力按没扣试验省下的那份（need0）估。
// 没用试验结论、或者估不出来时是 null。
export function etaNoLab(S, chk) {
  const j = chk?.job;
  if (!j?.lab || !Number.isFinite(j.need0) || !j.pj) return null;
  const hypo = { ...j, pj: { ...j.pj, need: j.need0 } };
  return E.jobEta(S, hypo, E.allocJobs(S, hypo).extra);
}
// 新作业表单的检查：立项检查（jobCheck）之外，再查“最多 N 张”不能比这项作业的最低卡少（T4.2：界面不让设得比最低卡小）。
// jobCheck 不管这一条（机器人和顾问把小底座的上限设成闲卡数，可以比最低卡少），所以界面自己查。多返回一个 minCards（查不出来时是 null）。
// 上限太低时底座会按最低卡算出“超过一年”，那时也先说上限的事（根子在它）。
export function formCheck(S, spec) {
  const c = E.jobCheck(S, spec);
  const min = c.job ? Math.ceil(E.minCards(S, c.job)) : c.cards ? Math.ceil(c.cards.min) : null;
  if (Number.isFinite(spec.cap) && Number.isFinite(min) && spec.cap < min) return { ...c, ok: false, reason: `最多张数不能比最低卡少（${count(min)} 张）`, minCards: min };
  return { ...c, minCards: min };
}
// 开新作业（训练页每张新作业表单共用）：先按表单检查，不过就直接报原因，什么都不开；过了再走 decide('job')，优先级和“最多 N 张”一起放在 spec 里。返回新作业。
export function startNew(S, spec) {
  const c = formCheck(S, spec);
  if (!c.ok) throw new Error(c.reason);
  return after(jobAct(S, { op: 'start', spec }), r => r.job);
}

// 底座按规模的默认草稿。
const draftOf = (S, st, line) => {
  const key = line === 'small' ? 'small' : 'proj';
  const pool = E.poolStats(S);
  st[key] = st[key] || (S.mod === 'llm' ? (line === 'small' ? { total: 7, active: 7, arch: 'dense', tokens: Math.min(1, Math.round(pool.tokens * 2) || 1) } : { total: 70, active: 70, arch: 'dense', tokens: Math.min(2, Math.round(pool.tokens * 2)) }) : { scaleId: SCALES[S.mod][1].id, tokens: 1 });
  return st[key];
};
// 小底座的规模上限（T2.3）：min(120B, 参照底座的 1/5)；参照底座是主线在练模型，没有就用在线旗舰。
function smallMax(S) {
  const w = E.workingModel(S);
  const ref = w && w.stage === 'post' ? w : E.liveModel(S);
  return ref ? Math.min(JOBS.SMALL_MAX_TOTAL, ref.total * JOBS.SMALL_FRAC) : 0;
}
export function render(S, st, opts = {}) {
  const line = opts.line === 'small' ? 'small' : 'main';
  const pool = E.poolStats(S);
  const c = draftOf(S, st, line);
  const tag = line === 'small' ? ' data-line="small"' : '';
  const max = line === 'small' ? smallMax(S) : Infinity;
  const okind = line === 'small' ? 'small' : 'pretrain';
  // 先把草稿收进能选的范围，再检查（“最多 N 张”的最低卡要用检查的结果）。
  let archs, totals, actives, toks;
  if (S.mod === 'llm') {
    archs = Object.entries(ARCHS).filter(([k, a]) => !a.only || a.only.includes(S.charId));
    totals = PARAM_TOTALS.filter(t => t <= max + 1e-9);
    if (line === 'small' && totals.length && !totals.includes(c.total)) { c.total = totals.at(-1); c.active = Math.min(c.active, c.total); }
    actives = c.arch === 'moe' ? PARAM_ACTIVES.filter(a => a <= c.total / 3) : [c.total];
    if (!actives.includes(c.active)) c.active = actives.at(-1) || c.total;
    toks = [0.3, 0.5, 1, 2, 4, 8, 12, 15, 20, 30].filter(t => t <= Math.max(1, pool.tokens * E.MAX_EPOCHS));
    if (!toks.includes(c.tokens)) c.tokens = toks.at(-1);
  }
  const opt = optOf(st, okind, 'high');
  const spec = { kind: 'pretrain', line, cfg: c, ...opt };
  const chk = formCheck(S, spec);
  let body;
  if (S.mod === 'llm') {
    body = `<div class="form">
      ${draftField(st, line === 'small' ? 'small' : 'proj')}
      <label>总参数<select data-proj="total"${tag}>${(totals.length ? totals : PARAM_TOTALS.slice(0, 1)).map(t => `<option value="${t}" ${t === c.total ? 'selected' : ''}>${params(t)}</option>`).join('')}</select></label>
      <label>架构<select data-proj="arch"${tag}>${archs.map(([k, a]) => `<option value="${k}" ${k === c.arch ? 'selected' : ''}>${a.label}</option>`).join('')}</select></label>
      <label>激活参数<select data-proj="active"${tag} ${c.arch === 'moe' ? '' : 'disabled'}>${actives.map(a => `<option value="${a}" ${a === c.active ? 'selected' : ''}>${params(a)}</option>`).join('')}</select></label>
      <label>训练 token<select data-proj="tokens"${tag}>${toks.map(t => `<option value="${t}" ${t === c.tokens ? 'selected' : ''}>${t}T</option>`).join('')}</select></label>
      ${optFields(st, okind, 'high', chk.minCards)}</div>
      <p class="muted">${esc(ARCHS[c.arch].desc)}</p>`;
  } else {
    body = `<div class="form">${draftField(st, 'proj')}<label>规模<select data-proj="scaleId">${SCALES[S.mod].map(x => `<option value="${x.id}" ${x.id === c.scaleId ? 'selected' : ''}>${x.label}</option>`).join('')}</select></label>${optFields(st, okind, 'high', chk.minCards)}</div>`;
  }
  const pv = E.previewProject(S, c);
  // 开没开放和模拟同一口径（E.dimUnlocked）：Agent 要先学会「函数调用」，没开放时写什么时候出现。
  const dims = MODALITIES[S.mod].dims.filter(d => E.dimUnlocked(S, S.mod, d.key));
  const lockedDims = MODALITIES[S.mod].dims.filter(d => !E.dimUnlocked(S, S.mod, d.key));
  const title = line === 'small' ? '小底座：小模型线从零练' : '底座：预训练下一代旗舰';
  const small = line === 'small' ? `<p class="muted">规模最大 min(120B, 主线的 1/5)${max > 0 ? `，现在是 ${Math.floor(max * 10) / 10}B` : ''}。练完是一个待发布的小模型，走小模型的发布流程；不算新一代主线，研发经验每代只给第一个，按规模比例打折。</p>` : '';
  const slow = Number.isFinite(chk.eta) && chk.eta > JOBS.WARN_DAYS;
  return `<div class="card"><div class="card-head"><b>${title}</b><small>语料池 ${pool.tokens.toFixed(1)}T · 质量 ${pool.quality.toFixed(2)}</small></div>${body}${small}
    <ul class="kv">
      <li><span>算力需求</span><b>${(pv.need / 1e21).toFixed(0)} H100·月</b></li>
      <li><span>预计工期</span><b class="${slow ? 'warn' : ''}">${Number.isFinite(chk.eta) ? `约 ${dayN(chk.eta)} 天` : chk.eta === Infinity ? '排队等卡' : '—'}</b></li>
      <li><span>最快也要</span><b>${Math.round(E.fastestDays(S, pv.structure))} 天</b></li>
      <li><span>每月炸炉风险</span><b class="${pv.risk > 0.15 ? 'bad' : ''}">${pct(pv.risk * (chk.lab?.risk ?? 1))}</b></li>
      ${pv.repeat < 1 ? `<li><span>数据重复</span><b class="warn">${pv.epochs > 0 ? `练 ${pv.epochs.toFixed(1)} 遍，相当于 ${pv.freshEpochs.toFixed(1)} 遍新数据` : '还没有语料，按三成质量算'}</b></li>` : ''}
      ${S.mod === 'llm' ? `<li><span>推理成本</span><b>${usd(E.costPerMillion(S, { active: pv.structure.active, arch: pv.structure.arch }))} / 百万 token</b></li>` : ''}
    </ul>
    ${checkLines(chk, { base: etaNoLab(S, chk), fast: E.fastestDays(S, pv.structure) })}
    <div class="dims-mini">${dims.map(d => `<span>${esc(d.label)} <b>${pv.base[d.key].toFixed(1)}</b></span>`).join('')}${lockedDims.map(d => `<span class="muted">${esc(d.label)} <small>${esc(dimLockText(d))}</small></span>`).join('')}</div>
    <p class="muted">以上是底座能力的预估，后训练还能再往上提。卡再多也快不过最快天数；想快一点就设成“优先”，想留卡给别的作业就设“最多 N 张”。</p>
    <button class="btn btn--primary" data-blocked="${chk.ok ? '0' : '1'}" data-op="${line === 'small' ? 'start-small' : 'start-project'}" ${chk.ok ? '' : 'disabled'}>立项</button>${chk.ok ? '' : `<span class="bad"> ${esc(chk.reason)}</span>`}</div>`;
}

export function click(S, t, { st, guard }) {
  const op = t.closest('[data-op]')?.dataset.op;
  if (op === 'start-project') guard(() => { startNew(S, { kind: 'pretrain', line: 'main', cfg: st.proj, ...optOf(st, 'pretrain', 'high') }); st.newJob = null; return { note: '立项成功，底座开始预训练' }; });
  if (op === 'start-small') guard(() => { startNew(S, { kind: 'pretrain', line: 'small', cfg: st.small, ...optOf(st, 'small', 'high') }); st.newJob = null; return { note: '小底座开始预训练' }; });
}
export function change(S, t, { st, draw }) {
  if (t.dataset.draft === 'proj' || t.dataset.draft === 'small') { const c = st[t.dataset.draft] || (st[t.dataset.draft] = {}); c.draftName = t.value; draw(); return; }
  if (t.dataset.proj === undefined) return;
  const c = t.dataset.line === 'small' ? st.small : st.proj;
  const k = t.dataset.proj; c[k] = k === 'arch' || k === 'scaleId' ? t.value : Number(t.value); if (k === 'arch' || k === 'total') c.active = c.arch === 'moe' ? Math.min(c.active, c.total / 3) : c.total; draw();
}
