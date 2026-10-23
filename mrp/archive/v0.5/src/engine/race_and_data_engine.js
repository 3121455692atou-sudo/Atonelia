import { CAPABILITY_KEYS } from '../data/model_capabilities.js';
import { BENCHMARKS, DATASET_TEMPLATES } from '../data/catalog_world.js';

export const LEAGUE_BUDGET_MULTIPLIERS = { edge: 0.5, small: 1.0, open: 4.0, frontier: 16.0 };
export const THINKING_MULTIPLIERS = { quick: 0.7, balanced: 1.0, deliberate: 2.0 };

const STAT_KEYS = CAPABILITY_KEYS;
const DATASET_FORMATS = ['raw_text', 'instruction', 'preference_pairs', 'verified_tasks', 'trajectories'];
const RIGHTS_STATUSES = ['licensed', 'public_domain', 'consented', 'unclear', 'restricted', 'prohibited'];
const LABEL_METHODS = ['single', 'pairwise', 'triple_vote', 'process', 'solver', 'active', 'hybrid'];
const STAGE_ORDER = ['paper', 'toy_pilot', 'scale_pilot', 'production'];
const STAGE_THRESHOLDS = { paper: 0.20, toy_pilot: 0.40, scale_pilot: 0.70 };

const RESEARCH_ACTION_COSTS = {
  write_paper: 4,
  run_experiment: 5,
  run_toy_experiment: 8,
  run_scale_experiment: 18,
  run_production: 30,
  replicate: 12,
  validate_scale: 16,
  analyze_results: 4,
  resume: 0
};

function num(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  const n = num(value, min);
  return Math.min(max, Math.max(min, n));
}

function round(value, decimals = 2) {
  const n = num(value, 0);
  const p = 10 ** decimals;
  return Math.round((n + Number.EPSILON) * p) / p;
}

