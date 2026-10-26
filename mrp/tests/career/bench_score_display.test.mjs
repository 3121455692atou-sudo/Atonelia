import { it } from 'node:test';
import assert from 'node:assert/strict';
globalThis.document ??= { baseURI: 'http://localhost/' };
const { playBench } = await import('../../src/career/ui/bench.js');
const { leaderboard, myRank } = await import('../../src/career/sim/model.js');
const { recordRun } = await import('../../src/career/sim/release.js');
const { BENCHMARKS, BENCH_BY_ID, lastRefresh } = await import('../../src/career/data/benchmarks.js');
const { fmtScore } = await import('../../src/career/ui/fmt.js');

// Exercise the real renderer with a minimal DOM and controlled frame/click lifecycle.
async function render(run, finish, { lb = { rows: [] }, rank = null, classRank = null, isGoal = true } = {}) {
  const before = structuredClone({ run, lb, rank, classRank });
  const saved = { document: globalThis.document, requestAnimationFrame: globalThis.requestAnimationFrame, setTimeout: globalThis.setTimeout };
  const nodes = Object.fromEntries(['.progress i', '.bench-count', '.bench-score', '.bench-ticker', '.bench-card'].map(k => [k, { style: {}, textContent: '', innerHTML: '' }]));
  let skip, click, frame, timer;
  const cells = run.bench.items <= 80 ? Array.from({ length: run.bench.items }, () => ({ className: '' })) : [];
  const root = {
    querySelectorAll: () => cells,
    querySelector: k => k === '[data-skip]' ? { addEventListener: (_, cb) => { skip = cb; } } : nodes[k],
    addEventListener: (_, cb) => { click = cb; }, removeEventListener() {},
  };
  const layer = { innerHTML: '', firstElementChild: root };
  globalThis.document = { baseURI: 'http://localhost/', getElementById: () => layer };
  globalThis.requestAnimationFrame = cb => { frame = cb; };
  globalThis.setTimeout = cb => { timer = cb; };
  try {
    const promise = playBench(run, lb, rank, classRank, isGoal);
    if (finish === 'skip') skip();
    else if (finish === 'timeout') timer();
    else frame(performance.now() + 3000);
    const html = nodes['.bench-card'].innerHTML;
    const animation = nodes['.bench-score'].textContent;
    click({ target: { closest: () => ({ disabled: false }) } });
    await promise;
    assert.deepEqual({ run, lb, rank, classRank }, before, 'renderer must not mutate the run, leaderboard or rank');
    return { html, animation, countText: nodes['.bench-count'].textContent, cellClasses: cells.map(c => c.className) };
  } finally { Object.assign(globalThis, saved); }
}

