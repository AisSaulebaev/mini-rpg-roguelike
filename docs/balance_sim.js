#!/usr/bin/env node
/* Симуляция баланса «Восхождения» — источник чисел для docs/idle_balance_brief.md §4.
   Запуск: node docs/balance_sim.js
   Формулы скопированы из Восхождение.html. ЕСЛИ ПРАВИШЬ ФОРМУЛЫ В ИГРЕ — правь и здесь,
   иначе бриф начнёт врать (уже было: числа из головы разошлись с кодом в ~200 раз).

   Что моделируем: проход глав 1→20. На каждом килле — золото (награда + продажа дропа),
   xp и потолок, затем жадная прокачка трёх героев, пока хватает золота. Шмот — среднее
   по N прогонам: 8 слотов, у каждого своя редкость.

   ВАЖНО: редкость решает КАРТА (MAPLOC), а не глава. Поэтому проход считается для каждой
   локации отдельно — на карте 1 падает только серое, на карте 6 серого нет вовсе.
   Это вторая ось, и без неё картина врёт: сила шмота между картами отличается в разы. */

/* Сид: без него уровни героев гуляют между прогонами (редкость дропа → золото → прокачка),
   и числа в брифе перестают сходиться с тем, что видит читатель. Обычный LCG. */
let _seed = 12345;
Math.random = function(){ _seed = (_seed * 1664525 + 1013904223) % 4294967296; return _seed / 4294967296; };

// ---- формулы из игры ----
const RARITIES = [
  { key:'',          ru:'Обычный',     mult:1,    n:1 },
  { key:'uncommon',  ru:'Необычный',   mult:1.6,  n:2 },
  { key:'rare',      ru:'Редкий',      mult:2.6,  n:3 },
  { key:'epic',      ru:'Эпический',   mult:4.2,  n:4 },
  { key:'legendary', ru:'Легендарный', mult:7,    n:4 },
  { key:'mythic',    ru:'Мифический',  mult:11.3, n:4 },
  { key:'ancient',   ru:'Древний',     mult:18,   n:4 }
];
// веса редкости по локациям карты — копия MAPS[] из Восхождение.html (таблица референса)
const MAPS = [
  { name:'Зелёные холмы',   w:{ '':95, uncommon:5 } },
  { name:'Тёмный лес',      w:{ '':80, uncommon:19, rare:1 } },
  { name:'Горный перевал',  w:{ '':60, uncommon:35, rare:5 } },
  { name:'Выжженные земли', w:{ uncommon:70, rare:25, epic:5 } },
  { name:'Ледяной кряж',    w:{ uncommon:50, rare:40, epic:10 } },
  { name:'Забытые руины',   w:{ rare:79, epic:20, legendary:1 } },
  { name:'карта 7',  w:{ rare:60, epic:35, legendary:5 } },
  { name:'карта 8',  w:{ rare:50, epic:35, legendary:15 } },
  { name:'карта 9',  w:{ epic:79, legendary:20, mythic:1 } },
  { name:'карта 10', w:{ epic:60, legendary:35, mythic:5 } },
  { name:'карта 11', w:{ epic:50, legendary:35, mythic:15 } },
  { name:'карта 12', w:{ legendary:60, mythic:35, ancient:5 } },
  { name:'карта 13', w:{ legendary:50, mythic:35, ancient:15 } },
  { name:'карта 14', w:{ mythic:60, ancient:40 } }
];
const SLOT_PRIMARY = ['dmg','maxHp','armor','crit','dodge','maxHp','luck','lifesteal'];
const STAT_POOL    = ['dmg','maxHp','armor','crit','dodge','lifesteal','luck','atkSpd'];

const xpNeed    = l => Math.round(30 * Math.pow(1.18, l - 1));
const xpFromKill= c => 6 + 3 * c;
const sellValue = c => Math.round(5 * Math.pow(1.22, c - 1));
const upgradeCost = l => 100 * l;
const enemyHP   = c => 60 * Math.pow(1.22, c - 1);        // BAL.hpBase / BAL.hpGrow
const enemyDMG  = c => 2  * Math.pow(1.28, c - 1);        // BAL.dmgBase / BAL.dmgGrow — источник стены
const heroBaseHP  = (l, m) => 100 * Math.pow(1.11, l - 1) * m;
const heroBaseDMG = (l, m) => 12  * Math.pow(1.10, l - 1) * m;
const WARRIOR = { hpM:1.35, dmgM:0.85 };
const ATK_GAP = 0.5;                       // сек на действие

