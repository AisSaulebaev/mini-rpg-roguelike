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

const STATUS_DEFS = {
  bleed: { name: 'Кровотечение', icon: '🩸', duration: 3, dmg: 2 },
  burn:  { name: 'Поджог',       icon: '🔥', duration: 3, dmg: 3 },
  stun:  { name: 'Оглушение',    icon: '💫', duration: 1 },
};
const STATUS_KEYS = Object.keys(STATUS_DEFS);

const POTION_TYPES = {
  heal: { name: 'Зелье лечения',  icon: '🧪', image: 'img/ui/potion_heal.png', price: 15, short: '+10 HP' },
  rage: { name: 'Зелье ярости',   icon: '🔥', image: 'img/ui/potion_rage.png', price: 25, short: '+3 ATK на 4 хода', duration: 4, atk: 3 },
  iron: { name: 'Железная кожа',  icon: '🛡️', image: 'img/ui/potion_iron.png', price: 25, short: '+3 DEF на 4 хода', duration: 4, def: 3 },
};

const SHOP_ITEM_PRICE = { common: 30, rare: 70, epic: 150 };

const STORAGE_KEY = 'rpg-meta-v1';

const API_BASE = 'https://mini-rpg-api.aisultansaulebaev.workers.dev';
const STARS_PACKS = [
  { id: 'test_epic',   stars: 5,   title: '[TEST] Эпик-оружие', desc: 'Случайный эпический меч' },
  { id: 'heal_hp',     stars: 5,   title: 'Глоток жизни',       desc: 'Восстановить 50% HP' },
  { id: 'gold_small',  stars: 10,  title: 'Мешочек золота',     desc: '+100 золота' },
  { id: 'gold_medium', stars: 40,  title: 'Сумка золота',       desc: '+500 золота' },
  { id: 'gold_large',  stars: 100, title: 'Сундук золота',      desc: '+1500 золота' },
];
const STARS_GROUP = { top: ['test_epic', 'heal_hp'], bottom: ['gold_small', 'gold_medium', 'gold_large'] };

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
  { id: 'maxHp',        name: 'Стойкость', icon: '❤️', image: 'img/ui/hp.png',             desc: '+2 HP',                  max: 5,  costs: [10, 20, 35, 55, 80] },
  { id: 'atk',          name: 'Сила',      icon: '⚔️', image: 'img/ui/atk.png',            desc: '+1 ATK',                 max: 5,  costs: [15, 30, 50, 75, 110] },
  { id: 'def',          name: 'Броня',     icon: '🛡️', image: 'img/ui/def.png',            desc: '+1 DEF',                 max: 5,  costs: [15, 30, 50, 75, 110] },
  { id: 'potions',      name: 'Алхимия',   icon: '🧪', image: 'img/ui/potion_heal.png',    desc: '+1 зелье в начале',      max: 3,  costs: [25, 50, 80] },
  { id: 'gold',         name: 'Удача',     icon: '🪙', image: 'img/ui/coin.png',           desc: '+10 золота в начале',    max: 5,  costs: [8, 16, 28, 44, 64] },
  { id: 'hunter',       name: 'Охотник',   icon: '🎯', image: 'img/items/bow_shadow.png',  desc: '+5% дропа с монстра',    max: 5,  costs: [20, 40, 65, 95, 130] },
  { id: 'archaeologist',name: 'Археолог',  icon: '📦', image: 'img/items/crown.png',       desc: 'шанс лучшей редкости',   max: 3,  costs: [40, 80, 130] },
  { id: 'greed',        name: 'Жадность',  icon: '💰', image: 'img/items/talisman_thief.png', desc: '+10% золота с монстра', max: 5,  costs: [12, 24, 40, 60, 85] },
  { id: 'scholar',      name: 'Учёность',  icon: '📚', image: 'img/items/horn_wisdom.png', desc: '+10% XP с монстра',      max: 5,  costs: [12, 24, 40, 60, 85] },
  { id: 'merchant',     name: 'Купец',     icon: '🛒', image: 'img/characters/shop.png',   desc: '-2% цены у торговца',    max: 10, costs: [10, 18, 28, 40, 55, 75, 100, 130, 165, 200] },
];

const SLOT_LABEL = {
  weapon: 'Оружие', helmet: 'Шлем', chest: 'Нагрудник',
  boots: 'Сапоги', ring: 'Кольцо', amulet: 'Ожерелье',
};

const SLOT_ICON = {
  weapon: '⚔️', helmet: '👑', chest: '🧥',
  boots: '👢', ring: '💍', amulet: '📿',
};

const SLOT_IMAGE = {
  weapon: 'img/items/sword.png',
  helmet: 'img/items/helmet.png',
  chest:  'img/items/armor.png',
  boots:  'img/items/boots.png',
  ring:   'img/items/ring.png',
  amulet: 'img/items/amulet.png',
};

function itemIconHtml(item, slotKey) {
  const src = (item && item.image) || SLOT_IMAGE[slotKey];
  if (src) {
    const name = item ? item.name : '';
    return `<img class="item-img" src="${src}" alt="${name}">`;
  }
  return SLOT_ICON[slotKey] || '❔';
}

const ITEM_POOL = [
  { slot: 'weapon', rarity: 'common', name: 'Кинжал',       bonus: { atk: 2, crit: 10 },             set: 'thief',   image: 'img/items/dagger.png' },
  { slot: 'weapon', rarity: 'common', name: 'Меч',          bonus: { atk: 3 },                       set: 'warrior', image: 'img/items/sword.png' },
  { slot: 'weapon', rarity: 'rare',   name: 'Топор',        bonus: { atk: 5, bleedChance: 20 },      image: 'img/items/axe.png' },
  { slot: 'weapon', rarity: 'rare',   name: 'Копьё',        bonus: { atk: 4, def: 1, stunChance: 10 }, image: 'img/items/spear.png' },
  { slot: 'weapon', rarity: 'epic',   name: 'Двуручник',    bonus: { atk: 7, crit: 15, stunChance: 12 }, image: 'img/items/greatsword.png' },
  { slot: 'weapon', rarity: 'epic',   name: 'Лук теней',    bonus: { atk: 5, hp: 5, crit: 10, bleedChance: 15 }, set: 'mage', image: 'img/items/bow_shadow.png' },

  { slot: 'helmet', rarity: 'common', name: 'Капюшон',       bonus: { def: 1, dodge: 5 },            set: 'thief',   image: 'img/items/hood.png' },
  { slot: 'helmet', rarity: 'common', name: 'Шлем',          bonus: { def: 1, hp: 2 },               image: 'img/items/helmet.png' },
  { slot: 'helmet', rarity: 'rare',   name: 'Стальной шлем', bonus: { def: 2, hp: 3 },               set: 'warrior', image: 'img/items/helmet_steel.png' },
  { slot: 'helmet', rarity: 'epic',   name: 'Корона короля', bonus: { def: 3, atk: 2, crit: 5 },     image: 'img/items/crown.png' },

  { slot: 'chest', rarity: 'common', name: 'Кожанка',        bonus: { def: 1, dodge: 3 },            image: 'img/items/leather.png' },
  { slot: 'chest', rarity: 'common', name: 'Кольчуга',       bonus: { def: 2 },                      image: 'img/items/armor.png' },
  { slot: 'chest', rarity: 'rare',   name: 'Латы',           bonus: { def: 3, atk: -1 },             image: 'img/items/plate.png' },
  { slot: 'chest', rarity: 'rare',   name: 'Плащ мага',      bonus: { def: 2, hp: 5, burnChance: 15 }, set: 'mage', image: 'img/items/robe_mage.png' },
  { slot: 'chest', rarity: 'epic',   name: 'Драконья чешуя', bonus: { def: 5, burnChance: 10 },      image: 'img/items/dragon_scale.png' },

  { slot: 'boots', rarity: 'common', name: 'Кожаные сапоги',  bonus: { def: 1 },                      image: 'img/items/boots.png' },
  { slot: 'boots', rarity: 'common', name: 'Крепкие сапоги',  bonus: { hp: 3 },                       image: 'img/items/boots_sturdy.png' },
  { slot: 'boots', rarity: 'rare',   name: 'Железные сапоги', bonus: { def: 2, hp: 2 },               image: 'img/items/boots_iron.png' },
  { slot: 'boots', rarity: 'epic',   name: 'Крылатые сапоги', bonus: { def: 3, hp: 5, dodge: 10 },    image: 'img/items/boots_winged.png' },

  { slot: 'ring', rarity: 'common', name: 'Кольцо силы',     bonus: { atk: 1 },                      image: 'img/items/ring.png' },
  { slot: 'ring', rarity: 'common', name: 'Кольцо жизни',    bonus: { hp: 3 },                       image: 'img/items/ring_life.png' },
  { slot: 'ring', rarity: 'rare',   name: 'Кольцо защиты',   bonus: { def: 2, dodge: 5 },            image: 'img/items/ring_defense.png' },
  { slot: 'ring', rarity: 'rare',   name: 'Кольцо меткости', bonus: { atk: 2, crit: 10 },            image: 'img/items/ring_aim.png' },
  { slot: 'ring', rarity: 'epic',   name: 'Кольцо воина',    bonus: { atk: 2, def: 2, crit: 8, dodge: 5 }, set: 'warrior', image: 'img/items/ring_warrior.png' },

  { slot: 'amulet', rarity: 'common', name: 'Амулет жизни',   bonus: { hp: 5 },                      image: 'img/items/amulet.png' },
  { slot: 'amulet', rarity: 'common', name: 'Амулет стали',   bonus: { atk: 1 },                     image: 'img/items/amulet_steel.png' },
  { slot: 'amulet', rarity: 'rare',   name: 'Талисман вора',  bonus: { crit: 5 }, passive: 'goldBonus', set: 'thief', image: 'img/items/talisman_thief.png' },
  { slot: 'amulet', rarity: 'rare',   name: 'Рог мудрости',   bonus: { dodge: 5 }, passive: 'xpBonus', set: 'mage',  image: 'img/items/horn_wisdom.png' },
  { slot: 'amulet', rarity: 'epic',   name: 'Сердце феникса', bonus: {}, passive: 'phoenix',         image: 'img/items/phoenix_heart.png' },
];

