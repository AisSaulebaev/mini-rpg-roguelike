'use strict';

const EMOJI = {
  player: '🧙',
  stairs: '🪜',
  chest: '🎁',
  potion: '🧪',
  coin: '🪙',
  merchant: '🛒',
};

const FLOOR_CONFIG = (depth) => {
  if (depth <= 3)  return { size: 4, monstersMin: 1, monstersMax: 2, itemsMin: 1, itemsMax: 2 };
  if (depth <= 7)  return { size: 5, monstersMin: 2, monstersMax: 3, itemsMin: 2, itemsMax: 3 };
  if (depth <= 12) return { size: 6, monstersMin: 3, monstersMax: 4, itemsMin: 2, itemsMax: 4 };
  return               { size: 7, monstersMin: 4, monstersMax: 5, itemsMin: 3, itemsMax: 5 };
};

const MAX_POTIONS = 3;
const POTION_HEAL = 10;

const POTION_TYPES = {
  heal: { name: 'Зелье лечения',  icon: '🧪', price: 15, short: '+10 HP' },
  rage: { name: 'Зелье ярости',   icon: '🔥', price: 25, short: '+3 ATK на 4 хода', duration: 4, atk: 3 },
  iron: { name: 'Железная кожа',  icon: '🛡️', price: 25, short: '+3 DEF на 4 хода', duration: 4, def: 3 },
};

const SHOP_ITEM_PRICE = { common: 30, rare: 70, epic: 150 };

const STORAGE_KEY = 'rpg-meta-v1';

const tg = window.Telegram && window.Telegram.WebApp;
const IS_TG = !!(tg && tg.initData !== undefined);

function haptic(kind) {
  if (!IS_TG || !tg.HapticFeedback) return;
  try {
    if (kind === 'impact-light')   tg.HapticFeedback.impactOccurred('light');
    else if (kind === 'impact')    tg.HapticFeedback.impactOccurred('medium');
    else if (kind === 'impact-heavy') tg.HapticFeedback.impactOccurred('heavy');
    else if (kind === 'success')   tg.HapticFeedback.notificationOccurred('success');
    else if (kind === 'error')     tg.HapticFeedback.notificationOccurred('error');
    else if (kind === 'warning')   tg.HapticFeedback.notificationOccurred('warning');
  } catch (e) {}
}

const SHOP_ITEMS = [
  { id: 'maxHp',   name: 'Стойкость', icon: '❤️', desc: '+2 HP',               max: 5, costs: [10, 20, 35, 55, 80] },
  { id: 'atk',     name: 'Сила',      icon: '⚔️', desc: '+1 ATK',              max: 5, costs: [15, 30, 50, 75, 110] },
  { id: 'def',     name: 'Броня',     icon: '🛡️', desc: '+1 DEF',              max: 5, costs: [15, 30, 50, 75, 110] },
  { id: 'potions', name: 'Алхимия',   icon: '🧪', desc: '+1 зелье в начале',   max: 3, costs: [25, 50, 80] },
  { id: 'gold',    name: 'Удача',     icon: '🪙', desc: '+10 золота в начале', max: 5, costs: [8, 16, 28, 44, 64] },
];

const SLOT_LABEL = {
  weapon: 'Оружие', helmet: 'Шлем', chest: 'Нагрудник',
  boots: 'Сапоги', ring: 'Кольцо', amulet: 'Ожерелье',
};

const ITEM_POOL = [
  { slot: 'weapon', rarity: 'common', name: 'Кинжал',       bonus: { atk: 2 } },
  { slot: 'weapon', rarity: 'common', name: 'Меч',          bonus: { atk: 3 } },
  { slot: 'weapon', rarity: 'rare',   name: 'Топор',        bonus: { atk: 5 } },
  { slot: 'weapon', rarity: 'rare',   name: 'Копьё',        bonus: { atk: 4, def: 1 } },
  { slot: 'weapon', rarity: 'epic',   name: 'Двуручник',    bonus: { atk: 7 } },
  { slot: 'weapon', rarity: 'epic',   name: 'Лук теней',    bonus: { atk: 5, hp: 5 } },

  { slot: 'helmet', rarity: 'common', name: 'Капюшон',       bonus: { def: 1 } },
  { slot: 'helmet', rarity: 'common', name: 'Шлем',          bonus: { def: 1, hp: 2 } },
  { slot: 'helmet', rarity: 'rare',   name: 'Стальной шлем', bonus: { def: 2, hp: 3 } },
  { slot: 'helmet', rarity: 'epic',   name: 'Корона короля', bonus: { def: 3, atk: 2 } },

  { slot: 'chest', rarity: 'common', name: 'Кожанка',        bonus: { def: 1 } },
  { slot: 'chest', rarity: 'common', name: 'Кольчуга',       bonus: { def: 2 } },
  { slot: 'chest', rarity: 'rare',   name: 'Латы',           bonus: { def: 3, atk: -1 } },
  { slot: 'chest', rarity: 'rare',   name: 'Плащ мага',      bonus: { def: 2, hp: 5 } },
  { slot: 'chest', rarity: 'epic',   name: 'Драконья чешуя', bonus: { def: 5 } },

  { slot: 'boots', rarity: 'common', name: 'Кожаные сапоги',  bonus: { def: 1 } },
  { slot: 'boots', rarity: 'common', name: 'Крепкие сапоги',  bonus: { hp: 3 } },
  { slot: 'boots', rarity: 'rare',   name: 'Железные сапоги', bonus: { def: 2, hp: 2 } },
  { slot: 'boots', rarity: 'epic',   name: 'Крылатые сапоги', bonus: { def: 3, hp: 5 } },

  { slot: 'ring', rarity: 'common', name: 'Кольцо силы',     bonus: { atk: 1 } },
  { slot: 'ring', rarity: 'common', name: 'Кольцо жизни',    bonus: { hp: 3 } },
  { slot: 'ring', rarity: 'rare',   name: 'Кольцо защиты',   bonus: { def: 2 } },
  { slot: 'ring', rarity: 'rare',   name: 'Кольцо меткости', bonus: { atk: 2 } },
  { slot: 'ring', rarity: 'epic',   name: 'Кольцо воина',    bonus: { atk: 2, def: 2 } },

  { slot: 'amulet', rarity: 'common', name: 'Амулет жизни',   bonus: { hp: 5 } },
  { slot: 'amulet', rarity: 'common', name: 'Амулет стали',   bonus: { atk: 1 } },
  { slot: 'amulet', rarity: 'rare',   name: 'Талисман вора',  bonus: {}, passive: 'goldBonus' },
  { slot: 'amulet', rarity: 'rare',   name: 'Рог мудрости',   bonus: {}, passive: 'xpBonus' },
  { slot: 'amulet', rarity: 'epic',   name: 'Сердце феникса', bonus: {}, passive: 'phoenix' },
];

