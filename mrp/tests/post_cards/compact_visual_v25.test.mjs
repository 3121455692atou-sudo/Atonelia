import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as E from '../../src/career/engine.js';
import {setState,setWorld,setMp,ui} from '../../src/career/ui/state.js';
globalThis.document??={baseURI:'https://local.invalid/'};
const home=await import('../../src/career/ui/home.js');
function fresh(){E.setProvider();const s=E.createSinglePlayerGame('deepseek','y2025',7);s.queue=[];setState(s);setWorld(null);setMp(null);return s;}
test('actual quick buttons keep original commands and short unbroken names',()=>{
 const s=fresh(),before=JSON.stringify(s),app={};home.renderHome(app);
 for(const [id,label] of [['data','数据'],['compute','算力'],['tech','研究'],['eval','跑分'],['model','模型']]){
  const button=app.innerHTML.match(new RegExp(`<button class="quick-btn[^>]+data-act="quick" data-id="${id}"[^>]*>[\\s\\S]*?<\\/button>`))?.[0];assert(button,id);assert.match(button,new RegExp(`<span>${label}</span>`));
 }
 assert.match(app.innerHTML,/class="btn home-more" data-act="quick" data-id="more"/);assert.equal(JSON.stringify(s),before);
});
test('non-primary advice is explicitly expandable and its open state survives a home redraw',()=>{
 fresh();const app={querySelector:selector=>selector==='.home-advice-options'?{open:true}:null};home.renderHome(app);
 assert.match(app.innerHTML,/<details class="home-advice-options" open><summary>其他操作<\/summary>/);
 assert.match(app.innerHTML,/data-act="advice"/);assert.match(app.innerHTML,/data-act="more-toggle"/);
});
function rules(text,conditions=[]){text=text.replace(/\/\*[\s\S]*?\*\//g,'');const out=[];let p=0;while(p<text.length){const start=text.indexOf('{',p);if(start<0)break;const h=text.slice(p,start).trim();let end=start+1,n=1;while(end<text.length&&n){if(text[end]==='{')n++;if(text[end]==='}')n--;end++;}const body=text.slice(start+1,end-1);p=end;if(h.startsWith('@media'))out.push(...rules(body,[...conditions,h.slice(6)]));else if(!h.startsWith('@'))for(const selector of h.split(','))out.push({selector:selector.trim(),body,conditions});}return out;}
const css=fs.readFileSync(new URL('../../src/career/css/responsive_fit.css',import.meta.url),'utf8');
function panelStyle(w,h){const style={};for(const r of rules(css)){if(!['.home .panel','.app--home .home .panel'].includes(r.selector))continue;if(!r.conditions.every(q=>q.split(',').some(part=>{const ranges=[...part.matchAll(/(min|max)-(width|height)\s*:\s*(\d+)px/g)];return ranges.length&&ranges.every(([,a,b,n])=>a==='min'?(b==='width'?w:h)>=+n:(b==='width'?w:h)<=+n);})))continue;for(const d of r.body.split(';')){const at=d.indexOf(':');if(at>0)style[d.slice(0,at).trim()]=d.slice(at+1).trim();}}return style;}
for(const w of [320,390])test(`final short panel cascade removes 60 percent cap at ${w}x321`,()=>{const s=panelStyle(w,321);assert.equal(s['max-height'],'none');assert.equal(s.display,'grid');assert.equal(s['align-content'],'start');});

test('a single direct recommendation has no empty other-actions disclosure',()=>{
 fresh();const s=E.createSinglePlayerGame('deepseek','y2023',7);s.queue=[];setState(s);const list=E.advise(s),one=list.find(a=>!['free','page'].includes(a.kind)&&!(a.kind==='jobs'&&a.op?.type==='job'&&a.op.op==='post'));
 assert(one,'fixture must include a direct non-post recommendation');ui.skip.clear();
 try{for(const a of list)if(a.id!==one.id)ui.skip.add(`${s.date}|${a.id}`);const app={};home.renderHome(app);assert.match(app.innerHTML,/data-act="advice"/);assert.doesNotMatch(app.innerHTML,/class="home-advice-options"/);}finally{ui.skip.clear();}
});
test('stable extreme practice correction retains readable meters and reserves six-pixel card clearance',()=>{
 const fix=css.slice(css.indexOf('/* Stable 320x321'));assert.match(fix,/@container \(max-height:280px\)/);assert.match(fix,/height:52px;min-height:52px/);assert.match(fix,/padding-bottom:6px/);assert.match(fix,/font-size:14px;white-space:nowrap/);assert.doesNotMatch(fix,/display:none|font-size:(?:[0-9]|10)px/);
});
test('unaffordable hand uses a short status but retains the concrete rejection reason',async()=>{
 const panel=await import('../../src/career/ui/panels/post_plan.js');const s=fresh();s.jobs.list=[];s.techs=[...new Set([...s.techs,'long_ctx','reasoning'])];
 const cmd=(name,args)=>{const r=E.applyCommand(s,{name,args});assert(r.ok,r.err);return r.result;};let v=cmd('postPlan.open',{modelId:s.working,expectedModelToken:null});v=cmd('postPlan.confirmDeck',{sessionId:v.sessionId,expectedRevision:v.revision,cardIds:['basic','ptc_qwen_context_index','ptc_gemini_million_window','ptc_gpt_slow_answer'],directionPolicy:v.directionPolicy});
 for(let i=0;i<4;i++)v=cmd('postPlan.choose',{sessionId:v.sessionId,expectedRevision:v.revision,turn:v.turn,cardId:v.hand.find(x=>x.id!=='basic'&&x.affordable).id}).view;
 const blocked=v.hand.find(x=>!x.affordable);assert(blocked);
 const before=JSON.stringify(s),html=panel.render(s,{postPlanSessionId:v.sessionId});assert.match(html,/>不可用<\/b>/);assert(html.includes(blocked.error));assert.match(html,/aria-disabled="true"/);assert.equal(JSON.stringify(s),before);
});