const SETS = {
  thief: {
    name: 'Путь вора',
    icon: '🗡️',
    cssClass: 'set-thief',
    pieces: ['Кинжал', 'Капюшон', 'Талисман вора'],
    tiers: [
      { count: 2, bonus: { crit: 5, dodge: 5 },                 desc: '+5% ⚡ крит, +5% 💨 уклон' },
      { count: 3, bonus: { crit: 10, dodge: 15, goldMul: 0.25 }, desc: '+10% ⚡ крит, +15% 💨 уклон, +25% 🪙' },
    ],
  },
  warrior: {
    name: 'Путь воина',
    icon: '⚔️',
    cssClass: 'set-warrior',
    pieces: ['Меч', 'Стальной шлем', 'Кольцо воина'],
    tiers: [
      { count: 2, bonus: { atk: 2, def: 1 },           desc: '+2 ATK, +1 DEF' },
      { count: 3, bonus: { atk: 4, def: 2, hp: 10 },   desc: '+4 ATK, +2 DEF, +10 HP' },
    ],
  },
  mage: {
    name: 'Путь мага',
    icon: '🔮',
    cssClass: 'set-mage',
    pieces: ['Лук теней', 'Плащ мага', 'Рог мудрости'],
    tiers: [
      { count: 2, bonus: { burnChance: 10, atk: 1 },               desc: '+10% 🔥 поджог, +1 ATK' },
      { count: 3, bonus: { burnChance: 20, atk: 3, xpMul: 0.25 },  desc: '+20% 🔥 поджог, +3 ATK, +25% ⭐' },
    ],
  },
};

function countActiveSets() {
  const counts = {};
  for (const key of Object.keys(state.player.equipment)) {
    const it = state.player.equipment[key];
    if (it && it.set && SETS[it.set]) {
      counts[it.set] = (counts[it.set] || 0) + 1;
    }
  }
  return counts;
}

function activeSetTier(setKey, count) {
  const set = SETS[setKey];
  if (!set) return null;
  let best = null;
  for (const t of set.tiers) {
    if (count >= t.count) best = t;
  }
  return best;
}

function getSetStatBonuses() {
  const agg = { hp: 0, atk: 0, def: 0, crit: 0, dodge: 0, bleedChance: 0, burnChance: 0, stunChance: 0 };
  const counts = countActiveSets();
  for (const key of Object.keys(counts)) {
    const tier = activeSetTier(key, counts[key]);
    if (!tier) continue;
    const b = tier.bonus;
    for (const k of Object.keys(agg)) {
      if (b[k]) agg[k] += b[k];
    }
  }
  return agg;
}

function getSetGoldMul() {
  let mul = 0;
  const counts = countActiveSets();
  for (const key of Object.keys(counts)) {
    const tier = activeSetTier(key, counts[key]);
    if (tier && tier.bonus.goldMul) mul += tier.bonus.goldMul;
  }
  return mul;
}

function getSetXpMul() {
  let mul = 0;
  const counts = countActiveSets();
  for (const key of Object.keys(counts)) {
    const tier = activeSetTier(key, counts[key]);
    if (tier && tier.bonus.xpMul) mul += tier.bonus.xpMul;
  }
  return mul;
}

function pickRarity(depth) {
  const r = Math.random();
  if (depth <= 5)  return r < 0.70 ? 'common' : (r < 0.95 ? 'rare' : 'epic');
  if (depth <= 10) return r < 0.50 ? 'common' : (r < 0.90 ? 'rare' : 'epic');
  return            r < 0.30 ? 'common' : (r < 0.80 ? 'rare' : 'epic');
}

function rollItem(depth) {
  let rarity = pickRarity(depth);
  const arch = state.meta && state.meta.upgrades ? state.meta.upgrades.archaeologist : 0;
  if (arch > 0) {
    if (rarity === 'common' && Math.random() < arch * 0.15) rarity = 'rare';
    if (rarity === 'rare'   && Math.random() < arch * 0.10) rarity = 'epic';
  }
  const pool = ITEM_POOL.filter(x => x.rarity === rarity);
  const tpl = pool[randInt(pool.length)];
  return JSON.parse(JSON.stringify(tpl));
}

const MONSTER_TEMPLATES = {
  goblin:          { emoji: '👹', image: 'img/monsters/goblin.png',          name: 'Гоблин',              acc: 'гоблина',              hp: 8,   atk: 3,  def: 0, xp: 3,   goldMin: 2,   goldMax: 5,   minDepth: 1,  stunChance: 8 },
  zombie:          { emoji: '🧟', image: 'img/monsters/zombie.png',          name: 'Зомби',               acc: 'зомби',                hp: 15,  atk: 4,  def: 1, xp: 6,   goldMin: 4,   goldMax: 8,   minDepth: 3,  bleedChance: 20 },
  slime:           { emoji: '🟢', image: 'img/monsters/slime.png',           name: 'Слизень',             acc: 'слизня',               hp: 14,  atk: 3,  def: 1, xp: 7,   goldMin: 3,   goldMax: 7,   minDepth: 3,  splitInto: 'slime_small' },
  slime_small:     { emoji: '🟢', image: 'img/monsters/slime_small.png',     name: 'Слизнёнок',           acc: 'слизнёнка',            hp: 6,   atk: 2,  def: 0, xp: 3,   goldMin: 1,   goldMax: 3,   minDepth: 99, noSpawn: true },
  skeleton_archer: { emoji: '🏹', image: 'img/monsters/skeleton_archer.png', name: 'Скелет-лучник',       acc: 'скелета-лучника',      hp: 12,  atk: 5,  def: 1, xp: 9,   goldMin: 5,   goldMax: 10,  minDepth: 11, firstStrike: true, crit: 10 },
  ghost:           { emoji: '👻', image: 'img/monsters/ghost.png',           name: 'Призрак',             acc: 'призрака',             hp: 10,  atk: 6,  def: 2, xp: 10,  goldMin: 6,   goldMax: 12,  minDepth: 5,  dodge: 25,    floaty: true },
  mimic:           { emoji: '📦', image: 'img/monsters/mimic.png',           name: 'Мимик',               acc: 'мимика',               hp: 22,  atk: 6,  def: 2, xp: 18,  goldMin: 20,  goldMax: 35,  minDepth: 99, noSpawn: true, bleedChance: 20, stunChance: 15 },
  vampire:         { emoji: '🧛', image: 'img/monsters/vampire.png',         name: 'Вампир',              acc: 'вампира',              hp: 24,  atk: 7,  def: 2, xp: 20,  goldMin: 10,  goldMax: 20,  minDepth: 7,  crit: 15, lifeSteal: 0.5 },
  ice_elemental:   { emoji: '❄️', image: 'img/monsters/ice_elemental.png',   name: 'Ледяной элементаль',  acc: 'ледяного элементаля',  hp: 20,  atk: 6,  def: 3, xp: 18,  goldMin: 8,   goldMax: 16,  minDepth: 21, stunChance: 25, floaty: true },
  dragon:          { emoji: '🐉', image: 'img/monsters/dragon.png',          name: 'Дракон',              acc: 'дракона',              hp: 40,  atk: 8,  def: 3, xp: 30,  goldMin: 30,  goldMax: 50,  boss: true,   crit: 15, burnChance: 35, fireImmune: true },
  lich:            { emoji: '💀', image: 'img/monsters/lich.png',            name: 'Лич',                 acc: 'лича',                 hp: 80,  atk: 10, def: 4, xp: 80,  goldMin: 80,  goldMax: 140, boss: true,   crit: 15, bleedChance: 25, floaty: true, reviveEvery: 3 },
  dark_knight:     { emoji: '🛡️', image: 'img/monsters/dark_knight.png',     name: 'Тёмный рыцарь',       acc: 'тёмного рыцаря',       hp: 140, atk: 12, def: 5, xp: 140, goldMin: 140, goldMax: 220, boss: true,   crit: 10, bleedVuln: 2 },
};

const BOSS_BY_DEPTH = { 10: 'dragon', 20: 'lich', 30: 'dark_knight' };
function pickBossFor(depth) {
  return BOSS_BY_DEPTH[depth] || 'dark_knight';
}

const ELITE_AFFIXES = {
  raging:  { name: 'Бешеный',      prefixAcc: 'бешеного',      hpMul: 1.2, atkMul: 1.5, defMul: 1,   bleedChanceAdd: 0 },
  armored: { name: 'Бронированный', prefixAcc: 'бронированного', hpMul: 1.3, atkMul: 1,   defMul: 2,   bleedChanceAdd: 0 },
  cursed:  { name: 'Проклятый',    prefixAcc: 'проклятого',    hpMul: 1.4, atkMul: 1,   defMul: 1,   bleedChanceAdd: 30 },
};
const ELITE_AFFIX_KEYS = Object.keys(ELITE_AFFIXES);

function eliteSpawnChance(depth) {
  if (depth < 5) return 0;
  return Math.min(0.20, 0.08 + (depth - 5) * 0.01);
}

function pickEliteAffix() {
  return ELITE_AFFIX_KEYS[randInt(ELITE_AFFIX_KEYS.length)];
}

const state = {
  screen: 'game',
  depth: 1,
  gridSize: 4,
  grid: [],
  player: {
    x: 0, y: 0,
    facing: 'right',
    hp: 20, maxHp: 20,
    atk: 5, def: 1,
    level: 1, xp: 0, xpToNext: 10,
    gold: 0,
    potions: { heal: 0, rage: 0, iron: 0 },
    effects: { rage: 0, iron: 0 },
    statuses: { bleed: 0, burn: 0, stun: 0 },
    crit: 5, dodge: 3,
    bleedChance: 0, burnChance: 0, stunChance: 0,
    equipment: { weapon: null, helmet: null, chest: null, boots: null, ring: null, amulet: null },
  },
  merchantStock: [],
  monsters: [],
  deathFx: [],
  combat: null,
  runStats: { monstersKilled: 0, chestsOpened: 0, bossesKilled: 0, goldCollected: 0 },
  meta: {
    souls: 0,
    upgrades: { maxHp: 0, atk: 0, def: 0, potions: 0, gold: 0, hunter: 0, archaeologist: 0, greed: 0, scholar: 0, merchant: 0 },
    pendingStarsGold: 0,
    pendingEpics: 0,
    pendingStarsHeals: 0,
    pendingStarsItems: [],
  },
  log: [],
};

function applyMetaData(raw) {
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    if (typeof data.souls === 'number') state.meta.souls = data.souls;
    if (typeof data.pendingStarsGold === 'number') state.meta.pendingStarsGold = data.pendingStarsGold;
    if (typeof data.pendingEpics === 'number') state.meta.pendingEpics = data.pendingEpics;
    if (typeof data.pendingStarsHeals === 'number') state.meta.pendingStarsHeals = data.pendingStarsHeals;
    if (Array.isArray(data.pendingStarsItems)) state.meta.pendingStarsItems = data.pendingStarsItems.slice();
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
    pendingStarsGold: state.meta.pendingStarsGold || 0,
    pendingEpics: state.meta.pendingEpics || 0,
    pendingStarsHeals: state.meta.pendingStarsHeals || 0,
    pendingStarsItems: state.meta.pendingStarsItems || [],
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
    if (t.noSpawn) continue;
    if (t.minDepth > depth) continue;
    pool.push(key);
  }
  return pool[randInt(pool.length)];
}

