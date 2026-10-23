import { readCapabilities, audienceFit, AUDIENCE_SEGMENTS, CAPABILITY_KEYS } from '../data/model_capabilities.js';
import { APPLICATIONS } from '../data/catalog_access.js';
import { createGateway, ensureGateway, frozenCapabilities, applicationReach, gatewayForecast, offerTraffic, abuseForecast, settleGateway, validateGateway, isServiceCase } from './access_engine.js';
export { configureGateway, revokeProxyClient, rotateServiceCredentials } from './access_engine.js';
import { COMPUTE_SOURCES, MODEL_ROUTES, DEFAULT_OFFERS } from '../data/catalog_business.js';

const n = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, n(v, lo)));
const r = v => Math.round(n(v) * 10000) / 10000;
const tokens = v => Math.floor(Math.max(0, n(v)) * 1e6) / 1e6;
const turnOf = s => Math.max(1, Math.floor(n(s.world?.turn_index ?? s.turn, 1)));
const clone = value => JSON.parse(JSON.stringify(value));
function roll(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}
const finite = value => typeof value === 'number' && Number.isFinite(value);
const hasRoute = key => Object.hasOwn(MODEL_ROUTES, key);
function applySentimentDelta(state, before) {
  const b = state.serving, c = state.company;
  const publicTrustBefore = n(c.public_trust, n(c.trust, 60));
  c.reputation = r(clamp(n(c.reputation, 20) + b.reputation - before.reputation, 0, 100));
  c.trust = r(clamp(n(c.trust, 60) + b.trust - before.trust, 0, 100));
  c.public_trust = r(clamp(publicTrustBefore + b.trust - before.trust, 0, 100));
}

export function createServiceEconomy() {
  return {
    version: 1, owned_share_pct: 0, owned_purchases: 0, contracts: [], spot_blocks: 0, upstream_blocks: 0,
    routing: { variant: 'native', share_pct: 0, disclosure: 'disclosed' },
    offers: DEFAULT_OFFERS.map(o => ({ ...clone(o), published_model: null, lifetime_revenue_kc: 0 })),
    gateway:createGateway(),
    reputation: 60, trust: 65, rating: 4.2, evidence: 0, exposed_evidence: 0,
    hidden_revenue_kc: 0, hidden_affected_users: 0, complaints: 0, next_case_threshold: 65,
    ledger: [], reviews: [], incidents: [], last_settled_turn: 0, last_audit_turn: -6,
  };
}

// Migration preserves balances and turns old generic products into a single API service.
export function ensureServiceEconomy(state) {
  if (state.serving && state.serving.version !== 1) throw new Error('经营存档版本不受支持，请使用匹配版本打开；原存档未被覆盖。');
  if (!state.company) state.company = {};
  if (!Array.isArray(state.legal_cases)) state.legal_cases = [];
  if (!Array.isArray(state.legal_exposures)) state.legal_exposures = [];
  if (!state.serving) {
    state.serving = createServiceEconomy();
    const old = (state.products || []).find(p => !p.is_suspended && !p.suspended && p.active !== false);
    if (old) {
      const api = state.serving.offers[0];
      api.enabled = true;
      api.name = old.display_name || old.name || api.name;
      api.published_model = modelSnapshot(state);
      state.serving.owned_share_pct = 60;
      state.serving.incidents.push({ turn: turnOf(state), kind: 'migration', title: '旧产品已转为 Token API', detail: '现金与模型保持原值，后续按真实服务量结算。' });
    }
    for (const p of state.products || []) p.billing_engine = 'serving_v1';
  }
  const b = state.serving;
  for (const key of ['contracts', 'ledger', 'reviews', 'incidents']) if (!Array.isArray(b[key])) b[key] = [];
  for (const def of DEFAULT_OFFERS) {
    if (!b.offers?.some(o => o.id === def.id)) (b.offers ||= []).push({ ...clone(def), published_model: null, lifetime_revenue_kc: 0 });
    const offer=b.offers.find(o=>o.id===def.id);
    for(const key of ['audience','access_mode','allowed_apps','resale_allowed'])if(def[key]!==undefined&&offer[key]===undefined)offer[key]=clone(def[key]);
    if(offer.published_model&&!offer.published_model.capabilities)offer.published_model.capabilities=frozenCapabilities(offer.published_model);
  }
  ensureGateway(state);
  return b;
}

export function modelSnapshot(state) {
  const m = state.active_model || {};
  const capabilities = readCapabilities(m);
  const stats = Object.values(capabilities);
  return {
    capabilities, id: m.model_id || 'model_active', name: m.display_name || m.name || '我的下一版',
    generation: n(m.generation_index, 1), quality: r(stats.length ? stats.reduce((a,b) => a+b, 0) / stats.length : 450),
    active_params_b: Math.max(0.1, n(m.sim_active_params_b, 4)), published_turn: turnOf(state),
  };
}

