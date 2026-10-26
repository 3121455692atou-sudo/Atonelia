// Fast import-graph smoke before the HTTP scenarios: never stub real validators.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { fixtureProject, localModuleImports } from '../helpers/mp_fixture.mjs';
import { ROOT, tmpDir } from '../helpers/mp_server.mjs';

function smoke(root) {
 const files=['server/simulation_rules.mjs','src/career/world/rules_version.js','server/initial_methods.mjs','src/career/data/start_methods.js','server/post_training.mjs','server/store.mjs','src/career/sim/post_cards.js','src/career/sim/post_plan_state.js','src/career/sim/post_catalog.js','src/career/data/companies/index.js'];
 const code=`for (const file of ${JSON.stringify(files)}) await import(new URL(file,${JSON.stringify(pathToFileURL(root+path.sep).href)}));console.log('real validators imported');`;
 assert.equal(execFileSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8',timeout:20000}).trim(),'real validators imported');
 // room.mjs is a worker entrypoint requiring workerData: assert its real bytes
 // here; the real HTTP scenarios exercise its import in a Worker.
 for(const f of [...files,'server/room.mjs'])assert.equal(fs.readFileSync(path.join(root,f),'utf8'),fs.readFileSync(path.join(ROOT,f),'utf8'),f+' must remain the real module');
}
test('fixture copies complete real catalogue/risk/strategy import closure and all validators import',()=>{
 const root=fixtureProject(ROOT);try{smoke(root);}finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('fixture closure follows a newly added transitive import without a manual filename list',()=>{
 const source=tmpDir();let root;
 try {
  fs.cpSync(path.join(ROOT,'server'),path.join(source,'server'),{recursive:true});fs.cpSync(path.join(ROOT,'src'),path.join(source,'src'),{recursive:true});
  const entry=path.join(source,'server/post_training.mjs');fs.appendFileSync(entry,"\nimport '../src/career/sim/fixture_probe.mjs';\n");
  fs.writeFileSync(path.join(source,'src/career/sim/fixture_probe.mjs'),"export { marker } from '../data/fixture_probe_data.mjs';\n");
  fs.writeFileSync(path.join(source,'src/career/data/fixture_probe_data.mjs'),"export const marker='new real transitive module';\n");
  root=fixtureProject(source);
  const probe=pathToFileURL(path.join(root,'src/career/sim/fixture_probe.mjs')).href;
  const code=`const {marker}=await import(${JSON.stringify(probe)});await import(${JSON.stringify(pathToFileURL(path.join(root,'server/post_training.mjs')).href)});console.log(marker);`;
  assert.equal(execFileSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8',timeout:20000}).trim(),'new real transitive module');
  assert.deepEqual(localModuleImports("import './a.js';\nexport { x } from './b.js';\nconst x=import('./c.js');\nimport fs from 'node:fs';"),['./a.js','./b.js','./c.js']);
 }finally{if(root)fs.rmSync(root,{recursive:true,force:true});fs.rmSync(source,{recursive:true,force:true});}
});
