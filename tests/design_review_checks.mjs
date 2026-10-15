// Desktop acceptance for the 2026-10-15 design review. Run against a test-only server.
import {chromium} from '../build/browser-test-deps/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.argv[2]||'http://127.0.0.1:8099';
const browser=await chromium.launch({headless:true});
const evidence=[],errors=[];
const output='build/design-review-acceptance';await mkdir(output,{recursive:true});
try {
  const page=await browser.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);await page.waitForFunction(()=>connected&&!busy);
  for(const [width,height] of [[1280,720],[1366,768],[1920,1080]]) {
    await page.setViewportSize({width,height});
    for(const map of ['straight','s','spiral'])for(const level of [1,2,3]) {
      await page.evaluate(async({map,level})=>{
        if(state.status!=='ready')await mutate('/api/reset');
        await mutate('/api/game',{levelId:level,specialsEnabled:true,seed:15,mapId:map});
      },{map,level});
      const data=await page.evaluate(()=>{
        const stage=document.querySelector('#game-stage').getBoundingClientRect();
        const inside=e=>{const r=e.getBoundingClientRect();return r.left>=stage.left-1&&r.top>=stage.top-1&&r.right<=stage.right+1&&r.bottom<=stage.bottom+1;};
        return {pageFits:document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight,
          current:document.querySelector('#current-ball .ball').getBoundingClientRect().width,
          next:document.querySelector('#next-ball .ball').getBoundingClientRect().width,
          launcherFits:inside(document.querySelector('.ammo-current'))&&inside(document.querySelector('.launcher-next')),
          trackFits:[...document.querySelectorAll('#track .ball,#track .special-tag')].every(inside),
          labels:[...document.querySelectorAll('#track .special-tag img')].map(e=>e.getBoundingClientRect().width),
          sceneHeight:stage.height,background:getComputedStyle(document.querySelector('#game-stage')).backgroundImage};
      });
      assert(data.pageFits,`${width}/${map}/${level}: page overflow`);
      assert(data.current>=47.9&&data.next>=33.8,`${width}/${map}/${level}: ammo too small`);
      assert(data.launcherFits,`${width}/${map}/${level}: launcher clipped`);
      assert(data.trackFits,`${width}/${map}/${level}: ball or attribute clipped`);
      assert(data.labels.every(n=>n>=13.9),'attribute icon too small');
      assert(!data.background.includes('courtyard'),'stage repeats page background');
      if(map==='straight'&&level===3)assert(data.sceneHeight>280,'straight map still too flat');
      evidence.push({width,height,map,level,...data});
    }
  }
  const tag=page.locator('#track .special-tag').first();
  assert(await tag.count(),'seeded game must include attributes');
  await tag.focus();assert.equal(await page.locator('#aim-status').textContent(),await tag.getAttribute('title'));
  const version=await page.evaluate(()=>state.version);await tag.press('Enter');await tag.click();
  assert.equal(await page.evaluate(()=>state.version),version,'reading an attribute fired a ball');
  // Inspect the real flight, then interrupt a second flight using Skip.
  await page.evaluate(async()=>{await mutate('/api/reset');await mutate('/api/game',{levelId:3,specialsEnabled:false,mapId:'s'});});
  for(const skip of [false,true]) {
    const flight=page.evaluate(async()=>{await mutate('/api/action',{type:'shoot',direction:{x:0,y:-1}});});
    await page.waitForFunction(()=>document.body.hasAttribute('data-launcher-empty'));
    assert.equal(await page.locator('#current-ball').evaluate(e=>getComputedStyle(e).visibility),'hidden');
    if(skip)await page.locator('#skip-animation').click();
    await flight;
    assert.equal(await page.locator('#current-ball').evaluate(e=>getComputedStyle(e).visibility),'visible');
    assert.equal(await page.locator('.animation-ghost,.sprite-effect').count(),0);
  }
  await page.locator('#finish-game').click();await page.waitForFunction(()=>!busy);
  assert.equal(await page.locator('#track-status').textContent(),'本局已结束');
  assert.equal(await page.locator('.launcher-next').isVisible(),false);
  await page.locator('#result-recap').click();assert(await page.locator('#turn-replay').isVisible());
  await page.locator('#result-restart').click();await page.waitForFunction(()=>!busy);
  await page.locator('#choose-level').click();
  await page.waitForFunction(()=>[...document.querySelectorAll('.map-card svg')].every(e=>e.querySelector('polyline')));
  const previews=await page.evaluate(async()=>{
    const {maps}=await request('/api/maps');
    return maps.every(m=>document.querySelector(`[data-map="${m.id}"] polyline`).getAttribute('points')===m.geometry.path.map(p=>p.join(',')).join(' '));
  });assert(previews,'preview geometry differs from server');
  await page.locator('[data-map="straight"]').click();await page.waitForFunction(()=>!busy);
  assert((await page.locator('.level-detail').allTextContents()).every(t=>t.includes('初始')));
  await page.locator('[data-level="3"]').click();await page.waitForFunction(()=>!busy);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(async()=>{while(state.status==='playing')await mutate('/api/action',{type:'discard'});});
  assert.equal(await page.locator('#track-status').textContent(),'超出容量');
  assert.equal(await page.locator('.launcher-next').isVisible(),false);
  assert.deepEqual(errors,[]);
  await writeFile(`${output}/results.json`,JSON.stringify({evidence,flight:true,skip:true,ended:true,lost:true,recap:true,previews:true,errors},null,2));
  console.log(`Passed ${evidence.length} map/level/viewport combinations, flight, skip, terminal states, recap and previews.`);
} finally {await browser.close();}
