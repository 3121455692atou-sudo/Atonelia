// 典型公司（静态夹具用 2025 年中的量级；KREF = 当年前沿开局积累）。gpu = 可用于训练的 H100 当量。
const KR = y => 192 + 36 * (y - 2025);
const grow = (a, b) => y => a * Math.pow(b / a, Math.max(0, Math.min(1.5, y - 2025)));
export const ARCH = {
  maker_player:   { label: '前沿·炼出过·玩家全力', reserve: 'maker', gpu: grow(50000, 110000), ownData: 2.2, know: y => 1.15 * KR(y), lead: 1, capOff: 12, compNeed: 1.44, cadence: 60 },
  maker_bot:      { label: '前沿·炼出过·机器人', reserve: 'maker', gpu: grow(35000, 80000), ownData: 1.7, know: y => 1.05 * KR(y), lead: 0, capOff: 12, compNeed: 1.44, bot: true },
  kin_player:     { label: '前沿·同集团出过（○）·玩家全力', reserve: 'kin', gpu: grow(50000, 110000), ownData: 2.2, know: y => 1.15 * KR(y), lead: 1, capOff: 12, compNeed: 1.44, cadence: 60 },
  maker_bot_lo:   { label: '前沿·炼出过·机器人（A≈0.6）', reserve: 'maker', gpu: grow(35000, 80000), ownData: 1.13, know: y => 1.05 * KR(y), lead: 0, capOff: 12, compNeed: 1.44, bot: true },
  maker_bot_top:  { label: '前沿·炼出过·机器人（补数据到 2 档，A≈1.06）', reserve: 'maker', gpu: grow(35000, 80000), ownData: 2.0, know: y => 1.05 * KR(y), lead: 0, capOff: 12, compNeed: 1.44, bot: true },
  rookie_player:  { label: '前沿·没炼出过·玩家全力', reserve: 'rookie', gpu: grow(50000, 110000), ownData: 2.2, know: y => 1.15 * KR(y), lead: 1, capOff: 12, compNeed: 1.44, cadence: 60 },
  rookie_bot:     { label: '前沿·没炼出过·机器人', reserve: 'rookie', gpu: grow(35000, 80000), ownData: 1.7, know: y => 1.05 * KR(y), lead: 0, capOff: 12, compNeed: 1.44, bot: true },
  chaser_player:  { label: '追赶者·没炼出过·玩家全力', reserve: 'rookie', gpu: grow(20000, 40000), ownData: 2.5, know: y => 1.1 * KR(y), lead: 1.5, capOff: 12, compNeed: 1.2, cadence: 60 },
  chaser_bot:     { label: '追赶者·没炼出过·机器人', reserve: 'rookie', gpu: grow(6000, 12000), ownData: 1.3, know: y => 0.65 * KR(y), lead: 0, capOff: 12, compNeed: 1, bot: true },
  small_player:   { label: '小公司·玩家全力（假设有大底座）', reserve: 'rookie', gpu: grow(3000, 6000), ownData: 2.5, know: y => 0.8 * KR(y), lead: 1, capOff: 12, compNeed: 0.8, cadence: 60 },
  small_bot:      { label: '小公司·机器人（假设有大底座）', reserve: 'rookie', gpu: grow(400, 800), ownData: 1.0, know: y => 0.45 * KR(y), lead: 0, capOff: 12, compNeed: 0.6, bot: true },
  small_real:     { label: '小公司·玩家全力（真实底座）', reserve: 'rookie', gpu: grow(3000, 6000), ownData: 2.5, know: y => 0.8 * KR(y), lead: 1, capOff: -7, compNeed: 0.8, cadence: 60 },
};
