// D4 “跟随者不超过同期 SOTA”复核（修订二数据）：闭源跟随者间隔 1.0，开源 LLM 1.5，模态第一条跳过；sotaBefore = 更早全部发布 + 同日闭源
import { REL } from './data.mjs';
const PUSH = { llm: ['gpt', 'claude', 'fable', 'gemini', 'grok'], image: ['image2', 'midjourney', 'imagen', 'flux', 'seedream', 'ideogram'], music: ['suno', 'udio', 'lyria', 'eleven_music'], speech: ['elevenlabs', 'openai_tts', 'minimax_speech', 'seed_tts', 'gemini_tts', 'cartesia'] };
let viol = 0; const near = [];
for (const mod of Object.keys(PUSH)) {
  const L = REL.filter(r => r.mod === mod);
  for (const r of L) {
    const before = L.filter(x => x.d < r.d || (x.d === r.d && !x.open && r.open && x !== r));
    if (!before.length) { console.log('跳过（模态第一条）', mod, r.day, r.name); continue; }
    const sb = Math.max(...before.map(x => x.q));
    const follower = r.open || !PUSH[mod].includes(r.family);
    const gap = mod === 'llm' && r.open ? 1.5 : 1.0;
    if (!follower) continue;
    const margin = sb - gap - r.q;
    if (margin < -1e-9) { viol++; console.log('违规', mod, r.day, r.name, r.q.toFixed(2), 'sota', sb.toFixed(2)); }
    else if (margin <= 0.32) near.push(`${r.name} ${margin.toFixed(2)}`);
  }
}
console.log('违规', viol); console.log('离红线 ≤0.32：', near.join('；'));
