# Contextual actions UX design

## Goal

Make Keepword's Telegram actions self-explanatory: users edit a detected
agreement in its source group, reschedule an overdue personal commitment in
private chat, and act on one selected commitment at a time from `/check`.

## Product decisions

### 1. Edit a suggestion in its source group

- The **Edit** button on a detected group suggestion stays in that group.
- The source author or a current administrator of that same source chat may
  start the edit flow. Other users are denied without consuming the action.
- On an authorized press, Keepword immediately removes the original card's
  inline keyboard and marks the card as being edited. It posts a short group
  instruction that the authorized user must reply to, for example:

  ```text
  Reply to this message with the fields to change:
  title: Send the proposal
  due: tomorrow 18:00
  ```

  Russian aliases `название:` and `срок:` are accepted as well.
- The edit session is bound server-side to the actor, source workspace and
  chat, pending suggestion, instruction message, and expiry. A reply in a
  different chat, from another user, or after expiry never edits the
  suggestion.
- When parsing succeeds, Keepword leaves the old card disabled and posts a
  **new revised suggestion card** with Confirm / Edit / Reject buttons. The
  revised card requires its own explicit confirmation; this preserves the MVP
  rule that no commitment is created without confirmation.

### 2. Reschedule remains a private overdue flow

- **Reschedule** from a private overdue reminder remains in the private chat.
- On an authorized press, Keepword removes the reminder card's buttons and
  asks for the new deadline in that private chat. The private session remains
  bound to the authorized actor and the original source commitment.
- The parser accepts future absolute and relative dates in the source chat's
  configured timezone:

  ```text
  сегодня в 22:00
  сегодня 22:00
  завтра 18:00
  в пятницу
  today 22:00
  tomorrow 18:00
  2026-07-20 22:00
  ```

- A past same-day time receives a specific explanation. An unrecognised date
  receives concise examples and keeps the private session open for retry.

### 3. Inline buttons are single-use UI controls

- After an **authorized** press of any action button, Keepword edits the
  original bot message and removes that message's inline keyboard before
  starting the follow-up flow or reporting the result.
- This rule applies to group suggestion actions, private reminder actions,
  `/check` selection and lifecycle actions, and future group settings buttons.
- Denied presses do not consume or remove another user's valid control.
- When an edit creates a revised suggestion, it is a new card with fresh
  controls; the old card remains disabled. A completed, blocked, cancelled or
  rescheduled card does not regain controls.

### 4. `/check` is a commitment picker, then a detail card

- `/check` first shows the caller's active commitments from their personally
  connected chats as compact, labelled selection rows. It never renders a
  shared three-button lifecycle grid below multiple tasks.
- The list is paginated when needed. Each button opens exactly one selected
  commitment; its callback contains only an opaque, actor-bound, expiring,
  one-time server token.
- The selected detail card shows the commitment title, source chat, status and
  deadline, followed by only that commitment's **Done**, **Blocked** and
  **Reschedule** actions plus **Back to list**.
- After an authorized lifecycle action, Keepword disables the selected detail
  card and refreshes the private picker so the user can continue with another
  commitment without ambiguous controls.
- Selecting Back replaces the detail card with the same list page. It is a
  navigation state transition, so its prior controls disappear and the newly
  rendered list owns fresh controls.

### 5. Settings have an explicit scope

- Private `/settings` controls only the caller's personal notification
  delivery for connected chats.
- Group-wide settings are changed only by a current administrator in the
  source group. Bare `/settings` in a group renders the current group
  configuration and concise commands:

  ```text
  /settings mode suggest|manual|silent_digest
  /settings language auto|ru|en|es
  /settings timezone Asia/Almaty
  /settings digest 19:00
  ```

- Private help explicitly points an administrator to run group configuration
  commands in the relevant group. Private users cannot change group-wide
  configuration.

## Security and privacy invariants

- Every read, edit session and callback resolves its real workspace and source
  chat server-side; Telegram callback data never supplies trusted scope.
- `/check` reveals only the caller's commitments from chats where that caller
  personally completed private onboarding.
- Group actions remain authorised only for the source author or a current
  administrator of that source chat, as appropriate. Private lifecycle and
  reschedule actions remain authorised only for the assignee or a current
  administrator of the original source chat.
- Message text and secrets are not added to logs.

## Acceptance tests

1. A Russian future private deadline, including `сегодня в 22:00`, is stored
   using the source chat timezone; a past same-day time reports that it has
   already passed.
2. A group edit from the source author disables the old suggestion card, only
   accepts the actor's reply in that group, and emits a revised confirmation
   card. A foreign user/chat cannot submit the session.
3. Each authorized callback disables its originating card; an unauthorised
   attempt leaves its valid control available.
4. `/check` lists commitment pickers, opens one unambiguous detail card, and
   lifecycle actions affect only the selected commitment.
5. Private `/settings` cannot change a chat; group `/settings` explains and
   accepts only current-admin group configuration.