function buildMonster(typeKey, mult, pos, affixKey) {
  const t = MONSTER_TEMPLATES[typeKey];
  const af = affixKey ? ELITE_AFFIXES[affixKey] : null;
  const hp = Math.ceil(t.hp * mult * (af ? af.hpMul : 1));
  return {
    id: ++monsterIdCounter,
    x: pos.x, y: pos.y,
    type: typeKey,
    emoji: t.emoji, image: t.image,
    name: af ? `${af.name} ${t.name.toLowerCase()}` : t.name,
    acc: af ? `${af.prefixAcc} ${t.acc}` : t.acc,
    hp, maxHp: hp,
    atk: Math.ceil(t.atk * mult * (af ? af.atkMul : 1)),
    def: Math.ceil(t.def * mult * (af ? af.defMul : 1)),
    xp: Math.ceil(t.xp * (af ? 1.5 : 1)),
    goldMin: af ? Math.ceil(t.goldMin * 1.5) : t.goldMin,
    goldMax: af ? Math.ceil(t.goldMax * 1.5) : t.goldMax,
    boss: !!t.boss,
    elite: !!af,
    affix: affixKey || null,
    floaty: !!t.floaty,
    crit: t.crit || 0,
    dodge: t.dodge || 0,
    bleedChance: (t.bleedChance || 0) + (af ? af.bleedChanceAdd : 0),
    burnChance: t.burnChance || 0,
    stunChance: t.stunChance || 0,
    fireImmune: !!t.fireImmune,
    firstStrike: !!t.firstStrike,
    splitInto: t.splitInto || null,
    lifeSteal: t.lifeSteal || 0,
    reviveEvery: t.reviveEvery || 0,
    reviveCounter: 0,
    bleedVuln: t.bleedVuln || 0,
    statuses: { bleed: 0, burn: 0, stun: 0 },
    spawnedAt: Date.now(),
  };
}

function spawnOne(typeKey, mult, affixKey) {
  const cell = randomFreeCell();
  if (!cell) return null;
  const m = buildMonster(typeKey, mult, cell, affixKey);
  state.monsters.push(m);
  return m;
}

function rollEliteAffix(depth) {
  if (Math.random() < eliteSpawnChance(depth)) return pickEliteAffix();
  return null;
}

function spawnMonsters() {
  const cfg = FLOOR_CONFIG(state.depth);
  const mult = 1 + (state.depth - 1) * 0.1;
  const isBossFloor = state.depth % 10 === 0;

  if (isBossFloor) {
    const bossKey = pickBossFor(state.depth);
    spawnOne(bossKey, mult);
    if (Math.random() < 0.5) spawnOne(pickMonsterType(state.depth), mult, rollEliteAffix(state.depth));
    pushLog(`⚠️ Босс! ${MONSTER_TEMPLATES[bossKey].name} ждёт тебя.`);
    return;
  }

  const count = randRange(cfg.monstersMin, cfg.monstersMax);
  let eliteSpawned = 0;
  for (let i = 0; i < count; i++) {
    let affix = null;
    if (eliteSpawned < 1) {
      affix = rollEliteAffix(state.depth);
      if (affix) eliteSpawned += 1;
    }
    const m = spawnOne(pickMonsterType(state.depth), mult, affix);
    if (m && m.elite) pushLog(`⚡ ${m.name} появился на этаже.`);
  }
}

function isMerchantFloor(depth) {
  const mod = depth % 10;
  return mod === 5 || mod === 9;
}

function applyTheme(depth) {
  const idx = Math.min(4, Math.ceil(depth / 10));
  document.body.classList.remove('theme-1', 'theme-2', 'theme-3', 'theme-4');
  document.body.classList.add('theme-' + idx);
}

function initFloor() {
  const cfg = FLOOR_CONFIG(state.depth);
  state.gridSize = cfg.size;
  state.grid = makeEmptyGrid(cfg.size);
  applyTheme(state.depth);
  state.monsters = [];
  state.floorGraveyard = [];
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
      const isMimic = state.depth >= 11 && Math.random() < 0.2;
      state.grid[cell.y][cell.x] = isMimic ? { type: 'chest', mimic: true } : { type: 'chest' };
    }
  }
}

function descend() {
  state.depth += 1;
  initFloor();
}

function tryMovePlayer(dx, dy) {
  if (state.screen !== 'game') return;
  if (dx !== 0) state.player.facing = dx < 0 ? 'left' : 'right';
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

  if (state.grid[ny][nx].type === 'chest' && state.grid[ny][nx].mimic) {
    state.grid[ny][nx] = { type: 'empty' };
    const mult = 1 + (state.depth - 1) * 0.1;
    const mimic = buildMonster('mimic', mult, { x: nx, y: ny });
    state.monsters.push(mimic);
    pushLog('⚠️ Сундук оказался мимиком!');
    haptic('warning');
    openCombat(mimic);
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
    const chestGoldMul = getSetGoldMul();
    if (chestGoldMul > 0) gold = Math.floor(gold * (1 + chestGoldMul));
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
  document.getElementById('compare-cur-icon').innerHTML = itemIconHtml(current, candidate.slot);
  document.getElementById('compare-new-name').textContent = candidate.name;
  document.getElementById('compare-new-stats').innerHTML = statsLine(candidate);
  document.getElementById('compare-new-icon').innerHTML = itemIconHtml(candidate, candidate.slot);
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

function pickTestEpicOffer() {
  const weapons = ITEM_POOL.filter(x => x.rarity === 'epic' && x.slot === 'weapon');
  if (!weapons.length) return null;
  return weapons[Math.floor(Math.random() * weapons.length)];
}

function openShop() {
  state.prevScreen = state.screen;
  state.screen = 'shop';
  if (!state.testEpicOffer) state.testEpicOffer = pickTestEpicOffer();
  renderShop();
  document.getElementById('shop-modal').classList.remove('hidden');
}

function closeShop() {
  state.screen = state.prevScreen === 'shop' ? 'game' : (state.prevScreen || 'game');
  document.getElementById('shop-modal').classList.add('hidden');
  render();
}

function getShopPrice(basePrice) {
  const lvl = state.meta.upgrades.merchant || 0;
  if (!lvl) return basePrice;
  return Math.max(1, Math.ceil(basePrice * (1 - lvl * 0.02)));
}

function renderShop() {
  document.getElementById('shop-player-gold').textContent = state.player.gold;
  const listEl = document.getElementById('shop-list');
  listEl.innerHTML = '';
  renderStarsPacks(listEl, 'top');
  state.merchantStock.forEach((entry, idx) => {
    if (entry.sold) return;
    const price = getShopPrice(entry.price);
    const row = document.createElement('div');
    row.className = 'shop-row';
    row.dataset.idx = idx;
    if (entry.kind === 'item') {
      const it = entry.item;
      const rarityCls = it.rarity !== 'common' ? ' rarity-' + it.rarity : '';
      row.className += rarityCls;
      row.innerHTML = `
        <div class="shop-icon">${itemIconHtml(it, it.slot)}</div>
        <div class="shop-info">
          <div class="shop-name">${it.name} <span class="shop-lvl">${it.rarity}</span></div>
          <div class="shop-desc">${statsLine(it).replace(/<br>/g, ' · ')}</div>
        </div>
        <button class="shop-buy" data-idx="${idx}">${price} 🪙</button>
      `;
    } else {
      const t = POTION_TYPES[entry.potion];
      const count = state.player.potions[entry.potion];
      const full = count >= MAX_POTIONS;
      const tIcon = t.image ? `<img class="item-img" src="${t.image}" alt="">` : t.icon;
      row.innerHTML = `
        <div class="shop-icon">${tIcon}</div>
        <div class="shop-info">
          <div class="shop-name">${t.name} <span class="shop-lvl">${count}/${MAX_POTIONS}</span></div>
          <div class="shop-desc">${t.short}</div>
        </div>
        <button class="shop-buy" data-idx="${idx}" ${full ? 'disabled' : ''}>${full ? 'MAX' : price + ' 🪙'}</button>
      `;
    }
    listEl.appendChild(row);
  });
  listEl.querySelectorAll('.shop-buy:not(.stars-buy)').forEach(btn => {
    const idx = Number(btn.dataset.idx);
    const entry = state.merchantStock[idx];
    const price = getShopPrice(entry.price);
    const cantAfford = state.player.gold < price;
    if (cantAfford && !btn.disabled) {
      btn.classList.add('disabled');
      btn.disabled = true;
    }
    bindShopBuy(btn, idx);
  });
  listEl.querySelectorAll('.shop-row:not(.stars-row)').forEach(row => bindShopRowTooltip(row));
  if (!state.merchantStock.some(e => !e.sold)) {
    const empty = document.createElement('div');
    empty.className = 'shop-empty';
    empty.textContent = 'Товары закончились.';
    listEl.appendChild(empty);
  }
  renderStarsPacks(listEl, 'bottom');
}

function renderStarsPacks(listEl, group) {
  if (!IS_TG) return;
  const ids = STARS_GROUP[group] || [];
  const packs = ids
    .map(id => STARS_PACKS.find(p => p.id === id))
    .filter(Boolean)
    .filter(pack => {
      if (pack.id === 'heal_hp') return state.player && state.player.hp < state.player.maxHp * 0.3;
      if (pack.id === 'test_epic') return !!state.testEpicOffer;
      return true;
    });
  if (!packs.length) return;
  const header = document.createElement('div');
  header.className = 'shop-section-title';
  header.textContent = group === 'top' ? '⭐ Особые предложения' : '⭐ Пополнить золото';
  listEl.appendChild(header);
  for (const pack of packs) {
    const row = document.createElement('div');
    row.className = 'shop-row stars-row';
    let iconHtml, nameHtml, descHtml;
    if (pack.id === 'test_epic') {
      const offer = state.testEpicOffer;
      if (!offer) continue;
      iconHtml = itemIconHtml(offer, offer.slot);
      nameHtml = `${offer.name} <span class="shop-lvl">epic</span>`;
      descHtml = statsLine(offer).replace(/<br>/g, ' · ');
      row.dataset.slot = offer.slot;
    } else if (pack.id === 'heal_hp') {
      iconHtml = `<img class="item-img" src="img/ui/potion_heal.png" alt="">`;
      nameHtml = pack.title;
      descHtml = pack.desc;
    } else {
      iconHtml = `<img class="item-img" src="img/ui/coin.png" alt="">`;
      nameHtml = pack.title;
      descHtml = pack.desc;
    }
    row.dataset.pack = pack.id;
    row.innerHTML = `
      <div class="shop-icon">${iconHtml}</div>
      <div class="shop-info">
        <div class="shop-name">${nameHtml}</div>
        <div class="shop-desc">${descHtml}</div>
      </div>
      <button class="shop-buy stars-buy" data-pack="${pack.id}">${pack.stars} ⭐</button>
    `;
    listEl.appendChild(row);
    bindStarsRowTooltip(row);
    bindStarsBuy(row.querySelector('.stars-buy'));
  }
}

function bindStarsRowTooltip(row) {
  const slot = row.dataset.slot;
  if (!slot) return;
  let active = false, timer = null;
  const cancel = () => { clearTimeout(timer); timer = null; active = false; };
  row.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (e.target.closest('.shop-buy')) return;
    active = true;
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!active) return;
      showShopTooltip(row, buildEquippedTooltip(slot));
    }, SHOP_LONG_PRESS_MS);
  });
  row.addEventListener('pointerup', cancel);
  row.addEventListener('pointerleave', cancel);
  row.addEventListener('pointercancel', cancel);
  row.addEventListener('contextmenu', (e) => e.preventDefault());
}

