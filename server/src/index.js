// Mini RPG backend — Telegram Stars purchases.
// Routes:
//   POST /invoice  { initData, pack }       -> { link }
//   POST /webhook                           Telegram -> us (header X-Telegram-Bot-Api-Secret-Token)
//   POST /claim    { initData }             -> { gold }          (claims + returns fresh balance)
//   GET  /balance?initData=...              -> { gold, pending }

const PACKS = {
  gold_small:  { gold: 100,  stars: 10,  title: 'Мешочек золота',  desc: '+100 золота' },
  gold_medium: { gold: 500,  stars: 40,  title: 'Сумка золота',    desc: '+500 золота' },
  gold_large:  { gold: 1500, stars: 100, title: 'Сундук золота',   desc: '+1500 золота' },
  test_epic:   { epics: 1,   stars: 1,   title: '[TEST] Эпик',     desc: 'Случайный эпический предмет' },
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
      if (request.method === 'POST' && url.pathname === '/invoice') return handleInvoice(request, env);
      if (request.method === 'POST' && url.pathname === '/webhook') return handleWebhook(request, env);
      if (request.method === 'POST' && url.pathname === '/claim')   return handleClaim(request, env);
      if (request.method === 'GET'  && url.pathname === '/balance') return handleBalance(request, env);
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
  if (secret !== env.WEBHOOK_SECRET) return json({ error: 'forbidden' }, 403);
  const update = await request.json().catch(() => ({}));

  // 1) Pre-checkout: just confirm.
  if (update.pre_checkout_query) {
    const q = update.pre_checkout_query;
    await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/answerPreCheckoutQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pre_checkout_query_id: q.id, ok: true }),
    });
    return json({ ok: true });
  }

  // 2) Successful payment: credit gold and mark charge id to avoid double credit.
  const msg = update.message;
  if (msg && msg.successful_payment) {
    const sp = msg.successful_payment;
    const chargeId = sp.telegram_payment_charge_id;
    const chargeKey = `charge:${chargeId}`;
    if (await env.RPG_KV.get(chargeKey)) return json({ ok: true, duplicate: true });

    let payload = {};
    try { payload = JSON.parse(sp.invoice_payload || '{}'); } catch (_) {}
    const pack = PACKS[payload.pack];
    const uid = payload.uid || (msg.from && msg.from.id);
    if (!pack || !uid) return json({ ok: true, skipped: 'bad_payload' });

    const pendingKey = `pending:${uid}`;
    const raw = await env.RPG_KV.get(pendingKey);
    const current = raw ? JSON.parse(raw) : { gold: 0, epics: 0 };
    current.gold = (current.gold || 0) + (pack.gold || 0);
    current.epics = (current.epics || 0) + (pack.epics || 0);
    await env.RPG_KV.put(pendingKey, JSON.stringify(current));
    await env.RPG_KV.put(chargeKey, '1', { expirationTtl: 60 * 60 * 24 * 30 });
    return json({ ok: true, credited: { gold: pack.gold || 0, epics: pack.epics || 0 } });
  }

  return json({ ok: true });
}

async function handleClaim(request, env) {
  const body = await request.json().catch(() => ({}));
  const user = await validateInitData(body.initData || '', env.BOT_TOKEN);
  if (!user) return json({ error: 'bad_init_data' }, 401);

  const pendingKey = `pending:${user.id}`;
  const raw = await env.RPG_KV.get(pendingKey);
  if (!raw) return json({ gold: 0, epics: 0 });
  let pending;
  try { pending = JSON.parse(raw); } catch (_) { pending = { gold: parseInt(raw, 10) || 0, epics: 0 }; }
  if (!pending || ((pending.gold || 0) <= 0 && (pending.epics || 0) <= 0)) {
    return json({ gold: 0, epics: 0 });
  }
  await env.RPG_KV.delete(pendingKey);
  return json({ gold: pending.gold || 0, epics: pending.epics || 0 });
}

async function handleBalance(request, env) {
  const url = new URL(request.url);
  const user = await validateInitData(url.searchParams.get('initData') || '', env.BOT_TOKEN);
  if (!user) return json({ error: 'bad_init_data' }, 401);
  const raw = await env.RPG_KV.get(`pending:${user.id}`);
  if (!raw) return json({ gold: 0, epics: 0 });
  try { return json(JSON.parse(raw)); } catch (_) { return json({ gold: parseInt(raw, 10) || 0, epics: 0 }); }
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
