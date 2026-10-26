// 主流程里的“做决定”和“处理事件”：选择面板、下决定、按顺序放事件和里程碑、结算、回到标题。
import * as E from '../engine.js';
import { recordHall } from './hof.js';
import { daysBetween, inDays } from '../engine.js';
import { esc } from './fmt.js';
import { act, decideAct } from './act.js';
import { viewFor } from './views/index.js';
import { playBench, playSuite } from './bench.js';
import { getState, setState, getWorld, getMp, ui, clock, save, render, toast, openLayer, closeLayer, waitFor, scheduleTick } from './state.js';
import { load, store, drop, SAVE_KEY, HOF_KEY } from './storage.js';
import * as dataPanel from './panels/data.js';
import * as evalPanel from './panels/eval.js';
import * as releasePanel from './panels/release.js';
import { usesPostTrainingCards, beginPostTraining } from './post_training_entry.js';

// 做一个决定（不推进时间）。跑分、发布（跳过评测当天发布）有演出；下单、送评、作业操作只提示一下。
export async function doDecision(action, arg = {}) {
  if (ui.busy) return;
  ui.busy = true;
  const S = getState();
  let postPlanSessionId = null;
  try {
    // 联机里卡片不挡时间（M.6.4）：在收件箱里自己点开处理，这里不先放卡；结束由服务器推复盘。
    const mp = !!getMp();
    if (S.queue.length && !mp) { await runQueue(); return; }
    const current = action === 'job' && arg.op === 'pause' && arg.on === false ? S.jobs.list.find(j => j.id === arg.id) : null;
    const spec = action === 'job' && arg.op === 'start' ? arg.spec ?? arg : current;
    const r = usesPostTrainingCards(S, spec)
      ? await beginPostTraining(S, spec, current ? { existingOnly: true, jobId: current.id, resume: true } : { resume: true, updateDirection: !!arg.updateDirection })
      : await decideAct(S, action, arg);
    postPlanSessionId = r?.postPlan?.sessionId ?? null;
    save();
    if (r?.kind === 'eval') await playBench(r.run, E.leaderboard(S, r.run.benchId, { playerModel: r.run.modelId }), r.rank, r.classRank);
    if (r?.kind === 'release') { ui.emotion = 'happy'; await playSuite(r); toast(releaseToast(S, r)); }
    if (r?.kind === 'data') toast(`已下单：${r.ds.name}，${inDays(daysBetween(S.day, r.eta))}到`);
    if (r?.kind === 'submit') toast(`已送评「${r.name}」，${r.days} 天后评完自动发布`);
    if (r?.kind === 'cancelEval') toast('撤回了送评：这一版回到在练模型上，以后可以再送评');
    if (r?.kind === 'jobs') toast(r.note || JOB_TOAST[r.op]?.(r) || '训练安排改好了');
    if (S.queue.length && !mp) await runQueue();
    if (S.status === 'ended' && !mp) return finishGame();
  } catch (err) {
    toast(err.message || String(err));
    console.error(err);
  } finally {
    ui.busy = false;
    if (S && S.status === 'playing') render();
    if (postPlanSessionId && getState() === S && S.status === 'playing') {
      const { openOffice } = await import('./office.js');
      if (getState() === S) openOffice('train', { postPlanSessionId });
    }
    scheduleTick();
  }
}
// 发布后的那句提示。训练线的副线（比在线旗舰弱、没勾“顶替”）不上线服务、没有灰度，只公布成绩；
// 其余的（顶替在线旗舰的、小模型线）开始灰度，写几天后全量。
export function releaseToast(S, r) {
  if (r.line === 'side' && r.model?.role !== 'small') return `${r.model.name} 作为副线发布：成绩已公布，不替换在线服务`;
  return `${r.model.name} 开始灰度上线，${inDays(daysBetween(S.day, r.until))}全量`;
}
// 作业操作（主界面“进行中”卡原位展开的那几个按钮）的提示。
const JOB_TOAST = {
  pause: r => (r.on ? '先暂停了，进度保留' : '接着练了'),
  prio: r => (r.prio === 'high' ? '改成优先：先分卡给它' : '改成正常'),
  cancel: () => '取消了这项作业',
};
// 候选评完自动发布（tickDay 的 out.releases，规格 T6.2）：一项项播发布结果卡（和点“发布”一样），播完提示上线安排。
export async function playReleases(list = []) {
  const S = getState();
  for (const r of list) {
    if (!r?.model) continue;
    ui.emotion = 'happy';
    try { await playSuite(r); } catch (err) { console.error(err); closeLayer(); }
    toast(releaseToast(S, r));
  }
}
export async function runQueue() {
  const S=getState();
  if(E.isPostOnly(S)) { E.postOnlyEvents(S); await save(); return; }
  clock.busy = true;
  try { await drainQueue(); } finally { clock.busy = false; }
}
// 眼前的事件一条条放完。一条放不出来（数据坏了、id 认不出）不能卡住时间：丢掉它，写进公司日志，提示一声，接着放下一条。
export async function drainQueue() {
  let S;
  while ((S = getState()) && S.status === 'playing' && S.queue.length) {
    const item = S.queue[0];
    try {
      if (await playItem(S)) return;
    } catch (err) {
      skipItem(S, item, err);
    }
  }
  closeLayer();
}
// 放一条，返回 true 表示这一局在这条里结束了。
async function playItem(S) {
  const view = E.currentEvent(S);
  if (view.kind === 'goal') {
    const root = openLayer(goalHtml(view), 'overlay--event');
    await waitFor(root, '[data-choice]');
    const res = await act(S, 'resolveEvent', { choiceId: 'check' });
    save();
    if (res.run) await playBench(res.run, E.leaderboard(S, res.run.benchId, { cls: res.goal.check.classOnly ? E.clsOf(E.liveModel(S)) : null, playerModel: res.run.modelId }), null, null, true);
    const r2 = openLayer(goalResultHtml(res), 'overlay--event');
    await waitFor(r2, '[data-next]');
    closeLayer();
    if (S.status === 'ended') return true;
    render();
    return false;
  }
  // 按事件种类找演出方式（ui/views/index.js）；没有专门视图的都是对话加选项。
  const choice = await viewFor(view.kind)(S, view);
  // 决策被新导航/新局替换，不消费旧事件，也不覆盖较新的弹层。
  if (choice === null) return true;
  const res = await act(S, 'resolveEvent', { choiceId: choice });
  save();
  render();
  if (res.text) {
    const root = openLayer(`<div class="ev ev--result"><div class="ev-head"><span class="ev-tag">${esc(view.tag)}</span><h3>${esc(res.title)}</h3></div><p class="ev-pick">你选择了：<b>${esc(res.choice)}</b></p><p class="ev-result">${esc(res.text)}</p><button class="btn btn--primary btn--xl" data-next>继续</button></div>`, 'overlay--event');
    await waitFor(root, '[data-next]');
  }
  closeLayer();
  return false;
}
// 丢掉放不出来的那一项。resolveEvent 可能已经把它出队了（出错在后面的演出里），所以按身份找，还在队里才删。
function skipItem(S, item, err) {
  console.error('跳过了一条无法显示的事件', item, err);
  const i = S.queue.indexOf(item);
  if (i >= 0) S.queue.splice(i, 1);
  logLine(S, `跳过了一条无法显示的事件：${item?.kind ?? 'event'}${item?.id !== undefined ? ` ${item.id}` : ''}（${err?.message || err}）`);
  closeLayer();
  toast('跳过了一条无法显示的事件');
  save();
}
// 公司日志（和引擎 sim/log.js 一个格式，最多留 200 条）。界面不能直接导入 sim/，这里自己写一行。
function logLine(S, text) {
  if (!Array.isArray(S.log)) S.log = [];
  S.log.push({ date: S.day || S.date, text });
  if (S.log.length > 200) S.log.shift();
}
export function goalHtml(v) {
  return `<div class="ev ev--goal"><div class="ev-head"><span class="ev-tag">董事会目标</span><h3>${esc(v.title)}</h3></div>
    <p>${esc(v.text)}</p><p class="muted">没达成时，董事会会给一次两个月的宽限；宽限后还没达成，记一次警告。警告攒到三次，董事会就会更换管理层（每达成一个目标，抵掉一次警告）。</p>
    <button class="btn btn--primary btn--xl" data-choice="check">${esc(v.choices[0].label)}</button></div>`;
}
export function goalResultHtml(res) {
  const t = { met: ['达成！', 'ok'], grace: ['没有达成：董事会给了两个月宽限', 'warn'], failed: [`宽限期结束，仍未达成。估值和口碑受挫，董事会警告 ${res.strikes}/3`, 'bad'] }[res.outcome];
  return `<div class="ev ev--goal"><div class="ev-head"><span class="ev-tag">董事会目标</span><h3>${esc(res.goal.title)}</h3></div>
    <p class="goal-res goal-res--${t[1]}">${t[0]}</p><p>${esc(res.detail)}。要求：${esc(res.need)}。</p>
    <button class="btn btn--primary btn--xl" data-next>${res.outcome === 'failed' ? '查看结果' : '继续'}</button></div>`;
}

