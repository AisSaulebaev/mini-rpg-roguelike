// Mini RPG backend — Telegram Stars purchases + leaderboard.
// Routes:
//   POST /invoice      { initData, pack }               -> { link }
//   POST /webhook                                       Telegram -> us (header X-Telegram-Bot-Api-Secret-Token)
//   POST /claim        { initData }                     -> { gold, epics, heals, revives }
//   GET  /balance?initData=...                          -> { gold, epics, heals, revives }
//   POST /submit-score { initData, depth, score }       -> { ok, rank }
//   GET  /top?limit=50                                  -> { entries: [{ name, best_depth, best_score }] }

const PACKS = {
  gold_small:  { gold: 100,  stars: 1, title: 'Мешочек золота',  desc: '+100 золота' },
  gold_medium: { gold: 500,  stars: 1, title: 'Сумка золота',    desc: '+500 золота' },
  gold_large:  { gold: 1500, stars: 1, title: 'Сундук золота',   desc: '+1500 золота' },
  test_epic:   { epics: 1,   stars: 1, title: '[TEST] Эпик-оружие', desc: 'Случайный эпический меч' },
  heal_hp:     { heals: 1,   stars: 1, title: 'Глоток жизни',    desc: 'Восстановить 50% HP' },
  revive:      { revives: 1, stars: 1, title: 'Воскрешение',      desc: 'Вернуться на этаж с 50% HP' },
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }
    const url = new URL(request.url);
    try {
      if (request.method === 'POST' && url.pathname === '/invoice')      return handleInvoice(request, env);
      if (request.method === 'POST' && url.pathname === '/webhook')      return handleWebhook(request, env);
      if (request.method === 'POST' && url.pathname === '/claim')        return handleClaim(request, env);
      if (request.method === 'GET'  && url.pathname === '/balance')      return handleBalance(request, env);
      if (request.method === 'POST' && url.pathname === '/submit-score') return handleSubmitScore(request, env);
      if (request.method === 'GET'  && url.pathname === '/top')          return handleTop(request, env);
      if (request.method === 'GET'  && url.pathname === '/admin/setup-webhook') return handleSetupWebhook(request, env);
      if (request.method === 'GET'  && url.pathname === '/admin/webhook-info')  return handleWebhookInfo(request, env);
      if (request.method === 'GET'  && url.pathname === '/admin/peek')          return handlePeek(request, env);
      if (request.method === 'POST' && url.pathname === '/admin/credit')        return handleAdminCredit(request, env);
      return json({ error: 'not_found' }, 404);
    } catch (e) {
      return json({ error: 'server_error', message: String(e && e.message || e) }, 500);
    }
  },
};

