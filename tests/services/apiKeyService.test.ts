// tests/services/apiKeyService.test.ts

// The API_ENCRYPTION_KEY_HEX is now expected to be set by tests/setupEnv.ts
// before these tests run.

import { db, initializeSchema } from '../../src/database';
import * as apiKeyService from '../../src/services/apiKeyService';
import * as userService from '../../src/services/userService';
import { User } from '../../src/models/user.types';
import { ApiKey, CreateApiKeyInput, UpdateApiKeyInput } from '../../src/models/apiKey.types';
// We will import the mocked uuid to control it if needed (e.g. reset counter)
import * as uuid from 'uuid'; // uuid is now the mock object from setupMocks.ts

// Remove local mock for uuid as it's now globally mocked in setupMocks.ts
// let mockUuidCounterForKeyService = 0; 
// jest.mock('uuid', () => ({ ... }));

let testUser: User;
let userEmailCounter = 0; 

beforeAll(() => {
  try {
    db.exec("DROP TABLE IF EXISTS api_keys;");
    db.exec("DROP TABLE IF EXISTS users;");
  } catch (e) { /* ignore */ }
  initializeSchema();
});

beforeEach(async () => {
  db.exec('DELETE FROM api_keys;');
  db.exec('DELETE FROM users;');
  
  // Reset the global UUID mock counter before each test
  // The uuid module imported is actually our uuidMockObject from setupMocks.ts
  if (typeof (uuid as any)._resetMockCounter === 'function') {
    (uuid as any)._resetMockCounter();
  }

  userEmailCounter++;
  testUser = userService.createUser({
    email: `testuser-apikey-${userEmailCounter}@example.com`, // Ensure unique email
    passwordHash: 'password123', // In a real scenario, this would be a proper hash
  });
});

afterAll(() => {
  // db.close(); // Consider if DB should be closed
});

