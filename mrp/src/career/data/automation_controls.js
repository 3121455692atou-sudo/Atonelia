// Control-only metadata: these are the six implemented planners, not all company decisions.
export const AUTOMATION_MODULES = Object.freeze({data:'数据收集',research:'技术研究',computeAllocation:'算力分配',companyStrategy:'公司策略研究',pretraining:'预训练筹备',evaluation:'评测与发布'});
export const defaultAutomationModes = () => Object.fromEntries(Object.keys(AUTOMATION_MODULES).map(k => [k, 'auto']));
export function validateAutomationModes(value) {
  const keys = Object.keys(AUTOMATION_MODULES);
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || !keys.every(k => Object.hasOwn(value,k) && ['auto','manual'].includes(value[k]))) throw Error('托管预设必须包含六个已接入模块，且只能选择自动或手动');
  return Object.fromEntries(keys.map(k => [k,value[k]]));
}
