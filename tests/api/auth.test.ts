// tests/api/auth.test.ts
import request from 'supertest';
import { createApp } from '../../src/index'; // Corrected import
import { clearUsers, createUser, findUserByEmail, getAllUsers } from '../../src/services/userService';
import logger from '../../src/utils/logger';

jest.spyOn(logger, 'info').mockImplementation(() => logger);
jest.spyOn(logger, 'warn').mockImplementation(() => logger);
jest.spyOn(logger, 'error').mockImplementation(() => logger);

let app: any; // Declare app variable

describe('Auth Endpoints API', () => {
  beforeAll(() => { // Use beforeAll to create app instance once for the suite
    app = createApp();
  });

  beforeEach(() => {
    clearUsers(); 
    // JWT_SECRET is now set globally in tests/setupEnv.ts, so local override is not strictly needed here
    // unless a specific test in this suite requires a different secret temporarily.
    // For consistency, rely on the global one from setupEnv.ts.
    // process.env.JWT_SECRET = 'test_jwt_secret_for_api_tests_1234567890_!@#$%^&*()'; 
  });

  describe('POST /api/auth/register', () => { // Corrected path prefix
    it('should register a new user successfully', async () => {
      const res = await request(app)
        .post('/api/auth/register') // Corrected path
        .send({ email: 'test@example.com', password: 'password123' });
      expect(res.statusCode).toEqual(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('email', 'test@example.com');
      expect(res.body).not.toHaveProperty('passwordHash'); 
    });

    it('should return 409 if email already exists', async () => {
      createUser({ email: 'existing@example.com', passwordHash: 'somehash' });
      const res = await request(app)
        .post('/api/auth/register') // Corrected path
        .send({ email: 'existing@example.com', password: 'password123' });
      expect(res.statusCode).toEqual(409);
      expect(res.body).toHaveProperty('message', 'User already exists with this email.');
    });

    it('should return 400 for missing email', async () => {
      const res = await request(app)
        .post('/api/auth/register') // Corrected path
        .send({ password: 'password123' });
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty('message', 'Email and password are required.');
    });

    it('should return 400 for missing password', async () => {
      const res = await request(app)
        .post('/api/auth/register') // Corrected path
        .send({ email: 'test@example.com' });
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty('message', 'Email and password are required.');
    });
    
    it('should return 400 for invalid email format', async () => {
      const res = await request(app)
        .post('/api/auth/register') // Corrected path
        .send({ email: 'invalidemail', password: 'password123' });
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty('message', 'Invalid email format.');
    });

    it('should return 400 for too short password', async () => {
      const res = await request(app)
        .post('/api/auth/register') // Corrected path
        .send({ email: 'test@example.com', password: '123' });
      expect(res.statusCode).toEqual(400);
      expect(res.body).toHaveProperty('message', 'Password must be at least 6 characters long.');
    });
  });

  describe('POST /api/auth/login', () => { // Corrected path prefix
    beforeEach(async () => {
      await request(app)
        .post('/api/auth/register') // Corrected path
        .send({ email: 'loginuser@example.com', password: 'password123' });
    });

    it('should login an existing user successfully', async () => {
      const res = await request(app)
        .post('/api/auth/login') // Corrected path
        .send({ email: 'loginuser@example.com', password: 'password123' });
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('token');
    });

    it('should return 401 for incorrect password', async () => {
      const res = await request(app)
        .post('/api/auth/login') // Corrected path
        .send({ email: 'loginuser@example.com', password: 'wrongpassword' });
      expect(res.statusCode).toEqual(401);
      expect(res.body).toHaveProperty('message', 'Invalid credentials. Password mismatch.');
    });

    it('should return 401 for non-existent email', async () => {
      const res = await request(app)
        .post('/api/auth/login') // Corrected path
        .send({ email: 'nouser@example.com', password: 'password123' });
      expect(res.statusCode).toEqual(401);
      expect(res.body).toHaveProperty('message', 'Invalid credentials. User not found.');
    });
  });
});
