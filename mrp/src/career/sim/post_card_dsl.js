// Pure bounded interpreter. No game state, IO, RNG, recursion in scheduled work,
// refunds, extra choices, real resource writes or dynamic property evaluation.
export const DSL_CAPS = Object.freeze({ focus: 4, flow: 8, shield: 4, boost: 2 });
export const DSL_LIMITS = Object.freeze({ turns: 6, budget: 8, base: 12, pending: 4, totalScore: 864 });
const METERS = Object.keys(DSL_CAPS);
const TAGS = new Set(['filter','curriculum','stability','contrast','economy','transfer','reserve','calibration','verify','finish','breadth','sequence','distill']);
const FIELDS = new Set([...METERS, 'budget', 'paid', 'turn', 'pendingCount', 'previous.tags', 'history.distinctCards', 'history.distinctTags', ...[...TAGS].map(t => `history.tagCounts.${t}`)]);
const plain = x => !!x && typeof x === 'object' && !Array.isArray(x) && [Object.prototype, null].includes(Object.getPrototypeOf(x));
const keys = (x, names) => plain(x) && Object.keys(x).every(k => names.includes(k)) && names.every(k => Object.hasOwn(x, k));
const integer = (x, lo, hi) => Number.isSafeInteger(x) && x >= lo && x <= hi;
const clamp = (x, max) => Math.max(0, Math.min(max, x));
const copy = x => structuredClone(x);
function fail() { throw Error('不支持或损坏的卡牌效果规则'); }
export function validatePredicate(c, depth = 0) {
  if (depth > 4 || !plain(c)) fail();
  if (keys(c, ['all']) || keys(c, ['any'])) { const list = c.all || c.any; if (!Array.isArray(list) || list.length < 1 || list.length > 4) fail(); list.forEach(v => validatePredicate(v, depth + 1)); return; }
  if (!keys(c, ['field','op','value']) || !FIELDS.has(c.field)) fail();
  if (c.field === 'previous.tags') { if (c.op !== 'contains' || ![...TAGS,'train','prepare'].includes(c.value)) fail(); }
  else if (!['eq','gte','lte'].includes(c.op) || !integer(c.value, 0, 24)) fail();
}
export function validateEffects(effects, depth = 0, payload = false, budget = { n: 0 }) {
  if (!Array.isArray(effects) || effects.length > 12 || depth > 4) fail();
  for (const e of effects) {
    if (++budget.n > 60 || !plain(e) || (payload && e.op !== 'meters')) fail();
    if (e.op === 'scoreBase') { if (!keys(e, ['op','amount']) || !integer(e.amount, 0, 12)) fail(); }
    else if (e.op === 'scoreFromMeter') { if (!keys(e, ['op','meter','perUnit','maxUnits']) || !METERS.includes(e.meter) || !integer(e.perUnit, 0, 12) || !integer(e.maxUnits, 0, DSL_CAPS[e.meter])) fail(); }
    else if (e.op === 'meters') { if (!keys(e, ['op','delta']) || !plain(e.delta) || !Object.keys(e.delta).length || Object.entries(e.delta).some(([m, x]) => !METERS.includes(m) || !integer(x, -8, 8))) fail(); }
    else if (e.op === 'setMeter') { if (!keys(e, ['op','meter','value']) || !METERS.includes(e.meter) || !integer(e.value, 0, DSL_CAPS[e.meter])) fail(); }
    else if (e.op === 'branch') { if (!keys(e, ['op','condition','then','else'])) fail(); validatePredicate(e.condition); validateEffects(e.then, depth + 1, false, budget); validateEffects(e.else, depth + 1, false, budget); }
    else if (e.op === 'scheduleOnce') {
      if (!keys(e, ['op','afterTurns','payload','onOverflow','ifAfterFinalTurn']) || ![1,2].includes(e.afterTurns) || e.onOverflow !== 'reject_before_cost' || e.ifAfterFinalTurn !== 'expire_no_reward' || !e.payload.length) fail();
      validateEffects(e.payload, depth + 1, true, budget);
    } else fail();
  }
}
function historySnapshot(history) {
  const tagCounts = {}, tags = new Set();
  for (const h of history) for (const tag of h.tags) { tags.add(tag); tagCounts[tag] = (tagCounts[tag] || 0) + 1; }
  return { distinctCards: new Set(history.map(h => h.cardId)).size, distinctTags: tags.size, tagCounts };
}
function snapshot(work, paid) { return { ...Object.fromEntries(METERS.map(m => [m,work[m]])), budget: work.budget, paid, turn: work.turn, pendingCount: work.pending.length, previous: { tags: work.history.length ? [...work.history.at(-1).tags, work.history.at(-1).kind] : [] }, history: historySnapshot(work.history) }; }
function read(s, field) {
  if (METERS.includes(field) || ['budget','paid','turn','pendingCount'].includes(field)) return s[field];
  if (field === 'previous.tags') return s.previous.tags;
  if (field === 'history.distinctCards') return s.history.distinctCards;
  if (field === 'history.distinctTags') return s.history.distinctTags;
  return s.history.tagCounts[field.slice('history.tagCounts.'.length)] || 0;
}
function matches(c, s) {
  if (c.all) return c.all.every(x => matches(x, s));
  if (c.any) return c.any.some(x => matches(x, s));
  const v = read(s, c.field);
  return c.op === 'contains' ? v.includes(c.value) : c.op === 'eq' ? v === c.value : c.op === 'gte' ? v >= c.value : v <= c.value;
}
function meters(work, delta) { for (const [m, amount] of Object.entries(delta)) work[m] = clamp(work[m] + amount, DSL_CAPS[m]); }
export function startCardTurn(work) {
  // Only the rules engine calls this once after advancing the turn. Removal
  // precedes application, so re-entry cannot apply an event twice.
  const due = work.pending.filter(e => e.dueTurn === work.turn);
  work.pending = work.pending.filter(e => e.dueTurn !== work.turn);
  for (const e of due) for (const op of e.payload) meters(work, op.delta);
  return due.map(e => e.id);
}
export function evaluateCard(state, card) {
  const work = copy(state), paid = Math.max(0, card.cost - work.shield);
  if (state.status !== 'playing' || paid > work.budget) return { ok: false, error: '演练预算不足', paid };
  work.budget -= paid; work.shield = Math.max(0, work.shield - card.cost);
  const snap = snapshot(work, paid); let base = 0, schedules = 0; const expired = [], scheduled = [];
  function run(effects) {
    for (const e of effects) {
      if (e.op === 'scoreBase') base += e.amount;
      else if (e.op === 'scoreFromMeter') base += Math.min(snap[e.meter], e.maxUnits) * e.perUnit;
      else if (e.op === 'meters') meters(work, e.delta);
      else if (e.op === 'setMeter') work[e.meter] = e.value;
      else if (e.op === 'branch') run(matches(e.condition, snap) ? e.then : e.else);
      else if (e.op === 'scheduleOnce') {
        if (++schedules > 2) throw Error('本手演练预约超过两项');
        const event = { id: work.nextEventId++, sourceCardId: card.id, dueTurn: work.turn + e.afterTurns, payload: copy(e.payload) };
        if (event.dueTurn > DSL_LIMITS.turns) expired.push(event.id);
        else { if (work.pending.length >= DSL_LIMITS.pending) throw Error('演练待办已满，本次不扣预算'); work.pending.push(event); scheduled.push(event.id); }
      } else fail();
    }
  }
  try { run(card.effects); } catch (e) { return { ok: false, error: e.message, paid }; }
  base = clamp(base, DSL_LIMITS.base);
  const multiplier = card.kind === 'train' ? (1 + snap.focus) * (work.boost > 0 ? 2 : 1) : 1;
  const instant = base * multiplier, tick = work.flow * 3;
  work.flow = Math.max(0, work.flow - 1); work.boost = Math.max(0, work.boost - 1);
  work.score += instant + tick;
  if (work.score > DSL_LIMITS.totalScore) fail();
  const formula = card.kind === 'train' ? `${base} × ${1 + snap.focus} × ${multiplier / (1 + snap.focus)}` : `${base}`;
  const event = { turn: work.turn, cardId: card.id, name: card.name, instant, tick, formula, score: work.score, paid, scheduled, expired };
  work.log.push(event); work.history.push({ cardId: card.id, kind: card.kind, tags: [...card.archetypeTags] });
  return { ok: true, work, paid, instant, tick, total: instant + tick, formula, event, snapshot: snap };
}
const meterNames = { focus: '聚焦', flow: '积累', shield: '演练稳定', boost: '校准' };
function conditionText(c) {
  if (c.all) return c.all.map(conditionText).join(' 且 ');
  if (c.any) return '(' + c.any.map(conditionText).join(' 或 ') + ')';
  const field = meterNames[c.field] || ({ budget:'支付后预算',paid:'本手实付',turn:'回合',pendingCount:'待办数','previous.tags':'上手方法','history.distinctCards':'已用不同牌数','history.distinctTags':'已用方法种类' })[c.field] || `已用 ${c.field.split('.').at(-1)} 次数`;
  return `${field}${{ eq:' = ',gte:' ≥ ',lte:' ≤ ',contains:'含 ' }[c.op]}${c.value}`;
}
export function describeEffects(effects) {
  return effects.map(e => e.op === 'scoreBase' ? `基础分 +${e.amount}` : e.op === 'scoreFromMeter' ? `${meterNames[e.meter]}每层 +${e.perUnit} 基础分（最多 ${e.maxUnits} 层）` : e.op === 'meters' ? Object.entries(e.delta).map(([m,n]) => `${meterNames[m]} ${n >= 0 ? '+' : ''}${n}`).join('，') : e.op === 'setMeter' ? `${meterNames[e.meter]}设为 ${e.value}` : e.op === 'branch' ? `若${conditionText(e.condition)}：${describeEffects(e.then)}；否则：${describeEffects(e.else)}` : `第 ${e.afterTurns} 个后续回合开始：${describeEffects(e.payload)}（末回合后过期）`).join('；');
}
