// Оборона базы — этап 1: build mode + игровой цикл + бой + волна.
const tg = window.Telegram && window.Telegram.WebApp;

// ===== Конфиг поля =====
const COLS = 5;
const ROWS = 10;
const BASE_COLS = 3;
const BASE_ROWS = 3;
const BASE_LEFT_COL = Math.floor((COLS - BASE_COLS) / 2); // 1
const BASE_TOP_ROW = ROWS - BASE_ROWS;                    // 7

// ===== Типы зданий =====
const BUILDINGS = {
  barracks: {
    id: 'barracks',
    name: 'Казарма',
    cols: 2, rows: 1,
    color: '#8a5a3b',
    edge: '#c9905c',
    icon: '⚔',
    spawnEveryMs: 4500,
    unitType: 'warrior',
  },
};

// ===== Типы юнитов =====
const UNITS = {
  warrior: {
    team: 'ally',
    hpMax: 30, dmg: 6, speed: 38, atkRange: 18, atkCdMs: 700,
    aggroRange: 220, radius: 9, color: '#4ade80', edge: '#0d4f24', icon: '⚔',
  },
  goblin: {
    team: 'enemy',
    hpMax: 22, dmg: 5, speed: 30, atkRange: 18, atkCdMs: 800,
    aggroRange: 220, radius: 9, color: '#dc2626', edge: '#5a0e0e', icon: '👹',
  },
};

// ===== State =====
const state = {
  mode: 'build',          // 'build' | 'battle' | 'wave-end' | 'defeat'
  coins: 0,
  wave: 1,
  baseHp: 100,
  baseHpMax: 100,
  buildings: [],          // { type, col, row }
  allies: [],
  enemies: [],
  enemiesToSpawn: 0,
  enemySpawnAccum: 0,
  enemySpawnEveryMs: 1300,
  unitIdSeq: 1,
  drag: null,             // { type, x, y, pointerId }
  dragHover: null,        // { anchorCol, anchorRow, valid, inField }
};

// ===== DOM =====
const wrap = document.getElementById('bd-canvas-wrap');
const canvas = document.getElementById('bd-canvas');
const ctx = canvas.getContext('2d');
const titleEl = document.getElementById('bd-title');
const coinsEl = document.getElementById('bd-coins');
const hintEl = document.getElementById('bd-hint');
const startBtn = document.getElementById('bd-start');
const resetBtn = document.getElementById('bd-reset');
const backBtn = document.getElementById('bd-back');
const paletteEl = document.getElementById('bd-palette');
const sourceBarracksEl = document.getElementById('bd-source-barracks');

// ===== Layout =====
let dpr = window.devicePixelRatio || 1;
let cellSize = 60;
let fieldW = COLS * cellSize;
let fieldH = ROWS * cellSize;
let offsetX = 0;
let offsetY = 0;

// ===== Telegram =====
function initTelegram() {
  if (!tg) return;
  try {
    tg.ready();
    tg.expand();
    if (tg.setHeaderColor) tg.setHeaderColor('#0e1624');
    if (tg.setBackgroundColor) tg.setBackgroundColor('#0e1624');
    if (tg.BackButton) {
      tg.BackButton.show && tg.BackButton.show();
      tg.BackButton.onClick && tg.BackButton.onClick(goLauncher);
    }
  } catch (_) {}
}

function haptic(kind) {
  if (!tg || !tg.HapticFeedback) return;
  try {
    if (kind === 'impact') tg.HapticFeedback.impactOccurred('light');
    else if (kind === 'success') tg.HapticFeedback.notificationOccurred('success');
    else if (kind === 'fail') tg.HapticFeedback.notificationOccurred('error');
  } catch (_) {}
}

function goLauncher() {
  location.href = '../../';
}

