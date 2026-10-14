import {chromium} from '../build/browser-test-deps/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
const base=process.argv[2]||'http://127.0.0.1:8085';
const spiralOnly=process.argv.includes('--spiral-only');
const maps=spiralOnly?['spiral']:['straight','s','spiral'];
const out='build/map-checks';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});const evidence=[],errors=[],geometries={};
try {
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
 const idle=()=>page.waitForFunction(()=>connected&&!busy);
 async function reset(){await page.goto(base);await idle();if(await page.locator('#game-page').isVisible()){await page.locator('#restart:visible,#result-restart:visible').click();await idle();}}
 async function geometry(name){const data=await page.evaluate(()=>{
  const box=document.getElementById('game-stage').getBoundingClientRect();
  const finish=ZumaStage.finish(state.map,state.maxLength),marker=document.querySelector('#stage-path .path-end');
  const gateCorrect=Math.abs(Number(marker.getAttribute('cx'))-finish.point.x)<1e-6&&Math.abs(Number(marker.getAttribute('cy'))-finish.point.y)<1e-6;
  const lastLegal=state.map.diameter+(state.maxLength-1)*state.map.pitch,firstOverflow=lastLegal+state.map.pitch;
  return {viewport:[innerWidth,innerHeight],page:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],count:state.track.length,gateCorrect,finishBetweenSlots:finish.distance>lastLegal&&finish.distance<firstOverflow,oneFinish:document.querySelectorAll('#stage-path .finish-label').length===1&&document.querySelectorAll('#stage-path .capacity-mark').length===0,visible:[...document.querySelectorAll('#track .ball,#track .special-tag')].every(n=>{const b=n.getBoundingClientRect();return b.left>=box.left-1&&b.right<=box.right+1&&b.top>=box.top-1&&b.bottom<=box.bottom+1;}),map:state.mapId};
 });assert(data.visible,`${name} balls clipped`);assert(data.gateCorrect&&data.finishBetweenSlots&&data.oneFinish,`${name} finish disagrees with capacity`);assert(data.page[0]<=data.viewport[0]+1&&data.page[1]<=data.viewport[1]+1,`${name} page scrolls ${JSON.stringify(data)}`);evidence.push({name,...data});}
 for(const [width,height]of [[1280,720],[1366,768],[1920,1080]]){
  await page.setViewportSize({width,height});
  for(const mapId of maps)for(const special of [false,true])for(const levelId of [1,2,3]){
   await reset();await page.locator(`[data-mode="${special?'special':'normal'}"]`).click();await page.locator('#choose-level').click();await page.locator(`[data-map="${mapId}"]`).click();await idle();
   assert.equal(await page.locator('[data-level]').count(),await page.evaluate(()=>levels.length),'menu and catalog disagree');
   assert(await page.locator('[data-level="3"]').count()>0,'third level absent from menu');
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'long level preview overflows');
   await page.locator(`[data-level="${levelId}"]`).click();await idle();
   assert.equal(await page.evaluate(()=>state.mapId),mapId);
   if(width===1366&&!special&&levelId===1)geometries[mapId]=await page.evaluate(()=>state.map);
   await geometry(`${width}-${mapId}-${special}-${levelId}-initial`);
   if(width===1366&&!special&&levelId===1)await page.screenshot({path:`${out}/${mapId}-initial.png`});
   if(width===1366&&!special&&levelId===3)await page.screenshot({path:`${out}/${mapId}-level3.png`});
   // Compare preview and server resolutions for every degree, then reload to clear recap.
   if(width===1366&&!special&&levelId===2){
    const matches=await page.evaluate(async()=>{
     const original=state,results=[];
     // A fresh game for each direction keeps the real server/core state authoritative.
     for(let angle=0;angle<360;angle+=9){
      const direction={x:Math.cos(angle*Math.PI/180),y:Math.sin(angle*Math.PI/180)};
      const predicted=ZumaStage.resolve(original.map,original.track.length,direction);
      const action=await request('/api/action',{sessionId:state.sessionId,version:state.version,requestId:requestId(),type:'shoot',direction});
      results.push({predicted:[predicted.kind,predicted.position],actual:[action.events[0].aim.kind,action.events[0].aim.position]});
      const ready=(await request('/api/reset',{sessionId:action.state.sessionId,version:action.state.version,requestId:requestId()})).state;
      state=(await request('/api/game',{sessionId:ready.sessionId,version:ready.version,requestId:requestId(),levelId:original.levelId,specialsEnabled:false,mapId:original.mapId})).state;
     }accept({state},true);return results;
    });for(const result of matches)assert.deepEqual(result.actual,result.predicted,'preview and service disagree');
   }
   await page.emulateMedia({reducedMotion:'reduce'});
   // Fill through the real discard action to the capacity and failure boundaries.
   while(await page.evaluate(()=>state.status==='playing')){await page.locator('#discard').click();await idle();await geometry(`${width}-${mapId}-${levelId}-turn`);}
   assert.equal(await page.evaluate(()=>state.status),'lost');
   if(width===1366&&!special&&levelId===3)await page.screenshot({path:`${out}/${mapId}-level3-loss.png`});
   await page.locator('#result-recap').click();assert(await page.locator('.replay-step').count()>0);assert.equal(await page.locator('.replay-map').count(),await page.locator('.replay-step').count());
   await page.locator('#result-restart').click();await idle();assert.equal(await page.evaluate(()=>history.length),0);await page.emulateMedia({reducedMotion:'no-preference'});
  }
  console.log(`${width}x${height}: all maps, modes, levels, capacity, loss and recap passed`);
 }
 // Live animation: shoot the opening B gap, then miss and skip; verify real recap.
 await page.setViewportSize({width:1366,height:768});await reset();await page.locator('#choose-level').click();await page.locator('[data-map="straight"]').click();await page.locator('[data-level="1"]').click();await idle();
 const target=await page.evaluate(()=>{const a=ZumaStage.slot(state.map,2),b=ZumaStage.slot(state.map,3);return ZumaStage.boxAt({x:(a.x+b.x)/2,y:(a.y+b.y)/2},0);});
 await page.mouse.move(target.left,target.top);await page.mouse.click(target.left,target.top);await idle();assert.equal(await page.evaluate(()=>state.score),70);assert.equal(await page.evaluate(()=>state.turns),1);
 const miss=await page.evaluate(()=>ZumaStage.boxAt({x:state.map.launcher.x+200,y:state.map.launcher.y+100},0));
 await page.mouse.click(miss.left,miss.top);await page.waitForFunction(()=>document.body.dataset.animating==='true');
 const clipped=await page.evaluate(()=>[...document.querySelectorAll('.animation-ghost,.sprite-effect')].every(n=>n.parentElement.id==='stage-effects'));assert(clipped,'effects outside clipping layer');
 await page.locator('#skip-animation').click();await idle();assert.equal(await page.evaluate(()=>state.turns),2);assert.equal(await page.evaluate(()=>history.at(-1).action),'spit');
 await page.locator('#finish-game').click();await idle();assert.equal(await page.evaluate(()=>state.status),'ended');await page.locator('#result-recap').click();assert.equal(await page.locator('.replay-step').count(),2);assert((await page.locator('.replay-step').last().innerText()).includes('吐球'));
 // Reuse real C++ event traces to exercise attribute effects on each geometry.
 const fixtures=JSON.parse(await readFile('build/animation-fixtures.json','utf8'));
 for(const mapId of maps)for(const name of ['chain','boom','stop','back','stop-skip']){
  const fixture=structuredClone(fixtures[name]);
  fixture.initial.map=geometries[mapId];fixture.initial.mapId=mapId;
  fixture.response.state.map=geometries[mapId];fixture.response.state.mapId=mapId;
  const actual=await page.evaluate(async f=>{
   recapOpen=false;history=[];messages=[];turnEvents=[];accept({state:f.initial},true);busy=true;lock();
   try{await ZumaAnimation.play(f.response.events,snapshot=>renderGame({...f.response.state,...snapshot,status:'playing'}));}
   finally{accept(f.response,true);busy=false;lock();}
   return {balls:[...document.querySelectorAll('#track [data-ball-id]')].map(e=>({id:e.dataset.ballId,color:e.querySelector('.ball').dataset.color,special:e.querySelector('.special-tag')?.textContent||''})),effects:document.querySelectorAll('.animation-ghost,.sprite-effect').length};
  },fixture);
  assert.deepEqual(actual.balls,fixture.response.state.track.map(b=>({id:b.id,color:b.color,special:b.special})),`${mapId}/${name} wrong final ball identities`);assert.equal(actual.effects,0,`${mapId}/${name} leaked effects`);
 }
 console.log(`${maps.length*5} C++ chain/Boom/Stop/Back event traces: curve movement and final ball identities passed.`);
 assert.deepEqual(errors,[],'browser errors');await writeFile(`${out}/evidence.json`,JSON.stringify(evidence,null,2));
 console.log(`${maps.length*40} sampled directions: client/server agreement; live shot, spit, clipping, skip and manual-end replay passed.`);
}finally{await browser.close();}
