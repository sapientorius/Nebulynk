ARG NODE_IMAGE=node:22.23.1-alpine3.24
FROM ${NODE_IMAGE}

WORKDIR /app

RUN apk add --no-cache ffmpeg

# Install exactly the production dependencies recorded in the root workspace
# lockfile. The build context must be the repository root.
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
RUN npm ci --omit=dev --workspace=backend

# Application source
COPY backend ./backend

RUN chown -R node:node /app

USER node

WORKDIR /app/backend

# Port
EXPOSE 3030

# Start
CMD ["npm", "run", "start"]
