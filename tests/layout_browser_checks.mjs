// Run against an isolated --test-mode service. No dependency in shipped game.
import {chromium} from '../build/browser-test-deps/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage();
 await page.goto(process.argv[2] || 'http://127.0.0.1:8082');
 await page.waitForFunction(()=>connected&&!busy);
 if(await page.locator('#game-page').isVisible()){
  await page.locator('#restart').click();await page.waitForFunction(()=>view==='mode'&&!busy);
 }
 await page.locator('#choose-level').click();
 await page.locator('[data-level="1"]').click();
 await page.waitForFunction(()=>view==='game'&&!busy);
 for(const [width,height] of [[1366,768],[1280,720],[1920,1080]]){
  await page.setViewportSize({width,height});
  for(const count of [6,12,13]){
   await page.evaluate(count=>{
    const track=Array.from({length:count},(_,i)=>({id:`layout-${i}`,color:'RGBYP'[i%5],special:i%3===0?'Boom':''}));
    renderGame({...state,track,status:count>12?'lost':'playing'});
   },count);
   const geometry=await page.evaluate(()=>{
    const panel=document.querySelector('.track-scroll').getBoundingClientRect();
    const nodes=[...document.querySelectorAll('#track .ball,#track .gap')];
    return {visible:nodes.every(n=>{const r=n.getBoundingClientRect();return r.left>=panel.left-1&&r.right<=panel.right+1&&r.top>=0&&r.bottom<=innerHeight;}),
     scroll:document.documentElement.scrollHeight>innerHeight+1, count:nodes.length,
     horizontal:document.documentElement.scrollWidth>innerWidth+1};
   });
   assert(geometry.visible,`Track clipped at ${width}x${height}, ${count} balls`);
   assert(!geometry.horizontal,'Page overflows horizontally');
   if(width>=1000&&geometry.scroll){
    await page.screenshot({path:'build/ui-overflow.png',fullPage:true});
    console.log(await page.evaluate(()=>[...document.querySelectorAll('.masthead,.game-heading,.stats,.game-layout,.board-panel,.ammo-panel,.events-panel,footer')].map(n=>({name:n.className,height:n.getBoundingClientRect().height,top:n.getBoundingClientRect().top}))));
    assert(!geometry.scroll,`Desktop scroll at ${width}x${height}, ${count} balls`);
   }
  }
  await page.screenshot({path:`build/ui-layout-${width}.png`,fullPage:true});
 }
 const base=new URL(page.url()).origin;
 const icon=await page.request.get(`${base}/assets/favicon.svg`);assert.equal(icon.status(),200);
 for(const color of ['red','green','blue','yellow','purple'])assert.equal((await page.request.get(`${base}/assets/balls/gemstone/${color}.webp`)).status(),200);
 assert.equal((await page.request.get(`${base}/assets/launcher/pedestal-painted.webp`)).status(),200);
 console.log('Full track, all insertion buttons, desktop height and new assets passed.');
}finally{await browser.close();}
