// tests/setupMocks.ts
// Note: We don't actually need to import the logger here to mock it.
// The path in jest.mock is relative to the project root or module paths.

jest.mock('../src/utils/logger', () => ({ // Path relative to project root
  __esModule: true, // This is important for ES Modules
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(), // Added verbose as it was in other mocks
    silly: jest.fn(),   // Added silly as it was in other mocks
  },
}));
