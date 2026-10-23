import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createNewGameState, validateGameState } from '../src/engine/state_schema.js';
import { advanceTurn, closeQuarter, getCompanyFinancialMetrics } from '../src/engine/company_and_world_engine.js';
import { previewTraining, applyTraining } from '../src/engine/training_engine.js';
import {
  ensureServiceEconomy, configureSupply, configureOffer, configureRouting, previewServiceTurn,
  procureCompute, setContractRenewal, getTrainingComputeCapacity, settleServiceTurn,
  publishServiceModel, resolveServiceCase, auditService,
} from '../src/engine/service_economy.js';

const approx=(a,b,t=0.0002)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
const newGame=()=>createNewGameState({campaignSeed:314159});
function start(s, ids=['api','plan']) {
  configureSupply(s,{owned_share_pct:60});
  for(const id of ids) configureOffer(s,id,{enabled:true});
  return s;
}
function expose() {
  const s=start(newGame());
  configureRouting(s,{variant:'lite',share_pct:100,disclosure:'hidden'});
  for(let i=0;i<8 && !s.legal_cases.some(c=>c.kind==='service_class_action');i++) advanceTurn(s);
  assert.ok(s.legal_cases.length);
  return s;
}
const cases=s=>s.legal_cases.filter(c=>c.kind==='service_class_action');

describe('Compute supply and ownership',()=>{
  it('reserving GPU for services reduces the real training budget and blocks overcommit',()=>{
    const s=newGame(), request={recipe_id:'sft',training_mode:'lora',preset:'balanced',epochs:1,replay_ratio:.15};
    configureSupply(s,{owned_share_pct:90});
    assert.equal(getTrainingComputeCapacity(s),14);
    assert.ok(previewTraining(s,request).blockers.some(b=>b.code==='INSUFFICIENT_COMPUTE'));
    const cash=s.company.cash_kc;
    const result=applyTraining(s,request);
    assert.ok(result.blockers?.length || result.ok===false || result.success===false);
    assert.equal(s.company.cash_kc,cash);
  });
  it('buying owned GPU adds capacity and memory with exactly one upfront charge',()=>{
    const s=newGame();assert.equal(procureCompute(s,'owned').ok,true);
    assert.equal(s.company.cash_kc,1920);assert.equal(s.company.cluster_compute_cu,180);assert.equal(s.company.cluster_memory_gb,120);
    assert.equal(s.company.quarter_paid_rnd_kc,480);
    s.company.cash_kc=100;const before=JSON.stringify(s);
    assert.equal(procureCompute(s,'owned').ok,false);assert.equal(JSON.stringify(s),before);
  });
  it('reserved GPU charges exactly four turns and disappears at expiry',()=>{
    const s=newGame();procureCompute(s,'reserved');
    for(let t=1;t<=4;t++){s.world.turn_index=t;const p=settleServiceTurn(s);assert.equal(p.supply.reserved_cu,60);assert.equal(p.cost_kc,22);}
    approx(s.company.cash_kc,2400-45-4*22);
    s.world.turn_index=5;const p=settleServiceTurn(s);assert.equal(p.supply.reserved_cu,0);assert.equal(p.cost_kc,0);
  });
  it('opt-in renewal pays a new activation fee and creates a new four-turn commitment',()=>{
    const s=newGame();procureCompute(s,'reserved');const c=s.serving.contracts[0];setContractRenewal(s,c.id,true);
    for(let t=1;t<=4;t++){s.world.turn_index=t;settleServiceTurn(s);}
    assert.equal(c.end_turn,8);approx(s.company.cash_kc,2400-90-88);
    s.world.turn_index=5;assert.equal(previewServiceTurn(s).supply.reserved_cu,60);
  });
  it('renewal failure cannot grant free cloud capacity',()=>{
    const s=newGame();procureCompute(s,'reserved');const c=s.serving.contracts[0];setContractRenewal(s,c.id,true);s.company.cash_kc=90;
    for(let t=1;t<=4;t++){s.world.turn_index=t;settleServiceTurn(s);}
    assert.equal(c.end_turn,4);s.world.turn_index=5;assert.equal(previewServiceTurn(s).supply.reserved_cu,0);
    assert.ok(s.serving.incidents.some(i=>i.kind==='supply'));
  });
  it('spot quotes are deterministic, bounded, and priced with the GPU market',()=>{
    const s=newGame();configureSupply(s,{spot_blocks:2});s.world.spot_gpu_price_index=1.5;
    const a=previewServiceTurn(s),b=previewServiceTurn(s);
    assert.deepEqual(a,b);assert.ok(a.supply.spot_cu>=72 && a.supply.spot_cu<=160);assert.equal(a.supply.spot_cost_kc,30);
    s.world.turn_index=2;assert.notEqual(previewServiceTurn(s).supply.spot_cu,a.supply.spot_cu);
  });
  it('API hosting is quota-limited and cannot be rented out as raw GPU',()=>{
    const s=newGame();configureSupply(s,{upstream_blocks:1});configureOffer(s,'api',{enabled:true});configureOffer(s,'gpu',{enabled:true});
    const p=previewServiceTurn(s);assert.equal(p.tokens_m,6);assert.equal(p.rows.find(r=>r.id==='gpu').served_cu,0);
    assert.equal(p.cost_kc,42);assert.ok(p.rows.find(r=>r.id==='api').fulfillment<1);
  });
  it('GPU rental and model inference cannot consume the same CU twice',()=>{
    const s=start(newGame(),['api','plan','gpu']),p=previewServiceTurn(s);
    assert.ok(p.served_cu<=p.supply.local_cu+.0002);assert.ok(p.rows.every(r=>r.fulfillment<1));
    assert.ok(p.rows.find(r=>r.id==='gpu').revenue_kc>0);
  });
});

