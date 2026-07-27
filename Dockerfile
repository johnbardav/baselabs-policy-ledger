FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY nest-cli.json tsconfig.json tsconfig.build.json tsconfig.frontend.json ./
COPY src ./src
COPY frontend ./frontend
COPY public ./public
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi \
  && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY migrations ./migrations
COPY scripts ./scripts
COPY data ./data

EXPOSE 3000
CMD ["sh", "-c", "node scripts/wait-for-db.mjs && node scripts/migrate.mjs && node scripts/seed.mjs && node dist/main.js"]
