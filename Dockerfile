# Builds the static PayStream web app and serves it with nginx.
#   docker compose up --build   ->  http://localhost:8080
FROM node:24-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/paystream-sdk/package.json packages/paystream-sdk/
COPY web/package.json web/
COPY agent/package.json agent/
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY packages packages
COPY deployments deployments
COPY web web
ARG VITE_VAULT_ADDRESS
ARG VITE_VAULT_DEPLOY_BLOCK
ENV VITE_VAULT_ADDRESS=$VITE_VAULT_ADDRESS VITE_VAULT_DEPLOY_BLOCK=$VITE_VAULT_DEPLOY_BLOCK
RUN pnpm --filter @paystream/web exec vite build

FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/web/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK CMD wget -qO- http://127.0.0.1:8080/ >/dev/null || exit 1
