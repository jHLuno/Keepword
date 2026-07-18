[Earlier entries](docs/archive/HANDOFF-pre-S04.md)

## 2026-07-19 — Handoff

### Done
- Scoped private `/check` to per-chat completed notification onboarding and added regression coverage for an unconnected chat and users without onboarding.

### Risks / blockers
- `/check` has no truncation or pagination. A very large summary can exceed Telegram's 4096-character `sendMessage` limit; this is deferred because changing the output scope was not approved.

### Next recommended step
- Decide whether `/check` should paginate or truncate summaries before teams accumulate enough active commitments to hit Telegram's message limit.

## 2026-07-19 — Handoff

### Done
- Safe production diagnostics now unwrap grammY handler errors.

### Next recommended step
- Redeploy the Web service and inspect the next `telegram_update_dispatch_failed` error code.

## 2026-07-19 — Handoff

### Done
- Delivered private `/check`: the caller sees only their active overdue, open, and blocked commitments across active connected chats, grouped by status and labelled with the source chat.
- Added integration coverage for access scoping and the empty state; updated product documentation.

### Not done
- Manual Railway check was not executed from this workspace: personal `/check` must show only the caller's active tasks.

### Next recommended step
- In Railway, send `/check` to the personal bot and confirm it shows only the caller's active tasks.