export function getTrainingComputeCapacity(state) {
  const base = Math.max(0, n(state.company?.cluster_compute_cu ?? state.cluster_compute_cu, 140));
  return r(base * (1 - clamp(state.serving?.owned_share_pct || 0, 0, 90) / 100));
}

export function configureSupply(state, config) {
  const b = ensureServiceEconomy(state);
  if ('owned_share_pct' in config && (!finite(config.owned_share_pct) || config.owned_share_pct < 0 || config.owned_share_pct > 90)) return { ok: false, reason: '自有算力分配必须在 0–90% 之间。' };
  for (const key of ['spot_blocks', 'upstream_blocks']) if (key in config && (!Number.isInteger(config[key]) || config[key] < 0 || config[key] > 6)) return { ok: false, reason: '弹性供应数量必须是 0–6 的整数。' };
  for (const key of ['owned_share_pct', 'spot_blocks', 'upstream_blocks']) if (key in config) b[key] = config[key];
  return { ok: true };
}

function pay(state, amount, category = 'rnd') {
  state.company.cash_kc = r(n(state.company.cash_kc) - amount);
  const key = category === 'legal' ? 'quarter_paid_legal_kc' : 'quarter_paid_rnd_kc';
  state.company[key] = r(n(state.company[key]) + amount);
}

export function procureCompute(state, source) {
  const b = ensureServiceEconomy(state), turn = turnOf(state);
  if (source === 'owned') {
    if (b.owned_purchases >= 8) return { ok: false, reason: '当前园区最多新增 8 组机柜。' };
    const def = COMPUTE_SOURCES.owned;
    if (n(state.company.cash_kc) < def.purchase_kc) return { ok: false, reason: '采购资金不足。' };
    pay(state, def.purchase_kc);
    state.company.cluster_compute_cu = r(n(state.company.cluster_compute_cu, 140) + def.block_cu);
    state.company.cluster_memory_gb = r(n(state.company.cluster_memory_gb, 96) + def.memory_gb);
    b.owned_purchases += 1;
    return { ok: true, cost_kc: def.purchase_kc };
  }
  if (source === 'reserved') {
    const def = COMPUTE_SOURCES.reserved;
    if (b.contracts.filter(c => c.end_turn >= turn).length >= 6) return { ok: false, reason: '长约云最多同时 6 组。' };
    if (n(state.company.cash_kc) < def.setup_kc + def.cost_kc) return { ok: false, reason: '至少需要覆盖开通费和首回合租金。' };
    pay(state, def.setup_kc);
    b.contracts.push({ id: `cloud_${turn}_${b.contracts.length}`, start_turn: turn, end_turn: turn + def.term_turns - 1, auto_renew: false });
    return { ok: true, cost_kc: def.setup_kc };
  }
  return { ok: false, reason: '未知算力来源。' };
}

export function setContractRenewal(state, id, enabled) {
  const b = ensureServiceEconomy(state);
  const c = b.contracts.find(c => c.id === id && c.end_turn >= turnOf(state));
  if (!c) return { ok: false, reason: '合同已经到期。' };
  c.auto_renew = Boolean(enabled);
  return { ok: true };
}

export function configureRouting(state, config) {
  const b = ensureServiceEconomy(state);
  if (!hasRoute(config.variant) || !['disclosed', 'hidden'].includes(config.disclosure) || !finite(config.share_pct) || config.share_pct < 0 || config.share_pct > 100) return { ok: false, reason: '路由配置无效。' };
  b.routing = { variant: config.variant, share_pct: config.variant === 'native' ? 0 : config.share_pct, disclosure: config.disclosure };
  return { ok: true };
}

