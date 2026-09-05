import { sendApiError } from "../../lib/apiErrors"
import logger from "../../lib/logger"
import { tradingQueue } from "../../lib/queue"
import withSession from "../../lib/session"

function publicJobView(job: {
  id?: string
  name?: string
  opts?: { delay?: number }
  timestamp?: number
  failedReason?: string
}) {
  return {
    id: job.id,
    name: job.name,
    timestamp: job.timestamp,
    delay: job.opts?.delay,
    failedReason: job.failedReason,
  }
}

export default withSession(async (req, res) => {
  const user = req.session.user

  if (!user) {
    return res.status(401).send("Unauthorized")
  }

  const { id: jobId } = req.query
  try {
    const jobRes = await tradingQueue.getJob(jobId as string)
    if (!jobRes) {
      return res.status(200).json({
        error: "job not found",
      })
    }

    const jobState = await jobRes.getState()
    res.json({
      job: publicJobView(jobRes),
      current_state: jobState,
    })
  } catch (e) {
    return sendApiError(res, e, logger, "get_job")
  }
})
