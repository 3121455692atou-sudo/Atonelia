// B6 一致性：开局在线旗舰（orgBest）的开闭 === STANCE[开局路线].flagshipOpen（mistral y2024 已改 open_family）
import { REL, COMPANIES, toDay, orgOf } from './data.mjs';
const FO = { closed: false, open_family: false, delayed: false, open_restricted: true, open: true };
const B6 = { gpt: 'closed closed closed open_family', claude: 'closed closed closed closed', fable: 'closed closed closed closed', image2: 'closed closed closed closed',
  gemini: 'closed closed open_family open_family', llama: 'open_restricted open_restricted open_restricted open_restricted', grok: 'closed closed delayed delayed',
  mistral: 'open open_family open_restricted open', deepseek: 'open_restricted open_restricted open_restricted open', qwen: 'closed open_restricted open_restricted open_family',
  kimi: 'closed closed closed open', glm: 'open_family open_restricted open_family open', minimax: 'closed closed closed open', hunyuan: 'closed closed open_restricted open_family',
  stepfun: 'closed closed closed open', seed: 'closed closed closed open_family', ernie: 'closed closed closed delayed', rwkv: 'open open open open', perplexity: 'closed closed closed open_family',
  novelai: 'closed closed closed closed', jev: 'closed closed closed closed', midjourney: 'closed closed closed closed', suno: 'closed closed closed closed', elevenlabs: 'closed closed closed closed' };
const SC = ['2023-01-01', '2024-01-01', '2025-01-01', '2026-01-01'];
let bad = 0;
for (const c of COMPANIES) SC.forEach((st, i) => {
  const org = orgOf(c.families[0]), seen = REL.filter(r => r.mod === c.modality && r.org === org && r.d <= toDay(st));
  if (!seen.length) return;
  const rel = seen.reduce((a, r) => (r.q > a.q || (r.q === a.q && r.d >= a.d)) ? r : a);
  const x = B6[c.id].split(' ')[i];
  if (rel.open !== FO[x]) { bad++; console.log('不一致', c.id, st, rel.name, rel.open ? '开源' : '闭源', x); }
});
console.log('不一致格数', bad);