export function configureOffer(state, id, config = {}) {
  const b = ensureServiceEconomy(state), o = b.offers.find(o => o.id === id);
  if (!o) return { ok: false, reason: '产品不存在。' };
  const ranges = { price_kc_per_m: [2, 80], plan_price_kc: [0.1, 2], included_tokens_m: [0.01, 0.5], overage_price_kc_per_m: [2, 80], price_kc_per_cu: [0.2, 3] };
  for (const [key, [min, max]] of Object.entries(ranges)) if (key in config && (!finite(config[key]) || config[key] < min || config[key] > max)) return { ok: false, reason: `${key} 超出可经营范围。` };
  if ('overage' in config && !['cap', 'metered'].includes(config.overage)) return { ok: false, reason: '超额计费方式无效。' };
  if ('audience' in config && !Object.hasOwn(AUDIENCE_SEGMENTS,config.audience)) return {ok:false,reason:'客户群无效。'};
  if ('access_mode' in config && !['public_api','app_only'].includes(config.access_mode)) return {ok:false,reason:'接入方式无效。'};
  if ('allowed_apps' in config && (!Array.isArray(config.allowed_apps)||new Set(config.allowed_apps).size!==config.allowed_apps.length||config.allowed_apps.some(id=>!APPLICATIONS.some(a=>a.id===id)))) return {ok:false,reason:'应用白名单无效。'};
  if ('resale_allowed' in config && typeof config.resale_allowed!=='boolean') return {ok:false,reason:'转售许可必须是明确的开启或关闭。'};
  if ((config.access_mode??o.access_mode)==='app_only' && !(config.allowed_apps??o.allowed_apps??[]).length) return {ok:false,reason:'指定软件模式至少需要选择一个应用。'};
  for (const key of Object.keys(ranges)) if (key in config && key in o) o[key] = config[key];
  if ('overage' in config && o.billing === 'plan') o.overage = config.overage;
  if(o.billing!=='compute')for(const key of ['audience','access_mode','allowed_apps','resale_allowed'])if(key in config)o[key]=clone(config[key]);
  if ('enabled' in config) {
    o.enabled = Boolean(config.enabled);
    if (o.enabled && o.billing !== 'compute' && !o.published_model) o.published_model = modelSnapshot(state);
  }
  return { ok: true, offer: o };
}

export function publishServiceModel(state, id) {
  const b = ensureServiceEconomy(state), o = b.offers.find(o => o.id === id && o.billing !== 'compute');
  if (!o) return { ok: false, reason: '这个产品不提供模型。' };
  o.published_model = modelSnapshot(state);
  return { ok: true, model: o.published_model };
}

function supplyFor(state) {
  const b = state.serving, turn = turnOf(state), def = COMPUTE_SOURCES;
  const index = clamp(state.world?.spot_gpu_price_index ?? 1, 0.5, 2);
  const owned = n(state.company.cluster_compute_cu, 140) * b.owned_share_pct / 100;
  const contracts = b.contracts.filter(c => c.start_turn <= turn && c.end_turn >= turn);
  const reserved = contracts.length * def.reserved.block_cu;
  const spotAvailability = 0.45 + roll(`${state.campaign_seed}:${turn}:spot`) * 0.55;
  const spot = b.spot_blocks * def.spot.block_cu * spotAvailability;
  return {
    owned_cu: r(owned), reserved_cu: r(reserved), spot_cu: r(spot), spot_availability: r(spotAvailability),
    local_cu: r(owned + reserved + spot), training_cu: getTrainingComputeCapacity(state),
    upstream_tokens_m: b.upstream_blocks * def.upstream.block_tokens_m,
    fixed_cost_kc: r(owned * def.owned.power_kc_per_cu + contracts.length * def.reserved.cost_kc + b.spot_blocks * def.spot.cost_kc * index),
    owned_cost_kc: r(owned * def.owned.power_kc_per_cu), reserved_cost_kc: contracts.length * def.reserved.cost_kc,
    spot_cost_kc: r(b.spot_blocks * def.spot.cost_kc * index), spot_unit_cost_kc: r(def.spot.cost_kc * index), active_contracts: contracts.length,
  };
}

function customerDemand(state, o) {
  const b = state.serving, isB = o.segment === 'tob';
  const market = clamp(isB ? state.world?.enterprise_demand ?? 1 : state.world?.consumer_demand ?? 1, 0.2, 2);
  const priceRatio = o.billing === 'token' ? o.price_kc_per_m / 18 : o.billing === 'plan' ? o.plan_price_kc / (o.id==='coding_plan'?.85:.32) : o.price_kc_per_cu / 0.95;
  const quality = o.billing === 'compute' ? .8 : audienceFit(frozenCapabilities(o.published_model),o.audience||'general');
  // A finite audience and gradual acquisition prevent instant growth from price changes.
  const audience = o.id==='coding_plan'?650:o.billing === 'plan' ? 1300 : o.billing === 'token' ? 110 : 40;
  const reach=applicationReach(o);
  const target = audience * (b.reputation / 100) * (0.5 + b.trust / 200) * quality * market * reach / Math.pow(priceRatio, 1.2);
  const lastSat = o.last?.satisfaction ?? 0.85;
  const priceChurn = clamp((priceRatio - 1) * 0.12, 0, 0.65);
  const churn = clamp((1 - lastSat) * (isB ? 0.32 : 0.23) + (100 - b.trust) / 3000 + priceChurn, 0.01, 0.8);
  const acquired = Math.min(Math.max(0, target - o.customers) * 0.12, Math.max(o.billing === 'plan' ? 6 : 1, o.customers * 0.25));
  return { customers: r(Math.max(0, o.customers * (1 - churn) + acquired)), churn_rate: r(churn), market: r(market),audience_fit:r(quality),application_reach:reach };
}

