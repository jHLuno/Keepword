[Earlier entries](docs/archive/HANDOFF-pre-S04.md) · [2026-07-19 archive](docs/archive/HANDOFF-2026-07-19-pre-filter.md)

## 2026-07-19 — Handoff

### Done
- Fixed Railway's `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`: Docker now copies `pnpm-workspace.yaml` before each frozen install.

### Next recommended step
- Confirm the Railway build completes for commit `0c9b9ee` or the newer fix commit, then run the group-message smoke test.

## 2026-07-19 — Handoff

### Done
- Restored selective local AI prefiltering, including Russian and English action, assignment, obligation, and deadline patterns.
- Rejected messages do not reach OpenRouter and emit only safe identifier-based logs.
- Resolved the production dependency audit by updating Drizzle packages and applying a scoped esbuild override.

### Next recommended step
- After Railway auto-deploys, send `Я созвонюсь с Анель завтра` and `Составлю КП к вечеру` in a test group; confirm cards appear and a greeting produces no OpenRouter request.

## 2026-07-19 — Handoff

### Done
- Scoped private `/check` to per-chat completed notification onboarding and added regression coverage for an unconnected chat and users without onboarding.

### Risks / blockers
- `/check` has no truncation or pagination. A very large summary can exceed Telegram's 4096-character `sendMessage` limit; this is deferred because changing the output scope was not approved.

### Next recommended step
- Decide whether `/check` should paginate or truncate summaries before teams accumulate enough active commitments to hit Telegram's message limit.
