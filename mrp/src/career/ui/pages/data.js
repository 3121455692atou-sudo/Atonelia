// 后台 · 数据：预训练语料池、后训练数据（自有 / 各位老师的蒸馏）、老师和差距、生成订单（暂停、恢复、取消）、在路上的数据、来源风险。
import * as E from '../../engine.js';
import { FAMILIES } from '../../data/rivals.js';
import { GEN } from '../../data/balance.js';
import { inDays, daysBetween } from '../../engine.js';
import { esc, pct } from '../fmt.js';
import { act, after, decideAct } from '../act.js';

const f1 = v => (Math.round(v * 10) / 10).toFixed(1);
const MIXL = { web: '网页', code: '代码', math: '数学', books: '书籍', cn: '中文', sci: '论文', photo: '照片', art: '画作', song: '歌曲', instrumental: '纯音乐', read: '朗读', conversational: '对话', multilingual: '多语言' };
const POSTL = { chat: '对话写作', knowledge: '知识', code: '代码', math: '数学', safety: '安全', agent: 'Agent' };
// 当前蒸馏数据只接受 { 老师: 等级 }；没有该分类表示尚未积累，不转换旧版平铺数字。
function levelsOf(S, cat) {
  const v = S.data.distill[cat];
  if (v === undefined) return {};
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.hasOwn(v, 'legacy')
      || Object.values(v).some(x => !Number.isFinite(x) || x < 0)) throw Error('不支持旧版或损坏的蒸馏数据，请新开一局');
  return Object.fromEntries(Object.entries(v).filter(([, x]) => x > 0));
}
const teacherName = (S, f) => S.data.teachers?.[f]?.name || FAMILIES[f]?.name || f;
// 在练的这一代暂时不用的老师（规格 D7 第一次使用前的确认）：池子里有它的数据、比这一代弱、这一代没用过也没确认过。
function heldOf(S) {
  const w = E.workingModel(S);
  if (S.mod !== 'llm' || !w || w.stage === 'pretrain') return [];
  const fams = new Set();
  for (const d of E.directionsFor(S)) for (const f of E.postPreview(S, d.key)?.held || []) fams.add(f);
  const q = E.qOf(S.mod, w.dims);
  return [...fams].map(f => ({ fam: f, name: teacherName(S, f), q: S.data.teachers?.[f]?.q ?? 0, modelQ: q }));
}
// 完成比例（和 sim/orders.js 的 genProgress 同一口径）：API 按扣了多少钱；自家卡取“算完的比例”和“流程走了多少”里小的，
// 流程至少 7 天、算完以后还要收尾 3 天，所以算力一天跑完也要走满 7 天才拿全。
function genProg(g) {
  if (g.mode === 'api') return Math.min(1, g.cost > 0 ? g.paid / g.cost : g.elapsed / Math.max(1, g.days));
  const fc = g.need > 0 ? Math.min(1, g.done / g.need) : 1;
  const rest = Math.max(GEN.minDays - g.elapsed, GEN.cleanupDays - (fc >= 1 ? g.cleanup : 0));
  return rest > 0 ? Math.min(fc, g.elapsed / (g.elapsed + rest)) : fc;
}
// 暂停了多久：直接写天数。
const pausedText = (S, g) => { const n = Math.max(0, daysBetween(g.paused, S.day)); return n > 0 ? `已暂停 ${n} 天` : '今天刚暂停'; };
// 生成订单的进度和状态。wait 是今天分不到卡的原因（genPlan）：排在前一张后面，或者推理卡放不下老师。
function genRow(S, o, wait) {
  const g = o.gen;
  const prog = genProg(g);
  const left = Math.max(0, daysBetween(S.day, o.eta));
  const state = g.paused ? pausedText(S, g)
    : g.mode === 'api' ? `调 API，还要约 ${left} 天`
      : g.done >= g.need ? `收尾中，约 ${left} 天`
        : wait === 'queue' ? '排在前一张后面，等它跑完'
          : wait === 'nofit' ? `推理卡放不下老师（至少要 ${g.nMin} 张 H100 的显存）` : `约 ${left} 天`;
  const keep = prog >= GEN.cancelKeep ? `取消后已完成的 ${Math.round(prog * 100)}% 仍将入库${o.kind === 'data' ? '（对应教材已消耗）' : ''}` : `当前取消无法保留进度（需完成至少 ${Math.round(GEN.cancelKeep * 100)}%）`;
  return `<li class="gen-row"><div><b>${esc(o.name)}</b><small>${g.mode === 'api' ? '调用 API 生成，按进度每日扣款' : '占用推理算力生成，不占用训练算力'} · ${esc(state)} · ${keep}</small>
      <div class="progress"><i style="width:${Math.round(Math.min(1, prog) * 100)}%"></i></div></div>
    <div class="ops">${g.paused ? `<button class="btn btn--sm" data-gen="resume" data-id="${esc(o.id)}">恢复</button>` : `<button class="btn btn--sm" data-gen="pause" data-id="${esc(o.id)}">暂停</button>`}<button class="btn btn--sm btn--danger" data-gen="cancel" data-id="${esc(o.id)}">取消</button></div></li>`;
}

