// Fictional game balance. CU is capacity per turn; M Token is one million tokens.
export const SERVICE_QUARTER_TURNS = 6;
export const COMPUTE_SOURCES = Object.freeze({
  owned: { name: '自有 GPU', subtitle: '购置机柜 · 研究与推理共享', block_cu: 40, memory_gb: 24, purchase_kc: 480, power_kc_per_cu: 0.16 },
  reserved: { name: '长约云集群', subtitle: '稳定交付 · 四回合保留', block_cu: 60, setup_kc: 45, cost_kc: 22, term_turns: 4 },
  spot: { name: '竞价 GPU', subtitle: '低价弹性 · 有回收风险', block_cu: 80, cost_kc: 10 },
  upstream: { name: '上游托管 API', subtitle: '同款模型托管 · 按量转售', block_tokens_m: 6, cost_kc_per_m: 7 },
});
export const MODEL_ROUTES = Object.freeze({
  native: { name: '完整模型', cost_factor: 1, quality_factor: 1, description: '所有请求使用已发布的原版模型。' },
  quantized: { name: '量化加速版', cost_factor: 0.58, quality_factor: 0.88, description: '压缩权重、降低推理预算，以少量能力换吞吐。' },
  lite: { name: '轻量蒸馏版', cost_factor: 0.28, quality_factor: 0.64, description: '将部分请求交给小模型，成本明显下降。' },
});
export const DEFAULT_OFFERS = Object.freeze([
  { id: 'api', segment: 'tob', billing: 'token', name: '开发者 API', enabled: false, price_kc_per_m: 18, customers: 8, tokens_per_customer_m: 1.2, sla: 0.95, audience:'general', access_mode:'public_api', allowed_apps:[], resale_allowed:true },
  { id: 'plan', segment: 'toc', billing: 'plan', name: '个人 Token Plan', enabled: false, plan_price_kc: 0.32, included_tokens_m: 0.08, overage: 'cap', overage_price_kc_per_m: 18, customers: 120, tokens_per_customer_m: 0.1, sla: 0.8, audience:'creative', access_mode:'public_api', allowed_apps:[], resale_allowed:false },
  { id: 'gpu', segment: 'tob', billing: 'compute', name: '弹性算力租赁', enabled: false, price_kc_per_cu: 0.95, customers: 4, cu_per_customer: 12, sla: 0.95 },
  { id:'coding_plan',segment:'toc',billing:'plan',name:'Coding Plan',enabled:false,plan_price_kc:.85,included_tokens_m:.25,overage:'cap',overage_price_kc_per_m:18,customers:28,tokens_per_customer_m:.32,sla:.9,audience:'coding',access_mode:'app_only',allowed_apps:['opencode'],resale_allowed:false },
]);
