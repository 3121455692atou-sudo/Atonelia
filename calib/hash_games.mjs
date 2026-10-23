// 对局终局状态哈希（题 2 用来证明“不改结果”）：16 局大按钮 + 16 局机器人，逐局打印整份终局状态的 sha256。
// 用法：node hash_games.mjs <仓库目录>   改前改后各跑一次，输出逐行相同才算不改行为。
import crypto from 'node:crypto';
import path from 'node:path';
const repo = path.resolve(process.argv[2] || '../mrp');
const { playAdvised, playGame } = await import(`${repo}/src/career/sim/bot.js`);
const h = s => crypto.createHash('sha256').update(JSON.stringify(s)).digest('hex').slice(0, 16);
for (const [mode, f] of [['advised', playAdvised], ['bot', playGame]]) for (const id of ['qwen', 'deepseek', 'claude', 'kimi', 'rwkv', 'midjourney', 'glm', 'suno']) for (const sc of ['y2023', 'y2025']) {
  const { s } = f(id, sc, 7919);
  console.log(mode, id, sc, h(s));
}
