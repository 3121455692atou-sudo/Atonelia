// Coach only: no copied game UI, fake gameplay buttons, or alternate commands.
import * as E from '../engine.js';
import { createPracticeGame, createOnboardingGame, PRACTICE_STEPS, practiceStepComplete } from '../engine.js';
import { practiceKind, exitPractice } from './practice_context.js';
import { enterGame } from './flow.js';
import { getState, clock, ui, setSpeed } from './state.js';

export function practiceTargetAvailable(el){
  if(!el||el.disabled||el.hidden||el.closest?.('[inert],[hidden]')||el.getAttribute?.('aria-disabled')==='true'||!el.getClientRects?.().length)return false;
  for(let p=el.parentElement;p;p=p.parentElement){
    if(p.tagName==='DETAILS'&&!p.open&&!p.querySelector(':scope > summary')?.contains(el))return false;
  }
  const doc=el.ownerDocument,win=doc?.defaultView;
  // Non-browser engine/handler tests have no layout; browser targets must pass
  // actual geometry and hit testing, not merely have a generated layout box.
  if(!doc||!win)return true;
  const style=win.getComputedStyle(el);
  if(style.visibility==='hidden'||style.visibility==='collapse'||style.display==='none'||style.opacity==='0'||style.pointerEvents==='none')return false;
  const rect=el.getBoundingClientRect();
  let left=Math.max(0,rect.left),right=Math.min(win.innerWidth,rect.right);
  let top=Math.max(doc.querySelector('.practice-coach')?.getBoundingClientRect().bottom||0,rect.top),bottom=Math.min(win.innerHeight,rect.bottom);
  for(let p=el.parentElement;p;p=p.parentElement){
    const s=win.getComputedStyle(p),r=p.getBoundingClientRect();
    if(s.opacity==='0'||s.visibility==='hidden'||s.visibility==='collapse')return false;
    if(/auto|scroll|hidden|clip/.test(s.overflowX)){left=Math.max(left,r.left);right=Math.min(right,r.right);}
    if(/auto|scroll|hidden|clip/.test(s.overflowY)){top=Math.max(top,r.top);bottom=Math.min(bottom,r.bottom);}
  }
  if(right-left<Math.min(40,rect.width)||bottom-top<Math.min(32,rect.height)||right<=left||bottom<=top)return false;
  const hit=doc.elementFromPoint((left+right)/2,(top+bottom)/2);
  return !!hit&&(hit===el||el.contains(hit));
}
const available=practiceTargetAvailable;
// A visible modal owns interaction; never point through it at the home page.
const surface = doc => [...doc.querySelectorAll('.overlay')].filter(available).at(-1)||doc;
const find = (doc,selector) => [...surface(doc).querySelectorAll(selector)].find(available);
const hint=(element,text)=>element?{element,text}:null;
function navigate(doc,page,label){
  const tab=find(doc,`[data-page="${page}"]`);
  if(tab)return hint(tab,`点「${label}」。`);
  const close=find(doc,'.overlay [data-close]');
  if(close)return hint(close,'先回到主界面。');
  if(surface(doc)!==doc)return null;
  if(page==='train'){
    const cards=find(doc,'[data-act="post-only-cards"]');
    if(cards)return hint(cards,'点「继续选牌」。');
    const train=find(doc,'[data-act="open-train"]');
    if(train)return hint(train,'点这里，进入训练。');
  }
  const quick=find(doc,`[data-act="quick"][data-id="${page}"]`);
  if(quick)return hint(quick,`点这里，打开${label}。`);
  return hint(find(doc,'[data-act="office"]'), '点右上角菜单。');
}
function basicGuide(doc,game,sessionId){
  const view=E.postPlanView(game,sessionId);
  if(['ready','active'].includes(view.status))return {done:true,text:'六手完成了，你已经会出牌了。'};
  const info=find(doc,'.pp-info:not([hidden]) [data-pp-info]');
  if(info)return hint(info,'点「关闭说明」，回到手牌。');
  if(doc.querySelector('.post-plan[aria-busy="true"]'))return {text:'正在确认，稍等一下。'};
  if(view.controlMode==='auto')return hint(find(doc,'[data-pp-control="manual"]'),'点这里，改为自己出牌。');
  const confirm=find(doc,'[data-pp-confirm]');
  if(view.status==='draft'&&confirm)return hint(confirm,'牌已配好，点这里开始。');
  if(view.status==='draft'&&doc.querySelector('.post-plan'))return hint(find(doc,'[data-pp-deck][aria-pressed="false"]'),'点卡收入卡包，至少收三张。');
  const choose=find(doc,'[data-pp-choose]');
  if(view.status==='playing'&&choose)return hint(choose,'点「确认出牌」。');
  const card=find(doc,'[data-pp-select]');
  if(view.status==='playing'&&card)return hint(card,'点一张想用的牌。');
  const open=find(doc,`[data-pp-open="${view.modelId}"]`);
  if(open)return hint(open,'点这里，继续选牌。');
  return navigate(doc,'train','训练');
}
function advancedGuide(doc,game,step){
  let target;
  switch(step.id){
    case'research':{
      target=find(doc,'[data-tech]');if(target)return hint(target,'点「开始研究」。');
      const ids=E.researchOptions(game).filter(x=>x.check.ok).map(x=>x.t.id);
      for(const id of ids){target=find(doc,`[data-tech-pick="${id}"]`);if(target)return hint(target,'点这项技术，看看怎么研究。');}break;
    }
    case'strategy':{
      target=find(doc,'[data-strategy-op="start"]');if(target)return hint(target,'点「开始这项策略」。');
      const ids=E.strategyOptions(game).filter(x=>x.state==='available'&&!x.node.auto).map(x=>x.id);
      for(const id of ids){target=find(doc,`[data-strategy-open="${id}"],[data-strategy-pick="${id}"]`);if(target)return hint(target,'点这项策略。');}break;
    }
    case'data':{
      const ids=E.dataOptions(game).filter(x=>x.ok&&!x.gen).map(x=>x.id);
      for(const id of ids){target=find(doc,`.overlay--picker [data-pick="${id}"]`);if(target)return hint(target,'点一份数据下单。');}
      const close=find(doc,'.overlay [data-close]');if(close)return hint(close,'先回到主界面。');
      return hint(find(doc,'[data-act="quick"][data-id="data"]'),'点「数据」。');
    }
    case'compute':target=find(doc,'input[data-infer]');if(target)return hint(target,'拖动滑块，改一下推理份额。');break;
    case'project':
      target=find(doc,'[data-op="start-project"]');if(target)return hint(target,'参数已备好，点「立项」。');
      target=find(doc,'[data-new="pretrain"]');if(target)return hint(target,'点「底座」，开始新项目。');break;
    case'evaluation':
      target=find(doc,'[data-submit-box] [data-pick="flagship"], [data-submit-box] [data-pick="main"]');if(target)return hint(target,'点「送评」，提交这个模型。');
      target=find(doc,`[data-submit="${game.working}"]`);if(target)return hint(target,'点模型旁边的「送评」。');break;
    case'service':target=find(doc,'select[data-tier="api"][data-key="tier"]');if(target)return hint(target,'换一个 API 价档。');break;
    case'finance':target=find(doc,'[data-fund]');if(target)return hint(target,'点一份融资报价。');break;
    case'automation':target=find(doc,'[data-auto-enable]');if(target)return hint(target,'点这里，启用托管。');break;
  }
  return navigate(doc,step.page,step.label);
}
function onboardingGuide(doc,game,stage) {
  const tell=(element,title,text,extra={})=>({element,title,text,...extra});
  const event=find(doc,'[data-choice], [data-next], [data-vn-next]');
  if(game.queue.length&&event)return tell(event,'开局消息','先读完公司的开局消息，点这里继续。后面会从主页开始操作。');
  if(stage===0)return tell(null,'1 / 7 · 从公司主页开始','你接手的是 2024 年的 DeepSeek。这一局先学会：找到训练入口、安排后训练、选卡出牌，再让方案生效。引导局退出后不保存，也不会改动你的正式存档。',{advance:true,nextLabel:'开始引导'});
  if(stage===1){
    const button=find(doc,'[data-act="open-model-training"]');
    if(button)return tell(button,'2 / 7 · 找到模型训练','点「模型训练」。这里管理预训练、后训练和蒸馏等训练项目。');
  }
  if(stage===2){
    const close=find(doc,'.overlay [data-close]');
    if(close)return tell(close,'2 / 7 · 认识训练页','预训练用来造新模型；后训练改进已有模型。现在点左上角返回按钮回到主页，试一次后训练。');
  }
  const sid=game.postPlanSessions?.byModel[game.working],session=sid&&game.postPlanSessions.sessions[sid];
  if(!session){
    const start=find(doc,'[data-op="start-post"]');
    if(start)return tell(start,'3 / 7 · 安排后训练','上方可以选训练方向和时长。这次保留默认值，点「开始后训练」；接下来配卡，决定训练方案。');
    const model=find(doc,`[data-home-post-model="${game.working}"]`);
    if(model)return tell(model,'3 / 7 · 选择训练对象','选这台已有的模型。后训练会提升它的能力，不会另外造一台模型。');
    const post=find(doc,'[data-act="open-post-training"]');
    if(post)return tell(post,'3 / 7 · 从主页开始后训练','点醒目的「后训练」，再选择要练的模型。');
    const close=find(doc,'.overlay [data-close]');
    if(close)return tell(close,'3 / 7 · 返回主页','先关闭这个页面，再点主页上的「后训练」。');
    return {title:'3 / 7 · 安排训练',text:'完成当前页面的选择后，回主页点「后训练」。'};
  }
  const view=E.postPlanView(game,sid);
  if(['ready','active'].includes(view.status)){
    if(view.status==='active'||game.day>=view.effectiveFromDay)return tell(null,'7 / 7 · 已完成一次后训练流程','方案已经生效。以后从主页点「后训练」选模型，点「模型训练」管理项目；推进时间后，模型才会继续成长。',{done:true,advance:true,nextLabel:'继续练习'});
    const back=find(doc,'[data-pp-back]')||find(doc,'.overlay [data-close]');
    if(back)return tell(back,'6 / 7 · 让训练真正生效',`本轮 ${view.score} 分，训练方案已经保存。先返回主页，再推进游戏时间，方案会在 ${view.effectiveFromDay} 生效。`);
    const play=find(doc,'[data-act="speed-toggle"]');
    return tell(play,'6 / 7 · 推进一天','点 ▶ 让时间前进。安排训练、选卡都不会自动过一天；日期前进后，模型才按方案训练。');
  }
  const info=find(doc,'.pp-info:not([hidden]) [data-pp-info]');
  if(info)return tell(info,'4 / 7 · 看懂卡牌','这里写着费用和效果。看完关闭，回到卡包或手牌继续。');
  if(doc.querySelector('.post-plan[aria-busy="true"]'))return {title:'正在保存',text:'操作正在保存，完成后继续。'};
  if(view.status==='draft'){
    if(stage<4)return tell(find(doc,'[data-pp-pack]'),'4 / 7 · 卡包决定能抽到什么','卡册里点牌会收入卡包；打开卡包再点牌就能放回。每回合从包里发三张，选一张打出，共六回合。这次可以先用已配好的卡包。',{advance:true,nextLabel:'去出牌'});
    return tell(find(doc,'[data-pp-confirm]'),'4 / 7 · 开始这一轮','点「开始六手训练」。接下来要用有限预算选牌得分，分数会影响训练方案的效果。');
  }
  if(view.controlMode==='auto')return tell(find(doc,'[data-pp-control="manual"]'),'5 / 7 · 试着自己出牌','点这里接管。先亲手选一张，看清费用和效果。');
  const choose=find(doc,'[data-pp-choose]');
  if(choose){
    const selected=find(doc,'[data-pp-select][aria-pressed="true"]');
    const card=view.hand.find(x=>x.id===selected?.dataset?.ppSelect);
    return tell(choose,'5 / 7 · 确认才会出牌',card?`这张牌预计得 ${card.total} 分，消耗 ${card.paid} 点预算。点「确认出牌」后结算，再发下一手。`:'预览里能看到得分和预算变化。点「确认出牌」才会生效。');
  }
  const recommended=view.hand.find(x=>x.affordable&&x.card.kind==='prepare')||view.hand.find(x=>x.affordable);
  const card=recommended&&find(doc,`[data-pp-select="${recommended.id}"]`);
  if(card)return tell(card,`5 / 7 · 第 ${view.turn} / 6 回合`,view.turn===1?'先点一张牌看效果：左上是预计得分，右上是费用。准备牌能积累状态，让后面的牌得更多分。':`现在累计 ${view.score} 分，剩余预算 ${view.budget}。继续选牌，比较得分、费用和留下的状态。`);
  return {...navigate(doc,'train','训练'),title:'5 / 7 · 继续这一轮'};
}
export function practiceGuide(doc,game,kind,sessionId,stage){
  return kind==='basic'?(sessionId?basicGuide(doc,game,sessionId):onboardingGuide(doc,game,stage)):stage>=PRACTICE_STEPS.length?{done:true,text:'这些操作你都会了。'}:advancedGuide(doc,game,PRACTICE_STEPS[stage]);
}
export async function startPracticeTutorial(){
  const kind=practiceKind();if(!kind)throw Error('练习尚未安全启动');
  const {game,baseline,sessionId}=kind==='basic'?createOnboardingGame():createPracticeGame(kind);
  const doc=document,rail=doc.createElement('aside');rail.className='practice-coach';rail.setAttribute('aria-label','新手引导');
  const copy=doc.createElement('div');copy.className='practice-coach-copy';
  const title=doc.createElement('strong'),text=doc.createElement('span');text.setAttribute('role','status');copy.append(title,text);
  const nextButton=doc.createElement('button');nextButton.type='button';nextButton.className='btn practice-next';nextButton.hidden=true;
  const leave=doc.createElement('button');leave.type='button';leave.className='btn';leave.textContent='退出引导';leave.addEventListener('click',()=>exitPractice());
  rail.append(copy,nextButton,leave);doc.body.prepend(rail);doc.body.classList.add('is-practice');
  let stage=0,highlight=null,key='',scheduled=false,stopped=false,current=null;
  const resize=()=>{const px=Math.ceil(rail.getBoundingClientRect().height);doc.documentElement.style.setProperty('--practice-coach-height',`${px}px`);};
  const sizeObserver=typeof ResizeObserver==='function'?new ResizeObserver(resize):null;sizeObserver?.observe(rail);resize();
  function sync(){
    scheduled=false;if(stopped||getState()!==game)return;
    if(kind==='advanced')while(stage<PRACTICE_STEPS.length&&practiceStepComplete(game,PRACTICE_STEPS[stage].id,baseline))stage++;
    const next=practiceGuide(doc,game,kind,sessionId,stage)||{text:'点「退出练习」可以随时返回。',element:leave};
    current=next;nextButton.hidden=!next.advance;nextButton.textContent=next.nextLabel||'下一步';
    title.textContent=next.title||'经营操作引导';
    const target=next.done?nextButton:next.element;
    if(next.done&&clock.speed)setSpeed(0);
    if(highlight!==target){highlight?.classList.remove('practice-target');highlight=target;highlight?.classList.add('practice-target');}
    if(text.textContent!==next.text)text.textContent=next.text;
    const newKey=`${stage}:${next.text}`;
    // Cards already fit the available viewport; never scroll their fixed stage.
    if(newKey!==key){key=newKey;if(target!==leave&&!target?.closest?.('.post-plan'))target?.scrollIntoView?.({block:'nearest',inline:'nearest',behavior:'auto'});}
    resize();
  }
  const schedule=()=>{if(!scheduled&&!stopped){scheduled=true;queueMicrotask(sync);}};
  const followClick=event=>{
    if(kind==='basic'){
      if(stage===1&&event.target.closest?.('[data-act="open-model-training"]'))stage=2;
      else if(stage===2&&event.target.closest?.('[data-close]'))stage=3;
    }
    schedule();
  };
  const observer=new MutationObserver(schedule);observer.observe(doc.getElementById('app'),{childList:true,subtree:true});observer.observe(doc.getElementById('overlay-root'),{childList:true,subtree:true});
  doc.addEventListener('animationend',schedule,true);doc.addEventListener('transitionend',schedule,true);
  doc.addEventListener('click',followClick);doc.addEventListener('change',schedule);doc.addEventListener('scroll',schedule,{capture:true,passive:true});window.addEventListener('resize',schedule);
  const stop=()=>{stopped=true;observer.disconnect();sizeObserver?.disconnect();doc.removeEventListener('animationend',schedule,true);doc.removeEventListener('transitionend',schedule,true);doc.removeEventListener('click',followClick);doc.removeEventListener('change',schedule);doc.removeEventListener('scroll',schedule,true);window.removeEventListener('resize',schedule);highlight?.classList.remove('practice-target');clearTimeout(clock.timer);clock.speed=0;};
  nextButton.addEventListener('click',()=>{
    if(current?.done){stop();rail.remove();doc.body.classList.remove('is-practice');doc.documentElement.style.removeProperty('--practice-coach-height');return;}
    stage=stage===0?1:Math.max(4,stage+1);schedule();
  });
  window.addEventListener('pagehide',stop,{once:true});
  window.addEventListener('pageshow',event=>{if(event.persisted)window.location.reload();});
  void enterGame(game);ui.practice=true;sync();
  return {game,baseline,sessionId,stop,sync,get stage(){return stage;}};
}
