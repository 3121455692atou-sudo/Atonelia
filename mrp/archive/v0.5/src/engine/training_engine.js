import { getTrainingComputeCapacity } from './service_economy.js';
import {
  BALANCE_RULES,
  TRAINING_RECIPES,
  ARCHITECTURES,
  HISTORIES,
  SUPPORT_CARDS,
  SKILLS,
} from '../data/catalog_core.js';
import {
  clamp,
  seededFloat,
  createTrainingRequest,
  createCheckpoint,
  rollbackModelToCheckpoint,
  createLegalExposure,
} from './state_schema.js';

const GAIN_CAP = 90;
const TARGET_GAIN = 22.93;

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getRecipe(id) {
  if (!id) return null;
  if (Array.isArray(TRAINING_RECIPES)) {
    return TRAINING_RECIPES.find((r) => r.recipe_id === id || r.id === id) || null;
  }
  return TRAINING_RECIPES[id] || null;
}

function getArchitecture(id) {
  if (!id) return null;
  if (Array.isArray(ARCHITECTURES)) {
    return ARCHITECTURES.find((a) => a.architecture_id === id || a.id === id) || null;
  }
  return ARCHITECTURES[id] || null;
}

function cloneState(state) {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(state);
    } catch (e) {
      // fall through to JSON clone
    }
  }
  return JSON.parse(JSON.stringify(state));
}

function saturateGain(x) {
  return x / (1 + x / GAIN_CAP);
}

function findDatasetObject(state, datasetId) {
  if (state.datasets) {
    if (Array.isArray(state.datasets)) {
      return state.datasets.find((d) => d.dataset_id === datasetId || d.id === datasetId) || null;
    }
    return state.datasets[datasetId] || null;
  }
  if (state.dataset_inventory) {
    if (Array.isArray(state.dataset_inventory)) {
      return state.dataset_inventory.find((d) => d.dataset_id === datasetId || d.id === datasetId) || null;
    }
    return state.dataset_inventory[datasetId] || null;
  }
  return null;
}

function getDataset(state, req, model) {
  const datasetId = req.dataset_id || model.training_dataset_id || state.active_dataset_id || 'data_starter_sft';
  let dataset = findDatasetObject(state, datasetId);
  if (!dataset) {
    dataset = {
      dataset_id: datasetId || 'unknown',
      id: datasetId || 'unknown',
      display_name: datasetId || 'Unknown Dataset',
      name: datasetId || 'Unknown Dataset',
      format: 'instruction',
      quality: 0.8,
      duplicate_ratio: 0.05,
      correlated_error_ratio: 0.05,
      novelty: 1,
      uses: 0,
      diversity: 0.7,
      label_quality: 0.8,
      rights_status: 'licensed',
      rights_risk: 0,
    };
  }
  return {
    ...dataset,
    dataset_id: dataset.dataset_id || dataset.id,
    id: dataset.dataset_id || dataset.id,
    display_name: dataset.display_name || dataset.name || dataset.dataset_id || dataset.id,
    name: dataset.display_name || dataset.name || dataset.dataset_id || dataset.id,
    format: dataset.format || 'instruction',
    quality: safeNumber(dataset.quality, 0.8),
    duplicate_ratio: safeNumber(dataset.duplicate_ratio, 0.05),
    correlated_error_ratio: safeNumber(dataset.correlated_error_ratio, 0.05),
    novelty: safeNumber(dataset.novelty, 1),
    uses: safeNumber(dataset.uses, 0),
    diversity: safeNumber(dataset.diversity, 0.7),
    label_quality: safeNumber(dataset.label_quality, 0.8),
    rights_status: dataset.rights_status || 'licensed',
    rights_risk: safeNumber(dataset.rights_risk, 0),
  };
}

