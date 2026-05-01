module.exports = {
  testEnvironment: 'node',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.d.ts',
    '!**/node_modules/**',
    '!**/test/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  testMatch: [
    '**/test/**/*.test.js',
    '**/__tests__/**/*.js'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/examples/'
  ],
  verbose: true,
  testTimeout: 10000,
  coverageThresholds: {
    global: {
      branches: 80,
      functions: 90,
      lines: 90,
      statements: 90
    }
  }
};