// ===== Resize =====
function resize() {
  dpr = window.devicePixelRatio || 1;
  const cssW = wrap.clientWidth;
  const cssH = wrap.clientHeight;
  if (cssW <= 0 || cssH <= 0) return;
  const byW = Math.floor((cssW - 16) / COLS);
  const byH = Math.floor((cssH - 16) / ROWS);
  cellSize = Math.max(24, Math.min(byW, byH));
  fieldW = cellSize * COLS;
  fieldH = cellSize * ROWS;
  offsetX = Math.floor((cssW - fieldW) / 2);
  offsetY = Math.floor((cssH - fieldH) / 2);
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// ===== Координаты =====
function colToX(col) { return offsetX + col * cellSize; }
function rowToY(row) { return offsetY + row * cellSize; }
function isInsideBaseArea(col, row) {
  return col >= BASE_LEFT_COL && col < BASE_LEFT_COL + BASE_COLS
      && row >= BASE_TOP_ROW  && row < BASE_TOP_ROW + BASE_ROWS;
}

// ===== Постановка зданий =====
function cellsOccupiedBy(b) {
  const cells = [];
  for (let dc = 0; dc < BUILDINGS[b.type].cols; dc++) {
    for (let dr = 0; dr < BUILDINGS[b.type].rows; dr++) {
      cells.push([b.col + dc, b.row + dr]);
    }
  }
  return cells;
}

function isOccupied(col, row) {
  for (const b of state.buildings) {
    for (const [cc, rr] of cellsOccupiedBy(b)) {
      if (cc === col && rr === row) return true;
    }
  }
  return false;
}

function canPlace(type, col, row) {
  const def = BUILDINGS[type];
  for (let dc = 0; dc < def.cols; dc++) {
    for (let dr = 0; dr < def.rows; dr++) {
      const cc = col + dc;
      const rr = row + dr;
      if (!isInsideBaseArea(cc, rr)) return false;
      if (isOccupied(cc, rr)) return false;
    }
  }
  return true;
}

function placeBuilding(type, col, row) {
  state.buildings.push({ type, col, row, lastSpawnT: 0 });
  haptic('impact');
}

// ===== Drag-and-drop постановка =====
function pickHover(type, cssX, cssY) {
  const def = BUILDINGS[type];
  const inField = cssX >= offsetX && cssX <= offsetX + fieldW
               && cssY >= offsetY && cssY <= offsetY + fieldH;
  // курсор соответствует центру здания → anchor смещаем влево/вверх
  const fx = (cssX - offsetX) / cellSize - def.cols / 2;
  const fy = (cssY - offsetY) / cellSize - def.rows / 2;
  let anchorCol = Math.round(fx);
  let anchorRow = Math.round(fy);
  // не выходим за поле
  anchorCol = Math.max(0, Math.min(COLS - def.cols, anchorCol));
  anchorRow = Math.max(0, Math.min(ROWS - def.rows, anchorRow));
  const valid = inField && canPlace(type, anchorCol, anchorRow);
  return { anchorCol, anchorRow, valid, inField };
}

function startDrag(e, type) {
  if (state.mode !== 'build' && state.mode !== 'wave-end') return;
  if (state.drag) return;
  e.preventDefault();
  state.drag = { type, x: e.clientX, y: e.clientY, pointerId: e.pointerId };
  sourceBarracksEl.classList.add('dragging');
  try { sourceBarracksEl.setPointerCapture(e.pointerId); } catch (_) {}
  sourceBarracksEl.addEventListener('pointermove', onDragMove);
  sourceBarracksEl.addEventListener('pointerup', onDragUp);
  sourceBarracksEl.addEventListener('pointercancel', onDragCancel);
  updateDragHover();
}

function onDragMove(e) {
  if (!state.drag || e.pointerId !== state.drag.pointerId) return;
  state.drag.x = e.clientX;
  state.drag.y = e.clientY;
  updateDragHover();
}

function onDragUp(e) {
  if (!state.drag || e.pointerId !== state.drag.pointerId) return;
  const hover = state.dragHover;
  const type = state.drag.type;
  endDrag(e);
  if (hover && hover.valid) {
    placeBuilding(type, hover.anchorCol, hover.anchorRow);
  } else if (hover && hover.inField) {
    flashHint('Здесь не помещается');
    haptic('fail');
  }
}

function onDragCancel(e) {
  if (!state.drag || e.pointerId !== state.drag.pointerId) return;
  endDrag(e);
}

function endDrag(e) {
  try { sourceBarracksEl.releasePointerCapture(e.pointerId); } catch (_) {}
  sourceBarracksEl.classList.remove('dragging');
  sourceBarracksEl.removeEventListener('pointermove', onDragMove);
  sourceBarracksEl.removeEventListener('pointerup', onDragUp);
  sourceBarracksEl.removeEventListener('pointercancel', onDragCancel);
  state.drag = null;
  state.dragHover = null;
}

function updateDragHover() {
  if (!state.drag) { state.dragHover = null; return; }
  const rect = canvas.getBoundingClientRect();
  const cssX = state.drag.x - rect.left;
  const cssY = state.drag.y - rect.top;
  state.dragHover = pickHover(state.drag.type, cssX, cssY);
}

let hintTimer = 0;
function flashHint(msg) {
  hintEl.textContent = msg;
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => syncHint(), 1500);
}

