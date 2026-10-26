// Ready-to-use practice starting conditions. Every operation after setup uses
// the normal UI and commands; this module does not render teaching controls.
import { createSinglePlayerGame } from './post_product.js';
import { workingModel } from './model.js';
import { applyCommand } from './commands.js';
import { P } from './provider.js';

export const PRACTICE_STEPS = Object.freeze([
  { id: 'research', page: 'tech', label: '研究' },
  { id: 'strategy', page: 'strategy', label: '公司策略' },
  { id: 'data', picker: 'data', label: '数据集' },
  { id: 'compute', page: 'compute', label: '算力' },
  { id: 'project', page: 'train', label: '训练' },
  { id: 'evaluation', page: 'train', label: '训练' },
  { id: 'service', page: 'service', label: '服务' },
  { id: 'finance', page: 'capital', label: '资本' },
  { id: 'automation', page: 'automation', label: '托管' },
]);
// The introductory walkthrough starts at an ordinary new-game home screen.
// No prepared card session, extra training days, free resources or completed tasks.
export function createOnboardingGame() {
  if(P().mode!=='history'||P().world||P().mirror)throw Error('引导需要独立页面');
  const game=createSinglePlayerGame('deepseek','y2024',261026);
  return {game,baseline:{day:game.day,modelId:game.working},sessionId:null};
}
export function createPracticeGame(kind) {
  if (!['basic','advanced'].includes(kind)) throw Error('没有这个练习');
  if (P().mode !== 'history' || P().world || P().mirror) throw Error('练习需要独立页面');
  const game=createSinglePlayerGame('gpt','y2025',261026);
  game.queue=[];
  game.strategy.cur=null;game.strategy.shelved={};
  workingModel(game).postDays=14;
  const baseline={inferShare:game.inferShare,tier:game.products.api.tier,research:game.research.map(r=>r.id),jobs:game.jobs.list.map(j=>j.id),orders:game.orders.map(o=>o.id),evals:game.evals.map(e=>e.id)};
  let sessionId=null;
  if(kind==='basic'){
    for(const command of [
      {name:'setPlayMode',args:{mode:'post'}},
      {name:'startJob',args:{spec:{kind:'post',target:'main',dir:'auto',until:'none'}}},
      {name:'postPlan.open',args:{modelId:game.working,expectedModelToken:null}},
    ]){const r=applyCommand(game,command);if(!r.ok)throw Error(r.err);if(r.result?.sessionId)sessionId=r.result.sessionId;}
  }
  return {game,baseline,sessionId};
}
export function practiceStepComplete(game,id,baseline){
  switch(id){
    case'research':return game.research.some(r=>!baseline.research.includes(r.id));
    case'strategy':return !!game.strategy.cur;
    case'data':return game.orders.some(o=>o.kind==='data'&&!baseline.orders.includes(o.id));
    case'compute':return game.inferShare!==baseline.inferShare;
    case'project':return game.jobs.list.some(j=>j.kind==='pretrain'&&!baseline.jobs.includes(j.id));
    case'evaluation':return game.evals.some(e=>!baseline.evals.includes(e.id));
    case'service':return game.products.api.tier!==baseline.tier;
    case'finance':return !!game.capital.round;
    case'automation':return !!game.automation;
    default:return false;
  }
}
