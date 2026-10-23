// All prices, risk probabilities and client traffic below are fictional game balance.
export const APPLICATIONS = Object.freeze([
  {id:'opencode',name:'OpenCode',audiences:['coding','mathematics']},
  {id:'claude_code',name:'Claude Code',audiences:['coding']},
  {id:'codex',name:'Codex',audiences:['coding','mathematics']},
  {id:'cursor',name:'Cursor',audiences:['coding']},
  {id:'github_copilot',name:'GitHub Copilot',audiences:['coding']},
  {id:'sillytavern',name:'SillyTavern',audiences:['tavern','creative']},
  {id:'lobehub',name:'LobeHub',audiences:['general','creative','enterprise']},
  {id:'continue',name:'Continue',audiences:['coding']},
  {id:'zcode',name:'Zcode',audiences:['coding']},
  {id:'deepseek_harness',name:'DeepSeek Harness',audiences:['coding','general']},
  {id:'kiro',name:'Kiro',audiences:['coding']},
  {id:'antigravity',name:'Antigravity',audiences:['coding']},
  {id:'pi',name:'Pi',audiences:['coding']},
  {id:'comfyui',name:'ComfyUI',audiences:['creative']},
  {id:'microsoft_copilot',name:'Microsoft Copilot',audiences:['general','enterprise']},
]);
export const PROXY_POLICIES = Object.freeze({
  off:{name:'宽松接入',block:0,friction:0,cost_kc:0,description:'不主动识别共享订阅池，用户接入最容易。'},
  balanced:{name:'识别共享与转售',block:.65,friction:.015,cost_kc:4,description:'识别多数违规反代，少量正常会话会被要求重新验证。'},
  strict:{name:'严格绑定与限流',block:.94,friction:.07,cost_kc:10,description:'拦截更多共享池，同时损失部分正常使用与续费。'},
});
export const MODERATION_POLICIES = Object.freeze({
  basic:{name:'基础安全运营',residual:.5,cost_kc:0,description:'基础举报与事后处理；低对齐模型仍可能被滥用。'},
  balanced:{name:'主动监测与处置',residual:.2,cost_kc:6,description:'增加风险监测和人工复核，降低事件概率。'},
  strict:{name:'高风险请求复核',residual:.055,cost_kc:14,description:'高强度复核会增加成本，并降低少量创作体验。'},
});
