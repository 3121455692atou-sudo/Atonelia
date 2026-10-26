import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkRows,f4Key,verdict,parseOptions,seedsFrom,sha256,compareStrictReports } from '../../scripts/lib/acceptance.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const calib=path.resolve(root,'../calib');
const manifest={runId:'one',sourceSha256:'source',commit:'commit',expectedKeys:['bot/qwen/y2023/7919']};
const row={...manifest,mode:'bot',id:'qwen',sc:'y2023',rawSeed:7919,completed:true,errors:0,days:10};
test('完整样本通过，缺行/重复/NaN/null/错误/旧来源/未结束全部拒绝',()=>{
 assert.deepEqual(checkRows([row],manifest,f4Key,['days']),[]);
 for(const rows of [[],[row,row],[{...row,days:NaN}],[{...row,days:null}],[{...row,errors:1}],[{...row,runId:'old'}],[{...row,completed:false}]]) assert.ok(checkRows(rows,manifest,f4Key,['days']).length);
});
test('阈值超线失败，空分母不能通过',()=>{
 assert.equal(verdict(13,100,0,.12),'FAIL');assert.equal(verdict(12,100,0,.12),'PASS');assert.equal(verdict(0,0,0,.12),'UNVERIFIED');
});
test('严格种子接口拒绝未知参数、重复种子和非整数',()=>{
 assert.throws(()=>parseOptions(['--seedz','4'],['--seeds']));
 assert.throws(()=>seedsFrom(null,'NaN'));assert.throws(()=>seedsFrom(null,'0'));assert.throws(()=>seedsFrom(null,'1.5'));
 const d=fs.mkdtempSync(path.join(os.tmpdir(),'mrp-seeds-')),f=path.join(d,'s.json');
 fs.writeFileSync(f,'[100003,204732]');assert.deepEqual(seedsFrom(f,4,7919),[100003,204732]);
 fs.writeFileSync(f,'[1,1]');assert.throws(()=>seedsFrom(f,4));fs.rmSync(d,{recursive:true});
});
test('严格指纹拒绝中间状态、终局、status和伪哈希差异',()=>{
 const state={result:{rank:'B'},status:'done'},cpState={day:'2023-04-01'};
 const r={node:process.version,seed:1,problems:[],games:{one:{state,sha256:sha256(state),cp:[{state:cpState,sha256:sha256(cpState)}],errors:[],status:'done'}}};
 assert.deepEqual(compareStrictReports(r,r),[]);
 for(const mutate of [x=>x.games.one.cp[0].state.day='2023-04-02',x=>x.games.one.state.result.rank='C',x=>x.games.one.status='playing',x=>x.games.one.sha256='a'.repeat(64),x=>x.games.one.errors.push('error')]){const c=structuredClone(r);mutate(c);assert.ok(compareStrictReports(r,c).length);}
});
test('空F4目录与空grants输入退出非零',()=>{
 const d=fs.mkdtempSync(path.join(os.tmpdir(),'mrp-empty-'));
 assert.notEqual(spawnSync(process.execPath,[path.join(calib,'f4_agg.mjs'),d]).status,0);
 assert.notEqual(spawnSync(process.execPath,[path.join(calib,'grants_all.mjs'),root,'0','']).status,0);
 fs.rmSync(d,{recursive:true});
});
test('后台子进程失败不能被DONE掩盖',()=>{
 const d=fs.mkdtempSync(path.join(os.tmpdir(),'mrp-child-'));const bin=path.join(d,'bin');fs.mkdirSync(bin);
 fs.writeFileSync(path.join(bin,'node'),`#!/bin/bash\ncase "$1" in\n *f4_manifest.mjs) exec '${process.execPath}' "$@";;\n *f4_metrics.mjs) exit 19;;\n *) exit 0;;\nesac\n`,{mode:0o755});
 const out=path.join(d,'out');const r=spawnSync('bash',[path.join(calib,'run_f4.sh'),out,'1'],{env:{...process.env,PATH:bin+':'+process.env.PATH}});
 assert.equal(r.status,1);assert.equal(fs.existsSync(path.join(out,'DONE')),false);
 assert.equal(fs.readFileSync(path.join(out,'children.log'),'utf8').trim().split('\n').length,6);
 fs.rmSync(d,{recursive:true});
});

