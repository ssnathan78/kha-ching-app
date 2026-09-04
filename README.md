# Kha-Ching

Personal algorithmic trading app for Indian index options and a Nifty futures chase strategy, via Zerodha Kite Connect.

This repository is independent. It is not SignalX and does not depend on other GitHub forks for updates.

## Features

- ATM straddle / strangle with skew wait, SL, and time square-off
- Subscribe & Chase (Nifty futures 40-EMA)
- Trade plans by weekday
- BullMQ job queues and Bull Board at `/queues`
- Dual metrics: rupee P&L (`qty × price`) and strategy points (for max profit/loss)

## Stack

TypeScript, Next.js (Pages Router), Express, Postgres, Drizzle, Redis, BullMQ, React/MUI.

## Local development

Prerequisites: Node 20+, Yarn 4, Postgres 16, Redis 7. Set `TZ=Asia/Kolkata`.

```bash
git clone https://github.com/ssnathan78/kha-ching-app.git
cd kha-ching-app
yarn install
cp .env.example .env
# fill Kite keys and SECRET_COOKIE_PASSWORD
yarn drizzle:push   # or yarn migrate after generating SQL
yarn dev            # MOCK_ORDERS=true in .env
```

Optional local Postgres/Redis:

```bash
COMPOSE_PROFILES=local docker compose up postgres redis
```

```bash
yarn unit-test
yarn lint
yarn build
yarn start
```

Health: `GET /api/health` (Postgres + Redis).

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Development](docs/DEVELOPMENT.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Modernization report](docs/MODERNIZATION.md)

## License

MIT — see [LICENSE.md](LICENSE.md).
