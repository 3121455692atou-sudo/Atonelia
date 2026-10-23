// 使用真实 HTTP/SSE 跑子进程；短期限只缩放业务计时，限流仍按现实秒计算。
import { spawn, execFileSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSse, applyDiff } from '../../src/career/net/protocol.js';
import { PROTOCOL_V } from '../../src/career/net/protocol.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mrp-mp-'));

export function startServer({ data, args = [], timeScale, root = ROOT }) {
  return new Promise((resolve, reject) => {
    const flags = ['server/mp.mjs', '--port', '0', '--host', '127.0.0.1', '--data', data];
    if (timeScale !== undefined) flags.push('--time-scale', String(timeScale));
    const proc = spawn(process.execPath, [...flags, ...args], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '', settled = false;
    const bad = e => { if (!settled) { settled = true; clearTimeout(timer); proc.kill('SIGKILL'); reject(e); } };
    const timer = setTimeout(() => bad(new Error(`服务器没起来：${out}${err}`)), 20000);
    proc.stdout.on('data', d => {
      out += d;
      const m = out.match(/http:\/\/([\d.]+):(\d+)\//);
      if (m && !settled) {
        settled = true; clearTimeout(timer);
        resolve({ proc, root, base: `http://${m[1]}:${m[2]}`, log: () => out + err });
      }
    });
    proc.stderr.on('data', d => { err += d; });
    proc.on('error', bad);
    proc.on('exit', code => { if (!settled) bad(new Error(`服务器退出 ${code}：${out}${err}`)); });
  });
}
export const stopServer = s => new Promise(resolve => {
  if (s.proc.exitCode !== null || s.proc.signalCode !== null) return resolve();
  const timer = setTimeout(() => s.proc.kill('SIGKILL'), 3000);
  s.proc.once('exit', () => { clearTimeout(timer); resolve(); });
  s.proc.kill('SIGTERM');
});

export async function api(base, p, { method = 'GET', body, cookie, raw } = {}) {
  const res = await fetch(base + p, {
    method, headers: { ...(cookie ? { cookie } : {}), ...(body !== undefined || raw !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* 静态文件没有 JSON */ }
  const sc = res.headers.get('set-cookie');
  return { status: res.status, json, text, cookie: sc ? sc.split(';')[0] : null };
}

export class Client {
  constructor(base, room, cookie) {
    Object.assign(this, { base, room, cookie, raw: '', events: [], s: null, pub: null, lastId: null, req: null, buf: '', closed: false });
  }
  connect(lastId = null) {
    this.closed = false; this.streamClosed = false; this.buf = '';
    return new Promise((resolve, reject) => {
      const u = new URL(`${this.base}/api/r/${this.room}/events`);
      const headers = { cookie: this.cookie, ...(lastId !== null ? { 'last-event-id': String(lastId) } : {}) };
      this.req = http.get({ hostname: u.hostname, port: u.port, path: u.pathname, headers }, res => {
        if (res.statusCode !== 200) { res.resume(); reject(new Error(`SSE ${res.statusCode}`)); return; }
        res.setEncoding('utf8');
        res.on('data', chunk => {
          this.raw += chunk; this.buf += chunk;
          const cut = this.buf.lastIndexOf('\n\n');
          if (cut < 0) return;
          const block = this.buf.slice(0, cut + 2); this.buf = this.buf.slice(cut + 2);
          for (const ev of parseSse(block)) this.take(ev);
        });
        res.on('error', () => {});
        res.on('close', () => { this.streamClosed = true; });
        resolve(this);
      });
      this.req.on('error', e => { if (!this.closed) reject(e); });
    });
  }
  take(ev) {
    this.events.push(ev);
    if (ev.id !== undefined) this.lastId = ev.id;
    if (ev.type === 'init') {
      this.s = ev.data.s; this.pub = ev.data.pub; this.seat = ev.data.seat; this.company = ev.data.company;
    } else if (ev.type === 'day') {
      this.s = applyDiff(this.s, ev.data.me); this.pub = applyDiff(this.pub, ev.data.pub); this.day = ev.data.next;
    } else if (ev.type === 'cmd') this.s = applyDiff(this.s, ev.data.me);
  }
  close() { this.closed = true; this.req?.destroy(); this.req = null; }
  cmd(seq, name, args = {}) {
    return api(this.base, `/api/r/${this.room}/cmd`, { method: 'POST', cookie: this.cookie, body: { v: PROTOCOL_V, seq, name, args } });
  }
  roomCmd(name, args = {}) {
    return api(this.base, `/api/r/${this.room}/room`, { method: 'POST', cookie: this.cookie, body: { name, args } });
  }
}

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function waitFor(fn, ms = 60000, step = 20) {
  const end = Date.now() + ms;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > end) throw new Error('等太久了');
    await sleep(step);
  }
}
export function replayHash(dir, { fromStart = true, root = ROOT } = {}) {
  const store = path.join(root, 'server/store.mjs');
  const code = `const {rebuild}=await import(${JSON.stringify(store)});const {world}=rebuild(${JSON.stringify(dir)},{fromStart:${fromStart}});console.log(world.day+' '+world.hash());`;
  return execFileSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' }).trim();
}
const NAMES = ['晨星', '北岭', '蓝鲸', '泰拉', '流光', '山巅', '青穹', '远望', '晨露', '青松', '白帆', '长桥'];
export const roomSettings = ({ humans = 6, bots = 2, days = 730, seed = 7 } = {}) => ({
  seed, start: '2024-01', days,
  companies: NAMES.slice(0, humans + bots).map((name, i) => ({
    name: `${name}智能`, brand: name, country: ['CN', 'US', 'EU'][i % 3], tier: 'specialist', kind: i < humans ? 'human' : 'bot', bot: 'normal',
  })),
});
