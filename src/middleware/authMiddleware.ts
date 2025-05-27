// src/middleware/authMiddleware.ts
import { Request, Response, NextFunction } from 'express';
import jsonwebtoken, { JwtPayload } from 'jsonwebtoken'; // Import JwtPayload for type safety
import logger from '../utils/logger';

// Define an interface for requests that have been authenticated
export interface AuthenticatedRequest extends Request {
  auth?: string | JwtPayload; // auth property will hold the decoded JWT payload
}

export const authenticateJWT = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7); // Remove "Bearer " prefix

    if (!token) {
      res.status(401).json({ error: 'Access denied, token missing.' });
      return;
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      logger.error('JWT_SECRET is not defined in environment variables for token verification.');
      res.status(500).json({ error: 'Internal server error: JWT configuration missing.' });
      return;
    }

    try {
      const decoded = jsonwebtoken.verify(token, jwtSecret);
      req.auth = decoded; // Attach decoded payload to request object
      next(); // Proceed to the next middleware or route handler
    } catch (error) {
      if (error instanceof jsonwebtoken.TokenExpiredError) {
        logger.warn('Access denied due to expired token:', error.message);
        res.status(403).json({ error: 'Access denied, token expired.' });
        return;
      }
      if (error instanceof jsonwebtoken.JsonWebTokenError) {
        logger.warn('Access denied due to invalid token:', error.message);
        res.status(403).json({ error: 'Invalid token.' });
        return;
      }
      logger.error('Error during token verification:', error);
      res.status(403).json({ error: 'Forbidden, error verifying token.' });
      return;
    }
  } else {
    // No Authorization header or not a Bearer token
    res.status(401).json({ error: 'Access denied, no token provided or invalid format.' });
    return;
  }
};
