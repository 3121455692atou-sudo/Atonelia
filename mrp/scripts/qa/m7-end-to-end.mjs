import * as E from '../../src/career/engine.js';import{resolveAll}from'../../tests/helpers/career_bot.mjs';
const cmd=(s,name,args)=>{const r=E.applyCommand(s,{name,args});if(!r.ok)throw Error(r.err);return r.result;};
for(const id of ['deepseek','kimi']){
 E.setProvider();const s=E.createSinglePlayerGame(id,'y2025',13);resolveAll(s);E.enableAutomation(s);const initial={cash:s.cash,working:s.working,gen:s.gen};let minCash=s.cash,finished=null;const events=[],planned=new Set();
 for(let i=0;i<360&&s.status==='playing';i++){
  resolveAll(s);const m=E.workingModel(s);
  if(m&&m.id!==initial.working&&m.stage==='post'&&!planned.has(m.id)){
   let v=cmd(s,'postPlan.open',{modelId:m.id,expectedModelToken:E.postPlanModelToken(s,m.id)});v=cmd(s,'postPlan.confirmDeck',{sessionId:v.sessionId,expectedRevision:v.revision,cardIds:v.deck,directionPolicy:'llm-general'});
   for(let k=0;k<6;k++)v=cmd(s,'postPlan.choose',{sessionId:v.sessionId,expectedRevision:v.revision,turn:v.turn,cardId:'basic'}).view;
   if(!s.jobs.list.some(j=>j.kind==='post'&&j.target==='main'))E.startJob(s,{kind:'post',target:'main',dir:'auto',until:'none'});
   planned.add(m.id);events.push({day:s.day,kind:'player-completed-six-cards-and-started-post',model:m.id,status:v.status,control:v.controlMode,cash:s.cash});
  }
  const before=s.automation.cursor,out=E.tickDay(s);minCash=Math.min(minCash,s.cash);
  for(const r of s.automation.recent.filter(r=>r.kind==='executed'&&Number(r.id?.split(':').at(-1))>before))if(['pretraining','evaluation'].includes(r.module))events.push({day:r.day,kind:'auto',command:r.command,reason:r.reason,cash:s.cash});
  if(out?.releases?.length){for(const r of out.releases){events.push({day:out.day,kind:'released',id:r.model.id,name:r.model.name,tier:r.model.evalTier,open:r.model.open});if(planned.size){finished=r.model.id;break;}}if(finished)break;}
 }
 console.log(JSON.stringify({id,initial,day:s.day,status:s.status,minCash,cash:s.cash,gen:s.gen,working:s.working,finished,events,pretraining:s.automation.pretraining,evaluation:s.automation.evaluation,queue:s.queue.map(x=>x.kind),jobs:s.jobs.list.map(x=>({kind:x.kind,id:x.id,paused:x.paused})),recent:s.automation.recent.filter(x=>['pretraining','evaluation'].includes(x.module)).slice(-5)}));
}