describe('Token API and Token Plan billing',()=>{
  it('zero capacity produces zero billable tokens and zero subscription revenue',()=>{
    const s=newGame();configureOffer(s,'api',{enabled:true});configureOffer(s,'plan',{enabled:true});
    const p=previewServiceTurn(s);assert.equal(p.tokens_m,0);assert.equal(p.revenue_kc,0);assert.ok(p.rows.every(r=>r.fulfillment===0));
  });
  it('hard-capped plans never charge overage and refresh their per-person quota each turn',()=>{
    const s=start(newGame(),['plan']);configureOffer(s,'plan',{included_tokens_m:.02,overage:'cap'});
    for(let t=1;t<=2;t++){
      s.world.turn_index=t;const p=settleServiceTurn(s),row=p.rows[0];
      assert.equal(row.billable_tokens_m,0);approx(row.served_tokens_m,row.customers*.02);
      approx(row.revenue_kc,row.customers*.32);assert.ok(row.requested_tokens_m>row.served_tokens_m);
    }
  });
  it('metered plans bill only delivered tokens beyond the included allowance',()=>{
    const s=start(newGame(),['plan']);configureOffer(s,'plan',{included_tokens_m:.02,overage:'metered',overage_price_kc_per_m:18});
    const row=previewServiceTurn(s).rows[0];
    approx(row.billable_tokens_m,row.served_tokens_m-row.included_tokens_m);
    approx(row.revenue_kc,row.customers*.32*row.fulfillment+row.billable_tokens_m*18,0.002);
  });
  it('model publishing freezes the offered version until explicitly updated',()=>{
    const s=start(newGame(),['api']);const q=s.serving.offers[0].published_model.quality;
    s.active_model.stats.reasoning=900;assert.equal(s.serving.offers[0].published_model.quality,q);
    publishServiceModel(s,'api');assert.ok(s.serving.offers[0].published_model.quality>q);
  });
  it('a sharp price increase loses demand rather than charging the old cohort indefinitely',()=>{
    const a=start(newGame(),['api']),b=JSON.parse(JSON.stringify(a));
    configureOffer(b,'api',{price_kc_per_m:80});assert.ok(previewServiceTurn(b).rows[0].customers<previewServiceTurn(a).rows[0].customers*.6);
  });
  it('invalid pricing and fractional supply cannot partially change a configuration',()=>{
    const s=newGame(),before=JSON.stringify(s);
    assert.equal(configureOffer(s,'api',{enabled:true,price_kc_per_m:-1}).ok,false);
    assert.equal(configureSupply(s,{owned_share_pct:40,spot_blocks:1.5}).ok,false);
    assert.equal(configureRouting(s,{variant:'__proto__',share_pct:100,disclosure:'hidden'}).ok,false);
    assert.equal(JSON.stringify(s),before);
  });
});

