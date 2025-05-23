// src/models/user.types.ts
export interface User {
  id: string;
  email: string;
  passwordHash: string;
  // Add other fields like createdAt, updatedAt later if needed
}
