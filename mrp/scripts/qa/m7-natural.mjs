import * as E from '../../src/career/engine.js';import {resolveAll} from '../../tests/helpers/career_bot.mjs';import{automationDay}from'../../src/career/sim/automation.js';
for(const id of ['image2','suno','deepseek']){
 E.setProvider();const s=E.createGame(id,'y2025',13);resolveAll(s);E.enableAutomation(s);
 for(const module of Object.keys(s.automation.modules).filter(x=>x!=='evaluation'))E.configureAutomation(s,{module,mode:'manual',preset:'balanced',expectedRev:s.automation.rev,requestId:module});
 const initial={cash:s.cash,models:s.models.length};const job=E.startJob(s,{kind:'post',target:'main',dir:'auto',until:'none'}),events=[];let count=0;
 for(let i=0;i<150&&s.status==='playing';i++){resolveAll(s);automationDay(s);if(s.automation.evaluation.receipts.length>count){count=s.automation.evaluation.receipts.length;events.push({day:s.day,receipts:structuredClone(s.automation.evaluation.receipts),evals:structuredClone(s.evals)});}const out=E.tickDay(s);if(out?.releases?.length){events.push({day:s.day,releases:out.releases.map(r=>({id:r.model.id,name:r.model.name,open:r.model.open,tier:r.model.evalTier}))});break;}}
 console.log(JSON.stringify({id,initial,day:s.day,cash:s.cash,status:s.status,events,reasons:s.automation.recent.filter(r=>r.module==='evaluation').slice(-2)}));
}