function computePreview(state) {
  const b = state.serving, supply = supplyFor(state), variant = MODEL_ROUTES[b.routing.variant],gateway=gatewayForecast(state);
  const routeShare = b.routing.variant === 'native' ? 0 : b.routing.share_pct / 100;
  const costFactor = 1 - routeShare * (1 - variant.cost_factor);
  const qualityFactor = 1 - routeShare * (1 - variant.quality_factor);
  const hidden = b.routing.disclosure === 'hidden' && qualityFactor < 0.999;
  const rows = b.offers.filter(o => o.enabled).map(o => {
    const demand = customerDemand(state, o);
    const traffic=offerTraffic(o,demand.customers,gateway);
    const requested=traffic.demand_tokens_m;
    const perM = o.billing === 'compute' ? 0 : 6 * Math.sqrt((o.published_model?.active_params_b || 4) / 4) * costFactor;
    return { id: o.id, name: o.name, billing: o.billing, segment: o.segment, ...demand,...traffic,
      demand_cu: o.billing === 'compute' ? demand.customers * o.cu_per_customer : requested * perM,
      compute_per_m: perM, quality_factor: o.billing === 'compute' ? 1 : qualityFactor,
      model_name: o.published_model?.name || '未发布', promised_quality: o.published_model?.quality || 0,
    };
  });
  const gpu = rows.find(o => o.billing === 'compute');
  // Same utilization ratio for CU rentals and model requests; no starvation by product order.
  const totalDemandCu = rows.reduce((sum, o) => sum + o.demand_cu, 0);
  const gpuServedCu = gpu ? Math.min(gpu.demand_cu, supply.local_cu * gpu.demand_cu / Math.max(0.001, totalDemandCu)) : 0;
  const inference = rows.filter(o => o.billing !== 'compute');
  const requiredCu = inference.reduce((sum, o) => sum + o.demand_cu, 0);
  const localRatio = requiredCu > 0 ? Math.min(1, Math.max(0, supply.local_cu - gpuServedCu) / requiredCu) : 1;
  const remainingTokens = inference.reduce((sum, o) => sum + o.demand_tokens_m * (1 - localRatio), 0);
  const upstreamRatio = remainingTokens > 0 ? Math.min(1, supply.upstream_tokens_m / remainingTokens) : 0;
  const upstreamTotal = Math.min(remainingTokens, supply.upstream_tokens_m);
  let revenue = 0, refunds = 0, hiddenRevenue = 0, affected = 0, complaints = 0;
  for (const row of rows) {
    const o = b.offers.find(o => o.id === row.id);
    row.fulfillment = o.billing === 'compute' ? (row.demand_cu > 0 ? gpuServedCu / row.demand_cu : 1) : localRatio + (1 - localRatio) * upstreamRatio;
    row.served_cu = r(o.billing === 'compute' ? gpuServedCu : row.demand_cu * localRatio);
    row.served_tokens_m = tokens(row.demand_tokens_m * row.fulfillment);
    row.upstream_tokens_m = tokens(row.demand_tokens_m * (1 - localRatio) * upstreamRatio);
    row.billable_tokens_m = 0;
    let gross = 0;
    if (o.billing === 'token') { row.billable_tokens_m = row.served_tokens_m; gross = row.served_tokens_m * o.price_kc_per_m; }
    if (o.billing === 'compute') gross = row.served_cu * o.price_kc_per_cu;
    if (o.billing === 'plan') {
      // Each paying account keeps its own quota. A shared pool cannot consume another cohort's allowance.
      row.billable_tokens_m = o.overage === 'metered' ? tokens(row.cohorts.reduce((s,c)=>s+Math.max(0,tokens(c.demand_tokens_m*row.fulfillment)-c.included_tokens_m),0)) : 0;
      gross = row.cohorts.reduce((s,c)=>s+c.accounts,0) * o.plan_price_kc * row.fulfillment + row.billable_tokens_m * o.overage_price_kc_per_m;
    }
    const slaRefund = row.fulfillment < o.sla ? gross * (1 - row.fulfillment) * (o.segment === 'tob' ? 0.3 : 0.12) : 0;
    row.refund_kc = r(slaRefund);
    row.revenue_kc = r(Math.max(0, gross - slaRefund));
    const capUtility = o.billing === 'plan' && o.overage === 'cap' ? clamp(o.included_tokens_m / o.tokens_per_customer_m, 0.55, 1) : 1;
    const expectations = b.routing.disclosure === 'disclosed' ? 0.5 + qualityFactor * 0.5 : 1;
    row.satisfaction = r(clamp(row.fulfillment * row.quality_factor / (o.billing === 'compute' ? 1 : expectations) * capUtility, 0, 1));
    row.complaints = Math.ceil(row.customers * Math.max(0, 0.88 - row.satisfaction) * (o.segment === 'tob' ? 1.4 : 0.6));
    row.next_customers = r(row.customers * (1 - clamp((1 - row.satisfaction) * 0.18, 0, 0.18)));
    row.cost_kc = r((supply.fixed_cost_kc+gateway.cost_kc) * row.demand_cu / Math.max(0.001, totalDemandCu) + row.upstream_tokens_m * COMPUTE_SOURCES.upstream.cost_kc_per_m * costFactor);
    row.margin_kc = r(row.revenue_kc - row.cost_kc);
    row.hidden = hidden && o.billing !== 'compute';
    row.actual_quality = r(row.promised_quality * row.quality_factor);
    if (row.hidden) { hiddenRevenue += row.revenue_kc * routeShare; affected += row.customers * routeShare * row.fulfillment; }
    revenue += row.revenue_kc; refunds += row.refund_kc; complaints += row.complaints;
  }
  const costs = supply.fixed_cost_kc + upstreamTotal * COMPUTE_SOURCES.upstream.cost_kc_per_m * costFactor + gateway.cost_kc;
  const exposureDelta = hidden && affected > 0 ? (9 + (1 - qualityFactor) * 50) * Math.min(1.4, 0.5 + affected / 80) : 0;
  return {
    turn: turnOf(state), rows, supply, hidden,gateway,abuse:abuseForecast(state,rows,gateway),governance_cost_kc:gateway.cost_kc, route_share: routeShare, cost_factor: r(costFactor), quality_factor: r(qualityFactor),
    demand_cu: r(totalDemandCu), served_cu: r(rows.reduce((sum, row) => sum + row.served_cu, 0)),
    tokens_m: tokens(rows.reduce((sum, row) => sum + row.served_tokens_m, 0)), upstream_tokens_m: tokens(upstreamTotal),
    revenue_kc: r(revenue), cost_kc: r(costs), margin_kc: r(revenue - costs), refunds_kc: r(refunds),
    hidden_revenue_kc: r(hiddenRevenue), hidden_affected_users: r(affected), exposure_delta: r(exposureDelta), complaints,
  };
}

