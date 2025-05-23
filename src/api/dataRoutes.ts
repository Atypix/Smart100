// src/api/dataRoutes.ts
import { Router } from 'express';
import { authenticateJWT, AuthenticatedRequest } from '../middleware/authMiddleware'; // Import middleware and AuthenticatedRequest
import logger from '../utils/logger';

const router = Router();

// Define a GET /protected/data route
router.get('/protected/data', authenticateJWT, (req: AuthenticatedRequest, res) => {
  // If authenticateJWT middleware calls next(), req.auth should be populated
  if (!req.auth) {
    // This case should ideally not be reached if authenticateJWT is working correctly
    // and always calls next() or sends a response.
    logger.error('req.auth not populated after authenticateJWT, this indicates an issue in the middleware.');
    return res.status(500).json({ error: 'Authentication data not found after middleware processing.' });
  }

  res.json({
    message: 'This is protected data. You have successfully accessed it.',
    user: req.auth, // The decoded JWT payload (e.g., { userId: '...', email: '...' })
  });
});

export default router;
