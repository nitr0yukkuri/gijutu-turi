FROM node:22-bookworm-slim AS build
RUN node -e 'const [major, minor, patch] = process.versions.node.split(".").map(Number); if (major !== 22 || minor < 23 || (minor === 23 && patch < 4)) throw new Error("Node.js 22.23.4+ is required");'

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
RUN node -e 'const [major, minor, patch] = process.versions.node.split(".").map(Number); if (major !== 22 || minor < 23 || (minor === 23 && patch < 4)) throw new Error("Node.js 22.23.4+ is required");'

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080
ENV GIJUTU_DB_PATH=/tmp/gijutu-turi.sqlite

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/assets ./assets
COPY --from=build /app/vendor ./vendor
COPY --from=build /app/src ./src
COPY --from=build /app/manifest.webmanifest ./manifest.webmanifest
EXPOSE 8080

CMD ["node", "dist/index.js"]
