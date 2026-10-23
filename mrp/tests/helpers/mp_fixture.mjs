// 确定性的世界契约替身。只复制进测试临时目录，生产服务器没有注入接口。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const clone = x => JSON.parse(JSON.stringify(x));
const addDay = (day, n) => new Date(Date.parse(day) + n * 86400000).toISOString().slice(0, 10);
class World {
  tick() {
    for (const c of Object.values(this.companies)) {
      c.s.cash += c.kind === 'bot' || c.hosted ? 2 : 1;
      if (c.hosted) while (c.s.cards.length) autoResolve(this, c.id, 0);
    }
    this.tickNo++; this.day = addDay(this.day, 1);
  }
  hash() { return crypto.createHash('sha256').update(serialize(this)).digest('hex'); }
}
export function createWorld(settings) {
  const w = new World();
  w.settings = clone(settings); w.seed = settings.seed; w.tickNo = 0;
  w.day = String(settings.start).length === 4 ? `${settings.start}-01-01` : String(settings.start).length === 7 ? `${settings.start}-01` : settings.start;
  w.end = addDay(w.day, (settings.days ?? 365) - 1);
  let seat = 0;
  const list = settings.companies || Array.from({ length: 12 }, (_, i) => ({ name: `电脑${i}`, kind: 'bot', bot: 'normal' }));
  w.companies = Object.fromEntries(list.map((spec, i) => {
    const id = `c${i}`, human = spec.kind === 'human';
    return [id, {
      ...spec, id, seat: human ? seat++ : null, hosted: false,
      s: { cash: 100 + i, secret: `PRIVATE-${id}`, rng: 1, seed: 99, cards: [], resolved: 0, actions: 0 },
    }];
  }));
  if (settings.seed === 45) w.companies.c0.s.cards.push({ id: 'card-0', kind: 'offer', since: w.day, major: false });
  if (settings.seed === 46) w.companies.c0.s.cards.push(...['card-a', 'card-b'].map(id => ({ id, kind: 'offer', since: w.day, major: false })));
  if (settings.seed === 180) w.companies.c1.s.cards.push({ id: 'card-0', kind: 'major', since: w.day, major: true });
  if (settings.seed === 88 || settings.seed === 89) w.companies.c2.s.unavailable = settings.seed;
  return w;
}
export function applyNow(w, id, { name, args = {} }) {
  const c = w.companies[id];
  if (!c) return { ok: false, err: '没有这家公司' };
  if (name === 'throwNoop') throw new Error('这条测试命令被引擎拒绝了');
  if (name === 'answer') {
    if (!Number.isInteger(args.at) || !c.s.cards[args.at]) return { ok: false, err: '没有这张卡' };
    return { ok: true, result: autoResolve(w, id, args.at) };
  }
  if (name === 'refill') {
    c.s.cards.push({ id: `card-${c.s.resolved + c.s.cards.length}`, kind: args.major ? 'major' : 'offer', since: w.day, major: !!args.major });
    return { ok: true };
  }
  if (name === 'noop') { c.s.actions++; return { ok: true }; }
  return { ok: false, err: '没有这条命令' };
}
export const publicView = w => ({ day: w.day, companies: Object.values(w.companies).map(({ id, name, kind, seat, hosted }) => ({ id, name, kind, seat, hosted })) });
export const privateView = (w, id) => ({ id, company: w.companies[id].name, public: publicView(w), s: clone(w.companies[id].s) });
export const serialize = w => JSON.stringify(w);
export function migrateWorld(text) {
  try { return { ok: true, world: Object.assign(new World(), JSON.parse(text)) }; }
  catch { return { ok: false, reason: '测试快照不是 JSON' }; }
}
export const inboxOf = (w, id) => w.companies[id].s.cards.map((card, at) => ({ ...card, at }));
export function autoResolve(w, id, at) {
  const c = w.companies[id];
  if (!c?.s.cards[at]) return null;
  c.s.cards.splice(at, 1); c.s.resolved++;
  return { title: '测试卡', choice: '默认项' };
}
export function setHosted(w, id, on) {
  const c = w.companies[id];
  if (c?.kind !== 'human') return;
  c.hosted = !!on;
  if (on) while (c.s.cards.length) autoResolve(w, id, 0);
}
export function takeover(w, id) {
  const c = w.companies[id];
  if (c?.kind !== 'bot' || c.s.unavailable === 88) return null;
  if (c.s.unavailable === 89) throw new Error('这家公司已经退场了');
  const seat = Math.max(-1, ...Object.values(w.companies).filter(x => x.kind === 'human').map(x => x.seat)) + 1;
  c.kind = 'human'; c.seat = seat; c.hosted = false;
  return seat;
}
export const MAJOR_KINDS = ['major'];
export const AVOID = [];

export function fixtureProject(sourceRoot) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mrp-fixture-'));
  for (const dir of ['server', 'src/career/net', 'src/career/world', 'src/career/sim', 'src/career/data']) fs.mkdirSync(path.join(root, dir), { recursive: true });
  for (const name of ['mp.mjs', 'room.mjs', 'store.mjs', 'static.mjs']) fs.copyFileSync(path.join(sourceRoot, 'server', name), path.join(root, 'server', name));
  fs.copyFileSync(path.join(sourceRoot, 'src/career/net/protocol.js'), path.join(root, 'src/career/net/protocol.js'));
  fs.copyFileSync(fileURLToPath(import.meta.url), path.join(root, 'src/career/fixture.mjs'));
  fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
  fs.writeFileSync(path.join(root, 'src/career/engine.js'), "export * from './fixture.mjs';\n");
  fs.writeFileSync(path.join(root, 'src/career/world/index.js'), "export * from '../fixture.mjs';\n");
  fs.writeFileSync(path.join(root, 'src/career/sim/commands.js'), 'export const COMMANDS = {answer:1,refill:1,noop:1,throwNoop:1};\n');
  // 大厅开局给电脑公司起名用的名单（真文件还带别的常数，替身只要这一份）。
  fs.writeFileSync(path.join(root, 'src/career/data/selfplay.js'), "export const BOT_COMPANIES = [{ name: '青穹智能', brand: '青穹' }, { name: '远望智能', brand: '远望' }, { name: '星环实验室', brand: '星环' }, { name: '赤道模型', brand: '赤道' }, { name: '白泽智能', brand: '白泽' }, { name: '风眼科技', brand: '风眼' }, { name: '北岭实验室', brand: '北岭' }, { name: '蓝鲸智能', brand: '蓝鲸' }, { name: '泰拉模型', brand: '泰拉' }, { name: '流光智能', brand: '流光' }];\n");
  fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><title>联机契约测试</title>');
  return root;
}
