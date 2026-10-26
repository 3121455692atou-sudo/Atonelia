import {resumePostOnlyFromHome} from './post_only_recovery.js';
import {openHomePostTraining} from './home_training.js';
// 主流程：标题 → 剧本与公司 → 按天推进（可暂停、五档速度）→ 事件 / 跑分 → 结算。
// 这里管启动、屏幕切换和时钟；主界面在 home.js，后台在 office.js，选择面板和事件在 flow.js，共用的状态和弹层在 state.js。
// 别的界面模块都不从这里导入（会成循环）；下面转出的几个名字是给 scripts/ui_smoke.mjs 这类外部脚本用的。
import * as E from '../engine.js';
import {defaultPlaySetup,playSetupReady,renderPlaySetup,playSetupAction,applyPlaySetup,validatePlaySetup} from './panels/play_setup.js';
import { SCENARIOS, PLAYABLE, START_RESOURCES, TIERS, GPUS, fmtDate, END, monthsBetween, personaPlate } from '../data/core.js';
import { START_STANCE, routeLabel } from '../data/routes.js';
import { esc, usd, count, art, face, icon, BG, MOD_LABEL, COUNTRY, hasEmotion } from './fmt.js';
import { getState, setWorld, getWorld, getMp, ui, clock, bind, save, toast, openLayer, closeLayer } from './state.js';
import { load, drop, getRaw, readSaved, downloadText, SAVE_KEY, HOF_KEY, readWorldMeta, takeWorldLeave, loadWorld, lastKind } from './storage.js';
import { renderHome, homeLine, monthReport, followAdvice, toggleNowRow, selectHomeModel } from './home.js';
import { openOffice } from './office.js';
import { runQueue, presentPostOnly, finishGame, openPicker, enterGame, doDecision, playReleases } from './flow.js';
import { defaultSolo, renderSolo, soloClick, soloInput, soloChange, startSolo, validDraft } from './pages/solo_setup.js';
import { renderLobby, lobbyClick, lobbyChange } from './pages/lobby.js';
import { renderReplay } from './pages/replay.js';
import { openCard } from './inbox.js';
import { practiceKind, practiceURL } from './practice_context.js';
import { startPracticeTutorial } from './practice_tutorial.js';
import { roomCmd, isHost } from './net.js';

export { getState, save, toast, openLayer, closeLayer };
export { waitFor } from './state.js';
export { restartToTitle, backToTitle } from './flow.js';

const app = document.getElementById('app');
const layer = document.getElementById('overlay-root');

// ---------- 渲染入口 ----------
export function render() {
  if (ui.screen === 'title') return renderTitle();
  if (ui.screen === 'select') return renderSelect();
  if (ui.screen === 'solo') return renderSoloScreen();
  if (ui.screen === 'result') return renderResult();
  if (ui.screen === 'lobby') return renderMpScreen(renderLobby);
  if (ui.screen === 'replay') return renderMpScreen(() => renderReplay(getMp()));
  return keepFocus(() => renderHome(app));
}
// 联机的大厅和复盘：整页单列。大厅消息随时会来，重画时把正在打字的输入框和光标还原。
function renderMpScreen(html) {
  keepFocus(() => { app.className = 'app app--solo app--mp'; app.innerHTML = html(); });
}
const FOCUS_KEYS = ['mpSet', 'mpCo', 'mpChat'];
function keepFocus(draw) {
  const a = document.activeElement;
  const key = a && app.contains(a) ? FOCUS_KEYS.find(k => a.dataset?.[k] !== undefined) : null;
  const val = key ? a.dataset[key] : null, text = key ? a.value : null;
  let start = null, end = null;
  try { start = a?.selectionStart ?? null; end = a?.selectionEnd ?? null; } catch { /* select 没有光标 */ }
  draw();
  if (!key) return;
  const attr = key.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
  const el = app.querySelector(val === '' ? `[data-${attr}]` : `[data-${attr}="${CSS.escape(val)}"]`);
  if (!el) return;
  if (el.value !== text && el.type !== 'checkbox' && el.tagName !== 'SELECT') el.value = text;
  el.focus();
  try { if (start !== null) el.setSelectionRange(start, end); } catch { /* 不是文本框 */ }
}
function renderSoloScreen() {
  app.className = 'app app--solo';
  app.innerHTML = renderSolo(ui.solo || (ui.solo = defaultSolo()));
}