async function handleInvoice(request, env) {
  const body = await request.json().catch(() => ({}));
  const user = await validateInitData(body.initData || '', env.BOT_TOKEN);
  if (!user) return json({ error: 'bad_init_data' }, 401);
  const pack = PACKS[body.pack];
  if (!pack) return json({ error: 'bad_pack' }, 400);

  const payload = JSON.stringify({ uid: user.id, pack: body.pack, t: Date.now() });
  const tgRes = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/createInvoiceLink`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: pack.title,
      description: pack.desc,
      payload,
      currency: 'XTR',
      prices: [{ label: pack.title, amount: pack.stars }],
    }),
  }).then(r => r.json());

  if (!tgRes.ok) return json({ error: 'tg_error', detail: tgRes }, 502);
  return json({ link: tgRes.result });
}

async function handleWebhook(request, env) {
  const secret = request.headers.get('x-telegram-bot-api-secret-token') || '';
  if (secret !== env.WEBHOOK_SECRET) {
    console.log('[webhook] bad secret');
    return json({ error: 'forbidden' }, 403);
  }
  const update = await request.json().catch(() => ({}));
  console.log('[webhook] update keys:', Object.keys(update));

  if (update.pre_checkout_query) {
    const q = update.pre_checkout_query;
    console.log('[webhook] pre_checkout', { id: q.id, from: q.from && q.from.id, payload: q.invoice_payload });
    await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/answerPreCheckoutQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pre_checkout_query_id: q.id, ok: true }),
    });
    return json({ ok: true });
  }

  const msg = update.message;
  if (msg && msg.successful_payment) {
    const sp = msg.successful_payment;
    console.log('[webhook] successful_payment', { from: msg.from && msg.from.id, charge: sp.telegram_payment_charge_id, payload: sp.invoice_payload });
    const chargeId = sp.telegram_payment_charge_id;
    const chargeKey = `charge:${chargeId}`;
    if (await env.RPG_KV.get(chargeKey)) {
      console.log('[webhook] duplicate charge, skipping');
      return json({ ok: true, duplicate: true });
    }

    let payload = {};
    try { payload = JSON.parse(sp.invoice_payload || '{}'); } catch (e) {
      console.log('[webhook] payload parse failed:', e.message);
    }
    const pack = PACKS[payload.pack];
    const uid = payload.uid || (msg.from && msg.from.id);
    console.log('[webhook] resolved', { uid, pack: payload.pack, hasPack: !!pack });
    if (!pack || !uid) return json({ ok: true, skipped: 'bad_payload' });

    await env.DB.prepare(
      `INSERT INTO pending (uid, gold, epics, heals, revives, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, unixepoch())
       ON CONFLICT(uid) DO UPDATE SET
         gold    = gold    + ?2,
         epics   = epics   + ?3,
         heals   = heals   + ?4,
         revives = revives + ?5,
         updated_at = unixepoch()`
    ).bind(String(uid), pack.gold || 0, pack.epics || 0, pack.heals || 0, pack.revives || 0).run();
    await env.RPG_KV.put(chargeKey, '1', { expirationTtl: 60 * 60 * 24 * 30 });
    const credited = { gold: pack.gold || 0, epics: pack.epics || 0, heals: pack.heals || 0, revives: pack.revives || 0 };
    console.log('[webhook] credited', { uid, credited });
    return json({ ok: true, credited });
  }

  console.log('[webhook] ignored, no payment');
  return json({ ok: true });
}

async function handleClaim(request, env) {
  const body = await request.json().catch(() => ({}));
  const user = await validateInitData(body.initData || '', env.BOT_TOKEN);
  if (!user) {
    console.log('[claim] bad init data');
    return json({ error: 'bad_init_data' }, 401);
  }
  const uid = String(user.id);
  const row = await env.DB.prepare(
    `SELECT gold, epics, heals, revives FROM pending WHERE uid = ?1`
  ).bind(uid).first();
  console.log('[claim]', { uid, row });
  if (!row) return json({ gold: 0, epics: 0, heals: 0, revives: 0 });
  const g = row.gold || 0, e = row.epics || 0, h = row.heals || 0, r = row.revives || 0;
  if (g <= 0 && e <= 0 && h <= 0 && r <= 0) return json({ gold: 0, epics: 0, heals: 0, revives: 0 });
  const del = await env.DB.prepare(
    `DELETE FROM pending WHERE uid = ?1 AND gold = ?2 AND epics = ?3 AND heals = ?4 AND revives = ?5`
  ).bind(uid, g, e, h, r).run();
  if (!del.meta.changes) {
    console.log('[claim] race: not deleted, retry next time');
    return json({ gold: 0, epics: 0, heals: 0, revives: 0 });
  }
  console.log('[claim] returning', { gold: g, epics: e, heals: h, revives: r });
  return json({ gold: g, epics: e, heals: h, revives: r });
}

async function handleBalance(request, env) {
  const url = new URL(request.url);
  const user = await validateInitData(url.searchParams.get('initData') || '', env.BOT_TOKEN);
  if (!user) return json({ error: 'bad_init_data' }, 401);
  const row = await env.DB.prepare(
    `SELECT gold, epics, heals, revives FROM pending WHERE uid = ?1`
  ).bind(String(user.id)).first();
  return json(row || { gold: 0, epics: 0, heals: 0, revives: 0 });
}

async function handleSubmitScore(request, env) {
  const body = await request.json().catch(() => ({}));
  const user = await validateInitData(body.initData || '', env.BOT_TOKEN);
  if (!user) return json({ error: 'bad_init_data' }, 401);
  const depth = parseInt(body.depth, 10) || 0;
  const score = parseInt(body.score, 10) || 0;
  if (depth <= 0 && score <= 0) return json({ ok: true, updated: false });
  const uid = String(user.id);
  const name = buildDisplayName(user).slice(0, 40);
  await env.DB.prepare(
    `INSERT INTO leaderboard (uid, name, best_depth, best_score, updated_at)
     VALUES (?1, ?2, ?3, ?4, unixepoch())
     ON CONFLICT(uid) DO UPDATE SET
       name       = ?2,
       best_depth = CASE WHEN ?3 > best_depth THEN ?3
                         WHEN ?3 = best_depth AND ?4 > best_score THEN ?3
                         ELSE best_depth END,
       best_score = CASE WHEN ?3 > best_depth THEN ?4
                         WHEN ?3 = best_depth AND ?4 > best_score THEN ?4
                         ELSE best_score END,
       updated_at = unixepoch()`
  ).bind(uid, name, depth, score).run();
  return json({ ok: true });
}

async function handleTop(request, env) {
  const url = new URL(request.url);
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit'), 10) || 50));
  const rows = await env.DB.prepare(
    `SELECT uid, name, best_depth, best_score
     FROM leaderboard
     ORDER BY best_depth DESC, best_score DESC
     LIMIT ?1`
  ).bind(limit).all();
  const entries = (rows.results || []).map(r => ({
    name: r.name || 'Безымянный',
    best_depth: r.best_depth || 0,
    best_score: r.best_score || 0,
  }));
  let me = null;
  const initData = url.searchParams.get('initData');
  if (initData) {
    const user = await validateInitData(initData, env.BOT_TOKEN);
    if (user) {
      const row = await env.DB.prepare(
        `SELECT best_depth, best_score FROM leaderboard WHERE uid = ?1`
      ).bind(String(user.id)).first();
      if (row) me = { best_depth: row.best_depth || 0, best_score: row.best_score || 0 };
    }
  }
  return json({ entries, me });
}

function buildDisplayName(user) {
  if (user.username) return '@' + user.username;
  const parts = [user.first_name, user.last_name].filter(Boolean);
  return parts.join(' ') || 'Безымянный';
}

async function handleSetupWebhook(request, env) {
  const url = new URL(request.url);
  if (url.searchParams.get('secret') !== env.WEBHOOK_SECRET) {
    return json({ error: 'forbidden' }, 403);
  }
  const selfUrl = `${url.origin}/webhook`;
  const tgRes = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: selfUrl,
      secret_token: env.WEBHOOK_SECRET,
      allowed_updates: ['pre_checkout_query', 'message'],
    }),
  }).then(r => r.json());
  return json({ set_to: selfUrl, telegram: tgRes });
}

async function handleWebhookInfo(request, env) {
  const url = new URL(request.url);
  if (url.searchParams.get('secret') !== env.WEBHOOK_SECRET) return json({ error: 'forbidden' }, 403);
  const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/getWebhookInfo`).then(r => r.json());
  return json(res);
}

