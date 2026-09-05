# Codebase Modernization

Post–dependency-upgrade refactor: idiomatic **React 19**, **MUI 9**, **Drizzle**, **BullMQ 6**, and **iron-session 9** patterns. See [MIGRATION.md](./MIGRATION.md) for the version bump checklist.

## Patterns adopted

### Session

- Shared `getSessionOptions()` in [`lib/sessionOptions.js`](../lib/sessionOptions.js) — identical `cookieName`, `password`, `ttl` (seconds until 7 AM IST), `cookieOptions`, and `onUnsealError` for API routes and Bull Board Express middleware.
- Native iron-session 9 API: `req.session.user` (no `CompatSession` get/set shim).

### Plan validation

- `validatePlanConfig()` in [`lib/strategyValidation.ts`](../lib/strategyValidation.ts) runs on plan save (`POST`/`PUT /api/plan`) and schedule (`/api/trades_day`) with the same 400 error shape.
- Client forms validate lots before save (no silent coerce on invalid input).

### Job removal

- `DELETE /api/delete_job` delegates to `forceRemoveQueuedJob()` from [`lib/jobControl.ts`](../lib/jobControl.ts).
- Chase schedulers use BullMQ 6 `removeJobScheduler` with `CHASE_EMA_SCHEDULER_ID` / `CHASE_UPDATE_SL_SCHEDULER_ID`.

### Drizzle

- Full schema registered on the pool in [`lib/drizzle.ts`](../lib/drizzle.ts).
- `istToday(column)` in [`lib/drizzleIst.ts`](../lib/drizzleIst.ts) replaces duplicated IST date SQL.
- Row types from `$inferSelect` / `$inferInsert` where practical.

### Data fetching (client)

- Typed [`lib/fetchJson.ts`](../lib/fetchJson.ts) + SWR hooks (`usePlans`, `useChaseSettings`) via [`lib/planClient.ts`](../lib/planClient.ts).
- Axios retained only for server-side Slack webhook in `lib/utils.ts`.

### UI feedback

- MUI 9 `Button` `loading` prop instead of `ActionButtonOrLoader`.
- `ConfirmDialog` + snackbar instead of `window.alert` / `window.confirm` on dashboard flows.

## Legacy patterns removed

| Pattern | Location | Replacement |
|---------|----------|-------------|
| Duplicate session config without TTL | `sessionExpress.js` | `sessionOptions.js` |
| `CompatSession` get/set | `lib/session.ts`, API routes | `req.session.user` |
| `insertTransaction` | `lib/drizzleDbUtils.ts` | batch insert only |
| `addtoChaseQueue` alias | `lib/queue.ts` | `addToChaseQueue` |
| Dead `PUT /api/reconcile` call | `brokerOrders` | removed |
| Commented worker block | `ancillaryQueue.ts` | deleted |
| Duplicate scheduler removal | `delete_job.js` | `jobControl.forceRemoveQueuedJob` |

## Conventions for new features

1. **TypeScript** for new files; Biome for lint/format.
2. **API auth:** `withSession` + `req.session.user`; return 401 when missing.
3. **Validation:** reuse `lib/strategyValidation.ts`; return `{ error: string }` with 400.
4. **Queues:** add/remove jobs through `lib/jobControl.ts` helpers.
5. **IST dates:** use `istToday()` from `lib/drizzleIst.ts`.
6. **Client fetch:** SWR + `fetchJson`; mutations via `useSWRMutation` or thin client helpers.
7. **MUI:** Grid `size`, `slotProps`, `sx`; `color="text.secondary"`; Dialog/Snackbar for user feedback.

## Remaining debt backlog

- Incremental `strict: true` for more of `lib/` and `pages/api/`.
- Optional MUI `cssVariables: true` in theme after visual E2E check.
- Full `kiteUtils.ts` typing (touch only when editing related code).
- Playwright globalSetup seed for faster smoke tests when browser CI is available.

## Verification gate

After substantive changes:

```bash
docker compose up -d postgres redis
yarn lint && yarn unit-test && yarn migrate
yarn int-test && yarn api-test && yarn build
```

Optional strict check for validation modules: `npx tsc -p tsconfig.strict-lib.json --noEmit`.

Grep for deprecated APIs: `Grid item`, `renderInput`, `removeRepeatableByKey`, `CompatSession`, `req.session.get`.
