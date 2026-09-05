const nextJest = require("next/jest")

const createJestConfig = nextJest({ dir: "./" })

module.exports = createJestConfig({
  testEnvironment: "node",
  setupFiles: ["<rootDir>/__tests__/loadEnv.js"],
  moduleFileExtensions: ["js", "ts", "tsx", "json"],
  testPathIgnorePatterns: [
    "<rootDir>/.next/",
    "<rootDir>/node_modules/",
    "<rootDir>/__tests__/live/",
    "<rootDir>/__tests__/e2e/",
    "<rootDir>/__tests__/support/",
    "<rootDir>/__tests__/unitMocks.js",
    "<rootDir>/__tests__/apiMocks.js",
    "<rootDir>/__tests__/api/setup.ts",
    "<rootDir>/__tests__/simulation/setup.js",
    "<rootDir>/__tests__/simulation/jest.after.js",
  ],
  collectCoverage: false,
  coveragePathIgnorePatterns: ["/node_modules/", "/.next/", "/__tests__/"],
  collectCoverageFrom: [
    "lib/**/*.{js,ts}",
    "pages/api/**/*.{js,ts}",
    "!lib/strategies/mockData/**",
  ],
  moduleNameMapper: {
    "\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$":
      "<rootDir>/__mocks__/mocks.js",
    "\\.(css|less|scss)$": "identity-obj-proxy",
  },
  transformIgnorePatterns: ["/node_modules/(?!(drizzle-orm|axios)/)"],
})
