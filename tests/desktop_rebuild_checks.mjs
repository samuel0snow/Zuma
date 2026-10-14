// Desktop-only acceptance for docs/页面设计/网页再建设报告.md.
import {chromium} from '../build/browser-test-deps/node_modules/playwright/index.mjs';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.argv[2]||'http://127.0.0.1:8084';
const out='build/desktop-rebuild';await mkdir(out,{recursive:true});
const fixtures=JSON.parse(await readFile('build/animation-fixtures.json','utf8'));
const browser=await chromium.launch({headless:true});const evidence=[];
try{
 const page=await browser.newPage();
 const idle=()=>page.waitForFunction(()=>connected&&!busy);
 async function screen(name){
  const box=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight}));
  await page.screenshot({path:`${out}/${name}.png`,fullPage:true});
  assert(box.scrollWidth<=box.width+1&&box.scrollHeight<=box.height+1,`${name} page overflow: ${JSON.stringify(box)}`);evidence.push({name,...box});
 }
 async function reset(){await page.goto(base);await idle();if(await page.locator('#game-page').isVisible()){await page.locator('#result-restart:visible,#restart:visible').click();await idle();}}
 async function trackVisible(){
  const track=await page.evaluate(()=>{const p=document.querySelector('.track-scroll').getBoundingClientRect();return {count:document.querySelectorAll('#track .ball').length,gaps:document.querySelectorAll('#track .gap').length,visible:[...document.querySelectorAll('#track .ball,#track .gap,#track .special-tag')].every(n=>{const r=n.getBoundingClientRect();return r.left>=p.left-1&&r.right<=p.right+1&&r.bottom<=innerHeight;})};});
  assert(track.visible,'Track/attribute/button clipped');assert.equal(track.gaps,track.count+1);
 }
 for(const [width,height] of [[1280,720],[1366,768],[1920,1080]]){
  await page.setViewportSize({width,height});await reset();
  await page.locator('[data-mode="normal"]').click();
  const titleBefore=await page.locator('#mode-heading').boundingBox();
  await screen(`${width}-mode`);
  await page.locator('[data-mode="special"]').click();
  const titleAfter=await page.locator('#mode-heading').boundingBox();assert.equal(titleBefore.y,titleAfter.y,'Intro jumps on mode switch');
  await screen(`${width}-special`);
  await page.locator('#rules-toggle').click();await page.locator('#rules').waitFor({state:'visible'});
  assert((await page.locator('#rules').innerText()).includes('各有 10%'));await page.keyboard.press('Escape');
  await page.locator('#choose-level').click();await idle();
  assert.equal(await page.locator('.level-number').count(),0);assert.equal(await page.locator('.level-card h2').count(),2);
  await screen(`${width}-levels`);
  for(const id of [1,2]){
   await page.locator(`[data-level="${id}"]`).click();await idle();
   assert(!(await page.locator('#game-mode').innerText()).includes('%'));
   assert.equal(await page.locator('.ball-letter').count(),0);
   assert(await page.locator('footer a').isVisible());
   await trackVisible();await screen(`${width}-level${id}-initial`);
   const geometry=await page.evaluate(()=>({orb:document.querySelector('#track .ball').getBoundingClientRect().width,stats:document.querySelector('.stats').getBoundingClientRect().height,dock:document.querySelector('.ammo-panel').getBoundingClientRect(),track:document.querySelector('.track-scroll').getBoundingClientRect()}));
   assert(geometry.orb>48,'Main ball did not grow');assert(geometry.stats<40,'Statistics remain oversized');assert(geometry.dock.top>geometry.track.bottom,'Launcher is not below track');
   const contact=await page.evaluate(()=>{
    const dock=document.querySelector('.ammo-current'),r=dock.getBoundingClientRect(),b=dock.querySelector('.ball').getBoundingClientRect(),style=getComputedStyle(dock),shadow=getComputedStyle(dock,'::before');
    const artSize=parseFloat(style.backgroundSize);
    return {rimRatio:(b.bottom-(r.bottom-artSize))/artSize,shadowDistance:Math.abs((r.top+parseFloat(shadow.top)+parseFloat(shadow.height)/2)-b.bottom)};
   });
   assert(contact.rimRatio>.44&&contact.rimRatio<.64&&contact.shadowDistance<16,'Ball does not meet bowl/contact shadow');
   await page.emulateMedia({reducedMotion:'reduce'});
   while(await page.evaluate(()=>state.status==='playing')){
    await page.locator('#discard').click();await idle();await trackVisible();
    if(await page.evaluate(()=>state.track.length===state.maxLength))await screen(`${width}-level${id}-full`);
   }
   await screen(`${width}-level${id}-loss`);
   assert(await page.locator('#result').isVisible());assert(!(await page.locator('#discard').isVisible()));assert(!(await page.locator('#restart').isVisible()));assert(!(await page.locator('.events-panel').isVisible()));
   await page.locator('#result-restart').focus();await page.keyboard.press('Enter');await idle();assert(await page.locator('#mode-page').isVisible());
   if(id===1){await page.locator('#choose-level').click();await idle();}
   await page.emulateMedia({reducedMotion:'no-preference'});
  }
 }
 // Use exported C++ states for victory and summaries, not invented game rules.
 for(const name of ['win','stop-back-summary','boom','back']){
  const fixture=fixtures[name];let action=false;
  await page.route('**/api/game',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({state:action?fixture.response.state:fixture.initial})}));
  await page.route('**/api/action',r=>{action=true;return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(fixture.response)});});
  await page.setViewportSize({width:1280,height:720});await page.goto(base);await idle();
  const insert=fixture.response.events.find(e=>e.type==='insert');
  if(name==='boom')await page.evaluate(()=>{
   window.__boomSeen=false;
   window.__boomObserver=new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.classList?.contains('sprite-boom'))window.__boomSeen=true;});
   window.__boomObserver.observe(document.body,{childList:true});
  });
  await page.getByRole('button',{name:`在位置 ${insert.from} 发射`,exact:true}).focus();await page.keyboard.press('Enter');
  if(name==='boom'){
   await page.waitForFunction(()=>window.__boomSeen);
   const clipped=await page.evaluate(()=>{
    document.getAnimations().forEach(animation=>animation.pause());
    const sprite=document.querySelector('.sprite-boom'),r=sprite.getBoundingClientRect(),arena=document.querySelector('.board-panel').getBoundingClientRect();
    const clip=getComputedStyle(sprite).clipPath;const values=clip.replace(/inset\(|\)/g,'').split(/\s+/).map(parseFloat);
    const [top,right=top,bottom=top,left=right]=values;
    return {clip,inside:r.left+left>=arena.left-1&&r.right-right<=arena.right+1&&r.top+top>=arena.top-1&&r.bottom-bottom<=arena.bottom+1};
   });
   assert(clipped.inside&&clipped.clip!=='none','Explosion effect escapes arena');
   await screen('1280-boom-frame');await page.evaluate(()=>document.getAnimations().forEach(animation=>animation.play()));
  }
  await idle();assert(action,'Keyboard action did not fire');
  assert.deepEqual(await page.evaluate(()=>state),fixture.response.state);
  await trackVisible();await screen(`1280-${name}`);
  if(name==='win'){assert(await page.locator('#result').isVisible());assert(!(await page.locator('#discard').isVisible()));assert(!(await page.locator('.events-panel').isVisible()));}
  if(name==='stop-back-summary'){
   const summary=await page.locator('#events').innerText();assert(summary.includes('停滞增加 4 回合'));assert(summary.includes('无彩球可回退'));assert(!summary.includes('0格'));assert.equal(summary.match(/停滞增加/g).length,1);
   await page.locator('#event-details summary').click();assert((await page.locator('#event-list').innerText()).includes('Stop:'));await screen('1280-expanded-details');
   await page.locator('.ammo-current').screenshot({path:`${out}/launcher-closeup.png`});
  }
  await page.unroute('**/api/game');await page.unroute('**/api/action');
 }
 // Missing generated art must retain real color and usable actions.
 await page.route('**/assets/balls/gemstone/*',r=>r.abort());await reset();await page.locator('#choose-level').click();await idle();await page.locator('[data-level="1"]').click();await idle();
 await page.waitForFunction(()=>[...document.querySelectorAll('#track .ball')].every(n=>!n.querySelector('img')));
 const fallback=await page.evaluate(()=>[...document.querySelectorAll('#track .ball')].every(n=>getComputedStyle(n).backgroundColor!=='rgba(0, 0, 0, 0)'&&n.getAttribute('aria-label')));assert(fallback);
 await page.locator('.gap').first().focus();await page.keyboard.press('Enter');await idle();assert.equal(await page.evaluate(()=>state.turns),1);await screen('1280-missing-art');
 await page.unroute('**/assets/balls/gemstone/*');
 await writeFile(`${out}/evidence.json`,JSON.stringify(evidence,null,2));console.log(`${evidence.length} desktop state checks passed; summaries, terminal actions, keyboard, rules and art fallback passed.`);
}finally{await browser.close();}
