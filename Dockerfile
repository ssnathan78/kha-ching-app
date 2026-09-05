# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn/releases ./.yarn/releases
RUN yarn install --immutable

COPY . .
ENV DATABASE_URL=postgresql://postgres:postgres@localhost:5432/trading_db
ENV REDIS_URL=redis://127.0.0.1:6379
ENV SECRET_COOKIE_PASSWORD=build-time-secret-cookie-password-32ch
ENV KITE_API_KEY=build
ENV KITE_API_SECRET=build
ENV MOCK_ORDERS=true
ENV NEXT_PUBLIC_DEFAULT_LOTS=1
ENV NEXT_PUBLIC_DEFAULT_SKEW_PERCENT=10
ENV NEXT_PUBLIC_DEFAULT_SLM_PERCENT=30
    RUN yarn unit-test --forceExit
    ENV NODE_ENV=production
    RUN yarn build

# Production stage
FROM node:22-alpine AS production

WORKDIR /app

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

ENV NODE_ENV=production
ENV TZ=Asia/Kolkata

COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn/releases ./.yarn/releases
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/pages ./pages
COPY --from=builder /app/components ./components
COPY --from=builder /app/types ./types
COPY --from=builder /app/next.config.js ./
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/server.js ./
COPY --from=builder /app/otel.js ./
COPY --from=builder /app/bootup.js ./
COPY --from=builder /app/drizzle.config.js ./
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/scripts ./scripts
RUN sed -i 's/\r$//' ./scripts/docker-entrypoint.sh \
  && find ./drizzle -name '*.sql' -exec sed -i 's/\r$//' {} \; \
  && chmod +x ./scripts/docker-entrypoint.sh

EXPOSE 3000

HEALTHCHECK --interval=90s --timeout=13s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

CMD ["sh", "./scripts/docker-entrypoint.sh"]

# Dev stage — source mounted via docker-compose volume
FROM node:22-alpine AS dev

WORKDIR /app

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn/releases ./.yarn/releases
RUN yarn install --immutable

ENV TZ=Asia/Kolkata
EXPOSE 3000
CMD ["yarn", "run", "dev"]
