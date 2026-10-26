// v1 数据/研究托管：单机显式启用；联机仅版本化room.start启用，随已记录tick重放。
import { advise } from './advisor.js';
import { applyCommand } from './commands.js';
import { DATASETS } from '../data/datasets.js';
import { datasetAvailable } from './data_ops.js';
import { researchOptions } from './research.js';
import { P } from './provider.js';
import { allocationCandidate } from './automation_allocation.js';
import { companyStrategyCandidate,strategyPresets } from './automation_strategy.js';
import {trialPreparationCandidate} from './automation_trial.js';
import {PRETRAIN_POLICIES,pretrainLedgerValid,pretrainReserve,refreshPretrainHold,pretrainingCandidate,commitPretrainReceipt} from './automation_pretrain.js';
import {EVALUATION_POLICIES,evaluationLedgerValid,evaluationDecision,commitEvaluationReceipt} from './automation_evaluation.js';
const MODULES = ['data', 'research'];
const modulesFor = a => a?.version>=6 ? ['companyStrategy','pretraining','evaluation',...MODULES,'computeAllocation'] : a?.version>=4 ? ['companyStrategy','pretraining',...MODULES,'computeAllocation'] : a?.version===3 ? ['companyStrategy',...MODULES,'computeAllocation'] : a?.version===2 ? [...MODULES,'computeAllocation'] : MODULES;
const presetsFor = (k,s) => k==='evaluation' ? Object.keys(EVALUATION_POLICIES) : k==='pretraining' ? Object.keys(PRETRAIN_POLICIES) : k==='companyStrategy' ? strategyPresets(s).map(x=>x.id) : k==='computeAllocation' ? ['balanced','service_first','training_first'] : PRESETS;
const supported = v => v===1||v===2||v===3||v===4||v===5||v===6;
const validPastDay = (v,day) => typeof v==='string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10)===v && v<=day;
const RIGHTS = new Set(['public', 'permissive', 'licensed', 'consented']);
const MODES = ['auto', 'manual'], PRESETS = ['balanced', 'save_cash'];
export function automationAllowed(s) {
  const p = P();
  if (!s || s.status !== 'playing' || !['history','sim'].includes(p.mode)) return false;
  if (p.mode === 'sim') {
    const w = p.world, c = w?.companies?.[s.charId];
    if (!w || (w.settings?.mp && !supported(w.settings.automationVersion)) || w.result || w.day > w.end || c?.kind !== 'human' || c.s !== s) return false;
  }
  return true;
}
export function automationStateValid(s) {
  const a=s?.automation;
  return supported(a?.version) && a.plannerVersion===a.version && Number.isSafeInteger(a.rev) && a.rev>=0 && Number.isSafeInteger(a.cursor) && a.cursor>=0
    && modulesFor(a).every(k=>MODES.includes(a.modules?.[k]?.mode)&&presetsFor(k,s).includes(a.modules[k].preset))
    && (a.version<4 || pretrainLedgerValid(s))
    && (a.version<6 || evaluationLedgerValid(s))
    && (a.version===1 || (Object.keys(a.modules).length===modulesFor(a).length && (a.modules.computeAllocation.lastSuccessDay===null || validPastDay(a.modules.computeAllocation.lastSuccessDay,s.day))))
    && (a.lastDay===null||typeof a.lastDay==='string')
    && (!a.window || (typeof a.window.day==='string' && Number.isFinite(a.window.allowance) && a.window.allowance>=0 && Number.isFinite(a.window.spent) && a.window.spent>=0))
    && Array.isArray(a.recent) && a.recent.every(x=>x&&typeof x.day==='string'&&typeof x.reason==='string')
    && Array.isArray(a.receipts) && a.receipts.every(x=>x&&typeof x.id==='string'&&typeof x.signature==='string'&&Number.isSafeInteger(x.rev));
}
export function enableAutomation(s) {
  if (!automationAllowed(s)) throw new Error('当前局面不支持启用托管（旧联机房间保持原规则）');
  if (Object.hasOwn(s,'automation')) { if (!automationStateValid(s)) throw new Error('托管版本不支持'); return s.automation; }
  const roomVersion=P().world?.settings?.automationVersion;
  const version=supported(roomVersion)?roomVersion:6;
  s.automation={version,plannerVersion:version,activatedAt:s.day,rev:0,cursor:0,...(P().world?.settings?.mp?{}:{cardDefault:'manual'}),
    ...(version>=4?{pretraining:{receipts:[],hold:null,...(version>=5?{trials:[]}:{})}}:{}),
    ...(version>=6?{evaluation:{receipts:[]}}:{}),
    modules:Object.fromEntries(modulesFor({version}).map(k=>[k,{mode:'auto',preset:'balanced',...(k==='computeAllocation'?{lastSuccessDay:null}:{})}])),lastDay:null,window:null,recent:[],receipts:[]};
  return s.automation;
}
export function configureAutomation(s, arg) {
  if (!automationAllowed(s)||!automationStateValid(s)) throw new Error('此局尚未启用受支持的托管版本');
  const {module,mode,preset,expectedRev,requestId}=arg||{}, a=s.automation;
  if (!modulesFor(a).includes(module)||!MODES.includes(mode)||!presetsFor(module,s).includes(preset)||!Number.isSafeInteger(expectedRev)||typeof requestId!=='string'||!requestId.length||requestId.length>100) throw new Error('托管设置不合法');
  if(s.flags?.postOnly?.version===1 && mode==='manual')throw Error('只后训练需要经营托管；请先切回完整玩法再关闭模块');
  const signature=JSON.stringify([module,mode,preset,expectedRev]);
  const old=a.receipts.find(x=>x.id===requestId);
  if (old) { if(old.signature!==signature)throw new Error('请求编号已用于不同设置'); return old.rev; }
  if(expectedRev!==a.rev)throw new Error('托管设置已变化，请刷新后重试');
  a.modules[module]={...a.modules[module],mode,preset}; a.rev++;
  a.receipts.push({id:requestId,signature,rev:a.rev}); if(a.receipts.length>32)a.receipts.shift();
  note(s,{module,kind:'control',reason:mode==='manual'?'已接管：已有订单和研究继续，停止新的自动决策':'已交给助手：下个游戏日按策略决策',cost:0});
  return a.rev;
}
// A single revision/receipt for the selection. Validate everything before writing.
export function configureAutomationBatch(s, arg) {
  if (!automationAllowed(s) || !automationStateValid(s)) throw Error('此局尚未启用受支持的托管版本');
  const {modules,mode,expectedRev,requestId} = arg || {}, a=s.automation;
  if (!Array.isArray(modules) || !modules.length || modules.length>6 || new Set(modules).size!==modules.length || !modules.every(k=>modulesFor(a).includes(k)) || !MODES.includes(mode) || !Number.isSafeInteger(expectedRev) || typeof requestId!=='string' || !requestId.length || requestId.length>100) throw Error('批量托管设置不合法');
  if(s.flags?.postOnly?.version===1 && mode==='manual')throw Error('只后训练需要经营托管；请先切回完整玩法再关闭模块');
  const ordered=[...modules].sort(), signature=JSON.stringify(['batch',ordered,mode,expectedRev]);
  const old=a.receipts.find(x=>x.id===requestId);
  if (old) { if(old.signature!==signature) throw Error('请求编号已用于不同设置'); return old.rev; }
  if (expectedRev!==a.rev) throw Error('托管设置已变化，请刷新后重试');
  for(const module of ordered) a.modules[module]={...a.modules[module],mode};
  a.rev++;
  a.receipts.push({id:requestId,signature,rev:a.rev}); if(a.receipts.length>32)a.receipts.shift();
  for(const module of ordered) note(s,{module,kind:'control',reason:mode==='manual'?'批量关闭自动：已有任务继续，只停止新的自动决策':'批量开启自动：下个游戏日按原策略决策',cost:0});
  return a.rev;
}