function pickRarity(depth) {
  const r = Math.random();
  if (depth <= 5)  return r < 0.70 ? 'common' : (r < 0.95 ? 'rare' : 'epic');
  if (depth <= 10) return r < 0.50 ? 'common' : (r < 0.90 ? 'rare' : 'epic');
  return            r < 0.30 ? 'common' : (r < 0.80 ? 'rare' : 'epic');
}

function rollItem(depth) {
  const rarity = pickRarity(depth);
  const pool = ITEM_POOL.filter(x => x.rarity === rarity);
  const tpl = pool[randInt(pool.length)];
  return JSON.parse(JSON.stringify(tpl));
}

const MONSTER_TEMPLATES = {
  goblin: { emoji: '👹', name: 'Гоблин',  acc: 'гоблина',  hp: 8,  atk: 3, def: 0, xp: 3,  goldMin: 2,  goldMax: 5,  minDepth: 1 },
  zombie: { emoji: '🧟', name: 'Зомби',   acc: 'зомби',    hp: 15, atk: 4, def: 1, xp: 6,  goldMin: 4,  goldMax: 8,  minDepth: 3 },
  ghost:  { emoji: '👻', name: 'Призрак', acc: 'призрака', hp: 10, atk: 6, def: 2, xp: 10, goldMin: 6,  goldMax: 12, minDepth: 5 },
  dragon: { emoji: '🐉', name: 'Дракон',  acc: 'дракона',  hp: 40, atk: 8, def: 3, xp: 30, goldMin: 30, goldMax: 50, boss: true },
};

const state = {
  screen: 'game',
  depth: 1,
  gridSize: 4,
  grid: [],
  player: {
    x: 0, y: 0,
    hp: 20, maxHp: 20,
    atk: 5, def: 1,
    level: 1, xp: 0, xpToNext: 10,
    gold: 0,
    potions: { heal: 0, rage: 0, iron: 0 },
    effects: { rage: 0, iron: 0 },
    equipment: { weapon: null, helmet: null, chest: null, boots: null, ring: null, amulet: null },
  },
  merchantStock: [],
  monsters: [],
  combat: null,
  runStats: { monstersKilled: 0, chestsOpened: 0, bossesKilled: 0, goldCollected: 0 },
  meta: {
    souls: 0,
    upgrades: { maxHp: 0, atk: 0, def: 0, potions: 0, gold: 0 },
  },
  log: [],
};

function applyMetaData(raw) {
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    if (typeof data.souls === 'number') state.meta.souls = data.souls;
    if (data.upgrades) {
      for (const key of Object.keys(state.meta.upgrades)) {
        if (typeof data.upgrades[key] === 'number') {
          state.meta.upgrades[key] = data.upgrades[key];
        }
      }
    }
  } catch (e) {}
}

function loadMeta(done) {
  const loadLocal = () => {
    try { applyMetaData(localStorage.getItem(STORAGE_KEY)); } catch (e) {}
    done && done();
  };
  if (IS_TG && tg.CloudStorage && tg.CloudStorage.getItem) {
    try {
      tg.CloudStorage.getItem(STORAGE_KEY, (err, value) => {
        if (!err && value) applyMetaData(value);
        else { try { applyMetaData(localStorage.getItem(STORAGE_KEY)); } catch (e) {} }
        done && done();
      });
    } catch (e) { loadLocal(); }
  } else {
    loadLocal();
  }
}

function saveMeta() {
  const data = JSON.stringify({
    souls: state.meta.souls,
    upgrades: state.meta.upgrades,
  });
  try { localStorage.setItem(STORAGE_KEY, data); } catch (e) {}
  if (IS_TG && tg.CloudStorage && tg.CloudStorage.setItem) {
    try { tg.CloudStorage.setItem(STORAGE_KEY, data); } catch (e) {}
  }
}

let monsterIdCounter = 0;

function randInt(n) { return Math.floor(Math.random() * n); }
function randRange(min, max) { return min + randInt(max - min + 1); }
function inBounds(x, y) { return x >= 0 && y >= 0 && x < state.gridSize && y < state.gridSize; }
function monsterAt(x, y) { return state.monsters.find(m => m.x === x && m.y === y); }
function isAdjacent(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1; }

function makeEmptyGrid(size) {
  const g = [];
  for (let y = 0; y < size; y++) {
    const row = [];
    for (let x = 0; x < size; x++) row.push({ type: 'empty' });
    g.push(row);
  }
  return g;
}

function randomFreeCell() {
  const free = [];
  for (let y = 0; y < state.gridSize; y++) {
    for (let x = 0; x < state.gridSize; x++) {
      if (state.grid[y][x].type !== 'empty') continue;
      if (state.player.x === x && state.player.y === y) continue;
      if (monsterAt(x, y)) continue;
      free.push({ x, y });
    }
  }
  return free.length ? free[randInt(free.length)] : null;
}

function pickMonsterType(depth) {
  const pool = [];
  for (const key of Object.keys(MONSTER_TEMPLATES)) {
    const t = MONSTER_TEMPLATES[key];
    if (t.boss) continue;
    if (t.minDepth > depth) continue;
    pool.push(key);
  }
  return pool[randInt(pool.length)];
}

function spawnOne(typeKey, mult) {
  const cell = randomFreeCell();
  if (!cell) return;
  const t = MONSTER_TEMPLATES[typeKey];
  const hp = Math.ceil(t.hp * mult);
  state.monsters.push({
    id: ++monsterIdCounter,
    x: cell.x, y: cell.y,
    type: typeKey,
    emoji: t.emoji, name: t.name, acc: t.acc,
    hp, maxHp: hp,
    atk: Math.ceil(t.atk * mult),
    def: Math.ceil(t.def * mult),
    xp: t.xp,
    goldMin: t.goldMin, goldMax: t.goldMax,
    boss: !!t.boss,
  });
}

function spawnMonsters() {
  const cfg = FLOOR_CONFIG(state.depth);
  const mult = 1 + (state.depth - 1) * 0.1;
  const isBossFloor = state.depth % 10 === 0;

  if (isBossFloor) {
    spawnOne('dragon', mult);
    if (Math.random() < 0.5) spawnOne(pickMonsterType(state.depth), mult);
    pushLog(`⚠️ Босс! ${MONSTER_TEMPLATES.dragon.name} ждёт тебя.`);
    return;
  }

  const count = randRange(cfg.monstersMin, cfg.monstersMax);
  for (let i = 0; i < count; i++) {
    spawnOne(pickMonsterType(state.depth), mult);
  }
}

function isMerchantFloor(depth) {
  const mod = depth % 10;
  return mod === 5 || mod === 9;
}

