import { quarterCap } from '../../src/career/world/supply_state.js';
// 确定性的世界契约替身。只复制进测试临时目录，生产服务器没有注入接口。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

let fixtureWorld = null;
export const currentFixtureWorld = () => fixtureWorld;
const clone = x => JSON.parse(JSON.stringify(x));
const addDay = (day, n) => new Date(Date.parse(day) + n * 86400000).toISOString().slice(0, 10);
class World {
  tick() {
    for (const c of Object.values(this.companies)) {
      c.s.cash += c.kind === 'bot' || c.hosted ? 2 : 1;
      if (c.hosted) while (c.s.cards.length) autoResolve(this, c.id, 0);
    }
    this.tickNo++; this.day = addDay(this.day, 1);
    for(const c of Object.values(this.companies))c.s.day=this.day;
    quarterCap(this);
  }
  hash() { return crypto.createHash('sha256').update(serialize(this)).digest('hex'); }
}
export function createWorld(settings) {
  const w = new World();
  w.settings = clone(settings); w.seed = settings.seed; w.tickNo = 0;
  w.endVersion = settings.endVersion; w.autoPostVersion = settings.autoPostVersion;
  w.day = String(settings.start).length === 4 ? `${settings.start}-01-01` : String(settings.start).length === 7 ? `${settings.start}-01` : settings.start;
  w.end = addDay(w.day, (settings.days ?? 365) - 1);
  let seat = 0;
  const list = settings.companies || Array.from({ length: 12 }, (_, i) => ({ name: `电脑${i}`, kind: 'bot', bot: 'normal' }));
  w.companies = Object.fromEntries(list.map((spec, i) => {
    const id = `c${i}`, human = spec.kind === 'human';
    return [id, {
      ...spec, tier0: spec.tier || 'specialist', id, seat: human ? seat++ : null, hosted: false,
      s: { charId:id,mod:'llm',day:w.day,status: 'playing', cash: 100 + i, models: [{ id: 'model-' + id, post:{own:0,dist:0,teachers:{}} }], projects: [{ id: 'project-' + id }], secret: `PRIVATE-${id}`, rng: 1, seed: 99, cards: [], resolved: 0, actions: 0 },
    }];
  }));
  if (settings.seed === 45) w.companies.c0.s.cards.push({ id: 'card-0', kind: 'offer', since: w.day, major: false });
  if (settings.seed === 46) w.companies.c0.s.cards.push(...['card-a', 'card-b'].map(id => ({ id, kind: 'offer', since: w.day, major: false })));
  if (settings.seed === 180) w.companies.c1.s.cards.push({ id: 'card-0', kind: 'major', since: w.day, major: true });
  if (settings.seed === 88 || settings.seed === 89) w.companies.c2.s.unavailable = settings.seed;
  w.supply={};quarterCap(w,w.day,true);fixtureWorld=w;return w;
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
// Fixture stores a flat world for existing lifecycle assertions; adapt it to the real
// snapshot validation envelope without dropping any company/schema/seed fields.
export function deserialize(text) { const w=JSON.parse(text);return {kind:'world',settings:w.settings,world:w,seed:w.seed,companies:Object.values(w.companies).filter(c=>c.s).map(c=>({s:c.s}))}; }
export function migrateWorld(text) {
  try { const world=Object.assign(new World(), JSON.parse(text));fixtureWorld=world;return { ok: true, world }; }
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

// Follow real ESM dependencies instead of maintaining another validator-file list.
// These are the existing deterministic world/command fixture boundaries only;
// every rules, exposure, catalogue and schema module stays real.
const FIXTURE_BOUNDARIES = new Set([
  'src/career/engine.js', 'src/career/world/index.js', 'src/career/sim/provider.js',
  'src/career/sim/commands.js',
]);
export function localModuleImports(source) {
  const staticImports = /\b(?:import|export)\s+(?:[^;'"`]*?\s+from\s*)?(['"])(\.[^'"\r\n]+)\1/g;
  const dynamicImports = /\bimport\s*\(\s*(['"])(\.[^'"\r\n]+)\1\s*\)/g;
  return [...new Set([...source.matchAll(staticImports), ...source.matchAll(dynamicImports)].map(m=>m[2]))];
}
export function copyFixtureModuleClosure(sourceRoot, root) {
  sourceRoot = path.resolve(sourceRoot);
  const pending = fs.readdirSync(path.join(sourceRoot,'server')).filter(n=>n.endsWith('.mjs')).map(n=>'server/'+n), seen = new Set();
  while (pending.length) {
    const relative=pending.pop();
    // Keep the real Provider exports / validators and traverse their imports;
    // fixtureProject changes only its P() world-reading seam.
    if (seen.has(relative) || (FIXTURE_BOUNDARIES.has(relative) && relative !== 'src/career/sim/provider.js')) continue;
    if (relative.startsWith('../') || path.isAbsolute(relative)) throw Error('fixture import escaped source root: '+relative);
    const source=path.join(sourceRoot,relative), target=path.join(root,relative);
    if (!fs.statSync(source).isFile()) throw Error('fixture import is not a file: '+relative);
    seen.add(relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target);
    if (!/\.(mjs|js)$/.test(relative)) continue;
    for (const spec of localModuleImports(fs.readFileSync(source,'utf8'))) pending.push(path.relative(sourceRoot,path.resolve(path.dirname(source),spec)).split(path.sep).join('/'));
  }
  return [...seen].sort();
}

export function fixtureProject(sourceRoot) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mrp-fixture-'));
  for (const dir of ['server', 'src/career/net', 'src/career/world', 'src/career/sim', 'src/career/data']) fs.mkdirSync(path.join(root, dir), { recursive: true });
  copyFixtureModuleClosure(sourceRoot, root);
  const providerPath = path.join(root, 'src/career/sim/provider.js');
  const provider = fs.readFileSync(providerPath, 'utf8');
  const seam = 'export function P() { return current; }';
  if (!provider.includes(seam)) throw Error('fixture Provider seam changed; update the explicit test adapter');
  fs.writeFileSync(providerPath, "import {currentFixtureWorld} from '../fixture.mjs';\n" + provider.replace(seam, 'export function P() { return Object.assign(Object.create(current), {world:currentFixtureWorld()}); }'));
  fs.writeFileSync(path.join(root, 'src/career/fixture.mjs'),fs.readFileSync(fileURLToPath(import.meta.url),'utf8').replace("from '../../src/career/world/supply_state.js'","from './world/supply_state.js'"));
  fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
  fs.writeFileSync(path.join(root, 'src/career/engine.js'), "export * from './fixture.mjs';\n");
  fs.writeFileSync(path.join(root, 'src/career/world/index.js'), "export * from '../fixture.mjs';\n");
  fs.writeFileSync(path.join(root, 'src/career/sim/commands.js'), "export const COMMANDS = {answer:1,refill:1,noop:1,throwNoop:1};\nexport function applyCommand() { throw Error('fixture uses applyNow; real automation commands are not part of this lifecycle fixture'); }\n");
  fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><title>联机契约测试</title>');
  return root;
}
