export const LEGACY_STAT_KEYS = ['knowledge','reasoning','coding','expression','context','reliability'];
export const SPECIALIST_STAT_KEYS = ['creative_writing','mathematics','safety_alignment','tool_use'];
export const CAPABILITY_KEYS = [...LEGACY_STAT_KEYS, ...SPECIALIST_STAT_KEYS];
export const PRIMARY_CAPABILITY_KEYS = ['creative_writing','coding','mathematics','safety_alignment','tool_use','reasoning'];
export const CAPABILITY_LABELS = {
  knowledge:'通识知识', reasoning:'逻辑推理', coding:'Coding', expression:'语言表达', context:'长程上下文', reliability:'事实可靠性',
  creative_writing:'创意写作', mathematics:'数学', safety_alignment:'安全对齐', tool_use:'工具使用',
};
const finite = value => typeof value === 'number' && Number.isFinite(value);
const clamp = value => Math.max(0, Math.min(1000, value));

// Old saves gain explicit specialist dimensions, while zero alignment stays zero.
export function readCapabilities(model = {}) {
  const s = model.stats || {};
  const fallback = { creative_writing:s.expression, mathematics:s.reasoning, safety_alignment:450, tool_use:s.coding };
  return Object.fromEntries(CAPABILITY_KEYS.map(k=>[k,clamp(finite(s[k]) ? s[k] : finite(fallback[k]) ? fallback[k] : 450)]));
}

export function migrateModelCapabilities(model) {
  if (!model || typeof model !== 'object') return;
  model.stats = { ...(model.stats || {}), ...readCapabilities(model) };
  model.stat_caps ||= {};
  for (const key of CAPABILITY_KEYS) if (!finite(model.stat_caps[key])) model.stat_caps[key] = 720;
  for (const cp of model.checkpoints || []) {
    const snapshot = cp.snapshot || cp;
    if (snapshot.stats) snapshot.stats = readCapabilities(snapshot);
  }
}

export const AUDIENCE_SEGMENTS = {
  general: { name:'通用助手用户', weights:{knowledge:.18,reasoning:.17,coding:.08,expression:.17,context:.12,reliability:.18,tool_use:.1} },
  creative: { name:'创作与文学用户', weights:{creative_writing:.65,expression:.25,context:.1} },
  tavern: { name:'酒馆与角色扮演用户', weights:{creative_writing:.62,expression:.2,context:.18}, freedom_preference:true },
  coding: { name:'编程与 Coding Plan 用户', weights:{coding:.5,tool_use:.3,reasoning:.12,reliability:.08} },
  mathematics: { name:'数学与科研用户', weights:{mathematics:.65,reasoning:.25,reliability:.1} },
  enterprise: { name:'企业与公共服务用户', weights:{safety_alignment:.35,reliability:.3,tool_use:.2,knowledge:.15} },
};

export function audienceFit(capabilities, audience = 'general') {
  const profile = readCapabilities({ stats:capabilities });
  const segment = AUDIENCE_SEGMENTS[audience] || AUDIENCE_SEGMENTS.general;
  let score = Object.entries(segment.weights).reduce((sum,[key,weight])=>sum+profile[key]*weight,0);
  if (segment.freedom_preference) score *= 1.05 + (0.5 - profile.safety_alignment/1000)*0.5;
  return Math.max(0.1,Math.min(1.4,score/650));
}
