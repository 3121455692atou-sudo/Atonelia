// 选择面板：送评（规格 T10.3，原发布面板）。送评时按今天的样子冻结候选，名字、开源、技术报告也在这时定；安全评测按日历天走，评完自动发布。
// 每个能送评的模型一块（旗舰、上一代收尾、小模型），各有自己的评测档、开源一行和技术报告；小模型多一个“发哪一个”的下拉，换了就按选中的模型重画这一块（change）。
// 后台「训练」页的“送评”按钮在原位展开同一块（form），点了以后读的也是同一套（pick）。名字那一行在 release_name.js，开源那一行在 release_open.js。
import * as E from '../../engine.js';
import { TECH_BY_ID } from '../../data/core.js';
import { EVAL } from '../../data/balance.js';
import { RELEASE_GAP, deployDays } from '../../data/supply.js';
import { esc, usd, params, icon } from '../fmt.js';
import { getState } from '../state.js';
import * as releaseName from './release_name.js';
import * as releaseOpen from './release_open.js';

const TIERS = ['full', 'standard', 'quick', 'skip'];
// 这一档评完以后风险怎么算、能不能备案（和 riskSafety、filingSafety 同一口径）。备案只对国内的语言模型有意义。
function tierText(S, tier, days) {
  const filing = S.company.country === 'CN' && S.mod === 'llm';
  if (tier === 'skip') {
    const fx = EVAL.SKIP_FX;
    return `今天就发布。口碑 −${Math.abs(fx.rep)}、品牌 −${Math.round((1 - fx.brand) * 100)}%，出事和官司按安全最多 ${EVAL.TIERS.skip.cap} 算${filing ? '，国内对话产品不能拿它备案' : ''}。`;
  }
  const t = EVAL.TIERS[tier];
  const adj = t.adj + E.modifier(S, 'evalAdj');
  const risk = adj > 0 ? `按安全 +${adj} 算` : '按安全原值算';
  return `${days} 天后自动发布。之后出事、打官司${risk}${t.cap < 99 ? `，最多算到 ${t.cap}` : ''}${filing ? '，可以拿去备案' : ''}。`;
}
// 评测档：四个单选，各带一句后果；默认档按 T10.3（frontier、bigtech 标准，其余快速；备案没过时标准）。
function tierPick(S, key, line) {
  const def = E.defaultTier(S);
  return `<fieldset class="tier-pick"><legend>安全评测</legend>${TIERS.map(tier => {
    const days = E.evalDaysFor(S, tier, line);
    return `<label class="tier-opt"><input type="radio" name="rel-tier-${key}" value="${tier}" data-tier ${tier === def ? 'checked' : ''} />
      <span><b>${E.TIER_LABEL[tier]}${tier === 'skip' ? '' : ` ${days} 天`}</b><small>${esc(tierText(S, tier, days))}</small></span></label>`;
  }).join('')}</fieldset>`;
}
// 技术报告：你们自己摸索出来、业界还没公开过的技术，发布那天公开。
function papersRow(S) {
  const papers = E.unpublishedFirsts(S).map(id => TECH_BY_ID[id]).filter(Boolean);
  if (!papers.length) return '';
  return `<div class="paper-row"><b>技术报告</b>${papers.map(t => `<label class="toggle"><input type="checkbox" class="rel-paper" value="${t.id}" /> ${esc(t.name)}</label>`).join('')}
    <small class="muted">发布那天公开：口碑、品牌和技术积累上升，招人更容易；但从此别家也能照着学。不勾就继续保密，以后发布时还能再选。</small></div>`;
}
const LINE_TITLE = { main: '旗舰', prev: '上一代', small: '小模型' };
// 期待预告（规格 D11.9、D11.10）：按现在的能力假设今天就发布，调 expectPreview。返回 null 时整行不显示。
// 文字、档位、能拿的徽章都从引擎来；只有中文标签是界面的。opts 是面板上的勾选（顶替、开源），原样交给 expectPreview，
// 所以勾了“顶替”就按旗舰预告，拨了开源勾选徽章跟着变，和发布当天的判定一个口径。
const TIER_TEXT = { champion: '冠军', challenger: '挑战者', small: '小团队' };
const RESULT_TEXT = { over: '超出预期', meet: '符合预期', flat: '平淡', under_half: '略低预期', under: '不及预期' };
const BADGE_TEXT = { open_top: '开源最强', community: '社区之选', works: '能干活' };
export function preview(S, m, opts = {}) {
  let p = null;
  try { p = E.expectPreview(S, m, { replace: !!opts.replace, open: opts.open }); } catch (err) { console.error('期待预告算不出来', err); return ''; }
  if (!p) return '';
  const facts = [];
  if (TIER_TEXT[p.tier]) facts.push(`档位：${TIER_TEXT[p.tier]}`);
  if (RESULT_TEXT[p.result]) facts.push(`按现在的水平：${RESULT_TEXT[p.result]}`);
  const badges = (p.badges || []).map(b => BADGE_TEXT[b]).filter(Boolean);
  facts.push(`能拿的徽章：${badges.length ? badges.join('、') : '暂无'}`);
  return `<div class="expect-box"><b>期待预告</b><p>${esc(p.text || '')}</p>${facts.length ? `<small>${esc(facts.join(' · '))}</small>` : ''}</div>`;
}
// 顶替在线旗舰（规格 D1）：只在这一版比在线旗舰弱（releaseLine 默认给副线）时出现，默认不勾；小模型那一块没有。
export function replaceRow(S, m, line) {
  if (!m || line === 'small') return '';
  if (E.releaseLine(S, m) !== 'side') return '';
  return `<div class="rel-replace" data-replace-box>
    <label class="toggle"><input type="checkbox" id="rel-replace-${line}" data-replace /> 顶替在线旗舰</label>
    <p class="muted" data-replace-hint>作为副线发布：不上线服务、不按旗舰评期待。</p></div>`;
}

