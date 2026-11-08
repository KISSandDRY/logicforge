FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json tsconfig.base.json ./
COPY shared-types/package.json ./shared-types/
COPY server/package.json ./server/
COPY client/package.json ./client/

RUN npm install

COPY shared-types ./shared-types
COPY client ./client

RUN npm run build -w @logicforge/shared-types \
 && npm run build -w @logicforge/client

FROM nginx:1.27-alpine
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/client/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
