import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import { plateAt, COMPANY_BY_ID } from '../../src/career/data/core.js';
import { CATALOG_CARDS, CATALOG_FINGERPRINT } from '../../src/career/sim/post_catalog.js';
import { restoreHistory } from '../helpers/world_provider.mjs';
globalThis.document??={baseURI:'http://localhost/'};
const panel=await import('../../src/career/ui/panels/post_plan.js');
const {setState,setWorld,setMp}=await import('../../src/career/ui/state.js');
afterEach(()=>{restoreHistory();setWorld(null);setMp(null);});
test('display-only character selectors use era-aware names and retain stable option values without mutating save',()=>{
 restoreHistory();const s=E.createSinglePlayerGame('qwen','y2025',7);s.jobs.list=[];s.queue=[];setState(s);setWorld(null);setMp(null);
 const r=E.applyCommand(s,{name:'postPlan.open',args:{modelId:s.working,expectedModelToken:null}});assert(r.ok,r.err);
 const before=JSON.stringify(s),html=panel.render(s,{postPlanSessionId:r.result.sessionId});
 for(const id of ['qwen','deepseek_pro','github_copilot']){const p=plateAt(id,s.date);assert(html.includes(`<option value="${id}">${p.name} · ${p.label}</option>`));}
 assert(!html.includes('>deepseek_pro</option>'));assert(!html.includes('>github_copilot</option>'));assert(!html.includes('<b>gemini</b>'));
 assert.equal(JSON.stringify(s),before);assert.equal(s.postPlanSessions.catalogFingerprint,CATALOG_FINGERPRINT);
});
test('company prerequisite uses the actual organization label; mapping does not unlock cross-company cards',()=>{
 restoreHistory();const s=E.createSinglePlayerGame('qwen','y2025',7), c=CATALOG_CARDS.find(c=>c.unlock.all.some(u=>u.type==='company'&&u.id==='gemini'));assert(c);
 const before=JSON.stringify(s),v=E.postPlanCard(s,c.id);assert.equal(v.unlocked,false);assert(v.requirement.includes(`限定公司：${COMPANY_BY_ID.gemini.company}`));assert(!v.requirement.includes('undefined'));assert(!v.requirement.includes('限定公司：gemini'));assert.equal(JSON.stringify(s),before);
});