// 标题页：读档只走 readSaved（safeLoadState）。有存档但读不了时，不假装没有，说明原因，给“导出原始存档”和“丢弃”。
function renderTitle() {
  const r = readSaved();
  const saved = r.ok ? r.s : null;
  const canContinue = !!saved && saved.status === 'playing';
  const worldMeta = readWorldMeta();
  const broken = !r.ok && !r.empty;
  const hof = load(HOF_KEY) || [];
  app.className = 'app app--title';
  app.innerHTML = `
  <section class="title-screen" style="--bg:url('${BG.lab}')">
    <div class="title-lineup" aria-hidden="true">${['claude', 'qwen', 'deepseek_pro', 'gemini', 'gpt'].map((id, i) => `<img src="${art(id, 'stage')}" alt="" style="--i:${i}" />`).join('')}</div>
    <div class="title-card">
      <span class="eyebrow">2023 — 2026 · REAL TIMELINE</span>
      <h1>模型育成计划</h1>
      <p>从 ChatGPT 上线后的第二个月开始，带领一家模型公司走到今天。<br />找数据、炼模型、跑榜单、做产品、融资上市。</p>
      <div class="title-actions">
        ${canContinue ? `<button class="btn ${worldMeta ? 'btn--ghost' : 'btn--primary'} btn--xl" data-act="continue">继续：${esc(personaPlate(PLAYABLE.find(p => p.id === saved.charId), saved.date).name)} · ${fmtDate(saved.date)}</button>` : ''}
        ${worldMeta ? `<button class="btn ${canContinue ? 'btn--ghost' : 'btn--primary'} btn--xl" data-act="continue-world">继续：自洽世界 · ${esc(worldMeta.company)} · ${fmtDate(worldMeta.dateMonth || worldMeta.date)}</button>` : ''}
        <button class="btn ${canContinue || worldMeta ? 'btn--ghost' : 'btn--primary'} btn--xl" data-act="new">开始新的一局</button>
        <button class="btn btn--ghost btn--xl" data-act="tutorial-basic">新手引导</button>
        <button class="btn btn--ghost" data-act="tutorial-advanced">经营操作引导</button>
        <button class="btn btn--ghost btn--xl" data-act="solo">单人 · 自洽世界</button>
        <button class="btn btn--ghost btn--xl" data-act="mp">联机</button>
        ${hof.length ? `<button class="btn btn--ghost" data-act="hof">名人堂 · ${hof.length}</button>` : ''}
      </div>
      ${ui.worldError ? `<p class="title-note"><b>自洽世界存档读不了：</b>${esc(ui.worldError)}。它还留在原处没动；想留着请先在设置里导出。</p>` : ''}
      ${broken ? `<p class="title-note"><b>浏览器里有一份存档，但读不了：</b>${esc(r.reason)}。它还留在原处没动；点「开始新的一局」会把它覆盖掉，想留着请先导出。</p>
        <div class="title-actions"><button class="btn btn--ghost" data-act="save-export">导出原始存档</button><button class="btn btn--ghost" data-act="save-drop">丢弃这份存档</button></div>` : ''}
    </div>
    <footer class="title-foot"><span>角色美术 · ZipZipPipe 等原作者</span><span>真实事件与模型名称仅作背景，数值为游戏模拟</span></footer>
  </section>`;
}

