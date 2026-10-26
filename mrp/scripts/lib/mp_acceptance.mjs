// 流量按实际字节数归一到2秒/天；这不是声称实测了真实2档墙钟流量。
export function mpVerdict(st, pre, replayDay, replayHash, humans, bots, days) {
  const rules=[];
  const complete=st?.started && st?.paused && st?.day > st?.end && Number.isInteger(st?.days) && st.days > 0;
  rules.push({id:'completion',status:complete?'PASS':'FAIL',observedDays:st?.days,requestedDays:days});
  rules.push({id:'replay',status:typeof st?.hash==='string' && !!st.hash && replayHash===st.hash && replayDay===st.day?'PASS':'FAIL'});
  const p99=st?.p99;
  rules.push({id:'p99',value:p99,unit:'ms',threshold:'<50',status:typeof p99!=='number'||!Number.isFinite(p99)||p99<0?'UNVERIFIED':p99>=50?'FAIL':humans+bots===8&&days===730?'PASS':'UNVERIFIED'});
  const bytes=pre?.bytes;
  const values=bytes ? Object.values(bytes) : [];
  const valid=pre && !pre.ended && Number.isInteger(pre.days) && pre.days>0 && values.length===humans && values.every(x=>typeof x==='number'&&Number.isFinite(x)&&x>0);
  const kbps=valid?values.map(x=>x/pre.days/2/1024):[];
  rules.push({id:'traffic.normalized2s',values:kbps,denominatorDays:pre?.days??null,clients:values.length,unit:'KiB/s',threshold:'<5 per client',status:!valid?'UNVERIFIED':kbps.some(x=>x>=5)?'FAIL':days===730?'PASS':'UNVERIFIED'});
  // 现脚本使用tick-ms=0加速，不伪造实际4档/2档定时环境验收。
  rules.push({id:'reference-speed-and-load',status:'UNVERIFIED',reason:'加速模拟tick-ms=0；正式4档p99和2档墙钟流量需要独占参考机另测'});
  return {status:rules.some(x=>x.status==='FAIL')?'FAIL':rules.some(x=>x.status!=='PASS')?'UNVERIFIED':'PASS',rules};
}
