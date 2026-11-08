FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json tsconfig.base.json ./
COPY shared-types/package.json ./shared-types/
COPY server/package.json ./server/
COPY client/package.json ./client/

RUN npm install

COPY shared-types ./shared-types
COPY server ./server

RUN npm run build -w @logicforge/shared-types \
 && npm run db:generate -w @logicforge/server \
 && npm run build -w @logicforge/server

EXPOSE 4000
WORKDIR /app/server
CMD ["sh", "-c", "npx prisma migrate deploy && npm run db:seed && node dist/index.js"]
