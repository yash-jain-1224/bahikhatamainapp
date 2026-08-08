// Jest config for whatsapp-ai-service.
// Uses ts-jest (hoisted at the repo root) with a test-scoped tsconfig; the
// package's own tsconfig only includes src/ (build output must not contain
// tests).
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  setupFiles: ['<rootDir>/tests/setup-env.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.jest.json' }],
  },
  // Some modules keep unref'd housekeeping intervals; force a clean exit.
  forceExit: true,
};
