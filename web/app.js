'use strict';
const $ = id => document.getElementById(id);
let state = null, levels = [], history = [], specials = false, busy = false, connected = false, recapOpen = false;
let view = 'mode', messages = [], turnEvents = [];
let selectedMap='straight';
const mapNames={straight:'直线地图',spiral:'螺旋类环形地图',s:'S 形地图'};
function requestId() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
async function request(path, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(path, {method: body ? 'POST' : 'GET', headers: body ? {'Content-Type': 'application/json', 'X-Zuma-Client': '1'} : {}, body: body ? JSON.stringify(body) : undefined, signal: controller.signal, cache: 'no-store'});
    const data = await response.json();
    if (!response.ok) { const error = new Error(data.error?.message || '请求失败'); error.api = true; throw error; }
    return data;
  } finally { clearTimeout(timeout); }
}
function notice(text = '') { $('notice').textContent = text; $('notice').hidden = !text; }
function showView(next) {
  view = next;
  document.body.dataset.view=next;
  for (const name of ['mode', 'map', 'level', 'game']) $(`${name}-page`).hidden = name !== next;
}
function setConnected(value) {
  connected = value;
  $('connection').textContent = value ? '已连接' : '未连接';
  $('connection').classList.toggle('disconnected', !value);
  $('offline').hidden = value;
  lock();
}
function lock() {
  for (const button of document.querySelectorAll('main button')) button.disabled = busy || !connected;
  if (state?.status !== 'playing') {
    $('discard').disabled = true;
    for (const gap of document.querySelectorAll('.gap')) gap.disabled = true;
  }
  for (const button of document.querySelectorAll('[data-level]')) {
    const level = levels.find(item => item.id === Number(button.dataset.level));
    button.disabled = busy || !connected || !level?.available;
  }
  $('reconnect').disabled = busy;
  $('skip-animation').disabled = false;
  window.ZumaStage.setLocked(busy||!connected||view!=='game'||state?.status!=='playing');
}
function ball(color, sizeClass = '') {
  const element = document.createElement('span');
  element.className = `ball color-${color} ${sizeClass}`;
  element.dataset.color = color;
  const colors = {R:'red',G:'green',B:'blue',Y:'yellow',P:'purple'};
  const image = document.createElement('img'); image.src = `/assets/balls/gemstone/${colors[color]}.webp`;
  image.alt='';image.className='ball-art';image.draggable=false;
  image.addEventListener('error',()=>image.remove(),{once:true});
  element.append(image);
  element.setAttribute('aria-label', `${{R:'红',G:'绿',B:'蓝',Y:'黄',P:'紫'}[color]}球 ${color}`);
  return element;
}
function ballColumn(item) {
  const column = document.createElement('div');
  column.className = 'track-ball'; column.dataset.ballId = item.id;
  column.append(ball(item.color));
  if (item.special) {
    const label = document.createElement('span'); label.className = 'special-tag';
    const image = document.createElement('img');image.src=`/assets/icons/ui/${item.special.toLowerCase()}.svg`;image.alt='';image.addEventListener('error',()=>image.remove(),{once:true});
    label.append(image,document.createTextNode(item.special));column.append(label);
  }
  return column;
}
function renderLevels() {
  const container = $('level-list'); container.replaceChildren();
  $('selected-mode').textContent = `${specials ? '特殊属性模式 · 各属性 10%' : '经典模式'} · ${mapNames[selectedMap]}`;
  if(!levels.length){const empty=document.createElement('p');empty.className='muted';empty.textContent='关卡目录中没有可用的 levelN.txt 文件。';container.append(empty);}
  for (const level of levels) {
    const card = document.createElement('article'); card.className = 'level-card';
    const title = document.createElement('h2'); title.textContent = `关卡 ${level.id}`;
    const preview = document.createElement('div'); preview.className = 'level-preview';
    for (const color of level.active || '') preview.append(ball(color));
    const detail = document.createElement('div'); detail.className = 'level-detail';
    detail.textContent = level.available ? `轨道容量 ${level.maxLength}   /   等待彩球 ${level.feedCount}` : `关卡暂不可用：${level.error}`;
    const start = document.createElement('button'); start.className = 'primary wide'; start.dataset.level = level.id; start.textContent = '开始游戏 →'; start.setAttribute('aria-label',`开始关卡 ${level.id}`); start.addEventListener('click', () => startGame(level.id));
    card.append(title, preview, detail, start); container.append(card);
  }
  lock();
}
function renderGame(game = state) {
  showView('game');
  $('game-heading').textContent = `关卡 ${game.levelId}`;
  $('game-mode').textContent = `${game.specialsEnabled ? '特殊属性模式' : '经典模式'} · ${mapNames[game.mapId]||'直线地图'}`;
  $('score').textContent = game.score; $('turns').textContent = game.turns;
  $('length').textContent = `${game.track.length} / ${game.maxLength}`;
  const finished = game.status !== 'playing';
  $('game-page').classList.toggle('finished',finished);
  $('restart').hidden = finished;
  $('finish-game').hidden = finished;
  document.querySelector('.ammo-panel').hidden = finished;
  document.querySelector('.events-panel').hidden = finished;
  $('track-status').textContent = game.status === 'won' ? '全部清空' : game.status === 'lost' ? '超出容量' : game.stoppedTurns ? '停滞中' : game.track.length === game.maxLength ? '轨道已满' : '等待发射';
  $('track-hint').textContent = finished ? '本局已结束，可查看复盘或重新选择玩法、地图与关卡。' : '移动鼠标瞄准，点击舞台发射。未命中会吐球并消耗回合。';
  $('stop-remaining').hidden = finished || !game.stoppedTurns; $('stop-remaining').textContent = `停滞剩余: ${game.stoppedTurns} 回合`;
  window.ZumaStage.render(game,ballColumn);
  const feed = $('feed'); feed.replaceChildren();
  for (const item of game.feed) feed.append(ballColumn(item));
  if (!game.feed.length) { const empty = document.createElement('span'); empty.className = 'muted'; empty.textContent = '等待区已清空'; feed.append(empty); }
  $('feed-count').textContent = `剩余 ${game.feed.length} 颗 · 依次入轨`;
  $('current-ball').replaceChildren(ball(game.currentBall)); $('next-ball').replaceChildren(ball(game.nextBall));
  $('result').hidden = !finished; $('result').classList.toggle('lost', game.status === 'lost');
  const badge=document.createElement('img');badge.src=`/assets/icons/ui/${game.status === 'won' ? 'victory' : 'defeat'}.svg`;badge.alt='';
  if(game.status==='ended'){const mark=document.createElement('span');mark.className='ended-mark';mark.textContent='Ⅱ';$('result-symbol').replaceChildren(mark);}
  else $('result-symbol').replaceChildren(badge);
  $('result-title').textContent = game.status === 'won' ? '回廊已清空，胜利！' : game.status === 'lost' ? '彩球越过终点' : game.status === 'ended' ? '本局已主动结束' : '本局结束';
  $('result-description').textContent = `最终得分 ${game.score} · 完成 ${game.turns} 回合`;
  const events = $('events'); events.replaceChildren();
  const deleted = turnEvents.filter(event => ['eliminate','chain_eliminate'].includes(event.type)).reduce((sum, event) => sum + event.scoreDelta, 0);
  const summary=[];
  if(deleted)summary.push(`消除 ${deleted/10} 颗，+${deleted} 分`);
  const stopAdded=messages.reduce((sum,message)=>sum+Number(message.match(/^Stop:.*增加 (\d+) 回合$/)?.[1]||0),0);
  if(stopAdded)summary.push(`停滞增加 ${stopAdded} 回合`);
  if(turnEvents.some(event=>event.type==='stop_skip'))summary.push('Stop: 本回合停滞中');
  const backs=turnEvents.filter(event=>event.type==='back');
  if(backs.length){const count=backs.reduce((sum,event)=>sum+event.ballIds.length,0);summary.push(count?`Back: 彩球回退 ${count} 格`:'Back: 无彩球可回退');}
  const booms=turnEvents.filter(event=>event.type==='boom').length;
  if(booms)summary.push(`Boom: 爆破 ${booms} 次`);
  if(turnEvents.some(event=>event.type==='spit'))summary.unshift('吐球：当前球已弃用');
  events.textContent=finished?'本局已结束。':summary.join('；') || (game.turns?'回合结束。':'选好位置，开始你的第一步。');
  events.classList.toggle('effect',Boolean(stopAdded||backs.length||booms||game.stoppedTurns));
  const details=$('event-details'),list=$('event-list');list.replaceChildren();
  details.hidden=finished||!messages.length;
  // Leave an opened disclosure stable across animation snapshots; collapse for a new turn.
  const turnKey=`${game.sessionId}:${game.turns}`;
  if(details.dataset.turn!==turnKey){details.open=false;details.dataset.turn=turnKey;}
  for(const message of messages){const p=document.createElement('p');p.className='effect';p.textContent=message.replace('彩球回退0格','无彩球可回退');list.append(p);}
  showView('game'); lock(); renderRecap();
}
function renderRecap() {
  const panel=$('turn-replay');
  const ended=view==='game'&&state&&state.status!=='playing';
  panel.hidden=!ended||!recapOpen;
  if(!ended)return;
  $('replay-summary').textContent=`${history.length} 个已完成回合 · 最终得分 ${state.score}`;
  const flow=$('replay-flow');flow.replaceChildren();
  if(!history.length){const empty=document.createElement('p');empty.className='muted replay-empty';empty.textContent='本局尚未完成回合，没有可展示的回合状态。';flow.append(empty);return;}
  for(const turn of history){
    const step=document.createElement('article');step.className='replay-step';
    const head=document.createElement('header');head.className='replay-step-heading';
    const title=document.createElement('h3');title.textContent=`第 ${turn.turn} 回合`;
    const actionText=turn.action==='shoot'?`${turn.aim?.kind==='gap'?'命中两球间隙，':'瞄准发射，'}插入位置 ${turn.position}`:turn.action==='spit'?'未命中，吐球弃用':'丢弃当前球';
    const actionLabel=document.createElement('span');actionLabel.textContent=actionText;
    const result=document.createElement('strong');result.textContent=`${turn.scoreDelta>0?'+':''}${turn.scoreDelta} 分 · 累计 ${turn.score}`;
    head.append(title,actionLabel,result);step.append(head);
    const mapLabel=document.createElement('p');mapLabel.className='replay-ammo';mapLabel.textContent=mapNames[turn.mapId||state.mapId];step.append(mapLabel);
    const scene=document.createElementNS('http://www.w3.org/2000/svg','svg');scene.classList.add('replay-map');scene.setAttribute('viewBox',`0 0 ${state.map.width} ${state.map.height}`);scene.setAttribute('aria-label',`第 ${turn.turn} 回合地图实际状态`);
    window.ZumaStage.drawPath(scene,state.map,state.maxLength);
    const colors={R:'red',G:'green',B:'blue',Y:'yellow',P:'purple'};
    for(let i=0;i<turn.state.track.length;i++){const p=window.ZumaStage.slot(state.map,i),image=document.createElementNS(scene.namespaceURI,'image');image.setAttribute('href',`/assets/balls/gemstone/${colors[turn.state.track[i].color]}.webp`);image.setAttribute('x',p.x-state.map.diameter/2);image.setAttribute('y',p.y-state.map.diameter/2);image.setAttribute('width',state.map.diameter);image.setAttribute('height',state.map.diameter);scene.append(image);}
    if(turn.aim){const ray=document.createElementNS(scene.namespaceURI,'line');ray.setAttribute('x1',state.map.launcher.x);ray.setAttribute('y1',state.map.launcher.y);ray.setAttribute('x2',turn.aim.impact.x);ray.setAttribute('y2',turn.aim.impact.y);ray.setAttribute('class','aim-ray');scene.append(ray);}
    step.append(scene);
    const snapshot=turn.state,board=document.createElement('div');board.className='replay-board';
    const trackRow=document.createElement('div');trackRow.className='replay-state-row';
    const trackLabel=document.createElement('span');trackLabel.className='replay-label';trackLabel.textContent=`TRACK · ${snapshot.track.length} / ${state.maxLength}`;
    const balls=document.createElement('div');balls.className='replay-balls';
    for(const item of snapshot.track)balls.append(ballColumn(item));
    if(!snapshot.track.length){const empty=document.createElement('span');empty.className='muted';empty.textContent='空';balls.append(empty);}
    trackRow.append(trackLabel,balls);board.append(trackRow);
    const feedRow=document.createElement('div');feedRow.className='replay-state-row';
    const feedLabel=document.createElement('span');feedLabel.className='replay-label';feedLabel.textContent=`FEED · ${snapshot.feed.length} 颗`;
    const feed=document.createElement('div');feed.className='replay-feed';
    for(const item of snapshot.feed){
      const column=document.createElement('div');column.className='replay-feed-column';column.dataset.ballId=item.id;
      const dot=ball(item.color);dot.classList.add('replay-feed-ball');column.append(dot);
      if(item.special){const tag=document.createElement('span');tag.className='replay-feed-special';tag.textContent=item.special;column.append(tag);}
      feed.append(column);
    }
    if(!snapshot.feed.length){const empty=document.createElement('span');empty.className='muted';empty.textContent='空';feed.append(empty);}
    feedRow.append(feedLabel,feed);board.append(feedRow);step.append(board);
    const ammo=document.createElement('p');ammo.className='replay-ammo';ammo.textContent=`发射球 · 当前 ${snapshot.currentBall} / 下一颗 ${snapshot.nextBall}`;step.append(ammo);
    const phases=document.createElement('div');phases.className='replay-phases';
    const phaseName={insert:e=>`发射至位置 ${e.from}`,discard:()=> '丢弃当前球',spit:()=> '吐球弃用',eliminate:e=>`消除 ${e.ballIds.length} 颗`,chain_eliminate:e=>`连锁消除 ${e.ballIds.length} 颗`,boom:e=>`Boom 清除第 ${e.from}–${e.to} 格`,stop_trigger:()=> 'Stop 触发',stop_skip:()=> 'Stop 停滞',back:e=>`Back 回退 ${e.ballIds.length} 颗`,feed:()=> '等待球入轨',ammo_update:()=> '弹药更新',turn_end:()=> '回合结算',won:()=> '胜利',lost:()=> '失败'};
    for(const event of turn.events||[]){const name=phaseName[event.type];if(!name)continue;const chip=document.createElement('span');chip.className='replay-event-phase';chip.textContent=name(event);if(event.scoreDelta)chip.textContent+=` · +${event.scoreDelta} 分`;phases.append(chip);}
    if(phases.childElementCount)step.append(phases);
    const notes=document.createElement('div');notes.className='replay-notes';
    for(const message of turn.messages||[]){const line=document.createElement('p');line.textContent=message;notes.append(line);}
    if(!notes.childElementCount){const line=document.createElement('p');line.textContent='本回合没有消除或特殊效果。';notes.append(line);}
    const tail=document.createElement('p');tail.className='replay-tail';tail.textContent=`回合结束后：${snapshot.status==='won'?'胜利':snapshot.status==='lost'?'失败':snapshot.status==='ended'?'结束':'继续'} · 等待区 ${snapshot.feed.length} 颗${snapshot.stoppedTurns?` · 停滞剩余 ${snapshot.stoppedTurns} 回合`:''}`;
    step.append(notes,tail);flow.append(step);
  }
}
async function refreshHistory(){const data=await request('/api/history');history=data.turns||[];renderRecap();}
function accept(data, authoritative = false) {
  if (!authoritative && state && data.state.version < state.version) return;
  const wasGame = view === 'game';
  if(data.state.status==='ready'||(data.state.status!=='playing'&&data.state.status!==state?.status))recapOpen=false;
  state = data.state;
  messages = data.messages || []; turnEvents = data.events || [];
  if (state.status !== 'ready') renderGame();
  else if (wasGame) { specials = false; selectMode(false); showView('mode'); }
  lock();
}
async function sync() {
  const data = await request('/api/game');
  accept(data, true); await refreshHistory(); setConnected(true);
}
async function mutate(path, extras = {}) {
  if (busy || !connected || !state) return;
  busy = true; notice(); lock();
  const previousSession = state.sessionId;
  try {
    const data = await request(path, {sessionId: state.sessionId, version: state.version, requestId: requestId(), ...extras});
    if (path === '/api/action' && data.events?.length) {
      messages=[];turnEvents=[];
      try { await window.ZumaAnimation.play(data.events, snapshot => renderGame({...data.state,...snapshot,status:'playing'})); }
      catch { notice('动画已略过，当前状态已同步。'); }
      finally { accept(data); }
      // Another page may reset or advance the shared game while we animate.
      // Keep the committed result, then reconcile against the current session.
      const latest=await request('/api/game');
      if(latest.state.sessionId!==data.state.sessionId||latest.state.version!==data.state.version) {
        accept(latest,true);notice('其他页面已改变游戏，已同步当前状态。');
      }
    } else accept(data);
    if(path==='/api/reset'||path==='/api/game'){history=[];renderRecap();}
    else if(path==='/api/action')await refreshHistory();
  } catch (error) {
    notice(error.api ? error.message : '请求未能确认。正在同步游戏状态，操作不会自动重发。');
    try {
      await sync();
      if (!error.api) notice('已重新同步游戏状态，请查看当前回合后继续。');
      else if (state.sessionId !== previousSession) notice('其他页面已改变游戏，已同步当前状态。');
    } catch { setConnected(false); }
  } finally { busy = false; lock(); }
}
function selectMode(enabled) {
  specials = enabled;
  for (const button of document.querySelectorAll('[data-mode]')) button.setAttribute('aria-pressed', String((button.dataset.mode === 'special') === enabled));
  $('special-help').hidden = !enabled;
}
async function chooseLevels() {
  if (busy || !connected) return;
  busy = true; lock(); notice();
  try { levels = (await request('/api/levels')).levels; renderLevels(); showView('level'); }
  catch (error) { notice(error.message || '无法读取关卡'); setConnected(false); }
  finally { busy = false; lock(); }
}
function startGame(id) { return mutate('/api/game', {levelId:id, specialsEnabled:specials,mapId:selectedMap}); }
function action(type, position) { return mutate('/api/action', type === 'shoot' ? {type, position} : {type}); }
async function restart() { await mutate('/api/reset'); }
for (const button of document.querySelectorAll('[data-mode]')) button.addEventListener('click', () => selectMode(button.dataset.mode === 'special'));
$('choose-level').addEventListener('click',()=>{$('map-mode').textContent=specials?'特殊属性模式':'经典模式';showView('map');notice();});
for(const button of document.querySelectorAll('[data-map]'))button.addEventListener('click',()=>{selectedMap=button.dataset.map;chooseLevels();});
$('back-mode').addEventListener('click', () => { showView('mode'); notice(); });
$('back-map').addEventListener('click',()=>{showView('map');notice();});
$('discard').addEventListener('click', () => action('discard'));
$('finish-game').addEventListener('click', () => action('end'));
$('restart').addEventListener('click', restart); $('result-restart').addEventListener('click', restart);
$('result-recap').addEventListener('click',()=>{recapOpen=true;renderRecap();$('turn-replay').scrollIntoView({behavior:'smooth',block:'start'});});
$('close-replay').addEventListener('click',()=>{recapOpen=false;renderRecap();});
$('skip-animation').addEventListener('click',()=>window.ZumaAnimation.finish());
$('rules-toggle').addEventListener('click', () => $('rules').showModal()); $('rules-close').addEventListener('click', () => $('rules').close());
$('reconnect').addEventListener('click', async () => {
  busy = true; lock();
  try { await sync(); notice('连接已恢复，已同步当前游戏。'); }
  catch { notice('服务仍未连接，请确认游戏服务正在运行。'); setConnected(false); }
  finally { busy = false; lock(); }
});
async function init() {
  busy = true; lock();
  try { await sync(); }
  catch { setConnected(false); notice('暂时无法连接游戏服务，请尝试重新连接。'); }
  finally { busy = false; lock(); }
}
for(const element of document.querySelectorAll('.hero-balls .ball'))element.replaceWith(ball(element.textContent.trim()));
const spiralPreview=document.querySelector('[data-map="spiral"] path');
spiralPreview.setAttribute('d',Array.from({length:101},(_,i)=>{const t=i/100,a=-.3+2*Math.PI*2.15*t,r=84-53*t;return `${i?'L':'M'}${160+r*1.6*Math.cos(a)},${90+r*.8*Math.sin(a)}`;}).join(' '));
window.ZumaStage.setup(direction=>mutate('/api/action',{type:'shoot',direction}));
init();
