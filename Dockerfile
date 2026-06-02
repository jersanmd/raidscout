# -- RaidScout Discord Bot v3 ---------------------------------
# Multi-stage build: bundle with esbuild (ESM), run with Node.js
# Deploy: fly deploy

# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app

# Install all deps (esbuild needs devDependencies)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build the bot (ESM output)
COPY scripts/ scripts/
RUN npm run build:bot

# Stage 2: Runtime (minimal)
FROM node:22-alpine
WORKDIR /app

# Only install runtime deps (ws)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy bundled bot from builder (ESM format)
COPY --from=builder /app/dist/bot.js dist/bot.js

# Expose HTTP notify port
EXPOSE 3003

# Health check (wget is in Alpine by default via busybox)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://localhost:3003/ || exit 1

CMD ["node", "dist/bot.js"]
