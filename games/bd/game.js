// Оборона базы — этап 2: магазин (3 случайных + reroll), 3 здания, merge до ур.3.
const tg = window.Telegram && window.Telegram.WebApp;

// ===== Конфиг поля =====
const COLS = 5;
const ROWS = 10;
const BASE_COLS = 3;
const BASE_ROWS = 3;
const BASE_LEFT_COL = Math.floor((COLS - BASE_COLS) / 2);
const BASE_TOP_ROW = ROWS - BASE_ROWS;

// ===== Здания =====
const MAX_LEVEL = 3;

// cells: список локальных клеток [dc, dr]. Все dc, dr >= 0. Bbox = max(dc)+1 × max(dr)+1.
const BUILDINGS = {
  barracks: {
    name: 'Казарма', cells: [[0, 0], [0, 1]],            // 1×2 вертикальная
    color: '#8a5a3b', edge: '#c9905c', icon: '⚔',
    cost: 5, unitType: 'warrior',
  },
  archers: {
    name: 'Лучники', cells: [[0, 0], [1, 0], [1, 1]],    // Г-уголок: верх-горизонталь + справа вниз
    color: '#1e40af', edge: '#60a5fa', icon: '🏹',
    cost: 8, unitType: 'archer',
  },
  well: {
    name: 'Колодец', cells: [[0, 0]],                    // 1×1
    color: '#0e7490', edge: '#22d3ee', icon: '⛲',
    cost: 10, unitType: null,
  },
};

function buildingBBox(type) {
  let w = 1, h = 1;
  for (const [c, r] of BUILDINGS[type].cells) {
    if (c + 1 > w) w = c + 1;
    if (r + 1 > h) h = r + 1;
  }
  return { w, h };
}
function buildingTopCell(type) {
  const cells = BUILDINGS[type].cells;
  return cells.reduce((b, c) => (c[1] < b[1] || (c[1] === b[1] && c[0] < b[0])) ? c : b, cells[0]);
}
function buildingBottomCell(type) {
  const cells = BUILDINGS[type].cells;
  return cells.reduce((b, c) => (c[1] > b[1] || (c[1] === b[1] && c[0] < b[0])) ? c : b, cells[0]);
}
function buildingTopRightCell(type) {
  const cells = BUILDINGS[type].cells;
  return cells.reduce((b, c) => (c[1] < b[1] || (c[1] === b[1] && c[0] > b[0])) ? c : b, cells[0]);
}
function isRectShape(type) {
  const bbox = buildingBBox(type);
  return BUILDINGS[type].cells.length === bbox.w * bbox.h;
}

const SPAWN_SCALING = {
  barracks: [
    { spawnCount: 1, spawnEveryMs: 4500 },
    { spawnCount: 2, spawnEveryMs: 4500 },
    { spawnCount: 2, spawnEveryMs: 3500 },
  ],
  archers: [
    { spawnCount: 1, spawnEveryMs: 5500 },
    { spawnCount: 2, spawnEveryMs: 5500 },
    { spawnCount: 2, spawnEveryMs: 4500 },
  ],
};

const HEAL_SCALING = {
  well: [
    { healAmount: 5, healEveryMs: 4000 },
    { healAmount: 9, healEveryMs: 4000 },
    { healAmount: 14, healEveryMs: 3000 },
  ],
};

// ===== Юниты =====
const UNITS = {
  warrior: {
    team: 'ally',
    hpMax: 30, dmg: 6, speed: 38, atkRange: 18, atkCdMs: 700,
    aggroRange: 220, radius: 9, color: '#4ade80', edge: '#0d4f24', icon: '⚔',
  },
  archer: {
    team: 'ally',
    hpMax: 22, dmg: 7, speed: 32, atkRange: 90, atkCdMs: 1200,
    aggroRange: 240, radius: 8, color: '#60a5fa', edge: '#1e3a8a', icon: '🏹',
  },
  goblin: {
    team: 'enemy',
    hpMax: 22, dmg: 5, speed: 30, atkRange: 18, atkCdMs: 800,
    aggroRange: 220, radius: 9, color: '#dc2626', edge: '#5a0e0e', icon: '👹',
  },
};

