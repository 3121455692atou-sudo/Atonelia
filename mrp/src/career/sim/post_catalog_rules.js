// Public catalogue rules; the old eight-card file serves only internal fixtures.
import { CATALOG_CARDS, catalogueCard, catalogueUnlocked, cardSummary, catalogueDeckEffect, CATALOG_FINGERPRINT } from './post_catalog.js';
import { DSL_CAPS, DSL_LIMITS, evaluateCard, startCardTurn } from './post_card_dsl.js';
export const CARDS = CATALOG_CARDS;
export const CAPS = DSL_CAPS;
export const unlocked = catalogueUnlocked;
export const deckEffect = catalogueDeckEffect;
export const cardRequirement = (id, config) => cardSummary(catalogueCard(id),config).requirement;
export const DRAW_RULES_VERSION = 2;
export const MAX_DECK_SIZE = CARDS.length;
export function validDeck(deck, config) { return Array.isArray(deck) && deck.length >= 3 && deck.length <= MAX_DECK_SIZE && new Set(deck).size === deck.length && deck.includes('basic') && deck.every(id => catalogueUnlocked(id,config)); }
function random(s) { s.rng = (Math.imul(s.rng,1664525)+1013904223) >>> 0; return s.rng / 4294967296; }
function shuffle(s, ids) {
  const pile=[...ids];
  for(let i=pile.length-1;i>0;i--){const j=Math.floor(random(s)*(i+1));[pile[i],pile[j]]=[pile[j],pile[i]];}
  return pile;
}
function draw(s) {
  // Existing confirmed saves replay their original RNG and hands byte for byte.
  if (!s.drawRulesVersion) { const deck=s.deck.filter(id=>id!=='basic');s.hand=[];for(let i=0;i<2;i++)s.hand.push(deck.splice(Math.floor(random(s)*deck.length),1)[0]);s.hand.push('basic');return; }
  const previous=new Set(s.hand);s.hand=[];
  for(let i=0;i<3;i++) {
    if(!s.drawPile.length)s.drawPile=shuffle(s,s.deck.filter(id=>!s.hand.includes(id)));
    let at=s.drawPile.findIndex(id=>!previous.has(id)&&!s.hand.includes(id));
    // At the end of a cycle, postpone the preceding hand when the bag allows it.
    if(at<0&&s.deck.some(id=>!previous.has(id)&&!s.hand.includes(id))) {
      s.drawPile=shuffle(s,s.deck.filter(id=>!s.hand.includes(id)));at=s.drawPile.findIndex(id=>!previous.has(id));
    }
    if(at<0)at=s.drawPile.findIndex(id=>!s.hand.includes(id));
    s.hand.push(s.drawPile.splice(at,1)[0]);
  }
  // Basic occupies a slot only when drawn normally or needed to prevent a dead end.
  if(!s.hand.some(id=>evaluateCard(s,catalogueCard(id)).ok)) {
    const returned=s.hand.pop();s.drawPile=s.drawPile.filter(id=>id!=='basic');
    if(!s.drawPile.includes(returned))s.drawPile.unshift(returned);
    s.hand.push('basic');
  }
}
export function start(seed, limit, deck, config, drawRulesVersion = DRAW_RULES_VERSION) {
  if (![1,DRAW_RULES_VERSION].includes(drawRulesVersion) || !validDeck(deck,config) || (drawRulesVersion===1&&deck.length!==4)) throw Error('卡包至少需要三张已解锁的不同卡，并保留免费基础卡');
  const s = { version:3,catalogFingerprint:CATALOG_FINGERPRINT,deck:[...deck],config:structuredClone(config),rng:seed>>>0,turn:1,maxTurns:6,budget:8,focus:0,flow:0,shield:0,boost:0,score:0,goal:90,limit:Math.max(0,Number.isFinite(limit)?limit:0),pending:[],nextEventId:1,history:[],hand:[],status:'playing',log:[],revision:0 };
  if(drawRulesVersion===DRAW_RULES_VERSION){s.drawRulesVersion=drawRulesVersion;s.drawPile=[];}
  draw(s); return s;
}
export function preview(s,id) {
  const c = catalogueCard(id);
  if (!c || !s.hand.includes(id) || s.status !== 'playing' || !catalogueUnlocked(id,s.config)) return null;
  const result = evaluateCard(s,c), card = cardSummary(c,s.config);
  if (!result.ok) return { paid:result.paid,affordable:false,error:result.error,card };
  const remaining = 6-s.turn;
  return { paid:result.paid,affordable:true,instant:result.instant,tick:result.tick,total:result.total,formula:result.formula,card,
    futureValue:(result.work.focus-s.focus)*remaining*4+(result.work.flow-s.flow)*remaining*2+(result.work.shield-s.shield)*2+result.work.pending.reduce((n,e)=>n+e.payload.reduce((v,p)=>v+Object.values(p.delta).reduce((a,x)=>a+Math.max(0,x),0),0),0),
    projected:{focus:result.work.focus,flow:result.work.flow,shield:result.work.shield,boost:result.work.boost,pendingCount:result.work.pending.length} };
}
export function choose(s,id,revision=s.revision) {
  if (revision !== s.revision) return {ok:false,error:'旧操作已失效'};
  const c=catalogueCard(id);
  if (!c || !s.hand.includes(id) || !catalogueUnlocked(id,s.config)) return {ok:false,error:'不是当前合法手牌'};
  const result=evaluateCard(s,c); if (!result.ok) return {ok:false,error:result.error};
  const w=result.work; w.revision++;
  if (w.turn === 6) { w.status='done';w.mode='manual';w.hand=[];w.log.at(-1).expired.push(...w.pending.map(e=>e.id));w.pending=[]; }
  else { w.turn++;const due=startCardTurn(w);w.log.at(-1).dueNext=due;draw(w); }
  Object.assign(s,w);return {ok:true,event:structuredClone(s.log.at(-1))};
}
export function settle(s) {
  if(s.status!=='done')return null;
  const d=deckEffect(s.deck),executionRate=.97+.03*Math.min(1,s.score/90),rate=Math.max(0,Math.min(1,d.efficiency*executionRate));
  return {rate,deckEfficiency:d.efficiency,executionRate,scheme:d.scheme,actual:s.limit*rate,limit:s.limit,score:s.score};
}
export function automatic(s) { if(s.status!=='playing')return false;while(s.status==='playing'){const p=s.hand.map(id=>({id,p:preview(s,id)})).filter(x=>x.p?.affordable);p.sort((a,b)=>(b.p.total+b.p.futureValue)-(a.p.total+a.p.futureValue));if(!p.length||!choose(s,p[0].id).ok)throw Error('没有合法自动动作');}s.mode='auto';return true; }
export function replayProof(r) { return {catalogFingerprint:r.catalogFingerprint,turn:r.turn,budget:r.budget,focus:r.focus,flow:r.flow,shield:r.shield,boost:r.boost,score:r.score,pending:structuredClone(r.pending),nextEventId:r.nextEventId,history:structuredClone(r.history),rng:r.rng,hand:[...r.hand],status:r.status,revision:r.revision,...(r.drawRulesVersion?{drawRulesVersion:r.drawRulesVersion,drawPile:[...r.drawPile]}:{})}; }
