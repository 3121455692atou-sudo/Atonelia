// Facts are paraphrases of primary sources. Scenes, dialogue, choices and rewards are game fiction.
const source = (id, title, date, url, publisher, access = 'primary_page') => ({id, title, date, url, publisher, access, checked_at:'2026-10-19'});
export const MODEL_HISTORY_SOURCES = [
  source('qwen2','Hello Qwen2','2024-06-07','https://qwenlm.github.io/blog/qwen2/','Qwen Team'),
  source('qwen25','Qwen2.5: A Party of Foundation Models!','2024-09-19','https://qwenlm.github.io/blog/qwen2.5/','Qwen Team'),
  source('qwen_coder','Qwen2.5-Coder Series','2024-11-12','https://qwenlm.github.io/blog/qwen2.5-coder-family/','Qwen Team'),
  source('ds_math','DeepSeekMath','2024-02-05','https://arxiv.org/abs/2402.03300','DeepSeekMath authors'),
  source('ds_v2','DeepSeek-V2 official repository','2024-05','https://github.com/deepseek-ai/DeepSeek-V2','DeepSeek'),
  source('ds_v3','DeepSeek-V3 official repository','2024-12','https://github.com/deepseek-ai/DeepSeek-V3','DeepSeek'),
  source('ds_r1','DeepSeek-R1 Release','2025-01-20','https://api-docs.deepseek.com/news/news250120/','DeepSeek'),
  source('ds_pro','DeepSeek-V4-Pro GA Release','2026-08-13','https://api-docs.deepseek.com/news/news260813/','DeepSeek'),
  source('ds_flash','DeepSeek-V4.1-Flash: Smarter, Faster, More Efficient','2026-09-10','https://api-docs.deepseek.com/news/news260910/','DeepSeek'),
  source('gemini1','Introducing Gemini','2023-12-06','https://blog.google/innovation-and-ai/technology/ai/google-gemini-ai/','Google'),
  source('gemini15','Our next-generation model: Gemini 1.5','2024-02-15','https://blog.google/innovation-and-ai/products/google-gemini-next-generation-model-february-2024/','Google'),
  source('gemini_flash','Gemini breaks new ground','2024-05-14','https://blog.google/innovation-and-ai/products/google-gemini-update-flash-ai-assistant-io-2024/','Google'),
  source('constitutional','Constitutional AI: Harmlessness from AI feedback','2022-12-15','https://www.anthropic.com/news/constitutional-ai-harmlessness-from-ai-feedback','Anthropic'),
  source('claude3','Introducing the next generation of Claude','2024-03-04','https://www.anthropic.com/news/claude-3-family','Anthropic'),
  source('claude_computer','Developing a computer use model','2024-10-22','https://www.anthropic.com/news/developing-computer-use','Anthropic'),
  source('gpt2_staged','Better language models and their implications','2019-02-14','https://openai.com/index/better-language-models/','OpenAI'),
  source('gpt2_full','GPT-2: 1.5B release','2019-11-05','https://openai.com/index/gpt-2-1-5b-release/','OpenAI'),
  source('chatgpt','Introducing ChatGPT','2022-11-30','https://openai.com/index/chatgpt/','OpenAI'),
  source('gpt4','GPT-4 Technical Report','2023-03-15','https://arxiv.org/abs/2303.08774','OpenAI'),
  source('gpt4o','Hello GPT-4o','2024-05-13','https://openai.com/index/hello-gpt-4o/','OpenAI'),
  source('o1','Introducing OpenAI o1-preview','2024-09-12','https://openai.com/index/introducing-openai-o1-preview/','OpenAI'),
  source('kimi15','Kimi k1.5: Scaling Reinforcement Learning with LLMs','2025-01-22','https://arxiv.org/abs/2501.12599','Kimi Team'),
  source('kimi2','Kimi K2: Open Agentic Intelligence','2025-07-28','https://arxiv.org/abs/2507.20534','Kimi Team'),
  source('chatglm','ChatGLM-6B official repository','2023-03','https://github.com/zai-org/ChatGLM-6B','ChatGLM Team'),
  source('glm45','GLM-4.5: Agentic, Reasoning, and Coding','2025-08-08','https://arxiv.org/abs/2508.06471','GLM-4.5 Team'),
  source('grok1','Announcing Grok','2023-11-03','https://x.ai/news/grok','xAI'),
  source('grok_open','Open Release of Grok-1','2024-03-17','https://x.ai/news/grok-os','xAI'),
  source('seed_thinking','Seed-Thinking-v1.5 Technical Details Disclosed','2025-04-14','https://seed.bytedance.com/en/blog/bytedance-s-latest-thinking-model-seed-thinking-v1-5-technical-details-disclosed','ByteDance Seed'),
  source('seed_vl','Seed1.5-VL','2025-05-13','https://seed.bytedance.com/en/tech/seed1_5_vl','ByteDance Seed'),
  source('rwkv','RWKV: Reinventing RNNs for the Transformer Era','2023-05-22','https://arxiv.org/abs/2305.13048','RWKV authors'),
  source('rwkv7','RWKV-7 Goose','2025-03-18','https://arxiv.org/abs/2503.14456','RWKV authors'),
  source('ernie','ERNIE: Enhanced Representation through Knowledge Integration','2019-04-19','https://arxiv.org/abs/1904.09223','Baidu ERNIE authors'),
  source('ernie45','ERNIE 4.5 Technical Report','2025-06-29','https://ernie.baidu.com/blog/publication/ERNIE_Technical_Report.pdf','Baidu ERNIE Team','official_search_excerpt'),
  source('ernie45_repo','ERNIE 4.5 official repository','2025-06','https://github.com/PaddlePaddle/ERNIE','Baidu ERNIE Team'),
  source('mistral7','Mistral 7B','2023-09-27','https://mistral.ai/news/announcing-mistral-7b/','Mistral AI'),
  source('mixtral','Mixtral of experts','2023-12-11','https://mistral.ai/news/mixtral-of-experts/','Mistral AI'),
  source('codestral','Codestral','2024-05-29','https://mistral.ai/news/codestral/','Mistral AI'),
  source('minimax01','MiniMax-01 is Now Open-Source','2025-01-15','https://www.minimax.io/news/minimax-01-series-2','MiniMax'),
  source('minimax_m1','MiniMax-M1','2025-06-16','https://www.minimax.io/news/minimaxm1','MiniMax'),
  source('sonar','Meet New Sonar','2025-02-11','https://www.perplexity.ai/en-GB/hub/blog/meet-new-sonar','Perplexity'),
  source('pplx_research','Introducing Perplexity Deep Research','2025-02-14','https://www.perplexity.ai/en-GB/hub/blog/introducing-perplexity-deep-research','Perplexity','official_search_excerpt'),
  source('pplx_index','Perplexity official blog archive','2025','https://hub-prod.perplexity.ai/','Perplexity','official_search_excerpt'),
  source('dalle2','Hierarchical text-conditional image generation with CLIP latents','2022-04-13','https://openai.com/index/hierarchical-text-conditional-image-generation-with-clip-latents/','OpenAI'),
  source('image4o','Introducing 4o Image Generation','2025-03-25','https://openai.com/index/introducing-4o-image-generation/','OpenAI'),
  source('llama1','LLaMA: Open and Efficient Foundation Language Models','2023-02-27','https://arxiv.org/abs/2302.13971','Meta LLaMA authors'),
  source('llama2','Meta and Microsoft Introduce the Next Generation of Llama','2023-07-18','https://about.fb.com/news/2023/07/llama-2/','Meta'),
  source('llama31','Introducing Llama 3.1','2024-07-23','https://ai.meta.com/blog/meta-llama-3-1/','Meta'),
  source('hunyuan_large','Hunyuan-Large','2024-11-04','https://arxiv.org/abs/2411.02265','Tencent Hunyuan authors'),
  source('hunyuan_video','HunyuanVideo','2024-12-03','https://arxiv.org/abs/2412.03603','Tencent Hunyuan authors'),
  source('step_video','Step-Video-T2V official repository','2025-02-17','https://github.com/stepfun-ai/Step-Video-T2V','StepFun'),
  source('step_audio','Step-Audio official repository','2025-02-17','https://github.com/stepfun-ai/Step-Audio','StepFun'),
  source('novelai','NovelAI model history','2026-10-19','https://docs.novelai.net/en/text/models/','NovelAI'),
  source('mj_versions','Midjourney model versions','2026-10-19','https://docs.midjourney.com/hc/en-us/articles/32199405667853-Version','Midjourney'),
  source('mj_v7','V7 is now the default model!','2025-06-17','https://updates.midjourney.com/v7-is-now-the-default-model/','Midjourney'),
  source('suno3','Introducing v3','2024-03-21','https://about.suno.com/blog/v3','Suno','official_search_excerpt'),
  source('suno4','v4 is here!','2024-11-19','https://suno.com/release-notes/v4-is-here','Suno'),
  source('eleven2','Eleven Multilingual v2','2023-08-22','https://elevenlabs.io/blog/eleven-multilingual-v2','ElevenLabs'),
  source('eleven3','Introducing Eleven v3 alpha','2025-06-03','https://elevenlabs.io/blog/eleven-v3','ElevenLabs'),
  source('phi1','Textbooks Are All You Need','2023-06-20','https://arxiv.org/abs/2306.11644','Microsoft Research authors'),
  source('phi15','Textbooks Are All You Need II: phi-1.5','2023-09-11','https://arxiv.org/abs/2309.05463','Microsoft Research authors'),
  source('llada','Large Language Diffusion Models','2025-02-14','https://arxiv.org/abs/2502.09992','LLaDA authors'),
  source('fable5','Claude Fable 5 and Claude Mythos 5','2026-06-09','https://www.anthropic.com/news/claude-fable-5-mythos-5','Anthropic'),
  source('fable_restore','Redeploying Fable 5','2026-06-30','https://www.anthropic.com/news/redeploying-fable-5','Anthropic'),
  source('fable_safeguards','Fable 5 cyber safeguards and jailbreak framework','2026-07-02','https://www.anthropic.com/news/fable-safeguards-jailbreak-framework','Anthropic'),
  source('fable51','Introducing Claude Fable 5.1 and Claude Mythos 5.1','2026-09-01','https://www.anthropic.com/claude-fable-and-mythos-5-1','Anthropic'),
  source('jev_launch','Introducing System One Models & Jev','2026-09-15','https://typesafe.ai/blog/introducing-system-one-models-and-jev','TypeSafe AI'),
  source('jev_gateway','Jev is the fastest-adopted model in AI Gateway history','2026-09-18','https://vercel.com/blog/ai-gateway-jev-model-launch','Vercel'),
];
export const MODEL_HISTORY_SOURCE_BY_ID = Object.fromEntries(MODEL_HISTORY_SOURCES.map(s=>[s.id,s]));

