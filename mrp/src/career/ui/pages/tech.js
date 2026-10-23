// 后台 · 研究：技术积累、研究槽、能学的和只能自研的技术、已掌握的技术。
import * as E from '../../engine.js';
import { TECHS, TECH_BY_ID, fmtDate } from '../../data/core.js';
import { esc, pct } from '../fmt.js';
import { act, after } from '../act.js';
import { JOBS } from '../../data/balance.js';

// 技术：能研究的放卡片（两列），已掌握和以后才出现的收成标签，不再一长串往下排。
export function render(S) {
  const list = TECHS.filter(t => t.mod === S.mod).sort((a, b) => a.from.localeCompare(b.from));
  const own = list.filter(t => S.techs.includes(t.id));
  const opts = E.researchOptions(S).sort((a, b) => a.need - b.need);
  const later = list.filter(t => !S.techs.includes(t.id) && !S.research.some(r => r.id === t.id) && !opts.some(o => o.t.id === t.id));
  const fx = E.knowFx(S);
  const speed = E.researchSpeed(S);
  const slots = E.researchSlots(S);
  const LV = { secret: ['自研', 'bad'], proof: ['有人做出来了', 'warn'], paper: ['论文已公开', 'ok'], open: ['已开源', 'ok'] };
  const firsts = Object.keys(S.firsts || {});
  const card = ({ t, st, need, check }) => {
    const days = Math.ceil(need / Math.max(0.05, speed));
    const [lv, tone] = LV[st.level];
    return `<div class="card tech-card"><div class="card-head"><b>${esc(t.name)}</b><span class="pill ${tone}">${lv}</span></div>
      <p class="tech-desc">${esc(t.desc)}</p>
      <p class="tech-src">${st.src ? `${esc(st.src.who)}${st.src.note ? `：${esc(st.src.note)}` : ''}（${fmtDate(st.src.date)}）` : st.ahead > 0 ? `现实里 ${fmtDate(t.from)} 才出现。现在只能自研，提前了 ${st.ahead} 个月，工作量再多 ${Math.round(st.ahead * 30)}%。` : '业界还没人公开方法，只能自己摸索。'}</p>
      <div class="tech-foot"><small>约 ${days} 天（${need} 人天）${S.researchDone?.[t.id] ? ' · 已有进度' : ''}</small>
      <button class="btn btn--sm ${check.ok ? 'btn--primary' : ''}" data-tech="${t.id}" ${check.ok ? '' : `disabled title="${esc(check.reason)}"`}>${check.ok ? '开始研究' : esc(check.reason)}</button></div></div>`;
  };
  const learn = opts.filter(x => x.st.level !== 'secret');
  const self = opts.filter(x => x.st.level === 'secret');
  return `<h2>研究</h2>
    <div class="card"><div class="card-head"><b>技术积累 ${Math.round(S.know)}</b><small>研究 +${Math.round(fx.research * 100)}% · 预训练效率 +${Math.round(fx.pretrain * 100)}% · 炼炸风险 -${Math.round(fx.risk * 100)}% · 后训练 +${Math.round(fx.post * 100)}%</small></div>
      <p class="muted">团队多年攒下的经验。做研究涨得最快，训练、炼完一代底座、发表论文也会涨；依赖蒸馏时涨得慢，核心研究员被挖走会掉。
      ${S.distillDep > 0.05 ? `蒸馏依赖 ${pct(S.distillDep)}，研究和积累都慢了。` : ''}</p></div>
    <div class="card"><div class="card-head"><b>研究槽 ${S.research.length}/${slots}</b><small>每个槽每天推进 ${speed.toFixed(2)} 人天 · ${E.heavyWork(S).kind === 'none' ? `团队没有重活，研究按 ×${JOBS.RESEARCH.free} 走` : `团队有重活（${E.heavyWork(S).kind === 'repair' ? '检修' : '后训练'}），研究按 ×${JOBS.RESEARCH.busy} 走`}</small></div>
      ${S.research.length ? S.research.map(r => { const t = TECH_BY_ID[r.id]; const p = Math.min(100, r.done / r.need * 100); return `<div class="lab-row"><div><b>${esc(t.name)}</b><small>${esc(LV[r.level]?.[0] || '')} · 约 ${E.daysLeft(S, r)} 天</small></div><div class="progress"><i style="width:${p}%"></i></div><button class="btn btn--sm" data-tech-stop="${t.id}">暂停</button></div>`; }).join('') : '<p class="muted">研究槽空着。从下面挑一项开始。</p>'}
      <p class="muted">槽的数量看团队规模（现在 ${S.team} 人）。暂停的项目进度会保留。团队有重活（后训练、检修）时研究速度 ×${JOBS.RESEARCH.busy}，没有时 ×${JOBS.RESEARCH.free}；预训练、蒸馏、试验是机器干的活，不算重活。想专心研究，就在「训练」页暂停全部后训练。</p></div>
    <h3>可以照着学</h3>
    <div class="tech-grid">${learn.length ? learn.map(card).join('') : '<p class="muted">眼下没有别人公开过、你们还没学的技术。</p>'}</div>
    ${self.length ? `<details class="tech-self"${learn.length ? '' : ' open'}><summary>只能自研（业界还没人公开，最慢；做出来就是首创）· ${self.length} 项</summary><div class="tech-grid">${self.map(card).join('')}</div></details>` : ''}
    <div class="tech-chips"><b>已掌握 ${own.length}</b>${own.map(t => `<span class="chip ${firsts.includes(t.id) ? 'chip--first' : ''}" title="${esc(t.desc)}">${esc(t.name)}${firsts.includes(t.id) ? (S.papers?.[t.id] ? ' · 首创已公开' : ' · 首创未公开') : ''}</span>`).join('')}</div>
    ${later.length ? `<div class="tech-chips tech-chips--future"><b>还摸不到门路</b>${later.map(t => `<span class="chip" title="${esc(t.desc)}">${esc(t.name)} · 现实 ${t.from.slice(2).replace('-', '/')}</span>`).join('')}</div>` : ''}`;
}

export function click(S, t, { guard }) {
  const stop = t.closest('[data-tech-stop]');
  if (stop) return guard(() => after(act(S, 'stopTech', { id: stop.dataset.techStop }), () => ({ note: '先停下了，进度保留' })));
  const tech = t.closest('[data-tech]');
  if (tech) return guard(() => after(act(S, 'researchTech', { id: tech.dataset.tech }), x => ({ note: `开始研究「${x.name}」` })));
}
