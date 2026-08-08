import type { Config } from 'jest';

const config: Config = {
  testMatch: ['<rootDir>/tests/**/*.api.ts'],
  transform: { '^.+\\.tsx?$': ['ts-jest', { useESM: false }] },
  testTimeout: 30_000,
  verbose: true,
  forceExit: true,
  detectOpenHandles: true,
};

export default config;
