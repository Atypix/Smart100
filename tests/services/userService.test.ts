// tests/services/userService.test.ts
import { db, initializeSchema } from '../../src/database'; // This will be the actual db instance from the module
import * as userService from '../../src/services/userService';
import { User } from '../../src/models/user.types';
import { v4 as uuidv4 } from 'uuid';

// Hold the original db path and switch to in-memory for tests
let originalDbPath: string | undefined;

// This will be the actual test database instance
let testDb: import('better-sqlite3').Database;

beforeAll(() => {
  // Override the database connection to use an in-memory database for tests
  // This is a bit tricky because 'db' in '../../src/database' is initialized on module load.
  // For a robust solution, the database module itself might need to be configurable for testing,
  // or we use jest.mock for the database module ONLY for other tests, not for service tests.
  // For now, we'll assume `db` from `src/database` CAN be made to point to an in-memory DB
  // by re-initializing it or by ensuring tests run in an environment where it defaults to :memory:

  // The most straightforward way is to ensure the 'db' instance used by services IS the in-memory one.
  // If `src/database/index.ts` creates its `db` instance like `new Database(process.env.DB_PATH || 'default.db')`,
  // we could set process.env.DB_PATH to ':memory:'.
  // Given the current structure, `db` is initialized directly.
  // We will re-initialize the `db` object from `src/database` after this suite has loaded.
  // This is typically done by mocking the module and providing a custom implementation.

  // For these service tests, we want the *actual* db connection to be in-memory.
  // The `db` exported from `src/database/index.ts` is the one we need to control.
  // The simplest approach without altering `src/database/index.ts` for testability
  // is to directly manipulate or replace the `db` object it exports if possible,
  // or ensure that `src/database/index.ts` itself uses an in-memory DB when `NODE_ENV` is 'test'.

  // Let's assume src/database/index.ts is already set up to use an in-memory db for tests,
  // or we configure it here.
  // For now, we'll operate on the `db` imported from `src/database` directly.
  // And `initializeSchema` will use that `db`.
  
  // Re-initialize the original db module to use an in-memory database.
  // This requires `db` in `src/database/index.ts` to be non-const or to have a setter,
  // or the module itself to be reloaded/mocked carefully.
  // The provided `database.test.ts` uses a global mock, which is tricky.

  // Let's try a direct approach for now: create a new in-memory DB and run schema.
  // We will then have to make sure userService uses *this* db instance.
  // This is the hardest part. The current setup makes this difficult.
  
  // The simplest way: Assume the `db` instance from `src/database/index.ts` is already
  // configured to be in-memory for the 'test' NODE_ENV. If not, this needs adjustment.
  // Forcing schema re-initialization on the imported `db`.
  
  // Clean slate: Drop tables if they exist from a previous run (e.g. if not truly in-memory or persisted)
  try {
    db.exec("DROP TABLE IF EXISTS api_keys;");
    db.exec("DROP TABLE IF EXISTS users;");
    db.exec("DROP TABLE IF EXISTS financial_data;"); // In case other tests ran
  } catch (error) {
    // console.warn("Failed to drop tables, they might not exist yet.", error);
  }
  initializeSchema(); // This should create tables in the 'db' instance from src/database
});

beforeEach(async () => {
  // Clean the users table before each test
  try {
    db.exec('DELETE FROM users;');
  } catch (error) {
    console.error("Error cleaning users table", error);
    // If table doesn't exist, schema might not have been init'd correctly
    initializeSchema(); // try again
    db.exec('DELETE FROM users;');
  }
});

afterAll(() => {
  // db.close(); // Close the in-memory database
});

describe('User Service (Database Interactions)', () => {
  describe('createUser', () => {
    it('should correctly insert a user into the database and return the user object', () => {
      const userData = {
        email: 'test@example.com',
        passwordHash: 'hashedpassword123',
      };
      const createdUser = userService.createUser(userData);

      expect(createdUser).toBeDefined();
      expect(createdUser.id).toEqual(expect.any(String));
      expect(createdUser.email).toBe(userData.email);
      expect(createdUser.passwordHash).toBe(userData.passwordHash);
      expect(createdUser.createdAt).toEqual(expect.any(Number));
      expect(createdUser.updatedAt).toEqual(expect.any(Number));
      expect(createdUser.createdAt).toEqual(createdUser.updatedAt);

      // Verify from DB
      const dbUser = db.prepare('SELECT * FROM users WHERE id = ?').get(createdUser.id) as User;
      expect(dbUser).toBeDefined();
      expect(dbUser.email).toBe(userData.email);
      expect(dbUser.id).toBe(createdUser.id);
      expect(dbUser.createdAt).toBe(createdUser.createdAt);
    });

    it('should throw an error or handle duplicate email registration if UNIQUE constraint works', () => {
      const userData = { email: 'duplicate@example.com', passwordHash: 'pass1' };
      userService.createUser(userData);
      try {
        userService.createUser(userData); // Try creating again with same email
        fail('Should have thrown an error for duplicate email');
      } catch (error: any) {
        expect(error).toBeDefined();
        // Check for SQLite constraint error
        // Error: UNIQUE constraint failed: users.email
        expect(error.message).toMatch(/UNIQUE constraint failed: users.email/i);
      }
    });
  });

  describe('findUserByEmail', () => {
    it('should find an existing user by email', () => {
      const userData = { email: 'findme@example.com', passwordHash: 'passfind' };
      const createdUser = userService.createUser(userData);

      const foundUser = userService.findUserByEmail(userData.email);
      expect(foundUser).toBeDefined();
      expect(foundUser!.id).toBe(createdUser.id);
      expect(foundUser!.email).toBe(userData.email);
    });

    it('should return undefined for a non-existent email', () => {
      const foundUser = userService.findUserByEmail('nonexistent@example.com');
      expect(foundUser).toBeUndefined();
    });
  });

  describe('findUserById', () => {
    it('should find an existing user by ID', () => {
      const userData = { email: 'findbyid@example.com', passwordHash: 'passid' };
      const createdUser = userService.createUser(userData);

      const foundUser = userService.findUserById(createdUser.id);
      expect(foundUser).toBeDefined();
      expect(foundUser!.id).toBe(createdUser.id);
      expect(foundUser!.email).toBe(userData.email);
    });

    it('should return undefined for a non-existent ID', () => {
      const foundUser = userService.findUserById(uuidv4()); // Random non-existent ID
      expect(foundUser).toBeUndefined();
    });
  });

  describe('getAllUsers', () => {
    it('should return all users', () => {
      const user1Data = { email: 'user1@all.com', passwordHash: 'pass1all' };
      const user2Data = { email: 'user2@all.com', passwordHash: 'pass2all' };
      userService.createUser(user1Data);
      userService.createUser(user2Data);

      const allUsers = userService.getAllUsers();
      expect(allUsers).toBeDefined();
      expect(allUsers.length).toBe(2);
      expect(allUsers.find(u => u.email === user1Data.email)).toBeDefined();
      expect(allUsers.find(u => u.email === user2Data.email)).toBeDefined();
    });

    it('should return an empty array if no users exist', () => {
      const allUsers = userService.getAllUsers();
      expect(allUsers).toBeDefined();
      expect(allUsers.length).toBe(0);
    });
  });
});
