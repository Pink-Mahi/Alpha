# Shared Dockerfile for Bun-based TS services.
# Usage: docker build -f Dockerfile.ts --build-arg SERVICE_DIR=services/control-plane .
FROM oven/bun:1.3.14-slim AS base

ARG SERVICE_DIR

WORKDIR /app

# Copy lockfile and install deps
COPY package.json bun.lock ./
COPY ${SERVICE_DIR}/package.json ./package.json.tmp
RUN bun install --frozen-lockfile --production

# Copy the service source
COPY ${SERVICE_DIR} ./service
COPY shared/ ./shared

# Set the service-specific env
ENV NODE_ENV=production

# The service's entrypoint
CMD ["bun", "service/src/index.ts"]
