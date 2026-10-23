// 里程碑视图和选项：“你们做到了”和“别家先做到”两种卡片，选项结算。选项里史实那几项的效果走统一的 applyEffects，提示由 describeEffects 生成。
// 别家开源时的“下载权重做蒸馏”选项标 distill: true（规格 A10：机器人和顾问按 wantsDistill 决定选不选）。
import { COMPANY_BY_ID, TECH_BY_ID, MODALITIES, characterById, monthsBetween, fmtDate } from '../data/core.js';
import { FAMILIES, ownerOf } from '../data/rivals.js';
import { SCENES, histInfo } from '../data/history.js';
import { liveModel } from './model.js';
import { publishPapers } from './research.js';
import { MS_BY_ID } from '../data/milestones.js';
import { MS_TEXT } from '../data/milestones_gen.js';
import { distillOptions, doDistillData } from './data_ops.js';
import { log } from './log.js';
import { daysBetween } from './clock.js';
import { fill, named, speaker, worldScene, fire } from './queue.js';
import { applyEffects, describeEffects } from './effects.js';
import { P, relId } from './provider.js';

// 别家发布开源新款的里程碑：弹出时就冻结“下载权重做蒸馏”的老师快照，按钮文案和实际下单都用这一份（G1-11）。
// 蒸馏的是这家综合最强的开源一款，不一定是刚发布的这款（Llama y2025 是 3.1 405B，不是 3.3 70B）。
function distillChoiceSnap(s, fam) {
  const opt = s.mod === 'llm' ? distillOptions(s).find(o => o.teacher === fam) : null;
  return opt?.open ? { teacher: opt.teacher, teacherName: opt.teacherName, teacherDims: { ...opt.teacherDims }, open: true, posts: { ...opt.posts }, cost: opt.cost, gpuMonths: opt.gpuMonths } : null;
}
// 蒸馏数据要跑多久：读下单时的生成工期 genDays（data_ops.js 的 distillOptions，和订数据面板同一口径）。
const genHint = opt => (Number.isFinite(opt.genDays) ? `用自己的推理卡跑约 ${opt.genDays} 天，拿到蒸馏数据`
  : `推理卡现在放不下老师（至少要 ${opt.nMin} 张 H100 的显存），下单后先停着，推理卡够了才开始跑`);
export function freezeDistillChoice(s, item) {
  if (item.kind !== 'milestone' || item.v !== 'rival' || !item.rel || s.mod !== 'llm') return;
  if (P().relById(relId(item.rel))?.open) item.distill = distillChoiceSnap(s, item.fam);
}

