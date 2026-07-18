# Keepword release checklist

Use this checklist for each Railway release. Run it with a production operator; do not paste secrets into this file, terminal history, or chat.

## Before deployment

- [ ] Confirm the release commit passed `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.
- [ ] Take and verify a recoverable PostgreSQL backup. Record its timestamp and restore procedure in the deployment record.
- [ ] Review the migration set. This release includes `0009_check_page_callback_tokens`, `0010_suggestion_events`, and `0011_preserve_suggestion_event_history`; all are forward-only. `0009` replaces the callback-token constraint and `0011` drops the actor-membership foreign key, so the schema changes are not all purely additive; neither migration deletes existing data.
- [ ] Apply migrations once, first to **staging**, after confirming in Railway that `DATABASE_URL` belongs to staging (never paste it into terminal history or chat):

  ```bash
  pnpm db:migrate
  ```

- [ ] Confirm the migration completed before deploying the staging web and worker image. Do not run it from both services or on every container start.
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
- [ ] Create at least six active commitments for one onboarded user across two staging chats. Run `/check`; verify source-chat labels, no more than five items on a page, next/previous navigation, and that `Готово`, `Перенести срок`, and `Есть блокер` alter only that user's intended commitment.
- [ ] Copy an **unused** `/check` page-navigation (`check_page`) callback to a different Telegram account. Verify that account is rejected, then use the same callback from its rightful owner and verify navigation succeeds and consumes it; replay it from the rightful owner and verify it is rejected. No commitment changes in this navigation-only test.
- [ ] Test a `/check` **lifecycle** callback separately: an unrelated user and an administrator of another chat must be rejected; the commitment assignee and a current administrator of the commitment's original source chat are authorized. Use a fresh one-time callback for each attempt.
- [ ] In chat A create at least 30 resolved suggestion decisions in the last 90 days. Keep chat B below the threshold. Verify the current admin of A receives only A's calibration; a non-admin, a former admin, personal digest, and group messages receive none.
- [ ] Create at least three eligible exact-deadline commitments for one person in chat A and separate commitments in chat B. Verify chat A's private admin digest contains only A's reliability row and `/check` contains only the caller's own cross-chat summary.
- [ ] Exercise `/privacy delete` as the current chat administrator in chat A. Verify chat A becomes inactive; its source messages, suggestions, `suggestion_events`, commitments, onboarding tokens, and deliveries are removed; chat B remains intact; and chat A no longer produces Keepword writes.

## Monitoring and rollback

- [ ] Watch web and worker logs during the first job interval for `worker_started`, `reminder_sent`, `daily_digest_sent`, and delivery-failure events; investigate failures without logging private message content.
- [ ] Confirm webhook errors, authorization denials, and job delivery failures have alerting or an operator review path.
- [ ] If a release must be rolled back, first stop the new worker to avoid overlapping deliveries, then redeploy the previous known-good image to both services.
- [ ] Do not roll back a database migration by deleting data. `0009` replaces a callback-token constraint and `0011` drops an actor-membership foreign key, so this release is not purely additive at the schema level even though it performs no destructive data deletion. Restore from the verified backup only when necessary; otherwise use an explicitly reviewed forward compensating migration.
- [ ] Re-run the health check, `getWebhookInfo`, and the staging smoke test after rollback or recovery.
