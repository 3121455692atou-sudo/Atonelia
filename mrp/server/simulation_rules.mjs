import { assertRuleVersions, assertRuleSettings } from '../src/career/world/rules.js';
import { automationVersion } from '../src/career/sim/automation.js';
import { assertSupplyState } from '../src/career/world/supply_state.js';
// Pure preflight: never install a Provider, repair a WAL, or rewrite an archive.
import { SIMULATION_RULES_VERSION } from '../src/career/world/rules_version.js';
export { SIMULATION_RULES_VERSION };
const unsupported = () => Error('不支持旧版或未知模拟规则，请创建新房间；原存档保留');
export function validateSimulationRulesVersion(version) {
  if (version !== SIMULATION_RULES_VERSION) throw unsupported();
}
export function rejectSimulationRulesInput(input) {
  if (input && ['simulationRulesVersion', 'releaseNamingVersion'].some(key => Object.hasOwn(input, key))) throw Error('模拟规则由服务器决定');
}
const rejectObsoleteMarker = input => {
  if (input && Object.hasOwn(input, 'releaseNamingVersion')) throw unsupported();
};
export function validateSimulationRulesStart(args) {
  rejectObsoleteMarker(args);
  rejectObsoleteMarker(args?.settings);
  validateSimulationRulesVersion(args?.simulationRulesVersion);
  if (!args?.settings || typeof args.settings !== 'object' || Array.isArray(args.settings)) throw unsupported();
  assertRuleVersions(args);
  assertRuleSettings(args.settings);
  // An explicit 0 disables automation; absence cannot silently select old rules.
  if (!Object.hasOwn(args, 'automationVersion') || args.automationVersion === undefined) throw Error('联机开局日志缺少托管规则版本；请创建新房间');
  automationVersion(args);
  if (Object.hasOwn(args.settings, 'automationVersion') && args.settings.automationVersion !== args.automationVersion) throw Error('联机开局日志托管规则版本不一致');
  // A nested duplicate is optional, but cannot disagree with the WAL authority.
  if (Object.hasOwn(args.settings, 'simulationRulesVersion')) validateSimulationRulesVersion(args.settings.simulationRulesVersion);
}
export function validateSimulationRulesRuntime(runtime) {
  rejectObsoleteMarker(runtime);
  validateSimulationRulesVersion(runtime?.simulationRulesVersion);
}
export function markWorldSimulationRules(world) {
  if (!world?.settings?.mp) throw Error('模拟联机规则需要联机世界');
  world.settings.simulationRulesVersion = SIMULATION_RULES_VERSION;
  return world;
}
export function validateWorldSimulationRules(world) {
  assertRuleVersions(world);
  assertRuleSettings(world?.settings);
  rejectObsoleteMarker(world?.settings);
  validateSimulationRulesVersion(world?.settings?.simulationRulesVersion);
  assertSupplyState(world);
}
export function validateSimulationRulesSnapshot(raw) {
  assertRuleVersions(raw?.world);
  assertRuleSettings(raw?.settings);
  assertRuleSettings(raw?.world?.settings);
  rejectObsoleteMarker(raw?.settings);
  rejectObsoleteMarker(raw?.world?.settings);
  validateSimulationRulesVersion(raw?.settings?.simulationRulesVersion);
  validateSimulationRulesVersion(raw?.world?.settings?.simulationRulesVersion);
  assertSupplyState(raw?.world);
}
