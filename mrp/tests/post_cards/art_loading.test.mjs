import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { POST_CARD_ART } from '../../src/career/data/post_card_art.js';
import { mountPostPlanArt, disposePostPlanArt } from '../../src/career/ui/post_plan_art.js';

function dom() {
  const requested=[],decoded=[];
  class Image {
    set src(url) { this.url=url;requested.push(url); }
    decode() { decoded.push(this.url);return new Promise(()=>{}); }
  }
  const doc={baseURI:'https://local.invalid/game/',defaultView:{Image}};
  function picture(complete=false,naturalWidth=0) {
    const classes=new Set(['pp-art-pending']),label={textContent:'卡面载入中'},listeners=new Map();
    const frame={classList:{add:k=>classes.add(k),remove:k=>classes.delete(k)},querySelector:()=>label};
    const img={complete,naturalWidth,parentElement:frame,addEventListener:(k,fn)=>listeners.set(k,fn),removeEventListener:(k,fn)=>{if(listeners.get(k)===fn)listeners.delete(k);}};
    return {img,classes,label,listeners};
  }
  const ready=picture(true,320),pending=picture(),failed=picture(true,0),root={isConnected:true,ownerDocument:doc,querySelectorAll:()=>[ready.img,pending.img,failed.img]};
  return {root,requested,decoded,ready,pending,failed};
}

test('warm-up requests only the public selected deck plus basic, deduplicates redraws and does not wait for decode',()=>{
 const d=dom(),state={},ids=['ptc_qwen_sample_tabs','ptc_mistral_neat_batch','ptc_glm_task_tiles','basic'];
 assert.equal(mountPostPlanArt(state,d.root,ids),undefined);
 const expected=[...new Set(['basic',...ids])].filter(id=>POST_CARD_ART[id]).map(id=>new URL(POST_CARD_ART[id],d.root.ownerDocument.baseURI).href);
 assert.deepEqual(d.requested,expected);assert.deepEqual(d.decoded,expected);assert(d.requested.length<=5);
 mountPostPlanArt(state,d.root,ids);assert.deepEqual(d.requested,expected);
 assert(!d.requested.some(url=>url.includes('seed')||url.includes('draw')));disposePostPlanArt(state);
});

test('visible images show truthful loading/error labels, and loaded art keeps its fixed frame',()=>{
 const d=dom(),state={};mountPostPlanArt(state,d.root,[]);
 assert(d.ready.classes.has('pp-art-ready'));assert(!d.ready.classes.has('pp-art-pending'));
 assert(d.pending.classes.has('pp-art-pending'));assert.equal(d.pending.label.textContent,'卡面载入中');
 assert(d.failed.classes.has('pp-art-failed'));assert.match(d.failed.label.textContent,/未载入.*\n规则仍可用/);
 d.pending.img.naturalWidth=320;d.pending.listeners.get('load')();assert(d.pending.classes.has('pp-art-ready'));
 assert.equal(d.requested.length,0);disposePostPlanArt(state);
});

test('dismissal removes every listener and detached callbacks cannot mutate old UI',()=>{
 const d=dom(),state={};mountPostPlanArt(state,d.root,[]);const late=d.pending.listeners.get('load');
 disposePostPlanArt(state);assert.equal(d.pending.listeners.size,0);d.pending.img.naturalWidth=320;late();
 assert(d.pending.classes.has('pp-art-pending'));assert(!d.pending.classes.has('pp-art-ready'));
 const next=dom();mountPostPlanArt(state,next.root,[]);next.root.isConnected=false;next.pending.img.naturalWidth=320;next.pending.listeners.get('load')();assert(next.pending.classes.has('pp-art-pending'));disposePostPlanArt(state);
});

test('loader and eager visible-hand policy never call rules, preview a future hand, save or consume random numbers',()=>{
 const loader=fs.readFileSync(new URL('../../src/career/ui/post_plan_art.js',import.meta.url),'utf8');
 const panel=fs.readFileSync(new URL('../../src/career/ui/panels/post_plan.js',import.meta.url),'utf8');
 assert.doesNotMatch(loader,/from .*engine|Math\.random|applyCommand|localStorage|postPlanView|setTimeout/);
 assert.match(panel,/cardArt\(p\.card,S\.date,true\)/);assert.match(panel,/loading="\$\{eager \? 'eager' : 'lazy'\}"/);
 assert.match(panel,/mountPostPlanArt\(S, el\.querySelector\('\.post-plan'\), v\.deck\)/);
 assert.doesNotMatch(panel,/st\.postPlanDeck/);
});