import { mpVerdict } from '../../scripts/lib/mp_acceptance.mjs';
test('联机p99/流量严格边界、空分母、重放失败均拒绝',()=>{
 const st={started:true,paused:true,day:'2026-01-01',end:'2025-12-31',days:730,hash:'hash',p99:49};
 const pre={ended:false,days:700,bytes:Object.fromEntries(Array.from({length:6},(_,i)=>[i,700*2*1024*4]))};
 const evalAt=(a=st,b=pre,h='hash')=>mpVerdict(a,b,st.day,h,6,2,730);
 assert.equal(evalAt().rules.find(x=>x.id==='p99').status,'PASS');
 assert.equal(evalAt({...st,p99:50}).status,'FAIL');
 assert.equal(evalAt(st,{...pre,bytes:{...pre.bytes,0:700*2*1024*5}}).status,'FAIL');
 assert.equal(evalAt(st,{...pre,days:0}).rules.find(x=>x.id==='traffic.normalized2s').status,'UNVERIFIED');
 assert.equal(evalAt({...st,p99:null}).rules.find(x=>x.id==='p99').status,'UNVERIFIED');
 assert.equal(evalAt(st,pre,'different').status,'FAIL');
 assert.equal(evalAt().status,'UNVERIFIED'); // 加速运行不是原速度环境验收。
});

import { extendedRules } from '../../../calib/f4_extended.mjs';
test('逐tier训练门槛不能被全tier平均掩盖；原始分母缺失不能PASS',()=>{
 const counts={champion:{over:0,meet:0,flat:0,under_half:0,under:0},challenger:{over:0,meet:0,flat:0,under_half:0,under:0},small:{over:0,meet:0,flat:0,under_half:0,under:0}};
 const row={mode:'bot',tier:'frontier',mod:'llm',sc:'y2024',days:365,expectCounts:counts,expectUnknown:[],expectSmallEligible:false,jobDays:365,repairDays:50,trialCards:7,trainCards:1000,postQueueMax:0,yearModels:2,yearExposureDays:365,researchCompleted:10,runBase:[2,2]};
 const rules=extendedRules([row]);
 assert.equal(rules.find(x=>x.id==='jobs.trial.frontier').status,'FAIL');
 assert.equal(rules.find(x=>x.id==='jobs.yearModels.frontier').status,'FAIL');
 assert.equal(rules.find(x=>x.id==='jobs.concurrent.frontier').status,'PASS');
 assert.equal(extendedRules([{...row,trainCards:0}]).find(x=>x.id==='jobs.trial.frontier').status,'UNVERIFIED');
 assert.equal(rules.find(x=>x.id==='historical.route').status,'BLOCKED');
});
test('LLM期待按被评发布算比例，符合及以上与略低合并口径正确',()=>{
 const row={mode:'bot',mod:'llm',tier:'frontier',expectUnknown:[],expectSmallEligible:false,expectCounts:{champion:{over:35,meet:35,flat:0,under_half:10,under:20},challenger:{over:6,meet:53,flat:11,under_half:10,under:20}}};
 const rules=extendedRules([row]);
 for(const x of rules.filter(x=>/^expect\.(champion|challenger)\./.test(x.id))) assert.equal(x.status,'PASS',x.id);
 const changed=structuredClone(row);changed.expectCounts.champion={over:100,meet:0,flat:0,under_half:0,under:0};
 assert.equal(extendedRules([changed]).find(x=>x.id==='expect.champion.over').status,'FAIL');
});
