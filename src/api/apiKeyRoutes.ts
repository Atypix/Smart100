// src/api/apiKeyRoutes.ts
import { Router, Request, Response } from 'express';
import * as apiKeyService from '../services/apiKeyService';
import { authMiddleware } from '../middleware/authMiddleware';
import logger from '../utils/logger'; // Assuming logger is default export from utils

const router = Router();

// Apply authMiddleware to all routes in this router
router.use(authMiddleware);

// --- POST / (Create API Key) ---
router.post('/', async (req: Request, res: Response) => {
  const { exchange_name, api_key, api_secret } = req.body;
  const userId = (req as any).user?.userId; // Accessing userId from authMiddleware

  if (!userId) {
    logger.warn('User ID not found in request after authMiddleware for POST /keys');
    return res.status(401).json({ message: 'Unauthorized: User ID missing.' });
  }

  if (!exchange_name || typeof exchange_name !== 'string' || exchange_name.trim() === '' ||
      !api_key || typeof api_key !== 'string' || api_key.trim() === '' ||
      !api_secret || typeof api_secret !== 'string' || api_secret.trim() === '') {
    logger.warn(`POST /keys - Invalid input for user ${userId}: missing or invalid fields.`);
    return res.status(400).json({ message: 'Invalid input: exchange_name, api_key, and api_secret are required and must be non-empty strings.' });
  }

  try {
    const newApiKey = apiKeyService.createApiKey({
      user_id: userId,
      exchange_name: exchange_name.trim(),
      api_key: api_key.trim(), // Assuming service handles actual encryption of these
      api_secret: api_secret.trim(),
    });
    logger.info(`POST /keys - API Key created for user ${userId}, exchange: ${exchange_name}`);
    return res.status(201).json(newApiKey);
  } catch (error: any) {
    logger.error(`POST /keys - Error creating API key for user ${userId}: ${error.message}`, { error });
    if (error.message.toLowerCase().includes('failed to create api key')) { // Check for specific service error
        return res.status(500).json({ message: 'Failed to create API key due to a server error.' });
    }
    // Generic error for other unexpected issues
    return res.status(500).json({ message: 'An unexpected error occurred.' });
  }
});

// --- GET / (Get All API Keys for User) ---
router.get('/', async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;

  if (!userId) {
    logger.warn('User ID not found in request after authMiddleware for GET /keys');
    return res.status(401).json({ message: 'Unauthorized: User ID missing.' });
  }

  try {
    const apiKeys = apiKeyService.getApiKeysByUserId(userId);
    logger.info(`GET /keys - Retrieved API Keys for user ${userId}, count: ${apiKeys.length}`);
    return res.status(200).json(apiKeys);
  } catch (error: any) {
    logger.error(`GET /keys - Error fetching API keys for user ${userId}: ${error.message}`, { error });
    return res.status(500).json({ message: 'Failed to retrieve API keys.' });
  }
});

// --- PUT /:id (Update API Key) ---
router.put('/:id', async (req: Request, res: Response) => {
  const apiKeyId = req.params.id;
  const userId = (req as any).user?.userId;
  const { exchange_name, api_key, api_secret } = req.body;

  if (!userId) {
    logger.warn(`User ID not found in request after authMiddleware for PUT /keys/${apiKeyId}`);
    return res.status(401).json({ message: 'Unauthorized: User ID missing.' });
  }

  if (!apiKeyId) {
    logger.warn(`PUT /keys/:id - API Key ID missing in request for user ${userId}.`);
    return res.status(400).json({ message: 'API Key ID is required in the URL.' });
  }
  
  // Basic validation for input fields if they are provided
  if (exchange_name !== undefined && (typeof exchange_name !== 'string' || exchange_name.trim() === '')) {
    return res.status(400).json({ message: 'Invalid input: exchange_name must be a non-empty string if provided.' });
  }
  if (api_key !== undefined && (typeof api_key !== 'string' || api_key.trim() === '')) {
    return res.status(400).json({ message: 'Invalid input: api_key must be a non-empty string if provided.' });
  }
  if (api_secret !== undefined && (typeof api_secret !== 'string' || api_secret.trim() === '')) {
    return res.status(400).json({ message: 'Invalid input: api_secret must be a non-empty string if provided.' });
  }

  const updateData: apiKeyService.UpdateApiKeyInput = {};
  if (exchange_name !== undefined) updateData.exchange_name = exchange_name.trim();
  if (api_key !== undefined) updateData.api_key = api_key.trim(); // Service will encrypt
  if (api_secret !== undefined) updateData.api_secret = api_secret.trim(); // Service will encrypt

  if (Object.keys(updateData).length === 0) {
    logger.info(`PUT /keys/${apiKeyId} - No update data provided by user ${userId}. Only timestamps will be updated.`);
    // The service handles updating timestamps even if no data is provided, so this is fine.
  }

  try {
    const updatedApiKey = apiKeyService.updateApiKey(apiKeyId, userId, updateData);
    if (!updatedApiKey) {
      logger.warn(`PUT /keys/${apiKeyId} - API Key not found or user ${userId} not authorized.`);
      return res.status(404).json({ message: 'API Key not found or you do not have permission to update it.' });
    }
    logger.info(`PUT /keys/${apiKeyId} - API Key updated for user ${userId}.`);
    return res.status(200).json(updatedApiKey);
  } catch (error: any) {
    logger.error(`PUT /keys/${apiKeyId} - Error updating API key for user ${userId}: ${error.message}`, { error });
     if (error.message.toLowerCase().includes('failed to update api key')) {
        return res.status(500).json({ message: 'Failed to update API key due to a server error.' });
    }
    return res.status(500).json({ message: 'An unexpected error occurred while updating the API key.' });
  }
});

// --- DELETE /:id (Delete API Key) ---
router.delete('/:id', async (req: Request, res: Response) => {
  const apiKeyId = req.params.id;
  const userId = (req as any).user?.userId;

  if (!userId) {
    logger.warn(`User ID not found in request after authMiddleware for DELETE /keys/${apiKeyId}`);
    return res.status(401).json({ message: 'Unauthorized: User ID missing.' });
  }

  if (!apiKeyId) {
    logger.warn(`DELETE /keys/:id - API Key ID missing in request for user ${userId}.`);
    return res.status(400).json({ message: 'API Key ID is required in the URL.' });
  }

  try {
    const success = apiKeyService.deleteApiKey(apiKeyId, userId);
    if (!success) {
      logger.warn(`DELETE /keys/${apiKeyId} - API Key not found or user ${userId} not authorized.`);
      return res.status(404).json({ message: 'API Key not found or you do not have permission to delete it.' });
    }
    logger.info(`DELETE /keys/${apiKeyId} - API Key deleted for user ${userId}.`);
    return res.status(204).send();
  } catch (error: any) {
    logger.error(`DELETE /keys/${apiKeyId} - Error deleting API key for user ${userId}: ${error.message}`, { error });
    if (error.message.toLowerCase().includes('failed to delete api key')) {
        return res.status(500).json({ message: 'Failed to delete API key due to a server error.' });
    }
    return res.status(500).json({ message: 'An unexpected error occurred while deleting the API key.' });
  }
});

export default router;
