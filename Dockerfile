# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Lockfile is Yarn v1; use classic Yarn so installs succeed in Docker.
RUN npm install -g yarn@1.22.22

COPY package.json yarn.lock .yarnrc.yml ./
RUN yarn install --ignore-engines

COPY . .
ENV DATABASE_URL=postgresql://postgres:postgres@localhost:5432/trading_db
ENV REDIS_URL=redis://127.0.0.1:6379
ENV SECRET_COOKIE_PASSWORD=build-time-secret-cookie-password-32ch
ENV KITE_API_KEY=build
ENV KITE_API_SECRET=build
ENV MOCK_ORDERS=true
RUN yarn build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

RUN npm install -g yarn@1.22.22

ENV NODE_ENV=production
ENV TZ=Asia/Kolkata

COPY package.json yarn.lock .yarnrc.yml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/pages ./pages
COPY --from=builder /app/next.config.js ./
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/server.js ./
COPY --from=builder /app/otel.js ./
COPY --from=builder /app/bootup.js ./
COPY --from=builder /app/drizzle.config.js ./
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/scripts ./scripts

EXPOSE 3000

HEALTHCHECK --interval=90s --timeout=13s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

CMD ["sh", "./scripts/docker-entrypoint.sh"]

# Dev stage — source mounted via docker-compose volume
FROM node:20-alpine AS dev

WORKDIR /app

RUN npm install -g yarn@1.22.22

COPY package.json yarn.lock .yarnrc.yml ./
RUN yarn install --ignore-engines

ENV TZ=Asia/Kolkata
EXPOSE 3000
CMD ["yarn", "run", "dev"]