async function handlePeek(request, env) {
  const url = new URL(request.url);
  if (url.searchParams.get('secret') !== env.WEBHOOK_SECRET) return json({ error: 'forbidden' }, 403);
  const uid = url.searchParams.get('uid');
  if (!uid) return json({ error: 'no_uid' }, 400);
  const raw = await env.RPG_KV.get(`pending:${uid}`);
  return json({ pending: raw ? JSON.parse(raw) : null });
}

async function handleAdminCredit(request, env) {
  const url = new URL(request.url);
  if (url.searchParams.get('secret') !== env.WEBHOOK_SECRET) return json({ error: 'forbidden' }, 403);
  const body = await request.json().catch(() => ({}));
  const uid = body.uid;
  if (!uid) return json({ error: 'no_uid' }, 400);
  const pendingKey = `pending:${uid}`;
  const raw = await env.RPG_KV.get(pendingKey);
  const current = raw ? JSON.parse(raw) : { gold: 0, epics: 0 };
  current.gold = (current.gold || 0) + (parseInt(body.gold, 10) || 0);
  current.epics = (current.epics || 0) + (parseInt(body.epics, 10) || 0);
  await env.RPG_KV.put(pendingKey, JSON.stringify(current));
  return json({ ok: true, pending: current });
}

// --- Telegram initData validation (HMAC-SHA256) ---

async function validateInitData(initData, botToken) {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const pairs = [];
  for (const [k, v] of params) pairs.push(`${k}=${v}`);
  pairs.sort();
  const dataCheckString = pairs.join('\n');

  const enc = new TextEncoder();
  const secretKey = await hmac(enc.encode('WebAppData'), enc.encode(botToken));
  const digest = await hmac(secretKey, enc.encode(dataCheckString));
  const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  if (hex !== hash) return null;

  const authDate = parseInt(params.get('auth_date') || '0', 10);
  if (!authDate || (Date.now() / 1000 - authDate) > 60 * 60 * 24) return null;

  try {
    const userJson = params.get('user');
    if (!userJson) return null;
    const user = JSON.parse(userJson);
    if (!user.id) return null;
    return user;
  } catch (_) {
    return null;
  }
}

async function hmac(keyBytes, data) {
  const key = await crypto.subtle.importKey(
    'raw', keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  return crypto.subtle.sign('HMAC', key, data);
}