function syncHint() {
  if (state.mode === 'build') {
    hintEl.textContent = 'Перетяни казарму на клетки базы → «Бой»';
  } else if (state.mode === 'battle') {
    hintEl.textContent = `Волна ${state.wave}: осталось врагов ${state.enemies.length + state.enemiesToSpawn}`;
  } else if (state.mode === 'wave-end') {
    hintEl.textContent = `Волна ${state.wave - 1} пройдена! +${WAVE_REWARD} 🪙`;
  } else if (state.mode === 'defeat') {
    hintEl.textContent = `База разрушена. Тапни «Сброс», чтобы перезапустить`;
  }
}

// ===== Волна =====
const WAVE_REWARD = 25;
const ENEMIES_PER_WAVE = 6;

function startBattle() {
  if (state.mode !== 'build' && state.mode !== 'wave-end') return;
  if (state.buildings.length === 0) {
    flashHint('Сначала поставь хотя бы одну казарму');
    haptic('fail');
    return;
  }
  state.mode = 'battle';
  state.allies.length = 0;
  state.enemies.length = 0;
  state.enemiesToSpawn = ENEMIES_PER_WAVE + (state.wave - 1) * 2;
  state.enemySpawnAccum = 0;
  // казармы начинают спавн «сейчас»
  for (const b of state.buildings) b.lastSpawnT = 0;
  syncUi();
  haptic('impact');
}

function endWave(victory) {
  if (victory) {
    state.coins += WAVE_REWARD;
    state.wave += 1;
    state.mode = 'wave-end';
    haptic('success');
  } else {
    state.mode = 'defeat';
    haptic('fail');
  }
  state.allies.length = 0;
  state.enemies.length = 0;
  syncUi();
}

function resetAll() {
  state.mode = 'build';
  state.coins = 0;
  state.wave = 1;
  state.baseHp = state.baseHpMax;
  state.buildings.length = 0;
  state.allies.length = 0;
  state.enemies.length = 0;
  state.enemiesToSpawn = 0;
  syncUi();
  haptic('impact');
}

// ===== Юниты =====
function spawnUnit(type, x, y) {
  const def = UNITS[type];
  const u = {
    id: state.unitIdSeq++,
    type, team: def.team,
    x, y, hp: def.hpMax, hpMax: def.hpMax,
    dmg: def.dmg, speed: def.speed,
    atkRange: def.atkRange, atkCdMs: def.atkCdMs,
    aggroRange: def.aggroRange,
    radius: def.radius, color: def.color, edge: def.edge, icon: def.icon,
    atkAccum: def.atkCdMs * 0.6,    // первый удар чуть быстрее
    targetId: null,
  };
  if (def.team === 'ally') state.allies.push(u);
  else state.enemies.push(u);
  return u;
}