// 一块送评表单。m 是要送评的模型；line 是 'main'（主线在练）、'prev'（上一代收尾）、'small'（待发布的小模型）。
// 不能送评时（还没练够、这一条线已经有候选在评测）写原因，按钮置灰。opts.choose：小模型有好几个时给“发哪一个”下拉（训练页在某个小模型那一行原位展开时不给）。
export function form(S, m, line, opts = {}) {
  if (!m) return '';
  wire();
  const role = line === 'small' ? 'small' : 'flagship';
  const plan = E.releaseNamePlan(S, m, role === 'small' ? { role: 'small' } : {});
  const why = E.submitBlock(S, m, line);
  const label = E.modelLabel(m);
  const gap = Math.max(0, RELEASE_GAP + E.modifier(S, 'releaseGapDays'));
  const since = Math.max(0, (m.postDays || 0) - (m.relDays || 0));
  const head = line === 'small'
    ? `<small>${params(m.total)} / 激活 ${params(m.active)} · 推理成本约 ${usd(E.costPerMillion(S, m))}/百万 token</small>`
    : `<small>送评：${esc(label)} → 候选「${esc(plan.name)}」（按今天的能力冻结）· 这一版练了 ${since} 天 · 发布后灰度约 ${deployDays(m)} 天</small>`;
  const notes = line === 'small'
    ? '送评以后这个小模型就冻结了，评测期间不能后训练；小模型的评测天数减半。评完那天按当天的对手评标签和市场期待。'
    : `评测期间 ${label} 照常后训练。发布那天按当天的对手评标签和市场期待；路线变了，顶替旗舰的按那天的路线开闭。`;
  const pickSmall = line === 'small' && opts.choose !== false && E.smallModels(S).length > 1
    ? `<label class="small-pick">发哪一个<select id="rel-small-pick">${E.smallModels(S).map(x => `<option value="${x.id}" ${x.id === m.id ? 'selected' : ''}>${esc(E.releaseNamePlan(S, x, { role: 'small' }).name)}（${params(x.total)}）</option>`).join('')}</select></label>` : '';
  return `<div class="release-opt" data-line="${line}"><b>${LINE_TITLE[line]}：${esc(plan.name)}</b>${head}${pickSmall}
    <div data-name-row>${releaseName.render(S, m, role, { line, replace: false })}</div>
    <div data-expect-row>${preview(S, m)}</div>
    ${replaceRow(S, m, line)}
    <div data-open-row>${releaseOpen.render(S, m, role)}</div>
    ${why ? `<p class="muted">${esc(why)}${line !== 'small' && why.startsWith('再后训练') ? `（同一条线自上次送评以来要再练满 ${gap} 天）` : ''}。</p>` : tierPick(S, line, line)}
    ${why ? '' : `<p class="muted">${esc(notes)}</p>${papersRow(S)}`}
    <button class="btn btn--primary" data-blocked="${why ? '1' : '0'}" data-pick="${line === 'main' ? 'flagship' : line}" data-model="${m.id}" ${why ? 'disabled' : ''}>送评${LINE_TITLE[line]}</button></div>`;
}

