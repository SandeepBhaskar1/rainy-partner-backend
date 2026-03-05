module.exports = {
  testEnvironment: "node",
  testTimeout: 30000,
  forceExit: true,
  collectCoverageFrom: [
    "routes/**/*.js",
    "middleware/**/*.js",
    "models/**/*.js",
    "utils/**/*.js",
    "!node_modules/**"
  ],
  coverageThreshold: {
    global: {
      lines: 50
    }
  },
  globalSetup: "./tests/globalSetup.js",
  globalTeardown: "./tests/globalTeardown.js",
  setupFilesAfterEnv: ["./tests/setup.js"]
};