function renderSelect() {
  const sc = SCENARIOS.find(x => x.id === ui.scenario);
  const sel = ui.pick ? PLAYABLE.find(p => p.id === ui.pick) : null;
  ui.playSetup ||= defaultPlaySetup();
  app.className = 'app app--select';
  app.innerHTML = `
  <section class="select-screen">
    <header class="select-head">
      <button class="icon-btn" data-act="to-title" aria-label="返回">${icon('back')}</button>
      <div><span class="eyebrow">CHOOSE YOUR LAB</span><h2>选择剧本和公司</h2></div>
    </header>
    <div class="scenario-row">${SCENARIOS.map(x => `<button class="scenario ${x.id === ui.scenario ? 'is-on' : ''}" data-act="scenario" data-id="${x.id}"><b>${esc(x.title)}</b><small>${esc(x.short)} · ${monthsBetween(x.start, END) + 1} 个月</small></button>`).join('')}</div>
    <p class="scenario-desc">${esc(sc.desc)}</p>
    <div class="select-body">
      <div class="select-grid" role="list">
        ${PLAYABLE.map(p => {
          const rel = E.startModel(p.id, sc.id);
          return `<button class="pick-card ${p.id === ui.pick ? 'is-on' : ''}" data-act="pick" data-id="${p.id}" role="listitem">
            <img src="${art(p.artId, 'card')}" alt="" loading="lazy" />
            <span class="pick-name">${esc(personaPlate(p, sc.start).name)}</span>
            <span class="pick-co">${esc(p.company)}</span>
            <span class="pick-tags"><i>${COUNTRY[p.country]}</i><i>${MOD_LABEL[p.modality]}</i><i>${TIERS[p.tier].label}</i></span>
            <span class="pick-model">${rel ? esc(rel.text) : '开局：没有模型'}</span>
          </button>`;
        }).join('')}
      </div>
      ${sel ? selectDetail(sel, sc) : `<aside class="select-detail select-detail--empty"><p>选一家公司，看看它在这个剧本里的起点。</p></aside>`}
    </div>
  </section>`;
}
function selectDetail(p, sc) {
  const res = START_RESOURCES[p.tier][sc.id];
  const rel = E.startModel(p.id, sc.id);
  const gpus = Object.entries(E.startGpus(p, sc.id)).map(([k, n]) => `${count(n)} 张 ${(GPUS[k]?.label || k).replace(/（.*?）/, '')}`).join(' + ');
  const plate = personaPlate(p, sc.start);
  const hard = p.country === 'CN' ? '算力受出口管制限制，但独占国内市场、安全诉讼压力较小' : p.tier === 'frontier' ? '资源最多，但树大招风：安全稍差就会官司缠身' : '';
  return `
  <aside class="select-detail">
    <button class="icon-btn select-detail__close" data-act="unpick" aria-label="返回公司列表">${icon('close')}</button>
    <div class="select-detail__scroll" tabindex="0" aria-label="公司资料">
    <div class="select-detail__art" style="--bg:url('${BG.lab}')"><img src="${art(p.artId, 'stage')}" alt="${esc(plate.name)}" />${p.smallArtId ? `<img class="second" src="${art(p.smallArtId, 'stage')}" alt="" />` : ''}</div>
    <div class="select-detail__info">
      <span class="eyebrow">${esc(p.company)}</span>
      <h3 tabindex="-1">${esc(plate.name)} ${plate.label ? `<small>${esc(plate.label)}</small>` : ''}</h3>
      <ul class="facts">
        <li><b>类型</b>${MOD_LABEL[p.modality]} · ${TIERS[p.tier].label} · ${COUNTRY[p.country]}</li>
        <li><b>开源路线</b>${esc(routeLabel(START_STANCE[p.id]?.[sc.id]))}</li>
        <li><b>开局模型</b>${rel ? esc(rel.detail) : '没有，需要从零预训练'}</li>
        <li><b>开局资源</b>现金 ${usd(res.cash)} · ${gpus} · 团队 ${res.team} 人</li>
        ${hard ? `<li><b>处境</b>${hard}</li>` : ''}
        ${p.note ? `<li><b>说明</b>${esc(p.note)}</li>` : ''}
      </ul>
      <a class="credit" href="${esc(p.source_url)}" target="_blank" rel="noopener">角色美术 · ${esc(p.credit || '原作者')} ↗</a>
    </div>
    </div>
    <footer class="select-detail__launch">${selectLaunch(p,sc)}</footer>
  </aside>`;
}

function selectLaunch(p,sc) {
  return `<div class="select-detail__settings">${renderPlaySetup(ui.playSetup,{compact:true})}</div>
    <button class="btn btn--primary btn--xl" data-act="start" data-id="${p.id}" ${playSetupReady(ui.playSetup)?'':'disabled'}>${playSetupReady(ui.playSetup)?`开始游戏 · ${fmtDate(sc.start)}`:'先选择上方玩法'}</button>`;
}
function updateSelectSetup(el) {
  if(ui.screen!=='select'||!playSetupAction(ui.playSetup,el.dataset.setupAction,el.dataset.setupValue))return;
  const launch=app.querySelector('.select-detail__launch');
  const p=PLAYABLE.find(x=>x.id===ui.pick),sc=SCENARIOS.find(x=>x.id===ui.scenario);
  if(!launch||!p)return render();
  const expanded=launch.querySelector('.play-setup-tuning')?.open;
  const scrollTop=launch.querySelector('.select-detail__settings')?.scrollTop||0;
  // Repaint only the controls: preserve the company artwork, reading position and focus.
  launch.innerHTML=selectLaunch(p,sc);
  const tuning=launch.querySelector('.play-setup-tuning');
  if(tuning)tuning.open=!!expanded;
  launch.querySelector('.select-detail__settings').scrollTop=scrollTop;
  launch.querySelector(`[data-setup-action="${CSS.escape(el.dataset.setupAction)}"][data-setup-value="${CSS.escape(el.dataset.setupValue||'')}"]`)?.focus({preventScroll:true});
}

