// tests/api/auth.test.ts
import request from 'supertest';
import { app } from '../../src/index'; // Assuming app is exported from src/index.ts
import { clearUsers, createUser, findUserByEmail, getAllUsers } from '../../src/services/userService';
import logger from '../../src/utils/logger';

// Suppress console logs from the application during tests for cleaner test output
// Note: This might hide useful debugging logs if tests fail unexpectedly.
// Consider enabling them by default and only suppressing if output is too verbose.
jest.spyOn(logger, 'info').mockImplementation(() => logger);
jest.spyOn(logger, 'warn').mockImplementation(() => logger);
jest.spyOn(logger, 'error').mockImplementation(() => logger);


describe('Auth Endpoints API', () => {
  // No need for server.listen() or server.close() if supertest directly uses the app instance
  // and app.listen is conditional (as configured in src/index.ts)

  beforeEach(() => {
    clearUsers(); // Clear users before each test
    // Ensure JWT_SECRET is set for tests, as it's crucial for /login
    // You might need a more robust way if it's not picked up from a .env.test or similar
    process.env.JWT_SECRET = 'test_jwt_secret_for_api_tests_1234567890_!@#$%^&*()';
  });

  describe('POST /auth/register', () => {
    it('should register a new user successfully', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({ email: 'test@example.com', password: 'password123' });
      expect(res.statusCode).toEqual(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('email', 'test@example.com');
      expect(res.body).not.toHaveProperty('passwordHash'); // Ensure password hash is not returned
    });

    it('should return 409 if email already exists', async () => {
      // Create a user first
      createUser({ email: 'existing@example.com', passwordHash: 'somehash' });

      const res = await request(app)
        .post('/auth/register')
        .send({ email: 'existing@example.com', password: 'password123' });
      expect(res.statusCode).toEqual(409);
      expect(res.body).toHaveProperty('message', 'User already exists with this email.');
    });

    it('should return 400 for missing email', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({ password: 'password123' });
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty('message', 'Email and password are required.');
    });

    it('should return 400 for missing password', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({ email: 'test@example.com' });
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty('message', 'Email and password are required.');
    });
    
    it('should return 400 for invalid email format', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({ email: 'invalidemail', password: 'password123' });
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty('message', 'Invalid email format.');
    });

    it('should return 400 for too short password', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({ email: 'test@example.com', password: '123' });
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty('message', 'Password must be at least 6 characters long.');
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      // Register a user to be used for login tests
      await request(app)
        .post('/auth/register')
        .send({ email: 'loginuser@example.com', password: 'password123' });
    });

    it('should login an existing user successfully', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'loginuser@example.com', password: 'password123' });
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('token');
      // You could also try to decode the token here if needed, but that tests JWT library more than your endpoint
    });

    it('should return 401 for incorrect password', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'loginuser@example.com', password: 'wrongpassword' });
      expect(res.statusCode).toEqual(401);
      expect(res.body).toHaveProperty('message', 'Invalid credentials. Password mismatch.');
    });

    it('should return 401 for non-existent email', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'nouser@example.com', password: 'password123' });
      expect(res.statusCode).toEqual(401);
      expect(res.body).toHaveProperty('message', 'Invalid credentials. User not found.');
    });
  });

  describe('GET /api/protected/data', () => {
    let token: string;

    beforeEach(async () => {
      // Register and login a user to get a token for protected route tests
      await request(app)
        .post('/auth/register')
        .send({ email: 'protected@example.com', password: 'password123' });
      
      const loginRes = await request(app)
        .post('/auth/login')
        .send({ email: 'protected@example.com', password: 'password123' });
      token = loginRes.body.token;
    });

    it('should allow access with a valid token', async () => {
      const res = await request(app)
        .get('/api/protected/data')
        .set('Authorization', `Bearer ${token}`);
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('message', 'This is protected data. You have successfully accessed it.');
      expect(res.body.user).toHaveProperty('email', 'protected@example.com');
      expect(res.body.user).toHaveProperty('userId');
    });

    it('should return 401 for access without a token', async () => {
      const res = await request(app)
        .get('/api/protected/data');
      expect(res.statusCode).toEqual(401);
      expect(res.body).toHaveProperty('error', 'Access denied, no token provided or invalid format.');
    });

    it('should return 403 for access with an invalid/malformed token', async () => {
      const res = await request(app)
        .get('/api/protected/data')
        .set('Authorization', 'Bearer invalidtoken123');
      expect(res.statusCode).toEqual(403);
      expect(res.body).toHaveProperty('error', 'Invalid token.');
    });

    it('should return 401 if Bearer prefix is missing', async () => {
        const res = await request(app)
          .get('/api/protected/data')
          .set('Authorization', token); // Missing "Bearer "
        expect(res.statusCode).toEqual(401);
        expect(res.body).toHaveProperty('error', 'Access denied, no token provided or invalid format.');
    });

    // Test for expired token is harder without manipulating time or token generation
    // it('should return 403 for access with an expired token', async () => { ... });
  });
});
