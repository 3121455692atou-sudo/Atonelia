import * as E from '../../src/career/engine.js';
import {resolveAll} from '../../tests/helpers/career_bot.mjs';
import {automationDay} from '../../src/career/sim/automation.js';
for(const [id,scenario] of [['deepseek','y2025'],['kimi','y2025'],['suno','y2025'],['image2','y2023']]){
 E.setProvider();const s=E.createGame(id,scenario,13);E.enableAutomation(s);const cash=s.cash,events=[];let last='';
 for(let i=0;i<160&&s.status==='playing';i++){
  resolveAll(s);automationDay(s);const now=JSON.stringify(s.automation.pretraining);if(now!==last){events.push({day:s.day,ledger:JSON.parse(now),jobs:s.jobs.list.map(j=>({id:j.id,kind:j.kind,done:j.done,pjDone:j.pj?.done})),cash:s.cash});last=now;}
  E.tickDay(s);
  // Full 160 natural days, no early stop at first pretraining start.
 }
 console.log(JSON.stringify({id,scenario,initialCash:cash,day:s.day,status:s.status,cash:s.cash,events,reasons:s.automation.recent.filter(x=>x.module==='pretraining').slice(-3),jobs:s.jobs.list.map(j=>({id:j.id,kind:j.kind,done:j.done,pjDone:j.pj?.done}))}));
}