function bindStarsBuy(btn) {
  const packId = btn.dataset.pack;
  let active = false, longPressed = false, timer = null;
  const cancel = () => { clearTimeout(timer); timer = null; active = false; };
  btn.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (btn.disabled) return;
    active = true;
    longPressed = false;
    if (packId === 'test_epic' && state.testEpicOffer) {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!active) return;
        longPressed = true;
        showShopTooltip(btn, buildEquippedTooltip(state.testEpicOffer.slot));
      }, SHOP_LONG_PRESS_MS);
    }
  });
  btn.addEventListener('pointerup', () => {
    const wasActive = active;
    const wasLong = longPressed;
    cancel();
    if (!wasActive || wasLong) return;
    if (btn.disabled) return;
    requestStarsBuy(packId);
  });
  btn.addEventListener('pointerleave', cancel);
  btn.addEventListener('pointercancel', cancel);
}

function requestStarsBuy(packId) {
  if (packId === 'test_epic') {
    const offer = state.testEpicOffer;
    if (!offer) return;
    openStarsBuyConfirm(packId, offer);
  } else {
    const pack = STARS_PACKS.find(p => p.id === packId);
    if (!pack) return;
    openStarsBuyConfirm(packId, null, pack);
  }
}

function openStarsBuyConfirm(packId, item, pack) {
  state.pendingStarsBuy = { packId, item: item || null };
  state.pendingBuyIdx = null;
  const iconEl = document.getElementById('buy-confirm-icon');
  const nameEl = document.getElementById('buy-confirm-name');
  const statsEl = document.getElementById('buy-confirm-stats');
  const eqEl = document.getElementById('buy-confirm-equipped');
  const priceEl = document.getElementById('buy-confirm-price');
  const priceRow = priceEl.parentElement;
  if (item) {
    iconEl.innerHTML = itemIconHtml(item, item.slot);
    nameEl.textContent = `${item.name} [${item.rarity}]`;
    statsEl.innerHTML = statsLine(item);
    const eq = state.player.equipment[item.slot];
    if (eq) {
      eqEl.innerHTML = `<span class="label">Сейчас в слоте «${SLOT_LABEL[item.slot]}»:</span>${eq.name} — ${statsLine(eq).replace(/<br>/g, ' · ')}`;
    } else {
      eqEl.innerHTML = `<span class="label">Слот «${SLOT_LABEL[item.slot]}»:</span>пусто`;
    }
  } else {
    iconEl.innerHTML = `<img class="item-img" src="img/ui/coin.png" alt="">`;
    nameEl.textContent = pack.title;
    statsEl.textContent = pack.desc;
    eqEl.innerHTML = '';
  }
  const packDef = STARS_PACKS.find(p => p.id === packId);
  priceRow.innerHTML = `<b id="buy-confirm-price">${packDef.stars}</b> ⭐`;
  document.getElementById('buy-confirm-modal').classList.remove('hidden');
}

async function buyStarsPack(packId, btn) {
  if (!IS_TG || !tg.initData) { pushLog('Звёзды доступны только в Telegram.'); return; }
  if (!tg.openInvoice) { pushLog('Твоя версия Telegram не поддерживает оплату.'); return; }
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  try {
    const res = await fetch(`${API_BASE}/invoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: tg.initData, pack: packId }),
    });
    const data = await res.json();
    if (!data.link) { pushLog('Ошибка: не удалось создать счёт.'); return; }
    tg.openInvoice(data.link, async (status) => {
      if (status === 'paid') {
        haptic('success');
        if (packId === 'test_epic') state.testEpicOffer = null;
        await claimWithRetry(6);
      } else if (status === 'failed') {
        haptic('error');
        pushLog('Оплата не прошла.');
        rollbackStarsQueue(packId);
      } else if (status === 'cancelled') {
        pushLog('Оплата отменена.');
        rollbackStarsQueue(packId);
      }
    });
  } catch (e) {
    pushLog('Ошибка сети при создании счёта.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = ''; renderShop(); }
  }
}

async function claimPendingGold(announce) {
  if (!IS_TG || !tg.initData) return 0;
  try {
    const res = await fetch(`${API_BASE}/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: tg.initData }),
    });
    const data = await res.json();
    const gold = parseInt(data.gold || 0, 10);
    const epics = parseInt(data.epics || 0, 10);
    const heals = parseInt(data.heals || 0, 10);
    const inRun = state.screen === 'game' || state.screen === 'shop' || state.screen === 'combat' || state.screen === 'compare';
    if (gold > 0) {
      if (inRun) state.player.gold = (state.player.gold || 0) + gold;
      else state.meta.pendingStarsGold = (state.meta.pendingStarsGold || 0) + gold;
      saveMeta();
      if (announce) pushLog(`⭐ Получено ${gold} золота.`);
    }
    if (heals > 0) {
      if (inRun) {
        const amount = Math.ceil(state.player.maxHp * 0.5 * heals);
        const healed = Math.min(amount, state.player.maxHp - state.player.hp);
        state.player.hp = Math.min(state.player.maxHp, state.player.hp + amount);
        if (announce) pushLog(`⭐ +${healed} HP.`);
      } else {
        state.meta.pendingStarsHeals = (state.meta.pendingStarsHeals || 0) + heals;
        saveMeta();
      }
    }
    if (epics > 0) {
      if (inRun) {
        for (let i = 0; i < epics; i++) grantRandomEpic(announce);
      } else {
        state.meta.pendingEpics = (state.meta.pendingEpics || 0) + epics;
        saveMeta();
      }
    }
    renderHUD();
    if (state.screen === 'shop') renderShop();
    return gold + epics + heals;
  } catch (e) {
    return 0;
  }
}

async function claimWithRetry(attempts) {
  for (let i = 0; i < attempts; i++) {
    const got = await claimPendingGold(true);
    if (got > 0) return true;
    await new Promise(r => setTimeout(r, 1000 + i * 500));
  }
  pushLog('⚠️ Оплата прошла, но предмет не дошёл. Перезапусти мини-аппу.');
  return false;
}

function rollbackStarsQueue(packId) {
  if (packId !== 'test_epic') return;
  const q = state.meta.pendingStarsItems || [];
  if (q.length) { q.pop(); state.meta.pendingStarsItems = q; saveMeta(); }
}

function grantRandomEpic(announce) {
  const queue = state.meta.pendingStarsItems || [];
  let tpl;
  if (queue.length) {
    const name = queue.shift();
    state.meta.pendingStarsItems = queue;
    saveMeta();
    tpl = ITEM_POOL.find(x => x.name === name && x.rarity === 'epic');
  }
  if (!tpl) {
    const epics = ITEM_POOL.filter(x => x.rarity === 'epic');
    if (!epics.length) return;
    tpl = epics[Math.floor(Math.random() * epics.length)];
  }
  const item = JSON.parse(JSON.stringify(tpl));
  if (announce) pushLog(`⭐ Получен: ${item.name} [epic].`);
  const shopEl = document.getElementById('shop-modal');
  const shopWasOpen = !shopEl.classList.contains('hidden');
  if (shopWasOpen) shopEl.classList.add('hidden');
  tryEquip(item);
  if (shopWasOpen && state.screen !== 'compare') {
    shopEl.classList.remove('hidden');
    renderShop();
  }
}

const SHOP_LONG_PRESS_MS = 350;

function showShopTooltip(anchor, html) {
  let tip = document.getElementById('shop-tooltip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'shop-tooltip';
    tip.className = 'shop-tooltip';
    document.body.appendChild(tip);
  }
  tip.innerHTML = html;
  tip.classList.add('show');
  const tipRect = tip.getBoundingClientRect();
  const aRect = anchor.getBoundingClientRect();
  let left = aRect.left + aRect.width / 2 - tipRect.width / 2;
  left = Math.max(6, Math.min(left, window.innerWidth - tipRect.width - 6));
  let top = aRect.top - tipRect.height - 8;
  if (top < 6) top = aRect.bottom + 8;
  tip.style.left = left + 'px';
  tip.style.top = top + 'px';
  clearTimeout(tip._hideTimer);
  tip._hideTimer = setTimeout(() => tip.classList.remove('show'), 2200);
}

function hideShopTooltip() {
  const tip = document.getElementById('shop-tooltip');
  if (tip) tip.classList.remove('show');
}

function buildItemTooltip(item, slot) {
  const slotName = SLOT_LABEL[slot] || slot;
  if (!item) {
    return `<div class="tt-title">${slotName}</div><div class="tt-empty">Пусто</div>`;
  }
  const rarity = item.rarity ? ` [${item.rarity}]` : '';
  return `<div class="tt-title">${slotName}</div><div class="tt-name">${item.name}${rarity}</div><div class="tt-stats">${statsLine(item)}</div>`;
}

function bindInvSlotTooltip(slotEl) {
  const slot = slotEl.dataset.slot;
  let active = false;
  let timer = null;
  const cancel = () => {
    clearTimeout(timer);
    timer = null;
    active = false;
  };
  slotEl.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    active = true;
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!active) return;
      const item = state.player.equipment[slot];
      showShopTooltip(slotEl, buildItemTooltip(item, slot));
    }, SHOP_LONG_PRESS_MS);
  });
  slotEl.addEventListener('pointerup', cancel);
  slotEl.addEventListener('pointerleave', cancel);
  slotEl.addEventListener('pointercancel', cancel);
  slotEl.addEventListener('contextmenu', (e) => e.preventDefault());
}

