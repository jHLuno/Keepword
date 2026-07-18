# Trust Memory, Calibration, and Cross-Chat Execution Design

## Product thesis

Keepword is not only an extractor of tasks. It remembers agreements, learns which suggestions a specific team accepts, and makes follow-through visible without exposing one team's data to another.

> Extraction is commodity; trust, memory, and calibration are the product.

## Scope and privacy boundary

- Every record remains scoped to its `workspace_id` and `chat_id`.
- An administrator sees reliability only for members and commitments of the Telegram group where they are currently an administrator.
- No admin can see a user's commitments, reliability, suggestions, or calibration signals from another group.
- A participant sees only their own cross-chat commitments and personal aggregate.
- Group data deletion cascades to commitment memory, suggestion events, calibration aggregates, and reliability data for that chat.
- Reliability is private to the assignee and the current admins of that chat. It is never posted into the group and is not a public leaderboard.

## 1. Actionable cross-chat `/check`

`/check` remains a personal, private cross-chat view over the caller's active commitments from groups where they completed personal-notification onboarding.

Each rendered commitment includes its source-chat label and actions:

```text
📋 Мои обязательства · 1/2

🔴 Просрочены
— [Case Lab] Отправить КП · вчера
[Готово] [Перенести] [Блокер]

🟡 Открытые
— [Marketing] Составить смету · сегодня
[Готово] [Перенести] [Блокер]
```

- Reuse the existing signed, one-time commitment callbacks and authorization service.
- The assignee may update their task; a current administrator of that task's source chat may also update it. Callback resolution derives the source chat server-side.
- Show at most five commitments per page to stay within Telegram text and inline-keyboard limits. Provide previous/next page controls when needed.
- `completed` and `cancelled` remain hidden from `/check`.
- A successful action acknowledges the update and leaves the user able to refresh with `/check`; no client-provided chat or commitment scope is trusted.

## 2. Immutable agreement and decision memory

Existing `commitment_suggestions` is mutable during edit, so it cannot alone show what the AI originally proposed. Add an append-only `suggestion_events` history scoped to one chat and workspace.

Every suggestion records:

- `suggested`: immutable original candidate snapshot (title, description, assignee, due text, confidence, source message IDs).
- `edited`: actor ID plus the before/after snapshot or changed fields.
- `confirmed`: actor ID and final snapshot.
- `rejected`: actor ID and final rejection outcome.

This creates agreement memory: what the team agreed to, how it changed, who made the decision, and how the agreement ended. It is not a raw chat-history store and never exports events across chats.

## 3. Team-local calibration

Calibration metrics are derived only from `suggestion_events` in the same `workspace_id` and `chat_id` pair:

- confirm-as-proposed rate;
- edited-before-confirmation rate;
- rejection rate;
- counts by AI confidence band and optional action family.

The first production version is observation plus policy readiness:

- Do not adjust behavior until a chat has at least 30 resolved suggestions in the preceding 90 days.
- Retain the current global safe default: public suggestions require `high` confidence.
- Show calibration only in a private admin digest as an aggregate, for example: `Keepword accuracy: 78% accepted as proposed · 14% edited · 8% rejected`.
- The next calibration iteration adds a numeric confidence score and adjusts a chat-local suggestion threshold by small bounded steps. It must never learn from another chat or lower below the global safe threshold.

## 4. Reliability: keeping your word

Reliability is derived from confirmed commitments in a rolling 30-day window, scoped to one chat:

- **On time:** `completed_at` exists and is at or before `due_at`.
- **Late completion:** `completed_at` exists after `due_at`.
- **Unresolved overdue:** current status is `overdue`.
- Exclude cancelled commitments and commitments without an exact `due_at` from the denominator.
- Do not surface a personal metric until the assignee has at least three eligible commitments in that chat during the window.

The personal `/check` can include the caller's own all-connected-chats summary. The admin digest has a private group-only reliability section, for example:

```text
🤝 Keeping commitments · last 30 days
— Данияр: 9/10 on time
— Алия: 4/5 on time
```

The digest lists only members of that chat with enough eligible data. It includes no cross-group totals, no ranking language, and no public group message.

## Delivery sequence

1. Add actionable paginated `/check` with existing commitment callbacks.
2. Add immutable suggestion events and cover confirm, edit-then-confirm, and reject flows.
3. Add calibration aggregates to the private admin digest, without automated policy changes.
4. Add chat-scoped reliability aggregates to the private admin digest and the caller's `/check` summary.
5. After real outcome data exists, add bounded per-workspace numeric-threshold calibration.

## Tests

- `/check` never exposes another user's tasks or any task from an unconnected/inactive chat, including through callbacks and pagination.
- An assignee can complete, block, or reschedule from `/check`; an unrelated participant cannot.
- Pagination has no duplicate task and no Telegram-size overflow.
- Event history preserves the original suggestion after one or more edits.
- Confirm/reject/edit events are scoped and deleted with the chat.
- Calibration excludes other workspaces and insufficient-sample workspaces.
- Reliability excludes cancelled/no-deadline work and does not aggregate across chats.
- Only current admins receive a group reliability digest.