function spawnFromBarracks(b, dt) {
  const def = BUILDINGS[b.type];
  b.lastSpawnT = (b.lastSpawnT || 0) + dt;
  if (b.lastSpawnT < def.spawnEveryMs) return;
  b.lastSpawnT -= def.spawnEveryMs;
  // спавн над верхней клеткой здания
  const x = colToX(b.col + def.cols / 2);
  const y = rowToY(b.row) - cellSize * 0.05;
  spawnUnit(def.unitType, x, y);
}

function spawnEnemyTick(dt) {
  if (state.enemiesToSpawn <= 0) return;
  state.enemySpawnAccum += dt;
  if (state.enemySpawnAccum < state.enemySpawnEveryMs) return;
  state.enemySpawnAccum -= state.enemySpawnEveryMs;
  const x = offsetX + 12 + Math.random() * (fieldW - 24);
  const y = offsetY + 8;
  spawnUnit('goblin', x, y);
  state.enemiesToSpawn -= 1;
}

// ===== AI / движение / бой =====
function findNearest(u, list) {
  let best = null;
  let bestD2 = Infinity;
  for (const t of list) {
    if (t.hp <= 0) continue;
    const dx = t.x - u.x;
    const dy = t.y - u.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) { bestD2 = d2; best = t; }
  }
  return { target: best, dist: Math.sqrt(bestD2) };
}

function baseRect() {
  return {
    x: colToX(BASE_LEFT_COL),
    y: rowToY(BASE_TOP_ROW),
    w: BASE_COLS * cellSize,
    h: BASE_ROWS * cellSize,
  };
}

