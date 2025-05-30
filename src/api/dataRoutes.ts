// src/api/dataRoutes.ts
import { Router, Response, NextFunction, RequestHandler, Request } from 'express';
import axios from 'axios'; // Added axios import
import { authenticateJWT, AuthenticatedRequest } from '../middleware/authMiddleware';
import logger from '../utils/logger';

const router = Router();

// Endpoint to fetch trading symbols from Binance
router.get('/binance-symbols', async (req: Request, res: Response): Promise<void> => {
  try {
    logger.info('Attempting to fetch exchange information from Binance...');
    const response = await axios.get('https://api.binance.com/api/v3/exchangeInfo');

    if (response.status !== 200 || !response.data || !response.data.symbols) {
      logger.error(`Binance API request failed with status ${response.status} or returned invalid data.`, response.data);
      res.status(response.status || 502).json({ 
        message: 'Failed to fetch symbols from Binance due to API error.', 
        details: response.data 
      });
      return;
    }

    const symbolsArray = response.data.symbols;
    if (!Array.isArray(symbolsArray)) {
        logger.error('Binance API response did not contain a valid symbols array.', response.data);
        res.status(500).json({ message: 'Invalid data structure received from Binance API.' });
        return;
    }
    
    const extractedSymbols = symbolsArray.map((s: any) => s.symbol).filter((s?: string): s is string => !!s);

    logger.info(`Successfully fetched ${extractedSymbols.length} symbols from Binance.`);
    res.json(extractedSymbols);

  } catch (error: any) {
    logger.error('Error fetching symbols from Binance:', {
      message: error.message,
      stack: error.stack,
      response: error.response?.data,
      status: error.response?.status
    });

    if (axios.isAxiosError(error) && error.response) {
      // Error from Binance (e.g., 4xx, 5xx from their end)
      res.status(error.response.status || 502).json({ 
        message: 'Failed to fetch symbols from Binance.', 
        details: error.response.data 
      });
      return;
    } else if (axios.isAxiosError(error) && error.request) {
      // Network error or no response from Binance
      res.status(503).json({ message: 'Network error or no response from Binance API.' });
      return;
    } else {
      // Other unexpected errors
      res.status(500).json({ message: 'An unexpected error occurred while fetching symbols.' });
      return;
    }
  }
});


router.get('/protected/data', authenticateJWT, (async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  if (!req.auth) {
    logger.error('req.auth not populated after authenticateJWT, this indicates an issue in the middleware.');
    res.status(500).json({ error: 'Authentication data not found after middleware processing.' });
    return; 
  }
  res.json({
    message: 'This is protected data. You have successfully accessed it.',
    user: req.auth,
  });
  return; 
}) as RequestHandler);

export default router;
