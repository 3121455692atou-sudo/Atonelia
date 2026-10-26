// Full, read-only research map. Automation continues to use researchOptions;
// displaying a future/owned node never makes it eligible for a command.
import { TECHS, TECH_BY_ID, MODALITIES, DIRECTIONS, addMonths } from '../data/core.js';
import { PREREQ, AHEAD_MONTHS } from '../data/techsrc.js';
import { DATASETS } from '../data/datasets.js';
import { POST_CARD_CATALOG } from '../data/post_card_catalog.js';
import { researchCheck, researchNeed, researchSpeed, techStatus } from './research.js';

const GROUP = {
  rlhf:'alignment', dpo:'alignment', grpo:'alignment', reasoning:'alignment', const_cls:'alignment', cot_monitor:'alignment',
  func_call:'agents', computer_use:'agents', mcp:'agents', agentic_rl:'agents', skills:'agents',
  distill:'serving', spec_decode:'serving', mla:'serving', sparse_attn:'serving',
  long_ctx:'architecture', flash_attn:'architecture', moe:'architecture', fp8:'architecture', mtp:'architecture', linear_attn:'architecture', muon:'architecture', engram:'architecture',
  textbook:'data',
};
export const RESEARCH_GROUPS = {alignment:'对齐与推理',agents:'工具与 Agent',serving:'推理与部署',architecture:'架构与训练',data:'内部研究工程与数据',domain:'本领域基础技术'};
const dim = (t,k) => MODALITIES[t.mod].dims.find(d=>d.key===k)?.label || k;
const unlockNames = {route_quant:'量化分流路线',scale_moe:'MoE 架构立项',bench_reasoning:'推理训练路线',scale_dit:'DiT 规模路线',scale_ar:'原生图像规模路线'};
const pct=v=>`${Math.round((v-1)*100)}%`;
export function researchOutcomes(t) {
  const e=t.effects||{}, out=[];
  for(const [k,v] of Object.entries(e.cap||{}))out.push(`${dim(t,k)}能力上限 +${v}（仍需训练）`);
  for(const [k,v] of Object.entries(e.post||{}))out.push(`${dim(t,k)}后训练效率 +${pct(v)}`);
  for(const [k,label] of Object.entries({train:'预训练效率',infer:'推理效率',dataQuality:'语料质量倍率'}))if(e[k])out.push(`${label} ×${e[k]}`);
  for(const [k,label] of Object.entries({stability:'训练风险倍率',legal:'法律风险倍率'}))if(e[k])out.push(`${label} ×${e[k]}`);
  for(const [k,v] of Object.entries(e.demand||{}))out.push(`${{api:'API',chat:'对话',coding_plan:'编程订阅',subscription:'订阅'}[k]||k}需求 ×${v}`);
  const datasets=DATASETS.filter(d=>d.needTech===t.id);
  for(const id of e.unlock||[])if(!datasets.some(d=>d.id===id))out.push(`开放：${unlockNames[id]||id}`);
  if(t.internalPractice)out.push('只解锁本公司的数据生产流程；不直接加能力、上限或全局倍率');
  return {effects:out,datasets,cards:POST_CARD_CATALOG.cards.filter(c=>c.modalities.includes(t.mod)&&c.unlock.all.some(g=>g.type==='completedTech'&&g.id===t.id)).map(c=>({id:c.id,name:c.name}))};
}
export function researchTree(s) {
  const speed=Math.max(.05,researchSpeed(s));
  return TECHS.filter(t=>t.mod===s.mod).map(t=>{
    const st=techStatus(s,t), check=researchCheck(s,t), need=researchNeed(s,t), active=s.research?.find(r=>r.id===t.id);
    const state=s.techs.includes(t.id)?'owned':active?'running':st.level==='secret'&&st.ahead>AHEAD_MONTHS?'future':check.ok?'ready':'blocked';
    const done=active?.done??s.researchDone?.[t.id]??0;
    return {t,st,check,need,state,done,days:Math.max(1,Math.ceil(((active?.need??need)-done)/speed)),
      group:t.internalPractice?'data':GROUP[t.id]||'domain',earliest:addMonths(t.from,-AHEAD_MONTHS),
      prereqs:(PREREQ[t.id]||[]).map(id=>({id,name:TECH_BY_ID[id].name,owned:s.techs.includes(id)})),
      next:TECHS.filter(x=>x.mod===s.mod&&(PREREQ[x.id]||[]).includes(t.id)).map(x=>({id:x.id,name:x.name})),
      ...researchOutcomes(t)};
  });
}
export const datasetPostLabels = (mod,posts) => Object.entries(posts||{}).map(([k,v])=>`${DIRECTIONS[mod].filter(d=>d.data===k).map(d=>d.label).join('/')||k} +${v}`).join(' · ');