// Враги атакуют верхнюю границу базы как «фронт».
function distanceToBaseFront(enemy) {
  const r = baseRect();
  // Цель — линия y = r.y, x в [r.x, r.x + r.w]
  const cx = Math.max(r.x, Math.min(r.x + r.w, enemy.x));
  const dx = cx - enemy.x;
  const dy = r.y - enemy.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function moveTowards(u, tx, ty, dt) {
  const dx = tx - u.x;
  const dy = ty - u.y;
  const d = Math.hypot(dx, dy);
  if (d <= 0.01) return;
  const step = (u.speed * dt) / 1000;
  if (d <= step) { u.x = tx; u.y = ty; return; }
  u.x += dx / d * step;
  u.y += dy / d * step;
}

function separation(u, list, dt) {
  // лёгкая сепарация, чтобы юниты не слипались в точку
  const minDist = u.radius * 1.6;
  for (const o of list) {
    if (o === u || o.hp <= 0) continue;
    const dx = u.x - o.x;
    const dy = u.y - o.y;
    const d = Math.hypot(dx, dy);
    if (d > 0 && d < minDist) {
      const push = (minDist - d) * 0.5;
      u.x += (dx / d) * push;
      u.y += (dy / d) * push;
    }
  }
}

function updateAllies(dt) {
  for (const u of state.allies) {
    if (u.hp <= 0) continue;
    const { target, dist } = findNearest(u, state.enemies);
    u.atkAccum += dt;
    if (target && dist <= u.aggroRange) {
      if (dist <= u.atkRange + target.radius) {
        if (u.atkAccum >= u.atkCdMs) {
          u.atkAccum = 0;
          target.hp -= u.dmg;
        }
      } else {
        moveTowards(u, target.x, target.y, dt);
      }
    } else {
      // нет цели — идём вверх
      moveTowards(u, u.x, offsetY + 4, dt);
    }
    // не выходим за поле по горизонтали
    u.x = Math.max(offsetX + u.radius, Math.min(offsetX + fieldW - u.radius, u.x));
    u.y = Math.max(offsetY + u.radius, u.y);
  }
  // сепарация
  for (const u of state.allies) if (u.hp > 0) separation(u, state.allies, dt);
}

function updateEnemies(dt) {
  const r = baseRect();
  for (const u of state.enemies) {
    if (u.hp <= 0) continue;
    const { target, dist } = findNearest(u, state.allies);
    u.atkAccum += dt;
    if (target && dist <= u.aggroRange) {
      if (dist <= u.atkRange + target.radius) {
        if (u.atkAccum >= u.atkCdMs) {
          u.atkAccum = 0;
          target.hp -= u.dmg;
        }
      } else {
        moveTowards(u, target.x, target.y, dt);
      }
    } else {
      // цели нет — идём к фронту базы
      const dB = distanceToBaseFront(u);
      if (dB <= u.atkRange) {
        if (u.atkAccum >= u.atkCdMs) {
          u.atkAccum = 0;
          state.baseHp = Math.max(0, state.baseHp - u.dmg);
        }
      } else {
        const cx = Math.max(r.x, Math.min(r.x + r.w, u.x));
        moveTowards(u, cx, r.y, dt);
      }
    }
    u.x = Math.max(offsetX + u.radius, Math.min(offsetX + fieldW - u.radius, u.x));
    u.y = Math.max(offsetY + u.radius, u.y);
  }
  for (const u of state.enemies) if (u.hp > 0) separation(u, state.enemies, dt);
}

function cleanupCorpses() {
  state.allies = state.allies.filter(u => u.hp > 0);
  state.enemies = state.enemies.filter(u => u.hp > 0);
}

function checkWaveEnd() {
  if (state.baseHp <= 0) { endWave(false); return; }
  if (state.enemiesToSpawn === 0 && state.enemies.length === 0) { endWave(true); return; }
}

// ===== Главный цикл =====
let lastT = performance.now();
function tick(t) {
  const dt = Math.min(50, t - lastT);
  lastT = t;
  if (state.mode === 'battle') {
    for (const b of state.buildings) spawnFromBarracks(b, dt);
    spawnEnemyTick(dt);
    updateAllies(dt);
    updateEnemies(dt);
    cleanupCorpses();
    checkWaveEnd();
    syncHint();
  }
  draw();
  requestAnimationFrame(tick);
}

// ===== Рендер =====
function draw() {
  const cssW = wrap.clientWidth;
  const cssH = wrap.clientHeight;
  if (cssW <= 0 || cssH <= 0) return;

  // фон леса
  const grad = ctx.createLinearGradient(0, 0, 0, cssH);
  grad.addColorStop(0, '#274a30');
  grad.addColorStop(0.55, '#1c3922');
  grad.addColorStop(1, '#102818');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, cssW, cssH);

  drawTrees(cssW, cssH);
  drawField();
  drawBaseZone();
  drawBuildings();
  drawUnits(state.allies);
  drawUnits(state.enemies);
  drawBaseHpBar();
  if (state.drag && state.dragHover && state.dragHover.inField) {
    drawDragPreview(state.drag.type, state.dragHover);
  }

  if (state.mode === 'wave-end') drawCenterBanner('Победа!', `+${WAVE_REWARD} 🪙`);
  else if (state.mode === 'defeat') drawCenterBanner('Поражение', 'База разрушена');
}

