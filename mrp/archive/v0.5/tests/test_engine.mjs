import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { BALANCE_RULES, START_PROFILES, TRAINING_RECIPES, ARCHITECTURES, HISTORIES, SUPPORT_CARDS, SKILLS } from '../src/data/catalog_core.js';
import { BENCHMARKS, DATASET_TEMPLATES, ACQUISITION_ROUTES, ANNOTATION_TEAMS, LABEL_METHODS, RESEARCH_NODES, JOB_SECTORS, SECURITIES, STORY_EVENTS, SEASON_CHAPTERS, ENDINGS } from '../src/data/catalog_world.js';
import { createNewGameState, validateGameState, createCheckpoint, rollbackModelToCheckpoint, createDataset } from '../src/engine/state_schema.js';
import { previewTraining, applyTraining, previewRestAndPrep, applyRestAndPrep, calculateMentorInheritance } from '../src/engine/training_engine.js';
import { previewRace, simulateRace, calculateAnnotationQuality, stepResearchProject } from '../src/engine/race_and_data_engine.js';
import { closeQuarter, computeIpoDilution, executeIPO, lockCrashTurn, updateBubbleState, evaluateMilestones, updateSectorsAndMilestones, advanceTurn } from '../src/engine/company_and_world_engine.js';

const STAT_KEYS = ['knowledge', 'reasoning', 'coding', 'expression', 'context', 'reliability'];