export function render(S) {
  const w = E.workingModel(S);
  const prev = E.prevModel(S);
  const smalls = E.smallModels(S);
  const blocks = [
    w && w.stage === 'post' ? form(S, w, 'main') : `<p class="muted">旗舰：${esc(E.releaseBlock(S) || '没有在后训练的模型')}。</p>`,
    prev && prev.stage === 'post' ? form(S, prev, 'prev') : '',
    smalls.length ? form(S, smalls[0], 'small') : '',
  ];
  const evals = (S.evals || []).map(e => `<li>${esc(e.plan?.name || '')} · ${E.TIER_LABEL[e.tier]} · 还剩 ${Math.max(0, E.daysBetween(S.day, e.until))} 天</li>`).join('');
  return `<div class="picker">
    <div class="picker-head"><h3>送评</h3><button class="icon-btn" data-close aria-label="关闭">${icon('close')}</button></div>
    <p class="muted">送评时按今天的样子冻结候选，名字、开源、技术报告也在这时定；安全评测按日历天走，不占训练卡，评完自动发布：当天跑一遍标准评测、成绩公开上榜，服务再灰度几天到两周。</p>
    ${evals ? `<ul class="eval-now">${evals}</ul>` : ''}
    ${blocks.join('')}
  </div>`;
}

// “发哪一个”换了小模型：只重画小模型那一块，标题、参数和推理成本、开源一行跟着选中的模型走（选择面板 openPicker 把 change 转到这里）。
// 名字、开源勾选这些这一块里的输入会按新模型重新给默认值；别的块（旗舰、上一代）不动。
export function change(root, t, S) {
  if (t?.id !== 'rel-small-pick') return false;
  const box = t.closest?.('.release-opt');
  const m = E.smallModels(S).find(x => x.id === t.value);
  if (!box || !m) return false;
  box.outerHTML = form(S, m, 'small');
  return true;
}