// 主界面的选择面板（订数据、跑分、送评）：每个面板管自己的内容，点了哪一项、勾了什么由面板的 pick 读出来。
// 原来的“团队任务”面板（panels/train.js）由 P2.4b 删除：后训练、检修、专心研究都在后台「训练」页。
const PANELS = { data: dataPanel, eval: evalPanel, release: releasePanel };
export async function openPicker(kind) {
  const panel = PANELS[kind];
  const root = openLayer(panel.render(getState()), 'overlay--picker');
  root.addEventListener('click', async ev => {
    if (ev.target.closest('[data-close]') || ev.target === root) return closeLayer();
    const b = ev.target.closest('[data-pick],[data-bench]');
    if (!b || b.disabled) return;
    // 勾选框要在关掉面板之前读。
    const [action, arg] = panel.pick(root, b);
    closeLayer();
    await doDecision(action, arg);
  });
  // 面板里的下拉改了（送评面板的“发哪一个”）：面板自己按新选的重画那一块。
  if (panel.change) root.addEventListener('change', ev => panel.change(root, ev.target, getState()));
}

export function finishGame() {
  const S = getState();
  clearTimeout(clock.timer);
  clock.speed = 0;
  const world = getWorld();
  const record = recordHall(S, world, { ...(S.result.kind === 'world' ? { kind: 'world', place: S.result.place, wealth: S.result.wealth, of: S.result.of } : {}), at: new Date().toISOString(), charId: S.charId, name: S.persona.name, company: S.company.company, scenario: S.scenario, rank: S.result.rank, total: S.result.total, reason: S.result.reason, date: S.date, model: S.result.model, modelId: S.result.modelId ?? null, revenue: S.result.revenue, valuation: S.result.valuation });
  record.then(ok => {
    if (!ok) toast('名人堂没有保存成功，重新打开本局结算可以重试');
    // 异步记账期间玩家可能已开另一局，不能把新局覆盖成旧局。
    if (getState() === S && getWorld() === world) save();
  });
  save();
  ui.screen = 'result';
  render();
}
export function restartToTitle() { setState(null); drop(SAVE_KEY); ui.screen = 'title'; closeLayer(); render(); }
// 回标题前先存档；打完的那一局不重存（结算时已经存过，回看后台是只读的）。
export function backToTitle() {
  const S = getState();
  if (S && S.status === 'playing') save();
  clearTimeout(clock.timer);
  ui.screen = 'title';
  closeLayer();
  render();
}