// ===== State =====
const state = {
  mode: 'build',
  coins: 10,
  wave: 1,
  baseHp: 100,
  baseHpMax: 100,
  buildings: [],          // { type, col, row, level, lastSpawnT, lastHealT }
  allies: [],
  enemies: [],
  fx: [],                 // временные эффекты (стрелы, удары)
  enemiesToSpawn: 0,
  enemySpawnAccum: 0,
  enemySpawnEveryMs: 1300,
  unitIdSeq: 1,
  shop: { items: [], rerollCost: 3 },
  drag: null,             // { type, slotIdx, x, y, pointerId, sourceEl }
  dragHover: null,        // { anchorCol, anchorRow, valid, inField, cssX, cssY, mergeTarget }
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
const shopEl = document.getElementById('bd-shop');
const shopRowEl = document.getElementById('bd-shop-row');
const rerollBtn = document.getElementById('bd-reroll');
const rerollCostEl = document.getElementById('bd-reroll-cost');

// ===== Ассеты =====
const groundImg = new Image();
let groundPattern = null;
groundImg.addEventListener('load', () => {
  try { groundPattern = ctx.createPattern(groundImg, 'repeat'); } catch (_) {}
});
groundImg.src = 'img/ground.png?v=20260422a';

const treeImg = new Image();
let treeReady = false;
treeImg.addEventListener('load', () => { treeReady = true; });
treeImg.src = 'img/tree.png?v=20260422a';

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

function cellsOccupiedBy(b) {
  return BUILDINGS[b.type].cells.map(([dc, dr]) => [b.col + dc, b.row + dr]);
}

function findBuildingAt(col, row) {
  for (const b of state.buildings) {
    for (const [cc, rr] of cellsOccupiedBy(b)) {
      if (cc === col && rr === row) return b;
    }
  }
  return null;
}

function isOccupied(col, row) {
  return findBuildingAt(col, row) !== null;
}

function canPlace(type, col, row) {
  for (const [dc, dr] of BUILDINGS[type].cells) {
    const cc = col + dc;
    const rr = row + dr;
    if (!isInsideBaseArea(cc, rr)) return false;
    if (isOccupied(cc, rr)) return false;
  }
  return true;
}

// ===== Магазин =====
function generateShop() {
  const types = Object.keys(BUILDINGS);
  state.shop.items = [];
  for (let i = 0; i < 3; i++) {
    state.shop.items.push({
      type: types[Math.floor(Math.random() * types.length)],
      sold: false,
    });
  }
}

function reroll() {
  if (state.coins < state.shop.rerollCost) {
    flashHint(`Нужно ${state.shop.rerollCost} 🪙 на реролл`);
    haptic('fail');
    return;
  }
  state.coins -= state.shop.rerollCost;
  state.shop.rerollCost += 2;
  generateShop();
  syncUi();
  syncShop();
  haptic('impact');
}

function syncShop() {
  shopRowEl.innerHTML = '';
  state.shop.items.forEach((slot, idx) => {
    const def = BUILDINGS[slot.type];
    const btn = document.createElement('button');
    btn.className = 'bd-shop-slot';
    if (slot.sold) btn.classList.add('sold');
    if (!slot.sold && state.coins < def.cost) btn.classList.add('cant-afford');
    btn.dataset.slot = String(idx);
    btn.type = 'button';
    btn.innerHTML = `
      <div class="bd-shop-icon" style="background: linear-gradient(135deg, ${def.color}, ${def.edge});">${def.icon}</div>
      <div class="bd-shop-name">${def.name}</div>
      <div class="bd-shop-price"><span>🪙</span><b>${def.cost}</b></div>
    `;
    btn.addEventListener('pointerdown', (e) => onShopSlotDown(e, idx, btn));
    shopRowEl.appendChild(btn);
  });
  rerollCostEl.textContent = String(state.shop.rerollCost);
  rerollBtn.classList.toggle('disabled', state.coins < state.shop.rerollCost);
}

function onShopSlotDown(e, idx, btn) {
  const slot = state.shop.items[idx];
  if (!slot || slot.sold) return;
  const def = BUILDINGS[slot.type];
  if (state.coins < def.cost) {
    flashHint(`Нужно ${def.cost} 🪙 — у тебя ${state.coins}`);
    haptic('fail');
    return;
  }
  startDrag(e, slot.type, idx, btn);
}

// ===== Drag-and-drop =====
function pickHover(type, cssX, cssY) {
  const bbox = buildingBBox(type);
  const cells = BUILDINGS[type].cells;
  const inField = cssX >= offsetX && cssX <= offsetX + fieldW
               && cssY >= offsetY && cssY <= offsetY + fieldH;
  const fx = (cssX - offsetX) / cellSize - bbox.w / 2;
  const fy = (cssY - offsetY) / cellSize - bbox.h / 2;
  let anchorCol = Math.round(fx);
  let anchorRow = Math.round(fy);
  anchorCol = Math.max(0, Math.min(COLS - bbox.w, anchorCol));
  anchorRow = Math.max(0, Math.min(ROWS - bbox.h, anchorRow));

  // Merge: все cells здания указывают на одно и то же существующее здание того же типа c level < MAX
  let mergeTarget = null;
  if (inField) {
    let target = null, ok = true;
    for (const [dc, dr] of cells) {
      const b = findBuildingAt(anchorCol + dc, anchorRow + dr);
      if (!b) { ok = false; break; }
      if (target === null) target = b;
      else if (target !== b) { ok = false; break; }
    }
    // дополнительно: у target должны быть ровно те же cells (форма должна совпадать целиком)
    if (ok && target && target.type === type && target.level < MAX_LEVEL) {
      const tCells = cellsOccupiedBy(target);
      const myCells = cells.map(([dc, dr]) => [anchorCol + dc, anchorRow + dr]);
      if (tCells.length === myCells.length
          && tCells.every(([a, b]) => myCells.some(([x, y]) => x === a && y === b))) {
        mergeTarget = target;
      }
    }
  }

  let valid;
  if (mergeTarget) valid = true;
  else valid = inField && canPlace(type, anchorCol, anchorRow);

  return { anchorCol, anchorRow, valid, inField, cssX, cssY, mergeTarget };
}

function startDrag(e, type, slotIdx, sourceBtn) {
  if (state.mode !== 'build' && state.mode !== 'wave-end') return;
  if (state.drag) return;
  e.preventDefault();
  state.drag = { type, slotIdx, x: e.clientX, y: e.clientY, pointerId: e.pointerId, sourceEl: sourceBtn };
  sourceBtn.classList.add('dragging');
  try { sourceBtn.setPointerCapture(e.pointerId); } catch (_) {}
  sourceBtn.addEventListener('pointermove', onDragMove);
  sourceBtn.addEventListener('pointerup', onDragUp);
  sourceBtn.addEventListener('pointercancel', onDragCancel);
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
  const slotIdx = state.drag.slotIdx;
  endDrag(e);
  if (hover && hover.valid) {
    dropFromShop(slotIdx, hover);
  } else if (hover && hover.inField) {
    flashHint('Сюда не помещается');
    haptic('fail');
  }
}

function onDragCancel(e) {
  if (!state.drag || e.pointerId !== state.drag.pointerId) return;
  endDrag(e);
}

function endDrag(e) {
  const src = state.drag && state.drag.sourceEl;
  if (src) {
    try { src.releasePointerCapture(e.pointerId); } catch (_) {}
    src.classList.remove('dragging');
    src.removeEventListener('pointermove', onDragMove);
    src.removeEventListener('pointerup', onDragUp);
    src.removeEventListener('pointercancel', onDragCancel);
  }
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

function dropFromShop(slotIdx, hover) {
  const slot = state.shop.items[slotIdx];
  if (!slot || slot.sold) return;
  const def = BUILDINGS[slot.type];
  if (state.coins < def.cost) return;
  if (hover.mergeTarget) {
    hover.mergeTarget.level = Math.min(MAX_LEVEL, hover.mergeTarget.level + 1);
    hover.mergeTarget.lastSpawnT = 0;
    hover.mergeTarget.lastHealT = 0;
  } else {
    state.buildings.push({
      type: slot.type, col: hover.anchorCol, row: hover.anchorRow,
      level: 1, lastSpawnT: 0, lastHealT: 0,
    });
  }
  state.coins -= def.cost;
  slot.sold = true;
  syncUi();
  syncShop();
  haptic('impact');
}

// ===== Подсказка =====
let hintTimer = 0;
function flashHint(msg) {
  hintEl.textContent = msg;
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => syncHint(), 1500);
}
function syncHint() {
  if (state.mode === 'build') {
    hintEl.textContent = 'Купи здание из магазина → перетяни на базу. На такое же — слияние';
  } else if (state.mode === 'battle') {
    hintEl.textContent = `Волна ${state.wave}: осталось врагов ${state.enemies.length + state.enemiesToSpawn}`;
  } else if (state.mode === 'wave-end') {
    hintEl.textContent = `Волна пройдена! +${WAVE_REWARD} 🪙. Купи усиления → «Бой»`;
  } else if (state.mode === 'defeat') {
    hintEl.textContent = `База разрушена. «Заново» — рестарт`;
  }
}

// ===== Волна =====
const WAVE_REWARD = 25;
const ENEMIES_PER_WAVE = 6;

function startBattle() {
  if (state.mode !== 'build' && state.mode !== 'wave-end') return;
  if (state.buildings.length === 0) {
    flashHint('Сначала поставь хотя бы одно здание');
    haptic('fail');
    return;
  }
  state.mode = 'battle';
  state.allies.length = 0;
  state.enemies.length = 0;
  state.fx.length = 0;
  state.enemiesToSpawn = ENEMIES_PER_WAVE + (state.wave - 1) * 2;
  state.enemySpawnAccum = 0;
  for (const b of state.buildings) { b.lastSpawnT = 0; b.lastHealT = 0; }
  syncUi();
  haptic('impact');
}

function endWave(victory) {
  if (victory) {
    state.coins += WAVE_REWARD;
    state.wave += 1;
    state.mode = 'wave-end';
    generateShop();
    haptic('success');
  } else {
    state.mode = 'defeat';
    haptic('fail');
  }
  state.allies.length = 0;
  state.enemies.length = 0;
  state.fx.length = 0;
  syncUi();
  syncShop();
}

function resetAll() {
  state.mode = 'build';
  state.coins = 10;
  state.wave = 1;
  state.baseHp = state.baseHpMax;
  state.buildings.length = 0;
  state.allies.length = 0;
  state.enemies.length = 0;
  state.fx.length = 0;
  state.enemiesToSpawn = 0;
  state.shop.rerollCost = 3;
  generateShop();
  syncUi();
  syncShop();
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
    atkAccum: def.atkCdMs * 0.6,
    targetId: null,
  };
  if (def.team === 'ally') state.allies.push(u);
  else state.enemies.push(u);
  return u;
}

