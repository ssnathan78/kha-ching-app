import { spawnSync } from "node:child_process"

const args = process.argv.slice(2)
const result = spawnSync(
  process.platform === "win32" ? "yarn.cmd" : "yarn",
  [
    "jest",
    "./__tests__/simulation/cli.test.ts",
    "--setupFiles",
    "./__tests__/loadEnv.js",
    "--setupFiles",
    "./__tests__/simulation/setup.js",
    "--forceExit",
    "--testTimeout=180000",
    "--testNamePattern",
    "cli-entry",
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      SIMULATION: "true",
      MOCK_ORDERS: "true",
      SIMULATE_ARGV: JSON.stringify(args),
    },
  }
)

process.exit(result.status ?? 1)
