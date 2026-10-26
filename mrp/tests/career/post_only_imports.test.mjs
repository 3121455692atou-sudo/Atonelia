import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const root=new URL('../../',import.meta.url);
for(const first of ['src/career/sim/sota.js','src/career/sim/provider.js','src/career/sim/migrate.js','src/career/sim/post_only.js','src/career/world/label.js']){
 test(`post-only leaf dependencies permit cold import starting from ${first}`,()=>{
  const code=`await import('./${first}');const E=await import('./src/career/engine.js');const s=E.createSinglePlayerGame('deepseek','y2025',81);E.enablePostOnly(s);E.tickDay(s);if(!Number.isFinite(E.qOf('llm',s.models[0].dims)))throw Error('bad initialized score');if(!E.isPostOnly(s))throw Error('mode not installed');`;
  const r=spawnSync(process.execPath,['--input-type=module','-e',code],{cwd:root,encoding:'utf8',timeout:15000});assert.equal(r.status,0,r.stderr||r.error?.message);
 });
}
test('post-only shared economics/events do not import the engine barrel or full bot planner',()=>{
 for(const name of ['post_only','bot_economy','bot_events']){
  const src=readFileSync(new URL(`../../src/career/sim/${name}.js`,import.meta.url),'utf8');
  assert.doesNotMatch(src,/from\s+['"][^'"]*(?:engine|\/bot)\.js['"]/);
 }
});
