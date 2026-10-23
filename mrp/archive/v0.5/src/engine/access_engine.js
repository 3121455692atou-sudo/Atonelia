import { APPLICATIONS, PROXY_POLICIES, MODERATION_POLICIES } from '../data/catalog_access.js';
import { CAPABILITY_KEYS, readCapabilities } from '../data/model_capabilities.js';

const clamp=(v,a,b)=>Math.min(b,Math.max(a,Number(v)||0));
const round=v=>Math.round(v*10000)/10000;
const tokens=v=>Math.floor(Math.max(0,v)*1e6)/1e6;
const turnOf=s=>s.world?.turn_index ?? s.turn ?? 1;
const copy=v=>JSON.parse(JSON.stringify(v));
export const isServiceCase=c=>['service_class_action','service_abuse'].includes(c.kind);
export function createGateway() {
  return {proxy_policy:'off',moderation:'basic',proxy_clients:[],last_spawn_turn:0,credential_epoch:1,rotation_until:0,abuse_pressure:0,last_abuse_turn:-6};
}
export function ensureGateway(state) {
  const b=state.serving;
  b.gateway ||= createGateway();
  for(const [k,v] of Object.entries(createGateway())) if(b.gateway[k]===undefined) b.gateway[k]=copy(v);
  return b.gateway;
}
export function frozenCapabilities(snapshot) {
  // A legacy published model is reconstructed from its frozen quality, never from the current trainee.
  return snapshot?.capabilities ? readCapabilities({stats:snapshot.capabilities}) : Object.fromEntries(CAPABILITY_KEYS.map(k=>[k,clamp(snapshot?.quality ?? 450,0,1000)]));
}
export function applicationReach(offer) {
  if(offer.billing==='compute'||offer.access_mode==='public_api')return 1;
  const apps=APPLICATIONS.filter(a=>(offer.allowed_apps||[]).includes(a.id));
  if(!apps.length)return 0;
  const matched=apps.filter(a=>a.audiences.includes(offer.audience||'general')).length;
  return clamp(.28+apps.length*.09+matched*.12,.25,.97);
}
export function configureGateway(state,config) {
  const g=ensureGateway(state);
  if(config.proxy_policy!==undefined&&!Object.hasOwn(PROXY_POLICIES,config.proxy_policy))return {ok:false,reason:'请选择有效的反代治理策略。'};
  if(config.moderation!==undefined&&!Object.hasOwn(MODERATION_POLICIES,config.moderation))return {ok:false,reason:'请选择有效的安全运营策略。'};
  for(const k of ['proxy_policy','moderation'])if(config[k]!==undefined)g[k]=config[k];
  return {ok:true};
}
export function revokeProxyClient(state,id) {
  const g=ensureGateway(state),c=g.proxy_clients.find(c=>c.id===id&&c.status==='active');
  if(!c)return {ok:false,reason:'该共享池已被封禁或尚未出现在接入记录中。'};
  if(state.serving.offers.find(o=>o.id===c.offer_id)?.resale_allowed)return {ok:false,reason:'这个接入已在当前合约中获准转售。'};
  c.status='revoked';c.revoked_turn=turnOf(state);
  state.serving.incidents.push({turn:turnOf(state),kind:'gateway',title:'已封禁违规共享池',detail:`${c.name} 的模拟凭据已撤销，下次交付不再占用配额和算力。`});
  return {ok:true};
}
export function rotateServiceCredentials(state) {
  const g=ensureGateway(state),turn=turnOf(state);
  if(turn<=g.rotation_until)return {ok:false,reason:'上一轮凭据更换尚在恢复期。'};
  if((state.company.cash_kc||0)<25)return {ok:false,reason:'更换接入凭据需要 25 kc。'};
  state.company.cash_kc=round(state.company.cash_kc-25);
  state.company.quarter_paid_legal_kc=round((state.company.quarter_paid_legal_kc||0)+25);
  for(const c of g.proxy_clients)if(c.status==='active'){c.status='revoked';c.revoked_turn=turn;}
  g.credential_epoch++;g.rotation_until=turn+2;g.last_spawn_turn=turn;
  state.serving.incidents.push({turn,kind:'gateway',title:'完成模拟凭据轮换',detail:'违规共享池已失效；本回合约 4% 的正常用户需要重新连接，未来两回合暂停新增共享池。'});
  return {ok:true,cost_kc:25};
}