function updateBuilding(b, dt) {
  const def = BUILDINGS[b.type];
  if (def.unitType) {
    const sc = SPAWN_SCALING[b.type][b.level - 1];
    b.lastSpawnT = (b.lastSpawnT || 0) + dt;
    if (b.lastSpawnT >= sc.spawnEveryMs) {
      b.lastSpawnT -= sc.spawnEveryMs;
      const [tdc, tdr] = buildingTopCell(b.type);
      for (let i = 0; i < sc.spawnCount; i++) {
        const off = (i - (sc.spawnCount - 1) / 2) * 10;
        const x = colToX(b.col + tdc + 0.5) + off;
        const y = rowToY(b.row + tdr) - cellSize * 0.05;
        spawnUnit(def.unitType, x, y);
      }
    }
  } else if (b.type === 'well') {
    const sc = HEAL_SCALING.well[b.level - 1];
    b.lastHealT = (b.lastHealT || 0) + dt;
    if (b.lastHealT >= sc.healEveryMs) {
      b.lastHealT -= sc.healEveryMs;
      for (const u of state.allies) {
        if (u.hp > 0 && u.hp < u.hpMax) {
          u.hp = Math.min(u.hpMax, u.hp + sc.healAmount);
        }
      }
      const bbox = buildingBBox(b.type);
      const x = colToX(b.col + bbox.w / 2);
      const y = rowToY(b.row + bbox.h / 2);
      state.fx.push({ kind: 'pulse', x, y, r0: cellSize * 0.6, r1: cellSize * 1.6, color: 'rgba(52, 211, 153, 0.45)', ttl: 360, life: 360 });
    }
  }
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

function distanceToBaseFront(enemy) {
  const r = baseRect();
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

function separation(u, list) {
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

function emitArrow(from, to) {
  state.fx.push({
    kind: 'arrow',
    x1: from.x, y1: from.y - 2,
    x2: to.x,   y2: to.y - 2,
    color: 'rgba(253, 224, 71, 0.95)',
    ttl: 110, life: 110,
  });
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
          if (u.type === 'archer') emitArrow(u, target);
        }
      } else {
        moveTowards(u, target.x, target.y, dt);
      }
    } else {
      moveTowards(u, u.x, offsetY + 4, dt);
    }
    u.x = Math.max(offsetX + u.radius, Math.min(offsetX + fieldW - u.radius, u.x));
    u.y = Math.max(offsetY + u.radius, u.y);
  }
  for (const u of state.allies) if (u.hp > 0) separation(u, state.allies);
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
  for (const u of state.enemies) if (u.hp > 0) separation(u, state.enemies);
}

