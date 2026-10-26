// Research map: all nodes remain inspectable, while engine guards still control starts.
import * as E from '../../engine.js';
import { TECH_BY_ID, fmtDate } from '../../data/core.js';
import { dataLeadDays } from '../../data/supply.js';
import { esc, pct, usd } from '../fmt.js';
import { act, after as afterAct } from '../act.js';
import { getMp, toast } from '../state.js';
import { openPicker } from '../flow.js';
import { researchRecommendation } from '../advice_navigation.js';
import { layoutTree } from '../tree_layout.js';
import { bindTreeViewport } from '../tree_viewport.js';
import { JOBS } from '../../data/balance.js';
const LABEL={owned:'已掌握',running:'研究中',ready:'可开始',blocked:'待前置 / 槽位',future:'未来路线'};
const LV={secret:'需自研',proof:'产品已验证',paper:'论文已公开',open:'已开源'};
const FILTERS={all:'完整路线',ready:'可开始',pending:'尚未掌握',future:'未来路线',owned:'已掌握'};
const selection=(st={})=>({filter:FILTERS[st.techFilter]?st.techFilter:'all',group:E.RESEARCH_GROUPS[st.techGroup]?st.techGroup:'',search:String(st.techSearch||'').trim().toLowerCase()});
export function render(S,st={}) {
  const tree=E.researchTree(S), sel=selection(st), recommended=researchRecommendation(S), rec=tree.find(x=>x.t.id===recommended);
  const counts=Object.fromEntries(Object.keys(LABEL).map(k=>[k,tree.filter(x=>x.state===k).length]));
  const list=tree.filter(x=>(sel.filter==='all'||sel.filter==='pending'&&x.state!=='owned'||x.state===sel.filter)&&(!sel.group||x.group===sel.group)&&(!sel.search||`${x.t.name} ${x.t.desc} ${x.datasets.map(d=>d.name).join(' ')}`.toLowerCase().includes(sel.search)));
  const fx=E.knowFx(S), speed=E.researchSpeed(S), slots=E.researchSlots(S), automation=E.automationStateValid(S)?S.automation:null;
  const locked=st.readOnly||st.techPending, options=E.dataOptions(S);
  const dataRow=d=>{
    const o=options.find(x=>x.id===d.id), pending=S.orders.some(x=>x.ref===d.id), blocked=o&&!o.ok?o.reason:pending?'已有订单在路上':d.cost>S.cash?'现金不足':'';
    return `<li><b>${esc(d.name)}</b><span>${d.kind==='pre'?`${d.tokens}T · 质量 ${d.quality} · 一次性预训练配方`:esc(E.datasetPostLabels(S.mod,d.posts))+' · 各池上限 2.5'}</span><span>${d.gen?`不另收采购款；借自家在线模型和推理卡${o?.genDays!==undefined?Number.isFinite(o.genDays)?`，预计 ${o.genDays} 天`:'，当前显存/算力不足会排队':''}`:`采购 ${usd(d.cost)} · 整理 ${dataLeadDays(d)} 天`}</span><small>${esc(d.desc)}</small>${blocked?`<small class="warn">${esc(blocked)}</small>`:''}</li>`;
  };
  const card=x=>{
    const {t}=x, isRec=t.id===recommended, active=x.state==='running', owned=x.state==='owned';
    const prereq=x.prereqs.length?x.prereqs.map(p=>`<button class="chip" data-tech-jump="${p.id}">${p.owned?'✓':'需'} ${esc(p.name)}</button>`).join(''):'无前置';
    return `<article class="card tech-card tech-map-node ${isRec?'tech-recommended':''}" data-tech-detail="${t.id}" ${st.techSel===t.id?'data-tree-popover':'hidden'}><div class="card-head"><b>${esc(t.name)}</b><button class="btn btn--sm" data-tech-close data-tree-close aria-label="关闭技术详情">×</button><span class="pill ${x.check.ok?'ok':owned?'':'warn'}">${LABEL[x.state]}</span></div>
      ${isRec?'<strong class="tech-rec-label">顾问推荐 · 由你决定</strong>':''}<p class="tech-desc">${esc(t.desc)}</p>
      <p class="tech-prereqs"><b>前置</b> ${prereq}</p>
      <p class="tech-src">${t.internalPractice?'自研工程项目：行业先验方法可作参考，本团队需自行完成研发沉淀。':`${LV[x.st.level]}${x.st.src?` · ${esc(x.st.src.who)}（${fmtDate(x.st.src.date)}）`:''}`}${x.state==='future'?` 最早可探索：${fmtDate(x.earliest)}。`:''}</p>
      ${!owned&&!active&&!x.check.ok?`<p class="warn tech-lock">${esc(x.check.reason)}</p>`:''}
      <ul class="tech-effects">${x.effects.map(v=>`<li>${esc(v)}</li>`).join('')||'<li>基础方法；后续路线的起点。</li>'}</ul>
      ${x.datasets.length?`<ul class="tech-datasets">${x.datasets.map(dataRow).join('')}</ul>${owned?`<button class="btn btn--sm" data-tech-market ${locked?'disabled':''}>去数据市场选择这条配方</button>`:''}`:''}
      ${x.cards.length?`<details><summary>关联 ${x.cards.length} 张方法牌</summary><p class="muted">${x.cards.map(c=>esc(c.name)).join('、')}。研发完成后解锁对应卡牌能力。</p></details>`:''}
      ${x.next.length?`<p class="tech-next">后续：${x.next.map(n=>`<button class="chip" data-tech-jump="${n.id}">${esc(n.name)} →</button>`).join('')}</p>`:''}
      <div class="tech-foot">${owned?'<small>已掌握</small>':`<small>${active?'剩余约':'按当前速度约'} ${x.days} 天 · ${x.need} 人天${x.done>0?' · 已计入保留进度':''}<br>占 1 个研究槽，不另扣现金；团队仍照常发薪</small><button class="btn btn--sm ${x.check.ok?'btn--primary':''}" ${active?`data-tech-stop="${t.id}"`:`data-tech="${t.id}"`} ${locked||!active&&!x.check.ok?'disabled':''}>${active?'暂停（保留进度）':x.check.ok?'开始研究':'尚不能开始'}</button>`}</div>
    </article>`;
  };
  return `<div class="tech-page"><h2>研究 · 完整路线</h2><div class="card tech-overview"><b>本领域 ${tree.length} 项 · ${counts.owned} 已掌握 · ${counts.running} 研究中 · ${counts.ready} 可开始 · ${counts.blocked+counts.future} 待条件</b><p class="muted">涵盖当前赛道完整技术演进路径。点击节点可查看前置依赖、研发工期与技术收益。</p></div>
    ${rec?`<div class="card tech-recommendation"><b>顾问推荐：${esc(rec.t.name)}</b><p>${rec.state==='owned'?'已完成研发。':rec.state==='running'?'研发进行中。':'推荐研发课题，可点击开始或在技术树中挑选其他路线。'}</p><button class="btn btn--sm" data-tech-jump="${rec.t.id}">定位推荐项目</button></div>`:''}
    <div class="card"><div class="card-head"><b>研究槽 ${S.research.length}/${slots}</b><small>每槽 ${speed.toFixed(2)} 人天/天 · 团队 ${S.team} 人</small></div>
      <p class="muted">技术积累 ${Math.round(S.know)} · 研究 +${Math.round(fx.research*100)}% · 预训练效率 +${Math.round(fx.pretrain*100)}% · 炼炸风险 -${Math.round(fx.risk*100)}% · 后训练 +${Math.round(fx.post*100)}%。${S.distillDep>.05?` 蒸馏依赖 ${pct(S.distillDep)}。`:''}</p>
      ${S.research.map(r=>`<div class="lab-row"><b>${esc(TECH_BY_ID[r.id].name)}</b><small>剩余约 ${E.daysLeft(S,r)} 天</small><div class="progress"><i style="width:${Math.min(100,r.done/r.need*100)}%"></i></div><button class="btn btn--sm" data-tech-stop="${r.id}" ${locked?'disabled':''}>暂停</button></div>`).join('')||'<p class="muted">研究槽空着，选择路线后明确点「开始研究」。</p>'}
      <p class="muted">团队有重活（后训练、检修）时研究速度 ×${JOBS.RESEARCH.busy}，没有时 ×${JOBS.RESEARCH.free}（预训练不影响研究）。暂停研究可保留当前进度。</p>
      <p><b>自动选题：${automation?.modules.research.mode==='auto'?'开启':automation?'手动接管':'未启用'}</b></p>
      ${automation?.modules.research.mode==='auto'?`<button class="btn btn--sm" data-tech-manual ${locked?'disabled':''}>暂停自动选题，自己决定</button>`:'<button class="btn btn--sm" data-page="automation">查看托管设置</button>'}</div>
    <div class="tech-map-filters"><label>状态 <select data-tech-filter>${Object.entries(FILTERS).map(([k,v])=>`<option value="${k}" ${sel.filter===k?'selected':''}>${v}</option>`).join('')}</select></label><label>分支 <select data-tech-group><option value="">全部分支</option>${Object.entries(E.RESEARCH_GROUPS).filter(([k])=>tree.some(x=>x.group===k)).map(([k,v])=>`<option value="${k}" ${sel.group===k?'selected':''}>${v}</option>`).join('')}</select></label><label>查找 <input data-tech-search value="${esc(st.techSearch||'')}" maxlength="80" placeholder="名称、用途或配方（即时筛选）" /></label><small>显示 ${list.length}/${tree.length} 项</small></div>
    <div class="tech-tree-shell" data-tree-shell>${treeMap(tree,list,recommended,st)}
    <div class="tech-tree-details">${list.map(card).join('')}</div></div></div>`;
}
// Layout uses the whole domain so filters never shuffle the player's mental map.
const geometryCache=new Map();
export function researchGeometry(tree) {
  const signature=JSON.stringify(tree.map(x=>[x.t.id,x.group,x.prereqs.map(p=>p.id)]));
  if(!geometryCache.has(signature))geometryCache.set(signature,layoutTree(tree.map(x=>({id:x.t.id,group:x.group})),tree.flatMap(x=>x.prereqs.map(p=>({from:p.id,to:x.t.id}))),Object.entries(E.RESEARCH_GROUPS).map(([id,label])=>({id,label})),{width:170,height:100}));
  return geometryCache.get(signature);
}
function treeMap(tree,list,recommended,st) {
  const g=researchGeometry(tree), shown=new Set(list.map(x=>x.t.id));
  const edges=g.edges.filter(e=>shown.has(e.from)&&shown.has(e.to));
  return `<section class="tech-tree" aria-label="技术路线图">
    <div class="tech-tree-toolbar"><b>技术路线图</b><small>向下推进 · 实线为前置 · 拖动空白平移</small><div><button class="btn btn--sm" data-tree-zoom="out" aria-label="缩小研究树">−</button><button class="btn btn--sm" data-tree-zoom="reset" title="恢复原始大小"><span data-tree-scale>100%</span></button><button class="btn btn--sm" data-tree-zoom="in" aria-label="放大研究树">＋</button><button class="btn btn--sm" data-tree-zoom="fit">总览</button></div></div>
    <div class="tech-tree-viewport" data-tree-viewport tabindex="0" aria-label="研究树；可滚动、拖动和缩放"><div class="tech-tree-stage" data-tree-stage><div class="tech-tree-canvas" data-tree-canvas data-width="${g.width}" data-height="${g.height}" style="width:${g.width}px;height:${g.height}px">
      ${g.lanes.map(l=>`<div class="tech-tree-lane" style="left:${l.x}px;top:${l.y}px;width:${l.w}px;height:${l.h}px"><b>${esc(l.label)}</b></div>`).join('')}
      <svg class="tech-tree-links" width="${g.width}" height="${g.height}" aria-hidden="true"><defs><marker id="tech-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6" fill="none" stroke="currentColor" /></marker></defs>${edges.map(e=>`<path d="${e.d}" class="${st.techSel===e.from||st.techSel===e.to?'is-related':''}" marker-end="url(#tech-arrow)" />`).join('')}</svg>
      ${list.map(x=>{const r=g.rects.get(x.t.id);return `<button class="tech-tree-node is-${x.state}${x.t.id===recommended?' is-recommended':''}${st.techSel===x.t.id?' is-selected':''}" data-tech-node="${x.t.id}" data-tech-pick="${x.t.id}" ${st.techSel===x.t.id?'data-tree-selected':''} aria-expanded="${st.techSel===x.t.id}" style="left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px"><span class="tech-tree-state">${LABEL[x.state]}</span><b>${esc(x.t.name)}</b><small>${x.state==='owned'?'✓ 已掌握':`${x.days} 天 · ${x.need} 人天`}${x.t.id===recommended?' · ★ 推荐':''}</small></button>`;}).join('')}
    </div></div></div>${list.length?'':'<p class="muted">当前筛选没有项目；切回完整路线可查看全部。</p>'}
  </section>`;
}
// Keep a failed/pending remote request on this page, never fabricate local success.
function command(S,ctx,fn) {
  const {st={},guard,draw}=ctx;
  if(st.readOnly||st.techPending)return;
  if(!getMp())return guard(fn);
  let pending;try{pending=fn();}catch(e){toast(e.message);return;}
  st.techPending=true;draw?.();
  Promise.resolve(pending).then(r=>{if(r?.note)toast(r.note);}).catch(e=>toast(e.message)).finally(()=>{st.techPending=false;draw?.();});
}
export function click(S,t,ctx) {
  const {st={},draw}=ctx;
  if(t.closest('[data-tech-close]')){st.techReturnFocus=st.techSel;st.techSel=null;draw?.();return;}
  const pick=t.closest('[data-tech-pick]');
  if(pick){st.techSel=st.techSel===pick.dataset.techPick?null:pick.dataset.techPick;if(!st.techSel)st.techReturnFocus=pick.dataset.techPick;draw?.();return;}
  const jump=t.closest('[data-tech-jump]');
  if(jump){st.techFilter='all';st.techGroup='';st.techSearch='';st.techFocus=jump.dataset.techJump;st.techSel=jump.dataset.techJump;draw?.();return;}
  if(t.closest('[data-tech-market]')){if(!st.readOnly&&!st.techPending)openPicker('data');return;}
  if(t.closest('[data-tech-manual]'))return command(S,ctx,()=>{const a=S.automation,m=a.modules.research;return afterAct(act(S,'configureAutomation',{module:'research',mode:'manual',preset:m.preset,expectedRev:a.rev,requestId:`research:${a.rev}:manual`}),()=>({note:'已暂停自动选题；已有研究继续'}));});
  const stop=t.closest('[data-tech-stop]');if(stop)return command(S,ctx,()=>afterAct(act(S,'stopTech',{id:stop.dataset.techStop}),()=>({note:'先停下了，进度保留'})));
  const tech=t.closest('[data-tech]');if(tech)return command(S,ctx,()=>afterAct(act(S,'researchTech',{id:tech.dataset.tech}),x=>({note:`开始研究「${x.name}」`})));
}
export function change(S,t,{st={},draw}) {
  if(t.matches('[data-tech-filter]'))st.techFilter=t.value;
  else if(t.matches('[data-tech-group]'))st.techGroup=t.value;
  else if(t.matches('[data-tech-search]')){const value=t.value.slice(0,80);if(value===String(st.techSearch||''))return;st.techSearch=value;}
  else return;
  draw?.();
}
const searchBound=new WeakSet();
export function after(root,S,st={},ctx={}) {
  const search=root.querySelector?.('[data-tech-search]');
  if(search&&!searchBound.has(search)){
    searchBound.add(search);
    const apply=event=>{
      if(event?.isComposing)return;
      const value=search.value.slice(0,80);
      if(value===String(st.techSearch||''))return;
      st.techSearch=value;
      st.techSearchCaret={start:search.selectionStart,end:search.selectionEnd,direction:search.selectionDirection};
      ctx.draw?.();
    };
    search.addEventListener('input',apply);
    search.addEventListener('compositionend',apply);
    search.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();apply(event);}});
  }
  bindTreeViewport(root,st,'techViewport');
  const id=st.techFocus;
  if(id){
    const target=[...root.querySelectorAll('[data-tech-node]')].find(n=>n.dataset.techNode===id);
    if(target){target.scrollIntoView({block:'nearest'});target.focus({preventScroll:true});delete st.techFocus;}
    bindTreeViewport(root,st,'techViewport');
    root.querySelector?.('[data-tree-popover]:not([hidden]) [data-tree-close]')?.focus?.({preventScroll:true});
  }
  if(st.techSearchCaret&&search){const c=st.techSearchCaret;search.focus({preventScroll:true});search.setSelectionRange?.(c.start,c.end,c.direction);delete st.techSearchCaret;}
  if(st.techReturnFocus){
    const node=[...root.querySelectorAll('[data-tech-node]')].find(n=>n.dataset.techNode===st.techReturnFocus);
    node?.focus?.({preventScroll:true});delete st.techReturnFocus;
  }
}
