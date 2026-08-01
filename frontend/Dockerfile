# Stage 1: Build
FROM node:22-alpine as build-stage
WORKDIR /app
COPY package*.json ./
RUN npm i

COPY . .

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
FROM nginxinc/nginx-unprivileged:alpine as production-stage
COPY --from=build-stage /app/dist /usr/share/nginx/html
COPY --from=build-stage /tmp/nginx/default.conf /etc/nginx/conf.d/default.conf
USER 101
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
