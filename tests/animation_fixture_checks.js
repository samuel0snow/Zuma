// Browser renderer tests with snapshots exported by the actual C++ core.
// Serve web/ locally; no running user game is modified by these checks.
async (page, fixtures, base = 'http://127.0.0.1:8083') => {
  let fixture, requests=0;
  await page.route('**/api/game',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({state:requests?fixture.response.state:fixture.initial})}));
  await page.route('**/api/action',route=>{requests++;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(fixture.response)});});
  await page.route('**/favicon.ico',route=>route.fulfill({status:204}));
  const results=[];
  for(const name of Object.keys(fixtures)) {
    fixture=fixtures[name];requests=0;
    await page.goto(base + '/');
    await page.locator('#game-page').waitFor({state:'visible'});
    await page.waitForFunction(()=>!busy);
    const event=fixture.response.events[0];
    if(event.type==='insert') await page.getByRole('button',{name:`在位置 ${event.from} 发射`,exact:true}).click();
    else await page.locator('#discard').click();
    await page.waitForFunction(()=>document.body.dataset.animating==='true');
    if(!(await page.locator('#discard').isDisabled())||!(await page.locator('#restart').isDisabled()))throw Error('missing busy lock');
    await page.waitForFunction(()=>document.body.dataset.animating!=='true'&&!busy);
    const actual=await page.evaluate(()=>({state,track:[...document.querySelectorAll('#track [data-ball-id]')].map(n=>({id:n.dataset.ballId,color:n.querySelector('.ball-letter').textContent,special:n.querySelector('.special-tag')?.textContent||''})),feed:[...document.querySelectorAll('#feed [data-ball-id]')].map(n=>({id:n.dataset.ballId,color:n.querySelector('.ball-letter').textContent,special:n.querySelector('.special-tag')?.textContent||''})),ghosts:document.querySelectorAll('.animation-ghost,.sprite-effect').length}));
    const expected=fixture.response.state;
    if(JSON.stringify(actual.state)!==JSON.stringify(expected)||actual.ghosts)throw Error(name+': final state mismatch');
    for(const zone of ['track','feed'])if(JSON.stringify(actual[zone])!==JSON.stringify(expected[zone].map(b=>({id:b.id,color:b.color,special:b.special}))))throw Error(name+': DOM identity/color/attribute mismatch');
    if(requests!==1)throw Error(name+': duplicate action request');
    if(['won','lost'].includes(expected.status)&&(!(await page.locator('#result').isVisible())||!(await page.locator('#discard').isDisabled())))throw Error(name+': result state missing');
    results.push(name);
  }
  // Skip, reduced motion, unsupported animation API and corrupt animation
  // all need to land on the same authoritative state.
  for(const mode of ['skip','reduced','unsupported','exception']) {
    fixture=fixtures.chain;requests=0;
    await page.goto(base + '/');await page.waitForFunction(()=>!busy&&state?.status==='playing');
    if(mode==='reduced')await page.emulateMedia({reducedMotion:'reduce'});
    if(mode==='unsupported')await page.evaluate(()=>{Element.prototype.animate=undefined;});
    if(mode==='exception')await page.evaluate(()=>{ZumaAnimation.play=()=>{throw Error('test animation failure');};});
    await page.getByRole('button',{name:'在位置 4 发射',exact:true}).click();
    if(mode==='skip'){await page.locator('#skip-animation').waitFor({state:'visible'});await page.locator('#skip-animation').click();}
    await page.waitForFunction(()=>!busy);
    const actual=await page.evaluate(()=>({state,ghosts:document.querySelectorAll('.animation-ghost,.sprite-effect').length}));
    if(JSON.stringify(actual.state)!==JSON.stringify(fixture.response.state)||actual.ghosts)throw Error(mode+': fallback mismatch');
    if(mode==='reduced')await page.emulateMedia({reducedMotion:'no-preference'});
    results.push(mode);
  }
  await page.unroute('**/api/game');await page.unroute('**/api/action');await page.unroute('**/favicon.ico');
  return {rendererCases:results};
}