export function render(S) {
  const pool = E.poolStats(S);
  const mix = Object.entries(pool.mix).sort((a, b) => b[1] - a[1]);
  const POST = S.mod === 'llm' ? ['chat', 'knowledge', 'code', 'math', 'safety', 'agent'] : [...new Set([...Object.keys(S.data.post), ...Object.keys(S.data.distill || {})])];
  const risky = Object.keys(S.data.risky);
  const ws = E.worldSota(S)?.q ?? null;
  const teachers = Object.entries(S.data.teachers || {});
  const gens = S.orders.filter(o => o.gen);
  const plan = gens.length ? E.genPlan(S) : null;
  const road = S.orders.filter(o => !o.gen && (o.kind === 'data' || o.kind === 'distill'));
  const weak = S.mod === 'llm' ? E.distillOptions(S).filter(o => o.weaker && !o.ok && o.reason.startsWith('比在练的模型还弱')) : [];
  const held = heldOf(S);
  const anyDistill = POST.some(k => Object.keys(levelsOf(S, k)).length);
  const taint = S.data.pool.taintW > 0 ? `语料池包含 ${f1(S.data.pool.taintW)}T token 合成衍生数据（占 ${pct(S.data.pool.taintW / Math.max(1e-9, pool.tokens))}），若占比达到 25% 新训练底座将直接产生谱系污染。` : '';
  return `<h2>数据</h2>
    <div class="card"><div class="card-head"><b>预训练语料池</b><small>${pool.tokens.toFixed(2)}T token · 平均质量 ${pool.quality.toFixed(2)}</small></div>
      <div class="sharebar">${mix.map(([k, v], i) => `<i style="width:${v * 100}%" class="mix-${i % 6}" title="${MIXL[k] || k} ${pct(v)}"></i>`).join('')}</div>
      <div class="chips">${mix.map(([k, v]) => `<span class="chip">${MIXL[k] || k} ${pct(v)}</span>`).join('')}</div>${taint ? `<p class="muted warn">${esc(taint)}</p>` : ''}</div>
    <div class="card"><div class="card-head"><b>后训练数据</b><small>自有 / 蒸馏</small></div>
      <table class="tbl"><tbody>${POST.map(k => {
        const lv = levelsOf(S, k);
        const d = Object.entries(lv).map(([f, x]) => `${esc(teacherName(S, f))} ${x.toFixed(1)}`).join('、');
        return `<tr><td>${POSTL[k] || k}</td><td><div class="progress sm"><i style="width:${Math.min(100, (S.data.post[k] || 0) / 2.5 * 100)}%"></i></div></td><td>${(S.data.post[k] || 0).toFixed(1)}</td><td>${d ? `蒸馏：${d}` : ''}</td></tr>`;
      }).join('')}</tbody></table>
      ${anyDistill || S.jobs.ownOnly ? `<label class="toggle"><input type="checkbox" data-own-only ${S.jobs.ownOnly ? 'checked' : ''} /> 只用自有数据（后训练不再用蒸馏数据；以后想解除老师的天花板，就得这样练）</label>` : ''}
      <p class="muted">蒸馏依赖度 ${pct(S.distillDep)}：依赖度过高会导致技术积累速度下降、研发成本上升。无重载任务时依赖度逐步自然稀释；亦可在「训练」页开启专心研究加速脱敏。</p></div>
    ${teachers.length ? `<div class="card"><div class="card-head"><b>老师</b><small>每家只记最强的一款</small></div><ul class="kv">${teachers.map(([f, t]) => {
      const cats = POST.filter(k => levelsOf(S, k)[f]);
      const gap = ws !== null ? ws - t.q : null;
      return `<li><span>${esc(t.name)}（${t.kind === 'api' ? 'API' : '开源权重'}）· 综合 ${f1(t.q)}${gap === null ? '' : gap > 0.05 ? `，离当前最强还差 ${f1(gap)}` : '，就是当前最强'}</span><b>${cats.map(k => `<button class="btn btn--sm" data-drop="${esc(k)}" data-fam="${esc(f)}" title="清除此类数据，已训练进模型的部分不退">丢弃${POSTL[k] || k}</button>`).join('') || '<small class="muted">数据已停用</small>'}</b></li>`;
    }).join('')}</ul><p class="muted">过度依赖第三方蒸馏数据将导致学生模型性能上限受限，最高无法超越教师模型与行业基准。</p></div>` : ''}
    ${held.length ? `<div class="card"><div class="card-head"><b>这一代暂时不用的老师</b><small>比在练的模型弱</small></div><ul class="kv">${held.map(h => `<li><span>${esc(h.name)}（综合 ${f1(h.q)}）比在练的这一代（${f1(h.modelQ)}）还弱，它的数据先放着不用。确认以后这一代照样掺着练，但单靠它涨不上去，只会把这类训练拖慢。</span><b><button class="btn btn--sm" data-use="${esc(h.fam)}">确认使用</button></b></li>`).join('')}</ul></div>` : ''}
    ${gens.length ? `<div class="card"><div class="card-head"><b>生成订单</b><small>只从推理卡里借，训练卡不动</small></div><ul class="kv">${gens.map(o => genRow(S, o, plan.wait?.[o.id])).join('')}</ul>
      <p class="muted">如需加速生成，可在「算力」页提高推理份额（借用训练算力加速）。暂停后立即释放算力；取消作业时已完成 ${Math.round(GEN.cancelKeep * 100)}% 以上的部分仍可入库。</p></div>` : ''}
    ${weak.length ? `<div class="card"><div class="card-head"><b>比在练模型还弱的老师</b><small>要确认才能下单</small></div><ul class="kv">${weak.map(o => `<li><span>${esc(o.name)}：${esc(o.lock)}</span><b><button class="btn btn--sm btn--danger" data-weak="${esc(o.id)}">确认下单</button></b></li>`).join('')}</ul></div>` : ''}
    ${road.length ? `<div class="card"><div class="card-head"><b>在途数据</b></div><ul class="kv">${road.map(o => `<li><span>${esc(o.name)}</span><b>${inDays(daysBetween(S.day, o.eta))}</b></li>`).join('')}</ul></div>` : ''}
    <div class="card"><div class="card-head"><b>来源风险</b></div>${risky.length ? `<ul>${risky.map(k => `<li class="warn">${esc(k.startsWith('tos_') ? `蒸馏 ${FAMILIES[k.slice(4)]?.company || k} 的 API 输出` : k.startsWith('license_') ? `${FAMILIES[k.slice(8)]?.name || k} 的权重许可有限制` : (E.dataOptions(S).find(d => d.id === k)?.name || k))}</li>`).join('')}</ul>` : '<p class="muted">目前用到的数据来源都比较合规干净。</p>'}</div>`;
}

