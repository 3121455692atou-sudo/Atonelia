#!/usr/bin/env node
// 生成 6 份 v3 存档夹具（tests/fixtures/saves/*.json），供存档迁移测试用（规格 E8、P0.1）。
// 夹具必须是“旧版存档”：只能用结构版本 v3 的代码生成（生成时 VERSION 必须是 3），生成后不再重生成。
// 以后 v4 的代码读这几份夹具，验证迁移；所以别在 v4 代码上跑这个脚本——它会拒绝执行。
//   要重现：git checkout <P0.1 第一次提交> 后在那个版本上运行；--check 会比对磁盘上的夹具和重新生成的是否逐字节相同。
//
// 用法：node scripts/make_fixtures.mjs [--check]
//
// 做法：机器人（playGame，种子 1）从开局打到指定时点，在每周末的回调里看条件，条件满足就把状态存下来。
// 6 份夹具各自要覆盖的状态：
//   gpt_y2023_open       GPT y2023，选过开源。自然得到：7 月 Llama 2 事件后弹“要不要开源权重”，选“开源权重”，
//                        s.company.open 变成 true，之后再往后打到 10 月初（有在练项目、在途订单和已发布的多个版本）。
//   deepseek_y2025_mid   DeepSeek y2025 中局。自然得到：打到 10 月初（有预训练项目在练、在途订单、已上市、蒸馏过、冷却项还没走完）。
//   history_queue_claude Claude y2024，队列里有 history 项。构造：当前代码（v0.9.3 起）已经不会再把“历史时刻”排进队列，
//                        只有更早的版本存档里才有。这里在自然打到 2024-03-10 的存档里，往队列末尾放一条真实存在的
//                        {kind:'history', id:'personal_claude_trio'}（Claude 3 三件套，史实在 2024-03），除此之外不动任何东西。
//   teachercap_rwkv      RWKV y2023，带 teacherCap。自然得到：机器人开局不久就下了蒸馏 llama 的数据单，到货后
//                        s.data.teacherCap 和 s.data.distill 有值；打到第 105 天存档。
//   kimi_y2026           Kimi y2026 中局。自然得到：打到第 150 天（2026-06），机器人自己走完了上市，手上有在练的下一代和在途订单。
//   listed_glm_y2026     GLM y2026，已上市。自然得到：开局时港交所上市流程只剩一个月（IPO_AT_START），
//                        月底挂牌，s.capital.listed 有值、股价有历史；打到第 120 天存档。
// 没有对存档做任何其他修改。每份都在文件名里写明公司和剧本，夹具内容就是 JSON.stringify(s) 的原样输出（不缩进）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tests/fixtures/saves');
const url = p => pathToFileURL(path.join(ROOT, p)).href;
const bot = await import(url('tests/helpers/career_bot.mjs'));
const { VERSION } = await import(url('src/career/data/core.js'));
const E = await import(url('src/career/engine.js'));
const { daysBetween } = await import(url('src/career/sim/clock.js'));

if (VERSION !== 3) {
  console.error(`拒绝执行：当前代码的存档结构版本是 v${VERSION}，夹具必须是 v3 存档。\n`
    + '要重现夹具，请先 git checkout P0.1 的第一次提交（结构版本还是 3 的代码）再运行。');
  process.exit(2);
}

const SEED = 1;
const day = s => daysBetween(`${s.start}-01`, s.day);

// 每份夹具：公司、剧本、什么时候存（stop(s) 为真就存）、可选的 pick（处理事件时的选择）、可选的 build（对存档做的构造）。
const FIXTURES = [
  {
    file: 'gpt_y2023_open', company: 'gpt', scenario: 'y2023',
    pick: ev => (ev.id === 'open_question' ? ev.choices.find(c => c.id === 'open' && !c.disabled) : null),
    stop: s => s.company.open === true && day(s) >= 270,
  },
  {
    file: 'deepseek_y2025_mid', company: 'deepseek', scenario: 'y2025',
    stop: s => day(s) >= 150 && E.hasBaseJob(s) && s.orders.length > 0,
  },
  {
    file: 'history_queue_claude', company: 'claude', scenario: 'y2024',
    stop: s => s.day >= '2024-03-10',
    // 构造：往队列末尾放一条旧版才会有的“历史时刻”。
    build: obj => { obj.queue.push({ kind: 'history', id: 'personal_claude_trio' }); },
  },
  {
    file: 'teachercap_rwkv', company: 'rwkv', scenario: 'y2023',
    stop: s => Object.keys(s.data.teacherCap).length > 0 && day(s) >= 105,
  },
  {
    file: 'kimi_y2026', company: 'kimi', scenario: 'y2026',
    stop: s => day(s) >= 150,
  },
  {
    file: 'listed_glm_y2026', company: 'glm', scenario: 'y2026',
    stop: s => !!s.capital.listed && day(s) >= 120,
  },
];

class Stop extends Error {}

function make(f) {
  let json = null;
  try {
    bot.playGame(f.company, f.scenario, SEED, {
      pick: f.pick,
      onWeek(s) {
        if (day(s) > 600) throw new Error(`${f.file}：打了 600 天还没满足存档条件`);
        if (!f.stop(s)) return;
        const obj = JSON.parse(JSON.stringify(s));
        f.build?.(obj);
        json = JSON.stringify(obj);
        throw new Stop();
      },
    });
  } catch (e) { if (!(e instanceof Stop)) throw e; }
  if (!json) throw new Error(`${f.file}：整局打完也没满足存档条件`);
  return json;
}

const check = process.argv.includes('--check');
fs.mkdirSync(OUT, { recursive: true });
let bad = 0;
for (const f of FIXTURES) {
  const json = make(f);
  const file = path.join(OUT, `${f.file}.json`);
  if (check) {
    const same = fs.existsSync(file) && fs.readFileSync(file, 'utf8') === json;
    if (!same) bad++;
    console.log(`${same ? '一致' : '不一致'}  ${f.file}`);
  } else {
    fs.writeFileSync(file, json);
    const s = JSON.parse(json);
    console.log(`已写入 ${path.relative(ROOT, file)}  ${s.day}  ${(json.length / 1024).toFixed(0)} KB`);
  }
}
process.exit(bad ? 1 : 0);
