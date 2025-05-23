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
      return res.status(401).json({ error: 'Access denied, token missing.' });
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      logger.error('JWT_SECRET is not defined in environment variables for token verification.');
      return res.status(500).json({ error: 'Internal server error: JWT configuration missing.' });
    }

    try {
      const decoded = jsonwebtoken.verify(token, jwtSecret);
      req.auth = decoded; // Attach decoded payload to request object
      next(); // Proceed to the next middleware or route handler
    } catch (error) {
      if (error instanceof jsonwebtoken.TokenExpiredError) {
        logger.warn('Access denied due to expired token:', error.message);
        return res.status(403).json({ error: 'Access denied, token expired.' });
      }
      if (error instanceof jsonwebtoken.JsonWebTokenError) {
        logger.warn('Access denied due to invalid token:', error.message);
        return res.status(403).json({ error: 'Invalid token.' });
      }
      logger.error('Error during token verification:', error);
      return res.status(403).json({ error: 'Forbidden, error verifying token.' });
    }
  } else {
    // No Authorization header or not a Bearer token
    return res.status(401).json({ error: 'Access denied, no token provided or invalid format.' });
  }
};
