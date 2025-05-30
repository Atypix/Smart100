// tests/setupEnv.ts

// Mock for uuid must be defined BEFORE apiKeyService is imported.
let mockUuidCounter = 0;
const actualUuid = jest.requireActual('uuid'); // Store actual uuid if needed

const uuidMockObject = {
  __esModule: true,
  v4: jest.fn(() => {
    mockUuidCounter++;
    return `mock-uuid-global-${mockUuidCounter}`;
  }),
  _resetMockCounter: () => {
    mockUuidCounter = 0;
  },
  _getActual: () => actualUuid,
};
jest.mock('uuid', () => uuidMockObject);

// Now, other imports and setup
import dotenv from 'dotenv';
import path from 'path'; // Make sure to import 'path'
import { initializeApiKeyService } from '../src/services/apiKeyService'; // Corrected path

const envPath = path.resolve(__dirname, '../.env'); // Corrected path to .env at project root
dotenv.config({ path: envPath });

// Set a consistent JWT_SECRET for all tests
process.env.JWT_SECRET = 'a_very_secure_and_consistent_test_secret_123!'; 
console.log('[tests/setupEnv.ts] JWT_SECRET set for tests.');

console.log('[tests/setupEnv.ts] process.env.API_ENCRYPTION_KEY_HEX after dotenv:', process.env.API_ENCRYPTION_KEY_HEX); // For verification

// Initialize the ApiKeyService with the now-loaded environment variables
initializeApiKeyService(); 

console.log('[tests/setupEnv.ts] ApiKeyService explicitly re-initialized.'); // For verification