export function gatewayForecast(state) {
  const g=state.serving.gateway,turn=turnOf(state),clients=copy(g.proxy_clients);
  const eligible=state.serving.offers.filter(o=>o.enabled&&o.billing!=='compute'&&!o.resale_allowed);
  if(eligible.length&&turn>=3&&turn>g.rotation_until&&turn-g.last_spawn_turn>=3&&clients.filter(c=>c.status==='active').length<3){
    const offer=eligible[(Math.floor(turn/3)-1)%eligible.length];
    clients.push({id:`pool_${turn}_${g.credential_epoch}`,name:`共享订阅池 ${String(clients.length+1).padStart(2,'0')}`,offer_id:offer.id,kind:'unauthorized_proxy',status:'active',first_seen_turn:turn,seats:2,raw_tokens_m:offer.tokens_per_customer_m*14,detected:g.proxy_policy!=='off'});
  }
  const proxy=PROXY_POLICIES[g.proxy_policy],mod=MODERATION_POLICIES[g.moderation];
  const activeInference=eligible.length||state.serving.offers.some(o=>o.enabled&&o.billing!=='compute');
  return {clients,proxy_block:proxy.block,legitimate_friction:proxy.friction+(mod===MODERATION_POLICIES.strict?.025:0)+(turn===g.rotation_until-2?.04:0),cost_kc:activeInference?proxy.cost_kc+mod.cost_kc:0,moderation_residual:mod.residual};
}

export function offerTraffic(offer,customers,forecast) {
  if(offer.billing==='compute')return {cohorts:[],customers,requested_tokens_m:0,demand_tokens_m:0,included_tokens_m:0,proxy_tokens_m:0,blocked_tokens_m:0};
  const raw=customers*offer.tokens_per_customer_m;
  const cohorts=[{kind:'regular',accounts:customers*(1-forecast.legitimate_friction),raw_tokens_m:raw*(1-forecast.legitimate_friction)}];
  let blocked=raw*forecast.legitimate_friction;
  for(const c of forecast.clients.filter(c=>c.offer_id===offer.id&&c.status==='active')){
    const admitted=offer.resale_allowed?1:1-forecast.proxy_block;
    cohorts.push({kind:offer.resale_allowed?'reseller':'proxy',client_id:c.id,accounts:c.seats*admitted,raw_tokens_m:c.raw_tokens_m*admitted});
    blocked+=c.raw_tokens_m*(1-admitted);
  }
  for(const c of cohorts){
    c.included_tokens_m=offer.billing==='plan'?c.accounts*offer.included_tokens_m:0;
    c.demand_tokens_m=offer.billing==='plan'&&offer.overage==='cap'?Math.min(c.raw_tokens_m,c.included_tokens_m):c.raw_tokens_m;
  }
  return {cohorts,customers:cohorts[0].accounts,requested_tokens_m:tokens(cohorts.reduce((s,c)=>s+c.raw_tokens_m,0)),demand_tokens_m:tokens(cohorts.reduce((s,c)=>s+c.demand_tokens_m,0)),included_tokens_m:tokens(cohorts.reduce((s,c)=>s+c.included_tokens_m,0)),proxy_tokens_m:tokens(cohorts.filter(c=>c.kind==='proxy').reduce((s,c)=>s+c.demand_tokens_m,0)),blocked_tokens_m:tokens(blocked)};
}

export function abuseForecast(state,rows,forecast) {
  const inference=rows.filter(r=>r.billing!=='compute'),served=inference.reduce((s,r)=>s+r.served_tokens_m,0);
  if(!served)return {delta:0,pressure:round(state.serving.gateway.abuse_pressure*.8),alignment:450,served_tokens_m:0};
  let hazard=0,alignment=0;
  for(const row of inference){
    const safety=frozenCapabilities(state.serving.offers.find(o=>o.id===row.id).published_model).safety_alignment*row.quality_factor;
    alignment+=safety*row.served_tokens_m;
    const offer=state.serving.offers.find(o=>o.id===row.id);
    const access=offer.access_mode==='app_only'?.9:1.1;
    hazard+=((1-safety/1000)**2+.008)*row.served_tokens_m*access;
  }
  const delta=hazard/served*(.16+Math.min(1,served/12))*forecast.moderation_residual;
  return {delta:round(delta),pressure:round(state.serving.gateway.abuse_pressure*.8+delta),alignment:round(alignment/served),served_tokens_m:served};
}

