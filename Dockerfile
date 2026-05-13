FROM node:20-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

ENV NODE_ENV=production

COPY server ./server
COPY artifacts ./artifacts

EXPOSE 3000

CMD ["npm", "start"]