function initFloor() {
  const cfg = FLOOR_CONFIG(state.depth);
  state.gridSize = cfg.size;
  state.grid = makeEmptyGrid(cfg.size);
  state.monsters = [];
  state.player.x = randInt(cfg.size);
  state.player.y = randInt(cfg.size);
  const stairs = randomFreeCell();
  if (stairs) state.grid[stairs.y][stairs.x] = { type: 'stairs' };

  if (isMerchantFloor(state.depth)) {
    initMerchantFloor();
    pushLog(`Этаж ${state.depth}. 🛒 Торговец.`);
    return;
  }

  spawnMonsters();
  spawnItems();
  pushLog(`Этаж ${state.depth}. Монстров: ${state.monsters.length}.`);
}

function initMerchantFloor() {
  const cell = randomFreeCell();
  if (cell) state.grid[cell.y][cell.x] = { type: 'merchant' };
  state.merchantStock = generateMerchantStock(state.depth);
}

function generateMerchantStock(depth) {
  const stock = [];
  for (let i = 0; i < 3; i++) {
    const item = rollItem(depth);
    stock.push({ kind: 'item', item, price: SHOP_ITEM_PRICE[item.rarity] });
  }
  for (const type of Object.keys(POTION_TYPES)) {
    stock.push({ kind: 'potion', potion: type, price: POTION_TYPES[type].price });
  }
  return stock;
}

function rollPotionType() {
  const r = Math.random();
  if (r < 0.90) return 'heal';
  if (r < 0.95) return 'rage';
  return 'iron';
}

function spawnItems() {
  const cfg = FLOOR_CONFIG(state.depth);
  const count = randRange(cfg.itemsMin, cfg.itemsMax);
  for (let i = 0; i < count; i++) {
    const cell = randomFreeCell();
    if (!cell) break;
    const roll = Math.random();
    if (roll < 0.50) {
      state.grid[cell.y][cell.x] = { type: 'coin' };
    } else if (roll < 0.80) {
      state.grid[cell.y][cell.x] = { type: 'potion', potion: rollPotionType() };
    } else {
      state.grid[cell.y][cell.x] = { type: 'chest' };
    }
  }
}

function descend() {
  state.depth += 1;
  initFloor();
}

function tryMovePlayer(dx, dy) {
  if (state.screen !== 'game') return;
  const nx = state.player.x + dx;
  const ny = state.player.y + dy;
  if (!inBounds(nx, ny)) return;

  const monster = monsterAt(nx, ny);
  if (monster) {
    openCombat(monster);
    render();
    return;
  }

  if (state.grid[ny][nx].type === 'merchant') {
    openShop();
    render();
    return;
  }

  state.player.x = nx;
  state.player.y = ny;

  const target = state.grid[ny][nx];
  if (target.type === 'coin')   pickupCoin(nx, ny);
  if (target.type === 'potion') pickupPotion(nx, ny);
  if (target.type === 'chest')  openChest(nx, ny);
  if (target.type === 'stairs') {
    openStairsPrompt();
    render();
    return;
  }

  if (state.screen === 'compare') {
    render();
    return;
  }

  endTurn(null);
  render();
}

function pickupCoin(x, y) {
  const gold = randRange(1, 3);
  state.player.gold += gold;
  state.runStats.goldCollected += gold;
  state.grid[y][x] = { type: 'empty' };
  pushLog(`+${gold} 🪙.`);
  queueFloat(x, y, `+${gold} 🪙`, 'gold');
}

function pickupPotion(x, y) {
  const kind = state.grid[y][x].potion || 'heal';
  const t = POTION_TYPES[kind];
  if (state.player.potions[kind] >= MAX_POTIONS) {
    pushLog(`${t.name}: максимум (${MAX_POTIONS}).`);
    return;
  }
  state.player.potions[kind] += 1;
  state.grid[y][x] = { type: 'empty' };
  pushLog(`${t.name} (${state.player.potions[kind]}/${MAX_POTIONS}).`);
  queueFloat(x, y, t.icon, kind === 'heal' ? 'heal' : '');
}

function openChest(x, y) {
  state.grid[y][x] = { type: 'empty' };
  state.runStats.chestsOpened += 1;
  const roll = Math.random();
  if (roll < 0.40) {
    const item = rollItem(state.depth);
    pushLog(`Сундук: ${item.name} [${item.rarity}]!`);
    queueFloat(x, y, item.name, rarityClass(item.rarity));
    tryEquip(item);
  } else if (roll < 0.70) {
    let gold = randRange(10, 30);
    if (hasPassive('goldBonus')) gold = Math.floor(gold * 1.5);
    state.player.gold += gold;
    state.runStats.goldCollected += gold;
    pushLog(`Сундук: +${gold} 🪙.`);
    queueFloat(x, y, `+${gold} 🪙`, 'gold');
  } else if (roll < 0.90) {
    const n = randRange(1, 2);
    let added = 0;
    for (let i = 0; i < n; i++) {
      if (state.player.potions.heal < MAX_POTIONS) { state.player.potions.heal++; added++; }
    }
    pushLog(`Сундук: +${added} 🧪.`);
    queueFloat(x, y, `+${added} 🧪`, 'heal');
  } else {
    const xp = 20;
    pushLog(`Сундук: +${xp} ⭐.`);
    queueFloat(x, y, `+${xp} ⭐`, 'xp');
    gainXp(xp);
  }
}

function rarityClass(r) {
  if (r === 'rare') return 'xp';
  if (r === 'epic') return 'gold';
  return '';
}

function tryEquip(item) {
  const current = state.player.equipment[item.slot];
  if (!current) {
    state.player.equipment[item.slot] = item;
    recalcStats();
    pushLog(`Надел: ${item.name}.`);
    return;
  }
  openCompareModal(current, item);
}

function openCompareModal(current, candidate) {
  state.pendingItem = candidate;
  state.pendingPrevScreen = state.screen;
  state.screen = 'compare';
  document.getElementById('compare-slot-label').textContent = `Слот: ${SLOT_LABEL[candidate.slot]}`;
  document.getElementById('compare-cur-name').textContent = current.name;
  document.getElementById('compare-cur-stats').innerHTML = statsLine(current);
  document.getElementById('compare-new-name').textContent = candidate.name;
  document.getElementById('compare-new-stats').innerHTML = statsLine(candidate);
  const newCol = document.getElementById('compare-new-col');
  newCol.classList.remove('rarity-rare', 'rarity-epic');
  if (candidate.rarity !== 'common') newCol.classList.add('rarity-' + candidate.rarity);
  document.getElementById('compare-modal').classList.remove('hidden');
}

