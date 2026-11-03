FROM node:24-alpine AS frontend
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.ts tsconfig*.json ./
COPY src ./src
RUN npm run build

FROM node:24-alpine AS backend
WORKDIR /build/server
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/tsconfig.json ./
COPY server/src ./src
RUN npm run build && npm prune --omit=dev

FROM node:24-alpine AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001 DATA_DIR=/app/data DIST_DIR=/app/dist
WORKDIR /app
COPY --from=backend --chown=node:node /build/server/package.json ./server/package.json
COPY --from=backend --chown=node:node /build/server/node_modules ./server/node_modules
COPY --from=backend --chown=node:node /build/server/dist ./server/dist
COPY --from=frontend --chown=node:node /build/dist ./dist
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3001
CMD ["node", "server/dist/index.js"]
