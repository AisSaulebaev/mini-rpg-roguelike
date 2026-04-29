# BD — список ассетов для генерации

Снимок на 2026-04-29. Стиль — как существующие `games/bd/img/icon_*.png` и `goblin_*.png`: иллюстрация с плотным shading, тёмным контуром, прозрачным фоном.

Иконки UI — квадрат ~256×256, прозрачный фон, центрированный объект с запасом padding ~12px. Большие спрайты юнитов — ~256×256 или больше для боссов. Kорневая папка для ASCII-копий: `D:\Softs\TelegramGame\games\bd\img\`. Кириллические оригиналы лежат рядом в `originals\` (gitignored).

---

## ⭐ Высокий приоритет — иконки карточек усилений

В модалке выбора карточки 5 эффектов всё ещё рендерятся эмодзи (нет PNG). После генерации — кладём в `games/bd/img/`, в коде `cardIconHtml()` правим маппинг, эмодзи отваливается автоматически.

| Файл | Что это | Используется в карточках |
|---|---|---|
| `icon_coin.png` | золотая боевая монета (🪙) | `gold_small` (+25🪙), `gold_med` (+75🪙). Также reward-чип «+N🪙» после волны. |
| `icon_base.png` | замок/крепость с зубцами (🏰) | `base_heal_s` (+30 HP базе), `base_heal_m` (+60 HP), `base_max_r` (+25% max HP). |
| `icon_all_dmg.png` | универсальный «урон всем» (меч в огне / 🔥) | `all_dmg_c` (Ярость), `all_dmg_r` (Берсерк). |
| `icon_all_hp.png` | универсальный «HP всем» (щит / 🛡️) | `all_hp_c` (Воля), `all_hp_r` (Стойкость). |
| `icon_atk_speed.png` | универсальный «скорость атак» (молния / ⚡) | `all_atk_r` (Заточка). |

---

## 🏰 Средний приоритет — Castle (финальная локация, 15 волн)

Сейчас фон есть (`castle_bg.png`, `loc_castle.png`), но контента нет — `enemyPoolForWave('castle')` не реализован, юниты не спроектированы. Стиль: тёмная нежить, каменные стены, факелы, готика.

### Враги (~256×256, как `goblin_*.png`)

| Файл | Архетип | Параметры (ориентир) |
|---|---|---|
| `castle_skeleton.png` | мечник-скелет | HP 35 / dmg 9 / cd 800 — танк-замена goblin |
| `castle_archer.png` | скелет-лучник | HP 22 / dmg 7 / range 100 / cd 1400 |
| `castle_knight.png` | рыцарь в латах | HP 90 / dmg 14 / cd 1300, `armor: { melee: 0.5 }` (контр меч/спайдеру) |
| `castle_necro.png` | некромант | HP 22 / dmg 9 / range 80 / cd 1700, `aoeRadius: 36`. Опц.: `summonOnHit` → скелеты |
| `castle_specter.png` | призрак | HP 25 / dmg 8 / cd 900, `flying: true`. Иммунен к чему-то (например `armor: { ranged: 0.7 }`) |

### Босс w15 (~512×512)

| Файл | Что | Параметры |
|---|---|---|
| `castle_lord.png` | Лорд тьмы — финальный босс | HP 1800 / dmg 32 / cd 1300, `summonEveryMs: 3500`, `summonPool: ['castle_knight', 'castle_archer']`, AoE удар + опц. spell |

### Окружение

| Файл | Что | Использование |
|---|---|---|
| `castle_ground.png` | каменная плитка (~256×256, бесшовный pattern) | `loadGroundImage` для `state.currentLocation === 'castle'` |
| `castle_pillar.png` | обломок колонны (~128×256) | внутри поля, аналог `cave_mushroom.png` |
| `castle_brazier.png` | горящая жаровня (~128×192) | по бокам, аналог `cave_web.png` |

---

## 🎵 Аудио

Длительность ~2-3 мин, плавно зацикленный, формат mp3 как `forest.mp3` (~128kbps).

| Файл | Стиль |
|---|---|
| `audio/cave.mp3` | мрачный ambient, эхо, drips, низкий гул. Сейчас в пещере **тишина** (`LOCATIONS.cave.music` пусто). |
| `audio/castle.mp3` | тёмный orchestra, орган, военные барабаны, готика. |

---

## ❌ НЕ нужно — уже есть

- Здания (`barracks/archers/mages/well/crossbow/treasury/forge` × 3 уровня) — все 21 PNG в наличии.
- Юниты forest/cave (`goblin*`, `cave_*` × 5 + 2 босса) — все спрайты есть.
- Иконки зданий/героя/настроек/прокачки/сундуков/закладок — все в наличии.
- Бэкграунды локаций (`forest_bg`, `cave_bg`, `castle_bg`) и карточки (`loc_*`) — все есть.
- Снаряды (`arrow.png`, `bolt.png`, `fireball.png`, `rock.png`) — все есть.
- Декор forest (`tree.png`) и cave (`cave_mushroom.png`, `cave_web.png`) — все есть.
- SFX (sword/arrow/fireball/rock) — все есть.

---

## Pipeline интеграции (после получения PNG)

1. Кириллические оригиналы → `D:\Softs\TelegramGame\originals\` (gitignored).
2. ASCII-копии → `D:\Softs\TelegramGame\games\bd\img\`.
3. **Бамп `?v=N`** в `loadBuildingImage`/`loadUnitImage`/explicit src (`icon_*?v=2` и т.п.) — iOS WebView кэширует жёстко.
4. Бамп `style.css?v=...` и `game.js?v=...` в `games/bd/index.html`.
5. Для UI-иконок — добавить пути в `cardIconHtml()` (карточки) или `BUILDING_ICON` (если новое здание). Эмодзи-fallback падает автоматически.
6. Для castle-юнитов — расширить `UNITS`, `enemyPoolForWave('castle')`, `loadUnitImage()` в init-блоке, балансовые формулы. Босс w15 → ветка `startBattle()` по `state.currentLocation`.
7. Для castle-окружения — `castleSideDecor`/`castleFieldDecor` массивы по образцу cave + ветка в `rebuildBackdrop`.
