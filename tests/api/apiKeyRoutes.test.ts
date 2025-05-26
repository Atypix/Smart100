// tests/api/apiKeyRoutes.test.ts
import request from 'supertest';
import { app } from '../../src/index';
import { db, initializeSchema } from '../../src/database';
import * as userService from '../../src/services/userService';
import * as apiKeyService from '../../src/services/apiKeyService'; // For direct interaction if needed for setup/teardown
import { User } from '../../src/models/user.types';
import { ApiKey, CreateApiKeyInput } from '../../src/models/apiKey.types';
import logger from '../../src/utils/logger';

// Suppress console logs from the application during tests
jest.spyOn(logger, 'info').mockImplementation(jest.fn());
jest.spyOn(logger, 'warn').mockImplementation(jest.fn());
jest.spyOn(logger, 'error').mockImplementation(jest.fn());

const TEST_USER_EMAIL = 'apikeytestuser@example.com';
const TEST_USER_PASSWORD = 'Password123!';
let testUser: User;
let authToken: string;

const MOCK_ENCRYPTION_KEY_HEX = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'; // 64 hex chars
const JWT_TEST_SECRET = 'test_jwt_secret_for_api_key_routes_!@#$%^&*()_+';

beforeAll(async () => {
  process.env.API_ENCRYPTION_KEY = MOCK_ENCRYPTION_KEY_HEX;
  process.env.JWT_SECRET = JWT_TEST_SECRET;

  // Ensure schema is up-to-date
  try {
    db.exec("DROP TABLE IF EXISTS api_keys;");
    db.exec("DROP TABLE IF EXISTS users;");
  } catch (e) { /* ignore */ }
  initializeSchema();

  // Register and login a test user to get a token
  await request(app)
    .post('/auth/register')
    .send({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD });
  
  const loginRes = await request(app)
    .post('/auth/login')
    .send({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD });
  
  authToken = loginRes.body.token;
  testUser = userService.findUserByEmail(TEST_USER_EMAIL)!; // Get the full user object

  if (!authToken || !testUser) {
    throw new Error('Failed to setup test user and token for API key tests.');
  }
});

beforeEach(() => {
  // Clean api_keys table before each test, but keep the testUser
  // If other users are created in specific tests, they should be cleaned up there or use unique emails.
  db.prepare('DELETE FROM api_keys WHERE user_id = ?').run(testUser.id);
});

afterAll(() => {
  // Clean up the test user
  db.exec(`DELETE FROM api_keys WHERE user_id = '${testUser.id}';`);
  db.exec(`DELETE FROM users WHERE id = '${testUser.id}';`);
  // db.close(); // Close db if it's exclusively for tests and not shared
});


