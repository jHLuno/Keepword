# Private `/check` Design

## Goal

Let a user view all of their active Keepword commitments in a personal chat with the bot.

## Scope

- Add the private command `/check`.
- Include only commitments assigned to the requesting Telegram user.
- Include commitments only from active chats where that user completed private-notification onboarding.
- Include statuses `overdue`, `open`, and `blocked`; exclude `completed` and `cancelled`.
- Never show another user's commitments or any commitment from an unconnected/inactive chat.
- Keep existing `/tasks` behavior unchanged: it remains a per-group task view.

## Output

`/check` always returns one private message:

```text
📋 Мои обязательства

🔴 Просрочены
— [Case Lab] Отправить КП · сегодня

🟡 Открытые
— [Marketing] Подготовить отчёт · завтра

🟠 Есть блокер
— [Case Lab] Согласовать бюджет
```

Sections with no tasks are omitted. If the user has no active commitments, the reply is:

```text
📋 Мои обязательства

— активных обязательств нет
```

The chat title appears on every item so a user with multiple connected groups can identify its source. A due-date phrase appears only when it was stored with the commitment.

## Architecture

- Extend `createPrivateCommandHandler` in `src/telegram/handlers/commands.ts` with a read-only `/check` branch.
- Query commitments joined with `users` and `chats`, scoped by the requesting Telegram ID, `users.privateChatStartedAt`, and `chats.isActive`.
- Order by status section (`overdue`, `open`, `blocked`), then due date, then creation time.
- Render from a small pure helper in the commands module; no new database table, migration, LLM call, or Telegram callback is required.
- Add `/check` to personal help text and group-command guidance.

## Error handling and privacy

- A user without a completed personal onboarding receives the existing onboarding guidance.
- Database failures continue through the existing private-update error boundary and are logged without commitment text.
- The query must never rely on a client-provided chat ID; it is scoped solely using the authenticated Telegram update sender.

## Tests

- One connected user receives their tasks from two active chats, grouped by status.
- A task assigned to another user is absent.
- Completed, cancelled, and inactive-chat tasks are absent.
- A user without connected chats receives onboarding guidance.
- Existing `/tasks` per-group behavior remains unchanged.