function hasFiniteNumber(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

function hashString(input) {
  const s = String(input);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shortHash(input) {
  return hashString(input).toString(16).padStart(8, '0').slice(0, 8);
}

function createRng(seed) {
  let t = seed >>> 0;
  return function rng() {
    t += 0x6d2b79f5;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function getOrCreateArray(owner, key) {
  if (!owner || typeof owner !== 'object') return [];
  if (Array.isArray(owner[key])) return owner[key];
  if (owner[key] && typeof owner[key] === 'object') {
    owner[key] = Object.values(owner[key]);
    return owner[key];
  }
  owner[key] = [];
  return owner[key];
}

function firstNonEmptyArray(values) {
  for (const value of values) {
    if (Array.isArray(value) && value.length > 0) return value;
  }
  return [];
}

function getBenchmarkList() {
  if (Array.isArray(BENCHMARKS)) return BENCHMARKS;
  if (BENCHMARKS && typeof BENCHMARKS === 'object') return Object.values(BENCHMARKS);
  return [];
}

function fallbackBenchmark(id) {
  const weights = {};
  for (const key of STAT_KEYS) weights[key] = 1 / STAT_KEYS.length;
  return {
    benchmark_id: id,
    id,
    name: id,
    benchmark_name: id,
    version: '1.0.0',
    benchmark_version: '1.0.0',
    difficulty: 500,
    weights,
    budget_cu: 40,
    compute_budget_cu: 40,
    compute_cost_cu: 20,
    card_count: 24,
    base_seconds: 600
  };
}

function normalizeBenchmarkWeights(rawWeights) {
  const weights = {};
  const raw = rawWeights && typeof rawWeights === 'object' ? rawWeights : {};
  const hasAny = STAT_KEYS.some((key) => raw[key] !== undefined && Number.isFinite(Number(raw[key])));
  for (const key of STAT_KEYS) {
    weights[key] = hasAny ? num(raw[key], 0) : 1 / STAT_KEYS.length;
  }
  return weights;
}

function resolveBenchmark(benchmarkId) {
  const target = benchmarkId || 'scholar_cup';
  const list = getBenchmarkList();
  let found = list.find((b) => b && (b.benchmark_id === target || b.id === target));
  if (!found && target !== 'scholar_cup') {
    found = list.find((b) => b && (b.benchmark_id === 'scholar_cup' || b.id === 'scholar_cup'));
  }
  if (!found && list.length > 0) found = list[0];
  if (!found) found = fallbackBenchmark(target);
  const resolvedId = found.benchmark_id || found.id || target;
  return {
    ...found,
    benchmark_id: resolvedId,
    weights: normalizeBenchmarkWeights(found.weights)
  };
}

function normalizeRaceRequest(rawRequest) {
  const raw = rawRequest && typeof rawRequest === 'object' ? rawRequest : {};
  const leagueTier = LEAGUE_BUDGET_MULTIPLIERS[raw.league_tier] !== undefined ? raw.league_tier : 'small';
  const thinkingMode = THINKING_MULTIPLIERS[raw.thinking_mode] !== undefined ? raw.thinking_mode : 'balanced';
  const denoiseSteps = Math.round(clamp(num(raw.denoise_steps, 16), 2, 64));
  return {
    ...raw,
    benchmark_id: raw.benchmark_id || raw.benchmarkId || 'scholar_cup',
    league_tier: leagueTier,
    thinking_mode: thinkingMode,
    denoise_steps: denoiseSteps,
    auto_skill: Boolean(raw.auto_skill ?? raw.autoSkill ?? false)
  };
}

function resolveModel(state, rawRequest = {}) {
  const s = state && typeof state === 'object' ? state : {};
  const raw = rawRequest && typeof rawRequest === 'object' ? rawRequest : {};
  if (raw.model && typeof raw.model === 'object') return raw.model;

  const requestedId = raw.model_id || raw.modelId;
  if (requestedId) {
    if (s.models && !Array.isArray(s.models) && s.models[requestedId]) return s.models[requestedId];
    if (Array.isArray(s.models)) {
      const found = s.models.find((m) => m && (m.model_id === requestedId || m.id === requestedId));
      if (found) return found;
    }
    if (s.model && (s.model.model_id === requestedId || s.model.id === requestedId)) return s.model;
  }

  if (s.model && typeof s.model === 'object') return s.model;
  if (s.active_model && typeof s.active_model === 'object') return s.active_model;
  if (s.player_model && typeof s.player_model === 'object') return s.player_model;
  if (s.playerModel && typeof s.playerModel === 'object') return s.playerModel;
  if (s.player && s.player.model && typeof s.player.model === 'object') return s.player.model;

  if (Array.isArray(s.models) && s.models.length > 0) return s.models[0];
  if (s.models && typeof s.models === 'object') {
    const values = Object.values(s.models);
    if (values.length > 0) return values[0];
  }

  return {};
}

function resolveArchitecture(state, model) {
  const s = state && typeof state === 'object' ? state : {};
  if (model && model.architecture && typeof model.architecture === 'object') return model.architecture;

  const requestedId = model?.architecture_id || s.active_architecture_id;
  if (requestedId) {
    if (s.architectures && !Array.isArray(s.architectures) && s.architectures[requestedId]) {
      return s.architectures[requestedId];
    }
    if (Array.isArray(s.architectures)) {
      const found = s.architectures.find((a) => a && (a.architecture_id === requestedId || a.id === requestedId));
      if (found) return found;
    }
  }

  if (s.architecture && typeof s.architecture === 'object') return s.architecture;
  if (s.active_architecture && typeof s.active_architecture === 'object') return s.active_architecture;
  if (s.arch && typeof s.arch === 'object') return s.arch;
  return {};
}

function getModelStat(model, key) {
  const stats = model && model.stats && typeof model.stats === 'object' ? model.stats : {};
  return clamp(num(stats[key], 0), 0, 1000);
}

function getBenchmarkName(benchmark) {
  return benchmark.name || benchmark.display_name || benchmark.benchmark_name || benchmark.title || benchmark.benchmark_id;
}

function getBenchmarkVersion(benchmark) {
  return benchmark.benchmark_version || benchmark.version || '1.0.0';
}

function getBenchmarkBudget(benchmark, leagueTier) {
  const base = num(
    benchmark.compute_budget_cu,
    num(benchmark.budget_cu, num(benchmark.base_budget_cu, 40))
  );
  const leagueBudgets = benchmark.league_budgets || benchmark.leagueBudgets;
  if (leagueBudgets && typeof leagueBudgets === 'object' && leagueBudgets[leagueTier] !== undefined) {
    return num(leagueBudgets[leagueTier], base);
  }
  return base * (LEAGUE_BUDGET_MULTIPLIERS[leagueTier] || 1);
}

function estimateComputeUsed(benchmark, req, weighted, thinkingMultiplier) {
  const base = num(
    benchmark.compute_cost_cu,
    num(benchmark.base_compute_cu, num(benchmark.compute_base_cu, 20))
  );
  const denoiseFactor = 0.55 + req.denoise_steps / 64;
  const skillFactor = 0.8 + 0.4 * clamp(weighted / 1000, 0, 1);
  return Math.max(0, base * (0.35 + 0.25 * thinkingMultiplier) * denoiseFactor * skillFactor);
}

function estimateCompletionSeconds(benchmark, req, weighted) {
  const base = num(
    benchmark.estimated_seconds,
    num(benchmark.completion_seconds, num(benchmark.base_seconds, 600))
  );
  const thinkingMultiplier = THINKING_MULTIPLIERS[req.thinking_mode] || 1.0;
  const denoiseFactor = 0.5 + req.denoise_steps / 64;
  const skillFactor = 1 - 0.1 * clamp(weighted / 1000, 0, 1);
  return Math.max(1, base * thinkingMultiplier * denoiseFactor * skillFactor);
}

function estimatePrizeKc(benchmark, leagueTier, officialScore, rankEligible) {
  if (!rankEligible) return 0;
  let base = benchmark.prize_kc;
  if (base && typeof base === 'object') {
    base = base[leagueTier] ?? base.default ?? 0;
  }
  let resolvedBase = num(base, num(benchmark.prize, 0));
  if (resolvedBase <= 0) {
    const leagueBase = { edge: 60, small: 150, open: 650, frontier: 2600 };
    resolvedBase = leagueBase[leagueTier] || 150;
  }
  return Math.round(resolvedBase * (0.35 + 0.65 * clamp(officialScore / 1000, 0, 1)));
}

function estimateReputationGain(benchmark, leagueTier, officialScore, rankEligible) {
  if (!rankEligible) return 0;
  let base = benchmark.reputation_gain;
  if (base && typeof base === 'object') {
    base = base[leagueTier] ?? base.default ?? 0;
  }
  let resolvedBase = num(base, num(benchmark.reputation, 0));
  if (resolvedBase <= 0) {
    const leagueBase = { edge: 2, small: 5, open: 18, frontier: 60 };
    resolvedBase = leagueBase[leagueTier] || 5;
  }
  return Math.round(resolvedBase * (0.2 + 0.8 * clamp(officialScore / 1000, 0, 1)));
}

function buildDramaticQuestion(benchmark, modelId, req, rankEligible, contam) {
  if (benchmark.dramatic_question) return benchmark.dramatic_question;
  if (benchmark.question) return benchmark.question;
  if (!rankEligible) {
    if (contam >= 35) return `Can ${modelId} survive the scrutineers after contamination alarms fire?`;
    return `Will ${modelId}'s ${getBenchmarkName(benchmark)} run be thrown out before the final whistle?`;
  }
  return `Can ${modelId} hold its nerve through ${getBenchmarkName(benchmark)} in the ${req.league_tier} league?`;
}

function getNextRaceSequence(state, commit) {
  const s = state && typeof state === 'object' ? state : {};
  const current = Math.max(0, Math.floor(num(s.race_counter, num(s.next_race_seq, num(s.race_seq, 0)))));
  const next = current + 1;
  if (commit) {
    if (s.race_counter !== undefined) s.race_counter = next;
    else if (s.next_race_seq !== undefined) s.next_race_seq = next;
    else if (s.race_seq !== undefined) s.race_seq = next;
    else s.race_counter = next;
  }
  return next;
}

function buildRaceOutcome(state, rawRequest, commit) {
  const s = state && typeof state === 'object' ? state : {};
  const raw =
    typeof rawRequest === 'string'
      ? { benchmark_id: rawRequest }
      : rawRequest && typeof rawRequest === 'object'
      ? rawRequest
      : {};
  const req = normalizeRaceRequest(raw);
  const benchmark = resolveBenchmark(req.benchmark_id);
  const benchmarkId = benchmark.benchmark_id;
  const model = resolveModel(s, raw);
  const architecture = resolveArchitecture(s, model);
  const modelId = raw.model_id || raw.modelId || model.model_id || model.id || s.active_model_id || s.player_model_id || 'player_model';

  let weighted = 0;
  for (const key of STAT_KEYS) {
    weighted += getModelStat(model, key) * benchmark.weights[key];
  }

  const thinkingMultiplier = THINKING_MULTIPLIERS[req.thinking_mode] || 1.0;
  const denoiseSteps = req.denoise_steps || 16;
  let bonuses;
  if (architecture.generation_objective === 'masked_diffusion') {
    bonuses = 45 * (1 - Math.exp(-denoiseSteps / 12)) + (benchmarkId === 'revision_storm' ? 25 : 0);
  } else {
    bonuses = 55 * (getModelStat(model, 'reasoning') / 1000) * Math.log2(thinkingMultiplier);
  }

  const overfit = clamp(num(model.overfit, 0), 0, 1);
  const rewardHacking = clamp(num(model.reward_hacking, 0), 0, 1);
  const forgetting = clamp(num(model.forgetting, 0), 0, 1);
  const penalty = 0.40 * overfit + 0.35 * rewardHacking + 0.25 * forgetting;
  const difficulty = num(benchmark.difficulty, num(benchmark.base_difficulty, 500));
  const rawSigmoid = (weighted + bonuses - difficulty - penalty) / 100;
  const pSuccess = clamp(1 / (1 + Math.exp(-rawSigmoid)), 0.01, 0.99);

  const budgetLimit = getBenchmarkBudget(benchmark, req.league_tier);
  const computeUsedCu = round(estimateComputeUsed(benchmark, req, weighted, thinkingMultiplier), 2);
  const budgetViolated = raw.budget_violated !== undefined
    ? Boolean(raw.budget_violated)
    : computeUsedCu > budgetLimit;

  const completionSeconds = round(estimateCompletionSeconds(benchmark, req, weighted), 2);

  const raceSeq = getNextRaceSequence(s, commit);
  const raceId = raw.race_id || raw.raceId || `race_${benchmarkId}_${modelId}_${raceSeq}`;
  const seedId = raw.seed_id || raw.seedId || s.seed || s.run_seed || 'seed_0';
  const rngSeed = hashString(
    `${seedId}|${raceId}|${modelId}|${benchmarkId}|${req.league_tier}|${req.thinking_mode}|${denoiseSteps}`
  );
  const rng = createRng(rngSeed);

  const cardCount = Math.round(clamp(
    num(benchmark.card_count, num(benchmark.task_count, num(benchmark.cards?.length, 24))),
    12,
    40
  ));

  const cardLog = [];
  let publicSum = 0;
  let hiddenSum = 0;

  for (let i = 0; i < cardCount; i += 1) {
    const focusStat = STAT_KEYS[i % STAT_KEYS.length];
    const focusWeight = benchmark.weights[focusStat] || 0;
    const focusSkill = getModelStat(model, focusStat) / 1000;
    const cardDifficulty = difficulty + (rng() - 0.5) * 160 + (focusWeight - 1 / 6) * 100;
    const cardP = clamp(
      pSuccess + (focusSkill - 0.5) * 0.15 + (rng() - 0.5) * 0.12,
      0.01,
      0.99
    );
    const solved = rng() < cardP;
    const partial = solved ? 0.70 + 0.30 * rng() : 0.05 + 0.25 * rng();
    const publicRaw = clamp(
      1000 * partial * (0.75 + 0.25 * clamp((weighted + bonuses) / 1000, 0, 1)),
      0,
      1000
    );
    const hiddenRaw = clamp(
      1000 *
        (solved ? 0.60 + 0.35 * rng() : 0.03 + 0.22 * rng()) *
        (0.72 + 0.28 * clamp((weighted - penalty) / 1000, 0, 1)),
      0,
      1000
    );
    publicSum += publicRaw;
    hiddenSum += hiddenRaw;
    cardLog.push({
      index: i + 1,
      card_id: `${benchmarkId}_card_${i + 1}`,
      focus_stat: focusStat,
      difficulty: round(cardDifficulty, 2),
      success: solved,
      public_points: round(publicRaw, 2),
      hidden_points: round(hiddenRaw, 2),
      note: solved ? 'Card solved under league conditions.' : 'Card exposed a weakness under league conditions.'
    });
  }

  const hasPublicOverride = hasFiniteNumber(raw.public_score);
  const hasHiddenOverride = hasFiniteNumber(raw.hidden_score);

  const simulatedPublic = clamp(publicSum / cardCount, 0, 1000);
  const simulatedHidden = clamp(hiddenSum / cardCount, 0, 1000);

  let rawPublic = hasPublicOverride ? clamp(num(raw.public_score, simulatedPublic), 0, 1000) : simulatedPublic;
  let rawHidden = hasHiddenOverride ? clamp(num(raw.hidden_score, simulatedHidden), 0, 1000) : simulatedHidden;

  const rawContamination = raw.contamination;
  let contam;
  if (rawContamination !== undefined) {
    const n = Number(rawContamination);
    contam = n <= 1 && n > 0 ? n * 100 : n;
  } else {
    contam = num(model.contamination, 0);
  }
  if (!Number.isFinite(contam)) contam = 0;
  contam = Math.max(0, contam);

  let publicScore;
  if (hasPublicOverride) {
    publicScore = clamp(rawPublic, 0, 1000);
  } else {
    publicScore = clamp(rawPublic + 0.8 * contam, 0, 1000);
  }
  const hiddenScore = clamp(rawHidden, 0, 1000);

  const externalUnauthorized = Boolean(raw.unauthorized_distillation);
  const legalExposures = Array.isArray(s.legal_exposures) ? s.legal_exposures : [];
  const standingUnauthorized = legalExposures.some(
    (exposure) =>
      exposure &&
      (exposure.kind === 'unauthorized_distillation' ||
        exposure.type === 'unauthorized_distillation') &&
      !exposure.remediated
  );
  const unauthorizedDistillation = externalUnauthorized || standingUnauthorized;

  const publicRounded = round(publicScore, 2);
  const hiddenRounded = round(hiddenScore, 2);

  const rankEligible = !(contam >= 35 || unauthorizedDistillation || budgetViolated);
  const officialScore = Number((0.60 * publicRounded + 0.40 * hiddenRounded).toFixed(4));
  const officialScoreRanked = rankEligible && !budgetViolated ? officialScore : 0;

  const prizeKc = estimatePrizeKc(benchmark, req.league_tier, officialScore, rankEligible);
  const reputationGain = estimateReputationGain(benchmark, req.league_tier, officialScore, rankEligible);
  const dramaticQuestion = buildDramaticQuestion(benchmark, modelId, req, rankEligible, contam);
  const replayHash = `rh_${shortHash(`${seedId}|${raceId}|${modelId}|${benchmarkId}|${publicRounded}|${hiddenRounded}`)}`;

  const result = {
    race_id: raceId,
    benchmark_id: benchmarkId,
    benchmark_name: getBenchmarkName(benchmark),
    benchmark_version: getBenchmarkVersion(benchmark),
    model_id: modelId,
    public_score: publicRounded,
    hidden_score: hiddenRounded,
    official_score: officialScore,
    official_score_ranked: officialScoreRanked,
    compute_used_cu: computeUsedCu,
    completion_seconds: completionSeconds,
    budget_violated: budgetViolated,
    rank_eligible: rankEligible,
    disqualified: !rankEligible,
    card_log: cardLog,
    dramatic_question: dramaticQuestion,
    prize_kc: prizeKc,
    reputation_gain: reputationGain,
    seed_id: seedId,
    replay_hash: replayHash,
    contamination: round(contam, 2),
    unauthorized_distillation: unauthorizedDistillation,
    p_success: round(pSuccess, 4),
    weighted_score: round(weighted, 2)
  };

  if (commit) {
    if (!Array.isArray(s.race_results)) s.race_results = [];
    s.race_results.push({
      race_id: result.race_id,
      benchmark_id: result.benchmark_id,
      benchmark_version: result.benchmark_version,
      model_id: result.model_id,
      public_score: result.public_score,
      hidden_score: result.hidden_score,
      official_score: result.official_score,
      compute_used_cu: result.compute_used_cu,
      completion_seconds: result.completion_seconds,
      budget_violated: result.budget_violated,
      rank_eligible: result.rank_eligible,
      origin: ['game_simulation', 'casual_byok', 'modded'].includes(raw.origin) ? raw.origin : 'game_simulation',
      replay_hash: result.replay_hash,
      seed_id: result.seed_id,
      official_score_ranked: result.official_score_ranked,
      disqualified: result.disqualified
    });
    s.last_race_result = result;
  }

  return result;
}

export function previewRace(state, rawRequest = {}) {
  return buildRaceOutcome(state, rawRequest, false);
}

export function simulateRace(state, rawRequest = {}) {
  return buildRaceOutcome(state, rawRequest, true);
}

function normalizeDomainWeights(raw) {
  const out = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [key, value] of Object.entries(raw)) {
      out[key] = clamp(num(value, 0), 0, 1);
    }
  }
  if (Object.keys(out).length === 0) {
    for (const key of STAT_KEYS) out[key] = 1 / STAT_KEYS.length;
  }
  return out;
}

function normalizeDataset(raw, fallbackId = 'dataset') {
  const d = raw && typeof raw === 'object' ? raw : {};
  const datasetId = d.dataset_id || d.id || fallbackId;
  const format = DATASET_FORMATS.includes(d.format) ? d.format : 'raw_text';
  const rightsStatus = RIGHTS_STATUSES.includes(d.rights_status) ? d.rights_status : 'unclear';
  const quality = clamp(num(d.quality, 0.5), 0, 1);
  return {
    dataset_id: datasetId,
    display_name: d.display_name || d.name || datasetId,
    format,
    records_k: Math.max(0, num(d.records_k, 10)),
    quality,
    diversity: clamp(num(d.diversity, 0.5), 0, 1),
    label_quality: clamp(num(d.label_quality, 0.5), 0, 1),
    novelty: clamp(num(d.novelty, 0.3), 0, 1),
    uses: Math.max(0, Math.floor(num(d.uses, 0))),
    duplicate_ratio: clamp(num(d.duplicate_ratio, 0), 0, 1),
    contamination_ratio: clamp(num(d.contamination_ratio, 0), 0, 1),
    synthetic_ratio: clamp(num(d.synthetic_ratio, 0), 0, 1),
    correlated_error_ratio: clamp(num(d.correlated_error_ratio, 0), 0, 1),
    rights_status: rightsStatus,
    provenance_ids: Array.isArray(d.provenance_ids) ? d.provenance_ids.slice() : [],
    audit_confidence: clamp(num(d.audit_confidence, 0.5), 0, 1),
    domain_weights: normalizeDomainWeights(d.domain_weights),
    license_cost_kc: Math.max(0, Math.round(num(d.license_cost_kc, 0))),
    allowed_training: d.allowed_training !== undefined
      ? Boolean(d.allowed_training)
      : !['restricted', 'prohibited'].includes(rightsStatus),
    teacher_id: d.teacher_id ?? null,
    teacher_coverage: clamp(num(d.teacher_coverage, 0), 0, 1),
    displayed_quality_estimate: clamp(num(d.displayed_quality_estimate, quality), 0, 1)
  };
}

function createSyntheticDataset(rng, refreshCount, index) {
  const adjectives = [
    'Curated', 'Noisy', 'Expert', 'Synthetic', 'Multilingual', 'Compact',
    'Frontier', 'Contested', 'Verified', 'Long-tail', 'Process-rich', 'Audited'
  ];
  const nouns = [
    'Code', 'Reasoning', 'Dialogue', 'Quantitative', 'Science', 'Process',
    'Agent', 'Safety', 'Preference', 'Tool-use', 'Planning', 'Instruction'
  ];
  const formats = DATASET_FORMATS;
  const format = formats[Math.floor(rng() * formats.length) % formats.length];
  const quality = clamp(0.35 + rng() * 0.60, 0, 1);
  const diversity = clamp(0.30 + rng() * 0.70, 0, 1);
  const labelQuality = clamp(0.25 + rng() * 0.70, 0, 1);
  const novelty = clamp(0.10 + rng() * 0.90, 0, 1);
  const duplicateRatio = clamp(rng() * 0.45, 0, 1);
  const contaminationRatio = clamp(rng() * 0.30, 0, 1);
  const syntheticRatio = clamp(rng() * 0.70, 0, 1);
  const correlatedErrorRatio = clamp(rng() * 0.40, 0, 1);
  const auditConfidence = clamp(0.30 + rng() * 0.70, 0, 1);
  const recordsK = round(5 + rng() * 495, 1);

  const rightsRoll = rng();
  let rightsStatus;
  if (rightsRoll < 0.52) rightsStatus = 'licensed';
  else if (rightsRoll < 0.66) rightsStatus = 'public_domain';
  else if (rightsRoll < 0.78) rightsStatus = 'consented';
  else if (rightsRoll < 0.90) rightsStatus = 'unclear';
  else if (rightsRoll < 0.97) rightsStatus = 'restricted';
  else rightsStatus = 'prohibited';

  const rawDomain = STAT_KEYS.map(() => 0.2 + rng());
  const domainSum = rawDomain.reduce((a, b) => a + b, 0);
  const domainWeights = {};
  STAT_KEYS.forEach((key, i) => {
    domainWeights[key] = rawDomain[i] / domainSum;
  });

  const rightsMultiplier = {
    licensed: 1.4,
    public_domain: 0.3,
    consented: 1.1,
    unclear: 1.0,
    restricted: 2.2,
    prohibited: 4.0
  }[rightsStatus];

  const teacherId = rng() < 0.35 ? `teacher_${shortHash(`${refreshCount}_${index}_${rng()}`)}` : null;
  const teacherCoverage = teacherId ? clamp(0.20 + rng() * 0.70, 0, 1) : 0;
  const datasetId = `ds_market_${refreshCount}_${index}_${shortHash(`${refreshCount}_${index}_${quality}_${rng()}`)}`;
  const displayName = `${adjectives[Math.floor(rng() * adjectives.length)]} ${nouns[Math.floor(rng() * nouns.length)]} ${format.replace(/_/g, ' ')}`;

  return normalizeDataset({
    dataset_id: datasetId,
    display_name: displayName,
    format,
    records_k: recordsK,
    quality,
    diversity,
    label_quality: labelQuality,
    novelty,
    uses: 0,
    duplicate_ratio: duplicateRatio,
    contamination_ratio: contaminationRatio,
    synthetic_ratio: syntheticRatio,
    correlated_error_ratio: correlatedErrorRatio,
    rights_status: rightsStatus,
    provenance_ids: [`prov_${shortHash(`${datasetId}_prov`)}`],
    audit_confidence: auditConfidence,
    domain_weights: domainWeights,
    license_cost_kc: Math.round(recordsK * (0.5 + quality * 2.0) * rightsMultiplier),
    allowed_training: !['restricted', 'prohibited'].includes(rightsStatus),
    teacher_id: teacherId,
    teacher_coverage: teacherCoverage,
    displayed_quality_estimate: clamp(quality + (rng() - 0.5) * 0.2, 0, 1)
  }, datasetId);
}

function getMarket(state) {
  if (!state || typeof state !== 'object') return { offers: [] };
  if (!state.data_market || typeof state.data_market !== 'object') state.data_market = {};
  const market = state.data_market;
  if (!Array.isArray(market.offers)) {
    if (market.offers && typeof market.offers === 'object') market.offers = Object.values(market.offers);
    else market.offers = [];
  }
  return market;
}

function makeOfferFromSource(source, index, refreshCount, rng) {
  let offerBase = null;
  let dataset = null;

  if (source && typeof source === 'object') {
    if (source.dataset && typeof source.dataset === 'object') {
      offerBase = source;
      dataset = normalizeDataset(source.dataset, source.dataset_id || source.dataset.dataset_id || `dataset_${refreshCount}_${index}`);
    } else if (source.format || source.quality !== undefined || source.display_name || source.name) {
      offerBase = source;
      dataset = normalizeDataset(source, source.dataset_id || source.id || `dataset_${refreshCount}_${index}`);
    }
  }

  if (!dataset) dataset = createSyntheticDataset(rng, refreshCount, index);

  const price = Math.max(0, Math.round(
    num(offerBase?.price_kc, num(offerBase?.license_cost_kc, num(dataset.license_cost_kc, 0)))
  ));

  const offerId = offerBase?.offer_id || offerBase?.id || `offer_${refreshCount}_${index}_${dataset.dataset_id}`;
  return {
    id: offerId,
    offer_id: offerId,
    template_id: dataset.dataset_id,
    dataset_id: dataset.dataset_id,
    name: dataset.display_name || dataset.name || dataset.dataset_id,
    display_name: dataset.display_name || dataset.name || dataset.dataset_id,
    format: dataset.format,
    records_k: dataset.records_k,
    quality: clamp(num(offerBase?.listed_quality, num(dataset.displayed_quality_estimate, dataset.quality)), 0, 1),
    true_quality: dataset.quality,
    rights_status: dataset.rights_status,
    provenance: (dataset.provenance_ids && dataset.provenance_ids[0]) || 'market',
    dataset,
    price_kc: price,
    license_cost_kc: price,
    listed_quality: clamp(num(offerBase?.listed_quality, num(dataset.displayed_quality_estimate, dataset.quality)), 0, 1),
    expires_in_turns: Math.max(1, Math.floor(num(offerBase?.expires_in_turns, 3))),
    source: offerBase?.source || 'market'
  };
}

export function refreshDataMarket(state) {
  if (!state || typeof state !== 'object') return [];
  const prevMarket = state.data_market;
  const refreshCount = Math.max(0, Math.floor(num(prevMarket?.refresh_count ?? state._market_refresh_count, 0))) + 1;
  state._market_refresh_count = refreshCount;
  const generatedTurn = Math.floor(num(state.world?.turn_index ?? state.turn, num(state.turn_count, 1)));

  const count = Math.max(1, Math.floor(num(prevMarket?.offer_count, num(state.data_market_offer_count, 6))));
  const rng = createRng(hashString(`${state.campaign_seed || state.seed || 'seed'}|market|${refreshCount}|${generatedTurn}`));
  const pool = firstNonEmptyArray([
    state.dataset_pool,
    state.dataset_catalog,
    state.available_datasets,
    state.catalog?.datasets,
    DATASET_TEMPLATES,
    state.datasets
  ]);

  const offers = [];
  for (let i = 0; i < count; i += 1) {
    const source = pool.length > 0 ? pool[(refreshCount * 7 + i) % pool.length] : null;
    offers.push(makeOfferFromSource(source, i, refreshCount, rng));
  }

  offers.offers = offers;
  offers.refresh_count = refreshCount;
  offers.generated_turn = generatedTurn;
  offers.updated_turn = generatedTurn;
  state.data_market = offers;
  return offers;
}

function hasCreditSystem(state) {
  return Boolean(
    state &&
    (state.knowledge_credits !== undefined ||
      state.kc !== undefined ||
      state.credits !== undefined ||
      state.currency?.knowledge_credits !== undefined)
  );
}

function getCredits(state) {
  if (!state || typeof state !== 'object') return 0;
  if (state.knowledge_credits !== undefined) return num(state.knowledge_credits, 0);
  if (state.kc !== undefined) return num(state.kc, 0);
  if (state.credits !== undefined) return num(state.credits, 0);
  if (state.currency?.knowledge_credits !== undefined) return num(state.currency.knowledge_credits, 0);
  return 0;
}

function setCredits(state, value) {
  if (!state || typeof state !== 'object') return;
  const next = Math.max(0, round(value, 2));
  if (state.knowledge_credits !== undefined) state.knowledge_credits = next;
  else if (state.kc !== undefined) state.kc = next;
  else if (state.credits !== undefined) state.credits = next;
  else if (state.currency?.knowledge_credits !== undefined) state.currency.knowledge_credits = next;
  else state.knowledge_credits = next;
}

export function acquireDatasetOffer(state, offerOrId, options = {}) {
  if (!state || typeof state !== 'object') {
    return { success: false, reason: 'no_state' };
  }

  const market = getMarket(state);
  const offers = market.offers;
  let offer = null;
  let directDataset = null;

  if (typeof offerOrId === 'string') {
    offer = offers.find((o) => o && (
      o.offer_id === offerOrId ||
      o.dataset_id === offerOrId ||
      o.id === offerOrId
    )) || null;
  } else if (offerOrId && typeof offerOrId === 'object') {
    if (offerOrId.dataset && typeof offerOrId.dataset === 'object') {
      offer = offers.find((o) => o && (
        (offerOrId.offer_id && o.offer_id === offerOrId.offer_id) ||
        (offerOrId.dataset_id && o.dataset_id === offerOrId.dataset_id)
      )) || offerOrId;
    } else if (offerOrId.format || offerOrId.quality !== undefined || offerOrId.display_name) {
      directDataset = offerOrId;
    } else {
      offer = offers.find((o) => o && (
        (offerOrId.offer_id && o.offer_id === offerOrId.offer_id) ||
        (offerOrId.dataset_id && o.dataset_id === offerOrId.dataset_id)
      )) || offerOrId;
    }
  }

  if (!offer && !directDataset && typeof offerOrId === 'string') {
    const owned = getOrCreateArray(state, 'datasets').find((d) => d && d.dataset_id === offerOrId);
    if (owned) return { success: true, already_owned: true, dataset: owned, dataset_id: owned.dataset_id };
  }

  if (!offer && !directDataset) {
    return { success: false, reason: 'offer_not_found' };
  }

  let dataset = null;
  if (directDataset) {
    dataset = normalizeDataset(directDataset, directDataset.dataset_id || directDataset.id || 'dataset');
  } else if (offer?.dataset && typeof offer.dataset === 'object') {
    dataset = normalizeDataset(offer.dataset, offer.dataset_id || offer.dataset.dataset_id || 'dataset');
  } else if (offer?.dataset_id) {
    const knownPool = firstNonEmptyArray([
      state.dataset_pool,
      state.dataset_catalog,
      state.available_datasets,
      state.datasets
    ]);
    const known = knownPool.find((d) => d && d.dataset_id === offer.dataset_id);
    if (known) dataset = normalizeDataset(known, offer.dataset_id);
  }

  if (!dataset && offer && (offer.format || offer.quality !== undefined)) {
    dataset = normalizeDataset(offer, offer.dataset_id || offer.id || 'dataset');
  }

  if (!dataset) {
    return { success: false, reason: 'dataset_not_found', offer };
  }

  if (dataset.rights_status === 'prohibited' && !options.force) {
    return { success: false, reason: 'rights_prohibited', dataset, offer };
  }

  const price = Math.max(0, round(
    num(options.price_kc, num(offer?.price_kc, num(offer?.license_cost_kc, num(dataset.license_cost_kc, 0)))),
    2
  ));

  if (hasCreditSystem(state) && !options.free && price > 0) {
    const credits = getCredits(state);
    if (credits < price && !options.force) {
      return { success: false, reason: 'insufficient_credits', required_kc: price, remaining_credits: credits, dataset, offer };
    }
    setCredits(state, credits - price);
  }

  const owned = getOrCreateArray(state, 'datasets');
  let existing = owned.find((d) => d && d.dataset_id === dataset.dataset_id);
  if (!existing) {
    owned.push(dataset);
    existing = dataset;
  }

  const legacyOwned = getOrCreateArray(state, 'owned_datasets');
  if (!legacyOwned.some((d) => d && d.dataset_id === existing.dataset_id)) {
    legacyOwned.push(existing);
  }

  market.offers = market.offers.filter((o) => o && o !== offer && o.offer_id !== offer?.offer_id);

  return {
    success: true,
    dataset: existing,
    dataset_id: existing.dataset_id,
    offer,
    spent_kc: price,
    remaining_credits: hasCreditSystem(state) ? getCredits(state) : undefined
  };
}

function getDatasetById(state, datasetId) {
  if (!state || !datasetId) return null;
  const pools = [
    getOrCreateArray(state, 'datasets'),
    state.dataset_pool,
    state.dataset_catalog,
    state.available_datasets
  ];
  for (const pool of pools) {
    if (!Array.isArray(pool)) continue;
    const found = pool.find((d) => d && d.dataset_id === datasetId);
    if (found) return found;
  }
  return null;
}

export function runDataMiniGame(state, gameTypeOrPayload, userChoices = {}, autoDelegate = false) {
  if (!state || typeof state !== 'object') {
    return { success: false, reason: 'no_state' };
  }

  const payload = typeof gameTypeOrPayload === 'string'
    ? { game_type: gameTypeOrPayload }
    : (gameTypeOrPayload && typeof gameTypeOrPayload === 'object' ? gameTypeOrPayload : {});
  const gameType = payload.game_type || payload.type || payload.mini_game || 'data_audit';
  const choices = userChoices && typeof userChoices === 'object' ? userChoices : {};

  const targetDatasetId = payload.dataset_id || choices.dataset_id || choices.target_dataset_id;
  const dataset = payload.dataset && typeof payload.dataset === 'object'
    ? normalizeDataset(payload.dataset, payload.dataset.dataset_id || targetDatasetId || 'mini_game_dataset')
    : (targetDatasetId ? getDatasetById(state, targetDatasetId) : getOrCreateArray(state, 'datasets')[0]);

  if (!dataset) {
    return { success: false, reason: 'no_dataset', game_type: gameType };
  }

  const rng = createRng(hashString(
    `${state.seed || 'seed'}|minigame|${gameType}|${dataset.dataset_id}|${state.turn ?? state.turn_count ?? 0}|${JSON.stringify(choices)}`
  ));

  const model = resolveModel(state, {});
  const modelSkill = (
    getModelStat(model, 'knowledge') * 0.30 +
    getModelStat(model, 'reasoning') * 0.25 +
    getModelStat(model, 'coding') * 0.20 +
    getModelStat(model, 'context') * 0.15 +
    getModelStat(model, 'reliability') * 0.10
  ) / 1000;

  let effort = clamp(num(choices.effort, num(choices.rigor, 0.5)), 0, 1);
  let risk = clamp(num(payload.difficulty, num(choices.risk, 0.5)), 0, 1);
  let chosenOption = null;

  if (Array.isArray(payload.options) && payload.options.length > 0) {
    const requestedIndex = Number(choices.option_index ?? choices.choice ?? -1);
    if (Number.isInteger(requestedIndex) && payload.options[requestedIndex]) {
      chosenOption = payload.options[requestedIndex];
    } else if (autoDelegate) {
      chosenOption = payload.options.reduce((best, option) => {
        if (!best) return option;
        const bestValue = num(best.effort, 0.5) - num(best.risk, 0.5);
        const optionValue = num(option.effort, 0.5) - num(option.risk, 0.5);
        return optionValue > bestValue ? option : best;
      }, null);
    }
  }

  if (chosenOption) {
    if (chosenOption.effort !== undefined) effort = clamp(num(chosenOption.effort, effort), 0, 1);
    if (chosenOption.risk !== undefined) risk = clamp(num(chosenOption.risk, risk), 0, 1);
  }

  if (autoDelegate) {
    effort = Math.max(effort, 0.75);
    risk = Math.min(risk, 0.45);
  }

  const performance = clamp(
    0.35 + 0.45 * modelSkill + 0.25 * effort - 0.15 * risk + (rng() - 0.5) * 0.12,
    0.05,
    0.99
  );
  const intensity = clamp(0.4 + 0.6 * effort + (autoDelegate ? 0.1 : 0), 0.1, 1);
  const cost = Math.max(0, Math.round(num(payload.cost_kc, (num(dataset.records_k, 1) * 0.1 * intensity))));

  if (hasCreditSystem(state) && cost > 0 && !payload.free && !choices.free) {
    const credits = getCredits(state);
    if (credits < cost) {
      return { success: false, reason: 'insufficient_credits', required_kc: cost, remaining_credits: credits, game_type: gameType, dataset_id: dataset.dataset_id };
    }
    setCredits(state, credits - cost);
  }

  const before = {
    quality: dataset.quality,
    diversity: dataset.diversity,
    label_quality: dataset.label_quality,
    novelty: dataset.novelty,
    duplicate_ratio: dataset.duplicate_ratio,
    contamination_ratio: dataset.contamination_ratio,
    synthetic_ratio: dataset.synthetic_ratio,
    correlated_error_ratio: dataset.correlated_error_ratio,
    audit_confidence: dataset.audit_confidence,
    rights_status: dataset.rights_status,
    allowed_training: dataset.allowed_training
  };

  const normalizedGame = String(gameType).toLowerCase();
  const changes = {};

  if (normalizedGame === 'deduplication' || normalizedGame === 'dedupe' || normalizedGame === 'duplicate_cleanup') {
    const reduction = 0.12 + 0.25 * performance;
    dataset.duplicate_ratio = clamp(dataset.duplicate_ratio - reduction, 0, 1);
    dataset.quality = clamp(dataset.quality + 0.03 * performance, 0, 1);
    changes.duplicate_ratio = dataset.duplicate_ratio - before.duplicate_ratio;
    changes.quality = dataset.quality - before.quality;
  } else if (normalizedGame === 'contamination_audit' || normalizedGame === 'contamination') {
    const reduction = 0.10 + 0.25 * performance;
    dataset.contamination_ratio = clamp(dataset.contamination_ratio - reduction, 0, 1);
    dataset.audit_confidence = clamp(dataset.audit_confidence + 0.08 * performance, 0, 1);
    dataset.quality = clamp(dataset.quality + 0.02 * performance, 0, 1);
    changes.contamination_ratio = dataset.contamination_ratio - before.contamination_ratio;
    changes.audit_confidence = dataset.audit_confidence - before.audit_confidence;
    changes.quality = dataset.quality - before.quality;
  } else if (normalizedGame === 'label_quality' || normalizedGame === 'annotation_review' || normalizedGame === 'label_review') {
    dataset.label_quality = clamp(dataset.label_quality + 0.10 * performance, 0, 1);
    dataset.quality = clamp(dataset.quality + 0.05 * performance, 0, 1);
    dataset.audit_confidence = clamp(dataset.audit_confidence + 0.03 * performance, 0, 1);
    changes.label_quality = dataset.label_quality - before.label_quality;
    changes.quality = dataset.quality - before.quality;
    changes.audit_confidence = dataset.audit_confidence - before.audit_confidence;
  } else if (normalizedGame === 'diversity_balance' || normalizedGame === 'diversity') {
    dataset.diversity = clamp(dataset.diversity + 0.12 * performance, 0, 1);
    dataset.novelty = clamp(dataset.novelty + 0.06 * performance, 0, 1);
    dataset.quality = clamp(dataset.quality + 0.02 * performance, 0, 1);
    changes.diversity = dataset.diversity - before.diversity;
    changes.novelty = dataset.novelty - before.novelty;
    changes.quality = dataset.quality - before.quality;
  } else if (normalizedGame === 'synthetic_detection' || normalizedGame === 'synthetic_ratio') {
    const reduction = 0.12 + 0.20 * performance;
    dataset.synthetic_ratio = clamp(dataset.synthetic_ratio - reduction, 0, 1);
    dataset.diversity = clamp(dataset.diversity + 0.03 * performance, 0, 1);
    dataset.audit_confidence = clamp(dataset.audit_confidence + 0.04 * performance, 0, 1);
    changes.synthetic_ratio = dataset.synthetic_ratio - before.synthetic_ratio;
    changes.diversity = dataset.diversity - before.diversity;
    changes.audit_confidence = dataset.audit_confidence - before.audit_confidence;
  } else if (normalizedGame === 'rights_review' || normalizedGame === 'rights_audit') {
    if (performance >= 0.80) {
      dataset.rights_status = 'licensed';
      dataset.allowed_training = true;
    } else if (performance >= 0.58 && ['unclear', 'restricted'].includes(dataset.rights_status)) {
      dataset.rights_status = 'consented';
      dataset.allowed_training = true;
    } else if (performance < 0.35 && dataset.rights_status === 'unclear') {
      dataset.rights_status = 'restricted';
      dataset.allowed_training = false;
    }
    dataset.audit_confidence = clamp(dataset.audit_confidence + 0.07 * performance, 0, 1);
    changes.rights_status = dataset.rights_status;
    changes.allowed_training = dataset.allowed_training;
    changes.audit_confidence = dataset.audit_confidence - before.audit_confidence;
  } else if (normalizedGame === 'bias_audit' || normalizedGame === 'correlated_error_audit') {
    dataset.correlated_error_ratio = clamp(dataset.correlated_error_ratio - 0.12 * performance, 0, 1);
    dataset.diversity = clamp(dataset.diversity + 0.03 * performance, 0, 1);
    dataset.audit_confidence = clamp(dataset.audit_confidence + 0.05 * performance, 0, 1);
    changes.correlated_error_ratio = dataset.correlated_error_ratio - before.correlated_error_ratio;
    changes.diversity = dataset.diversity - before.diversity;
    changes.audit_confidence = dataset.audit_confidence - before.audit_confidence;
  } else if (normalizedGame === 'teacher_distillation' || normalizedGame === 'distillation') {
    if (dataset.allowed_training) {
      dataset.teacher_coverage = clamp(dataset.teacher_coverage + 0.15 * performance, 0, 1);
      dataset.quality = clamp(dataset.quality + 0.03 * performance, 0, 1);
      dataset.synthetic_ratio = clamp(dataset.synthetic_ratio + 0.04 * performance, 0, 1);
      changes.teacher_coverage = dataset.teacher_coverage;
      changes.quality = dataset.quality - before.quality;
      changes.synthetic_ratio = dataset.synthetic_ratio - before.synthetic_ratio;
    } else {
      changes.blocked = 'training_not_allowed';
    }
  } else {
    dataset.quality = clamp(dataset.quality + 0.04 * performance, 0, 1);
    dataset.audit_confidence = clamp(dataset.audit_confidence + 0.04 * performance, 0, 1);
    dataset.duplicate_ratio = clamp(dataset.duplicate_ratio - 0.04 * performance, 0, 1);
    dataset.contamination_ratio = clamp(dataset.contamination_ratio - 0.03 * performance, 0, 1);
    changes.quality = dataset.quality - before.quality;
    changes.audit_confidence = dataset.audit_confidence - before.audit_confidence;
    changes.duplicate_ratio = dataset.duplicate_ratio - before.duplicate_ratio;
    changes.contamination_ratio = dataset.contamination_ratio - before.contamination_ratio;
  }

  const score = Math.round(clamp(performance * 100, 0, 100));
  const history = getOrCreateArray(state, 'data_minigame_history');
  const result = {
    success: true,
    game_type: gameType,
    dataset_id: dataset.dataset_id,
    score,
    performance: round(performance, 4),
    auto_delegated: Boolean(autoDelegate),
    cost_kc: cost,
    remaining_credits: hasCreditSystem(state) ? getCredits(state) : undefined,
    changes,
    dataset
  };
  history.push({
    game_type: gameType,
    dataset_id: dataset.dataset_id,
    score,
    performance: result.performance,
    auto_delegated: result.auto_delegated,
    cost_kc: cost,
    changes,
    turn: state.turn ?? state.turn_count ?? 0
  });

  return result;
}

export function calculateAnnotationQuality(contract = {}) {
  const c = contract && typeof contract === 'object' ? contract : {};
  const baseSkill = clamp(num(c.base_skill, 0), 0, 100);
  const domainFit = clamp(num(c.domain_fit, 0), 0, 1);
  const fairPayRatio = clamp(num(c.fair_pay_ratio, 1), 0.1, 3);
  const correlatedErrorRatio = clamp(num(c.correlated_error_ratio, 0), 0, 1);

  const baseAccuracy = clamp(0.45 + 0.004 * baseSkill + 0.12 * domainFit, 0.50, 0.97);
  const underpay = Math.max(0, 1 - fairPayRatio);
  const fatiguePenalty = 0.10 * underpay;
  const independentAccuracy = baseAccuracy - fatiguePenalty;
  const tripleAccuracy = independentAccuracy * independentAccuracy * independentAccuracy +
    3 * independentAccuracy * independentAccuracy * (1 - independentAccuracy);

  let labelQuality;
  if (c.label_method === 'triple_vote') {
    labelQuality = correlatedErrorRatio * independentAccuracy + (1 - correlatedErrorRatio) * tripleAccuracy;
  } else {
    labelQuality = independentAccuracy;
  }

  labelQuality += 0.06 * clamp(num(c.gold_check_ratio, 0), 0, 1);
  labelQuality += 0.08 * clamp(num(c.independent_audit_ratio, 0), 0, 1);
  labelQuality = clamp(labelQuality, 0.05, 0.99);

  return {
    base_accuracy: baseAccuracy,
    fatigue_penalty: fatiguePenalty,
    independent_accuracy: independentAccuracy,
    triple_accuracy: tripleAccuracy,
    label_quality: labelQuality,
    attrition_risk: clamp(num(c.attrition_risk, 0), 0, 1)
  };
}

function inferLabelMethod(dataset) {
  if (!dataset) return 'single';
  if (dataset.format === 'preference_pairs') return 'pairwise';
  if (dataset.format === 'verified_tasks') return 'triple_vote';
  if (dataset.format === 'trajectories') return 'process';
  return 'single';
}

function computeDatasetModelFit(dataset, model) {
  if (!dataset) return 0.60;
  const weights = normalizeDomainWeights(dataset.domain_weights);
  let fit = 0;
  let weightSum = 0;
  for (const key of STAT_KEYS) {
    const w = num(weights[key], 0);
    if (w > 0) {
      fit += w * (getModelStat(model, key) / 1000);
      weightSum += w;
    }
  }
  if (weightSum > 0) return clamp(fit / weightSum, 0, 1);
  return clamp(
    STAT_KEYS.reduce((sum, key) => sum + getModelStat(model, key), 0) / (STAT_KEYS.length * 1000),
    0,
    1
  );
}

export function startAnnotationContract(state, params = {}) {
  if (!state || typeof state !== 'object') return null;
  const p = params && typeof params === 'object' ? params : {};
  const contracts = getOrCreateArray(state, 'annotation_contracts');
  const datasets = getOrCreateArray(state, 'datasets');

  const dataset = p.dataset && typeof p.dataset === 'object'
    ? normalizeDataset(p.dataset)
    : (p.dataset_id ? getDatasetById(state, p.dataset_id) : datasets[0] || null);

  const datasetId = p.dataset_id || dataset?.dataset_id || 'dataset_unknown';
  const templateId = p.team_template_id || p.teamTemplateId || 'default_team';
  const templates = firstNonEmptyArray([
    state.team_templates,
    state.teamTemplates,
    state.teams
  ]);
  const template = p.team_template && typeof p.team_template === 'object'
    ? p.team_template
    : templates.find((t) => t && (
      t.team_template_id === templateId ||
      t.template_id === templateId ||
      t.id === templateId
    )) || {};

  const model = resolveModel(state, {});
  const methodCandidate = p.label_method || template.label_method || inferLabelMethod(dataset);
  const labelMethod = LABEL_METHODS.includes(methodCandidate) ? methodCandidate : 'single';

  const recordsK = Math.max(1, round(num(p.records_k, num(dataset?.records_k, 10)), 2));
  const remainingTurns = Math.max(1, Math.floor(num(p.remaining_turns, num(template.remaining_turns, 3))));

  const baseSkill = clamp(
    num(p.base_skill, num(template.base_skill, dataset ? (dataset.quality * 80 + dataset.label_quality * 20) : 60)),
    0,
    100
  );
  const domainFit = clamp(
    num(p.domain_fit, num(template.domain_fit, dataset ? computeDatasetModelFit(dataset, model) : 0.60)),
    0,
    1
  );
  const fairPayRatio = clamp(
    num(p.fair_pay_ratio, num(template.fair_pay_ratio, 1)),
    0.1,
    3
  );

  const goldCheckRatio = clamp(num(p.gold_check_ratio, num(template.gold_check_ratio, 0.15)), 0, 1);
  const independentAuditRatio = clamp(num(p.independent_audit_ratio, num(template.independent_audit_ratio, 0.10)), 0, 1);
  const correlatedErrorRatio = clamp(
    num(p.correlated_error_ratio, num(dataset?.correlated_error_ratio, num(template.correlated_error_ratio, 0.10))),
    0,
    1
  );
  const attritionRisk = clamp(
    num(p.attrition_risk, num(template.attrition_risk, 0.05 + 0.10 * (1 - fairPayRatio))),
    0,
    1
  );

  const costPerK = num(p.cost_per_k, num(template.cost_per_k, 2));
  const paidCostKc = Math.max(0, Math.round(
    num(p.paid_cost_kc, recordsK * costPerK * fairPayRatio)
  ));

  let sequence = contracts.length + 1;
  let contractId = p.contract_id || `contract_${datasetId}_${sequence}`;
  while (contracts.some((c) => c && c.contract_id === contractId)) {
    sequence += 1;
    contractId = p.contract_id ? `${p.contract_id}_${sequence}` : `contract_${datasetId}_${sequence}`;
  }

  const contract = {
    contract_id: contractId,
    team_template_id: templateId,
    dataset_id: datasetId,
    label_method: labelMethod,
    records_k: recordsK,
    remaining_turns: remainingTurns,
    base_skill: baseSkill,
    domain_fit: domainFit,
    fair_pay_ratio: fairPayRatio,
    gold_check_ratio: goldCheckRatio,
    independent_audit_ratio: independentAuditRatio,
    correlated_error_ratio: correlatedErrorRatio,
    attrition_risk: attritionRisk,
    paid_cost_kc: paidCostKc,
    initial_turns: remainingTurns,
    completed_records_k: 0,
    status: 'active',
    created_turn: state.turn ?? state.turn_count ?? 0
  };

  contracts.push(contract);
  return contract;
}

export function advanceAnnotationContracts(state) {
  if (!state || typeof state !== 'object') return [];
  const contracts = getOrCreateArray(state, 'annotation_contracts');
  if (contracts.length === 0) return [];

  for (const contract of contracts) {
    if (!contract || typeof contract !== 'object') continue;
    if (contract.status === 'complete') continue;

    contract.remaining_turns = Math.max(0, Math.floor(num(contract.remaining_turns, 0)) - 1);
    const initialTurns = Math.max(
      1,
      Math.floor(num(contract.initial_turns, num(contract.total_turns, contract.remaining_turns + 1)))
    );
    const turnsDone = Math.max(0, initialTurns - Math.max(0, Math.floor(num(contract.remaining_turns, 0))));
    contract.completed_records_k = round(
      Math.min(num(contract.records_k, 0), num(contract.records_k, 0) * (turnsDone / initialTurns)),
      2
    );

    const quality = calculateAnnotationQuality(contract);
    contract.last_quality = quality;
    contract.label_quality_estimate = quality.label_quality;

    if (contract.remaining_turns <= 0) {
      contract.status = 'complete';
      contract.completed_records_k = num(contract.records_k, 0);
      contract.completed_turn = state.turn ?? state.turn_count ?? 0;

      const dataset = getDatasetById(state, contract.dataset_id);
      if (dataset) {
        dataset.label_quality = clamp(Math.max(num(dataset.label_quality, 0), quality.label_quality), 0, 1);
        dataset.quality = clamp(num(dataset.quality, 0) + 0.05 * quality.label_quality, 0, 1);
        dataset.audit_confidence = clamp(
          num(dataset.audit_confidence, 0) + 0.03 * clamp(num(contract.independent_audit_ratio, 0), 0, 1),
          0,
          1
        );
      }

      const completed = getOrCreateArray(state, 'completed_annotation_contracts');
      if (!completed.some((c) => c && c.contract_id === contract.contract_id)) {
        completed.push({
          contract_id: contract.contract_id,
          dataset_id: contract.dataset_id,
          label_quality: quality.label_quality,
          completed_turn: contract.completed_turn
        });
      }
    }
  }

  return contracts;
}

function normalizeResearchStage(stage) {
  if (stage === 'complete' || stage === 'paused') return stage;
  return STAGE_ORDER.includes(stage) ? stage : 'paper';
}

function inferResearchStageFromRatio(progressRp, requiredRp) {
  const required = Math.max(1, num(requiredRp, 1));
  const ratio = clamp(num(progressRp, 0) / required, 0, 1);
  if (ratio >= STAGE_THRESHOLDS.scale_pilot) return 'production';
  if (ratio >= STAGE_THRESHOLDS.toy_pilot) return 'scale_pilot';
  if (ratio >= STAGE_THRESHOLDS.paper) return 'toy_pilot';
  return 'paper';
}

function chooseResearchAction(project) {
  if (!project) return 'run_experiment';
  if (project.stage === 'paper') return 'write_paper';
  if (project.stage === 'toy_pilot') return 'run_toy_experiment';
  if (project.stage === 'scale_pilot') return 'run_scale_experiment';
  if (project.stage === 'production') {
    if (Math.max(0, Math.floor(num(project.replication_count, 0))) < 2) return 'replicate';
    if (!project.scale_validation_passed) return 'validate_scale';
    return 'run_production';
  }
  return 'run_experiment';
}

function getResearchProjects(state) {
  if (!state || typeof state !== 'object') return [];
  return getOrCreateArray(state, 'research_projects');
}

export function stepResearchProject(state, researchId, actionId = null) {
  if (!state || typeof state !== 'object') return null;

  const projects = getResearchProjects(state);
  let project = null;

  if (researchId && typeof researchId === 'object') {
    const targetId = researchId.project_id || researchId.research_id || researchId.id;
    actionId = actionId || researchId.action_id || researchId.action_type || researchId.action || null;
    project = targetId ? projects.find((p) => p && (p.project_id === targetId || p.research_id === targetId)) : null;
    if (!project) {
      project = researchId;
      if (!projects.some((p) => p === project)) projects.push(project);
    }
  } else {
    project = projects.find((p) => p && (p.project_id === researchId || p.research_id === researchId)) || null;
    if (!project) {
      const researchPool = firstNonEmptyArray([state.research, state.projects]);
      project = researchPool.find((p) => p && (p.project_id === researchId || p.research_id === researchId)) || null;
      if (project && !projects.some((p) => p === project)) projects.push(project);
    }
  }

  if (!project) return null;

  project.project_id = project.project_id || project.research_id || String(researchId || 'research_project');
  project.research_id = project.research_id || project.project_id;
  project.required_rp = Math.max(1, num(project.required_rp, 100));
  project.progress_rp = clamp(num(project.progress_rp, 0), 0, project.required_rp);
  project.remaining_turns = Math.max(0, Math.floor(num(project.remaining_turns, 2)));
  project.architecture_target_id = project.architecture_target_id !== undefined ? project.architecture_target_id : null;
  project.stage = normalizeResearchStage(project.stage);
  project.replication_count = Math.max(0, Math.floor(num(project.replication_count, 0)));
  project.scale_validation_passed = Boolean(project.scale_validation_passed);
  project.evidence_quality = clamp(num(project.evidence_quality, 0.50), 0, 1);
  project.paid_cost_kc = Math.max(0, num(project.paid_cost_kc, 0));

  if (project.stage === 'complete') return project;

  if (project.stage === 'paused') {
    const resumedStage = project.resume_stage && STAGE_ORDER.includes(project.resume_stage)
      ? project.resume_stage
      : inferResearchStageFromRatio(project.progress_rp, project.required_rp);
    project.stage = resumedStage;
    project.remaining_turns = Math.max(1, Math.floor(num(project.remaining_turns, 1)));
    if (!actionId || actionId === 'resume') {
      project.last_action_id = 'resume';
      return project;
    }
  }

  let action = actionId || chooseResearchAction(project);
  if ((action === 'replicate' || action === 'validate_scale') && project.stage !== 'production') {
    action = chooseResearchAction(project);
  }

  const actionCost = num(RESEARCH_ACTION_COSTS[action], 5);
  if (hasCreditSystem(state)) {
    const credits = getCredits(state);
    if (credits < actionCost && !project.force_funded) {
      project.last_action_error = 'insufficient_credits';
      return project;
    }
    setCredits(state, credits - actionCost);
    project.paid_cost_kc = round(project.paid_cost_kc + actionCost, 2);
  } else {
    project.paid_cost_kc = round(project.paid_cost_kc + actionCost, 2);
  }

  const model = resolveModel(state, {});
  const modelSkill = (
    getModelStat(model, 'reasoning') * 0.40 +
    getModelStat(model, 'knowledge') * 0.35 +
    getModelStat(model, 'reliability') * 0.25
  ) / 1000;

  if (action === 'replicate' && project.stage === 'production') {
    project.replication_count = Math.min(5, project.replication_count + 1);
  } else if (action === 'validate_scale' && project.stage === 'production') {
    project.scale_validation_passed = project.scale_validation_passed || project.evidence_quality >= 0.55;
    project.evidence_quality = clamp(project.evidence_quality + 0.03, 0, 1);
  }

  const actionFractions = {
    write_paper: 0.18,
    run_experiment: 0.16,
    run_toy_experiment: 0.22,
    run_scale_experiment: 0.28,
    run_production: 0.34,
    replicate: 0.10,
    validate_scale: 0.12,
    analyze_results: 0.14,
    resume: 0.10
  };
  const fraction = num(actionFractions[action], 0.15);
  const increment = project.required_rp * fraction * clamp(
    0.80 + 0.35 * project.evidence_quality + 0.10 * modelSkill,
    0.50,
    1.50
  );

  project.progress_rp = clamp(project.progress_rp + increment, 0, project.required_rp);

  if (action !== 'replicate' && action !== 'validate_scale') {
    project.evidence_quality = clamp(
      project.evidence_quality + 0.008 + 0.020 * modelSkill + 0.010 * project.evidence_quality,
      0,
      1
    );
  }

  const ratio = project.progress_rp / project.required_rp;
  let stageIndex = STAGE_ORDER.indexOf(project.stage);
  if (stageIndex < 0) stageIndex = 0;

  while (stageIndex < STAGE_ORDER.length - 1) {
    const currentStage = STAGE_ORDER[stageIndex];
    const threshold = STAGE_THRESHOLDS[currentStage];
    if (threshold === undefined || ratio + 1e-9 < threshold) break;
    stageIndex += 1;
    project.stage = STAGE_ORDER[stageIndex];
  }

  if (project.stage === 'production') {
    if (
      project.progress_rp >= project.required_rp &&
      project.replication_count >= 2 &&
      project.scale_validation_passed
    ) {
      project.stage = 'complete';
      project.progress_rp = project.required_rp;
      project.remaining_turns = 0;
    } else if (project.progress_rp >= project.required_rp) {
      project.progress_rp = project.required_rp;
    }
  }

  project.last_action_id = action;
  project.last_action_turn = state.turn ?? state.turn_count ?? 0;
  project.last_action_error = undefined;

  if (project.stage !== 'complete' && project.remaining_turns !== undefined) {
    project.remaining_turns = Math.max(0, Math.floor(num(project.remaining_turns, 0)) - 1);
    if (project.remaining_turns <= 0 && project.stage !== 'complete') {
      project.resume_stage = project.stage;
      project.stage = 'paused';
    }
  }

  return project;
}
