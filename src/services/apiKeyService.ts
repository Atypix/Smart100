// src/services/apiKeyService.ts
import { db } from '../database';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { ApiKey, ApiKeyStored, CreateApiKeyInput, UpdateApiKeyInput } from '../models/apiKey.types';

let API_ENCRYPTION_KEY: Buffer; // Module-level variable

export const initializeApiKeyService = () => {
  const API_ENCRYPTION_KEY_HEX_RAW = process.env.API_ENCRYPTION_KEY_HEX;
  if (!API_ENCRYPTION_KEY_HEX_RAW || API_ENCRYPTION_KEY_HEX_RAW.length !== 64) {
    throw new Error('API_ENCRYPTION_KEY_HEX must be a 64-character hex string.');
  }
  API_ENCRYPTION_KEY = Buffer.from(API_ENCRYPTION_KEY_HEX_RAW, 'hex');
};

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits is recommended for GCM
const AUTH_TAG_LENGTH = 16; // GCM auth tag is 128 bits (16 bytes)

// --- Encryption/Decryption Utilities ---

/**
 * Encrypts text using AES-256-GCM.
 * @param text The text to encrypt.
 * @returns A string containing IV, authTag, and ciphertext, separated by colons.
 */
const encrypt = (text: string): string => {
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, API_ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    // Prepend IV and authTag to the encrypted text for storage
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  } catch (error) {
    console.error('Encryption failed:', error);
    throw new Error('Encryption process failed.');
  }
};

/**
 * Decrypts text encrypted with AES-256-GCM.
 * @param encryptedText The encrypted text (IV:authTag:ciphertext).
 * @returns The original decrypted text.
 */
