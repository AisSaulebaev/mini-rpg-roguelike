// Launcher — корневой хаб. Общие души (rpg-meta-v1), список игр.
const META_KEY = 'rpg-meta-v1';
const tg = window.Telegram && window.Telegram.WebApp;

function initTelegram() {
  if (!tg) return;
  try {
    tg.ready();
    tg.expand();
    if (tg.setHeaderColor) tg.setHeaderColor('#1a1a2e');
    if (tg.setBackgroundColor) tg.setBackgroundColor('#1a1a2e');
    tg.BackButton && tg.BackButton.hide();
  } catch (_) {}
}

function readMetaLocal() {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function readMetaCloud() {
  return new Promise(resolve => {
    if (!tg || !tg.CloudStorage || !tg.CloudStorage.getItem) return resolve(null);
    try {
      tg.CloudStorage.getItem(META_KEY, (err, value) => {
        if (err || !value) return resolve(null);
        try { resolve(JSON.parse(value)); } catch (_) { resolve(null); }
      });
    } catch (_) { resolve(null); }
  });
}

function renderSouls(souls) {
  const el = document.getElementById('launcher-souls');
  if (el) el.textContent = souls | 0;
}

function renderHello() {
  const el = document.getElementById('launcher-hello');
  if (!el) return;
  const user = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
  const name = user && (user.first_name || user.username);
  el.textContent = name ? `Привет, ${name}!` : 'Выбери игру:';
}

async function loadSouls() {
  let meta = readMetaLocal();
  if (!meta) meta = await readMetaCloud();
  renderSouls(meta && typeof meta.souls === 'number' ? meta.souls : 0);
}

function bindCards() {
  document.querySelectorAll('.game-card').forEach(card => {
    if (card.classList.contains('disabled')) return;
    const href = card.dataset.href;
    if (!href) return;
    card.addEventListener('click', () => {
      if (tg && tg.HapticFeedback) {
        try { tg.HapticFeedback.impactOccurred('light'); } catch (_) {}
      }
      location.href = href;
    });
  });
}

initTelegram();
renderHello();
bindCards();
loadSouls();
