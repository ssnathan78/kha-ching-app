import { spawnSync } from "node:child_process"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const pkg = `@biomejs/cli-${process.platform}-${process.arch}`

try {
  require.resolve(`${pkg}/biome.exe`)
} catch {
  try {
    require.resolve(`${pkg}/biome`)
  } catch {
    console.warn(
      `[pre-commit] ${pkg} is not installed; skipping Biome (common with a Linux node_modules tree on Windows).`
    )
    process.exit(0)
  }
}

const result = spawnSync(
  "yarn",
  ["biome", "check", "--staged", "--write", "--no-errors-on-unmatched"],
  {
    stdio: "inherit",
    shell: process.platform === "win32",
  }
)
process.exit(result.status ?? 1)
