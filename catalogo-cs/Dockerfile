FROM node:20-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.34.0 --activate
WORKDIR /app

FROM base AS deps
RUN apk add --no-cache libc6-compat
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json ./backend/package.json
COPY catalogo-cs/package.json ./catalogo-cs/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY catalogo-cs ./catalogo-cs
ARG NEXT_PUBLIC_TELEGRAM_BOT_USERNAME
ENV NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=$NEXT_PUBLIC_TELEGRAM_BOT_USERNAME
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter catalogo-cs build

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/catalogo-cs/public ./catalogo-cs/public
COPY --from=builder --chown=nextjs:nodejs /app/catalogo-cs/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/catalogo-cs/.next/static ./catalogo-cs/.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "catalogo-cs/server.js"]
