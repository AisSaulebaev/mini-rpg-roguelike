// Оборона базы — MVP, этап 0: скелет (Canvas, поле 5×10, базовая зона 3×3, фон «Лес»).
const tg = window.Telegram && window.Telegram.WebApp;

const COLS = 5;
const ROWS = 10;
const BASE_COLS = 3;
const BASE_ROWS = 3;

const wrap = document.getElementById('bd-canvas-wrap');
const canvas = document.getElementById('bd-canvas');
const ctx = canvas.getContext('2d');

let dpr = window.devicePixelRatio || 1;
let cellSize = 60;
let fieldW = COLS * cellSize;
let fieldH = ROWS * cellSize;
let offsetX = 0;
let offsetY = 0;

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

function goLauncher() {
  location.href = '../../';
}

const trees = [];
function genTrees() {
  trees.length = 0;
  const rng = mulberry32(7);
  for (let i = 0; i < 36; i++) {
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
  draw();
}

function draw() {
  const cssW = wrap.clientWidth;
  const cssH = wrap.clientHeight;

  // фон леса (вертикальный градиент)
  const grad = ctx.createLinearGradient(0, 0, 0, cssH);
  grad.addColorStop(0, '#274a30');
  grad.addColorStop(0.55, '#1c3922');
  grad.addColorStop(1, '#102818');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, cssW, cssH);

  drawTrees(cssW, cssH);
  drawField();
  drawBaseZone();
  drawEnemyZone();
  drawPlaceholder();
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
  // ствол
  ctx.fillStyle = '#5a3820';
  ctx.fillRect(x - s * 0.07, y, s * 0.14, s * 0.45);
  // три яруса кроны
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
  // фон арены
  ctx.fillStyle = 'rgba(20, 35, 25, 0.55)';
  ctx.fillRect(offsetX, offsetY, fieldW, fieldH);

  // тонкая сетка ориентира
  ctx.strokeStyle = 'rgba(120, 200, 140, 0.12)';
  ctx.lineWidth = 1;
  for (let c = 0; c <= COLS; c++) {
    const x = offsetX + c * cellSize + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, offsetY);
    ctx.lineTo(x, offsetY + fieldH);
    ctx.stroke();
  }
  for (let r = 0; r <= ROWS; r++) {
    const y = offsetY + r * cellSize + 0.5;
    ctx.beginPath();
    ctx.moveTo(offsetX, y);
    ctx.lineTo(offsetX + fieldW, y);
    ctx.stroke();
  }

  // рамка арены
  ctx.strokeStyle = 'rgba(140, 220, 160, 0.45)';
  ctx.lineWidth = 2;
  ctx.strokeRect(offsetX + 0.5, offsetY + 0.5, fieldW - 1, fieldH - 1);
}

function drawBaseZone() {
  const baseLeftCol = Math.floor((COLS - BASE_COLS) / 2);
  const baseTopRow = ROWS - BASE_ROWS;
  const x = offsetX + baseLeftCol * cellSize;
  const y = offsetY + baseTopRow * cellSize;
  const w = BASE_COLS * cellSize;
  const h = BASE_ROWS * cellSize;

  // подсветка базовой зоны
  ctx.fillStyle = 'rgba(120, 200, 140, 0.14)';
  ctx.fillRect(x, y, w, h);

  // контурные клетки внутри
  ctx.strokeStyle = 'rgba(140, 220, 160, 0.45)';
  ctx.lineWidth = 1;
  for (let cc = 0; cc <= BASE_COLS; cc++) {
    const xx = x + cc * cellSize + 0.5;
    ctx.beginPath();
    ctx.moveTo(xx, y);
    ctx.lineTo(xx, y + h);
    ctx.stroke();
  }
  for (let rr = 0; rr <= BASE_ROWS; rr++) {
    const yy = y + rr * cellSize + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, yy);
    ctx.lineTo(x + w, yy);
    ctx.stroke();
  }

  // обводка базы
  ctx.strokeStyle = 'rgba(140, 220, 160, 0.85)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  // подпись «БАЗА»
  ctx.fillStyle = 'rgba(170, 230, 190, 0.9)';
  ctx.font = '700 11px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('БАЗА 3×3', x + w / 2, y - 16);
}

function drawEnemyZone() {
  // тонкая красная индикация верхнего края
  ctx.fillStyle = 'rgba(220, 80, 80, 0.14)';
  ctx.fillRect(offsetX, offsetY, fieldW, cellSize * 0.55);

  ctx.fillStyle = 'rgba(240, 130, 130, 0.85)';
  ctx.font = '700 11px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('СПАВН ВРАГОВ', offsetX + fieldW / 2, offsetY - 4);
}

function drawPlaceholder() {
  const cx = offsetX + fieldW / 2;
  const cy = offsetY + fieldH * 0.42;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.font = '700 16px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🌲 Лес гоблинов', cx, cy - 12);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.font = '500 12px -apple-system, sans-serif';
  ctx.fillText('Этап 0 — каркас', cx, cy + 10);
}

document.getElementById('bd-back').addEventListener('click', goLauncher);
document.getElementById('bd-start').addEventListener('click', () => {
  if (tg && tg.HapticFeedback) {
    try { tg.HapticFeedback.impactOccurred('light'); } catch (_) {}
  }
  alert('Бой будет на этапе 1 — скоро.');
});

initTelegram();
genTrees();
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
if (tg && tg.onEvent) {
  try { tg.onEvent('viewportChanged', resize); } catch (_) {}
}
requestAnimationFrame(resize);