function computeStreamGateFactor(recipe, model, dataset, req, state) {
  const stream = recipe.recipe_id || recipe.stream || recipe.id || '';
  const reasoningStat = safeNumber(model.stats?.reasoning, 0);
  switch (stream) {
    case 'sft':
      return 1.0;
    case 'verifiable_rl':
      return clamp((reasoningStat - 220) / 400, 0.12, 1) *
        safeNumber(req.verifier_quality, 0.5) *
        clamp(Math.log2(1 + safeNumber(req.group_size, 8)) / Math.log2(9), 0.5, 1.35) *
        clamp(Math.sqrt(safeNumber(req.reasoning_budget_tokens, 2048) / 2048), 0.35, 1.25);
    case 'dpo':
      return safeNumber(dataset.label_quality, 1.0);
    case 'rlhf_ppo':
      return safeNumber(req.reward_model_quality, 0.5) * (1 - 0.25 * safeNumber(req.kl_strength, 0.1));
    case 'rlaif':
      return 0.45 + 0.55 * safeNumber(req.judge_independence, 0.5);
    case 'distillation': {
      let derived_teacher_gap = 0.5;
      const teacherId = state?.selected_teacher_model_id || state?.teacher_model_id;
      const teacher = state?.mentor_models?.find((m) => m.id === teacherId) || state?.teacher_model;
      if (teacher) {
        const teacherScore = safeNumber(teacher.stats?.reasoning, 0) + safeNumber(teacher.stats?.knowledge, 0);
        const studentScore = safeNumber(model.stats?.reasoning, 0) + safeNumber(model.stats?.knowledge, 0);
        derived_teacher_gap = clamp((teacherScore - studentScore) / 500, 0, 1);
      }
      return safeNumber(req.teacher_coverage, 0.5) * (0.5 + 0.5 * derived_teacher_gap);
    }
    case 'cpt':
      return 0.85 + 0.15 * safeNumber(dataset.diversity, 1);
    case 'pure_rl':
      return clamp((reasoningStat - 450) / 250, 0, 1) * Math.pow(safeNumber(req.verifier_quality, 0.5), 2);
    case 'diffusion_sft':
      return (safeNumber(model.kernel_maturity, 85) / 85) * (1 - 0.5 * Math.abs(safeNumber(req.mask_ratio, 0.5) - 0.5));
    case 'agent_traj':
      return safeNumber(req.environment_quality, 0.5);
    default:
      return 1.0;
  }
}

function computeFactors({ model, dataset, recipe, req, arch, preset, state }) {
  const A = safeNumber(model.sim_active_params_b, 4);
  const T = safeNumber(model.sim_total_params_b, A);
  const sizeFactor = (0.65 + 0.35 * Math.pow(A / 7, 0.65)) * (1 + 0.12 * Math.log2(Math.max(1, T / A)));
  const modeFactor = BALANCE_RULES.MODE_FACTORS?.[req.training_mode] ?? 0.72;
  const effort = preset?.effort ?? 1.0;
  const epochs = safeNumber(req.epochs, 1);
  const effQuality = safeNumber(dataset.quality, 0.5) * (1 - 0.5 * safeNumber(dataset.duplicate_ratio, 0)) * (1 - 0.5 * safeNumber(dataset.correlated_error_ratio, 0));
  const noveltyFactor = safeNumber(dataset.novelty, 1) / (1 + 0.12 * safeNumber(dataset.uses, 0));
  const supportCardIds = model.support_card_ids || [];
  const supportMultiplier = Math.min(1.55, 1 + 0.08 * supportCardIds.length);
  const streamGate = computeStreamGateFactor(recipe, model, dataset, req, state);
  const baseGain = safeNumber(recipe.base_gain ?? recipe.base_stat_gain, 20);
  const replayRatio = safeNumber(req.replay_ratio, 0);
  return {
    A,
    T,
    sizeFactor,
    modeFactor,
    effort,
    epochs,
    effQuality,
    noveltyFactor,
    supportMultiplier,
    streamGate,
    baseGain,
    replayRatio,
  };
}

function computeRawGain(factors) {
  const {
    baseGain,
    sizeFactor,
    modeFactor,
    effort,
    epochs,
    effQuality,
    noveltyFactor,
    supportMultiplier,
    streamGate,
    replayRatio,
  } = factors;
  const replayFactor = 1 + 0.5 * (replayRatio ?? 0);
  return baseGain * sizeFactor * modeFactor * effort * epochs * effQuality * noveltyFactor * supportMultiplier * streamGate * replayFactor;
}

// ---------------------------------------------------------------------------
// Benchmark calibration for Section 6.2
// ---------------------------------------------------------------------------
const BENCHMARK_RECIPE = getRecipe('sft') || {
  id: 'sft',
  stream: 'sft',
  base_gain: 20,
  base_compute_cu: 40,
  base_cost_kc: 20,
  base_risk: 0.02,
  uses_rl_group: false,
  weights: { reasoning: 0.3, knowledge: 0.3, coding: 0.2, math: 0.2 },
};

const BENCHMARK_ARCH = getArchitecture('transformer') || {
  compute_multiplier: 1,
  memory_multiplier: 1,
  generation_objective: 'causal_lm',
};

const BENCHMARK_MODEL = {
  sim_active_params_b: 4,
  sim_total_params_b: 4,
  training_mode: 'lora',
  support_card_ids: ['starter_1', 'starter_2', 'starter_3', 'starter_4'],
  checkpoint_interval_actions: 4,
  stats: { reasoning: 220 },
  kernel_maturity: 85,
  training_action_count: 0,
  architecture_id: 'transformer',
};

