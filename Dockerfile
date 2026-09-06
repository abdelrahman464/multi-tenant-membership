# syntax=docker/dockerfile:1
#
# Multi-stage image for the membership API.
# The image compiles TypeScript itself so a Linux deploy host does not need Node
# except inside this container.
#
# Stages:
#   deps    — npm ci (full tree, including Nest CLI / TypeScript)
#   build   — nest build → dist/
#   prod    — production node_modules only
#   runner  — dist + prod modules, non-root user, healthcheck

ARG NODE_VERSION=22.14.0

FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY nest-cli.json tsconfig.json tsconfig.build.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate && npx nest build

FROM node:${NODE_VERSION}-bookworm-slim AS prod
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npx prisma generate && npm cache clean --force

FROM node:${NODE_VERSION}-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8000
ARG APP_VERSION=0.1.0
ENV APP_VERSION=${APP_VERSION}

COPY --from=prod --chown=node:node /app/node_modules ./node_modules
COPY --from=prod --chown=node:node /app/package.json ./package.json
COPY --from=prod --chown=node:node /app/prisma ./prisma
COPY --from=prod --chown=node:node /app/prisma.config.ts ./prisma.config.ts
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER node
EXPOSE 8000

# Node 22 has global fetch. Fail the container if the process cannot serve liveness.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8000)+'/api/v1/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["./docker-entrypoint.sh"]
