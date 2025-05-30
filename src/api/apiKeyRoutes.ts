// src/api/apiKeyRoutes.ts
import { Router, Request, Response, NextFunction } from 'express';
import * as apiKeyService from '../services/apiKeyService';
import { authenticateJWT as authMiddleware } from '../middleware/authMiddleware';
import logger from '../utils/logger'; // Assuming logger is default export from utils

const router = Router();

// Apply authMiddleware to all routes in this router
router.use(authMiddleware);

// --- POST / (Create API Key) ---
router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const { exchange_name, api_key, api_secret } = req.body;
  const userId = (req as any).auth?.userId; // Corrected: req.auth instead of req.user

  if (!userId) {
    logger.warn('User ID not found in request after authMiddleware for POST /keys');
    res.status(401).json({ message: 'Unauthorized: User ID missing.' });
    return;
  }

  if (!exchange_name || typeof exchange_name !== 'string' || exchange_name.trim() === '' ||
      !api_key || typeof api_key !== 'string' || api_key.trim() === '' ||
      !api_secret || typeof api_secret !== 'string' || api_secret.trim() === '') {
    logger.warn(`POST /keys - Invalid input for user ${userId}: missing or invalid fields.`);
    res.status(400).json({ message: 'Invalid input: exchange_name, api_key, and api_secret are required and must be non-empty strings.' });
    return;
  }

  try {
    const newApiKey = apiKeyService.createApiKey({
      user_id: userId,
      exchange_name: exchange_name.trim(),
      api_key: api_key.trim(), // Assuming service handles actual encryption of these
      api_secret: api_secret.trim(),
    });
    logger.info(`POST /keys - API Key created for user ${userId}, exchange: ${exchange_name}`);
    res.status(201).json(newApiKey);
    return;
  } catch (error: any) {
    logger.error(`POST /keys - Error creating API key for user ${userId}: ${error.message}`, { error });
    if (error.message.toLowerCase().includes('failed to create api key')) { // Check for specific service error
        res.status(500).json({ message: 'Failed to create API key due to a server error.' });
        return;
    }
    // Generic error for other unexpected issues
    res.status(500).json({ message: 'An unexpected error occurred.' });
    return;
  }
});

// --- GET / (Get All API Keys for User) ---
router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const userId = (req as any).auth?.userId; // Corrected: req.auth instead of req.user

  if (!userId) {
    logger.warn('User ID not found in request after authMiddleware for GET /keys');
    res.status(401).json({ message: 'Unauthorized: User ID missing.' });
    return;
  }

  try {
    const apiKeys = apiKeyService.getApiKeysByUserId(userId);
    logger.info(`GET /keys - Retrieved API Keys for user ${userId}, count: ${apiKeys.length}`);
    res.status(200).json(apiKeys);
    return;
  } catch (error: any) {
    logger.error(`GET /keys - Error fetching API keys for user ${userId}: ${error.message}`, { error });
    res.status(500).json({ message: 'Failed to retrieve API keys.' });
    return;
  }
});

// --- PUT /:id (Update API Key) ---
router.put('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const apiKeyId = req.params.id;
  const userId = (req as any).auth?.userId; // Corrected: req.auth instead of req.user
  const { exchange_name, api_key, api_secret } = req.body;

  if (!userId) {
    logger.warn(`User ID not found in request after authMiddleware for PUT /keys/${apiKeyId}`);
    res.status(401).json({ message: 'Unauthorized: User ID missing.' });
    return;
  }

  if (!apiKeyId) {
    logger.warn(`PUT /keys/:id - API Key ID missing in request for user ${userId}.`);
    res.status(400).json({ message: 'API Key ID is required in the URL.' });
    return;
  }
  
  // Basic validation for input fields if they are provided
  if (exchange_name !== undefined && (typeof exchange_name !== 'string' || exchange_name.trim() === '')) {
    res.status(400).json({ message: 'Invalid input: exchange_name must be a non-empty string if provided.' });
    return;
  }
  if (api_key !== undefined && (typeof api_key !== 'string' || api_key.trim() === '')) {
    res.status(400).json({ message: 'Invalid input: api_key must be a non-empty string if provided.' });
    return;
  }
  if (api_secret !== undefined && (typeof api_secret !== 'string' || api_secret.trim() === '')) {
    res.status(400).json({ message: 'Invalid input: api_secret must be a non-empty string if provided.' });
    return;
  }

  const updateData: Record<string, any> = {}; // Temporary placeholder
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
      res.status(404).json({ message: 'API Key not found or you do not have permission to update it.' });
      return;
    }
    logger.info(`PUT /keys/${apiKeyId} - API Key updated for user ${userId}.`);
    res.status(200).json(updatedApiKey);
    return;
  } catch (error: any) {
    logger.error(`PUT /keys/${apiKeyId} - Error updating API key for user ${userId}: ${error.message}`, { error });
     if (error.message.toLowerCase().includes('failed to update api key')) {
        res.status(500).json({ message: 'Failed to update API key due to a server error.' });
        return;
    }
    res.status(500).json({ message: 'An unexpected error occurred while updating the API key.' });
    return;
  }
});

// --- DELETE /:id (Delete API Key) ---
router.delete('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const apiKeyId = req.params.id;
  const userId = (req as any).auth?.userId; // Corrected: req.auth instead of req.user

  if (!userId) {
    logger.warn(`User ID not found in request after authMiddleware for DELETE /keys/${apiKeyId}`);
    res.status(401).json({ message: 'Unauthorized: User ID missing.' });
    return;
  }

  if (!apiKeyId) {
    logger.warn(`DELETE /keys/:id - API Key ID missing in request for user ${userId}.`);
    res.status(400).json({ message: 'API Key ID is required in the URL.' });
    return;
  }

  try {
    const success = apiKeyService.deleteApiKey(apiKeyId, userId);
    if (!success) {
      logger.warn(`DELETE /keys/${apiKeyId} - API Key not found or user ${userId} not authorized.`);
      res.status(404).json({ message: 'API Key not found or you do not have permission to delete it.' });
      return;
    }
    logger.info(`DELETE /keys/${apiKeyId} - API Key deleted for user ${userId}.`);
    res.status(204).send();
    return;
  } catch (error: any) {
    logger.error(`DELETE /keys/${apiKeyId} - Error deleting API key for user ${userId}: ${error.message}`, { error });
    if (error.message.toLowerCase().includes('failed to delete api key')) {
        res.status(500).json({ message: 'Failed to delete API key due to a server error.' });
        return;
    }
    res.status(500).json({ message: 'An unexpected error occurred while deleting the API key.' });
    return;
  }
});

export default router;
