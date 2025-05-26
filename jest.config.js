// jest.config.js
module.exports = {
  rootDir: '.', // Explicitly set rootDir
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: [
    '<rootDir>/tests/**/*.test.ts',
    '<rootDir>/tests/**/*.spec.ts',
  ],
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
  },
  modulePathIgnorePatterns: ['<rootDir>/frontend/'],
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/frontend/'],
  watchman: false,
  clearMocks: true,
};
