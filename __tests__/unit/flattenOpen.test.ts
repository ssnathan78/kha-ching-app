import { parseFlattenScope } from "../../lib/flattenScope"

describe("parseFlattenScope", () => {
  it("accepts exactly one selector", () => {
    expect(parseFlattenScope({ all: true })).toEqual({ ok: true, scope: { kind: "all" } })
    expect(parseFlattenScope({ intraday: true })).toEqual({
      ok: true,
      scope: { kind: "intraday" },
    })
    expect(parseFlattenScope({ strategy: "chase" })).toEqual({
      ok: true,
      scope: { kind: "strategy", strategy: "CHASE" },
    })
    expect(parseFlattenScope({ jobId: " job-1 " })).toEqual({
      ok: true,
      scope: { kind: "job", jobId: "job-1" },
    })
    expect(parseFlattenScope({ positionId: "pos-1" })).toEqual({
      ok: true,
      scope: { kind: "position", positionId: "pos-1" },
    })
  })

  it("rejects missing, unknown, or mixed selectors", () => {
    expect(parseFlattenScope({}).ok).toBe(false)
    expect(parseFlattenScope({ strategy: "IRON_FLY" }).ok).toBe(false)
    expect(parseFlattenScope({ all: true, strategy: "CHASE" }).ok).toBe(false)
  })
})
