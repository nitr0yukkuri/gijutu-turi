FROM node:22-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-slim AS runtime

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
COPY --from=build /app/go-fish-viewer.css ./go-fish-viewer.css
COPY --from=build /app/docker-whale-viewer.css ./docker-whale-viewer.css

EXPOSE 8080

CMD ["node", "dist/index.js"]
