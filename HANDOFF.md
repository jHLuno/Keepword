## 2026-07-19 — Handoff

### Done
- Configured extraction for OpenRouter `google/gemini-2.5-flash-lite`.

### Not done
- Railway variables and deployment must be updated with `OPENROUTER_API_KEY`.

### Risks / blockers
- Confirm OpenRouter account billing and structured-output support before production traffic.

### Next recommended step
- Set `OPENROUTER_API_KEY` in both Railway services, redeploy, then run the staging extraction smoke test.

## 2026-07-19 — Handoff

### Done
- Made `pnpm db:migrate` available in the Railway production image.

### Next recommended step
- Redeploy the web service, run its pre-deploy migration command, then confirm `/health`.

## 2026-07-18 — Handoff

### Done
- Added an end-to-end MVP release regression and a deployment release checklist.
- Verified linting, strict types, the full test suite, and the production build.
- Confirmed the product documentation still reflects delivered MVP behavior.

### Not done
- No live staging Railway service, Telegram webhook, non-production bot, or database was created from this workspace.

### Risks / blockers
- An operator with isolated staging credentials must perform the manual staging webhook smoke test before production release.

### Next recommended step
- Follow `docs/release-checklist.md` in staging and record the successful webhook, worker, privacy-deletion, and idempotency checks in the deployment record.

## 2026-07-18 — Handoff

### Done
- Added authenticated internal job execution, shared reminder/digest runner, deployment assets, and Railway documentation.
- Added endpoint coverage for health, rejected unauthorized requests, and an authorized job run.

### Not done
- No Railway service, Telegram webhook, or staging bot was created from this workspace.

### Risks / blockers
- Production deployment still requires operators to set the documented Railway variables, run `pnpm db:migrate`, and configure Telegram's webhook secret.

### Next recommended step
- Perform the documented staging smoke test with isolated credentials and a non-production Telegram bot.
