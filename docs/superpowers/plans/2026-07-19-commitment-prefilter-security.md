# Commitment Prefilter and Dependency Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task.

**Goal:** Restore broad but selective LLM candidate filtering and remove current production dependency advisories.

**Architecture:** A pure `isPotentialCommitment` function recognises explicit Russian/English task-action forms and obligation/deadline cues. `createAnalyzeGroupMessage` invokes it before loading context, persisting a source message, or calling OpenRouter. Dependencies are upgraded only to audited fixed releases.

**Tech Stack:** TypeScript, Vitest, Drizzle ORM/Kit, pnpm.

## Global Constraints

- No rejected message is persisted or sent to OpenRouter.
- The prefilter retains `созвонюсь`, `составлю КП`, direct assignments, and English commitments.
- The prefilter rejects greetings, discussion questions, and completed past-tense messages.
- Do not log message text or secrets.
- Direct versions are `drizzle-orm@0.45.2` and `drizzle-kit@0.31.10`; `pnpm-workspace.yaml` pins `@esbuild-kit/core-utils>esbuild` to `0.28.1`.

### Task 1: Restore prefilter

**Files:** Create `src/ai/prefilter.ts`, create `tests/unit/prefilter.test.ts`, modify `src/services/analyze-message.ts`.

1. Create failing unit tests for the four accepted phrases and the three rejected phrases in the design.
2. Run `pnpm vitest run tests/unit/prefilter.test.ts`; it must fail because the module does not exist.
3. Implement explicit Russian/English task-action, directive, obligation, and deadline patterns. Require an action form; do not use an unbounded noun stem such as `созвон`.
4. In `createAnalyzeGroupMessage`, call the prefilter after resolving the active chat and before context lookup or extraction. On rejection, log `message_skipped_by_pre_filter` with identifiers only and return `skipped`.
5. Run `pnpm vitest run tests/unit/prefilter.test.ts tests/integration/suggestions.test.ts`.

### Task 2: Upgrade dependencies

**Files:** Modify `package.json`, `pnpm-lock.yaml`, and `pnpm-workspace.yaml`.

1. Run `pnpm up drizzle-orm@0.45.2 drizzle-kit@0.31.10`.
2. Add the root `pnpm-workspace.yaml` override `"@esbuild-kit/core-utils>esbuild": 0.28.1`, preserving the single-package workspace declaration.
3. Verify `pnpm why drizzle-orm`, `pnpm why drizzle-kit`, `pnpm why esbuild`, `pnpm audit --prod --audit-level=moderate`, and `pnpm exec drizzle-kit --version`.

### Task 3: Verify and document

**Files:** Modify `PROJECT.md`, `CHANGELOG.md`, and `HANDOFF.md`.

1. Run `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
2. Document the candidate-filter behavior, dependency upgrade, and actual verification results.
3. Commit and push the source, tests, lockfile, and documentation to `main`.