function updateFx(dt) {
  for (const fx of state.fx) fx.ttl -= dt;
  state.fx = state.fx.filter(f => f.ttl > 0);
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
    for (const b of state.buildings) updateBuilding(b, dt);
    spawnEnemyTick(dt);
    updateAllies(dt);
    updateEnemies(dt);
    updateFx(dt);
    cleanupCorpses();
    checkWaveEnd();
    syncHint();
  } else {
    updateFx(dt);
  }
  draw();
  requestAnimationFrame(tick);
}

// ===== Рендер =====
function draw() {
  const cssW = wrap.clientWidth;
  const cssH = wrap.clientHeight;
  if (cssW <= 0 || cssH <= 0) return;

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
  drawFx();
  drawBaseHpBar();
  if (state.drag && state.dragHover) {
    drawDragPreview(state.drag.type, state.dragHover);
  }

  if (state.mode === 'wave-end') drawCenterBanner('Победа!', `+${WAVE_REWARD} 🪙`);
  else if (state.mode === 'defeat') drawCenterBanner('Поражение', 'База разрушена');
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
  if (treeReady && treeImg.naturalWidth > 0) {
    const aspect = treeImg.naturalWidth / treeImg.naturalHeight;
    // s — высота кроны+ствола примерно. Делаем дерево покрупнее.
    const h = s * 2.4;
    const w = h * aspect;
    ctx.drawImage(treeImg, x - w / 2, y - h * 0.95, w, h);
    return;
  }
  // fallback пока картинка не загрузилась
  ctx.fillStyle = '#5a3820';
  ctx.fillRect(x - s * 0.07, y, s * 0.14, s * 0.45);
  ctx.fillStyle = '#235430';
  triangle(x, y - s * 0.5, s * 0.6, s * 0.6);
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
  if (groundPattern) {
    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.fillStyle = groundPattern;
    ctx.fillRect(0, 0, fieldW, fieldH);
    ctx.restore();
    // лёгкое затемнение, чтобы юниты и здания читались поверх
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
    ctx.fillRect(offsetX, offsetY, fieldW, fieldH);
  } else {
    ctx.fillStyle = 'rgba(20, 35, 25, 0.45)';
    ctx.fillRect(offsetX, offsetY, fieldW, fieldH);
  }
}