export function previewServiceTurn(state) {
  const copy = clone(state);
  ensureServiceEconomy(copy);
  return computePreview(copy);
}

function addReview(b, row, turn) {
  const stars = Math.round(clamp(1 + row.satisfaction ** 2 * 4, 1, 5));
  const text = row.fulfillment < 0.7 ? '高峰期请求排队、失败，配额还没用完就掉线了。'
    : row.hidden && row.quality_factor < 0.85 ? '同一个模型名，答案却明显变差了。我们正在留存对比记录。'
    : row.hidden ? '最近推理变短了，文档里没有说明服务变更。'
    : row.quality_factor < 0.85 ? '轻量版已经在页面标明，日常任务够用，复杂任务仍有差距。'
    : row.billing === 'plan' && row.demand_tokens_m < row.requested_tokens_m ? '套餐额度和价格清楚，重度使用时很快会到上限。'
    : row.billing === 'compute' ? '算力按约交付，采购团队会继续观察稳定性。'
    : '账单和体验符合预期，愿意继续使用。';
  b.reviews.push({ id: `review_${turn}_${row.id}`, turn, product_id: row.id, author: row.segment === 'tob' ? '企业采购组' : '订阅用户', stars, text });
  b.reviews = b.reviews.slice(-36);
}

function fileClassAction(state, result) {
  const b = state.serving, turn = turnOf(state), serial = b.incidents.filter(i => i.kind === 'class_action').length + 1;
  const id = `service_class_${turn}_${serial}`, exposureId = `${id}_evidence`;
  const claim = r(160 + b.hidden_revenue_kc * 0.85 + b.hidden_affected_users * 0.25);
  const legalCase = {
    case_id: id, id, title: '用户集体诉讼：未披露的模型替换', kind: 'service_class_action',
    exposure_ids: [exposureId], jurisdiction_id: 'fictional_market_a', stage: 'notice',
    evidence_strength: clamp(b.evidence / 100, 0.55, 0.98), license_coverage: 0.2, counsel_quality: 0.5,
    claim_kc: claim, legal_cost_kc: 0, reserve_kc: claim, deadline_turn: turn + 4,
    affected_model_ids: b.offers.filter(o => o.enabled && o.published_model).map(o => o.published_model.id),
    outcome: 'pending', filed_turn: turn, affected_users: Math.ceil(b.hidden_affected_users),
  };
  state.legal_cases.push(legalCase);
  state.legal_exposures.push({ exposure_id: exposureId, id: exposureId, kind: 'misleading_claims', created_turn: turn, source_record_ids: b.ledger.slice(-5).map(x => `service_turn_${x.turn}`), severity: Math.min(100, b.evidence), discovery_probability: 1, remediated: false, fictional_only: true });
  b.reputation = clamp(b.reputation - 18, 0, 100); b.trust = clamp(b.trust - 22, 0, 100);
  b.rating = r(clamp(b.rating - 0.5, 1, 5));
  b.reviews.push({ id: `review_${id}`, turn, product_id: b.offers.find(o => o.enabled && o.billing !== 'compute')?.id || 'api', author: '用户联合申诉组', stars: 1, text: '对比报告证实了未披露的小模型替换，已联合其他付费用户发起集体诉讼。' });
  b.reviews = b.reviews.slice(-36);
  for (const offer of b.offers) if (offer.billing !== 'compute') offer.customers = r(offer.customers * 0.68);
  b.exposed_evidence = b.evidence;
  b.next_case_threshold = b.evidence + 70;
  b.hidden_revenue_kc = 0; b.hidden_affected_users = 0;
  const incident = { turn, kind: 'class_action', title: '路由对比报告公开，用户发起集体诉讼', detail: `口碑 −18 · 信任 −22 · 订阅与 API 客户流失 32% · 索赔 ${claim.toFixed(2)} kc`, case_id: id };
  b.incidents.push(incident);
  result.incidents.push(incident);
}

