// Initial ownership is authoritative and replay-critical, not an automation mode.
import { INITIAL_METHODS_VERSION } from '../src/career/data/start_methods.js';
export { INITIAL_METHODS_VERSION };
const unsupported = () => Error('不支持旧版或未知初始研究规则，请创建新房间；原存档保留');
export function validateInitialMethodsVersion(version) {
  if (version !== INITIAL_METHODS_VERSION) throw unsupported();
}
export function rejectInitialMethodsInput(settings) {
  if (settings && Object.hasOwn(settings, 'initialMethodsVersion')) throw Error('初始研究规则由服务器决定');
}
export function validateInitialMethodsStart(args) {
  validateInitialMethodsVersion(args?.initialMethodsVersion);
  // A duplicated nested marker, if present, may not disagree with the WAL authority.
  if (args?.settings && Object.hasOwn(args.settings, 'initialMethodsVersion')) validateInitialMethodsVersion(args.settings.initialMethodsVersion);
}
export function validateInitialMethodsRuntime(runtime) {
  validateInitialMethodsVersion(runtime?.initialMethodsVersion);
}
export function markWorldInitialMethods(world) {
  if (!world?.settings?.mp) throw Error('初始研究联机规则需要联机世界');
  world.settings.initialMethodsVersion = INITIAL_METHODS_VERSION;
  return world;
}
export function validateWorldInitialMethods(world) {
  validateInitialMethodsVersion(world?.settings?.initialMethodsVersion);
}
// Pure preflight before migrateWorld installs any provider or replay repairs a tail.
export function validateInitialMethodsSnapshot(raw) {
  validateInitialMethodsVersion(raw?.settings?.initialMethodsVersion);
  validateInitialMethodsVersion(raw?.world?.settings?.initialMethodsVersion);
}
