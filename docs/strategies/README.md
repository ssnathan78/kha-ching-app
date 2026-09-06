# Strategy specifications

These documents are the **operator floor** for what each strategy is supposed to do: universe, formulas, state machine, exits, and where the code lives. They describe **this repo** (`kha-ching-app`), not a generic options tutorial.

This desk has two kinds of process:

| Kind | Strategies | Product | Horizon |
|---|---|---|---|
| **Intraday** | [ATM straddle](./ATM_STRADDLE.md), [ATM strangle](./ATM_STRANGLE.md) | Index options (MIS by default) | Same session; time square-off |
| **Continuous** | [Subscribe & Chase](./SUBSCRIBE_CHASE.md) | Index futures (NRML) | Can hold overnight; not a weekday template |

Related (execution, not alpha):

- Ledger: [TRADING_DOMAIN_MODEL.md](../TRADING_DOMAIN_MODEL.md)
- Risk that cannot be bypassed by strategy code: [TRADING_RISK_AUDIT.md](../TRADING_RISK_AUDIT.md)
- Job → fill path: [TRADING_LIFECYCLE.md](../TRADING_LIFECYCLE.md)

**Implementation review** (Capitalmind PDF vs chase-bot Python vs this app): [IMPLEMENTATION_REVIEW.md](./IMPLEMENTATION_REVIEW.md).

These specs do **not** claim the strategies have edge. A correct implementation of a losing rule is still a losing rule.