const BENCHMARK_DATASET = {
  id: 'data_starter_sft',
  quality: 0.8,
  duplicate_ratio: 0.05,
  correlated_error_ratio: 0.05,
  novelty: 1,
  uses: 0,
  diversity: 1,
  label_quality: 1,
  rights_risk: 0,
};

const BENCHMARK_REQ = {
  recipe_id: 'sft',
  training_mode: 'lora',
  preset: 'balanced',
  epochs: 1,
  batch_size: 1,
  lora_rank: 16,
  group_size: 8,
  reasoning_budget_tokens: 2048,
  replay_ratio: 0.15,
  verifier_quality: 0.5,
  reward_model_quality: 0.5,
  kl_strength: 0.1,
  judge_independence: 0.5,
  teacher_coverage: 0.5,
  mask_ratio: 0.5,
  environment_quality: 0.5,
};

const BENCHMARK_PRESET =
  BALANCE_RULES.PRESET_FACTORS?.['balanced'] || { effort: 1.0, risk_add: 0 };

const BENCHMARK_FACTORS = computeFactors({
  model: BENCHMARK_MODEL,
  dataset: BENCHMARK_DATASET,
  recipe: BENCHMARK_RECIPE,
  req: BENCHMARK_REQ,
  arch: BENCHMARK_ARCH,
  preset: BENCHMARK_PRESET,
  state: {},
});

const BENCHMARK_RAW_GAIN = computeRawGain(BENCHMARK_FACTORS);
const TARGET_RAW = TARGET_GAIN / (1 - TARGET_GAIN / GAIN_CAP);
const GAIN_CALIBRATION = BENCHMARK_RAW_GAIN > 0 ? TARGET_RAW / BENCHMARK_RAW_GAIN : 1;

