// 读档特性步骤的登记表（规格 E8）。顺序固定，P0.3a 一次登记全；各包只填自己的文件，不改这里。
// 每一步都要幂等；执行过的记在 s.mig[key] = true，以后读档不再跑。
import { run as sota } from './sota.js';
import { run as distill } from './distill.js';
import { run as route } from './route.js';
import { run as milestones } from './milestones.js';
import { run as naming } from './naming.js';
import { run as strategy } from './strategy.js';
import { run as jobs } from './jobs.js';

export const FEATURES = ['sota', 'distill', 'route', 'milestones', 'naming', 'strategy', 'jobs'];
export const FEATURE_STEPS = { sota, distill, route, milestones, naming, strategy, jobs };
