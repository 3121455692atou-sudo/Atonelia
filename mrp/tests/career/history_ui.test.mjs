// 董事会目标与公司历程（P3.U4，规格 E6、D10.5、D11.2、D1.1）：
// 24 家公司 × 4 个剧本的模型页、榜单页、对手页、董事会目标页、公司历程页都能渲染；
// 金色 SOTA（含“还没经过挑战”）、灰色“曾为 SOTA”、三枚徽章、被污染的模型不给徽章；
// goalNeed 按对手数生成“第一 / 前二 / 前三”；失败规则从常量来；“里程碑”只指 s.ms；
// 开局前 SOTA_HISTORY 里本公司的记录出现在公司历程；手机上整页滚动、不横向溢出。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

globalThis.document ??= { baseURI: 'http://localhost/' };

import * as E from '../../src/career/engine.js';
import { PLAYABLE, SCENARIOS } from '../../src/career/data/core.js';
import { BOARD_STRIKE_LIMIT } from '../../src/career/data/goals.js';
import { resolveAll } from '../helpers/career_bot.mjs';
import { cssAt, cssTokens } from '../helpers/css.mjs';

const { PAGE, NAV_GROUPS } = await import('../../src/career/ui/office.js');
const freshSt = (x = {}) => ({ page: 'model', bench: null, cls: '', board: 'bench', ...x });
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const BAD = /undefined|NaN|\[object|(?<![\w-])Infinity/;
const UI_DIR = new URL('../../src/career/ui/', import.meta.url);
const game = (id = 'deepseek', sc = 'y2025') => { const s = E.createGame(id, sc, 7); resolveAll(s); return s; };

describe('董事会目标与公司历程（P3.U4）：24 家公司 × 4 个剧本', () => {
  it('模型页、榜单页、对手页、董事会目标页、公司历程页都能渲染、不抛错', () => {
    let n = 0;
    for (const p of PLAYABLE) for (const sc of SCENARIOS) {
      const s = E.createGame(p.id, sc.id, 7);
      resolveAll(s);
      for (const id of ['model', 'boards', 'rivals', 'goals', 'history']) {
        const html = PAGE[id].render(s, freshSt({ page: id }));
        assert.equal(typeof html, 'string', `${p.id} ${sc.id} ${id}`);
        assert.ok(html.trim().length > 0, `${p.id} ${sc.id} ${id} 是空的`);
        assert.doesNotMatch(text(html), BAD, `${p.id} ${sc.id} ${id}`);
        n++;
      }
      // 榜单页还有一个量级筛选的分支。
      assert.ok(PAGE.boards.render(s, freshSt({ page: 'boards', cls: 'small' })).trim().length > 0);
      n++;
    }
    assert.equal(n, 96 * 6);
  });

  it('公司历程已登记在“公司”组，导航里不再隐藏', () => {
    assert.deepEqual(NAV_GROUPS[0], ['公司', ['strategy', 'goals', 'history', 'capital', 'finance', 'legal']]);
    assert.ok(!PAGE.history.hidden);
    assert.equal(PAGE.history.render(game(), freshSt({ page: 'history' })).includes('<h2>公司历程</h2>'), true);
  });
});

describe('董事会目标与公司历程（P3.U4）：SOTA 角标和徽章', () => {
  it('金色 SOTA（还没经过挑战）、灰色曾为 SOTA、三枚徽章；被污染的模型不给徽章', () => {
    const s = game();
    const m = E.liveModel(s);
    const q = E.qOf(s.mod, m.dims);
    // 场地凑满、还没挡住挑战：金色角标照常显示，悬停写“还没经过挑战”。
    m.sota = { from: '2025-01-01', until: null };
    s.sota.holder = { by: 'me', id: m.id, name: m.name, q, since: '2025-01-01', counted: false, countedAt: null };
    m.badges = ['open_top', 'community', 'works'];
    const model = PAGE.model.render(s, freshSt());
    assert.match(model, /sota-badge--now/);
    assert.match(model, /title="还没经过挑战"/);
    for (const name of ['开源最强', '社区之选', '能干活']) assert.ok(model.includes(name), name);
    // 榜单页把同一款的角标和徽章列在图后面。
    const boards = PAGE.boards.render(s, freshSt());
    assert.match(boards, /board-mark/);
    assert.match(boards, /sota-badge--now/);
    for (const name of ['开源最强', '社区之选', '能干活']) assert.ok(boards.includes(name), `榜单页少了 ${name}`);
    // 对手页：把现在持标的人换成榜上的对手，金色角标和悬停说明照样显示。
    const top = E.rivalStandings(s)[0];
    s.sota.holder = { by: top.rel.family, id: top.rel.id, name: top.rel.name, q: top.q, since: s.start, counted: false, countedAt: null };
    const rivals = PAGE.rivals.render(s, freshSt({ page: 'rivals' }));
    assert.match(rivals, /sota-badge--now/);
    assert.match(rivals, /还没经过挑战/);

    // 交出去以后：灰色“曾为 SOTA（YYYY-MM 至 YYYY-MM）”。
    m.sota = { from: '2025-01-01', until: '2025-03-01' };
    s.sota.holder = null;
    const past = PAGE.model.render(s, freshSt());
    assert.match(past, /sota-badge--past/);
    assert.match(past, /曾为 SOTA（2025-01 至 2025-03）/);

    // 被蒸馏污染的模型：即使身上还带着旧的徽章数组，也不显示任何一枚。
    for (const x of s.models) x.badges = [];
    m.tainted = true;
    m.untainted = false;
    m.badges = ['open_top', 'community', 'works'];
    const dirty = PAGE.model.render(s, freshSt());
    assert.doesNotMatch(dirty, /model-badge--/);

    // 解除污染后照常显示三枚。
    m.untainted = true;
    const cured = PAGE.model.render(s, freshSt());
    for (const name of ['开源最强', '社区之选', '能干活']) assert.ok(cured.includes(name), `解除污染后少了 ${name}`);
  });
});

describe('董事会目标与公司历程（P3.U4）：文案从常量来', () => {
  it('goalNeed 按对手数 2、4、6 分别写第一、前二、前三', () => {
    const c = { type: 'rank', bench: 'arena', classOnly: true };
    assert.match(E.goalNeed(c, 2), /同量级 2 家对手，要排第一/);
    assert.match(E.goalNeed(c, 4), /同量级 4 家对手，要排前二/);
    assert.match(E.goalNeed(c, 6), /同量级 6 家对手，要排前三/);
    // 超过封顶还是前三；1 家对手是第一。
    assert.match(E.goalNeed(c, 10), /要排前三/);
    assert.match(E.goalNeed(c, 1), /要排第一/);
    // 总榜目标不受同量级规则影响。
    assert.match(E.goalNeed({ type: 'rank', bench: 'arena', top: 5 }, 4), /总榜前 5/);
    // 不知道对手数时（顶栏、检查卡片、顾问）写通则，也从常量生成，不留空泛的“越多越高”。
    assert.match(E.goalNeed(c), /同量级对手 2 家要第一，4 家要前二，6 家起要前三/);
  });

  it('董事会目标页写“董事会目标”，失败规则里的次数等于常量', () => {
    const s = game();
    const html = PAGE.goals.render(s, freshSt({ page: 'goals' }));
    assert.match(text(html), /董事会目标/);
    assert.doesNotMatch(text(html), /里程碑/);
    assert.equal(BOARD_STRIKE_LIMIT, 3);
    assert.match(text(html), new RegExp(`累计 ${BOARD_STRIKE_LIMIT} 次未达成会撤换管理层`));
    // 宽限期写法：原定日期 → 宽限到的日期。
    const due0 = s.goals[0].date;
    s.goals[0].grace = true;
    s.goals[0].due0 = due0;
    s.goals[0].date = '2025-08';
    const g = text(PAGE.goals.render(s, freshSt({ page: 'goals' })));
    assert.match(g, /宽限期/);
    assert.ok(g.includes(`${due0} → 2025-08`), g);
  });

  it('全仓库界面字符串里，“里程碑”不再和 goal 一起出现（真正指 s.ms 的保留）', () => {
    const bad = [];
    const scan = (file, src) => src.split('\n').forEach((line, i) => {
      if (line.includes('里程碑') && /goal/i.test(line)) bad.push(`${file}:${i + 1} ${line.trim()}`);
    });
    const walk = dir => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const at = new URL(e.name + (e.isDirectory() ? '/' : ''), dir);
        if (e.isDirectory()) walk(at);
        else if (e.name.endsWith('.js')) scan(e.name, fs.readFileSync(at, 'utf8'));
      }
    };
    walk(UI_DIR);
    scan('sim/board.js', fs.readFileSync(new URL('../../src/career/sim/board.js', import.meta.url), 'utf8'));
    assert.deepEqual(bad, []);
    // 真正指 s.ms 的“里程碑”还在：公司历程的“我们的里程碑”。
    assert.match(text(PAGE.history.render(game(), freshSt({ page: 'history' }))), /我们的里程碑/);
    // 标题页、顶栏、目标卡的旧称也清掉了。
    const app = fs.readFileSync(new URL('app.js', UI_DIR), 'utf8');
    const top = fs.readFileSync(new URL('topbar.js', UI_DIR), 'utf8');
    const flow = fs.readFileSync(new URL('flow.js', UI_DIR), 'utf8');
    assert.doesNotMatch(app, /开始新的育成|研究积累|学术交流/);
    assert.doesNotMatch(top, /goal-tag">里程碑/);
    assert.doesNotMatch(flow, /ev-tag">里程碑/);
  });
});

describe('董事会目标与公司历程（P3.U4）：公司历程', () => {
  it('开局前 SOTA_HISTORY 有本公司记录的公司（gpt、claude），历程页能看到“我们的 SOTA 时刻”和那些型号', () => {
    for (const [id, sc] of [['gpt', 'y2023'], ['claude', 'y2025']]) {
      const s = E.createGame(id, sc, 7);
      const start = s.start || s.day;
      const org = E.orgOf(s);
      const records = (E.SOTA_HISTORY[s.mod] || []).filter(h => h.org === org && h.since < start);
      assert.ok(records.length > 0, `${id} ${sc} 开局前没有 SOTA_HISTORY 记录`);
      const t = text(PAGE.history.render(s, freshSt({ page: 'history' })));
      assert.match(t, /我们的 SOTA 时刻/);
      for (const h of records.slice(0, 3)) assert.ok(t.includes(h.name), `${id} ${sc} 少了 ${h.name}`);
    }
  });

  it('每块没有内容时写“还没有”；有内容的分块按时间倒序', () => {
    const s = game();
    s.sota = { holder: null, field: [], log: [], made: [], before: false, seed: '—', kin: null };
    s.ms = {};
    s.strategy = { ...s.strategy, done: {}, rights: {} };
    s.models = (s.models || []).filter(m => m.stage !== 'released');
    const t = text(PAGE.history.render(s, freshSt({ page: 'history' })));
    assert.ok((t.match(/还没有/g) || []).length >= 4, t);
    // 有内容时同一块里日期是从晚到早。
    const full = PAGE.history.render(game('claude', 'y2025'), freshSt({ page: 'history' }));
    const from = full.indexOf('我们的 SOTA 时刻');
    const sec = full.slice(from, full.indexOf('行业第一次', from));
    const days = [...sec.matchAll(/<span>(?:<i>)?(\d{4}) 年 (\d{1,2}) 月/g)].map(m => `${m[1]}-${String(m[2]).padStart(2, '0')}`);
    assert.ok(days.length >= 2, sec);
    assert.deepEqual(days, [...days].sort().reverse());
  });
});

describe('董事会目标与公司历程（P3.U4）：375px 版面', () => {
  it('公司历程在手机上日期换到上一行、卡片能缩，不横向溢出', () => {
    const css = fs.readFileSync(new URL('../../src/career/css/history.css', import.meta.url), 'utf8');
    assert.match(css, /@media \(max-width: 520px\)/);
    const at375 = cssAt(css, ['.hist-list li'], 375);
    assert.deepEqual(cssTokens(at375['grid-template-columns']), ['minmax(0, 1fr)']);
    const block = cssAt(css, ['.hist-block'], 375);
    assert.equal(block['min-width'], '0');
    const badge = cssAt(css, ['.sota-badge'], 375);
    assert.equal(badge['overflow-wrap'], 'anywhere');
  });
});
