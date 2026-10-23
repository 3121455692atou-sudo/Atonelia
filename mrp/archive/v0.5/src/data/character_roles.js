import { CHARACTER_ROSTER } from './catalog_characters.js';

export const MODEL_CHARACTERS = Object.freeze(CHARACTER_ROSTER.filter(c => c.category === 'model'));
export const NPC_CHARACTERS = Object.freeze(CHARACTER_ROSTER.filter(c => c.category !== 'model'));

const modelsById = new Map(MODEL_CHARACTERS.map(c => [c.id, c]));
const npcsById = new Map(NPC_CHARACTERS.map(c => [c.id, c]));

export function isModelCharacter(id) {
  return modelsById.has(id);
}

export function isNpcIdentity(id) {
  return typeof id === 'string' && npcsById.has(id.replace(/^roster_/, ''));
}

// Older preferences may name a tool. The cultivation stage always resolves to a model.
export function resolveModelCharacter(historyId, preferredId = null) {
  if (modelsById.has(preferredId)) return modelsById.get(preferredId);
  const exact = MODEL_CHARACTERS.find(c => c.history_id === historyId);
  if (exact) return exact;
  const family = ['deepseek', 'qwen', 'gemini', 'claude', 'gpt'].find(id => String(historyId || '').includes(id));
  return modelsById.get(family || 'qwen');
}

const toolRoles = {
  opencode: '终端开发搭档', codex: '编程任务协作者', github_copilot: '代码补全助手',
  microsoft_copilot: '日常办公助手', lobehub: '模型应用工作台', zcode: '编程工具伙伴',
  deepseek_harness: '模型调用工作流伙伴', kiro: '开发流程助手', cursor: '编辑器伙伴',
  antigravity: '开发工作台伙伴', pi: '终端工具伙伴', claude_code: '终端编程助手',
  sillytavern: '酒馆与角色扮演向导', comfyui: '图像工作流向导',
};

export const NPC_PROFILES = Object.freeze(Object.fromEntries(NPC_CHARACTERS.map(c => [c.id, Object.freeze(
  c.category === 'application'
    ? { role: toolRoles[c.id] || '应用接入伙伴', section: 'applications', destination: '前往应用与网关',
        description: '为模型提供使用入口与工作流。你可以在应用与网关里设置支持的软件，让用户通过这些工具使用你的模型。',
        line: `${c.name} 已就位。把模型接进来，我们一起把它送到用户手里。` }
    : c.id === 'ascend'
      ? { role: '算力供应商', section: 'compute', destination: '前往算力来源',
          description: '负责算力与硬件相关的世界互动。模型的训练资源和服务容量在算力来源中分配。',
          line: '训练与服务都需要算力。先看看集群，再安排下一步吧。' }
      : { role: '模型社区向导', section: 'product', destination: '前往模型服务',
          description: '连接模型、社区与使用者。你可以在模型服务中发布育成成果，为不同用户提供服务。',
          line: '欢迎来到模型社区。让大家认识你培养出的下一版吧。' }
)])));
