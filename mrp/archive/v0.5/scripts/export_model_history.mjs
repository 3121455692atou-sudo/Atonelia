import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PERSONAL_MODEL_EVENTS as events, PERSONAL_MODEL_PROFILES as profiles, MODEL_HISTORY_SOURCES as sources, MODEL_HISTORY_SOURCE_BY_ID as byId} from '../src/data/catalog_personal_events.js';
import {CAPABILITY_LABELS} from '../src/data/model_capabilities.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dest=path.join(root,'docs/model-history');
const impact=e=>[
  ...Object.entries(e.stats).map(([key,n])=>`${CAPABILITY_LABELS[key]} +${n}`),
  ...(e.cost_kc?[`研究支出 ${e.cost_kc} kc`]:['免费']),
  ...(e.readiness?[`就绪度 ${e.readiness}`]:[]),
  ...(e.reputation?[`公司口碑 +${e.reputation}`]:[]),
  ...(e.trust?[`公司信任 +${e.trust}`]:[]),
].join('；');

const lines=[
  '# 模型个人事件与出处 · v0.5.0',
  '',
  '核对日期：2026-10-19。67 段个人事件、134 个选择、27 条历史线，映射全部 28 条模型育成路线；其中 25 条对应已收录的模型形象，另有 Phi、LLaDA 两条研究线。',
  '',
  '游戏入口：训练页「她的个人事件」，或「模型图鉴 → 个人事件」。随当前模型、回合、训练次数和前置经历解锁，相邻事件至少间隔三回合。关闭可续写，完成可回看；回看不重复结算。所有事件都有免费选择，不占主要行动。',
  '',
  '“史实”是对官方公告、官方仓库或作者论文的摘要；“角色演绎”、对白、选择和游戏奖励为原创同人剧本，不是厂商或现实人物发言。游戏数值不表示现实测评。你的选择改变本局经历，不改写历史。工具与设施 NPC 仅互动，不进入模型个人事件。',
  '',
  'Fable 5 对应 Anthropic Claude Fable；JEV 对应 TypeSafe AI Jev。Perplexity 同时收录模型和服务历史，Image 2 采用 OpenAI 图像技术脉络，不把早期 DALL·E 2 当作该角色的同名版本。具体论文公开日期、产品首发与后续更新的区别见各条日期说明。',
  '',
  '来源透明度：ERNIE 4.5 报告、Perplexity Deep Research、Perplexity 新闻目录、Suno v3 四项仅核对到官方搜索摘要，标记为 `official_search_excerpt`；其余核对官方页面、仓库或论文页面。厂商与平台自报的效果、采用情况保留归属，不当作独立结论。',
  '',
  '| 历史线 | 段数 | 时间范围 |',
  '|---|---:|---|',
  ...profiles.map(p=>{const es=events.filter(e=>e.model_key===p.key);return `| ${p.name} | ${es.length} | ${es[0].historical_date} — ${es.at(-1).historical_date} |`;}),
];
for(const p of profiles){
  lines.push('',`## ${p.name}`,'',p.subject);
  for(const e of events.filter(e=>e.model_key===p.key)){
    lines.push('',`### ${e.order}. ${e.title}`,'',`**${e.historical_date} · ${e.historical_title}**`,'',`史实：${e.fact}`);
    if(e.date_note)lines.push('',`日期及范围说明：${e.date_note}`);
    lines.push('',...e.source_ids.map(id=>{const s=byId[id];return `- [${s.publisher} · ${s.title}](${s.url})${s.access==='official_search_excerpt'?'（仅官方搜索摘要）':''}`;}),'',`角色演绎：${e.scene}`,'',`游戏对白：${e.line}`,'',`开启条件：第 ${e.trigger.min_turn} 回合起、完成 ${e.trigger.min_training_actions} 次训练${e.trigger.previous_event_id?'，先完成本线前一段事件':''}；距离上次个人事件至少三回合。`,'');
    for(const c of e.choices)lines.push(`- **${c.label}**：${c.result_text} 预期影响：${impact(c.effects)}。`);
  }
}
lines.push('','## 可重建数据','','`events.jsonl`、`sources.json`、`profiles.json` 从游戏实际目录导出。运行 `node scripts/export_model_history.mjs` 可重建。实际发放收益受能力上限、资金和当前状态影响；季度研发支出按已支付金额记账，不再重复扣款。','');
await fs.mkdir(dest,{recursive:true});
await fs.writeFile(path.join(dest,'README.md'),lines.join('\n'));
await fs.writeFile(path.join(dest,'events.jsonl'),events.map(e=>JSON.stringify(e)).join('\n')+'\n');
await fs.writeFile(path.join(dest,'sources.json'),JSON.stringify(sources,null,2)+'\n');
await fs.writeFile(path.join(dest,'profiles.json'),JSON.stringify(profiles,null,2)+'\n');
console.log(JSON.stringify({events:events.length,choices:events.reduce((n,e)=>n+e.choices.length,0),sources:sources.length,profiles:profiles.length}));