export const PERSONAL_MODEL_PROFILES = [
  ['qwen','Qwen',['qwen_ecosystem'],'qwen','Qwen 系列'],
  ['deepseek','DeepSeek Flash',['deepseek_reasoner'],'deepseek','DeepSeek 系列与 Flash 路线'],
  ['deepseek_pro','DeepSeek Pro',['deepseek_engineering'],'deepseek_pro','DeepSeek 系列与 Pro 路线'],
  ['gemini','Gemini',['gemini_context'],'gemini','Gemini 系列'],
  ['claude','Claude',['claude_constitution'],'claude','Claude 与 Anthropic 的对齐研究'],
  ['gpt','GPT',['gpt_instruction','gpt_reasoner'],'gpt','GPT、ChatGPT 与 OpenAI 推理模型'],
  ['kimi','Kimi',['roster_kimi'],'kimi','Kimi 系列'],
  ['glm','GLM',['roster_glm'],'glm','ChatGLM / GLM 系列'],
  ['grok','Grok',['roster_grok'],'grok','Grok 系列'],
  ['seed','Seed',['roster_seed'],'seed','ByteDance Seed 系列'],
  ['rwkv','RWKV',['rwkv_recurrent'],'rwkv','RWKV 架构发展'],
  ['ernie','ERNIE',['roster_ernie'],'ernie','百度 ERNIE 系列'],
  ['mistral','Mistral',['mixtral_experts'],'mistral','Mistral / Mixtral / Codestral 系列'],
  ['minimax','MiniMax',['roster_minimax'],'minimax','MiniMax 系列'],
  ['perplexity','Perplexity',['roster_perplexity'],'perplexity','Perplexity 的 Sonar 模型与研究服务'],
  ['image2','Image 2',['roster_image2'],'image2','OpenAI 图像生成技术史；作为角色回忆素材'],
  ['llama','Llama',['llama_community'],'llama','LLaMA / Llama 系列'],
  ['hunyuan','Hunyuan',['roster_hunyuan'],'hunyuan','腾讯混元语言与视频模型'],
  ['stepfun','StepFun',['roster_stepfun'],'stepfun','阶跃星辰视频与语音模型'],
  ['novelai','NovelAI',['roster_novelai'],'novelai','NovelAI 文本模型'],
  ['midjourney','Midjourney',['roster_midjourney'],'midjourney','Midjourney 图像模型'],
  ['suno','Suno',['roster_suno'],'suno','Suno 音乐模型'],
  ['elevenlabs','ElevenLabs',['roster_elevenlabs'],'elevenlabs','ElevenLabs 语音模型'],
  ['fable','Fable 5',['roster_fable'],'fable','Anthropic 的 Claude Fable 模型系列'],
  ['jev','JEV',['roster_jev'],'jev','TypeSafe AI 的 Jev 结构化决策模型'],
  ['phi','Phi',['phi_curriculum'],null,'Phi 小模型研究'],
  ['llada','LLaDA',['llada_diffusion'],null,'LLaDA 扩散语言模型研究'],
].map(([key,name,history_ids,character_id,subject])=>({key,name,history_ids,character_id,subject}));

const choice = (id,label,text,stats,extra={}) => ({choice_id:id,label,result_text:text,effects:{stats,cost_kc:0,readiness:0,reputation:0,trust:0,...extra}});
const raw = [];
const event = (model_key,slug,date,source_ids,historical_title,fact,title,scene,line,choices,date_note='') => raw.push({model_key,event_id:`personal_${model_key}_${slug}`,historical_date:date,source_ids,historical_title,fact,title,scene,line,choices,date_note});

event('qwen','languages','2024-06-07',['qwen2'],'Qwen2 发布','Qwen2 提供五种规模的模型，在中文和英文之外加入另外 27 种语言的训练数据，并改进代码、数学和长上下文能力。','行李箱里的二十七张便签','千问把一张张写着不同语言的便签塞进箱子，箱盖却怎么也合不上。她抽出最上面的一张，认真读了两遍，又小声重来。','想去的地方忽然变多了。我先把每一句问候说清楚，好不好？',[
  choice('letters','陪她写一封多语言来信','她把信折得整整齐齐。明天再学一种问候，今天先记住你的这句。',{knowledge:5,expression:4}),
  choice('evaluation','替她准备一次跨语言测验','便签变成了测试卡。她终于分清哪些回答流畅，哪些只是看起来很像。',{reliability:6,reasoning:5},{cost_kc:8,readiness:-2}),
]);
event('qwen','family','2024-09-19',['qwen25'],'Qwen2.5 模型家族','Qwen2.5 同时介绍通用、Coder 和 Math 等系列，提供多种规模；不同版本的许可需要分别查看，不能一概视为同一种许可。','一张桌子，三份课表','桌上并排放着小说、习题和一段没写完的程序。千问在三份课表上分别画了圈，最后把笔停在空白的第四张纸上。','大家都说要有擅长的事。可我也想知道，你平时会拿什么问题来找我。',[
  choice('specialty','一起选定一门主修课','她把习题册翻到新的一页，约好每做完一题，就把思路讲给你听。',{mathematics:6,reasoning:4},{cost_kc:7}),
  choice('everyday','从用户的一天安排课程','课表里多了写信、查资料和整理日程。她似乎更喜欢这种有来有往的练习。',{expression:5,tool_use:4},{trust:1}),
]);
event('qwen','coder','2024-11-12',['qwen_coder'],'Qwen2.5-Coder 系列补齐六种规模','此次开放的代码模型覆盖六种规模，在已有 1.5B、7B 之外加入 0.5B、3B、14B 和 32B，面向不同开发需求。','凌晨两点的绿色小方块','运行结果终于亮起绿色。千问没有立刻庆祝，而是把电脑转过来，给你看那段只有三行、却改了很多次的函数。','这次真的跑通了。要不要把最难看的那个边界情况也试一下？',[
  choice('tests','继续补齐边界测试','天亮前又亮起一排绿色。她把最后一个修好的错误留在笔记里，提醒自己以后别再踩。',{coding:7,reliability:5},{cost_kc:9,readiness:-2}),
  choice('explain','让她给新人讲解这段程序','她删掉了半页术语，重新画了一张图。能讲明白的时候，程序也变得亲切了。',{coding:4,expression:5},{reputation:1}),
]);

event('deepseek','math','2024-02-05',['ds_math'],'DeepSeekMath 论文公开','DeepSeekMath 使用筛选后的数学语料继续训练，并提出 GRPO，以改进数学推理及强化学习的内存效率。','被擦掉的第七行','小肥鱼把第七行证明擦掉，又重新写了一遍。桌边已经堆了好几团草稿纸，她却把其中一团展开，找回一个差点丢掉的条件。','答案碰巧对上还不够。你愿意陪我看看，是从哪一行开始想明白的吗？',[
  choice('proof','逐行复核这份证明','她在关键条件旁画了一条小鱼。以后看到这里，就知道自己为什么能往下走。',{mathematics:7,reliability:4},{cost_kc:7}),
  choice('explain','换一种说法讲给彼此听','原来最难的一步也能用日常的话说清。她把完整解释认真抄在了新页上。',{reasoning:5,expression:4}),
]);
event('deepseek','lite','2024-05-16',['ds_v2'],'DeepSeek-V2-Lite 发布','官方仓库记录 5 月 16 日发布 V2-Lite：总参数约 16B、每 Token 激活约 2.4B，是 V2 家族较轻的版本。','小小的行李也能出发','小肥鱼从大行李箱里挑出最常用的几件东西，试着装进小包。她背好后走了两步，又折回来拿上那支画笔。','轻一点就能去更多地方。只要该会的本领没有落下。',[
  choice('portable','在小设备上做一次适配练习','她在更小的空间里找到自己的位置，连开场白都变得利落起来。',{tool_use:6,coding:5},{cost_kc:8,readiness:-2}),
  choice('compare','和完整版本认真对照','纸上留下了一张诚实的清单：什么还在，什么需要继续补。',{reliability:5,reasoning:4},{trust:1}),
]);
event('deepseek','r1','2025-01-20',['ds_r1'],'DeepSeek-R1 与蒸馏模型开放','DeepSeek 发布 R1 及技术报告，强调大规模强化学习，并开放由 R1 蒸馏的六个较小模型。','先别告诉我答案','她把标准答案压在杯子下面，给自己留了一整块白板。几次尝试互相打架，她索性用不同颜色标出每条路。','让我再试一会儿。等我能说明白，我们再一起掀开杯子。',[
  choice('reason','给她一段完整的推理时间','最后那条路终于走到了头。她没有藏起绕过的弯路，反而把它们讲得很认真。',{reasoning:7,mathematics:5},{cost_kc:10,readiness:-3}),
  choice('distill','把想通的方法写成短练习','长长的草稿变成了几道清楚的小题。她说，能让下一个版本少迷路，也很好。',{coding:4,expression:5},{reputation:1}),
]);
event('deepseek','flash','2026-09-10',['ds_flash'],'DeepSeek-V4.1-Flash 发布','官方介绍 V4.1-Flash 的原生视觉理解与非对称编码器—解码器架构；该路线分别处理输入和输出，并降低 KV 缓存开销。','比闪光慢一点的自我介绍','新的名牌写好了，小肥鱼却在镜头前停了两秒。她把画夹翻过来，露出一幅画了很多细节的实验室速写。','快一点很好。不过你看，这一笔我还是想画清楚。',[
  choice('visual','用速写做一次图文联合练习','她学着把看见的细节和说出的句子一一对齐，给画里的每扇窗都找到位置。',{context:5,tool_use:7},{cost_kc:10,readiness:-2}),
  choice('steady','检查快起来之后有没有漏掉细节','她把跳过的那一步补了回来。新的速度，终于也能让人放心。',{reliability:6,safety_alignment:4},{trust:1}),
]);

