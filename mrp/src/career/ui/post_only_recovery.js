import * as E from '../engine.js';
import {commitPostOnlyResume} from './post_plan_transaction.js';
import {getState,getWorld,ui,toast} from './state.js';
import {openOffice} from './office.js';
// Navigation/new games invalidate the owner token. An older write may finish,
// but must never open a card panel, toast into, or release a newer operation.
export async function resumePostOnlyFromHome(args, deps={}) {
  const state=deps.getState||getState,world=deps.getWorld||getWorld,u=deps.ui||ui;
  const commit=deps.commit||commitPostOnlyResume,notify=deps.toast||toast,open=deps.openOffice||openOffice;
  const s=state(),w=world();
  if(u.busy||u.screen!=='home'||!E.isPostOnly(s))return false;
  const token={};u.postOnlyResumeToken=token;u.busy=true;
  const current=()=>u.postOnlyResumeToken===token&&state()===s&&world()===w&&u.screen==='home'&&E.isPostOnly(s);
  try {const result=await commit(s,args);if(current())open('train',{postPlanSessionId:result.postPlan.sessionId});return true;}
  catch(e){if(current())notify(e.message);return false;}
  finally {if(u.postOnlyResumeToken===token){u.postOnlyResumeToken=null;u.busy=false;}}
}