// ---------------------------------------------------------------------------
// Section 06.1 / 06.2 — Training preview
// ---------------------------------------------------------------------------
export function previewTraining(state, rawRequest = {}) {
  const model = state.active_model;
  if (!model) {
    return {
      error: 'No active model',
      can_apply: false,
      blockers: [{ code: 'NO_MODEL', message: 'No active model' }],
    };
  }

  const req = createTrainingRequest({
    ...rawRequest,
    recipe_id: rawRequest.recipe_id || model.selected_recipe_id,
    training_mode: rawRequest.training_mode || model.training_mode,
  });

  req.preset = req.preset || 'balanced';
  req.epochs = req.epochs ?? 1;
  req.batch_size = req.batch_size ?? 1;
  req.lora_rank = req.lora_rank ?? 16;
  req.group_size = req.group_size ?? 8;
  req.reasoning_budget_tokens = req.reasoning_budget_tokens ?? 2048;
  req.replay_ratio = req.replay_ratio ?? 0;
  req.verifier_quality = req.verifier_quality ?? 0.5;
  req.reward_model_quality = req.reward_model_quality ?? 0.5;
  req.kl_strength = req.kl_strength ?? 0.1;
  req.judge_independence = req.judge_independence ?? 0.5;
  req.teacher_coverage = req.teacher_coverage ?? 0.5;
  req.mask_ratio = req.mask_ratio ?? 0.5;
  req.environment_quality = req.environment_quality ?? 0.5;
  req.accept_legal_risk = req.accept_legal_risk ?? false;

  const recipe = getRecipe(req.recipe_id);
  if (!recipe) {
    return {
      error: `Unknown recipe: ${req.recipe_id}`,
      can_apply: false,
      blockers: [{ code: 'UNKNOWN_RECIPE', message: `Unknown recipe: ${req.recipe_id}` }],
    };
  }

  const arch = getArchitecture(model.architecture_id);
  const preset =
    BALANCE_RULES.PRESET_FACTORS?.[req.preset] ||
    BALANCE_RULES.PRESET_FACTORS?.balanced ||
    { effort: 1.0, risk_add: 0 };
  const dataset = getDataset(state, req, model);

  const factors = computeFactors({ model, dataset, recipe, req, arch, preset, state });
  const { sizeFactor, modeFactor, effort, epochs } = factors;

  const groupFactor = recipe.uses_rl_group ? safeNumber(req.group_size, 8) / 8 : 1.0;
  const rolloutFactor = recipe.uses_rl_group
    ? Math.sqrt(safeNumber(req.reasoning_budget_tokens, 2048) / 2048)
    : 1.0;
  const archCompute = arch?.compute_multiplier ?? 1.0;
  const checkpointOverhead =
    BALANCE_RULES.CHECKPOINT_OVERHEAD_MAP?.[model.checkpoint_interval_actions] ?? 1.02;

  const compute_cu = Number(
    (
      safeNumber(recipe.base_compute_cu, 40) *
      sizeFactor *
      modeFactor *
      effort *
      epochs *
      groupFactor *
      rolloutFactor *
      archCompute *
      checkpointOverhead
    ).toFixed(4)
  );

  const cost_kc = Number(
    (
      safeNumber(recipe.base_cost_kc, 20) *
      sizeFactor *
      effort *
      epochs *
      modeFactor +
      0.08 * compute_cu
    ).toFixed(4)
  );

  const A = factors.A;
  const T = factors.T;
  const memory_gb = Number(
    (
      T *
      4.968 *
      (req.training_mode === 'full' ? 2.2 : req.training_mode === 'qlora' ? 0.65 : 1.0) *
      (1 + 0.05 * Math.log2(Math.max(1, safeNumber(req.batch_size, 1)))) *
      (req.training_mode === 'full'
        ? 1
        : 0.9 + 0.1 * (safeNumber(req.lora_rank, 16) / 16)) *
      (arch?.memory_multiplier ?? 1.0)
    ).toFixed(3)
  );

  const rawGain = computeRawGain(factors);
  const saturatedGain = saturateGain(rawGain * GAIN_CALIBRATION);
  const expected_total_gain = Number(Math.min(GAIN_CAP, saturatedGain).toFixed(2));

  const focus = req.focus || req.focus_stat || 'mixed';
  const weights = recipe.weights || {};
  const statKeys = Object.keys(weights);
  const focusDistribution = {};
  if (focus === 'mixed') {
    for (const k of statKeys) {
      focusDistribution[k] = weights[k];
    }
  } else {
    for (const k of statKeys) {
      if (k === focus) {
        focusDistribution[k] = 0.70 + 0.30 * (weights[k] ?? 0);
      } else {
        focusDistribution[k] = 0.30 * (weights[k] ?? 0);
      }
    }
  }

  const expected_stat_gains = {};
  for (const k of statKeys) {
    expected_stat_gains[k] = Number((expected_total_gain * (focusDistribution[k] ?? 0)).toFixed(2));
  }

  const company = state.company || {};
  let failure_prob = 0;
  if (safeNumber(model.training_action_count, 0) >= 2) {
    const rawReadiness = safeNumber(
      company.cluster_readiness ?? model.readiness ?? model.training_readiness,
      85
    );
    const readinessNorm = rawReadiness > 1 ? rawReadiness / 100 : rawReadiness;
    const rawReqReadiness = safeNumber(recipe.required_readiness, 0.5);
    const reqReadinessNorm = rawReqReadiness > 1 ? rawReqReadiness / 100 : rawReqReadiness;
    const readinessDeficit = Math.max(0, reqReadinessNorm - readinessNorm);
    const rawOpt = safeNumber(model.optimizer_health, 100);
    const optimizerHealth = rawOpt > 1 ? rawOpt / 100 : rawOpt;
    const rawRisk =
      safeNumber(recipe.base_risk, 0.02) +
      0.15 * readinessDeficit +
      safeNumber(preset.risk_add, 0) +
      0.01 * (epochs - 1) +
      0.1 * (1 - optimizerHealth);
    failure_prob = clamp(rawRisk, 0.005, 0.60);
  }
  failure_prob = Number(failure_prob.toFixed(4));

  const blockers = [];
  const warnings = [];
  const cash = safeNumber(company.cash_kc, 0);
  const reserved = safeNumber(company.reserved_cash_kc, 0);
  const availableCash = cash - reserved;
  const clusterCompute = getTrainingComputeCapacity(state);
  const clusterMemory = safeNumber(company.cluster_memory_gb, 0);

  const requiredFormat = recipe.format || recipe.required_dataset_format || recipe.dataset_format;
  if (requiredFormat && dataset.format && dataset.format !== requiredFormat) {
    blockers.push({
      code: 'DATASET_FORMAT_MISMATCH',
      message: `Dataset format ${dataset.format} does not match required ${requiredFormat}`,
    });
  }

  if (
    (recipe.recipe_id === 'diffusion_sft' || recipe.stream === 'diffusion_sft') &&
    arch?.generation_objective !== 'masked_diffusion'
  ) {
    blockers.push({
      code: 'ARCH_MISMATCH',
      message: 'diffusion_sft requires a masked_diffusion architecture',
    });
  }

  if (memory_gb > clusterMemory) {
    blockers.push({
      code: 'OOM',
      message: `Memory required ${memory_gb} GB exceeds cluster memory ${clusterMemory} GB`,
    });
  }

  if (compute_cu > clusterCompute) {
    blockers.push({
      code: 'INSUFFICIENT_COMPUTE',
      message: `Compute required ${compute_cu} CU exceeds available ${clusterCompute} CU`,
    });
  }

  if (cost_kc > availableCash) {
    blockers.push({
      code: 'INSUFFICIENT_CASH',
      message: `Cost ${cost_kc} KC exceeds available cash ${availableCash} KC`,
    });
  }

  const rightsStatus = dataset.rights_status || 'licensed';
  const rightsRisk = safeNumber(dataset.rights_risk, 0);
  const acceptedRisk =
    req.accept_legal_risk === true ||
    rawRequest.accept_legal_risk === true ||
    state.flags?.accept_legal_risk === true;

  if (rightsStatus === 'prohibited') {
    blockers.push({
      code: 'PROHIBITED_DATA',
      message: 'Dataset has prohibited rights status and cannot be used for training.',
    });
  } else if (
    (rightsStatus === 'restricted' || rightsRisk > 0.5) &&
    !acceptedRisk
  ) {
    blockers.push({
      code: 'LEGAL_RISK',
      message: 'Dataset has high rights risk. Accept legal risk to proceed.',
    });
  } else if (rightsStatus === 'unclear') {
    warnings.push({
      code: 'UNCLEAR_RIGHTS',
      message: 'Dataset rights are unclear; provenance will be recorded.',
    });
  }

  return {
    recipe_id: req.recipe_id,
    recipe_name: recipe.display_name ?? recipe.name ?? recipe.recipe_id ?? recipe.id,
    training_mode: req.training_mode,
    preset: req.preset,
    epochs: req.epochs,
    dataset_id: dataset.dataset_id || dataset.id,
    dataset_name: dataset.display_name ?? dataset.name ?? dataset.id,
    compute_cu,
    cost_kc,
    memory_gb,
    size_factor: Number(sizeFactor.toFixed(6)),
    mode_factor: Number(modeFactor.toFixed(6)),
    effort: Number(effort.toFixed(6)),
    expected_total_gain,
    focus_distribution: focusDistribution,
    focus_weights: focusDistribution,
    expected_stat_gains,
    stat_gains: expected_stat_gains,
    failure_prob,
    blockers,
    warnings,
    can_apply: blockers.length === 0,
    available_cash: availableCash,
    available_compute_cu: clusterCompute,
    available_memory_gb: clusterMemory,
  };
}

