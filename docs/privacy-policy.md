# Keepword privacy policy

_Template for the operator who deploys Keepword. Replace the bracketed placeholders
(`[…]`) before publishing, and link this document from your bot description and
onboarding. Last reviewed: 2026-07-19._

Keepword is a Telegram bot that turns team promises in group chats into confirmed,
tracked commitments. This policy explains what data Keepword processes, why, and how
a team can review or delete it.

## Who is responsible

The data controller is **[operator / company name]**, contactable at
**[privacy contact email]**. Keepword is self-hosted by the operator; each
deployment is independent.

## When Keepword processes data

Keepword only processes **new messages sent after it is added to a group**. It never
reads message history, and it does not process messages in chats where it is not a
member. A chat administrator can further restrict this with the chat mode
(`/settings mode suggest|manual|silent_digest`).

## What data Keepword stores

- **Identifiers:** Telegram user IDs, chat IDs, and workspace IDs.
- **Profile fields:** first name and, if set, username — used to label commitments
  and address reminders.
- **Chat metadata:** chat title, configured language, time zone, and daily summary time.
- **Commitment content:** the title, optional description, deadline, and the **text of
  the specific source message** that a confirmed commitment is based on. Messages that
  do not become a confirmed commitment are not retained as commitment sources.
- **Operational records:** suggestion decisions (suggested / edited / confirmed /
  rejected), reminder and digest delivery records (for idempotency), and callback tokens.

Keepword does **not** store full chat transcripts, and it does **not** write message
text, names, or secrets to application logs.

## How data is used

- To detect a possible commitment, the message under review and up to four recent
  messages for context are sent to the language model provider **OpenRouter**
  ([openrouter.ai](https://openrouter.ai)) for extraction. This is a third-party
  sub-processor; review their terms before deployment.
- Confirmed commitments drive private reminders, overdue alerts, and daily summaries.
- Aggregated reliability and calibration metrics are shown only to the relevant person
  or a current chat administrator, and only above a minimum threshold.

Keepword does not sell data, does not use it for advertising, and does not use it to
train models beyond what is necessary to return a single extraction result.

## Legal basis and purpose limitation

Data is processed to provide the commitment-tracking service the team has chosen to use
(legitimate interest / performance of the tool). It is used only for that purpose.

## Retention and deletion

- A current chat administrator can delete all of a chat's data by sending
  `/privacy delete` in that group. This deactivates the chat and removes its source
  messages, suggestions, suggestion events, commitments, onboarding tokens, and
  deliveries. Other chats are unaffected.
- Removing Keepword from a group stops all further processing for that group.
- A member can disable their personal notifications at any time with `/settings off`.

## Your requests

To access, correct, or delete data, or to ask a question about this policy, contact
**[privacy contact email]**. For a single group, the fastest route is `/privacy delete`
by a current administrator.

## Changes

Material changes to this policy will be announced through **[channel]** and reflected in
the "Last reviewed" date above.