function buildEquippedTooltip(slot) {
  const eq = state.player.equipment[slot];
  const slotName = SLOT_LABEL[slot] || slot;
  if (!eq) {
    return `<div class="tt-title">Слот: ${slotName}</div><div class="tt-empty">Ничего не надето</div>`;
  }
  return `<div class="tt-title">Сейчас: ${slotName}</div><div class="tt-name">${eq.name}</div><div class="tt-stats">${statsLine(eq).replace(/<br>/g, ' · ')}</div>`;
}

function bindShopRowTooltip(row) {
  const idx = Number(row.dataset.idx);
  const entry = state.merchantStock[idx];
  if (!entry || entry.kind !== 'item') return;
  const slot = entry.item.slot;
  let active = false;
  let timer = null;
  const cancel = () => {
    clearTimeout(timer);
    timer = null;
    active = false;
  };
  row.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (e.target.closest('.shop-buy')) return;
    active = true;
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!active) return;
      showShopTooltip(row, buildEquippedTooltip(slot));
    }, SHOP_LONG_PRESS_MS);
  });
  row.addEventListener('pointerup', cancel);
  row.addEventListener('pointerleave', cancel);
  row.addEventListener('pointercancel', cancel);
  row.addEventListener('contextmenu', (e) => e.preventDefault());
}

function bindShopBuy(btn, idx) {
  let active = false;
  let longPressed = false;
  let timer = null;
  const cancel = () => {
    clearTimeout(timer);
    timer = null;
    active = false;
  };
  btn.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (btn.disabled) return;
    active = true;
    longPressed = false;
    const entry = state.merchantStock[idx];
    if (entry && entry.kind === 'item') {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!active) return;
        longPressed = true;
        showShopTooltip(btn, buildEquippedTooltip(entry.item.slot));
      }, SHOP_LONG_PRESS_MS);
    }
  });
  btn.addEventListener('pointerup', () => {
    const wasActive = active;
    const wasLong = longPressed;
    cancel();
    if (!wasActive || wasLong) return;
    if (btn.disabled) return;
    requestBuy(idx);
  });
  btn.addEventListener('pointerleave', cancel);
  btn.addEventListener('pointercancel', cancel);
}

function requestBuy(idx) {
  const entry = state.merchantStock[idx];
  if (!entry || entry.sold) return;
  const price = getShopPrice(entry.price);
  if (state.player.gold < price) { pushLog('Не хватает золота.'); return; }
  if (entry.kind === 'potion') {
    const count = state.player.potions[entry.potion];
    if (count >= MAX_POTIONS) { pushLog('Зелий максимум.'); return; }
    buyShopItem(idx);
    return;
  }
  openBuyConfirm(idx);
}

function openBuyConfirm(idx) {
  const entry = state.merchantStock[idx];
  if (!entry || entry.kind !== 'item') return;
  const it = entry.item;
  const price = getShopPrice(entry.price);
  state.pendingBuyIdx = idx;
  document.getElementById('buy-confirm-icon').innerHTML = itemIconHtml(it, it.slot);
  document.getElementById('buy-confirm-name').textContent = `${it.name} [${it.rarity}]`;
  document.getElementById('buy-confirm-stats').innerHTML = statsLine(it);
  const priceRow = document.querySelector('.buy-confirm-price');
  priceRow.innerHTML = `<img class="stat-icon" src="img/ui/coin.png" alt=""> <b id="buy-confirm-price">${price}</b>`;
  const eq = state.player.equipment[it.slot];
  const eqEl = document.getElementById('buy-confirm-equipped');
  if (eq) {
    eqEl.innerHTML = `<span class="label">Сейчас в слоте «${SLOT_LABEL[it.slot]}»:</span>${eq.name} — ${statsLine(eq).replace(/<br>/g, ' · ')}`;
  } else {
    eqEl.innerHTML = `<span class="label">Слот «${SLOT_LABEL[it.slot]}»:</span>пусто`;
  }
  document.getElementById('buy-confirm-modal').classList.remove('hidden');
}

function closeBuyConfirm(confirm) {
  document.getElementById('buy-confirm-modal').classList.add('hidden');
  const idx = state.pendingBuyIdx;
  const starsBuy = state.pendingStarsBuy;
  state.pendingBuyIdx = null;
  state.pendingStarsBuy = null;
  if (confirm && starsBuy) {
    if (starsBuy.item) {
      state.meta.pendingStarsItems = state.meta.pendingStarsItems || [];
      state.meta.pendingStarsItems.push(starsBuy.item.name);
      saveMeta();
    }
    buyStarsPack(starsBuy.packId);
    return;
  }
  if (confirm && idx != null) buyShopItem(idx);
}

function buyShopItem(idx) {
  const entry = state.merchantStock[idx];
  if (!entry || entry.sold) return;
  const price = getShopPrice(entry.price);
  if (state.player.gold < price) { pushLog('Не хватает золота.'); return; }

  if (entry.kind === 'potion') {
    const count = state.player.potions[entry.potion];
    if (count >= MAX_POTIONS) { pushLog('Зелий максимум.'); return; }
    state.player.gold -= price;
    state.player.potions[entry.potion] += 1;
    pushLog(`Куплено: ${POTION_TYPES[entry.potion].name}.`);
    renderShop();
    renderHUD();
    return;
  }

  state.player.gold -= price;
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
  if (b.crit)         parts.push(`+${b.crit}% ⚡ крит`);
  if (b.dodge)        parts.push(`+${b.dodge}% 💨 уклон`);
  if (b.bleedChance)  parts.push(`+${b.bleedChance}% 🩸 кровотеч.`);
  if (b.burnChance)   parts.push(`+${b.burnChance}% 🔥 поджог`);
  if (b.stunChance)   parts.push(`+${b.stunChance}% 💫 оглушение`);
  if (item.passive === 'goldBonus') parts.push('+50% 🪙');
  if (item.passive === 'xpBonus')   parts.push('+25% ⭐');
  if (item.passive === 'phoenix')   parts.push('🔥 Воскрешение');
  if (item.set && SETS[item.set]) {
    const s = SETS[item.set];
    parts.push(`<span class="set-marker ${s.cssClass}">${s.icon} ${s.name}</span>`);
  }
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
  if (tickDoT()) return;
  const snapshot = state.monsters.slice();
  for (const m of snapshot) {
    if (!state.monsters.includes(m)) continue;
    if (skipMonsterId !== null && m.id === skipMonsterId) continue;
    if (isAdjacent(m, state.player)) {
      if (tryConsumeStun(m)) {
        pushLog(`💫 ${m.name} оглушён.`);
        continue;
      }
      lungeFrom(m.x, m.y, state.player.x);
      if (rollPct(state.player.dodge)) {
        pushLog(`Ты уклонился от ${m.acc}!`);
      } else {
        let dmg = Math.max(m.atk - state.player.def, 1);
        const crit = rollPct(m.crit);
        if (crit) dmg = dmg * 2;
        state.player.hp -= dmg;
        pushLog(crit ? `⚡ КРИТ! ${m.name} -${dmg}.` : `${m.name} ударил тебя на ${dmg}.`);
        queueHit(state.player.x, state.player.y, dmg);
        setTimeout(() => spriteFxAt(state.player.x, state.player.y, 'sprite-hit', HIT_FX_MS), 110);
        applyLifeSteal(m, dmg);
        rollInflict(m, state.player, 'Ты');
        if (checkDeath()) return;
      }
    } else {
      moveMonsterToward(m);
    }
  }

  tickRevives();

  if (state.combat) {
    const m = state.monsters.find(x => x.id === state.combat.monsterId);
    if (!m || !isAdjacent(m, state.player)) closeCombat();
    else updateCombatUI();
  }
}

function applyLifeSteal(m, dmg) {
  if (!m.lifeSteal || dmg <= 0) return;
  if (m.hp >= m.maxHp) return;
  const heal = Math.max(1, Math.floor(dmg * m.lifeSteal));
  const before = m.hp;
  m.hp = Math.min(m.maxHp, m.hp + heal);
  const gained = m.hp - before;
  if (gained > 0) pushLog(`🩸 ${m.name} восстановил ${gained} HP.`);
}

