FROM node:22-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.34.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json ./backend/package.json
COPY catalogo-cs/package.json ./catalogo-cs/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY backend ./backend
RUN pnpm --filter backend build

FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json ./backend/package.json
COPY catalogo-cs/package.json ./catalogo-cs/package.json
RUN pnpm install --prod --frozen-lockfile --filter backend...

FROM base AS runner
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nestjs

COPY --from=prod-deps --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=prod-deps --chown=nestjs:nodejs /app/backend/node_modules ./backend/node_modules
COPY --from=builder --chown=nestjs:nodejs /app/backend/dist ./backend/dist
COPY --from=builder --chown=nestjs:nodejs /app/backend/package.json ./backend/package.json

WORKDIR /app/backend
USER nestjs
EXPOSE 4000
CMD ["node", "dist/main"]
