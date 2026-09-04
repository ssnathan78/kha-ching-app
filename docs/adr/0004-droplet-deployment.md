# ADR 0004: Droplet deployment

## Status

Accepted

## Context

Need a long-lived process for BullMQ and IST market hours.

## Decision

Stay on a single DigitalOcean Droplet. CI verifies; deploy is manual.

## Consequences

Operator owns backups, TLS, and firewall. See `docs/DEPLOYMENT.md`.