// ---------------------------------------------------------------------------
// Section 06 — Apply training
// ---------------------------------------------------------------------------
export function applyTraining(state, rawRequest = {}) {
  const preview = previewTraining(state, rawRequest);
  if (!preview.can_apply) {
    const blockedAction = {
      type: 'training',
      ok: false,
      success: false,
      blocked: true,
      blockers: preview.blockers,
      preview,
    };
    if (state && typeof state === 'object') {
      state.last_action = blockedAction;
    }
    return {
      ...state,
      ok: false,
      success: false,
      blocked: true,
      blockers: preview.blockers,
      preview,
      last_action: blockedAction,
    };
  }

  const model = state.active_model || (state.active_model = {});
  const company = state.company || (state.company = {});
  const req = createTrainingRequest({
    ...rawRequest,
    recipe_id: rawRequest.recipe_id || model.selected_recipe_id || 'sft',
    training_mode: rawRequest.training_mode || model.training_mode || 'lora',
  });
  const recipe = getRecipe(req.recipe_id) || BENCHMARK_RECIPE;

  const seed =
    (safeNumber(state.campaign_seed ?? state.rng_seed, 1) +
      safeNumber(model.training_action_count, 0) * 9973) >>> 0;
  const roll = seededFloat(seed);
  const failed = roll < preview.failure_prob;

  company.cash_kc = Number((safeNumber(company.cash_kc, 0) - preview.cost_kc).toFixed(4));
  company.quarter_paid_rnd_kc = Number(
    (safeNumber(company.quarter_paid_rnd_kc, 0) + preview.cost_kc).toFixed(4)
  );
  const readinessCost = safeNumber(recipe.readiness_cost, 12);
  company.cluster_readiness = clamp(
    safeNumber(company.cluster_readiness, 85) - readinessCost,
    0,
    100
  );

  const dataset = getDataset(state, req, model);
  const dsObject = dataset ? findDatasetObject(state, dataset.dataset_id || dataset.id) : null;
  if (dsObject) {
    dsObject.uses = safeNumber(dsObject.uses, 0) + 1;
    dsObject.novelty = Number((safeNumber(dsObject.novelty, 1) * 0.92).toFixed(4));
  }

  if (!Array.isArray(model.training_provenance_ids)) {
    model.training_provenance_ids = [];
  }
  const provList = dsObject?.provenance_ids || dataset?.provenance_ids || [dataset.dataset_id || dataset.id];
  for (const pid of provList) {
    if (pid && !model.training_provenance_ids.includes(pid)) {
      model.training_provenance_ids.push(pid);
    }
  }

  model.training_action_count = safeNumber(model.training_action_count, 0) + 1;
  model.selected_recipe_id = req.recipe_id;
  model.training_mode = req.training_mode;

  const rawOpt = safeNumber(model.optimizer_health, 100);
  const optScale100 = rawOpt <= 1 && rawOpt > 0 ? rawOpt * 100 : rawOpt;
  model.optimizer_health = clamp(optScale100 - (failed ? 15 : 5), 30, 100);
  model.fatigue = safeNumber(model.fatigue, 0) + (failed ? 25 : 15);

  if (!failed) {
    if (!model.stats) model.stats = {};
    for (const [stat, gain] of Object.entries(preview.expected_stat_gains)) {
      model.stats[stat] = clamp(
        Number((safeNumber(model.stats[stat], 450) + gain).toFixed(2)),
        0,
        1000
      );
    }
    model.actions_since_checkpoint = safeNumber(model.actions_since_checkpoint, 0) + 1;
    const interval = safeNumber(model.checkpoint_interval_actions, 2);
    if (interval > 0 && model.actions_since_checkpoint >= interval) {
      model.actions_since_checkpoint = 0;
      if (!Array.isArray(model.checkpoints)) model.checkpoints = [];
      model.checkpoints.push(createCheckpoint(model, state.world?.turn_index ?? 1));
    }
  } else {
    rollbackModelToCheckpoint(state);
  }

  const rightsStatus = dataset.rights_status || 'licensed';
  const rightsRisk = safeNumber(dataset.rights_risk, 0);
  if (
    rightsStatus === 'restricted' ||
    rightsStatus === 'unclear' ||
    rightsStatus === 'prohibited' ||
    rightsRisk > 0.5
  ) {
    if (!Array.isArray(state.legal_exposures)) state.legal_exposures = [];
    state.legal_exposures.push(
      createLegalExposure({
        kind:
          req.recipe_id === 'distillation'
            ? 'unauthorized_distillation'
            : 'unlicensed_training_data',
        severity: rightsStatus === 'restricted' ? 42 : 25,
        evidence_strength: 0.55,
        public_visibility: 0.25,
        related_model_id: model.model_id || model.id || 'model_main_v1',
        related_dataset_id: dataset.dataset_id || dataset.id,
        created_turn: state.world?.turn_index ?? 1,
      })
    );
  }

  state.last_action = {
    type: 'training',
    ok: !failed,
    success: !failed,
    preview,
    actual_gain: failed ? 0 : preview.expected_total_gain,
    failed,
    roll,
  };
  return state;
}

