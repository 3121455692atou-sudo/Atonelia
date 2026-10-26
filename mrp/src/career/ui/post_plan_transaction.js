// Card commands and the single-player post-training entry share one durable write.
// Existing engine commands, multiplayer commands and storage formats are unchanged.
import { applyCommand, postTarget, postJobFor, postPlanModelToken, trainablePostModel, isPostOnly, P } from '../engine.js';
import { SAVE_KEY, setRaw, saveWorld, markLastKind } from './storage.js';
import { getState, getWorld, getMp, clock, scheduleTick } from './state.js';

const pending = new WeakSet();
export const postPlanPending = s => !!s && pending.has(s);

export async function persistPostPlanDraft(draft, world, liveState) {
  if (!world) {
    if (!setRaw(SAVE_KEY, JSON.stringify(draft))) return { ok: false, reason: '本地存档未写入；本次操作尚未提交' };
    markLastKind('history'); // Metadata is best effort; only the main write gates reveal.
    return { ok: true, kind: 'history' };
  }
  if (world.settings?.mp || world.mirror) throw Error('联机后训练没有卡牌会话');
  const entry = Object.entries(world.companies || {}).find(([, c]) => c.s === liveState);
  if (!entry) throw Error('当前公司不属于这个单机世界');
  const [id, company] = entry;
  const prospective = { ...world, companies: { ...world.companies, [id]: { ...company, s: draft } } };
  return saveWorld(prospective);
}

// Dependency injection makes failure/interrupt tests possible without browser storage.
// A result (including the first/next hand) is returned only after main-save success.
async function transact(state, mutate, {
  world = null, persist = persistPostPlanDraft, current = () => true,
} = {}) {
  if (!state) throw Error('没有当前局面');
  if (pending.has(state)) throw Error('正在保存上一操作，请稍候');
  if (world?.settings?.mp || world?.mirror) throw Error('联机后训练没有卡牌会话');
  pending.add(state);
  try {
    const draft = structuredClone(state);
    const result = mutate(draft, { world, companyId: state.charId, multiplayer: false });
    if (!current()) throw Error('当前局面已改变，本次操作未提交');
    const saved = await persist(draft, world, state);
    if (!saved || saved.ok !== true) throw Error(saved?.reason || '存档未写入；本次操作尚未提交');
    // UI is locked while awaiting persistence. A stale detached view is never revealed.
    if (!current()) throw Error('存档已写入，但当前界面已切换；请重新读取该存档');
    for (const key of Object.keys(state)) if (!Object.hasOwn(draft, key)) delete state[key];
    Object.assign(state, draft);
    return result;
  } finally { pending.delete(state); }
}

function apply(draft, name, args, ctx) {
  const r = applyCommand(draft, { name, args }, ctx);
  if (!r.ok) throw Error(r.err);
  return r.result;
}

export async function transactPostPlan(state, command, options = {}) {
  if (!command?.name?.startsWith('postPlan.')) throw Error('不是后训练会话命令');
  return transact(state, (draft, ctx) => apply(draft, command.name, command.args, { ...ctx, postPlanActor: options.actor ?? 'manual' }), options);
}

// Start/resume the real job and open its existing model session in the same save.
// A rejected write leaves neither a new job nor an orphan session in live state.
// An ordinary page visit may resume an existing job but must never create one.
export async function transactPostTraining(state, spec, options = {}) {
  if (spec?.kind !== 'post' || spec.bench) throw Error('此入口只用于普通后训练');
  const modelId = options.modelId ?? postTarget(state, { ...spec, target: spec.target ?? 'main' })?.id;
  const token = Object.hasOwn(options, 'modelToken') ? options.modelToken : postPlanModelToken(state, modelId);
  return transact(state, (draft, ctx) => {
    if (P().queueBlocks && draft.queue?.length) throw Error('请先处理眼前的事件');
    const target = postTarget(draft, { ...spec, target: spec.target ?? 'main' });
    if (!target || target.id !== modelId || postPlanModelToken(draft, modelId) !== token) throw Error('训练目标已经变化，请重新确认');
    let job = postJobFor(draft, target);
    if (options.existingOnly && (!job || (options.jobId && job.id !== options.jobId))) throw Error('后训练作业已经变化，请重新确认');
    if (job?.bench && !options.updateDirection) throw Error('刷榜不使用卡牌方案');
    const view = apply(draft, 'postPlan.open', { modelId, expectedModelToken: token }, ctx);
    if (!job) job = apply(draft, 'startJob', { spec }, ctx);
    else {
      if (options.resume) {
        if (options.updateDirection && Array.isArray(draft.jobs.focusPause)) apply(draft, 'focusResearch', { on: false }, ctx);
        if (job.paused) apply(draft, 'pauseJob', { id: job.id, on: false }, ctx);
      }
      if (options.updateDirection) apply(draft, 'setPost', { id: job.id, dir: spec.dir ?? 'auto' }, ctx);
    }
    return { kind: 'jobs', op: 'start', job, postPlan: view };
  }, options);
}

async function commit(state, run) {
  if (postPlanPending(state)) throw Error('正在保存后训练操作，请稍候');
  if (getMp()) throw Error('联机后训练没有卡牌会话');
  if (getState() !== state) throw Error('当前局面已改变，请重新打开训练页');
  const world = getWorld(), wasBusy = clock.busy, token={};
  clock.postPlanToken=token;
  clock.busy = true;
  clearTimeout(clock.timer);
  try {
    return await run({ world, current: () => getState() === state && getWorld() === world && !getMp() });
  } finally { if(clock.postPlanToken===token){clock.postPlanToken=null;clock.busy=wasBusy;scheduleTick();} }
}

export function commitPostPlanCommand(state, name, args = {}, { actor = 'manual' } = {}) {
  return commit(state, options => transactPostPlan(state, { name, args }, { ...options, actor }));
}
export function commitPostTraining(state, spec, options = {}) {
  return commit(state, context => transactPostTraining(state, spec, { ...options, ...context }));
}

// Explicit recovery of a pre-existing paused/benchmark job. This transaction
// never confirms a deck, chooses a hand, grants a replan, or targets a newer model.
export async function transactPostOnlyResume(state, {modelId,jobId,modelToken}, options={}) {
  return transact(state,(draft,ctx)=>{
    if(!isPostOnly(draft))throw Error('当前不是单机只后训练玩法');
    const job=draft.jobs.list.find(j=>j.id===jobId),model=job&&postTarget(draft,job);
    if(!job||job.kind!=='post'||model?.id!==modelId||!trainablePostModel(draft,modelId)||model.evalId)throw Error('训练目标已改变，请刷新后重试');
    const currentToken=postPlanModelToken(draft,modelId);
    if(modelToken!==null&&modelToken!==currentToken)throw Error('模型代际已改变，请刷新后重试');
    const view=apply(draft,'postPlan.open',{modelId,expectedModelToken:modelToken},ctx);
    if(job.paused)apply(draft,'pauseJob',{id:jobId,on:false},ctx);
    if(Array.isArray(draft.jobs.focusPause)&&draft.jobs.focusPause.length===0)apply(draft,'focusResearch',{on:false},ctx);
    if(job.bench)apply(draft,'setPost',{id:jobId,dir:'auto'},ctx);
    return {kind:'jobs',op:'resume',job,postPlan:view};
  },options);
}
export async function commitPostOnlyResume(state,args) {
  return commit(state,options=>transactPostOnlyResume(state,args,options));
}