function note(s, entry) {
  const a=s.automation;
  a.recent.push({day:s.day,...entry}); if(a.recent.length>40)a.recent.shift();
}
export function automationBudget(s) {
  const a=s.automation, last=s.history?.at(-1);
  const burn=Math.max(0,(last?.costs||0)-(last?.revenue||0));
  const reserve=Math.max(burn*12,pretrainReserve(s));
  const saving=MODULES.some(k=>a?.modules[k].mode==='auto'&&a.modules[k].preset==='save_cash');
  const allowance=Math.min(Math.max(0,s.cash-reserve),Math.max(0,s.cash)*(saving?.05:.15));
  const w=a?.window?.day===s.day?a.window:null;
  return {reserve,remaining:Math.max(0,Math.min(s.cash-reserve,w?w.allowance-w.spent:allowance)),allowance};
}
// 候选只是本地顾问的提案；不能由网络客户端提交。执行前还要过具体引擎命令校验。
export function automationCandidate(s, advice) {
  if(!automationStateValid(s))return null;
  const op=advice?.op;
  if(op?.type==='infer'&&s.automation.version>=2)return allocationCandidate(s,advice).candidate;
  if(op?.type==='tech' && s.automation.modules.research.mode==='auto') {
    const opt=researchOptions(s).find(x=>x.t.id===op.id&&x.check.ok);
    if(opt)return {module:'research',command:{name:'researchTech',args:{id:opt.t.id}},cost:0,reason:advice.detail||advice.label||'研究槽空闲，按顾问建议开始研究'};
  }
  if(op?.type==='act'&&op.action==='data'&&s.automation.modules.data.mode==='auto') {
    const ds=DATASETS.find(x=>x.id===op.arg?.id);
    if(!ds||ds.gen||ds.teacherFam||!RIGHTS.has(ds.rights)||!Number.isFinite(ds.cost)||ds.cost<0||!datasetAvailable(s,ds).ok||s.orders.some(o=>o.ref===ds.id))return null;
    if(ds.cost>automationBudget(s).remaining)return null;
    return {module:'data',command:{name:'decide',args:{action:'data',id:ds.id}},cost:ds.cost,reason:advice.detail||advice.label||'补充当前需要的合法数据'};
  }
  return null;
}
export function automationDay(s, context = null) {
  if(!Object.hasOwn(s,'automation'))return [];
  if(!automationStateValid(s))throw new Error('托管配置损坏或版本不支持');
  if(!automationAllowed(s)||(P().queueBlocks&&s.queue?.length)||s.automation.lastDay===s.day)return [];
  if(P().world?.settings?.mp && (context?.world!==P().world || context.id!==s.charId || typeof context.execute!=='function'))throw new Error('联机托管只能在权威日结内执行');
  return plannerV1(s,context);
}
// 不原位替换v1规则；未来升级应新增版本实现与已记录的启用命令。
function plannerV1(s, context) {
  const a=s.automation, result=[];
  if(a.version>=4)refreshPretrainHold(s);
  // 在权威日步里先占本日窗口，模式切换、页面重开、JSON重读都不能重发今天的订单。
  a.lastDay=s.day; if(a.window?.day!==s.day)a.window={day:s.day,allowance:automationBudget(s).allowance,spent:0};
  // Only this synchronous planner invocation owns the cache. Waiting notes
  // change automation.recent only, which advice does not read. All candidate
  // checks are read-only (resource simulations operate on private clones).
  // Commands, including failures, invalidate before executing; receipts and
  // holds therefore cannot leak old proposals into the next module.
  let cachedAdvice=null, cachedProvider=null, cachedBackground=null, cachedRev=null;
  const suggestionsNow=()=>{
    const provider=P(), background=!provider.queueBlocks;
    if(cachedAdvice===null||cachedProvider!==provider||cachedBackground!==background||cachedRev!==a.rev){
      cachedAdvice=advise(s,{background});cachedProvider=provider;cachedBackground=background;cachedRev=a.rev;
    }
    return cachedAdvice;
  };
  for(const module of modulesFor(a)) {
    if(a.modules[module].mode!=='auto')continue;
    const rev=a.rev;
    const proposals=['pretraining','evaluation'].includes(module)?suggestionsNow():null;
    const project=proposals?.find(x=>x.op?.type==='project');
    let strategyResult=module==='evaluation'?evaluationDecision(s,proposals):module==='companyStrategy'?companyStrategyCandidate(s,automationBudget(s).remaining):module==='pretraining'?(a.version>=5&&!project?trialPreparationCandidate(s,proposals.find(x=>x.op?.type==='trial'&&x.op.spec?.type==='tune')):pretrainingCandidate(s,project)):null;
    const suggestions=strategyResult?null:suggestionsNow();
    let c=strategyResult?strategyResult.candidate:suggestions.map(x=>automationCandidate(s,x)).find(x=>x?.module===module);
    // 新联机从零世界可能所有技术尚未公开；顾问没有推荐时，仍可按玩家可见研究列表合法自研。
    if(!c && module==='research' && (P().world?.settings?.mp || s.flags?.postOnly?.version===1)) {
      const option=researchOptions(s).filter(x=>x.check.ok).sort((x,y)=>x.need-y.need||(x.t.id<y.t.id?-1:1))[0];
      if(option)c=automationCandidate(s,{op:{type:'tech',id:option.t.id},detail:'研究槽空闲：从当前可研究列表选择预计工期较短的技术，不改变研究门槛和耗时'});
    }
    if(!c){
      const infer=module==='computeAllocation'?suggestions.find(x=>x.op?.type==='infer'):null;
      const reason=strategyResult?.reason||(infer?allocationCandidate(s,infer).reason:'当前没有满足策略、预算和合法条件的顾问建议');
      note(s,{module,kind:'waiting',reason,cost:0});continue;
    }
    if(a.rev!==rev||a.modules[module].mode!=='auto')continue;
    const id=`auto${a.version}:${s.charId}:${s.day}:${++a.cursor}`, before=s.cash;
    cachedAdvice=null;
    const r=context?.execute ? context.execute(c.command) : applyCommand(s,c.command);
    if(r.ok&&module==='evaluation')commitEvaluationReceipt(s,c,r);
    if(r.ok&&module==='pretraining')commitPretrainReceipt(s,c,r);
    if(r.ok&&module==='computeAllocation')a.modules[module].lastSuccessDay=s.day;
    const cost=Math.max(0,before-s.cash);
    a.window.spent+=cost;
    const row={id,module,kind:r.ok?'executed':'blocked',command:c.command,reason:r.ok?c.reason:r.err,cost,policyRev:rev};
    note(s,row);result.push(row);
  }
  return result;
}