export function settleGateway(state,result) {
  const g=ensureGateway(state),turn=turnOf(state);
  if(result.gateway.clients.length>g.proxy_clients.length)g.last_spawn_turn=turn;
  g.proxy_clients=result.gateway.clients.slice(-60);
  for(const c of g.proxy_clients)if(c.status==='active'&&g.proxy_policy!=='off')c.detected=true;
  g.abuse_pressure=result.abuse.pressure;
  if(g.abuse_pressure<1||turn-g.last_abuse_turn<6)return;
  const id=`service_abuse_${turn}`,claim=round(210+result.tokens_m*3.5),exposureId=`${id}_evidence`;
  const affected=Math.ceil(result.rows.reduce((s,r)=>s+r.customers,0));
  state.legal_cases.push({case_id:id,id,title:'网络滥用事件：公共机构网站受攻击',kind:'service_abuse',exposure_ids:[exposureId],jurisdiction_id:'fictional_market_a',stage:'notice',evidence_strength:clamp(.55+g.abuse_pressure*.15,.55,.95),license_coverage:.2,counsel_quality:.5,claim_kc:claim,legal_cost_kc:0,reserve_kc:claim,deadline_turn:turn+4,affected_model_ids:state.serving.offers.filter(o=>o.enabled&&o.published_model).map(o=>o.published_model.id),outcome:'pending',filed_turn:turn,affected_users:affected,fictional_only:true});
  state.legal_exposures.push({exposure_id:exposureId,id:exposureId,kind:'product_liability',created_turn:turn,source_record_ids:[`service_turn_${turn}`],severity:80,discovery_probability:1,remediated:false,fictional_only:true});
  const incident={turn,kind:'service_abuse',title:'滥用事件引发责任诉讼',detail:`虚构政府网站遭到攻击，调查发现有人滥用了平台服务。受害方起诉平台，要求赔偿 ${claim} kc；口碑 −14、信任 −18，客户流失 20%。安全运营与模型对齐都会影响后续风险。`,case_id:id};
  state.serving.incidents.push(incident);result.incidents.push(incident);
  state.serving.reputation=clamp(state.serving.reputation-14,0,100);state.serving.trust=clamp(state.serving.trust-18,0,100);
  for(const o of state.serving.offers)if(o.billing!=='compute')o.customers=round(o.customers*.8);
  g.last_abuse_turn=turn;g.abuse_pressure=round(g.abuse_pressure*.25);
}

export function validateGateway(g) {
  if(g===undefined)return [];
  const errors=[];
  if(!g||!Object.hasOwn(PROXY_POLICIES,g.proxy_policy)||!Object.hasOwn(MODERATION_POLICIES,g.moderation))return ['serving.gateway 策略无效'];
  for(const k of ['last_spawn_turn','credential_epoch','rotation_until','abuse_pressure','last_abuse_turn'])if(!Number.isFinite(g[k])||g[k]<(k==='last_abuse_turn'?-6:0)||g[k]>1e6)errors.push(`serving.gateway.${k} 无效`);
  if(!Array.isArray(g.proxy_clients)||g.proxy_clients.length>60)errors.push('serving.gateway.proxy_clients 无效');
  else {
    if(new Set(g.proxy_clients.map(c=>c?.id)).size!==g.proxy_clients.length)errors.push('serving.gateway.client ID 重复');
    for(const c of g.proxy_clients)if(!c||typeof c.id!=='string'||typeof c.name!=='string'||c.name.length>200||!['active','revoked'].includes(c.status)||!['api','plan','coding_plan'].includes(c.offer_id)||!Number.isFinite(c.seats)||c.seats<=0||c.seats>1000||!Number.isFinite(c.raw_tokens_m)||c.raw_tokens_m<0||c.raw_tokens_m>1e5||!Number.isInteger(c.first_seen_turn)||c.first_seen_turn<1||c.first_seen_turn>192)errors.push('serving.gateway.client 无效');
  }
  return errors;
}
