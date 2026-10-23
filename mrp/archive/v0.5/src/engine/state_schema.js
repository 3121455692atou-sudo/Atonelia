import { CAPABILITY_KEYS, LEGACY_STAT_KEYS } from '../data/model_capabilities.js';
import { isNpcIdentity } from '../data/character_roles.js';
import { validatePersonalHistory } from './personal_events.js';
import { createServiceEconomy, validateServiceEconomy } from './service_economy.js';
/**
 * /Users/mac/model-raising-plan/src/engine/state_schema.js
 *
 * 变量字典 v0.1.0 的运行时 Schema 实现。
 *
 * 约定：
 *  - 每个工厂函数都包含变量字典中的全部字段与默认值。
 *  - ratio 为 0—1；0—100 指标不混用；金额单位为 kc（千虚构点）。
 *  - 可空字段（parent_model_id / locked_crash_turn / ...）显式写 null。
 *  - 便捷镜像字段：.id / .name 与主键字段保持同步。
 */

import {
  BALANCE_RULES,
  START_PROFILES,
  HISTORIES,
  SUPPORT_CARDS,
} from "../data/catalog_core.js";
import {
  DATASET_TEMPLATES,
  JOB_SECTORS,
  SECURITIES,
} from "../data/catalog_world.js";

/* ------------------------------------------------------------------ *
 * 1. 常量与枚举
 * ------------------------------------------------------------------ */

const STAT_KEYS = CAPABILITY_KEYS;

const STAT_DEFAULT = 450;
const STAT_CAP_DEFAULT = 720;

const BUBBLE_PHASES = Object.freeze([
  "expansion",
  "warning",
  "crash",
  "winter",
  "recovery",
  "normal",
]);

const GAME_MODES = Object.freeze([
  "standard",
  "ironman",
  "sandbox",
  "ranked_season",
]);

const WEIGHT_ACCESS_VALUES = Object.freeze([
  "public_weights",
  "restricted_weights",
  "closed",
]);

const TRAINING_AUTHORITY_VALUES = Object.freeze([
  "licensed_weights",
  "parallel_lab_role",
  "authorized_api_finetune",
  "none",
]);

const RELEASE_POLICY_VALUES = Object.freeze([
  "closed_api",
  "open_weights",
  "open_recipe",
  "delayed_open",
]);

const TRAINING_MODES = Object.freeze(["full", "lora", "qlora"]);
const TRAINING_PRESETS = Object.freeze(["steady", "balanced", "push"]);
const FOCUS_STATS = ['mixed', ...CAPABILITY_KEYS];

const DATASET_FORMATS = Object.freeze([
  "raw_text",
  "instruction",
  "preference_pairs",
  "verified_tasks",
  "trajectories",
]);

const RIGHTS_STATUSES = Object.freeze([
  "licensed",
  "public_domain",
  "consented",
  "unclear",
  "restricted",
  "prohibited",
]);

const LABEL_METHODS = Object.freeze([
  "single",
  "pairwise",
  "triple_vote",
  "process",
  "solver",
  "active",
  "hybrid",
]);

const RESEARCH_STAGES = Object.freeze([
  "paper",
  "toy_pilot",
  "scale_pilot",
  "production",
  "paused",
  "complete",
]);

const LEGAL_EXPOSURE_KINDS = Object.freeze([
  "copyright",
  "unauthorized_distillation",
  "privacy",
  "labor_dispute",
  "misleading_claims",
  "benchmark_misrepresentation",
  "unsupported_agi_claim",
  "product_liability",
  "license_breach",
]);

const LEGAL_CASE_STAGES = Object.freeze([
  "notice",
  "evidence",
  "negotiation",
  "hearing",
  "settlement",
  "judgment",
  "appeal",
  "closed",
]);

const LEGAL_OUTCOMES = Object.freeze([
  "pending",
  "dismissed",
  "settled",
  "liable",
  "not_liable",
  "appeal_pending",
]);

const MARKET_TYPES = Object.freeze(["consumer", "enterprise", "public", "edge"]);

const RACE_ORIGINS = Object.freeze([
  "game_simulation",
  "casual_byok",
  "modded",
]);

const TEACHER_ACCESS_LEVELS = Object.freeze([
  "response_only",
  "licensed_whitebox",
  "owned",
]);

const LEAGUE_TIERS = Object.freeze(["edge", "small", "open", "frontier"]);
const THINKING_MODES = Object.freeze(["quick", "balanced", "deliberate"]);
const CHECKPOINT_INTERVALS = Object.freeze([1, 2, 4]);

const STARTER_SUPPORT_CARD_IDS = Object.freeze([
  "card_curriculum_designer",
  "card_old_memo",
  "card_3am_ops",
  "card_strict_examiner",
]);

const STARTER_SUPPORT_BOND = 20;
const STARTER_DATASET_ID = "data_starter_sft";
const STARTER_DATASET_NAME = "合规教学示范包";
const STARTER_PRODUCT_ID = "product_starter_service";
const STARTER_PRODUCT_NAME = "初创模型托管服务";

const DEFAULT_COMPANY_ID = "company_player";
const DEFAULT_COMPANY_NAME = "未命名模型公司";
const DEFAULT_MODEL_ID = "model_player_001";
const DEFAULT_MODEL_NAME = "Qwen3 / 我的下一版";
const DEFAULT_CAMPAIGN_ID = "campaign_demo";
const DEFAULT_CAMPAIGN_SEED = 20261019;
const DEFAULT_RULESET_VERSION = "0.1.0";

/* ------------------------------------------------------------------ *
 * 2. 通用工具
 * ------------------------------------------------------------------ */

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function cleanObject(value) {
  return isPlainObject(value) ? value : {};
}

function asArray(value) {
  if (Array.isArray(value)) return value.slice();
  if (value && typeof value === "object") return Object.values(value);
  return [];
}

function pickFirst(source, keys) {
  if (!isPlainObject(source)) return undefined;
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function strOr(primary, fallback) {
  if (nonEmptyString(primary)) return primary;
  if (typeof primary === "string" && primary !== "") return primary;
  return fallback;
}

function numOr(value, fallback) {
  return isFiniteNumber(value) ? value : fallback;
}

function toUnitInterval(value, fallback) {
  let n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n > 1) n = n / 100;
  return clamp(n, 0, 1);
}

function unit(value, fallback) {
  if (value === undefined || value === null) return fallback;
  return toUnitInterval(value, fallback);
}

function roundTo(value, decimals) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}

function ruleValue(path, fallback) {
  const segments = String(path).split(".");
  let node = BALANCE_RULES;
  for (const segment of segments) {
    if (!isPlainObject(node)) return fallback;
    node = node[segment];
    if (node === undefined) return fallback;
  }
  return node === undefined ? fallback : node;
}

function assignNumeric(target, source, keys) {
  if (!isPlainObject(target) || !isPlainObject(source)) return target;
  for (const key of keys) {
    const value = source[key];
    if (isFiniteNumber(value)) target[key] = value;
  }
  return target;
}

function assignBoolean(target, source, keys) {
  if (!isPlainObject(target) || !isPlainObject(source)) return target;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "boolean") target[key] = value;
  }
  return target;
}

function assignString(target, source, keys) {
  if (!isPlainObject(target) || !isPlainObject(source)) return target;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value !== "") target[key] = value;
  }
  return target;
}

function buildIndex(entries, primaryKey, secondaryKey) {
  const index = new Map();
  for (const entry of entries) {
    if (!isPlainObject(entry)) continue;
    const id = pickFirst(entry, [primaryKey, secondaryKey]);
    if (typeof id === "string" && id !== "" && !index.has(id)) index.set(id, entry);
  }
  return index;
}

/**
 * 把 overrides 覆盖到 base 上，跳过指定键。
 */
function applyOverrides(base, overrides, skipKeys) {
  const skip = new Set(skipKeys || []);
  for (const key of Object.keys(overrides)) {
    if (skip.has(key)) continue;
    if (overrides[key] === undefined) continue;
    base[key] = overrides[key];
  }
  return base;
}

/* ------------------------------------------------------------------ *
 * 3. 导出基础工具
 * ------------------------------------------------------------------ */

/**
 * 数值钳制；非有限数返回下界（若下界有限），否则返回 0。
 */
export function clamp(val, min, max) {
  let lo = isFiniteNumber(min) ? min : -Infinity;
  let hi = isFiniteNumber(max) ? max : Infinity;
  if (lo > hi) {
    const swap = lo;
    lo = hi;
    hi = swap;
  }
  const n = typeof val === "number" ? val : Number(val);
  if (!Number.isFinite(n)) {
    return Number.isFinite(lo) ? lo : 0;
  }
  return Math.min(Math.max(n, lo), hi);
}

/**
 * 稳定的 32 位无符号字符串散列（FNV-1a + 雪崩混淆）。
 */
export function hashString(str) {
  const text = str === undefined || str === null ? "" : String(str);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 0x2545f491);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2f);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * 由战役种子与上下文派生的确定性 [0, 1) 浮点。
 */
