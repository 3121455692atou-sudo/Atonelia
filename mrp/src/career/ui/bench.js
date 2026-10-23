// 跑分演出：逐题推进，跑完上榜。不同榜单用不同的图表样式。
import { esc, BG, fmtScore, benchUnit, usd, wait, count } from './fmt.js';
import { barBoard, eloBoard } from './charts.js';
import { openLayer, closeLayer, waitFor } from './state.js';

function board(b, lb) {
  if (b.kind === 'elo') return eloBoard(lb.rows);
  return barBoard(lb.rows, { unit: benchUnit(b), lower: b.kind === 'lower', max: b.kind === 'pct' || b.kind === 'lower' ? 100 : b.hi });
}
function rankText(rank, classRank, cls) {
  const parts = [];
  const tie = r => (r.tied > 1 ? '（并列）' : '');
  if (rank) parts.push(`总榜第 <b>${rank.rank}</b>${tie(rank)} / ${rank.of}`);
  if (classRank && cls) parts.push(`同量级第 <b>${classRank.rank}</b>${tie(classRank)} / ${classRank.of}`);
  return parts.join(' · ');
}

export function playBench(run, lb, rank, classRank, isGoal = false) {
  return new Promise(resolve => {
    const b = run.bench;
    const small = b.items <= 80;
    const root = openLayer(`<div class="bench" style="--bg:url('${BG.arena}')">
      <div class="bench-card">
        <div class="bench-head"><span class="ev-tag">${isGoal ? '官方评测' : '跑分'}</span><h3>${esc(b.name)}</h3><button class="btn btn--ghost btn--sm" data-skip>跳过</button></div>
        <p class="muted">${esc(b.desc)}</p>
        <p class="bench-model">${esc(run.model)}${run.variant ? '（竞技场特调版）' : ''}</p>
        <div class="bench-run">${small ? `<div class="cells">${Array.from({ length: b.items }, () => '<i></i>').join('')}</div>` : '<div class="progress big"><i></i></div>'}
          <div class="bench-live"><span class="bench-count"></span><b class="bench-score"></b></div><p class="bench-ticker muted"></p></div>
      </div></div>`, 'overlay--bench');
    const cells = [...root.querySelectorAll('.cells i')];
    const bar = root.querySelector('.progress i');
    const cnt = root.querySelector('.bench-count');
    const sc = root.querySelector('.bench-score');
    const tick = root.querySelector('.bench-ticker');
    // 预先决定每道题的对错，保证最后的数和成绩一致。
    const total = b.kind === 'elo' ? b.items : b.items;
    const target = b.kind === 'pct' || b.kind === 'lower' ? (run.solved ?? Math.round(run.score / 100 * total)) : null;
    const order = Array.from({ length: Math.min(total, 80) }, (_, i) => i).sort(() => Math.random() - 0.5);
    const okSet = new Set(target !== null && small ? order.slice(0, b.kind === 'lower' ? total - target : target) : []);
    const dur = 2600;
    const t0 = performance.now();
    let finished = false;
    function frame(now) {
      if (finished) return;
      const t = Math.min(1, (now - t0) / dur);
      const n = Math.round(t * total);
      if (small) cells.forEach((c, i) => { if (i < n) c.className = okSet.has(i) ? 'ok' : 'ng'; });
      else if (bar) bar.style.width = `${t * 100}%`;
      if (b.kind === 'elo') { cnt.textContent = `对战 ${count(n)} / ${count(total)}`; sc.textContent = `${Math.round(1000 + (run.score - 1000) * Math.min(1, t * 1.2))}`; }
      else if (target !== null) {
        const done = small ? cells.slice(0, n).filter(c => c.className === 'ok').length : Math.round(n * target / total);
        cnt.textContent = `已完成 ${count(n)} / ${count(total)} 题`;
        sc.textContent = n ? `${b.kind === 'lower' ? '违规 ' : '正确 '}${(b.kind === 'lower' ? (n - done) : done)} · ${(((b.kind === 'lower' ? n - done : done) / Math.max(1, n)) * 100).toFixed(1)}%` : '';
      } else { cnt.textContent = `已完成 ${count(n)} / ${count(total)}`; sc.textContent = t > 0.2 ? fmtScore(b, run.score) : ''; }
      if (b.sample && Math.random() < 0.08) tick.textContent = `正在跑：${b.sample[Math.floor(Math.random() * b.sample.length)]}`;
      if (t < 1) requestAnimationFrame(frame); else end();
    }
    function end() {
      if (finished) return;
      finished = true;
      if (small) cells.forEach(c => { if (!c.className) c.className = 'ng'; });
      const card = root.querySelector('.bench-card');
      card.innerHTML = `<div class="bench-head"><span class="ev-tag">${esc(b.name)}</span><h3>${fmtScore(b, run.score)}</h3></div>
        <p class="bench-rank">${rankText(rank, classRank, run.cls) || (lb.rows.find(r => r.mine) ? `第 <b>${lb.rows.find(r => r.mine).rank}</b> / ${lb.rows.length}` : '')}</p>
        ${run.solved !== null && run.solved !== undefined ? `<p class="muted">${b.kind === 'lower' ? `${b.items} 次攻击中成功 ${run.solved} 次` : `${b.items} 题做对 ${run.solved} 题`} · 评测花费约 ${usd(run.cost)}</p>` : `<p class="muted">评测花费约 ${usd(run.cost)}</p>`}
        <div class="bench-board">${board(b, lb)}</div>
        <button class="btn btn--primary btn--xl" data-done>继续</button>`;
      waitFor(root, '[data-done]').then(() => { closeLayer(); resolve(); });
    }
    root.querySelector('[data-skip]').addEventListener('click', end, { once: true });
    setTimeout(end, dur + 1500);
    requestAnimationFrame(frame);
  });
}

