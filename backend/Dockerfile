FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache ffmpeg

# Dependencies
COPY package*.json ./
RUN npm i --omit=dev

# Source
COPY . .

RUN chown -R node:node /app

USER node

# Port
EXPOSE 3030

# Start
CMD ["npm", "run", "start"]
