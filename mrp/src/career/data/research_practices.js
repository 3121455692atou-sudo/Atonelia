// 内部研究工程：年表只表示方法可探索，不代表每家公司已经建成生产流程。
// 不给全局能力/效率 buff，不改既有卡牌门槛；收益必须经数据订单与正常训练兑现。
const rows = [
  ['retrieval_grounding','llm','检索证据与引用课程','2023-09',14,['long_ctx','func_call'],'把检索片段、引用和无答案拒答组织成可训练的证据链。',
    {id:'rp_grounding',kind:'post',name:'证据引用与拒答标注包',cost:1.8e6,months:1,rights:'licensed',posts:{knowledge:0.8,agent:0.4},desc:'知识与工具使用的双方向标注；不能代替推理环境，也不会直接提高模型能力。'}],
  ['verifier_curriculum','llm','可验证合成课程','2024-06',22,['textbook','grpo'],'为自家模型建立答案校验、筛选和难度分层管线，用推理算力换定向预训练语料。',
    {id:'rp_verifier_synth',kind:'pre',name:'自验数学与代码课程',cost:0,months:0,rights:'licensed',tokens:0.06,quality:2,gen:'synth',genTok:60,needRelease:true,mix:{math:0.6,code:0.4},desc:'一次性生成0.06T定向语料；借在线旗舰与推理卡，不能当场获得后训练分数，老师污染会传递。'}],
  ['repository_audit','llm','仓库许可证与依赖审计','2025-02',18,['func_call','long_ctx'],'按许可证、依赖图和项目边界组织代码，不把更多网页当成更多有效仓库经验。',
    {id:'rp_repository',kind:'pre',name:'审计后仓库语料',cost:1.6e6,months:2,rights:'licensed',tokens:0.16,quality:1.6,mix:{code:0.7,books:0.1,sci:0.2},desc:'付费、等待整理的代码主导配方；量小、用途窄，不能替代广域基础语料。'}],
  ['layout_constraints','image','布局约束与文字对照','2023-11',14,['recaption'],'把对象位置、数量和字形一起标注，优先解决提示词到画面约束的落差。',
    {id:'rp_layout',kind:'post',name:'布局与字形对照包',cost:1.2e6,months:1,rights:'licensed',posts:{caption:0.7,text:0.8},desc:'兼顾指令与文字；单方向补充少于专用包，适合两边都缺数据的项目。'}],
  ['identity_curriculum','image','跨图一致性课程','2025-09',20,['img_edit'],'围绕同一授权主体合成不同视角，筛掉身份漂移；课程仍需要自己的在线模型与推理卡。',
    {id:'rp_identity_synth',kind:'pre',name:'自有主体多视角课程',cost:0,months:0,rights:'licensed',tokens:0.08,quality:1.3,gen:'synth',genTok:80,needRelease:true,mix:{photo:0.8,art:0.2},desc:'一次性0.08T照片主导合成配方；省采购款但占推理卡，不增加架构上限。'}],
  ['licensed_palette','image','授权风格与构图归档','2024-04',16,['aesthetic_rl'],'把已授权作品按构图和风格分层，避免用一份照片图库包办全部美术方向。',
    {id:'rp_palette',kind:'pre',name:'授权风格配方库',cost:6e6,months:2,rights:'licensed',tokens:0.2,quality:1.3,mix:{art:0.7,photo:0.3},desc:'艺术主导、来源干净，但需要现金和两个月整理，不能直接变成成图能力。'}],
  ['phrase_hierarchy','music','乐句层级与曲式课程','2024-04',14,['lyric_align'],'把短句、段落、主副歌的关系与歌词断句一起组织，训练长曲结构而非只追音质。',
    {id:'rp_phrase',kind:'post',name:'曲式与歌词层级包',cost:1.5e6,months:2,rights:'licensed',posts:{catalog:0.8,lyrics:0.6},desc:'编曲与歌词双方向补充；交付慢，单向急需时不如普通专用包。'}],
  ['stem_curriculum','music','分轨重组与重建课程','2025-06',20,['stems'],'用自家模型重组人声与伴奏并做重建对照，为下一代准备更偏器乐的训练配方。',
    {id:'rp_stem_synth',kind:'pre',name:'自有分轨重建课程',cost:0,months:0,rights:'licensed',tokens:0.08,quality:1.15,gen:'synth',genTok:80,needRelease:true,mix:{instrumental:0.6,song:0.4},desc:'一次性0.08T器乐主导合成配方；占推理卡、质量有折损，不等于拿到商业曲库授权。'}],
  ['timbre_curation','music','音色授权与演奏归档','2023-10',16,['codec'],'按演奏授权、乐器和录音条件整理素材，建立能追溯的音色训练库。',
    {id:'rp_timbre',kind:'pre',name:'授权音色与演奏库',cost:8e6,months:2,rights:'licensed',tokens:0.12,quality:1.25,mix:{song:0.6,instrumental:0.4},desc:'量小但配方稳定；以采购款与整理期换干净来源，不赠送版权安全分。'}],
  ['phoneme_curriculum','speech','音素对齐与多语种课程','2023-10',14,['zero_shot'],'把音素、停顿和语言切换做成对齐课程，补多语种发音和录音棚韵律。',
    {id:'rp_phoneme',kind:'post',name:'音素与韵律对齐包',cost:1.3e6,months:1,rights:'licensed',posts:{multilingual:0.8,studio:0.6},desc:'多语种与自然度双方向补充；不会解锁未研究的语音架构。'}],
  ['dialogue_curriculum','speech','双工轮次与打断课程','2025-09',20,['s2s','audio_tags'],'让自己的在线语音模型生成轮次、停顿和打断样本，为下一代积累对话型语料。',
    {id:'rp_dialogue_synth',kind:'pre',name:'自有双工对话课程',cost:0,months:0,rights:'licensed',tokens:0.06,quality:1.2,gen:'synth',genTok:60,needRelease:true,mix:{conversational:0.8,multilingual:0.2},desc:'一次性0.06T对话主导合成配方；省采购款但借推理卡，不能直接提高实时产品销量。'}],
  ['consent_corpus','speech','声线授权与用途绑定','2024-03',16,['voice_wm'],'把每份声线授权和可用场景绑定，整理可追溯的多语种与对话录音。',
    {id:'rp_consent',kind:'pre',name:'用途可追溯语音库',cost:2e6,months:2,rights:'licensed',tokens:0.08,quality:1.25,mix:{multilingual:0.6,conversational:0.4},desc:'合法且定向，但量小、交付慢；仍要支付正常训练资源，不能用来绕过安全评测。'}],
];
export const RESEARCH_PRACTICES = rows.map(([id,mod,name,from,cost,prereq,desc,ds]) => ({id,mod,name,from,cost,internalPractice:true,desc,effects:{unlock:[ds.id]}}));
export const PRACTICE_PREREQ = Object.fromEntries(rows.map(([id,,,,,pre])=>[id,pre]));
export const PRACTICE_DATASETS = rows.map(([id,mod,,, ,,,ds])=>({...ds,mod,from:'2000-01',needTech:id}));
