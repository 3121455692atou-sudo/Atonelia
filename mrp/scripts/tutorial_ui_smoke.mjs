// Actual-game UI tutorial smoke. Requires an authorized Playwright browser runner.
// This is not a second tutorial renderer; every gameplay click uses the app's normal controls.
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.UI_BROWSER_EXECUTABLE?{executablePath:process.env.UI_BROWSER_EXECUTABLE}:{})});
const base=process.env.UI_BASE_URL||'http://127.0.0.1:8765';
try{
 for(const width of [390,320]){
  const context=await browser.newContext({viewport:{width,height:568},reducedMotion:'reduce'}),page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);
  await page.locator('[data-act="tutorial-basic"]').waitFor();
  await page.evaluate(()=>{localStorage.setItem('practice-test-marker','formal unchanged');sessionStorage.setItem('practice-session-marker','formal session unchanged');});
  const before=await page.evaluate(()=>({local:{...localStorage},session:{...sessionStorage}}));
  const assertFormal=async()=>assert.deepEqual(await page.evaluate(()=>({local:{...localStorage},session:{...sessionStorage}})),before);
  for(const kind of ['basic','advanced']){
   await page.locator(`[data-act="tutorial-${kind}"]`).click();await page.waitForURL(url=>url.searchParams.get('practice')===kind);
   await page.locator('.practice-coach').waitFor();assert.equal(await page.locator('[data-tutorial-action]').count(),0);
   assert.equal(await page.evaluate(()=>localStorage.getItem('practice-test-marker')),null);
   for(let n=0;n<65;n++){
    const tip=await page.locator('.practice-coach > span').innerText();if(/会出牌|都会了/.test(tip))break;
    const target=page.locator('.practice-target').first();await target.waitFor({state:'visible'});
    const tag=await target.evaluate(el=>el.tagName);
    if(tag==='SELECT'){await target.selectOption('standard');}
    else if(tag==='INPUT'){const box=await target.boundingBox();await target.click({position:{x:box.width*.7,y:box.height/2}});}
    else await target.click();
    await page.waitForFunction(old=>document.querySelector('.practice-coach > span')?.textContent!==old,tip);
   }
   assert.match(await page.locator('.practice-coach > span').innerText(),/会出牌|都会了/);
   await page.locator('.practice-coach button').click();await page.waitForURL(url=>!url.searchParams.has('practice'));await page.locator('[data-act="tutorial-basic"]').waitFor();await assertFormal();
  }
  // Exit in the middle and refresh must not resume practice bytes into a formal game.
  await page.locator('[data-act="tutorial-basic"]').click();await page.locator('.practice-coach').waitFor();await page.reload();await page.locator('.practice-coach').waitFor();
  assert.equal(await page.evaluate(()=>localStorage.getItem('practice-test-marker')),null);await page.locator('.practice-coach button').click();await page.waitForURL(url=>!url.searchParams.has('practice'));await assertFormal();
  assert.deepEqual(errors,[]);console.log(`PASS ${width}px actual game controls, nine purposes, exit/re-entry/refresh and formal storage`);await context.close();
 }
}finally{await browser.close();}