// ---------------------------------------------------------------------------
// Section 06.4 — Rest and prep
// ---------------------------------------------------------------------------
export function previewRestAndPrep(state = {}) {
  const model = state.active_model || {};
  const company = state.company || {};
  const prepCost = safeNumber(
    BALANCE_RULES.PREP_COST_KC ?? BALANCE_RULES.REST_AND_PREP?.prep_cost_kc,
    8
  );
  const supportIds = model.support_card_ids || state.support_card_ids || [];
  const has3amOps = Array.isArray(supportIds) && supportIds.includes('card_3am_ops');
  const readinessGain = 35 + (has3amOps ? 10 : 0);
  const optimizerGain = 10;
  const availableCash =
    safeNumber(company.cash_kc, 0) - safeNumber(company.reserved_cash_kc, 0);
  const canApply = availableCash >= prepCost;

  const actions = [
    {
      id: 'prep',
      name: '集群整备与校准',
      description: '恢复集群就绪度并清理优化器状态',
      cost_kc: prepCost,
      effects: {
        cluster_readiness: readinessGain,
        optimizer_health: optimizerGain,
        fatigue: -15,
      },
      can_apply: canApply,
    },
    {
      id: 'rest',
      name: '轻量休整',
      description: '零成本休整，小幅恢复疲劳与优化器状态',
      cost_kc: 0,
      effects: {
        cluster_readiness: 15,
        optimizer_health: 5,
        fatigue: -20,
      },
      can_apply: true,
    },
  ];

  return {
    cost_kc: prepCost,
    readiness_gain: readinessGain,
    optimizer_gain: optimizerGain,
    has_3am_ops_bonus: has3amOps,
    actions,
    can_apply: canApply,
    model_fatigue: safeNumber(model.fatigue, 0),
    optimizer_health: safeNumber(model.optimizer_health, 100),
    cluster_readiness: safeNumber(company.cluster_readiness, 85),
  };
}