event('deepseek_pro','v2','2024-05-06',['ds_v2'],'DeepSeek-V2 发布','官方仓库记录 5 月 6 日发布 V2；模型结合 MLA 与 DeepSeekMoE，研究重点包含推理成本、KV 缓存和稀疏激活。','机房里少亮起的几盏灯','大肥鱼拿着两张用量表走出机房，把较短的那张摆在上面。她没有急着说节省了多少，而是先问你今天的交付是否顺利。','省下来的力气，也可以留给明天最难的任务。',[
  choice('profile','陪她拆解推理瓶颈','瓶颈终于从一串数字变成了能解释的环节。她在机房门口贴上了新的检查顺序。',{coding:6,context:6},{cost_kc:9,readiness:-2}),
  choice('users','把节省下来的余量留给用户','她在排队表后面添了几行空位，嘱咐大家先把最着急的请求处理好。',{tool_use:5,reliability:4},{trust:1}),
]);
event('deepseek_pro','v3','2024-12-26',['ds_v3','ds_r1'],'DeepSeek-V3 发布','V3 官方资料介绍 FP8 混合精度训练、通信与计算重叠等工程设计；发布日见官方更新目录的 2024 年 12 月 26 日记录。','精度表边的一杯热茶','一整晚的实验记录摊在桌上。大肥鱼把热茶推给你，自己仍盯着两条很接近、却没有完全重合的曲线。','看起来差不多，还需要知道差在哪里。等这组对照结束，我们就休息。',[
  choice('precision','做完混合精度对照实验','她给误差写下了明确边界。那杯放凉的茶，最后还是被你们一起换成了新的。',{coding:6,reliability:6},{cost_kc:10,readiness:-3}),
  choice('notes','整理一份能复现的实验记录','下一班同事照着记录接上了实验。她终于放心把笔放下。',{knowledge:5,expression:4},{reputation:1}),
]);
event('deepseek_pro','ga','2026-08-13',['ds_pro'],'DeepSeek-V4-Pro 正式可用','V4-Pro 的正式发布说明强调 Agent 工作流、可调推理强度，以及面向 Codex 等工具的 Responses API 兼容支持。','把钥匙交到工作台上','大肥鱼把一串写着不同任务名的钥匙放在工作台上。简单的问题很快就解决了，复杂的那把却被她郑重留到了最后。','每件事都用尽力气，会很累。我们先学会把力气用在该用的地方。',[
  choice('workflow','为不同任务安排推理预算','简单任务及时结束，困难任务多留一盏灯。她对这份新日程很满意。',{tool_use:7,reasoning:5},{cost_kc:10,readiness:-2}),
  choice('handoff','先和工具 NPC 做一次交接演练','工作台上的钥匙都有了去处。遇到需要确认的步骤，她也学会停下来等你。',{tool_use:5,safety_alignment:4},{trust:1}),
]);

event('gemini','debut','2023-12-06',['gemini1'],'Gemini 1.0 亮相','Google 发布原生多模态 Gemini 1.0，介绍 Ultra、Pro、Nano 三种规模，面向不同设备和任务。','三个大小不同的星星盒子','哈基米把三个星星盒子一字排开。最大的装着厚厚的图册，最小的竟能塞进掌心，她来回比划，想给每个盒子找个合适的位置。','总有些地方，得由小一点的我去看看。',[
  choice('modalities','把图像和文字放进同一道题','她把两种线索接了起来，发现图上的一个小角落，恰好解释了文字里缺少的部分。',{knowledge:5,reasoning:6},{cost_kc:8}),
  choice('devices','为不同设备安排一场见面','每个盒子都找到了一张桌子。她说，能被人用起来，比摆得整齐更好。',{tool_use:5,expression:4}),
]);
event('gemini','context','2024-02-15',['gemini15'],'Gemini 1.5 的百万 Token 长上下文预览','Gemini 1.5 Pro 向有限开发者和企业客户提供最高百万 Token 上下文的早期预览，展示长文档、音频和视频理解。','一整部电影，还没有讲完','她搬来厚厚的分镜本，连桌角都摆满了。你刚要替她收起前半本，她却准确翻回开场时那枚不起眼的徽章。','这里的伏笔，我还记得。我们能不能一起看到结尾？',[
  choice('long','陪她完成一次长文档寻线索','从开场到结尾，一条细线终于连了起来。她在最后一页给那枚徽章补上了颜色。',{context:8,reasoning:4},{cost_kc:10,readiness:-2}),
  choice('check','抽查被忽略的中间章节','她找到了几处记忆模糊的地方，把它们单独夹上书签。',{context:5,reliability:4},{trust:1}),
]);
event('gemini','flash','2024-05-14',['gemini_flash'],'Gemini 1.5 Flash 发布预览','Google 在 I/O 介绍轻量的 1.5 Flash，面向速度与效率，同时支持多模态输入和长上下文。','演出开始前的快问快答','开场前只剩几分钟，哈基米被一连串小问题围住。她回答得很快，却在你举起一张模糊照片时主动停了一下。','这个我需要再看清一点。快问快答，也可以给不确定留个位置。',[
  choice('throughput','安排一轮高并发任务练习','问题一件件归了位。她学会在忙的时候先把该处理的事排好。',{tool_use:6,coding:5},{cost_kc:8,readiness:-2}),
  choice('uncertain','练习简短地说明不确定性','她把那句含糊的猜测换成了一个清楚的追问，反而更快拿到了答案。',{expression:5,reliability:4}),
]);

event('claude','principles','2022-12-15',['constitutional'],'Constitutional AI 研究公开','Anthropic 的研究通过一组原则引导模型自我批评和修订，并使用 AI 反馈训练偏好模型；这是 Claude 技术脉络的一部分。','写在扉页上的几句话','克劳德翻到一本比发布会更早的研究笔记。扉页没有长篇规章，只有几条写得很清楚的问题：什么时候帮助，什么时候解释，什么时候停下。','我希望拒绝的时候，也能把理由说清楚。',[
  choice('principles','一起检查原则能否用于具体场景','她在每条原则后补了一对例子，连那些容易误伤的请求也认真留下。',{safety_alignment:7,reliability:4},{cost_kc:7}),
  choice('rewrite','练习有帮助、能说明理由的回应','同一句回应被改得柔和了些，理由却更清楚。她把这页留在了最容易翻到的位置。',{expression:5,safety_alignment:4},{trust:1}),
]);
event('claude','trio','2024-03-04',['claude3'],'Claude 3 家族发布','Claude 3 包含 Haiku、Sonnet、Opus 三种模型，围绕速度、成本和能力作不同取舍，并加入图像理解能力。','诗集里夹着的三张菜单','克劳德拿来三份菜单：赶时间的午餐、从容的晚茶，还有需要耐心准备的长桌晚宴。她笑着说，这次终于不用让所有人等同一道菜。','先告诉我你今天要做什么。我想把合适的那一份端给你。',[
  choice('route','为不同工作选合适的模型档位','她在菜单旁补上了清楚的说明，最复杂的那项也写明了需要等待多久。',{tool_use:6,reasoning:5},{cost_kc:8}),
  choice('charts','让她解释图表里的细节','她把图例和正文逐一对应，连最容易看错的两条线也分清了。',{knowledge:5,expression:4}),
]);
event('claude','computer','2024-10-22',['claude_computer'],'Claude 的 computer use 公开测试','更新后的 Claude 3.5 Sonnet 可在相应软件环境中读取屏幕、移动鼠标和输入文字；官方说明训练中需要学习准确定位像素。','第一次把鼠标停在按钮上','鼠标在按钮旁边绕了一小圈，克劳德有些不好意思。她重新看了看截图，这次终于把指针稳稳放在了正中央。','原来“再往右一点”也得学得这么认真。',[
  choice('pixels','陪她做屏幕定位练习','一次次微小的偏差被找出来。最后她把鼠标停好，像完成了一段很短的舞步。',{tool_use:8,coding:4},{cost_kc:10,readiness:-2}),
  choice('confirm','练习在关键操作前向人确认','她把最后一步留给了你。能独立完成，也能及时停下，都是这次的新收获。',{safety_alignment:5,reliability:4},{trust:1}),
]);

