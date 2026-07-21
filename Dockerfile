FROM node:22-alpine AS build

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . ./
RUN pnpm build
RUN npm ci --prefix landing && npm run build --prefix landing

FROM node:22-alpine AS production

WORKDIR /app
ENV NODE_ENV=production

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/dist ./dist
COPY --from=build /app/landing/out ./public/landing
COPY drizzle.config.ts ./
COPY src/db/schema.ts ./src/db/schema.ts
COPY src/db/migrations ./src/db/migrations

USER node

CMD ["node", "dist/src/main.js"]
