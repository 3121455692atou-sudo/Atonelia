// 只读：按最终方案的 Q 权重和数据修订，检查"跟随者不超过同期 SOTA"（规格 D4 第 1 条）。
// 2026-10-21（P1.1 数据提交）：D3 两批修订已并入 rivals.js，不带 --fix 看的就是修订后的结果；
//   --fix 只对没套过修订的旧表有用（幂等：已有的行不重复加，改值直接覆盖）。落地后以 scripts/sota_report.mjs 为准，这里只留作历史对照。
// 补丁：① 各模态第一条发布跳过（此前没有参照：Bark、Krake）；② 开源 LLM 行的间隔 OPEN_GAP_LLM = 1.5，其余跟随者 FOLLOW_GAP = 1.0；③ 第二批修订（2026-10-21 决定记录）收进 fixes / adds / dates。
import { RAW_RELEASES, FAMILIES } from '../../../src/career/data/rivals.js';
import { RELEASE_DAYS_GEN } from '../../../src/career/data/release_days_gen.js';
import { RELEASE_DAYS_OVERRIDES } from '../../../src/career/data/release_days_overrides.js';
import { dimKeys } from '../../../src/career/data/core.js';
import fs from 'fs';
const TL = JSON.parse(fs.readFileSync(new URL('../../research/', import.meta.url).pathname + 'timeline-2023-2026.json','utf8')).releases;
const norm = s => String(s).normalize('NFKC').toLowerCase().replace(/（.*?）|\(.*?\)/g,'').replace(/[\s\-_·.]/g,'');
const tlByName = {};
for (const r of TL) { const k = norm(r.model); if (r.date.length===10 && !tlByName[k]) tlByName[k] = r.date; }
const W = { llm:{knowledge:.22,code:.22,math:.22,writing:.22,agent:.12}, image:{aesthetics:.25,adherence:.25,text:.25,realism:.25}, music:{composition:.25,vocals:.25,lyrics:.25,fidelity:.25}, speech:{naturalness:.25,cloning:.25,multilingual:.25,expressive:.25} };
const FOLLOW_GAP = 1.0, OPEN_GAP_LLM = 1.5;
const FIX = process.argv.includes('--fix');
const rows = RAW_RELEASES.map(r=>[...r]);
// 改值：第一批（D3）加第二批 A（2026-10-21）
const fixes = {
  'o1': [86,82,87,80,80,42],
  'DeepSeek-R1': [85,81,86,78,60,36],
  'GLM-4': [77,64,56,73,65,22],
  'Qwen3-235B-A22B-2507': [87,87,89,80,72,72],
  'ChatGLM2-6B': [50,33,33,56,55,0],
  'ChatGLM3-6B': [55,38,40,56,58,6],
  'Qwen-7B': [53,34,32,55,55,2],
  'Baichuan2-13B': [54,30,32,56,58,2],
  'LLaMA 65B': [59,36,30,55,35,0],
  'Qwen-Image-2.0': [88,90,91,88,78],
  'SD3 Medium': [72,70,55,69,58],
  'FLUX.1 [dev]': [84,78,58,86,60],
  'Qwen-Image': [83,85,87,83,76],
  'FLUX.2 [dev]': [89,87,79,91,64],
  'HunyuanImage 3.0': [85,85,79,86,78],
  'Muse Spark Open': [92,91,93,87,82,89],
  'DeepSeek-V3-0324': [85,76,80,78,64,45],
  'DeepSeek-V4-Flash-0731': [92,95,94,82,67,93],
  'DeepSeek-V4-Pro-0813': [93,93,94,86,72,91],
  'DeepSeek-V4.1-Flash': [92,94,95,85,69,95],
  'Qwen3.8-Max': [93,94,95,86,76,92],
  'GPT-Realtime-2': [83,12,80,78,86],
};
// 月份列变化（第二批 B）
const months = { 'Sonar Reasoning Pro': '2025-03', 'pplx-70b-online': '2023-11', 'Phi-3-medium': '2024-05', 'RWKV-6 Finch 14B': '2024-07', 'FLUX1.1 [pro]': '2024-10' };
const adds = [   // [家族, 精确日, 型号, 量级, 开源, dims, 定价档, tags]：第一批 9 行 + 第二批 C、D 43 行
  ['qwen','2024-11-28','QwQ-32B-Preview','mid',1,[72,70,80,66,55,15],'budget','R,S,LP'],
  ['deepseek_pro','2024-11-20','DeepSeek-R1-Lite-Preview','large',0,[80,76,82,72,58,25],'budget','R,S'],
  ['gemini','2024-12-19','Gemini 2.0 Flash Thinking','frontier',0,[82,76,84,78,66,40],'budget','R,S'],
  ['grok','2024-03-17','Grok-1（开放权重）','large',1,[70,50,42,66,45,4],'budget','S,E,LP'],
  ['ernie','2025-06-30','ERNIE-4.5-300B-A47B','large',1,[82,76,74,80,66,45],'budget','S,E,LP'],
  ['gpt','2025-08-05','gpt-oss-120b','large',1,[82,80,88,74,74,60],'budget','R,S,E,LP'],
  ['seed','2025-08-20','Seed-OSS-36B','mid',1,[78,76,80,72,62,55],'budget','S,LP'],
  ['grok','2025-08-23','Grok 2.5（开放权重）','large',1,[82,72,64,78,55,28],'budget','S,LR'],
  ['flux','2024-08-01','FLUX.1 [pro]','large',0,[87,80,62,89,62],'standard',''],
  ['llama','2026-08-05','Muse Spark 1.2','frontier',0,[93,92,95,88,83,91],'standard','R'],
  ['llama','2026-09-02','Muse Spark 1.3','frontier',0,[94,94,96,89,83,94],'standard','R'],
  ['llama','2026-10-12','Muse Wonder','frontier',0,[96,95,96,91,83,96],'standard','R,C'],
  ['llama','2026-10-12','Muse Wonder Full','frontier',0,[96,97,97,92,84,97],'premium','R,X,C'],
  ['cohere','2025-03-13','Command A','large',1,[79,68,62,76,66,38],'standard','LN'],
  ['cohere','2025-08-21','Command A Reasoning','large',1,[81,72,82,74,66,48],'standard','R,LN'],
  ['cohere','2026-05-20','Command A+','large',1,[84,82,84,76,68,66],'budget','R,E,LP'],
  ['perplexity','2024-08-14','Llama 3.1 Sonar Huge 405B Online','large',0,[80,65,58,77,68,28],'standard',''],
  ['gemini','2024-09-24','Gemini 1.5 Pro-002','frontier',0,[83,70,70,80,74,30],'standard','C'],
  ['mistral','2023-12-11','Mistral Medium（原型）','mid',0,[73,54,46,68,58,8],'standard',''],
  ['mistral','2025-08-13','Mistral Medium 3.1','mid',0,[84,77,69,80,70,52],'budget',''],
  ['novelai','2022-04-29','Krake','mid',0,[44,12,12,58,18,0],'standard',''],
  ['phi','2024-08-20','Phi-3.5-MoE','mid',1,[76,64,64,60,64,10],'budget','E,LP'],
  ['qwen','2025-03-06','QwQ-32B','mid',1,[80,79,86,78,58,40],'budget','R,S,LP'],
  ['deepseek','2026-10-17','DeepSeek-V4.1-Flash-1017','large',1,[93,95,96,85,70,96],'budget','R,E,LP'],
  ['qwen','2026-08-12','Qwen3.8-2.4T-A95B','large',1,[93,94,94,86,74,92],'budget','R,E,T,LR'],
  ['qwen','2026-09-02','Qwen3.8-Max-0902','frontier',0,[95,95,96,88,76,95],'standard','R'],
  ['minimax','2026-10-19','MiniMax-M3.1-Flash','large',0,[93,95,95,84,68,95],'budget','R,E'],
  ['yi','2024-10-16','Yi-Lightning','large',0,[78,66,64,82,64,15],'standard',''],
  ['glm','2024-08-28','GLM-4-Plus','large',0,[81,68,62,78,66,26],'standard',''],
  ['baichuan','2024-05-22','Baichuan 4','large',0,[80,64,62,76,64,12],'standard',''],
  ['hunyuan','2025-12-05','Hunyuan HY 2.0 Think','large',0,[86,84,89,80,70,72],'budget','R,E'],
  ['flux','2025-11-25','FLUX.2 [pro]','large',0,[90,88,80,92,64],'standard',''],
  ['flux','2026-10-01','FLUX 3 Image','large',0,[93,94,89,94,66],'standard',''],
  ['seedream','2025-12-03','Seedream 4.5','large',0,[90,91,85,91,80],'budget',''],
  ['qwen_image','2026-04-22','Qwen-Image-2.0 Pro','large',0,[89,91,92,89,78],'budget',''],
  ['qwen_image','2026-07-21','Qwen-Image-3.0','large',0,[90,92,93,91,78],'budget',''],
  ['qwen_image','2026-09-20','Qwen-Image-2.1','mid',1,[89,91,92,90,78],'budget','S,LN'],
  ['hunyuan_image','2026-01-26','HunyuanImage 3.0 Instruct','large',1,[86,87,80,87,78],'budget','LR'],
  ['imagen','2023-12-13','Imagen 2','large',0,[76,66,35,76,82],'standard',''],
  ['mureka','2026-01-28','Mureka V8','mid',0,[88,86,79,78,55],'budget',''],
  ['mureka','2026-04-09','Mureka V9','mid',0,[89,87,81,81,58],'budget',''],
  ['mureka','2026-08-18','Mureka V9.5','mid',0,[90,88,81,80,60],'budget',''],
  ['lyria','2026-03-25','Lyria 3 Pro','large',0,[86,80,74,89,82],'standard',''],
  ['stable_audio','2025-09-10','Stable Audio 2.5','mid',0,[66,8,8,72,72],'budget',''],
  ['stable_audio','2026-05-20','Stable Audio 3 Large','mid',0,[72,8,8,80,76],'budget',''],
  ['cartesia','2025-10-15','Sonic 3','mid',0,[84,80,82,72,60],'standard',''],
  ['cartesia','2026-05-15','Sonic 3.5','mid',0,[90,85,88,86,62],'standard',''],
  ['cartesia','2026-08-27','Sonic 3.6','mid',0,[92,87,90,87,64],'standard',''],
  ['gemini_tts','2026-09-23','Gemini 3.8 Flash TTS','large',0,[92,75,90,90,85],'standard',''],
  ['cosyvoice','2026-07-21','Qwen-Audio-3.0-TTS-Plus','mid',0,[89,84,88,85,60],'budget',''],
  ['cosyvoice','2026-09-22','Qwen-Audio-3.1-TTS-Plus','mid',0,[91,85,90,86,60],'budget',''],
  ['minimax_speech','2025-10-15','Speech 2.6','mid',0,[89,86,86,84,61],'budget',''],
];
// 老行的日期修订（第二批 B）和历史核对过的日子。新数据里这些日子都在 release_days_overrides.js / release_days_gen.js 里。
const DAYS = { 'FLUX.1 [dev]':'2024-08-01','QwQ-32B-Preview':'2024-11-28','DeepSeek-R1':'2025-01-20','o1':'2024-12-05','Qwen3-235B-A22B-2507':'2025-07-21','GLM-4':'2024-01-16','Claude Opus 4':'2025-05-22','Grok 4':'2025-07-09','Kimi K2':'2025-07-11','GLM-4.5':'2025-07-28',
  'GPT-3.5（ChatGPT）':'2022-11-30','Muse Spark Open':'2026-10-15','Muse Spark 1.1':'2026-07-09','Sonar Reasoning Pro':'2025-03-07','pplx-70b-online':'2023-11-29','Phi-3-medium':'2024-05-21','RWKV-6 Finch 14B':'2024-07-21','FLUX1.1 [pro]':'2024-10-02','DeepSeek-V3.2':'2025-12-01','DeepSeek-V4.1-Flash':'2026-09-10','Qwen3.8-Max':'2026-08-03','GPT-Realtime-2':'2026-05-07','FLUX.2 [pro]':'2025-11-25','FLUX.2 [dev]':'2025-11-25' };
