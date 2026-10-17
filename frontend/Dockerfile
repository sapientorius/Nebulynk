# Stage 1: Build
ARG NODE_IMAGE=node:22.23.1-alpine3.24
ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:1.31-alpine3.23@sha256:6320020c7da8714feab524e02c08c5a1958675c4e68700e93a2fd8970b065786
FROM ${NODE_IMAGE} AS build-stage
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/package.json
RUN npm ci --workspace=frontend

COPY frontend ./frontend
WORKDIR /app/frontend

# Do not read developer .env files or deployment-specific values during build.
RUN mkdir -p /tmp/nebulynk-empty-env
ENV NEBULYNK_CI_STRICT=true NEBULYNK_ENV_FILE=/tmp/nebulynk-empty-env/empty.env
RUN npm run build

# Stage 2: Serve via Nginx
FROM ${NGINX_IMAGE} AS production-stage
ARG BUILD_SHA
ARG BUILD_TIME
ARG BUILD_VERSION
LABEL org.opencontainers.image.source="https://github.com/sapientorius/Nebulynk" \
      org.opencontainers.image.licenses="BUSL-1.1" \
      org.opencontainers.image.revision=$BUILD_SHA \
      org.opencontainers.image.created=$BUILD_TIME \
      org.opencontainers.image.version=$BUILD_VERSION
COPY --from=build-stage /app/frontend/dist /usr/share/nginx/html
COPY frontend/package.json frontend/security-headers.config.js /opt/nebulynk/frontend/
COPY frontend/scripts/render-nginx-conf.mjs frontend/scripts/frontend-runtime-config.mjs frontend/scripts/start-frontend.sh /opt/nebulynk/frontend/scripts/
COPY LICENSE /licenses/LICENSE
# The Plesk helper keeps the source tree private. Normalize the public
# document root before dropping privileges so Nginx can serve every asset.
USER root
RUN chmod -R a+rX /usr/share/nginx/html
RUN apk upgrade --no-cache && apk add --no-cache nodejs && chmod -R a+rX /opt/nebulynk /licenses \
    && sed -i 's/\r$//' /opt/nebulynk/frontend/scripts/start-frontend.sh
USER 101
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["sh", "/opt/nebulynk/frontend/scripts/start-frontend.sh"]