// ---------- 时间（像钢铁雄心：可以暂停、五档速度；弹窗、后台打开时自动停） ----------
const SPEED_MS = [0, 1000, 650, 420, 280, 180];
function scheduleTick() {
  const S = getState();
  clearTimeout(clock.timer);
  if (getMp()) return;                   // 联机：时间由服务器推（M.6.1），本地不跑 tickDay
  if (!S || S.status !== 'playing' || ui.screen !== 'home' || !clock.speed || clock.busy || layer.firstElementChild) return;
  clock.timer = setTimeout(stepDay, SPEED_MS[clock.speed]);
}
function setSpeed(n) {
  const S = getState();
  if (n === clock.speed) return scheduleTick();
  clock.speed = n;
  if (n) clock.last = n;
  if (ui.screen === 'home' && S) render();
  scheduleTick();
}
// 自洽世界每天推进的耗时：每 30 天看一次最近 30 天的平均，手机跑不动就冻掉一家最弱的电脑公司。
const soloPerf = { samples: [], frozen: 0 };
function weakestBot(world) {
  const view = world.publicView();
  const live = new Set(view.companies.filter(c => c.kind === 'bot' && !c.frozen).map(c => c.id));
  const qOf = id => view.rels.filter(r => r.org === id).reduce((a, r) => Math.max(a, r.q), -Infinity);
  return [...live].sort((a, b) => qOf(a) - qOf(b) || (a < b ? -1 : 1))[0] || null;
}
export function reduceSoloCompanies(world) {
  const counts = world.publicView().companies.filter(c => !c.frozen).length;
  if (counts <= 3) return null;
  const id = weakestBot(world);
  if (!id) return null;
  const c = world.companies[id];
  if (!c) return null;
  c.frozen = true;
  if (c.s) c.s.status = 'frozen';
  const day = world.day;
  world.news.unshift({ date: String(day).slice(0, 7), day, type: 'frozen', title: `${c.name} 公司退出了竞争`, detail: '手机跑不动这么多公司，这家以后不再发布。之前发布的模型还在。' });
  soloPerf.frozen += 1;
  return c.name;
}
function noteSoloTick(world, ms) {
  soloPerf.samples.push(ms);
  if (soloPerf.samples.length > 30) soloPerf.samples.shift();
  if (soloPerf.samples.length < 30) return;
  const avg = soloPerf.samples.reduce((a, b) => a + b, 0) / soloPerf.samples.length;
  if (avg <= 150) return;
  if (world.publicView().companies.filter(c => !c.frozen).length <= 3) return;
  const name = reduceSoloCompanies(world);
  soloPerf.samples = [];
  if (name) toast(`手机有点卡，${name} 公司退出了竞争`);
}
async function stepWorldDay(world) {
  const S = getState();
  const t0 = performance.now();
  const out = E.tick(world);
  noteSoloTick(world, performance.now() - t0);
  if (out?.paused) {
    if (S?.queue?.length) await runQueue();
    if (S?.status === 'ended') return finishGame();
    render();
    return scheduleTick();
  }
  if (S && S.status === 'ended') return finishGame();
  const pid = world.settings?.you;
  for (const x of out?.fresh || []) if (x.c.id === pid && x.m?.name) toast(`${x.m.name} 发布了，去看看同场公司的反应`);
  save();
  render();
  if (S?.queue?.length) {
    await runQueue();
    if (S?.status === 'ended') return finishGame();
    render();
  }
  await presentPostOnly(S);
  scheduleTick();
}
async function stepDay() {
  const S = getState();
  if (!S || S.status !== 'playing' || clock.busy || layer.firstElementChild) return;
  if (clock.down) return scheduleTick();
  const W = getWorld();
  if (W) return stepWorldDay(W);
  const out = E.tickDay(S);
  if (out) {
    for (const n of out.notes.slice(0, 3)) toast(n);
    if (out.report) { save(); if(!E.isPostOnly(S))monthReport(out.report); }
  }
  if (S.status === 'ended') return finishGame();
  render();
  // 候选评完那天（规格 T6.2、T10.1）：时钟停下，播发布结果卡（和点“发布”一样），播完再走。
  if (out?.releases?.length && !E.isPostOnly(S)) {
    save();
    clock.busy = true;
    try { await playReleases(out.releases); } finally { clock.busy = false; }
    if (S.status === 'ended') return finishGame();
    render();
  }
  if (S.queue.length) {
    await runQueue();
    if (S.status === 'ended') return finishGame();
    render();
  }
  await presentPostOnly(S);
  scheduleTick();
}