function drawBaseZone() {
  const r = baseRect();
  const inBuild = state.mode === 'build' || state.mode === 'wave-end';
  ctx.fillStyle = inBuild ? 'rgba(120, 200, 140, 0.16)' : 'rgba(120, 200, 140, 0.07)';
  ctx.fillRect(r.x, r.y, r.w, r.h);

  ctx.strokeStyle = inBuild ? 'rgba(140, 220, 160, 0.42)' : 'rgba(140, 220, 160, 0.18)';
  ctx.lineWidth = 1;
  for (let cc = 0; cc <= BASE_COLS; cc++) {
    const xx = r.x + cc * cellSize + 0.5;
    ctx.beginPath(); ctx.moveTo(xx, r.y); ctx.lineTo(xx, r.y + r.h); ctx.stroke();
  }
  for (let rr = 0; rr <= BASE_ROWS; rr++) {
    const yy = r.y + rr * cellSize + 0.5;
    ctx.beginPath(); ctx.moveTo(r.x, yy); ctx.lineTo(r.x + r.w, yy); ctx.stroke();
  }

  ctx.strokeStyle = inBuild ? 'rgba(140, 220, 160, 0.85)' : 'rgba(140, 220, 160, 0.5)';
  ctx.lineWidth = 2;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
}

// Заливает здание как единый силуэт без зазоров между клетками.
// alpha — для drag-призрака (0..1).
function drawBuildingShape(type, col, row, alpha) {
  const def = BUILDINGS[type];
  ctx.save();
  if (alpha !== undefined && alpha < 1) ctx.globalAlpha = alpha;
  if (isRectShape(type)) {
    const bbox = buildingBBox(type);
    const x = colToX(col);
    const y = rowToY(row);
    const w = bbox.w * cellSize;
    const h = bbox.h * cellSize;
    ctx.fillStyle = def.color;
    roundRect(x + 4, y + 4, w - 8, h - 8, 6, true, false);
    ctx.strokeStyle = def.edge;
    ctx.lineWidth = 2;
    roundRect(x + 4, y + 4, w - 8, h - 8, 6, false, true);
  } else {
    // не-rect: клетки бесшовно + обводка по внешнему периметру
    const cellsSet = new Set(def.cells.map(([c, r]) => c + ',' + r));
    ctx.fillStyle = def.color;
    for (const [dc, dr] of def.cells) {
      const x = colToX(col + dc);
      const y = rowToY(row + dr);
      ctx.fillRect(x + 2, y + 2, cellSize - 4, cellSize - 4);
    }
    // заливка стыков между смежными клетками — чтобы padding не оставлял шов
    for (const [dc, dr] of def.cells) {
      const x = colToX(col + dc);
      const y = rowToY(row + dr);
      if (cellsSet.has((dc + 1) + ',' + dr)) {
        ctx.fillRect(x + cellSize - 4, y + 2, 8, cellSize - 4);
      }
      if (cellsSet.has(dc + ',' + (dr + 1))) {
        ctx.fillRect(x + 2, y + cellSize - 4, cellSize - 4, 8);
      }
    }
    ctx.strokeStyle = def.edge;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const [dc, dr] of def.cells) {
      const x = colToX(col + dc);
      const y = rowToY(row + dr);
      const inset = 2;
      if (!cellsSet.has(dc + ',' + (dr - 1))) { ctx.moveTo(x + inset, y + inset); ctx.lineTo(x + cellSize - inset, y + inset); }
      if (!cellsSet.has((dc + 1) + ',' + dr)) { ctx.moveTo(x + cellSize - inset, y + inset); ctx.lineTo(x + cellSize - inset, y + cellSize - inset); }
      if (!cellsSet.has(dc + ',' + (dr + 1))) { ctx.moveTo(x + inset, y + cellSize - inset); ctx.lineTo(x + cellSize - inset, y + cellSize - inset); }
      if (!cellsSet.has((dc - 1) + ',' + dr)) { ctx.moveTo(x + inset, y + inset); ctx.lineTo(x + inset, y + cellSize - inset); }
    }
    ctx.stroke();
  }
  ctx.restore();
}

