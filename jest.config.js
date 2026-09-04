const nextJest = require("next/jest")

const createJestConfig = nextJest({ dir: "./" })

module.exports = createJestConfig({
  setupFiles: ["<rootDir>/__tests__/loadEnv.js"],
  moduleFileExtensions: ["js", "ts"],
  testPathIgnorePatterns: ["<rootDir>/.next/", "<rootDir>/node_modules/"],
  collectCoverage: false,
  coveragePathIgnorePatterns: ["/node_modules/", "/.next/"],
  collectCoverageFrom: ["pages/**/*.{js,ts}", "lib/**/*.{js,ts}"],
  moduleNameMapper: {
    "\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$":
      "<rootDir>/__mocks__/mocks.js",
    "\\.(css|less|scss)$": "identity-obj-proxy",
  },
})