// 以下仅在世界新建/接管和加载校验使用；attachWorld绝不隐式初始化。
export function automationVersion(settings) {
  const v=settings?.automationVersion;
  if(v===undefined||v===0)return 0;
  if(!supported(v))throw new Error('不支持的房间托管版本');
  return v;
}
export function managedAutomationHuman(world,c) {
  return supported(world.settings?.automationVersion) && c?.kind==='human';
}
export function automationStateError(s) {
  return Object.hasOwn(s||{},'automation')&&!automationStateValid(s)?'托管配置损坏或版本不支持':null;
}
export function assertAutomationWorld(world) {
  const v=automationVersion(world.settings);
  for(const c of Object.values(world.companies||{})) {
    if(!c?.s)continue;
    const err=automationStateError(c.s);
    if(err)throw new Error(err);
    if(v&&world.settings?.mp&&Object.hasOwn(c.s.automation||{},'cardDefault'))throw new Error('联机托管不得启用卡牌控制');
    if(v&&c.kind==='human'&&(!automationStateValid(c.s)||c.s.automation.version!==v))throw new Error('新版房间缺少真人托管配置');
    if(!v&&world.settings?.mp&&Object.hasOwn(c.s,'automation'))throw new Error('旧联机房间不能隐式启用新版托管');
  }
}
export function initializeAutomationWorld(world) {
  if(!automationVersion(world.settings))return;
  for(const c of Object.values(world.companies||{}))if(c?.s&&c.kind==='human')enableAutomation(c.s);
}