function closeServiceCase(state, c, outcome, cost, rep, trust) {
  pay(state, cost, 'legal');
  c.stage = 'closed'; c.outcome = outcome; c.reserve_kc = 0;
  c.legal_cost_kc = r(c.legal_cost_kc + cost); c.closed_turn = turnOf(state);
  const b = state.serving;
  b.reputation = clamp(b.reputation + rep, 0, 100); b.trust = clamp(b.trust + trust, 0, 100);
  for (const e of state.legal_exposures) if (c.exposure_ids.includes(e.exposure_id)) e.remediated = c.kind==='service_abuse' ? b.gateway.moderation!=='basic' : b.routing.disclosure === 'disclosed';
  return { ok: true, case_id: c.case_id, cost_kc: r(cost), outcome };
}

export function resolveServiceCase(state, id, action) {
  const b = ensureServiceEconomy(state), c = state.legal_cases.find(c => c.case_id === id && isServiceCase(c));
  const before = { reputation: b.reputation, trust: b.trust };
  if (!c || c.stage === 'closed') return { ok: false, reason: '案件不存在或已经结案。' };
  if (c.stage === 'hearing') return { ok: false, reason: '应诉材料已提交，请等待下一次审理。' };
  if (!['remediate', 'settle', 'fight'].includes(action)) return { ok: false, reason: '未知法务策略。' };
  const cost = r(action === 'remediate' ? c.claim_kc * 0.65 + 25 : action === 'settle' ? c.claim_kc * 0.85 : c.claim_kc * 0.25);
  if (n(state.company.cash_kc) < cost) return { ok: false, reason: '现金不足，需先融资才能处理。逾期仍会判决。' };
  if (action === 'fight') {
    pay(state, cost, 'legal'); c.legal_cost_kc = r(c.legal_cost_kc + cost);
    c.stage = 'hearing'; c.deadline_turn = turnOf(state) + 2;
    return { ok: true, cost_kc: cost, outcome: 'pending' };
  }
  if (action === 'remediate') {
    if(c.kind==='service_abuse'){
      b.gateway.moderation='strict';b.gateway.proxy_policy='strict';b.gateway.abuse_pressure*=.25;
      for(const client of b.gateway.proxy_clients)if(client.status==='active'){client.status='revoked';client.revoked_turn=turnOf(state);}
    }else b.routing.disclosure = 'disclosed';
  }
  const result = closeServiceCase(state, c, 'settled', cost, action === 'remediate' ? 6 : 1, action === 'remediate' ? 10 : 1);
  applySentimentDelta(state, before);
  return result;
}

function progressCases(state, result) {
  const turn = turnOf(state), b = state.serving;
  for (const c of state.legal_cases) {
    if (!isServiceCase(c) || c.stage === 'closed') continue;
    if (turn >= c.deadline_turn) {
      const won = c.stage === 'hearing' && roll(`${state.campaign_seed}:${c.case_id}:judgment`) < Math.max(0.05, 0.45 - c.evidence_strength * 0.4);
      const cost = won ? 0 : r(c.claim_kc * (c.stage === 'hearing' ? 1.25 : 1.4));
      const resolution = closeServiceCase(state, c, won ? 'not_liable' : 'liable', cost, won ? 1 : -8, won ? 0 : -10);
      const label=c.kind==='service_abuse'?'滥用责任诉讼':'集体诉讼';
      const incident = { turn, kind: 'judgment', title: won ? `${label}审理终结：抗辩获支持` : `${label}判决：承担赔偿`, detail: `本次支付 ${resolution.cost_kc} kc${won ? '' : ' · 口碑与信任再次下降'}`, case_id: c.case_id };
      b.incidents.push(incident); result.incidents.push(incident);
    } else if (c.stage === 'notice' && turn > c.filed_turn) c.stage = 'evidence';
  }
}

