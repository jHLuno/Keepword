# Keepword

Keepword turns team promises in Telegram chats into confirmed commitments.

## Local setup

1. Install Node.js 22 or later and pnpm 10.
2. Run `pnpm install`.
3. Copy `.env.example` to `.env` and supply each required environment variable.

## Commands

- `pnpm dev` — run the HTTP service with file watching.
- `pnpm dev:worker` — run the background worker with file watching.
- `pnpm lint` — check source code style and safety rules.
- `pnpm typecheck` — run the strict TypeScript compiler without emitting files.
- `pnpm test` — run the test suite.
- `pnpm build` — compile TypeScript into `dist/`.
- `pnpm db:generate` — generate Drizzle migrations once the schema is added.
- `pnpm db:migrate` — apply database migrations once they are added.