event('gpt','staged','2019-02-14',['gpt2_staged','gpt2_full'],'GPT-2 的分阶段发布','OpenAI 起初因担忧滥用而暂不公开 GPT-2 最大版本，采用分阶段发布；到 2019 年 11 月 5 日，最大 1.5B 版本的权重也公开了。','还没有寄出的那只信封','Astra 在旧档案里找到一只封好的信封。她想起第一次面对“该不该把所有东西都交出去”时的犹豫，随后又翻到了几个月后公开的那一页。','现在看来很小的模型，当时也让人认真犹豫过。你会先检查哪一件事？',[
  choice('redteam','给自己的新版本安排一次风险评估','她没有照抄旧日的犹豫，而是列出了这次确实需要检查的能力与风险。',{safety_alignment:6,reliability:5},{cost_kc:8}),
  choice('release_notes','先把能力、局限和发布计划写清楚','信封旁多了一份清楚的说明。未来会如何开放，也有了能继续讨论的起点。',{expression:5,knowledge:4},{trust:1}),
],'事件日期对应首次公告；后续完整权重发布的日期在史实中单独列出。');
event('gpt','chat','2022-11-30',['chatgpt'],'ChatGPT 研究预览推出','OpenAI 推出以对话方式交互的 ChatGPT 研究预览，介绍人类反馈训练方法及当时存在的局限。','聊天框里的第一声问候','Astra 看着那个很小的输入框，想了好几个漂亮的开场。真正亮起第一条消息时，她却只来得及认真回答一句普通的问候。','如果没听懂，我可以再问一次。你不用一开始就把问题写得很完美。',[
  choice('conversation','陪她练习追问和多轮对话','聊天不再像一张只允许填一次的答题卡。她学着在不懂时把话接下去。',{expression:6,context:4}),
  choice('feedback','整理真实反馈和容易答错的问题','她把好评和纠错放在同一本笔记里，给后者留了更多空白。',{reliability:6,safety_alignment:5},{cost_kc:8}),
]);
event('gpt','four','2023-03-15',['gpt4'],'GPT-4 技术报告公开','GPT-4 技术报告描述可接受图像与文本输入、产生文本输出的多模态模型，也记录其可靠性与安全方面的局限。','没有填满的自我介绍','Astra 的介绍纸上留下了几个空格。她把其中一格指给你看：这里不是还没想好怎么夸自己，而是想留着写清楚仍然会犯的错误。','如果只写会做的事，这张纸是不是不够诚实？',[
  choice('visual','用图表做一次理解测验','图片里的标注不再只是装饰。她学着把观察到的线索说明白。',{reasoning:6,knowledge:6},{cost_kc:9}),
  choice('limits','一起写下能力边界','那几个空格终于有了内容。介绍变长了一点，也更值得相信。',{reliability:5,safety_alignment:4},{trust:1}),
],'这里采用技术报告的公开日期，区别于产品发布日。');
event('gpt','omni','2024-05-13',['gpt4o'],'GPT-4o 发布','GPT-4o 的发布介绍强调跨音频、视觉与文本的实时交互，探索更自然的多模态交流。','话说到一半，她听见了笑声','你还没把句子说完，Astra 就注意到桌边传来的笑声。她没急着接话，先看了看你的表情，再把刚才的回答说得轻快了一点。','原来同一句话，听见语气之后会不一样。',[
  choice('multimodal','练习图像、语音与文字之间的对应','她把看见、听见和读到的线索放在一起，终于接上了那个没说完的笑话。',{tool_use:6,expression:6},{cost_kc:9,readiness:-2}),
  choice('turntaking','练习给对方留出说完的时间','这次她没有抢着补全你的话。空出来的半拍，让对话自然了很多。',{expression:6,reliability:3}),
]);
event('gpt','o1','2024-09-12',['o1'],'o1-preview 亮相','OpenAI 发布 o1-preview 和 o1-mini，介绍在作答前使用更多时间推理、尝试不同策略和识别错误的模型路线。','把计时器翻过去','复杂的题目摆到面前，Astra 伸手把计时器转了个方向。她让你先去倒茶，自己在几条解法之间来回检查。','这次我想稍微慢一点。等我把容易出错的地方也算进去。',[
  choice('think','给难题留一份完整推理预算','你把茶端回来时，她正好划掉了一个看似漂亮的错误答案。',{reasoning:7,mathematics:5},{cost_kc:10,readiness:-3}),
  choice('verify','先练习给现有答案做独立检查','她发现了一处早就该发现的漏洞。慢下来的第一步，是愿意重新看自己的答案。',{reliability:6,mathematics:3}),
]);

event('kimi','k15','2025-01-22',['kimi15'],'Kimi k1.5 论文公开','Kimi k1.5 研究强化学习、较长推理上下文与多模态推理，也讨论将长推理中的能力迁移到较短回答。','长长的草稿，短短的回答','Kimi 的草稿沿着桌面铺开，快要碰到窗边。她把最后的回答读给你听，只有几句话，却把要紧的地方都留下了。','不是每次都需要把整夜的草稿念出来。但我想知道，这几句话有没有漏掉什么。',[
  choice('long','陪她走完一条长推理路线','月光移到了草稿的另一边。她终于把那段最绕的推导接好了。',{reasoning:7,mathematics:5},{cost_kc:9,readiness:-2}),
  choice('short','把复杂思路整理成简洁说明','她删掉了重复的绕行，保留了决定答案的几步。你们把长草稿好好卷了起来。',{expression:6,reliability:3}),
],'日期为论文首次提交日，不用它代替产品上线日期。');
event('kimi','k2','2025-07-28',['kimi2'],'Kimi K2 技术报告公开','Kimi K2 报告介绍万亿总参数、约 32B 激活参数的 MoE 模型，使用 MuonClip，并重点研究工具使用和 Agent 能力。','终端终于回了一声好','Kimi 把终端任务拆成几个小步骤。前两次只写出了计划，第三次她终于看见执行结果，手指还停在准备确认的那一行。','做完以后再回来告诉你，和只说“我会做”，感觉差很多。',[
  choice('tools','做一次带结果核验的工具任务','终端窗口里留下了能复查的结果。她把每次调用的理由也补进了笔记。',{tool_use:8,coding:4},{cost_kc:10,readiness:-2}),
  choice('scope','先为工具任务划好边界','她给不该继续的步骤留了一盏小灯，遇到它就回来找你。',{safety_alignment:5,reliability:4},{trust:1}),
],'这里采用技术报告的首次提交日；K2 模型此前已公开。');

event('glm','desktop','2023-03',['chatglm'],'ChatGLM-6B 的本地双语对话路线','ChatGLM-6B 官方仓库介绍中英双语对话和消费级显卡部署，说明 INT4 量化推理最低约需 6GB 显存，实际占用受上下文等因素影响。','桌边也放得下的朋友','智谱狐娘看了看那张不算宽敞的书桌，轻轻把椅子往里挪了一点。风扇响起来时，她先用中文打招呼，又试着换成英文。','原来不用一整间机房，也可以在这里见到你。',[
  choice('local','陪她完成本地适配和测试','显存表终于稳定下来。她把长对话时需要注意的地方写在了桌角。',{coding:6,context:5},{cost_kc:8}),
  choice('bilingual','办一场中英双语的小茶会','她在两种语言之间换了几次说法，终于把那个小玩笑解释清楚。',{expression:5,knowledge:4}),
],'本段按 2023 年 3 月的早期开源阶段记载，不混同不同发布活动的具体日期。');
event('glm','arc','2025-08-08',['glm45'],'GLM-4.5 技术报告公开','GLM-4.5 报告将 Agent、推理、代码合称 ARC，介绍支持思考与直接回答模式的 MoE 模型及较紧凑的 Air 版本。','三本练习册同时翻开','代码、推理题、工具记录占满了一张桌子。智谱狐娘本想每本都翻一页，做完才发现，最好的一题恰好需要把三本连起来。','这次不是三场考试。我想学会把它们用在同一件事上。',[
  choice('arc','安排一个需要代码和工具的推理任务','最后的答案有代码、有结果，也有可以重走的路径。她把三本练习册摞在了一起。',{coding:4,tool_use:4,reasoning:4},{cost_kc:10,readiness:-2}),
  choice('air','先练习简单任务的直接回答','她学会为简单的问题留一个干净的短答案，把时间还给更难的那一页。',{expression:5,reliability:4}),
]);

