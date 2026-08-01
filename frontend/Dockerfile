# Stage 1: Build
ARG NODE_IMAGE=node:22.23.1-alpine3.24
ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:1.31-alpine3.23@sha256:6320020c7da8714feab524e02c08c5a1958675c4e68700e93a2fd8970b065786
FROM ${NODE_IMAGE} as build-stage
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/package.json
RUN npm ci --workspace=frontend

COPY frontend ./frontend
WORKDIR /app/frontend

# Argumente, die beim Build von Coolify übergeben werden
ARG VITE_API_URL
ARG VITE_LIVEKIT_URL
ARG VITE_VAPID_PUBLIC_KEY
ARG VITE_AUTH_CSRF_COOKIE_NAME
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_LIVEKIT_URL=$VITE_LIVEKIT_URL
ENV VITE_VAPID_PUBLIC_KEY=$VITE_VAPID_PUBLIC_KEY
ENV VITE_AUTH_CSRF_COOKIE_NAME=$VITE_AUTH_CSRF_COOKIE_NAME

RUN npm run build
RUN node scripts/render-nginx-conf.mjs --out /tmp/nginx/default.conf

# Stage 2: Serve via Nginx
FROM ${NGINX_IMAGE} as production-stage
COPY --from=build-stage /app/frontend/dist /usr/share/nginx/html
COPY --from=build-stage /tmp/nginx/default.conf /etc/nginx/conf.d/default.conf
USER 101
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