// 点按钮：生成订单的暂停、恢复、取消；丢掉某位老师的某类数据；下单弱老师的数据、这一代确认使用弱老师。取消、丢掉、弱老师都要再点一次确认。
export function click(S, t, { guard }) {
  const confirmOnce = (b, text) => { if (b.dataset.confirm) return true; b.dataset.confirm = '1'; b.textContent = text; return false; };
  const gen = t.closest('[data-gen]');
  if (gen) {
    const op = gen.dataset.gen, id = gen.dataset.id;
    if (op === 'cancel' && !confirmOnce(gen, '再点一次确认取消')) return;
    return guard(() => decideAct(S, 'data', { id: `gen:${op}:${id}` }));
  }
  const drop = t.closest('[data-drop]');
  if (drop) {
    if (!confirmOnce(drop, '再点一次确认丢掉')) return;
    return guard(() => decideAct(S, 'data', { id: `drop:${drop.dataset.drop}:${drop.dataset.fam}` }));
  }
  const weak = t.closest('[data-weak]');
  if (weak) {
    if (!confirmOnce(weak, '再点一次确认下单')) return;
    return guard(() => after(decideAct(S, 'data', { id: `confirm:${weak.dataset.weak}` }), r => ({ ...r, note: `已下单：${r.ds.name}` })));
  }
  const use = t.closest('[data-use]');
  if (use) {
    if (!confirmOnce(use, '再点一次确认使用')) return;
    return guard(() => decideAct(S, 'data', { id: `use:${use.dataset.use}` }));
  }
}
// “只用自有数据”开关：全公司一个（s.jobs.ownOnly，规格 T2.4），作业不变，只改这一项。训练页的健康卡里也有同一个开关。
export function change(S, t, { guard }) {
  if (t.dataset.ownOnly === undefined) return;
  guard(() => act(S, 'setOwnOnly', { on: !!t.checked }));
}
