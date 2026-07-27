# syntax=docker/dockerfile:1.7
# Hugging Face Docker Space adapter for Codex-Platform.
# This file is uploaded as the Space-root Dockerfile by the deploy workflow.

ARG NODE_VERSION=22-bookworm-slim
ARG CODEX_PLATFORM_REPO=https://github.com/BlueSkyXN/Codex-Platform.git
ARG CODEX_PLATFORM_REF=main
ARG CODEX_PLATFORM_COMMIT=HEAD
ARG INSTALL_CODEX_CLI=true
ARG CODEX_NPM_PACKAGE=@openai/codex
ARG CODEX_NPM_VERSION=latest

FROM node:${NODE_VERSION} AS source
ARG CODEX_PLATFORM_REPO
ARG CODEX_PLATFORM_REF
ARG CODEX_PLATFORM_COMMIT
WORKDIR /opt
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git \
    && rm -rf /var/lib/apt/lists/* \
    && git clone --filter=blob:none "${CODEX_PLATFORM_REPO}" /opt/source \
    && cd /opt/source \
    && if [ "${CODEX_PLATFORM_COMMIT}" != "HEAD" ]; then \
         git fetch --depth=1 origin "${CODEX_PLATFORM_COMMIT}" && git checkout --detach "${CODEX_PLATFORM_COMMIT}"; \
       fi \
    && git rev-parse HEAD > /opt/source/.codex-platform-build-sha

FROM node:${NODE_VERSION} AS deps
WORKDIR /opt/source
COPY --from=source /opt/source/package.json /opt/source/package-lock.json* ./
RUN npm ci --no-audit --no-fund

FROM node:${NODE_VERSION} AS build
WORKDIR /opt/source
COPY --from=source /opt/source ./
COPY --from=deps /opt/source/node_modules ./node_modules
RUN npm run build

FROM node:${NODE_VERSION} AS runtime
ARG INSTALL_CODEX_CLI
ARG CODEX_NPM_PACKAGE
ARG CODEX_NPM_VERSION

ENV NODE_ENV=production \
    CODEX_PLATFORM_HF_SPACE=true \
    CODEX_WEB_HF_SPACE=true \
    HOST=0.0.0.0 \
    PORT=7860 \
    HOME=/home/node \
    CODEX_PLATFORM_HF_STORAGE_ROOT=/data \
    CODEX_WEB_HF_STORAGE_ROOT=/data \
    WORKSPACE_ROOT=/data/workspace \
    WORKSPACE_ROOTS=/data/workspace \
    CODEX_PLATFORM_DATA_DIR=/data/codex-platform \
    CODEX_WEB_DATA_DIR=/data/codex-platform \
    CODEX_HOME=/data/codex-home \
    CODEX_BIN=codex \
    CODEX_ARGS=app-server \
    DEMO_MODE=auto \
    CODEX_PLATFORM_AUTO_CREATE_WORKSPACE=true \
    CODEX_WEB_AUTO_CREATE_WORKSPACE=true

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ca-certificates curl git openssh-client tini procps \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /home/node/app /data/workspace /data/codex-platform /data/codex-home \
    && chown -R node:node /home/node /data \
    && if [ "${INSTALL_CODEX_CLI}" = "true" ]; then \
         npm install -g "${CODEX_NPM_PACKAGE}@${CODEX_NPM_VERSION}"; \
       fi

WORKDIR /home/node/app
COPY --from=source --chown=node:node /opt/source/package.json /opt/source/package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=build --chown=node:node /opt/source/dist ./dist
COPY --from=source --chown=node:node --chmod=755 /opt/source/scripts ./scripts
COPY --from=source --chown=node:node /opt/source/docs ./docs
COPY --from=source --chown=node:node /opt/source/.codex-platform-build-sha ./BUILD_SHA

EXPOSE 7860

HEALTHCHECK --interval=30s --timeout=10s --start-period=45s --retries=5 \
  CMD /home/node/app/scripts/hf-healthcheck.sh

USER node
ENTRYPOINT ["/usr/bin/tini", "--", "/home/node/app/scripts/hf-entrypoint.sh"]
