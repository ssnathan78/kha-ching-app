# ADR 0001: Modular monolith on Next.js + Postgres + Redis

## Status

Accepted

## Context

Kha-Ching is a one-operator live trading app with delayed jobs.

## Decision

Keep TypeScript, Next.js Pages Router, Postgres, Drizzle, Redis, BullMQ, in-process workers, DigitalOcean Droplet.

## Consequences

Simple operations. Do not split microservices or move to App Platform without a dedicated worker process.