export function applyRestAndPrep(state, actionId = 'prep') {
  const preview = previewRestAndPrep(state);
  const action =
    preview.actions.find((a) => a.id === actionId) ||
    preview.actions.find((a) => a.id === 'prep') ||
    preview.actions[0];

  if (!action || !action.can_apply) {
    const failedAction = {
      type: 'rest_and_prep',
      ok: false,
      success: false,
      error: 'Insufficient cash for prep action',
      preview,
    };
    if (state && typeof state === 'object') {
      state.last_action = failedAction;
    }
    return state;
  }

  const model = state.active_model || (state.active_model = {});
  const company = state.company || (state.company = {});

  const cost = safeNumber(action.cost_kc, preview.cost_kc);
  company.cash_kc = Number((safeNumber(company.cash_kc, 0) - cost).toFixed(4));
  company.quarter_paid_rnd_kc = Number(
    (safeNumber(company.quarter_paid_rnd_kc, 0) + cost).toFixed(4)
  );
  company.cluster_readiness = clamp(
    safeNumber(company.cluster_readiness, 85) +
      safeNumber(action.effects?.cluster_readiness, preview.readiness_gain),
    0,
    100
  );
  const rawOpt = safeNumber(model.optimizer_health, 100);
  const optScale100 = rawOpt <= 1 && rawOpt > 0 ? rawOpt * 100 : rawOpt;
  model.optimizer_health = clamp(
    optScale100 + safeNumber(action.effects?.optimizer_health, preview.optimizer_gain),
    30,
    100
  );
  model.fatigue = Math.max(
    0,
    safeNumber(model.fatigue, 0) + safeNumber(action.effects?.fatigue, -15)
  );

  state.last_action = {
    type: 'rest_and_prep',
    ok: true,
    success: true,
    action_id: action.id,
    cost_kc: cost,
    readiness_gain: safeNumber(action.effects?.cluster_readiness, preview.readiness_gain),
    optimizer_gain: safeNumber(action.effects?.optimizer_health, preview.optimizer_gain),
    preview,
  };
  return state;
}

// ---------------------------------------------------------------------------
// Section 04 — Mentor inheritance
// ---------------------------------------------------------------------------
export function calculateMentorInheritance(arg1 = [], arg2 = []) {
  if (Array.isArray(arg1) && arg1.length > 0 && arg1.every((x) => typeof x === 'number')) {
    const nums = arg1.slice(0, 2);
    const total = nums.reduce((a, b) => a + b, 0);
    const scale = total > 50 ? 50 / total : 1;
    return nums.map((x) => x * scale);
  }

  let mentorList = [];
  let selectedFactors = [];

  if (arg1 && typeof arg1 === 'object' && !Array.isArray(arg1) && (arg1.active_model || arg1.company)) {
    const state = arg1;
    if (Array.isArray(arg2)) {
      mentorList = arg2;
    } else if (Array.isArray(state.mentor_models)) {
      mentorList = state.mentor_models;
    }
  } else if (Array.isArray(arg1)) {
    mentorList = arg1;
    if (Array.isArray(arg2)) {
      selectedFactors = arg2;
    }
  }

  const mentors = mentorList.slice(0, 2).map((m, idx) => {
    if (typeof m === 'string') {
      const found = Array.isArray(HISTORIES)
        ? HISTORIES.find((h) => h.history_id === m || h.id === m)
        : HISTORIES?.[m];
      return found || { id: m, factor_stars: { reasoning: 2, coding: 2 }, compatibility: 1.0 };
    }
    return m || { id: `mentor_${idx}` };
  });

  const allKeys = new Set(selectedFactors);
  for (const m of mentors) {
    const source = m.inheritance_factors || m.factors || m.factor_stars || m.bonuses || m.stats || {};
    for (const k of Object.keys(source)) {
      allKeys.add(k);
    }
  }

  const rawFactors = {};
  const mentorContributions = mentors.map((m, idx) => ({
    mentor_id: m.history_id || m.model_id || m.id || `mentor_${idx + 1}`,
    raw_total: 0,
    scaled_total: 0,
    factors: {},
  }));

  for (const key of allKeys) {
    rawFactors[key] = 0;
  }

  mentors.forEach((mentor, idx) => {
    const compat = safeNumber(mentor.compatibility, 1.0);
    const starsObj = mentor.factor_stars;
    const directObj = mentor.inheritance_factors || mentor.factors || mentor.bonuses || {};

    for (const key of allKeys) {
      let val = 0;
      if (starsObj && starsObj[key] !== undefined) {
        val = 2 * safeNumber(starsObj[key], 0) * compat;
      } else if (directObj[key] !== undefined) {
        const rawVal = safeNumber(directObj[key], 0);
        val = mentor.compatibility !== undefined && rawVal <= 3 ? 2 * rawVal * compat : rawVal;
      }
      if (val > 0) {
        rawFactors[key] = (rawFactors[key] || 0) + val;
        mentorContributions[idx].factors[key] = val;
        mentorContributions[idx].raw_total += val;
      }
    }
  });

  const raw_total = Object.values(rawFactors).reduce((a, b) => a + b, 0);
  const scale = raw_total > 50 ? 50 / raw_total : 1.0;

  const factors = {};
  for (const [key, val] of Object.entries(rawFactors)) {
    factors[key] = Number((val * scale).toFixed(2));
  }

  for (const mc of mentorContributions) {
    mc.scaled_total = Number((mc.raw_total * scale).toFixed(2));
    for (const k of Object.keys(mc.factors)) {
      mc.factors[k] = Number((mc.factors[k] * scale).toFixed(2));
    }
  }

  const cappedTotal = Number(Math.min(50, raw_total).toFixed(2));
  return {
    factors,
    bonuses: factors,
    stat_bonuses: factors,
    total: cappedTotal,
    total_bonus: cappedTotal,
    raw_total: Number(raw_total.toFixed(2)),
    scaled: raw_total > 50,
    scale_factor: Number(scale.toFixed(6)),
    mentor_contributions: mentorContributions,
  };
}

