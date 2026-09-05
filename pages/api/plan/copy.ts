import { and, eq, inArray } from "drizzle-orm"
import type { NextApiRequest, NextApiResponse } from "next"

import { sendApiError } from "../../../lib/apiErrors"
import { STRATEGIES } from "../../../lib/constants"
import { db } from "../../../lib/drizzle"
import logger from "../../../lib/logger"
import { tradePlans } from "../../../lib/schema"
import withSession from "../../../lib/session"

const WEEKDAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"] as const
type Weekday = (typeof WEEKDAYS)[number]

export default withSession(async (req: NextApiRequest, res: NextApiResponse) => {
  const user = req.session.user
  if (!user) {
    return res.status(401).send("Unauthorized")
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  const sourceDay = String(req.body?.dayOfWeek || "").toUpperCase() as Weekday
  const strategy = req.body?.strategy
  const planId = req.body?.id

  if (!WEEKDAYS.includes(sourceDay) || !strategy) {
    return res.status(400).json({ error: "dayOfWeek and strategy are required" })
  }

  if (!Object.values(STRATEGIES).includes(strategy)) {
    return res.status(400).json({ error: "Invalid strategy" })
  }

  try {
    const [source] = planId
      ? await db.select().from(tradePlans).where(eq(tradePlans.id, planId))
      : await db
          .select()
          .from(tradePlans)
          .where(and(eq(tradePlans.dayOfWeek, sourceDay), eq(tradePlans.strategy, strategy)))
          .limit(1)

    if (!source) {
      return res.status(404).json({ error: "No saved template to copy" })
    }

    const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = source
    const targetDays = WEEKDAYS.filter(day => day !== sourceDay)
    const copied: Weekday[] = []

    const existingPlans = await db
      .select({ id: tradePlans.id, dayOfWeek: tradePlans.dayOfWeek })
      .from(tradePlans)
      .where(and(inArray(tradePlans.dayOfWeek, [...targetDays]), eq(tradePlans.strategy, strategy)))

    const existingByDay = new Map(existingPlans.map(row => [row.dayOfWeek, row.id]))

    for (const day of targetDays) {
      const payload = { ...rest, dayOfWeek: day, updatedAt: new Date() }
      const existingId = existingByDay.get(day)
      if (existingId) {
        await db.update(tradePlans).set(payload).where(eq(tradePlans.id, existingId))
      } else {
        await db.insert(tradePlans).values(payload)
      }
      copied.push(day)
    }

    const results = await db
      .select()
      .from(tradePlans)
      .orderBy(tradePlans.dayOfWeek, tradePlans.createdAt)
    return res.json({ copied, plans: results })
  } catch (e) {
    return sendApiError(res, e, logger, "plan/copy")
  }
})