function tickRevives() {
  if (!state.floorGraveyard) state.floorGraveyard = [];
  for (const m of state.monsters) {
    if (!m.reviveEvery || m.hp <= 0) continue;
    m.reviveCounter = (m.reviveCounter || 0) + 1;
    if (m.reviveCounter < m.reviveEvery) continue;
    if (!state.floorGraveyard.length) { m.reviveCounter = 0; continue; }
    m.reviveCounter = 0;
    const type = state.floorGraveyard.shift();
    const cell = randomFreeCell();
    if (!cell) continue;
    const mult = 1 + (state.depth - 1) * 0.1;
    const rev = buildMonster(type, mult, cell);
    rev.hp = Math.max(1, Math.floor(rev.maxHp * 0.5));
    state.monsters.push(rev);
    pushLog(`💀 ${m.name} воскресил ${MONSTER_TEMPLATES[type].acc}!`);
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
  document.getElementById('combat-panel').classList.remove('hidden');
  if (monster.firstStrike && !monster._usedFirstStrike) {
    monster._usedFirstStrike = true;
    state.combat.pending = true;
    pushLog(`🏹 ${monster.name} стреляет первым!`);
    updateCombatUI();
    setTimeout(() => enemyStrike(monster, 'normal'), COMBAT_PAUSE_MS);
    return;
  }
  updateCombatUI();
}

function closeCombat() {
  state.screen = 'game';
  state.combat = null;
  document.getElementById('combat-panel').classList.add('hidden');
}

function statusBadgesHtml(statuses) {
  if (!statuses) return '';
  const out = [];
  for (const key of STATUS_KEYS) {
    const turns = statuses[key] || 0;
    if (turns <= 0) continue;
    const def = STATUS_DEFS[key];
    out.push(`<span class="status-badge ${key}">${def.icon} <b>${turns}</b></span>`);
  }
  return out.join('');
}

function updateCombatUI() {
  if (!state.combat) return;
  const m = state.monsters.find(x => x.id === state.combat.monsterId);
  if (!m) return;
  const emojiEl = document.getElementById('combat-emoji');
  if (m.image) {
    emojiEl.innerHTML = `<img class="combat-img" src="${m.image}" alt="">`;
  } else {
    emojiEl.textContent = m.emoji;
  }
  document.getElementById('combat-name').textContent = m.name;
  document.getElementById('combat-hp').textContent = Math.max(0, m.hp);
  document.getElementById('combat-maxhp').textContent = m.maxHp;
  document.getElementById('combat-hp-fill').style.width = Math.max(0, m.hp / m.maxHp * 100) + '%';
  document.getElementById('combat-atk').textContent = m.atk;
  document.getElementById('combat-def').textContent = m.def;
  document.getElementById('combat-enemy-statuses').innerHTML = statusBadgesHtml(m.statuses);
  document.getElementById('combat-player-statuses').innerHTML = statusBadgesHtml(state.player.statuses);
  const p = state.player;
  const pstats = [];
  pstats.push(`<img class="stat-icon" src="img/ui/atk.png" alt=""><b>${p.atk}</b>`);
  pstats.push(`<img class="stat-icon" src="img/ui/def.png" alt=""><b>${p.def}</b>`);
  pstats.push(`⚡<b>${p.crit || 0}%</b>`);
  pstats.push(`💨<b>${p.dodge || 0}%</b>`);
  if (p.bleedChance) pstats.push(`🩸<b>${p.bleedChance}%</b>`);
  if (p.burnChance)  pstats.push(`🔥<b>${p.burnChance}%</b>`);
  if (p.stunChance)  pstats.push(`💫<b>${p.stunChance}%</b>`);
  document.getElementById('combat-player-stats').innerHTML = pstats.map(s => `<span>${s}</span>`).join('');
  const panel = document.getElementById('combat-panel');
  panel.classList.toggle('pending', !!state.combat.pending);
  panel.querySelectorAll('.combat-btn').forEach(b => { b.disabled = !!state.combat.pending; });
}

const COMBAT_PAUSE_MS = 450;

function rollPct(pct) { return Math.random() * 100 < (pct || 0); }

function applyStatus(target, type) {
  if (!STATUS_DEFS[type]) return false;
  if (type === 'burn' && target.fireImmune) return false;
  if (!target.statuses) target.statuses = { bleed: 0, burn: 0, stun: 0 };
  const dur = STATUS_DEFS[type].duration;
  target.statuses[type] = Math.max(target.statuses[type] || 0, dur);
  return true;
}

function rollInflict(source, target, targetLabel) {
  for (const key of STATUS_KEYS) {
    const chanceKey = key + 'Chance';
    const pct = source[chanceKey] || 0;
    if (pct > 0 && rollPct(pct)) {
      if (applyStatus(target, key)) {
        pushLog(`${STATUS_DEFS[key].icon} ${targetLabel}: ${STATUS_DEFS[key].name}.`);
      }
    }
  }
}

function tryConsumeStun(target) {
  if (target.statuses && target.statuses.stun > 0) {
    target.statuses.stun -= 1;
    return true;
  }
  return false;
}

function tickDoT() {
  const ps = state.player.statuses;
  if (ps) {
    if (ps.bleed > 0) {
      const d = STATUS_DEFS.bleed.dmg;
      state.player.hp -= d;
      pushLog(`🩸 Кровотечение: -${d} HP.`);
      queueHit(state.player.x, state.player.y, d);
      ps.bleed -= 1;
      if (checkDeath()) return true;
    }
    if (ps.burn > 0) {
      const d = STATUS_DEFS.burn.dmg;
      state.player.hp -= d;
      pushLog(`🔥 Поджог: -${d} HP.`);
      queueHit(state.player.x, state.player.y, d);
      ps.burn -= 1;
      if (checkDeath()) return true;
    }
  }
  const dead = [];
  for (const m of state.monsters) {
    const s = m.statuses;
    if (!s) continue;
    if (s.bleed > 0) {
      let d = STATUS_DEFS.bleed.dmg;
      if (m.bleedVuln && m.bleedVuln > 1) d = Math.ceil(d * m.bleedVuln);
      m.hp -= d;
      pushLog(`🩸 ${m.name}: -${d}.`);
      queueHit(m.x, m.y, d);
      s.bleed -= 1;
    }
    if (s.burn > 0 && !m.fireImmune) {
      const d = STATUS_DEFS.burn.dmg;
      m.hp -= d;
      pushLog(`🔥 ${m.name}: -${d}.`);
      queueHit(m.x, m.y, d);
      s.burn -= 1;
    }
    if (m.hp <= 0) dead.push(m);
  }
  for (const m of dead) {
    pushLog(`${m.name} повержен.`);
    if (state.combat && state.combat.monsterId === m.id) closeCombat();
    killMonster(m);
  }
  return false;
}

function combatAttack() {
  if (!state.combat || state.combat.pending) return;
  const m = state.monsters.find(x => x.id === state.combat.monsterId);
  if (!m) return;

  if (tryConsumeStun(state.player)) {
    pushLog('💫 Ты оглушён и пропускаешь удар.');
    state.combat.pending = true;
    render();
    setTimeout(() => enemyStrike(m, 'normal'), COMBAT_PAUSE_MS);
    return;
  }

  lungeFrom(state.player.x, state.player.y, m.x);

  if (rollPct(m.dodge)) {
    pushLog(`${m.name} уклонился от удара!`);
  } else {
    let dmg = Math.max(state.player.atk - m.def, 1);
    const crit = rollPct(state.player.crit);
    if (crit) dmg = dmg * 2;
    m.hp -= dmg;
    pushLog(crit ? `⚡ КРИТ! ${m.acc} -${dmg}.` : `Ты ударил ${m.acc} на ${dmg}.`);
    queueHit(m.x, m.y, dmg);
    setTimeout(() => spriteFxAt(m.x, m.y, 'sprite-hit', HIT_FX_MS), 110);
    rollInflict(state.player, m, m.name);
  }

  if (m.hp <= 0) {
    pushLog(`${m.name} повержен. +${m.xp} XP.`);
    closeCombat();
    killMonster(m);
    if (state.screen === 'game') endTurn(null);
    render();
    return;
  }

  state.combat.pending = true;
  render();
  setTimeout(() => {
    spriteFxAt(m.x, m.y, 'telegraph', TELEGRAPH_FX_MS);
  }, COMBAT_PAUSE_MS - TELEGRAPH_FX_MS);
  setTimeout(() => enemyStrike(m, 'normal'), COMBAT_PAUSE_MS);
}

function enemyStrike(m, mode) {
  if (!state.combat || state.combat.monsterId !== m.id) return;
  state.combat.pending = false;
  if (m.hp <= 0) { render(); return; }

  if (tryConsumeStun(m)) {
    pushLog(`💫 ${m.name} оглушён.`);
    endTurn(m.id);
    render();
    return;
  }

  lungeFrom(m.x, m.y, state.player.x);

  if (rollPct(state.player.dodge)) {
    pushLog(`Ты уклонился от ${m.acc}!`);
  } else {
    let raw = Math.max(m.atk - state.player.def, 1);
    const crit = rollPct(m.crit);
    if (crit) raw = raw * 2;
    let dmg = raw;
    if (mode === 'defend') dmg = Math.max(Math.floor(raw / 2), 1);
    state.player.hp -= dmg;
    pushLog(crit ? `⚡ КРИТ! ${m.name} -${dmg}.` : `${m.name} ударил на ${dmg}.`);
    queueHit(state.player.x, state.player.y, dmg);
    setTimeout(() => spriteFxAt(state.player.x, state.player.y, 'sprite-hit', HIT_FX_MS), 110);
    applyLifeSteal(m, dmg);
    rollInflict(m, state.player, 'Ты');
    if (checkDeath()) return;
  }
  endTurn(m.id);
  render();
}

function combatDefend() {
  if (!state.combat || state.combat.pending) return;
  const m = state.monsters.find(x => x.id === state.combat.monsterId);
  if (!m) return;

  state.combat.pending = true;
  pushLog(`Ты занял защитную стойку.`);
  render();
  setTimeout(() => enemyStrike(m, 'defend'), COMBAT_PAUSE_MS);
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

  if (rollPct(state.player.dodge)) {
    pushLog(`Ты отступил и уклонился!`);
  } else {
    let dmg = Math.max(m.atk - state.player.def, 1);
    const crit = rollPct(m.crit);
    if (crit) dmg = dmg * 2;
    state.player.hp -= dmg;
    pushLog(crit ? `⚡ КРИТ в спину! -${dmg}.` : `Ты отступил. ${m.name} ударил в спину на ${dmg}.`);
    queueHit(state.player.x, state.player.y, dmg);
    rollInflict(m, state.player, 'Ты');
  }

  closeCombat();
  if (checkDeath()) return;

  endTurn(m.id);
  render();
}

function killMonster(m) {
  const gx = m.x, gy = m.y;
  if (m.image) {
    state.deathFx.push({ x: gx, y: gy, image: m.image, flipped: state.player.x < gx, startedAt: Date.now() });
    setTimeout(() => {
      const cutoff = Date.now() - DEATH_FX_MS;
      state.deathFx = state.deathFx.filter(d => d.startedAt > cutoff);
      render();
    }, DEATH_FX_MS + 30);
  }
  state.monsters = state.monsters.filter(x => x.id !== m.id);
  state.runStats.monstersKilled += 1;
  if (m.boss) state.runStats.bossesKilled += 1;
  haptic(m.boss ? 'success' : 'impact-heavy');

  if (m.splitInto) {
    const mult = 1 + (state.depth - 1) * 0.1;
    let spawned = 0;
    const tried = new Set();
    const originCells = [{x: gx, y: gy}];
    for (const [dx, dy] of [[0,0],[1,0],[-1,0],[0,1],[0,-1]]) {
      originCells.push({ x: gx + dx, y: gy + dy });
    }
    for (const c of originCells) {
      if (spawned >= 2) break;
      const key = c.x + ',' + c.y;
      if (tried.has(key)) continue;
      tried.add(key);
      if (!inBounds(c.x, c.y)) continue;
      if (state.player.x === c.x && state.player.y === c.y) continue;
      if (monsterAt(c.x, c.y)) continue;
      state.monsters.push(buildMonster(m.splitInto, mult, c));
      spawned += 1;
    }
    if (spawned > 0) pushLog(`${m.name} разделился на ${spawned}!`);
  }

  if (!m.boss && m.type !== 'slime_small' && m.type !== 'mimic') {
    state.floorGraveyard = state.floorGraveyard || [];
    state.floorGraveyard.push(m.type);
  }

  const up = state.meta.upgrades;
  let gold = randRange(m.goldMin, m.goldMax);
  if (hasPassive('goldBonus')) gold = Math.floor(gold * 1.5);
  const setGoldMul = getSetGoldMul();
  if (setGoldMul > 0) gold = Math.floor(gold * (1 + setGoldMul));
  if (up.greed > 0) gold = Math.floor(gold * (1 + up.greed * 0.1));
  state.player.gold += gold;
  state.runStats.goldCollected += gold;

  let xp = m.xp;
  if (up.scholar > 0) xp = Math.floor(xp * (1 + up.scholar * 0.1));

  pushLog(`+${gold} 🪙, +${xp} ⭐.`);
  queueFloat(gx, gy, `+${gold}🪙 +${xp}⭐`, 'gold');
  gainXp(xp);

  if (m.elite) {
    const epicPool = ITEM_POOL.filter(x => x.rarity === 'epic');
    const tpl = epicPool[randInt(epicPool.length)];
    const item = JSON.parse(JSON.stringify(tpl));
    pushLog(`⚡ Трофей элиты: ${item.name} [epic]!`);
    queueFloat(gx, gy, item.name, rarityClass(item.rarity));
    tryEquip(item);
  } else if (up.hunter > 0 && Math.random() < up.hunter * 0.05) {
    const item = rollItem(state.depth);
    pushLog(`🎯 Добыча: ${item.name} [${item.rarity}]!`);
    queueFloat(gx, gy, item.name, rarityClass(item.rarity));
    tryEquip(item);
  }
}

function getBaseStats() {
  const lvl = state.player.level;
  const up = state.meta.upgrades;
  return {
    maxHp: 20 + (lvl - 1) * 3 + up.maxHp * 2,
    atk:   5 + Math.floor(lvl / 2) + up.atk,
    def:   1 + Math.floor(lvl / 3) + up.def,
    crit:  5,
    dodge: 3,
    bleedChance: 0,
    burnChance: 0,
    stunChance: 0,
  };
}

function hasPassive(name) {
  const a = state.player.equipment.amulet;
  return !!(a && a.passive === name);
}

function recalcStats() {
  const base = getBaseStats();
  let maxHp = base.maxHp, atk = base.atk, def = base.def;
  let crit = base.crit, dodge = base.dodge;
  let bleedChance = base.bleedChance, burnChance = base.burnChance, stunChance = base.stunChance;
  for (const key of Object.keys(state.player.equipment)) {
    const it = state.player.equipment[key];
    if (!it) continue;
    const b = it.bonus || {};
    if (b.hp)  maxHp += b.hp;
    if (b.atk) atk   += b.atk;
    if (b.def) def   += b.def;
    if (b.crit)         crit += b.crit;
    if (b.dodge)        dodge += b.dodge;
    if (b.bleedChance)  bleedChance += b.bleedChance;
    if (b.burnChance)   burnChance += b.burnChance;
    if (b.stunChance)   stunChance += b.stunChance;
  }
  const setBonus = getSetStatBonuses();
  maxHp += setBonus.hp;
  atk += setBonus.atk;
  def += setBonus.def;
  crit += setBonus.crit;
  dodge += setBonus.dodge;
  bleedChance += setBonus.bleedChance;
  burnChance += setBonus.burnChance;
  stunChance += setBonus.stunChance;
  if (state.player.effects.rage > 0) atk += POTION_TYPES.rage.atk;
  if (state.player.effects.iron > 0) def += POTION_TYPES.iron.def;
  if (atk < 1) atk = 1;
  state.player.maxHp = maxHp;
  state.player.atk = atk;
  state.player.def = def;
  state.player.crit = crit;
  state.player.dodge = dodge;
  state.player.bleedChance = bleedChance;
  state.player.burnChance = burnChance;
  state.player.stunChance = stunChance;
  if (state.player.hp > maxHp) state.player.hp = maxHp;
}

function gainXp(amount) {
  if (hasPassive('xpBonus')) amount = Math.floor(amount * 1.25);
  const setXpMul = getSetXpMul();
  if (setXpMul > 0) amount = Math.floor(amount * (1 + setXpMul));
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
  document.getElementById('inv-crit').textContent = p.crit || 0;
  document.getElementById('inv-dodge').textContent = p.dodge || 0;
  document.getElementById('inv-bleed').textContent = p.bleedChance || 0;
  document.getElementById('inv-burn').textContent = p.burnChance || 0;
  document.getElementById('inv-stun').textContent = p.stunChance || 0;

  const slots = ['weapon', 'helmet', 'chest', 'boots', 'ring', 'amulet'];
  for (const key of slots) {
    const item = p.equipment[key];
    const slotEl = document.querySelector(`.inv-slot[data-slot="${key}"]`);
    const iconEl = slotEl.querySelector('.inv-icon');
    const nameEl = document.getElementById(`inv-name-${key}`);
    const bonusEl = document.getElementById(`inv-bonus-${key}`);
    slotEl.classList.remove('equipped', 'rarity-rare', 'rarity-epic');
    iconEl.classList.toggle('has-img', !!(item && item.image));
    iconEl.innerHTML = itemIconHtml(item, key);
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

  renderInventorySets();
}

function renderInventorySets() {
  const host = document.getElementById('inv-sets');
  if (!host) return;
  const counts = countActiveSets();
  const worn = new Set();
  for (const slotKey of Object.keys(state.player.equipment)) {
    const it = state.player.equipment[slotKey];
    if (it) worn.add(it.name);
  }
  const rows = [];
  for (const key of Object.keys(SETS)) {
    const set = SETS[key];
    const c = counts[key] || 0;
    const total = set.pieces.length;
    const piecesHtml = set.pieces.map(name => {
      const owned = worn.has(name);
      return `<span class="set-piece${owned ? ' owned' : ''}">${name}</span>`;
    }).join(' · ');
    const tiersHtml = set.tiers.map(t => {
      const active = c >= t.count;
      return `<div class="set-tier${active ? ' active' : ''}"><span class="set-tier-count">${t.count}/${total}</span> ${t.desc}</div>`;
    }).join('');
    const activeClass = c > 0 ? ' has-any' : '';
    rows.push(`
      <div class="set-row ${set.cssClass}${activeClass}">
        <div class="set-head">
          <span class="set-icon">${set.icon}</span>
          <span class="set-name">${set.name}</span>
          <span class="set-count">${c}/${total}</span>
        </div>
        <div class="set-pieces">${piecesHtml}</div>
        <div class="set-tiers">${tiersHtml}</div>
      </div>
    `);
  }
  host.innerHTML = rows.join('');
}

function showLevelUpBanner() {
  const div = document.createElement('div');
  div.className = 'levelup-banner';
  div.textContent = `LEVEL ${state.player.level}!`;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 1500);
}

const animQueue = [];

const DEATH_FX_MS = 520;
const SPAWN_FX_MS = 420;
const LUNGE_FX_MS = 280;
const HIT_FX_MS = 260;
const TELEGRAPH_FX_MS = 350;

function queueHit(x, y, amount) {
  animQueue.push({ kind: 'hit', x, y, amount });
  haptic('impact');
  playSfx('sfx-hit');
}

function queueFloat(x, y, text, cls) {
  animQueue.push({ kind: 'float', x, y, text, cls });
}

function findSpriteAt(x, y) {
  const cell = document.querySelector(`.cell[data-x="${x}"][data-y="${y}"]`);
  if (!cell) return null;
  return cell.querySelector('.monster-img, .player-img');
}

function spriteFxAt(x, y, cls, ms) {
  const img = findSpriteAt(x, y);
  if (!img) return;
  img.classList.remove(cls);
  void img.offsetWidth;
  img.classList.add(cls);
  setTimeout(() => { img.classList.remove(cls); }, ms);
}

function lungeFrom(x, y, targetX) {
  const dir = targetX > x ? 'lunge-right' : (targetX < x ? 'lunge-left' : 'lunge-right');
  spriteFxAt(x, y, dir, LUNGE_FX_MS);
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
  if (state.depth % 10 === 0 && state.monsters.some(m => m.boss)) {
    pushLog('🐉 Босс ещё жив. Победи его, чтобы спуститься.');
    return;
  }
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
  state.player.gold = up.gold * 10 + (state.meta.pendingStarsGold || 0);
  const pendingEpics = state.meta.pendingEpics || 0;
  if (state.meta.pendingStarsGold || state.meta.pendingEpics) {
    state.meta.pendingStarsGold = 0;
    state.meta.pendingEpics = 0;
    saveMeta();
  }
  state.player.potions = { heal: Math.min(MAX_POTIONS, up.potions), rage: 0, iron: 0 };
  state.player.effects = { rage: 0, iron: 0 };
  state.player.statuses = { bleed: 0, burn: 0, stun: 0 };
  state.player.equipment = {
    weapon: null, helmet: null, chest: null, boots: null, ring: null, amulet: null,
  };
  const starterTpl = ITEM_POOL.find(x => x.name === 'Копьё');
  if (starterTpl) state.player.equipment.weapon = JSON.parse(JSON.stringify(starterTpl));
  state.pendingItem = null;
  state.depth = 1;
  recalcStats();
  state.player.hp = state.player.maxHp;
  state.monsters = [];
  state.runStats = { monstersKilled: 0, chestsOpened: 0, bossesKilled: 0, goldCollected: 0 };
  state.combat = null;
  state.log = [];
  state.testEpicOffer = null;
  state.screen = 'game';
  document.getElementById('menu-modal').classList.add('hidden');
  document.getElementById('death-modal').classList.add('hidden');
  document.getElementById('combat-panel').classList.add('hidden');
  initFloor();
  for (let i = 0; i < pendingEpics; i++) grantRandomEpic(true);
  render();
}

function pushLog(text) {
  state.log.push(text);
  if (state.log.length > 5) state.log.shift();
}

function render() {
  renderHUD();
  syncGridSize();
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
    const t = POTION_TYPES[type];
    const iconHtml = t.image
      ? `<img class="potion-img" src="${t.image}" alt="">`
      : t.icon;
    btn.innerHTML = active
      ? `${iconHtml}<span class="potion-count">${count} · ${p.effects[type]}x</span>`
      : `${iconHtml}<span class="potion-count">${count}</span>`;
    btn.classList.toggle('has-potions', count > 0);
    btn.classList.toggle('effect-active', !!active);
  }
}

