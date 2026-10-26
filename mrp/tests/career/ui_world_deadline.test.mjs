import {it,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
import {setWorld,setMp} from '../../src/career/ui/state.js';
import {restoreHistory} from '../helpers/world_provider.mjs';
globalThis.document ??= {baseURI:'http://localhost/'};
const {topBar}=await import('../../src/career/ui/topbar.js');
afterEach(()=>{setWorld(null);setMp(null);restoreHistory();});
for(const [days,date] of [[365,'2024 年 12 月 30 日'],[730,'2025 年 12 月 30 日']]) it(`自洽 ${days} 天显示实际截止日与身家结算`,()=>{
 const w=E.createWorld({seed:1,start:'2024-01',days,companies:[{name:'测试智能',brand:'测试',country:'CN',tier:'specialist',kind:'human'}]});
 const s=Object.values(w.companies)[0].s;s.goals=[];setWorld(w);
 assert.ok(topBar(s).includes(`走到 ${date}`));assert.match(topBar(s),/终局身家结算/);assert.doesNotMatch(topBar(s),/走到 2026 年 10 月/);
});
it('史实局仍显示史实截止月份与年度评审',()=>{
 restoreHistory();const s=E.createGame('deepseek','y2025',1);s.goals=[];setWorld(null);
 assert.match(topBar(s),/走到 2026 年 10 月/);assert.match(topBar(s),/年度评审/);assert.doesNotMatch(topBar(s),/终局身家结算/);
});
for(const [days,date] of [[365,'2024 年 12 月 30 日'],[730,'2025 年 12 月 30 日']]) it(`联机 ${days} 天的公开视图镜像显示同一截止日`,()=>{
 const w=E.createWorld({seed:2,start:'2024-01',days,mp:true,companies:[{name:'联机测试',brand:'联测',country:'US',tier:'specialist',kind:'human'}]});
 const s=Object.values(w.companies)[0].s;s.goals=[];
 const provider=E.openMirror(E.publicView(w),s);
 setWorld(provider.world);setMp({room:'test',seat:0,member:'host',clock:{paused:true,players:[]},lobby:{host:'host'}});
 assert.equal(provider.world.end,w.end);
 const html=topBar(s);assert.ok(html.includes(`走到 ${date}`));assert.match(html,/终局身家结算/);assert.match(html,/联机时间/);
});