function closeCompareModal(take) {
  document.getElementById('compare-modal').classList.add('hidden');
  const item = state.pendingItem;
  const slot = item.slot;
  if (take) {
    const old = state.player.equipment[slot];
    state.player.equipment[slot] = item;
    recalcStats();
    pushLog(`${old.name} → ${item.name}.`);
  } else {
    pushLog(`Оставил ${state.player.equipment[slot].name}.`);
  }
  state.pendingItem = null;
  const prev = state.pendingPrevScreen || 'game';
  state.pendingPrevScreen = null;
  if (prev === 'shop') {
    state.screen = 'shop';
    document.getElementById('shop-modal').classList.remove('hidden');
    renderShop();
    renderHUD();
    return;
  }
  state.screen = prev;
  endTurn(null);
  render();
}

function openShop() {
  state.prevScreen = state.screen;
  state.screen = 'shop';
  renderShop();
  document.getElementById('shop-modal').classList.remove('hidden');
}

function closeShop() {
  state.screen = state.prevScreen === 'shop' ? 'game' : (state.prevScreen || 'game');
  document.getElementById('shop-modal').classList.add('hidden');
  render();
}

function renderShop() {
  document.getElementById('shop-player-gold').textContent = state.player.gold;
  const listEl = document.getElementById('shop-list');
  listEl.innerHTML = '';
  state.merchantStock.forEach((entry, idx) => {
    if (entry.sold) return;
    const row = document.createElement('div');
    row.className = 'shop-row';
    if (entry.kind === 'item') {
      const it = entry.item;
      const rarityCls = it.rarity !== 'common' ? ' rarity-' + it.rarity : '';
      row.className += rarityCls;
      row.innerHTML = `
        <div class="shop-icon">${SLOT_EMOJI[it.slot] || '❔'}</div>
        <div class="shop-info">
          <div class="shop-name">${it.name} <span class="shop-lvl">${it.rarity}</span></div>
          <div class="shop-desc">${statsLine(it).replace(/<br>/g, ' · ')}</div>
        </div>
        <button class="shop-buy" data-idx="${idx}">${entry.price} 🪙</button>
      `;
    } else {
      const t = POTION_TYPES[entry.potion];
      const count = state.player.potions[entry.potion];
      const full = count >= MAX_POTIONS;
      row.innerHTML = `
        <div class="shop-icon">${t.icon}</div>
        <div class="shop-info">
          <div class="shop-name">${t.name} <span class="shop-lvl">${count}/${MAX_POTIONS}</span></div>
          <div class="shop-desc">${t.short}</div>
        </div>
        <button class="shop-buy" data-idx="${idx}" ${full ? 'disabled' : ''}>${full ? 'MAX' : entry.price + ' 🪙'}</button>
      `;
    }
    listEl.appendChild(row);
  });
  listEl.querySelectorAll('.shop-buy').forEach(btn => {
    const idx = Number(btn.dataset.idx);
    const entry = state.merchantStock[idx];
    const cantAfford = state.player.gold < entry.price;
    if (cantAfford && !btn.disabled) {
      btn.classList.add('disabled');
      btn.disabled = true;
    }
    btn.addEventListener('click', () => buyShopItem(idx));
  });
  if (!state.merchantStock.some(e => !e.sold)) {
    const empty = document.createElement('div');
    empty.className = 'shop-empty';
    empty.textContent = 'Товары закончились.';
    listEl.appendChild(empty);
  }
}

function buyShopItem(idx) {
  const entry = state.merchantStock[idx];
  if (!entry || entry.sold) return;
  if (state.player.gold < entry.price) { pushLog('Не хватает золота.'); return; }

  if (entry.kind === 'potion') {
    const count = state.player.potions[entry.potion];
    if (count >= MAX_POTIONS) { pushLog('Зелий максимум.'); return; }
    state.player.gold -= entry.price;
    state.player.potions[entry.potion] += 1;
    pushLog(`Куплено: ${POTION_TYPES[entry.potion].name}.`);
    renderShop();
    renderHUD();
    return;
  }

  state.player.gold -= entry.price;
  entry.sold = true;
  pushLog(`Куплено: ${entry.item.name} [${entry.item.rarity}].`);
  document.getElementById('shop-modal').classList.add('hidden');
  tryEquip(entry.item);
  if (state.screen !== 'compare') {
    document.getElementById('shop-modal').classList.remove('hidden');
    renderShop();
    renderHUD();
  }
}

const SLOT_EMOJI = {
  weapon: '⚔️', helmet: '👑', chest: '🧥', boots: '👢', ring: '💍', amulet: '📿',
};

function statsLine(item) {
  const parts = [];
  const b = item.bonus || {};
  if (b.atk) parts.push(`${b.atk > 0 ? '+' : ''}${b.atk} ATK`);
  if (b.def) parts.push(`${b.def > 0 ? '+' : ''}${b.def} DEF`);
  if (b.hp)  parts.push(`${b.hp > 0 ? '+' : ''}${b.hp} HP`);
  if (item.passive === 'goldBonus') parts.push('+50% 🪙');
  if (item.passive === 'xpBonus')   parts.push('+25% ⭐');
  if (item.passive === 'phoenix')   parts.push('🔥 Воскрешение');
  return parts.join('<br>') || '—';
}

function usePotion(type) {
  if (state.screen !== 'game' && state.screen !== 'combat') return;
  if (!POTION_TYPES[type]) return;
  if (state.player.potions[type] <= 0) { pushLog(`Нет зелий (${POTION_TYPES[type].icon}).`); render(); return; }

  if (type === 'heal') {
    if (state.player.hp >= state.player.maxHp) { pushLog('HP уже полное.'); render(); return; }
    state.player.potions.heal -= 1;
    const heal = Math.min(POTION_HEAL, state.player.maxHp - state.player.hp);
    state.player.hp += heal;
    pushLog(`Зелье лечения: +${heal} HP.`);
    queueFloat(state.player.x, state.player.y, `+${heal}`, 'heal');
  } else {
    state.player.potions[type] -= 1;
    state.player.effects[type] = POTION_TYPES[type].duration;
    recalcStats();
    pushLog(`${POTION_TYPES[type].name}: ${POTION_TYPES[type].short}.`);
    queueFloat(state.player.x, state.player.y, POTION_TYPES[type].icon, type === 'rage' ? '' : 'heal');
  }
  render();
}

function tickEffects() {
  let changed = false;
  for (const key of Object.keys(state.player.effects)) {
    if (state.player.effects[key] > 0) {
      state.player.effects[key] -= 1;
      changed = true;
      if (state.player.effects[key] === 0) {
        pushLog(`${POTION_TYPES[key].name}: эффект закончился.`);
      }
    }
  }
  if (changed) recalcStats();
}