function startGame(id) {
  if(ui.screen!=='select')return;
  // 史实局和自洽世界的模块单例不能混：从自洽世界开史实局一律先整页重载。
  if (getWorld()) {
    try { globalThis.location?.reload?.(); } catch { /* 没有 location 的测试环境 */ }
    return;
  }
  if(!playSetupReady(ui.playSetup)){toast('请先选择「只后训练」或「完整玩法」');return;}
  try{validatePlaySetup(ui.playSetup);}catch(e){toast(e.message);return;}
  const s = E.createSinglePlayerGame(id, ui.scenario, (Date.now() ^ (Math.random() * 1e9)) >>> 0);
  E.enableAutomation(s);
  applyPlaySetup(s,ui.playSetup);
  enterGame(s, { persist: true });
}
// 进入自洽世界：getState() 返回玩家那家的 s，世界另外放在 state.js 里。
function enterSolo(world, { persist = true } = {}) {
  const pid = world.settings?.you || Object.values(world.companies).find(c => c.kind === 'human' && c.s)?.id;
  if (!pid || !world.companies?.[pid]?.s) { toast('这个世界里没有你经营的公司'); return false; }
  world.settings ??= {};
  world.settings.you = pid;
  soloPerf.samples = [];
  soloPerf.frozen = 0;
  ui.worldError = null;
  setWorld(world);
  enterGame(world.companies[pid].s, { persist: false });
  if (persist) save();
  return true;
}
function renderWorldResult(S, r) {
  const rows = getWorld()?.result?.standings || [];
  app.className = 'app app--result';
  app.innerHTML = `<section class="result-screen" style="--bg:url('${BG.gala}')"><div class="result-card">
    <h2>自洽世界 · 终局身家排名</h2><p>${esc(S.company.company)} · 第 ${r.place} / ${r.of} 名</p>
    <h3>最终身家 ${usd(r.wealth)}</h3><p class="muted">截止日 ${esc(r.end)} · 实际结算至 ${esc(r.settledThrough)}</p>
    ${r.pendingEvents ? `<p class="muted">截止时有 ${r.pendingEvents} 项未决事件，保留供回看，未发生的选择效果不计入终局身家。</p>` : ''}
    <table class="tbl"><thead><tr><th>排名</th><th>公司</th><th>身家</th></tr></thead><tbody>${rows.map(x => `<tr><td>${x.place}</td><td>${esc(x.name)}</td><td>${usd(x.wealth)}</td></tr>`).join('')}</tbody></table>
    <p class="muted">身家按持股比例 × 公司价值结算，未上市公司估值打八折；清算公司按清算价值计。</p>
    <div class="result-actions"><button class="btn btn--ghost" data-act="office">回看后台</button><button class="btn btn--primary btn--xl" data-act="new">再来一局</button></div>
    </div></section>`;
}
function renderResult() {
  const S = getState();
  const r = S.result;
  if (r.kind === 'world') return renderWorldResult(S, r);
  const p = r.parts;
  const reason = { complete: `走到了 ${fmtDate(r.date)}`, goal_failed: `第三次没达成董事会目标（「${r.goal}」），董事会更换了管理层`, bankrupt: '资金链断裂' }[r.reason];
  const happy = r.rank === 'S' || r.rank === 'SS' || r.rank === 'A';
  app.className = 'app app--result';
  app.innerHTML = `
  <section class="result-screen" style="--bg:url('${BG.gala}')">
    <div class="result-card">
      <div class="result-hero"><img src="${art(S.persona.artId, 'stage', happy && hasEmotion(S.persona.artId, 'happy') ? 'happy' : 'neutral')}" alt="" />
        <div class="result-rank"><span class="eyebrow">${esc(S.company.company)}</span><span class="rank rank--${r.rank}">${r.rank}</span><b>综合 ${r.total}</b><small>${esc(reason)}</small></div></div>
      <ul class="breakdown">
        <li><span>营收</span><b>${p.bizScore}</b></li><li><span>${S.company.kind === 'division' ? '对集团贡献' : '估值 / 市值'}</span><b>${p.capitalScore}</b></li><li><span>市场份额</span><b>${p.marketScore}</b></li>
        <li><span>榜单</span><b>${p.capScore}</b></li><li><span>口碑</span><b>${p.rep}</b></li><li><span>董事会目标</span><b>${p.goalScore}</b></li>
        ${p.penalty ? `<li><span>丑闻与败诉</span><b class="bad">-${p.penalty}</b></li>` : ''}
      </ul>
      <p class="muted">最终模型 ${esc(r.model || '无')} · 近三月平均月收入 ${usd(r.revenue)} ${S.company.kind === 'division' ? '' : `· 估值 ${usd(r.valuation)}`}</p>
      ${r.basis ? `<p class="muted">这一局按增长考核：月收入对标 ${usd(r.basis.revenue)}${S.company.kind === 'division' ? '' : `，估值对标 ${usd(r.basis.valuation)}`}。</p>` : ''}
      <div class="result-actions"><button class="btn btn--ghost" data-act="office">回看后台</button><button class="btn btn--primary btn--xl" data-act="new">再来一局</button></div>
    </div>
  </section>`;
}

