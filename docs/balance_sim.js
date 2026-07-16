#!/usr/bin/env node
/* Симуляция баланса «Восхождения» — источник чисел для docs/idle_balance_brief.md §4.
   Запуск: node docs/balance_sim.js
   Формулы скопированы из Восхождение.html. ЕСЛИ ПРАВИШЬ ФОРМУЛЫ В ИГРЕ — правь и здесь,
   иначе бриф начнёт врать (уже было: числа из головы разошлись с кодом в ~200 раз).

   Что моделируем: проход глав 1→20. На каждом килле — золото (награда + продажа дропа),
   xp и потолок, затем жадная прокачка трёх героев, пока хватает золота. Шмот — среднее
   по N прогонам: 8 слотов, у каждого своя редкость по весам. */

/* Сид: без него уровни героев гуляют между прогонами (редкость дропа → золото → прокачка),
   и числа в брифе перестают сходиться с тем, что видит читатель. Обычный LCG. */
let _seed = 12345;
Math.random = function(){ _seed = (_seed * 1664525 + 1013904223) % 4294967296; return _seed / 4294967296; };

// ---- формулы из игры ----
const RARITIES = [
  { ru:'Обычный',     mult:1,   n:1, w:45 },
  { ru:'Необычный',   mult:1.6, n:2, w:30 },
  { ru:'Редкий',      mult:2.6, n:3, w:17 },
  { ru:'Эпический',   mult:4.2, n:4, w:6  },
  { ru:'Легендарный', mult:7,   n:4, w:2  }
];
const SLOT_PRIMARY = ['dmg','maxHp','armor','crit','dodge','maxHp','luck','lifesteal'];
const STAT_POOL    = ['dmg','maxHp','armor','crit','dodge','lifesteal','luck','atkSpd'];
const TOTAL_W = RARITIES.reduce((a, r) => a + r.w, 0);

const xpNeed    = l => Math.round(30 * Math.pow(1.18, l - 1));
const xpFromKill= c => 6 + 3 * c;
const sellValue = c => Math.round(5 * Math.pow(1.22, c - 1));
const upgradeCost = l => 100 * l;
const enemyHP   = c => 24 * Math.pow(1.35, c - 1);
const heroBaseHP  = (l, m) => 100 * Math.pow(1.11, l - 1) * m;
const heroBaseDMG = (l, m) => 12  * Math.pow(1.10, l - 1) * m;
const WARRIOR = { hpM:1.35, dmgM:0.85 };
const ATK_GAP = 0.5;                       // сек на действие

function rollRarity(){
  let x = Math.random() * TOTAL_W;
  for(let i = 0; i < RARITIES.length; i++){ if((x -= RARITIES[i].w) < 0) return { r:RARITIES[i], i }; }
  return { r:RARITIES[0], i:0 };
}
function affixVal(stat, power){
  if(stat === 'dmg')   return power * 0.9;
  if(stat === 'maxHp') return power * 6;
  if(stat === 'armor') return power * 0.5;
  return 0;                                 // остальное в HP/урон не идёт
}
/** один комплект из 8 слотов на главе c */
function rollGear(c){
  let hp = 0, dmg = 0;
  for(let s = 0; s < 8; s++){
    const { r } = rollRarity();
    const power = 4 * Math.pow(1.12, c) * r.mult, per = power / r.n;
    const stats = [SLOT_PRIMARY[s]];
    const pool = STAT_POOL.filter(x => x !== SLOT_PRIMARY[s]);
    while(stats.length < r.n && pool.length) stats.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    for(const st of stats){
      if(st === 'maxHp') hp  += affixVal(st, per);
      else if(st === 'dmg') dmg += affixVal(st, per);
    }
  }
  return { hp, dmg };
}
function avgGear(c, N = 5000){
  let h = 0, d = 0;
  for(let i = 0; i < N; i++){ const g = rollGear(c); h += g.hp; d += g.dmg; }
  return { hp:h / N, dmg:d / N };
}

// ---- прогон ----
const MARKS = [1, 5, 10, 15, 20];
let XP = 0, LEVEL = 1, gold = 0, heroL = [1, 1, 1];
const rows = [];

for(let c = 1; c <= 20; c++){
  for(let k = 1; k <= 10; k++){
    const elite = (k === 10), boss = (k === 10 && c % 3 === 0);
    gold += sellValue(c) * (boss ? 8 : elite ? 3 : 1);          // награда за килл
    const { i } = rollRarity();
    gold += Math.round(sellValue(c) * (1 + i * 0.6));           // продали выпавший предмет
    XP += xpFromKill(c) + (elite ? 25 : 0) + (boss ? 80 : 0);
    while(XP >= xpNeed(LEVEL)){ XP -= xpNeed(LEVEL); LEVEL++; }
    // жадно: качаем всех, пока хватает золота и не упёрлись в потолок
    let again = true;
    while(again){
      again = false;
      for(let i2 = 0; i2 < 3; i2++){
        const cost = upgradeCost(heroL[i2]);
        if(heroL[i2] < LEVEL && gold >= cost){ gold -= cost; heroL[i2]++; again = true; }
      }
    }
  }
  if(MARKS.includes(c)){
    const l = heroL[0], g = avgGear(c);
    const bh = heroBaseHP(l, WARRIOR.hpM), bd = heroBaseDMG(l, WARRIOR.dmgM);
    rows.push({ c, cap:LEVEL, lvl:l, bh, gh:g.hp, bd, gd:g.dmg, secs:enemyHP(c) / (bd + g.dmg) * ATK_GAP });
  }
}

const pad = (v, n) => String(v).padStart(n);
console.log('гл | потолок | герой | HP: ур/шмот  ур даёт | УРОН: ур/шмот  ур даёт | бой, сек');
for(const r of rows){
  console.log(
    pad(r.c, 2) + ' |   ' + pad(r.cap, 2) + '    |  ' + pad(r.lvl, 2) + '   | ' +
    pad(Math.round(r.bh), 4) + '/' + pad(Math.round(r.gh), 4) + '   ' + pad((r.bh / (r.bh + r.gh) * 100).toFixed(0), 3) + '% | ' +
    pad(Math.round(r.bd), 3) + '/' + pad(Math.round(r.gd), 3) + '   ' + pad((r.bd / (r.bd + r.gd) * 100).toFixed(0), 3) + '% | ' +
    pad(r.secs.toFixed(1), 5)
  );
}

// §5 — главный стат падает с редкостью, потому что power делится поровну на n
console.log('\nКлинок на главе 10 (power/n, урон = per×0.9):');
for(const r of RARITIES){
  const power = 4 * Math.pow(1.12, 10) * r.mult, per = power / r.n;
  console.log('  ' + r.ru.padEnd(13) + ' power=' + pad(power.toFixed(1), 5) + ' /' + r.n + ' → урон +' + Math.max(1, Math.round(per * 0.9)));
}
