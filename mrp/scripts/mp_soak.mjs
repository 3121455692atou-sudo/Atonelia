#!/usr/bin/env node
// 加速浸泡保留重放证据，性能与流量各自判定；不把重放一致冒充全部达标。
import fs from 'node:fs';
import path from 'node:path';
import { startServer, stopServer, api, Client, waitFor, replayHash, roomSettings, tmpDir, sleep } from '../tests/helpers/mp_server.mjs';
import { parseOptions, positiveInt, sourceIdentity } from './lib/acceptance.mjs';
import { mpVerdict } from './lib/mp_acceptance.mjs';
const opts=parseOptions(process.argv.slice(2),['--days','--humans','--bots','--out'],['--help']);
if(opts['--help']) { console.log('mp_soak [--days 730] [--humans 6] [--bots 2] [--out new-report.json]；加速探索，正式速度验收仍UNVERIFIED'); process.exit(0); }
const DAYS=positiveInt(opts['--days']||730,'days'),HUMANS=positiveInt(opts['--humans']||6,'humans');
const BOTS=Number(opts['--bots']??2);
if(!Number.isInteger(BOTS)||BOTS<0||HUMANS>8||HUMANS+BOTS>12) throw new Error('无效人数');
if(opts['--out']&&fs.existsSync(opts['--out'])) throw new Error('拒绝覆盖旧报告');
const data=tmpDir(),out=opts['--out']||path.join(data,'acceptance.json');
const identity=sourceIdentity(path.resolve(new URL('..',import.meta.url).pathname));
const clients=[];let srv,report;
const t0=Date.now();
try {
  srv=await startServer({data,args:['--tick-ms','0','--max-rooms','2']});
  const r=await api(srv.base,'/api/rooms',{method:'POST',body:{settings:roomSettings({humans:HUMANS,bots:BOTS,days:DAYS})}});
  if(r.status!==200) throw new Error(r.text);
  const room=r.json.room;
  clients.push(new Client(srv.base,room,r.cookie));
  for(let seat=1;seat<r.json.seats;seat++) {
    const j=await api(srv.base,`/api/r/${room}/join`,{method:'POST',body:{seat}});
    if(j.status!==200) throw new Error(`join ${seat}: ${j.status} ${j.text}`);
    clients.push(new Client(srv.base,room,j.cookie));
  }
  if(clients.length!==HUMANS) throw new Error(`客户端数 ${clients.length} != ${HUMANS}`);
  for(const c of clients) await c.connect();
  await waitFor(()=>clients.every(c=>c.s));
  await clients[0].roomCmd('start');
  let seq=1,pre=null,st;
  while(true) {
    const response=await api(srv.base,`/api/r/${room}/status`);
    if(response.status!==200||!response.json) throw new Error(`status: ${response.status}`);
    st=response.json;
    if(st.paused&&st.started&&st.day>st.end) break;
    if(!st.ended) pre=st;
    if(Date.now()-t0>Math.max(60000,DAYS*1000)) throw new Error('浸泡超时，保留现场与日志');
    const c=clients[seq%clients.length];
    await c.cmd(seq,'setInferShare',{v:[.1,.2,.3][seq%3]});seq++;
    await sleep(30);
  }
  const [day,hash]=replayHash(path.join(data,room)).split(' ');
  report={...mpVerdict(st,pre,day,hash,HUMANS,BOTS,DAYS),...identity,node:process.version,data,room,elapsedMs:Date.now()-t0,commands:seq-1,final:st,preReveal:pre,replay:{day,hash},config:{days:DAYS,humans:HUMANS,bots:BOTS,tickMs:0}};
} catch(e) {
  report={status:/EPERM|EACCES/.test(String(e.stack))?'BLOCKED':'FAIL',...identity,node:process.version,data,error:String(e.stack),serverLog:srv?.log()};
} finally {
  for(const c of clients) c.close();
  if(srv) await stopServer(srv);
  fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({status:report.status,rules:report.rules,error:report.error,out,data},null,2));
  // 私有临时目录保留给重放和故障诊断，不删除唯一证据。
}
process.exitCode=report.status==='PASS'?0:report.status==='FAIL'?1:2;
