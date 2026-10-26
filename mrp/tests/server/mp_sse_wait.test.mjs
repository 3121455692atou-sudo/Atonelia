import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForClientDays} from '../helpers/mp_server.mjs';
test('第二连接晚到可在原有期限内补齐，不能只观察第一连接',async()=>{const clients=[{day:'2024-01-02'},{day:'2024-01-01'}];const timer=setTimeout(()=>clients[1].day='2024-01-02',30);try{await waitForClientDays(clients,'2024-01-01',250);assert.equal(clients[1].day,'2024-01-02');}finally{clearTimeout(timer);}});
test('第二连接永不推进必须超时失败并列出双方日期',async()=>{await assert.rejects(waitForClientDays([{day:'2024-01-02'},{day:'2024-01-01'}],'2024-01-01',30),/实际\["2024-01-02","2024-01-01"\]/);});
test('即使双方日期推进，原卡片条件未满足仍失败',async()=>{await assert.rejects(waitForClientDays([{day:'2024-01-02'},{day:'2024-01-02'}],'2024-01-01',30,()=>false),/未在期限内推进/);});
