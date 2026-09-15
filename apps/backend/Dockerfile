# ============================================================
# Barakah Finance POS — Backend Dockerfile
# Multi-stage build: builder → production
# ============================================================

# ── Stage 1: Builder ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (layer-cached until package.json changes)
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# ── Prisma generate in its OWN layer ─────────────────────────────────────────
# Separating this from `npm run build` prevents EPERM rename errors:
#   - In multi-stage builds the .prisma/client directory is writable here
#   - The query_engine .node file is placed cleanly without race conditions
# Note: --schema flag is explicit to avoid ambiguity in monorepo layouts
RUN npx prisma generate --schema=prisma/schema.prisma

# Build NestJS application
RUN npm run build

# ── Stage 2: Production ───────────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Minimal runtime setup
RUN apk add --no-cache dumb-init

ENV NODE_ENV=production

# Production deps only
COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev

# Compiled JS
COPY --from=builder /app/dist ./dist

# Prisma client (compiled query engine)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Prisma schema + migrations (needed for prisma migrate deploy at startup)
COPY --from=builder /app/prisma ./prisma

# Runtime directories
RUN mkdir -p uploads logs

EXPOSE 3001

# Drop root privileges
USER node

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main"]
