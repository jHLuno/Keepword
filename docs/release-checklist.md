# Keepword MVP release checklist

Use this checklist for each Railway release. Run it with a production operator; do not paste secrets into this file, terminal history, or chat.

## Before deployment

- [ ] Confirm the release commit passed `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.
- [ ] Take and verify a recoverable PostgreSQL backup. Record its timestamp and restore procedure in the deployment record.
- [ ] Review the migration set and apply it once against the target database:

  ```bash
  pnpm db:migrate
  ```

- [ ] Confirm the database URL points to the intended environment before applying migrations.
- [ ] Set these Railway variables in both services: `CALLBACK_SIGNING_SECRET`, `DATABASE_URL`, `OPENROUTER_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`, and `WORKER_SECRET`.
- [ ] Let Railway provide `PORT` to the web service. Never commit or log any of the values above.

## Railway services

- [ ] Deploy the same image as two services in one Railway project.
- [ ] Configure **web** with `node dist/src/main.js`, health check `/health`, 100-second health-check timeout, and `ON_FAILURE` restart policy with 10 retries.
- [ ] Configure **worker** with `node dist/scripts/run-worker.js`, no HTTP health check, and `ON_FAILURE` restart policy with 10 retries.
- [ ] Confirm the worker starts the reminder and digest runner once per minute. Do not schedule a second external job trigger for the same database.

## Telegram webhook

- [ ] Keep `TELEGRAM_WEBHOOK_SECRET` only in the service environment and use the same value as Telegram's `secret_token`.
- [ ] After Railway assigns the public HTTPS web domain, register it without placing the secret in the URL:

  ```bash
  curl --fail-with-body \
    --data-urlencode "url=https://<web-domain>/telegram/webhook" \
    --data-urlencode "secret_token=<TELEGRAM_WEBHOOK_SECRET>" \
    "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook"
  ```

- [ ] Inspect the response for `"ok":true`; run `getWebhookInfo` and confirm the URL is the expected environment endpoint.

## Staging smoke test

- [ ] Use a separate staging Telegram bot, database, and newly generated secrets.
- [ ] Verify `GET https://<web-domain>/health` returns exactly `{ "status": "ok" }`.
- [ ] Send a real staging Telegram update and confirm `telegram_update_received` is logged without message text or secrets.
- [ ] Create and confirm a staging commitment for an onboarded user; verify one private reminder or digest is delivered per idempotency key despite a repeated worker run.
- [ ] Confirm an overdue state appears only in the assignee's private message and is never published to the group.
- [ ] Exercise `/privacy delete` as the current chat administrator and verify the group no longer produces Keepword writes.

## Monitoring and rollback

- [ ] Watch web and worker logs during the first job interval for `worker_started`, `reminder_sent`, `daily_digest_sent`, and delivery-failure events; investigate failures without logging private message content.
- [ ] Confirm webhook errors, authorization denials, and job delivery failures have alerting or an operator review path.
- [ ] If a release must be rolled back, first stop the new worker to avoid overlapping deliveries, then redeploy the previous known-good image to both services.
- [ ] Do not roll back a database migration by deleting data. Restore from the verified backup or use an explicitly reviewed forward migration.
- [ ] Re-run the health check, `getWebhookInfo`, and the staging smoke test after rollback or recovery.
