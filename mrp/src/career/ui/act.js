// 界面的写操作一律走命令表（规格 M.6.5：界面的 guard 和服务器共用 applyCommand 这一个入口）。
// 单人（史实、自洽）：当场在本地 s 上执行，结果同步返回，和以前直接调引擎一样。
// 联机：由 net.js 装上 remote。纯设定类命令先在本地镜像上跑一遍（立刻校验、拿结果写提示），同时发给服务器；
// 服务器的差分回来以后，net.js 把自家 s 校正成权威值。动世界或带随机的命令只发服务器，返回一个 Promise。
import * as E from '../engine.js';

let remote = null;
// remote：{ send(name, args) → Promise<result>, localOk(name) → bool, fail(err) }；退出联机时传 null。
export function setRemote(r) { remote = r; }
export const isRemote = () => !!remote;

// 以前经 decide 走的这些操作，单人时有卡片没处理就不让做（decide 的 assertCanAct）；联机里卡片不挡时间，不拦。
const QUEUE_GATED = new Set(['startJob', 'cancelJob', 'pauseJob', 'setJobPrio', 'setJobCap', 'setPost', 'setRush', 'setRepair', 'setAutoRepair',
  'focusResearch', 'setPlan', 'setOwnOnly', 'submitEval', 'cancelEval']);

export function act(S, name, args = {}) {
  if (remote && !remote.localOk(name)) return remote.send(name, args);
  if (!remote && QUEUE_GATED.has(name) && E.P().queueBlocks && S.queue?.length) throw new Error('请先处理眼前的事件');
  const r = E.applyCommand(S, { name, args });
  if (!r.ok) throw new Error(r.err);
  if (remote) remote.send(name, args).catch(e => remote.fail?.(e));   // 本地先过了；服务器拒绝时 net.js 把 s 校正回去，这里提示一声
  return r.result;
}
// 结果可能是 Promise（联机的远程命令）：拿到以后再算提示。单人时同步返回。
export const after = (v, f) => (v && typeof v.then === 'function' ? v.then(f) : f(v));

// ---------- 旧的 decide 动作 → 命令（训练页、主界面、顾问用） ----------
// 作业操作：{ op: 'start' | 'cancel' | 'pause' | 'prio' | 'cap' | 'post' | 'rush' | 'repair' | 'autoRepair' | 'focusResearch' | 'plan' | 'ownOnly', … }。
export function jobAct(S, a = {}) {
  switch (a.op) {
    case 'start': return after(act(S, 'startJob', { spec: a.spec ?? a }), job => ({ kind: 'jobs', op: 'start', job }));
    case 'cancel': return act(S, 'cancelJob', { id: a.id });
    case 'pause': return act(S, 'pauseJob', { id: a.id, on: a.on ?? true });
    case 'prio': return act(S, 'setJobPrio', { id: a.id, prio: a.prio });
    case 'cap': return act(S, 'setJobCap', { id: a.id, cards: a.cards ?? null });
    case 'post': return act(S, 'setPost', pick({ id: a.id, dir: a.dir, bench: a.bench, until: a.until }));
    case 'rush': return act(S, 'setRush', { id: a.id, on: !!a.on });
    case 'repair': return act(S, 'setRepair', { on: !!a.on });
    case 'autoRepair': return act(S, 'setAutoRepair', { on: !!a.on });
    case 'focusResearch': return act(S, 'focusResearch', { on: !!a.on });
    case 'plan': return act(S, 'setPlan', { cfg: a.plan ?? null });
    case 'ownOnly': return act(S, 'setOwnOnly', { on: !!a.on });
    default: throw new Error('未知的作业操作');
  }
}
// decide(S, action, arg) 的界面用法：下单、跑分、送评、撤回送评、作业操作。
export function decideAct(S, action, arg = {}) {
  if (action === 'data') return act(S, 'decide', { action: 'data', id: arg.id });
  if (action === 'eval') return act(S, 'decide', pick({ action: 'eval', bench: arg.bench, role: arg.role }));
  if (action === 'submit') {
    const modelId = arg.modelId ?? (arg.role === 'small' ? E.smallModels(S)[0]?.id : S.working) ?? null;
    if (!modelId) throw new Error('没有能送评的模型');
    return act(S, 'submitEval', pick({ modelId, tier: arg.tier ?? E.defaultTier(S), name: arg.name, grant: arg.grant, open: arg.open, replace: arg.replace, papers: arg.papers, licenseTerms: arg.licenseTerms }));
  }
  if (action === 'cancelEval') return act(S, 'cancelEval', { id: arg.id });
  if (action === 'job') return jobAct(S, arg);
  // 兼容出口（maintain、research、train……）不进协议：单人照旧，联机里没有。
  if (remote) throw new Error('联机里没有这个操作');
  return E.decide(S, action, arg);
}
// 去掉 undefined 的键：参数表对“没给”和“给了 undefined”一视同仁，但发给服务器的 JSON 要干净。
function pick(o) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
}
