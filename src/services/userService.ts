// src/services/userService.ts
import { User } from '../models/user.types';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../database'; // Import db instance

// Type for user data passed to createUser, excluding generated fields
type CreateUserInput = Omit<User, 'id' | 'createdAt' | 'updatedAt'>;

export const createUser = (userData: CreateUserInput): User => {
  const newUser: User = {
    id: uuidv4(), // Generate unique ID
    ...userData,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const stmt = db.prepare(
    'INSERT INTO users (id, email, passwordHash, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)'
  );
  stmt.run(newUser.id, newUser.email, newUser.passwordHash, newUser.createdAt, newUser.updatedAt);
  
  // Return the complete user object, including generated id and timestamps
  return newUser;
};

export const findUserByEmail = (email: string): User | undefined => {
  const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
  const user = stmt.get(email) as User | undefined;
  return user;
};

export const findUserById = (id: string): User | undefined => {
  const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
  const user = stmt.get(id) as User | undefined;
  return user;
};

// Optional: a function to get all users for debugging/testing
export const getAllUsers = (): User[] => {
  const stmt = db.prepare('SELECT * FROM users');
  const users = stmt.all() as User[];
  return users;
};

// clearUsers might be used in tests. If tests fail due to its removal, 
// they might need to be adapted or this function could be conditionally kept for testing environments.
// For now, it's removed as per instructions to switch to DB persistence.
export const clearUsers = () => {
  // This would now need to be a DB operation, e.g., db.exec('DELETE FROM users');
  // For testing purposes, this might be:
  if (process.env.NODE_ENV === 'test') { // Guard for safety, only allow in test env
    try {
      db.exec('DELETE FROM users;');
    } catch (error) {
      console.error("Error in clearUsers:", error);
      // Potentially re-throw or handle if critical for test setup
    }
  } else {
    console.warn("clearUsers was called outside of a test environment. Operation skipped.");
  }
};
