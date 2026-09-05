import { runCli } from "../../lib/simulation/cli"

describe("simulate CLI", () => {
  it("lists scenarios", async () => {
    const code = await runCli(["--list"])
    expect(code).toBe(0)
  })

  it("runs a named deterministic scenario", async () => {
    const code = await runCli(["--scenario", "flat", "--seed", "1"])
    expect(code).toBe(0)
  })
})

const argv = process.env.SIMULATE_ARGV
if (argv) {
  it("cli-entry", async () => {
    const code = await runCli(JSON.parse(argv))
    if (code !== 0) throw new Error(`simulate CLI exited ${code}`)
  })
}