export function seededFloat(
  campaignSeed,
  systemName,
  turnIndex,
  entityId,
  actionId,
) {
  const seedNumber = Number(campaignSeed);
  const seed = Number.isFinite(seedNumber) ? Math.floor(seedNumber) : 0;
  const turnNumber = Number(turnIndex);
  const turn = Number.isFinite(turnNumber) ? Math.floor(turnNumber) : 0;
  const key = [
    String(seed),
    systemName === undefined || systemName === null ? "" : String(systemName),
    String(turn),
    entityId === undefined || entityId === null ? "" : String(entityId),
    actionId === undefined || actionId === null ? "" : String(actionId),
  ].join("|");

  let h = hashString(key);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

/**
 * 深拷贝纯数据对象；优先使用 structuredClone。
 */
export function deepClone(obj) {
  if (obj === null || typeof obj !== "object") return obj;
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(obj);
    } catch (error) {
      /* 回退到手工深拷贝 */
    }
  }
  if (Array.isArray(obj)) return obj.map((item) => deepClone(item));
  if (obj instanceof Date) return new Date(obj.getTime());
  if (obj instanceof Map) {
    const copy = new Map();
    obj.forEach((value, key) => copy.set(deepClone(key), deepClone(value)));
    return copy;
  }
  if (obj instanceof Set) {
    const copy = new Set();
    obj.forEach((value) => copy.add(deepClone(value)));
    return copy;
  }
  const out = {};
  for (const key of Object.keys(obj)) {
    out[key] = deepClone(obj[key]);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 4. Stats
 * ------------------------------------------------------------------ */

function makeStats(baseValue, overrides) {
  const result = {};
  for (const key of STAT_KEYS) result[key] = baseValue;
  if (isPlainObject(overrides)) {
    for (const key of STAT_KEYS) {
      const value = overrides[key];
      if (isFiniteNumber(value)) result[key] = value;
    }
  }
  for (const key of STAT_KEYS) {
    result[key] = clamp(result[key], 0, 1000);
  }
  return result;
}

export function createStats(overrides = {}) {
  return makeStats(STAT_DEFAULT, overrides);
}

/* ------------------------------------------------------------------ *
 * 5. WorldState
 * ------------------------------------------------------------------ */

export function createWorldState(overrides = {}) {
  const o = cleanObject(overrides);

  const base = {
    turn_index: 1,
    bubble_phase: "expansion",
    bubble_heat: 35,
    locked_crash_turn: null,
    bubble_crash_turn: null,
    bubble_warning_count: 0,
    valuation_multiplier: 1,
    funding_multiplier: 1,
    consumer_demand: 1,
    enterprise_demand: 1,
    public_demand: 1,
    spot_gpu_price_index: 1,
    social_stability: 75,
    energy_capacity_index: 1,
    realized_automation_share: 0,
    new_job_pressure: 0,
    inflation_index: 1,
    structural_consumer_demand: 1,
    structural_enterprise_demand: 1,
    structural_public_demand: 1,
  };

  applyOverrides(base, o, []);

  base.turn_index = Math.floor(clamp(numOr(base.turn_index, 1), 1, 193));
  if (!BUBBLE_PHASES.includes(base.bubble_phase)) base.bubble_phase = "expansion";
  base.bubble_heat = clamp(numOr(base.bubble_heat, 35), 0, 100);
  base.locked_crash_turn =
    base.locked_crash_turn === null || base.locked_crash_turn === undefined
      ? null
      : Math.floor(clamp(numOr(base.locked_crash_turn, 84), 84, 108));
  base.bubble_crash_turn =
    base.bubble_crash_turn === null || base.bubble_crash_turn === undefined
      ? null
      : Math.floor(Math.max(1, numOr(base.bubble_crash_turn, 1)));
  base.bubble_warning_count = Math.floor(
    clamp(numOr(base.bubble_warning_count, 0), 0, 2),
  );
  base.valuation_multiplier = clamp(numOr(base.valuation_multiplier, 1), 0.1, 3);
  base.funding_multiplier = clamp(numOr(base.funding_multiplier, 1), 0, 1);
  base.consumer_demand = clamp(numOr(base.consumer_demand, 1), 0, 2);
  base.enterprise_demand = clamp(numOr(base.enterprise_demand, 1), 0, 2);
  base.public_demand = clamp(numOr(base.public_demand, 1), 0, 2);
  base.spot_gpu_price_index = clamp(
    numOr(base.spot_gpu_price_index, 1),
    0.1,
    5,
  );
  base.social_stability = clamp(numOr(base.social_stability, 75), 0, 100);
  base.energy_capacity_index = clamp(
    numOr(base.energy_capacity_index, 1),
    0,
    10,
  );
  base.realized_automation_share = clamp(
    numOr(base.realized_automation_share, 0),
    0,
    1,
  );
  base.new_job_pressure = clamp(numOr(base.new_job_pressure, 0), 0, 100);
  base.inflation_index = clamp(numOr(base.inflation_index, 1), 0.1, 5);
  base.structural_consumer_demand = clamp(
    numOr(base.structural_consumer_demand, 1),
    0,
    2,
  );
  base.structural_enterprise_demand = clamp(
    numOr(base.structural_enterprise_demand, 1),
    0,
    2,
  );
  base.structural_public_demand = clamp(
    numOr(base.structural_public_demand, 1),
    0,
    2,
  );

  return base;
}

/* ------------------------------------------------------------------ *
 * 6. QuarterRecord
 * ------------------------------------------------------------------ */

export function createQuarterRecord(overrides = {}) {
  const o = cleanObject(overrides);

  const base = {
    quarter_index: 1,
    revenue_kc: 0,
    paid_rnd_kc: 0,
    cash_cogs_kc: 0,
    payroll_kc: 80,
    overhead_kc: 30,
    depreciation_kc: 0,
    interest_kc: 0,
    tax_kc: 0,
    net_income_kc: 0,
    cash_delta_from_close_kc: 0,
    paid_legal_kc: 0,
  };

  applyOverrides(base, o, []);

  base.quarter_index = Math.max(1, Math.floor(numOr(base.quarter_index, 1)));
  base.revenue_kc = Math.max(0, numOr(base.revenue_kc, 0));
  base.paid_rnd_kc = Math.max(0, numOr(base.paid_rnd_kc, 0));
  base.cash_cogs_kc = Math.max(0, numOr(base.cash_cogs_kc, 0));
  base.payroll_kc = Math.max(0, numOr(base.payroll_kc, 80));
  base.overhead_kc = Math.max(0, numOr(base.overhead_kc, 30));
  base.depreciation_kc = Math.max(0, numOr(base.depreciation_kc, 0));
  base.interest_kc = Math.max(0, numOr(base.interest_kc, 0));
  base.tax_kc = Math.max(0, numOr(base.tax_kc, 0));
  base.net_income_kc = numOr(base.net_income_kc, 0);
  base.cash_delta_from_close_kc = numOr(base.cash_delta_from_close_kc, 0);
  base.paid_legal_kc = Math.max(0, numOr(base.paid_legal_kc, 0));

  return base;
}

/* ------------------------------------------------------------------ *
 * 7. CompanyState
 * ------------------------------------------------------------------ */

export function createCompanyState(overrides = {}) {
  const o = cleanObject(overrides);
  const companyId = strOr(o.company_id, strOr(o.id, DEFAULT_COMPANY_ID));
  const displayName = strOr(o.display_name, strOr(o.name, DEFAULT_COMPANY_NAME));
  const marketCapProvided = isFiniteNumber(o.market_cap_kc);

  const base = {
    company_id: companyId,
    display_name: displayName,
    cash_kc: 2400,
    debt_kc: 0,
    reserved_cash_kc: 0,
    reputation: 20,
    trust: 60,
    hype: 20,
    ecosystem: 10,
    audit_readiness: 30,
    cluster_memory_gb: 96,
    cluster_compute_cu: 140,
    cluster_readiness: 85,
    payroll_kc_per_quarter: 80,
    overhead_kc_per_quarter: 30,
    quarter_paid_rnd_kc: 0,
    quarter_paid_legal_kc: 0,
    quarter_serving_revenue_kc: 0,
    quarter_serving_cogs_kc: 0,
    quarter_serving_units: 0,
    quarter_serving_turns: 0,
    shares_outstanding: 1000000,
    founder_shares: 1000000,
    is_public: false,
    share_price_kc: 0.01,
    market_cap_kc: 10000,
    last_pre_money_kc: 10000,
    quarter_history: [],
    negative_cash_turns: 0,
    rescue_used: false,
    automation_dividend_ratio: 0,
    policies: [],
    bubble_survived: false,
    defense_level: 35,
    moat_strength: 25,
    board_pressure: 10,
    investments: [],
    is_operating: true,
  };

  applyOverrides(base, o, ["company_id", "id", "display_name", "name"]);

  base.company_id = companyId;
  base.id = companyId;
  base.display_name = displayName;
  base.name = displayName;

  base.cash_kc = numOr(base.cash_kc, 2400);
  base.debt_kc = Math.max(0, numOr(base.debt_kc, 0));
  base.reserved_cash_kc = Math.max(0, numOr(base.reserved_cash_kc, 0));
  base.reputation = clamp(numOr(base.reputation, 20), 0, 100);
  base.trust = clamp(numOr(base.trust, 60), 0, 100);
  base.hype = clamp(numOr(base.hype, 20), 0, 100);
  base.ecosystem = clamp(numOr(base.ecosystem, 10), 0, 100);
  base.audit_readiness = clamp(numOr(base.audit_readiness, 30), 0, 100);
  base.cluster_memory_gb = Math.max(1, numOr(base.cluster_memory_gb, 96));
  base.cluster_compute_cu = Math.max(1, numOr(base.cluster_compute_cu, 140));
  base.cluster_readiness = clamp(numOr(base.cluster_readiness, 85), 0, 100);
  base.payroll_kc_per_quarter = Math.max(
    0,
    numOr(base.payroll_kc_per_quarter, 80),
  );
  base.overhead_kc_per_quarter = Math.max(
    0,
    numOr(base.overhead_kc_per_quarter, 30),
  );
  base.quarter_paid_rnd_kc = Math.max(0, numOr(base.quarter_paid_rnd_kc, 0));
  base.quarter_paid_legal_kc = Math.max(
    0,
    numOr(base.quarter_paid_legal_kc, 0),
  );
  base.shares_outstanding = Math.max(
    1,
    Math.floor(numOr(base.shares_outstanding, 1000000)),
  );
  base.founder_shares = Math.max(
    0,
    Math.floor(numOr(base.founder_shares, 1000000)),
  );
  base.is_public = typeof base.is_public === "boolean" ? base.is_public : false;
  base.share_price_kc = Math.max(0, numOr(base.share_price_kc, 0.01));
  base.last_pre_money_kc = Math.max(0, numOr(base.last_pre_money_kc, 10000));
  base.market_cap_kc = marketCapProvided
    ? Math.max(0, numOr(base.market_cap_kc, 0))
    : Math.max(0, roundTo(base.share_price_kc * base.shares_outstanding, 6));
  base.quarter_history = Array.isArray(base.quarter_history)
    ? base.quarter_history.slice()
    : [];
  base.negative_cash_turns = Math.floor(
    clamp(numOr(base.negative_cash_turns, 0), 0, 3),
  );
  base.rescue_used = base.rescue_used === true;
  base.automation_dividend_ratio = clamp(
    numOr(base.automation_dividend_ratio, 0),
    0,
    1,
  );
  base.policies = Array.isArray(base.policies) ? base.policies.slice() : [];
  base.bubble_survived = base.bubble_survived === true;
  base.defense_level = clamp(numOr(base.defense_level, 35), 0, 100);
  base.moat_strength = clamp(numOr(base.moat_strength, 25), 0, 100);
  base.board_pressure = clamp(numOr(base.board_pressure, 10), 0, 100);
  base.investments = Array.isArray(base.investments)
    ? base.investments.map((position) => createInvestmentPosition(position))
    : [];
  base.is_operating = base.is_operating !== false;

  return base;
}

/* ------------------------------------------------------------------ *
 * 8. Checkpoint
 * ------------------------------------------------------------------ */

export function createCheckpoint(modelOrState, turnIndexOrId = 0, overrides = {}) {
  const isGameState =
    isPlainObject(modelOrState) && isPlainObject(modelOrState.active_model);
  const src = isGameState
    ? modelOrState.active_model
    : isPlainObject(modelOrState)
    ? modelOrState
    : {};
  const o = cleanObject(overrides);

  const modelId = strOr(src.model_id, strOr(src.id, DEFAULT_MODEL_ID));
  const idFromSecondArg =
    typeof turnIndexOrId === "string" && turnIndexOrId.trim().length > 0
      ? turnIndexOrId.trim()
      : "";
  const turnNumber =
    typeof turnIndexOrId === "number"
      ? turnIndexOrId
      : isGameState
      ? Number(modelOrState.world?.turn_index ?? modelOrState.turn ?? 0)
      : Number(turnIndexOrId);
  const turn = Number.isFinite(turnNumber)
    ? Math.max(0, Math.floor(turnNumber))
    : 0;
  const existingCount = Array.isArray(src.checkpoints)
    ? src.checkpoints.length
    : 0;
  const generatedId = idFromSecondArg || `cp_${modelId}_t${turn}_${existingCount}`;
  const checkpointId = strOr(
    o.checkpoint_id,
    strOr(o.id, generatedId),
  );

  const statsSource = Object.assign(
    {},
    isPlainObject(src.stats) ? src.stats : {},
    isPlainObject(o.stats) ? o.stats : {},
  );

  const base = {
    checkpoint_id: checkpointId,
    created_turn: turn,
    stats: createStats(statsSource),
    optimizer_health: clamp(numOr(src.optimizer_health, 100), 0, 100),
    overfit: clamp(numOr(src.overfit, 0), 0, 100),
    forgetting: clamp(numOr(src.forgetting, 0), 0, 100),
    reward_hacking: clamp(numOr(src.reward_hacking, 0), 0, 100),
    sycophancy: clamp(numOr(src.sycophancy, 0), 0, 100),
    valid: true,
  };

  applyOverrides(base, o, [
    "checkpoint_id",
    "id",
    "created_turn",
    "stats",
    "optimizer_health",
    "overfit",
    "forgetting",
    "reward_hacking",
    "sycophancy",
    "valid",
  ]);

  base.checkpoint_id = checkpointId;
  base.id = checkpointId;
  base.created_turn = Math.max(
    0,
    Math.floor(numOr(o.created_turn, numOr(base.created_turn, turn))),
  );
  base.stats = createStats(statsSource);
  base.optimizer_health = clamp(
    numOr(o.optimizer_health, numOr(base.optimizer_health, 100)),
    0,
    100,
  );
  base.overfit = clamp(numOr(o.overfit, numOr(base.overfit, 0)), 0, 100);
  base.forgetting = clamp(numOr(o.forgetting, numOr(base.forgetting, 0)), 0, 100);
  base.reward_hacking = clamp(
    numOr(o.reward_hacking, numOr(base.reward_hacking, 0)),
    0,
    100,
  );
  base.sycophancy = clamp(
    numOr(o.sycophancy, numOr(base.sycophancy, 0)),
    0,
    100,
  );
  base.valid = o.valid === undefined ? base.valid !== false : o.valid === true;

  if (isGameState) {
    if (!Array.isArray(src.checkpoints)) src.checkpoints = [];
    if (
      !src.checkpoints.some(
        (cp) => cp && (cp.checkpoint_id === checkpointId || cp.id === checkpointId),
      )
    ) {
      src.checkpoints.push(base);
    }
  }

  return base;
}

/* ------------------------------------------------------------------ *
 * 9. ModelState
 * ------------------------------------------------------------------ */

export function createModelState(overrides = {}) {
  const o = cleanObject(overrides);
  const modelId = strOr(o.model_id, strOr(o.id, DEFAULT_MODEL_ID));
  const displayName = strOr(o.display_name, strOr(o.name, DEFAULT_MODEL_NAME));

  const base = {
    model_id: modelId,
    display_name: displayName,
    history_id: "qwen_ecosystem",
    generation_index: 1,
    season_index: 1,
    parent_model_id: null,
    teacher_model_ids: [],
    architecture_id: "ar_dense",
    sim_total_params_b: 4,
    sim_active_params_b: 4,
    real_total_params_b: null,
    weight_access: "public_weights",
    training_authority: "licensed_weights",
    release_policy: "open_weights",
    license_id: "review_per_version",
    stats: createStats(),
    stat_caps: makeStats(STAT_CAP_DEFAULT),
    skills: [],
    support_card_ids: [],
    support_bond: {},
    selected_recipe_id: "sft",
    training_mode: "lora",
    context_tokens: 8192,
    batch_size: 1,
    lora_rank: 16,
    inference_quant_bits: 16,
    kernel_maturity: 80,
    distributed_maturity: 65,
    overfit: 5,
    forgetting: 0,
    reward_hacking: 0,
    sycophancy: 5,
    over_refusal: 5,
    harmful_compliance: 15,
    contamination: 0,
    audit_confidence: 0.25,
    optimizer_health: 100,
    training_action_count: 0,
    checkpoint_interval_actions: 2,
    actions_since_checkpoint: 0,
    checkpoints: [],
    training_provenance_ids: [],
    readable_trace_quality: 50,
    ood_robustness: 0.5,
    autonomy_hours: 0,
  };

  applyOverrides(base, o, ["model_id", "id", "display_name", "name"]);

  base.model_id = modelId;
  base.id = modelId;
  base.display_name = displayName;
  base.name = displayName;

  base.history_id = strOr(base.history_id, "qwen_ecosystem");
  base.generation_index = Math.max(
    1,
    Math.floor(numOr(base.generation_index, 1)),
  );
  base.season_index = Math.max(1, Math.floor(numOr(base.season_index, 1)));
  base.parent_model_id = nonEmptyString(base.parent_model_id)
    ? base.parent_model_id
    : null;
  base.teacher_model_ids = Array.isArray(base.teacher_model_ids)
    ? base.teacher_model_ids.filter((value) => typeof value === "string").slice(0, 2)
    : [];
  base.architecture_id = strOr(base.architecture_id, "ar_dense");
  base.sim_total_params_b = clamp(
    numOr(base.sim_total_params_b, 4),
    0.05,
    10000,
  );
  base.sim_active_params_b = clamp(
    numOr(base.sim_active_params_b, 4),
    0.01,
    10000,
  );
  if (base.sim_active_params_b > base.sim_total_params_b) {
    base.sim_active_params_b = base.sim_total_params_b;
  }
  base.real_total_params_b =
    base.real_total_params_b === null || base.real_total_params_b === undefined
      ? null
      : Math.max(0, numOr(base.real_total_params_b, 0));
  if (!WEIGHT_ACCESS_VALUES.includes(base.weight_access)) {
    base.weight_access = "public_weights";
  }
  if (!TRAINING_AUTHORITY_VALUES.includes(base.training_authority)) {
    base.training_authority = "licensed_weights";
  }
  if (!RELEASE_POLICY_VALUES.includes(base.release_policy)) {
    base.release_policy = "open_weights";
  }
  base.license_id = strOr(base.license_id, "review_per_version");

  base.stats = createStats(base.stats);
  base.stat_caps = makeStats(STAT_CAP_DEFAULT, base.stat_caps);

  base.skills = Array.isArray(base.skills) ? base.skills.slice() : [];
  base.support_card_ids = Array.isArray(base.support_card_ids)
    ? base.support_card_ids.filter((value) => typeof value === "string").slice(0, 4)
    : [];
  base.support_bond = isPlainObject(base.support_bond)
    ? Object.assign({}, base.support_bond)
    : {};
  for (const cardId of Object.keys(base.support_bond)) {
    base.support_bond[cardId] = clamp(
      numOr(base.support_bond[cardId], 0),
      0,
      100,
    );
  }
  base.selected_recipe_id = strOr(base.selected_recipe_id, "sft");
  if (!TRAINING_MODES.includes(base.training_mode)) base.training_mode = "lora";

  base.context_tokens = Math.floor(
    clamp(numOr(base.context_tokens, 8192), 256, 2097152),
  );
  base.batch_size = Math.floor(clamp(numOr(base.batch_size, 1), 1, 256));
  base.lora_rank = Math.floor(clamp(numOr(base.lora_rank, 16), 1, 256));
  base.inference_quant_bits = clamp(
    numOr(base.inference_quant_bits, 16),
    1,
    16,
  );
  base.kernel_maturity = clamp(numOr(base.kernel_maturity, 80), 0, 100);
  base.distributed_maturity = clamp(
    numOr(base.distributed_maturity, 65),
    0,
    100,
  );
  base.overfit = clamp(numOr(base.overfit, 5), 0, 100);
  base.forgetting = clamp(numOr(base.forgetting, 0), 0, 100);
  base.reward_hacking = clamp(numOr(base.reward_hacking, 0), 0, 100);
  base.sycophancy = clamp(numOr(base.sycophancy, 5), 0, 100);
  base.over_refusal = clamp(numOr(base.over_refusal, 5), 0, 100);
  base.harmful_compliance = clamp(numOr(base.harmful_compliance, 15), 0, 100);
  base.contamination = clamp(numOr(base.contamination, 0), 0, 100);
  base.audit_confidence = clamp(numOr(base.audit_confidence, 0.25), 0, 1);
  base.optimizer_health = clamp(numOr(base.optimizer_health, 100), 0, 100);
  base.training_action_count = Math.max(
    0,
    Math.floor(numOr(base.training_action_count, 0)),
  );
  base.checkpoint_interval_actions = CHECKPOINT_INTERVALS.includes(
    base.checkpoint_interval_actions,
  )
    ? base.checkpoint_interval_actions
    : 2;
  base.actions_since_checkpoint = Math.floor(
    clamp(numOr(base.actions_since_checkpoint, 0), 0, 4),
  );
  base.checkpoints = Array.isArray(base.checkpoints)
    ? base.checkpoints.map((checkpoint) => deepClone(checkpoint))
    : [];
  base.training_provenance_ids = Array.isArray(base.training_provenance_ids)
    ? base.training_provenance_ids.slice()
    : [];
  base.readable_trace_quality = clamp(
    numOr(base.readable_trace_quality, 50),
    0,
    100,
  );
  base.ood_robustness = clamp(numOr(base.ood_robustness, 0.5), 0, 1);
  base.autonomy_hours = Math.max(0, numOr(base.autonomy_hours, 0));

  return base;
}

/* ------------------------------------------------------------------ *
 * 10. Dataset
 * ------------------------------------------------------------------ */

export function createDataset(overridesOrState = {}, maybeOverrides = null) {
  const isState =
    isPlainObject(overridesOrState) &&
    (isPlainObject(overridesOrState.active_model) ||
      isPlainObject(overridesOrState.company) ||
      Array.isArray(overridesOrState.datasets)) &&
    isPlainObject(maybeOverrides);
  const o = cleanObject(isState ? maybeOverrides : overridesOrState);
  const datasetId = strOr(o.dataset_id, strOr(o.id, ""));
  const displayName = strOr(o.display_name, strOr(o.name, ""));

  const base = {
    dataset_id: datasetId,
    display_name: displayName,
    format: "instruction",
    records_k: 100,
    quality: 0.8,
    diversity: 0.7,
    label_quality: 0.8,
    novelty: 1,
    uses: 0,
    duplicate_ratio: 0.05,
    contamination_ratio: 0,
    synthetic_ratio: 0,
    correlated_error_ratio: 0.05,
    rights_status: "licensed",
    provenance_ids: [],
    audit_confidence: 0.3,
    domain_weights: createStats(),
    license_cost_kc: 0,
    allowed_training: true,
    teacher_id: null,
    teacher_coverage: 0,
    displayed_quality_estimate: 0.75,
  };

  applyOverrides(base, o, ["dataset_id", "id", "display_name", "name"]);

  base.dataset_id = datasetId;
  base.id = datasetId;
  base.display_name = displayName;
  base.name = displayName;

  if (!DATASET_FORMATS.includes(base.format)) base.format = "instruction";
  base.records_k = Math.max(0.1, numOr(base.records_k, 100));
  base.quality = unit(base.quality, 0.8);
  base.diversity = unit(base.diversity, 0.7);
  base.label_quality = unit(base.label_quality, 0.8);
  base.novelty = unit(base.novelty, 1);
  base.uses = Math.max(0, Math.floor(numOr(base.uses, 0)));
  base.duplicate_ratio = unit(base.duplicate_ratio, 0.05);
  base.contamination_ratio = unit(base.contamination_ratio, 0);
  base.synthetic_ratio = unit(base.synthetic_ratio, 0);
  base.correlated_error_ratio = unit(base.correlated_error_ratio, 0.05);
  if (!RIGHTS_STATUSES.includes(base.rights_status)) base.rights_status = "licensed";
  base.provenance_ids = Array.isArray(base.provenance_ids)
    ? base.provenance_ids.slice()
    : [];
  base.audit_confidence = unit(base.audit_confidence, 0.3);
  base.domain_weights = createStats(base.domain_weights);
  base.license_cost_kc = Math.max(0, numOr(base.license_cost_kc, 0));
  base.allowed_training = base.allowed_training !== false;
  base.teacher_id = nonEmptyString(base.teacher_id) ? base.teacher_id : null;
  base.teacher_coverage = unit(base.teacher_coverage, 0);
  base.displayed_quality_estimate = unit(base.displayed_quality_estimate, 0.75);

  if (isState) {
    if (!Array.isArray(overridesOrState.datasets)) {
      overridesOrState.datasets = [];
    }
    if (
      datasetId &&
      !overridesOrState.datasets.some(
        (d) => d && (d.dataset_id === datasetId || d.id === datasetId),
      )
    ) {
      overridesOrState.datasets.push(base);
    }
  }

  return base;
}

/* ------------------------------------------------------------------ *
 * 11. TrainingRequest
 * ------------------------------------------------------------------ */

export function createTrainingRequest(overridesOrState = {}, maybeOverrides = null) {
  const isState =
    isPlainObject(overridesOrState) &&
    (isPlainObject(overridesOrState.active_model) ||
      isPlainObject(overridesOrState.company) ||
      Array.isArray(overridesOrState.datasets)) &&
    isPlainObject(maybeOverrides);
  const o = cleanObject(isState ? maybeOverrides : overridesOrState);
  const actionId = strOr(o.action_id, strOr(o.id, ""));
  const firstDatasetFromArray =
    Array.isArray(o.dataset_ids) && o.dataset_ids.length > 0
      ? String(o.dataset_ids[0])
      : "";
  const datasetId = strOr(o.dataset_id, strOr(firstDatasetFromArray, "data_starter_sft"));

  const base = {
    action_id: actionId,
    recipe_id: "sft",
    dataset_id: datasetId,
    preset: "balanced",
    training_mode: strOr(o.training_mode, strOr(o.mode, "lora")),
    epochs: 1,
    replay_ratio: 0.15,
    verifier_quality: 0.8,
    reward_model_quality: 0.7,
    judge_independence: 0.7,
    teacher_gap: 0.3,
    teacher_coverage: 0.8,
    teacher_authorized: true,
    group_size: 8,
    kl_strength: 0.1,
    reasoning_budget_tokens: 2048,
    environment_quality: 0.75,
    mask_ratio: 0.5,
    denoise_steps: 16,
    accept_legal_risk: false,
    focus_stat: strOr(o.focus_stat, strOr(o.focus, "mixed")),
  };

  applyOverrides(base, o, ["action_id", "id", "dataset_id"]);

  base.action_id = actionId;
  base.id = actionId;
  base.dataset_id = datasetId;
  base.recipe_id = strOr(base.recipe_id, "sft");
  if (!TRAINING_PRESETS.includes(base.preset)) base.preset = "balanced";
  if (!TRAINING_MODES.includes(base.training_mode)) base.training_mode = "lora";
  base.epochs = clamp(numOr(base.epochs, 1), 0.25, 8);
  base.replay_ratio = clamp(numOr(base.replay_ratio, 0.15), 0, 1);
  base.verifier_quality = clamp(numOr(base.verifier_quality, 0.8), 0, 1);
  base.reward_model_quality = clamp(
    numOr(base.reward_model_quality, 0.7),
    0,
    1,
  );
  base.judge_independence = clamp(numOr(base.judge_independence, 0.7), 0, 1);
  base.teacher_gap = clamp(numOr(base.teacher_gap, 0.3), 0, 1);
  base.teacher_coverage = clamp(numOr(base.teacher_coverage, 0.8), 0, 1);
  base.teacher_authorized = base.teacher_authorized !== false;
  base.group_size = Math.floor(clamp(numOr(base.group_size, 8), 2, 32));
  base.kl_strength = clamp(numOr(base.kl_strength, 0.1), 0, 1);
  base.reasoning_budget_tokens = Math.floor(
    clamp(numOr(base.reasoning_budget_tokens, 2048), 128, 32768),
  );
  base.environment_quality = clamp(
    numOr(base.environment_quality, 0.75),
    0,
    1,
  );
  base.mask_ratio = clamp(numOr(base.mask_ratio, 0.5), 0, 1);
  base.denoise_steps = Math.floor(clamp(numOr(base.denoise_steps, 16), 2, 64));
  base.accept_legal_risk = base.accept_legal_risk === true;
  if (!FOCUS_STATS.includes(base.focus_stat)) base.focus_stat = "mixed";

  return base;
}

/* ------------------------------------------------------------------ *
 * 12. AnnotationContract
 * ------------------------------------------------------------------ */

export function createAnnotationContract(overrides = {}) {
  const o = cleanObject(overrides);
  const contractId = strOr(o.contract_id, strOr(o.id, ""));
  const datasetId = strOr(o.dataset_id, "");

  const base = {
    contract_id: contractId,
    team_template_id: "hybrid_panel",
    dataset_id: datasetId,
    label_method: "pairwise",
    records_k: 100,
    remaining_turns: 2,
    base_skill: 80,
    domain_fit: 0.8,
    fair_pay_ratio: 1,
    gold_check_ratio: 0.1,
    independent_audit_ratio: 0.1,
    correlated_error_ratio: 0.1,
    attrition_risk: 0.05,
    paid_cost_kc: 0,
  };

  applyOverrides(base, o, ["contract_id", "id", "dataset_id"]);

  base.contract_id = contractId;
  base.id = contractId;
  base.dataset_id = datasetId;
  base.team_template_id = strOr(base.team_template_id, "hybrid_panel");
  if (!LABEL_METHODS.includes(base.label_method)) base.label_method = "pairwise";
  base.records_k = Math.max(0, numOr(base.records_k, 100));
  base.remaining_turns = Math.max(
    0,
    Math.floor(numOr(base.remaining_turns, 2)),
  );
  base.base_skill = clamp(numOr(base.base_skill, 80), 0, 100);
  base.domain_fit = clamp(numOr(base.domain_fit, 0.8), 0, 1);
  base.fair_pay_ratio = clamp(numOr(base.fair_pay_ratio, 1), 0.1, 3);
  base.gold_check_ratio = clamp(numOr(base.gold_check_ratio, 0.1), 0, 1);
  base.independent_audit_ratio = clamp(
    numOr(base.independent_audit_ratio, 0.1),
    0,
    1,
  );
  base.correlated_error_ratio = clamp(
    numOr(base.correlated_error_ratio, 0.1),
    0,
    1,
  );
  base.attrition_risk = clamp(numOr(base.attrition_risk, 0.05), 0, 1);
  base.paid_cost_kc = Math.max(0, numOr(base.paid_cost_kc, 0));

  return base;
}

/* ------------------------------------------------------------------ *
 * 13. ResearchProject
 * ------------------------------------------------------------------ */

export function createResearchProject(overrides = {}) {
  const o = cleanObject(overrides);
  const projectId = strOr(o.project_id, strOr(o.id, ""));
  const researchId = strOr(o.research_id, "");

  const base = {
    project_id: projectId,
    research_id: researchId,
    stage: "paper",
    progress_rp: 0,
    required_rp: 100,
    remaining_turns: 0,
    evidence_quality: 0.3,
    replication_count: 0,
    scale_validation_passed: false,
    paid_cost_kc: 0,
    architecture_target_id: null,
  };

  applyOverrides(base, o, ["project_id", "id", "research_id"]);

  base.project_id = projectId;
  base.id = projectId;
  base.research_id = researchId;
  if (!RESEARCH_STAGES.includes(base.stage)) base.stage = "paper";
  base.progress_rp = Math.max(0, numOr(base.progress_rp, 0));
  base.required_rp = Math.max(1, numOr(base.required_rp, 100));
  base.remaining_turns = Math.max(
    0,
    Math.floor(numOr(base.remaining_turns, 0)),
  );
  base.evidence_quality = clamp(numOr(base.evidence_quality, 0.3), 0, 1);
  base.replication_count = Math.max(
    0,
    Math.floor(numOr(base.replication_count, 0)),
  );
  base.scale_validation_passed = base.scale_validation_passed === true;
  base.paid_cost_kc = Math.max(0, numOr(base.paid_cost_kc, 0));
  base.architecture_target_id = nonEmptyString(base.architecture_target_id)
    ? base.architecture_target_id
    : null;

  return base;
}

/* ------------------------------------------------------------------ *
 * 14. LegalExposure
 * ------------------------------------------------------------------ */

export function createLegalExposure(overrides = {}) {
  const o = cleanObject(overrides);
  const exposureId = strOr(o.exposure_id, strOr(o.id, ""));

  const base = {
    exposure_id: exposureId,
    kind: "copyright",
    created_turn: 0,
    source_record_ids: [],
    severity: 30,
    discovery_probability: 0.1,
    remediated: false,
    fictional_only: true,
  };

  applyOverrides(base, o, ["exposure_id", "id"]);

  base.exposure_id = exposureId;
  base.id = exposureId;
  if (!LEGAL_EXPOSURE_KINDS.includes(base.kind)) base.kind = "copyright";
  base.created_turn = Math.max(0, Math.floor(numOr(base.created_turn, 0)));
  base.source_record_ids = Array.isArray(base.source_record_ids)
    ? base.source_record_ids.slice()
    : [];
  base.severity = clamp(numOr(base.severity, 30), 0, 100);
  base.discovery_probability = clamp(
    numOr(base.discovery_probability, 0.1),
    0,
    1,
  );
  base.remediated = base.remediated === true;
  base.fictional_only = base.fictional_only !== false;

  return base;
}

/* ------------------------------------------------------------------ *
 * 15. LegalCase
 * ------------------------------------------------------------------ */

export function createLegalCase(overrides = {}) {
  const o = cleanObject(overrides);
  const caseId = strOr(o.case_id, strOr(o.id, ""));

  const base = {
    case_id: caseId,
    exposure_ids: [],
    jurisdiction_id: "fictional_market_a",
    stage: "notice",
    evidence_strength: 0.4,
    license_coverage: 0.2,
    counsel_quality: 0.5,
    claim_kc: 150,
    legal_cost_kc: 0,
    reserve_kc: 0,
    deadline_turn: 0,
    affected_model_ids: [],
    outcome: "pending",
  };

  applyOverrides(base, o, ["case_id", "id"]);

  base.case_id = caseId;
  base.id = caseId;
  base.exposure_ids = Array.isArray(base.exposure_ids)
    ? base.exposure_ids.slice()
    : [];
  base.jurisdiction_id = strOr(base.jurisdiction_id, "fictional_market_a");
  if (!LEGAL_CASE_STAGES.includes(base.stage)) base.stage = "notice";
  base.evidence_strength = clamp(numOr(base.evidence_strength, 0.4), 0, 1);
  base.license_coverage = clamp(numOr(base.license_coverage, 0.2), 0, 1);
  base.counsel_quality = clamp(numOr(base.counsel_quality, 0.5), 0, 1);
  base.claim_kc = Math.max(0, numOr(base.claim_kc, 150));
  base.legal_cost_kc = Math.max(0, numOr(base.legal_cost_kc, 0));
  base.reserve_kc = Math.max(0, numOr(base.reserve_kc, 0));
  base.deadline_turn = Math.max(0, Math.floor(numOr(base.deadline_turn, 0)));
  base.affected_model_ids = Array.isArray(base.affected_model_ids)
    ? base.affected_model_ids.slice()
    : [];
  if (!LEGAL_OUTCOMES.includes(base.outcome)) base.outcome = "pending";

  return base;
}

/* ------------------------------------------------------------------ *
 * 16. Product
 * ------------------------------------------------------------------ */

export function createProduct(overrides = {}) {
  const o = cleanObject(overrides);
  const productId = strOr(o.product_id, strOr(o.id, ""));
  const displayName = strOr(o.display_name, strOr(o.name, productId));

  const base = {
    product_id: productId,
    model_ids: [],
    dispatcher_model_id: null,
    market_type: "enterprise",
    price_kc_per_unit: 0.08,
    variable_cost_kc_per_unit: 0.03,
    demand_units: 1000,
    service_capacity_units: 800,
    retention: 0.8,
    quality_fit: 0.7,
    release_turn: 0,
    is_suspended: false,
  };

  applyOverrides(base, o, ["product_id", "id", "display_name", "name"]);

  base.product_id = productId;
  base.id = productId;
  base.display_name = displayName;
  base.name = displayName;
  base.model_ids = Array.isArray(base.model_ids)
    ? base.model_ids.filter((value) => typeof value === "string").slice()
    : [];
  base.dispatcher_model_id = nonEmptyString(base.dispatcher_model_id)
    ? base.dispatcher_model_id
    : null;
  if (!MARKET_TYPES.includes(base.market_type)) base.market_type = "enterprise";
  base.price_kc_per_unit = Math.max(0, numOr(base.price_kc_per_unit, 0.08));
  base.variable_cost_kc_per_unit = Math.max(
    0,
    numOr(base.variable_cost_kc_per_unit, 0.03),
  );
  base.demand_units = Math.max(0, numOr(base.demand_units, 1000));
  base.service_capacity_units = Math.max(
    0,
    numOr(base.service_capacity_units, 800),
  );
  base.retention = clamp(numOr(base.retention, 0.8), 0, 1);
  base.quality_fit = clamp(numOr(base.quality_fit, 0.7), 0, 1);
  base.release_turn = Math.max(0, Math.floor(numOr(base.release_turn, 0)));
  base.is_suspended = base.is_suspended === true;

  return base;
}

/* ------------------------------------------------------------------ *
 * 17. SectorState
 * ------------------------------------------------------------------ */

export function createSectorState(overrides = {}) {
  const o = cleanObject(overrides);
  const sectorId = strOr(o.sector_id, strOr(o.id, ""));
  const displayName = strOr(o.display_name, strOr(o.name, sectorId));

  const base = {
    sector_id: sectorId,
    capability_coverage: 0,
    deployment_share: 0,
    economic_feasibility: 0,
    legal_permission: 0,
    acceptance: 0.5,
    robotics_maturity: 0,
    physical_capacity: 0,
    incident_rate: 0.1,
    sector_completed: false,
  };

  applyOverrides(base, o, ["sector_id", "id", "display_name", "name"]);

  base.sector_id = sectorId;
  base.id = sectorId;
  base.display_name = displayName;
  base.name = displayName;
  base.capability_coverage = clamp(numOr(base.capability_coverage, 0), 0, 1);
  base.deployment_share = clamp(numOr(base.deployment_share, 0), 0, 1);
  base.economic_feasibility = clamp(
    numOr(base.economic_feasibility, 0),
    0,
    1,
  );
  base.legal_permission = clamp(numOr(base.legal_permission, 0), 0, 1);
  base.acceptance = clamp(numOr(base.acceptance, 0.5), 0, 1);
  base.robotics_maturity = clamp(numOr(base.robotics_maturity, 0), 0, 100);
  base.physical_capacity = clamp(numOr(base.physical_capacity, 0), 0, 1);
  base.incident_rate = clamp(numOr(base.incident_rate, 0.1), 0, 1);
  base.sector_completed = base.sector_completed === true;

  return base;
}

/* ------------------------------------------------------------------ *
 * 18. MilestoneState
 * ------------------------------------------------------------------ */

export function createMilestoneState(overrides = {}) {
  const o = cleanObject(overrides);

  const base = {
    agi_achieved: false,
    asi_achieved: false,
    rsi_achieved: false,
    domain_pass_rate: 0,
    worst_domain_pass_rate: 0,
    critical_incident_rate: 0.1,
    independent_audits: 0,
    expert_speedup_ratio: 1,
    domain_top_rate: 0,
    verified_discoveries: 0,
    verified_rsi_cycles: 0,
    self_research_contribution: 0,
    external_gain_three_cycles: 0,
    net_compute_return: 0,
    automation_hold_turns: 0,
  };

  applyOverrides(base, o, []);

  base.agi_achieved = base.agi_achieved === true;
  base.asi_achieved = base.asi_achieved === true;
  base.rsi_achieved = base.rsi_achieved === true;
  base.domain_pass_rate = clamp(numOr(base.domain_pass_rate, 0), 0, 1);
  base.worst_domain_pass_rate = clamp(
    numOr(base.worst_domain_pass_rate, 0),
    0,
    1,
  );
  base.critical_incident_rate = clamp(
    numOr(base.critical_incident_rate, 0.1),
    0,
    1,
  );
  base.independent_audits = Math.max(
    0,
    Math.floor(numOr(base.independent_audits, 0)),
  );
  base.expert_speedup_ratio = Math.max(0, numOr(base.expert_speedup_ratio, 1));
  base.domain_top_rate = clamp(numOr(base.domain_top_rate, 0), 0, 1);
  base.verified_discoveries = Math.max(
    0,
    Math.floor(numOr(base.verified_discoveries, 0)),
  );
  base.verified_rsi_cycles = Math.max(
    0,
    Math.floor(numOr(base.verified_rsi_cycles, 0)),
  );
  base.self_research_contribution = clamp(
    numOr(base.self_research_contribution, 0),
    0,
    1,
  );
  base.external_gain_three_cycles = clamp(
    numOr(base.external_gain_three_cycles, 0),
    0,
    1,
  );
  base.net_compute_return = Math.max(0, numOr(base.net_compute_return, 0));
  base.automation_hold_turns = Math.max(
    0,
    Math.floor(numOr(base.automation_hold_turns, 0)),
  );

  return base;
}

/* ------------------------------------------------------------------ *
 * 19. RaceResult
 * ------------------------------------------------------------------ */

export function createRaceResult(overrides = {}) {
  const o = cleanObject(overrides);
  const raceId = strOr(o.race_id, strOr(o.id, ""));
  const officialProvided = isFiniteNumber(o.official_score);

  const base = {
    race_id: raceId,
    benchmark_id: strOr(o.benchmark_id, ""),
    benchmark_version: "1.0",
    model_id: strOr(o.model_id, ""),
    public_score: 0,
    hidden_score: 0,
    official_score: 0,
    compute_used_cu: 0,
    completion_seconds: 0,
    budget_violated: false,
    rank_eligible: true,
    origin: "game_simulation",
    replay_hash: "",
    seed_id: "",
  };

  applyOverrides(base, o, ["race_id", "id"]);

  base.race_id = raceId;
  base.id = raceId;
  base.benchmark_id = strOr(base.benchmark_id, "");
  base.benchmark_version = strOr(base.benchmark_version, "1.0");
  base.model_id = strOr(base.model_id, "");
  base.public_score = clamp(numOr(base.public_score, 0), 0, 1000);
  base.hidden_score = clamp(numOr(base.hidden_score, 0), 0, 1000);
  base.official_score = officialProvided
    ? clamp(numOr(base.official_score, 0), 0, 1000)
    : clamp(roundTo(base.public_score * 0.6 + base.hidden_score * 0.4, 6), 0, 1000);
  base.compute_used_cu = Math.max(0, numOr(base.compute_used_cu, 0));
  base.completion_seconds = Math.max(0, numOr(base.completion_seconds, 0));
  base.budget_violated = base.budget_violated === true;
  base.rank_eligible = base.rank_eligible !== false;
  if (!RACE_ORIGINS.includes(base.origin)) base.origin = "game_simulation";
  base.replay_hash = strOr(base.replay_hash, "");
  base.seed_id = strOr(base.seed_id, "");

  return base;
}

/* ------------------------------------------------------------------ *
 * 20. StoryState
 * ------------------------------------------------------------------ */

export function createStoryState(overrides = {}) {
  const o = cleanObject(overrides);

  const base = {
    flags: [],
    completed_event_ids: [],
    pending_event_ids: [],
    unlocked_cg_ids: [],
    current_chapter: 1,
    ending_id: null,
  };

  applyOverrides(base, o, []);

  base.flags = Array.isArray(base.flags) ? base.flags.slice() : [];
  base.completed_event_ids = Array.isArray(base.completed_event_ids)
    ? base.completed_event_ids.slice()
    : [];
  base.pending_event_ids = Array.isArray(base.pending_event_ids)
    ? base.pending_event_ids.slice()
    : [];
  base.unlocked_cg_ids = Array.isArray(base.unlocked_cg_ids)
    ? base.unlocked_cg_ids.slice()
    : [];
  base.current_chapter = Math.max(
    1,
    Math.floor(numOr(base.current_chapter, 1)),
  );
  base.ending_id = nonEmptyString(base.ending_id) ? base.ending_id : null;

  return base;
}

/* ------------------------------------------------------------------ *
 * 21. TeacherContract
 * ------------------------------------------------------------------ */

export function createTeacherContract(overrides = {}) {
  const o = cleanObject(overrides);
  const contractId = strOr(o.contract_id, strOr(o.id, ""));

  const base = {
    contract_id: contractId,
    teacher_model_id: strOr(o.teacher_model_id, ""),
    access_level: "response_only",
    authorized: true,
    quota_records_k: 100,
    remaining_records_k: 100,
    output_coverage: 0.6,
    expires_turn: 48,
    paid_cost_kc: 0,
    is_revoked: false,
  };

  applyOverrides(base, o, ["contract_id", "id"]);

  base.contract_id = contractId;
  base.id = contractId;
  base.teacher_model_id = strOr(base.teacher_model_id, "");
  if (!TEACHER_ACCESS_LEVELS.includes(base.access_level)) {
    base.access_level = "response_only";
  }
  base.authorized = base.authorized !== false;
  base.quota_records_k = Math.max(0, numOr(base.quota_records_k, 100));
  base.remaining_records_k = clamp(
    numOr(base.remaining_records_k, 100),
    0,
    base.quota_records_k,
  );
  base.output_coverage = clamp(numOr(base.output_coverage, 0.6), 0, 1);
  base.expires_turn = Math.max(0, Math.floor(numOr(base.expires_turn, 48)));
  base.paid_cost_kc = Math.max(0, numOr(base.paid_cost_kc, 0));
  base.is_revoked = base.is_revoked === true;

  return base;
}

/* ------------------------------------------------------------------ *
 * 22. SecurityState
 * ------------------------------------------------------------------ */

export function createSecurityState(overrides = {}) {
  const o = cleanObject(overrides);
  const securityId = strOr(o.security_id, strOr(o.id, ""));
  const displayName = strOr(o.display_name, strOr(o.name, securityId));

  const base = {
    security_id: securityId,
    issuer_id: strOr(o.issuer_id, ""),
    price_kc: 1,
    fundamental_price_kc: 1,
    shares_outstanding: 1000000,
    listed: true,
    liquidity_shares: 10000,
  };

  applyOverrides(base, o, ["security_id", "id", "display_name", "name"]);

  base.security_id = securityId;
  base.id = securityId;
  base.display_name = displayName;
  base.name = displayName;
  base.issuer_id = strOr(base.issuer_id, "");
  base.price_kc = Math.max(0.0001, numOr(base.price_kc, 1));
  base.fundamental_price_kc = Math.max(
    0.0001,
    numOr(base.fundamental_price_kc, 1),
  );
  base.shares_outstanding = Math.max(
    1,
    Math.floor(numOr(base.shares_outstanding, 1000000)),
  );
  base.listed = base.listed !== false;
  base.liquidity_shares = Math.max(
    0,
    Math.floor(numOr(base.liquidity_shares, 10000)),
  );

  return base;
}

/* ------------------------------------------------------------------ *
 * 23. InvestmentPosition
 * ------------------------------------------------------------------ */

export function createInvestmentPosition(overrides = {}) {
  const o = cleanObject(overrides);
  const securityId = strOr(o.security_id, strOr(o.id, ""));

  const base = {
    security_id: securityId,
    shares: 0,
    cost_basis_kc: 0,
  };

  applyOverrides(base, o, ["security_id", "id"]);

  base.security_id = securityId;
  base.id = securityId;
  base.shares = Math.max(0, Math.floor(numOr(base.shares, 0)));
  base.cost_basis_kc = Math.max(0, numOr(base.cost_basis_kc, 0));

  return base;
}

/* ------------------------------------------------------------------ *
 * 24. RaceRequest
 * ------------------------------------------------------------------ */

export function createRaceRequest(overridesOrState = {}, maybeOverrides = null) {
  const isState =
    isPlainObject(overridesOrState) &&
    (isPlainObject(overridesOrState.active_model) ||
      isPlainObject(overridesOrState.company) ||
      Array.isArray(overridesOrState.datasets)) &&
    isPlainObject(maybeOverrides);
  const o = cleanObject(isState ? maybeOverrides : overridesOrState);
  const actionId = strOr(o.action_id, strOr(o.id, ""));

  const base = {
    action_id: actionId,
    benchmark_id: "scholar_cup",
    league_tier: "small",
    thinking_mode: "balanced",
    denoise_steps: 16,
    auto_skill: true,
  };

  applyOverrides(base, o, ["action_id", "id"]);

  base.action_id = actionId;
  base.id = actionId;
  base.benchmark_id = strOr(base.benchmark_id, "scholar_cup");
  if (!LEAGUE_TIERS.includes(base.league_tier)) base.league_tier = "small";
  if (!THINKING_MODES.includes(base.thinking_mode)) {
    base.thinking_mode = "balanced";
  }
  base.denoise_steps = Math.floor(clamp(numOr(base.denoise_steps, 16), 2, 64));
  base.auto_skill = base.auto_skill !== false;

  return base;
}

/* ------------------------------------------------------------------ *
 * 25. 目录数据适配
 * ------------------------------------------------------------------ */

function datasetFromTemplate(template) {
  if (!isPlainObject(template)) {
    const rawId = typeof template === "string" ? template : "";
    return createDataset({
      dataset_id: rawId,
      id: rawId,
      display_name: rawId,
      name: rawId,
    });
  }

  const datasetId = String(
    pickFirst(template, ["dataset_id", "id", "template_id"]) || "",
  );
  const displayName = String(
    pickFirst(template, ["display_name", "name", "title"]) || datasetId,
  );

  return createDataset(
    Object.assign({}, template, {
      dataset_id: datasetId,
      id: datasetId,
      display_name: displayName,
      name: displayName,
      quality: unit(template.quality, 0.8),
      diversity: unit(template.diversity, 0.7),
      label_quality: unit(
        pickFirst(template, ["label_quality", "labelQuality"]),
        0.8,
      ),
      novelty: unit(template.novelty, 1),
      duplicate_ratio: unit(template.duplicate_ratio, 0.05),
      contamination_ratio: unit(template.contamination_ratio, 0),
      synthetic_ratio: unit(template.synthetic_ratio, 0),
      correlated_error_ratio: unit(template.correlated_error_ratio, 0.05),
      audit_confidence: unit(template.audit_confidence, 0.3),
      teacher_coverage: unit(template.teacher_coverage, 0),
      displayed_quality_estimate: unit(
        template.displayed_quality_estimate,
        0.75,
      ),
    }),
  );
}

function sectorFromTemplate(template, index) {
  const fallbackId = `sector_${String(index + 1).padStart(2, "0")}`;
  if (!isPlainObject(template)) {
    const rawId = typeof template === "string" && template !== "" ? template : fallbackId;
    return createSectorState({
      sector_id: rawId,
      id: rawId,
      display_name: rawId,
      name: rawId,
    });
  }

  const sectorId = String(
    pickFirst(template, ["sector_id", "id", "job_id", "template_id"]) ||
      fallbackId,
  );
  const displayName = String(
    pickFirst(template, ["display_name", "name", "label", "title"]) || sectorId,
  );

  return createSectorState(
    Object.assign({}, template, {
      sector_id: sectorId,
      id: sectorId,
      display_name: displayName,
      name: displayName,
      capability_coverage: unit(template.capability_coverage, 0),
      deployment_share: unit(template.deployment_share, 0),
      economic_feasibility: unit(template.economic_feasibility, 0),
      legal_permission: unit(template.legal_permission, 0),
      acceptance: unit(template.acceptance, 0.5),
      physical_capacity: unit(template.physical_capacity, 0),
      incident_rate: unit(template.incident_rate, 0.1),
    }),
  );
}

function securityFromTemplate(template, index) {
  const fallbackId = `security_${String(index + 1).padStart(2, "0")}`;
  if (!isPlainObject(template)) {
    const rawId =
      typeof template === "string" && template !== "" ? template : fallbackId;
    return createSecurityState({
      security_id: rawId,
      id: rawId,
      display_name: rawId,
      name: rawId,
    });
  }

  const securityId = String(
    pickFirst(template, ["security_id", "id", "ticker"]) || fallbackId,
  );
  const displayName = String(
    pickFirst(template, ["display_name", "name", "label"]) || securityId,
  );
  const issuerId = String(
    pickFirst(template, ["issuer_id", "issuer", "company_id"]) || securityId,
  );

  return createSecurityState(
    Object.assign({}, template, {
      security_id: securityId,
      id: securityId,
      display_name: displayName,
      name: displayName,
      issuer_id: issuerId,
      price_kc: Math.max(0.0001, numOr(template.price_kc, 1)),
      fundamental_price_kc: Math.max(
        0.0001,
        numOr(
          pickFirst(template, ["fundamental_price_kc", "fundamental_price"]),
          1,
        ),
      ),
      shares_outstanding: Math.max(
        1,
        Math.floor(numOr(template.shares_outstanding, 1000000)),
      ),
      listed: template.listed !== false,
      liquidity_shares: Math.max(
        0,
        Math.floor(numOr(template.liquidity_shares, 10000)),
      ),
    }),
  );
}

const COMPANY_NUMERIC_KEYS = Object.freeze([
  "cash_kc",
  "debt_kc",
  "reserved_cash_kc",
  "reputation",
  "trust",
  "hype",
  "ecosystem",
  "audit_readiness",
  "cluster_memory_gb",
  "cluster_compute_cu",
  "cluster_readiness",
  "payroll_kc_per_quarter",
  "overhead_kc_per_quarter",
  "shares_outstanding",
  "founder_shares",
  "share_price_kc",
  "last_pre_money_kc",
  "market_cap_kc",
  "negative_cash_turns",
  "automation_dividend_ratio",
  "defense_level",
  "moat_strength",
  "board_pressure",
]);

const MODEL_NUMERIC_KEYS = Object.freeze([
  "generation_index",
  "season_index",
  "sim_total_params_b",
  "sim_active_params_b",
  "context_tokens",
  "batch_size",
  "lora_rank",
  "inference_quant_bits",
  "kernel_maturity",
  "distributed_maturity",
  "readable_trace_quality",
  "ood_robustness",
]);

const MODEL_STRING_KEYS = Object.freeze([
  "architecture_id",
  "selected_recipe_id",
  "training_mode",
  "weight_access",
  "training_authority",
  "release_policy",
  "license_id",
  "history_id",
]);

function applyHistoryDefaults(model, history) {
  if (!isPlainObject(model) || !isPlainObject(history)) return;

  const historyId = pickFirst(history, ["history_id", "id"]);
  if (typeof historyId === "string" && historyId !== "") {
    model.history_id = historyId;
  }

  assignString(model, history, MODEL_STRING_KEYS);
  assignNumeric(model, history, MODEL_NUMERIC_KEYS);

  if (isPlainObject(history.stats)) {
    model.stats = createStats(Object.assign({}, model.stats, history.stats));
  }
  if (isPlainObject(history.stat_caps)) {
    model.stat_caps = makeStats(
      STAT_CAP_DEFAULT,
      Object.assign({}, model.stat_caps, history.stat_caps),
    );
  }
}

function applyProfileDefaults(company, model, profile, userCompanyName) {
  if (!isPlainObject(profile)) return;

  const companyPart = isPlainObject(profile.company) ? profile.company : null;
  const modelPart = isPlainObject(profile.model) ? profile.model : null;

  assignNumeric(company, profile, COMPANY_NUMERIC_KEYS);
  if (companyPart) assignNumeric(company, companyPart, COMPANY_NUMERIC_KEYS);
  assignBoolean(company, profile, [
    "is_public",
    "rescue_used",
    "bubble_survived",
    "is_operating",
  ]);
  if (companyPart) {
    assignBoolean(company, companyPart, [
      "is_public",
      "rescue_used",
      "bubble_survived",
      "is_operating",
    ]);
  }

  if (!userCompanyName) {
    const nameFromProfile =
      pickFirst(profile, ["company_name", "company_display_name"]) ||
      (companyPart ? pickFirst(companyPart, ["display_name", "name"]) : null);
    if (typeof nameFromProfile === "string" && nameFromProfile.trim() !== "") {
      company.display_name = nameFromProfile.trim().slice(0, 24);
      company.name = company.display_name;
    }
  }

  const statsSource = isPlainObject(profile.stats)
    ? profile.stats
    : modelPart && isPlainObject(modelPart.stats)
      ? modelPart.stats
      : null;
  if (statsSource) {
    model.stats = createStats(Object.assign({}, model.stats, statsSource));
  }

  const capsSource = isPlainObject(profile.stat_caps)
    ? profile.stat_caps
    : modelPart && isPlainObject(modelPart.stat_caps)
      ? modelPart.stat_caps
      : null;
  if (capsSource) {
    model.stat_caps = makeStats(
      STAT_CAP_DEFAULT,
      Object.assign({}, model.stat_caps, capsSource),
    );
  }

  assignNumeric(model, profile, MODEL_NUMERIC_KEYS);
  if (modelPart) assignNumeric(model, modelPart, MODEL_NUMERIC_KEYS);
  assignString(model, profile, MODEL_STRING_KEYS);
  if (modelPart) assignString(model, modelPart, MODEL_STRING_KEYS);

  const marketCapProvided =
    isFiniteNumber(profile.market_cap_kc) ||
    (companyPart && isFiniteNumber(companyPart.market_cap_kc));
  if (!marketCapProvided) {
    company.market_cap_kc = Math.max(
      0,
      roundTo(company.share_price_kc * company.shares_outstanding, 6),
    );
  }
}

/* ------------------------------------------------------------------ *
 * 26. 存档根结构
 * ------------------------------------------------------------------ */

export function createNewGameState(options = {}) {
  const opts = cleanObject(options);

  const profiles = asArray(START_PROFILES);
  const histories = asArray(HISTORIES);

  const requestedProfileId =
    opts.profileId === undefined || opts.profileId === null
      ? null
      : String(opts.profileId);
  let profile = null;
  if (requestedProfileId) {
    profile =
      profiles.find(
        (candidate) =>
          isPlainObject(candidate) &&
          (candidate.profile_id === requestedProfileId ||
            candidate.id === requestedProfileId),
      ) || null;
    if (!profile && profiles.length > 0 && isPlainObject(profiles[0])) {
      profile = profiles[0];
    }
  }

  const requestedHistoryId =
    opts.historyId === undefined || opts.historyId === null
      ? null
      : String(opts.historyId);
  if (isNpcIdentity(requestedHistoryId)) {
    throw new Error('NPC_CANNOT_BE_TRAINED');
  }
  let history = null;
  if (requestedHistoryId) {
    history =
      histories.find(
        (candidate) =>
          isPlainObject(candidate) &&
          (candidate.history_id === requestedHistoryId ||
            candidate.id === requestedHistoryId),
      ) || null;
  }

  const gameMode = GAME_MODES.includes(opts.gameMode)
    ? opts.gameMode
    : "standard";

  const rawSeed = Number(opts.campaignSeed);
  const campaignSeed = Number.isFinite(rawSeed)
    ? Math.max(0, Math.floor(rawSeed))
    : DEFAULT_CAMPAIGN_SEED;

  const userCompanyName = nonEmptyString(opts.companyName)
    ? opts.companyName.trim().slice(0, 24)
    : null;
  const userModelName = nonEmptyString(opts.modelName)
    ? opts.modelName.trim()
    : null;

  /* ---- 根对象 ---- */

  const world = createWorldState();
  const company = createCompanyState({
    display_name: userCompanyName || DEFAULT_COMPANY_NAME,
  });
  const activeModel = createModelState({
    display_name: userModelName || DEFAULT_MODEL_NAME,
  });

  /* ---- 历史档案 + 开局档案 ---- */

  applyHistoryDefaults(activeModel, history);
  applyProfileDefaults(company, activeModel, profile, userCompanyName);

  if (userCompanyName) {
    company.display_name = userCompanyName;
    company.name = userCompanyName;
  }
  if (userModelName) {
    activeModel.display_name = userModelName;
    activeModel.name = userModelName;
  }
  company.display_name = String(company.display_name).slice(0, 24);
  company.name = company.display_name;

  /* ---- 支援卡 ---- */

  const supportBond = {};
  const ownedCardLevels = {};
  for (const cardId of STARTER_SUPPORT_CARD_IDS) {
    supportBond[cardId] = STARTER_SUPPORT_BOND;
    ownedCardLevels[cardId] = 1;
  }

  if (isPlainObject(profile) && isPlainObject(profile.owned_card_levels)) {
    for (const cardId of Object.keys(profile.owned_card_levels)) {
      const level = Math.max(
        1,
        Math.floor(numOr(profile.owned_card_levels[cardId], 1)),
      );
      ownedCardLevels[cardId] = Math.max(ownedCardLevels[cardId] || 0, level);
    }
    for (const cardId of STARTER_SUPPORT_CARD_IDS) {
      ownedCardLevels[cardId] = Math.max(1, ownedCardLevels[cardId] || 1);
    }
  }

  activeModel.support_card_ids = STARTER_SUPPORT_CARD_IDS.slice(0, 4);
  activeModel.support_bond = Object.assign({}, supportBond);

  /* ---- 数据仓库 ---- */

  const datasets = [];

  datasets.push(
    createDataset({
      dataset_id: STARTER_DATASET_ID,
      id: STARTER_DATASET_ID,
      display_name: STARTER_DATASET_NAME,
      name: STARTER_DATASET_NAME,
      format: "instruction",
      records_k: 100,
      quality: 0.8,
      diversity: 0.7,
      label_quality: 0.8,
      novelty: 1,
      uses: 0,
      duplicate_ratio: 0.05,
      contamination_ratio: 0,
      synthetic_ratio: 0,
      correlated_error_ratio: 0.05,
      rights_status: "licensed",
      provenance_ids: ["prov_starter_sft"],
      audit_confidence: 0.3,
      license_cost_kc: 0,
      allowed_training: true,
      teacher_id: null,
      teacher_coverage: 0,
      displayed_quality_estimate: 0.75,
    }),
  );

  const seenDatasetIds = new Set(datasets.map((entry) => entry.dataset_id));
  for (const template of asArray(DATASET_TEMPLATES)) {
    const dataset = datasetFromTemplate(template);
    if (!dataset.dataset_id) continue;
    if (seenDatasetIds.has(dataset.dataset_id)) continue;
    seenDatasetIds.add(dataset.dataset_id);
    datasets.push(dataset);
  }

  /* ---- 职业 ---- */

  const sectors = asArray(JOB_SECTORS)
    .slice(0, 20)
    .map((template, index) => sectorFromTemplate(template, index));

  /* ---- 证券 ---- */

  const securities = asArray(SECURITIES)
    .slice(0, 6)
    .map((template, index) => securityFromTemplate(template, index));

  /* ---- 首个产品 ---- */

  const starterProduct = createProduct({
    product_id: STARTER_PRODUCT_ID,
    id: STARTER_PRODUCT_ID,
    display_name: STARTER_PRODUCT_NAME,
    name: STARTER_PRODUCT_NAME,
    model_ids: [activeModel.model_id],
    dispatcher_model_id: null,
    market_type: "enterprise",
    price_kc_per_unit: 0.08,
    variable_cost_per_unit: 0.03,
    variable_cost_kc_per_unit: 0.03,
    demand_units: 1000,
    service_capacity_units: 800,
    retention: 0.8,
    quality_fit: 0.7,
    release_turn: 0,
    is_suspended: false,
  });

  /* ---- 初始检查点 ---- */

  activeModel.checkpoints = [
    createCheckpoint(activeModel, 0, {
      checkpoint_id: `cp_${activeModel.model_id}_t0_genesis`,
      id: `cp_${activeModel.model_id}_t0_genesis`,
      created_turn: 0,
      valid: true,
      label: "开局基线检查点",
    }),
  ];
  activeModel.actions_since_checkpoint = 0;

  /* ---- 根结构 ---- */

  const state = {
    schema_version: 1,
    ruleset_version: DEFAULT_RULESET_VERSION,
    content_hash: "pending",
    campaign_id: DEFAULT_CAMPAIGN_ID,
    campaign_seed: campaignSeed,
    game_mode: gameMode,
    world,
    company,
    active_model: activeModel,
    archived_models: [],
    datasets,
    annotation_contracts: [],
    research_projects: [],
    unlocked_research_ids: [],
    legal_exposures: [],
    legal_cases: [],
    products: [{ ...starterProduct, billing_engine: "serving_v1" }],
    serving: createServiceEconomy(),
    sectors,
    milestones: createMilestoneState(),
    race_results: [],
    story: createStoryState(),
    processed_action_ids: [],
    action_log_hash: "genesis",
    teacher_contracts: [],
    securities,
    owned_card_levels: ownedCardLevels,
  };

  return state;
}

/* ------------------------------------------------------------------ *
 * 27. 回滚
 * ------------------------------------------------------------------ */

/**
 * 仅回滚模型侧可回滚状态：
 *  - stats / overfit / forgetting / reward_hacking / sycophancy
 *  - optimizer_health 以检查点为基准额外惩罚（最低 30）
 *  - actions_since_checkpoint 归零
 * 绝不回滚：company.cash_kc、datasets[i].uses、
 * active_model.training_provenance_ids、state.legal_exposures、state.world。
 */
export function rollbackModelToCheckpoint(state, checkpointId = null) {
  if (!isPlainObject(state)) return state;
  const model = state.active_model;
  if (!isPlainObject(model)) return state;

  const checkpoints = Array.isArray(model.checkpoints) ? model.checkpoints : [];

  let target = null;
  const requestedId =
    checkpointId === null || checkpointId === undefined || checkpointId === ""
      ? null
      : String(checkpointId);

  if (requestedId) {
    target =
      checkpoints.find(
        (checkpoint) =>
          isPlainObject(checkpoint) &&
          (checkpoint.checkpoint_id === requestedId ||
            checkpoint.id === requestedId),
      ) || null;
  }

  if (!target) {
    for (let i = checkpoints.length - 1; i >= 0; i -= 1) {
      const checkpoint = checkpoints[i];
      if (
        isPlainObject(checkpoint) &&
        checkpoint.valid !== false &&
        (isPlainObject(checkpoint.stats) || isPlainObject(checkpoint.snapshot?.stats))
      ) {
        target = checkpoint;
        break;
      }
    }
  }

  if (!target) return state;

  const snap = isPlainObject(target.snapshot) ? target.snapshot : target;
  const checkpointStats = isPlainObject(snap.stats) ? snap.stats : {};
  model.stats = createStats(
    Object.assign({}, model.stats || {}, checkpointStats),
  );

  model.overfit = clamp(numOr(snap.overfit, numOr(model.overfit, 0)), 0, 100);
  model.forgetting = clamp(
    numOr(snap.forgetting, numOr(model.forgetting, 0)),
    0,
    100,
  );
  model.reward_hacking = clamp(
    numOr(snap.reward_hacking, numOr(model.reward_hacking, 0)),
    0,
    100,
  );
  model.sycophancy = clamp(
    numOr(snap.sycophancy, numOr(model.sycophancy, 0)),
    0,
    100,
  );

  const currentHealth = numOr(model.optimizer_health, 100);
  const checkpointHealth = numOr(snap.optimizer_health, 100);
  const baseHealth = Math.min(currentHealth, checkpointHealth);
  model.optimizer_health = clamp(
    Math.max(30, baseHealth - 8),
    30,
    100,
  );

  model.actions_since_checkpoint = 0;

  return state;
}

/* ------------------------------------------------------------------ *
 * 28. 校验
 * ------------------------------------------------------------------ */

function checkNum(container, key, path, min, max, errors, options = {}) {
  const value = isPlainObject(container) ? container[key] : undefined;
  if (value === null) {
    if (options.allowNull) return;
    errors.push(`${path} 不能为 null`);
    return;
  }
  if (value === undefined) {
    errors.push(
      `${path} 缺失（应为数字${options.allowNull ? "或 null" : ""}）`,
    );
    return;
  }
  if (!isFiniteNumber(value)) {
    errors.push(`${path} 必须是有限数字，当前类型 ${typeof value}`);
    return;
  }
  if (options.integer && !Number.isInteger(value)) {
    errors.push(`${path} 必须是整数，当前 ${value}`);
  }
  if (isFiniteNumber(min) && value < min) {
    errors.push(`${path} 低于允许最小值 ${min}：${value}`);
  }
  if (isFiniteNumber(max) && value > max) {
    errors.push(`${path} 超过允许最大值 ${max}：${value}`);
  }
}

function checkEnum(container, key, allowed, path, errors, options = {}) {
  const value = isPlainObject(container) ? container[key] : undefined;
  if (value === null) {
    if (options.allowNull) return;
    errors.push(`${path} 不能为 null`);
    return;
  }
  if (value === undefined) {
    errors.push(`${path} 缺失（应为 ${allowed.join(" / ")}）`);
    return;
  }
  if (typeof value !== "string" || !allowed.includes(value)) {
    errors.push(
      `${path} 取值非法：${JSON.stringify(value)}；允许 ${allowed.join(" / ")}`,
    );
  }
}

function checkString(container, key, path, errors, options = {}) {
  const value = isPlainObject(container) ? container[key] : undefined;
  if (value === null) {
    if (options.allowNull) return;
    errors.push(`${path} 不能为 null`);
    return;
  }
  if (value === undefined) {
    errors.push(`${path} 缺失（应为字符串）`);
    return;
  }
  if (typeof value !== "string") {
    errors.push(`${path} 必须是字符串，当前类型 ${typeof value}`);
    return;
  }
  if (!options.allowEmpty && value === "") {
    errors.push(`${path} 不能为空字符串`);
  }
  if (isFiniteNumber(options.maxLength) && value.length > options.maxLength) {
    errors.push(`${path} 长度 ${value.length} 超过上限 ${options.maxLength}`);
  }
}

function checkBool(container, key, path, errors) {
  const value = isPlainObject(container) ? container[key] : undefined;
  if (typeof value !== "boolean") {
    errors.push(`${path} 必须是布尔值，当前 ${JSON.stringify(value)}`);
  }
}

function checkArray(container, key, path, errors, warnings, options = {}) {
  const value = isPlainObject(container) ? container[key] : undefined;
  if (value === undefined) {
    errors.push(`${path} 缺失（应为数组）`);
    return;
  }
  if (!Array.isArray(value)) {
    errors.push(`${path} 必须是数组`);
    return;
  }
  if (isFiniteNumber(options.minLength) && value.length < options.minLength) {
    errors.push(
      `${path} 长度 ${value.length} 少于要求 ${options.minLength}`,
    );
  }
  if (isFiniteNumber(options.maxLength) && value.length > options.maxLength) {
    (warnings || errors).push(
      `${path} 长度 ${value.length} 超过建议上限 ${options.maxLength}`,
    );
  }
}

function validateStatsObject(stats, path, errors) {
  if (!isPlainObject(stats)) {
    errors.push(`${path} 缺失或不是对象`);
    return;
  }
  for (const key of STAT_KEYS) {
    const value = stats[key];
    if (value === undefined && !LEGACY_STAT_KEYS.includes(key)) continue;
    if (!isFiniteNumber(value)) {
      errors.push(`${path}.${key} 必须是数字`);
      continue;
    }
    if (value < 0 || value > 1000) {
      errors.push(`${path}.${key} 超出 0—1000：${value}`);
    }
  }
}

function validateWorld(world, errors, warnings) {
  const path = "world";
  if (!isPlainObject(world)) {
    errors.push("world 缺失或不是对象");
    return;
  }

  checkNum(world, "turn_index", `${path}.turn_index`, 1, 193, errors, {
    integer: true,
  });
  checkEnum(world, "bubble_phase", BUBBLE_PHASES, `${path}.bubble_phase`, errors);
  checkNum(world, "bubble_heat", `${path}.bubble_heat`, 0, 100, errors);
  checkNum(
    world,
    "locked_crash_turn",
    `${path}.locked_crash_turn`,
    84,
    108,
    errors,
    { integer: true, allowNull: true },
  );
  checkNum(
    world,
    "bubble_crash_turn",
    `${path}.bubble_crash_turn`,
    1,
    1000,
    errors,
    { integer: true, allowNull: true },
  );
  checkNum(
    world,
    "bubble_warning_count",
    `${path}.bubble_warning_count`,
    0,
    2,
    errors,
    { integer: true },
  );
  checkNum(
    world,
    "valuation_multiplier",
    `${path}.valuation_multiplier`,
    0.1,
    3,
    errors,
  );
  checkNum(
    world,
    "funding_multiplier",
    `${path}.funding_multiplier`,
    0,
    1,
    errors,
  );
  checkNum(world, "consumer_demand", `${path}.consumer_demand`, 0, 2, errors);
  checkNum(
    world,
    "enterprise_demand",
    `${path}.enterprise_demand`,
    0,
    2,
    errors,
  );
  checkNum(world, "public_demand", `${path}.public_demand`, 0, 2, errors);
  checkNum(
    world,
    "spot_gpu_price_index",
    `${path}.spot_gpu_price_index`,
    0.1,
    5,
    errors,
  );
  checkNum(
    world,
    "social_stability",
    `${path}.social_stability`,
    0,
    100,
    errors,
  );
  checkNum(
    world,
    "energy_capacity_index",
    `${path}.energy_capacity_index`,
    0,
    10,
    errors,
  );
  checkNum(
    world,
    "realized_automation_share",
    `${path}.realized_automation_share`,
    0,
    1,
    errors,
  );
  checkNum(
    world,
    "new_job_pressure",
    `${path}.new_job_pressure`,
    0,
    100,
    errors,
  );
  checkNum(world, "inflation_index", `${path}.inflation_index`, 0.1, 5, errors);
  checkNum(
    world,
    "structural_consumer_demand",
    `${path}.structural_consumer_demand`,
    0,
    2,
    errors,
  );
  checkNum(
    world,
    "structural_enterprise_demand",
    `${path}.structural_enterprise_demand`,
    0,
    2,
    errors,
  );
  checkNum(
    world,
    "structural_public_demand",
    `${path}.structural_public_demand`,
    0,
    2,
    errors,
  );

  if (isFiniteNumber(world.bubble_heat) && world.bubble_heat >= 80) {
    warnings.push("world.bubble_heat 已进入高位，破裂风险上升。");
  }
  if (isFiniteNumber(world.social_stability) && world.social_stability < 40) {
    warnings.push("world.social_stability 低于 40，自动化推进将受阻。");
  }
  if (
    isFiniteNumber(world.turn_index) &&
    isFiniteNumber(world.locked_crash_turn) &&
    world.turn_index > world.locked_crash_turn
  ) {
    warnings.push("world.turn_index 已超过锁定破裂回合，请确认破裂已结算。");
  }
}

function validateCompany(company, errors, warnings) {
  const path = "company";
  if (!isPlainObject(company)) {
    errors.push("company 缺失或不是对象");
    return;
  }

  checkString(company, "company_id", `${path}.company_id`, errors, {
    allowEmpty: false,
  });
  checkString(company, "display_name", `${path}.display_name`, errors, {
    allowEmpty: false,
    maxLength: 24,
  });
  checkNum(company, "cash_kc", `${path}.cash_kc`, null, null, errors);
  checkNum(company, "debt_kc", `${path}.debt_kc`, 0, null, errors);
  checkNum(
    company,
    "reserved_cash_kc",
    `${path}.reserved_cash_kc`,
    0,
    null,
    errors,
  );
  checkNum(company, "reputation", `${path}.reputation`, 0, 100, errors);
  checkNum(company, "trust", `${path}.trust`, 0, 100, errors);
  checkNum(company, "hype", `${path}.hype`, 0, 100, errors);
  checkNum(company, "ecosystem", `${path}.ecosystem`, 0, 100, errors);
  checkNum(
    company,
    "audit_readiness",
    `${path}.audit_readiness`,
    0,
    100,
    errors,
  );
  checkNum(
    company,
    "cluster_memory_gb",
    `${path}.cluster_memory_gb`,
    1,
    null,
    errors,
  );
  checkNum(
    company,
    "cluster_compute_cu",
    `${path}.cluster_compute_cu`,
    1,
    null,
    errors,
  );
  checkNum(
    company,
    "cluster_readiness",
    `${path}.cluster_readiness`,
    0,
    100,
    errors,
  );
  checkNum(
    company,
    "payroll_kc_per_quarter",
    `${path}.payroll_kc_per_quarter`,
    0,
    null,
    errors,
  );
  checkNum(
    company,
    "overhead_kc_per_quarter",
    `${path}.overhead_kc_per_quarter`,
    0,
    null,
    errors,
  );
  checkNum(
    company,
    "quarter_paid_rnd_kc",
    `${path}.quarter_paid_rnd_kc`,
    0,
    null,
    errors,
  );
  checkNum(
    company,
    "quarter_paid_legal_kc",
    `${path}.quarter_paid_legal_kc`,
    0,
    null,
    errors,
  );
  checkNum(
    company,
    "shares_outstanding",
    `${path}.shares_outstanding`,
    1,
    null,
    errors,
    { integer: true },
  );
  checkNum(
    company,
    "founder_shares",
    `${path}.founder_shares`,
    0,
    null,
    errors,
    { integer: true },
  );
  checkBool(company, "is_public", `${path}.is_public`, errors);
  for (const key of ["quarter_serving_revenue_kc", "quarter_serving_cogs_kc", "quarter_serving_units", "quarter_serving_turns"]) {
    if (company[key] !== undefined) checkNum(company, key, `${path}.${key}`, 0, null, errors);
  }
  checkNum(company, "share_price_kc", `${path}.share_price_kc`, 0, null, errors);
  checkNum(company, "market_cap_kc", `${path}.market_cap_kc`, 0, null, errors);
  checkNum(
    company,
    "last_pre_money_kc",
    `${path}.last_pre_money_kc`,
    0,
    null,
    errors,
  );
  checkArray(company, "quarter_history", `${path}.quarter_history`, errors, warnings);
  checkNum(
    company,
    "negative_cash_turns",
    `${path}.negative_cash_turns`,
    0,
    3,
    errors,
    { integer: true },
  );
  checkBool(company, "rescue_used", `${path}.rescue_used`, errors);
  checkNum(
    company,
    "automation_dividend_ratio",
    `${path}.automation_dividend_ratio`,
    0,
    1,
    errors,
  );
  checkArray(company, "policies", `${path}.policies`, errors, warnings);
  checkBool(company, "bubble_survived", `${path}.bubble_survived`, errors);
  checkNum(company, "defense_level", `${path}.defense_level`, 0, 100, errors);
  checkNum(company, "moat_strength", `${path}.moat_strength`, 0, 100, errors);
  checkNum(company, "board_pressure", `${path}.board_pressure`, 0, 100, errors);
  checkArray(company, "investments", `${path}.investments`, errors, warnings);
  checkBool(company, "is_operating", `${path}.is_operating`, errors);

  if (Array.isArray(company.quarter_history)) {
    company.quarter_history.forEach((record, index) => {
      const recordPath = `${path}.quarter_history[${index}]`;
      if (!isPlainObject(record)) {
        errors.push(`${recordPath} 必须是对象`);
        return;
      }
      checkNum(
        record,
        "quarter_index",
        `${recordPath}.quarter_index`,
        1,
        null,
        errors,
        { integer: true },
      );
      checkNum(record, "revenue_kc", `${recordPath}.revenue_kc`, 0, null, errors);
      checkNum(
        record,
        "paid_rnd_kc",
        `${recordPath}.paid_rnd_kc`,
        0,
        null,
        errors,
      );
      checkNum(
        record,
        "cash_cogs_kc",
        `${recordPath}.cash_cogs_kc`,
        0,
        null,
        errors,
      );
      checkNum(record, "payroll_kc", `${recordPath}.payroll_kc`, 0, null, errors);
      checkNum(
        record,
        "overhead_kc",
        `${recordPath}.overhead_kc`,
        0,
        null,
        errors,
      );
      checkNum(
        record,
        "depreciation_kc",
        `${recordPath}.depreciation_kc`,
        0,
        null,
        errors,
      );
      checkNum(
        record,
        "interest_kc",
        `${recordPath}.interest_kc`,
        0,
        null,
        errors,
      );
      checkNum(record, "tax_kc", `${recordPath}.tax_kc`, 0, null, errors);
      checkNum(
        record,
        "net_income_kc",
        `${recordPath}.net_income_kc`,
        null,
        null,
        errors,
      );
      checkNum(
        record,
        "cash_delta_from_close_kc",
        `${recordPath}.cash_delta_from_close_kc`,
        null,
        null,
        errors,
      );
      checkNum(
        record,
        "paid_legal_kc",
        `${recordPath}.paid_legal_kc`,
        0,
        null,
        errors,
      );
    });
  }

  if (Array.isArray(company.investments)) {
    let totalCost = 0;
    company.investments.forEach((position, index) => {
      const positionPath = `${path}.investments[${index}]`;
      if (!isPlainObject(position)) {
        errors.push(`${positionPath} 必须是对象`);
        return;
      }
      checkString(position, "security_id", `${positionPath}.security_id`, errors, {
        allowEmpty: false,
      });
      checkNum(position, "shares", `${positionPath}.shares`, 0, null, errors, {
        integer: true,
      });
      checkNum(
        position,
        "cost_basis_kc",
        `${positionPath}.cost_basis_kc`,
        0,
        null,
        errors,
      );
      totalCost += numOr(position.cost_basis_kc, 0);
    });
    if (isFiniteNumber(company.cash_kc) && company.cash_kc > 0) {
      if (totalCost > company.cash_kc * 0.1 + 1e-9) {
        warnings.push(
          `${path}.investments 总投入 ${totalCost} kc 超过可用现金 10% 上限。`,
        );
      }
    }
  }

  if (
    isFiniteNumber(company.founder_shares) &&
    isFiniteNumber(company.shares_outstanding) &&
    company.founder_shares > company.shares_outstanding
  ) {
    warnings.push(`${path}.founder_shares 大于 shares_outstanding。`);
  }
  if (isFiniteNumber(company.cash_kc) && company.cash_kc < 0) {
    warnings.push(`${path}.cash_kc 为负，处于两回合危机宽限窗口。`);
  }
  if (company.is_operating === false) {
    warnings.push(`${path}.is_operating 为 false，公司已清算。`);
  }
}

function validateModel(model, errors, warnings) {
  const path = "active_model";
  if (!isPlainObject(model)) {
    errors.push("active_model 缺失或不是对象");
    return;
  }

  checkString(model, "model_id", `${path}.model_id`, errors, {
    allowEmpty: false,
  });
  checkString(model, "display_name", `${path}.display_name`, errors, {
    allowEmpty: false,
  });
  checkString(model, "history_id", `${path}.history_id`, errors, {
    allowEmpty: false,
  });
  if (isNpcIdentity(model.history_id)) {
    errors.push(`${path}.history_id: NPC_CANNOT_BE_TRAINED`);
  }
  checkNum(
    model,
    "generation_index",
    `${path}.generation_index`,
    1,
    null,
    errors,
    { integer: true },
  );
  checkNum(
    model,
    "season_index",
    `${path}.season_index`,
    1,
    null,
    errors,
    { integer: true },
  );
  checkString(model, "parent_model_id", `${path}.parent_model_id`, errors, {
    allowNull: true,
  });
  checkArray(
    model,
    "teacher_model_ids",
    `${path}.teacher_model_ids`,
    errors,
    warnings,
    { maxLength: 2 },
  );
  checkString(model, "architecture_id", `${path}.architecture_id`, errors, {
    allowEmpty: false,
  });
  checkNum(
    model,
    "sim_total_params_b",
    `${path}.sim_total_params_b`,
    0.05,
    10000,
    errors,
  );
  checkNum(
    model,
    "sim_active_params_b",
    `${path}.sim_active_params_b`,
    0.01,
    10000,
    errors,
  );
  checkNum(
    model,
    "real_total_params_b",
    `${path}.real_total_params_b`,
    0,
    null,
    errors,
    { allowNull: true },
  );
  checkEnum(
    model,
    "weight_access",
    WEIGHT_ACCESS_VALUES,
    `${path}.weight_access`,
    errors,
  );
  checkEnum(
    model,
    "training_authority",
    TRAINING_AUTHORITY_VALUES,
    `${path}.training_authority`,
    errors,
  );
  checkEnum(
    model,
    "release_policy",
    RELEASE_POLICY_VALUES,
    `${path}.release_policy`,
    errors,
  );
  checkString(model, "license_id", `${path}.license_id`, errors, {
    allowEmpty: false,
  });

  validateStatsObject(model.stats, `${path}.stats`, errors);
  validateStatsObject(model.stat_caps, `${path}.stat_caps`, errors);

  if (isPlainObject(model.stats) && isPlainObject(model.stat_caps)) {
    for (const key of STAT_KEYS) {
      const value = model.stats[key];
      const cap = model.stat_caps[key];
      if (isFiniteNumber(value) && isFiniteNumber(cap) && value > cap) {
        warnings.push(
          `${path}.stats.${key}(${value}) 超过软上限 ${cap}，需要科研或架构突破。`,
        );
      }
    }
  }

  checkArray(model, "skills", `${path}.skills`, errors, warnings);
  checkArray(
    model,
    "support_card_ids",
    `${path}.support_card_ids`,
    errors,
    warnings,
    { maxLength: 4 },
  );
  if (!isPlainObject(model.support_bond)) {
    errors.push(`${path}.support_bond 必须是对象`);
  } else {
    for (const cardId of Object.keys(model.support_bond)) {
      const bond = model.support_bond[cardId];
      if (!isFiniteNumber(bond)) {
        errors.push(`${path}.support_bond.${cardId} 必须是数字`);
      } else if (bond < 0 || bond > 100) {
        errors.push(`${path}.support_bond.${cardId} 超出 0—100：${bond}`);
      }
      if (SUPPORT_CARD_INDEX.size > 0 && !SUPPORT_CARD_INDEX.has(cardId)) {
        warnings.push(`${path}.support_bond 含有未知支援卡 ID：${cardId}`);
      }
    }
  }

  checkString(model, "selected_recipe_id", `${path}.selected_recipe_id`, errors, {
    allowEmpty: false,
  });
  checkEnum(model, "training_mode", TRAINING_MODES, `${path}.training_mode`, errors);
  checkNum(
    model,
    "context_tokens",
    `${path}.context_tokens`,
    256,
    2097152,
    errors,
    { integer: true },
  );
  checkNum(model, "batch_size", `${path}.batch_size`, 1, 256, errors, {
    integer: true,
  });
  checkNum(model, "lora_rank", `${path}.lora_rank`, 1, 256, errors, {
    integer: true,
  });
  checkNum(
    model,
    "inference_quant_bits",
    `${path}.inference_quant_bits`,
    1,
    16,
    errors,
  );
  checkNum(
    model,
    "kernel_maturity",
    `${path}.kernel_maturity`,
    0,
    100,
    errors,
  );
  checkNum(
    model,
    "distributed_maturity",
    `${path}.distributed_maturity`,
    0,
    100,
    errors,
  );
  checkNum(model, "overfit", `${path}.overfit`, 0, 100, errors);
  checkNum(model, "forgetting", `${path}.forgetting`, 0, 100, errors);
  checkNum(model, "reward_hacking", `${path}.reward_hacking`, 0, 100, errors);
  checkNum(model, "sycophancy", `${path}.sycophancy`, 0, 100, errors);
  checkNum(model, "over_refusal", `${path}.over_refusal`, 0, 100, errors);
  checkNum(
    model,
    "harmful_compliance",
    `${path}.harmful_compliance`,
    0,
    100,
    errors,
  );
  checkNum(model, "contamination", `${path}.contamination`, 0, 100, errors);
  checkNum(
    model,
    "audit_confidence",
    `${path}.audit_confidence`,
    0,
    1,
    errors,
  );
  checkNum(
    model,
    "optimizer_health",
    `${path}.optimizer_health`,
    0,
    100,
    errors,
  );
  checkNum(
    model,
    "training_action_count",
    `${path}.training_action_count`,
    0,
    null,
    errors,
    { integer: true },
  );

  if (!CHECKPOINT_INTERVALS.includes(model.checkpoint_interval_actions)) {
    errors.push(
      `${path}.checkpoint_interval_actions 仅允许 1 / 2 / 4，当前 ${JSON.stringify(
        model.checkpoint_interval_actions,
      )}`,
    );
  }

  checkNum(
    model,
    "actions_since_checkpoint",
    `${path}.actions_since_checkpoint`,
    0,
    4,
    errors,
    { integer: true },
  );

  if (
    isFiniteNumber(model.actions_since_checkpoint) &&
    CHECKPOINT_INTERVALS.includes(model.checkpoint_interval_actions) &&
    model.actions_since_checkpoint > model.checkpoint_interval_actions
  ) {
    warnings.push(
      `${path}.actions_since_checkpoint 已超过检查点间隔，损失上限失控。`,
    );
  }

  checkArray(
    model,
    "checkpoints",
    `${path}.checkpoints`,
    errors,
    warnings,
    { maxLength: MAX_CHECKPOINTS },
  );

  if (Array.isArray(model.checkpoints)) {
    let validCount = 0;
    model.checkpoints.forEach((checkpoint, index) => {
      const checkpointPath = `${path}.checkpoints[${index}]`;
      if (!isPlainObject(checkpoint)) {
        errors.push(`${checkpointPath} 必须是对象`);
        return;
      }
      checkString(
        checkpoint,
        "checkpoint_id",
        `${checkpointPath}.checkpoint_id`,
        errors,
        { allowEmpty: false },
      );
      checkNum(
        checkpoint,
        "created_turn",
        `${checkpointPath}.created_turn`,
        0,
        null,
        errors,
        { integer: true },
      );
      validateStatsObject(checkpoint.stats, `${checkpointPath}.stats`, errors);
      checkNum(
        checkpoint,
        "optimizer_health",
        `${checkpointPath}.optimizer_health`,
        0,
        100,
        errors,
      );
      checkNum(checkpoint, "overfit", `${checkpointPath}.overfit`, 0, 100, errors);
      checkNum(
        checkpoint,
        "forgetting",
        `${checkpointPath}.forgetting`,
        0,
        100,
        errors,
      );
      checkNum(
        checkpoint,
        "reward_hacking",
        `${checkpointPath}.reward_hacking`,
        0,
        100,
        errors,
      );
      checkNum(
        checkpoint,
        "sycophancy",
        `${checkpointPath}.sycophancy`,
        0,
        100,
        errors,
      );
      checkBool(checkpoint, "valid", `${checkpointPath}.valid`, errors);
      if (checkpoint.valid !== false) validCount += 1;
    });
    if (validCount === 0) {
      warnings.push(`${path}.checkpoints 中没有可用于恢复的有效检查点。`);
    }
  }

  checkArray(
    model,
    "training_provenance_ids",
    `${path}.training_provenance_ids`,
    errors,
    warnings,
  );
  checkNum(
    model,
    "readable_trace_quality",
    `${path}.readable_trace_quality`,
    0,
    100,
    errors,
  );
  checkNum(model, "ood_robustness", `${path}.ood_robustness`, 0, 1, errors);
  checkNum(model, "autonomy_hours", `${path}.autonomy_hours`, 0, null, errors);

  if (
    isFiniteNumber(model.sim_active_params_b) &&
    isFiniteNumber(model.sim_total_params_b) &&
    model.sim_active_params_b > model.sim_total_params_b
  ) {
    errors.push(
      `${path}.sim_active_params_b 不得大于 sim_total_params_b。`,
    );
  }
}

function validateDatasets(datasets, errors, warnings) {
  if (!Array.isArray(datasets)) {
    errors.push("datasets 必须是数组");
    return;
  }
  datasets.forEach((dataset, index) => {
    const path = `datasets[${index}]`;
    if (!isPlainObject(dataset)) {
      errors.push(`${path} 必须是对象`);
      return;
    }
    checkString(dataset, "dataset_id", `${path}.dataset_id`, errors, {
      allowEmpty: false,
    });
    checkEnum(dataset, "format", DATASET_FORMATS, `${path}.format`, errors);
    checkNum(dataset, "records_k", `${path}.records_k`, 0.1, null, errors);
    checkNum(dataset, "quality", `${path}.quality`, 0, 1, errors);
    checkNum(dataset, "diversity", `${path}.diversity`, 0, 1, errors);
    checkNum(dataset, "label_quality", `${path}.label_quality`, 0, 1, errors);
    checkNum(dataset, "novelty", `${path}.novelty`, 0, 1, errors);
    checkNum(dataset, "uses", `${path}.uses`, 0, null, errors, {
      integer: true,
    });
    checkNum(
      dataset,
      "duplicate_ratio",
      `${path}.duplicate_ratio`,
      0,
      1,
      errors,
    );
    checkNum(
      dataset,
      "contamination_ratio",
      `${path}.contamination_ratio`,
      0,
      1,
      errors,
    );
    checkNum(
      dataset,
      "synthetic_ratio",
      `${path}.synthetic_ratio`,
      0,
      1,
      errors,
    );
    checkNum(
      dataset,
      "correlated_error_ratio",
      `${path}.correlated_error_ratio`,
      0,
      1,
      errors,
    );
    checkEnum(
      dataset,
      "rights_status",
      RIGHTS_STATUSES,
      `${path}.rights_status`,
      errors,
    );
    checkArray(
      dataset,
      "provenance_ids",
      `${path}.provenance_ids`,
      errors,
      warnings,
    );
    checkNum(
      dataset,
      "audit_confidence",
      `${path}.audit_confidence`,
      0,
      1,
      errors,
    );
    validateStatsObject(dataset.domain_weights, `${path}.domain_weights`, errors);
    checkNum(
      dataset,
      "license_cost_kc",
      `${path}.license_cost_kc`,
      0,
      null,
      errors,
    );
    checkBool(dataset, "allowed_training", `${path}.allowed_training`, errors);
    checkString(dataset, "teacher_id", `${path}.teacher_id`, errors, {
      allowNull: true,
    });
    checkNum(
      dataset,
      "teacher_coverage",
      `${path}.teacher_coverage`,
      0,
      1,
      errors,
    );
    checkNum(
      dataset,
      "displayed_quality_estimate",
      `${path}.displayed_quality_estimate`,
      0,
      1,
      errors,
    );

    if (dataset.rights_status === "prohibited" && dataset.allowed_training === true) {
      warnings.push(
        `${path} 权利状态为 prohibited，却标记 allowed_training=true。`,
      );
    }
  });
}

function validateAnnotationContracts(contracts, errors, warnings) {
  if (!Array.isArray(contracts)) {
    errors.push("annotation_contracts 必须是数组");
    return;
  }
  contracts.forEach((contract, index) => {
    const path = `annotation_contracts[${index}]`;
    if (!isPlainObject(contract)) {
      errors.push(`${path} 必须是对象`);
      return;
    }
    checkString(contract, "contract_id", `${path}.contract_id`, errors, {
      allowEmpty: false,
    });
    checkString(contract, "team_template_id", `${path}.team_template_id`, errors, {
      allowEmpty: false,
    });
    checkString(contract, "dataset_id", `${path}.dataset_id`, errors, {
      allowEmpty: true,
    });
    checkEnum(contract, "label_method", LABEL_METHODS, `${path}.label_method`, errors);
    checkNum(contract, "records_k", `${path}.records_k`, 0, null, errors);
    checkNum(
      contract,
      "remaining_turns",
      `${path}.remaining_turns`,
      0,
      null,
      errors,
      { integer: true },
    );
    checkNum(contract, "base_skill", `${path}.base_skill`, 0, 100, errors);
    checkNum(contract, "domain_fit", `${path}.domain_fit`, 0, 1, errors);
    checkNum(contract, "fair_pay_ratio", `${path}.fair_pay_ratio`, 0.1, 3, errors);
    checkNum(contract, "gold_check_ratio", `${path}.gold_check_ratio`, 0, 1, errors);
    checkNum(
      contract,
      "independent_audit_ratio",
      `${path}.independent_audit_ratio`,
      0,
      1,
      errors,
    );
    checkNum(
      contract,
      "correlated_error_ratio",
      `${path}.correlated_error_ratio`,
      0,
      1,
      errors,
    );
    checkNum(contract, "attrition_risk", `${path}.attrition_risk`, 0, 1, errors);
    checkNum(contract, "paid_cost_kc", `${path}.paid_cost_kc`, 0, null, errors);
  });
}

function validateResearchProjects(projects, errors) {
  if (!Array.isArray(projects)) {
    errors.push("research_projects 必须是数组");
    return;
  }
  projects.forEach((project, index) => {
    const path = `research_projects[${index}]`;
    if (!isPlainObject(project)) {
      errors.push(`${path} 必须是对象`);
      return;
    }
    checkString(project, "project_id", `${path}.project_id`, errors, {
      allowEmpty: false,
    });
    checkString(project, "research_id", `${path}.research_id`, errors, {
      allowEmpty: true,
    });
    checkEnum(project, "stage", RESEARCH_STAGES, `${path}.stage`, errors);
    checkNum(project, "progress_rp", `${path}.progress_rp`, 0, null, errors);
    checkNum(project, "required_rp", `${path}.required_rp`, 1, null, errors);
    checkNum(
      project,
      "remaining_turns",
      `${path}.remaining_turns`,
      0,
      null,
      errors,
      { integer: true },
    );
    checkNum(
      project,
      "evidence_quality",
      `${path}.evidence_quality`,
      0,
      1,
      errors,
    );
    checkNum(
      project,
      "replication_count",
      `${path}.replication_count`,
      0,
      null,
      errors,
      { integer: true },
    );
    checkBool(
      project,
      "scale_validation_passed",
      `${path}.scale_validation_passed`,
      errors,
    );
    checkNum(project, "paid_cost_kc", `${path}.paid_cost_kc`, 0, null, errors);
    checkString(
      project,
      "architecture_target_id",
      `${path}.architecture_target_id`,
      errors,
      { allowNull: true },
    );
  });
}

function validateLegal(exposures, cases, errors) {
  if (!Array.isArray(exposures)) {
    errors.push("legal_exposures 必须是数组");
  } else {
    exposures.forEach((exposure, index) => {
      const path = `legal_exposures[${index}]`;
      if (!isPlainObject(exposure)) {
        errors.push(`${path} 必须是对象`);
        return;
      }
      checkString(exposure, "exposure_id", `${path}.exposure_id`, errors, {
        allowEmpty: false,
      });
      checkEnum(exposure, "kind", LEGAL_EXPOSURE_KINDS, `${path}.kind`, errors);
      checkNum(
        exposure,
        "created_turn",
        `${path}.created_turn`,
        0,
        null,
        errors,
        { integer: true },
      );
      if (!Array.isArray(exposure.source_record_ids)) {
        errors.push(`${path}.source_record_ids 必须是数组`);
      }
      checkNum(exposure, "severity", `${path}.severity`, 0, 100, errors);
      checkNum(
        exposure,
        "discovery_probability",
        `${path}.discovery_probability`,
        0,
        1,
        errors,
      );
      checkBool(exposure, "remediated", `${path}.remediated`, errors);
      checkBool(exposure, "fictional_only", `${path}.fictional_only`, errors);
    });
  }

  if (!Array.isArray(cases)) {
    errors.push("legal_cases 必须是数组");
  } else {
    cases.forEach((legalCase, index) => {
      const path = `legal_cases[${index}]`;
      if (!isPlainObject(legalCase)) {
        errors.push(`${path} 必须是对象`);
        return;
      }
      checkString(legalCase, "case_id", `${path}.case_id`, errors, {
        allowEmpty: false,
      });
      if (!Array.isArray(legalCase.exposure_ids)) {
        errors.push(`${path}.exposure_ids 必须是数组`);
      }
      checkString(
        legalCase,
        "jurisdiction_id",
        `${path}.jurisdiction_id`,
        errors,
        { allowEmpty: false },
      );
      checkEnum(legalCase, "stage", LEGAL_CASE_STAGES, `${path}.stage`, errors);
      checkNum(
        legalCase,
        "evidence_strength",
        `${path}.evidence_strength`,
        0,
        1,
        errors,
      );
      checkNum(
        legalCase,
        "license_coverage",
        `${path}.license_coverage`,
        0,
        1,
        errors,
      );
      checkNum(
        legalCase,
        "counsel_quality",
        `${path}.counsel_quality`,
        0,
        1,
        errors,
      );
      checkNum(legalCase, "claim_kc", `${path}.claim_kc`, 0, null, errors);
      checkNum(
        legalCase,
        "legal_cost_kc",
        `${path}.legal_cost_kc`,
        0,
        null,
        errors,
      );
      checkNum(legalCase, "reserve_kc", `${path}.reserve_kc`, 0, null, errors);
      checkNum(
        legalCase,
        "deadline_turn",
        `${path}.deadline_turn`,
        0,
        null,
        errors,
        { integer: true },
      );
      if (!Array.isArray(legalCase.affected_model_ids)) {
        errors.push(`${path}.affected_model_ids 必须是数组`);
      }
      checkEnum(legalCase, "outcome", LEGAL_OUTCOMES, `${path}.outcome`, errors);
    });
  }
}

function validateProducts(products, errors, warnings) {
  if (!Array.isArray(products)) {
    errors.push("products 必须是数组");
    return;
  }
  if (products.length > MAX_PRODUCTS) {
    warnings.push(
      `products 数量 ${products.length} 超过上限 ${MAX_PRODUCTS}。`,
    );
  }
  products.forEach((product, index) => {
    const path = `products[${index}]`;
    if (!isPlainObject(product)) {
      errors.push(`${path} 必须是对象`);
      return;
    }
    checkString(product, "product_id", `${path}.product_id`, errors, {
      allowEmpty: false,
    });
    if (!Array.isArray(product.model_ids)) {
      errors.push(`${path}.model_ids 必须是数组`);
    } else if (product.model_ids.length > 4) {
      warnings.push(`${path}.model_ids 超过 4 个小专家上限。`);
    }
    checkString(
      product,
      "dispatcher_model_id",
      `${path}.dispatcher_model_id`,
      errors,
      { allowNull: true },
    );
    checkEnum(product, "market_type", MARKET_TYPES, `${path}.market_type`, errors);
    checkNum(
      product,
      "price_kc_per_unit",
      `${path}.price_kc_per_unit`,
      0,
      null,
      errors,
    );
    checkNum(
      product,
      "variable_cost_kc_per_unit",
      `${path}.variable_cost_kc_per_unit`,
      0,
      null,
      errors,
    );
    checkNum(product, "demand_units", `${path}.demand_units`, 0, null, errors);
    checkNum(
      product,
      "service_capacity_units",
      `${path}.service_capacity_units`,
      0,
      null,
      errors,
    );
    checkNum(product, "retention", `${path}.retention`, 0, 1, errors);
    checkNum(product, "quality_fit", `${path}.quality_fit`, 0, 1, errors);
    checkNum(
      product,
      "release_turn",
      `${path}.release_turn`,
      0,
      null,
      errors,
      { integer: true },
    );
    checkBool(product, "is_suspended", `${path}.is_suspended`, errors);
  });
}

function validateSectors(sectors, errors, warnings) {
  if (!Array.isArray(sectors)) {
    errors.push("sectors 必须是数组");
    return;
  }
  if (sectors.length !== 20) {
    warnings.push(`sectors 数量为 ${sectors.length}，标准局应为 20 类职业。`);
  }
  sectors.forEach((sector, index) => {
    const path = `sectors[${index}]`;
    if (!isPlainObject(sector)) {
      errors.push(`${path} 必须是对象`);
      return;
    }
    checkString(sector, "sector_id", `${path}.sector_id`, errors, {
      allowEmpty: false,
    });
    checkNum(
      sector,
      "capability_coverage",
      `${path}.capability_coverage`,
      0,
      1,
      errors,
    );
    checkNum(
      sector,
      "deployment_share",
      `${path}.deployment_share`,
      0,
      1,
      errors,
    );
    checkNum(
      sector,
      "economic_feasibility",
      `${path}.economic_feasibility`,
      0,
      1,
      errors,
    );
    checkNum(
      sector,
      "legal_permission",
      `${path}.legal_permission`,
      0,
      1,
      errors,
    );
    checkNum(sector, "acceptance", `${path}.acceptance`, 0, 1, errors);
    checkNum(
      sector,
      "robotics_maturity",
      `${path}.robotics_maturity`,
      0,
      100,
      errors,
    );
    checkNum(
      sector,
      "physical_capacity",
      `${path}.physical_capacity`,
      0,
      1,
      errors,
    );
    checkNum(sector, "incident_rate", `${path}.incident_rate`, 0, 1, errors);
    checkBool(sector, "sector_completed", `${path}.sector_completed`, errors);
  });
}

function validateMilestones(milestones, errors) {
  const path = "milestones";
  if (!isPlainObject(milestones)) {
    errors.push("milestones 缺失或不是对象");
    return;
  }
  checkBool(milestones, "agi_achieved", `${path}.agi_achieved`, errors);
  checkBool(milestones, "asi_achieved", `${path}.asi_achieved`, errors);
  checkBool(milestones, "rsi_achieved", `${path}.rsi_achieved`, errors);
  checkNum(
    milestones,
    "domain_pass_rate",
    `${path}.domain_pass_rate`,
    0,
    1,
    errors,
  );
  checkNum(
    milestones,
    "worst_domain_pass_rate",
    `${path}.worst_domain_pass_rate`,
    0,
    1,
    errors,
  );
  checkNum(
    milestones,
    "critical_incident_rate",
    `${path}.critical_incident_rate`,
    0,
    1,
    errors,
  );
  checkNum(
    milestones,
    "independent_audits",
    `${path}.independent_audits`,
    0,
    null,
    errors,
    { integer: true },
  );
  checkNum(
    milestones,
    "expert_speedup_ratio",
    `${path}.expert_speedup_ratio`,
    0,
    null,
    errors,
  );
  checkNum(
    milestones,
    "domain_top_rate",
    `${path}.domain_top_rate`,
    0,
    1,
    errors,
  );
  checkNum(
    milestones,
    "verified_discoveries",
    `${path}.verified_discoveries`,
    0,
    null,
    errors,
    { integer: true },
  );
  checkNum(
    milestones,
    "verified_rsi_cycles",
    `${path}.verified_rsi_cycles`,
    0,
    null,
    errors,
    { integer: true },
  );
  checkNum(
    milestones,
    "self_research_contribution",
    `${path}.self_research_contribution`,
    0,
    1,
    errors,
  );
  checkNum(
    milestones,
    "external_gain_three_cycles",
    `${path}.external_gain_three_cycles`,
    0,
    1,
    errors,
  );
  checkNum(
    milestones,
    "net_compute_return",
    `${path}.net_compute_return`,
    0,
    null,
    errors,
  );
  checkNum(
    milestones,
    "automation_hold_turns",
    `${path}.automation_hold_turns`,
    0,
    null,
    errors,
    { integer: true },
  );
}

function validateRaceResults(raceResults, errors, warnings) {
  if (!Array.isArray(raceResults)) {
    errors.push("race_results 必须是数组");
    return;
  }
  raceResults.forEach((result, index) => {
    const path = `race_results[${index}]`;
    if (!isPlainObject(result)) {
      errors.push(`${path} 必须是对象`);
      return;
    }
    checkString(result, "race_id", `${path}.race_id`, errors, {
      allowEmpty: false,
    });
    checkString(result, "benchmark_id", `${path}.benchmark_id`, errors, {
      allowEmpty: false,
    });
    checkString(
      result,
      "benchmark_version",
      `${path}.benchmark_version`,
      errors,
      { allowEmpty: false },
    );
    checkString(result, "model_id", `${path}.model_id`, errors, {
      allowEmpty: false,
    });
    checkNum(result, "public_score", `${path}.public_score`, 0, 1000, errors);
    checkNum(result, "hidden_score", `${path}.hidden_score`, 0, 1000, errors);
    checkNum(
      result,
      "official_score",
      `${path}.official_score`,
      0,
      1000,
      errors,
    );
    checkNum(
      result,
      "compute_used_cu",
      `${path}.compute_used_cu`,
      0,
      null,
      errors,
    );
    checkNum(
      result,
      "completion_seconds",
      `${path}.completion_seconds`,
      0,
      null,
      errors,
    );
    checkBool(result, "budget_violated", `${path}.budget_violated`, errors);
    checkBool(result, "rank_eligible", `${path}.rank_eligible`, errors);
    checkEnum(result, "origin", RACE_ORIGINS, `${path}.origin`, errors);
    checkString(result, "replay_hash", `${path}.replay_hash`, errors, {
      allowEmpty: true,
    });
    checkString(result, "seed_id", `${path}.seed_id`, errors, {
      allowEmpty: true,
    });

    if (
      isFiniteNumber(result.public_score) &&
      isFiniteNumber(result.hidden_score) &&
      isFiniteNumber(result.official_score)
    ) {
      const expected = roundTo(
        result.public_score * 0.6 + result.hidden_score * 0.4,
        3,
      );
      if (Math.abs(expected - result.official_score) > 1) {
        warnings.push(
          `${path}.official_score 与 0.6×公开 + 0.4×隐藏 的差值超过 1 分。`,
        );
      }
    }
  });
}

function validateStory(story, errors) {
  const path = "story";
  if (!isPlainObject(story)) {
    errors.push("story 缺失或不是对象");
    return;
  }
  for (const key of [
    "flags",
    "completed_event_ids",
    "pending_event_ids",
    "unlocked_cg_ids",
  ]) {
    if (!Array.isArray(story[key])) {
      errors.push(`${path}.${key} 必须是数组`);
    }
  }
  checkNum(
    story,
    "current_chapter",
    `${path}.current_chapter`,
    1,
    null,
    errors,
    { integer: true },
  );
  checkString(story, "ending_id", `${path}.ending_id`, errors, {
    allowNull: true,
  });
}

function validateSecurities(securities, errors, warnings) {
  if (!Array.isArray(securities)) {
    errors.push("securities 必须是数组");
    return;
  }
  if (securities.length !== 6) {
    warnings.push(`securities 数量为 ${securities.length}，标准局应为 6 支。`);
  }
  securities.forEach((security, index) => {
    const path = `securities[${index}]`;
    if (!isPlainObject(security)) {
      errors.push(`${path} 必须是对象`);
      return;
    }
    checkString(security, "security_id", `${path}.security_id`, errors, {
      allowEmpty: false,
    });
    checkString(security, "issuer_id", `${path}.issuer_id`, errors, {
      allowEmpty: false,
    });
    checkNum(security, "price_kc", `${path}.price_kc`, 0.0001, null, errors);
    checkNum(
      security,
      "fundamental_price_kc",
      `${path}.fundamental_price_kc`,
      0.0001,
      null,
      errors,
    );
    checkNum(
      security,
      "shares_outstanding",
      `${path}.shares_outstanding`,
      1,
      null,
      errors,
      { integer: true },
    );
    checkBool(security, "listed", `${path}.listed`, errors);
    checkNum(
      security,
      "liquidity_shares",
      `${path}.liquidity_shares`,
      0,
      null,
      errors,
      { integer: true },
    );
  });
}

function validateTeacherContracts(contracts, errors) {
  if (!Array.isArray(contracts)) {
    errors.push("teacher_contracts 必须是数组");
    return;
  }
  contracts.forEach((contract, index) => {
    const path = `teacher_contracts[${index}]`;
    if (!isPlainObject(contract)) {
      errors.push(`${path} 必须是对象`);
      return;
    }
    checkString(contract, "contract_id", `${path}.contract_id`, errors, {
      allowEmpty: false,
    });
    checkString(contract, "teacher_model_id", `${path}.teacher_model_id`, errors, {
      allowEmpty: false,
    });
    checkEnum(
      contract,
      "access_level",
      TEACHER_ACCESS_LEVELS,
      `${path}.access_level`,
      errors,
    );
    checkBool(contract, "authorized", `${path}.authorized`, errors);
    checkNum(
      contract,
      "quota_records_k",
      `${path}.quota_records_k`,
      0,
      null,
      errors,
    );
    checkNum(
      contract,
      "remaining_records_k",
      `${path}.remaining_records_k`,
      0,
      null,
      errors,
    );
    checkNum(
      contract,
      "output_coverage",
      `${path}.output_coverage`,
      0,
      1,
      errors,
    );
    checkNum(
      contract,
      "expires_turn",
      `${path}.expires_turn`,
      0,
      null,
      errors,
      { integer: true },
    );
    checkNum(contract, "paid_cost_kc", `${path}.paid_cost_kc`, 0, null, errors);
    checkBool(contract, "is_revoked", `${path}.is_revoked`, errors);
  });
}

export function validateGameState(state) {
  const errors = [];
  const warnings = [];

  try {
    if (!isPlainObject(state)) {
      errors.push("GameState 根结构必须是对象");
      return { valid: false, ok: false, errors, warnings };
    }

    checkNum(
      state,
      "schema_version",
      "schema_version",
      1,
      null,
      errors,
      { integer: true },
    );
    checkString(state, "ruleset_version", "ruleset_version", errors, {
      allowEmpty: false,
    });
    checkString(state, "content_hash", "content_hash", errors, {
      allowEmpty: true,
    });
    checkString(state, "campaign_id", "campaign_id", errors, {
      allowEmpty: false,
    });
    checkNum(state, "campaign_seed", "campaign_seed", 0, null, errors, {
      integer: true,
    });
    checkEnum(state, "game_mode", GAME_MODES, "game_mode", errors);

    errors.push(...validateServiceEconomy(state.serving));
    validateWorld(state.world, errors, warnings);
    validateCompany(state.company, errors, warnings);
    validateModel(state.active_model, errors, warnings);

    checkArray(state, "archived_models", "archived_models", errors, warnings);
    validateDatasets(state.datasets, errors, warnings);
    validateAnnotationContracts(
      state.annotation_contracts,
      errors,
      warnings,
    );
    validateResearchProjects(state.research_projects, errors);
    checkArray(
      state,
      "unlocked_research_ids",
      "unlocked_research_ids",
      errors,
      warnings,
    );
    validateLegal(state.legal_exposures, state.legal_cases, errors);
    validateProducts(state.products, errors, warnings);
    validateSectors(state.sectors, errors, warnings);
    validateMilestones(state.milestones, errors);
    validateRaceResults(state.race_results, errors, warnings);
    validateStory(state.story, errors);
    errors.push(...validatePersonalHistory(state));
    checkArray(
      state,
      "processed_action_ids",
      "processed_action_ids",
      errors,
      warnings,
    );
    checkString(state, "action_log_hash", "action_log_hash", errors, {
      allowEmpty: false,
    });
    validateTeacherContracts(state.teacher_contracts, errors);
    validateSecurities(state.securities, errors, warnings);

    if (!isPlainObject(state.owned_card_levels)) {
      errors.push("owned_card_levels 必须是对象");
    } else {
      for (const cardId of Object.keys(state.owned_card_levels)) {
        const level = state.owned_card_levels[cardId];
        if (!isFiniteNumber(level) || level < 1) {
          errors.push(
            `owned_card_levels.${cardId} 必须是 ≥1 的数字，当前 ${JSON.stringify(
              level,
            )}`,
          );
        }
        if (SUPPORT_CARD_INDEX.size > 0 && !SUPPORT_CARD_INDEX.has(cardId)) {
          warnings.push(`owned_card_levels 含有未知支援卡 ID：${cardId}`);
        }
      }
    }

    if (isPlainObject(state.active_model)) {
      const cardIds = Array.isArray(state.active_model.support_card_ids)
        ? state.active_model.support_card_ids
        : [];
      if (isPlainObject(state.owned_card_levels)) {
        for (const cardId of cardIds) {
          if (state.owned_card_levels[cardId] === undefined) {
            warnings.push(
              `active_model.support_card_ids 含未拥有支援卡：${cardId}`,
            );
          }
        }
      }
    }
  } catch (error) {
    errors.push(
      `校验过程发生异常：${
        error && error.message ? error.message : String(error)
      }`,
    );
  }

  return {
    valid: errors.length === 0,
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

/* ------------------------------------------------------------------ *
 * 29. 目录常量与索引（供本模块校验与外部复用）
 * ------------------------------------------------------------------ */

const MAX_PRODUCTS = Math.max(
  1,
  Math.floor(numOr(ruleValue("company.max_products", 3), 3)),
);
const MAX_CHECKPOINTS = Math.max(
  1,
  Math.floor(numOr(ruleValue("model.max_checkpoints", 3), 3)),
);
const SUPPORT_CARD_INDEX = buildIndex(asArray(SUPPORT_CARDS), "card_id", "id");
