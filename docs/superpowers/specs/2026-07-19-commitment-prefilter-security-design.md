# Commitment Prefilter and Dependency Security Design

## Goal

Restore a low-cost message gate so Keepword does not send every group message to the LLM, while recognising common Russian and English commitment wording such as `созвонюсь`, `составлю КП`, and direct assignments.

## Prefilter behavior

- The gate is a deterministic, local function; it makes no network call and stores no message data.
- It accepts an explicit work-action form, a direct assignment, or an action paired with an obligation/deadline cue.
- Supported action families include calls/meetings, drafting/preparing/sending/reviewing, approving, updating, fixing, booking, paying, and follow-up work in Russian and English.
- It must accept: `Я созвонюсь с Анель завтра`, `Составлю КП к вечеру`, `Анель, подготовь смету до пятницы`, and `We will send the contract by Friday`.
- It must reject ordinary conversation and completed/past-tense statements such as `Доброе утро`, `Как прошел созвон?`, and `КП уже отправили клиенту`.
- The LLM remains the authority on whether a passed message is a real commitment. A passed message does not create a task by itself.
- A rejected message is not persisted or sent to OpenRouter. The service emits the safe `message_skipped_by_pre_filter` event with IDs only.

## Dependency security

- Upgrade `drizzle-orm` from `0.44.7` to `0.45.2`, the first version that fixes GHSA-gpj5-g38j-94v9 / CVE-2026-39356.
- Upgrade `drizzle-kit` from `0.31.4` to `0.31.10`, resolving the audited transitive `esbuild` advisory.
- Keep package upgrades limited to these two direct dependencies and their lockfile resolutions.

## Verification

- Run prefilter unit tests first in RED, then GREEN.
- Run the full lint, typecheck, test, build, and production dependency audit commands.
- Confirm that the audit reports no moderate-or-higher production vulnerabilities.