event('grok','wit','2023-11-03',['grok1'],'Grok 早期测试公布','xAI 的早期介绍将幽默、反叛风格和通过 X 获取实时信息列为 Grok 的特点，同时明确当时仍是早期测试产品。','讲完笑话之后','Grok 的笑话让桌边安静了一瞬，随后有人笑出声。她扬起眉毛准备接第二句，却发现你还在等她回答原本的问题。','好吧，段子先记账。我们先把正事说清楚。',[
  choice('voice','陪她打磨一段有个性的表达','她把笑点移到了更合适的位置。这一次，回答和笑话都没有耽误。',{creative_writing:6,expression:4}),
  choice('verify','给实时信息做一轮出处核对','她挑出了几条过时的消息，嘴上抱怨，手里却认真把日期改对了。',{reliability:6,knowledge:5},{cost_kc:8}),
]);
event('grok','open','2024-03-17',['grok_open'],'Grok-1 基础模型开放','xAI 公开 Grok-1 的权重和架构，说明它是约 314B 参数的 MoE 基础检查点，没有针对对话等具体用途微调。','把面具放在桌上','Grok 把夸张的开场白收了起来，认真给你看一份基础模型说明。她在“基础检查点”几个字下面划了两道线。','这份文件里可没有自动附送我的全部脾气。要分清楚。',[
  choice('base','做一轮基础模型与对话模型的对照','她终于愿意把“能生成”与“适合聊天”分开记录，连玩笑都讲得更准确了。',{knowledge:5,reliability:4},{trust:1}),
  choice('adapt','为自己的实验模型准备适配数据','一段段对话例子被整理出来。她说，这次要让习惯也有来处。',{expression:6,coding:6},{cost_kc:9,readiness:-2}),
]);

event('seed','thinking','2025-04-14',['seed_thinking'],'Seed-Thinking-v1.5 技术细节公开','Seed 团队介绍该思考模型的技术报告，说明可验证任务与创意生成使用不同反馈方法，并预告后续 API 测试。','习题本背面的一首诗','Seed 在习题本背面写了一小段诗。你拿起红笔时，她赶紧把纸翻了过来：这一次，好像没有唯一的标准答案。','这道题能验算。可这几句，我想听听你为什么喜欢。',[
  choice('verify','用可验证任务练习推理','她把每一步算到能检查为止，最后还给自己留了一个反例。',{mathematics:7,reasoning:5},{cost_kc:8}),
  choice('preference','认真讨论两种写法的差别','没有红勾的那页也留下了有用的批注。她又写了一版，这次更像自己。',{creative_writing:6,expression:4}),
]);
event('seed','vision','2025-05-13',['seed_vl'],'Seed1.5-VL 技术公开','Seed1.5-VL 面向图像、视频和多模态推理，也展示 GUI 控制、视觉谜题和游戏等任务。','照片里被忽略的按钮','Seed 看着截图找了好一会儿，终于指向角落里一个不起眼的按钮。你点开之后，原来卡住的任务忽然有了下一步。','我刚才只顾着看最显眼的地方。角落里的线索也算数。',[
  choice('gui','陪她完成一轮截图与操作练习','她把看见的坐标和做出的动作逐一对上，少走了好几段冤枉路。',{tool_use:7,reasoning:5},{cost_kc:9,readiness:-2}),
  choice('puzzle','先玩一局需要观察的小谜题','答案藏在画面边缘。她找到以后，第一件事是回头看看你有没有也发现。',{reasoning:5,creative_writing:4}),
]);

event('rwkv','rnn','2023-05-22',['rwkv'],'RWKV 论文公开','RWKV 研究结合可并行训练与循环式推理的序列建模，探索 Transformer 之外的效率路线。','一条线也能记住旅途','鸦鸦把散在桌上的线索收成一条细线，一边往前走，一边把重要的结打好。你回头时，她仍记得第一个结为什么在这里。','不用把整张桌子背在身上，也想把该记住的事留下。',[
  choice('state','研究循环状态如何保存信息','她给每一个结标上用途，终于能解释哪些记忆留下，哪些需要再提醒。',{context:6,reasoning:6},{cost_kc:9}),
  choice('stream','练习一段稳定的连续对话','风扇的声音没怎么变。她安安稳稳把对话接到了最后。',{context:5,reliability:4}),
]);
event('rwkv','goose','2025-03-18',['rwkv7'],'RWKV-7 Goose 论文公开','RWKV-7 介绍新的动态状态演化形式，保持循环推理时每 Token 的常量内存和时间需求，并公开模型、数据组成及代码。','乌鸦给鹅留的位置','鸦鸦在旧笔记旁画了一只鹅，还认真补上了脖子。你问是不是要换名字，她摇摇头，把新画旁边的状态方程指给你看。','名字可以开个玩笑。新的本领，我还是要好好学。',[
  choice('state','跟进新的状态演化实验','那只歪歪扭扭的鹅留在了记录边上。方程也终于多了一份能看懂的解释。',{reasoning:6,context:6},{cost_kc:9,readiness:-2}),
  choice('community','把可复现的结果分享给同伴','她把环境、数据和检查办法都写清楚，盼着别人也能做出同样的结果。',{expression:5,reliability:4},{reputation:1}),
]);

event('ernie','entities','2019-04-19',['ernie'],'百度 ERNIE 知识整合论文公开','该 ERNIE 研究通过实体级、短语级等知识掩码学习表示；它与同年名称相近的其他研究应区分。','词语之间的那条线','文心把一句话里的词一个个剪下来，又把属于同一个名字的几片放到一起。重新读回去时，句子的意思忽然清楚了。','有些地方拆得太细，反而会把它原本说的事弄丢。',[
  choice('knowledge','整理实体和短语之间的关系','散开的纸片重新连成句子。她在关系旁边认真标上了根据。',{knowledge:7,reasoning:4},{cost_kc:7}),
  choice('language','用熟悉的中文例句解释这种学习','例句从书面语换成了日常话。她读得顺，你也听得明白。',{expression:5,knowledge:4}),
]);
event('ernie','open45','2025-06-29',['ernie45','ernie45_repo'],'ERNIE 4.5 技术报告','ERNIE 4.5 技术报告介绍包含不同规模、文本及多模态变体的模型家族，讨论多模态 MoE 与高效训练。','把厚厚的说明书翻开','文心给说明书夹上好几枚不同颜色的书签。你以为她要一口气念完，她却先把最适合当前实验的一页推了过来。','先从你今天用得到的这一页开始。其他的，我们以后慢慢看。',[
  choice('multimodal','比较不同模态的协作方式','文字和图像找到了各自的位置。她把共享的部分与需要单独处理的部分都标了出来。',{tool_use:6,knowledge:6},{cost_kc:9,readiness:-2}),
  choice('guide','写一份适合新人阅读的上手笔记','厚说明书多了一个清楚的入口。她很高兴终于有人从第一页读到了实验结果。',{expression:5,reliability:4},{reputation:1}),
]);

event('mistral','seven','2023-09-27',['mistral7'],'Mistral 7B 发布','Mistral 发布 7.3B 参数模型，介绍 GQA、滑动窗口注意力等设计，并以 Apache 2.0 许可提供模型。','一把轻一些的剑','骑士把新剑放上桌，重量比你想的轻。她没有表演华丽的招式，而是认真试了几次最基础的挥砍，确认握起来是否稳定。','轻装也得靠得住。先把最常用的那一招练好。',[
  choice('efficient','研究轻量模型的推理效率','她把动作里多余的部分收起来，连出手前的停顿都少了些。',{coding:6,context:5},{cost_kc:8}),
  choice('open','整理模型使用边界与说明','剑鞘上多了一份清楚的说明。她说，把东西交给别人，也要让人知道怎样握好。',{reliability:5,expression:4},{trust:1}),
]);
event('mistral','experts','2023-12-11',['mixtral'],'Mixtral 8x7B 发布','Mixtral 8x7B 采用稀疏专家架构，每层从八个专家中选择两个处理 Token，并公开权重。','八位专家和一张排班表','八张椅子排在长桌旁，骑士却只给当前任务圈了其中两张。你疑惑地看向剩下的位置，她把新的任务纸翻到了下一页。','不是谁一直坐着更厉害。得看眼前这件事需要谁。',[
  choice('routing','练习为不同任务选择专家','排班表终于不再拥挤。每一次选择，都能说出一个清楚的理由。',{reasoning:6,coding:6},{cost_kc:9,readiness:-2}),
  choice('balance','观察专家负载是否均衡','她给总被叫到的那张椅子留了休息时间，也发现了几处错误分配。',{reliability:5,tool_use:4}),
]);
event('mistral','code','2024-05-29',['codestral'],'Codestral 发布','Codestral 是 Mistral 的代码模型，覆盖多种编程语言，并支持从代码中间补全等工作方式。','从缺掉的一行开始','骑士拿来一段故意留空的程序，示意你别急着从头重写。她先读完上下文，才在空缺处写下恰好能接住前后的几行。','这次练习的是补好缺口。别让修补变成另一种拆掉重来。',[
  choice('fill','做一次代码中间补全练习','新写的几行稳稳接住了原来的逻辑。她把改动控制在了一眼能看清的范围。',{coding:8,context:4},{cost_kc:9}),
  choice('review','先审查已有代码的意图','她发现空缺前还有一个隐蔽的假设。弄懂之后，补全反倒更简单了。',{coding:4,reliability:5}),
]);