function endTurn(skipMonsterId) {
  tickEffects();
  for (const m of state.monsters) {
    if (skipMonsterId !== null && m.id === skipMonsterId) continue;
    if (isAdjacent(m, state.player)) {
      const dmg = Math.max(m.atk - state.player.def, 1);
      state.player.hp -= dmg;
      pushLog(`${m.name} ударил тебя на ${dmg}.`);
      queueHit(state.player.x, state.player.y, dmg);
      if (checkDeath()) return;
    } else {
      moveMonsterToward(m);
    }
  }

  if (state.combat) {
    const m = state.monsters.find(x => x.id === state.combat.monsterId);
    if (!m || !isAdjacent(m, state.player)) closeCombat();
    else updateCombatUI();
  }
}

function moveMonsterToward(m) {
  const dxSign = Math.sign(state.player.x - m.x);
  const dySign = Math.sign(state.player.y - m.y);
  const dxAbs = Math.abs(state.player.x - m.x);
  const dyAbs = Math.abs(state.player.y - m.y);

  const tryStep = (tx, ty) => {
    if (!inBounds(tx, ty)) return false;
    if (state.player.x === tx && state.player.y === ty) return false;
    if (monsterAt(tx, ty)) return false;
    m.x = tx; m.y = ty;
    return true;
  };

  if (dxAbs >= dyAbs) {
    if (dxSign !== 0 && tryStep(m.x + dxSign, m.y)) return;
    if (dySign !== 0 && tryStep(m.x, m.y + dySign)) return;
  } else {
    if (dySign !== 0 && tryStep(m.x, m.y + dySign)) return;
    if (dxSign !== 0 && tryStep(m.x + dxSign, m.y)) return;
  }
}

function openCombat(monster) {
  state.screen = 'combat';
  state.combat = { monsterId: monster.id };
  document.getElementById('controls').classList.add('hidden');
  document.getElementById('combat-panel').classList.remove('hidden');
  updateCombatUI();
}

function closeCombat() {
  state.screen = 'game';
  state.combat = null;
  document.getElementById('combat-panel').classList.add('hidden');
  document.getElementById('controls').classList.remove('hidden');
}

function updateCombatUI() {
  if (!state.combat) return;
  const m = state.monsters.find(x => x.id === state.combat.monsterId);
  if (!m) return;
  document.getElementById('combat-emoji').textContent = m.emoji;
  document.getElementById('combat-name').textContent = m.name;
  document.getElementById('combat-hp').textContent = m.hp;
  document.getElementById('combat-maxhp').textContent = m.maxHp;
  document.getElementById('combat-hp-fill').style.width = Math.max(0, m.hp / m.maxHp * 100) + '%';
}

function combatAttack() {
  if (!state.combat) return;
  const m = state.monsters.find(x => x.id === state.combat.monsterId);
  if (!m) return;

  const dmg = Math.max(state.player.atk - m.def, 1);
  m.hp -= dmg;
  pushLog(`Ты ударил ${m.acc} на ${dmg}.`);
  queueHit(m.x, m.y, dmg);

  if (m.hp <= 0) {
    pushLog(`${m.name} повержен. +${m.xp} XP.`);
    killMonster(m);
    closeCombat();
    endTurn(null);
    render();
    return;
  }

  const dmgBack = Math.max(m.atk - state.player.def, 1);
  state.player.hp -= dmgBack;
  pushLog(`${m.name} ударил тебя на ${dmgBack}.`);
  queueHit(state.player.x, state.player.y, dmgBack);
  if (checkDeath()) return;

  endTurn(m.id);
  render();
}

function combatDefend() {
  if (!state.combat) return;
  const m = state.monsters.find(x => x.id === state.combat.monsterId);
  if (!m) return;
  const raw = Math.max(m.atk - state.player.def, 1);
  const dmg = Math.max(Math.floor(raw / 2), 1);
  state.player.hp -= dmg;
  pushLog(`Защита. ${m.name} ударил на ${dmg}.`);
  queueHit(state.player.x, state.player.y, dmg);
  if (checkDeath()) return;
  endTurn(m.id);
  render();
}

function combatEscape() {
  if (!state.combat) return;
  const m = state.monsters.find(x => x.id === state.combat.monsterId);
  if (!m) return;

  const dirs = [[0,-1],[0,1],[-1,0],[1,0]];
  const free = [];
  for (const [dx, dy] of dirs) {
    const nx = state.player.x + dx;
    const ny = state.player.y + dy;
    if (!inBounds(nx, ny)) continue;
    if (monsterAt(nx, ny)) continue;
    free.push({ x: nx, y: ny });
  }
  if (!free.length) {
    pushLog('Некуда бежать!');
    render();
    return;
  }

  const dest = free[randInt(free.length)];
  state.player.x = dest.x;
  state.player.y = dest.y;

  const dmg = Math.max(m.atk - state.player.def, 1);
  state.player.hp -= dmg;
  pushLog(`Ты отступил. ${m.name} ударил в спину на ${dmg}.`);
  queueHit(state.player.x, state.player.y, dmg);

  closeCombat();
  if (checkDeath()) return;

  endTurn(m.id);
  render();
}

function killMonster(m) {
  const gx = m.x, gy = m.y;
  state.monsters = state.monsters.filter(x => x.id !== m.id);
  state.runStats.monstersKilled += 1;
  if (m.boss) state.runStats.bossesKilled += 1;
  haptic(m.boss ? 'success' : 'impact-heavy');
  let gold = randRange(m.goldMin, m.goldMax);
  if (hasPassive('goldBonus')) gold = Math.floor(gold * 1.5);
  state.player.gold += gold;
  state.runStats.goldCollected += gold;
  pushLog(`+${gold} 🪙, +${m.xp} ⭐.`);
  queueFloat(gx, gy, `+${gold}🪙 +${m.xp}⭐`, 'gold');
  gainXp(m.xp);
}

function getBaseStats() {
  const lvl = state.player.level;
  const up = state.meta.upgrades;
  return {
    maxHp: 20 + (lvl - 1) * 3 + up.maxHp * 2,
    atk:   5 + Math.floor(lvl / 2) + up.atk,
    def:   1 + Math.floor(lvl / 3) + up.def,
  };
}

function hasPassive(name) {
  const a = state.player.equipment.amulet;
  return !!(a && a.passive === name);
}

function recalcStats() {
  const base = getBaseStats();
  let maxHp = base.maxHp, atk = base.atk, def = base.def;
  for (const key of Object.keys(state.player.equipment)) {
    const it = state.player.equipment[key];
    if (!it) continue;
    if (it.bonus.hp)  maxHp += it.bonus.hp;
    if (it.bonus.atk) atk   += it.bonus.atk;
    if (it.bonus.def) def   += it.bonus.def;
  }
  if (state.player.effects.rage > 0) atk += POTION_TYPES.rage.atk;
  if (state.player.effects.iron > 0) def += POTION_TYPES.iron.def;
  if (atk < 1) atk = 1;
  state.player.maxHp = maxHp;
  state.player.atk = atk;
  state.player.def = def;
  if (state.player.hp > maxHp) state.player.hp = maxHp;
}

