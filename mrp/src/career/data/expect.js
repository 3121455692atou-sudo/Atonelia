// 市场期待的奖惩表（规格 D11.5 的 EXPECT_FX）。值都是效果（走 applyEffects，ctx.source = 'release'）。
// 结构：{ [tier]: { [result]: Effects } }，tier 取 champion / challenger / small，result 取 over / meet / flat / under / under_half。
// 这里只写原始数值；“略低减半”和正面效果按新鲜度打折由 sim/expect.js 在结算前折算，负面效果不打折。
export const EXPECT_FX = {
  champion: {
    over: { brand: 1.06, rep: 2, valuation: 1.06, stockShock: { self: 0.06 } },
    meet: { brand: 1.02, rep: 1 },
    flat: {},
    under: { brand: 0.96, rep: -3, valuation: 0.93, stockShock: { self: -0.08 } },
  },
  challenger: {
    over: { brand: 1.10, rep: 3, valuation: 1.10, stockShock: { self: 0.06 } },
    meet: { rep: 1 },
    flat: {},
    under: { rep: -2, valuation: 0.96, stockShock: { self: -0.04 } },
  },
  small: {
    over: { brand: 1.12, rep: 4, valuation: 1.10 },
    meet: { rep: 0.5 },
    flat: {},
    under: { rep: -1 },
  },
};