export function auditService(state) {
  const b = ensureServiceEconomy(state), turn = turnOf(state);
  const before = { reputation: b.reputation, trust: b.trust };
  if (turn - b.last_audit_turn < 6) return { ok: false, reason: '每六回合可进行一次公开审计。' };
  if (n(state.company.cash_kc) < 60) return { ok: false, reason: '审计需要 60 kc。' };
  pay(state, 60, 'legal'); b.routing.disclosure = 'disclosed'; b.last_audit_turn = turn;
  b.trust = clamp(b.trust + 4, 0, 100);
  b.incidents.push({ turn, kind: 'audit', title: '公开服务审计完成', detail: '已公开路由与降级策略，信任 +4；历史证据与在办案件仍保留。' });
  applySentimentDelta(state, before);
  return { ok: true, cost_kc: 60 };
}

export function settleServiceTurn(state) {
  const b = ensureServiceEconomy(state), turn = turnOf(state);
  if (turn <= b.last_settled_turn) return { ok: true, already_settled: true, turn, incidents: [] };
  const before = { reputation: b.reputation, trust: b.trust };
  const result = { ...computePreview(state), ok: true, incidents: [] };
  // Post receipts now. Quarter close reports this income and cost without posting them again.
  state.company.cash_kc = r(n(state.company.cash_kc) + result.margin_kc);
  for (const [key, value] of Object.entries({ quarter_serving_revenue_kc: result.revenue_kc, quarter_serving_cogs_kc: result.cost_kc, quarter_serving_units: result.tokens_m })) state.company[key] = r(n(state.company[key]) + value);
  state.company.quarter_serving_turns = n(state.company.quarter_serving_turns) + 1;
  for (const row of result.rows) {
    const o = b.offers.find(o => o.id === row.id);
    o.customers = row.next_customers; o.last = clone(row);
    o.lifetime_revenue_kc = r(n(o.lifetime_revenue_kc) + row.revenue_kc);
    addReview(b, row, turn);
  }
  if (result.rows.length) {
    const totalCustomers = result.rows.reduce((sum, row) => sum + row.customers, 0);
    const satisfaction = result.rows.reduce((sum, row) => sum + row.satisfaction * row.customers, 0) / Math.max(1, totalCustomers);
    b.rating = r(clamp(b.rating * 0.8 + (1 + satisfaction * 4) * 0.2, 1, 5));
    b.reputation = r(clamp(b.reputation + (satisfaction - 0.82) * 4, 0, 100));
    b.trust = r(clamp(b.trust + (satisfaction - 0.85) * 2, 0, 100));
  }
  b.evidence = r(b.evidence + result.exposure_delta);
  b.hidden_revenue_kc = r(b.hidden_revenue_kc + result.hidden_revenue_kc);
  b.hidden_affected_users = r(b.hidden_affected_users + result.hidden_affected_users);
  b.complaints += result.complaints;
  if (b.evidence >= b.next_case_threshold) fileClassAction(state, result);
  settleGateway(state,result);
  progressCases(state, result);
  b.ledger.push({ turn, revenue_kc: result.revenue_kc, cost_kc: result.cost_kc, margin_kc: result.margin_kc, tokens_m: result.tokens_m, served_cu: result.served_cu, refunds_kc: result.refunds_kc, customers: r(result.rows.reduce((sum, row) => sum + row.next_customers, 0)), reputation: b.reputation, trust: b.trust, hidden: result.hidden });
  b.ledger = b.ledger.slice(-192); b.incidents = b.incidents.slice(-80); b.last_settled_turn = turn;
  for (const c of b.contracts) {
    if (c.end_turn === turn && c.auto_renew) {
      // Renewal is a new four-turn commitment and pays the same activation fee.
      if (n(state.company.cash_kc) >= COMPUTE_SOURCES.reserved.setup_kc + COMPUTE_SOURCES.reserved.cost_kc) {
        pay(state, COMPUTE_SOURCES.reserved.setup_kc); c.end_turn += COMPUTE_SOURCES.reserved.term_turns;
      } else {
        const incident = { turn, kind: 'supply', title: '长约云续约失败', detail: '现金不足，下一回合该组算力退出供应池。' };
        b.incidents.push(incident); result.incidents.push(incident);
      }
    }
  }
  applySentimentDelta(state, before);
  return result;
}

