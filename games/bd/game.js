// Оборона базы — этап 2: магазин (3 случайных + reroll), 3 здания, merge до ур.3.
const tg = window.Telegram && window.Telegram.WebApp;

// ===== Конфиг поля =====
// Нечётный COLS — чтобы 3-широкая база ровно центровалась (cols 2-4).
const COLS = 7;
const ROWS = 14;
const BASE_START_COLS = 3;
const BASE_START_ROWS = 3;
const BASE_START_LEFT = Math.floor((COLS - BASE_START_COLS) / 2);
// База прижимается к нижнему краю поля (расширение возможно только вверх и в стороны).
const BASE_START_TOP = ROWS - BASE_START_ROWS;
// Максимум база 5×4 (5 ширина × 4 высота).
const BASE_MAX_W = 5;
const BASE_MAX_H = 4;

// Формы расширения, выпадают в магазине случайно.
const EXPANSION_POOL = [
  { cells: [[0, 0]],                      name: '1',   cost: 10 },
  { cells: [[0, 0], [1, 0]],              name: '2×1', cost: 18 },
  { cells: [[0, 0], [0, 1]],              name: '1×2', cost: 18 },
  { cells: [[0, 0], [1, 0], [1, 1]],      name: 'Г',   cost: 25 },
  { cells: [[0, 0], [1, 0], [0, 1]],      name: 'Г',   cost: 25 },
  { cells: [[0, 1], [1, 1], [1, 0]],      name: 'Г',   cost: 25 },
  { cells: [[0, 0], [0, 1], [1, 1]],      name: 'Г',   cost: 25 },
];
function pickExpansionShape() {
  return EXPANSION_POOL[Math.floor(Math.random() * EXPANSION_POOL.length)];
}
function shapeBBoxFromCells(cells) {
  let w = 1, h = 1;
  for (const [c, r] of cells) {
    if (c + 1 > w) w = c + 1;
    if (r + 1 > h) h = r + 1;
  }
  return { w, h };
}

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
  mages: {
    name: 'Маги', cells: [[1, 0], [0, 1], [1, 1], [2, 1]], // T-форма: 1 клетка сверху по центру + 3 клетки снизу
    color: '#6d28d9', edge: '#a78bfa', icon: '✨',
    cost: 14, unitType: 'mage',
  },
  crossbow: {
    name: 'Арбалет', cells: [[0, 0]],                      // 1×1 стационарная башня
    color: '#78350f', edge: '#fbbf24', icon: '🎯',
    cost: 10, unitType: null,
  },
  treasury: {
    name: 'Казна',   cells: [[0, 0]],                      // 1×1 пассивный доход
    color: '#854d0e', edge: '#facc15', icon: '🏦',
    cost: 12, unitType: null,
  },
  forge: {
    name: 'Кузница', cells: [[0, 0], [1, 0]],              // 2×1 горизонтальный пассивный баф
    color: '#7c2d12', edge: '#f97316', icon: '⚒️',
    cost: 14, unitType: null,
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
    { spawnCount: 2, spawnEveryMs: 4000 },
    { spawnCount: 4, spawnEveryMs: 3500 },
  ],
  archers: [
    { spawnCount: 1, spawnEveryMs: 4500 },
    { spawnCount: 2, spawnEveryMs: 4000 },
    { spawnCount: 4, spawnEveryMs: 3500 },
  ],
  mages: [
    { spawnCount: 1, spawnEveryMs: 5500 },
    { spawnCount: 2, spawnEveryMs: 5000 },
    { spawnCount: 3, spawnEveryMs: 4500 },
  ],
};

const HEAL_SCALING = {
  well: [
    { healAmount: 5, healEveryMs: 4000 },
    { healAmount: 9, healEveryMs: 4000 },
    { healAmount: 14, healEveryMs: 3000 },
  ],
};

// Стационарная атака (арбалет) — сам стреляет, не двигается, не спавнит юнитов
const TOWER_ATTACK = {
  crossbow: [
    { dmg: 9,  range: 300, cdMs: 1800 },
    { dmg: 12, range: 360, cdMs: 1600 },
    { dmg: 16, range: 420, cdMs: 1400 },
  ],
};

// Пассивный доход 💰 за пройденную волну (выдаётся в endWave при victory)
const TREASURY_INCOME = {
  treasury: [5, 10, 18],   // ур.1 / 2 / 3 → +💰 за волну
};

// Кузница — пассивный множитель характеристик союзников. Несколько кузниц НЕ складываются:
// берётся максимальный уровень. Ур.1 = +10% dmg, ур.2 = +10% dmg + +10% atkSpeed,
// ур.3 = ещё +15% HP. Применяется в момент spawnUnit; задним числом не пересчитывается.
const FORGE_BUFF = {
  0: { dmg: 1,    hp: 1,    atkSpeed: 1    },
  1: { dmg: 1.10, hp: 1,    atkSpeed: 1    },
  2: { dmg: 1.10, hp: 1,    atkSpeed: 1.10 },
  3: { dmg: 1.10, hp: 1.15, atkSpeed: 1.10 },
};
function forgeBuff() {
  let maxLvl = 0;
  for (const b of state.buildings) {
    if (b.type === 'forge' && b.level > maxLvl) maxLvl = b.level;
  }
  const base = FORGE_BUFF[maxLvl] || FORGE_BUFF[0];
  // Мета-уровень кузницы усиливает delta баф'а: на ур.2 (+10%) → +12% при metaBonus=1.20.
  const meta = metaBonus('forge');
  return {
    dmg:      1 + (base.dmg - 1)      * meta,
    hp:       1 + (base.hp - 1)       * meta,
    atkSpeed: 1 + (base.atkSpeed - 1) * meta,
  };
}

// Кап кол-ва союзников. Пока достигнут — казармы держат прогресс-бар на максимуме и ждут.
const MAX_ALLIES = 15;

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
  mage: {
    team: 'ally',
    hpMax: 18, dmg: 8, speed: 26, atkRange: 70, atkCdMs: 1500,
    aggroRange: 230, radius: 8, color: '#a78bfa', edge: '#4c1d95', icon: '✨',
    aoeRadius: 36, // AoE удар: урон по всем врагам в радиусе вокруг цели
  },
  goblin: {
    team: 'enemy',
    hpMax: 22, dmg: 5, speed: 30, atkRange: 18, atkCdMs: 800,
    aggroRange: 220, radius: 9, color: '#dc2626', edge: '#5a0e0e', icon: '👹',
  },
  goblin_archer: {
    team: 'enemy',
    hpMax: 18, dmg: 6, speed: 25, atkRange: 90, atkCdMs: 1400,
    aggroRange: 230, radius: 8, color: '#ea580c', edge: '#7c2d12', icon: '🏹',
  },
  goblin_mage: {
    team: 'enemy',
    hpMax: 16, dmg: 7, speed: 22, atkRange: 70, atkCdMs: 1700,
    aggroRange: 220, radius: 8, color: '#c084fc', edge: '#581c87', icon: '✨',
    aoeRadius: 32,
  },
  // Герой — призывной супер-юнит игрока. Заметно сильнее обычного воина, но не босс.
  hero: {
    team: 'ally',
    hpMax: 80, dmg: 12, speed: 36, atkRange: 22, atkCdMs: 700,
    aggroRange: 260, radius: 12, color: '#fde047', edge: '#92400e', icon: '🦸',
  },
};

// ===== Герой / ulti-meter =====
const HERO_HITS_TO_SUMMON = 50;   // сколько попаданий союзников нужно для первого призыва
const HERO_RESPAWN_MS = 25000;    // таймер после смерти героя

// ===== Локации =====
const LOCATION_ORDER = ['forest', 'cave', 'castle'];
const LOCATIONS = {
  forest: { name: 'Лес гоблинов',   icon: '🌲', desc: 'Стартовая локация', waves: 10, bg: 'img/forest_bg.png?v=1' },
  cave:   { name: 'Пещера троллей', icon: '🪨', desc: 'Мрачные глубины',    waves: 12, bg: 'img/cave_bg.png?v=1'   },
  castle: { name: 'Замок тьмы',     icon: '🏰', desc: 'Финальный рубеж',    waves: 15, bg: 'img/castle_bg.png?v=1' },
};

// ===== State =====
const state = {
  screen: 'menu',         // 'menu' | 'play'
  activeTab: 'map',       // 'map' | 'upgrade' | 'chests'
  menuLocationIdx: 0,     // какая локация выделена в карусели
  gems: 0,                // мета-валюта 💎 для сундуков
  gold: 0,                // мета-валюта 💰 для прокачки зданий и героя
  locations: {
    forest: { unlocked: true,  beaten: false },
    cave:   { unlocked: false, beaten: false },
    castle: { unlocked: false, beaten: false },
  },
  currentLocation: null,
  totalWaves: 10,
  mode: 'build',          // боевые режимы: 'build' | 'battle' | 'wave-end' | 'defeat' | 'level-cleared'
  coins: 100,
  wave: 1,
  baseHp: 100,
  baseHpMax: 100,
  buildings: [],
  allies: [],
  enemies: [],
  fx: [],
  enemiesToSpawn: 0,
  enemySpawnAccum: 0,
  enemySpawnEveryMs: 1300,
  unitIdSeq: 1,
  baseCells: new Set(),   // 'c,r' — клетки на которых можно строить
  shop: { items: [], rerollCost: 3 },
  stash: [],              // [{ type, level }]
  drag: null,
  dragHover: null,
  _dragOriginal: null,    // здание, которое было удалено с базы пока его тащат
  lastReward: { coins: 0, gems: 0, gold: 0 }, // показ награды в баннере/хинте после endWave
  // Герой: состояние ulti-meter и активного юнита. firstSummonDone — становится true после
  // первого призыва (дальше требуется не счётчик, а таймер 25с после смерти).
  hero: {
    firstSummonDone: false,
    meterHits: 0,
    alive: false,
    deathTimerMs: 0,
    metaLevel: 1,            // ур. героя — для будущей вкладки прокачки (Фаза 3)
  },
  cards: { barracks: 0, archers: 0, well: 0, mages: 0, crossbow: 0, treasury: 0, forge: 0 },
  metaLevels: { barracks: 1, archers: 1, well: 1, mages: 1, crossbow: 1, treasury: 1, forge: 1 },
  // Камера: zoom — масштаб мира на канвасе, panX/panY — сдвиг (в screen px) поверх dpr-transform.
  zoom: 1,
  panX: 0,
  panY: 0,
  pinch: null,      // {lastDist, lastCenter:{sx,sy}} — активный pinch-жест
  canvasPan: null,  // {pointerId, startClientX/Y, startPanX/Y} — 1-пальцевый pan по пустому месту
};

// ===== Мета-прогрессия =====
const META_BONUS_PER_LEVEL = 0.10; // +10% за каждый мета-уровень сверх 1
const MAX_META_LEVEL = 8;
const UPGRADE_CARDS_NEEDED = 5; // сжигаются при переходе на след. уровень
const UPGRADE_GOLD_COSTS = [50, 100, 200, 400, 800, 1500, 3000]; // index = currentLvl-1 → стоимость до next
function upgradeGoldCost(lvl) {
  return UPGRADE_GOLD_COSTS[lvl - 1] || (UPGRADE_GOLD_COSTS[UPGRADE_GOLD_COSTS.length - 1] * 2);
}
const BUILDING_KEYS = ['barracks', 'archers', 'mages', 'well', 'crossbow', 'treasury', 'forge'];
const BUILDING_LABELS = {
  barracks: 'Казарма мечников', archers: 'Казарма лучников', mages: 'Казарма магов', well: 'Колодец',
  crossbow: 'Арбалет',          treasury: 'Казна',            forge: 'Кузница',
};
const BUILDING_EMOJI = {
  barracks: '⚔️', archers: '🏹', mages: '✨', well: '💧',
  crossbow: '🎯', treasury: '🏦', forge: '⚒️',
};
const BUILDING_ICON = {
  barracks: 'img/icon_barracks.png?v=1',
  archers:  'img/icon_archers.png?v=1',
  mages:    'img/icon_mages.png?v=1',
  well:     'img/icon_well.png?v=1',
  crossbow: 'img/icon_crossbow.png?v=1',
  treasury: 'img/icon_treasury.png?v=1',
  forge:    'img/icon_forge.png?v=1',
};
const HERO_ICON = 'img/icon_hero.png?v=1';
function iconImg(k, alt) {
  return `<img class="bd-icon-img" src="${BUILDING_ICON[k]}" alt="${alt || BUILDING_LABELS[k] || k}" draggable="false">`;
}

// Постоянный ассортимент сундуков в табе «Сундуки»: покупаются за 💎, открытие = карточки.
const SHOP_CHESTS = [
  { id: 'basic',  name: 'Обычный',    img: 'img/chest_basic.png?v=1',  cost: 10, cards: 3, kind: 'random', desc: '3 случайные карточки' },
  { id: 'rare',   name: 'Редкий',     img: 'img/chest_rare.png?v=1',   cost: 18, cards: 4, kind: 'random', desc: '4 случайные карточки' },
  { id: 'mystic', name: 'Мистический', img: 'img/chest_mystic.png?v=1', cost: 25, cards: 5, kind: 'single', desc: '5 карточек одного типа — гарантированный ур.' },
];
const STARTER_GEMS = 15; // на первый запуск — на 1 обычный сундук с запасом

