import ScheduleIcon from "@mui/icons-material/Schedule"
import { Box, Button, Chip, Divider, Grid, Typography } from "@mui/material"
import dayjs from "dayjs"
import React, { useMemo } from "react"

type BrokerOrder = {
  order_id: string
  status: string
  transaction_type: string
  filled_quantity: number
  quantity: number
  humanTradingSymbol?: string
  tradingsymbol: string
  exchange: string
  order_timestamp: string
  average_price?: number
  trigger_price?: number
  product: string
  order_type: string
  tag?: string | null
}

type TradeRow = {
  orderTag: string
  strategy: string
  instrument: string
  exitStrategy: string
  runAt: string
}

type DbOrder = {
  order_id: string
  tag?: string | null
}

type BrokerOrdersProps = {
  orders: BrokerOrder[]
  trades?: TradeRow[]
  dbOrders?: DbOrder[]
}

export default function BrokerOrders({ orders, trades, dbOrders }: BrokerOrdersProps) {
  const { tradeMapByOrderTag, allTags } = useMemo(() => {
    if (!trades?.length) {
      return {
        tradeMapByOrderTag: {} as Record<string, TradeRow & { selectDisplayName: string }>,
        allTags: [] as string[],
      }
    }

    const reducedTags = trades.reduce<Record<string, TradeRow & { selectDisplayName: string }>>(
      (accum, trade) => ({
        ...accum,
        [trade.orderTag]: {
          ...trade,
          selectDisplayName: `${trade.strategy} / ${trade.instrument} / ${trade.exitStrategy} / ${dayjs(trade.runAt).format("hh:mm A")}`,
        },
      }),
      {}
    )

    return { tradeMapByOrderTag: reducedTags, allTags: Object.keys(reducedTags) }
  }, [trades])

  if (!Array.isArray(orders) || !orders.length) return null

  return (
    <>
      <Typography variant="subtitle2" sx={{ textAlign: "right" }}>
        {orders.length} Orders
      </Typography>
      {orders.map((order, idx) => (
        <div key={order.order_id}>
          <Divider sx={{ my: idx === 0 ? "0 0 12px 0" : "12px 0" }} />
          <Box sx={{ display: "flex", justifyContent: "space-between" }}>
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                mr: 1,
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", mb: 0.5 }}>
                <Box sx={{ mr: 1 }}>
                  <Chip
                    size="small"
                    disabled={order.status !== "COMPLETE"}
                    label={order.transaction_type}
                    color={order.transaction_type === "SELL" ? "primary" : "secondary"}
                  />
                </Box>
                <Typography variant="body2">
                  {order.filled_quantity} / {order.quantity}
                </Typography>
              </Box>
              <Typography variant="body2">
                {order.humanTradingSymbol || order.tradingsymbol}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {order.exchange}
              </Typography>
            </Box>
            <Box sx={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  mb: 0.5,
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", mr: 1 }}>
                  <ScheduleIcon fontSize="small" sx={{ color: "action.disabled", mr: 0.25 }} />
                  <Typography variant="body2">
                    {dayjs(order.order_timestamp).format("hh:mm:ss")}
                  </Typography>
                </Box>
                <Chip
                  size="small"
                  label={order.status}
                  disabled
                  color={order.status === "COMPLETE" ? "secondary" : "default"}
                />
              </Box>
              <Box>
                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Typography variant="body2" color="text.secondary">
                    {order.average_price ? "Avg." : order.trigger_price ? "SL Trigger" : null}
                  </Typography>
                  <Typography>
                    {order.average_price?.toFixed(2) || order.trigger_price || ""}
                  </Typography>
                </Box>
                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Typography variant="body2" color="text.secondary">
                    {order.product}
                  </Typography>
                  <Typography variant="body2">{order.order_type}</Typography>
                </Box>
              </Box>
            </Box>
          </Box>
          {trades ? (
            <Box>
              <Grid size={12}>
                <Typography variant="subtitle2" sx={{ mt: 1 }}>
                  Broker tag: {order.tag || "Untagged"}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  System tag:{" "}
                  {dbOrders?.find(dbOrder => dbOrder.order_id === order.order_id)?.tag ||
                    "Untagged"}
                </Typography>
                {order.tag && allTags.includes(order.tag) ? (
                  <Typography variant="caption" color="text.secondary">
                    Matched job: {tradeMapByOrderTag[order.tag]?.selectDisplayName}
                  </Typography>
                ) : null}
              </Grid>
            </Box>
          ) : null}
        </div>
      ))}
    </>
  )
}