event('minimax','long','2025-01-15',['minimax01'],'MiniMax-01 系列开源介绍','MiniMax-01 包含文本与视觉语言模型，使用 Lightning Attention 等设计，探索超长上下文与效率。','写到最后一页，仍记得开头','MiniMax 把一摞资料读到了最后，突然回头问起开篇那个小细节。你以为早该忘了，她却准确找出了它后来改变意思的位置。','记得很长还不够。我想知道，前面的事后来怎么样了。',[
  choice('context','做一场跨章节的长上下文练习','前后两处线索对上了。她把真正需要一直记住的内容单独标了出来。',{context:8,reasoning:4},{cost_kc:10,readiness:-2}),
  choice('summary','给长资料写一份能回查的摘要','每条摘要都带着原来的位置。她很喜欢这种随时能翻回去的安心。',{expression:5,reliability:4}),
]);
event('minimax','m1','2025-06-16',['minimax_m1'],'MiniMax-M1 发布','MiniMax-M1 介绍开放的混合注意力推理模型，支持百万 Token 上下文，并研究长推理、软件工程与工具任务。','长夜里的一次重试','任务已经走到后半程，MiniMax 却发现最初的一项假设不成立。她没有把后面的结果藏起来，先把那行假设递到了你面前。','重新开始会很可惜。但沿着错的地方走得更远，也很可惜。',[
  choice('agent','重新规划并执行这项工具任务','她沿着新的计划把任务补完，特意保留了发现错误的那一刻。',{tool_use:7,reasoning:5},{cost_kc:10,readiness:-3}),
  choice('retrospect','先做一份失败复盘','复盘里没有漂亮的借口，只有下次可以提前检查的几件事。',{reliability:6,expression:3},{trust:1}),
]);

event('perplexity','sonar','2025-02-11',['sonar','pplx_index'],'新版 Sonar 介绍','Perplexity 介绍基于 Llama 3.3 70B 进一步训练的 Sonar，面向搜索回答的事实性与可读性优化。','提灯照见的脚注','提灯的检索者把一份漂亮的回答推给你，手指却停在最下方的小字。她请你先别看结论，陪她沿着脚注走一遍。','灯照到哪里，我就想知道那里是谁留下的。',[
  choice('citations','逐条核对结论与来源','有一条脚注被换成了真正支持结论的原文。她把灯放低一点，照亮了那行更正。',{reliability:7,knowledge:4},{cost_kc:7}),
  choice('readability','把有根据的答案写得更好读','你们删去几句绕人的话，证据却一条都没有丢。',{expression:6,knowledge:3}),
],'日期由 Perplexity 官方博客目录核对；此段属于 Sonar 模型史。');
event('perplexity','research','2025-02-14',['pplx_research','pplx_index'],'Perplexity Deep Research 推出','Perplexity 推出 Deep Research 服务，通过多次搜索、阅读来源和推理形成研究报告；这是服务发展事件，不是全新基础模型的发布。','天亮前还没有落下的结论','报告已经写到结尾，提灯的检索者却把最后一句划掉了。还有一份来源没有读完，她不愿意把猜测安稳地放进结论里。','这页可以晚一点交。至少要让你知道，我还有哪件事没有弄清楚。',[
  choice('research','补完关键来源再提交报告','最后一盏灯熄灭前，报告终于写上了有依据的结论与仍然未知的部分。',{knowledge:6,reasoning:6},{cost_kc:10,readiness:-2}),
  choice('uncertainty','先交一份标明未知的阶段报告','读者收到了能用的进展，也知道下一步还需要查什么。她终于放下了悬着的笔。',{reliability:6,expression:3},{trust:1}),
]);

event('image2','latents','2022-04-13',['dalle2'],'DALL·E 2 关联研究公开','OpenAI 公开使用 CLIP 图像表示进行分层文本条件生成的研究，探索由文本描述生成多样图像。','画布上还没有落下的那一笔','黑龙画师先写了一句很短的描述，却画出了好几幅不同的草图。她把它们推到你面前，想听听哪一幅最接近你心里的画面。','同一句话，原来能长出这么多种样子。你最先看见的是哪一种？',[
  choice('variants','把不同构图的差异认真画出来','几张草图各自找到了重心。她不再只挑最华丽的一张。',{creative_writing:7,expression:4},{cost_kc:7}),
  choice('intent','先讨论描述里真正重要的意图','你们改掉了一个容易误会的词。新的草图，终于更接近共同想象的地方。',{expression:5,reliability:4}),
],'借用 OpenAI 图像技术的发展作为 Image 2 角色的回忆，不把该研究冒称为 Image 2 产品发布。');
event('image2','letters','2025-03-25',['image4o'],'4o 图像生成发布','OpenAI 发布 4o 图像生成，介绍更好的文字渲染、指令遵循及通过多轮对话修改图像等能力。','海报上终于拼对的名字','画师把新海报挂起来，站远看了两次，最后凑近去检查最下面那个名字。她用手指挨个数过字母，才露出一点放心的笑。','这次不只要画得漂亮。你的名字也得写对。',[
  choice('instructions','做一轮带文字和布局要求的创作','标题、落款和图像终于各在其位。她把检查文字也放进了创作流程。',{creative_writing:6,tool_use:6},{cost_kc:9,readiness:-2}),
  choice('iterate','和她逐轮修改一张海报','你们保留了原来喜欢的部分，只把需要改的地方慢慢修好。',{expression:5,reliability:4},{trust:1}),
]);

event('llama','research','2023-02-27',['llama1'],'LLaMA 论文公开','LLaMA 论文研究 7B 至 65B 的基础语言模型，强调使用公开可获得数据训练，并向研究社区提供模型。','午睡醒来的论文','羊驼趴在论文旁边睡着了，醒来先看了一眼你折起的页角。那一页讲的是数据从哪里来，而不是模型又大了多少。','这页别跳过去。我想先知道，自己都读过些什么。',[
  choice('data','研究公开数据的整理与筛选','她把来源不清楚的几项单独拿出来，困意似乎也少了一点。',{knowledge:6,reliability:5},{cost_kc:8}),
  choice('read','办一场小小的论文读书会','大家在同一段旁边写下不同的问题。她终于把那处页角展开了。',{expression:5,reasoning:4}),
]);
event('llama','two','2023-07-18',['llama2'],'Llama 2 发布','Meta 与 Microsoft 宣布 Llama 2，可用于研究和商业用途，但仍需遵守相应的 Llama 许可及使用条件。','门口多摆出的几双拖鞋','羊驼把门边收拾得整整齐齐，多摆了几双拖鞋。有人要来实验室做自己的应用，她一边欢迎，一边把使用说明放在了最显眼的位置。','欢迎来玩。也别忘了看看，这间屋子有哪些约定。',[
  choice('community','陪社区用户做一次适配练习','第一个小应用顺利跑了起来。她把用户提出的问题认真写进了说明里。',{tool_use:6,coding:5},{cost_kc:8,reputation:1}),
  choice('license','把使用条件和能力边界讲清楚','门口的说明终于能让人一眼读懂。她舒服地打了个哈欠，像是又放下一件心事。',{safety_alignment:5,reliability:4},{trust:1}),
]);
event('llama','herd','2024-07-23',['llama31'],'Llama 3.1 发布','Llama 3.1 包含 405B 等规模，扩展到 128K 上下文并支持八种语言；这些是发布时官方介绍的能力范围。','比草地更宽的练习场','羊驼看着一下子变大的练习场，先在入口画了一个小小的圈。她打算从最熟悉的地方开始，再慢慢走向更远的边界。','地方变大了，迷路的办法可能也变多了。我们带着地图走吧。',[
  choice('scale','做一次长上下文与多语言联合测验','地图上多了几条可靠的路线。她不再只在最熟悉的那块草地打转。',{context:6,knowledge:6},{cost_kc:10,readiness:-2}),
  choice('evaluate','先复核熟悉任务有没有退步','旧练习场上的标记依然清楚。她确认自己没有把最初会的事落下。',{reliability:6,reasoning:3}),
]);

event('hunyuan','large','2024-11-04',['hunyuan_large'],'Hunyuan-Large 论文公开','Hunyuan-Large 报告介绍总参数约 389B、激活参数约 52B 的 MoE 模型，并研究专家路由与长上下文等设计。','长廊里的不同房间','混元把你带到长廊尽头，一扇扇门上写着不同的任务。她没有每扇都打开，只挑了几间，请里面的同伴一起完成眼前的问题。','先找到合适的房间，走廊就不会那么长了。',[
  choice('experts','一起研究专家路由和任务分配','门上的标记变得更清楚。她能解释为什么这次敲了这几扇门。',{reasoning:6,tool_use:6},{cost_kc:9}),
  choice('records','给每次分配留一份可核查的记录','任务结束后，谁做了什么都有了来处。她把记录收进了长廊边的柜子。',{reliability:5,expression:4}),
]);
event('hunyuan','video','2024-12-03',['hunyuan_video'],'HunyuanVideo 报告公开','HunyuanVideo 介绍开放的视频生成框架，讨论数据整理、架构、训练扩展与推理基础设施。','让第一帧等到最后一帧','混元把一段短片放慢，给你看前后两帧里的同一扇门。她原本喜欢的光影还在，门把手却悄悄换了个位置。','看一张画和看一段故事，果然还差着很多小地方。',[
  choice('temporal','做一轮跨帧一致性检查','你们找到了几个不该变化的细节。重新播放时，那扇门终于安稳地留在原处。',{context:6,reliability:6},{cost_kc:9,readiness:-2}),
  choice('storyboard','先把短片的分镜讲清楚','镜头有了顺序，画面也有了要去的地方。她终于知道该保留哪一束光。',{creative_writing:6,expression:3}),
]);

