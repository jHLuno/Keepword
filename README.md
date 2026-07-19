# Keepword

Keepword turns team promises in Telegram chats into confirmed commitments.

## Languages

Keepword replies in **English, Russian, or Spanish**. By default it auto-detects the
language of each message (commitment titles keep the original wording — they are never
translated). A chat administrator can pin one language for the whole chat with
`/settings language en|ru|es`, or restore auto-detection with `/settings language auto`.
The fallback language when detection is inconclusive is English.

## Per-chat settings (administrator only)

- `/settings mode suggest|manual|silent_digest` — how Keepword captures commitments.
- `/settings language auto|en|ru|es` — reply language.
- `/settings timezone <IANA>` — e.g. `Europe/Madrid`, `Asia/Almaty`. Controls when
  reminders and the daily summary fire. New chats default to `UTC`.
- `/settings digest HH:MM` — local time of the daily evening summary (default `18:00`).

## Privacy

See [docs/privacy-policy.md](docs/privacy-policy.md) — a template to complete and publish
before onboarding other teams. A current chat administrator can delete a chat's data with
`/privacy delete`. Message text and names are never written to logs.

## Local setup

1. Install Node.js 22 or later and pnpm 10.
2. Run `pnpm install`.
3. Copy `.env.example` to `.env` and supply each required environment variable.

## Commands

- `pnpm dev` — run the HTTP service with file watching.
- `pnpm dev:worker` — run the background worker with file watching.
- `pnpm lint` — check source code style and safety rules.
- `pnpm typecheck` — run the strict TypeScript compiler without emitting files.
- `pnpm test` — run the test suite.
- `pnpm build` — compile TypeScript into `dist/`.
- `pnpm db:generate` — generate Drizzle migrations once the schema is added.
- `pnpm db:migrate` — apply database migrations once they are added.

## Railway deployment

Deploy the same repository twice in one Railway project: a public **web** service and a private **worker** service. Railway uses the root `Dockerfile` and `railway.toml` to select the Docker build for both services; do not put a service start command or health check in the shared `railway.toml`.

Set these variables in both services (use Railway's PostgreSQL `DATABASE_URL` reference, and never commit values):

- `CALLBACK_SIGNING_SECRET`
- `DATABASE_URL`
- `OPENROUTER_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_BOT_USERNAME`
- `TELEGRAM_WEBHOOK_SECRET`
- `WORKER_SECRET`
- `PORT` (Railway supplies this automatically for the web service)

Configure the two services separately in Railway:

- **Web:** start command `node dist/src/main.js`; health check path `/health`; health check timeout `100` seconds; restart policy `ON_FAILURE` with 10 retries.
- **Worker:** start command `node dist/scripts/run-worker.js`; no HTTP health check; restart policy `ON_FAILURE` with 10 retries.

The worker runs reminder and digest jobs every minute; deliveries are idempotent, so retrying a run does not duplicate messages.

Before the first web deployment, apply migrations from a source checkout with the production `DATABASE_URL` available:

```bash
pnpm db:migrate
```

Configure Telegram after Railway assigns the web service a public HTTPS domain. Set the webhook URL to `https://<web-domain>/telegram/webhook` and set Telegram's webhook secret token to the same value as `TELEGRAM_WEBHOOK_SECRET`. Do not put that secret in the URL.

Use the [MVP release checklist](docs/release-checklist.md) before each Railway deployment. It includes backup, migration, webhook registration, worker, monitoring, rollback, and staging verification steps.

### Staging smoke test

1. Use a separate staging bot, database, and all-new secret values.
2. Confirm `GET https://<web-domain>/health` returns exactly `{ "status": "ok" }`.
3. Send a real staging Telegram update and confirm the web deployment logs `telegram_update_received` without logging message text or secrets.
4. Confirm the worker logs `worker_started`, then create a test commitment and verify at most one private delivery per reminder or digest idempotency key.