describe('API Key Service (Database and Encryption)', () => {
  describe('createApiKey', () => {
    it('should create, encrypt, store, and return an API key with decrypted values', () => {
      const apiKeyData: CreateApiKeyInput = {
        user_id: testUser.id,
        exchange_name: 'TestExchange',
        api_key: 'myapikey123',
        api_secret: 'myapisecret456',
      };
      // Let uuid generate dynamically via the mock

      const result = apiKeyService.createApiKey(apiKeyData);

      expect(result.id).toMatch(/^mock-uuid-global-/); // Updated expectation for global mock
      expect(result.user_id).toBe(testUser.id);
      expect(result.exchange_name).toBe(apiKeyData.exchange_name);
      expect(result.api_key).toBe(apiKeyData.api_key); 
      expect(result.api_secret).toBe(apiKeyData.api_secret); 
      expect(result.created_at).toEqual(expect.any(Number));
      expect(result.updated_at).toEqual(expect.any(Number));
      expect(result.created_at).toEqual(result.updated_at);

      const dbKey = db.prepare('SELECT * FROM api_keys WHERE id = ?').get(result.id) as any;
      expect(dbKey).toBeDefined();
      expect(dbKey.id).toBe(result.id);
      expect(dbKey.user_id).toBe(testUser.id);
      expect(dbKey.api_key_encrypted).not.toBe(apiKeyData.api_key);
      expect(dbKey.api_secret_encrypted).not.toBe(apiKeyData.api_secret);
      
      const decryptedKeyAgain = apiKeyService.getApiKeyById(result.id, testUser.id);
      expect(decryptedKeyAgain?.api_key).toBe(apiKeyData.api_key);
    });
  });

  describe('getApiKeysByUserId', () => {
    it('should return all API keys for a user, with decrypted values', () => {
      apiKeyService.createApiKey({ user_id: testUser.id, exchange_name: 'E1', api_key: 'k1', api_secret: 's1' });
      apiKeyService.createApiKey({ user_id: testUser.id, exchange_name: 'E2', api_key: 'k2', api_secret: 's2' });

      const keys = apiKeyService.getApiKeysByUserId(testUser.id);
      expect(keys.length).toBe(2);
      // Order might not be guaranteed, so check for presence or sort before asserting
      expect(keys.some(k => k.api_key === 'k1')).toBe(true);
      expect(keys.some(k => k.api_key === 'k2')).toBe(true);
    });
  });

  describe('getApiKeyById', () => {
    it('should return a specific API key by ID for the correct user, with decrypted values', () => {
      const created = apiKeyService.createApiKey({ user_id: testUser.id, exchange_name: 'E_Specific', api_key: 'k_specific', api_secret: 's_specific' });
      const found = apiKeyService.getApiKeyById(created.id, testUser.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
      expect(found!.api_key).toBe('k_specific');
    });

    it('should return null if API key belongs to another user', () => {
      userEmailCounter++;
      const otherUser = userService.createUser({ email: `other-${userEmailCounter}@example.com`, passwordHash: 'pass' });
      const created = apiKeyService.createApiKey({ user_id: otherUser.id, exchange_name: 'E_Other', api_key: 'k_other', api_secret: 's_other' });
      
      const found = apiKeyService.getApiKeyById(created.id, testUser.id); 
      expect(found).toBeNull();
    });
  });

  describe('updateApiKey', () => {
    it('should update specified fields of an API key and return the updated key (decrypted)', async () => {
      const created = apiKeyService.createApiKey({ user_id: testUser.id, exchange_name: 'E_Update', api_key: 'k_update', api_secret: 's_update' });
      
      // Ensure a small delay for timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      const updateData: UpdateApiKeyInput = {
        exchange_name: 'E_Updated_Name',
        api_key: 'k_updated_key', 
      };

      const updated = apiKeyService.updateApiKey(created.id, testUser.id, updateData);
      expect(updated).not.toBeNull();
      expect(updated!.exchange_name).toBe('E_Updated_Name');
      expect(updated!.api_key).toBe('k_updated_key');
      expect(updated!.api_secret).toBe('s_update'); 
      expect(updated!.updated_at).toBeGreaterThan(created.created_at);
    });
    
    it('should return null if trying to update an API key belonging to another user', () => {
      userEmailCounter++;
      const otherUser = userService.createUser({ email: `otherupdate-${userEmailCounter}@example.com`, passwordHash: 'pass' });
      const createdForOther = apiKeyService.createApiKey({ user_id: otherUser.id, exchange_name: 'E_OtherUpdate', api_key: 'k_ou', api_secret: 's_ou' });
      
      const updated = apiKeyService.updateApiKey(createdForOther.id, testUser.id, { exchange_name: 'Attempted Update' });
      expect(updated).toBeNull();
    });
  });

  describe('deleteApiKey', () => {
    it('should delete an API key for the correct user and return true', () => {
      const created = apiKeyService.createApiKey({ user_id: testUser.id, exchange_name: 'E_Delete', api_key: 'k_delete', api_secret: 's_delete' });
      
      const success = apiKeyService.deleteApiKey(created.id, testUser.id);
      expect(success).toBe(true);

      const found = apiKeyService.getApiKeyById(created.id, testUser.id);
      expect(found).toBeNull();
    });

    it('should return false if trying to delete an API key belonging to another user', () => {
      userEmailCounter++;
      const otherUser = userService.createUser({ email: `otherdelete-${userEmailCounter}@example.com`, passwordHash: 'pass' });
      const createdForOther = apiKeyService.createApiKey({ user_id: otherUser.id, exchange_name: 'E_OtherDelete', api_key: 'k_od', api_secret: 's_od' });

      const success = apiKeyService.deleteApiKey(createdForOther.id, testUser.id);
      expect(success).toBe(false);

      const foundForOther = apiKeyService.getApiKeyById(createdForOther.id, otherUser.id);
      expect(foundForOther).not.toBeNull();
    });
  });
});
