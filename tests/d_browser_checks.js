// Run this function through Playwright with a page connected to the GUI service.
// Tests use the existing single session; --test-mode enables reproducible seeds.
async (page) => {
  const base = new URL(page.url()).origin;
  const checks = [];
  async function api(path, body) {
    return page.evaluate(async ({path,body}) => {
      const response=await fetch(path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json','X-Zuma-Client':'1'}:{},body:body?JSON.stringify(body):undefined});
      const data=await response.json(); if(!response.ok)throw Error(JSON.stringify(data));return data;
    },{path,body});
  }
  let sequence=0;
  async function create(levelId,specialsEnabled,seed=1) {
    let ready=(await api('/api/game')).state;
    ready=(await api('/api/reset',{sessionId:ready.sessionId,version:ready.version,requestId:`test-reset-${Date.now()}-${sequence++}`})).state;
    const result=await api('/api/game',{sessionId:ready.sessionId,version:ready.version,requestId:`test-create-${Date.now()}-${sequence++}`,levelId,specialsEnabled,seed});
    await page.reload();await page.locator('#game-page').waitFor({state:'visible'});return result.state;
  }
  async function idle() { await page.waitForFunction(()=>document.body.dataset.animating!=='true'&&!busy); }
  async function equal() {
    const expected=(await api('/api/game')).state;
    const actual=await page.evaluate(()=>({state,track:[...document.querySelectorAll('#track [data-ball-id]')].map(n=>n.dataset.ballId),feed:[...document.querySelectorAll('#feed [data-ball-id]')].map(n=>n.dataset.ballId),score:document.getElementById('score').textContent,turns:document.getElementById('turns').textContent,ghosts:document.querySelectorAll('.animation-ghost,.sprite-effect').length}));
    if(JSON.stringify(actual.state)!==JSON.stringify(expected)||JSON.stringify(actual.track)!==JSON.stringify(expected.track.map(b=>b.id))||JSON.stringify(actual.feed)!==JSON.stringify(expected.feed.map(b=>b.id))||actual.score!==String(expected.score)||actual.turns!==String(expected.turns)||actual.ghosts)throw Error('animation final snapshot mismatch');
    return expected;
  }
  await create(1,false);
  const phases=[];
  await page.evaluate(()=>{window.__phases=[];const original=ZumaAnimation.play;ZumaAnimation.play=async(events,render)=>{window.__phases=events.map(e=>e.type);return original(events,render);};});
  await page.getByRole('button',{name:'在位置 4 发射',exact:true}).click();
  await page.waitForFunction(()=>document.body.dataset.animating==='true');
  if(!(await page.locator('#discard').isDisabled())||!(await page.locator('#restart').isDisabled()))throw Error('animation does not lock operations');
  await idle(); const chain=await equal();
  if(chain.score!==70||chain.turns!==1)throw Error('chain state wrong');
  phases.push(...await page.evaluate(()=>window.__phases));
  if(!phases.includes('chain_eliminate')||!phases.includes('feed'))throw Error('missing chain/feed phase');
  checks.push('ordinary/chain/feed/ammo animation and final snapshot');
  await page.getByRole('button',{name:'在位置 1 发射',exact:true}).click();
  await page.waitForFunction(()=>document.body.dataset.animating==='true');
  await page.locator('#skip-animation').click();await idle();await equal();checks.push('skip snaps to authoritative final state');
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.locator('#discard').click();await idle();await equal();checks.push('reduced motion');
  await page.emulateMedia({reducedMotion:'no-preference'});
  // Find reproducible original-level seeds covering all three attributes.
  const seeds={};
  for(let seed=0;seed<200&&Object.keys(seeds).length<3;seed++) {
    const s=await create(1,true,seed);
    for(const ball of s.track)if(ball.special&&!Object.hasOwn(seeds,ball.special))seeds[ball.special]=seed;
  }
  for(const [special,seed] of Object.entries(seeds)) {
    await create(1,true,seed);
    if(await page.locator(`#track .special-tag`).count()===0)throw Error('attribute labels missing');
    await page.getByRole('button',{name:'在位置 4 发射',exact:true}).click();await idle();const final=await equal();
    if(special==='Stop'&&final.status==='playing') {await page.locator('#discard').click();await idle();await equal();}
    checks.push(`${special} attribute sequence matches final state`);
  }
  if(Object.keys(seeds).length!==3)throw Error('attribute seed coverage incomplete');
  await create(2,false);await page.locator('#discard').click();await idle();await equal();
  await page.setViewportSize({width:390,height:844});
  const widths=await page.evaluate(()=>({page:document.documentElement.scrollWidth,viewport:innerWidth}));
  if(widths.page!==widths.viewport)throw Error('mobile page overflow');checks.push('second level and mobile');
  await page.locator('#restart').click();await page.getByRole('heading',{name:'选择你的玩法'}).waitFor();
  checks.push('restart returns to mode');
  return {base,checks,seeds};
}