function drawDragPreview(type, hover) {
  const def = BUILDINGS[type];
  const x = colToX(hover.anchorCol);
  const y = rowToY(hover.anchorRow);
  const w = def.cols * cellSize;
  const h = def.rows * cellSize;
  // подсветка целевых клеток
  ctx.fillStyle = hover.valid ? 'rgba(74, 222, 128, 0.30)' : 'rgba(248, 113, 113, 0.32)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = hover.valid ? '#4ade80' : '#f87171';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.setLineDash([]);
  // призрак здания
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = def.color;
  roundRect(x + 4, y + 4, w - 8, h - 8, 6, true, false);
  ctx.strokeStyle = def.edge;
  ctx.lineWidth = 2;
  roundRect(x + 4, y + 4, w - 8, h - 8, 6, false, true);
  ctx.fillStyle = '#fffbe6';
  ctx.font = `700 ${Math.floor(cellSize * 0.5)}px -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(def.icon, x + w / 2, y + h / 2);
  ctx.globalAlpha = 1;
}

const trees = [];
function genTrees() {
  trees.length = 0;
  const rng = mulberry32(7);
  for (let i = 0; i < 40; i++) {
    trees.push({
      side: i % 2 === 0 ? 'L' : 'R',
      ny: rng(),
      ns: 0.55 + rng() * 0.7,
      no: rng(),
    });
  }
}
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function drawTrees(cssW, cssH) {
  trees.forEach(t => {
    const yy = t.ny * cssH;
    const sz = cellSize * 0.85 * t.ns;
    let xx;
    if (t.side === 'L') {
      const margin = offsetX;
      xx = sz * 0.3 + (margin - sz * 0.6) * t.no;
    } else {
      const margin = cssW - (offsetX + fieldW);
      xx = (offsetX + fieldW) + sz * 0.3 + (margin - sz * 0.6) * t.no;
    }
    drawTree(xx, yy, sz);
  });
}
function drawTree(x, y, s) {
  ctx.fillStyle = '#5a3820';
  ctx.fillRect(x - s * 0.07, y, s * 0.14, s * 0.45);
  ctx.fillStyle = '#173d1f';
  triangle(x, y - s * 0.65, s * 0.75, s * 0.7);
  ctx.fillStyle = '#235430';
  triangle(x, y - s * 0.32, s * 0.65, s * 0.6);
  ctx.fillStyle = '#2f6c3e';
  triangle(x, y - 0.05, s * 0.55, s * 0.5);
}
function triangle(cx, top, w, h) {
  ctx.beginPath();
  ctx.moveTo(cx, top);
  ctx.lineTo(cx - w / 2, top + h);
  ctx.lineTo(cx + w / 2, top + h);
  ctx.closePath();
  ctx.fill();
}

function drawField() {
  ctx.fillStyle = 'rgba(20, 35, 25, 0.55)';
  ctx.fillRect(offsetX, offsetY, fieldW, fieldH);

  ctx.strokeStyle = 'rgba(120, 200, 140, 0.10)';
  ctx.lineWidth = 1;
  for (let c = 0; c <= COLS; c++) {
    const x = offsetX + c * cellSize + 0.5;
    ctx.beginPath(); ctx.moveTo(x, offsetY); ctx.lineTo(x, offsetY + fieldH); ctx.stroke();
  }
  for (let r = 0; r <= ROWS; r++) {
    const y = offsetY + r * cellSize + 0.5;
    ctx.beginPath(); ctx.moveTo(offsetX, y); ctx.lineTo(offsetX + fieldW, y); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(140, 220, 160, 0.4)';
  ctx.lineWidth = 2;
  ctx.strokeRect(offsetX + 0.5, offsetY + 0.5, fieldW - 1, fieldH - 1);
}

function drawBaseZone() {
  const r = baseRect();
  ctx.fillStyle = state.mode === 'build' ? 'rgba(120, 200, 140, 0.16)' : 'rgba(120, 200, 140, 0.08)';
  ctx.fillRect(r.x, r.y, r.w, r.h);

  // клетки внутри (только в build mode для подсказки)
  if (state.mode === 'build') {
    ctx.strokeStyle = 'rgba(140, 220, 160, 0.4)';
    ctx.lineWidth = 1;
    for (let cc = 0; cc <= BASE_COLS; cc++) {
      const xx = r.x + cc * cellSize + 0.5;
      ctx.beginPath(); ctx.moveTo(xx, r.y); ctx.lineTo(xx, r.y + r.h); ctx.stroke();
    }
    for (let rr = 0; rr <= BASE_ROWS; rr++) {
      const yy = r.y + rr * cellSize + 0.5;
      ctx.beginPath(); ctx.moveTo(r.x, yy); ctx.lineTo(r.x + r.w, yy); ctx.stroke();
    }
  }

  // обводка базы
  ctx.strokeStyle = 'rgba(140, 220, 160, 0.85)';
  ctx.lineWidth = 2;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
}

function drawBuildings() {
  for (const b of state.buildings) {
    const def = BUILDINGS[b.type];
    const x = colToX(b.col);
    const y = rowToY(b.row);
    const w = def.cols * cellSize;
    const h = def.rows * cellSize;
    // тело
    ctx.fillStyle = def.color;
    roundRect(x + 4, y + 4, w - 8, h - 8, 6, true, false);
    // обводка
    ctx.strokeStyle = def.edge;
    ctx.lineWidth = 2;
    roundRect(x + 4, y + 4, w - 8, h - 8, 6, false, true);
    // иконка
    ctx.fillStyle = '#fffbe6';
    ctx.font = `700 ${Math.floor(cellSize * 0.5)}px -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(def.icon, x + w / 2, y + h / 2);
  }
}