function metaBonus(bKey) {
  const lvl = state.metaLevels[bKey] | 0 || 1;
  return 1 + (lvl - 1) * META_BONUS_PER_LEVEL;
}

// ===== DOM =====
const menuPanelEl = document.getElementById('bd-menu');
const playPanelEl = document.getElementById('bd-play');
const menuBackBtn = document.getElementById('bd-menu-back');
const menuBodyEl = document.getElementById('bd-menu-body');
const menuGoldEl = document.getElementById('bd-menu-gold');
const menuGemsEl = document.getElementById('bd-menu-gems');
const tabBtns = document.querySelectorAll('.bd-tab');

const wrap = document.getElementById('bd-canvas-wrap');
const canvas = document.getElementById('bd-canvas');
const ctx = canvas.getContext('2d');
const titleEl = document.getElementById('bd-title');
const coinsEl = document.getElementById('bd-coins');
const armyEl = document.getElementById('bd-army');
const armyCountEl = document.getElementById('bd-army-count');
const armyMaxEl = document.getElementById('bd-army-max');
const hintEl = document.getElementById('bd-hint');
const startBtn = document.getElementById('bd-start');
const resetBtn = document.getElementById('bd-reset');
const surrenderBtn = document.getElementById('bd-surrender');
const heroBtn = document.getElementById('bd-hero-summon');
const heroStatusEl = document.getElementById('bd-hero-status');
const backBtn = document.getElementById('bd-back');
const shopEl = document.getElementById('bd-shop');
const shopRowEl = document.getElementById('bd-shop-row');
const rerollBtn = document.getElementById('bd-reroll');
const rerollCostEl = document.getElementById('bd-reroll-cost');
const stashEl = document.getElementById('bd-stash');
const stashRowEl = document.getElementById('bd-stash-row');

// ===== Ассеты =====
const groundImg = new Image();
let groundReady = false;
groundImg.addEventListener('load', () => { groundReady = true; backdropDirty = true; });
groundImg.src = 'img/ground.png?v=20260422c';

const treeImg = new Image();
let treeReady = false;
treeImg.addEventListener('load', () => { treeReady = true; backdropDirty = true; });
treeImg.src = 'img/tree.png?v=20260422d';

// offscreen фон — земля + деревья. Перерисовывается только при resize / load assets.
let backdropCanvas = null;
let backdropDirty = true;

// buildingImages[type][level] = { img, ready }
// Уровень 1 — синий, 2 — зелёный, 3 — красный.
const buildingImages = {};
function loadBuildingImage(type, level, src) {
  if (!buildingImages[type]) buildingImages[type] = {};
  const img = new Image();
  buildingImages[type][level] = { img, ready: false };
  img.addEventListener('load', () => { buildingImages[type][level].ready = true; });
  img.src = src;
}
for (const t of ['barracks', 'archers', 'well', 'mages', 'crossbow', 'treasury', 'forge']) {
  for (let lvl = 1; lvl <= 3; lvl++) {
    loadBuildingImage(t, lvl, 'img/' + t + '_' + lvl + '.png?v=6');
  }
}
function getBuildingSprite(type, level) {
  return buildingImages[type] && buildingImages[type][level];
}

const unitImages = {};
function loadUnitImage(type, src) {
  const img = new Image();
  unitImages[type] = { img, ready: false };
  img.addEventListener('load', () => { unitImages[type].ready = true; });
  img.src = src;
}
loadUnitImage('warrior',      'img/warrior.png?v=1');
loadUnitImage('archer',       'img/archer.png?v=1');
loadUnitImage('mage',         'img/mage.png?v=1');
loadUnitImage('goblin',       'img/goblin.png?v=1');
loadUnitImage('goblin_archer','img/goblin_archer.png?v=1');
loadUnitImage('goblin_mage',  'img/goblin_mage.png?v=1');
loadUnitImage('hero',         'img/hero.png?v=2');

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
// Зарезервированная высота под нижний overlay (магазин + stash).
// Поле боя не должно перекрываться им; high enough для shop+stash+padding.
const BOTTOM_OVERLAY_RESERVE = 130;
const TOP_OVERLAY_RESERVE = 130; // header (50) + hint (24) + Сброс/Начать бой (~50) + padding

// ===== Zoom & pan (камера) =====
// Минимум = 1.0 — нельзя отдалиться меньше начального вида (он считается максимальным обзором).
// Можно только приближать к ZOOM_MAX и панить внутри начального кадра.
const ZOOM_MIN = 1.0;
const ZOOM_MAX = 2.2;
const ZOOM_DEFAULT = 1;
// Точечное изменение зума с привязкой: точка в screen-coords (oldSx, oldSy) сейчас
// смотрит на world (x,y); после изменения мы хотим, чтобы тот же world (x,y) был
// под (newSx, newSy). Это позволяет «тянуть» сцену пальцами при pinch.
function applyZoom(newZoom, oldSx, oldSy, newSx, newSy) {
  newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newZoom));
  const worldX = (oldSx - state.panX) / state.zoom;
  const worldY = (oldSy - state.panY) / state.zoom;
  state.zoom = newZoom;
  state.panX = newSx - worldX * newZoom;
  state.panY = newSy - worldY * newZoom;
  clampView();
}

// Камера ограничена начальным кадром: при zoom=1 пан=0, при zoom>1 видимая
// область — подмножество начального вида (никакого выхода за пределы).
function clampView() {
  const cw = canvas.clientWidth;
  const ch = canvas.clientHeight;
  if (cw <= 0 || ch <= 0) return;
  state.panX = Math.max(cw * (1 - state.zoom), Math.min(0, state.panX));
  state.panY = Math.max(ch * (1 - state.zoom), Math.min(0, state.panY));
}
function resetView() { state.zoom = ZOOM_DEFAULT; state.panX = 0; state.panY = 0; }
function clientToWorld(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const sx = clientX - rect.left;
  const sy = clientY - rect.top;
  return { x: (sx - state.panX) / state.zoom, y: (sy - state.panY) / state.zoom };
}

function resize() {
  dpr = window.devicePixelRatio || 1;
  const cssW = wrap.clientWidth;
  const cssH = wrap.clientHeight;
  if (cssW <= 0 || cssH <= 0) return;
  const usableH = Math.max(60, cssH - BOTTOM_OVERLAY_RESERVE - TOP_OVERLAY_RESERVE);
  const byW = Math.floor((cssW - 16) / COLS);
  const byH = Math.floor(usableH / ROWS);
  cellSize = Math.max(24, Math.min(byW, byH));
  fieldW = cellSize * COLS;
  fieldH = cellSize * ROWS;
  offsetX = Math.floor((cssW - fieldW) / 2);
  // прижимаем поле к верху, оставляя место под top-overlay (Бой) и под bottom-overlay (магазин)
  offsetY = TOP_OVERLAY_RESERVE;
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  backdropDirty = true;
  // Геометрия мира меняется — сбрасываем камеру, чтобы не было осиротевших pan/zoom.
  resetView();
}

// ===== Координаты =====
function colToX(col) { return offsetX + col * cellSize; }
function rowToY(row) { return offsetY + row * cellSize; }
function isInsideBaseArea(col, row) {
  return state.baseCells.has(col + ',' + row);
}

function initStartingBase() {
  state.baseCells.clear();
  for (let c = BASE_START_LEFT; c < BASE_START_LEFT + BASE_START_COLS; c++) {
    for (let r = BASE_START_TOP; r < BASE_START_TOP + BASE_START_ROWS; r++) {
      state.baseCells.add(c + ',' + r);
    }
  }
}

