// src/api/dataRoutes.ts
import { Router, Response, NextFunction, RequestHandler } from 'express';
import { authenticateJWT, AuthenticatedRequest } from '../middleware/authMiddleware';
import logger from '../utils/logger';

const router = Router();

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
