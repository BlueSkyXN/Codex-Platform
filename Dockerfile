# syntax=docker/dockerfile:1.7
# Generic self-hosted image for Codex-Platform. The Hugging Face Space image
# lives in cloud/hfs/Dockerfile and fetches this repository by commit SHA.

ARG NODE_VERSION=22-bookworm-slim
ARG INSTALL_CODEX_CLI=true
ARG CODEX_NPM_PACKAGE=@openai/codex
ARG CODEX_NPM_VERSION=latest

FROM node:${NODE_VERSION} AS deps
WORKDIR /opt/app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

FROM node:${NODE_VERSION} AS build
WORKDIR /opt/app
COPY --from=deps /opt/app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:${NODE_VERSION} AS runtime
ARG INSTALL_CODEX_CLI
ARG CODEX_NPM_PACKAGE
ARG CODEX_NPM_VERSION

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    HOME=/home/node \
    WORKSPACE_ROOT=/workspace \
    WORKSPACE_ROOTS=/workspace \
    CODEX_PLATFORM_DATA_DIR=/var/lib/codex-platform \
    CODEX_HOME=/var/lib/codex-platform/codex-home \
    CODEX_BIN=codex \
    CODEX_ARGS=app-server \
    DEMO_MODE=auto

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ca-certificates curl git openssh-client tini procps \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /home/node/app /workspace /var/lib/codex-platform /var/lib/codex-platform/codex-home \
    && chown -R node:node /home/node /workspace /var/lib/codex-platform \
    && if [ "${INSTALL_CODEX_CLI}" = "true" ]; then \
         npm install -g "${CODEX_NPM_PACKAGE}@${CODEX_NPM_VERSION}"; \
       fi

WORKDIR /home/node/app
COPY --chown=node:node package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=build --chown=node:node /opt/app/dist ./dist
COPY --chown=node:node --chmod=755 scripts ./scripts
COPY --chown=node:node docs ./docs

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=5 \
  CMD /home/node/app/scripts/hf-healthcheck.sh

USER node
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/server/server/index.js"]
