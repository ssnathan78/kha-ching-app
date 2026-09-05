import { eq } from "drizzle-orm"
import type { NextApiRequest, NextApiResponse } from "next"

import { db } from "../../lib/drizzle"
import logger from "../../lib/logger"
import { mapPlanFromDb, mapPlanToDb, planApiErrorMessage } from "../../lib/planMapper"
import { tradePlans } from "../../lib/schema"
import withSession from "../../lib/session"
import { validatePlanConfig } from "../../lib/strategyValidation"

export default withSession(async (req: NextApiRequest, res: NextApiResponse) => {
  const user = req.session.user

  if (!user) {
    return res.status(401).send("Unauthorized")
  }

  const { dayOfWeek, config } = req.body || {}

  try {
    if (req.method === "POST") {
      const planConfigs = Array.isArray(config) ? config : [config]
      const results: ReturnType<typeof mapPlanFromDb>[] = []

      for (const planConfig of planConfigs) {
        const { getMaxLotsForStrategy } = await import("../../lib/trading/riskSettings")
        const validation = validatePlanConfig(planConfig, {
          maxLots: await getMaxLotsForStrategy(planConfig?.strategy),
        })
        if (!validation.ok) {
          return res.status(400).json({ error: validation.error })
        }

        try {
          const inserted = await db
            .insert(tradePlans)
            .values(mapPlanToDb(planConfig, dayOfWeek) as typeof tradePlans.$inferInsert)
            .returning()

          if (inserted.length > 0) {
            results.push(mapPlanFromDb(inserted[0]))
          }
        } catch (err: any) {
          if (err?.code === "23505" || err?.cause?.code === "23505") {
            return res.status(409).json({
              error:
                "This weekday already has a template for that strategy. Edit the existing one.",
            })
          }
          throw err
        }
      }

      return res.json(results[0] || {})
    }

    if (req.method === "PUT") {
      const planId = config?.id || req.body?.id
      const { getMaxLotsForStrategy } = await import("../../lib/trading/riskSettings")
      const validation = validatePlanConfig(config, {
        maxLots: await getMaxLotsForStrategy(config?.strategy),
      })
      if (!validation.ok) {
        return res.status(400).json({ error: validation.error })
      }

      await db
        .update(tradePlans)
        .set(mapPlanToDb(config, dayOfWeek))
        .where(eq(tradePlans.id, planId))

      const result = await db.select().from(tradePlans).where(eq(tradePlans.id, planId))

      if (result.length > 0) {
        return res.json(mapPlanFromDb(result[0]))
      }

      return res.status(404).json({ error: "Plan not found" })
    }

    if (req.method === "DELETE") {
      await db.delete(tradePlans).where(eq(tradePlans.id, config.id))
      return res.json({ success: true })
    }

    const results = await db
      .select()
      .from(tradePlans)
      .orderBy(tradePlans.dayOfWeek, tradePlans.createdAt)

    return res.json(results.map(mapPlanFromDb))
  } catch (e) {
    logger.error("[api/plan] error", e)
    return res.status(500).json({ error: planApiErrorMessage(e) })
  }
})
