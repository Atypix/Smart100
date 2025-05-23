// src/services/userService.ts
import { User } from '../models/user.types';
import { v4 as uuidv4 } from 'uuid';

const users: User[] = [];

export const createUser = (userData: Omit<User, 'id'>): User => {
  const newUser: User = {
    id: uuidv4(), // Generate unique ID
    ...userData,
  };
  users.push(newUser);
  return newUser;
};

export const findUserByEmail = (email: string): User | undefined => {
  return users.find(user => user.email === email);
};

export const findUserById = (id: string): User | undefined => {
  return users.find(user => user.id === id);
};

// Optional: a function to get all users for debugging/testing
export const getAllUsers = (): User[] => {
    return [...users]; // Return a copy to prevent direct modification
};

export const clearUsers = () => {
  users.length = 0; // Reset the in-memory users array
};
