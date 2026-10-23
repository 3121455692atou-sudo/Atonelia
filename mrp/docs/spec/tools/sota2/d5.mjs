// D5 跟随者钳制：玩 OpenAI、机器人不发布时，需要钳制的跟随者条数（修订二数据）
import { REL, toDay } from './data.mjs';
const PUSH = { llm: ['gpt', 'claude', 'fable', 'gemini', 'grok'], image: ['image2', 'midjourney', 'imagen', 'flux', 'seedream', 'ideogram'], music: ['suno', 'udio', 'lyria', 'eleven_music'], speech: ['elevenlabs', 'openai_tts', 'minimax_speech', 'seed_tts', 'gemini_tts', 'cartesia'] };
for (const [cid, org, mod] of [['gpt', 'openai', 'llm'], ['image2', 'openai', 'image'], ['claude', 'anthropic', 'llm'], ['gemini', 'google', 'llm'], ['grok', 'grok', 'llm']]) for (const st of ['2023-01-01', '2024-01-01', '2025-01-01', '2026-01-01']) {
  const s0 = toDay(st), L = REL.filter(r => r.mod === mod);
  const env = d => Math.max(-Infinity, ...L.filter(r => (r.org === org && r.d <= s0) || (r.org !== org && PUSH[mod].includes(r.family) && !r.open && r.d <= d)).map(r => r.q));
  const hit = L.filter(r => r.org !== org && (r.open || !PUSH[mod].includes(r.family)) && r.q > env(r.d) - 1.0 + 1e-9);
  console.log(cid, st, hit.length, hit.map(r => `${r.name}（${r.day}，${(r.q - env(r.d) + 1).toFixed(2)}）`).join('、'));
}
