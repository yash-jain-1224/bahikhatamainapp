module.exports = {
  preset: 'react-native',
  rootDir: '.',
  roots: ['<rootDir>'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': 'babel-jest',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-navigation|react-native-reanimated|react-native-gesture-handler|react-native-safe-area-context|react-native-screens|react-native-svg|react-native-vector-icons|@react-native-async-storage)/)',
  ],
  setupFiles: ['./node_modules/react-native-gesture-handler/jestSetup.js'],
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.ts'],
  testMatch: ['**/__tests__/**/*.test.(ts|tsx|js)'],
  moduleNameMapper: {
    // Alias @/ → src/
    '^@/(.*)$': '<rootDir>/src/$1',
    // Platform mock
    '^react-native/Libraries/Utilities/Platform$': '<rootDir>/__tests__/__mocks__/Platform.js',
    // Ensure both relative and aliased imports of theme/Toast/api resolve
    // to the SAME module identity in the Jest registry.
    // These explicit mappings make jest.mock('@/theme') also intercept
    // relative imports like ../../theme from inside src/.
    '^.+/src/theme/ThemeContext$': '<rootDir>/src/theme/ThemeContext',
    '^.+/src/theme$': '<rootDir>/src/theme/index',
    '^.+/src/components/shared/Toast$': '<rootDir>/src/components/shared/Toast',
    '^.+/src/services/api$': '<rootDir>/src/services/api',
  },
  modulePaths: ['<rootDir>'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
  ],
  coverageDirectory: 'coverage',
  testEnvironment: 'node',
  globals: {
    __DEV__: true,
  },
};