function baseBBox() {
  let minC = COLS, maxC = -1, minR = ROWS, maxR = -1;
  for (const k of state.baseCells) {
    const [c, r] = k.split(',').map(Number);
    if (c < minC) minC = c;
    if (c > maxC) maxC = c;
    if (r < minR) minR = r;
    if (r > maxR) maxR = r;
  }
  return { minC, maxC, minR, maxR, w: maxC - minC + 1, h: maxR - minR + 1 };
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
  // В пуле здания + специальный товар «клетка расширения» со случайной формой
  const pool = [...Object.keys(BUILDINGS), 'expansion'];
  state.shop.items = [];
  for (let i = 0; i < 3; i++) {
    const t = pool[Math.floor(Math.random() * pool.length)];
    if (t === 'expansion') {
      const sh = pickExpansionShape();
      state.shop.items.push({
        type: 'expansion', sold: false,
        shape: sh.cells, cost: sh.cost, shapeName: sh.name,
      });
    } else {
      state.shop.items.push({ type: t, sold: false });
    }
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

function syncStash() {
  if (!stashEl || !stashRowEl) return;
  if (state.stash.length === 0 || state.mode === 'battle') {
    stashEl.hidden = true;
    return;
  }
  stashEl.hidden = false;
  stashRowEl.innerHTML = '';
  state.stash.forEach((item, idx) => {
    const def = BUILDINGS[item.type];
    const btn = document.createElement('button');
    btn.className = 'bd-stash-slot';
    btn.type = 'button';
    btn.dataset.stashIdx = String(idx);
    btn.innerHTML = `
      <div class="bd-stash-slot-icon" style="background: linear-gradient(135deg, ${def.color}, ${def.edge});">${def.icon}</div>
      ${item.level > 1 ? `<div class="bd-stash-slot-level">${item.level}</div>` : ''}
    `;
    btn.addEventListener('pointerdown', (e) => beginDrag(e, btn, {
      source: 'stash', stashIdx: idx, type: item.type, level: item.level,
    }));
    stashRowEl.appendChild(btn);
  });
}

function slotCost(slot) {
  return slot.type === 'expansion' ? (slot.cost || 10) : BUILDINGS[slot.type].cost;
}

function slotDisplay(slot) {
  if (slot.type === 'expansion') {
    return {
      name: slot.shape.length === 1 ? 'Клетка' : ('Клетки ' + slot.shapeName),
      icon: '➕',
      iconImg: null,
      color: '#84cc16',
      edge: '#3f6212',
    };
  }
  const def = BUILDINGS[slot.type];
  return { name: def.name, icon: def.icon, iconImg: BUILDING_ICON[slot.type] || null, color: def.color, edge: def.edge };
}

function syncShop() {
  shopRowEl.innerHTML = '';
  state.shop.items.forEach((slot, idx) => {
    const cost = slotCost(slot);
    const disp = slotDisplay(slot);
    const btn = document.createElement('button');
    btn.className = 'bd-shop-slot';
    if (slot.sold) btn.classList.add('sold');
    if (!slot.sold && state.coins < cost) btn.classList.add('cant-afford');
    btn.dataset.slot = String(idx);
    btn.type = 'button';
    const iconInner = disp.iconImg
      ? `<img src="${disp.iconImg}" alt="${disp.name}" class="bd-shop-icon-img" draggable="false">`
      : disp.icon;
    btn.innerHTML = `
      <div class="bd-shop-icon" style="background: linear-gradient(135deg, ${disp.color}, ${disp.edge});">${iconInner}</div>
      <div class="bd-shop-name">${disp.name}</div>
      <div class="bd-shop-price"><img src="img/icon_gold.png?v=1" alt="🪙" class="bd-coin-img-sm" draggable="false"><b>${cost}</b></div>
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
  const cost = slotCost(slot);
  if (state.coins < cost) {
    flashHint(`Нужно ${cost} 🪙 — у тебя ${state.coins}`);
    haptic('fail');
    return;
  }
  if (slot.type === 'expansion') {
    beginDrag(e, btn, { source: 'shop', slotIdx: idx, kind: 'expansion' });
  } else {
    beginDrag(e, btn, { source: 'shop', slotIdx: idx, kind: 'building', type: slot.type, level: 1 });
  }
}

// ===== Multi-pointer / pinch tracking =====
const activePointers = new Map(); // pointerId → {clientX, clientY}

function pinchDistance() {
  const pts = Array.from(activePointers.values());
  if (pts.length < 2) return 1;
  return Math.hypot(pts[0].clientX - pts[1].clientX, pts[0].clientY - pts[1].clientY);
}
function pinchCenter() {
  const pts = Array.from(activePointers.values());
  if (pts.length < 2) return { sx: 0, sy: 0 };
  const rect = canvas.getBoundingClientRect();
  return {
    sx: (pts[0].clientX + pts[1].clientX) / 2 - rect.left,
    sy: (pts[0].clientY + pts[1].clientY) / 2 - rect.top,
  };
}
function startPinch() {
  state.pinch = { lastDist: pinchDistance(), lastCenter: pinchCenter() };
}
function updatePinch() {
  if (!state.pinch || activePointers.size < 2) return;
  const dist = pinchDistance();
  const center = pinchCenter();
  const ratio = dist / state.pinch.lastDist;
  applyZoom(state.zoom * ratio, state.pinch.lastCenter.sx, state.pinch.lastCenter.sy, center.sx, center.sy);
  state.pinch.lastDist = dist;
  state.pinch.lastCenter = center;
}
function abortDragForPinch() {
  if (!state.drag) return;
  if (state.drag.source === 'base' && state._dragOriginal) {
    state.buildings.push(state._dragOriginal);
    state._dragOriginal = null;
  }
  const src = state.drag.sourceEl;
  if (src) {
    if (src.classList) src.classList.remove('dragging');
    src.removeEventListener('pointermove', onDragMove);
    src.removeEventListener('pointerup', onDragUp);
    src.removeEventListener('pointercancel', onDragCancel);
  }
  state.drag = null;
  state.dragHover = null;
}

function startCanvasPan(e) {
  state.canvasPan = {
    pointerId: e.pointerId,
    startClientX: e.clientX,
    startClientY: e.clientY,
    startPanX: state.panX,
    startPanY: state.panY,
  };
}
function onCanvasPointerDown(e) {
  activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
  if (activePointers.size === 2) {
    if (state.drag) abortDragForPinch();
    state.canvasPan = null;
    startPinch();
    return;
  }
  if (activePointers.size > 2) return;
  // В build/wave-end сначала проверяем, попали ли в здание — тогда обычный drag.
  if (state.mode === 'build' || state.mode === 'wave-end') {
    const w = clientToWorld(e.clientX, e.clientY);
    const col = Math.floor((w.x - offsetX) / cellSize);
    const row = Math.floor((w.y - offsetY) / cellSize);
    if (col >= 0 && col < COLS && row >= 0 && row < ROWS) {
      const b = findBuildingAt(col, row);
      if (b) { startDragFromBuilding(e, b); return; }
    }
  }
  // Пустое место (или battle) → одно-пальцевый pan камеры.
  startCanvasPan(e);
}
function onCanvasPointerMoveTrack(e) {
  if (activePointers.has(e.pointerId)) {
    activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
  }
  if (state.pinch && activePointers.size === 2) { updatePinch(); return; }
  if (state.canvasPan && state.canvasPan.pointerId === e.pointerId) {
    const dx = e.clientX - state.canvasPan.startClientX;
    const dy = e.clientY - state.canvasPan.startClientY;
    state.panX = state.canvasPan.startPanX + dx;
    state.panY = state.canvasPan.startPanY + dy;
    clampView();
  }
}
function onCanvasPointerEnd(e) {
  activePointers.delete(e.pointerId);
  if (state.pinch && activePointers.size < 2) state.pinch = null;
  if (state.canvasPan && state.canvasPan.pointerId === e.pointerId) state.canvasPan = null;
}

function startDragFromBuilding(e, b) {
  if (state.drag) return;
  // снимаем здание с базы на время drag, чтобы не мешало hover-merge
  state._dragOriginal = {
    type: b.type, col: b.col, row: b.row, level: b.level,
    lastSpawnT: b.lastSpawnT || 0, lastHealT: b.lastHealT || 0,
  };
  state.buildings = state.buildings.filter(x => x !== b);
  beginDrag(e, canvas, { source: 'base', type: b.type, level: b.level });
}

// ===== Drag-and-drop =====
function pickHover(type, cssX, cssY, level) {
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
  // и (если задан level) тот же уровень — same-level merge.
  let mergeTarget = null;
  if (inField) {
    let target = null, ok = true;
    for (const [dc, dr] of cells) {
      const b = findBuildingAt(anchorCol + dc, anchorRow + dr);
      if (!b) { ok = false; break; }
      if (target === null) target = b;
      else if (target !== b) { ok = false; break; }
    }
    if (ok && target && target.type === type && target.level < MAX_LEVEL) {
      const tCells = cellsOccupiedBy(target);
      const myCells = cells.map(([dc, dr]) => [anchorCol + dc, anchorRow + dr]);
      const shapeMatch = tCells.length === myCells.length
        && tCells.every(([a, b]) => myCells.some(([x, y]) => x === a && y === b));
      const levelMatch = (level === undefined) || target.level === level;
      if (shapeMatch && levelMatch) mergeTarget = target;
    }
  }

  let valid;
  if (mergeTarget) valid = true;
  else valid = inField && canPlace(type, anchorCol, anchorRow);

  return { anchorCol, anchorRow, valid, inField, cssX, cssY, mergeTarget };
}

function beginDrag(e, sourceEl, dragData) {
  if (state.mode !== 'build' && state.mode !== 'wave-end') return;
  if (state.drag) return;
  e.preventDefault();
  state.drag = Object.assign({
    x: e.clientX, y: e.clientY, pointerId: e.pointerId, sourceEl,
  }, dragData);
  if (sourceEl && sourceEl.classList) sourceEl.classList.add('dragging');
  try { sourceEl.setPointerCapture(e.pointerId); } catch (_) {}
  sourceEl.addEventListener('pointermove', onDragMove);
  sourceEl.addEventListener('pointerup', onDragUp);
  sourceEl.addEventListener('pointercancel', onDragCancel);
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
  const drag = state.drag;
  endDrag(e);
  if (hover && hover.valid) {
    completeDrop(drag, hover);
    return;
  }
  // невалидный drop
  if (drag.source === 'base') {
    // утащил здание за поле (или на занятое) → в склад
    state.stash.push({ type: drag.type, level: drag.level });
    state._dragOriginal = null;
    syncUi();
    haptic('impact');
  } else {
    if (hover && hover.inField) {
      flashHint('Сюда не помещается');
      haptic('fail');
    }
  }
}

function onDragCancel(e) {
  if (!state.drag || e.pointerId !== state.drag.pointerId) return;
  // системный cancel — возвращаем base-здание на место
  if (state.drag.source === 'base' && state._dragOriginal) {
    state.buildings.push(state._dragOriginal);
    state._dragOriginal = null;
  }
  endDrag(e);
}

function endDrag(e) {
  const src = state.drag && state.drag.sourceEl;
  if (src) {
    try { src.releasePointerCapture(e.pointerId); } catch (_) {}
    if (src.classList) src.classList.remove('dragging');
    src.removeEventListener('pointermove', onDragMove);
    src.removeEventListener('pointerup', onDragUp);
    src.removeEventListener('pointercancel', onDragCancel);
  }
  state.drag = null;
  state.dragHover = null;
}

function updateDragHover() {
  if (!state.drag) { state.dragHover = null; return; }
  const w = clientToWorld(state.drag.x, state.drag.y);
  if (state.drag.kind === 'expansion') {
    state.dragHover = pickExpansionHover(w.x, w.y);
  } else {
    state.dragHover = pickHover(state.drag.type, w.x, w.y, state.drag.level);
  }
}

function pickExpansionHover(cssX, cssY) {
  const slot = state.drag && state.shop.items[state.drag.slotIdx];
  const shape = (slot && slot.shape) || [[0, 0]];
  const sb = shapeBBoxFromCells(shape);
  const inField = cssX >= offsetX && cssX <= offsetX + fieldW
               && cssY >= offsetY && cssY <= offsetY + fieldH;
  // anchor — центрируем форму под курсором
  const fx = (cssX - offsetX) / cellSize - sb.w / 2;
  const fy = (cssY - offsetY) / cellSize - sb.h / 2;
  let anchorCol = Math.max(0, Math.min(COLS - sb.w, Math.round(fx)));
  let anchorRow = Math.max(0, Math.min(ROWS - sb.h, Math.round(fy)));

  let valid = inField;
  let anyAdjacent = false;
  for (const [dc, dr] of shape) {
    const c = anchorCol + dc, r = anchorRow + dr;
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) { valid = false; break; }
    if (state.baseCells.has(c + ',' + r)) { valid = false; break; }
    if (!anyAdjacent) {
      if (state.baseCells.has(c + ',' + (r - 1))
       || state.baseCells.has(c + ',' + (r + 1))
       || state.baseCells.has((c - 1) + ',' + r)
       || state.baseCells.has((c + 1) + ',' + r)) {
        anyAdjacent = true;
      }
    }
  }
  if (valid && !anyAdjacent) valid = false;

  if (valid) {
    const bb = baseBBox();
    let minC = bb.minC, maxC = bb.maxC, minR = bb.minR, maxR = bb.maxR;
    for (const [dc, dr] of shape) {
      const c = anchorCol + dc, r = anchorRow + dr;
      if (c < minC) minC = c;
      if (c > maxC) maxC = c;
      if (r < minR) minR = r;
      if (r > maxR) maxR = r;
    }
    if (maxC - minC + 1 > BASE_MAX_W || maxR - minR + 1 > BASE_MAX_H) valid = false;
  }

  return { anchorCol, anchorRow, cssX, cssY, inField, valid, shape };
}

function completeDrop(drag, hover) {
  if (drag.kind === 'expansion') {
    dropExpansion(drag, hover);
    return;
  }
  if (drag.source === 'shop') {
    dropFromShop(drag, hover);
  } else if (drag.source === 'base') {
    dropFromBase(drag, hover);
  } else if (drag.source === 'stash') {
    dropFromStash(drag, hover);
  }
}

function dropExpansion(drag, hover) {
  const slot = state.shop.items[drag.slotIdx];
  if (!slot || slot.sold) return;
  const cost = slot.cost || 10;
  if (state.coins < cost) return;
  state.coins -= cost;
  slot.sold = true;
  for (const [dc, dr] of slot.shape) {
    state.baseCells.add((hover.anchorCol + dc) + ',' + (hover.anchorRow + dr));
  }
  syncUi();
  syncShop();
  haptic('success');
}

function dropFromShop(drag, hover) {
  const slot = state.shop.items[drag.slotIdx];
  if (!slot || slot.sold) return;
  const def = BUILDINGS[slot.type];
  if (state.coins < def.cost) return;
  if (hover.mergeTarget) {
    hover.mergeTarget.level = Math.min(MAX_LEVEL, hover.mergeTarget.level + 1);
    hover.mergeTarget.lastSpawnT = 0;
    hover.mergeTarget.lastHealT = 0;
    haptic('success');
  } else {
    state.buildings.push({
      type: slot.type, col: hover.anchorCol, row: hover.anchorRow,
      level: 1, lastSpawnT: 0, lastHealT: 0,
    });
    haptic('impact');
  }
  state.coins -= def.cost;
  slot.sold = true;
  syncUi();
  syncShop();
}

function dropFromBase(drag, hover) {
  if (hover.mergeTarget) {
    hover.mergeTarget.level = Math.min(MAX_LEVEL, hover.mergeTarget.level + 1);
    hover.mergeTarget.lastSpawnT = 0;
    hover.mergeTarget.lastHealT = 0;
    state._dragOriginal = null;
    haptic('success');
  } else {
    state.buildings.push({
      type: drag.type, col: hover.anchorCol, row: hover.anchorRow,
      level: drag.level, lastSpawnT: 0, lastHealT: 0,
    });
    state._dragOriginal = null;
    haptic('impact');
  }
  syncUi();
}

function dropFromStash(drag, hover) {
  const item = state.stash[drag.stashIdx];
  if (!item) return;
  if (hover.mergeTarget) {
    hover.mergeTarget.level = Math.min(MAX_LEVEL, hover.mergeTarget.level + 1);
    hover.mergeTarget.lastSpawnT = 0;
    hover.mergeTarget.lastHealT = 0;
    haptic('success');
  } else {
    state.buildings.push({
      type: item.type, col: hover.anchorCol, row: hover.anchorRow,
      level: item.level, lastSpawnT: 0, lastHealT: 0,
    });
    haptic('impact');
  }
  state.stash.splice(drag.stashIdx, 1);
  syncUi();
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
    hintEl.textContent = `Волна ${state.wave}/${state.totalWaves}. Тяни из магазина / переставляй / 2 одинаковых = слияние. Утащи за поле — в склад`;
  } else if (state.mode === 'battle') {
    hintEl.textContent = `Волна ${state.wave}/${state.totalWaves}: осталось врагов ${state.enemies.length + state.enemiesToSpawn}`;
  } else if (state.mode === 'wave-end') {
    hintEl.textContent = `Волна пройдена! +${WAVE_REWARD} 🪙 +${WAVE_GOLD_REWARD} 💰 +${WAVE_GEM_REWARD} 💎. Дальше — волна ${state.wave}/${state.totalWaves}`;
  } else if (state.mode === 'level-cleared') {
    const g = state.lastReward?.gems ?? LEVEL_CLEAR_GEM_BONUS;
    const gd = state.lastReward?.gold ?? LEVEL_CLEAR_GOLD_BONUS;
    hintEl.textContent = `🏆 Локация очищена! +${gd} 💰 +${g} 💎. Открыта следующая локация`;
  } else if (state.mode === 'defeat') {
    const g = state.lastReward?.gems | 0;
    const gd = state.lastReward?.gold | 0;
    if (g > 0 || gd > 0) {
      const parts = [];
      if (gd > 0) parts.push(`+${gd} 💰`);
      if (g > 0) parts.push(`+${g} 💎`);
      hintEl.textContent = `База разрушена. ${parts.join(' ')} за пройденные волны. «Заново» — с нуля`;
    } else {
      hintEl.textContent = `База разрушена. «Заново» — пройти этот уровень с нуля`;
    }
  }
}

// ===== Волна =====
const WAVE_REWARD = 25;            // 🪙 боевых за волну (тратится в этом же бою)
const WAVE_GEM_REWARD = 1;         // 💎 за каждую пройденную волну
const WAVE_GOLD_REWARD = 5;        // 💰 мета-золота за каждую пройденную волну
const LEVEL_CLEAR_GEM_BONUS = 5;   // 💎 бонус за чистку локации
const LEVEL_CLEAR_GOLD_BONUS = 25; // 💰 мета-золота бонус за чистку локации
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
  // отменяем активный drag и возвращаем здание (если было)
  if (state._dragOriginal) { state.buildings.push(state._dragOriginal); state._dragOriginal = null; }
  state.drag = null;
  state.dragHover = null;
  state.enemiesToSpawn = ENEMIES_PER_WAVE + (state.wave - 1) * 2;
  state.enemySpawnAccum = 0;
  for (const b of state.buildings) { b.lastSpawnT = 0; b.lastHealT = 0; }
  syncUi();
  haptic('impact');
}

function endWave(victory) {
  state.lastReward = { coins: 0, gems: 0, gold: 0 };
  // Доход от казны: суммируем по всем treasury за каждую пройденную волну (победа любого типа)
  let treasuryGold = 0;
  if (victory) {
    const treasuryMeta = metaBonus('treasury');
    for (const b of state.buildings) {
      if (b.type === 'treasury') treasuryGold += Math.round((TREASURY_INCOME.treasury[b.level - 1] | 0) * treasuryMeta);
    }
  }
  if (victory) {
    state.coins += WAVE_REWARD;
    state.gems += WAVE_GEM_REWARD;
    state.gold += WAVE_GOLD_REWARD + treasuryGold;
    state.lastReward.coins = WAVE_REWARD;
    state.lastReward.gems = WAVE_GEM_REWARD;
    state.lastReward.gold = WAVE_GOLD_REWARD + treasuryGold;
    if (state.wave >= state.totalWaves) {
      // победа уровня
      const cur = state.currentLocation;
      if (cur && state.locations[cur]) {
        state.locations[cur].beaten = true;
        const idx = LOCATION_ORDER.indexOf(cur);
        if (idx >= 0 && idx + 1 < LOCATION_ORDER.length) {
          state.locations[LOCATION_ORDER[idx + 1]].unlocked = true;
        }
      }
      state.gems += LEVEL_CLEAR_GEM_BONUS;
      state.gold += LEVEL_CLEAR_GOLD_BONUS;
      state.lastReward.gems += LEVEL_CLEAR_GEM_BONUS;
      state.lastReward.gold += LEVEL_CLEAR_GOLD_BONUS;
      state.mode = 'level-cleared';
    } else {
      state.wave += 1;
      state.mode = 'wave-end';
      generateShop();
    }
    haptic('success');
  } else {
    // при поражении возвращаем 💎 и 💰 за уже пройденные волны (текущая не считается)
    const wavesSurvived = Math.max(0, state.wave - 1);
    const gemsBack = wavesSurvived * WAVE_GEM_REWARD;
    const goldBack = wavesSurvived * WAVE_GOLD_REWARD;
    if (gemsBack > 0) state.gems += gemsBack;
    if (goldBack > 0) state.gold += goldBack;
    state.lastReward.gems = gemsBack;
    state.lastReward.gold = goldBack;
    state.mode = 'defeat';
    haptic('fail');
  }
  // Если герой пережил волну — он "возвращается в казармы": доступен следующей волной без таймера
  if (state.hero.alive) { state.hero.alive = false; state.hero.deathAt = 0; }
  state.allies.length = 0;
  state.enemies.length = 0;
  state.fx.length = 0;
  saveGame();
  syncUi();
  syncShop();
  if (state.mode === 'defeat') showBattleResultModal('defeat');
  else if (state.mode === 'level-cleared') showBattleResultModal('cleared');
}

function surrender() {
  // Сдаться и выйти в меню, получив 💎 и 💰 за пройденные волны (как при поражении)
  const wavesSurvived = Math.max(0, state.wave - 1);
  const gemsBack = wavesSurvived * WAVE_GEM_REWARD;
  const goldBack = wavesSurvived * WAVE_GOLD_REWARD;
  if (gemsBack > 0) state.gems += gemsBack;
  if (goldBack > 0) state.gold += goldBack;
  saveGame();
  haptic('impact');
  exitToMenu();
  if (wavesSurvived > 0) {
    const parts = [];
    if (goldBack > 0) parts.push(`+${goldBack} 💰`);
    if (gemsBack > 0) parts.push(`+${gemsBack} 💎`);
    flashMenuHint(`${parts.join(' ')} за ${wavesSurvived} волн`, 'success');
  }
}

function resetAll() {
  state.mode = 'build';
  state.coins = 100;
  state.wave = 1;
  state.baseHp = state.baseHpMax;
  state.buildings.length = 0;
  state.allies.length = 0;
  state.enemies.length = 0;
  state.fx.length = 0;
  state.enemiesToSpawn = 0;
  state.shop.rerollCost = 3;
  state.stash.length = 0;
  state._dragOriginal = null;
  initStartingBase();
  resetHeroForLocation();
  generateShop();
  syncUi();
  syncShop();
  haptic('impact');
}

// ===== Юниты =====
function spawnUnit(type, x, y, bonus = 1) {
  const def = UNITS[type];
  let hpMul = bonus, dmgMul = bonus, cdMul = 1;
  if (def.team === 'ally') {
    const fb = forgeBuff();
    hpMul  *= fb.hp;
    dmgMul *= fb.dmg;
    cdMul  /= fb.atkSpeed; // больше atkSpeed → меньше cd
  }
  const hpMax = Math.round(def.hpMax * hpMul);
  const u = {
    id: state.unitIdSeq++,
    type, team: def.team,
    x, y, hp: hpMax, hpMax,
    dmg: def.dmg * dmgMul, speed: def.speed,
    atkRange: def.atkRange, atkCdMs: def.atkCdMs * cdMul,
    aggroRange: def.aggroRange,
    radius: def.radius, color: def.color, edge: def.edge, icon: def.icon,
    atkAccum: def.atkCdMs * 0.6,
    targetId: null,
    isHero: type === 'hero',
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
      // Герой не занимает слот в лимите союзников
      const armyCount = state.allies.reduce((n, a) => n + (a.isHero ? 0 : 1), 0);
      if (armyCount >= MAX_ALLIES) {
        // поле заполнено — держим таймер на максимуме и ждём смерти союзников
        b.lastSpawnT = sc.spawnEveryMs;
      } else {
        b.lastSpawnT -= sc.spawnEveryMs;
        const room = MAX_ALLIES - armyCount;
        const count = Math.min(sc.spawnCount, room);
        const [tdc, tdr] = buildingTopCell(b.type);
        const bonus = metaBonus(b.type);
        for (let i = 0; i < count; i++) {
          const off = (i - (count - 1) / 2) * 10;
          const x = colToX(b.col + tdc + 0.5) + off;
          const y = rowToY(b.row + tdr) - cellSize * 0.05;
          spawnUnit(def.unitType, x, y, bonus);
        }
      }
    }
  } else if (b.type === 'well') {
    const sc = HEAL_SCALING.well[b.level - 1];
    b.lastHealT = (b.lastHealT || 0) + dt;
    if (b.lastHealT >= sc.healEveryMs) {
      b.lastHealT -= sc.healEveryMs;
      const healAmt = Math.max(1, Math.round(sc.healAmount * metaBonus('well')));
      for (const u of state.allies) {
        if (u.hp > 0 && u.hp < u.hpMax) {
          u.hp = Math.min(u.hpMax, u.hp + healAmt);
        }
      }
      const bbox = buildingBBox(b.type);
      const x = colToX(b.col + bbox.w / 2);
      const y = rowToY(b.row + bbox.h / 2);
      state.fx.push({ kind: 'pulse', x, y, r0: cellSize * 0.6, r1: cellSize * 1.6, color: 'rgba(52, 211, 153, 0.45)', ttl: 360, life: 360 });
    }
  } else if (b.type === 'crossbow') {
    const sc = TOWER_ATTACK.crossbow[b.level - 1];
    b.lastAtkT = (b.lastAtkT || 0) + dt;
    const bbox = buildingBBox(b.type);
    const cx = colToX(b.col + bbox.w / 2);
    const cy = rowToY(b.row + bbox.h / 2);
    // Каждый кадр ищем ближайшего врага в радиусе, чтобы поворачивать спрайт за целью.
    let nearest = null, bestD = Infinity;
    for (const e of state.enemies) {
      if (e.hp <= 0) continue;
      const dx = e.x - cx, dy = e.y - cy;
      const d = Math.hypot(dx, dy);
      if (d <= sc.range && d < bestD) { bestD = d; nearest = e; }
    }
    if (nearest) {
      // Спрайт «по умолчанию» смотрит вниз → поворот = atan2(dy,dx) - π/2.
      const target = Math.atan2(nearest.y - cy, nearest.x - cx) - Math.PI / 2;
      // Плавный поворот к цели — лимит ~8 рад/сек.
      const cur = b.aimAngle || 0;
      let diff = target - cur;
      while (diff >  Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const maxTurn = 8 * dt / 1000;
      b.aimAngle = cur + Math.max(-maxTurn, Math.min(maxTurn, diff));
    }
    // Стрельба только когда cooldown готов и есть цель.
    if (b.lastAtkT < sc.cdMs) return;
    if (!nearest) return;
    b.lastAtkT = 0;
    const dmg = Math.round(sc.dmg * metaBonus('crossbow'));
    nearest.hp -= dmg;
    state.fx.push({
      kind: 'arrow',
      x1: cx, y1: cy - 6,
      x2: nearest.x, y2: nearest.y - 2,
      color: 'rgba(251, 191, 36, 0.95)',
      ttl: 130, life: 130,
    });
    registerHeroHit();
  }
  // forge — пассивный баф (применяется в spawnUnit), updateBuilding ничего не делает
  // treasury — пассивный доход (начисляется в endWave при victory)
}

// Пул врагов по волнам. [type, weight] — weight увеличивает шанс.
function enemyPoolForWave(w) {
  if (w <= 2) return [['goblin', 1]];
  if (w <= 5) return [['goblin', 6], ['goblin_archer', 4]];
  if (w <= 8) return [['goblin', 5], ['goblin_archer', 4], ['goblin_mage', 2]];
  return [['goblin', 4], ['goblin_archer', 4], ['goblin_mage', 3]];
}
function pickEnemyType(w) {
  const pool = enemyPoolForWave(w);
  const total = pool.reduce((s, p) => s + p[1], 0);
  let r = Math.random() * total;
  for (const [type, weight] of pool) {
    r -= weight;
    if (r <= 0) return type;
  }
  return pool[0][0];
}
// Враги спавнятся выше видимой границы поля (буфер) и идут вниз. Союзники не пересекают offsetY.
const SPAWN_BUFFER_ROWS = 2;
function spawnEnemyTick(dt) {
  if (state.enemiesToSpawn <= 0) return;
  state.enemySpawnAccum += dt;
  if (state.enemySpawnAccum < state.enemySpawnEveryMs) return;
  state.enemySpawnAccum -= state.enemySpawnEveryMs;
  const x = offsetX + 12 + Math.random() * (fieldW - 24);
  const y = offsetY - SPAWN_BUFFER_ROWS * cellSize + Math.random() * 16;
  spawnUnit(pickEnemyType(state.wave), x, y);
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
  const bb = baseBBox();
  if (bb.maxC < 0) {
    // fallback когда base пуст (не должно случаться)
    return { x: offsetX, y: offsetY + fieldH, w: 0, h: 0 };
  }
  return {
    x: colToX(bb.minC),
    y: rowToY(bb.minR),
    w: bb.w * cellSize,
    h: bb.h * cellSize,
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

function emitArrow(from, to, color = 'rgba(253, 224, 71, 0.95)') {
  state.fx.push({
    kind: 'arrow',
    x1: from.x, y1: from.y - 2,
    x2: to.x,   y2: to.y - 2,
    color,
    ttl: 110, life: 110,
  });
}

function updateAllies(dt) {
  // Hold line — куда продвигаются юниты, если врагов нет в aggroRange. На 1 ряд выше базы,
  // чтобы юниты не оставались на крышах строений и встречали волну на подступах.
  const baseTopY = baseRect().y;
  const holdLineY = Math.max(offsetY + 4, baseTopY - cellSize * 1);
  for (const u of state.allies) {
    if (u.hp <= 0) continue;
    const { target, dist } = findNearest(u, state.enemies);
    u.atkAccum += dt;
    if (target) {
      if (dist <= u.atkRange + target.radius) {
        if (u.atkAccum >= u.atkCdMs) {
          u.atkAccum = 0;
          const def = UNITS[u.type];
          if (def.aoeRadius) {
            // AoE: урон по цели + всем врагам в радиусе вокруг точки попадания
            const r2 = def.aoeRadius * def.aoeRadius;
            for (const e of state.enemies) {
              if (e.hp <= 0) continue;
              const dx = e.x - target.x, dy = e.y - target.y;
              if (dx * dx + dy * dy <= r2) e.hp -= u.dmg;
            }
            state.fx.push({
              kind: 'pulse', x: target.x, y: target.y,
              r0: def.aoeRadius * 0.3, r1: def.aoeRadius,
              color: 'rgba(167, 139, 250, 0.55)',
              ttl: 280, life: 280,
            });
            if (u.type === 'mage') emitMageBolt(u, target);
          } else {
            target.hp -= u.dmg;
            if (u.type === 'archer') emitArrow(u, target);
          }
          registerHeroHit();
        }
      } else {
        moveTowards(u, target.x, target.y, dt);
      }
    } else if (u.y > holdLineY + u.radius) {
      // Никого в aggroRange — двигаемся к hold-линии (вверх). Юниты выше hold-линии не сдвигаются.
      moveTowards(u, u.x, holdLineY, dt);
    }
    u.x = Math.max(offsetX + u.radius, Math.min(offsetX + fieldW - u.radius, u.x));
    u.y = Math.max(offsetY + u.radius, u.y);
  }
  for (const u of state.allies) if (u.hp > 0) separation(u, state.allies);
}

// ===== Герой =====
function heroReady() {
  if (state.hero.alive) return false;
  if (!state.hero.firstSummonDone) return state.hero.meterHits >= HERO_HITS_TO_SUMMON;
  if (state.hero.deathAt === 0) return true;          // не умирал в этой сессии — доступен сразу
  return Date.now() - state.hero.deathAt >= HERO_RESPAWN_MS;
}
function heroProgress() {
  // Возвращает [0..1] для UI: либо meter (до 1-го призыва), либо 1 - timer/RESPAWN (после смерти).
  if (state.hero.alive) return 1;
  if (!state.hero.firstSummonDone) return Math.min(1, state.hero.meterHits / HERO_HITS_TO_SUMMON);
  if (state.hero.deathAt === 0) return 1;
  const elapsed = Date.now() - state.hero.deathAt;
  return Math.min(1, elapsed / HERO_RESPAWN_MS);
}
function registerHeroHit() {
  if (state.hero.firstSummonDone) return;
  if (state.hero.meterHits < HERO_HITS_TO_SUMMON) state.hero.meterHits++;
}
function summonHero() {
  if (state.mode !== 'battle') return;
  if (!heroReady()) return;
  state.hero.alive = true;
  state.hero.firstSummonDone = true;
  state.hero.meterHits = 0;
  state.hero.deathAt = 0;
  const x = offsetX + fieldW / 2;
  const y = offsetY + fieldH - UNITS.hero.radius - 4;
  spawnUnit('hero', x, y);
  haptic('impact');
}
function syncHeroUi() {
  if (!heroBtn) return;
  // Показываем во всех play-режимах (build/battle/wave-end). Призыв возможен только в battle.
  const visible = state.screen === 'play' && state.mode !== 'defeat' && state.mode !== 'level-cleared';
  heroBtn.hidden = !visible;
  if (!visible) return;
  const ready = heroReady();
  const p = heroProgress();
  heroBtn.style.setProperty('--p', String(p));
  heroBtn.classList.toggle('ready', ready);
  if (state.hero.alive) {
    heroStatusEl.textContent = 'в бою';
  } else if (!state.hero.firstSummonDone) {
    heroStatusEl.textContent = `${state.hero.meterHits}/${HERO_HITS_TO_SUMMON}`;
  } else if (state.hero.deathAt === 0) {
    heroStatusEl.textContent = 'готов';
  } else {
    const left = Math.max(0, HERO_RESPAWN_MS - (Date.now() - state.hero.deathAt));
    heroStatusEl.textContent = `${Math.ceil(left / 1000)}с`;
  }
}
function resetHeroForLocation() {
  state.hero.firstSummonDone = false;
  state.hero.meterHits = 0;
  state.hero.alive = false;
  state.hero.deathAt = 0;
}

function emitMageBolt(from, to, color = 'rgba(196, 181, 253, 0.95)') {
  state.fx.push({
    kind: 'arrow',
    x1: from.x, y1: from.y - 2,
    x2: to.x,   y2: to.y - 2,
    color,
    ttl: 140, life: 140,
  });
}

function updateEnemies(dt) {
  const r = baseRect();
  for (const u of state.enemies) {
    if (u.hp <= 0) continue;
    const def = UNITS[u.type];
    u.atkAccum += dt;
    const insideBase = u.x >= r.x && u.x <= r.x + r.w && u.y >= r.y && u.y <= r.y + r.h;
    if (insideBase) {
      if (u.atkAccum >= u.atkCdMs) {
        u.atkAccum = 0;
        state.baseHp = Math.max(0, state.baseHp - u.dmg);
      }
      u.x = Math.max(offsetX + u.radius, Math.min(offsetX + fieldW - u.radius, u.x));
      u.y = Math.max(offsetY + u.radius, u.y);
      continue;
    }
    const { target, dist } = findNearest(u, state.allies);
    if (target && dist <= u.aggroRange) {
      if (dist <= u.atkRange + target.radius) {
        if (u.atkAccum >= u.atkCdMs) {
          u.atkAccum = 0;
          if (def.aoeRadius) {
            const r2 = def.aoeRadius * def.aoeRadius;
            for (const a of state.allies) {
              if (a.hp <= 0) continue;
              const dx = a.x - target.x, dy = a.y - target.y;
              if (dx * dx + dy * dy <= r2) a.hp -= u.dmg;
            }
            state.fx.push({
              kind: 'pulse', x: target.x, y: target.y,
              r0: def.aoeRadius * 0.3, r1: def.aoeRadius,
              color: 'rgba(192, 132, 252, 0.55)',
              ttl: 280, life: 280,
            });
            emitMageBolt(u, target, 'rgba(216, 180, 254, 0.95)');
          } else {
            target.hp -= u.dmg;
            if (u.type === 'goblin_archer') emitArrow(u, target, 'rgba(234, 88, 12, 0.95)');
          }
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
  // Засекаем смерть героя до фильтрации, чтобы запустить таймер респавна
  if (state.hero.alive) {
    for (const u of state.allies) {
      if (u.isHero && u.hp <= 0) {
        state.hero.alive = false;
        state.hero.deathAt = Date.now();
        break;
      }
    }
  }
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
  if (state.screen === 'play') {
    if (state.mode === 'battle') {
      for (const b of state.buildings) updateBuilding(b, dt);
      spawnEnemyTick(dt);
      updateAllies(dt);
      updateEnemies(dt);
      updateFx(dt);
      cleanupCorpses();
      checkWaveEnd();
      syncHint();
      syncArmyCounter();
      syncHeroUi();
    } else {
      updateFx(dt);
    }
    draw();
  }
  requestAnimationFrame(tick);
}

// ===== Рендер =====
function draw() {
  const cssW = wrap.clientWidth;
  const cssH = wrap.clientHeight;
  if (cssW <= 0 || cssH <= 0) return;

  // Заливка фона канваса (видна за пределами world при zoom < 1)
  ctx.save();
  ctx.fillStyle = '#0a0f17';
  ctx.fillRect(0, 0, cssW, cssH);
  ctx.restore();

  // Камера: pan + zoom применяем поверх dpr-transform.
  ctx.save();
  ctx.translate(state.panX, state.panY);
  ctx.scale(state.zoom, state.zoom);

  drawBackdrop(cssW, cssH);
  drawBaseZone();
  drawBuildings();
  drawUnits(state.allies);
  drawUnits(state.enemies);
  drawFx();
  drawBaseHpBar();
  if (state.drag && state.dragHover) {
    if (state.drag.kind === 'expansion') drawExpansionPreview(state.dragHover);
    else drawDragPreview(state.drag.type, state.dragHover);
  }
  ctx.restore();

  // HUD-баннеры — в screen coords
  if (state.mode === 'wave-end') drawCenterBanner('Победа!', `+${WAVE_REWARD} 🪙  +${WAVE_GOLD_REWARD} 💰  +${WAVE_GEM_REWARD} 💎`);
  // defeat и level-cleared показываются модалкой showBattleResultModal()
}

const trees = [];
const fieldTrees = [];
function genTrees() {
  trees.length = 0;
  const rng = mulberry32(7);
  // ~9 на каждую сторону, разбросаны разреженно (не строй-в-ряд)
  for (let i = 0; i < 18; i++) {
    trees.push({
      side: i % 2 === 0 ? 'L' : 'R',
      ny: rng(),
      ns: 0.6 + rng() * 0.65,
      no: rng(),
    });
  }
  // нижние перекрывают верхние — правильная глубина
  trees.sort((a, b) => a.ny - b.ny);

  // мелкие декор-деревья внутри поля, только в верхних 70% (над базой)
  fieldTrees.length = 0;
  const rngF = mulberry32(91);
  for (let i = 0; i < 6; i++) {
    fieldTrees.push({
      nx: 0.06 + rngF() * 0.88,
      ny: 0.04 + rngF() * 0.62,
      ns: 0.45 + rngF() * 0.4,
    });
  }
  fieldTrees.sort((a, b) => a.ny - b.ny);
}
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function drawSideTreesOn(c, cssW, cssH) {
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
    drawTreeOn(c, xx, yy, sz);
  });
}

function drawFieldTreesOn(c) {
  for (const t of fieldTrees) {
    const x = offsetX + t.nx * fieldW;
    const y = offsetY + t.ny * fieldH;
    drawTreeOn(c, x, y, cellSize * 0.55 * t.ns);
  }
}
function drawTreeOn(c, x, y, s) {
  if (treeReady && treeImg.naturalWidth > 0) {
    const aspect = treeImg.naturalWidth / treeImg.naturalHeight;
    const h = s * 1.55;
    const w = h * aspect;
    c.drawImage(treeImg, x - w / 2, y - h * 0.95, w, h);
    return;
  }
  // fallback пока картинка не загрузилась
  c.fillStyle = '#5a3820';
  c.fillRect(x - s * 0.07, y, s * 0.14, s * 0.45);
  c.fillStyle = '#235430';
  c.beginPath();
  c.moveTo(x, y - s * 0.5);
  c.lineTo(x - s * 0.3, y);
  c.lineTo(x + s * 0.3, y);
  c.closePath();
  c.fill();
}
function triangle(cx, top, w, h) {
  ctx.beginPath();
  ctx.moveTo(cx, top);
  ctx.lineTo(cx - w / 2, top + h);
  ctx.lineTo(cx + w / 2, top + h);
  ctx.closePath();
  ctx.fill();
}

function drawBackdrop(cssW, cssH) {
  if (backdropDirty || !backdropCanvas) rebuildBackdrop(cssW, cssH);
  if (backdropCanvas) ctx.drawImage(backdropCanvas, 0, 0, cssW, cssH);
}

function rebuildBackdrop(cssW, cssH) {
  if (cssW <= 0 || cssH <= 0) return;
  if (!backdropCanvas) backdropCanvas = document.createElement('canvas');
  backdropCanvas.width = Math.max(1, Math.floor(cssW * dpr));
  backdropCanvas.height = Math.max(1, Math.floor(cssH * dpr));
  const bctx = backdropCanvas.getContext('2d');
  bctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // земля
  if (groundReady) {
    const pat = bctx.createPattern(groundImg, 'repeat');
    if (pat && pat.setTransform && typeof DOMMatrix !== 'undefined') {
      pat.setTransform(new DOMMatrix().scale(0.32, 0.32));
    }
    bctx.fillStyle = pat;
    bctx.fillRect(0, 0, cssW, cssH);
    bctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
    bctx.fillRect(0, 0, cssW, cssH);
  } else {
    const grad = bctx.createLinearGradient(0, 0, 0, cssH);
    grad.addColorStop(0, '#274a30');
    grad.addColorStop(0.55, '#1c3922');
    grad.addColorStop(1, '#102818');
    bctx.fillStyle = grad;
    bctx.fillRect(0, 0, cssW, cssH);
  }

  // деревья — затемнение применяется здесь один раз
  if (treeReady) {
    bctx.save();
    bctx.filter = 'brightness(0.62)';
    drawSideTreesOn(bctx, cssW, cssH);
    drawFieldTreesOn(bctx);
    bctx.restore();
  }

  backdropDirty = false;
}

function drawBaseZone() {
  const inBuild = state.mode === 'build' || state.mode === 'wave-end';
  const fillCol = inBuild ? 'rgba(120, 200, 140, 0.16)' : 'rgba(120, 200, 140, 0.07)';
  const strokeCell = inBuild ? 'rgba(140, 220, 160, 0.42)' : 'rgba(140, 220, 160, 0.18)';
  const strokePerim = inBuild ? 'rgba(140, 220, 160, 0.85)' : 'rgba(140, 220, 160, 0.5)';

  // заливка + обводка каждой клетки отдельно
  ctx.fillStyle = fillCol;
  for (const k of state.baseCells) {
    const [c, r] = k.split(',').map(Number);
    const x = colToX(c), y = rowToY(r);
    ctx.fillRect(x, y, cellSize, cellSize);
  }
  ctx.strokeStyle = strokeCell;
  ctx.lineWidth = 1;
  for (const k of state.baseCells) {
    const [c, r] = k.split(',').map(Number);
    const x = colToX(c), y = rowToY(r);
    ctx.strokeRect(x + 0.5, y + 0.5, cellSize - 1, cellSize - 1);
  }

  // обводка по внешнему периметру — пробегаем соседей
  ctx.strokeStyle = strokePerim;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const k of state.baseCells) {
    const [c, r] = k.split(',').map(Number);
    const x = colToX(c), y = rowToY(r);
    if (!state.baseCells.has(c + ',' + (r - 1))) { ctx.moveTo(x, y); ctx.lineTo(x + cellSize, y); }
    if (!state.baseCells.has((c + 1) + ',' + r)) { ctx.moveTo(x + cellSize, y); ctx.lineTo(x + cellSize, y + cellSize); }
    if (!state.baseCells.has(c + ',' + (r + 1))) { ctx.moveTo(x, y + cellSize); ctx.lineTo(x + cellSize, y + cellSize); }
    if (!state.baseCells.has((c - 1) + ',' + r)) { ctx.moveTo(x, y); ctx.lineTo(x, y + cellSize); }
  }
  ctx.stroke();
}

// Заливает здание как единый силуэт без зазоров между клетками.
// alpha — для drag-призрака (0..1). Если есть PNG-спрайт — рисует его, иначе цветной фон.
function drawBuildingShape(type, col, row, alpha, level) {
  const def = BUILDINGS[type];
  const bbox = buildingBBox(type);
  const lvl = level || 1;
  const sprite = getBuildingSprite(type, lvl);
  const hasSprite = sprite && sprite.ready;

  ctx.save();
  if (alpha !== undefined && alpha < 1) ctx.globalAlpha = alpha;

  // внутренний отступ спрайта от границы клетки — чтобы PNG не выходил за сетку
  const SPRITE_INSET = 8;
  if (isRectShape(type)) {
    const x = colToX(col);
    const y = rowToY(row);
    const w = bbox.w * cellSize;
    const h = bbox.h * cellSize;
    if (hasSprite) {
      // PNG поверх формы, со скруглением через clip
      ctx.save();
      ctx.beginPath();
      roundRect(x + SPRITE_INSET, y + SPRITE_INSET, w - SPRITE_INSET*2, h - SPRITE_INSET*2, 6, false, false);
      ctx.clip();
      ctx.drawImage(sprite.img, x + SPRITE_INSET, y + SPRITE_INSET, w - SPRITE_INSET*2, h - SPRITE_INSET*2);
      ctx.restore();
    } else {
      ctx.fillStyle = def.color;
      roundRect(x + 4, y + 4, w - 8, h - 8, 6, true, false);
    }
    ctx.strokeStyle = def.edge;
    ctx.lineWidth = 2;
    roundRect(x + 4, y + 4, w - 8, h - 8, 6, false, true);
  } else {
    // не-rect: клетки бесшовно + обводка по внешнему периметру
    const cellsSet = new Set(def.cells.map(([c, r]) => c + ',' + r));
    if (hasSprite) {
      // клипуем по объединённой форме клеток (с заливкой стыков), затем drawImage на bbox (с inset)
      ctx.save();
      ctx.beginPath();
      for (const [dc, dr] of def.cells) {
        const x = colToX(col + dc);
        const y = rowToY(row + dr);
        ctx.rect(x + 2, y + 2, cellSize - 4, cellSize - 4);
        if (cellsSet.has((dc + 1) + ',' + dr)) ctx.rect(x + cellSize - 4, y + 2, 8, cellSize - 4);
        if (cellsSet.has(dc + ',' + (dr + 1))) ctx.rect(x + 2, y + cellSize - 4, cellSize - 4, 8);
      }
      ctx.clip();
      ctx.drawImage(
        sprite.img,
        colToX(col) + SPRITE_INSET, rowToY(row) + SPRITE_INSET,
        bbox.w * cellSize - SPRITE_INSET*2, bbox.h * cellSize - SPRITE_INSET*2
      );
      ctx.restore();
    } else {
      ctx.fillStyle = def.color;
      for (const [dc, dr] of def.cells) {
        const x = colToX(col + dc);
        const y = rowToY(row + dr);
        ctx.fillRect(x + 2, y + 2, cellSize - 4, cellSize - 4);
      }
      for (const [dc, dr] of def.cells) {
        const x = colToX(col + dc);
        const y = rowToY(row + dr);
        if (cellsSet.has((dc + 1) + ',' + dr)) ctx.fillRect(x + cellSize - 4, y + 2, 8, cellSize - 4);
        if (cellsSet.has(dc + ',' + (dr + 1))) ctx.fillRect(x + 2, y + cellSize - 4, cellSize - 4, 8);
      }
    }
    // обводка по внешнему периметру
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

// Иконка-emoji: показываем только если PNG-спрайт ещё не загружен.
function drawBuildingIcon(type, col, row, level) {
  const def = BUILDINGS[type];
  const sprite = getBuildingSprite(type, level || 1);
  if (sprite && sprite.ready) return;
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

function drawCrossbowRotated(b) {
  const def = BUILDINGS.crossbow;
  const sprite = getBuildingSprite('crossbow', b.level || 1);
  const x = colToX(b.col);
  const y = rowToY(b.row);
  const w = cellSize, h = cellSize;
  const cx = x + w / 2, cy = y + h / 2;
  // edge frame на клетке (рисуем неповёрнутым)
  if (sprite && sprite.ready) {
    const inset = 6;
    const sw = w - inset * 2;
    const sh = h - inset * 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(b.aimAngle || 0);
    ctx.drawImage(sprite.img, -sw / 2, -sh / 2, sw, sh);
    ctx.restore();
  } else {
    ctx.fillStyle = def.color;
    roundRect(x + 4, y + 4, w - 8, h - 8, 6, true, false);
  }
  ctx.strokeStyle = def.edge;
  ctx.lineWidth = 2;
  roundRect(x + 4, y + 4, w - 8, h - 8, 6, false, true);
}

function drawBuildings() {
  for (const b of state.buildings) {
    const def = BUILDINGS[b.type];
    if (b.type === 'crossbow') {
      drawCrossbowRotated(b);
    } else {
      drawBuildingShape(b.type, b.col, b.row, 1, b.level);
    }
    drawBuildingIcon(b.type, b.col, b.row, b.level);

    // прогресс-бар: на нижней клетке
    let prog = null;
    if (def.unitType) {
      const sc = SPAWN_SCALING[b.type][b.level - 1];
      prog = { pct: (b.lastSpawnT || 0) / sc.spawnEveryMs, color: '#fbbf24' };
    } else if (b.type === 'well') {
      const sc = HEAL_SCALING.well[b.level - 1];
      prog = { pct: (b.lastHealT || 0) / sc.healEveryMs, color: '#34d399' };
    } else if (b.type === 'crossbow') {
      const sc = TOWER_ATTACK.crossbow[b.level - 1];
      prog = { pct: (b.lastAtkT || 0) / sc.cdMs, color: '#fbbf24' };
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
  const now = performance.now();
  for (const u of list) {
    if (u.hp <= 0) continue;

    // walk wobble — каждый юнит со своим фазовым сдвигом (по id)
    const phase = now * 0.011 + (u.id % 17) * 0.37;
    const bobY = Math.sin(phase * 1.6) * 2.2;
    const lean = Math.sin(phase * 1.6 + 1.2) * 0.05;

    // тень — на земле, без bob
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(u.x, u.y + u.radius * 0.85, u.radius * 0.9, u.radius * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();

    // спрайт с wobble
    const sprite = unitImages[u.type];
    if (sprite && sprite.ready) {
      const img = sprite.img;
      const aspect = img.naturalWidth / img.naturalHeight;
      const h = u.radius * 4.4;
      const w = h * aspect;
      ctx.save();
      ctx.translate(u.x, u.y + bobY);
      ctx.rotate(lean);
      ctx.drawImage(img, -w / 2, -h * 0.78, w, h);
      ctx.restore();
    } else {
      ctx.fillStyle = u.color;
      ctx.beginPath();
      ctx.arc(u.x, u.y + bobY, u.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = u.edge;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // hp-бар — над спрайтом (не колеблется)
    const bw = u.radius * 2.6;
    const bh = 3;
    const bx = u.x - bw / 2;
    const by = u.y - u.radius * 2.6 - 6;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
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

function drawExpansionPreview(hover) {
  const shape = hover.shape || [[0, 0]];
  const sb = shapeBBoxFromCells(shape);

  // подсветка snap-клеток формы на поле
  if (hover.inField) {
    const hl = hover.valid ? 'rgba(132, 204, 22, 0.35)' : 'rgba(248, 113, 113, 0.32)';
    const edge = hover.valid ? '#84cc16' : '#f87171';
    ctx.fillStyle = hl;
    for (const [dc, dr] of shape) {
      const sx = colToX(hover.anchorCol + dc);
      const sy = rowToY(hover.anchorRow + dr);
      ctx.fillRect(sx, sy, cellSize, cellSize);
    }
    ctx.strokeStyle = edge;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    for (const [dc, dr] of shape) {
      const sx = colToX(hover.anchorCol + dc);
      const sy = rowToY(hover.anchorRow + dr);
      ctx.strokeRect(sx + 1, sy + 1, cellSize - 2, cellSize - 2);
    }
    ctx.setLineDash([]);
  }

  // призрак — вся форма центрирована под курсором
  const baseX = hover.cssX - (sb.w * cellSize) / 2;
  const baseY = hover.cssY - (sb.h * cellSize) / 2;
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = '#84cc16';
  for (const [dc, dr] of shape) {
    const gx = baseX + dc * cellSize;
    const gy = baseY + dr * cellSize;
    roundRect(gx + 4, gy + 4, cellSize - 8, cellSize - 8, 6, true, false);
  }
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = '#3f6212';
  ctx.lineWidth = 2;
  for (const [dc, dr] of shape) {
    const gx = baseX + dc * cellSize;
    const gy = baseY + dr * cellSize;
    roundRect(gx + 4, gy + 4, cellSize - 8, cellSize - 8, 6, false, true);
  }
  ctx.fillStyle = '#fffbe6';
  ctx.font = '900 ' + Math.floor(cellSize * 0.55) + 'px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('➕', baseX + (sb.w * cellSize) / 2, baseY + (sb.h * cellSize) / 2);
  ctx.restore();
}

function drawDragPreview(type, hover) {
  const def = BUILDINGS[type];
  const cells = def.cells;
  const bbox = buildingBBox(type);

  // 0) для атакующих башен — круг радиуса (видно при placement и merge)
  if (type === 'crossbow' && TOWER_ATTACK.crossbow) {
    const dragLvl = (state.drag && state.drag.level) || 1;
    const targetLvl = hover.mergeTarget
      ? Math.min(hover.mergeTarget.level + 1, TOWER_ATTACK.crossbow.length)
      : dragLvl;
    const range = TOWER_ATTACK.crossbow[targetLvl - 1].range;
    let cx, cy;
    if (hover.inField && (hover.valid || hover.mergeTarget)) {
      const anchorCol = hover.mergeTarget ? hover.mergeTarget.col : hover.anchorCol;
      const anchorRow = hover.mergeTarget ? hover.mergeTarget.row : hover.anchorRow;
      cx = colToX(anchorCol + bbox.w / 2);
      cy = rowToY(anchorRow + bbox.h / 2);
    } else {
      cx = hover.cssX;
      cy = hover.cssY;
    }
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, range, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(251, 191, 36, 0.08)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

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
  drawBuildingShape(type, ghostCol, ghostRow, 0.78, state.drag && state.drag.level);
  ctx.shadowColor = 'transparent';
  ctx.globalAlpha = 0.78;
  drawBuildingIcon(type, ghostCol, ghostRow, state.drag && state.drag.level);
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
  const locName = state.currentLocation ? LOCATIONS[state.currentLocation].name : 'Оборона базы';
  if (state.mode === 'battle') {
    titleEl.textContent = `Волна ${state.wave}/${state.totalWaves}`;
  } else if (state.mode === 'level-cleared') {
    titleEl.textContent = '🏆 Уровень пройден';
  } else {
    titleEl.textContent = locName;
  }

  if (state.mode === 'battle') {
    startBtn.hidden = true;
    resetBtn.hidden = true;
    surrenderBtn.hidden = false;
    shopEl.hidden = true;
  } else if (state.mode === 'defeat') {
    startBtn.hidden = true;
    resetBtn.hidden = true;       // модалка результата перекрывает
    surrenderBtn.hidden = true;
    shopEl.hidden = true;
  } else if (state.mode === 'level-cleared') {
    startBtn.hidden = true;
    resetBtn.hidden = true;       // модалка результата перекрывает
    surrenderBtn.hidden = true;
    shopEl.hidden = true;
  } else {
    startBtn.hidden = false;
    resetBtn.hidden = false;
    resetBtn.textContent = '↺ Сброс';
    startBtn.textContent = state.mode === 'wave-end' ? `⚔️ Волна ${state.wave}` : '⚔️ Начать бой';
    surrenderBtn.hidden = !(state.mode === 'wave-end');
    shopEl.hidden = false;
  }
  syncArmyCounter();
  syncHeroUi();
  syncHint();
  syncStash();
}

function syncArmyCounter() {
  if (!armyEl) return;
  const inBattle = state.mode === 'battle';
  armyEl.hidden = !inBattle;
  if (inBattle) {
    const armyCount = state.allies.reduce((n, a) => n + (a.isHero ? 0 : 1), 0);
    armyCountEl.textContent = String(armyCount);
    armyMaxEl.textContent = String(MAX_ALLIES);
    armyEl.classList.toggle('full', armyCount >= MAX_ALLIES);
  }
}

// ===== Меню =====
let activeBgSlot = null;
function setMenuBg(url) {
  const a = document.getElementById('bd-menu-bg-a');
  const b = document.getElementById('bd-menu-bg-b');
  if (!a || !b) return;
  if (!url) {
    a.classList.remove('active');
    b.classList.remove('active');
    activeBgSlot = null;
    return;
  }
  // выбираем «следующий» слот, ставим в него новую картинку, активируем — старый плавно гаснет
  const next = activeBgSlot === a ? b : a;
  const prev = activeBgSlot === a ? a : b;
  next.style.backgroundImage = `url('${url}')`;
  next.classList.add('active');
  if (prev) prev.classList.remove('active');
  activeBgSlot = next;
}

function syncMenuBgToActiveLocation() {
  if (state.activeTab !== 'map') { setMenuBg(null); return; }
  const id = LOCATION_ORDER[state.menuLocationIdx];
  const loc = LOCATIONS[id];
  setMenuBg(loc && loc.bg ? loc.bg : null);
}

function showMenu() {
  state.screen = 'menu';
  menuPanelEl.hidden = false;
  playPanelEl.hidden = true;
  syncMenuBody();
  syncMenuBgToActiveLocation();
}

function startLocation(locId) {
  if (!state.locations[locId] || !state.locations[locId].unlocked) return;
  state.screen = 'play';
  state.currentLocation = locId;
  state.totalWaves = LOCATIONS[locId].waves;
  // полный сброс прогресса забега
  state.coins = 100;
  state.wave = 1;
  state.baseHp = state.baseHpMax;
  state.buildings.length = 0;
  state.allies.length = 0;
  state.enemies.length = 0;
  state.fx.length = 0;
  state.enemiesToSpawn = 0;
  state.shop.rerollCost = 3;
  state.stash.length = 0;
  state._dragOriginal = null;
  initStartingBase();
  resetHeroForLocation();
  state.mode = 'build';
  generateShop();
  menuPanelEl.hidden = true;
  playPanelEl.hidden = false;
  // canvas был скрыт — пересчитываем размеры на следующем кадре
  setTimeout(() => { resize(); syncUi(); syncShop(); }, 0);
  haptic('impact');
}

function exitToMenu() {
  state.mode = 'build';
  state.allies.length = 0;
  state.enemies.length = 0;
  state.fx.length = 0;
  resetHeroForLocation();
  showMenu();
  haptic('impact');
}

function renderMapCarousel() {
  const idx = state.menuLocationIdx;
  const slides = LOCATION_ORDER.map((id) => {
    const loc = LOCATIONS[id];
    const prog = state.locations[id];
    const cardCls = ['bd-map-card'];
    if (!prog.unlocked) cardCls.push('locked');
    if (prog.beaten) cardCls.push('beaten');
    const beatenBadge = prog.beaten ? `<div class="bd-map-badge">⭐</div>` : '';
    return `
      <div class="bd-map-slide">
        <div class="${cardCls.join(' ')}">
          ${beatenBadge}
          <div class="bd-map-art">${loc.icon}</div>
          <div class="bd-map-name">${loc.name}</div>
          <div class="bd-map-desc">${loc.desc}</div>
          <div class="bd-map-stats">${loc.waves} волн · 🏆 +5 💎</div>
        </div>
      </div>`;
  }).join('');

  const dots = LOCATION_ORDER.map((_, i) =>
    `<div class="bd-map-dot${i === idx ? ' active' : ''}"></div>`
  ).join('');

  menuBodyEl.innerHTML = `
    <div class="bd-map">
      <button class="bd-map-arrow${idx <= 0 ? ' disabled' : ''}" id="bd-map-prev" type="button">‹</button>
      <div class="bd-map-viewport" id="bd-map-viewport">
        <div class="bd-map-track" id="bd-map-track" style="transform: translateX(-${idx * 100}%);">
          ${slides}
        </div>
      </div>
      <button class="bd-map-arrow${idx >= LOCATION_ORDER.length - 1 ? ' disabled' : ''}" id="bd-map-next" type="button">›</button>
    </div>
    <div class="bd-map-cta-wrap">
      <button class="bd-map-cta" id="bd-map-cta" type="button"></button>
      <div class="bd-map-dots" id="bd-map-dots">${dots}</div>
    </div>
  `;

  document.getElementById('bd-map-prev').addEventListener('click', () => mapStep(-1));
  document.getElementById('bd-map-next').addEventListener('click', () => mapStep(+1));
  attachMapSwipe();
  updateMapCta();
}

function attachMapSwipe() {
  const viewport = document.getElementById('bd-map-viewport');
  const track = document.getElementById('bd-map-track');
  if (!viewport || !track) return;
  let startX = null;
  let basePct = 0;
  let dragging = false;

  viewport.addEventListener('pointerdown', (e) => {
    startX = e.clientX;
    basePct = -state.menuLocationIdx * 100;
    dragging = false;
    track.style.transition = 'none';
    try { viewport.setPointerCapture(e.pointerId); } catch (_) {}
  });
  viewport.addEventListener('pointermove', (e) => {
    if (startX === null) return;
    const dx = e.clientX - startX;
    if (!dragging && Math.abs(dx) > 5) dragging = true;
    if (!dragging) return;
    const w = viewport.clientWidth || 1;
    let pct = basePct + (dx / w) * 100;
    // края: в первой/последней — резистанс при перетягивании
    const minPct = -(LOCATION_ORDER.length - 1) * 100;
    if (pct > 0) pct = pct * 0.35;
    if (pct < minPct) pct = minPct + (pct - minPct) * 0.35;
    track.style.transform = `translateX(${pct}%)`;
  });
  const finish = (e) => {
    if (startX === null) return;
    const dx = e.clientX - startX;
    const wasDragging = dragging;
    startX = null;
    dragging = false;
    track.style.transition = 'transform 280ms cubic-bezier(0.4, 0, 0.2, 1)';
    if (wasDragging && Math.abs(dx) > 50) {
      const dir = dx < 0 ? +1 : -1;
      const next = state.menuLocationIdx + dir;
      if (next >= 0 && next < LOCATION_ORDER.length) {
        state.menuLocationIdx = next;
        track.style.transform = `translateX(-${next * 100}%)`;
        updateMapCta();
        syncMenuBgToActiveLocation();
        haptic('impact');
        return;
      }
    }
    // вернуть на месте
    track.style.transform = `translateX(-${state.menuLocationIdx * 100}%)`;
  };
  viewport.addEventListener('pointerup', finish);
  viewport.addEventListener('pointercancel', finish);
}

function mapStep(delta) {
  const next = state.menuLocationIdx + delta;
  if (next < 0 || next >= LOCATION_ORDER.length) return;
  state.menuLocationIdx = next;
  const track = document.getElementById('bd-map-track');
  if (track) {
    track.style.transition = 'transform 280ms cubic-bezier(0.4, 0, 0.2, 1)';
    track.style.transform = `translateX(-${next * 100}%)`;
  }
  updateMapCta();
  syncMenuBgToActiveLocation();
  haptic('impact');
}

function updateMapCta() {
  const idx = state.menuLocationIdx;
  const id = LOCATION_ORDER[idx];
  const prog = state.locations[id];
  const cta = document.getElementById('bd-map-cta');
  if (cta) {
    cta.textContent = prog.unlocked ? '⚔️ В бой!' : '🔒 Закрыто';
    cta.classList.toggle('locked', !prog.unlocked);
    cta.onclick = prog.unlocked ? () => startLocation(id) : null;
  }
  const dots = document.querySelectorAll('.bd-map-dot');
  dots.forEach((d, i) => d.classList.toggle('active', i === idx));
  const prev = document.getElementById('bd-map-prev');
  const next = document.getElementById('bd-map-next');
  if (prev) prev.classList.toggle('disabled', idx <= 0);
  if (next) next.classList.toggle('disabled', idx >= LOCATION_ORDER.length - 1);
}

function syncMenuBody() {
  menuGoldEl.textContent = state.gold | 0;
  menuGemsEl.textContent = state.gems | 0;
  tabBtns.forEach(t => t.classList.toggle('active', t.dataset.tab === state.activeTab));

  if (state.activeTab === 'map') {
    renderMapCarousel();
  } else if (state.activeTab === 'upgrade') {
    renderUpgradeTab();
  } else if (state.activeTab === 'chests') {
    renderChestsTab();
  }
}

function renderUpgradeTab() {
  const cards = BUILDING_KEYS.map(k => {
    const lvl = state.metaLevels[k] | 0 || 1;
    const cardsHave = state.cards[k] | 0;
    const isMax = lvl >= MAX_META_LEVEL;
    const cardsPct = Math.min(100, Math.round(cardsHave / UPGRADE_CARDS_NEEDED * 100));
    const ready = !isMax && cardsHave >= UPGRADE_CARDS_NEEDED && (state.gold | 0) >= upgradeGoldCost(lvl);
    return `
      <button class="bd-up-card${ready ? ' ready' : ''}${isMax ? ' maxed' : ''}" data-up="${k}" type="button">
        <div class="bd-up-card-icon">${iconImg(k)}</div>
        <div class="bd-up-card-name">${BUILDING_LABELS[k]}</div>
        <div class="bd-up-card-level">${isMax ? '✦ MAX' : `Ур. ${lvl}`}</div>
        <div class="bd-up-card-bar"><div class="bd-up-card-bar-fill" style="width:${cardsPct}%"></div></div>
        <div class="bd-up-card-cards">🎴 ${cardsHave} / ${UPGRADE_CARDS_NEEDED}</div>
      </button>`;
  }).join('');
  menuBodyEl.innerHTML = `
    <div class="bd-upgrade-info">Тапни карточку, чтобы открыть характеристики и прокачать здание.</div>
    <div class="bd-up-grid">${cards}</div>`;
  menuBodyEl.querySelectorAll('.bd-up-card[data-up]').forEach(btn => {
    btn.addEventListener('click', () => openUpgradeModal(btn.dataset.up));
  });
}

// Возвращает список <div class="bd-stat-row"> для здания k при metaLevel=lvl.
function buildingStatsHtml(k, lvl) {
  const bonus = 1 + (lvl - 1) * META_BONUS_PER_LEVEL;
  const rows = [];
  if (k === 'barracks' || k === 'archers' || k === 'mages') {
    const unitKey = k === 'barracks' ? 'warrior' : k === 'archers' ? 'archer' : 'mage';
    const u = UNITS[unitKey];
    const sc1 = SPAWN_SCALING[k][0];
    rows.push(['❤️ HP юнита',  Math.round(u.hpMax * bonus)]);
    rows.push(['⚔️ Урон',      Math.round(u.dmg * bonus * 10) / 10]);
    if (u.atkRange > 25) rows.push(['📏 Дальность', u.atkRange]);
    if (u.aoeRadius)     rows.push(['💥 AoE радиус', u.aoeRadius]);
    rows.push(['👥 Спавн (баз.)', `${sc1.spawnCount} / ${(sc1.spawnEveryMs/1000).toFixed(1)}с`]);
  } else if (k === 'well') {
    const sc1 = HEAL_SCALING.well[0];
    rows.push(['💚 Лечение/тик', Math.round(sc1.healAmount * bonus)]);
    rows.push(['⏱ Интервал',     `${(sc1.healEveryMs/1000).toFixed(1)}с`]);
    rows.push(['🌍 Зона',        'Все союзники']);
  } else if (k === 'crossbow') {
    const t1 = TOWER_ATTACK.crossbow[0];
    rows.push(['🎯 Урон стрелы',   Math.round(t1.dmg * bonus)]);
    rows.push(['📏 Дальность',     t1.range]);
    rows.push(['⏱ Перезарядка',    `${(t1.cdMs/1000).toFixed(1)}с`]);
  } else if (k === 'treasury') {
    rows.push(['💰 Доход (баз.)',  `+${Math.round(TREASURY_INCOME.treasury[0] * bonus)} / волну`]);
    rows.push(['📈 В бою',         'Растёт по ур.1→2→3']);
  } else if (k === 'forge') {
    const base3 = FORGE_BUFF[3];
    const dmgPct = Math.round((base3.dmg - 1) * bonus * 100);
    const hpPct  = Math.round((base3.hp - 1) * bonus * 100);
    const atkPct = Math.round((base3.atkSpeed - 1) * bonus * 100);
    rows.push(['⚒️ К урону (ур.3)',     `+${dmgPct}%`]);
    rows.push(['🛡️ К HP (ур.3)',         `+${hpPct}%`]);
    rows.push(['⚡ К скорости атак',     `+${atkPct}%`]);
  }
  return rows.map(([l, v]) => `<div class="bd-stat-row"><span>${l}</span><b>${v}</b></div>`).join('');
}

function openUpgradeModal(k) {
  const lvl = state.metaLevels[k] | 0 || 1;
  const cardsHave = state.cards[k] | 0;
  const isMax = lvl >= MAX_META_LEVEL;
  const cardsPct = Math.min(100, Math.round(cardsHave / UPGRADE_CARDS_NEEDED * 100));
  const goldNeed = isMax ? 0 : upgradeGoldCost(lvl);
  const goldHas = state.gold | 0;
  const enoughCards = cardsHave >= UPGRADE_CARDS_NEEDED;
  const enoughGold = goldHas >= goldNeed;
  const canDo = !isMax && enoughCards && enoughGold;

  const curStats = buildingStatsHtml(k, lvl);
  const nextStats = isMax ? '' : `
    <div class="bd-up-modal-section next">
      <div class="bd-up-modal-section-title">📈 След. уровень (${lvl + 1})</div>
      ${buildingStatsHtml(k, lvl + 1)}
    </div>`;

  const btnLabel = isMax
    ? '✦ Достигнут максимум'
    : !enoughCards
      ? `Нужно ещё ${UPGRADE_CARDS_NEEDED - cardsHave} 🎴`
      : !enoughGold
        ? `Не хватает 💰: ${goldNeed - goldHas}`
        : `Прокачать · ${goldNeed} 💰`;

  const modal = document.createElement('div');
  modal.className = 'bd-modal bd-up-modal';
  modal.innerHTML = `
    <div class="bd-modal-backdrop"></div>
    <div class="bd-modal-body bd-up-modal-body">
      <button class="bd-modal-x" type="button" aria-label="Закрыть">×</button>
      <div class="bd-up-modal-icon">${iconImg(k)}</div>
      <div class="bd-up-modal-title">${BUILDING_LABELS[k]}</div>
      <div class="bd-up-modal-level">${isMax ? '✦ MAX' : `Ур. ${lvl}`}</div>

      <div class="bd-up-modal-section">
        <div class="bd-up-modal-section-title">⚙️ Текущий уровень</div>
        ${curStats}
      </div>

      ${nextStats}

      <div class="bd-up-modal-cost">
        <div class="bd-up-modal-bar">
          <div class="bd-up-modal-bar-fill" style="width:${cardsPct}%"></div>
          <div class="bd-up-modal-bar-txt">🎴 ${cardsHave} / ${UPGRADE_CARDS_NEEDED}</div>
        </div>
        <div class="bd-up-modal-cost-row">
          <span>💰 У тебя: ${goldHas}</span>
          ${isMax ? '' : `<span>Цена: ${goldNeed} 💰</span>`}
        </div>
      </div>

      <button class="bd-cta bd-up-modal-action${canDo ? '' : ' locked'}" type="button"${isMax ? ' disabled' : ''}>${btnLabel}</button>
    </div>`;

  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.querySelector('.bd-modal-backdrop').addEventListener('click', close);
  modal.querySelector('.bd-modal-x').addEventListener('click', close);
  if (!isMax) {
    modal.querySelector('.bd-up-modal-action').addEventListener('click', () => {
      if (upgradeBuilding(k)) close();
    });
  }
}

function upgradeBuilding(k) {
  const lvl = state.metaLevels[k] | 0 || 1;
  if (lvl >= MAX_META_LEVEL) {
    haptic('fail');
    flashMenuHint('Достигнут максимальный уровень');
    return false;
  }
  const cards = state.cards[k] | 0;
  const goldNeed = upgradeGoldCost(lvl);
  if (cards < UPGRADE_CARDS_NEEDED) {
    haptic('fail');
    flashMenuHint(`Нужно ещё ${UPGRADE_CARDS_NEEDED - cards} 🎴 карточек`);
    return false;
  }
  if ((state.gold | 0) < goldNeed) {
    haptic('fail');
    flashMenuHint(`Не хватает 💰: нужно ${goldNeed}`);
    return false;
  }
  state.cards[k] = cards - UPGRADE_CARDS_NEEDED;
  state.gold = (state.gold | 0) - goldNeed;
  state.metaLevels[k] = lvl + 1;
  saveGame();
  haptic('success');
  flashMenuHint(`${BUILDING_LABELS[k]} → ур. ${lvl + 1}`, 'success');
  syncMenuBody();
  return true;
}

function renderChestsTab() {
  const items = SHOP_CHESTS.map(def => {
    const canAfford = state.gems >= def.cost;
    const art = def.img
      ? `<div class="bd-chest-art"><img src="${def.img}" alt="${def.name}" draggable="false"></div>`
      : `<div class="bd-chest-art">${def.icon || '🎁'}</div>`;
    const tag = def.kind === 'single' ? `<div class="bd-chest-tag mystic">★ один тип</div>` : '';
    return `
      <div class="bd-chest-card chest-${def.id}">
        ${tag}
        ${art}
        <div class="bd-chest-name">${def.name}</div>
        <div class="bd-chest-yield">🎴 ×${def.cards}</div>
        <div class="bd-chest-desc">${def.desc}</div>
        <button class="bd-cta bd-chest-open ${canAfford ? '' : 'locked'}" data-chest="${def.id}" type="button">
          ${def.cost} 💎
        </button>
      </div>`;
  }).join('');
  menuBodyEl.innerHTML = `
    <div class="bd-chests-info">Карточки нужны во вкладке <b>⚡ Прокачка</b>: 5 шт. + 💰 за уровень. В сундуках выпадают карточки на 7 типов зданий.</div>
    <div class="bd-chests-list">${items}</div>`;
  menuBodyEl.querySelectorAll('.bd-chest-open').forEach(btn => {
    btn.addEventListener('click', () => buyChest(btn.dataset.chest));
  });
}

function buyChest(id) {
  const def = SHOP_CHESTS.find(c => c.id === id);
  if (!def) return;
  if (state.gems < def.cost) {
    haptic('fail');
    flashMenuHint(`Не хватает 💎: нужно ${def.cost}`);
    return;
  }
  state.gems -= def.cost;
  let drawn;
  if (def.kind === 'single') {
    const k = BUILDING_KEYS[Math.floor(Math.random() * BUILDING_KEYS.length)];
    drawn = Array(def.cards).fill(k);
  } else {
    drawn = [];
    for (let i = 0; i < def.cards; i++) {
      drawn.push(BUILDING_KEYS[Math.floor(Math.random() * BUILDING_KEYS.length)]);
    }
  }
  for (const k of drawn) {
    state.cards[k] = (state.cards[k] | 0) + 1;
  }
  saveGame();
  haptic('success');
  showChestResult(drawn, def);
  syncMenuBody();
}

function flashMenuHint(msg, type = 'error') {
  const t = document.createElement('div');
  t.className = 'bd-toast' + (type === 'success' ? ' success' : '');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1800);
}

function showBattleResultModal(kind) {
  // kind: 'defeat' | 'cleared'
  const r = state.lastReward || { coins: 0, gems: 0, gold: 0 };
  const isWin = kind === 'cleared';
  const wavesSurvived = isWin ? state.totalWaves : Math.max(0, state.wave - 1);
  const locName = state.currentLocation ? LOCATIONS[state.currentLocation].name : '';

  const title = isWin ? '🏆 Локация пройдена' : '💀 Поражение';
  const subtitle = isWin
    ? `${locName} — все ${state.totalWaves} волн`
    : `Волн пройдено: ${wavesSurvived} / ${state.totalWaves}`;

  const rewardItems = [];
  if (r.gold > 0) rewardItems.push(`<div class="bd-result-reward gold"><span>💰</span><b>+${r.gold}</b></div>`);
  if (r.gems > 0) rewardItems.push(`<div class="bd-result-reward gem"><span>💎</span><b>+${r.gems}</b></div>`);
  const rewardsHtml = rewardItems.length > 0
    ? `<div class="bd-result-rewards">${rewardItems.join('')}</div>`
    : `<div class="bd-result-empty">Без награды</div>`;

  const actions = isWin
    ? `<button class="bd-cta bd-result-menu" type="button">← В меню</button>`
    : `<button class="bd-cta bd-cta-secondary bd-result-retry" type="button">↺ Заново</button>
       <button class="bd-cta bd-result-menu" type="button">← В меню</button>`;

  const modal = document.createElement('div');
  modal.className = 'bd-modal bd-result-modal ' + (isWin ? 'win' : 'lose');
  modal.innerHTML = `
    <div class="bd-modal-backdrop"></div>
    <div class="bd-modal-body">
      <div class="bd-modal-title">${title}</div>
      <div class="bd-result-subtitle">${subtitle}</div>
      ${rewardsHtml}
      <div class="bd-result-actions">${actions}</div>
    </div>`;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  const retry = modal.querySelector('.bd-result-retry');
  const menu = modal.querySelector('.bd-result-menu');
  if (retry) retry.addEventListener('click', () => { close(); resetAll(); });
  if (menu)  menu.addEventListener('click', () => { close(); exitToMenu(); });
}

function showChestResult(drawn, def) {
  // Анимация: 0–650 шейк сундука → 650 burst (вспышка+разлёт) → 1000 reveal cards (с staggered pop)
  const REVEAL_AT = 1000;
  const CARD_STAGGER = 130;
  const cardHtml = drawn.map((k, i) => `
    <div class="bd-modal-card bd-chest-pop" style="animation-delay:${REVEAL_AT + i * CARD_STAGGER}ms">
      <div class="bd-modal-card-icon">${iconImg(k)}</div>
      <div class="bd-modal-card-name">${BUILDING_LABELS[k]}</div>
    </div>`).join('');
  const chestArt = def && def.img
    ? `<img src="${def.img}" alt="${def.name}" draggable="false">`
    : `<span class="bd-chest-emoji">${(def && def.icon) || '🎁'}</span>`;
  const stageClass = def ? `chest-${def.id}` : '';
  const modal = document.createElement('div');
  modal.className = 'bd-modal bd-chest-modal';
  modal.innerHTML = `
    <div class="bd-modal-backdrop"></div>
    <div class="bd-modal-body bd-chest-modal-body">
      <div class="bd-chest-stage ${stageClass}">
        <div class="bd-chest-flash"></div>
        <div class="bd-chest-art-anim">${chestArt}</div>
      </div>
      <div class="bd-modal-title bd-chest-reveal">Сундук открыт!</div>
      <div class="bd-modal-cards bd-chest-cards-reveal">${cardHtml}</div>
      <div class="bd-modal-hint bd-chest-reveal">🎴 Прокачай здания во вкладке «⚡ Прокачка»</div>
      <button class="bd-cta bd-modal-close bd-chest-reveal" type="button">Забрать</button>
    </div>`;
  document.body.appendChild(modal);

  const stageEl = modal.querySelector('.bd-chest-stage');
  const bodyEl  = modal.querySelector('.bd-chest-modal-body');
  const burstTimer = setTimeout(() => {
    stageEl.classList.add('burst');
    haptic('impact');
  }, 650);
  const revealTimer = setTimeout(() => {
    bodyEl.classList.add('revealed');
    haptic('success');
  }, REVEAL_AT);

  const close = () => {
    clearTimeout(burstTimer);
    clearTimeout(revealTimer);
    modal.remove();
  };
  modal.querySelector('.bd-modal-close').addEventListener('click', close);
  modal.querySelector('.bd-modal-backdrop').addEventListener('click', close);
}

// ===== Persistence =====
const SAVE_KEY = 'bd-save-v1';
function saveGame() {
  try {
    const data = {
      gems: state.gems | 0,
      gold: state.gold | 0,
      locations: state.locations,
      menuLocationIdx: state.menuLocationIdx | 0,
      cards: state.cards,
      metaLevels: state.metaLevels,
      heroMetaLevel: state.hero.metaLevel | 0,
      starterGiven: true,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (_) {}
}
function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) {
      // Первый запуск — даём стартовые 💎 на первую покупку сундука
      state.gems = STARTER_GEMS;
      saveGame();
      return;
    }
    const data = JSON.parse(raw);
    if (typeof data.gems === 'number') state.gems = data.gems;
    if (typeof data.gold === 'number') state.gold = data.gold;
    if (typeof data.heroMetaLevel === 'number') state.hero.metaLevel = Math.max(1, data.heroMetaLevel);
    if (data.locations) {
      for (const id of LOCATION_ORDER) {
        if (data.locations[id]) {
          state.locations[id].unlocked = !!data.locations[id].unlocked;
          state.locations[id].beaten = !!data.locations[id].beaten;
        }
      }
      // forest всегда открыт — защита от повреждённого save
      if (state.locations.forest) state.locations.forest.unlocked = true;
    }
    if (Number.isInteger(data.menuLocationIdx)) {
      state.menuLocationIdx = Math.max(0, Math.min(LOCATION_ORDER.length - 1, data.menuLocationIdx));
    }
    if (data.cards) {
      for (const k of BUILDING_KEYS) if (typeof data.cards[k] === 'number') state.cards[k] = data.cards[k] | 0;
    }
    if (data.metaLevels) {
      for (const k of BUILDING_KEYS) if (typeof data.metaLevels[k] === 'number') state.metaLevels[k] = Math.max(1, data.metaLevels[k] | 0);
    }
    // Для старых save'ов без флага — одноразовая выдача стартовых алмазов
    if (!data.starterGiven) {
      state.gems = Math.max(state.gems, STARTER_GEMS);
      saveGame();
    }
  } catch (_) {}
}

// ===== Init =====
menuBackBtn.addEventListener('click', goLauncher);
backBtn.addEventListener('click', exitToMenu);
startBtn.addEventListener('click', () => startBattle());
resetBtn.addEventListener('click', () => {
  if (state.mode === 'level-cleared') exitToMenu();
  else resetAll();
});
surrenderBtn.addEventListener('click', () => surrender());
heroBtn.addEventListener('click', () => summonHero());
rerollBtn.addEventListener('click', () => reroll());
canvas.addEventListener('pointerdown', onCanvasPointerDown);
canvas.addEventListener('pointermove', onCanvasPointerMoveTrack);
canvas.addEventListener('pointerup', onCanvasPointerEnd);
canvas.addEventListener('pointercancel', onCanvasPointerEnd);
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  const factor = Math.exp(-e.deltaY * 0.0015);
  applyZoom(state.zoom * factor, sx, sy, sx, sy);
}, { passive: false });
canvas.addEventListener('dblclick', () => resetView());
tabBtns.forEach(t => t.addEventListener('click', () => {
  state.activeTab = t.dataset.tab;
  syncMenuBody();
  syncMenuBgToActiveLocation();
  haptic('impact');
}));

window.addEventListener('resize', () => { resize(); });
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
if (tg && tg.onEvent) {
  try { tg.onEvent('viewportChanged', resize); } catch (_) {}
}

loadGame();
initTelegram();
genTrees();
generateShop();
showMenu();
requestAnimationFrame((t) => { lastT = t; tick(t); });
