// Ephemeral tutorial sessions. Never attach these objects to ui/state or storage.
// Card effects and office actions use the production rules; only the starting
// scenario and permitted teaching actions are controlled. No migration/rewards.
import { start, choose, preview, settle, CAPS } from './post_catalog_rules.js';
import { CATALOG_FINGERPRINT, CATALOG_RULES, catalogueCard, cardSummary } from './post_catalog.js';
import { createGame, workingModel, dataOptions, strategyOptions, jobCheck, fundingOffers, tickDay } from './game.js';
import { researchOptions } from './research.js';
import { applyCommand } from './commands.js';
import { P } from './provider.js';
import { resolveAll } from './bot_events.js';

const clone = value => structuredClone(value);
export const TUTORIAL_DECK = Object.freeze(['basic', 'ptc_qwen_sample_tabs', 'ptc_mistral_neat_batch', 'ptc_glm_task_tiles']);
const config = () => ({ catalogFingerprint: CATALOG_FINGERPRINT, rulesVersion: CATALOG_RULES, modality: 'llm', companyId: 'gpt', techs: [], strategy: { done: {} } });
export const TUTORIAL_CHAPTERS = Object.freeze([
  { id: 'research', title: '研究', route: '后台 → 技术研究', text: '开启新的技术研发。研发需要消耗研发槽位并按天积累进度，满足前置条件后即可解锁更先进的架构与训练方法。' },
  { id: 'strategy', title: '公司策略', route: '后台 → 公司策略', text: '制定公司的发展路线与商业策略。策略需要按天推进，完成后提供长期的经营增益与特质。' },
  { id: 'data', title: '数据', route: '后台 → 数据', text: '采购高质量训练语料。购买并入库的数据集将直接用于模型预训练，提升底座能力上限。' },
  { id: 'compute', title: '算力分配', route: '后台 → 算力', text: '调整显卡在在线推理与模型训练之间的分配比例，兼顾日常服务可用性与研发训练速度。' },
  { id: 'project', title: '预训练与作业', route: '后台 → 训练 → 新建底座', text: '创建并下发模型训练作业。设置模型参数规模、分配算力与数据集，开始推进训练。' },
  { id: 'evaluation', title: '评测与发布', route: '后台 → 模型 → 送评', text: '对训练完成的模型进行权威榜单评测（MMLU、GSM8K 等），达标后即可正式发布上线。' },
  { id: 'service', title: '产品与定价', route: '后台 → 服务', text: '配置对外 API 服务的调用定价档位，平衡用户请求量与服务收益。' },
  { id: 'finance', title: '融资与财务', route: '后台 → 财务 / 资本', text: '向投资机构出让股权换取现金，为大规模算力集群与语料采购补充流动资金。' },
  { id: 'automation', title: '托管与接管', route: '后台 → 自动化', text: '开启自动托管辅助处理日常事务；也可以随时手动接管核心模块的控制权。' },
]);
export function createTutorial(kind = 'basic') {
  if (!['basic', 'advanced'].includes(kind)) throw Error('没有这门教程');
  return { kind, status: kind === 'basic' ? 'intro' : 'chapters', revision: 0, run: null, game: null, chapter: null, stage: 0, selectedId: null, feedback: null, completed: [], result: null };
}
export function closeTutorial(t) {
  t.status = 'closed'; t.revision++; t.run = null; t.game = null; t.feedback = null; t.result = null; t.chapter = null;
}
function requireHistory() {
  if (P().mode !== 'history' || P().world || P().mirror) throw Error('请先退出当前世界，回标题页进入进阶教程');
}
function sandbox(chapter) {
  requireHistory();
  const game = createGame('gpt', 'y2025', 261025);
  // Isolate each short lesson from opening story prompts, not from mechanics.
  game.queue = [];
  // Explicit fixture: an already-trained model, not a reward or a formal save.
  if (chapter === 'evaluation') workingModel(game).postDays = 14;
  // The strategy lesson starts with an idle slot, not a half-finished story strategy.
  if (chapter === 'strategy') { game.strategy.cur = null; game.strategy.shelved = {}; }
  return game;
}
function execute(game, name, args = {}) {
  requireHistory();
  const out = applyCommand(game, { name, args });
  if (!out.ok) throw Error(out.err?.message || out.err || '操作没有完成');
  return out.result;
}
const commandOption = (id, label, detail, name, args) => ({ id, label, detail, command: { name, args } });
function advancedOptions(t) {
  if (!['chapter', 'chapterDone'].includes(t.status)) return [];
  const maxSteps = { research: 2, strategy: 2, project: 3, automation: 2 }[t.chapter] || 1;
  if (t.stage >= maxSteps) return [];
  const s = t.game;
  if (t.chapter === 'research') return t.stage === 0
    ? researchOptions(s).filter(x => x.check.ok).slice(0, 3).map(x => commandOption(x.t.id, x.t.name, `${x.st.label} · 工作量 ${x.need}；${x.t.desc}`, 'researchTech', { id: x.t.id }))
    : [commandOption('stop', '暂停这项研究', '暂停当前研究进度，释放研究槽位。可在后续随时恢复。', 'stopTech', { id: t.selectedId })];
  if (t.chapter === 'strategy') return t.stage === 0
    ? strategyOptions(s).filter(x => x.state === 'available' && !x.node.auto).slice(0, 3).map(x => commandOption(x.id, x.node.title, `${x.need} 天 · ${x.node.desc}`, 'startStrategy', { id: x.id }))
    : [commandOption('cancel', '取消当前策略', '放弃当前策略，清空策略槽位。', 'cancelStrategy', {})];
  if (t.chapter === 'data') return dataOptions(s).filter(x => x.ok && !x.gen && ['ds_cn_web', 'ds_books_lic', 'ds_refinedweb'].includes(x.id)).map(x => commandOption(x.id, x.name, `$${x.cost.toLocaleString('en-US')} · ${x.rights === 'licensed' ? '已授权' : '公开语料'} · ${x.desc}`, 'decide', { action: 'data', id: x.id }));
  if (t.chapter === 'compute') return [.3, .5, .7].map(v => commandOption(String(v), `推理份额 ${Math.round(v * 100)}%`, '指定用于对外推理服务的显卡比例，剩余显卡用于训练。', 'setInferShare', { v }));
  if (t.chapter === 'project') {
    if (t.stage === 0) return [7, 13, 30].map(total => {
      const spec = { kind: 'pretrain', cfg: { arch: 'dense', total, active: total, tokens: .5 } }, check = jobCheck(s, spec);
      return { ...commandOption(String(total), `${total}B 稠密底座`, `0.5T token · 预计 ${Math.ceil(check.eta)} 天 · 分配 ${check.cards?.got ?? 0} 张卡`, 'startJob', { spec }), disabled: !check.ok, reason: check.reason };
    });
    const id = s.jobs.list.at(-1)?.id;
    return t.stage === 1 ? [commandOption('pause', '暂停作业', '暂停训练作业推进，释放被占用的算力。', 'pauseJob', { id, on: true })]
      : [commandOption('cancel', '取消作业', '终止并移除当前训练作业。', 'cancelJob', { id })];
  }
  if (t.chapter === 'evaluation') return ['quick', 'standard', 'full'].map((tier, i) => commandOption(tier, ['快速评测', '标准评测', '从严评测'][i], '提交模型评测，评测完成即可查看跑分并准备发布。', 'submitEval', { modelId: s.working, tier, name: '教学试作一号' }));
  if (t.chapter === 'service') return ['budget', 'standard', 'premium'].map((tier, i) => commandOption(tier, ['低价档', '标准档', '高价档'][i], '设置该产品的调用价格档位。', 'setTier', { id: 'api', tier }));
  if (t.chapter === 'finance') return fundingOffers(s).slice(0, 3).map(o => commandOption(String(o.dilution), `让出 ${Math.round(o.dilution * 100)}% 股权`, `融资约 $${o.amount.toLocaleString('en-US')}，协议签署后等待资金交割。`, 'startFunding', { dilution: o.dilution }));
  if (t.chapter === 'automation') return t.stage === 0 ? [commandOption('enable', '启用沙盒托管', '开启自动化托管，自动处理日常研究与经营决策。', 'enableAutomation', {})]
    : [commandOption('manual', '接管研究模块', '切换为手动选择研究课题，其他模块保持当前设置。', 'configureAutomation', { module: 'research', mode: 'manual', preset: 'balanced', expectedRev: s.automation.rev, requestId: `tutorial:${t.revision}` })];
  return [];
}
function summary(t) {
  const s = t.game;
  if (!s) return [];
  return [
    `公司资金 $${Math.round(s.cash).toLocaleString('en-US')}`,
    `研究 ${s.research.length} 项 · 订单 ${s.orders.length} 项 · 作业 ${s.jobs.list.length} 项（暂停 ${s.jobs.list.filter(j => j.paused).length} 项）`,
    ...(t.chapter === 'strategy' ? [`当前策略：${s.strategy.cur ? `进行中 ${s.strategy.cur.days} / ${s.strategy.cur.need} 天` : '无在研策略'}；暂存 ${Object.keys(s.strategy.shelved).length} 项`] : []),
    ...(s.research.length ? s.research.map(r => `研究进度 ${r.done} / ${r.need}，尚未解锁`) : []),
    `推理份额 ${Math.round(s.inferShare * 100)}% · API 价档 ${s.products.api.tier}`,
    ...(s.evals.length ? [`评测中：${s.evals[0].plan.name} · 耗时 ${s.evals[0].days} 天 · 预计完成日 ${s.evals[0].until}`] : []),
    ...(s.capital.round ? [`融资协议签署中，交割完成后到账。`] : []),
    ...(s.automation ? [`研究决策：${s.automation.modules.research.mode === 'manual' ? '手动' : '托管'}；后训练：手动`] : []),
  ];
}
export function tutorialView(t) {
  const r = t.run, cfg = r?.config || config();
  const stage = r ? r.status === 'done' ? 'settled' : r.turn === 1 ? 'prepare' : r.turn === 2 ? 'stack' : r.turn === 3 ? 'train' : 'practice' : t.status;
  return {
    kind: t.kind, status: t.status, revision: t.revision, stage, chapter: t.chapter, chapterStage: t.stage,
    chapters: clone(TUTORIAL_CHAPTERS), completed: [...t.completed], feedback: clone(t.feedback), result: clone(t.result),
    deck: TUTORIAL_DECK.map(id => cardSummary(catalogueCard(id), cfg)),
    run: r ? { turn: r.turn, maxTurns: r.maxTurns, remaining: r.status === 'done' ? 0 : r.maxTurns - r.turn + 1, budget: r.budget, focus: r.focus, flow: r.flow, shield: r.shield, boost: r.boost, score: r.score, caps: CAPS, log: clone(r.log) } : null,
    cards: r?.status === 'playing' ? r.hand.map(id => {
      const p = preview(r, id), card = cardSummary(catalogueCard(id), cfg);
      const recommended = r.turn <= 2 ? card.kind === 'prepare' : r.turn === 3 ? card.kind === 'train' : true;
      return { ...card, preview: p, recommended: recommended && !!p?.affordable, allowed: !!p?.affordable, reason: !p?.affordable ? '当前预算不足，可打出 0 费用的免费牌。' : '' };
    }) : [],
    options: t.kind === 'advanced' ? advancedOptions(t).map(({ command, ...o }) => o) : [],
    summary: summary(t),
  };
}
// Report the actual candidate, never infer publication merely from an empty queue.
export function tutorialEvaluationOutcome(game, candidateId) {
  const model = game.models.find(m => m.id === candidateId && m.stage === 'released');
  const rollout = model && game.deploy.find(d => d.id === candidateId);
  return { candidateId, published: !!model, rolloutUntil: rollout?.until || null,
    message: model ? `已发布：${model.name}。${rollout ? `正在灰度上线，预计 ${rollout.until} 完成。` : '已直接全量上线。'}`
      : '评测已结束，但没有确认该候选已发布。本章操作已完成，不用重刷。' };
}
export function actTutorial(t, action, expectedRevision) {
  if (t.status === 'closed') throw Error('教程已退出，请重新进入');
  if (expectedRevision !== t.revision) throw Error('这一步已处理，请使用当前界面');
  if (!action || typeof action.type !== 'string') throw Error('没有这项教学操作');
  if (action.type === 'restart') {
    const revision = t.revision + 1, next = createTutorial(t.kind);
    Object.assign(t, next, { revision }); return tutorialView(t);
  }
  if (t.kind === 'basic') {
    if (action.type === 'start' && t.status === 'intro') {
      t.run = start(261025, 1, TUTORIAL_DECK, config()); t.status = 'playing';
    } else if (action.type === 'card' && t.status === 'playing') {
      const c = tutorialView(t).cards.find(c => c.id === action.id);
      if (!c?.allowed) throw Error(c?.reason || '不是当前可用教学手牌');
      const before = Object.fromEntries(['budget', 'focus', 'flow', 'shield', 'boost', 'score'].map(k => [k, t.run[k]]));
      const accepted = choose(t.run, action.id, t.run.revision);
      if (!accepted.ok) throw Error(accepted.error);
      t.feedback = { before, after: Object.fromEntries(Object.keys(before).map(k => [k, t.run[k]])), event: accepted.event };
      if (t.run.status === 'done') { t.result = settle(t.run); t.status = 'complete'; }
    } else throw Error('请先完成当前步骤；完成教程不要求高分');
  } else if (action.type === 'chapter' && ['chapters', 'chapter', 'chapterDone'].includes(t.status)) {
    if (!TUTORIAL_CHAPTERS.some(c => c.id === action.id)) throw Error('没有这一章');
    const game = sandbox(action.id);
    t.game = game; t.chapter = action.id; t.stage = 0; t.status = 'chapter'; t.feedback = null; t.selectedId = null;
  } else if (action.type === 'chapters') {
    t.game = null; t.chapter = null; t.stage = 0; t.status = 'chapters'; t.feedback = null;
  } else if (action.type === 'operate' && ['chapter', 'chapterDone'].includes(t.status)) {
    const option = advancedOptions(t).find(o => o.id === action.id);
    if (!option || option.disabled) throw Error(option?.reason || '请使用当前章节的合法操作');
    // Work on a disposable copy: a failed automated wait must not half-apply a lesson.
    const nextGame = clone(t.game);
    const commandResult = execute(nextGame, option.command.name, option.command.args);
    let evaluation = null;
    let message = `已执行：${option.label}。本章主要操作已完成。`;
    if (t.chapter === 'evaluation') {
      const beforeDay = nextGame.day, candidateId = commandResult.eval.cand?.id ?? commandResult.eval.modelId;
      let days = 0;
      // Real daily settlement and ordinary event resolution, not an eval-only clock.
      while (nextGame.evals.length && days < 60) {
        resolveAll(nextGame);
        const day = nextGame.day;
        tickDay(nextGame);
        if (nextGame.day === day) throw Error('练习的正常日结未能继续；可退出或重玩，不影响正式存档');
        days++;
      }
      if (nextGame.evals.length) throw Error('练习评测超过等待上限；可重玩，不影响正式存档');
      evaluation = tutorialEvaluationOutcome(nextGame, candidateId);
      message = `${evaluation.message}评测期间已推进 ${days} 个正常日结（第 ${beforeDay} 天 → 第 ${nextGame.day} 天），日常经营收支与事件照常结算。`;
    }
    t.game = nextGame;
    t.feedback = { message, ...(evaluation ? { evaluation } : {}) };
    t.selectedId = action.id; t.stage++;
    t.status = 'chapterDone'; if (!t.completed.includes(t.chapter)) t.completed.push(t.chapter);
  } else throw Error('请先进入一章并完成当前操作');
  t.revision++;
  return tutorialView(t);
}