function approx(actual, expected, tolerance = 1e-4) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}`
  );
}

function getRecipe(id) {
  if (Array.isArray(TRAINING_RECIPES)) return TRAINING_RECIPES.find(r => r.id === id);
  return TRAINING_RECIPES[id];
}

function getSupportCardIds() {
  if (Array.isArray(SUPPORT_CARDS)) return SUPPORT_CARDS.map(c => c.id);
  return Object.keys(SUPPORT_CARDS);
}

function getFirstBenchmarkId() {
  if (Array.isArray(BENCHMARKS)) return BENCHMARKS[0].id;
  return Object.keys(BENCHMARKS)[0];
}

function ensureDataset(state, data) {
  const result = createDataset(state, data);
  const datasetId = (result && result.id) ? result.id : data.id;
  if (!state.datasets) state.datasets = [];
  if (!state.datasets.find(d => d.id === datasetId)) {
    state.datasets.push(result || { ...data, id: datasetId });
  }
  return datasetId;
}

describe('Schema & New Game Validation', () => {
  it('createNewGameState passes validateGameState', () => {
    const state = createNewGameState();
    const validation = validateGameState(state);
    assert.strictEqual(validation.valid, true);
  });

  it('active_model.stats has 10 capabilities each at 450', () => {
    const state = createNewGameState();
    const stats = state.active_model.stats;
    for (const key of STAT_KEYS) {
      assert.strictEqual(stats[key], 450);
    }
    assert.strictEqual(Object.keys(stats).length, 10);
    for(const key of ['creative_writing','mathematics','safety_alignment','tool_use']) assert.equal(stats[key],450);
  });

  it('company initial values', () => {
    const state = createNewGameState();
    assert.strictEqual(state.company.cash_kc, 2400);
    assert.strictEqual(state.company.cluster_memory_gb, 96);
    assert.strictEqual(state.company.cluster_compute_cu, 140);
    assert.strictEqual(state.company.cluster_readiness, 85);
  });

  it('sectors has 20 entries and JOB_SECTORS weights sum to 1.0', () => {
    const state = createNewGameState();
    assert.strictEqual(Object.keys(state.sectors).length, 20);
    const weights = Object.values(JOB_SECTORS);
    const sum = weights.reduce((a, b) => a + (typeof b === 'number' ? b : b.weight), 0);
    approx(sum, 1.0, 1e-9);
  });

  it('active_model.support_card_ids has the 4 starter cards', () => {
    const state = createNewGameState();
    const cardIds = state.active_model.support_card_ids;
    assert.strictEqual(cardIds.length, 4);
    const validIds = getSupportCardIds();
    for (const id of cardIds) {
      assert.ok(validIds.includes(id), `Starter card ${id} is not in SUPPORT_CARDS`);
    }
  });
});

describe('Section 6.2 Exact Initial Benchmark', () => {
  it('previewTraining returns exact values for sft/lora/balanced/1 epoch/replay 0.15', () => {
    const state = createNewGameState();
    const preview = previewTraining(state, {
      recipe_id: 'sft',
      training_mode: 'lora',
      preset: 'balanced',
      epochs: 1,
      replay_ratio: 0.15,
    });
    approx(preview.cost_kc, 12.8096, 1e-4);
    approx(preview.compute_cu, 31.4889, 1e-4);
    approx(preview.memory_gb, 19.872, 1e-4);
    approx(preview.expected_total_gain, 22.93, 1e-4);
    assert.strictEqual(preview.failure_prob, 0);
    assert.strictEqual(preview.can_apply, true);
  });
});

describe('Focus Stat Weighting & Blockers', () => {
  it('focus_stat mixed uses recipe original weights', () => {
    const state = createNewGameState();
    const recipe = getRecipe('sft');
    const preview = previewTraining(state, {
      recipe_id: 'sft',
      training_mode: 'lora',
      preset: 'balanced',
      epochs: 1,
      replay_ratio: 0.15,
      focus_stat: 'mixed',
    });
    const weights = preview.weights || preview.stat_weights || preview.focus_weights;
    assert.ok(weights, 'preview should return weights');
    for (const key of STAT_KEYS) {
      approx(weights[key], recipe.weights[key], 1e-9);
    }
  });

  it('focus_stat coding applies formula', () => {
    const state = createNewGameState();
    const recipe = getRecipe('sft');
    const preview = previewTraining(state, {
      recipe_id: 'sft',
      training_mode: 'lora',
      preset: 'balanced',
      epochs: 1,
      replay_ratio: 0.15,
      focus_stat: 'coding',
    });
    const weights = preview.weights || preview.stat_weights || preview.focus_weights;
    assert.ok(weights, 'preview should return weights');
    for (const key of STAT_KEYS) {
      let expected;
      if (key === 'coding') {
        expected = 0.70 + 0.30 * recipe.weights.coding;
      } else {
        expected = 0.30 * recipe.weights[key];
      }
      approx(weights[key], expected, 1e-9);
    }
  });

  it('OOM blocker prevents applyTraining and does not advance turn or deduct cash', () => {
    const state = createNewGameState();
    const initialTurn = state.world.turn_index;
    const initialCash = state.company.cash_kc;
    state.company.cluster_memory_gb = 8;
    const preview = previewTraining(state, {
      recipe_id: 'sft',
      training_mode: 'lora',
      preset: 'balanced',
      epochs: 1,
      replay_ratio: 0.15,
    });
    assert.strictEqual(preview.can_apply, false);
    const blockers = preview.blockers || [];
    const hasOOM = blockers.some(b => {
      const code = typeof b === 'string' ? b : b.code || b.type;
      return code === 'OOM';
    });
    assert.ok(hasOOM, 'Expected OOM blocker');
    // Attempt to apply
    applyTraining(state, {
      recipe_id: 'sft',
      training_mode: 'lora',
      preset: 'balanced',
      epochs: 1,
      replay_ratio: 0.15,
    });
    assert.strictEqual(state.world.turn_index, initialTurn);
    assert.strictEqual(state.company.cash_kc, initialCash);
  });

  it('DATASET_FORMAT_MISMATCH blocker when using raw_text dataset on sft', () => {
    const state = createNewGameState();
    const datasetId = ensureDataset(state, {
      id: 'ds_raw',
      name: 'Raw Text',
      format: 'raw_text',
      size: 1000,
      quality: 0.8,
    });
    const preview = previewTraining(state, {
      recipe_id: 'sft',
      training_mode: 'lora',
      preset: 'balanced',
      epochs: 1,
      replay_ratio: 0.15,
      dataset_ids: [datasetId],
    });
    assert.strictEqual(preview.can_apply, false);
    const blockers = preview.blockers || [];
    const hasMismatch = blockers.some(b => {
      const code = typeof b === 'string' ? b : b.code || b.type;
      return code === 'DATASET_FORMAT_MISMATCH';
    });
    assert.ok(hasMismatch, 'Expected DATASET_FORMAT_MISMATCH blocker');
  });
});

describe('Checkpoint Rollback Ownership Boundary', () => {
  it('restores model state but not company/datasets/provenance/legal', () => {
    const state = createNewGameState();
    state.active_model.overfit = 0;
    state.active_model.sycophancy = 0;
    // Ensure at least one dataset
    if (!state.datasets || state.datasets.length === 0) {
      ensureDataset(state, { id: 'ds0', name: 'Starter', format: 'instruction', size: 100, quality: 0.5 });
    }
    const cp = createCheckpoint(state, 'cp1');
    const cpId = (cp && cp.id) ? cp.id : cp;

    // Mutate model
    state.active_model.stats.knowledge = 999;
    state.active_model.stats.reasoning = 999;
    state.active_model.stats.coding = 999;
    state.active_model.stats.expression = 999;
    state.active_model.stats.context = 999;
    state.active_model.stats.reliability = 999;
    state.active_model.overfit = 0.5;
    state.active_model.forgetting = 0.5;
    state.active_model.reward_hacking = 0.5;
    state.active_model.sycophancy = 0.5;
    state.active_model.optimizer_health = 50;
    state.active_model.training_provenance_ids = ['prov_1', 'prov_2'];

    // Mutate company
    state.company.cash_kc = 9999;
    state.datasets[0].uses = 5;
    state.legal_exposures = [{ type: 'unauthorized_distillation', severity: 3 }];

    // Rollback
    rollbackModelToCheckpoint(state, cpId);

    // Stats restored
    for (const key of STAT_KEYS) {
      assert.strictEqual(state.active_model.stats[key], 450);
    }
    assert.strictEqual(state.active_model.overfit, 0);
    assert.strictEqual(state.active_model.forgetting, 0);
    assert.strictEqual(state.active_model.reward_hacking, 0);
    assert.strictEqual(state.active_model.sycophancy, 0);
    // Optimizer health reduced by 8 from 50 -> 42
    assert.strictEqual(state.active_model.optimizer_health, 42);
    // Not rolled back
    assert.strictEqual(state.company.cash_kc, 9999);
    assert.strictEqual(state.datasets[0].uses, 5);
    assert.deepStrictEqual(state.active_model.training_provenance_ids, ['prov_1', 'prov_2']);
    assert.deepStrictEqual(state.legal_exposures, [{ type: 'unauthorized_distillation', severity: 3 }]);
  });

  it('optimizer health floor at 30', () => {
    const state = createNewGameState();
    const cp = createCheckpoint(state, 'cp2');
    const cpId = (cp && cp.id) ? cp.id : cp;
    state.active_model.optimizer_health = 35;
    rollbackModelToCheckpoint(state, cpId);
    assert.strictEqual(state.active_model.optimizer_health, 30);
  });
});

describe('Mentor Inheritance Cap', () => {
  it('caps total bonus at 50 proportionally', () => {
    const result = calculateMentorInheritance([40, 20]);
    const total = result.reduce((a, b) => a + b, 0);
    approx(total, 50, 1e-9);
    approx(result[0], 40 * (50 / 60), 1e-9);
    approx(result[1], 20 * (50 / 60), 1e-9);
    assert.ok(result[1] > 0, 'second mentor bonus should not be truncated to 0');
  });

  it('leaves totals <= 50 untouched', () => {
    const result = calculateMentorInheritance([10, 20]);
    assert.deepStrictEqual(result, [10, 20]);
  });

  it('never truncates second mentor to 0', () => {
    const result = calculateMentorInheritance([49, 2]);
    const total = result.reduce((a, b) => a + b, 0);
    approx(total, 50, 1e-9);
    assert.ok(result[1] > 0);
  });
});

describe('Quarter Cash Bridge No Double-Deduction', () => {
  it('includes paid rnd/legal in net_income but not in cash_delta again', () => {
    const state1 = createNewGameState();
    state1.company.quarter_paid_rnd_kc = 0;
    state1.company.quarter_paid_legal_kc = 0;
    const result1 = closeQuarter(state1);

    const state2 = createNewGameState();
    state2.company.quarter_paid_rnd_kc = 100;
    state2.company.quarter_paid_legal_kc = 50;
    const result2 = closeQuarter(state2);

    // net_income should be lower by 150
    approx(result2.net_income_kc - result1.net_income_kc, -150, 1e-6);
    // cash_delta should be the same (no double deduction)
    approx(result2.cash_delta_from_close_kc, result1.cash_delta_from_close_kc, 1e-6);
  });
});

describe('IPO Dilution Math', () => {
  it('computes correct dilution', () => {
    const result = computeIpoDilution({
      shares_outstanding: 1000000,
      pre_money_kc: 10000,
      post_issue_fraction: 0.15,
    });
    approx(result.new_shares, 176471, 1);
    approx(result.gross_proceeds_kc, 1764.71, 0.01);
    approx(result.net_proceeds_kc, 1711.77, 0.01);
    approx(result.founder_shares, 1000000, 0);
    approx(result.founder_ownership, 0.85, 0.001);
  });
});

describe('AI Bubble Lock & Non-Compounding Multipliers', () => {
  it('locks crash turn in [84,108] and renaming does not change it', () => {
    const state = createNewGameState();
    lockCrashTurn(state);
    const locked = state.world.locked_crash_turn;
    assert.ok(locked >= 84 && locked <= 108, `locked crash turn ${locked} not in [84,108]`);
    state.company.name = 'New Name';
    state.active_model.name = 'New Model';
    assert.strictEqual(state.world.locked_crash_turn, locked);
  });

  it('valuation multiplier does not compound on consecutive crash turns', () => {
    const state = createNewGameState();
    lockCrashTurn(state);
    const crashTurn = state.world.locked_crash_turn;
    state.world.valuation_multiplier = 1.0;
    state.world.turn_index = crashTurn;
    updateBubbleState(state);
    approx(state.world.valuation_multiplier, 0.40, 1e-9);
    state.world.turn_index = crashTurn + 1;
    updateBubbleState(state);
    approx(state.world.valuation_multiplier, 0.40, 1e-9);
    state.world.turn_index = crashTurn + 2;
    updateBubbleState(state);
    approx(state.world.valuation_multiplier, 0.40, 1e-9);
  });
});

describe('Virtual Benchmark Race & Contamination Disqualification', () => {
  it('official_score is 0.60*public + 0.40*hidden', () => {
    const state = createNewGameState();
    const benchmarkId = getFirstBenchmarkId();
    const result = simulateRace(state, benchmarkId);
    approx(result.official_score, 0.60 * result.public_score + 0.40 * result.hidden_score, 1e-9);
  });

  it('contamination inflates public_score but not hidden_score', () => {
    const state1 = createNewGameState();
    state1.active_model.contamination = 0;
    const benchmarkId = getFirstBenchmarkId();
    const result1 = simulateRace(state1, benchmarkId);

    const state2 = createNewGameState();
    state2.active_model.contamination = 20;
    const result2 = simulateRace(state2, benchmarkId);

    assert.ok(result2.public_score > result1.public_score, 'public_score should increase with contamination');
    approx(result2.hidden_score, result1.hidden_score, 1e-9);
  });

  it('heavy contamination >= 35 sets rank_eligible false', () => {
    const state = createNewGameState();
    state.active_model.contamination = 40;
    const benchmarkId = getFirstBenchmarkId();
    const result = simulateRace(state, benchmarkId);
    assert.strictEqual(result.rank_eligible, false);
  });

  it('unauthorized_distillation exposure sets rank_eligible false', () => {
    const state = createNewGameState();
    state.legal_exposures = state.legal_exposures || [];
    state.legal_exposures.push({ type: 'unauthorized_distillation', severity: 5 });
    const benchmarkId = getFirstBenchmarkId();
    const result = simulateRace(state, benchmarkId);
    assert.strictEqual(result.rank_eligible, false);
  });
});

describe('AGI / ASI / RSI Evidence Gate', () => {
  it('claimed_agi flag does not set agi_achieved', () => {
    const state = createNewGameState();
    state.story.flags = state.story.flags || [];
    state.story.flags.push('claimed_agi');
    evaluateMilestones(state);
    assert.notStrictEqual(state.milestones.agi_achieved, true);
  });

  it('meeting real thresholds sets agi_achieved true', () => {
    const state = createNewGameState();
    state.metrics = state.metrics || {};
    state.metrics.domain_pass_rate = 0.80;
    state.metrics.worst_domain_pass_rate = 0.60;
    state.metrics.autonomy_hours = 8;
    state.metrics.critical_incident_rate = 0.01;
    state.metrics.independent_audits = 3;
    evaluateMilestones(state);
    assert.strictEqual(state.milestones.agi_achieved, true);
  });
});
