// 图鉴「美术与授权」的全部鸣谢条目（规格 E10）。
// 来源只有四类：旧版署名、名册里的每位角色、硬件照片的 HW_CREDITS、docs/ART_CREDITS.txt。
// 名册的 credit 和 source_url 直接从 roster.js 生成，不手抄；docs/ART_CREDITS.txt 里的场景和事件背景在这里列成条目，
// 其中 event-*.png 的七张在 art-manifest.json 里没有记录，但图确实在 assets/backgrounds/ 里，所以只补条目、不碰图片文件。
// 每一条都有 who（作者）、what（做了什么）、license（授权说法）、url（可核对的来源；没有就是 null）。
import { CHARACTER_ROSTER } from './roster.js';
import { HW_CREDITS } from './hardware_gen.js';

// 鲸鱼娘系列按作者公告走 CC BY-NC-SA 4.0；其余角色在 ART_CREDITS.txt 里写的是“未检得统一再授权声明；本机个人体验”。
const WHALE_IDS = new Set(['deepseek', 'deepseek_pro', 'deepseek_harness']);
const WHALE_LICENSE = 'CC BY-NC-SA 4.0 · 上善无形原设 / ZipZipPipe 二创';
const ROSTER_LICENSE = '未检得统一再授权声明；本机个人体验';

// 旧版 src/ui/app.js:128-130 的署名（只迁文字，不带旧页面代码）。
const LEGACY = {
  id: 'legacy.whale',
  kind: 'legacy',
  who: 'ZipZipPipe；上善无形（原设）',
  what: '鲸鱼娘原设与二创立绘（旧版美术鸣谢，迁入图鉴）',
  license: 'CC BY-NC-SA 4.0（非商业、署名、相同方式共享）',
  url: 'https://b23.tv/3dNz55h',
};

// 名册每一项：who 和 url 取自名册的 credit / source_url；file 是这个角色在 art-manifest 里的文件前缀。
const ROSTER_CREDITS = CHARACTER_ROSTER.map(c => ({
  id: `char.${c.id}`,
  kind: 'character',
  who: c.credit,
  what: `角色立绘：${c.name} · ${c.label}`,
  license: WHALE_IDS.has(c.id) ? WHALE_LICENSE : ROSTER_LICENSE,
  url: c.source_url || null,
  file: `assets/characters/${c.id}-`,
}));

// docs/ART_CREDITS.txt 开头提到的原有场景，以及仓库里的界面设计图（art-manifest 里也有，各补一条）。
const OTHER_ART = [
  ['assets/backgrounds/sunlit-atelier.png', '阳光工作室（育成模式沿用并延续风格的原场景）'],
  ['docs/design-direction.png', '界面设计方向草图'],
].map(([file, label], i) => ({
  id: `art.other.${i}`,
  kind: 'background',
  who: 'Codex 内置 imagegen',
  what: `美术素材：${label}`,
  license: '游戏内自制；未另附开放许可',
  url: null,
  file,
}));

// docs/ART_CREDITS.txt「育成模式新增场景」四张。
const CAREER_BACKGROUNDS = [
  ['career-arena', '评测赛场'],
  ['career-camp', '夏季集训营'],
  ['career-outing', '外出'],
  ['career-gala', '年度模型大赏'],
].map(([name, label]) => ({
  id: `bg.${name}`,
  kind: 'background',
  who: 'Codex 内置 imagegen',
  what: `育成场景背景：${label}`,
  license: '游戏内自制；未另附开放许可',
  url: null,
  file: `assets/backgrounds/${name}.png`,
}));

// docs/ART_CREDITS.txt「事件背景」七张。art-manifest.json 里没有这七条，这里只补条目，不复制、不移动、不生成图片。
const EVENT_BACKGROUNDS = [
  ['event-court', '法庭（诉讼）'],
  ['event-exchange', '交易所与敲钟台（IPO、融资、股价）'],
  ['event-datacenter', 'AI 数据中心（算力、宕机、429、Agent 安全事故）'],
  ['event-launch', '发布会舞台（新模型发布、范式变化）'],
  ['event-lab-night', '深夜办公室（历史时刻、训练日常）'],
  ['event-port', '集装箱港口（出口管制）'],
  ['event-hearing', '听证会会议室（监管、立法）'],
].map(([name, label]) => ({
  id: `bg.${name}`,
  kind: 'event-background',
  who: 'Codex 内置 imagegen',
  what: `事件背景：${label}`,
  license: '游戏内自制；未另附开放许可',
  url: null,
  file: `assets/backgrounds/${name}.png`,
}));

// docs/ART_CREDITS.txt「硬件照片」九张，字段来自 hardware_gen.js 的 HW_CREDITS（Wikimedia Commons）。
const HARDWARE = Object.entries(HW_CREDITS).map(([id, c]) => ({
  id: `hw.${id}`,
  kind: 'hardware',
  who: c.author,
  what: `硬件照片：${c.title}`,
  license: c.license,
  url: c.source_url || null,
  license_url: c.license_url || null,
}));

export const CREDITS = [LEGACY, ...ROSTER_CREDITS, ...OTHER_ART, ...CAREER_BACKGROUNDS, ...EVENT_BACKGROUNDS, ...HARDWARE];