function roundRect(x, y, w, h, r, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

function drawUnits(list) {
  for (const u of list) {
    if (u.hp <= 0) continue;
    // тень
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(u.x, u.y + u.radius * 0.85, u.radius * 0.9, u.radius * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    // тело
    ctx.fillStyle = u.color;
    ctx.beginPath();
    ctx.arc(u.x, u.y, u.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = u.edge;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // hp-бар
    const bw = u.radius * 2.2;
    const bh = 3;
    const bx = u.x - bw / 2;
    const by = u.y - u.radius - 7;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = u.team === 'ally' ? '#4ade80' : '#f87171';
    ctx.fillRect(bx, by, bw * Math.max(0, u.hp / u.hpMax), bh);
  }
}

function drawBaseHpBar() {
  const r = baseRect();
  const bw = r.w;
  const bh = 6;
  const bx = r.x;
  const by = r.y - 12;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(bx, by, bw, bh);
  const pct = state.baseHp / state.baseHpMax;
  ctx.fillStyle = pct > 0.4 ? '#4ade80' : (pct > 0.15 ? '#fbbf24' : '#f87171');
  ctx.fillRect(bx, by, bw * pct, bh);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
}

function drawCenterBanner(title, subtitle) {
  const cx = offsetX + fieldW / 2;
  const cy = offsetY + fieldH / 2;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  roundRect(cx - 110, cy - 36, 220, 72, 10, true, false);
  ctx.fillStyle = '#fff';
  ctx.font = '800 20px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, cx, cy - 8);
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '600 13px -apple-system, sans-serif';
  ctx.fillText(subtitle, cx, cy + 14);
}

// ===== UI sync =====
function syncUi() {
  coinsEl.textContent = state.coins | 0;
  titleEl.textContent = state.mode === 'battle'
    ? `Волна ${state.wave}`
    : 'Оборона базы';
  if (state.mode === 'battle') {
    startBtn.hidden = true;
    resetBtn.hidden = true;
    paletteEl.hidden = true;
  } else if (state.mode === 'defeat') {
    startBtn.hidden = true;
    resetBtn.hidden = false;
    resetBtn.textContent = '↺ Заново';
    paletteEl.hidden = true;
  } else {
    startBtn.hidden = false;
    resetBtn.hidden = false;
    resetBtn.textContent = '↺ Сброс';
    startBtn.textContent = state.mode === 'wave-end'
      ? `⚔️ Волна ${state.wave}`
      : '⚔️ Начать бой';
    paletteEl.hidden = false;
  }
  syncHint();
}

// ===== Init =====
backBtn.addEventListener('click', goLauncher);
startBtn.addEventListener('click', () => startBattle());
resetBtn.addEventListener('click', () => resetAll());
sourceBarracksEl.addEventListener('pointerdown', (e) => startDrag(e, 'barracks'));

window.addEventListener('resize', () => { resize(); });
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
if (tg && tg.onEvent) {
  try { tg.onEvent('viewportChanged', resize); } catch (_) {}
}

initTelegram();
genTrees();
resize();
syncUi();
requestAnimationFrame((t) => { lastT = t; tick(t); });