export function applyMentorSelection(state, teacherModelIdsOrSingle = [], selectedFactorsOrSlot = []) {
  if (!state || typeof state !== 'object') return state;
  const model = state.active_model || (state.active_model = {});
  let teacherModelIds = [];
  let selectedFactors = [];

  if (typeof teacherModelIdsOrSingle === 'string') {
    const slot = typeof selectedFactorsOrSlot === 'number' ? selectedFactorsOrSlot : 0;
    const existing = Array.isArray(model.mentor_ids) ? model.mentor_ids.slice(0, 2) : [];
    existing[slot] = teacherModelIdsOrSingle;
    teacherModelIds = existing.filter(Boolean);
  } else if (Array.isArray(teacherModelIdsOrSingle)) {
    teacherModelIds = teacherModelIdsOrSingle.slice(0, 2);
    if (Array.isArray(selectedFactorsOrSlot)) {
      selectedFactors = selectedFactorsOrSlot;
    }
  }

  const mentorPool = [
    ...(Array.isArray(state.mentor_models) ? state.mentor_models : []),
    ...(Array.isArray(state.hall_of_fame) ? state.hall_of_fame : []),
    ...(Array.isArray(HISTORIES) ? HISTORIES : Object.values(HISTORIES || {})),
  ];

  const mentorModels = teacherModelIds.map((id) => {
    if (typeof id === 'object' && id !== null) return id;
    return (
      mentorPool.find((m) => m && (m.id === id || m.history_id === id || m.model_id === id)) || {
        id,
        factor_stars: { reasoning: 3, coding: 2 },
        compatibility: 1.0,
      }
    );
  });

  const inheritance = calculateMentorInheritance(mentorModels, selectedFactors);
  model.mentor_ids = teacherModelIds.map((m) => (typeof m === 'object' ? m.id || m.model_id : m));
  state.selected_teacher_model_ids = model.mentor_ids.slice();
  state.mentor_inheritance = inheritance;

  if (!model.stats) model.stats = {};
  for (const [key, value] of Object.entries(inheritance.factors)) {
    if (model.stats[key] !== undefined) {
      model.stats[key] = clamp(
        Number((safeNumber(model.stats[key], 450) + value).toFixed(2)),
        0,
        1000
      );
    }
  }

  state.last_action = {
    type: 'mentor_selection',
    ok: true,
    success: true,
    teacher_model_ids: model.mentor_ids,
    selected_factors: selectedFactors,
    inheritance,
  };
  return state;
}

// ---------------------------------------------------------------------------
// Section 04.3 — Support card deck
// ---------------------------------------------------------------------------
export function updateSupportCardDeck(state, cardIds = []) {
  if (!state || typeof state !== 'object') return state;
  const turn = safeNumber(state.world?.turn_index ?? state.turn ?? state.season?.turn, 1);
  const isTurn1 = turn === 1;
  const justFinishedCup =
    state.flags?.just_finished_cup === true ||
    state.flags?.cup_race_finished === true ||
    turn === 13;
  const isMidSeasonWindow = (turn === 12 && justFinishedCup) || turn === 13;

  if (!isTurn1 && !isMidSeasonWindow) {
    state.last_action = {
      type: 'update_support_card_deck',
      ok: false,
      success: false,
      error:
        'Support card deck can only be changed at turn 1 or during the mid-season window (turn 12/13).',
    };
    return state;
  }

  const maxCards = 4;
  const uniqueCardIds = [...new Set(cardIds)].slice(0, maxCards);
  state.support_card_ids = uniqueCardIds;
  if (state.active_model) {
    state.active_model.support_card_ids = uniqueCardIds.slice();
  }
  state.last_action = {
    type: 'update_support_card_deck',
    ok: true,
    success: true,
    card_ids: uniqueCardIds,
  };
  return state;
}
