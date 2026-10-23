#!/usr/bin/env node
// 联机浸泡（规格 F2 M3 行 ①④）：6 个无头客户端 + 2 家电脑，最快档打完 730 天；
// 报：重放哈希是否等于现场、单日耗时 p50 / p99（8 家）、2 档（2 秒一天）下每个客户端的下行流量。
//   node scripts/mp_soak.mjs [--days 730] [--humans 6] [--bots 2]
import fs from 'node:fs';
import path from 'node:path';
import { startServer, stopServer, api, Client, waitFor, replayHash, roomSettings, tmpDir, sleep } from '../tests/helpers/mp_server.mjs';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? Number(argv[i + 1]) : d; };
const DAYS = arg('--days', 730), HUMANS = arg('--humans', 6), BOTS = arg('--bots', 2);

const data = tmpDir();
const srv = await startServer({ data, args: ['--tick-ms', '0', '--max-rooms', '2'] });
const t0 = Date.now();
try {
  const r = await api(srv.base, '/api/rooms', { method: 'POST', body: { settings: roomSettings({ humans: HUMANS, bots: BOTS, days: DAYS }) } });
  if (r.status !== 200) throw new Error(r.text);
  const room = r.json.room;
  const clients = [new Client(srv.base, room, r.cookie)];
  for (let seat = 1; seat < r.json.seats; seat++) {
    const j = await api(srv.base, `/api/r/${room}/join`, { method: 'POST', body: { seat } });
    clients.push(new Client(srv.base, room, j.cookie));
  }
  for (const c of clients) await c.connect();
  await waitFor(() => clients.every(c => c.s));
  await clients[0].roomCmd('start');
  let seq = 1, done = false, pre = null;
  // 真人每隔一会儿下一条合法命令（调推理份额），制造命令日志。
  while (!done) {
    const st = (await api(srv.base, `/api/r/${room}/status`)).json;
    done = st.paused && st.started && st.day > st.end;
    if (done) break;
    // 终局会把每家的完整私有视图一次性公开给所有人（M.6.6），不算日常下行：记下终局前最后一次的字节数。
    if (!st.ended) pre = st;
    const c = clients[seq % clients.length];
    await c.cmd(seq, 'setInferShare', { v: [0.1, 0.2, 0.3][seq % 3] });
    seq++;
    await sleep(30);
  }
  const st = (await api(srv.base, `/api/r/${room}/status`)).json;
  const [day, h] = replayHash(path.join(data, room)).split(' ');
  const base = pre ?? st;
  const perDay = Object.values(base.bytes).map(b => b / Math.max(1, base.days));
  const reveal = Math.max(...Object.keys(st.bytes).map(k => st.bytes[k] - (base.bytes[k] || 0)));
  const kbps2 = perDay.map(b => b / 2 / 1024);
  console.log(`=== 联机浸泡：${HUMANS} 真人 + ${BOTS} 电脑，${st.days} 天，用时 ${((Date.now() - t0) / 1000).toFixed(1)} 秒`);
  console.log(`命令 ${seq - 1} 条；世界 ${st.day}；现场哈希 ${st.hash}；重放 ${day} ${h} → ${h === st.hash && day === st.day ? '一致' : '不一致！'}`);
  console.log(`单日耗时（日结 + 差分）：p50 ${st.p50?.toFixed(1)} 毫秒，p99 ${st.p99?.toFixed(1)} 毫秒（目标 p99 < 50）；其中日结 p99 ${st.tickP99?.toFixed(1)}、差分 p99 ${st.diffP99?.toFixed(1)}；快照最长 ${st.snapMax?.toFixed(1)} 毫秒`);
  console.log(`下行：每个客户端每天中位 ${(perDay.sort((a, b) => a - b)[Math.floor(perDay.length / 2)] / 1024).toFixed(2)} KB；2 档（2 秒一天）最大 ${Math.max(...kbps2).toFixed(2)} KB/s（目标 < 5，不含终局公开）；终局公开每人 ${(reveal / 1024).toFixed(0)} KB`);
  for (const c of clients) c.close();
  if (h !== st.hash || day !== st.day) process.exitCode = 1;
} finally {
  await stopServer(srv);
  fs.rmSync(data, { recursive: true, force: true });
}