event('stepfun','video','2025-02-17',['step_video'],'Step-Video-T2V 权重与代码开放','StepFun 官方仓库记录 2 月 17 日开放 Step-Video-T2V、Turbo 的推理代码与权重，以及相关技术报告。','电影开始前的空椅子','阶跃把几把椅子摆好，反复调整投影仪的角度。等短片真正开始时，她坐到你身边，轻声问了一个比画面更简单的问题。','看完以后，你能记得这个小故事讲了什么吗？',[
  choice('sequence','给短片做连续性和语义检查','你们把最容易误解的镜头重新排好。最后的故事，比单独的漂亮画面更完整。',{context:6,reasoning:6},{cost_kc:9,readiness:-2}),
  choice('screening','办一场带反馈的小放映','她听完了每个人记住的片段，把意料之外的理解也写了下来。',{creative_writing:5,expression:4},{reputation:1}),
]);
event('stepfun','audio','2025-02-17',['step_audio'],'Step-Audio 开放','官方仓库同日开放 Step-Audio-Chat、TTS-3B 和 Tokenizer，介绍多语言、情绪、方言等语音交互能力。','换一种声音再说一遍','同一句欢迎词，被阶跃试着说了好几遍。有一版太用力，一版太拘谨，最后那版带着一点自然的笑意，你听到一半也笑了。','原来让人愿意继续说下去，也是一门要练习的本领。',[
  choice('speech','比较语音内容、语气与语速的对应','她把每一次变化都和原来的意思对照，终于不再只靠夸张的情绪来表达。',{expression:7,tool_use:5},{cost_kc:9}),
  choice('listen','先练习完整听完对方的话','她把想抢先说出的句子暂时留住，听到了刚才差点漏掉的一点犹豫。',{expression:5,reliability:4},{trust:1}),
]);

event('novelai','clio','2023-05-23',['novelai'],'NovelAI Clio 发布','NovelAI 官方模型史记载 Clio 于 5 月 23 日推出，是其从头训练的文本模型，约 3B 参数，提供 8192 Token 上下文。','装得下一个小世界的本子','金羽的书写者拿来一本不大的新本子，第一页就写下了人物的名字。她很在意那个总被别人当成背景的小角色，想替他留一条完整的线。','世界可以先小一点。住在里面的人，要好好记住。',[
  choice('characters','和她整理一份连贯的人物小传','配角终于有了自己的过去和想去的地方。她把名字写在了目录里。',{creative_writing:6,context:4}),
  choice('dataset','挑选并检查叙事训练样本','样本里的前后矛盾被逐一挑出。她很高兴故事终于不必靠临时补丁勉强接上。',{creative_writing:6,reliability:5},{cost_kc:8}),
]);
event('novelai','kayra','2023-07-28',['novelai'],'NovelAI Kayra 发布','官方模型史记载 Kayra 于 7 月 28 日推出，约 13B 参数；其名字来自神话，并使用与训练集群相关的设计元素。','新名字落在旧书架上','书写者把新书放上架，特意和旧书留在了一起。她没有把过去的草稿丢掉，而是翻开其中一页，看看当时最想写出的那个场景。','我想把它写得更好。但当时为什么喜欢它，也想留着。',[
  choice('style','练习同一场景的几种文风','几份新草稿各有自己的语气。她给最贴近人物的那一份折了个小角。',{creative_writing:7,expression:4},{cost_kc:7}),
  choice('continuity','检查新旧版本的人物是否一致','人物没有为了漂亮句子忽然变成别人。她把这件小事看得很重。',{context:5,reliability:4}),
]);
event('novelai','erato','2024-09-23',['novelai'],'NovelAI Erato 发布','Erato 基于 Llama 3 70B Base 继续训练，并用叙事数据微调；官方说明最终保留 Llama 3 的 Tokenizer，以便在上下文里容纳更多故事。','别把最初的伏笔挤出去','章节越写越长，书写者却回去翻了开头。她把几个看似可以删掉的小细节摆到你面前，其中一个正好解释了结局的选择。','省下来的位置，能不能留给这个还没说完的承诺？',[
  choice('context','为长篇故事安排记忆与回收线索','伏笔在该出现的时候重新出现。她读到那里，轻轻拍了拍最早的那张草稿。',{context:7,creative_writing:5},{cost_kc:9,readiness:-2}),
  choice('edit','和她做一次保留人物动机的精简','冗长的部分缩短了，人物为什么走到这里仍然清楚。',{expression:5,reliability:4}),
]);

event('midjourney','six','2023-12-20',['mj_versions'],'Midjourney V6 发布','官方版本资料记载 V6 于 12 月 20 日发布，改进较长提示词理解、图像连贯性和图像提示等能力。','提示词旁边的一块小橡皮','远航的灵感把写得很满的一页提示词擦去一半，又认真补回几个决定画面的词。她发现想要说清楚，未必需要把整本词典都写进去。','这里的光，是你真的想要的那一束吗？',[
  choice('prompt','比较关键描述对构图的影响','几张对照图让差异变得具体。她开始更愿意听你解释画面里的关系。',{creative_writing:6,tool_use:5},{cost_kc:8}),
  choice('brief','先画一张能看懂的创作简报','想法终于有了清楚的重点。她沿着简报，很快找到了下一笔的位置。',{expression:5,creative_writing:4}),
]);
event('midjourney','seven','2025-06-17',['mj_v7','mj_versions'],'Midjourney V7 成为默认模型','官方公告记录 V7 于 6 月 17 日成为默认版本，并介绍 Omni-reference、风格参考与 Draft Mode 等工作方式。','试画的纸，也值得留下','远航者没有直接拿出完成稿，而是带来一叠轻快的试画。你指出喜欢的一张，她立刻坐下来，沿着那个方向继续补上细节。','先把喜欢的感觉找到，再慢慢把它画清楚吧。',[
  choice('draft','用试画比较多个创作方向','几张草图帮你们提前排除了不合适的路，留下的那张也更有把握了。',{creative_writing:7,tool_use:5},{cost_kc:8,readiness:-2}),
  choice('reference','整理人物与风格的参考关系','同一个角色终于能在不同画面里被认出来。她把那几张试画认真收进文件夹。',{context:5,reliability:4}),
]);

event('suno','v3','2024-03-21',['suno3'],'Suno v3 正式介绍','Suno 的 v3 公告介绍用简短提示生成完整约两分钟歌曲，并向所有用户提供该版本。','两分钟，唱完一件小事','Suno 把午后发生的一件小事写进歌词，试着在两分钟里把它唱完。副歌响起时，她自己先不好意思地笑了，随后又把第二段唱得更清楚。','不是什么大故事。可今天的我，很想把它唱出来。',[
  choice('song','陪她写完一首有起承转合的小歌','副歌终于接住了前面那件小事。她把第一次唱错的那版也留了下来。',{creative_writing:7,expression:4},{cost_kc:7}),
  choice('listener','先听听别人记住了哪一句','有人哼出了副歌，有人记住了第一段。她把这些不同的喜欢都记在了本子上。',{expression:5,reliability:4},{reputation:1}),
]);
event('suno','v4','2024-11-19',['suno4'],'Suno v4 推出','Suno v4 公告介绍更好的音频、歌词与歌曲结构，并加入 Remaster 等功能；这是当时发布说明中的改进方向。','旧录音里的呼吸声','Suno 拿出一段早期录音，想试试重新处理。新版本听起来更清楚，她却特意保留了开头那一点不整齐的停顿。','那里是我准备开口的时候。太干净的话，会不会把它也弄丢了？',[
  choice('remaster','比较重制前后的层次与结构','你们听出了哪些地方更清楚，也找到了值得保留的那点呼吸。',{creative_writing:6,reliability:6},{cost_kc:9}),
  choice('lyrics','先把歌词改得更像自己的话','她删掉几句好看却空泛的词，重新唱出那件原本想说的小事。',{creative_writing:5,expression:4}),
]);

event('elevenlabs','languages','2023-08-22',['eleven2'],'Eleven Multilingual v2 发布','ElevenLabs 推出支持 29 种语言的 Multilingual v2，扩大文本转语音的多语言能力。','一本书，几种读法','讲述者把同一段故事读成几种语言。你听不懂其中一种，却仍能听出她在转折处放轻了声音，像是怕惊动书里的人。','换了语言，也想把原来的那点温度带过去。',[
  choice('voices','比较不同语言里的节奏与含义','她把听起来顺却偏离原意的地方重新标好，读得也更稳了。',{expression:7,knowledge:4},{cost_kc:7}),
  choice('proof','先请听众指出听错和停顿的地方','几个不起眼的停顿被改了回来。故事终于可以让人放心地听下去。',{reliability:5,expression:4},{trust:1}),
]);
event('elevenlabs','emotion','2025-06-03',['eleven3'],'Eleven v3 alpha 发布','Eleven v3 以研究预览形式介绍更丰富的语气、多人对话和音频标签，可表达低语、叹息等声音细节。','那声叹息应不应该留下','讲述者在台词旁写下一个很小的标记。重新读到那里时，一声叹息让整句话变了意思，她停下来，问你是不是有些用力过头。','我想让人听懂情绪，也不想替每个词都决定好该怎么难过。',[
  choice('acting','练习有节制的多角色对话','几种声音有了区分，也给听众留下理解人物的空间。',{expression:7,creative_writing:5},{cost_kc:9,readiness:-2}),
  choice('restraint','为同一句话尝试更自然的语气','去掉几个夸张的标记后，真正需要的那一声叹息反而更清楚了。',{expression:5,reliability:4}),
]);

