# Operator notes

This is not a product backlog from older forks. Current operator reminders:

- Keep `MOCK_ORDERS=true` on the laptop Docker stack.
- Use a dedicated Kite Connect app for `http://127.0.0.1:3000/api/redirect_url_kite`.
- After schema changes, add SQL under `drizzle/` and run `yarn migrate` (do not rely on push in production).
- Dual P&amp;L: rupees in the UI, points for max profit/loss — keep both.
- Keep production host/IP out of git (server `.env` only).
- Deploy is **manual**; GitHub Actions only verifies.
