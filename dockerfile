FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache ffmpeg python3 py3-pip && pip3 install --no-cache-dir --break-system-packages yt-dlp

COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm ci --only=production

COPY server/dist ./server/dist/
COPY dist ./dist/

WORKDIR /app/server

EXPOSE 3001

CMD ["node", "dist/index.js"]
