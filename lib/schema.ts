import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm/sql"

export const jobExecutionStatusEnum = pgEnum("job_execution_status", [
  "PENDING",
  "QUEUE",
  "EXECUTING",
  "COMPLETED",
  "FAILED",
  "REJECT",
  "CANCELLED",
  "SQUARED_OFF",
])

export const dayOfWeekEnum = pgEnum("day_of_week_enum", [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
])

export const chaseStatusEnum = pgEnum("chase_status_type", [
  "SHORT",
  "LONG",
  "AWAITING_SHORT",
  "AWAITING_LONG",
  "AWAITING_SIGNAL",
])

export const jobExecutionStrategyEnum = pgEnum("job_execution_strategy", [
  "ATM_STRADDLE",
  "ATM_STRANGLE",
  "CHASE",
])

export const jobExecutions = pgTable(
  "job_executions",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    name: text("name"),
    status: jobExecutionStatusEnum("status"),
    instrument: text("instrument"),
    strategy: jobExecutionStrategyEnum("strategy"),
    exitStrategy: text("exit_strategy"),
    combinedExitStrategy: text("combined_exit_strategy"),
    expiryType: text("expiry_type"),
    productType: text("product_type"),
    volatilityType: text("volatility_type"),
    slOrderType: text("sl_order_type"),
    orderTag: text("order_tag"),
    lots: smallint("lots"),
    slmPercent: numeric("slm_percent"),
    slLimitPricePercent: numeric("sl_limit_price_percent"),
    maxProfitPoints: numeric("max_profit_points"),
    maxLossPoints: numeric("max_loss_points"),
    currentPoints: numeric("current_points"),
    trailingSlPercent: numeric("trailing_sl_percent"),
    trailingMaxProfitPoints: numeric("trailing_max_profit_points"),
    trailingMaxLossPoints: numeric("trailing_max_loss_points"),
    trailingProfitPercent: numeric("trailing_profit_percent"),
    trailEveryPctChangeValue: numeric("trail_every_pct_change_value"),
    thresholdSkewPercent: numeric("threshold_skew_percent"),
    maxSkewPercent: numeric("max_skew_percent"),
    expireIfUnsuccessfulInMins: smallint("expire_if_unsuccessful_in_mins"),
    isMaxProfitEnabled: boolean("is_max_profit_enabled").default(false),
    isMaxLossEnabled: boolean("is_max_loss_enabled").default(false),
    isAutoSquareOffEnabled: boolean("is_auto_square_off_enabled").default(false),
    takeTradeIrrespectiveSkew: boolean("take_trade_irrespective_skew").default(false),
    onSquareOffSetAborted: boolean("on_square_off_set_aborted").default(false),
    runNow: boolean("run_now").default(false),
    squareOffTime: timestamp("square_off_time", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    runAt: timestamp("run_at", { withTimezone: true }),
    lastTargetAt: timestamp("last_target_at", { withTimezone: true }),
    lastModified: timestamp("last_modified", { withTimezone: true }),
    autoSquareOffProps: jsonb("auto_square_off_props"),
    queue: jsonb("queue"),
    autoSquareOffTime: timestamp("auto_square_off_time", { withTimezone: true }),
    autoSquareOffDeletePendingOrders: boolean("auto_square_off_delete_pending_orders").default(
      false
    ),
    dayOfWeek: dayOfWeekEnum("day_of_week"),
    trailEveryPercentageChangeValue: smallint("trail_every_percentage_change_value"),
    planRef: text("plan_ref").references(() => tradePlans.id),
    userOverride: text("user_override"),
    liveTrailingSl: numeric("live_trailing_sl"),
    lastTrailingSlSetAt: timestamp("last_trailing_sl_set_at", { withTimezone: true }),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  table => [
    index("idx_job_executions_created_at").on(table.createdAt),
    index("idx_job_executions_order_tag").on(table.orderTag),
  ]
)

export const tradePlans = pgTable(
  "trade_plans",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    strategy: jobExecutionStrategyEnum("strategy").notNull(),
    instrument: text("instrument").notNull(),
    expiryType: text("expiry_type").notNull(),
    productType: text("product_type").notNull(),
    dayOfWeek: dayOfWeekEnum("day_of_week"),
    exitStrategy: text("exit_strategy"),
    combinedExitStrategy: text("combined_exit_strategy"),
    runAt: timestamp("run_at", { withTimezone: true }),
    squareOffTime: timestamp("square_off_time", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    expireIfUnsuccessfulInMins: integer("expire_if_unsuccessful_in_mins"),
    lots: integer("lots").notNull(),
    slmPercent: smallint("slm_percent"),
    slOrderType: text("sl_order_type"),
    slLimitPricePercent: smallint("sl_limit_price_percent"),
    maxProfitPoints: smallint("max_profit_points"),
    isMaxProfitEnabled: boolean("is_max_profit_enabled").default(false),
    maxLossPoints: smallint("max_loss_points"),
    isMaxLossEnabled: boolean("is_max_loss_enabled").default(false),
    thresholdSkewPercent: smallint("threshold_skew_percent"),
    maxSkewPercent: smallint("max_skew_percent"),
    takeTradeIrrespectiveSkew: boolean("take_trade_irrespective_skew").default(false),
    volatilityType: text("volatility_type"),
    trailEveryPercentageChangeValue: smallint("trail_every_percentage_change_value"),
    trailingSlPercent: smallint("trailing_sl_percent"),
    trailingMaxProfitPoints: smallint("trailing_max_profit_points"),
    trailingMaxLossPoints: smallint("trailing_max_loss_points"),
    trailingProfitPercent: numeric("trailing_profit_percent"),
    isAutoSquareOffEnabled: boolean("is_auto_square_off_enabled").default(false),
    autoSquareOffTime: timestamp("auto_square_off_time", { withTimezone: true }),
    extras: jsonb("extras").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  table => [
    index("idx_trade_plans_created_at").on(table.createdAt),
    index("idx_trade_plans_instrument").on(table.instrument),
    index("idx_trade_plans_strategy").on(table.strategy),
    uniqueIndex("trade_plans_day_strategy_uidx").on(table.dayOfWeek, table.strategy),
  ]
)

export const strategyDefaults = pgTable("strategy_defaults", {
  strategy: jobExecutionStrategyEnum("strategy").primaryKey(),
  config: jsonb("config").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const chaseSettings = pgTable("chase_settings", {
  id: integer("id").primaryKey(),
  lots: integer("lots").notNull().default(1),
  emaPeriod: integer("ema_period").notNull().default(40),
  bufferPercent: numeric("buffer_percent").notNull().default("0.2"),
  entryLimitOffset: numeric("entry_limit_offset").notNull().default("5"),
  paused: boolean("paused").notNull().default(false),
  instruments: jsonb("instruments").notNull().default(["NIFTY"]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const ema = pgTable("ema", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  tradingsymbol: text("tradingsymbol").notNull(),
  ema: integer("ema"),
  instrumentToken: integer("instrument_token"),
  highestHigh: integer("highest_high"),
  lowestLow: integer("lowest_low"),
  lastClose: integer("last_close"),
})

export const chaseStatus = pgTable("chase_status", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("last_modified_at", { withTimezone: true }).defaultNow(),
  status: chaseStatusEnum("current_status"),
  tradingsymbol: text("tradingsymbol"),
  instrumentToken: integer("instrument_token"),
  stoploss: integer("stoploss"),
  entryPoint: integer("entry_point"),
  isSignalBreachingTolerance: boolean("is_signal_breaching_tolerance"),
  instrument: text("instrument"),
})

export const chaseLog = pgTable("chase_log", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  tradingsymbol: text("tradingsymbol").notNull(),
  transactionType: text("transaction_type").notNull(),
  averagePrice: numeric("average_price"),
})

export const accesstoken = pgTable("accesstoken", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  accessToken: text("access_token").notNull(),
})

export const transactions = pgTable(
  "transactions",
  {
    id: serial("id").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    orderTimestamp: timestamp("order_timestamp", { withTimezone: true }),
    exchange: text("exchange"),
    tradingsymbol: text("tradingsymbol"),
    instrumentToken: integer("instrument_token"),
    transactionType: text("transaction_type"),
    quantity: integer("quantity"),
    averagePrice: numeric("average_price"),
    tag: text("tag"),
    orderId: text("order_id"),
    variety: text("variety"),
    orderType: text("order_type"),
    product: text("product"),
  },
  table => [
    uniqueIndex("transactions_order_id_uidx").on(table.orderId),
    index("idx_transactions_tag").on(table.tag),
    index("idx_transactions_created_at").on(table.createdAt),
  ]
)

export const tradingAccounts = pgTable("trading_accounts", {
  id: text("id").primaryKey().default("default"),
  broker: text("broker").notNull().default("ZERODHA"),
  brokerUserId: text("broker_user_id"),
  displayName: text("display_name"),
  currency: text("currency").notNull().default("INR"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const tradingDecisions = pgTable(
  "trading_decisions",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    accountId: text("account_id")
      .notNull()
      .references(() => tradingAccounts.id),
    jobId: text("job_id").references(() => jobExecutions.id),
    strategy: text("strategy"),
    instrument: text("instrument"),
    tradingsymbol: text("tradingsymbol"),
    exchange: text("exchange"),
    side: text("side"),
    action: text("action").notNull(),
    intent: text("intent"),
    reason: text("reason"),
    riskResult: text("risk_result"),
    riskDetail: text("risk_detail"),
    parameters: jsonb("parameters").notNull().default({}),
    features: jsonb("features").notNull().default({}),
    currentPositionQty: integer("current_position_qty"),
    proposedQty: integer("proposed_qty"),
    proposedPrice: numeric("proposed_price"),
    orderId: text("order_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    provenance: text("provenance").notNull().default("LIVE"),
  },
  table => [
    uniqueIndex("trading_decisions_idempotency_uidx").on(table.idempotencyKey),
    index("idx_trading_decisions_job").on(table.jobId),
    index("idx_trading_decisions_occurred").on(table.occurredAt),
  ]
)

export const orders = pgTable(
  "orders",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    accountId: text("account_id")
      .notNull()
      .references(() => tradingAccounts.id),
    jobId: text("job_id").references(() => jobExecutions.id),
    decisionId: text("decision_id").references(() => tradingDecisions.id),
    strategy: text("strategy"),
    orderTag: text("order_tag"),
    purpose: text("purpose").notNull().default("OTHER"),
    side: text("side").notNull(),
    orderType: text("order_type"),
    product: text("product"),
    exchange: text("exchange").notNull(),
    tradingsymbol: text("tradingsymbol").notNull(),
    instrumentToken: integer("instrument_token"),
    validity: text("validity"),
    timeInForce: text("time_in_force"),
    requestedQty: integer("requested_qty").notNull(),
    filledQty: integer("filled_qty").notNull().default(0),
    remainingQty: integer("remaining_qty").notNull(),
    limitPrice: numeric("limit_price"),
    stopPrice: numeric("stop_price"),
    averageFillPrice: numeric("average_fill_price"),
    fees: numeric("fees").notNull().default("0"),
    status: text("status").notNull(),
    brokerOrderId: text("broker_order_id"),
    exchangeOrderId: text("exchange_order_id"),
    parentBrokerOrderId: text("parent_broker_order_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    rejectReason: text("reject_reason"),
    cancelReason: text("cancel_reason"),
    errorInfo: text("error_info"),
    brokerStatus: text("broker_status"),
    rawBroker: jsonb("raw_broker"),
    metadata: jsonb("metadata").notNull().default({}),
    provenance: text("provenance").notNull().default("LIVE"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    filledAt: timestamp("filled_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    uniqueIndex("orders_idempotency_uidx").on(table.idempotencyKey),
    uniqueIndex("orders_broker_order_id_uidx").on(table.brokerOrderId),
    index("idx_orders_job").on(table.jobId),
    index("idx_orders_tag").on(table.orderTag),
    index("idx_orders_status").on(table.status),
  ]
)

export const orderEvents = pgTable(
  "order_events",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    eventType: text("event_type").notNull(),
    brokerStatus: text("broker_status"),
    filledQty: integer("filled_qty"),
    remainingQty: integer("remaining_qty"),
    message: text("message"),
    raw: jsonb("raw"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => [index("idx_order_events_order").on(table.orderId, table.recordedAt)]
)

export const fills = pgTable(
  "fills",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    accountId: text("account_id")
      .notNull()
      .references(() => tradingAccounts.id),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id),
    jobId: text("job_id").references(() => jobExecutions.id),
    decisionId: text("decision_id").references(() => tradingDecisions.id),
    strategy: text("strategy"),
    brokerOrderId: text("broker_order_id"),
    brokerTradeId: text("broker_trade_id"),
    exchange: text("exchange").notNull(),
    tradingsymbol: text("tradingsymbol").notNull(),
    instrumentToken: integer("instrument_token"),
    product: text("product"),
    side: text("side").notNull(),
    quantity: integer("quantity").notNull(),
    price: numeric("price").notNull(),
    feeAmount: numeric("fee_amount").notNull().default("0"),
    feeCurrency: text("fee_currency").notNull().default("INR"),
    liquidity: text("liquidity"),
    fingerprint: text("fingerprint").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    brokerTime: timestamp("broker_time", { withTimezone: true }),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    rawBroker: jsonb("raw_broker"),
    provenance: text("provenance").notNull().default("LIVE"),
  },
  table => [
    uniqueIndex("fills_fingerprint_uidx").on(table.fingerprint),
    uniqueIndex("fills_broker_trade_id_uidx").on(table.brokerTradeId),
    index("idx_fills_order").on(table.orderId),
  ]
)

export const positions = pgTable("positions", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  accountId: text("account_id")
    .notNull()
    .references(() => tradingAccounts.id),
  jobId: text("job_id").references(() => jobExecutions.id),
  strategy: text("strategy"),
  exchange: text("exchange").notNull(),
  tradingsymbol: text("tradingsymbol").notNull(),
  instrumentToken: integer("instrument_token"),
  product: text("product").notNull().default(""),
  quantity: integer("quantity").notNull().default(0),
  averageEntryPrice: numeric("average_entry_price").notNull().default("0"),
  costBasis: numeric("cost_basis").notNull().default("0"),
  realizedPnl: numeric("realized_pnl").notNull().default("0"),
  fees: numeric("fees").notNull().default("0"),
  markPrice: numeric("mark_price"),
  unrealizedPnl: numeric("unrealized_pnl"),
  marketValue: numeric("market_value"),
  openedAt: timestamp("opened_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  lastFillAt: timestamp("last_fill_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  status: text("status").notNull().default("FLAT"),
  provenance: text("provenance").notNull().default("LIVE"),
})

export const positionEvents = pgTable("position_events", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  positionId: text("position_id")
    .notNull()
    .references(() => positions.id),
  fillId: text("fill_id").references(() => fills.id),
  eventKind: text("event_kind").notNull(),
  quantityBefore: integer("quantity_before"),
  quantityAfter: integer("quantity_after"),
  averageBefore: numeric("average_before"),
  averageAfter: numeric("average_after"),
  realizedDelta: numeric("realized_delta"),
  feeDelta: numeric("fee_delta"),
  markPrice: numeric("mark_price"),
  reason: text("reason"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
})

export const trades = pgTable(
  "trades",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    accountId: text("account_id")
      .notNull()
      .references(() => tradingAccounts.id),
    jobId: text("job_id").references(() => jobExecutions.id),
    decisionId: text("decision_id").references(() => tradingDecisions.id),
    exitDecisionId: text("exit_decision_id").references(() => tradingDecisions.id),
    positionId: text("position_id").references(() => positions.id),
    strategy: text("strategy"),
    exchange: text("exchange").notNull(),
    tradingsymbol: text("tradingsymbol").notNull(),
    product: text("product").notNull().default(""),
    direction: text("direction").notNull(),
    status: text("status").notNull(),
    entryQty: integer("entry_qty").notNull().default(0),
    exitQty: integer("exit_qty").notNull().default(0),
    averageEntry: numeric("average_entry").notNull().default("0"),
    averageExit: numeric("average_exit"),
    grossPnl: numeric("gross_pnl").notNull().default("0"),
    fees: numeric("fees").notNull().default("0"),
    netPnl: numeric("net_pnl").notNull().default("0"),
    returnPct: numeric("return_pct"),
    holdingPeriodMs: bigint("holding_period_ms", { mode: "number" }),
    mfe: numeric("mfe"),
    mae: numeric("mae"),
    entryAt: timestamp("entry_at", { withTimezone: true }).notNull(),
    exitAt: timestamp("exit_at", { withTimezone: true }),
    exitReason: text("exit_reason"),
    provenance: text("provenance").notNull().default("LIVE"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    index("idx_trades_status").on(table.status),
    index("idx_trades_job").on(table.jobId),
    index("idx_trades_entry").on(table.entryAt),
  ]
)

export const fees = pgTable("fees", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  accountId: text("account_id")
    .notNull()
    .references(() => tradingAccounts.id),
  orderId: text("order_id").references(() => orders.id),
  fillId: text("fill_id").references(() => fills.id),
  tradeId: text("trade_id").references(() => trades.id),
  amount: numeric("amount").notNull(),
  currency: text("currency").notNull().default("INR"),
  feeType: text("fee_type").notNull(),
  broker: text("broker"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  notes: text("notes"),
  provenance: text("provenance").notNull().default("LIVE"),
})

export const portfolioSnapshots = pgTable("portfolio_snapshots", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  accountId: text("account_id")
    .notNull()
    .references(() => tradingAccounts.id),
  sessionDate: date("session_date").notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  source: text("source").notNull(),
  availableCash: numeric("available_cash"),
  usedMargin: numeric("used_margin"),
  span: numeric("span"),
  exposure: numeric("exposure"),
  grossExposure: numeric("gross_exposure"),
  netExposure: numeric("net_exposure"),
  realizedPnl: numeric("realized_pnl"),
  unrealizedPnl: numeric("unrealized_pnl"),
  fees: numeric("fees"),
  portfolioValue: numeric("portfolio_value"),
  peakEquity: numeric("peak_equity"),
  drawdown: numeric("drawdown"),
  drawdownPct: numeric("drawdown_pct"),
  openPositionCount: integer("open_position_count"),
  rawMargins: jsonb("raw_margins"),
  notes: text("notes"),
})

export const dailySessions = pgTable(
  "daily_sessions",
  {
    accountId: text("account_id")
      .notNull()
      .references(() => tradingAccounts.id),
    sessionDate: date("session_date").notNull(),
    startingEquity: numeric("starting_equity"),
    endingEquity: numeric("ending_equity"),
    peakEquity: numeric("peak_equity"),
    maxDrawdown: numeric("max_drawdown"),
    realizedPnl: numeric("realized_pnl").notNull().default("0"),
    unrealizedPnl: numeric("unrealized_pnl").notNull().default("0"),
    fees: numeric("fees").notNull().default("0"),
    grossPnl: numeric("gross_pnl").notNull().default("0"),
    netPnl: numeric("net_pnl").notNull().default("0"),
    orderCount: integer("order_count").notNull().default(0),
    fillCount: integer("fill_count").notNull().default(0),
    tradeCount: integer("trade_count").notNull().default(0),
    winCount: integer("win_count").notNull().default(0),
    lossCount: integer("loss_count").notNull().default(0),
    largestWin: numeric("largest_win"),
    largestLoss: numeric("largest_loss"),
    avgWin: numeric("avg_win"),
    avgLoss: numeric("avg_loss"),
    winRate: numeric("win_rate"),
    exposurePeak: numeric("exposure_peak"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => [uniqueIndex("daily_sessions_pk").on(table.accountId, table.sessionDate)]
)

export const reconciliationEvents = pgTable("reconciliation_events", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  accountId: text("account_id")
    .notNull()
    .references(() => tradingAccounts.id),
  kind: text("kind").notNull(),
  severity: text("severity").notNull().default("WARN"),
  instrument: text("instrument"),
  tradingsymbol: text("tradingsymbol"),
  exchange: text("exchange"),
  product: text("product"),
  internalQty: integer("internal_qty"),
  brokerQty: integer("broker_qty"),
  internalAvg: numeric("internal_avg"),
  brokerAvg: numeric("broker_avg"),
  internalOrderId: text("internal_order_id"),
  brokerOrderId: text("broker_order_id"),
  detail: text("detail"),
  resolved: boolean("resolved").notNull().default(false),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedHow: text("resolved_how"),
  raw: jsonb("raw"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
})

export const auditEvents = pgTable(
  "audit_events",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    accountId: text("account_id")
      .notNull()
      .references(() => tradingAccounts.id),
    jobId: text("job_id").references(() => jobExecutions.id),
    orderId: text("order_id").references(() => orders.id),
    decisionId: text("decision_id").references(() => tradingDecisions.id),
    positionId: text("position_id").references(() => positions.id),
    tradeId: text("trade_id").references(() => trades.id),
    eventType: text("event_type").notNull(),
    severity: text("severity").notNull().default("INFO"),
    actor: text("actor").notNull().default("SYSTEM"),
    summary: text("summary"),
    detail: jsonb("detail").notNull().default({}),
    idempotencyKey: text("idempotency_key"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    index("idx_audit_events_occurred").on(table.occurredAt),
    index("idx_audit_events_type").on(table.eventType),
  ]
)

export const riskSettings = pgTable("risk_settings", {
  id: integer("id").primaryKey(),
  tradingEnabled: boolean("trading_enabled").notNull().default(true),
  deskHalted: boolean("desk_halted").notNull().default(false),
  haltReason: text("halt_reason"),
  allowLiveOrders: boolean("allow_live_orders").notNull().default(false),
  maxLots: integer("max_lots").notNull().default(20),
  maxQtyPerOrder: integer("max_qty_per_order").notNull().default(1800),
  maxNotionalInr: numeric("max_notional_inr").notNull().default("2000000"),
  maxOpenPositions: integer("max_open_positions").notNull().default(12),
  maxOpenOrders: integer("max_open_orders").notNull().default(40),
  maxDailyLossInr: numeric("max_daily_loss_inr").notNull().default("50000"),
  maxDrawdownPct: numeric("max_drawdown_pct").notNull().default("0.15"),
  maxOrdersPerMinute: integer("max_orders_per_minute").notNull().default(20),
  stalePriceMaxAgeSec: integer("stale_price_max_age_sec").notNull().default(30),
  requireMarketHours: boolean("require_market_hours").notNull().default(true),
  minLtp: numeric("min_ltp").notNull().default("0.05"),
  disabledStrategies: jsonb("disabled_strategies").notNull().default([]),
  strategyLimits: jsonb("strategy_limits").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const strategySignals = pgTable(
  "strategy_signals",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    strategy: text("strategy"),
    instrument: text("instrument"),
    tradingsymbol: text("tradingsymbol"),
    jobId: text("job_id").references(() => jobExecutions.id),
    planRef: text("plan_ref"),
    orderTag: text("order_tag"),
    jobName: text("job_name"),
    kind: text("kind").notNull(),
    outcome: text("outcome").notNull(),
    summary: text("summary").notNull(),
    features: jsonb("features").notNull().default({}),
    idempotencyKey: text("idempotency_key").notNull(),
  },
  table => [
    uniqueIndex("strategy_signals_idempotency_uidx").on(table.idempotencyKey),
    index("idx_strategy_signals_occurred").on(table.occurredAt),
    index("idx_strategy_signals_strategy").on(table.strategy),
    index("idx_strategy_signals_job").on(table.jobId),
    index("idx_strategy_signals_plan").on(table.planRef),
    index("idx_strategy_signals_tag").on(table.orderTag),
  ]
)

export const operatorFeedClears = pgTable("operator_feed_clears", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  feed: text("feed").notNull(),
  mode: text("mode").notNull(),
  istDate: date("ist_date"),
  before: timestamp("before", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
