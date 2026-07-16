#!/usr/bin/env node
/* Статусбар Claude Code для этого проекта.
   Claude Code передаёт JSON сессии в stdin; первая строка stdout = статусбар.
   Подпись ниже — меняй как хочешь, она своя у каждого проекта (.claude/settings.json). */
const LABEL = '🎮 ВОСХОЖДЕНИЕ · idle RPG';

let raw = '';
process.stdin.on('data', c => (raw += c));
process.stdin.on('end', () => {
  let model = '';
  try { model = JSON.parse(raw).model.display_name || ''; } catch (e) { /* без модели тоже сойдёт */ }

  let branch = '';
  try {
    branch = require('child_process')
      .execSync('git rev-parse --abbrev-ref HEAD', { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim();
  } catch (e) { /* не репозиторий — не беда */ }

  console.log([LABEL, branch && '⎇ ' + branch, model].filter(Boolean).join('  ·  '));
});