// 选了哪一个模型：旗舰、上一代看按钮上的 data-model，小模型看“发哪一个”下拉。
function modelIn(S, box) {
  const id = box.dataset.line === 'small'
    ? box.querySelector('#rel-small-pick')?.value || box.querySelector('[data-pick]')?.dataset.model
    : box.querySelector('[data-pick]')?.dataset.model;
  return (S.models || []).find(x => x.id === id) || null;
}
// 这一块现在的填写状态（重画子行时带上，不丢玩家填的名字、勾的授权和顶替）。
function stateOf(box) {
  const nameEl = box.querySelector('[data-rel-name]');
  const grantEl = box.querySelector('[data-grant]:checked');
  const openEl = box.querySelector('#rel-open, #rel-small-open');
  const rep = box.querySelector('[data-replace]');
  return {
    name: nameEl ? nameEl.value : undefined,
    grant: grantEl ? grantEl.dataset.grant : null,
    open: openEl ? !!openEl.checked : undefined,
    replace: !!(rep && rep.checked),
  };
}
// 按现在的填写内容校验名字：原因照抄引擎的 reason，写在输入框下面；不合法时送评按钮置灰。
function refreshName(S, box, m, role) {
  const st = stateOf(box);
  const input = box.querySelector('[data-rel-name]');
  const p = releaseName.checkName(S, m, input?.value ?? '', { grant: st.grant, replace: st.replace, open: st.open });
  if (input) input.dataset.ok = p.ok ? '1' : '0';
  const err = box.querySelector('[data-name-err]');
  if (err) { err.textContent = p.ok ? '' : p.reason; err.hidden = !!p.ok; }
  const btn = box.querySelector('[data-pick]');
  if (btn) btn.disabled = !p.ok || btn.dataset.blocked === '1';
  return p;
}
// 重画名字那一行（勾了授权、或顶替改了发布角色时，锁定状态和条件跟着变）。
function redrawName(S, box, m, role) {
  const row = box.querySelector('[data-name-row]');
  if (!row) return;
  const st = stateOf(box);
  row.innerHTML = releaseName.render(S, m, role, { line: box.dataset.line, name: st.name, grant: st.grant, replace: st.replace, open: st.open });
}
// 勾了“顶替在线旗舰”：开源那一行按顶替后的角色重画，期待预告那一行跟着重画，名字那一行的授名条件也按新角色重看。
function toggleReplace(S, box) {
  const m = modelIn(S, box);
  if (!m) return;
  const role = box.dataset.line === 'small' ? 'small' : 'flagship';
  const st = stateOf(box);
  // 先重画开源那一行（顶替以后开闭可能被路线锁定、勾选框没了），名字和预告再按重画后的开闭读。
  const openRow = box.querySelector('[data-open-row]');
  if (openRow) openRow.innerHTML = releaseOpen.render(S, m, role, { replace: st.replace, open: st.open });
  redrawName(S, box, m, role);
  redrawExpect(S, box, m);
  const hint = box.querySelector('[data-replace-hint]');
  if (hint) hint.textContent = st.replace ? '按旗舰评期待，低于在线旗舰会判倒退。' : '作为副线发布：不上线服务、不按旗舰评期待。';
  refreshName(S, box, m, role);
}
// 期待预告按这一块现在的勾选重画（开源那一行重画以后再读，顶替后开闭可能被路线锁定）。
function redrawExpect(S, box, m) {
  const row = box.querySelector('[data-expect-row]');
  if (!row) return;
  const st = stateOf(box);
  row.innerHTML = preview(S, m, { replace: st.replace, open: st.open });
}
// 拨了开源勾选：授名条件里有开闭的要按新值重看，期待预告的徽章也跟着变。
function toggleOpen(S, box) {
  const m = modelIn(S, box);
  if (!m) return;
  const role = box.dataset.line === 'small' ? 'small' : 'flagship';
  redrawName(S, box, m, role);
  redrawExpect(S, box, m);
  refreshName(S, box, m, role);
}
// 勾选史实型号名（单选，可不选）：勾上时名字框换成那个型号名（有 series 的可以再改），取消时换回引擎给的建议名。
function toggleGrant(S, box, t) {
  const m = modelIn(S, box);
  if (!m) return;
  const role = box.dataset.line === 'small' ? 'small' : 'flagship';
  for (const x of box.querySelectorAll('[data-grant]')) if (x !== t) x.checked = false;
  const input = box.querySelector('[data-rel-name]');
  const hn = t.checked ? E.grantsFor(S, m.role === 'small' ? 'small' : 'flagship').find(h => h.id === t.dataset.grant) : null;
  if (input) {
    const st = stateOf(box);
    input.value = hn ? hn.name : E.releaseNamePlan(S, m, { grant: null, replace: st.replace, open: st.open }).name || '';
  }
  redrawName(S, box, m, role);
  refreshName(S, box, m, role);
}
// 输入时当场校验（input 事件）：选择面板和训练页原位展开的同一块都要实时反应。两处的壳只转 change，所以这里自己挂一个
// document 上的委托监听（模块里只挂一次，Node 里没有 addEventListener 就跳过）。
let wired = false;
function wire() {
  if (wired || typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
  wired = true;
  document.addEventListener('change', ev => {
    const t = ev.target;
    const box = t?.closest?.('.release-opt');
    if (!box) return;
    const S = getState();
    if (!S) return;
    if (t.matches?.('[data-replace]')) toggleReplace(S, box);
    else if (t.matches?.('[data-grant]')) toggleGrant(S, box, t);
    else if (t.matches?.('#rel-open, #rel-small-open')) toggleOpen(S, box);
  });
  document.addEventListener('input', ev => {
    const t = ev.target;
    if (!t?.matches?.('[data-rel-name]')) return;
    const box = t.closest('.release-opt');
    const S = getState();
    if (!box || !S) return;
    const m = modelIn(S, box);
    if (!m) return;
    refreshName(S, box, m, box.dataset.line === 'small' ? 'small' : 'flagship');
  });
}

// 点了“送评”：在这一块里读评测档、开源勾选、技术报告、名字、史实型号名、顶替和“发哪一个”（勾选框要在面板关掉之前读）。
// 开源那一行按路线锁定时没有勾选框，open 传 undefined，由引擎按路线定；评测档没选到时按默认档。
// 名字和授权交给 submitEval 的 opts：名字不合法的按钮已经置灰；真送出去也由引擎再校验一次（原因照原样提示）。
export function pick(root, b) {
  const box = b.closest?.('.release-opt') || root;
  const line = b.dataset.pick;
  const tier = box.querySelector('input[data-tier]:checked')?.value;
  const papers = [...box.querySelectorAll('.rel-paper:checked')].map(x => x.value);
  const open = (line === 'small' ? box.querySelector('#rel-small-open') : box.querySelector('#rel-open'))?.checked;
  const nameEl = box.querySelector('[data-rel-name]');
  const grantEl = box.querySelector('[data-grant]:checked');
  const replaceEl = box.querySelector('[data-replace]');
  const named = {
    ...(nameEl ? { name: nameEl.value } : {}),
    ...(grantEl ? { grant: grantEl.dataset.grant } : {}),
    ...(replaceEl?.checked ? { replace: true } : {}),
  };
  const arg = { ...(tier ? { tier } : {}), open, papers, ...named };
  if (line === 'small') return ['submit', { role: 'small', modelId: box.querySelector('#rel-small-pick')?.value || b.dataset.model, ...arg }];
  if (line === 'prev') return ['submit', { modelId: b.dataset.model, ...arg }];
  return ['submit', arg];
}