// Result cards intentionally combine this run with the model's best score in the
// current question cycle. Keep those two meanings explicit without changing either.
function boardFixture(benchId, bestScore, { date = '2026-02', bestDate = date, selected = false } = {}) {
  const mod = BENCH_BY_ID[benchId].mod;
  const model = { id: 'selected-model', name: mod === 'speech' ? 'Eleven v3' : 'Test model', mod, stage: 'released', role: selected ? 'small' : 'flagship', cls: 'large', releasedDay: `${date}-01`, benchmarks: {} };
  const s = { charId: mod === 'speech' ? 'elevenlabs' : 'gpt', mod, company: { org: mod === 'speech' ? 'elevenlabs' : 'openai', company: 'Test company', country: 'US' }, date, day: `${date}-19`, models: [model], published: {} };
  const run = score => ({ bench: BENCH_BY_ID[benchId], benchId, score, solved: ['pct', 'lower'].includes(BENCH_BY_ID[benchId].kind) ? Math.round(score / 100 * BENCH_BY_ID[benchId].items) : null, cost: 350, model: model.name, modelId: model.id, role: model.role, cls: model.cls, date, day: s.day });
  recordRun(s, { ...run(bestScore), date: bestDate, day: `${bestDate}-01` }, model);
  return { s, model, run };
}
for (const [benchId, previous, current, expected] of [
  ['spoof', 53.8, 52, 53.8], ['spoof', 53.8, 53.8, 53.8], ['spoof', 53.8, 55, 55],
  ['fleurs', 5, 6, 5], ['fleurs', 5, 5, 5], ['fleurs', 5, 4, 4],
  ['ttsarena', 1359, 1350, 1359], ['mos', 4.61, 4.6, 4.61],
]) for (const finish of ['frame', 'skip', 'timeout']) {
  it(`${benchId} ${previous} -> ${current} ${finish}: current result and current-cycle best are explicitly distinct`, async () => {
    const { s, model, run } = boardFixture(benchId, previous);
    const currentRun = run(current);
    recordRun(s, currentRun, model);
    const lb = leaderboard(s, benchId, { playerModel: model.id });
    const rank = myRank(s, benchId, null, model.role, model.id);
    const classRank = myRank(s, benchId, model.cls, model.role, model.id);
    const before = structuredClone(s);
    const { html } = await render(currentRun, finish, { lb, rank, classRank, isGoal: false });
    assert.match(html, /本次成绩/);
    assert.ok(html.includes(`<h3>${fmtScore(currentRun.bench, current)}</h3>`));
    assert.ok(html.includes(`当前题库最佳成绩榜 · 本模型最佳 ${expected}`));
    assert.ok(html.includes(`最佳成绩排名：总榜第 <b>${rank.rank}</b>`));
    assert.equal(model.benchmarks[benchId].score, expected);
    assert.equal(lb.rows.find(r => r.mine).score, expected);
    assert.deepEqual(s, before, 'render must not alter engine state');
  });
}
it('a worse current run cannot borrow the best rank without the result labeling it as best-score rank', async () => {
  const { s, model, run } = boardFixture('spoof', 98);
  const current = run(52);
  recordRun(s, current, model);
  const lb = leaderboard(s, 'spoof', { playerModel: model.id });
  const rank = myRank(s, 'spoof', null, model.role, model.id);
  assert.equal(rank.rank, 1);
  assert.equal(lb.rows.filter(r => !r.mine && r.score > current.score).length + 1, 7);
  const { html } = await render(current, 'skip', { lb, rank });
  assert.match(html, /<h3>52%<\/h3>/);
  assert.match(html, /最佳成绩排名：总榜第 <b>1<\/b>/);
  assert.match(html, /本模型最佳 98%/);
});
it('equal best scores preserve tied-rank notation', async () => {
  const { s, model, run } = boardFixture('spoof', 94.2);
  const lb = leaderboard(s, 'spoof', { playerModel: model.id });
  const rank = myRank(s, 'spoof', null, model.role, model.id);
  assert.equal(rank.tied, 2);
  const { html } = await render(run(94.2), 'skip', { lb, rank });
  assert.match(html, /最佳成绩排名：总榜第 <b>1<\/b>（并列）/);
});
it('a refreshed question cycle excludes the older best and labels only the new-cycle record', async () => {
  const { s, model, run } = boardFixture('arena', 1500, { bestDate: '2026-01' });
  assert.equal(lastRefresh(BENCH_BY_ID.arena, s.date), '2026-02');
  assert.equal(leaderboard(s, 'arena', { playerModel: model.id }).rows.some(r => r.mine), false);
  const current = run(1200);
  recordRun(s, current, model);
  const lb = leaderboard(s, 'arena', { playerModel: model.id });
  assert.equal(lb.rows.find(r => r.mine).score, 1200);
  const { html } = await render(current, 'skip', { lb });
  assert.match(html, /本模型最佳 1200/);
  assert.doesNotMatch(html, /本模型最佳 1500/);
  assert.match(html, /最佳成绩排名：第 /, 'official-eval fallback rank uses the same best-score label');
});
it('an unchanged question cycle retains a prior-month record', async () => {
  const { s, model, run } = boardFixture('spoof', 53.8, { bestDate: '2026-01' });
  assert.equal(lastRefresh(BENCH_BY_ID.spoof, s.date), '2023-06');
  recordRun(s, run(52), model);
  const lb = leaderboard(s, 'spoof', { playerModel: model.id });
  const { html } = await render(run(52), 'skip', { lb });
  assert.match(html, /本模型最佳 53\.8%/);
  assert.equal(s.published.spoof.score, 52);
  assert.equal(model.benchmarks.spoof.score, 53.8);
});
it('selected non-main model uses its own ID and best even when a same-name main model leads the company', async () => {
  const { s, model, run } = boardFixture('spoof', 53.8, { selected: true });
  const main = { ...structuredClone(model), id: 'main-model', role: 'flagship', benchmarks: {} };
  s.models.push(main);
  s.live = main.id;
  recordRun(s, { ...run(98), modelId: main.id, role: main.role }, main);
  recordRun(s, run(52), model);
  assert.equal(leaderboard(s, 'spoof').rows.find(r => r.mine).modelId, main.id);
  const lb = leaderboard(s, 'spoof', { playerModel: model.id });
  const rank = myRank(s, 'spoof', null, model.role, model.id);
  const { html } = await render(run(52), 'skip', { lb, rank });
  assert.match(html, /本模型最佳 53\.8%/);
  assert.doesNotMatch(html, /本模型最佳 98%/);
  assert.match(html, /最佳成绩排名：总榜第 <b>7<\/b>/);
});
it('missing or unrelated player row does not invent a selected-model best or fallback rank', async () => {
  const { run } = boardFixture('spoof', 53.8);
  const { html } = await render(run(52), 'skip', { lb: { rows: [{ mine: true, modelId: 'other', name: 'Other', score: 98, rank: 1 }] } });
  assert.match(html, /当前题库最佳成绩榜/);
  assert.doesNotMatch(html, /本模型最佳|最佳成绩排名：/);
});
for (const kind of ['pct', 'lower']) for (const score of [49.9, 50, 50.1]) for (const finish of ['frame', 'skip', 'timeout']) {
  it(`${kind} ${score}% ${finish}: rounded item count is approximate, official score stays exact`, async () => {
    const run = { bench: { name: 'SWE test', kind, items: 500, desc: '' }, score, solved: Math.round(score / 100 * 500), cost: 500, model: 'test' };
    const { html, animation } = await render(run, finish);
    assert.ok(html.includes(`成绩以 ${score}% 为准`));
    assert.ok(html.includes(`按得分折算约 ${run.solved} / 500`));
    assert.doesNotMatch(html, /题做对|已达标/);
    if (score === 49.9) assert.doesNotMatch(html, /50(?:\.0)?%/);
    if (finish === 'frame') {
      assert.match(animation, /演示.*约.*（非成绩）/);
      assert.doesNotMatch(animation, /%/);
    }
    assert.equal(run.score >= 50, score >= 50);
  });
}
it('score-only results do not invent a solved count', async () => {
  const { html } = await render({ bench: { name: 'score', kind: 'pct', items: 500 }, score: 49.9, solved: null, cost: 500, model: 'test' }, 'skip');
  assert.match(html, /49\.9%/);
  assert.doesNotMatch(html, /折算约/);
});

