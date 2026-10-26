import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/career/engine.js';
globalThis.document ??= {baseURI:'http://localhost/'};
const {topBar}=await import('../../src/career/ui/topbar.js');
import {setMp,setWorld} from '../../src/career/ui/state.js';
test('HUD icon controls retain explicit accessible names when narrow CSS hides visible text',()=>{
 E.setProvider();setMp(null);setWorld(null);
 const s=E.createSinglePlayerGame('glm','y2023',22);
 const html=topBar(s);
 assert.match(html,/data-act="office" aria-label="打开后台"/);
 assert.match(html,/data-id="tech" aria-label="打开技术研究，技术积累 [^"]+"/);
 assert.match(html,/data-id="strategy" aria-label="[^"]*公司策略[^"]+"/);
});

test('narrow office back button has a name independent of its hidden span',async()=>{
 const {readFile}=await import('node:fs/promises');
 const source=await readFile(new URL('../../src/career/ui/office.js',import.meta.url),'utf8');
 assert.match(source,/class="btn office-close" data-close aria-label="回到主界面"/);
});
