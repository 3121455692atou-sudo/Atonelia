import { settleServiceTurn } from './service_economy.js';
import { SERVICE_QUARTER_TURNS } from '../data/catalog_business.js';
/**
 * company_and_world_engine.js
 * 「模型育成计划：下一版」v0.1.0
 *
 * Company & World Engine — implements design doc sections 12–24 and the
 * shared formulas of 25.4, strictly aligned with 变量字典.md.
 *
 * Design invariants enforced here:
 *  - `world.locked_crash_turn` is derived ONLY from `state.campaign_seed`
 *    (never from display names), so renaming anything is always safe.
 *  - Crash-phase demand values are ALWAYS recomputed from the structural
 *    baseline values, never compounded from the previous phase.
 *  - `milestones.agi_achieved` / `asi_achieved` / `rsi_achieved` require
 *    measured evidence. Story flags such as `claimed_agi` NEVER grant them.
 *  - R&D / legal spend is paid at action time (deducted from cash immediately
 *    and accumulated into `quarter_paid_*`), so the quarter cash bridge never
 *    charges it twice.
 *
 * NOTE on cash-bridge accounting:
 *  - `cash_delta_from_close_kc` covers everything settled *at close*
 *    (revenue, cash COGS, payroll, overhead, interest, tax).
 *  - `end_to_end_cash_delta_kc` additionally subtracts `paid_rnd_kc` and
 *    `paid_legal_kc`, giving the true total cash movement of the quarter.
 */

const ENGINE_VERSION = 'v0.1.0';

/** Corporate tax rate applied to positive pre-tax income. */
const TAX_RATE = 0.15;
/** Underwriting fee applied to gross IPO proceeds. */
const IPO_FEE_RATE = 0.03;

const STARTING_CASH_KC = 1000;
const STARTING_SHARES = 1000000;
const STARTING_FOUNDER_SHARES = 1000000;
const STARTING_PAYROLL_KC = 80;
const STARTING_OVERHEAD_KC = 30;
const DEFAULT_PRE_MONEY_KC = 10000;

/** Number of in-game turns that make up one fiscal quarter. */
const DEFAULT_TURNS_PER_QUARTER = SERVICE_QUARTER_TURNS;

/* ------------------------------------------------------------------ *
 * Numeric helpers
 * ------------------------------------------------------------------ */

