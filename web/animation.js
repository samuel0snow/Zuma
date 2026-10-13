'use strict';
// Presentation only: event snapshots come from zuma_core. No rules live here.
window.ZumaAnimation = (() => {
  let skip = false;
  const active = new Set();
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const names = {insert:'彩球发射',discard:'丢弃当前球',eliminate:'同色消除',chain_eliminate:'连锁消除',boom:'Boom · 爆破',stop_trigger:'Stop · 停滞生效',back:'Back · 彩球回退',stop_skip:'Stop · 本回合停滞中',feed:'等待球入轨',ammo_update:'弹药更新',turn_end:'回合结束',won:'胜利',lost:'本局结束'};
  const elements = () => new Map([...document.querySelectorAll('#track [data-ball-id], #feed [data-ball-id]')].map(element => [element.dataset.ballId, element]));
  const rect = element => element?.querySelector('.ball')?.getBoundingClientRect();
  async function animate(element, frames, duration) {
    if (skip || reduced() || document.hidden || !element?.animate) return;
    const animation = element.animate(frames, {duration, easing:'cubic-bezier(.2,.65,.3,1)', fill:'both'});
    active.add(animation);
    try { await animation.finished; } catch { /* cancellation jumps to next snapshot */ }
    finally { active.delete(animation); animation.cancel(); }
  }
  function ghost(element, box) {
    if (!element || !box) return null;
    const copy = element.cloneNode(true);
    copy.removeAttribute('id'); copy.removeAttribute('data-ball-id');
    copy.classList.add('animation-ghost'); copy.setAttribute('aria-hidden','true');
    Object.assign(copy.style, {left:`${box.left}px`,top:`${box.top}px`,width:`${box.width}px`,height:`${box.height}px`});
    document.body.append(copy); return copy;
  }
  async function sprite(kind, box, duration = 320) {
    if (!box || skip || reduced() || document.hidden) return;
    const sources = {boom:'/assets/effects/boom-seq/sheet.png',flash:'/assets/effects/flash-seq/sheet.png',ring:'/assets/effects/ring-seq/sheet.png'};
    const counts = {boom:12,flash:12,ring:8};
    const element = document.createElement('span'); element.className = `sprite-effect sprite-${kind}`;
    element.setAttribute('aria-hidden','true');
    const size = kind === 'boom' ? 132 : 90;
    Object.assign(element.style,{left:`${box.left+box.width/2-size/2}px`,top:`${box.top+box.height/2-size/2}px`,width:`${size}px`,height:`${size}px`,backgroundImage:`url('${sources[kind]}')`,backgroundSize:`${counts[kind]*100}% 100%`});
    document.body.append(element);
    try {
      if (element.animate) {
        const effect = element.animate([{backgroundPosition:'0% 0%'},{backgroundPosition:'100% 0%'}],{duration,easing:`steps(${counts[kind]-1})`,fill:'forwards'});
        active.add(effect); try { await effect.finished; } catch {} finally { active.delete(effect);effect.cancel(); }
      }
    } finally { element.remove(); }
  }
  async function transition(event, render) {
    const before = elements();
    const positions = new Map([...before].map(([id,element])=>[id,rect(element)]));
    const moving = ['insert','feed','back'].includes(event.type);
    const originals = new Map();
    if (event.type === 'back') for (const id of event.ballIds) {
      const source = before.get(id)?.querySelector('.ball');
      const copy = ghost(source, positions.get(id)); if(copy) originals.set(id,copy);
    }
    render(event.snapshot);
    const after = elements();
    const jobs = [];
    for (const [id,element] of after) {
      const target = rect(element), previous = positions.get(id);
      if (!target) continue;
      if (previous && Math.abs(previous.width-target.width) < 1 && !originals.has(id)) {
        jobs.push(animate(element,[{transform:`translate(${previous.left-target.left}px,${previous.top-target.top}px)`},{transform:'translate(0,0)'}],220));
      }
    }
    for (const id of event.ballIds) {
      const destination = after.get(id)?.querySelector('.ball');
      const target = rect(after.get(id));
      if (!target || !moving) continue;
      let source = positions.get(id);
      if (event.type === 'insert') source = document.querySelector('#current-ball .ball')?.getBoundingClientRect();
      let copy = originals.get(id);
      if (!copy && source) copy = ghost(destination,source);
      if (copy && source) {
        destination.style.visibility='hidden';
        jobs.push(animate(copy,[{transform:'translate(0,0) scale(1)',opacity:1},{transform:`translate(${target.left-source.left}px,${target.top-source.top}px) scale(${target.width/source.width})`,opacity:1}],event.type==='back'?380:280).finally(()=>{destination.style.visibility='';copy.remove();}));
      } else jobs.push(animate(destination,[{transform:'scale(.2)',opacity:0},{transform:'scale(1)',opacity:1}],240));
    }
    try { await Promise.all(jobs); } finally { for(const copy of originals.values())copy.remove(); }
  }
  async function phase(event, render) {
    const map = elements();
    if (['eliminate','chain_eliminate'].includes(event.type)) {
      const jobs = event.ballIds.map(id => {
        const column=map.get(id); return Promise.all([animate(column,[{transform:'scale(1)',opacity:1},{transform:'scale(1.15)',opacity:1,offset:.25},{transform:'scale(.1)',opacity:0}],280),sprite('flash',rect(column),280)]);
      });
      await Promise.all(jobs); await transition(event,render);
    } else if (event.type === 'boom') {
      const columns=[...document.querySelectorAll('#track [data-ball-id]')].slice(event.from-1,event.to);
      await Promise.all([sprite('boom',rect(map.get(event.ballIds[0])),380),...columns.map(column=>animate(column,[{filter:'brightness(1)'},{filter:'brightness(2.2)'},{filter:'brightness(1)'}],380))]);
      render(event.snapshot);
    } else if (event.type === 'stop_trigger') {
      await sprite('ring',rect(map.get(event.ballIds[0])),320); render(event.snapshot);
    } else if (event.type === 'stop_skip') {
      await animate(document.querySelector('.board-panel'),[{boxShadow:'0 0 0 0 #e4bd7b00'},{boxShadow:'0 0 0 3px #e4bd7b99'},{boxShadow:'0 0 0 0 #e4bd7b00'}],300);render(event.snapshot);
    } else if (event.type === 'discard') {
      await animate(document.querySelector('#current-ball .ball'),[{transform:'translateY(0)',opacity:1},{transform:'translateY(28px) scale(.4)',opacity:0}],220);render(event.snapshot);
    } else if (event.type === 'ammo_update') {
      render(event.snapshot); await animate(document.querySelector('#current-ball .ball'),[{transform:'scale(.6)',opacity:.3},{transform:'scale(1)',opacity:1}],180);
    } else if (['insert','feed','back'].includes(event.type)) await transition(event,render);
    else render(event.snapshot);
  }
  async function play(events, render) {
    skip=false;
    document.body.dataset.animating='true';
    document.getElementById('skip-animation').hidden=reduced() || !events.length;
    try {
      for (const event of events) {
        if (skip || reduced() || document.hidden) break;
        document.getElementById('animation-status').textContent=names[event.type] || '更新状态';
        await phase(event,render);
      }
    } finally {
      for(const animation of active)animation.cancel();active.clear();
      document.querySelectorAll('.animation-ghost,.sprite-effect').forEach(element=>element.remove());
      delete document.body.dataset.animating;
      document.getElementById('skip-animation').hidden=true;
      document.getElementById('animation-status').textContent='';
    }
  }
  function finish() { skip=true;for(const animation of active)animation.cancel(); }
  document.addEventListener('visibilitychange',()=>{if(document.hidden)finish();});
  return {play,finish};
})();