describe('Reputation, hidden routing and class action',()=>{
  it('smaller hidden routes improve throughput but lower actual model quality',()=>{
    const s=start(newGame()),native=previewServiceTurn(s);
    configureRouting(s,{variant:'lite',share_pct:100,disclosure:'hidden'});const cheap=previewServiceTurn(s);
    assert.ok(cheap.tokens_m>native.tokens_m);assert.ok(cheap.margin_kc>native.margin_kc);
    assert.equal(cheap.quality_factor,.64);assert.ok(cheap.exposure_delta>0);
    assert.equal(cheap.rows[0].actual_quality,288);
  });
  it('disclosed smaller routes do not create misleading-claims lawsuits',()=>{
    const s=start(newGame());configureRouting(s,{variant:'lite',share_pct:100,disclosure:'disclosed'});
    for(let i=0;i<8;i++)advanceTurn(s);
    assert.equal(s.serving.evidence,0);assert.equal(cases(s).length,0);assert.ok(s.serving.reviews.some(r=>r.text.includes('标明')));
  });
  it('hidden native routing and zero served requests cannot manufacture false evidence',()=>{
    const s=newGame();configureOffer(s,'api',{enabled:true});configureRouting(s,{variant:'lite',share_pct:100,disclosure:'hidden'});
    settleServiceTurn(s);assert.equal(s.serving.evidence,0);
    s.world.turn_index=2;configureSupply(s,{owned_share_pct:60});configureRouting(s,{variant:'native',share_pct:100,disclosure:'hidden'});
    settleServiceTurn(s);assert.equal(s.serving.evidence,0);
  });
  it('exposure causes customer loss, reviews, a persistent evidence trail and a valid legal case',()=>{
    const s=expose(),c=cases(s)[0];assert.ok(s.serving.reputation<45);assert.ok(s.serving.trust<45);
    assert.ok(s.serving.offers[1].customers<s.serving.offers[1].last.next_customers);
    assert.ok(c.claim_kc>0);assert.equal(c.stage,'notice');assert.ok(s.legal_exposures.some(e=>e.kind==='misleading_claims'));
    assert.ok(s.serving.reviews.some(r=>r.stars<4));assert.equal(validateGameState(s).valid,true);
  });
  it('public remediation pays once, discloses routing and retains historical evidence',()=>{
    const s=expose(),c=cases(s)[0],cash=s.company.cash_kc,evidence=s.serving.evidence,trust=s.serving.trust;
    const result=resolveServiceCase(s,c.case_id,'remediate');assert.equal(result.ok,true);
    approx(s.company.cash_kc,cash-result.cost_kc);assert.equal(c.stage,'closed');assert.equal(s.serving.routing.disclosure,'disclosed');
    assert.equal(s.serving.evidence,evidence);assert.ok(s.serving.trust>trust);
    const after=s.company.cash_kc;assert.equal(resolveServiceCase(s,c.case_id,'remediate').ok,false);assert.equal(s.company.cash_kc,after);
    advanceTurn(s);assert.equal(s.serving.evidence,evidence);assert.equal(validateGameState(s).valid,true);
  });
  it('insufficient cash cannot pay or secretly resolve a case',()=>{
    const s=expose(),c=cases(s)[0];s.company.cash_kc=1;const before=JSON.stringify(s);
    assert.equal(resolveServiceCase(s,c.case_id,'settle').ok,false);assert.equal(JSON.stringify(s),before);
  });
  it('ignoring a case leads to a payable judgment on its deadline',()=>{
    const s=expose(),c=cases(s)[0];configureRouting(s,{variant:'native',share_pct:0,disclosure:'disclosed'});
    while(s.world.turn_index<=c.deadline_turn)advanceTurn(s);
    assert.equal(c.stage,'closed');assert.equal(c.outcome,'liable');approx(c.legal_cost_kc,c.claim_kc*1.4);
    assert.ok(s.serving.incidents.some(i=>i.kind==='judgment'));assert.equal(validateGameState(s).valid,true);
  });
  it('contesting a case charges one retainer and resolves after two complete turns',()=>{
    const s=expose(),c=cases(s)[0];configureRouting(s,{variant:'native',share_pct:0,disclosure:'disclosed'});
    const cash=s.company.cash_kc,reply=resolveServiceCase(s,c.case_id,'fight');approx(cash-s.company.cash_kc,c.claim_kc*.25);
    assert.equal(reply.outcome,'pending');assert.equal(resolveServiceCase(s,c.case_id,'fight').ok,false);
    advanceTurn(s);advanceTurn(s);assert.equal(c.stage,'hearing');advanceTurn(s);assert.equal(c.stage,'closed');
    assert.ok(['liable','not_liable'].includes(c.outcome));assert.equal(validateGameState(s).valid,true);
  });
  it('audits stop concealment without deleting prior evidence or farming trust in one turn',()=>{
    const s=expose(),e=s.serving.evidence,caseCount=cases(s).length;assert.equal(auditService(s).ok,true);
    assert.equal(s.serving.routing.disclosure,'disclosed');assert.equal(s.serving.evidence,e);assert.equal(cases(s).length,caseCount);
    const cash=s.company.cash_kc;assert.equal(auditService(s).ok,false);assert.equal(s.company.cash_kc,cash);
  });
});