// 发布结果卡上的“市场反应”一行（P3.U2，规格 D11.9）：读发布快照的 snap.expect 和 snap.badges。
// 旧快照没有这两个字段，整行不显示；这一版不评（副线、场地不足、冷却）时也不写结果。
const REACTION_TEXT = { over: '超出预期', meet: '符合预期', flat: '平淡', under_half: '略低预期', under: '不及预期' };
const MARKET_BADGE = { open_top: '开源最强', community: '社区之选', works: '能干活' };
export function marketLine(model) {
  const ex = model?.expect;
  if (!ex || !REACTION_TEXT[ex.result]) return '';
  const badges = (model.badges || []).map(b => MARKET_BADGE[b]).filter(Boolean);
  return `<p class="market-line"><b>市场反应</b>${REACTION_TEXT[ex.result]}${badges.length ? ` · 徽章：${esc(badges.join('、'))}` : ''}</p>`;
}

// 发布：连续跑一套当时的标准评测，最后给出汇总。
export async function playSuite(result) {
  const runs = result.runs;
  const root = openLayer(`<div class="bench" style="--bg:url('${BG.gala}')"><div class="bench-card">
    <div class="bench-head"><span class="ev-tag">发布评测</span><h3>${esc(result.model.name)}</h3><button class="btn btn--ghost btn--sm" data-skip>跳过</button></div>
    ${marketLine(result.model)}
    <ol class="suite">${runs.map(r => `<li><span>${esc(r.bench.name)}</span><span class="progress"><i></i></span><b></b><em></em></li>`).join('')}</ol>
    <div class="suite-foot"></div></div></div>`, 'overlay--bench');
  const items = [...root.querySelectorAll('.suite li')];
  let skip = false;
  root.querySelector('[data-skip]').addEventListener('click', () => { skip = true; }, { once: true });
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i];
    const li = items[i];
    li.classList.add('running');
    if (!skip) { li.querySelector('i').style.transition = 'width .45s linear'; requestAnimationFrame(() => { li.querySelector('i').style.width = '100%'; }); await wait(480); }
    else li.querySelector('i').style.width = '100%';
    li.classList.remove('running');
    li.querySelector('b').textContent = fmtScore(r.bench, r.score);
    li.querySelector('em').innerHTML = r.rank ? `总榜 ${r.rank.rank}/${r.rank.of}${r.classRank ? ` · 同量级 ${r.classRank.rank}` : ''}` : '';
    if (r.rank?.rank === 1) li.classList.add('top');
  }
  root.querySelector('.suite-foot').innerHTML = '<button class="btn btn--primary btn--xl" data-done>继续</button>';
  await waitFor(root, '[data-done]');
  closeLayer();
}
