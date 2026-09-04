# Development

## Prerequisites

Node 20+, Yarn 4, Postgres 16, Redis 7, `TZ=Asia/Kolkata`.

```bash
cp .env.example .env
yarn install
yarn drizzle:push
yarn dev
```

Keep `MOCK_ORDERS=true` unless you intend to place live orders.

## Tests

```bash
yarn unit-test
```

Critical coverage: `lib/pnl.ts` (rupees vs points), `lib/slOrders.ts`, `lib/tickSize.ts`.

## Migrations

```bash
yarn drizzle:generate
yarn migrate          # applies SQL in drizzle/
# or
yarn drizzle:push     # push schema (dev)
```

## Debug

Bull Board: `/queues` (logged-in session). Logs: Winston console (+ optional OTEL).