function gainXp(amount) {
  if (hasPassive('xpBonus')) amount = Math.floor(amount * 1.25);
  state.player.xp += amount;
  while (state.player.xp >= state.player.xpToNext) {
    state.player.xp -= state.player.xpToNext;
    levelUp();
  }
}

function levelUp() {
  const oldMaxHp = state.player.maxHp;
  state.player.level += 1;
  recalcStats();
  const hpGain = state.player.maxHp - oldMaxHp;
  state.player.hp = Math.min(state.player.maxHp, state.player.hp + hpGain);
  state.player.xpToNext = 10 * state.player.level;
  let bonuses = `+${hpGain} HP`;
  if (state.player.level % 2 === 0) bonuses += ', +1 ATK';
  if (state.player.level % 3 === 0) bonuses += ', +1 DEF';
  pushLog(`LVL UP → ${state.player.level}! ${bonuses}.`);
  showLevelUpBanner();
  haptic('success');
}

function openInventory() {
  if (state.screen !== 'game' && state.screen !== 'combat') return;
  state.prevScreen = state.screen;
  state.screen = 'inventory';
  updateInventoryUI();
  document.getElementById('inventory-modal').classList.remove('hidden');
}

function closeInventory() {
  state.screen = state.prevScreen || 'game';
  document.getElementById('inventory-modal').classList.add('hidden');
}

function updateInventoryUI() {
  const p = state.player;
  document.getElementById('inv-hp').textContent = p.hp;
  document.getElementById('inv-maxhp').textContent = p.maxHp;
  document.getElementById('inv-atk').textContent = p.atk;
  document.getElementById('inv-def').textContent = p.def;

  const slots = ['weapon', 'helmet', 'chest', 'boots', 'ring', 'amulet'];
  for (const key of slots) {
    const item = p.equipment[key];
    const slotEl = document.querySelector(`.inv-slot[data-slot="${key}"]`);
    const nameEl = document.getElementById(`inv-name-${key}`);
    const bonusEl = document.getElementById(`inv-bonus-${key}`);
    slotEl.classList.remove('equipped', 'rarity-rare', 'rarity-epic');
    if (item) {
      slotEl.classList.add('equipped');
      if (item.rarity && item.rarity !== 'common') slotEl.classList.add('rarity-' + item.rarity);
      nameEl.textContent = item.name;
      bonusEl.innerHTML = statsLine(item);
    } else {
      nameEl.textContent = '—';
      bonusEl.innerHTML = '';
    }
  }
}

function showLevelUpBanner() {
  const div = document.createElement('div');
  div.className = 'levelup-banner';
  div.textContent = `LEVEL ${state.player.level}!`;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 1500);
}

const animQueue = [];

function queueHit(x, y, amount) {
  animQueue.push({ kind: 'hit', x, y, amount });
  haptic('impact');
}

function queueFloat(x, y, text, cls) {
  animQueue.push({ kind: 'float', x, y, text, cls });
}

function flushAnims() {
  for (const a of animQueue) {
    const el = document.querySelector(`.cell[data-x="${a.x}"][data-y="${a.y}"]`);
    if (!el) continue;
    if (a.kind === 'hit') {
      el.classList.add('flash-red', 'shaking');
      setTimeout(() => el.classList.remove('flash-red', 'shaking'), 280);
      spawnFloat(el, '-' + a.amount, '');
    } else if (a.kind === 'float') {
      spawnFloat(el, a.text, a.cls || '');
    }
  }
  animQueue.length = 0;
}

function spawnFloat(cell, text, cls) {
  const span = document.createElement('span');
  span.className = 'float-text' + (cls ? ' ' + cls : '');
  span.textContent = text;
  cell.appendChild(span);
  setTimeout(() => span.remove(), 820);
}

function openStairsPrompt() {
  state.screen = 'stairs-prompt';
  document.getElementById('modal-title').textContent = 'Спуститься?';
  document.getElementById('modal-body').textContent =
    `🪜 Лестница вниз. Перейти на этаж ${state.depth + 1}?`;
  document.getElementById('modal').classList.remove('hidden');
}

function closeStairsPrompt(confirm) {
  document.getElementById('modal').classList.add('hidden');
  if (confirm) {
    pushLog(`Ты спустился на этаж ${state.depth + 1}.`);
    transitionDescend();
  } else {
    state.screen = 'game';
    endTurn(null);
    render();
  }
}

function transitionDescend() {
  state.screen = 'transition';
  const grid = document.getElementById('grid');
  grid.classList.add('transitioning');
  setTimeout(() => {
    descend();
    state.screen = 'game';
    render();
  }, 250);
  setTimeout(() => grid.classList.remove('transitioning'), 520);
}

function checkDeath() {
  if (state.player.hp > 0) return false;
  const amulet = state.player.equipment.amulet;
  if (amulet && amulet.passive === 'phoenix') {
    state.player.equipment.amulet = null;
    recalcStats();
    state.player.hp = Math.max(1, Math.floor(state.player.maxHp / 2));
    pushLog('🔥 Сердце феникса воскресило тебя!');
    queueFloat(state.player.x, state.player.y, 'ВОСКРЕШЕНИЕ!', 'heal');
    return false;
  }
  gameOver();
  return true;
}

function calcScore() {
  const r = state.runStats;
  return state.depth * 20
       + r.monstersKilled * 5
       + r.chestsOpened * 10
       + r.bossesKilled * 100
       + state.player.level * 15
       + r.goldCollected;
}

function gameOver() {
  state.screen = 'death';
  const score = calcScore();
  const soulsEarned = Math.floor(score / 10);
  state.meta.souls += soulsEarned;
  saveMeta();
  haptic('error');
  pushLog(`💀 Забег окончен. Счёт ${score}, душ +${soulsEarned}.`);

  document.getElementById('combat-panel').classList.add('hidden');
  document.getElementById('controls').classList.add('hidden');
  document.getElementById('death-depth').textContent = state.depth;
  document.getElementById('death-level').textContent = state.player.level;
  document.getElementById('death-kills').textContent = state.runStats.monstersKilled;
  document.getElementById('death-bosses').textContent = state.runStats.bossesKilled;
  document.getElementById('death-chests').textContent = state.runStats.chestsOpened;
  document.getElementById('death-gold').textContent = state.runStats.goldCollected;
  document.getElementById('death-score').textContent = score;
  document.getElementById('death-souls-earned').textContent = soulsEarned;
  document.getElementById('death-souls-total').textContent = state.meta.souls;
  document.getElementById('death-modal').classList.remove('hidden');
  render();
}