function syncGridSize() {
  const wrap = document.querySelector('.grid-wrap');
  const grid = document.getElementById('grid');
  if (!wrap || !grid) return;
  const w = wrap.clientWidth;
  const h = wrap.clientHeight;
  if (!w || !h) return;
  const side = Math.min(w, h, 440);
  grid.style.width = side + 'px';
  grid.style.height = side + 'px';
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
        const flip = state.player.facing === 'left' ? ' flipped' : '';
        cell.innerHTML = `<img class="player-img${flip}" src="img/characters/player.png" alt="">`;
      } else {
        const m = monsterAt(x, y);
        if (m) {
          cell.classList.add('monster');
          if (m.boss) cell.classList.add('boss');
          if (m.elite) cell.classList.add('elite', 'elite-' + m.affix);
          if (m.image) {
            const flipM = state.player.x < m.x ? ' flipped' : '';
            const floatyCls = m.floaty ? ' floaty' : '';
            const bossCls = m.boss ? ' boss-img' : '';
            const spawnCls = (Date.now() - (m.spawnedAt || 0)) < SPAWN_FX_MS ? ' spawning' : '';
            const statusCls = m.statuses
              ? STATUS_KEYS.filter(k => m.statuses[k] > 0).map(k => ' status-' + k).join('')
              : '';
            cell.innerHTML = `<img class="monster-img${flipM}${floatyCls}${bossCls}${spawnCls}${statusCls}" src="${m.image}" alt="">`;
          } else {
            cell.textContent = m.emoji;
          }
          if (m.statuses) {
            for (const key of STATUS_KEYS) {
              if (m.statuses[key] > 0) {
                const aura = document.createElement('div');
                aura.className = 'status-aura ' + key;
                cell.appendChild(aura);
              }
            }
          }
          const sb = m.statuses && STATUS_KEYS.filter(k => m.statuses[k] > 0).map(k => STATUS_DEFS[k].icon).join('');
          if (sb) {
            const badge = document.createElement('div');
            badge.className = 'cell-status';
            badge.textContent = sb;
            cell.appendChild(badge);
          }
        } else {
          const c = state.grid[y][x];
          if (c.type === 'potion') {
            const kind = c.potion || 'heal';
            const p = POTION_TYPES[kind];
            if (p.image) {
              cell.innerHTML = `<img class="potion-img" src="${p.image}" alt="">`;
            } else {
              cell.textContent = p.icon;
            }
            if (kind !== 'heal') cell.classList.add('potion-rare');
          } else if (c.type === 'merchant') {
            cell.classList.add('merchant-cell');
            cell.innerHTML = '<img class="merchant-img" src="img/characters/shop.png" alt="">';
          } else if (c.type === 'coin') {
            cell.innerHTML = '<img class="coin-img" src="img/ui/coin.png" alt="">';
          } else if (c.type !== 'empty' && EMOJI[c.type]) {
            cell.textContent = EMOJI[c.type];
          }
        }
      }
      if (state.deathFx && state.deathFx.length) {
        const now = Date.now();
        for (const d of state.deathFx) {
          if (d.x !== x || d.y !== y) continue;
          if (now - d.startedAt >= DEATH_FX_MS) continue;
          const ghost = document.createElement('img');
          ghost.className = 'death-sprite';
          ghost.src = d.image;
          ghost.alt = '';
          const elapsed = now - d.startedAt;
          ghost.style.animationDelay = (-elapsed) + 'ms';
          cell.appendChild(ghost);
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

const POTION_LONG_PRESS_MS = 350;
let potionPressTimer = null;
let potionActiveBtn = null;
let potionLongPressed = false;

function showPotionTooltip(btn, text) {
  let tip = document.getElementById('potion-tooltip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'potion-tooltip';
    tip.className = 'potion-tooltip';
    document.body.appendChild(tip);
  }
  tip.textContent = text;
  tip.classList.add('show');
  const tipRect = tip.getBoundingClientRect();
  const btnRect = btn.getBoundingClientRect();
  let left = btnRect.left + btnRect.width / 2 - tipRect.width / 2;
  left = Math.max(6, Math.min(left, window.innerWidth - tipRect.width - 6));
  const top = btnRect.top - tipRect.height - 8;
  tip.style.left = left + 'px';
  tip.style.top = Math.max(6, top) + 'px';
  clearTimeout(tip._hideTimer);
  tip._hideTimer = setTimeout(() => tip.classList.remove('show'), 1800);
}

function bindPotionButton(btn) {
  const type = btn.dataset.potion;
  const t = POTION_TYPES[type];
  const tooltipText = `${t.name} — ${t.short}`;

  const cancel = () => {
    clearTimeout(potionPressTimer);
    potionPressTimer = null;
    potionActiveBtn = null;
  };

  btn.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    potionActiveBtn = btn;
    potionLongPressed = false;
    clearTimeout(potionPressTimer);
    potionPressTimer = setTimeout(() => {
      if (potionActiveBtn !== btn) return;
      potionLongPressed = true;
      showPotionTooltip(btn, tooltipText);
    }, POTION_LONG_PRESS_MS);
  });

  btn.addEventListener('pointerup', (e) => {
    if (potionActiveBtn !== btn) return;
    clearTimeout(potionPressTimer);
    potionPressTimer = null;
    potionActiveBtn = null;
    if (!potionLongPressed) usePotion(type);
  });

  btn.addEventListener('pointerleave', cancel);
  btn.addEventListener('pointercancel', cancel);
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
}

