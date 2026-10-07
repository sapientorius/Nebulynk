ARG NODE_IMAGE=node:22.23.1-alpine3.24
FROM ${NODE_IMAGE} AS runtime
ARG BUILD_SHA
ARG BUILD_TIME
ARG BUILD_VERSION
ENV NEBULYNK_BUILD_SHA=$BUILD_SHA NEBULYNK_BUILD_TIME=$BUILD_TIME
LABEL org.opencontainers.image.source="https://github.com/sapientorius/Nebulynk" \
      org.opencontainers.image.licenses="BUSL-1.1" \
      org.opencontainers.image.revision=$BUILD_SHA \
      org.opencontainers.image.created=$BUILD_TIME \
      org.opencontainers.image.version=$BUILD_VERSION

WORKDIR /app

RUN apk upgrade --no-cache && apk add --no-cache ffmpeg

# Install exactly the production dependencies recorded in the root workspace
# lockfile. The build context must be the repository root.
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
RUN npm ci --omit=dev --workspace=backend \
    && rm -rf /root/.npm /usr/local/lib/node_modules/npm /opt/yarn-* \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/yarn /usr/local/bin/yarnpkg

# Application source
COPY backend ./backend
COPY LICENSE /licenses/LICENSE

RUN node -e "require('fs').writeFileSync('backend/container-build-info.json', JSON.stringify({sha:process.env.NEBULYNK_BUILD_SHA||null,built_at:process.env.NEBULYNK_BUILD_TIME||null}))"
RUN chown -R node:node /app

USER node

WORKDIR /app/backend

FROM runtime AS transcription-worker
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD node src/transcription-worker-health.js
CMD ["node", "src/transcription-worker.js"]

# Keep the API last so existing builds without --target still start the backend.
FROM runtime AS backend
HEALTHCHECK --interval=10s --timeout=3s --start-period=60s CMD node -e "fetch('http://127.0.0.1:'+(process.env.BACKEND_PORT||3030)+'/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Port
EXPOSE 3030

# Start
CMD ["node", "src/index.js"]
