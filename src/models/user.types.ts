// src/models/user.types.ts
export interface User {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: number;
  updatedAt: number;
}
