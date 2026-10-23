// 读档特性步骤「naming」（规格 E8、C5、C6，P2.1）：只在结构版本到 4 以后执行（见 migrate.js）。要求幂等：同一份存档跑两遍结果相同。
//   1. 清掉开局留下的孤儿 work 副本（开局同时有在线型号和下一代时复制出来、马上被下一代顶掉的 `<id>w`；v3 档在 v3→v4 结构步骤里已经清过，
//      这里管的是开发期新开的 v4 存档）；
//   2. 没发布的模型（在练的旗舰、待发布的小模型）没有名字：name = null。原名去掉“（训练中）”转成代号 draftName——
//      原名就是真实型号名的（开局继承的下一代、从在线旗舰复制出来接着练的那份）不转，真实型号名记进 m.hint = { realName, hn }，不剧透；
//   3. 删掉旧命名机制的字段：s.verNext、m.ver、m.realName、命名用的 m.lineage 字符串（续训谱系 { kind: 'finetune' } 是另一回事，留着）、
//      m.minor（在练模型发布过几次改记 m.releases，快照 id 照旧按它往下编）；
//   4. 按名字反查 modelId：已公布成绩 s.published 和各模型自己的成绩、里程碑账本 s.ms、灰度 s.deploy、名人堂（结算 s.result）。
// 开发期存档（mig.naming 已记、却还是旧命名的）由 naming.js 的 ensureNaming 在推进第一天时调用这一步补上。
import { RELEASES } from '../../data/rivals.js';
import { hnFor } from '../naming.js';

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const TRAINING = /（训练中）/g;

export function run(s) {
  if (!Array.isArray(s.models)) return;
  // 1) 孤儿 work 副本。
  const used = new Set([s.working, s.smallWorking, s.live, s.smallLive].filter(x => typeof x === 'string'));
  s.models = s.models.filter(m => !(isObj(m) && typeof m.id === 'string' && m.id.endsWith('w') && m.stage !== 'released' && !used.has(m.id)));
  const realNames = new Set(RELEASES.map(r => r.name));
  for (const m of s.models) {
    if (!isObj(m)) continue;
    const real = typeof m.realName === 'string' ? m.realName : null;
    // 2) 没发布的模型。
    if (m.stage !== 'released') {
      const old = typeof m.name === 'string' ? m.name.replace(TRAINING, '').trim() : '';
      const lineage = typeof m.lineage === 'string' ? m.lineage.replace(/（.*?）/g, '').trim() : null;
      if (old && !m.draftName && old !== real && old !== lineage && !realNames.has(old)) m.draftName = old;
      m.name = null;
      if (real && !isObj(m.hint)) m.hint = { realName: real, hn: hnFor(s, real) };
      if (Number(m.minor) > 0) m.releases = Math.max(Number(m.releases) || 0, Number(m.minor));
    } else if (typeof m.name === 'string' && m.name.includes('（训练中）')) {
      m.name = m.name.replace(TRAINING, '').trim();
    }
    // 3) 旧命名字段。
    delete m.realName;
    delete m.ver;
    delete m.minor;
    if (typeof m.lineage === 'string') delete m.lineage;
  }
  delete s.verNext;
  // 4) 按名字反查 modelId（同名的取最后发布的那款；名字不在模型表里的留着不动）。
  const released = s.models.filter(m => isObj(m) && m.stage === 'released' && typeof m.name === 'string');
  const idOf = (name, role) => released.filter(m => m.name === name && (!role || (m.role || 'flagship') === role)).at(-1)?.id ?? null;
  for (const run of Object.values(isObj(s.published) ? s.published : {})) {
    if (isObj(run) && !run.modelId && typeof run.model === 'string') { const id = idOf(run.model, run.role || 'flagship'); if (id) run.modelId = id; }
  }
  for (const m of released) {
    for (const run of Object.values(isObj(m.benchmarks) ? m.benchmarks : {})) if (isObj(run) && !run.modelId && run.model === m.name) run.modelId = m.id;
  }
  for (const e of Object.values(isObj(s.ms) ? s.ms : {})) {
    if (isObj(e) && e.who === 'me' && !e.modelId && typeof e.model === 'string') { const id = idOf(e.model); if (id) e.modelId = id; }
  }
  if (Array.isArray(s.deploy)) {
    for (const d of s.deploy) if (isObj(d) && !d.id && typeof d.name === 'string') { const id = idOf(d.name); if (id) d.id = id; }
    s.deploy = s.deploy.filter(d => !isObj(d) || typeof d.id === 'string');
  }
  if (isObj(s.result) && s.result.modelId === undefined) s.result.modelId = typeof s.result.model === 'string' ? idOf(s.result.model) : null;
}