// Иконка: rect → центр bbox; не-rect → центр первой клетки (cells[0]).
function drawBuildingIcon(type, col, row) {
  const def = BUILDINGS[type];
  let iconX, iconY;
  if (isRectShape(type)) {
    const bbox = buildingBBox(type);
    iconX = colToX(col) + (bbox.w * cellSize) / 2;
    iconY = rowToY(row) + (bbox.h * cellSize) / 2;
  } else {
    const [idc, idr] = def.cells[0];
    iconX = colToX(col + idc) + cellSize / 2;
    iconY = rowToY(row + idr) + cellSize / 2;
  }
  ctx.fillStyle = '#fffbe6';
  ctx.font = '700 ' + Math.floor(cellSize * 0.55) + 'px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(def.icon, iconX, iconY);
}

function drawBuildings() {
  for (const b of state.buildings) {
    const def = BUILDINGS[b.type];
    drawBuildingShape(b.type, b.col, b.row, 1);
    drawBuildingIcon(b.type, b.col, b.row);

    // прогресс-бар: на нижней клетке
    let prog = null;
    if (def.unitType) {
      const sc = SPAWN_SCALING[b.type][b.level - 1];
      prog = { pct: (b.lastSpawnT || 0) / sc.spawnEveryMs, color: '#fbbf24' };
    } else if (b.type === 'well') {
      const sc = HEAL_SCALING.well[b.level - 1];
      prog = { pct: (b.lastHealT || 0) / sc.healEveryMs, color: '#34d399' };
    }
    if (prog && state.mode === 'battle') {
      const [bdc, bdr] = buildingBottomCell(b.type);
      const x = colToX(b.col + bdc);
      const y = rowToY(b.row + bdr);
      const pbW = cellSize - 14, pbH = 4;
      const pbX = x + 7, pbY = y + cellSize - 9;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      roundRect(pbX, pbY, pbW, pbH, 2, true, false);
      ctx.fillStyle = prog.color;
      roundRect(pbX, pbY, pbW * Math.max(0, Math.min(1, prog.pct)), pbH, 2, true, false);
    }

    // бейдж уровня — в правом-верхнем углу верхней-правой клетки
    if (b.level > 1) {
      const [tdc, tdr] = buildingTopRightCell(b.type);
      const cellX = colToX(b.col + tdc);
      const cellY = rowToY(b.row + tdr);
      const cx = cellX + cellSize - 9;
      const cy = cellY + 9;
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(cx, cy, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#7c2d12';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#0e1624';
      ctx.font = '900 11px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(b.level), cx, cy + 0.5);
    }
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
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(u.x, u.y + u.radius * 0.85, u.radius * 0.9, u.radius * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = u.color;
    ctx.beginPath();
    ctx.arc(u.x, u.y, u.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = u.edge;
    ctx.lineWidth = 1.5;
    ctx.stroke();
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

function drawFx() {
  for (const fx of state.fx) {
    const a = Math.max(0, Math.min(1, fx.ttl / fx.life));
    if (fx.kind === 'arrow') {
      ctx.strokeStyle = `rgba(253, 224, 71, ${0.95 * a})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(fx.x1, fx.y1);
      ctx.lineTo(fx.x2, fx.y2);
      ctx.stroke();
    } else if (fx.kind === 'pulse') {
      const r = fx.r0 + (fx.r1 - fx.r0) * (1 - a);
      ctx.strokeStyle = `rgba(52, 211, 153, ${0.55 * a})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
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

function drawDragPreview(type, hover) {
  const def = BUILDINGS[type];
  const cells = def.cells;
  const bbox = buildingBBox(type);

  // 1) подсветка снап-клеток (только если курсор над полем)
  if (hover.inField) {
    let hl, edge;
    if (hover.mergeTarget) { hl = 'rgba(168, 85, 247, 0.32)'; edge = '#a855f7'; }
    else if (hover.valid)  { hl = 'rgba(74, 222, 128, 0.28)'; edge = '#4ade80'; }
    else                   { hl = 'rgba(248, 113, 113, 0.28)'; edge = '#f87171'; }

    // подсвечиваем клетки в позициях формы
    const targetAnchorCol = hover.mergeTarget ? hover.mergeTarget.col : hover.anchorCol;
    const targetAnchorRow = hover.mergeTarget ? hover.mergeTarget.row : hover.anchorRow;
    for (const [dc, dr] of cells) {
      const sx = colToX(targetAnchorCol + dc);
      const sy = rowToY(targetAnchorRow + dr);
      ctx.fillStyle = hl;
      ctx.fillRect(sx, sy, cellSize, cellSize);
      ctx.strokeStyle = edge;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(sx + 1, sy + 1, cellSize - 2, cellSize - 2);
      ctx.setLineDash([]);
    }

    if (hover.mergeTarget) {
      const t = hover.mergeTarget;
      const cx = colToX(t.col) + bbox.w * cellSize / 2;
      const cy = rowToY(t.row) - 4;
      ctx.fillStyle = '#c084fc';
      ctx.font = '800 12px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`MERGE → ур. ${hover.mergeTarget.level + 1}`, cx, cy);
    }
  }

  // 2) призрак — единый силуэт под курсором (используем тот же drawBuildingShape через сдвиг канвы)
  // Считаем «виртуальные» col/row так, чтобы bbox центрировался на курсоре.
  const ghostCol = (hover.cssX - (bbox.w * cellSize) / 2 - offsetX) / cellSize;
  const ghostRow = (hover.cssY - (bbox.h * cellSize) / 2 - offsetY) / cellSize;
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 6;
  drawBuildingShape(type, ghostCol, ghostRow, 0.78);
  ctx.shadowColor = 'transparent';
  ctx.globalAlpha = 0.78;
  drawBuildingIcon(type, ghostCol, ghostRow);
  ctx.restore();
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
  coinsEl.textContent = String(state.coins | 0);
  titleEl.textContent = state.mode === 'battle' ? `Волна ${state.wave}` : 'Оборона базы';
  if (state.mode === 'battle') {
    startBtn.hidden = true;
    resetBtn.hidden = true;
    shopEl.hidden = true;
  } else if (state.mode === 'defeat') {
    startBtn.hidden = true;
    resetBtn.hidden = false;
    resetBtn.textContent = '↺ Заново';
    shopEl.hidden = true;
  } else {
    startBtn.hidden = false;
    resetBtn.hidden = false;
    resetBtn.textContent = '↺ Сброс';
    startBtn.textContent = state.mode === 'wave-end' ? `⚔️ Волна ${state.wave}` : '⚔️ Начать бой';
    shopEl.hidden = false;
  }
  syncHint();
}

// ===== Init =====
backBtn.addEventListener('click', goLauncher);
startBtn.addEventListener('click', () => startBattle());
resetBtn.addEventListener('click', () => resetAll());
rerollBtn.addEventListener('click', () => reroll());

window.addEventListener('resize', () => { resize(); });
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
if (tg && tg.onEvent) {
  try { tg.onEvent('viewportChanged', resize); } catch (_) {}
}

initTelegram();
genTrees();
generateShop();
resize();
syncUi();
syncShop();
requestAnimationFrame((t) => { lastT = t; tick(t); });
