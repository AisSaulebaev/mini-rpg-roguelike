# mini-rpg-api (Cloudflare Worker)

Бэкенд для покупок за Telegram Stars: создаёт invoice, принимает webhook, копит «pending gold» в KV, клиент забирает через `/claim`.

## Эндпоинты

- `POST /invoice`  `{ initData, pack }` → `{ link }`
- `POST /webhook`  (Telegram → сюда, header `X-Telegram-Bot-Api-Secret-Token`)
- `POST /claim`    `{ initData }` → `{ gold }` — забирает pending-баланс.
- `GET  /balance?initData=…` → `{ pending }`

## Паки

| id            | gold | stars |
| ------------- | ---- | ----- |
| `gold_small`  | 100  | 10    |
| `gold_medium` | 500  | 40    |
| `gold_large`  | 1500 | 100   |

## Разворачивание (один раз)

Из папки `server/`:

```bash
# 1) KV namespace — запомнить id
wrangler kv namespace create RPG_KV
# → ...id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
# Вставить id в wrangler.toml вместо REPLACE_WITH_KV_ID.

# 2) Секреты
wrangler secret put BOT_TOKEN
#   → вставить токен из @BotFather
wrangler secret put WEBHOOK_SECRET
#   → случайная строка. Сгенерировать:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 3) Деплой
wrangler deploy
#   → получишь URL вида https://mini-rpg-api.<subdomain>.workers.dev
```

## Привязать webhook к боту

```bash
# Замени URL и SECRET. URL — тот, что выдал wrangler deploy.
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -d "url=https://<worker-url>/webhook" \
  -d "secret_token=<WEBHOOK_SECRET>" \
  -d "allowed_updates=[\"pre_checkout_query\",\"message\"]"
```

## Проверка

```bash
curl https://<worker-url>/balance?initData=test
# → { "error": "bad_init_data" }    (это норма без валидного initData)
```

После деплоя — прислать URL клиенту (в `game.js` прописать `API_BASE`).