function startRun() {
  const up = state.meta.upgrades;
  state.player.level = 1;
  state.player.xp = 0;
  state.player.xpToNext = 10;
  state.player.gold = up.gold * 10;
  state.player.potions = { heal: Math.min(MAX_POTIONS, up.potions), rage: 0, iron: 0 };
  state.player.effects = { rage: 0, iron: 0 };
  state.player.equipment = { weapon: null, helmet: null, chest: null, boots: null, ring: null, amulet: null };
  state.pendingItem = null;
  state.depth = 1;
  recalcStats();
  state.player.hp = state.player.maxHp;
  state.monsters = [];
  state.runStats = { monstersKilled: 0, chestsOpened: 0, bossesKilled: 0, goldCollected: 0 };
  state.combat = null;
  state.log = [];
  state.screen = 'game';
  document.getElementById('menu-modal').classList.add('hidden');
  document.getElementById('death-modal').classList.add('hidden');
  document.getElementById('combat-panel').classList.add('hidden');
  document.getElementById('controls').classList.remove('hidden');
  initFloor();
  render();
}

function pushLog(text) {
  state.log.push(text);
  if (state.log.length > 5) state.log.shift();
}

function render() {
  renderHUD();
  renderGrid();
  renderLog();
  flushAnims();
}

function renderHUD() {
  const p = state.player;
  document.getElementById('hud-depth').textContent = state.depth;
  document.getElementById('hud-souls').textContent = state.meta.souls;
  document.getElementById('hud-gold').textContent = p.gold;
  document.getElementById('hud-level').textContent = p.level;
  document.getElementById('hud-hp').textContent = Math.max(0, p.hp);
  document.getElementById('hud-maxhp').textContent = p.maxHp;
  document.getElementById('hud-atk').textContent = p.atk;
  document.getElementById('hud-def').textContent = p.def;
  document.getElementById('hud-xp').textContent = p.xp;
  document.getElementById('hud-xpnext').textContent = p.xpToNext;
  for (const type of Object.keys(POTION_TYPES)) {
    const btn = document.getElementById(`btn-potion-${type}`);
    if (!btn) continue;
    const count = p.potions[type];
    const active = p.effects && p.effects[type] > 0;
    const icon = POTION_TYPES[type].icon;
    btn.textContent = active ? `${icon}${count} · ${p.effects[type]}x` : `${icon} ${count}`;
    btn.classList.toggle('has-potions', count > 0);
    btn.classList.toggle('effect-active', !!active);
  }
}

function renderGrid() {
  const el = document.getElementById('grid');
  const size = state.gridSize;
  el.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
  el.innerHTML = '';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = document.createElement('div');
      cell.className = 'cell empty';
      cell.dataset.x = x;
      cell.dataset.y = y;
      if (state.player.x === x && state.player.y === y) {
        cell.classList.add('player');
        cell.textContent = EMOJI.player;
      } else {
        const m = monsterAt(x, y);
        if (m) {
          cell.classList.add('monster');
          if (m.boss) cell.classList.add('boss');
          cell.textContent = m.emoji;
        } else {
          const c = state.grid[y][x];
          if (c.type === 'potion') {
            const kind = c.potion || 'heal';
            cell.textContent = POTION_TYPES[kind].icon;
            if (kind !== 'heal') cell.classList.add('potion-rare');
          } else if (c.type !== 'empty' && EMOJI[c.type]) {
            cell.textContent = EMOJI[c.type];
            if (c.type === 'merchant') cell.classList.add('merchant-cell');
          }
        }
      }
      el.appendChild(cell);
    }
  }
}

function renderLog() {
  const el = document.getElementById('log');
  el.innerHTML = '';
  for (const line of state.log) {
    const div = document.createElement('div');
    div.className = 'log-entry';
    div.textContent = '> ' + line;
    el.appendChild(div);
  }
  el.scrollTop = el.scrollHeight;
}

function handleDirection(dir) {
  if (dir === 'up')    tryMovePlayer(0, -1);
  if (dir === 'down')  tryMovePlayer(0,  1);
  if (dir === 'left')  tryMovePlayer(-1, 0);
  if (dir === 'right') tryMovePlayer( 1, 0);
}

function bindInput() {
  document.querySelectorAll('.dir-btn[data-dir]').forEach(btn => {
    btn.addEventListener('click', () => handleDirection(btn.dataset.dir));
  });

  document.getElementById('modal-yes').addEventListener('click', () => closeStairsPrompt(true));
  document.getElementById('modal-no').addEventListener('click', () => closeStairsPrompt(false));
  document.getElementById('death-restart').addEventListener('click', startRun);
  document.getElementById('death-menu').addEventListener('click', backToMenu);
  document.getElementById('menu-start').addEventListener('click', startRun);
  document.getElementById('menu-reset').addEventListener('click', resetMeta);

  document.querySelectorAll('.potion-btn').forEach(btn => {
    btn.addEventListener('click', () => usePotion(btn.dataset.potion));
  });
  document.getElementById('btn-inventory').addEventListener('click', openInventory);
  document.getElementById('shop-close').addEventListener('click', closeShop);
  document.getElementById('btn-music').addEventListener('click', toggleMute);
  document.getElementById('inv-close').addEventListener('click', closeInventory);
  document.getElementById('compare-take').addEventListener('click', () => closeCompareModal(true));
  document.getElementById('compare-keep').addEventListener('click', () => closeCompareModal(false));

  document.querySelectorAll('.combat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const a = btn.dataset.action;
      if (a === 'attack') combatAttack();
      if (a === 'defend') combatDefend();
      if (a === 'escape') combatEscape();
    });
  });

  window.addEventListener('keydown', (e) => {
    if (state.screen === 'stairs-prompt') {
      if (e.key === 'Enter')  { e.preventDefault(); closeStairsPrompt(true); }
      if (e.key === 'Escape') { e.preventDefault(); closeStairsPrompt(false); }
      return;
    }
    if (state.screen === 'compare') {
      if (e.key === 'Enter')  { e.preventDefault(); closeCompareModal(true); }
      if (e.key === 'Escape') { e.preventDefault(); closeCompareModal(false); }
      return;
    }
    if (state.screen === 'inventory') {
      if (e.key === 'Escape' || e.key.toLowerCase() === 'i') {
        e.preventDefault();
        closeInventory();
      }
      return;
    }
    if (state.screen === 'combat') {
      if (e.key === '1') { e.preventDefault(); combatAttack(); }
      if (e.key === '2') { e.preventDefault(); combatDefend(); }
      if (e.key === '3') { e.preventDefault(); combatEscape(); }
      if (e.key.toLowerCase() === 'q') { e.preventDefault(); usePotion('heal'); }
      if (e.key.toLowerCase() === 'e') { e.preventDefault(); usePotion('rage'); }
      if (e.key.toLowerCase() === 'r') { e.preventDefault(); usePotion('iron'); }
      if (e.key.toLowerCase() === 'i') { e.preventDefault(); openInventory(); }
      return;
    }
    if (state.screen === 'shop') {
      if (e.key === 'Escape') { e.preventDefault(); closeShop(); }
      return;
    }
    if (state.screen !== 'game') return;
    const k = e.key.toLowerCase();
    if (k === 'q') { e.preventDefault(); usePotion('heal'); return; }
    if (k === 'e') { e.preventDefault(); usePotion('rage'); return; }
    if (k === 'r') { e.preventDefault(); usePotion('iron'); return; }
    if (k === 'i') { e.preventDefault(); openInventory(); return; }
    if (k === 'arrowup'    || k === 'w') { e.preventDefault(); handleDirection('up'); }
    if (k === 'arrowdown'  || k === 's') { e.preventDefault(); handleDirection('down'); }
    if (k === 'arrowleft'  || k === 'a') { e.preventDefault(); handleDirection('left'); }
    if (k === 'arrowright' || k === 'd') { e.preventDefault(); handleDirection('right'); }
  });

  const grid = document.getElementById('grid');
  let touchStart = null;
  grid.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    touchStart = { x: t.clientX, y: t.clientY };
  }, { passive: true });
  grid.addEventListener('touchend', (e) => {
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    const MIN = 24;
    if (Math.abs(dx) >= MIN || Math.abs(dy) >= MIN) {
      if (Math.abs(dx) > Math.abs(dy)) handleDirection(dx > 0 ? 'right' : 'left');
      else handleDirection(dy > 0 ? 'down' : 'up');
    }
    touchStart = null;
  }, { passive: true });
}

