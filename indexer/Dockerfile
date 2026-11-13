# syntax=docker/dockerfile:1
# COUR Ponder indexer — production image.
# NOTE: Docker was not available in the build environment, so this image was
# NOT built/tested locally. Validate with `docker build .` before deploying.
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

# ---- dependencies (cached layer) ----
FROM base AS deps
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
# NOTE: no BuildKit cache mount — Railway's builder requires a cacheKey-prefixed
# id, so a plain install is used for portability.
RUN pnpm install --frozen-lockfile || pnpm install

# ---- runtime ----
FROM base AS runner
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Ponder serves GraphQL + REST on 42069 by default.
EXPOSE 42069

# `ponder start` runs the indexer + HTTP server against Postgres (DATABASE_URL).
CMD ["pnpm", "start", "--", "--schema", "public"]