/** редкость по весам ТЕКУЩЕЙ КАРТЫ; редкости, которых нет в таблице, не выпадают вовсе */
function rollRarity(maploc){
  const w = MAPS[maploc - 1].w;
  const pool = RARITIES.map((r, i) => ({ r, i })).filter(x => w[x.r.key] > 0);
  let tot = 0; pool.forEach(x => tot += w[x.r.key]);
  let x = Math.random() * tot;
  for(const p of pool){ if((x -= w[p.r.key]) < 0) return p; }
  return pool[0];
}
function affixVal(stat, power){
  if(stat === 'dmg')   return power * 0.9;
  if(stat === 'maxHp') return power * 6;
  if(stat === 'armor') return power * 0.5;
  return 0;                                 // остальное в HP/урон не идёт
}
/** один комплект из 8 слотов: уровень предмета от главы c, редкость от карты maploc.
    Главный аффикс берёт полную power, доп-аффиксы — долю SEC (см. Восхождение.html). */
function rollGear(c, maploc){
  const SEC = 0.4;
  let hp = 0, dmg = 0;
  for(let s = 0; s < 8; s++){
    const { r } = rollRarity(maploc);
    const power = 4 * Math.pow(1.12, c) * r.mult;
    const stats = [SLOT_PRIMARY[s]];
    const pool = STAT_POOL.filter(x => x !== SLOT_PRIMARY[s]);
    while(stats.length < r.n && pool.length) stats.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    stats.forEach((st, idx) => {
      const p = idx === 0 ? power : power * SEC;
      if(st === 'maxHp') hp  += affixVal(st, p);
      else if(st === 'dmg') dmg += affixVal(st, p);
    });
  }
  return { hp, dmg };
}
function avgGear(c, maploc, N = 5000){
  let h = 0, d = 0;
  for(let i = 0; i < N; i++){ const g = rollGear(c, maploc); h += g.hp; d += g.dmg; }
  return { hp:h / N, dmg:d / N };
}

// ---- прогон: главы 1→20 на заданной карте ----
const MARKS = [1, 5, 10, 15, 20];
function run(maploc){
let XP = 0, LEVEL = 1, gold = 0, heroL = [1, 1, 1];
const rows = [];

for(let c = 1; c <= 20; c++){
  for(let k = 1; k <= 10; k++){
    const elite = (k === 10), boss = (k === 10 && c % 3 === 0);
    gold += sellValue(c) * (boss ? 8 : elite ? 3 : 1);          // награда за килл
    const { i } = rollRarity(maploc);
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
    const l = heroL[0], g = avgGear(c, maploc);
    const bh = heroBaseHP(l, WARRIOR.hpM), bd = heroBaseDMG(l, WARRIOR.dmgM);
    rows.push({ c, cap:LEVEL, lvl:l, bh, gh:g.hp, bd, gd:g.dmg, secs:enemyHP(c) / (bd + g.dmg) * ATK_GAP });
  }
}

return rows;
}

const pad = (v, n) => String(v).padStart(n);
// сид сбрасываем перед каждой картой — иначе прогоны не сравнить между собой
function reseed(){ _seed = 12345; }

for(const loc of [1, 3, 6]){
  reseed();
  const rows = run(loc);
  console.log('\n===== КАРТА ' + loc + ' «' + MAPS[loc - 1].name + '» — добыча: '
    + Object.keys(MAPS[loc - 1].w).map(k => (RARITIES.find(r => r.key === k).ru + ' ' + MAPS[loc - 1].w[k] + '%')).join(', '));
  console.log('гл | потолок | герой | HP: ур/шмот  ур даёт | УРОН: ур/шмот  ур даёт | бой, сек');
  for(const r of rows){
    console.log(
      pad(r.c, 2) + ' |   ' + pad(r.cap, 2) + '    |  ' + pad(r.lvl, 2) + '   | ' +
      pad(Math.round(r.bh), 4) + '/' + pad(Math.round(r.gh), 4) + '   ' + pad((r.bh / (r.bh + r.gh) * 100).toFixed(0), 3) + '% | ' +
      pad(Math.round(r.bd), 3) + '/' + pad(Math.round(r.gd), 3) + '   ' + pad((r.bd / (r.bd + r.gd) * 100).toFixed(0), 3) + '% | ' +
      pad(r.secs.toFixed(1), 5)
    );
  }
}

// §5 — БЫЛО: главный стат падал с редкостью (power/n). СТАЛО: главный аффикс берёт полную power.
console.log('\nКлинок на главе 10 — главный стат (урон = power×0.9):');
for(const r of RARITIES){
  const power = 4 * Math.pow(1.12, 10) * r.mult;
  console.log('  ' + r.ru.padEnd(13) + ' power=' + pad(power.toFixed(1), 5) + ' → урон +' + Math.max(1, Math.round(power * 0.9))
    + (r.key === 'uncommon' ? '   <- зелёный теперь СИЛЬНЕЕ серого (было +9 против +11)' : ''));
}
