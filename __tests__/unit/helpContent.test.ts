import { HELP_PAGES, HELP_TOPICS, type HelpTopic } from "../../lib/helpContent"

describe("help content", () => {
  it("covers every advertised topic", () => {
    expect([...HELP_TOPICS].sort()).toEqual(
      ["chase", "desk", "plan", "straddle", "strangle"].sort()
    )
    for (const topic of HELP_TOPICS) {
      expect(HELP_PAGES[topic].title.length).toBeGreaterThan(3)
      expect(HELP_PAGES[topic].summary.length).toBeGreaterThan(20)
      expect(HELP_PAGES[topic].sections.length).toBeGreaterThan(0)
    }
  })

  it("gives each section a unique id and at least one paragraph", () => {
    for (const topic of HELP_TOPICS) {
      const ids = HELP_PAGES[topic].sections.map(section => section.id)
      expect(new Set(ids).size).toBe(ids.length)
      for (const section of HELP_PAGES[topic].sections) {
        expect(section.body.length).toBeGreaterThan(0)
        expect(section.body.every(paragraph => paragraph.length > 10)).toBe(true)
      }
    }
  })

  it("documents name vs index on plan and contract pages", () => {
    const plan = HELP_PAGES.plan.sections.find(s => s.id === "name-vs-index")
    expect(plan?.body.join(" ")).toMatch(/index/i)
    expect(HELP_PAGES.straddle.sections.some(s => s.id === "contract")).toBe(true)
    expect(HELP_PAGES.strangle.sections.some(s => s.id === "contract")).toBe(true)
  })

  it("keeps HelpTopic keys aligned with HELP_PAGES", () => {
    const keys = Object.keys(HELP_PAGES) as HelpTopic[]
    expect([...keys].sort()).toEqual([...HELP_TOPICS].sort())
  })
})
