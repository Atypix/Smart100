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

console.log('[tests/setupEnv.ts] process.env.API_ENCRYPTION_KEY_HEX after dotenv:', process.env.API_ENCRYPTION_KEY_HEX); // For verification

// Initialize the ApiKeyService with the now-loaded environment variables
initializeApiKeyService(); 

console.log('[tests/setupEnv.ts] ApiKeyService explicitly re-initialized.'); // For verification
