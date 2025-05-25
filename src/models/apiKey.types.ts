// src/models/apiKey.types.ts
export interface ApiKey {
  id: string; // UUID
  user_id: string;
  exchange_name: string;
  api_key: string; // Decrypted key for service use
  api_secret: string; // Decrypted secret for service use
  created_at: number; // Timestamp
  updated_at: number; // Timestamp
}

// Type for the data stored in the database, with encrypted fields
export interface ApiKeyStored {
  id: string;
  user_id: string;
  exchange_name: string;
  api_key_encrypted: string;
  api_secret_encrypted: string;
  created_at: number;
  updated_at: number;
}

// Type for data provided when creating an API key (input for createApiKey)
export type CreateApiKeyInput = Omit<ApiKey, 'id' | 'created_at' | 'updated_at'>;

// Type for data provided when updating an API key
export type UpdateApiKeyInput = Partial<Omit<ApiKey, 'id' | 'user_id' | 'created_at' | 'updated_at'>>;
