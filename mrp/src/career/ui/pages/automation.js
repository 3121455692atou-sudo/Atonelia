// 只显示真实接入模块，实时同步权威状态并保留编辑焦点。
import * as E from '../../engine.js';
import { act } from '../act.js';
import { esc, usd } from '../fmt.js';
import { getMp, toast } from '../state.js';
const baseNames={evaluation:'评测与发布（评完自动公开）',pretraining:'预训练筹备与启动',companyStrategy:'公司策略研究（单槽，保留在研进度）',data:'数据收集',research:'技术研究',computeAllocation:'算力分配（不含购卡、租卡与检修）'};
const namesFor=a=>({...baseNames,pretraining:a?.version>=5?'预训练筹备与启动（含调参试训，不含购卡）':'预训练筹备与启动（不含试训、购卡）'});
const shortNames={evaluation:'评测发布',pretraining:'预训练',companyStrategy:'公司策略',data:'收集数据',research:'技术研究',computeAllocation:'分配算力'};
const summaryOf=a=>`自动 ${Object.values(a.modules).filter(m=>m.mode==='auto').length} / ${Object.keys(a.modules).length} 项`;
const presets={balanced:'均衡',save_cash:'省钱',service_first:'保服务（只上调）',training_first:'保训练（只下调）'};
const statusOf=(a,id)=>`当前：${a.modules[id].mode==='auto'?'自动':'手动'} · ${{executed:'已执行',blocked:'未执行',waiting:'等待',control:'已更新'}[[...a.recent].reverse().find(x=>x.module===id)?.kind]||'等待决策'}`;
const noteOf=st=>st.readOnly?'只读：不能更改设置。':st.autoPending?'正在等待服务器确认…':'接管不取消已开始的任务。';
const reasonOf=(a,id)=>[...a.recent].reverse().find(x=>x.module===id)?.reason||'等待下一个游戏日决策';
const budgetText=S=>{const b=E.automationBudget(S);return `可用预算 ${usd(b.remaining)} · 保留现金 ${usd(b.reserve)}`;};
const logHtml=a=>[...a.recent].reverse().map(x=>`<li>${esc(x.day)} · ${esc(namesFor(a)[x.module]||x.module)} · ${esc({executed:'已执行',blocked:'未执行',waiting:'等待',control:'控制变更'}[x.kind]||x.kind)}<p>${esc(x.reason)}${x.cost?` · 花费 ${usd(x.cost)}`:''}</p></li>`).join('')||'<li>还没有自动操作</li>';
// 只更新权威值和只读说明，保留节点、展开状态、滚动和焦点；不会发新命令。
export function sync(S,root,st={}) {
  if(!E.automationStateValid(S)||!root?.querySelector('[data-auto-budget]'))return false;
  const a=S.automation;
  const summary=root.querySelector('[data-auto-summary]');if(summary)summary.textContent=summaryOf(a);
  const note=root.querySelector('[data-auto-note]');if(note)note.textContent=noteOf(st);
  for(const t of root.querySelectorAll('[data-auto-select]')) {
    if(!t.dataset.autoSelect)continue;
    t.checked=(st.autoSelected||[]).includes(t.dataset.autoSelect);t.disabled=!!(st.readOnly||st.autoPending);
  }
  for(const t of root.querySelectorAll('[data-auto-batch], [data-auto-all], [data-auto-clear], [data-auto-master]')) {
    if(!t.dataset || (!('autoBatch' in t.dataset) && !('autoAll' in t.dataset) && !('autoClear' in t.dataset) && !('autoMaster' in t.dataset)))continue;
    t.disabled=!!(st.readOnly||st.autoPending||('autoBatch' in t.dataset && !(st.autoSelected||[]).length));
  }
  const selected=root.querySelector('[data-auto-count]');if(selected)selected.textContent=`已选 ${(st.autoSelected||[]).length} 项${st.autoPending?' · 等待服务器确认':''}`;
  for(const [id,m] of Object.entries(a.modules)){const el=root.querySelector(`[data-auto-status="${id}"]`);if(el)el.textContent=statusOf(a,id);}
  for(const t of root.querySelectorAll('[data-auto-module]')) {
    const module=t.dataset.autoModule,key=t.dataset.autoKey;
    if(!a.modules[module]||!['mode','preset'].includes(key))continue;
    if(st.autoPending && t===globalThis.document?.activeElement)st.autoFocus=t;
    t.value=a.modules[module][key];
    t.disabled=!!(st.readOnly||st.autoPending);
  }
  for(const id of Object.keys(namesFor(a))) { const el=root.querySelector(`[data-auto-reason="${id}"]`); if(a.modules[id]&&el)el.textContent=reasonOf(a,id); }
  root.querySelector('[data-auto-budget]').textContent=budgetText(S);
  root.querySelector('[data-auto-log]').innerHTML=logHtml(a);
  if(!st.autoPending && st.autoFocus) {
    if(st.autoFocus.isConnected && globalThis.document?.activeElement===globalThis.document?.body)st.autoFocus.focus();
    st.autoFocus=null;
  }
  return true;
}
export function render(S,st={}) {
  const mp=getMp();
  if(E.isPostOnly(S))return `<h2>只后训练 · 经营自动</h2><div class="card"><p>日常经营已交由助手自动打理：预训练、数据采集、技术研发、模型送评与发布、算力调度与融资均自动推进；你的精力可集中在后训练卡组构筑与对局。经营仍受资金与资源约束，需注意避免破产。</p><p>切回完整玩法可重新手动调整各项经营设置，当前进行中的订单、融资与卡牌对局均不受影响。</p>${st.readOnly?'':'<button class="btn" data-play-mode="full">切回完整玩法</button>'}</div>`;
  if(mp&&![1,2,3,4,5,6].includes(mp.pub?.settings?.automationVersion))return '<h2>托管</h2><div class="card">此房间不支持当前托管版本，请新开房间。</div>';
  const a=S.automation;
  if(mp&&!a)return '<h2>托管</h2><p>服务器托管配置缺失，请重新连接；未擅自启用。</p>';
  if(!a)return `<section class="automation-panel"><header class="automation-head"><h2>托管未开启</h2>${st.readOnly?'':'<button class="btn btn--primary" data-auto-enable>明确启用托管</button>'}</header><p class="automation-note">开启后，技术研究、数据、预训练、评测发布与算力分配由助手自动处理；可随时手动接管。</p><p class="automation-budget">每天最多动用 15% 现金，并优先保留运营资金。</p><details class="automation-extra"><summary>费用与托管范围</summary><p>开启后这六项默认自动推进，后训练卡牌始终由你亲自决策。每天自动预留 12 个月的运营储备金；省钱策略下每日支出上限降至 5%。技术研究不额外消耗现金，占用研究槽位与研发周期。</p><p>接管或切换设置不会撤销正在执行的订单与训练；评测完成后会自动公开发布。显卡采购与检修等重大决策需手动处理。</p></details></section>`;
  if(!E.automationStateValid(S))return '<h2>托管</h2><div class="card">此存档的托管版本暂不支持，未执行自动操作。</div>';
  return `<section class="automation-panel"><header class="automation-head"><h2>托管</h2><strong data-auto-summary aria-live="polite">${summaryOf(a)}</strong><div class="automation-master"><button class="btn btn--primary" data-auto-master="auto" ${st.readOnly||st.autoPending?'disabled':''}>全部自动</button><button class="btn" data-auto-master="manual" ${st.readOnly||st.autoPending?'disabled':''}>全部手动</button></div></header>
    <p class="automation-budget" data-auto-budget>${esc(budgetText(S))}</p><p class="automation-note" data-auto-note aria-live="polite">${noteOf(st)}</p>
    <div class="automation-modules">${Object.entries(namesFor(a)).filter(([id])=>a.modules[id]).map(([id,name])=>{const m=a.modules[id];return `<article class="automation-module"><div class="automation-controls"><strong>${shortNames[id]}</strong><label><span class="automation-field-label">控制</span><select aria-label="${shortNames[id]}控制" data-auto-module="${id}" data-auto-key="mode" ${st.readOnly||st.autoPending?'disabled':''}><option value="auto" ${m.mode==='auto'?'selected':''}>自动</option><option value="manual" ${m.mode==='manual'?'selected':''}>手动</option></select></label><label><span class="automation-field-label">策略</span><select aria-label="${shortNames[id]}策略" data-auto-module="${id}" data-auto-key="preset" ${st.readOnly||st.autoPending?'disabled':''}>${(id==='evaluation'?Object.entries(E.EVALUATION_POLICIES).map(([id,p])=>({id,label:p.label})):id==='pretraining'?Object.entries(E.PRETRAIN_POLICIES).map(([id,p])=>({id,label:`${p.label}（≤${p.maxDays}天 / 风险≤${Math.round(p.maxRisk*100)}%）`})):id==='companyStrategy'?E.strategyPresets(S):(id==='computeAllocation'?['balanced','service_first','training_first']:['balanced','save_cash']).map(k=>({id:k,label:presets[k]}))).map(x=>`<option value="${esc(x.id)}" ${m.preset===x.id?'selected':''}>${esc(x.label)}</option>`).join('')}</select></label></div><details class="automation-module-info"><summary><span data-auto-status="${id}">${statusOf(a,id)}</span> · 详情</summary><p>${name}</p><p data-auto-reason="${id}">${esc(reasonOf(a,id))}</p><label class="automation-select"><input type="checkbox" data-auto-select="${id}" ${(st.autoSelected||[]).includes(id)?'checked':''} ${st.readOnly||st.autoPending?'disabled':''} /> 加入批量选择</label></details></article>`;}).join('')}</div>
    <details class="automation-extra"><summary>批量选择与设置</summary><div class="automation-batch"><button class="btn" data-auto-all ${st.readOnly||st.autoPending?'disabled':''}>全选</button><button class="btn" data-auto-clear ${st.readOnly||st.autoPending?'disabled':''}>取消选择</button><span data-auto-count aria-live="polite">已选 ${(st.autoSelected||[]).length} 项${st.autoPending?' · 等待服务器确认':''}</span><button class="btn" data-auto-batch="auto" ${st.readOnly||st.autoPending||!(st.autoSelected||[]).length?'disabled':''}>所选自动</button><button class="btn" data-auto-batch="manual" ${st.readOnly||st.autoPending||!(st.autoSelected||[]).length?'disabled':''}>所选手动</button></div><p>在模块的“详情”中勾选；勾选不会立即改变设置。</p></details>
    <details class="automation-extra"><summary>托管规则与预算说明</summary><p>只停止未来决策，不撤销已有任务。显卡采购、检修等重大投资仍需手动决策。${a.modules.evaluation?'模型送评后按原计划自动公开发布；如切换为手动接管，可手动撤回未完成的评测。系统按公司既定开闭源路线自动命名与发布，不会强行替换能力更强的旗舰模型。如需自定义发布名称或开源选择，请先接管评测与发布再编辑送评。单机模式下未构筑完成的卡牌方案不会被提前送评。':'当前版本尚未托管评测与发布。'}${a.modules.pretraining?(a.version>=5?'预训练筹备阶段会自动进行公开调参试训，确认效果后再正式立项；同一代模型最多试训两次，失败后冷却 7 天重试。':'当前版本直接推进正式立项，不自动进行试训。')+'日常训练费用照常扣除，并优先保障运营资金。':''}算力分配会自动平衡各作业卡数，不额外采购显卡，每次调整冷却期为 3 天。${mp?'联机模式下后训练由服务器结算，不选卡、不等待其他玩家。':'单机后训练卡牌默认手动，可在独立卡牌界面选择自动。'}</p><p>运营资金保留额度会自动结合日常运营与在训项目需求计算最优储备。省钱策略下会收紧数据与技术研究的共享预算，保障现金流安全。</p></details>
    <details class="automation-extra"><summary>最近操作</summary><ol data-auto-log>${logHtml(a)}</ol></details>
    ${!mp&&S.postPlanSessions&&!st.readOnly?'<details class="automation-extra"><summary>只玩后训练卡牌</summary><p>经营事件、购卡和融资也会自动处理，成本、时间与风险照常。</p><button class="btn" data-play-mode="post">切换只后训练</button></details>':''}</section>`;
}
function submitControl(S,run,{guard,draw,st={}},done=()=>{}) {
  if(st.readOnly||st.autoPending){draw?.();return;}
  if(getMp()) {
    st.autoPending=true;
    let request;try{request=run();}catch(e){st.autoPending=false;toast(e.message);draw?.();return;}
    draw?.();
    Promise.resolve(request).then(done).catch(e=>toast(e.message)).finally(()=>{st.autoPending=false;draw?.();});
  } else guard(()=>{const result=run();done();return result;});
}
export function click(S,t,ctx) {
  const {guard,draw,st={}}=ctx;
  const modeButton=t.closest('[data-play-mode]');
  if(modeButton){if(!st.readOnly&&!getMp())return guard(()=>act(S,'setPlayMode',{mode:modeButton.dataset.playMode}));return;}
  // Keep the explicit enable action first; no batch call can enable a dormant save.
  if(t.closest('[data-auto-enable]'))return guard(()=>act(S,'enableAutomation'));
  if(st.readOnly||st.autoPending)return;
  const master=t.closest('[data-auto-master]');
  if(master){const a=S.automation,mode=master.dataset.autoMaster;if(!['auto','manual'].includes(mode))return;const modules=Object.keys(a.modules);return submitControl(S,()=>act(S,'configureAutomationBatch',{modules,mode,expectedRev:a.rev,requestId:`master:${a.rev}:${mode}`}),ctx,()=>{st.autoSelected=[];});}
  if(t.closest('[data-auto-all]')){st.autoSelected=Object.keys(S.automation.modules);draw?.();return;}
  if(t.closest('[data-auto-clear]')){st.autoSelected=[];draw?.();return;}
  const button=t.closest('[data-auto-batch]');if(!button)return;
  const modules=[...(st.autoSelected||[])].filter(k=>S.automation.modules[k]);
  if(!modules.length)return;
  const a=S.automation,mode=button.dataset.autoBatch;
  submitControl(S,()=>act(S,'configureAutomationBatch',{modules,mode,expectedRev:a.rev,requestId:`batch:${a.rev}:${mode}:${modules.slice().sort().join(',')}`}),ctx,()=>{st.autoSelected=[];});
}
export function change(S,t,{guard,draw,st={}}) {
  if(t.dataset.autoSelect) {
    if(st.readOnly||st.autoPending){draw?.();return;}
    const id=t.dataset.autoSelect;if(!S.automation?.modules[id])return;
    st.autoSelected=t.checked?[...new Set([...(st.autoSelected||[]),id])]:(st.autoSelected||[]).filter(k=>k!==id);draw?.();return;
  }
  const module=t.dataset.autoModule,key=t.dataset.autoKey;
  if(!module||!['mode','preset'].includes(key))return;
  const run=()=>{const a=S.automation,m=a.modules[module];return act(S,'configureAutomation',{module,mode:m.mode,preset:m.preset,[key]:t.value,expectedRev:a.rev,requestId:`ui:${a.rev}:${module}:${key}:${t.value}`});};
  submitControl(S,run,{guard,draw,st});
}