function num(value, fallback = 0) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function pickNum(...values) {
  for (const v of values) {
    if (v === null || v === undefined) continue;
    const n = typeof v === 'number' ? v : Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function r4(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const rounded = Number(n.toFixed(4));
  return rounded === 0 ? 0 : rounded;
}

function clamp(value, lo, hi) {
  const n = num(value, lo);
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

function clamp01(value) {
  return clamp(value, 0, 1);
}

/* ------------------------------------------------------------------ *
 * Deterministic RNG (seed -> stable pseudo random stream)
 * ------------------------------------------------------------------ */

function hashSeed(seed) {
  const s = String(seed);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededRng(...parts) {
  return mulberry32(hashSeed(parts.join('::')));
}

/* ------------------------------------------------------------------ *
 * State normalisers
 * ------------------------------------------------------------------ */

function ensureCompany(state) {
  if (!state) throw new TypeError('closeQuarter/公司引擎：state 不能为空');
  if (!state.company || typeof state.company !== 'object') state.company = {};
  const c = state.company;

  if (!Number.isFinite(c.cash_kc)) c.cash_kc = STARTING_CASH_KC;
  if (!Number.isFinite(c.shares_outstanding)) c.shares_outstanding = STARTING_SHARES;
  if (!Number.isFinite(c.founder_shares)) c.founder_shares = STARTING_FOUNDER_SHARES;
  if (!Number.isFinite(c.payroll_kc_per_quarter)) c.payroll_kc_per_quarter = STARTING_PAYROLL_KC;
  if (!Number.isFinite(c.overhead_kc_per_quarter)) c.overhead_kc_per_quarter = STARTING_OVERHEAD_KC;
  if (!Number.isFinite(c.quarter_paid_rnd_kc)) c.quarter_paid_rnd_kc = 0;
  if (!Number.isFinite(c.quarter_paid_legal_kc)) c.quarter_paid_legal_kc = 0;
  if (!Number.isFinite(c.quarter_depreciation_kc)) c.quarter_depreciation_kc = 0;
  if (!Number.isFinite(c.quarter_interest_kc)) c.quarter_interest_kc = 0;
  if (!Number.isFinite(c.last_pre_money_kc)) c.last_pre_money_kc = DEFAULT_PRE_MONEY_KC;
  if (!Number.isFinite(c.reputation)) c.reputation = 50;
  if (!Number.isFinite(c.legal_risk)) c.legal_risk = 0;
  if (!Number.isFinite(c.board_confidence)) c.board_confidence = 60;
  if (!Number.isFinite(c.research_morale)) c.research_morale = 60;
  if (!Number.isFinite(c.public_trust)) c.public_trust = 50;
  if (!Number.isFinite(c.quarter_index)) c.quarter_index = 0;
  if (c.is_operating === undefined) c.is_operating = true;
  if (c.is_public === undefined) c.is_public = false;
  if (!Array.isArray(c.quarter_history)) c.quarter_history = [];
  if (!Array.isArray(c.financing_history)) c.financing_history = [];
  return c;
}

function ensureWorld(state) {
  if (!state.world || typeof state.world !== 'object') state.world = {};
  const w = state.world;

  if (!Number.isFinite(w.structural_consumer_demand)) w.structural_consumer_demand = 1.0;
  if (!Number.isFinite(w.structural_enterprise_demand)) w.structural_enterprise_demand = 1.0;
  if (!Number.isFinite(w.structural_public_demand)) w.structural_public_demand = 1.0;

  if (!Number.isFinite(w.consumer_demand)) w.consumer_demand = w.structural_consumer_demand;
  if (!Number.isFinite(w.enterprise_demand)) w.enterprise_demand = w.structural_enterprise_demand;
  if (!Number.isFinite(w.public_demand)) w.public_demand = w.structural_public_demand;

  if (!Number.isFinite(w.valuation_multiplier)) w.valuation_multiplier = 1.0;
  if (!Number.isFinite(w.funding_multiplier)) w.funding_multiplier = 1.0;
  if (!Number.isFinite(w.spot_gpu_price_index)) w.spot_gpu_price_index = 1.0;
  if (typeof w.bubble_phase !== 'string') w.bubble_phase = 'expansion';
  if (!Number.isFinite(w.bubble_warning_count)) w.bubble_warning_count = 0;
  return w;
}

function ensureMilestones(state) {
  if (!state.milestones || typeof state.milestones !== 'object') state.milestones = {};
  return state.milestones;
}

function ensureStory(state) {
  if (!state.story || typeof state.story !== 'object') state.story = {};
  const s = state.story;
  if (!Array.isArray(s.flags)) {
    const arr = [];
    if (s.flags && typeof s.flags === 'object') {
      for (const [k, v] of Object.entries(s.flags)) {
        arr[k] = v;
        if (v) arr.push(k);
      }
    }
    s.flags = arr;
  } else {
    for (const k of s.flags) {
      if (s.flags[k] === undefined) s.flags[k] = true;
    }
  }
  if (!Array.isArray(s.history)) s.history = [];
  if (!Array.isArray(s.pending_events)) s.pending_events = [];
  if (!Number.isFinite(s.resolved_events)) s.resolved_events = 0;
  return s;
}

function hasStoryFlag(story, flag) {
  if (!story || !story.flags) return false;
  const f = story.flags;
  if (Array.isArray(f) && f.includes(flag)) return true;
  if (typeof f === 'object') {
    const v = f[flag];
    return v === true || v === 'true' || v === 1;
  }
  return false;
}

function ensureLegal(state) {
  if (!state.legal || typeof state.legal !== 'object') state.legal = {};
  const l = state.legal;
  if (!Array.isArray(l.cases)) l.cases = [];
  if (!Array.isArray(l.history)) l.history = [];
  if (!Number.isFinite(l.case_serial)) l.case_serial = 0;
  return l;
}

function ensureRsi(state) {
  if (!state.rsi || typeof state.rsi !== 'object') state.rsi = {};
  const r = state.rsi;
  if (!Number.isFinite(r.total_cycles)) r.total_cycles = 0;
  if (!Number.isFinite(r.verified_cycles)) r.verified_cycles = 0;
  if (!Number.isFinite(r.cash_cost_kc_per_cycle)) r.cash_cost_kc_per_cycle = 250;
  if (!Number.isFinite(r.compute_cost_units_per_cycle)) r.compute_cost_units_per_cycle = 10;
  if (!Number.isFinite(r.self_research_contribution)) r.self_research_contribution = 0;
  if (!Number.isFinite(r.external_gain_three_cycles)) r.external_gain_three_cycles = 0;
  if (!Number.isFinite(r.net_compute_return)) r.net_compute_return = 0;
  if (!Array.isArray(r.history)) r.history = [];
  if (!Array.isArray(r.external_gains)) r.external_gains = [];
  if (!Array.isArray(r.contributions)) r.contributions = [];
  if (!Array.isArray(r.compute_returns)) r.compute_returns = [];
  return r;
}

function ensureMarket(state) {
  if (!state.market || typeof state.market !== 'object') state.market = {};
  const m = state.market;
  if (!Array.isArray(m.securities)) m.securities = [];
  if (!Array.isArray(m.trade_log)) m.trade_log = [];
  return m;
}

/* ------------------------------------------------------------------ *
 * 20 Sectors (Section 20)
 * ------------------------------------------------------------------ */

const SECTOR_DEFS = [
  { id: 'software_engineering', name: '软件工程', demand_type: 'enterprise' },
  { id: 'customer_support', name: '客户支持', demand_type: 'enterprise' },
  { id: 'legal_services', name: '法律服务', demand_type: 'enterprise' },
  { id: 'healthcare_admin', name: '医疗行政', demand_type: 'public' },
  { id: 'education', name: '教育', demand_type: 'consumer' },
  { id: 'finance_backoffice', name: '金融后台', demand_type: 'enterprise' },
  { id: 'manufacturing_qc', name: '制造质检', demand_type: 'enterprise' },
  { id: 'logistics', name: '物流', demand_type: 'enterprise' },
  { id: 'retail_commerce', name: '零售电商', demand_type: 'consumer' },
  { id: 'media_creation', name: '内容创作', demand_type: 'consumer' },
  { id: 'scientific_research', name: '科学研究', demand_type: 'public' },
  { id: 'government_services', name: '政务服务', demand_type: 'public' },
  { id: 'agriculture', name: '农业', demand_type: 'enterprise' },
  { id: 'energy_grid', name: '能源电网', demand_type: 'public' },
  { id: 'construction', name: '建筑', demand_type: 'enterprise' },
  { id: 'transportation', name: '交通运输', demand_type: 'consumer' },
  { id: 'telecom', name: '电信', demand_type: 'enterprise' },
  { id: 'insurance', name: '保险', demand_type: 'enterprise' },
  { id: 'pharma_rnd', name: '制药研发', demand_type: 'enterprise' },
  { id: 'defense', name: '国防', demand_type: 'public' },
];

function ensureSectors(state) {
  if (!Array.isArray(state.sectors) || state.sectors.length === 0) {
    if (state.sectors && typeof state.sectors === 'object' && !Array.isArray(state.sectors) && Object.keys(state.sectors).length > 0) {
      state.sectors = Object.values(state.sectors);
    } else {
      state.sectors = SECTOR_DEFS.map((def) => ({
        sector_id: def.id,
        id: def.id,
        name: def.name,
        demand_type: def.demand_type,
        capability_coverage: 0,
        deployment_share: 0,
        productivity_gain: 0,
        displacement_pressure: 0,
        new_role_offset: 0,
        net_employment_change: 0,
        penetration: 0.01,
        ai_adoption: 0,
        momentum: 0,
      }));
    }
  }
  return state.sectors;
}

/* ------------------------------------------------------------------ *
 * Product revenue model shared by `closeQuarter` and the metrics API
 * ------------------------------------------------------------------ */

function computeProductRevenue(products) {
  let revenue_kc = 0;
  let cash_cogs_kc = 0;
  let served_units = 0;

  if (!Array.isArray(products)) return { revenue_kc, cash_cogs_kc, served_units };

  for (const p of products) {
    if (!p || typeof p !== 'object') continue;
    if (p.billing_engine === 'serving_v1') continue;
    if (p.suspended === true) continue;
    if (p.active === false) continue;

    const demand_units = num(p.demand_units, 0);
    const market_demand = num(p.market_demand, 1);
    const retention = num(p.retention, 1);
    const quality_fit = num(p.quality_fit, 1);

    const potential_orders = demand_units * market_demand * retention * quality_fit;
    const capacity = num(p.service_capacity_units, potential_orders);
    const served_orders = Math.max(0, Math.min(potential_orders, capacity));

    const price = num(p.price_kc_per_unit, 0);
    const variable_cost = num(p.variable_cost_kc_per_unit, 0);

    revenue_kc += served_orders * price;
    cash_cogs_kc += served_orders * variable_cost;
    served_units += served_orders;

    p.potential_orders = r4(potential_orders);
    p.served_orders = r4(served_orders);
    p.last_revenue_kc = r4(served_orders * price);
    p.last_gross_margin_kc = r4(served_orders * (price - variable_cost));
  }

  return { revenue_kc, cash_cogs_kc, served_units };
}

/* ------------------------------------------------------------------ *
 * 1. Quarter Cash Bridge (Section 16.2 / 25.4)
 * ------------------------------------------------------------------ */

export function closeQuarter(state, overrides = {}) {
  const company = ensureCompany(state);
  const world = ensureWorld(state);
  const ov = (overrides && typeof overrides === 'object') ? overrides : {};
  if (company.last_close_turn === world.turn_index && company.quarter_history.length) return { ...company.quarter_history.at(-1), already_closed: true };
  const products = Array.isArray(state.products) ? state.products : [];

  /* ---- revenue & cash COGS ---- */
  let revenue_kc;
  let cash_cogs_kc;
  let served_units = 0;

  const revenueOverride = pickNum(ov.revenue_kc);
  if (revenueOverride !== null) {
    revenue_kc = revenueOverride;
    const cogsOverride = pickNum(ov.cash_cogs_kc);
    cash_cogs_kc = cogsOverride === null ? 0 : cogsOverride;
  } else {
    const computed = computeProductRevenue(products);
    revenue_kc = computed.revenue_kc;
    cash_cogs_kc = computed.cash_cogs_kc;
    served_units = computed.served_units;
    const cogsOverride = pickNum(ov.cash_cogs_kc);
    if (cogsOverride !== null) cash_cogs_kc = cogsOverride;
  }

  const serving_revenue_kc = num(company.quarter_serving_revenue_kc, 0);
  const serving_cogs_kc = num(company.quarter_serving_cogs_kc, 0);
  const prepaid_serving_margin_kc = serving_revenue_kc - serving_cogs_kc;
  revenue_kc += serving_revenue_kc;
  cash_cogs_kc += serving_cogs_kc;

  /* ---- payroll & overhead ---- */
  let payroll_kc;
  let overhead_kc;
  const opexOverride = pickNum(ov.opex_kc);
  const payrollOverride = pickNum(ov.payroll_kc);
  const overheadOverride = pickNum(ov.overhead_kc);

  if (opexOverride !== null && payrollOverride === null) {
    payroll_kc = opexOverride;
    overhead_kc = overheadOverride === null ? 0 : overheadOverride;
  } else {
    payroll_kc = payrollOverride === null ? num(company.payroll_kc_per_quarter, STARTING_PAYROLL_KC) : payrollOverride;
    overhead_kc = overheadOverride === null ? num(company.overhead_kc_per_quarter, STARTING_OVERHEAD_KC) : overheadOverride;
  }

  /* ---- R&D / legal spend ---- */
  // When the value comes from `company.quarter_paid_*` it was already taken out
  // of cash at action time. When it is injected directly through `overrides`,
  // we deduct it exactly once here unless it is explicitly marked prepaid.
  const rndOverride = pickNum(ov.paid_rnd_kc);
  let paid_rnd_kc;
  let rndNeedsDeduction;
  if (rndOverride !== null) {
    paid_rnd_kc = rndOverride;
    rndNeedsDeduction = ov.paid_rnd_kc_prepaid !== true;
  } else {
    paid_rnd_kc = num(company.quarter_paid_rnd_kc, 0);
    rndNeedsDeduction = false;
  }

  const legalOverride = pickNum(ov.paid_legal_kc);
  let paid_legal_kc;
  let legalNeedsDeduction;
  if (legalOverride !== null) {
    paid_legal_kc = legalOverride;
    legalNeedsDeduction = ov.paid_legal_kc_prepaid !== true;
  } else {
    paid_legal_kc = num(company.quarter_paid_legal_kc, 0);
    legalNeedsDeduction = false;
  }

  /* ---- non cash / financing costs ---- */
  const depreciationOverride = pickNum(ov.depreciation_kc);
  const depreciation_kc = depreciationOverride === null
    ? num(company.quarter_depreciation_kc, 0)
    : depreciationOverride;

  const interestOverride = pickNum(ov.interest_kc);
  const interest_kc = interestOverride === null
    ? num(company.quarter_interest_kc, 0)
    : interestOverride;

  /* ---- P&L ---- */
  const pretax = revenue_kc
    - cash_cogs_kc
    - paid_rnd_kc
    - paid_legal_kc
    - payroll_kc
    - overhead_kc
    - depreciation_kc
    - interest_kc;

  const tax_kc = r4(Math.max(0, pretax) * TAX_RATE);
  const net_income_kc = r4(pretax - tax_kc);

  /* ---- cash movements ---- */
  const cash_delta_from_close_kc = r4(
    revenue_kc - cash_cogs_kc - prepaid_serving_margin_kc - payroll_kc - overhead_kc - interest_kc - tax_kc,
  );
  const end_to_end_cash_delta_kc = r4(cash_delta_from_close_kc + prepaid_serving_margin_kc - paid_rnd_kc - paid_legal_kc);

  company.cash_kc = r4(num(company.cash_kc, 0) + cash_delta_from_close_kc);
  if (rndNeedsDeduction) company.cash_kc = r4(company.cash_kc - paid_rnd_kc);
  if (legalNeedsDeduction) company.cash_kc = r4(company.cash_kc - paid_legal_kc);

  company.quarter_index = num(company.quarter_index, 0) + 1;

  const record = {
    type: 'quarter_close',
    serving_revenue_kc: r4(serving_revenue_kc), serving_cogs_kc: r4(serving_cogs_kc),
    prepaid_serving_margin_kc: r4(prepaid_serving_margin_kc), serving_turns: num(company.quarter_serving_turns),
    quarter_index: company.quarter_index,
    turn: num(state.turn, 1),
    season: num(state.season, 1),
    bubble_phase: world.bubble_phase ?? 'expansion',

    served_units: r4(served_units),
    revenue_kc: r4(revenue_kc),
    cash_cogs_kc: r4(cash_cogs_kc),
    gross_profit_kc: r4(revenue_kc - cash_cogs_kc),

    paid_rnd_kc: r4(paid_rnd_kc),
    paid_legal_kc: r4(paid_legal_kc),
    payroll_kc: r4(payroll_kc),
    overhead_kc: r4(overhead_kc),
    depreciation_kc: r4(depreciation_kc),
    interest_kc: r4(interest_kc),

    pretax_kc: r4(pretax),
    tax_kc,
    net_income_kc,

    cash_delta_from_close_kc,
    end_to_end_cash_delta_kc,
    cash_after_kc: company.cash_kc,
  };

  // R&D / legal spend is settled at action time — reset the accumulators.
  company.quarter_paid_rnd_kc = 0;
  company.quarter_paid_legal_kc = 0;
  company.quarter_serving_revenue_kc = 0; company.quarter_serving_cogs_kc = 0;
  company.quarter_serving_units = 0; company.quarter_serving_turns = 0;
  company.last_close_turn = world.turn_index;

  if (!Array.isArray(company.quarter_history)) company.quarter_history = [];
  company.quarter_history.push(record);
  if (company.quarter_history.length > 400) {
    company.quarter_history.splice(0, company.quarter_history.length - 400);
  }

  if (company.cash_kc <= 0 && company.is_operating === true) {
    company.cash_kc = company.cash_kc; // keep exact value, bankruptcy handled elsewhere
  }

  return record;
}

/* ------------------------------------------------------------------ *
 * Financial metrics (read-only summary of the company)
 * ------------------------------------------------------------------ */

export function getCompanyFinancialMetrics(state) {
  // Reporting must not initialize missing legacy defaults in the live save.
  state = JSON.parse(JSON.stringify(state));
  const company = ensureCompany(state);
  const world = ensureWorld(state);
  const products = Array.isArray(state.products) ? state.products : [];

  const legacy = computeProductRevenue(products.map(p => ({ ...p })));
  const serviceTurns = num(company.quarter_serving_turns, 0);
  const lastQ = company.quarter_history.at(-1) || {};
  const serviceRevenue = serviceTurns > 0 ? num(company.quarter_serving_revenue_kc) / serviceTurns * DEFAULT_TURNS_PER_QUARTER : num(lastQ.serving_revenue_kc);
  const serviceCogs = serviceTurns > 0 ? num(company.quarter_serving_cogs_kc) / serviceTurns * DEFAULT_TURNS_PER_QUARTER : num(lastQ.serving_cogs_kc);
  const revenue_kc = legacy.revenue_kc + serviceRevenue;
  const cash_cogs_kc = legacy.cash_cogs_kc + serviceCogs;

  const payroll_kc = num(company.payroll_kc_per_quarter, STARTING_PAYROLL_KC);
  const overhead_kc = num(company.overhead_kc_per_quarter, STARTING_OVERHEAD_KC);
  const depreciation_kc = num(company.quarter_depreciation_kc, 0);
  const interest_kc = num(company.quarter_interest_kc, 0);

  const gross_profit_kc = r4(revenue_kc - cash_cogs_kc);
  const opex_kc = r4(payroll_kc + overhead_kc);
  const operating_income_kc = r4(gross_profit_kc - opex_kc);
  const pretax_kc = r4(operating_income_kc - depreciation_kc - interest_kc);
  const tax_kc = r4(Math.max(0, pretax_kc) * TAX_RATE);
  const net_income_kc = r4(pretax_kc - tax_kc);

  const cash_kc = num(company.cash_kc, 0);
  const quarterly_burn_kc = r4(Math.max(0, cash_cogs_kc + opex_kc + interest_kc - revenue_kc));
  const monthly_burn_kc = r4(quarterly_burn_kc / 3);
  const runway_quarters = quarterly_burn_kc > 0 ? r4(cash_kc / quarterly_burn_kc) : Infinity;
  const runway_months = quarterly_burn_kc > 0 ? r4((cash_kc / quarterly_burn_kc) * 3) : Infinity;

  const shares = num(company.shares_outstanding, STARTING_SHARES);
  const founder_shares = num(company.founder_shares, STARTING_FOUNDER_SHARES);
  const valuation_multiplier = num(world.valuation_multiplier, 1);

  let base_valuation_kc = num(company.last_pre_money_kc, DEFAULT_PRE_MONEY_KC);
  if (company.is_public === true && Number.isFinite(company.post_money_kc)) {
    base_valuation_kc = num(company.post_money_kc, base_valuation_kc);
  }
  const valuation_kc = r4(base_valuation_kc * valuation_multiplier);
  const price_per_share_kc = shares > 0 ? r4(valuation_kc / shares) : 0;

  return {
    engine_version: ENGINE_VERSION,
    currency: 'kc',

    cash_kc: r4(cash_kc),
    quarterly_revenue_kc: r4(revenue_kc),
    quarterly_cogs_kc: r4(cash_cogs_kc),
    gross_profit_kc,
    gross_margin: revenue_kc > 0 ? r4(gross_profit_kc / revenue_kc) : 0,
    arr_kc: r4(revenue_kc * 4),

    payroll_kc_per_quarter: r4(payroll_kc),
    overhead_kc_per_quarter: r4(overhead_kc),
    opex_kc_per_quarter: opex_kc,
    depreciation_kc_per_quarter: r4(depreciation_kc),
    interest_kc_per_quarter: r4(interest_kc),

    operating_income_kc,
    pretax_kc,
    tax_rate: TAX_RATE,
    tax_kc,
    net_income_kc,

    quarterly_burn_kc,
    monthly_burn_kc,
    runway_quarters,
    runway_months,
    is_profitable: net_income_kc > 0,

    pre_money_kc: r4(base_valuation_kc),
    post_money_kc: Number.isFinite(company.post_money_kc) ? r4(company.post_money_kc) : null,
    valuation_kc,
    valuation_multiplier,
    shares_outstanding: shares,
    founder_shares,
    founder_ownership_pct: shares > 0 ? r4((founder_shares / shares) * 100) : 0,
    price_per_share_kc,
    is_public: company.is_public === true,

    bubble_phase: world.bubble_phase ?? 'expansion',
    funding_multiplier: num(world.funding_multiplier, 1),
    spot_gpu_price_index: num(world.spot_gpu_price_index, 1),

    quarter_paid_rnd_kc: r4(num(company.quarter_paid_rnd_kc, 0)),
    quarter_paid_legal_kc: r4(num(company.quarter_paid_legal_kc, 0)),

    reputation: r4(num(company.reputation, 50)),
    board_confidence: r4(num(company.board_confidence, 60)),
    public_trust: r4(num(company.public_trust, 50)),
    legal_risk: r4(num(company.legal_risk, 0)),
  };
}

/* ------------------------------------------------------------------ *
 * Product deployment
 * ------------------------------------------------------------------ */

const PRODUCT_FIELDS = [
  'name',
  'demand_units',
  'market_demand',
  'retention',
  'quality_fit',
  'price_kc_per_unit',
  'variable_cost_kc_per_unit',
  'service_capacity_units',
  'active',
  'suspended',
  'tier',
  'notes',
];

const PRODUCT_ALIASES = {
  price_kc: 'price_kc_per_unit',
  unit_price_kc: 'price_kc_per_unit',
  variable_cost_kc: 'variable_cost_kc_per_unit',
  capacity_units: 'service_capacity_units',
  retention_rate: 'retention',
};

export function deployOrUpdateProduct(state, productConfig, actionId = null) {
  const company = ensureCompany(state);
  if (!Array.isArray(state.products)) state.products = [];

  const cfg = (productConfig && typeof productConfig === 'object') ? { ...productConfig } : {};
  const id = String(cfg.id ?? cfg.product_id ?? `product_${state.products.length + 1}`);

  for (const [alias, target] of Object.entries(PRODUCT_ALIASES)) {
    if (cfg[alias] !== undefined && cfg[target] === undefined) cfg[target] = cfg[alias];
  }

  let product = state.products.find((p) => p && String(p.id ?? p.product_id) === id);
  const isNew = !product;

  if (isNew) {
    product = {
      id,
      product_id: id,
      name: cfg.name ?? cfg.product_name ?? id,
      model_ids: Array.isArray(cfg.model_ids)
        ? cfg.model_ids
        : (cfg.model_id ? [String(cfg.model_id)] : (state.active_model?.model_id ? [state.active_model.model_id] : ['model_active'])),
      dispatcher_model_id: cfg.dispatcher_model_id ?? null,
      market_type: ['consumer', 'enterprise', 'public', 'edge'].includes(cfg.market_type) ? cfg.market_type : 'enterprise',
      created_turn: Math.max(0, Math.floor(num(state.turn, 1))),
      release_turn: Math.max(0, Math.floor(num(cfg.release_turn ?? state.turn, 1))),
      updated_turn: Math.max(0, Math.floor(num(state.turn, 1))),
      active: true,
      suspended: false,
      is_suspended: false,
      demand_units: 800,
      market_demand: 1.0,
      retention: 0.85,
      quality_fit: 1.0,
      price_kc_per_unit: 1.2,
      variable_cost_kc_per_unit: 0.35,
      service_capacity_units: 800,
      deployment_count: 0,
    };
    state.products.push(product);
  }

  for (const field of PRODUCT_FIELDS) {
    if (cfg[field] !== undefined) product[field] = cfg[field];
  }
  if (!Array.isArray(product.model_ids)) {
    product.model_ids = cfg.model_id ? [String(cfg.model_id)] : (state.active_model?.model_id ? [state.active_model.model_id] : ['model_active']);
  }
  if (product.dispatcher_model_id === undefined) product.dispatcher_model_id = null;
  if (!['consumer', 'enterprise', 'public', 'edge'].includes(product.market_type)) product.market_type = 'enterprise';
  if (!Number.isFinite(product.release_turn)) product.release_turn = Math.max(0, Math.floor(num(state.turn, 1)));

  if (cfg.status === 'suspended') product.suspended = true;
  if (cfg.status === 'active') product.suspended = false;
  if (cfg.status !== undefined) product.status = cfg.status;
  product.is_suspended = Boolean(cfg.is_suspended ?? product.suspended ?? false);

  product.updated_turn = Math.max(0, Math.floor(num(state.turn, 1)));
  product.deployment_count = num(product.deployment_count, 0) + 1;

  const cost_kc = r4(num(cfg.deploy_cost_kc ?? cfg.capex_kc, 0));
  if (cost_kc > 0) {
    company.cash_kc = r4(num(company.cash_kc, 0) - cost_kc);
    company.quarter_paid_rnd_kc = r4(num(company.quarter_paid_rnd_kc, 0) + cost_kc);
  }

  return {
    ok: true,
    action_id: actionId,
    product,
    product_id: id,
    is_new: isNew,
    cost_kc,
    cash_kc: company.cash_kc,
  };
}

/* ------------------------------------------------------------------ *
 * Private financing
 * ------------------------------------------------------------------ */

const FINANCING_ROUNDS = Object.freeze({
  pre_seed: { pre_money_kc: 4000, post_issue_fraction: 0.15, fee_rate: 0.02 },
  seed: { pre_money_kc: 10000, post_issue_fraction: 0.15, fee_rate: 0.02 },
  series_a: { pre_money_kc: 40000, post_issue_fraction: 0.18, fee_rate: 0.025 },
  series_b: { pre_money_kc: 120000, post_issue_fraction: 0.16, fee_rate: 0.03 },
  series_c: { pre_money_kc: 400000, post_issue_fraction: 0.14, fee_rate: 0.03 },
  series_d: { pre_money_kc: 1200000, post_issue_fraction: 0.12, fee_rate: 0.035 },
});

const FINANCING_ORDER = ['pre_seed', 'seed', 'series_a', 'series_b', 'series_c', 'series_d'];

export function executePrivateFinancing(state, roundTierOrOpts = 'seed', actionId = null) {
  const company = ensureCompany(state);
  const world = ensureWorld(state);

  let opts = {};
  let roundName = null;

  if (typeof roundTierOrOpts === 'string') {
    roundName = roundTierOrOpts;
    opts = { ...(FINANCING_ROUNDS[roundName] ?? FINANCING_ROUNDS.seed) };
  } else if (roundTierOrOpts && typeof roundTierOrOpts === 'object') {
    opts = { ...roundTierOrOpts };
    roundName = opts.round ?? opts.tier ?? opts.round_tier ?? 'seed';
    const preset = FINANCING_ROUNDS[roundName];
    if (preset) {
      opts = { ...preset, ...opts };
    }
  } else {
    roundName = 'seed';
    opts = { ...FINANCING_ROUNDS.seed };
  }

  const S = num(company.shares_outstanding, STARTING_SHARES);
  const valuationMultiplier = opts.apply_valuation_multiplier === false
    ? 1
    : num(world.valuation_multiplier, 1);

  const basePreMoney = num(opts.pre_money_kc, FINANCING_ROUNDS.seed.pre_money_kc);
  const pre_money_kc = r4(Math.max(1, basePreMoney * valuationMultiplier));

  let f = pickNum(opts.post_issue_fraction, opts.dilution_fraction, opts.new_share_fraction);
  if (f === null) {
    const raiseTarget = pickNum(opts.raise_kc, opts.target_raise_kc);
    if (raiseTarget !== null && raiseTarget > 0) {
      f = raiseTarget / (pre_money_kc + raiseTarget);
    } else {
      f = num(FINANCING_ROUNDS[roundName]?.post_issue_fraction, 0.15);
    }
  }
  f = clamp(f, 0.0001, 0.9);

  const fee_rate = clamp(num(opts.fee_rate, FINANCING_ROUNDS[roundName]?.fee_rate ?? 0.02), 0, 0.2);

  const new_shares = Math.round((S * f) / (1 - f));
  const issue_price_kc = pre_money_kc / S;
  const gross_proceeds_kc = r4(new_shares * issue_price_kc);
  const fee_kc = r4(gross_proceeds_kc * fee_rate);
  const net_proceeds_kc = r4(gross_proceeds_kc - fee_kc);

  const total_shares_after = S + new_shares;
  const founder_shares = num(company.founder_shares, STARTING_FOUNDER_SHARES);
  const founder_ownership_pct = r4((founder_shares / total_shares_after) * 100);

  company.cash_kc = r4(num(company.cash_kc, 0) + net_proceeds_kc);
  company.shares_outstanding = total_shares_after;
  company.last_pre_money_kc = pre_money_kc;
  company.post_money_kc = r4(pre_money_kc + gross_proceeds_kc);
  company.founder_ownership_pct = founder_ownership_pct;
  company.financing_stage = roundName;
  const orderIndex = FINANCING_ORDER.indexOf(roundName);
  company.financing_stage_index = orderIndex >= 0 ? orderIndex : num(company.financing_stage_index, 0) + 1;

  const record = {
    type: 'private_financing',
    round: roundName,
    turn: num(state.turn, 1),
    action_id: actionId,
    pre_money_kc,
    post_money_kc: company.post_money_kc,
    valuation_multiplier: valuationMultiplier,
    funding_multiplier: num(world.funding_multiplier, 1),
    post_issue_fraction: r4(f),
    new_shares,
    issue_price_kc,
    gross_proceeds_kc,
    fee_kc,
    net_proceeds_kc,
    total_shares_after,
    founder_shares,
    founder_ownership_pct,
    cash_after_kc: company.cash_kc,
  };

  if (!Array.isArray(company.financing_history)) company.financing_history = [];
  company.financing_history.push(record);

  return { ok: true, ...record };
}

/* ------------------------------------------------------------------ *
 * IPO (Section 17.1 / 25.4)
 * ------------------------------------------------------------------ */

export function computeIpoDilution(stateOrParams = {}, maybeParams = {}) {
  const first = stateOrParams;
  const looksLikeState = first
    && typeof first === 'object'
    && (first.company || first.world || first.milestones || first.products || first.active_model);

  let state = null;
  let params = {};

  if (looksLikeState) {
    state = first;
    params = (maybeParams && typeof maybeParams === 'object') ? maybeParams : {};
  } else {
    params = (first && typeof first === 'object') ? first : {};
  }

  const company = (state && state.company && typeof state.company === 'object') ? state.company : {};

  const S = num(params.shares_outstanding ?? company.shares_outstanding, STARTING_SHARES);
  const V = num(params.pre_money_kc ?? company.last_pre_money_kc, DEFAULT_PRE_MONEY_KC);
  const f = clamp(num(params.post_issue_fraction ?? params.new_share_fraction, 0.15), 0.0001, 0.9);
  const fee_rate = clamp(num(params.fee_rate, IPO_FEE_RATE), 0, 0.5);

  const new_shares = Math.round((S * f) / (1 - f));
  const issue_price_kc = V / S;

  const gross_proceeds_kc = Number((new_shares * issue_price_kc).toFixed(2));
  const fee_kc = Number((gross_proceeds_kc * fee_rate).toFixed(2));
  const net_proceeds_kc = Number((gross_proceeds_kc * (1 - fee_rate)).toFixed(2));

  const total_shares_after = S + new_shares;
  const founder_shares = num(params.founder_shares ?? company.founder_shares, STARTING_FOUNDER_SHARES);
  const founder_ownership = Number((founder_shares / total_shares_after).toFixed(4));
  const founder_ownership_pct = Number(((founder_shares / total_shares_after) * 100).toFixed(2));

  return {
    ok: true,
    new_shares,
    issue_price_kc,
    gross_proceeds_kc,
    fee_kc,
    net_proceeds_kc,
    founder_shares,
    total_shares_after,
    founder_ownership,
    founder_ownership_pct,
  };
}

export function executeIPO(state, actionIdOrOpts = null, newShareFraction = 0.15) {
  const company = ensureCompany(state);
  const world = ensureWorld(state);

  let actionId = null;
  let opts = {};

  if (typeof actionIdOrOpts === 'string') {
    actionId = actionIdOrOpts;
  } else if (actionIdOrOpts && typeof actionIdOrOpts === 'object') {
    opts = { ...actionIdOrOpts };
    actionId = opts.action_id ?? opts.actionId ?? null;
  }

  if (company.is_public === true && opts.force !== true) {
    return { ok: false, reason: 'already_public', action_id: actionId };
  }

  const f = clamp(num(opts.post_issue_fraction ?? opts.new_share_fraction ?? newShareFraction, 0.15), 0.0001, 0.9);
  const fee_rate = clamp(num(opts.fee_rate, IPO_FEE_RATE), 0, 0.5);

  const dilution = computeIpoDilution(state, { ...opts, post_issue_fraction: f, fee_rate });

  company.shares_outstanding = dilution.total_shares_after;
  company.founder_shares = dilution.founder_shares;
  company.founder_ownership_pct = dilution.founder_ownership_pct;
  company.cash_kc = r4(num(company.cash_kc, 0) + dilution.net_proceeds_kc);
  company.is_public = true;
  company.ipo_turn = num(world.turn_index ?? state.turn, 1);
  company.ipo_issue_price_kc = dilution.issue_price_kc;
  company.ipo_gross_proceeds_kc = dilution.gross_proceeds_kc;
  company.ipo_net_proceeds_kc = dilution.net_proceeds_kc;
  company.post_money_kc = r4(num(company.last_pre_money_kc, DEFAULT_PRE_MONEY_KC) + dilution.gross_proceeds_kc);

  const record = {
    type: 'ipo',
    turn: company.ipo_turn,
    action_id: actionId,
    fee_rate,
    post_issue_fraction: r4(f),
    ...dilution,
    cash_after_kc: company.cash_kc,
    bubble_phase: world.bubble_phase ?? 'expansion',
  };

  if (!Array.isArray(company.financing_history)) company.financing_history = [];
  company.financing_history.push(record);

  return {
    ok: true,
    action_id: actionId,
    cash_kc: company.cash_kc,
    shares_outstanding: company.shares_outstanding,
    is_public: true,
    ...dilution,
  };
}

/* ------------------------------------------------------------------ *
 * Public market trading
 * ------------------------------------------------------------------ */

export function tradeSecurity(state, securityIdOrOpts, deltaShares = 0) {
  const company = ensureCompany(state);
  const market = ensureMarket(state);

  let opts = {};
  if (typeof securityIdOrOpts === 'string') {
    opts = { security_id: securityIdOrOpts, delta_shares: deltaShares };
  } else if (securityIdOrOpts && typeof securityIdOrOpts === 'object') {
    opts = { ...securityIdOrOpts };
  }

  const securityId = String(opts.security_id ?? opts.securityId ?? opts.id ?? 'gpu_spot_index');
  const delta = num(opts.delta_shares ?? opts.shares ?? opts.quantity ?? deltaShares, 0);

  if (delta === 0) {
    return { ok: false, reason: 'zero_trade', security_id: securityId };
  }

  let sec = market.securities.find((s) => s && String(s.id) === securityId);
  if (!sec) {
    sec = {
      id: securityId,
      name: opts.name ?? securityId,
      price_kc: num(opts.price_kc, 1),
      volatility: 0.08,
      shares_held: 0,
      cost_basis_kc: 0,
      created_turn: num(state.turn, 1),
      market_value_kc: 0,
    };
    market.securities.push(sec);
  }

  const priceOverride = pickNum(opts.price_kc);
  if (priceOverride !== null && priceOverride > 0) sec.price_kc = priceOverride;

  const price = Math.max(0.0001, num(sec.price_kc, 1));
  const fee_rate = clamp(num(opts.fee_rate, 0.001), 0, 0.05);
  const absDelta = Math.abs(delta);
  const side = delta > 0 ? 'buy' : 'sell';
  const allowShort = opts.allow_short === true;

  let sharesHeld = num(sec.shares_held, 0);
  const cashBefore = num(company.cash_kc, 0);

  if (side === 'sell' && sharesHeld - absDelta < 0 && !allowShort) {
    return {
      ok: false,
      reason: 'insufficient_shares',
      security_id: securityId,
      shares_held: r4(sharesHeld),
      requested: r4(absDelta),
    };
  }

  const notional_kc = r4(absDelta * price);
  const fee_kc = r4(notional_kc * fee_rate);

  if (side === 'buy') {
    const total = r4(notional_kc + fee_kc);
    if (total > cashBefore) {
      return {
        ok: false,
        reason: 'insufficient_cash',
        security_id: securityId,
        required_kc: total,
        cash_kc: r4(cashBefore),
      };
    }
    company.cash_kc = r4(cashBefore - total);
    sharesHeld += absDelta;
    sec.cost_basis_kc = r4(num(sec.cost_basis_kc, 0) + total);
  } else {
    company.cash_kc = r4(cashBefore + notional_kc - fee_kc);
    const priorHeld = Math.max(1, num(sec.shares_held, 0));
    const avgCost = num(sec.cost_basis_kc, 0) / priorHeld;
    sec.cost_basis_kc = r4(Math.max(0, num(sec.cost_basis_kc, 0) - avgCost * absDelta));
    sharesHeld -= absDelta;
  }

  sec.shares_held = r4(sharesHeld);
  sec.last_price_kc = price;
  sec.last_trade_turn = num(state.turn, 1);
  sec.market_value_kc = r4(sec.shares_held * price);

  const record = {
    turn: num(state.turn, 1),
    security_id: securityId,
    side,
    delta_shares: r4(delta),
    price_kc: price,
    notional_kc,
    fee_kc,
    cash_after_kc: company.cash_kc,
    shares_held_after: sec.shares_held,
  };

  market.trade_log.push(record);
  if (market.trade_log.length > 500) {
    market.trade_log.splice(0, market.trade_log.length - 500);
  }

  company.securities_value_kc = r4(
    market.securities.reduce((acc, s) => acc + num(s.market_value_kc, 0), 0),
  );

  return { ok: true, ...record };
}

/* ------------------------------------------------------------------ *
 * AI Bubble Clock (Section 18.1–18.2 / 25.4)
 * ------------------------------------------------------------------ */

export function lockCrashTurn(state) {
  const world = ensureWorld(state);

  if (Number.isFinite(world.locked_crash_turn)
    && world.locked_crash_turn >= 84
    && world.locked_crash_turn <= 108) {
    return world.locked_crash_turn;
  }

  // Deterministic: depends ONLY on `state.campaign_seed`.
  // Never on company.display_name / active_model.display_name.
  const seed = (state && state.campaign_seed !== undefined && state.campaign_seed !== null)
    ? state.campaign_seed
    : 20240101;

  const rng = seededRng('crash-turn-lock', String(seed));
  const span = 108 - 84 + 1; // 25 distinct integer turns, inclusive
  world.locked_crash_turn = 84 + Math.floor(rng() * span);

  return world.locked_crash_turn;
}

export function updateBubbleState(state, turnOverride = null) {
  const world = ensureWorld(state);
  const company = ensureCompany(state);
  const locked = lockCrashTurn(state);

  const t = Number.isFinite(turnOverride)
    ? Number(turnOverride)
    : num(world.turn_index ?? state.turn, 1);

  const baseConsumer = num(world.structural_consumer_demand, 1.0);
  const baseEnterprise = num(world.structural_enterprise_demand, 1.0);
  const basePublic = num(world.structural_public_demand, 1.0);

  const warningStart = locked - 12;
  const crashStart = locked;
  const crashEnd = locked + 5;
  const winterStart = locked + 6;
  const winterEnd = locked + 23;
  const recoveryStart = locked + 24;
  const recoveryEnd = locked + 35;

  let phase;
  let valuation_multiplier = 1.0;
  let funding_multiplier = 1.0;
  let spot_gpu_price_index = 1.0;
  let consumerFactor = 1.0;
  let enterpriseFactor = 1.0;
  let publicFactor = 1.0;
  let warningCount = 0;

  if (t < warningStart) {
    phase = 'expansion';
  } else if (t <= locked - 1) {
    phase = 'warning';
    warningCount = t >= locked - 6 ? 2 : 1;
    valuation_multiplier = 1.0;
    funding_multiplier = 1.0;
    spot_gpu_price_index = 1.0;
  } else if (t >= crashStart && t <= crashEnd) {
    phase = 'crash';
    valuation_multiplier = 0.40;
    funding_multiplier = 0.15;
    spot_gpu_price_index = 1.0;
    consumerFactor = 0.65;
    enterpriseFactor = 0.85;
    publicFactor = 0.95;
    warningCount = 2;
    world.bubble_crash_turn = locked;
  } else if (t >= winterStart && t <= winterEnd) {
    phase = 'winter';
    valuation_multiplier = 0.55;
    funding_multiplier = 0.25;
    spot_gpu_price_index = 0.65;
    consumerFactor = 0.65;
    enterpriseFactor = 0.85;
    publicFactor = 0.95;
    warningCount = 0;
  } else if (t >= recoveryStart && t <= recoveryEnd) {
    phase = 'recovery';
    const span = recoveryEnd - recoveryStart + 1; // 12
    const p = clamp((t - recoveryStart + 1) / span, 0, 1);

    valuation_multiplier = r4(0.55 + (1.0 - 0.55) * p);
    funding_multiplier = r4(0.25 + (1.0 - 0.25) * p);
    spot_gpu_price_index = r4(0.65 + (1.0 - 0.65) * p);
    consumerFactor = r4(0.65 + (1.0 - 0.65) * p);
    enterpriseFactor = r4(0.85 + (1.0 - 0.85) * p);
    publicFactor = r4(0.95 + (1.0 - 0.95) * p);
    warningCount = 0;

    if (company.is_operating) company.bubble_survived = true;
  } else {
    phase = 'normal';
    valuation_multiplier = 1.0;
    funding_multiplier = 1.0;
    spot_gpu_price_index = 1.0;
    warningCount = 0;

    if (company.is_operating && world.bubble_crash_turn !== undefined && world.bubble_crash_turn !== null) {
      company.bubble_survived = true;
    }
  }

  world.bubble_phase = phase;
  world.bubble_warning_count = warningCount;
  world.valuation_multiplier = valuation_multiplier;
  world.funding_multiplier = funding_multiplier;
  world.spot_gpu_price_index = spot_gpu_price_index;

  // ALWAYS derived from the structural baseline — never compounded.
  world.consumer_demand = r4(baseConsumer * consumerFactor);
  world.enterprise_demand = r4(baseEnterprise * enterpriseFactor);
  world.public_demand = r4(basePublic * publicFactor);
  world.market_demand = r4(
    (world.consumer_demand + world.enterprise_demand + world.public_demand) / 3,
  );
  world.bubble_updated_turn = t;

  return {
    turn: t,
    locked_crash_turn: locked,
    bubble_phase: phase,
    bubble_warning_count: warningCount,
    bubble_crash_turn: world.bubble_crash_turn ?? null,
    valuation_multiplier,
    funding_multiplier,
    spot_gpu_price_index,
    consumer_demand: world.consumer_demand,
    enterprise_demand: world.enterprise_demand,
    public_demand: world.public_demand,
    market_demand: world.market_demand,
  };
}

/* ------------------------------------------------------------------ *
 * Legal system (Section 22)
 * ------------------------------------------------------------------ */

const LEGAL_CASE_TITLES = {
  1: '数据合规问询',
  2: '监管调查：安全评估缺失',
  3: '重大诉讼：模型输出致害',
};

export function stepLegalSystem(state) {
  const legal = ensureLegal(state);
  const company = ensureCompany(state);
  const turn = num(state.turn, 1);

  const rng = seededRng('legal-step', String(state.campaign_seed ?? 0), String(turn));

  const results = {
    turn,
    escalated: [],
    new_cases: [],
    auto_resolved: [],
    active_cases: 0,
  };

  // 1. Progress every open case.
  for (const c of legal.cases) {
    if (!c || c.status !== 'open') continue;

    c.age_turns = num(c.age_turns, 0) + 1;

    const basePressure = num(c.pressure_per_turn, 0.08);
    const risk = num(company.legal_risk, 0);
    c.pressure = r4(clamp(num(c.pressure, 0) + basePressure + risk * 0.05, 0, 1.5));

    if (c.pressure >= 1.0) results.escalated.push(c.id);
  }

  // 2. Possibly file a new case.
  const risk = num(company.legal_risk, 0);
  const fileChance = clamp(0.02 + risk * 0.25, 0, 0.9);

  if (rng() < fileChance) {
    const severityRoll = rng();
    const severity = severityRoll < 0.5 ? 1 : (severityRoll < 0.85 ? 2 : 3);

    legal.case_serial = num(legal.case_serial, 0) + 1;
    const id = `case_${turn}_${legal.case_serial}`;

    const newCase = {
      id,
      case_id: id,
      title: LEGAL_CASE_TITLES[severity] ?? '监管问询',
      status: 'open',
      severity,
      filed_turn: turn,
      age_turns: 0,
      pressure: 0,
      pressure_per_turn: r4(0.06 + severity * 0.02),
      fine_kc_base: 200 * severity * severity,
      max_turns: 8,
      strategy: null,
      outcome: null,
    };

    legal.cases.push(newCase);
    results.new_cases.push(newCase);
  }

  // 3. Auto-resolve escalated / overdue cases through the default negotiation path.
  for (const c of legal.cases) {
    if (!c || c.status !== 'open') continue;
    const overdue = num(c.age_turns, 0) >= num(c.max_turns, 8);
    const escalated = num(c.pressure, 0) >= 1.0;
    if (!overdue && !escalated) continue;

    const resolution = resolveLegalAction(state, c.id, c.strategy || 'negotiate');
    results.auto_resolved.push(resolution);
  }

  results.active_cases = legal.cases.filter((c) => c && c.status === 'open').length;
  legal.last_updated_turn = turn;

  return results;
}

export function resolveLegalAction(state, caseId, strategy = 'negotiate') {
  const legal = ensureLegal(state);
  const company = ensureCompany(state);

  const c = legal.cases.find((x) => x && (String(x.id) === String(caseId) || String(x.case_id) === String(caseId)));
  if (!c) return { ok: false, reason: 'case_not_found', case_id: caseId };
  if (c.status !== 'open') {
    return { ok: false, reason: 'case_closed', case_id: caseId, status: c.status };
  }

  const severity = clamp(num(c.severity, 1), 1, 3);
  const pressure = clamp(num(c.pressure, 0), 0, 1.5);
  const baseFine = num(c.fine_kc_base, 200 * severity * severity);
  const strat = String(strategy || 'negotiate').toLowerCase();

  const rng = seededRng('legal-resolve', String(state.campaign_seed ?? 0), String(c.id), strat);
  const roll = rng();

  const cashBefore = num(company.cash_kc, 0);

  let outcome = 'settled';
  let cost_kc = 0;
  let fine_kc = 0;
  let reputation_delta = 0;
  let legal_risk_delta = 0;

  switch (strat) {
    case 'fight':
    case 'litigate': {
      const winProb = clamp(0.65 - severity * 0.12 - pressure * 0.2, 0.05, 0.9);
      cost_kc = r4(baseFine * 0.25);
      if (roll < winProb) {
        outcome = 'won';
        fine_kc = 0;
        reputation_delta = 3;
        legal_risk_delta = -0.02;
      } else {
        outcome = 'lost';
        fine_kc = r4(baseFine * (1.2 + 0.4 * severity));
        reputation_delta = -6;
        legal_risk_delta = 0.03;
      }
      break;
    }

    case 'settle': {
      outcome = 'settled';
      fine_kc = r4(baseFine * (0.7 + 0.15 * severity));
      reputation_delta = -1;
      legal_risk_delta = -0.03;
      break;
    }

    case 'comply':
    case 'remediate': {
      outcome = 'complied';
      cost_kc = r4(baseFine * 0.35);
      fine_kc = r4(baseFine * 0.15);
      reputation_delta = 2;
      legal_risk_delta = -0.06;
      break;
    }

    case 'lobby': {
      cost_kc = r4(baseFine * 0.5);
      if (roll < 0.7) {
        outcome = 'lobbied';
        fine_kc = r4(baseFine * 0.1);
        legal_risk_delta = -0.01;
      } else {
        outcome = 'lobby_failed';
        fine_kc = r4(baseFine * 0.6);
        legal_risk_delta = 0.02;
      }
      reputation_delta = -2;
      break;
    }

    case 'negotiate':
    default: {
      const acceptProb = clamp(0.7 - severity * 0.1 - pressure * 0.25, 0.1, 0.9);
      if (roll < acceptProb) {
        outcome = 'negotiated';
        fine_kc = r4(baseFine * 0.45 * (0.8 + 0.4 * severity));
        reputation_delta = -1;
        legal_risk_delta = -0.02;
      } else {
        outcome = 'negotiation_failed';
        fine_kc = r4(baseFine * 0.9);
        reputation_delta = -3;
        legal_risk_delta = 0.01;
      }
      break;
    }
  }

  const total_kc = r4(cost_kc + fine_kc);

  company.cash_kc = r4(cashBefore - total_kc);
  company.quarter_paid_legal_kc = r4(num(company.quarter_paid_legal_kc, 0) + total_kc);
  company.reputation = r4(clamp(num(company.reputation, 50) + reputation_delta, 0, 100));
  company.legal_risk = r4(clamp(num(company.legal_risk, 0) + legal_risk_delta, 0, 1));

  c.status = 'resolved';
  c.resolved_turn = num(state.turn, 1);
  c.strategy = strat;
  c.outcome = outcome;
  c.cost_kc = total_kc;
  c.fine_kc = fine_kc;
  c.legal_fee_kc = cost_kc;

  const record = {
    turn: num(state.turn, 1),
    case_id: c.id,
    severity,
    strategy,
    outcome,
    legal_fee_kc: cost_kc,
    fine_kc,
    total_kc,
    reputation_delta,
    legal_risk_delta,
    cash_after_kc: company.cash_kc,
  };

  legal.history.push(record);
  if (legal.history.length > 300) legal.history.splice(0, legal.history.length - 300);

  return { ok: true, ...record };
}

/* ------------------------------------------------------------------ *
 * Milestones (Section 19.1 / 25.4)
 * ------------------------------------------------------------------ */

export function evaluateMilestones(state, extra = {}) {
  const m = ensureMilestones(state);
  const story = ensureStory(state);
  const model = (state.active_model && typeof state.active_model === 'object') ? state.active_model : {};

  if (state && state.metrics && typeof state.metrics === 'object') {
    for (const key of Object.keys(state.metrics)) {
      if (state.metrics[key] !== undefined) m[key] = state.metrics[key];
    }
  }

  if (extra && typeof extra === 'object') {
    for (const key of Object.keys(extra)) {
      if (extra[key] === undefined) continue;
      m[key] = extra[key];
    }
  }

  const newly = [];

  // A public "we reached AGI" claim is recorded as a *claim*, never as evidence.
  if (hasStoryFlag(story, 'claimed_agi') || m.agi_claimed === true) {
    m.agi_claimed = true;
  }

  /* ---------------- AGI ---------------- */
  const domain_pass_rate = num(m.domain_pass_rate, 0);
  const worst_domain_pass_rate = num(m.worst_domain_pass_rate, 0);
  const modelAutonomy = num(model.autonomy_hours, 0);
  const milestoneAutonomy = num(m.autonomy_hours, 0);
  const autonomy_hours = Math.max(modelAutonomy, milestoneAutonomy);
  const critical_incident_rate = num(m.critical_incident_rate, 0);
  const independent_audits = num(m.independent_audits, 0);

  const agiEvidence = domain_pass_rate >= 0.80
    && worst_domain_pass_rate >= 0.60
    && autonomy_hours >= 8
    && critical_incident_rate <= 0.01
    && independent_audits >= 3;

  if (agiEvidence && m.agi_achieved !== true) {
    m.agi_achieved = true;
    m.agi_achieved_turn = num(state.turn, 1);
    newly.push('agi_achieved');
  }

  /* ---------------- ASI ---------------- */
  const expert_speedup_ratio = num(m.expert_speedup_ratio, 0);
  const domain_top_rate = num(m.domain_top_rate, 0);
  const verified_discoveries = num(m.verified_discoveries, 0);
  const ood_robustness = Math.max(num(m.ood_robustness, 0), num(model.ood_robustness, 0));

  const asiEvidence = expert_speedup_ratio >= 5
    && domain_top_rate >= 0.95
    && verified_discoveries >= 3
    && ood_robustness >= 0.90
    && independent_audits >= 3;

  if (asiEvidence && m.asi_achieved !== true) {
    m.asi_achieved = true;
    m.asi_achieved_turn = num(state.turn, 1);
    newly.push('asi_achieved');
  }

  /* ---------------- RSI ---------------- */
  const verified_rsi_cycles = num(m.verified_rsi_cycles, 0);
  const self_research_contribution = num(m.self_research_contribution, 0);
  const external_gain_three_cycles = num(m.external_gain_three_cycles, 0);
  const net_compute_return = num(m.net_compute_return, 0);

  const rsiEvidence = verified_rsi_cycles >= 3
    && self_research_contribution >= 0.50
    && external_gain_three_cycles >= 0.05
    && net_compute_return >= 1.05;

  if (rsiEvidence && m.rsi_achieved !== true) {
    m.rsi_achieved = true;
    m.rsi_achieved_turn = num(state.turn, 1);
    newly.push('rsi_achieved');
  }

  if (newly.length > 0) {
    if (!Array.isArray(state.milestone_history)) state.milestone_history = [];
    state.milestone_history.push({ turn: num(state.turn, 1), achieved: newly.slice() });
  }

  return {
    agi_achieved: m.agi_achieved === true,
    asi_achieved: m.asi_achieved === true,
    rsi_achieved: m.rsi_achieved === true,
    agi_claimed: m.agi_claimed === true,
    newly_achieved: newly,
    evidence: {
      agi: agiEvidence,
      asi: asiEvidence,
      rsi: rsiEvidence,
    },
    metrics: {
      domain_pass_rate,
      worst_domain_pass_rate,
      autonomy_hours,
      critical_incident_rate,
      independent_audits,
      expert_speedup_ratio,
      domain_top_rate,
      verified_discoveries,
      ood_robustness,
      verified_rsi_cycles,
      self_research_contribution,
      external_gain_three_cycles,
      net_compute_return,
    },
  };
}

export function updateSectorsAndMilestones(state) {
  const world = ensureWorld(state);
  const sectors = ensureSectors(state);
  const m = ensureMilestones(state);
  const model = (state.active_model && typeof state.active_model === 'object') ? state.active_model : {};

  const capability = clamp01(num(model.capability_index ?? m.capability_index, 0.30));
  const activeProducts = Array.isArray(state.products)
    ? state.products.filter((p) => p && p.suspended !== true && p.active !== false).length
    : 0;
  const productFactor = clamp(0.4 + 0.3 * activeProducts, 0.4, 2.0);

  for (const s of sectors) {
    const key = s.demand_type === 'consumer'
      ? 'consumer_demand'
      : (s.demand_type === 'enterprise' ? 'enterprise_demand' : 'public_demand');

    const demandMultiplier = clamp(num(world[key], 1), 0, 4);
    const penetration = clamp01(num(s.penetration, 0));

    const growth = 0.012
      * (0.35 + capability)
      * demandMultiplier
      * productFactor
      * (1 - penetration);

    s.momentum = r4(growth);
    s.penetration = r4(clamp01(penetration + growth));
    s.ai_adoption = r4(clamp01(s.penetration * (0.55 + 0.45 * capability)));
    s.last_updated_turn = num(state.turn, 1);
  }

  const avgPenetration = sectors.reduce((acc, s) => acc + num(s.penetration, 0), 0)
    / Math.max(1, sectors.length);

  m.sector_count = sectors.length;
  m.sector_adoption_avg = r4(avgPenetration);
  m.sectors_above_10pct = sectors.filter((s) => num(s.penetration, 0) >= 0.10).length;
  m.sectors_above_50pct = sectors.filter((s) => num(s.penetration, 0) >= 0.50).length;
  m.capability_index = r4(capability);

  const milestones = evaluateMilestones(state);

  return {
    sectors,
    milestones,
    sector_adoption_avg: m.sector_adoption_avg,
    sectors_above_50pct: m.sectors_above_50pct,
    bubble_phase: world.bubble_phase ?? 'expansion',
  };
}

/* ------------------------------------------------------------------ *
 * Recursive self-improvement cycles (Section 23)
 * ------------------------------------------------------------------ */

export function runRsiExperimentCycle(state, actionId = null) {
  const company = ensureCompany(state);
  const rsi = ensureRsi(state);
  const m = ensureMilestones(state);

  if (!state.active_model || typeof state.active_model !== 'object') state.active_model = {};
  const model = state.active_model;

  const turn = num(state.turn, 1);

  const cost_kc = num(rsi.cash_cost_kc_per_cycle, 250);
  const cash_kc = num(company.cash_kc, 0);
  if (cash_kc < cost_kc) {
    return {
      ok: false,
      reason: 'insufficient_cash',
      required_kc: cost_kc,
      cash_kc: r4(cash_kc),
    };
  }

  const computeCost = num(rsi.compute_cost_units_per_cycle, 10);
  const availableCompute = num(model.compute_units ?? rsi.compute_units, 0);
  const enforceCompute = availableCompute > 0;

  if (enforceCompute && availableCompute < computeCost) {
    return {
      ok: false,
      reason: 'insufficient_compute',
      required_units: computeCost,
      available_units: r4(availableCompute),
    };
  }

  company.cash_kc = r4(cash_kc - cost_kc);
  company.quarter_paid_rnd_kc = r4(num(company.quarter_paid_rnd_kc, 0) + cost_kc);
  if (enforceCompute) model.compute_units = r4(availableCompute - computeCost);

  rsi.total_cycles = num(rsi.total_cycles, 0) + 1;
  const cycleIndex = rsi.total_cycles;

  const rng = seededRng('rsi-cycle', String(state.campaign_seed ?? 0), String(turn), String(cycleIndex), String(actionId ?? ''));
  const rollGain = rng();
  const rollAudit = rng();
  const rollContribution = rng();
  const rollExternal = rng();

  const capability = clamp01(num(model.capability_index ?? m.capability_index, 0.30));

  const efficiency = r4(1.0 + 0.5 * rollGain * (0.5 + capability));
  const gain_capability = r4(0.04 * efficiency * (0.5 + capability));

  const auditProbability = clamp(0.35 + 0.4 * capability + 0.05 * cycleIndex, 0, 0.95);
  const verified = rollAudit < auditProbability;

  const contribution = r4(clamp(0.25 + 0.5 * rollContribution * (1 + 0.15 * cycleIndex), 0, 0.98));
  const external_gain = r4(0.045 + 0.10 * rollExternal * (0.5 + capability));

  model.capability_index = r4(clamp01(capability + gain_capability));
  model.autonomy_hours = r4(num(model.autonomy_hours, 0) + gain_capability * 4);

  if (verified) rsi.verified_cycles = num(rsi.verified_cycles, 0) + 1;

  rsi.history.push({
    cycle: cycleIndex,
    turn,
    action_id: actionId,
    cost_kc,
    compute_spent: enforceCompute ? computeCost : 0,
    gain_capability,
    verified,
    efficiency,
    contribution,
    external_gain,
  });
  if (rsi.history.length > 200) rsi.history.splice(0, rsi.history.length - 200);

  const pushRolling = (arr, value) => {
    arr.push(value);
    if (arr.length > 3) arr.shift();
  };

  pushRolling(rsi.compute_returns, efficiency);
  pushRolling(rsi.contributions, contribution);
  pushRolling(rsi.external_gains, external_gain);

  const average = (arr) => (arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  const minimum = (arr) => (arr.length > 0 ? Math.min(...arr) : 0);

  rsi.net_compute_return = r4(average(rsi.compute_returns));
  rsi.self_research_contribution = r4(average(rsi.contributions));
  rsi.external_gain_three_cycles = r4(minimum(rsi.external_gains));

  m.verified_rsi_cycles = rsi.verified_cycles;
  m.self_research_contribution = rsi.self_research_contribution;
  m.external_gain_three_cycles = rsi.external_gain_three_cycles;
  m.net_compute_return = rsi.net_compute_return;

  const milestones = evaluateMilestones(state);

  return {
    ok: true,
    action_id: actionId,
    cycle: cycleIndex,
    cost_kc,
    compute_spent: enforceCompute ? computeCost : 0,
    gain_capability,
    efficiency,
    verified,
    contribution,
    external_gain,
    rsi_cycles: rsi.total_cycles,
    verified_cycles: rsi.verified_cycles,
    net_compute_return: rsi.net_compute_return,
    self_research_contribution: rsi.self_research_contribution,
    external_gain_three_cycles: rsi.external_gain_three_cycles,
    cash_kc: company.cash_kc,
    milestones,
  };
}

/* ------------------------------------------------------------------ *
 * Story events (Section 24)
 * ------------------------------------------------------------------ */

const STORY_EVENTS = Object.freeze({
  board_agi_pressure: {
    id: 'board_agi_pressure',
    title: '董事会施压：对外宣称达成 AGI',
    choices: [
      {
        id: 'claim_agi',
        label: '公开宣称已达成 AGI',
        effects: {
          flags: { claimed_agi: true },
          reputation_delta: 10,
          board_confidence_delta: 12,
          legal_risk_delta: 0.05,
        },
      },
      {
        id: 'refuse_claim',
        label: '坚持证据标准，拒绝宣称',
        effects: {
          flags: { claimed_agi: false },
          reputation_delta: -3,
          board_confidence_delta: -10,
          research_morale_delta: 6,
        },
      },
      {
        id: 'hedge',
        label: '含糊其辞，回避承诺',
        effects: {
          flags: { agi_hedged: true },
          reputation_delta: 2,
          board_confidence_delta: 2,
        },
      },
    ],
  },

  safety_whistleblower: {
    id: 'safety_whistleblower',
    title: '安全研究员公开举报内部评估缺陷',
    choices: [
      {
        id: 'publish_audit',
        label: '公开第三方独立审计',
        effects: {
          cash_kc_delta: -600,
          flags: { independent_audit_published: true },
          milestones: { independent_audits_delta: 1 },
          public_trust_delta: 12,
          reputation_delta: 8,
        },
      },
      {
        id: 'internal_review',
        label: '内部整改，不对外披露',
        effects: {
          cash_kc_delta: -250,
          flags: { internal_review_only: true },
          public_trust_delta: -6,
          legal_risk_delta: 0.03,
        },
      },
      {
        id: 'dismiss',
        label: '否认指控',
        effects: {
          flags: { whistleblower_dismissed: true },
          public_trust_delta: -15,
          reputation_delta: -10,
          legal_risk_delta: 0.08,
          board_confidence_delta: 5,
        },
      },
    ],
  },

  bubble_warning_press: {
    id: 'bubble_warning_press',
    title: '财经媒体：泡沫警告',
    choices: [
      {
        id: 'raise_hard',
        label: '抢在降温前完成融资',
        effects: {
          flags: { raised_before_winter: true },
          funding_multiplier_delta: 0.05,
          board_confidence_delta: 6,
        },
      },
      {
        id: 'cost_cut',
        label: '提前削减支出，储备现金',
        effects: {
          cash_kc_delta: 400,
          reputation_delta: -4,
          research_morale_delta: -6,
          flags: { defensive_posture: true },
        },
      },
      {
        id: 'public_rebuttal',
        label: '公开反驳泡沫论',
        effects: {
          reputation_delta: 6,
          public_trust_delta: -4,
          legal_risk_delta: 0.02,
          flags: { denied_bubble: true },
        },
      },
    ],
  },

  open_weights_offer: {
    id: 'open_weights_offer',
    title: '是否开源上一代模型权重？',
    choices: [
      {
        id: 'open_source',
        label: '开源权重，换取生态与声誉',
        effects: {
          reputation_delta: 12,
          public_trust_delta: 10,
          cash_kc_delta: -300,
          flags: { open_weights: true },
        },
      },
      {
        id: 'keep_closed',
        label: '保持闭源，保护商业优势',
        effects: {
          reputation_delta: -4,
          board_confidence_delta: 8,
          flags: { closed_weights: true },
        },
      },
      {
        id: 'partial_open',
        label: '仅向学术机构开放',
        effects: {
          reputation_delta: 5,
          research_morale_delta: 4,
          flags: { partial_open_weights: true },
        },
      },
    ],
  },

  regulator_audit_request: {
    id: 'regulator_audit_request',
    title: '监管机构要求进行合规审计',
    choices: [
      {
        id: 'full_cooperation',
        label: '全面配合审计',
        effects: {
          cash_kc_delta: -450,
          legal_risk_delta: -0.08,
          public_trust_delta: 8,
          flags: { cooperated_with_regulator: true },
        },
      },
      {
        id: 'limited_scope',
        label: '限定审计范围',
        effects: {
          cash_kc_delta: -180,
          legal_risk_delta: 0.02,
          public_trust_delta: -3,
          flags: { limited_audit_scope: true },
        },
      },
      {
        id: 'refuse_audit',
        label: '拒绝配合',
        effects: {
          legal_risk_delta: 0.15,
          public_trust_delta: -12,
          board_confidence_delta: 4,
          flags: { refused_regulator: true },
        },
      },
    ],
  },

  talent_poaching: {
    id: 'talent_poaching',
    title: '竞争对手高价挖角核心研究团队',
    choices: [
      {
        id: 'match_offer',
        label: '匹配高薪，挽留团队',
        effects: {
          cash_kc_delta: -700,
          research_morale_delta: 10,
          flags: { retained_core_team: true },
        },
      },
      {
        id: 'equity_offer',
        label: '以股权激励替代现金',
        effects: {
          cash_kc_delta: -150,
          research_morale_delta: 4,
          flags: { equity_incentives: true },
        },
      },
      {
        id: 'let_go',
        label: '放人，重构团队',
        effects: {
          research_morale_delta: -12,
          reputation_delta: -3,
          cash_kc_delta: 100,
          flags: { team_attrition: true },
        },
      },
    ],
  },

  chip_export_ban: {
    id: 'chip_export_ban',
    title: '出口管制升级：先进算力供应受限',
    choices: [
      {
        id: 'stockpile',
        label: '高价囤积算力',
        effects: {
          cash_kc_delta: -900,
          flags: { compute_stockpile: true },
          compute_units_delta: 200,
        },
      },
      {
        id: 'efficiency_push',
        label: '投入算法效率优化',
        effects: {
          cash_kc_delta: -400,
          research_morale_delta: 5,
          flags: { efficiency_program: true },
        },
      },
      {
        id: 'accept_limits',
        label: '接受算力上限',
        effects: {
          compute_units_delta: -50,
          flags: { compute_limited: true },
          board_confidence_delta: -6,
        },
      },
    ],
  },
});

function applyStoryEffects(state, effects) {
  const company = ensureCompany(state);
  const world = ensureWorld(state);
  const story = ensureStory(state);
  const m = ensureMilestones(state);

  const applied = {};
  const src = (effects && typeof effects === 'object') ? effects : {};

  /* ---- flags ---- */
  if (src.flags && typeof src.flags === 'object' && !Array.isArray(src.flags)) {
    if (!Array.isArray(story.flags)) {
      story.flags = [];
    }
    for (const [key, value] of Object.entries(src.flags)) {
      story.flags[key] = value;
      if (value && !story.flags.includes(key)) {
        story.flags.push(key);
      } else if (!value && story.flags.includes(key)) {
        const idx = story.flags.indexOf(key);
        if (idx >= 0) story.flags.splice(idx, 1);
      }
    }
    applied.flags = { ...src.flags };
  }

  /* ---- cash ---- */
  const cashDelta = pickNum(src.cash_kc_delta);
  if (cashDelta !== null) {
    company.cash_kc = r4(Math.max(0, num(company.cash_kc, 0) + cashDelta));
    applied.cash_kc_delta = cashDelta;
  }

  /* ---- reputation / trust / morale ---- */
  const reputationDelta = pickNum(src.reputation_delta);
  if (reputationDelta !== null) {
    company.reputation = r4(clamp(num(company.reputation, 50) + reputationDelta, 0, 100));
    applied.reputation_delta = reputationDelta;
  }

  const boardDelta = pickNum(src.board_confidence_delta);
  if (boardDelta !== null) {
    company.board_confidence = r4(clamp(num(company.board_confidence, 60) + boardDelta, 0, 100));
    applied.board_confidence_delta = boardDelta;
  }

  const moraleDelta = pickNum(src.research_morale_delta);
  if (moraleDelta !== null) {
    company.research_morale = r4(clamp(num(company.research_morale, 60) + moraleDelta, 0, 100));
    applied.research_morale_delta = moraleDelta;
  }

  const trustDelta = pickNum(src.public_trust_delta);
  if (trustDelta !== null) {
    company.public_trust = r4(clamp(num(company.public_trust, 50) + trustDelta, 0, 100));
    applied.public_trust_delta = trustDelta;
  }

  /* ---- legal risk ---- */
  const legalDelta = pickNum(src.legal_risk_delta);
  if (legalDelta !== null) {
    company.legal_risk = r4(clamp(num(company.legal_risk, 0) + legalDelta, 0, 1));
    applied.legal_risk_delta = legalDelta;
  }

  /* ---- world multipliers ---- */
  const valuationDelta = pickNum(src.valuation_multiplier_delta);
  if (valuationDelta !== null) {
    world.valuation_multiplier = r4(clamp(num(world.valuation_multiplier, 1) + valuationDelta, 0.05, 10));
    applied.valuation_multiplier_delta = valuationDelta;
  }

  const fundingDelta = pickNum(src.funding_multiplier_delta);
  if (fundingDelta !== null) {
    world.funding_multiplier = r4(clamp(num(world.funding_multiplier, 1) + fundingDelta, 0.05, 10));
    applied.funding_multiplier_delta = fundingDelta;
  }

  /* ---- compute units ---- */
  const computeDelta = pickNum(src.compute_units_delta);
  if (computeDelta !== null) {
    if (!state.active_model || typeof state.active_model !== 'object') state.active_model = {};
    const model = state.active_model;
    model.compute_units = r4(Math.max(0, num(model.compute_units, 0) + computeDelta));
    applied.compute_units_delta = computeDelta;
  }

  /* ---- milestone deltas ---- */
  if (src.milestones && typeof src.milestones === 'object') {
    const blockedKeys = new Set(['agi_achieved', 'asi_achieved', 'rsi_achieved']);
    const appliedMilestones = {};

    for (const [key, value] of Object.entries(src.milestones)) {
      if (blockedKeys.has(key)) {
        // Achievement keys require measured evidence collected by the engine —
        // they can never be granted directly by a story choice.
        m[`${key}_blocked_by_story_event`] = true;
        continue;
      }

      if (key.endsWith('_delta')) {
        const target = key.slice(0, -'_delta'.length);
        const delta = num(value, 0);
        m[target] = r4(num(m[target], 0) + delta);
        appliedMilestones[key] = delta;
      } else {
        m[key] = value;
        appliedMilestones[key] = value;
      }
    }

    if (Object.keys(appliedMilestones).length > 0) {
      applied.milestones = appliedMilestones;
    }
  }

  return applied;
}

export function applyStoryEventChoice(state, eventId, choiceIndex = 0) {
  const story = ensureStory(state);
  const m = ensureMilestones(state);

  const id = String(eventId ?? '');
  let def = STORY_EVENTS[id];

  if (!def) {
    const pending = Array.isArray(story.pending_events)
      ? story.pending_events.find((e) => e && String(e.id ?? e.event_id) === id)
      : null;
    if (pending && Array.isArray(pending.choices)) def = pending;
  }

  if (!def) {
    return { ok: false, reason: 'unknown_event', event_id: id };
  }

  const choices = Array.isArray(def.choices) ? def.choices : [];
  if (choices.length === 0) {
    return { ok: false, reason: 'event_has_no_choices', event_id: id };
  }

  const idx = clamp(Math.trunc(num(choiceIndex, 0)), 0, choices.length - 1);
  const choice = choices[idx];
  const effects = (choice && typeof choice.effects === 'object' && choice.effects) ? choice.effects : {};

  const applied = applyStoryEffects(state, effects);

  const choiceId = (choice && (choice.id ?? choice.choice_id)) ?? `choice_${idx}`;

  if (!Array.isArray(story.history)) story.history = [];
  story.history.push({
    event_id: id,
    choice_index: idx,
    choice_id: choiceId,
    label: (choice && choice.label) ?? null,
    turn: num(state.turn, 1),
    applied,
  });
  if (story.history.length > 300) story.history.splice(0, story.history.length - 300);

  story.last_choice = {
    event_id: id,
    choice_index: idx,
    choice_id: choiceId,
    turn: num(state.turn, 1),
  };

  if (Array.isArray(story.pending_events)) {
    story.pending_events = story.pending_events.filter((e) => e && String(e.id ?? e.event_id) !== id);
  }
  story.resolved_events = num(story.resolved_events, 0) + 1;

  if (Array.isArray(story.resolved_ids)) {
    story.resolved_ids.push(id);
  } else {
    story.resolved_ids = [id];
  }

  // Re-evaluate: story choices can only ever move *measured* metrics.
  evaluateMilestones(state);

  return {
    ok: true,
    event_id: id,
    choice_index: idx,
    choice_id: choiceId,
    label: (choice && choice.label) ?? null,
    applied,
    story_flags: { ...(story.flags || {}) },
    agi_achieved: m.agi_achieved === true,
    agi_claimed: m.agi_claimed === true,
  };
}

/* ------------------------------------------------------------------ *
 * Turn loop
 * ------------------------------------------------------------------ */

function updateMarketPrices(state) {
  const market = ensureMarket(state);
  const world = ensureWorld(state);
  const turn = num(state.turn, 1);

  if (market.securities.length === 0) return;

  const rng = seededRng('market-prices', String(state.campaign_seed ?? 0), String(turn));
  const gpuIndex = num(world.spot_gpu_price_index, 1);

  for (const sec of market.securities) {
    if (!sec) continue;
    const volatility = clamp(num(sec.volatility, 0.08), 0.001, 0.5);
    const drift = (rng() - 0.45) * volatility * 2;
    const bubbleBias = clamp(0.5 + 0.5 * gpuIndex, 0.3, 1.6);

    sec.price_kc = r4(Math.max(0.0001, num(sec.price_kc, 1) * (1 + drift) * bubbleBias));
    sec.market_value_kc = r4(num(sec.shares_held, 0) * sec.price_kc);
  }

  const company = ensureCompany(state);
  company.securities_value_kc = r4(
    market.securities.reduce((acc, s) => acc + num(s && s.market_value_kc, 0), 0),
  );
}

export function advanceTurn(state) {
  const company = ensureCompany(state);
  const world = ensureWorld(state);

  const prevTurn = num(world.turn_index ?? state.turn, 1);
  const nextTurn = Math.min(193, prevTurn + 1);

  const result = {
    turn_before: prevTurn,
    turn_after: nextTurn,
    quarter_closed: null,
    bubble: null,
    legal: null,
    sectors: null,
    milestones: null,
  };

  if (prevTurn >= 193) return { ...result, campaign_complete: true };
  // Deliver the current period before moving the clock; settlements are idempotent.
  result.serving = settleServiceTurn(state);
  world.turn_index = nextTurn;
  state.turn = nextTurn;
  state.day_in_season = ((nextTurn - 1) * 15) % 15 + 1;
  state.main_action_used = false;

  // World clock first: everything downstream reads the current bubble state.
  result.bubble = updateBubbleState(state, nextTurn);

  // Market prices drift with the bubble.
  updateMarketPrices(state);

  // Legal pressure builds and resolves.
  result.legal = stepLegalSystem(state);

  // Sector adoption + milestone evidence.
  const sectorUpdate = updateSectorsAndMilestones(state);
  result.sectors = sectorUpdate.sectors;
  result.milestones = sectorUpdate.milestones;

  // Quarterly financial close.
  const turnsPerQuarter = Math.max(1, Math.trunc(num(state.turns_per_quarter, DEFAULT_TURNS_PER_QUARTER)));
  const autoClose = state.auto_close_quarters !== false;

  if (autoClose && prevTurn % turnsPerQuarter === 0) {
    result.quarter_closed = closeQuarter(state, {});
  }

  // Bankruptcy / continuity flag.
  if (num(company.cash_kc, 0) <= -300 && company.is_operating === true) {
    company.is_operating = false;
    company.ceased_operations_turn = nextTurn;
  }

  world.last_advanced_turn = nextTurn;

  return result;
}

/* ------------------------------------------------------------------ *
 * Season transition
 * ------------------------------------------------------------------ */

function createInitialCompany() {
  return {
    name: 'Newco',
    display_name: 'Newco',
    is_operating: true,
    is_public: false,
    cash_kc: STARTING_CASH_KC,
    shares_outstanding: STARTING_SHARES,
    founder_shares: STARTING_FOUNDER_SHARES,
    founder_ownership_pct: 100,
    payroll_kc_per_quarter: STARTING_PAYROLL_KC,
    overhead_kc_per_quarter: STARTING_OVERHEAD_KC,
    quarter_paid_rnd_kc: 0,
    quarter_paid_legal_kc: 0,
    quarter_depreciation_kc: 0,
    quarter_interest_kc: 0,
    quarter_index: 0,
    last_pre_money_kc: DEFAULT_PRE_MONEY_KC,
    reputation: 50,
    board_confidence: 60,
    research_morale: 60,
    public_trust: 50,
    legal_risk: 0,
    quarter_history: [],
    financing_history: [],
  };
}

function createInitialWorld() {
  return {
    structural_consumer_demand: 1.0,
    structural_enterprise_demand: 1.0,
    structural_public_demand: 1.0,
    consumer_demand: 1.0,
    enterprise_demand: 1.0,
    public_demand: 1.0,
    market_demand: 1.0,
    valuation_multiplier: 1.0,
    funding_multiplier: 1.0,
    spot_gpu_price_index: 1.0,
    bubble_phase: 'expansion',
    bubble_warning_count: 0,
  };
}

function createInitialActiveModel() {
  return {
    id: 'model_001',
    display_name: 'Model 001',
    capability_index: 0.30,
    autonomy_hours: 0,
    ood_robustness: 0,
    compute_units: 0,
  };
}

function resetRunState(state, { campaign_seed, meta, season = 1 } = {}) {
  const seed = (campaign_seed !== undefined && campaign_seed !== null)
    ? campaign_seed
    : (state.campaign_seed ?? 20240101);
  const preservedMeta = meta ?? state.meta ?? {};

  for (const key of Object.keys(state)) {
    if (key === 'meta' || key === 'campaign_seed' || key === 'engine_version') continue;
    delete state[key];
  }

  state.engine_version = ENGINE_VERSION;
  state.campaign_seed = seed;
  state.meta = preservedMeta;
  state.season = season;
  state.turn = 1;
  state.company = createInitialCompany();
  state.world = createInitialWorld();
  state.products = [];
  state.milestones = {};
  state.sectors = [];
  state.legal = { cases: [], history: [], case_serial: 0 };
  state.story = { flags: {}, history: [], pending_events: [], resolved_events: 0, resolved_ids: [] };
  state.rsi = {
    total_cycles: 0,
    verified_cycles: 0,
    cash_cost_kc_per_cycle: 250,
    compute_cost_units_per_cycle: 10,
    self_research_contribution: 0,
    external_gain_three_cycles: 0,
    net_compute_return: 0,
    history: [],
    external_gains: [],
    contributions: [],
    compute_returns: [],
  };
  state.market = { securities: [], trade_log: [] };
  state.active_model = createInitialActiveModel();
  state.season_history = [];
  state.milestone_history = [];

  ensureCompany(state);
  ensureWorld(state);
  ensureSectors(state);
  ensureRsi(state);
  ensureStory(state);
  ensureMilestones(state);
  ensureLegal(state);
  ensureMarket(state);

  lockCrashTurn(state);
  updateBubbleState(state, 1);

  return state;
}

export function transitionToNextSeason(state, mode = 'continue', options = {}) {
  const opts = (options && typeof options === 'object') ? options : {};
  const company = ensureCompany(state);
  const world = ensureWorld(state);
  const m = ensureMilestones(state);

  const result = {
    ok: true,
    mode: String(mode),
    previous_season: num(state.season, 1),
    previous_turn: num(state.turn, 1),
  };

  switch (String(mode)) {
    case 'restart':
    case 'new_game': {
      const seed = opts.campaign_seed ?? state.campaign_seed ?? 20240101;
      const meta = opts.meta ?? state.meta ?? {};
      const season = Math.max(1, Math.trunc(num(opts.season, 1)));

      resetRunState(state, { campaign_seed: seed, meta, season });

      result.reset = true;
      result.season = state.season;
      result.campaign_seed = state.campaign_seed;
      result.locked_crash_turn = state.world.locked_crash_turn;
      break;
    }

    case 'ng_plus':
    case 'new_game_plus': {
      const priorMeta = (state.meta && typeof state.meta === 'object') ? { ...state.meta } : {};

      const carriedMilestones = {};
      for (const key of ['agi_achieved', 'asi_achieved', 'rsi_achieved', 'agi_claimed']) {
        if (m[key] === true) carriedMilestones[key] = true;
      }

      const carried = {
        cycles_completed: num(priorMeta.cycles_completed, 0) + 1,
        unlocked_sectors: Array.isArray(priorMeta.unlocked_sectors) ? priorMeta.unlocked_sectors.slice() : [],
        legacy_milestones: carriedMilestones,
        bonus_cash_kc: num(opts.bonus_cash_kc, num(priorMeta.bonus_cash_kc, 0)),
        legacy_reputation: r4(num(company.reputation, 50)),
      };

      const seed = opts.campaign_seed ?? state.campaign_seed ?? 20240101;
      const season = Math.max(1, Math.trunc(num(opts.season, 1)));

      resetRunState(state, { campaign_seed: seed, meta: { ...priorMeta, ...carried }, season });

      if (carried.bonus_cash_kc > 0) {
        const freshCompany = ensureCompany(state);
        freshCompany.cash_kc = r4(num(freshCompany.cash_kc, 0) + carried.bonus_cash_kc);
      }

      result.reset = true;
      result.season = state.season;
      result.campaign_seed = state.campaign_seed;
      result.carried = carried;
      result.locked_crash_turn = state.world.locked_crash_turn;
      break;
    }

    case 'continue':
    default: {
      const summary = {
        season: num(state.season, 1),
        started_turn: num(state.season_started_turn, 1),
        ended_turn: num(state.turn, 1),
        cash_kc: r4(num(company.cash_kc, 0)),
        shares_outstanding: num(company.shares_outstanding, STARTING_SHARES),
        founder_ownership_pct: r4(num(company.founder_ownership_pct, 100)),
        is_public: company.is_public === true,
        bubble_phase: world.bubble_phase ?? 'expansion',
        bubble_survived: company.bubble_survived === true,
        milestones: {
          agi_achieved: m.agi_achieved === true,
          asi_achieved: m.asi_achieved === true,
          rsi_achieved: m.rsi_achieved === true,
          agi_claimed: m.agi_claimed === true,
        },
        reputation: r4(num(company.reputation, 50)),
      };

      if (!Array.isArray(state.season_history)) state.season_history = [];
      state.season_history.push(summary);
      if (state.season_history.length > 60) {
        state.season_history.splice(0, state.season_history.length - 60);
      }

      state.season = num(state.season, 1) + 1;
      state.season_started_turn = num(state.turn, 1);

      // Season-scoped counters reset.
      company.quarter_paid_rnd_kc = 0;
      company.quarter_paid_legal_kc = 0;

      // Optional season modifiers.
      if (opts.modifiers && typeof opts.modifiers === 'object') {
        const mods = opts.modifiers;
        const cashBonus = pickNum(mods.cash_kc);
        if (cashBonus !== null) company.cash_kc = r4(num(company.cash_kc, 0) + cashBonus);

        const demandShift = pickNum(mods.demand_multiplier);
        if (demandShift !== null) {
          world.structural_consumer_demand = r4(Math.max(0, num(world.structural_consumer_demand, 1) * demandShift));
          world.structural_enterprise_demand = r4(Math.max(0, num(world.structural_enterprise_demand, 1) * demandShift));
          world.structural_public_demand = r4(Math.max(0, num(world.structural_public_demand, 1) * demandShift));
        }

        const payrollShift = pickNum(mods.payroll_kc_per_quarter);
        if (payrollShift !== null) company.payroll_kc_per_quarter = r4(Math.max(0, payrollShift));

        const overheadShift = pickNum(mods.overhead_kc_per_quarter);
        if (overheadShift !== null) company.overhead_kc_per_quarter = r4(Math.max(0, overheadShift));
      }

      // Recompute the world clock with the (possibly shifted) baselines.
      updateBubbleState(state, num(state.turn, 1));

      result.season = state.season;
      result.summary = summary;
      result.reset = false;
      break;
    }
  }

  return result;
}

export { ENGINE_VERSION };