// ---------- 事件绑定 ----------
app.addEventListener('click', ev => {
  // 联机大厅、聊天的按钮（data-mp）：不受“弹层开着不响应”的限制，聊天随时能发。
  const mpEl = ev.target.closest('[data-mp]');
  if (mpEl && !mpEl.disabled) { lobbyClick(mpEl, mpEl.closest('.mp-chat')?.parentElement || app); return; }
  const el = ev.target.closest('[data-act]');
  if (!el || el.disabled) return;
  // 事件或弹窗正开着时，主界面上的按钮不响应（防止盖掉正在等选择的事件）
  if (ui.screen === 'home' && (clock.busy || layer.firstElementChild)) return;
  const id = el.dataset.id;
  switch (el.dataset.act) {
    case 'open-post-training': openHomePostTraining();break;
    case 'open-model-training': openOffice('train',{trainingKind:'overview'});break;
    case 'post-only-resume': resumePostOnlyFromHome({modelId:id,jobId:el.dataset.job,modelToken:el.dataset.modelToken||null});break;
    case 'post-only-cards': presentPostOnly(getState(),{force:true});break;
    case 'continue': { const r = readSaved(); if (playable(r)) resumeFrom(r); else { toast(r.ok ? '这一局已经打完了' : `存档无法读取：${r.reason}`); render(); } break; }
    case 'save-export': { const raw = getRaw(SAVE_KEY); if (raw !== null) downloadText(`model-raising-unreadable-${Date.now()}.json`, raw); else toast('已经没有这份存档了'); break; }
    case 'save-drop': if (el.dataset.confirm) { drop(SAVE_KEY); render(); } else { el.dataset.confirm = '1'; el.textContent = '再点一次确认丢弃'; } break;
    case 'tutorial-basic':
    case 'tutorial-advanced': {
      if (ui.screen !== 'title') break;
      window.location.assign(practiceURL(el.dataset.act === 'tutorial-basic' ? 'basic' : 'advanced'));
      break;
    }
    case 'new':
      if (getWorld()) { ui.screen = 'title'; render(); break; }
      ui.playSetup=defaultPlaySetup(); ui.screen = 'select'; ui.pick = null; render(); window.scrollTo(0, 0); break;
    case 'solo': ui.solo = defaultSolo(); ui.screen = 'solo'; render(); window.scrollTo(0, 0); break;
    case 'mp': ui.screen = 'lobby'; render(); window.scrollTo(0, 0); break;
    case 'mp-home': if (getMp()?.S) { ui.screen = 'home'; render(); } break;
    case 'mp-back': ui.screen = 'title'; render(); break;
    case 'mp-speed': roomCmd('speed', { speed: Number(id) }).catch(e => toast(e.message)); break;
    case 'mp-pause': roomCmd('pause').catch(e => toast(e.message)); break;
    case 'mp-resume': roomCmd('resume').catch(e => toast(e.message)); break;
    case 'mp-card': openCard(Number(id)); break;
    case 'mp-inbox': { if (getState()?.queue?.length) openCard(0); else toast('收件箱是空的'); break; }
    case 'mp-chat-toggle': { const m = getMp(); if (m) { m.chatOpen = !m.chatOpen; m.unread = 0; render(); } break; }
    case 'solo-back': ui.screen = 'title'; render(); window.scrollTo(0, 0); break;
    case 'solo-set': { if (ui.solo) { soloClick(ui.solo, el); render(); } break; }
    case 'solo-start': {
      if (!ui.solo || ui.screen!=='solo') break;
      try {
        const r = startSolo(ui.solo);
        enterSolo(r.world);
      } catch (e) { toast(e?.message || String(e)); render(); }
      break;
    }
    case 'continue-world': {
      loadWorld().then(r => {
        if (!r.ok) { ui.worldError = r.reason; render(); return; }
        enterSolo(r.world, { persist: false });
      });
      break;
    }
    case 'hof': openHof(); break;
    case 'to-title': ui.screen = 'title'; render(); break;
    case 'play-setup': updateSelectSetup(el);break;
    case 'solo-play-setup': if(ui.solo){playSetupAction(ui.solo.playSetup,el.dataset.setupAction,el.dataset.setupValue);render();}break;
    case 'mp-play-setup': lobbyClick(el,app);break;
    case 'scenario': ui.scenario = id; render(); break;
    case 'pick': ui.pick = id; render(); app.querySelector('.select-detail__info h3')?.focus({preventScroll:true}); break;
    case 'unpick': { const picked=ui.pick;ui.pick = null; render();app.querySelector(`[data-act="pick"][data-id="${CSS.escape(picked||'')}"]`)?.focus({preventScroll:true});break; }
    case 'start': startGame(id); break;
    case 'talk': ui.lineIdx += 1; { const p = app.querySelector('.bubble p'); if (p) p.textContent = homeLine(getState()); } break;
    case 'open-train': openOffice('train'); break;
    // 主界面“进行中”卡：点一行在原位展开两三个常用操作（暂停 / 继续、优先 / 正常、去训练页）。
    case 'now-row': toggleNowRow(id); render(); break;
    // 主界面模型阵列：选中一个模型（只改显示）；对它发起后训练 = 打开训练页、后训练表单预选这个模型，确认后才开始。
    case 'pick-model': selectHomeModel(id); render(); break;
    case 'post-model': openOffice('train', { post: id }); break;
    case 'job': doDecision('job', { op: el.dataset.op, id, ...(el.dataset.on !== undefined ? { on: el.dataset.on === '1' } : {}), ...(el.dataset.prio ? { prio: el.dataset.prio } : {}) }); break;
    case 'open-data': openPicker('data'); break;
    case 'open-eval': openPicker('eval'); break;
    case 'open-release': openPicker('release'); break;
    case 'speed': setSpeed(Number(id)); break;
    case 'speed-toggle': setSpeed(clock.speed ? 0 : clock.last); break;
    case 'quick': if (id === 'data' || id === 'release' || id === 'eval') openPicker(id); else openOffice(id === 'more' ? undefined : id); break;
    case 'dismiss-report': ui.report = null; el.innerHTML = ''; break;
    case 'more-toggle': ui.moreOpen = !el.parentElement.open; break;
    case 'office': openOffice(undefined, { readOnly: ui.screen === 'result' }); break;
    case 'office-model': openOffice('model'); break;
    case 'advice': followAdvice(id); break;
    case 'advice-skip': ui.skip.add(`${getState().date}|${id}`); render(); break;
    default: break;
  }
});
// 开局设置页：输入框边打边校验，滑块拖动时只改草稿、松手再重画。
app.addEventListener('input', ev => {
  // 联机大厅的输入框：只改草稿，不重画（免得打字被打断）。
  if (ui.screen === 'lobby') { lobbyChange(ev.target); return; }
  if (ui.screen !== 'solo' || !ui.solo) return;
  const t = ev.target;
  const err = soloInput(ui.solo, t);
  if (err === null) return;
  const box = app.querySelector(`[data-error="${t.dataset.solo}"]`);
  if (box) box.textContent = err;
  const start = app.querySelector('[data-act="solo-start"]');
  if (start) start.disabled = !validDraft(ui.solo) || !playSetupReady(ui.solo.playSetup);
});
app.addEventListener('change', ev => {
  if (ui.screen === 'lobby') { if (lobbyChange(ev.target) && ev.target.tagName === 'SELECT') render(); return; }
  if (ui.screen !== 'solo' || !ui.solo) return;
  if (soloChange(ui.solo, ev.target)) render();
});
// 空格暂停 / 继续，数字键 1–5 换速度；按着鼠标时不刷新画面，免得点不中。
document.addEventListener('keydown', ev => {
  // 聊天框里回车就发。
  if (ev.key === 'Enter' && ev.target.matches?.('[data-mp-chat]')) { ev.preventDefault(); lobbyClick({ dataset: { mp: 'chat' } }, ev.target.closest('.mp-chat')?.parentElement || app); return; }
  if (ui.screen !== 'home' || !getState() || ev.target.closest?.('input, select, textarea') || layer.firstElementChild) return;
  const mp = getMp();
  if (mp) {
    if (!isHost(mp)) return;
    if (ev.code === 'Space') { ev.preventDefault(); roomCmd(mp.clock?.paused ? 'resume' : 'pause').catch(e => toast(e.message)); }
    else if (/^Digit[1-4]$/.test(ev.code)) roomCmd('speed', { speed: Number(ev.code.slice(5)) - 1 }).catch(e => toast(e.message));
    return;
  }
  if (ev.code === 'Space') { ev.preventDefault(); setSpeed(clock.speed ? 0 : clock.last); }
  else if (/^Digit[1-5]$/.test(ev.code)) setSpeed(Number(ev.code.slice(5)));
});
app.addEventListener('pointerdown', () => { clock.down = true; });
document.addEventListener('pointerup', () => { clock.down = false; });
document.addEventListener('visibilitychange', () => { const S = getState(); if (document.hidden && S && S.status === 'playing') save(); });
function openHof() {
  const hof = load(HOF_KEY) || [];
  const root = openLayer(`<div class="picker"><div class="picker-head"><h3>名人堂</h3><button class="icon-btn" data-close>${icon('close')}</button></div>
    <ul class="hof">${hof.map(h => `<li>${face(PLAYABLE.find(p => p.id === h.charId)?.artId)}<div><b>${esc(h.name)}</b><small>${esc(h.company)} · ${esc(SCENARIOS.find(x => x.id === h.scenario)?.title || '')} · ${h.reason === 'complete' ? '完成' : '中途结束'}</small></div>${h.kind === 'world' ? `<span>第 ${h.place} / ${h.of} 名</span><em>${usd(h.wealth)}</em>` : `<span class="rank rank--${h.rank}">${h.rank}</span><em>${h.total}</em>`}</li>`).join('') || '<li class="muted">还没有记录。</li>'}</ul></div>`, 'overlay--picker');
  root.addEventListener('click', ev => { if (ev.target.closest('[data-close]') || ev.target === root) closeLayer(); });
}

