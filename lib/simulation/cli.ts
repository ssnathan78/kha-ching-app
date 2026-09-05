import { listScenarios } from "./catalog"
import { formatSimReport, simFailed } from "./report"
import { simulate } from "./runner"

export async function runCli(argv: string[]): Promise<number> {
  const args = parseArgs(argv)
  if (args.help || args.list) {
    const names = listScenarios().join("\n")
    process.stdout.write(`${args.help ? usage() : names}\n`)
    return 0
  }
  const result = simulate({
    scenario: args.scenario,
    seed: args.seed,
    start: args.start,
    end: args.end,
  })
  process.stdout.write(`${formatSimReport(result)}\n`)
  if (args.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  }
  return simFailed(result) ? 1 : 0
}

function usage(): string {
  return [
    "yarn simulate -- --scenario <name> [--seed n] [--start ...] [--end ...] [--list]",
    "Scenarios:",
    ...listScenarios().map(s => `  ${s}`),
  ].join("\n")
}

function parseArgs(argv: string[]): {
  scenario: string
  seed?: number
  start?: string
  end?: string
  list: boolean
  help: boolean
  json: boolean
} {
  const out = {
    scenario: "normal-day",
    seed: undefined as number | undefined,
    start: undefined as string | undefined,
    end: undefined as string | undefined,
    list: false,
    help: false,
    json: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--scenario" || a === "-s") out.scenario = argv[++i]
    else if (a === "--seed") out.seed = Number(argv[++i])
    else if (a === "--start") out.start = argv[++i]
    else if (a === "--end") out.end = argv[++i]
    else if (a === "--list") out.list = true
    else if (a === "--help" || a === "-h") out.help = true
    else if (a === "--json") out.json = true
  }
  return out
}