if (FIX) {
  const have = new Set(rows.map(r=>r[2]));
  for (const r of rows) { if (fixes[r[2]]) r[5]=fixes[r[2]]; if (months[r[2]]) r[1]=months[r[2]]; if (r[2]==='gpt-oss-120b') r[3]='large'; }
  for (const a of adds) if (!have.has(a[2])) rows.push([a[0],a[1],a[2],a[3],a[4],a[5],a[6],a[7]]);
}
let matched=0;
const rel = rows.map(([family,date,name,cls,open,vals,price])=>{
  const mod = FAMILIES[family].mod; const keys = dimKeys(mod);
  const dims = Object.fromEntries(keys.map((k,i)=>[k,vals[i]??0]));
  // 日期：手写 > 生成 > 本表的 DAYS / adds 里的精确日 > timeline 同名同月 > 当月 15 日
  const add = adds.find(a=>a[2]===name);
  let day = RELEASE_DAYS_OVERRIDES[name]?.day || RELEASE_DAYS_GEN[name] || (date.length===10?date:(DAYS[name]||(FIX&&add?add[1]:null)||tlByName[norm(name)]));
  if (day && day.slice(0,7)!==date.slice(0,7)) day=null; else if (day) matched++;
  if(!day) day = date.slice(0,7)+'-15';
  const q = Object.entries(W[mod]).reduce((a,[k,w])=>a+w*(dims[k]||0),0);
  return {family,name,mod,open:!!open,day,q,dims};
}).sort((a,b)=>a.day.localeCompare(b.day));
const PUSH = { llm:['gpt','claude','fable','gemini','grok'], image:['image2','midjourney','imagen','flux','seedream','ideogram'], music:['suno','udio','lyria','eleven_music'], speech:['elevenlabs','openai_tts','minimax_speech','seed_tts','gemini_tts','cartesia'] };
const exclude = new Set((process.argv.find(a=>a.startsWith('--mine='))||'').slice(7).split(',').filter(Boolean));
let viol=0, skipped=[], near=[];
for (const mod of ['llm','image','music','speech']) {
  const L = rel.filter(r=>r.mod===mod && !exclude.has(r.family));
  for (const r of L) {
    const before = L.filter(x=>x.day<r.day || (x.day===r.day && !x.open && r.open && x!==r));
    if (!before.length) { skipped.push(`${mod} ${r.day} ${r.name}`); continue; }   // 模态第一条发布：此前没有参照，跳过
    const sb = Math.max(...before.map(x=>x.q));
    const follower = r.open || !PUSH[mod].includes(r.family);
    const margin = mod==='llm' && r.open ? OPEN_GAP_LLM : FOLLOW_GAP;
    if (follower && r.q > sb - margin) { viol++; console.log('VIOL',mod,r.day,r.name,r.q.toFixed(2),'sota',sb.toFixed(2),(r.q-sb).toFixed(2),'间隔要求',margin); }
    else if (follower && r.q > sb - margin - 1) near.push(`${mod} ${r.day} ${r.name} ${(r.q-sb).toFixed(2)}（离红线 ${(sb-margin-r.q).toFixed(2)}）`);
  }
}
console.log('violations',viol,'matched',matched,'/',rel.length);
console.log('first-of-modality skipped:\n '+skipped.join('\n '));
console.log('near(<1 above the line):\n '+near.join('\n '));
if (process.argv.includes('--holders')) {
  for (const mod of ['llm','image','music','speech']) { let best=null; for (const r of rel.filter(x=>x.mod===mod&&!exclude.has(x.family))) if(!best||r.q>best.q){best=r; console.log(mod,r.day,'SOTA→',r.name,r.q.toFixed(2));} }
}
