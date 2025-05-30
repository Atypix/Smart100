// tests/setupMocks.ts

// Mock for logger
jest.mock('../src/utils/logger', () => ({ // Path relative to project root
  __esModule: true, // This is important for ES Modules
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
    silly: jest.fn(),
  },
}));

// The uuid mock has been moved to tests/setupEnv.ts to ensure it's applied
// before apiKeyService is imported by tests/setupEnv.ts.