// 读到的存档进游戏：boot 和标题页的“继续”共用。时间一律从暂停开始（enterGame 把速度归零）。
const playable = r => r.ok && r.s.status === 'playing';
function resumeFrom(r) {
  setWorld(null);
  enterGame(r.s);
}
// Esc 关掉后台和选择面板；事件、跑分、里程碑正等着玩家选，关了会让流程停住，不响应。
document.addEventListener('keydown', ev => {
  if (ev.key !== 'Escape' || ev.defaultPrevented) return;
  const top = layer.firstElementChild;
  if (!top) return;
  const office = top.classList.contains('overlay--office');
  if (!office && !top.classList.contains('overlay--picker')) return;
  closeLayer();
  if (office) render();
});

bind({ render, scheduleTick, setSpeed });
// 启动：刚离开自洽世界时先回标题；否则接着玩最后玩的那一种（刷新页面不会从自洽世界掉进另一份史实存档），
// 没记过就史实局优先，再试着恢复自洽世界。
export const bootReady = (async function boot() {
  if (practiceKind()) return startPracticeTutorial();
  if (takeWorldLeave()) return render();
  const r = readSaved();
  const tryWorld = async () => {
    if (!readWorldMeta()) return false;
    const w = await loadWorld();
    if (w.ok) { enterSolo(w.world, { persist: false }); return true; }
    ui.worldError = w.reason;
    return false;
  };
  if (lastKind() === 'world' && await tryWorld()) return;
  if (playable(r)) return resumeFrom(r);
  if (lastKind() !== 'world' && await tryWorld()) return;
  render();
})();
