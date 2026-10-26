#!/usr/bin/env node
// 独立重跑完整性验证，不依赖汇总脚本是否已成功退出。
import fs from 'node:fs';
import { parseOptions, checkRows, f4Key, worldKey } from './lib/acceptance.mjs';
const opts=parseOptions(process.argv.slice(2),['--manifest','--input','--kind'],['--help']);
if(opts['--help']) { console.log('check_results --manifest manifest.json --input detail.jsonl --kind f4|world'); process.exit(0); }
if(!opts['--manifest']||!opts['--input']||!['f4','world'].includes(opts['--kind'])) throw new Error('需要manifest/input及f4|world kind');
let report;
try {
 const manifest=JSON.parse(fs.readFileSync(opts['--manifest'],'utf8'));
 const rows=fs.readFileSync(opts['--input'],'utf8').split('\n').filter(Boolean).map(x=>JSON.parse(x));
 const problems=checkRows(rows,manifest,opts['--kind']==='f4'?f4Key:worldKey,opts['--kind']==='f4'?['days','months','errors']:['ticks','errors']);
 report={status:problems.length?'FAIL':'PASS',scope:'样本完整性，不代表玩法/性能门槛通过',count:rows.length,problems};
} catch(e) { report={status:'FAIL',problems:[String(e.stack)]}; }
console.log(JSON.stringify(report,null,2));process.exitCode=report.status==='PASS'?0:1;
