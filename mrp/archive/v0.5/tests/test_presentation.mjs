import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {HISTORIES,START_PROFILES} from '../src/data/catalog_core.js';
import {DATASET_TEMPLATES,RESEARCH_NODES,STORY_EVENTS} from '../src/data/catalog_world.js';
import {createNewGameState} from '../src/engine/state_schema.js';
import {refreshDataMarket} from '../src/engine/race_and_data_engine.js';
import {previewFinancing,purchaseDataset,resolveCatalogChoice,canResolveCatalogEvent} from '../src/engine/presentation_contracts.js';
describe('Presentation contracts',()=>{
  it('history identifiers stay unique across shared architectures',()=>{
    assert.equal(new Set(HISTORIES.map(h=>h.id)).size,HISTORIES.length);
    for(const h of HISTORIES) assert.equal(h.id,h.history_id);
  });
  it('datasets and research nodes expose their canonical identifiers',()=>{
    for(const d of DATASET_TEMPLATES) assert.equal(d.id,d.dataset_id);
    for(const n of RESEARCH_NODES) assert.equal(n.id,n.node_id);
  });
  it('a selected laboratory supplies its actual compute and funds',()=>{
    const p=START_PROFILES.find(p=>p.profile_id==='moe_cluster_lab');
    const s=createNewGameState({profileId:p.id,historyId:p.default_history_id});
    assert.equal(s.company.cash_kc,p.cash_kc);
    assert.equal(s.company.cluster_compute_cu,p.cluster_compute_cu);
    assert.equal(s.active_model.history_id,'deepseek_engineering');
  });
  it('viewing financing and IPO previews cannot change the live company',()=>{
    const s=createNewGameState(); const before=JSON.stringify(s);
    const preview=previewFinancing(s);previewFinancing(s);
    assert.ok(preview.privateFin.net_proceeds_kc>0);
    assert.equal(JSON.stringify(s),before);
    assert.equal(s.company.is_public,false);
  });
  it('data procurement charges once without duplicating an owned dataset',()=>{
    const s=createNewGameState();refreshDataMarket(s);
    const offer=s.data_market[0];offer.price_kc=12;
    const owned=s.datasets.length; const cash=s.company.cash_kc;
    const result=purchaseDataset(s,offer);
    assert.equal(result.success,true);
    assert.equal(s.company.cash_kc,cash-12);
    assert.equal(s.datasets.length,owned);
    assert.equal(s.data_market.length,5);
    assert.equal(purchaseDataset(s,s.data_market[0]).reason,'action_used');
    assert.equal(s.company.cash_kc,cash-12);
  });
  it('insufficient funds cannot acquire data or consume an action',()=>{
    const s=createNewGameState();refreshDataMarket(s);s.company.cash_kc=2;s.data_market[0].price_kc=20;
    const before=s.datasets.length;
    assert.equal(purchaseDataset(s,s.data_market[0]).reason,'insufficient_cash');
    assert.equal(s.datasets.length,before);assert.notEqual(s.main_action_used,true);
  });
  it('the first narrative choice pays its stated reward once',()=>{
    const s=createNewGameState(); const event=STORY_EVENTS.find(e=>e.id==='evt_tutorial_letter');
    assert.equal(canResolveCatalogEvent(event),true);
    const cash=s.company.cash_kc;
    assert.equal(resolveCatalogChoice(s,event.id,'accept').ok,true);
    assert.equal(s.company.cash_kc,cash+800);
    assert.equal(resolveCatalogChoice(s,event.id,'accept').reason,'already_resolved');
    assert.equal(s.company.cash_kc,cash+800);
  });
  it('declining the commission applies both the cash and reasoning effects',()=>{
    const s=createNewGameState(); const cash=s.company.cash_kc;const reasoning=s.active_model.stats.reasoning;
    assert.equal(resolveCatalogChoice(s,'evt_tutorial_letter','decline').ok,true);
    assert.equal(s.company.cash_kc,cash-100);assert.equal(s.active_model.stats.reasoning,reasoning+1);
  });
});

describe('Catalog format compatibility',()=>{
  it('starter preference and raw-text data preserve their declared formats',()=>{
    const state=createNewGameState();
    assert.equal(state.datasets.find(d=>d.id==='data_starter_pref').format,'preference_pairs');
    assert.equal(state.datasets.find(d=>d.id==='data_starter_raw').format,'raw_text');
    assert.equal(state.datasets.find(d=>d.id==='data_starter_math_verify').format,'verified_tasks');
  });
  it('ambiguous rights are never silently converted to a licensed dataset',()=>{
    const state=createNewGameState();
    assert.equal(state.datasets.find(d=>d.id==='market_book_corpus_lit').rights_status,'unclear');
    assert.equal(state.datasets.find(d=>d.id==='market_web_crawl_2027').rights_status,'unclear');
  });
  it('every narrative exposed by the adapter has fully supported choices',()=>{
    for(const event of STORY_EVENTS.filter(canResolveCatalogEvent)) {
      for(const choice of event.choices) assert.equal(resolveCatalogChoice(createNewGameState(),event.id,choice.choice_id).ok,true);
    }
  });
});