function openMenu() {
  state.screen = 'menu';
  document.getElementById('death-modal').classList.add('hidden');
  document.getElementById('combat-panel').classList.add('hidden');
  document.getElementById('inventory-modal').classList.add('hidden');
  document.getElementById('compare-modal').classList.add('hidden');
  document.getElementById('modal').classList.add('hidden');
  renderMenu();
  document.getElementById('menu-modal').classList.remove('hidden');
}

function renderMenu() {
  document.getElementById('menu-souls').textContent = state.meta.souls;
  const shopEl = document.getElementById('menu-shop');
  shopEl.innerHTML = '';
  for (const item of SHOP_ITEMS) {
    const lvl = state.meta.upgrades[item.id];
    const maxed = lvl >= item.max;
    const cost = maxed ? null : item.costs[lvl];
    const canAfford = !maxed && state.meta.souls >= cost;

    const row = document.createElement('div');
    row.className = 'shop-row' + (maxed ? ' maxed' : '');
    row.innerHTML = `
      <div class="shop-icon">${item.icon}</div>
      <div class="shop-info">
        <div class="shop-name">${item.name} <span class="shop-lvl">${lvl}/${item.max}</span></div>
        <div class="shop-desc">${item.desc}</div>
      </div>
      <button class="shop-buy${canAfford ? '' : ' disabled'}" data-id="${item.id}" ${maxed || !canAfford ? 'disabled' : ''}>
        ${maxed ? 'MAX' : `${cost} 💀`}
      </button>
    `;
    shopEl.appendChild(row);
  }
  shopEl.querySelectorAll('.shop-buy').forEach(btn => {
    btn.addEventListener('click', () => buyUpgrade(btn.dataset.id));
  });
}

function buyUpgrade(id) {
  const item = SHOP_ITEMS.find(x => x.id === id);
  if (!item) return;
  const lvl = state.meta.upgrades[id];
  if (lvl >= item.max) return;
  const cost = item.costs[lvl];
  if (state.meta.souls < cost) return;
  state.meta.souls -= cost;
  state.meta.upgrades[id] += 1;
  saveMeta();
  renderMenu();
}

function resetMeta() {
  if (!confirm('Сбросить весь прогресс (души и прокачку)?')) return;
  state.meta.souls = 0;
  state.meta.upgrades = { maxHp: 0, atk: 0, def: 0, potions: 0, gold: 0 };
  saveMeta();
  renderMenu();
}

function backToMenu() {
  openMenu();
}

const MUTE_KEY = 'rpg-muted-v1';
const BGM_FADE_SEC = 5;
let bgmStarted = false;
let bgmMuted = false;

function initBgm() {
  const audio = document.getElementById('bgm');
  if (!audio) return;
  try { bgmMuted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) {}
  updateMuteButton();
  audio.volume = 0;
  audio.addEventListener('timeupdate', () => {
    if (bgmMuted) { audio.volume = 0; return; }
    const t = audio.currentTime;
    const d = audio.duration;
    if (!d || !isFinite(d)) return;
    if (t < BGM_FADE_SEC) {
      audio.volume = Math.max(0, Math.min(1, t / BGM_FADE_SEC));
    } else if (t > d - BGM_FADE_SEC) {
      audio.volume = Math.max(0, Math.min(1, (d - t) / BGM_FADE_SEC));
    } else {
      audio.volume = 1;
    }
  });

  const startOnce = () => {
    if (bgmStarted || bgmMuted) return;
    audio.play().then(() => { bgmStarted = true; }).catch(() => {});
  };
  document.addEventListener('pointerdown', startOnce, { once: true });
  document.addEventListener('keydown', startOnce, { once: true });
  document.addEventListener('touchstart', startOnce, { once: true, passive: true });
}

function updateMuteButton() {
  const btn = document.getElementById('btn-music');
  if (btn) btn.textContent = bgmMuted ? '🔇' : '🔊';
}

function toggleMute() {
  const audio = document.getElementById('bgm');
  bgmMuted = !bgmMuted;
  try { localStorage.setItem(MUTE_KEY, bgmMuted ? '1' : '0'); } catch (e) {}
  updateMuteButton();
  if (bgmMuted) {
    if (audio) audio.pause();
  } else if (audio) {
    audio.play().then(() => { bgmStarted = true; }).catch(() => {});
  }
}

function syncAppHeight() {
  let h;
  if (IS_TG && (tg.viewportStableHeight || tg.viewportHeight)) {
    h = tg.viewportStableHeight || tg.viewportHeight;
  } else {
    h = window.innerHeight;
  }
  document.documentElement.style.setProperty('--app-h', h + 'px');
}

function start() {
  bindInput();
  if (IS_TG) {
    try {
      tg.ready();
      tg.expand();
      if (tg.setHeaderColor) tg.setHeaderColor('#1a1a2e');
      if (tg.setBackgroundColor) tg.setBackgroundColor('#1a1a2e');
      tg.disableVerticalSwipes && tg.disableVerticalSwipes();
      tg.onEvent && tg.onEvent('viewportChanged', syncAppHeight);
    } catch (e) {}
  }
  window.addEventListener('resize', syncAppHeight);
  syncAppHeight();
  initBgm();
  loadMeta(openMenu);
}

start();
