import {
  Box,
  Button,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material"
import axios from "axios"
import dayjs from "dayjs"
import Link from "next/link"
import { useRouter } from "next/router"
import React, { useEffect, useState } from "react"
import Layout from "../components/Layout"
import TradeDetails from "../components/lib/tradeDetails"
import ATMStraddleTradeForm from "../components/trades/atmStraddle/TradeSetupForm"
import ATMStrangleTradeForm from "../components/trades/atmStrangle/TradeSetupForm"
import { getSchedulingStateProps } from "../lib/browserUtils"
import {
  EXPIRY_TYPE,
  INSTRUMENTS,
  PRODUCT_TYPE,
  STRATEGIES,
  STRATEGIES_DETAILS,
} from "../lib/constants"
import { groupPlansByDay, hydratePlanConfig } from "../lib/planClient"
import useUser from "../lib/useUser"
import type { DailyPlansConfig, DailyPlansDayKey } from "../types/misc"
import type { ATM_STRADDLE_CONFIG, ATM_STRANGLE_CONFIG, AvailablePlansConfig } from "../types/plans"
import type { SUPPORTED_TRADE_CONFIG } from "../types/trade"

const getDefaultState = (strategy: STRATEGIES): AvailablePlansConfig =>
  ({
    ...STRATEGIES_DETAILS[strategy].defaultFormState,
    ...getSchedulingStateProps(strategy),
  }) as unknown as AvailablePlansConfig

const resetDefaultStratState = (): Record<STRATEGIES, AvailablePlansConfig> => {
  return {
    [STRATEGIES.ATM_STRADDLE]: getDefaultState(STRATEGIES.ATM_STRADDLE),
    [STRATEGIES.ATM_STRANGLE]: getDefaultState(STRATEGIES.ATM_STRANGLE),
  } as Record<STRATEGIES, AvailablePlansConfig>
}

const DAYS: DailyPlansDayKey[] = ["monday", "tuesday", "wednesday", "thursday", "friday"]
const PLAN_STRATEGIES = [STRATEGIES.ATM_STRADDLE, STRATEGIES.ATM_STRANGLE]

const isPlanStrategy = (value: unknown): value is STRATEGIES =>
  PLAN_STRATEGIES.includes(value as STRATEGIES)

const SINGLE_INDEX = {
  [INSTRUMENTS.NIFTY]: true,
  [INSTRUMENTS.BANKNIFTY]: false,
  [INSTRUMENTS.FINNIFTY]: false,
} as Record<INSTRUMENTS, boolean>

type EditingSlot = {
  day: DailyPlansDayKey
  strategy: STRATEGIES
  strategyKey?: string
}

const emptyDayState = (): DailyPlansConfig => ({
  monday: { heading: "Monday", selectedStrategy: "", strategies: {} },
  tuesday: { heading: "Tuesday", selectedStrategy: "", strategies: {} },
  wednesday: { heading: "Wednesday", selectedStrategy: "", strategies: {} },
  thursday: { heading: "Thursday", selectedStrategy: "", strategies: {} },
  friday: { heading: "Friday", selectedStrategy: "", strategies: {} },
})

const Plan = () => {
  useUser({ redirectTo: "/" })
  const router = useRouter()

  const [dayState, setDayState] = useState<DailyPlansConfig>(emptyDayState)
  const [editing, setEditing] = useState<EditingSlot | null>(null)
  const [browse, setBrowse] = useState<"day" | "strategy">("day")
  const [activeStrategy, setActiveStrategy] = useState<STRATEGIES>(STRATEGIES.ATM_STRADDLE)
  const [stratState, setStratState] = useState(resetDefaultStratState)
  const weekday = dayjs().format("dddd").toLowerCase()
  const [activeDay, setActiveDay] = useState<DailyPlansDayKey>(
    DAYS.includes(weekday as DailyPlansDayKey) ? (weekday as DailyPlansDayKey) : "monday"
  )

  const currentEditDay = editing?.day
  const currentEditStrategy = editing?.strategy

  const handleClose = () => {
    setEditing(null)
  }

  const startAdd = (dayOfWeek: DailyPlansDayKey, selectedStrategy: STRATEGIES) => {
    const next = resetDefaultStratState()
    if (selectedStrategy !== STRATEGIES.SUBSCRIBE_CHASE) {
      const current = next[selectedStrategy] as ATM_STRADDLE_CONFIG | ATM_STRANGLE_CONFIG
      next[selectedStrategy] = {
        ...current,
        instruments: { ...SINGLE_INDEX },
      } as AvailablePlansConfig
    }
    setStratState(next)
    setEditing({ day: dayOfWeek, strategy: selectedStrategy })
  }

  const stratOnChangeHandler = (
    changedProps: Partial<AvailablePlansConfig>,
    strategy: STRATEGIES
  ) => {
    if ("instruments" in changedProps && changedProps.instruments != null) {
      setStratState({
        ...stratState,
        [strategy]: {
          ...stratState[strategy],
          instruments: {
            ...(stratState[strategy] as ATM_STRADDLE_CONFIG | ATM_STRANGLE_CONFIG).instruments,
            ...(changedProps as ATM_STRADDLE_CONFIG | ATM_STRANGLE_CONFIG).instruments,
          },
        },
      })
    } else {
      setStratState({
        ...stratState,
        [strategy]: {
          ...stratState[strategy],
          ...changedProps,
        },
      })
    }
  }

  const commonOnCancelHandler = () => {
    handleClose()
  }

  const cleanupForRemoteSync = (props: AvailablePlansConfig) => {
    const {
      instruments: _instruments,
      disableInstrumentChange: _disable,
      ...rest
    } = props as AvailablePlansConfig & { instruments?: unknown; disableInstrumentChange?: unknown }
    return rest as AvailablePlansConfig
  }

  const commonOnSubmitHandler = async (
    formattedStateForApiProps: AvailablePlansConfig
  ): Promise<any> => {
    try {
      const selectedConfig = stratState[currentEditStrategy!]

      if (currentEditStrategy === STRATEGIES.SUBSCRIBE_CHASE) {
        const chaseConfig = cleanupForRemoteSync({
          ...selectedConfig,
          strategy: STRATEGIES.SUBSCRIBE_CHASE,
          name: "Chase",
          instrument: INSTRUMENTS.NIFTY,
          expiryType: EXPIRY_TYPE.CURRENT,
          productType: PRODUCT_TYPE.NRML,
        } as any)

        let chaseUpdatedConfig: Record<string, unknown>
        if (selectedConfig.id) {
          await axios.put("/api/plan", {
            id: selectedConfig.id,
            dayOfWeek: currentEditDay?.toUpperCase(),
            config: chaseConfig,
          })
          chaseUpdatedConfig = { [selectedConfig.id]: { ...chaseConfig, id: selectedConfig.id } }
        } else {
          const { data: newConfig } = await axios.post("/api/plan", {
            dayOfWeek: currentEditDay?.toUpperCase(),
            config: [chaseConfig],
          })
          chaseUpdatedConfig = { [newConfig.id]: newConfig }
        }

        setDayState({
          ...dayState,
          [currentEditDay as string]: {
            ...dayState[currentEditDay!],
            strategies: {
              ...dayState[currentEditDay!].strategies,
              ...chaseUpdatedConfig,
            },
          },
        })
        handleClose()
        return
      }

      let updatedConfig: Record<string, unknown>
      if (selectedConfig.id) {
        await axios.put("/api/plan", {
          id: selectedConfig.id,
          dayOfWeek: currentEditDay?.toUpperCase(),
          config: cleanupForRemoteSync({
            ...selectedConfig,
            ...formattedStateForApiProps,
          } as AvailablePlansConfig),
        })

        updatedConfig = { [selectedConfig.id]: selectedConfig }
      } else {
        const straddleOrStrangleConfig = selectedConfig as ATM_STRADDLE_CONFIG | ATM_STRANGLE_CONFIG
        const config = Object.keys(straddleOrStrangleConfig.instruments)
          .filter(instrument => straddleOrStrangleConfig.instruments[instrument])
          .slice(0, 1)
          .map(
            (instrument): AvailablePlansConfig => ({
              ...selectedConfig,
              ...formattedStateForApiProps,
              instrument: instrument as INSTRUMENTS,
              strategy: currentEditStrategy as any,
            })
          )
          .map(cleanupForRemoteSync)

        if (config.length === 0) {
          window.alert("Pick an index before saving.")
          return
        }

        const { data: newStrategyConfig } = await axios.post("/api/plan", {
          dayOfWeek: currentEditDay?.toUpperCase(),
          config,
        })

        updatedConfig = { [newStrategyConfig.id]: newStrategyConfig }
      }

      setDayState({
        ...dayState,
        [currentEditDay as string]: {
          ...dayState[currentEditDay!],
          strategies: {
            ...dayState[currentEditDay!].strategies,
            ...updatedConfig,
          },
        },
      })
      handleClose()
    } catch (err: any) {
      window.alert(err?.response?.data?.error || err.message || "Could not save template")
    }
  }

  const handleEditStrategyConfig = ({
    dayOfWeek,
    strategyKey,
  }: {
    dayOfWeek: DailyPlansDayKey
    strategyKey: string
  }) => {
    const stratConfig = dayState[dayOfWeek].strategies[strategyKey]
    const { strategy } = stratConfig

    if (strategy === STRATEGIES.SUBSCRIBE_CHASE) {
      setStratState({
        ...stratState,
        [strategy]: {
          ...STRATEGIES_DETAILS[strategy].defaultFormState,
          ...stratConfig,
        },
      })
    } else {
      setStratState({
        ...stratState,
        [strategy]: {
          ...STRATEGIES_DETAILS[strategy].defaultFormState,
          ...stratConfig,
          instruments: { [stratConfig.instrument]: true } as Record<INSTRUMENTS, boolean>,
          disableInstrumentChange: true,
        },
      })
    }

    setEditing({ day: dayOfWeek, strategy, strategyKey })
  }

  const handleDeleteStrategyConfig = async ({
    dayOfWeek,
    strategyKey,
  }: {
    dayOfWeek: DailyPlansDayKey
    strategyKey: string
  }) => {
    const stratConfig = dayState[dayOfWeek].strategies[strategyKey]
    await axios.delete("/api/plan", {
      data: {
        dayOfWeek: dayOfWeek.toUpperCase(),
        config: stratConfig,
      },
    })

    if (editing?.strategyKey === strategyKey) {
      handleClose()
    }

    setDayState({
      ...dayState,
      [dayOfWeek]: {
        ...dayState[dayOfWeek],
        strategies: Object.keys(dayState[dayOfWeek].strategies)
          .filter(key => key !== strategyKey)
          .reduce(
            (accum, key) => ({
              ...accum,
              [key]: dayState[dayOfWeek].strategies[key],
            }),
            {}
          ),
      },
    })
  }

  const reloadPlans = async () => {
    const { data } = await axios("/api/plan")
    setDayState(groupPlansByDay(data, emptyDayState()))
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: load weekday plans once on mount
  useEffect(() => {
    reloadPlans().catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!router.isReady) return
    const browseQuery = router.query.browse
    const strategyQuery = router.query.strategy
    if (browseQuery === "strategy") {
      setBrowse("strategy")
    }
    if (isPlanStrategy(strategyQuery)) {
      setActiveStrategy(strategyQuery)
      if (browseQuery === "strategy") {
        setBrowse("strategy")
      }
    }
  }, [router.isReady, router.query.browse, router.query.strategy])

  const syncUrl = (mode: "day" | "strategy", strategy: STRATEGIES) => {
    if (mode === "day") {
      void router.replace("/plan", undefined, { shallow: true })
      return
    }
    void router.replace({ pathname: "/plan", query: { browse: "strategy", strategy } }, undefined, {
      shallow: true,
    })
  }

  const configsFor = (dayOfWeek: DailyPlansDayKey, strategy: STRATEGIES) =>
    Object.entries(dayState[dayOfWeek].strategies).filter(
      ([, config]) => config.strategy === strategy
    )

  const isAdding = (dayOfWeek: DailyPlansDayKey, strategy: STRATEGIES) =>
    Boolean(
      editing && !editing.strategyKey && editing.day === dayOfWeek && editing.strategy === strategy
    )

  const applyDefaultsToForm = async (strategy: STRATEGIES, keepId?: string) => {
    const { data } = await axios.get("/api/strategy-defaults", { params: { strategy } })
    const merged = {
      ...getDefaultState(strategy),
      ...data.config,
      id: keepId,
    } as AvailablePlansConfig
    if (strategy !== STRATEGIES.SUBSCRIBE_CHASE) {
      const row = merged as ATM_STRADDLE_CONFIG | ATM_STRANGLE_CONFIG
      const fromConfig = row.instrument
        ? ({ [row.instrument]: true } as Record<INSTRUMENTS, boolean>)
        : { ...SINGLE_INDEX }
      setStratState({
        ...stratState,
        [strategy]: { ...row, instruments: { ...SINGLE_INDEX, ...fromConfig } },
      })
      return
    }
    setStratState({ ...stratState, [strategy]: merged })
  }

  const handleSaveAsDefaults = async (strategy: STRATEGIES) => {
    const raw = stratState[strategy]
    const config = strategy === STRATEGIES.SUBSCRIBE_CHASE ? raw : cleanupForRemoteSync(raw)
    await axios.put("/api/strategy-defaults", { strategy, config })
    window.alert("Saved as master defaults for this strategy.")
  }

  const handleResetSaved = async (
    dayOfWeek: DailyPlansDayKey,
    strategy: STRATEGIES,
    strategyKey: string
  ) => {
    if (!window.confirm("Replace this weekday template with the master defaults?")) return
    const existing = dayState[dayOfWeek].strategies[strategyKey]
    const { data } = await axios.get("/api/strategy-defaults", { params: { strategy } })
    const config = cleanupForRemoteSync({
      ...getDefaultState(strategy),
      ...data.config,
      id: existing.id,
      name: (data.config.name as string) || existing.name,
      instrument:
        existing && "instrument" in existing && existing.instrument
          ? existing.instrument
          : INSTRUMENTS.NIFTY,
      strategy,
      expiryType: EXPIRY_TYPE.CURRENT,
      productType: strategy === STRATEGIES.SUBSCRIBE_CHASE ? PRODUCT_TYPE.NRML : PRODUCT_TYPE.MIS,
    } as AvailablePlansConfig)
    await axios.put("/api/plan", {
      id: existing.id,
      dayOfWeek: dayOfWeek.toUpperCase(),
      config,
    })
    await reloadPlans()
    handleClose()
  }

  const handleCopyToOtherDays = async (
    dayOfWeek: DailyPlansDayKey,
    strategy: STRATEGIES,
    strategyKey: string
  ) => {
    if (!window.confirm("Overwrite the other weekdays with this saved template?")) return
    const existing = dayState[dayOfWeek].strategies[strategyKey]
    await axios.post("/api/plan/copy", {
      dayOfWeek: dayOfWeek.toUpperCase(),
      strategy,
      id: existing.id,
    })
    await reloadPlans()
  }

  const renderChaseForm = (dayOfWeek: DailyPlansDayKey) => (
    <Box sx={{ mt: 1 }}>
      <Typography variant="subtitle2" sx={{ mb: 2 }}>
        Chase · {dayState[dayOfWeek].heading}
      </Typography>
      <TextField
        label="Lots"
        size="small"
        type="text"
        inputMode="numeric"
        slotProps={{ htmlInput: { pattern: "[0-9]*" } }}
        value={
          (stratState[STRATEGIES.SUBSCRIBE_CHASE] as any)?.lots
            ? String((stratState[STRATEGIES.SUBSCRIBE_CHASE] as any).lots)
            : ""
        }
        onChange={e => {
          const raw = e.target.value.replace(/[^0-9]/g, "")
          stratOnChangeHandler(
            { lots: raw === "" ? 0 : parseInt(raw, 10) } as any,
            STRATEGIES.SUBSCRIBE_CHASE
          )
        }}
        onBlur={() => {
          const current = (stratState[STRATEGIES.SUBSCRIBE_CHASE] as any)?.lots ?? 0
          if (current < 1) stratOnChangeHandler({ lots: 1 } as any, STRATEGIES.SUBSCRIBE_CHASE)
        }}
        sx={{ mb: 2, maxWidth: 200 }}
      />
      <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: "wrap" }}>
        <Button
          variant="contained"
          onClick={() => commonOnSubmitHandler(stratState[STRATEGIES.SUBSCRIBE_CHASE]!)}
        >
          Save
        </Button>
        <Button
          onClick={() =>
            applyDefaultsToForm(
              STRATEGIES.SUBSCRIBE_CHASE,
              stratState[STRATEGIES.SUBSCRIBE_CHASE]?.id
            )
          }
        >
          Reset to default
        </Button>
        <Button onClick={() => handleSaveAsDefaults(STRATEGIES.SUBSCRIBE_CHASE)}>
          Save as defaults
        </Button>
        <Button onClick={commonOnCancelHandler}>Cancel</Button>
      </Stack>
    </Box>
  )

  const renderStrategyForm = (dayOfWeek: DailyPlansDayKey, strategy: STRATEGIES) => {
    const heading = `${STRATEGIES_DETAILS[strategy].heading} · ${dayState[dayOfWeek].heading}`
    const toolbar =
      strategy === STRATEGIES.SUBSCRIBE_CHASE ? null : (
        <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: "wrap" }}>
          <Button
            size="small"
            onClick={() => applyDefaultsToForm(strategy, stratState[strategy]?.id)}
          >
            Reset to default
          </Button>
          <Button size="small" onClick={() => handleSaveAsDefaults(strategy)}>
            Save as defaults
          </Button>
        </Stack>
      )
    if (strategy === STRATEGIES.SUBSCRIBE_CHASE) {
      return renderChaseForm(dayOfWeek)
    }
    if (strategy === STRATEGIES.ATM_STRADDLE) {
      return (
        <Box>
          {toolbar}
          <ATMStraddleTradeForm
            embedded
            formHeading={heading}
            state={stratState[STRATEGIES.ATM_STRADDLE] as ATM_STRADDLE_CONFIG}
            onChange={changedProps => stratOnChangeHandler(changedProps, STRATEGIES.ATM_STRADDLE)}
            onSubmit={commonOnSubmitHandler}
            onCancel={commonOnCancelHandler}
            isRunnable={false}
            strategy={STRATEGIES.ATM_STRADDLE}
          />
        </Box>
      )
    }
    return (
      <Box>
        {toolbar}
        <ATMStrangleTradeForm
          embedded
          formHeading={heading}
          state={stratState[STRATEGIES.ATM_STRANGLE] as ATM_STRANGLE_CONFIG}
          onChange={changedProps => stratOnChangeHandler(changedProps, STRATEGIES.ATM_STRANGLE)}
          onSubmit={commonOnSubmitHandler}
          onCancel={commonOnCancelHandler}
          isRunnable={false}
          strategy={STRATEGIES.ATM_STRANGLE}
        />
      </Box>
    )
  }

  const renderStrategyBlock = (dayOfWeek: DailyPlansDayKey, strategy: STRATEGIES) => {
    const rows = configsFor(dayOfWeek, strategy)
    const adding = isAdding(dayOfWeek, strategy)
    const title =
      browse === "day" ? STRATEGIES_DETAILS[strategy].heading : dayState[dayOfWeek].heading

    return (
      <Paper key={`${dayOfWeek}_${strategy}`} sx={{ p: { xs: 2, sm: 2.5 }, mb: 2 }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          sx={{ mb: 1.5, alignItems: { sm: "center" }, justifyContent: "space-between" }}
        >
          <Box>
            <Typography variant="h6">{title}</Typography>
            <Typography variant="caption" color="text.secondary">
              One weekday template. Index (not the name) is what gets traded.
            </Typography>
          </Box>
          {rows.length === 0 ? (
            <Button
              size="small"
              variant="outlined"
              onClick={() => startAdd(dayOfWeek, strategy)}
              disabled={adding}
            >
              Add configuration
            </Button>
          ) : null}
        </Stack>

        {rows.length > 1 ? (
          <Typography color="warning.main" variant="body2" sx={{ mb: 1 }}>
            More than one row is saved for this weekday. Keep one and delete the extras.
          </Typography>
        ) : null}

        {rows.length === 0 && !adding ? (
          <Typography color="text.secondary" variant="body2">
            Nothing saved here yet.
          </Typography>
        ) : null}

        <Stack spacing={2}>
          {rows.map(([strategyKey, config]) => {
            const isThisEdit = editing?.strategyKey === strategyKey
            if (isThisEdit) {
              return <Box key={strategyKey}>{renderStrategyForm(dayOfWeek, strategy)}</Box>
            }
            return (
              <Paper key={strategyKey} variant="outlined" sx={{ p: 2 }}>
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1}
                  sx={{ mb: 1, justifyContent: "space-between", alignItems: { sm: "flex-start" } }}
                >
                  <Typography variant="subtitle1">
                    {config.name || STRATEGIES_DETAILS[strategy].heading}
                  </Typography>
                  <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                    <Button
                      size="small"
                      onClick={() => handleEditStrategyConfig({ dayOfWeek, strategyKey })}
                    >
                      Edit
                    </Button>
                    <Button
                      size="small"
                      onClick={() => handleCopyToOtherDays(dayOfWeek, strategy, strategyKey)}
                    >
                      Copy to other days
                    </Button>
                    <Button
                      size="small"
                      onClick={() => handleResetSaved(dayOfWeek, strategy, strategyKey)}
                    >
                      Reset to default
                    </Button>
                    <Button
                      size="small"
                      color="error"
                      onClick={() => handleDeleteStrategyConfig({ dayOfWeek, strategyKey })}
                    >
                      Delete
                    </Button>
                  </Stack>
                </Stack>
                <TradeDetails
                  strategy={strategy}
                  tradeDetails={config as unknown as SUPPORTED_TRADE_CONFIG}
                />
              </Paper>
            )
          })}
          {adding ? renderStrategyForm(dayOfWeek, strategy) : null}
        </Stack>
      </Paper>
    )
  }

  return (
    <Layout title="Trade plan" maxWidth="xl">
      <Typography variant="h5" component="h1">
        Weekday templates
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 1, mt: 0.5 }}>
        Weekday templates for straddle and strangle only. Chase has its own plan (one config, pause
        and resume).
      </Typography>
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <Button component={Link} href="/help/plan" size="small">
          Plan guide
        </Button>
        <Button component={Link} href="/chase" size="small">
          Chase plan
        </Button>
      </Stack>

      <ToggleButtonGroup
        exclusive
        value={browse}
        onChange={(_e, next: "day" | "strategy" | null) => {
          if (!next) return
          setBrowse(next)
          setEditing(null)
          syncUrl(next, activeStrategy)
        }}
        sx={{ mb: 2 }}
      >
        <ToggleButton value="day">By day</ToggleButton>
        <ToggleButton value="strategy">By strategy</ToggleButton>
      </ToggleButtonGroup>

      {browse === "day" ? (
        <>
          <ToggleButtonGroup
            exclusive
            value={activeDay}
            onChange={(_e, next) => {
              if (!next) return
              setActiveDay(next)
              setEditing(null)
            }}
            sx={{ mb: 3, flexWrap: "wrap" }}
          >
            {DAYS.map(dayOfWeek => {
              const count = Object.keys(dayState[dayOfWeek].strategies).length
              return (
                <ToggleButton key={dayOfWeek} value={dayOfWeek} sx={{ px: 2 }}>
                  {dayState[dayOfWeek].heading}
                  {count ? ` · ${count}` : ""}
                </ToggleButton>
              )
            })}
          </ToggleButtonGroup>

          <Typography variant="overline" color="text.secondary">
            Intraday · same session
          </Typography>
          <Typography variant="overline" color="text.secondary">
            Intraday · straddle and strangle
          </Typography>
          {PLAN_STRATEGIES.map(strategy => renderStrategyBlock(activeDay, strategy))}
        </>
      ) : (
        <>
          <ToggleButtonGroup
            exclusive
            value={activeStrategy}
            onChange={(_e, next: STRATEGIES | null) => {
              if (!next) return
              setActiveStrategy(next)
              setEditing(null)
              syncUrl("strategy", next)
            }}
            sx={{ mb: 3, flexWrap: "wrap" }}
          >
            {PLAN_STRATEGIES.map(strategy => (
              <ToggleButton key={strategy} value={strategy} sx={{ px: 2 }}>
                {STRATEGIES_DETAILS[strategy].heading}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            One weekday template per strategy. Chase is not here — open Chase plan. Use Copy to
            other days after you save.
          </Typography>
          {DAYS.map(dayOfWeek => renderStrategyBlock(dayOfWeek, activeStrategy))}
        </>
      )}
    </Layout>
  )
}

export default Plan
export { getServerSideProps } from "../lib/ssrPage"