describe('Accounting, migration and save round trips',()=>{
  it('forecasts and financial metrics are read-only, including repeated rendering',()=>{
    const s=start(newGame()),before=JSON.stringify(s);previewServiceTurn(s);previewServiceTurn(s);getCompanyFinancialMetrics(s);
    assert.equal(JSON.stringify(s),before);
  });
  it('a repeated turn settlement cannot collect a second payment or progress reputation',()=>{
    const s=start(newGame());settleServiceTurn(s);const before=JSON.stringify(s);
    assert.equal(settleServiceTurn(s).already_settled,true);assert.equal(JSON.stringify(s),before);
  });
  it('six completed turns close a quarter with no duplicate service receipt or cost',()=>{
    const s=start(newGame());let margin=0,last;
    for(let i=0;i<6;i++){last=advanceTurn(s);margin+=last.serving.margin_kc;if(i<5)assert.equal(last.quarter_closed,null);}
    const q=last.quarter_closed;assert.equal(q.quarter_index,1);assert.equal(s.world.turn_index,7);assert.equal(q.serving_turns,6);
    approx(s.company.cash_kc,2400+margin-110-q.tax_kc);
    approx(q.revenue_kc-q.cash_cogs_kc,margin);approx(q.cash_delta_from_close_kc,-110-q.tax_kc);
    approx(q.end_to_end_cash_delta_kc,margin-110-q.tax_kc);assert.equal(s.company.quarter_serving_revenue_kc,0);
    const before=s.company.cash_kc;assert.equal(closeQuarter(s).already_closed,true);assert.equal(s.company.cash_kc,before);
  });
  it('legacy products migrate once without minting money or retaining generic duplicate revenue',()=>{
    const s=newGame();delete s.serving;delete s.products[0].billing_engine;const cash=s.company.cash_kc,stats=JSON.stringify(s.active_model.stats);
    ensureServiceEconomy(s);ensureServiceEconomy(s);ensureServiceEconomy(s);
    assert.equal(s.company.cash_kc,cash);assert.equal(JSON.stringify(s.active_model.stats),stats);assert.equal(s.serving.offers.filter(o=>o.enabled).length,1);
    assert.equal(s.products[0].billing_engine,'serving_v1');assert.equal(s.serving.incidents.length,1);
    const report=closeQuarter(s);assert.equal(report.revenue_kc,0);assert.equal(validateGameState(s).valid,true);
  });
  it('saving and reloading preserves contracts, route evidence, customers and actual next cash flows',()=>{
    const s=expose();procureCompute(s,'reserved');const restored=JSON.parse(JSON.stringify(s));assert.equal(validateGameState(restored).valid,true);
    advanceTurn(s);advanceTurn(restored);assert.deepEqual(restored,s);
  });
  it('malformed business saves fail validation before an invalid review or route can render',()=>{
    const s=newGame();s.serving.spot_blocks=1.5;s.serving.reviews=[{stars:100000,text:'bad',turn:1}];s.serving.routing.variant='constructor';
    const result=validateGameState(s);assert.equal(result.valid,false);assert.ok(result.errors.some(e=>e.startsWith('serving.')));
  });
  it('unsupported business versions are rejected without replacing the existing economy',()=>{
    const s=newGame();s.serving.version=2;const before=JSON.stringify(s);
    assert.throws(()=>ensureServiceEconomy(s),/版本不受支持/);assert.equal(JSON.stringify(s),before);
    assert.equal(validateGameState(s).valid,false);
  });
  it('corrupt prepaid service totals cannot enter a quarterly cash bridge',()=>{
    const s=newGame();s.company.quarter_serving_revenue_kc=-10;
    assert.equal(validateGameState(s).valid,false);
  });
});