// 现实里是谁做到的：那条线的公司名（Phi 这类不在可玩名单里的，用家族名）。
const realWhoOf = fam => (!fam ? '微软 Phi 团队' : FAMILIES[fam]?.company || COMPANY_BY_ID[fam]?.company || fam);
const famWho = fam => (fam === 'academia' ? '学界' : FAMILIES[fam]?.company || fam);
// 和现实比早了还是晚了：现实日期精确到日的按天比（差不到一个月写几天），只有月份的按月比。
const vsReal = (s, realDate) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(realDate)) {
    const d = daysBetween(s.day, realDate);
    if (Math.abs(d) < 31) return d > 0 ? `比现实早 ${d} 天` : d < 0 ? `比现实晚 ${-d} 天` : '和现实是同一天';
  }
  const gap = monthsBetween(realDate.slice(0, 7), s.date);
  return gap < 0 ? `比现实早 ${-gap} 个月` : gap > 0 ? `比现实晚 ${gap} 个月` : '和现实是同一个月';
};
function msText(ms, v) { return MS_TEXT[ms.id]?.[v] || {}; }
function msFill(text, s, p) { return fill(text, s, p); }
// 现实对照：一般取史实（hist）；里程碑另写了 real 的用 real（例如第一个开源推理模型是 QwQ-32B-Preview，选项沿用 R1 那段史实）；real: false 不放。
export function realOf(ms) {
  if (ms.real === false) return null;
  if (ms.real) {
    const r = ms.real;
    return { realFam: r.fam, date: r.date, fact: { date: r.date, title: r.title, text: r.text, sources: r.src ? [r.src] : [] } };
  }
  const h = histInfo(ms.hist, ms.mod);
  return h ? { realFam: h.realFam, date: h.fact.date, fact: h.fact } : null;
}
// “你们做到了”的选项：里程碑自己写了 choices 的用它，否则用史实的选项。
const mineChoices = (s, ms) => ms.choices || histInfo(ms.hist, s.mod)?.choices || [];
export function milestoneView(s, q) {
  const ms = MS_BY_ID[q.id];
  const real = realOf(ms);
  const t = msText(ms, q.v);
  const tech = ms.tech ? TECH_BY_ID[ms.tech] : null;
  const realDate = real?.date || s.day;
  const realLine = real ? `现实中：${fmtDate(realDate.slice(0, 7))}，${realWhoOf(real.realFam)}（${real.fact.title}）。` : '';
  if (q.v === 'mine') {
    const m = q.model ? s.models.findLast(x => x.name === q.model) : null;
    const p = { model: q.model || liveModel(s)?.name || s.persona.name, title: ms.title, tech: tech?.name || '', field: MODALITIES[s.mod]?.label || '',
      total: m?.total ?? '', active: m?.active ?? '' };
    const body = msFill(t.body || `你们做到了：${ms.title}。`, s, p);
    let choices;
    if (ms.player.on === 'tech') {
      choices = [
        { id: 'paper', label: t.choices?.paper?.label || '写成论文公开', hint: '口碑、品牌和技术积累上升；以后别家也能照着学' },
        { id: 'secret', label: t.choices?.secret?.label || '先不公开，自己用', hint: '领先保持得更久；以后发布新版本时也可以写进技术报告' },
      ];
    } else {
      choices = mineChoices(s, ms).map(c => ({ id: c.id, label: c.id === 'skip' ? c.label : msFill(t.choices?.[c.id]?.label || c.label, s, p), hint: c.hint ?? describeEffects(c.effects, s) }));
    }
    return { kind: 'history', id: ms.id, tag: ms.type === 'first' ? '行业第一次' : '里程碑', title: msFill(t.title || ms.title, s, p),
      text: `${body}${realLine ? `\n${realLine}你们${vsReal(s, realDate)}。` : ''}`, fact: real?.fact || null,
      scene: t.scene?.length ? named(s, t.scene.map(l => ({ ...l, text: msFill(l.text, s, p) })), s.date) : null,
      lines: t.line ? [{ ...speaker(s, 'self'), text: msFill(t.line, s, p) }] : [], choices };
  }
  // 别家先做到
  const rel = q.rel ? P().relById(relId(q.rel)) : null;
  const who = famWho(q.fam);
  const p = { who, model: q.rel || '', title: ms.title, tech: tech?.name || '', field: MODALITIES[s.mod]?.label || '' };
  const sameAsReal = real && q.fam && real.realFam && ownerOf(q.fam) === ownerOf(real.realFam);
  let scene = null;
  const w = ms.world && P().worldEvent(ms.world);
  if (w && sameAsReal && SCENES[w.id]) scene = worldScene(s, w);
  else if (t.scene?.length) {
    const cid = characterById(q.fam) ? q.fam : null;
    const lines = t.scene.filter(l => l.who !== 'who' || cid).map(l => ({ ...l, who: l.who === 'who' ? cid : l.who, text: msFill(l.text, s, p) }));
    if (lines.length >= 2) scene = named(s, lines, s.date);
  }
  const body = msFill(t.body || (rel ? `${who} 发布了 ${rel.name}：${ms.title}。` : `${who} 公开了「${tech?.name || ms.title}」。${q.note ? `（${q.note}）` : ''}`), s, p);
  const realNote = !real ? '' : sameAsReal ? `现实里也是 ${realWhoOf(real.realFam)} 在 ${fmtDate(realDate.slice(0, 7))}做到的。` : `现实里是 ${realWhoOf(real.realFam)} 在 ${fmtDate(realDate.slice(0, 7))}做到的，这一回 ${who} 抢了先。`;
  const choices = [];
  // 对方开源或发了论文，才能“照着学”；闭源产品只能拆着用、猜方法，研究时间缩短一些。
  const published = rel ? rel.open : q.level !== 'proof';
  if (tech) choices.push(s.techs.includes(tech.id)
    ? { id: 'study', label: t.choices?.study?.label || '组织团队精读', hint: '技术积累 +5' }
    : { id: 'study', label: t.choices?.study?.label || '照着论文和开源代码复现', hint: published ? `「${tech.name}」至少按论文已公开算，研究时间再缩短 25%` : `对方没公开方法，只能拆着产品猜：「${tech.name}」研究时间缩短 25%` });
  if (s.mod === 'llm' && rel?.open) {
    // 老师读弹出时冻结的快照（G1-11）；更早的存档里没有快照，按当天现算。现在下不了单（比如自家已经更强）就不给这个选项。
    const opt = distillOptions(s).find(o => o.teacher === rel.family);
    const snap = q.distill === undefined ? distillChoiceSnap(s, rel.family) : q.distill;
    if (snap && opt?.open) choices.push({ id: 'distill', distill: true, label: t.choices?.distill?.label || `下载 ${snap.teacherName} 的权重做蒸馏`,
      hint: `老师是 ${snap.teacherName}${snap.teacherName === rel.name ? '' : '（这家目前综合最强的开源一款）'}。${genHint(opt)}；蒸馏依赖上升，技术积累变慢`,
      // 同一天同一家出了两件“第一次”（比如 DeepSeek LLM 67B 同时是第一个可商用和第一个研究型开源），第一张卡已经下单，第二张不能再下一次。
      disabled: !opt.ok ? opt.reason : s.orders.some(o => o.kind === 'distill' && o.ref === opt.id) ? '这家的蒸馏数据已经在跑了' : '' });
  }
  choices.push({ id: 'skip', label: t.choices?.skip?.label || '先不跟，按自己的节奏来', hint: '' });
  return { kind: 'world', wtype: rel ? 'release' : 'paradigm', id: ms.id, tag: '行业第一次', date: s.date, title: msFill(t.title || `${who}：${ms.title}`, s, p),
    text: `${body}${realNote ? `\n${realNote}` : ''}`, fact: real?.fact || null, scene, lines: [], choices };
}
export function applyMilestoneChoice(s, q, c) {
  const ms = MS_BY_ID[q.id];
  const t = msText(ms, q.v);
  const res = id => t.choices?.[id]?.result || '';
  log(s, `${q.v === 'mine' ? '里程碑' : '行业第一次'}：${ms.title}`);
  if (q.v === 'mine') {
    if (c === 'paper') {
      const done = publishPapers(s, [ms.tech]);
      fire(s, { on: 'paper', techs: done.map(x => x.id) });
      return res('paper') || '论文挂上了网，引用和邮件一起涌进来。之后别家也能照着学了。';
    }
    if (c === 'secret') return res('secret') || '方法先压在内部，只用在自家的模型上。';
    if (c === 'skip') return '';
    const ch = mineChoices(s, ms).find(x => x.id === c);
    if (ch) applyEffects(s, ch.effects, { source: 'milestone', id: ms.id });
    return res(c);
  }
  if (c === 'study' && ms.tech) {
    if (s.techs.includes(ms.tech)) s.know += 5;
    else {
      const rel = q.rel ? P().relById(relId(q.rel)) : null;
      if (rel ? rel.open : q.level !== 'proof') s.techRead[ms.tech] = s.date;
      s.techBoost[ms.tech] = Math.min(s.techBoost[ms.tech] || 1, 0.75);
    }
    return res('study') || '团队把论文和代码拆了一遍，组会上讨论到很晚。';
  }
  if (c === 'distill') { doDistillData(s, `distill:${q.fam}`, q.distill || null); return res('distill') || '权重下载好了，蒸馏任务排进了集群。'; }
  return res('skip') || '';
}
