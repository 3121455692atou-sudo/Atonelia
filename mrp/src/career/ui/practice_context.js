// New-document practice boundary. No engine/UI imports and no native storage reads.
// Once installed, even late callbacks in a retained document keep memory storage.
const KINDS = new Set(['basic', 'advanced']);
const contexts = new WeakMap();
const own = (object, key) => Object.getOwnPropertyDescriptor(object, key);

function kindFromURL(href) {
  const url = new URL(href);
  const kinds = url.searchParams.getAll('practice');
  if (!kinds.length) return null;
  if (kinds.length !== 1 || !KINDS.has(kinds[0])) throw Error('练习地址无效，请返回游戏重新进入');
  return kinds[0];
}
function memoryStorage() {
  const values = new Map();
  // Map, not object properties: __proto__ and method names remain ordinary keys.
  return Object.freeze({
    get length() { return values.size; },
    key(index) { return [...values.keys()][Number(index) >>> 0] ?? null; },
    getItem(key) { return values.get(String(key)) ?? null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); },
    clear() { values.clear(); },
  });
}
function verifyStorage(storage) {
  if (storage.length !== 0 || storage.getItem('__practice_probe__') !== null) throw Error('练习存储不是空白');
  storage.setItem('__practice_probe__', 7);
  if (storage.length !== 1 || storage.key(0) !== '__practice_probe__' || storage.getItem('__practice_probe__') !== '7') throw Error('练习存储验证失败');
  storage.removeItem('__practice_probe__');
  if (storage.length !== 0 || storage.getItem('__practice_probe__') !== null) throw Error('练习存储清理失败');
}
function verifiedProperty(global, key, expected) {
  const descriptor = own(global, key);
  return !!descriptor && Object.hasOwn(descriptor, 'value') && descriptor.value === expected
    && descriptor.writable === false && descriptor.configurable === false && global[key] === expected;
}
export function practiceKind(global = globalThis) { return contexts.get(global)?.kind ?? null; }

export function installPracticeContext(global = globalThis, href = global.location?.href) {
  const kind = kindFromURL(href);
  const prior = contexts.get(global);
  if (prior) {
    if (prior.kind !== kind || !verifiedProperty(global, 'localStorage', prior.local)
      || !verifiedProperty(global, 'sessionStorage', prior.session) || !verifiedProperty(global, 'indexedDB', undefined)) {
      throw Error('练习环境已改变，请重新进入');
    }
    return prior.kind;
  }
  if (!kind) return null;
  // Inspect descriptors only: native storage getters must never be invoked.
  for (const key of ['localStorage', 'sessionStorage', 'indexedDB']) {
    const descriptor = own(global, key);
    if (descriptor && !descriptor.configurable) throw Error('这个浏览器无法安全开启练习，请返回游戏');
  }
  const local = memoryStorage(), session = memoryStorage();
  verifyStorage(local); verifyStorage(session);
  for (const [key, value] of [['localStorage', local], ['sessionStorage', session], ['indexedDB', undefined]]) {
    Object.defineProperty(global, key, { value, writable: false, configurable: false, enumerable: true });
  }
  if (!verifiedProperty(global, 'localStorage', local) || !verifiedProperty(global, 'sessionStorage', session)
    || !verifiedProperty(global, 'indexedDB', undefined) || local === session) throw Error('练习隔离验证失败，请返回游戏');
  contexts.set(global, { kind, local, session });
  return kind;
}
export function practiceURL(kind, href = globalThis.location.href) {
  if (!KINDS.has(kind)) throw Error('没有这项练习');
  const url = new URL(href);
  url.searchParams.set('practice', kind);
  url.hash = '';
  return url.href;
}
export function exitPractice(global = globalThis) {
  const url = new URL(global.location.href);
  url.searchParams.delete('practice');
  url.hash = '';
  // Never restore native properties in this document; replacement is a new realm.
  global.location.replace(url.href);
}
export async function bootWithPractice({ global = globalThis, href = global.location?.href, loadApp } = {}) {
  if (typeof loadApp !== 'function') throw Error('缺少游戏入口');
  const kind = installPracticeContext(global, href);
  await loadApp();
  return kind;
}