export function validateServiceEconomy(b) {
  const errors = [];
  if (b === undefined) return errors; // v2 saves migrate after their core state is validated.
  if (!b || b.version !== 1) return ['serving.version 无效'];
  for (const [key, lo, hi] of [['owned_share_pct',0,90],['spot_blocks',0,6],['upstream_blocks',0,6],['owned_purchases',0,8],['reputation',0,100],['trust',0,100],['rating',1,5],['evidence',0,1e12],['exposed_evidence',0,1e12],['hidden_revenue_kc',0,1e12],['hidden_affected_users',0,1e12],['complaints',0,1e12],['next_case_threshold',1,1e12],['last_audit_turn',-6,193],['last_settled_turn',0,193]]) if (!finite(b[key]) || b[key] < lo || b[key] > hi) errors.push(`serving.${key} 无效`);
  for (const key of ['spot_blocks','upstream_blocks','owned_purchases','last_settled_turn','last_audit_turn']) if (!Number.isInteger(b[key])) errors.push(`serving.${key} 必须为整数`);
  if (!b.routing || !hasRoute(b.routing.variant) || !['disclosed','hidden'].includes(b.routing.disclosure) || !finite(b.routing.share_pct) || b.routing.share_pct < 0 || b.routing.share_pct > 100) errors.push('serving.routing 无效');
  if (!Array.isArray(b.offers) || ![3,4].includes(b.offers.length) || new Set(b.offers.map(o => o?.id)).size !== b.offers.length || !['api','plan','gpu'].every(id=>b.offers.some(o=>o.id===id))) errors.push('serving.offers 无效');
  else for (const o of b.offers) {
    const def = DEFAULT_OFFERS.find(d => d.id === o?.id);
    if (!def || o.billing !== def.billing || o.segment !== def.segment || typeof o.enabled !== 'boolean' || !finite(o.customers) || o.customers < 0 || o.customers > 1e7) errors.push('serving.offer 内容无效');
    for (const key of Object.keys(def || {}).filter(k => /price|tokens|sla|cu_per/.test(k))) if (!finite(o[key]) || o[key] <= 0 || o[key] > 1e5) errors.push(`serving.offer.${key} 无效`);
    if (o.billing === 'plan' && !['cap','metered'].includes(o.overage)) errors.push('serving.offer.overage 无效');
    if(o.audience!==undefined&&!Object.hasOwn(AUDIENCE_SEGMENTS,o.audience))errors.push('serving.offer.audience 无效');
    if(o.access_mode!==undefined&&!['public_api','app_only'].includes(o.access_mode))errors.push('serving.offer.access_mode 无效');
    if(o.allowed_apps!==undefined&&(!Array.isArray(o.allowed_apps)||o.allowed_apps.some(id=>!APPLICATIONS.some(a=>a.id===id))||new Set(o.allowed_apps).size!==o.allowed_apps.length))errors.push('serving.offer.allowed_apps 无效');
    if(o.access_mode==='app_only'&&!o.allowed_apps?.length)errors.push('serving.offer.app_only 缺少软件');
    if(o.resale_allowed!==undefined&&typeof o.resale_allowed!=='boolean')errors.push('serving.offer.resale_allowed 无效');
    if(o.published_model?.capabilities)for(const key of CAPABILITY_KEYS)if(!finite(o.published_model.capabilities[key])||o.published_model.capabilities[key]<0||o.published_model.capabilities[key]>1000)errors.push(`serving.offer.capabilities.${key} 无效`);
    if (o.enabled && o.billing !== 'compute' && (!o.published_model || typeof o.published_model.name !== 'string' || !finite(o.published_model.quality) || o.published_model.quality < 0 || o.published_model.quality > 1000 || !finite(o.published_model.active_params_b) || o.published_model.active_params_b <= 0 || o.published_model.active_params_b > 1e6)) errors.push('serving.offer.published_model 无效');
  }
  for (const key of ['contracts','ledger','reviews','incidents']) if (!Array.isArray(b[key]) || b[key].length > 1000) errors.push(`serving.${key} 无效`);
  if (Array.isArray(b.contracts)) for (const c of b.contracts) if (!c || typeof c.id !== 'string' || !Number.isInteger(c.start_turn) || !Number.isInteger(c.end_turn) || c.start_turn < 1 || c.end_turn < c.start_turn || typeof c.auto_renew !== 'boolean') errors.push('serving.contract 无效');
  if (Array.isArray(b.reviews)) for (const v of b.reviews) if (!v || !Number.isInteger(v.stars) || v.stars < 1 || v.stars > 5 || typeof v.text !== 'string' || v.text.length > 2000 || !finite(v.turn)) errors.push('serving.review 无效');
  if (Array.isArray(b.ledger)) for (const v of b.ledger) {
    if (!v || !Number.isInteger(v.turn) || v.turn < 1 || v.turn > 192) { errors.push('serving.ledger.turn 无效'); continue; }
    for (const key of ['revenue_kc','cost_kc','margin_kc','tokens_m','served_cu','refunds_kc','customers','reputation','trust']) if (!finite(v[key]) || (key !== 'margin_kc' && v[key] < 0)) errors.push(`serving.ledger.${key} 无效`);
  }
  errors.push(...validateGateway(b.gateway));
  return errors;
}
