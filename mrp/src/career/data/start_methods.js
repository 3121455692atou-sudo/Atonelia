// 平行世界的开局方法：保留行业三个月扩散，只补已发布领跑项目的三条明确例外。
// 只由新局构造器在首次 newModel 之前调用；不修改运行中状态，不送策略节点。
import { TECHS, addMonths } from './core.js';

// Ownership initialization is replay-critical and independent of automation/clock rules.
export const INITIAL_METHODS_VERSION = 1;

export const LEADER_START_METHODS = Object.freeze([
  Object.freeze({ companyId: 'deepseek', scenarioId: 'y2025', start: '2025-01', modality: 'llm', techIds: Object.freeze(['fp8', 'mtp']), basisStrategyId: 'ds_v3' }),
  Object.freeze({ companyId: 'claude', scenarioId: 'y2025', start: '2025-01', modality: 'llm', techIds: Object.freeze(['mcp']), basisStrategyId: 'cl_mcp' }),
  Object.freeze({ companyId: 'mistral', scenarioId: 'y2024', start: '2024-01', modality: 'llm', techIds: Object.freeze(['moe']), basisStrategyId: 'mi_mixtral' }),
]);

// 内部研究工程是本公司的管线建设，不随行业年表白送；已有44项技术和领跑例外不变。
// 与原 HistoryProvider.startTechs 完全相同的通用扩散规则；zero 必须只走这一层。
export function diffusedStartTechs(s) {
  return TECHS.filter(t => t.mod === s.mod && !t.internalPractice && (t.start || t.from <= addMonths(s.start, -3))).map(t => t.id);
}

// companyId 是经营公司，不是卡面身份或母公司 org；仅精确匹配剧本和开局年月。
export function historicalStartTechs(s) {
  const base = diffusedStartTechs(s);
  const row = LEADER_START_METHODS.find(x => x.companyId === s.charId && x.scenarioId === s.scenario && x.start === s.start && x.modality === s.mod);
  return row ? [...new Set([...base, ...row.techIds])] : base;
}
