import { USER_OVERRIDE } from "./constants"

export function jobMatchesKillScope(
  strategy: string | null | undefined,
  scope: "intraday" | "all"
) {
  if (scope === "all") return true
  return strategy === "ATM_STRADDLE" || strategy === "ATM_STRANGLE"
}

export function isJobAborted(job: {
  userOverride?: string | null
  user_override?: string | null
  [key: string]: unknown
}) {
  return (job.userOverride || job.user_override) === USER_OVERRIDE.ABORT
}

export function dashboardJobActions({
  jobWasQueued,
  isChase,
  jobState,
  jobMissing,
  aborted,
  hasSettledPnl,
}: {
  jobWasQueued: boolean
  isChase: boolean
  jobState?: string | null
  jobMissing?: boolean
  aborted: boolean
  hasSettledPnl: boolean
}) {
  const waitingLike = ["delayed", "waiting", "failed"].includes(jobState || "")
  const showDelete =
    aborted || !jobWasQueued || isChase || jobMissing || (jobWasQueued && waitingLike)
  const showStop =
    !aborted &&
    !isChase &&
    jobWasQueued &&
    ["active", "completed"].includes(jobState || "") &&
    !hasSettledPnl
  return { showDelete: showDelete && !showStop, showStop }
}

/** @deprecated Use trades_day PUT with userOverride ABORT only */
export function jobExecutionPatchFromBody(body: Record<string, unknown> = {}) {
  const patch: Record<string, unknown> = {}
  const override = body.userOverride ?? body.user_override
  if (override === USER_OVERRIDE.ABORT) {
    patch.userOverride = USER_OVERRIDE.ABORT
  }
  return patch
}

export function toClientJobExecution(row: Record<string, unknown>) {
  const queue = row.queue && typeof row.queue === "object" ? row.queue : {}
  const statusMessage =
    row.statusMessage ||
    row.status_message ||
    (typeof (queue as { error?: string }).error === "string"
      ? (queue as { error: string }).error
      : undefined)
  return {
    ...row,
    userOverride: row.userOverride ?? row.user_override ?? null,
    user_override: row.userOverride ?? row.user_override ?? null,
    status_message: statusMessage,
    orderTag: row.orderTag ?? row.order_tag,
  }
}
