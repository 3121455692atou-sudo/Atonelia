// 读档特性步骤「route」（规格 E8、B7）：只在结构版本到 4 以后执行（见 migrate.js）。要求幂等：同一份存档跑两遍结果相同。
//   1. 默认取开局路线表 START_STANCE[charId][scenario]；
//   2. 旧档里公司选过“开源权重”（旧的公司字段 open 为真，例如在“要不要开源权重”里选了开源），表值又是 closed、open_family、delayed 三档之一的，改成完全开源（宽松许可）；
//   3. 否则，旧档选过“开源小尺寸，旗舰保持闭源”（flags.smallOpen）而表值是 closed 的，改成 open_family；
//   4. 经 setStance(…, { src: 'migration' }) 写入，然后删掉旧的公司字段 open（连同 COMPANIES 里一起删掉的 line、sibling）和 flags.smallOpen；
//   5. 已发布模型上的 open 原样保留（那是事实）；在练模型和项目上的 open 删掉，改为发布时按路线决定。
//      旧档的开源模型没有许可信息，照开局的办法补上（route.js 的 stampLicenses：史实型号按真实许可标签，其余按路线的许可），
//      这样 API 收入、OpenRouter、许可之争和新开的同一局一样看在线旗舰的许可（B3）。只补缺的，不改已有的。
// 另外：旧档里还没回答的“要不要开源权重”抉择（open_question）丢掉——路线只能由公司策略改（B4、E5），这个抉择已经没有可改的东西了。
// 已经有路线的存档（迁移跑过一遍、或者开发期的新存档）不重写路线，只做清理和补许可，所以跑两遍结果相同。
// P0.3a 到 P1.3 之间新开的存档记了 mig.route 却没有路线，读档不再跑这一步，由 route.js 的 ensureRoute 在推进第一天时调用它补上。
import { STANCE, START_STANCE, LICENSES } from '../../data/routes.js';
import { setStance, stampLicenses } from '../route.js';

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const OPENABLE = ['closed', 'open_family', 'delayed'];

export function run(s) {
  const co = isObj(s.company) ? s.company : {};
  if (!STANCE[s.route?.stance]) {
    let { stance, license } = START_STANCE[s.charId]?.[s.scenario] ?? { stance: 'closed', license: null };
    if (co.open === true && OPENABLE.includes(stance)) ({ stance, license } = { stance: 'open', license: 'permissive' });
    else if (s.flags?.smallOpen && stance === 'closed') ({ stance, license } = { stance: 'open_family', license: null });
    setStance(s, stance, { src: 'migration', license });
  }
  for (const k of ['open', 'line', 'sibling']) delete co[k];
  if (isObj(s.flags)) delete s.flags.smallOpen;
  for (const m of Array.isArray(s.models) ? s.models : []) if (isObj(m) && m.stage !== 'released') delete m.open;
  // 补许可。m.sota 挪到许可后面：新开的局里许可在开局或发布时就写上，m.sota 是拿到标签以后才写，键的顺序和它一样；
  // sota 特性步骤（排在本步之前）再跑一遍会删掉重写 m.sota，这样它也还是一字不差。
  if (Array.isArray(s.models)) {
    const bare = s.models.filter(m => isObj(m) && m.stage === 'released' && m.open && !LICENSES[m.license]);
    stampLicenses(s);
    for (const m of bare) if ('sota' in m) { const x = m.sota; delete m.sota; m.sota = x; }
  }
  // 项目上的 open：P2.4a 以前在 s.project（只读自己的数据属性，读档以后它是会报错的取值器），以后在底座类作业的 pj 上。
  const pjs = [Object.getOwnPropertyDescriptor(s, 'project')?.value, ...(Array.isArray(s.jobs?.list) ? s.jobs.list.map(j => j?.pj) : [])];
  for (const pj of pjs) if (isObj(pj)) { delete pj.open; if (isObj(pj.cfg)) delete pj.cfg.open; }
  const stale = q => isObj(q) && (q.kind ?? 'event') === 'event' && q.id === 'open_question';
  if (Array.isArray(s.queue)) s.queue = s.queue.filter(q => !stale(q));
  if (Array.isArray(s.scheduled)) s.scheduled = s.scheduled.filter(x => !stale(x?.item));
}
