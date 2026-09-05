import { and, eq, sql } from "drizzle-orm"
import type { NextApiRequest, NextApiResponse } from "next"

import { sendApiError } from "../../lib/apiErrors"
import { db } from "../../lib/drizzle"
import { istToday } from "../../lib/drizzleIst"
import { forceRemoveQueuedJob } from "../../lib/jobControl"
import logger from "../../lib/logger"
import { jobExecutions } from "../../lib/schema"
import withSession from "../../lib/session"

async function findTodaysJobExecutionByQueueId(queueId: string) {
  const rows = await db
    .select({ id: jobExecutions.id, queue: jobExecutions.queue })
    .from(jobExecutions)
    .where(
      and(istToday(jobExecutions.createdAt), sql`(${jobExecutions.queue}->>'id') = ${queueId}`)
    )
    .limit(1)

  return rows[0] ?? null
}

export default withSession(async (req: NextApiRequest, res: NextApiResponse) => {
  const user = req.session.user

  if (!user) {
    return res.status(401).send("Unauthorized")
  }

  if (req.method !== "POST" && req.method !== "DELETE") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  const id = req.body?.id
  if (!id || typeof id !== "string") {
    return res.status(400).json({ error: "id is required" })
  }

  try {
    const linked = await findTodaysJobExecutionByQueueId(id)
    if (!linked) {
      return res.status(404).json({ error: "No job execution linked to this queue id for today" })
    }

    await forceRemoveQueuedJob(id)
    logger.info("[delete_job] removed queue job", id)
    return res.json({ status: "ok" })
  } catch (e) {
    return sendApiError(res, e, logger, "delete_job")
  }
})
