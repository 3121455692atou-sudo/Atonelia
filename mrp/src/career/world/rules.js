const RULE_KEYS = ['endVersion', 'autoPostVersion'];
const unsupported = (key, value) => new Error(`不支持的规则版本 ${key}：${String(value)}；请创建新局`);

// Persisted worlds must carry the current rules explicitly. Missing is not v0.
export function assertRuleVersions(source) {
  for (const key of RULE_KEYS) {
    if (source?.[key] !== 1) throw unsupported(key, source?.[key]);
  }
}

// New-game options / optional duplicate settings may omit these server-owned
// defaults. An explicit old or unknown version is never an upgrade request.
export function assertRuleSettings(settings) {
  for (const key of RULE_KEYS) {
    const value = settings?.[key];
    if (value !== undefined && value !== 1) throw unsupported(key, value);
  }
}