const decrypt = (encryptedText: string): string => {
  try {
    const parts = encryptedText.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted text format. Expected IV:authTag:ciphertext.');
    }
    const [ivHex, authTagHex, ciphertextHex] = parts;
    
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    if (iv.length !== IV_LENGTH) {
        throw new Error(`Invalid IV length. Expected ${IV_LENGTH} bytes, got ${iv.length}.`);
    }
    if (authTag.length !== AUTH_TAG_LENGTH) {
        throw new Error(`Invalid authTag length. Expected ${AUTH_TAG_LENGTH} bytes, got ${authTag.length}.`);
    }

    const decipher = crypto.createDecipheriv(ALGORITHM, API_ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(ciphertextHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('Decryption failed:', error);
    // Do not expose specific crypto errors to the client, but log them.
    // For example, "Unsupported state or unable to authenticate data" can occur with wrong key or tampered data.
    throw new Error('Decryption process failed. The data may be corrupt or the key incorrect.');
  }
};

// --- Helper to convert stored format to service format ---
const mapStoredToApiKey = (stored: ApiKeyStored): ApiKey => {
  return {
    ...stored,
    api_key: decrypt(stored.api_key_encrypted),
    api_secret: decrypt(stored.api_secret_encrypted),
  };
};


// --- Service Functions ---

export const createApiKey = (data: CreateApiKeyInput): ApiKey => {
  const { user_id, exchange_name, api_key, api_secret } = data;
  const id = uuidv4();
  const now = Date.now();

  const api_key_encrypted = encrypt(api_key);
  const api_secret_encrypted = encrypt(api_secret);

  try {
    const stmt = db.prepare(
      `INSERT INTO api_keys (id, user_id, exchange_name, api_key_encrypted, api_secret_encrypted, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    // ==== DIAGNOSTIC LOG ====
    console.log('[apiKeyService.createApiKey DEBUG PARAMS]:', { id, user_id, exchange_name, api_key_encrypted_length: api_key_encrypted.length, api_secret_encrypted_length: api_secret_encrypted.length, now });
    stmt.run(id, user_id, exchange_name, api_key_encrypted, api_secret_encrypted, now, now);

    return {
      id,
      user_id,
      exchange_name,
      api_key, // return decrypted
      api_secret, // return decrypted
      created_at: now,
      updated_at: now,
    };
  } catch (error) {
    console.error('Error creating API key in database:', error);
    throw new Error('Failed to create API key.');
  }
};

export const getApiKeysByUserId = (userId: string): ApiKey[] => {
  try {
    const stmt = db.prepare('SELECT * FROM api_keys WHERE user_id = ?');
    const storedKeys = stmt.all(userId) as ApiKeyStored[];
    return storedKeys.map(mapStoredToApiKey);
  } catch (error) {
    console.error(`Error fetching API keys for user ${userId}:`, error);
    throw new Error('Failed to fetch API keys.');
  }
};

export const getApiKeyById = (apiKeyId: string, userId: string): ApiKey | null => {
  try {
    const stmt = db.prepare('SELECT * FROM api_keys WHERE id = ? AND user_id = ?');
    const storedKey = stmt.get(apiKeyId, userId) as ApiKeyStored | undefined;

    if (!storedKey) {
      return null;
    }
    return mapStoredToApiKey(storedKey);
  } catch (error) {
    console.error(`Error fetching API key ${apiKeyId} for user ${userId}:`, error);
    throw new Error('Failed to fetch API key.');
  }
}

export const updateApiKey = (
  apiKeyId: string,
  userId: string,
  updateData: UpdateApiKeyInput
): ApiKey | null => {
  try {
    // First, verify the API key exists and belongs to the user
    const existingKeyStmt = db.prepare('SELECT * FROM api_keys WHERE id = ? AND user_id = ?');
    let existingKey = existingKeyStmt.get(apiKeyId, userId) as ApiKeyStored | undefined;

    if (!existingKey) {
      return null; // Key not found or doesn't belong to user
    }

    const now = Date.now();
    let { exchange_name, api_key, api_secret } = updateData;

    const updates: string[] = [];
    const params: (string | number)[] = [];

    if (exchange_name !== undefined) {
      updates.push('exchange_name = ?');
      params.push(exchange_name);
    }
    if (api_key !== undefined) {
      updates.push('api_key_encrypted = ?');
      params.push(encrypt(api_key));
    }
    if (api_secret !== undefined) {
      updates.push('api_secret_encrypted = ?');
      params.push(encrypt(api_secret));
    }

    if (updates.length === 0) {
      // No actual data to update, just refresh timestamps and return current
        db.prepare('UPDATE api_keys SET updated_at = ? WHERE id = ? AND user_id = ?').run(now, apiKeyId, userId);
        existingKey = db.prepare('SELECT * FROM api_keys WHERE id = ? AND user_id = ?').get(apiKeyId, userId) as ApiKeyStored; // Re-fetch
        return mapStoredToApiKey(existingKey!); // We know it exists
    }

    updates.push('updated_at = ?');
    params.push(now);

    params.push(apiKeyId);
    params.push(userId);

    const updateStmt = db.prepare(
      `UPDATE api_keys SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`
    );
    const result = updateStmt.run(...params);

    if (result.changes === 0) {
      // Should not happen if existingKey was found, but as a safeguard
      return null;
    }

    const updatedKeyStmt = db.prepare('SELECT * FROM api_keys WHERE id = ?');
    const updatedKeyStored = updatedKeyStmt.get(apiKeyId) as ApiKeyStored;
    
    return mapStoredToApiKey(updatedKeyStored);

  } catch (error) {
    console.error(`Error updating API key ${apiKeyId}:`, error);
    throw new Error('Failed to update API key.');
  }
};

export const deleteApiKey = (apiKeyId: string, userId: string): boolean => {
  try {
    // Verify ownership before deleting is implicitly handled by WHERE clause
    const stmt = db.prepare('DELETE FROM api_keys WHERE id = ? AND user_id = ?');
    const result = stmt.run(apiKeyId, userId);
    return result.changes > 0;
  } catch (error) {
    console.error(`Error deleting API key ${apiKeyId} for user ${userId}:`, error);
    throw new Error('Failed to delete API key.');
  }
};

// Initialization should be handled by the application entry point (e.g., src/index.ts)
// and by tests/setupEnv.ts for test environments.
// initializeApiKeyService(); 
