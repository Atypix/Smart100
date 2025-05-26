// tests/setupEnv.ts
// This file is executed by Jest before any tests are run.

// Set a dummy API_ENCRYPTION_KEY for the test environment
// This prevents process.exit(1) in apiKeyService.ts during tests.
// The key must be a 64-character hex string (representing 32 bytes).
process.env.API_ENCRYPTION_KEY = 'a0123456789b0123456789c0123456789d0123456789e0123456789f01234567';

// You can add other global test environment setups here if needed.
console.log('Jest setupEnv.ts: API_ENCRYPTION_KEY has been set for the test environment.');
