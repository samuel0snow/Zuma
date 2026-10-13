'use strict';
const $ = id => document.getElementById(id);
let state = null, levels = [], specials = false, busy = false, connected = false;
let view = 'mode', messages = [], turnEvents = [];
const titles = {1: '回声之环', 2: '五色回廊'};
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
  for (const name of ['mode', 'level', 'game']) $(`${name}-page`).hidden = name !== next;
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
}
function ball(color, sizeClass = '') {
  const element = document.createElement('span');
  element.className = `ball color-${color} ${sizeClass}`;
  element.textContent = color;
  element.setAttribute('aria-label', `${{R:'红',G:'绿',B:'蓝',Y:'黄',P:'紫'}[color]}球 ${color}`);
  return element;
}
function ballColumn(item) {
  const column = document.createElement('div');
  column.className = 'track-ball'; column.dataset.ballId = item.id;
  column.append(ball(item.color));
  if (item.special) { const label = document.createElement('span'); label.className = 'special-tag'; label.textContent = item.special; column.append(label); }
  return column;
}
function renderLevels() {
  const container = $('level-list'); container.replaceChildren();
  $('selected-mode').textContent = specials ? '特殊属性模式 · 10% 属性概率' : '经典模式';
  for (const level of levels) {
    const card = document.createElement('article'); card.className = 'level-card';
    const number = document.createElement('div'); number.className = 'level-number'; number.textContent = String(level.id).padStart(2, '0');
    const title = document.createElement('h2'); title.textContent = level.title;
    const subtitle = document.createElement('p'); subtitle.className = 'muted'; subtitle.textContent = level.id === 1 ? '从一次蓝色连锁开始。' : '在交错的色彩中，寻找下一次相遇。';
    const preview = document.createElement('div'); preview.className = 'level-preview';
    for (const color of level.active || '') preview.append(ball(color));
    const detail = document.createElement('div'); detail.className = 'level-detail';
    detail.textContent = level.available ? `轨道容量 ${level.maxLength}   /   等待彩球 ${level.feedCount}` : `关卡暂不可用：${level.error}`;
    const start = document.createElement('button'); start.className = 'primary wide'; start.dataset.level = level.id; start.textContent = `进入关卡 ${level.id} →`; start.addEventListener('click', () => startGame(level.id));
    card.append(number, title, subtitle, preview, detail, start); container.append(card);
  }
  lock();
}
function renderGame() {
  $('game-heading').textContent = `关卡 ${state.levelId} · ${titles[state.levelId]}`;
  $('game-mode').textContent = state.specialsEnabled ? '特殊属性模式 / 10% 属性概率' : '经典模式';
  $('score').textContent = state.score; $('turns').textContent = state.turns;
  $('length').textContent = `${state.track.length} / ${state.maxLength}`;
  const finished = state.status !== 'playing';
  $('track-status').textContent = state.status === 'won' ? '全部清空' : state.status === 'lost' ? '超出容量' : state.stoppedTurns ? '停滞中' : state.track.length === state.maxLength ? '轨道已满' : '等待发射';
  $('track-hint').textContent = finished ? '本局已结束，重新开始可以选择新的玩法与关卡。' : '点击编号，将当前球发射到对应间隙。';
  $('stop-remaining').hidden = !state.stoppedTurns; $('stop-remaining').textContent = `停滞剩余: ${state.stoppedTurns} 回合`;
  const track = $('track'); track.replaceChildren();
  for (let i = 0; i <= state.track.length; ++i) {
    const gap = document.createElement('button'); gap.className = 'gap'; gap.textContent = i + 1;
    gap.setAttribute('aria-label', `在位置 ${i + 1} 发射`); gap.dataset.position = i + 1;
    gap.addEventListener('click', () => action('shoot', i + 1)); track.append(gap);
    if (i < state.track.length) track.append(ballColumn(state.track[i]));
  }
  const space = Math.max(0, state.maxLength - state.track.length);
  for (let i = 0; i < Math.min(space, 12); ++i) { const empty = document.createElement('span'); empty.className = 'empty-slot'; empty.setAttribute('aria-hidden', 'true'); track.append(empty); }
  $('capacity-label').textContent = state.track.length > state.maxLength ? `超出 ${state.track.length - state.maxLength} 格` : `还有 ${space} 格空间`;
  $('capacity-fill').style.width = `${Math.min(100, state.track.length / state.maxLength * 100)}%`;
  $('capacity-fill').parentElement.classList.toggle('danger', state.track.length >= state.maxLength);
  const feed = $('feed'); feed.replaceChildren();
  for (const item of state.feed) feed.append(ballColumn(item));
  if (!state.feed.length) { const empty = document.createElement('span'); empty.className = 'muted'; empty.textContent = '等待区已清空'; feed.append(empty); }
  $('feed-count').textContent = `剩余 ${state.feed.length} 颗 · 从左向右进入`;
  $('current-ball').replaceChildren(ball(state.currentBall)); $('next-ball').replaceChildren(ball(state.nextBall));
  $('result').hidden = !finished; $('result').classList.toggle('lost', state.status === 'lost');
  $('result-symbol').textContent = state.status === 'won' ? '✧' : '×';
  $('result-title').textContent = state.status === 'won' ? '回廊已清空，胜利！' : '轨道超过上限，本局结束';
  $('result-description').textContent = `最终得分 ${state.score} · 完成 ${state.turns} 回合`;
  const events = $('events'); events.replaceChildren();
  const deleted = turnEvents.filter(event => ['eliminate','chain_eliminate'].includes(event.type)).reduce((sum, event) => sum + event.scoreDelta, 0);
  if (deleted) { const p = document.createElement('p'); p.textContent = `消除 ${deleted / 10} 颗彩球，获得 ${deleted} 分。`; events.append(p); }
  for (const message of messages) { const p = document.createElement('p'); p.className = 'effect'; p.textContent = message; events.append(p); }
  if (!events.childElementCount) events.textContent = state.turns ? '状态已更新。观察轨道，选择下一步。' : '选好位置，开始你的第一步。';
  showView('game'); lock();
}
function accept(data, authoritative = false) {
  if (!authoritative && state && data.state.version < state.version) return;
  const wasGame = view === 'game';
  state = data.state;
  messages = data.messages || []; turnEvents = data.events || [];
  if (state.status !== 'ready') renderGame();
  else if (wasGame) { specials = false; selectMode(false); showView('mode'); }
  lock();
}
async function sync() {
  const data = await request('/api/game');
  accept(data, true); setConnected(true);
}
async function mutate(path, extras = {}) {
  if (busy || !connected || !state) return;
  busy = true; notice(); lock();
  const previousSession = state.sessionId;
  try {
    const data = await request(path, {sessionId: state.sessionId, version: state.version, requestId: requestId(), ...extras});
    accept(data);
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
function startGame(id) { return mutate('/api/game', {levelId:id, specialsEnabled:specials}); }
function action(type, position) { return mutate('/api/action', type === 'shoot' ? {type, position} : {type}); }
async function restart() { await mutate('/api/reset'); }
for (const button of document.querySelectorAll('[data-mode]')) button.addEventListener('click', () => selectMode(button.dataset.mode === 'special'));
$('choose-level').addEventListener('click', chooseLevels);
$('back-mode').addEventListener('click', () => { showView('mode'); notice(); });
$('discard').addEventListener('click', () => action('discard'));
$('restart').addEventListener('click', restart); $('result-restart').addEventListener('click', restart);
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
init();