// ---------- 换一局（新开局、继续、读档、导入存档） ----------
// 换局时要清掉的界面状态各模块自己登记（后台登记 resetOffice：当前页、立项和蒸馏的草稿、榜单选择）；
// 登记表放在这里，office.js 导入这里，不会反过来成环。
const RESET_HOOKS = [];
export const onEnterGame = fn => { RESET_HOOKS.push(fn); };
// 进入一局：时间归零（暂停），台词、月报卡、跳过的建议、后台的草稿全清掉，回到主界面，把眼前的事件放完。
// persist：马上存一次档（新开局、导入；从存档读进来的不用）。
export function enterGame(s, { persist = false } = {}) {
  clearTimeout(clock.timer);
  clock.speed = 0;
  if (!getMp() && getWorld()) E.finishWorld(getWorld());
  setState(s);
  ui.skip.clear();
  ui.report = null;
  ui.lineIdx = 0;
  ui.emotion = 'neutral';
  ui.moreOpen = false;
  ui.postOnlyShown=null;
  ui.postOnlyResumeToken=null;ui.busy=false;
  clock.postPlanToken=null;clock.busy=false;
  for (const fn of RESET_HOOKS) fn();
  ui.screen = 'home';
  if (persist) save();
  closeLayer();
  render();
  return runQueue().then(async () => { if (getState() === s) { if (s.status === 'ended') finishGame(); else {render();await presentPostOnly(s);} } }).catch(err => { console.error(err); toast('处理事件时出错了'); });
}

// A new real card session interrupts only for the player's deck/hand, not economics.
export async function presentPostOnly(s,{force=false}={}) {
  if(!E.isPostOnly(s)||s.status!=='playing'||getState()!==s||ui.screen!=='home')return false;
  const id=E.pendingPostOnlySession(s);
  if(!id||(!force&&ui.postOnlyShown===id))return false;
  const saved=await save();
  if(saved?.ok===false||getState()!==s||ui.screen!=='home'||!E.isPostOnly(s)||E.pendingPostOnlySession(s)!==id)return false;
  const {openOffice}=await import('./office.js');
  if(getState()!==s||ui.screen!=='home'||!E.isPostOnly(s)||E.pendingPostOnlySession(s)!==id)return false;
  ui.postOnlyShown=id;clock.speed=0;clearTimeout(clock.timer);
  openOffice('train',{postPlanSessionId:id});return true;
}
