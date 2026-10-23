// 口碑与服务动态：每月按模型强弱、429 和榜单名次更新口碑和品牌；反代、酒馆流量和偷偷分流的证据怎么变。
import { clamp } from './util.js';
import { liveModel, myRank, peerCls } from './model.js';
import { qOf, rivalStandings } from './sota.js';

export function updateReputation(s, sv) {
  const m = liveModel(s);
  if (!m) return;
  const peers = rivalStandings(s, { cls: peerCls(s) }).slice(0, 5);
  const ref = peers.length ? peers.reduce((a, x) => a + x.q, 0) / peers.length : 0;
  const rel = peers.length ? clamp((qOf(s.mod, m.dims) - ref) / 4, -1.5, 1.5) : 0;
  s.rep = clamp(s.rep + 0.6 * rel - 15 * Math.max(0, sv.r429 - 0.02) + 0.12 * (60 - s.rep) / 6, 3, 98);
  s.brand *= 1 - 0.05 * sv.r429;
  let bonus = 0;
  for (const id of Object.keys(s.published)) {
    if (id.includes('@')) continue;
    const r = myRank(s, id);
    if (r?.rank === 1) bonus += 0.012; else if (r && r.rank <= 3) bonus += 0.005;
  }
  s.brand = clamp(s.brand * (1 + Math.min(0.05, bonus)) * 0.997, 0.02, 12);
}

export function serviceDynamics(s, sv) {
  const svc = s.service;
  if (s.mod === 'llm' && (s.products.chat.on || s.products.coding_plan?.on) && liveModel(s)) {
    const arb = s.products.coding_plan?.on ? 1.6 : 1;
    const pop = clamp(Math.log10(1 + ((sv.users || 0) + (sv.codingUsers || 0) * 20) / 1e5), 0, 3);
    const growth = 0.006 * arb * pop * (svc.integrations.mode === 'all' ? 1.5 : 1) * (svc.contentPolicy === 'lenient' ? 1.3 : 1);
    const damp = { none: 1, limit: 0.35, ban: 0.1, reseller: 0.6 }[svc.proxyPolicy];
    svc.proxy = clamp(svc.proxy + growth * damp - (svc.proxyPolicy === 'ban' ? 0.02 : 0), 0, 0.45);
  }
  if (s.mod === 'llm' && svc.tavernOn) {
    const target = svc.contentPolicy === 'lenient' ? 0.35 : svc.contentPolicy === 'strict' ? 0.02 : 0.12;
    svc.tavern += (target - svc.tavern) * 0.25;
  }
  if (svc.routing.endsWith('secret')) {
    svc.evidence += (6 + 8 * Math.log10(1 + (sv.users || 0) / 1e5)) * (s.risk.routing || 1) * (sv.r429 > 0 ? 1 : 0.6) * (svc.routing.startsWith('distill') ? 1.6 : 1);
  }
}