describe('API Key Management Routes (/api/keys)', () => {
  describe('POST /api/keys', () => {
    it('should create a new API key successfully', async () => {
      const apiKeyData = {
        exchange_name: 'Binance',
        api_key: 'binance_api_key_123',
        api_secret: 'binance_api_secret_456',
      };
      const res = await request(app)
        .post('/api/keys')
        .set('Authorization', `Bearer ${authToken}`)
        .send(apiKeyData);

      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.exchange_name).toBe(apiKeyData.exchange_name);
      expect(res.body.api_key).toBe(apiKeyData.api_key); // Route returns decrypted key
      expect(res.body.api_secret).toBe(apiKeyData.api_secret); // Route returns decrypted secret
      expect(res.body.user_id).toBe(testUser.id);
    });

    it('should return 400 for missing exchange_name', async () => {
      const res = await request(app)
        .post('/api/keys')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ api_key: 'key', api_secret: 'secret' });
      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('Invalid input');
    });
    
    it('should return 400 for empty api_key', async () => {
      const res = await request(app)
        .post('/api/keys')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ exchange_name: 'Testex', api_key: '', api_secret: 'secret' });
      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('Invalid input');
    });

    it('should return 401 if no token is provided', async () => {
      const res = await request(app)
        .post('/api/keys')
        .send({ exchange_name: 'Binance', api_key: 'key', api_secret: 'secret' });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/keys', () => {
    beforeEach(async () => {
      // Create a couple of keys for the testUser
      await apiKeyService.createApiKey({ user_id: testUser.id, exchange_name: 'Exchange1', api_key: 'key1', api_secret: 'secret1' });
      await apiKeyService.createApiKey({ user_id: testUser.id, exchange_name: 'Exchange2', api_key: 'key2', api_secret: 'secret2' });
    });

    it('should retrieve all API keys for the authenticated user', async () => {
      const res = await request(app)
        .get('/api/keys')
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(res.statusCode).toBe(200);
      expect(res.body).toBeInstanceOf(Array);
      expect(res.body.length).toBe(2);
      expect(res.body[0].exchange_name).toBe('Exchange1');
      expect(res.body[1].exchange_name).toBe('Exchange2');
      expect(res.body[0].api_key).toBe('key1'); // Decrypted
    });

    it('should return 401 if no token is provided', async () => {
      const res = await request(app).get('/api/keys');
      expect(res.statusCode).toBe(401);
    });
  });

  describe('PUT /api/keys/:id', () => {
    let existingApiKey: ApiKey;

    beforeEach(async () => {
      existingApiKey = await apiKeyService.createApiKey({
        user_id: testUser.id,
        exchange_name: 'InitialExchange',
        api_key: 'initialKey',
        api_secret: 'initialSecret',
      });
    });

    it('should update an existing API key successfully', async () => {
      const updateData = {
        exchange_name: 'UpdatedExchangeName',
        api_key: 'updatedApiKey123',
        // Not updating secret
      };
      const res = await request(app)
        .put(`/api/keys/${existingApiKey.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData);

      expect(res.statusCode).toBe(200);
      expect(res.body.id).toBe(existingApiKey.id);
      expect(res.body.exchange_name).toBe(updateData.exchange_name);
      expect(res.body.api_key).toBe(updateData.api_key);
      expect(res.body.api_secret).toBe('initialSecret'); // Secret should remain unchanged
    });

    it('should return 404 if API key ID does not exist', async () => {
      const res = await request(app)
        .put('/api/keys/non-existent-uuid')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ exchange_name: 'TryingToUpdate' });
      expect(res.statusCode).toBe(404);
    });

    it('should return 404 if API key belongs to another user', async () => {
      // Create another user and an API key for them
      const otherUserRes = await request(app)
        .post('/auth/register')
        .send({ email: 'otheruser@example.com', password: 'Password123!' });
      const otherUserId = otherUserRes.body.id;
      const otherKey = await apiKeyService.createApiKey({ user_id: otherUserId, exchange_name: 'OtherUserExchange', api_key: 'otherkey', api_secret: 'othersecret' });

      const res = await request(app)
        .put(`/api/keys/${otherKey.id}`) // Attempt to update other user's key
        .set('Authorization', `Bearer ${authToken}`) // Using main testUser's token
        .send({ exchange_name: 'MaliciousUpdate' });
      expect(res.statusCode).toBe(404); // Service returns null, route translates to 404
      
      // Cleanup other user
      db.exec(`DELETE FROM api_keys WHERE user_id = '${otherUserId}';`);
      db.exec(`DELETE FROM users WHERE id = '${otherUserId}';`);
    });
    
    it('should return 400 for invalid input (e.g. empty exchange_name)', async () => {
        const res = await request(app)
        .put(`/api/keys/${existingApiKey.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ exchange_name: '' }); // Invalid: empty name
      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('Invalid input: exchange_name must be a non-empty string if provided.');
    });


    it('should return 401 if no token is provided', async () => {
      const res = await request(app)
        .put(`/api/keys/${existingApiKey.id}`)
        .send({ exchange_name: 'NoAuthUpdate' });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('DELETE /api/keys/:id', () => {
    let apiKeyToDelete: ApiKey;

    beforeEach(async () => {
      apiKeyToDelete = await apiKeyService.createApiKey({
        user_id: testUser.id,
        exchange_name: 'ToDeleteExchange',
        api_key: 'deleteKey',
        api_secret: 'deleteSecret',
      });
    });

    it('should delete an API key successfully', async () => {
      const res = await request(app)
        .delete(`/api/keys/${apiKeyToDelete.id}`)
        .set('Authorization', `Bearer ${authToken}`);
      
      expect(res.statusCode).toBe(204);
      // Verify it's actually deleted from the DB
      const found = await apiKeyService.getApiKeyById(apiKeyToDelete.id, testUser.id);
      expect(found).toBeNull();
    });

    it('should return 404 if API key ID does not exist', async () => {
      const res = await request(app)
        .delete('/api/keys/non-existent-uuid-for-delete')
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.statusCode).toBe(404);
    });

    it('should return 404 if API key belongs to another user', async () => {
      const otherUserRes = await request(app)
        .post('/auth/register')
        .send({ email: 'otheruserfordelete@example.com', password: 'Password123!' });
      const otherUserId = otherUserRes.body.id;
      const otherKey = await apiKeyService.createApiKey({ user_id: otherUserId, exchange_name: 'OtherUserExchangeDel', api_key: 'otherkeyDel', api_secret: 'othersecretDel' });

      const res = await request(app)
        .delete(`/api/keys/${otherKey.id}`)
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.statusCode).toBe(404);
      
      // Cleanup other user
      db.exec(`DELETE FROM api_keys WHERE user_id = '${otherUserId}';`);
      db.exec(`DELETE FROM users WHERE id = '${otherUserId}';`);
    });

    it('should return 401 if no token is provided', async () => {
      const res = await request(app).delete(`/api/keys/${apiKeyToDelete.id}`);
      expect(res.statusCode).toBe(401);
    });
  });
});