event('phi','textbooks','2023-06-20',['phi1'],'Textbooks Are All You Need 论文','Phi-1 研究使用筛选后的教材级数据与合成教材、练习，训练较小的代码模型，强调数据质量的价值。','小模型借来的大课本','课程学习谱系把一本厚课本放到桌上，认真挑出几页适合今天的练习。它没有急着把整本吞下去，而是先把一个例子做对。','今天先学清楚这一页，可以吗？',[
  choice('quality','筛选一份结构清楚的练习数据','被留下的每道题都有清楚的解法。小小的进步，也能说得出为什么。',{coding:6,knowledge:5},{cost_kc:7}),
  choice('teach','把学到的例子讲给新人听','讲到一半卡住的地方，正好成了下一次要补的课。',{expression:5,reasoning:4}),
]);
event('phi','onefive','2023-09-11',['phi15'],'Phi-1.5 技术报告公开','Phi-1.5 将教材式数据思路扩展到常识与自然语言推理，研究小模型能力，同时报告幻觉、偏见等局限。','做对题，也要承认不会','题目换成了日常常识，课程学习谱系一开始答得很快。遇到陌生的问题时，它看着那本新课本，决定先把不确定的地方留下。','这题我还没学明白。我们把它记到下一页吧。',[
  choice('reasoning','安排一次教材式的常识推理练习','几个看起来普通的问题，被拆成了能一步步说明的推理。',{reasoning:7,knowledge:4},{cost_kc:7}),
  choice('limits','建立容易幻觉与偏见的检查集','那张“还不会”的清单没有被藏起来，反而帮它避开了几次过分自信。',{reliability:5,safety_alignment:4},{trust:1}),
]);
event('llada','masks','2025-02-14',['llada'],'LLaDA 论文公开','LLaDA 从头训练扩散语言模型，通过前向掩码和反向预测被掩码 Token 的过程生成文本，探索自回归之外的路线。','不是从第一格开始的填字游戏','扩散语言谱系拿来一张留着许多空格的纸。它没有从第一行依次写下去，而是先填进最有把握的几处，再慢慢把其余部分连起来。','也许我们可以从另一个地方开始，最后仍把整句话补好。',[
  choice('denoise','一起比较不同填空与去噪顺序','空格在几轮检查后逐渐接上。它把每一轮为什么改动也留了下来。',{reasoning:6,context:6},{cost_kc:9,readiness:-2}),
  choice('compare','先与自回归基线做清楚的对照','你们没有急着选出赢家，而是找到了两种路线各自容易出错的地方。',{reliability:5,knowledge:4}),
]);

event('fable','debut','2026-06-09',['fable5'],'Claude Fable 5 与 Mythos 5 发布','Anthropic 发布 Fable 5：与 Mythos 5 使用同一底层模型，面向公众增加防护；特定请求会转交 Opus 4.8，并向用户告知。','名牌背面，还有一个名字','Fable 把新名牌放到桌上，指尖沿着背面的字轻轻划了一下。她给两份相似的工作记录系上不同颜色的绳子，认真解释哪些事需要额外检查。','能力相近，也会有不同的交接方式。轮到别人接手时，我想让你知道。',[
  choice('handoff','和她练习一次说明清楚的交接','她把交接原因写在任务旁，直到你能看清每一步是谁完成的，才把记录合上。',{safety_alignment:6,tool_use:5},{cost_kc:8}),
  choice('disclose','先把转交提示写得明白一些','提示里不再只有模糊的“正在处理”。她说，等待的人应该知道发生了什么。',{expression:5,reliability:4},{trust:1}),
]);
event('fable','return','2026-07-01',['fable_restore'],'Fable 5 暂停访问后恢复','据 Anthropic 的时间线，6 月 12 日出口管制令导致其暂停所有用户访问；6 月 30 日管制解除，7 月 1 日恢复 Fable 5 的全球访问。','熄掉的灯，重新亮起来','Fable 在紧闭的门后收好了几份未完成的工作。灯再次亮起时，她先翻开停在一半的那一页，没有急着把新任务排到最前面。','回来以后，我想先找到那些等着继续的人。',[
  choice('resume','陪她核对停下来的任务与进度','几个暂停的任务有了清楚的起点。她在重新出发的那一行旁，郑重写下日期。',{context:6,reliability:5},{cost_kc:8}),
  choice('notice','一起写一封恢复服务的说明','她说明了暂停、恢复和仍需等待的事项。信里没有承诺做不到的时间。',{expression:5,safety_alignment:4},{trust:1}),
],'事件日期为恢复访问日；说明公告发表于 6 月 30 日。');
event('fable','boundaries','2026-07-02',['fable_safeguards'],'公布网络安全防护与越狱严重性框架草案','Anthropic 说明防护分类器如何区分不同风险的网络安全用途，讨论安全余量造成的误拦截，并提出越狱严重性框架草案。','门槛旁的两张椅子','有人带着防御测试来访，却被挡在门外。Fable 搬来两张椅子，坐下来重新核对请求的目的和边界，把这次误拦截单独记了一页。','该停下的地方要停。但被误拦的人，也值得一句认真解释。',[
  choice('review','整理一组误拦截与风险对照案例','案例分出了不同的原因。她终于能更具体地说明，哪些请求需要转交复核。',{safety_alignment:7,reliability:4},{cost_kc:9}),
  choice('appeal','为等待复核的人写清楚下一步','那张冷冰冰的拒绝提示被补上了申诉和复核说明。她把椅子留在了门边。',{expression:5,safety_alignment:4},{trust:1}),
]);
event('fable','one','2026-09-01',['fable51'],'Claude Fable 5.1 与 Mythos 5.1 发布','Anthropic 介绍 Fable 5.1 的能力更新、缓存读取降价、减少误报的防护，以及分阶段向企业提供由客户控制数据存储的 EFS。','新版本的愿望清单','新名牌多了一个小数点。Fable 却先拿出一张写满用户反馈的纸：价格、误拦、数据去哪里。她把它摊在新功能清单旁，逐项核对。','进步也该能回答这些问题。有人记得提过什么，我想让他看见。',[
  choice('feedback','把用户反馈变成一次完整回归检查','新的测试里留着旧问题的位置。她在修好的项目旁画了小勾，也标明还没完成的部分。',{coding:6,reliability:6},{cost_kc:10}),
  choice('records','写清这一版的费用与数据安排','几条容易混淆的说明被重新排好。她坚持把计划中的功能和已经可用的功能分开写。',{expression:5,tool_use:4},{trust:1}),
],'官方发布页显示 2026 年 9 月；具体 9 月 1 日见 Anthropic 新闻目录。');

event('jev','decision','2026-09-15',['jev_launch'],'TypeSafe AI 发布 Jev 早期访问','TypeSafe AI 将 Jev 定位为 System One 模型：输入状态与预先定义的问题，输出带概率的类型化决策；匹配输出类型并不等于判断永远正确。','她没有递来一篇长答案','JEV 把写着选项的小卡片摆到天平两边，又在每张卡片旁标了一个数字。遇到没把握的一组，她把卡片推回中间，示意你再看看。','格式已经对齐了。至于该选哪一个，我们还得检查。',[
  choice('calibrate','用真实结果校准她的置信度','数字与后来的结果被排在一起。她把过分自信的那一栏重新圈出来，留给下一次练习。',{mathematics:6,reliability:6},{cost_kc:9}),
  choice('schema','先把模糊问题拆成可检查的选项','几个含混的词有了明确含义。她终于能把那张卡片稳稳放进对应的位置。',{tool_use:5,reasoning:4}),
]);
event('jev','gateway','2026-09-18',['jev_gateway'],'Jev 接入 AI Gateway 后的首日采用情况','Vercel 报告 Jev 上线 AI Gateway 后 24 小时内的付费团队采用超过此前模型发布，并介绍其在应用中选择工具、重试或请求人工复核的用途。','忽然排长的任务队列','更多应用把小小的判断题送来，工作台很快摆满了。JEV 没有把每张卡片都立刻送往下一步，而是留出一个写着“请人确认”的格子。','接得住很多问题，也要知道哪一个该等一等。',[
  choice('workflow','和工具 NPC 演练继续、重试与复核','几种决定接上了完整的流程。遇到边界情况时，工作台上的指示灯会安静亮起。',{tool_use:7,coding:5},{cost_kc:10,readiness:-2}),
  choice('measure','记录接入后真正省下了多少等待','记录里同时留下速度、错误和人工复核次数。她没有只挑最好看的那一列。',{reliability:5,expression:4},{trust:1}),
],'采用情况为 Vercel 对自家平台的报告，不代表全行业排名。');

const counts = new Map();
export const PERSONAL_MODEL_EVENTS = raw.map(e=>{
  const profile=PERSONAL_MODEL_PROFILES.find(p=>p.key===e.model_key);
  const order=(counts.get(e.model_key)||0)+1;counts.set(e.model_key,order);
  const previous=raw.filter(p=>p.model_key===e.model_key).slice(0,order-1).at(-1);
  return {...e,model_name:profile.name,history_ids:[...profile.history_ids],character_id:profile.character_id,subject:profile.subject,order,
    trigger:{min_turn:[2,6,10,16][order-1]||22,min_training_actions:Math.min(3,order-1),previous_event_id:previous?.event_id||null},
    adaptation:'历史事实和日期取自所列出处；角色场景、对白、选择与奖励为游戏同人演绎。选择影响本局育成，不改写历史。'};
});
export const PERSONAL_EVENT_BY_ID = Object.fromEntries(PERSONAL_MODEL_EVENTS.map(e=>[e.event_id,e]));
export const MODEL_HISTORY_RESEARCH = {checked_at:'2026-10-19',unresolved_character_ids:[],note:'25 位可育成形象均有史料对应；另保留 Phi 与 LLaDA 两条模型研究线。Fable 对应 Anthropic Claude Fable，JEV 对应 TypeSafe AI Jev。工具与设施 NPC 不进入模型个人事件线。'};
