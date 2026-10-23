// 开源路线（规格 B1）：五档定义、每档的数值和开局路线表。纯数据，界面也直接读。
// 下标即 order：越往后越开放。
export const STANCES = ['closed', 'open_family', 'delayed', 'open_restricted', 'open'];
// 每档的界面名、旗舰开不开（flagshipOpen）、小模型和副线默认开不开（smallDefault）、旗舰开放时用什么许可（license）、
// delayed 档的旧代开放（reopen）、mods（apiBrand 进 modifier；overseas 是中国公司出海的系数，economy.js 直接读，再乘 modifier('overseasMult')）。
// closed 和 open 两端的 apiBrand、overseas 正好等于原来 economy.js 里按“开没开源”写死的常量，已有校准不漂移。
export const STANCE = {
  closed:          { label: '闭源',                   flagshipOpen: false, smallDefault: false, mods: { apiBrand: 1.00, overseas: 0.15 } },
  open_family:     { label: '旗舰闭源 · 小模型开源',   flagshipOpen: false, smallDefault: true,  mods: { apiBrand: 1.00, overseas: 0.20 } },
  delayed:         { label: '旧代开源',               flagshipOpen: false, smallDefault: true,  reopen: true, mods: { apiBrand: 0.95, overseas: 0.25 } },
  open_restricted: { label: '受限许可开源',           flagshipOpen: true,  license: 'restrictive', smallDefault: true, mods: { apiBrand: 0.88, overseas: 0.30 } },
  open:            { label: '完全开源（宽松许可）',    flagshipOpen: true,  license: 'permissive',  smallDefault: true, mods: { apiBrand: 0.80, overseas: 0.35 } },
};
export const LICENSES = { permissive: '宽松许可', restrictive: '受限许可' };
// 路线的界面写法：档名，delayed 档再带上旧代开放用的许可（其余各档的档名已经说清了许可）。
export const routeLabel = r => {
  const st = STANCE[r?.stance];
  if (!st) return '还没有路线';
  return r.stance === 'delayed' && LICENSES[r.license] ? `${st.label}（${LICENSES[r.license]}）` : st.label;
};

// 开局路线（规格 B6，公司 × 剧本）：等于开局当天在线旗舰（orgBest）所体现的路线，凡是有在线旗舰的格子，旗舰的开闭 = flagshipOpen。
// 写法照抄规格的表：“/P”宽松许可，“/R”受限许可；不写的取这一档自己的 license（没有就是 null）。
// 规格表里的“(→X)”是开局时已经播种、会转到 X 的本家路线节点（公司策略 P2.2 和各公司树负责），这里只记开局那一刻的路线：
//   grok y2024 (→delayed 2024-03-17)、qwen y2025 (→open_family 2025-01-28)、glm y2024 (→open_family 2024-01-16)、
//   minimax y2025 (→open_restricted 2025-01-15)、hunyuan y2025 (→open_family 2025-03-21)；deepseek y2025 的 ds_r1 会转到 open。
// mistral y2024 的在线旗舰是闭源的 Mistral Medium 原型（Mixtral 是开源小模型线），所以直接是 open_family。
export const START_SCENARIOS = ['y2023', 'y2024', 'y2025', 'y2026'];
const B6 = {
  gpt:        'closed closed closed open_family',
  claude:     'closed closed closed closed',
  fable:      'closed closed closed closed',
  image2:     'closed closed closed closed',
  gemini:     'closed closed open_family open_family',
  llama:      'open_restricted/R open_restricted/R open_restricted/R open_restricted/R',
  grok:       'closed closed delayed/P delayed/R',
  mistral:    'open/P open_family open_restricted/R open/P',
  deepseek:   'open_restricted/R open_restricted/R open_restricted/R open/P',
  qwen:       'closed open_restricted/R open_restricted/R open_family',
  kimi:       'closed closed closed open/P',
  glm:        'open_family open_restricted/R open_family open/P',
  minimax:    'closed closed closed open/P',
  hunyuan:    'closed closed open_restricted/R open_family',
  stepfun:    'closed closed closed open/P',
  seed:       'closed closed closed open_family',
  ernie:      'closed closed closed delayed/P',
  rwkv:       'open/P open/P open/P open/P',
  perplexity: 'closed closed closed open_family',
  novelai:    'closed closed closed closed',
  jev:        'closed closed closed closed',
  midjourney: 'closed closed closed closed',
  suno:       'closed closed closed closed',
  elevenlabs: 'closed closed closed closed',
};
const LIC_CODE = { P: 'permissive', R: 'restrictive' };
// 一格的写法 'open/P' → { stance: 'open', license: 'permissive' }。
export function parseStance(cell) {
  const [stance, code] = String(cell).split('/');
  if (!STANCE[stance]) throw new Error(`没有这一档路线：${cell}`);
  if (code !== undefined && !LIC_CODE[code]) throw new Error(`不认识的许可写法：${cell}`);
  return { stance, license: code ? LIC_CODE[code] : STANCE[stance].license ?? null };
}
// START_STANCE[charId][scenario] → { stance, license }。
export const START_STANCE = Object.fromEntries(Object.entries(B6).map(([id, row]) => {
  const cells = row.split(/\s+/);
  if (cells.length !== START_SCENARIOS.length) throw new Error(`开局路线表 ${id} 这一行不是 ${START_SCENARIOS.length} 格`);
  return [id, Object.fromEntries(cells.map((x, i) => [START_SCENARIOS[i], parseStance(x)]))];
}));
