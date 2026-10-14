'use strict';
// Geometry mirrors the server calculation; only the server commits actions.
window.ZumaStage = (() => {
  const ns='http://www.w3.org/2000/svg', eps=1e-8;
  let game=null, map=null, locked=true, direction={x:0,y:-1}, fire=null, scale=1;
  const $=id=>document.getElementById(id);
  const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y});
  const dot=(a,b)=>a.x*b.x+a.y*b.y, cross=(a,b)=>a.x*b.y-a.y*b.x;
  function at(m,distance) {
    distance=Math.max(0,Math.min(distance,m.distances.at(-1)));
    let low=1,high=m.distances.length-1;
    while(low<high){const mid=(low+high)>>1;if(m.distances[mid]<=distance)low=mid+1;else high=mid;}
    const i=low,a=m.path[i-1],b=m.path[i],span=m.distances[i]-m.distances[i-1];
    const t=span>eps?(distance-m.distances[i-1])/span:0;
    return {x:a[0]+(b[0]-a[0])*t,y:a[1]+(b[1]-a[1])*t};
  }
  const slot=(m,i)=>at(m,m.diameter+i*m.pitch);
  function tangent(m,i){const a=at(m,m.diameter+i*m.pitch-1),b=at(m,m.diameter+i*m.pitch+1),v=sub(b,a),n=Math.hypot(v.x,v.y);return {x:v.x/n,y:v.y/n};}
  function resolve(m,count,vector) {
    const n=Math.hypot(vector.x,vector.y);if(n<eps)return null;
    const d={x:vector.x/n,y:vector.y/n},origin=m.launcher,r=m.diameter/2;
    let nearest=Infinity,result={kind:'spit',position:0,direction:d};
    for(let i=0;i<count;i++) {
      const center=slot(m,i),v=sub(center,origin),projection=dot(v,d),perp=dot(v,v)-projection*projection;
      if(perp>r*r+eps)continue;
      const chord=Math.sqrt(Math.max(0,r*r-perp)),t=projection-chord>=0?projection-chord:projection+chord;
      if(t<0||t>=nearest)continue;
      nearest=t;
      const closest={x:origin.x+projection*d.x,y:origin.y+projection*d.y},side=dot(sub(closest,center),tangent(m,i));
      result={kind:'ball',targetIndex:i,position:i+(side>=-eps?2:1),direction:d,impact:{x:origin.x+t*d.x,y:origin.y+t*d.y}};
    }
    for(let i=0;i+1<count;i++) {
      const a=slot(m,i),segment=sub(slot(m,i+1),a),relative=sub(a,origin),den=cross(d,segment);
      if(Math.abs(den)<eps)continue;
      const t=cross(relative,segment)/den,u=cross(relative,d)/den;
      if(t<0||u<0||u>1||t>=nearest-eps)continue;
      nearest=t;result={kind:'gap',targetIndex:i,position:i+2,direction:d,impact:{x:origin.x+t*d.x,y:origin.y+t*d.y}};
    }
    if(result.kind==='spit') {
      const tx=d.x>eps?(m.width-r-origin.x)/d.x:d.x<-eps?(r-origin.x)/d.x:Infinity;
      const ty=d.y>eps?(m.height-r-origin.y)/d.y:d.y<-eps?(r-origin.y)/d.y:Infinity;
      const t=Math.min(tx,ty);result.impact={x:origin.x+t*d.x,y:origin.y+t*d.y};
    }
    result.destination=result.kind==='spit'?result.impact:slot(m,result.position-1);
    return result;
  }
  function svg(name,attributes){const e=document.createElementNS(ns,name);for(const [k,v]of Object.entries(attributes))e.setAttribute(k,v);return e;}
  function fit() {
    if(!map)return;
    const stage=$('game-stage'),scene=$('stage-scene');
    const parent=stage.parentElement,style=getComputedStyle(parent);
    const available=parent.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
    const maxHeight=parseFloat(getComputedStyle(stage).maxHeight);
    if(available<=2||!Number.isFinite(maxHeight)||maxHeight<=2)return;
    $('game-page').style.setProperty('--play-width',`${document.querySelector('.game-layout').getBoundingClientRect().width}px`);
    scale=Math.min((available-2)/map.width,(maxHeight-2)/map.height);
    stage.style.width=`${map.width*scale+2}px`;stage.style.height=`${map.height*scale+2}px`;
    scene.style.width=`${map.width}px`;scene.style.height=`${map.height}px`;
    scene.style.left='0px';scene.style.top='0px';
    scene.style.transform=`scale(${scale})`;
  }
  function finish(m,capacity){const distance=Math.min(m.distances.at(-1),m.diameter+(capacity-.5)*m.pitch);return {distance,point:at(m,distance)};}
  function drawPath(path,m,capacity) {
    path.replaceChildren();path.setAttribute('viewBox',`0 0 ${m.width} ${m.height}`);
    const end=finish(m,capacity),points=m.path.filter((_,i)=>m.distances[i]<end.distance).concat([[end.point.x,end.point.y]]).map(p=>p.join(',')).join(' ');
    path.append(svg('polyline',{points:m.path.map(p=>p.join(',')).join(' '),class:'path-unused'}));
    for(const cls of ['path-shadow','path-rim','path-stone','path-detail'])path.append(svg('polyline',{points,class:cls}));
    for(let i=0;i<capacity;i++){const p=slot(m,i);path.append(svg('circle',{cx:p.x,cy:p.y,r:m.diameter/2,class:'path-slot'}));}
    const start=at(m,0);path.append(svg('circle',{cx:start.x,cy:start.y,r:10,class:'path-entry'}));
    const entry=svg('text',{x:start.x,y:start.y-22,'text-anchor':'middle',class:'path-label'});entry.textContent='入口';path.append(entry);
    const a=at(m,end.distance-1),b=at(m,end.distance+1),v=sub(b,a),n=Math.hypot(v.x,v.y),t={x:v.x/n,y:v.y/n},p=end.point,r=m.diameter*.65;
    path.append(svg('line',{x1:p.x-t.y*r,y1:p.y+t.x*r,x2:p.x+t.y*r,y2:p.y-t.x*r,class:'path-finish-gate'}));
    path.append(svg('circle',{cx:p.x,cy:p.y,r:8,class:'path-end','data-distance':end.distance}));
    let normal={x:t.y,y:-t.x};
    if(m.id!=='straight'&&dot(normal,sub(p,m.launcher))<0)normal={x:-normal.x,y:-normal.y};
    const text=svg('text',{x:Math.max(30,Math.min(m.width-30,p.x+normal.x*m.diameter)),y:Math.max(22,Math.min(m.height-18,p.y+normal.y*m.diameter)),'text-anchor':'middle',class:'path-label finish-label'});text.textContent='终点';path.append(text);
  }
  function backdrop(){drawPath($('stage-path'),map,game.maxLength);}
  function preview() {
    if(!map||!game)return;
    const overlay=$('aim-overlay');overlay.replaceChildren();overlay.setAttribute('viewBox',`0 0 ${map.width} ${map.height}`);
    for(const e of $('track').querySelectorAll('.aim-target'))e.classList.remove('aim-target');
    if(locked||game.status!=='playing'){$('aim-status').textContent=game.status!=='playing'?'本局已结束':'回合结算中';return;}
    const hit=resolve(map,game.track.length,direction);if(!hit)return;
    overlay.append(svg('line',{x1:map.launcher.x,y1:map.launcher.y,x2:hit.impact.x,y2:hit.impact.y,class:`aim-ray ${hit.kind==='spit'?'aim-miss':''}`}));
    if(hit.kind==='spit') {
      overlay.append(svg('circle',{cx:hit.impact.x,cy:hit.impact.y,r:8,class:'aim-edge'}));
      $('aim-status').textContent='吐球 · 弃用当前球，消耗一回合';
    } else {
      const p=slot(map,hit.targetIndex),t=tangent(map,hit.targetIndex),r=map.diameter*.7;
      if(hit.kind==='ball')overlay.append(svg('line',{x1:p.x-t.y*r,y1:p.y+t.x*r,x2:p.x+t.y*r,y2:p.y-t.x*r,class:'aim-divider'}));
      const target=$('track').children[hit.targetIndex];target?.classList.add('aim-target');
      if(hit.kind==='gap')$('track').children[hit.targetIndex+1]?.classList.add('aim-target');
      const a=hit.position>1?slot(map,hit.position-2):at(map,0),b=slot(map,hit.position-1);
      overlay.append(svg('circle',{cx:(a.x+b.x)/2,cy:(a.y+b.y)/2,r:12,class:'aim-insert'}));
      $('aim-status').textContent=`${hit.kind==='gap'?'两球间隙':'命中彩球'} · 插入位置 ${hit.position}`;
    }
  }
  function render(next,ballColumn) {
    if(next.sessionId!==game?.sessionId)direction={x:0,y:-1};
    game=next;const changed=map!==next.map;map=next.map;if(!map)return;
    document.querySelector('.game-layout').style.setProperty('--map-ratio',map.width/map.height);
    $('stage-scene').style.setProperty('--orb',`${map.diameter}px`);
    $('stage-scene').style.setProperty('--tag-size',`${11*map.diameter/68}px`);
    $('stage-scene').style.setProperty('--launcher-scale',map.diameter/68);
    if(changed)backdrop();
    const track=$('track');track.replaceChildren();
    next.track.forEach((item,i)=>{
      const e=ballColumn(item),p=slot(map,i);e.dataset.trackIndex=i;
      e.style.left=`${p.x-map.diameter/2}px`;e.style.top=`${p.y-map.diameter/2}px`;track.append(e);
    });
    const launcher=document.querySelector('.stage-launcher');launcher.style.left=`${map.launcher.x}px`;launcher.style.top=`${map.launcher.y}px`;
    fit();preview();
  }
  function setLocked(value){locked=value;preview();$('game-stage').setAttribute('aria-disabled',String(value));}
  function setup(onFire) {
    fire=onFire;const stage=$('game-stage');
    stage.addEventListener('pointermove',event=>{
      if(locked||!map)return;const box=$('stage-scene').getBoundingClientRect();
      const vector={x:(event.clientX-box.left)/scale-map.launcher.x,y:(event.clientY-box.top)/scale-map.launcher.y};
      if(Math.hypot(vector.x,vector.y)>1){direction=vector;preview();}
    });
    stage.addEventListener('click',()=>{if(!locked)fire({...direction});});
    stage.addEventListener('keydown',event=>{
      if(locked)return;
      if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) {
        event.preventDefault();const angle=Math.atan2(direction.y,direction.x)+(event.key==='ArrowLeft'||event.key==='ArrowUp'?-.045:.045);
        direction={x:Math.cos(angle),y:Math.sin(angle)};preview();
      }else if(event.key===' '||event.key==='Enter'){event.preventDefault();fire({...direction});}
    });
    new ResizeObserver(fit).observe(stage);
  }
  function boxAt(point,diameter=map.diameter){const box=$('stage-scene').getBoundingClientRect();return {left:box.left+(point.x-diameter/2)*scale,top:box.top+(point.y-diameter/2)*scale,width:diameter*scale,height:diameter*scale};}
  function pathFrames(from,to){const end=slot(map,to),frames=[];for(let i=0;i<=12;i++){const p=at(map,map.diameter+(from+(to-from)*i/12)*map.pitch);frames.push({transform:`translate(${p.x-end.x}px,${p.y-end.y}px)`,offset:i/12});}return frames;}
  return {setup,render,setLocked,resolve,slot,at,finish,drawPath,boxAt,pathFrames,get map(){return map;},get scale(){return scale;}};
})();
