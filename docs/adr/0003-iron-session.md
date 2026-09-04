# ADR 0003: iron-session

## Status

Accepted

## Context

`next-iron-session` is unmaintained.

## Decision

Use `iron-session` with the same cookie name `khaching/kite/session`, `sameSite=lax`, `httpOnly`.

## Consequences

Existing cookies may be invalid once; users re-login (already required each morning).
