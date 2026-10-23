// 汇总 f4_metrics.mjs 的逐局记录。用法：node f4_agg.mjs <目录>（读 f4_bot_*.jsonl、f4_adv_*.jsonl）
import fs from 'node:fs';
import path from 'node:path';
const DIR = process.argv[2] || '.';
const load = mode => fs.readdirSync(DIR).filter(f => f.startsWith(`f4_${mode}_`) && f.endsWith('.jsonl')).flatMap(f => fs.readFileSync(path.join(DIR, f), 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)));
const pct = (a, b) => (b ? (100 * a / b).toFixed(1) : '—') + '%';
const sum = (xs, f) => xs.reduce((a, x) => a + (f(x) || 0), 0);
const BASE = {
  bot: { S: 5, A: 33, B: 78, C: 116, D: 76, E: 46, F: 19, G: 11, fired: 27, rev: 1.51e8 },
  adv: { S: 12, A: 42, B: 110, C: 128, D: 46, E: 37, F: 5, G: 4, fired: 3, rev: 1.97e8 },
};
const bucket = r => {
  const star = r.seedTag === '★';
  if (r.tier === 'small') return 'small';
  if (r.mod === 'llm') {
    if (r.tier === 'frontier') return star ? '★·LLM·frontier' : '○/—·LLM·frontier';
    if (star) return '★·LLM·非 frontier';
    return '○/—·LLM·bigtech、major';
  }
  return star ? '★·非 LLM' : '—·非 LLM';
};
const TARGET = {
  bot: { '★·LLM·frontier': '25–70%', '★·LLM·非 frontier': '≤15%', '★·非 LLM': '40–90%', '—·非 LLM': '≥30%', '○/—·LLM·frontier': '≤30%', '○/—·LLM·bigtech、major': '≤5%', small: '≤1%' },
  adv: { '★·LLM·frontier': '35–80%', '★·非 LLM': '50–95%', '○/—·LLM·frontier': '10–50%', '○/—·LLM·bigtech、major': '≤10%', small: '≤2%' },
};
const out = {};
for (const mode of ['bot', 'adv']) {
  const R = load(mode);
  if (!R.length) continue;
  const n = R.length;
  const ranks = { S: 0, A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0 };
  for (const r of R) if (r.rank in ranks) ranks[r.rank]++;
  const fired = R.filter(r => r.reason === 'goal_failed').length;
  const broke = R.filter(r => r.reason === 'bankrupt').length;
  const L = [];
  const p = s => L.push(s);
  p(`## ${mode === 'bot' ? '机器人' : '大按钮'}（${n} 局）`);
  p(`抛错 ${R.filter(r => r.thrown).length}；机器人操作失败 ${sum(R, r => r.errors)}（${R.filter(r => r.errors).map(r => `${r.id}/${r.sc}#${r.seed}`).join('、') || '无'}）；非有限数 ${R.filter(r => r.nan).length} 局${R.filter(r => r.nan).slice(0, 3).map(r => `（${r.id}/${r.sc}#${r.seed} ${r.nan}）`).join('')}；破产 ${broke}`);
  const B = BASE[mode];
  p(`评级 ${Object.entries(ranks).map(([k, v]) => k + v).join(' ')}（基线 ${Object.keys(ranks).map(k => k + B[k]).join(' ')}）；撤换 ${fired}（${pct(fired, n)}，基线 ${B.fired}）`);
  const g = ks => ks.reduce((a, k) => a + ranks[k], 0);
  if (mode === 'bot') p(`F4 口径：S+A ${pct(g(['S', 'A']), n)}（≤12%）；C–E ${pct(g(['C', 'D', 'E']), n)}（≥55%）；F+G ${pct(g(['F', 'G']), n)}（≤12%）；撤换 ${pct(fired, n)}（≤8%）`);
  else p(`F4 口径：S+A ${pct(g(['S', 'A']), n)}（≤20%）；B–D ${pct(g(['B', 'C', 'D']), n)}（≥60%）；撤换 ${pct(fired, n)}（≤6%）`);
  p(`平均月收入 ${(sum(R, r => r.revenue) / n / 1e8).toFixed(2)} 亿美元（基线 ${(B.rev / 1e8).toFixed(2)} 亿）`);
  const byTier = {};
  for (const r of R) { const t = (byTier[r.tier] ??= { n: 0, fired: 0 }); t.n++; if (r.reason === 'goal_failed') t.fired++; }
  p(`撤换按量级：${Object.entries(byTier).map(([k, v]) => `${k} ${v.fired}/${v.n}`).join('，')}`);
  const meta = R.filter(r => r.id === 'llama' && r.sc === 'y2025');
  p(`Meta y2025 月收入 ${(sum(meta, r => r.revenue) / meta.length / 1e8).toFixed(2)} 亿（基线约 1.3 亿，线 ≥ 70% 即 ≥ 0.91 亿）`);
  // 污染与标签
  const tg = R.filter(r => r.everTainted > 0);
  p(`被污染模型：出现过的局 ${tg.length}；检查天数（模型·天）${sum(R, r => r.taintCheckDays)}；q > worldSota − APPROACH 的天数 ${sum(R, r => r.taintOverCap)}；q > worldSota 的天数 ${sum(R, r => r.taintOverSota)}${R.filter(r => r.taintEx).slice(0, 3).map(r => `（${r.id}/${r.sc}#${r.seed} ${r.taintEx}）`).join('')}`);
  p(`被污染的快照拿到 SOTA 标签：${sum(R, r => r.taintLabel)} 次（其中记进 made 的 ${sum(R, r => r.taintMade)}）`);
  p(`解除污染 ${sum(R, r => r.untainted)} 次；带着 g_beyond 试炼的模型 ${sum(R, r => r.beyondTrial)} 个（g_beyond 是 P2.2 的节点，现在没有策略引擎，只能是 0）`);
  p(`蒸馏出身的模型 ${sum(R, r => r.distModels)} 个；别家老师蒸出来的 q ≥ worldSota 的天数 ${sum(R, r => r.distExtGE)}；自蒸馏的 q ≥ worldSota 的天数 ${sum(R, r => r.distSelfGE)}`);
  // 拿标率
  const bk = {};
  for (const r of R) { const k = bucket(r); const b = (bk[k] ??= { n: 0, made: 0 }); b.n++; if (r.made > 0) b.made++; }
  p('开局后拿到过算数标签的局（按播种档 × 模态 × 量级）：');
  for (const k of ['★·LLM·frontier', '★·LLM·非 frontier', '★·非 LLM', '—·非 LLM', '○/—·LLM·frontier', '○/—·LLM·bigtech、major', 'small']) if (bk[k]) p(`  ${k}：${bk[k].made}/${bk[k].n}（${pct(bk[k].made, bk[k].n)}）${TARGET[mode][k] ? `，目标 ${TARGET[mode][k]}` : ''}`);
  const days = sum(R, r => r.days);
  p(`领先第二名（worldSota）≥ 3 分的天数：${sum(R, r => r.lead3)}，扣掉史实里本公司当天也领先 ≥ 3 的日子后 ${sum(R, r => r.lead3net)}（${pct(sum(R, r => r.lead3net), days)}，线 ≤ 2%；口径：已发布快照里最强的一款）`);
  p(`护栏：自家最强 q（含在练）比 max(histOther, 自家真实发布截至当天) 高 3 以上的天数 ${sum(R, r => r.guard3)}（${pct(sum(R, r => r.guard3), days)}，线 ≤ 5%）`);
  p(`生成订单：下过单的局 ${R.filter(r => r.genOrders).length}；“没有后训练作业在跑、生成订单却暂停 ≥30 天”的局 ${R.filter(r => r.genPaused30).length}`);
  const tiers = {}, sub = {};
  for (const r of R) { for (const [k, v] of Object.entries(r.evalTiers || {})) tiers[k] = (tiers[k] || 0) + v; for (const [k, v] of Object.entries(r.submitTiers || {})) sub[k] = (sub[k] || 0) + v; }
  p(`训练作业：送评 ${sum(R, r => r.submitted)} 次（${Object.entries(sub).map(([k, v]) => `${k} ${v}`).join('、')}）；自家发布的评测档 ${Object.entries(tiers).map(([k, v]) => `${k} ${v}`).join('、')}；跳过评测 ${sum(R, r => r.skipped)} 次（${R.filter(r => r.skipped).length} 局）；检修天数占比 ${pct(sum(R, r => r.repairShare), n)}；试验占训练卡·天（逐局平均）${pct(sum(R, r => r.trialShare), n)}；实得卡超过训练卡的天数 ${sum(R, r => r.overDays)}、在跑的作业低于最低卡的天数 ${sum(R, r => r.underDays)}`);
  p(`操作失败里：“原地打转”${sum(R, r => r.loopErr)} 次、“建议太多”${sum(R, r => r.tooMany)} 次、“没有建议”${sum(R, r => r.noAdvice)} 次`);
  const months = sum(R, r => r.months);
  const kinds = {};
  for (const r of R) for (const [k, v] of Object.entries(r.cardKinds || {})) kinds[k] = (kinds[k] || 0) + v;
  p(`弹窗：每个游戏月平均处理 ${(sum(R, r => r.cards) / months).toFixed(2)} 张（不计 notice ${((sum(R, r => r.cards) - (kinds.notice || 0)) / months).toFixed(2)}；按种类 ${Object.entries(kinds).map(([k, v]) => `${k} ${v}`).join('、')}）；同一天处理最多 ${Math.max(...R.map(r => r.maxCardsDay))} 张；同一天处理 ≥2 张 fire 类卡片（milestone、super、strategy、exclusive）的天数 ${sum(R, r => r.daysFire2)}`);
  if (mode === 'adv') {
    const an = sum(R, r => r.advN);
    p(`advise() ${an} 次：平均 ${(sum(R, r => r.advMean * r.advN) / an).toFixed(3)} ms，最长 ${Math.max(...R.map(r => r.advMax)).toFixed(1)} ms，≥ 2 ms 的 ${sum(R, r => r.adv2)} 次（${pct(sum(R, r => r.adv2), an)}）`);
  }
  p(`单局耗时（含逐日检查的开销）平均 ${(sum(R, r => r.ms) / n).toFixed(0)} ms，最长 ${Math.max(...R.map(r => r.ms))} ms`);
  const gc = R.filter(r => ['gpt', 'claude'].includes(r.id));
  p(`路线：终局路线和开局不同的局 ${R.filter(r => r.routeEnd !== r.route0).length}；GPT、Claude 走到 open_restricted 或 open 的局 ${gc.filter(r => r.routes.some(x => x === 'open' || x === 'open_restricted')).length}/${gc.length}`);
  const ds = R.filter(r => r.id === 'deepseek' && r.sc === 'y2024');
  const dsN = ds.filter(r => !r.openReasonBefore);
  p(`开源推理：DeepSeek y2024 玩家 2024-11-28 前没发开源推理模型的局 ${dsN.length}/${ds.length}，ms_open_reasoning 归 QwQ ${dsN.filter(r => r.msOpenReasoning?.who === 'qwen' && /QwQ/.test(r.msOpenReasoning.model || '')).length}/${dsN.length}（线 ≥ 95%）`);
  const sm = R.filter(r => r.tier === 'small');
  p(`small 局里发布过小模型（含开局继承以外的全部 role:small 快照）：${sm.filter(r => r.relSmall > 0).length}/${sm.length}`);
  out[mode] = L.join('\n');
  console.log(out[mode] + '\n');
}