for (const kind of ['pct', 'lower']) for (const items of [50, 500]) for (const score of [0, 3, 20, 80, 100]) {
  it(`${kind} ${score}% / ${items} items: animation count is not the complement`, async () => {
    const solved = Math.round(score / 100 * items);
    const run = { bench: { name: 'count', kind, items, desc: '' }, score, solved, cost: 500, model: 'test' };
    const { animation, cellClasses } = await render(run, 'frame');
    assert.equal(animation, kind === 'lower' ? `演示折算约 ${solved} 单位（非成绩）` : `演示正确约 ${solved} 题（非成绩）`);
    if (items <= 80) {
      assert.equal(cellClasses.filter(c => c === 'ng').length, kind === 'lower' ? solved : items - solved);
      assert.equal(cellClasses.filter(c => c === 'ok').length, kind === 'lower' ? items - solved : solved);
    }
  });
}

for (const b of BENCHMARKS.filter(b => b.kind === 'lower')) for (const finish of ['frame', 'skip', 'timeout']) {
  it(`${b.mod}/${b.id} ${finish}: lower-score animation uses neutral units, never invented measured counts`, async () => {
    const score = 5, solved = Math.round(score / 100 * b.items);
    const run = { bench: b, benchId: b.id, score, solved, cost: 350, model: 'test', modelId: 'test-model' };
    const { html, animation, countText } = await render(run, finish);
    assert.ok(html.includes(`按得分折算约 ${solved} / ${b.items} 个演示单位`));
    assert.match(html, /非实测次数；成绩以 5% 为准/);
    assert.doesNotMatch(html, /次攻击成功|种语言.*错误|题做错|次违规/);
    if (finish === 'frame') {
      assert.equal(animation, `演示折算约 ${solved} 单位（非成绩）`);
      assert.doesNotMatch(animation, /攻击|违规|正确|语言|题/);
      assert.match(countText, /单位$/);
    }
  });
}