function bindInput() {
  document.getElementById('modal-yes').addEventListener('click', () => closeStairsPrompt(true));
  document.getElementById('modal-no').addEventListener('click', () => closeStairsPrompt(false));
  document.getElementById('death-restart').addEventListener('click', startRun);
  document.getElementById('death-menu').addEventListener('click', backToMenu);
  document.getElementById('menu-start').addEventListener('click', startRun);
  document.getElementById('menu-reset').addEventListener('click', resetMeta);

  document.querySelectorAll('.potion-btn').forEach(btn => bindPotionButton(btn));
  document.getElementById('btn-inventory').addEventListener('click', openInventory);
  document.getElementById('shop-close').addEventListener('click', closeShop);
  document.getElementById('btn-settings').addEventListener('click', openSettings);
  document.getElementById('btn-combat-settings').addEventListener('click', openSettings);
  document.getElementById('menu-settings').addEventListener('click', openSettings);
  document.getElementById('settings-close').addEventListener('click', closeSettings);
  document.getElementById('settings-volume').addEventListener('input', (e) => {
    setVolume(Number(e.target.value) / 100);
    syncSettingsUI();
  });
  document.getElementById('settings-mute').addEventListener('change', (e) => {
    setMuted(e.target.checked);
    syncSettingsUI();
  });
  document.getElementById('inv-close').addEventListener('click', closeInventory);
  document.querySelectorAll('.inv-slot').forEach(slotEl => bindInvSlotTooltip(slotEl));
  document.getElementById('compare-take').addEventListener('click', () => closeCompareModal(true));
  document.getElementById('compare-keep').addEventListener('click', () => closeCompareModal(false));
  document.getElementById('buy-confirm-yes').addEventListener('click', () => closeBuyConfirm(true));
  document.getElementById('buy-confirm-no').addEventListener('click', () => closeBuyConfirm(false));

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
    if (state.screen === 'settings') {
      if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); closeSettings(); }
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
  document.getElementById('settings-modal').classList.add('hidden');
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
    const iconHtml = item.image
      ? `<img class="item-img" src="${item.image}" alt="">`
      : item.icon;
    row.innerHTML = `
      <div class="shop-icon">${iconHtml}</div>
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
  state.meta.upgrades = { maxHp: 0, atk: 0, def: 0, potions: 0, gold: 0, hunter: 0, archaeologist: 0, greed: 0, scholar: 0, merchant: 0 };
  saveMeta();
  renderMenu();
}

function backToMenu() {
  openMenu();
}

const SETTINGS_KEY = 'rpg-settings-v1';
const BGM_FADE_SEC = 5;
let bgmStarted = false;
const settings = { volume: 0.7, muted: false };
let settingsPrevScreen = null;

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed.volume === 'number') settings.volume = Math.max(0, Math.min(1, parsed.volume));
      if (typeof parsed.muted === 'boolean') settings.muted = parsed.muted;
    }
  } catch (e) {}
}

function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {}
}

function bgmEnvelope(t, d) {
  if (!d || !isFinite(d)) return 1;
  if (t < BGM_FADE_SEC) return Math.max(0, Math.min(1, t / BGM_FADE_SEC));
  if (t > d - BGM_FADE_SEC) return Math.max(0, Math.min(1, (d - t) / BGM_FADE_SEC));
  return 1;
}

function playSfx(id) {
  if (settings.muted) return;
  const el = document.getElementById(id);
  if (!el) return;
  try {
    el.currentTime = 0;
    el.volume = Math.max(0, Math.min(1, settings.volume));
    el.play().catch(() => {});
  } catch (e) {}
}

function applyBgmVolume() {
  const audio = document.getElementById('bgm');
  if (!audio) return;
  if (settings.muted) { audio.volume = 0; return; }
  audio.volume = Math.max(0, Math.min(1, bgmEnvelope(audio.currentTime, audio.duration) * settings.volume));
}

function initBgm() {
  const audio = document.getElementById('bgm');
  if (!audio) return;
  audio.volume = 0;
  audio.addEventListener('timeupdate', applyBgmVolume);

  const startOnce = () => {
    if (bgmStarted || settings.muted) return;
    audio.play().then(() => { bgmStarted = true; }).catch(() => {});
  };
  document.addEventListener('pointerdown', startOnce, { once: true });
  document.addEventListener('keydown', startOnce, { once: true });
  document.addEventListener('touchstart', startOnce, { once: true, passive: true });
}

function setMuted(muted) {
  const audio = document.getElementById('bgm');
  settings.muted = muted;
  saveSettings();
  applyBgmVolume();
  if (!audio) return;
  if (muted) {
    audio.pause();
  } else {
    audio.play().then(() => { bgmStarted = true; }).catch(() => {});
  }
}

function setVolume(vol) {
  settings.volume = Math.max(0, Math.min(1, vol));
  saveSettings();
  applyBgmVolume();
}

function syncSettingsUI() {
  const pct = Math.round(settings.volume * 100);
  const slider = document.getElementById('settings-volume');
  const value = document.getElementById('settings-vol-value');
  const mute = document.getElementById('settings-mute');
  const icon = document.getElementById('settings-vol-icon');
  if (slider) { slider.value = pct; slider.disabled = settings.muted; }
  if (value) value.textContent = pct + '%';
  if (mute) mute.checked = settings.muted;
  if (icon) icon.textContent = settings.muted ? '🔇' : (settings.volume < 0.05 ? '🔈' : settings.volume < 0.5 ? '🔉' : '🔊');
}

function openSettings() {
  settingsPrevScreen = state.screen;
  state.screen = 'settings';
  syncSettingsUI();
  document.getElementById('settings-modal').classList.remove('hidden');
}

function closeSettings() {
  document.getElementById('settings-modal').classList.add('hidden');
  state.screen = settingsPrevScreen || 'game';
  settingsPrevScreen = null;
}

function syncAppHeight() {
  let h;
  if (IS_TG && (tg.viewportStableHeight || tg.viewportHeight)) {
    h = tg.viewportStableHeight || tg.viewportHeight;
  } else {
    h = window.innerHeight;
  }
  document.documentElement.style.setProperty('--app-h', h + 'px');
  syncGridSize();
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
  loadSettings();
  initBgm();
  loadMeta(() => {
    openMenu();
    claimPendingGold(false);
  });
}

start();
