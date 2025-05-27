// src/api/authRoutes.ts
import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import bcryptjs from 'bcryptjs';
import jsonwebtoken from 'jsonwebtoken';
import { createUser, findUserByEmail } from '../services/userService';
import { User } from '../models/user.types';
import logger from '../utils/logger';

// Define interfaces for request bodies
interface RegisterRequestBody {
  email?: string;
  password?: string;
}

interface LoginRequestBody {
  email?: string;
  password?: string;
}

const router = Router();

// POST /register
router.post('/register', (async (req: Request<{}, {}, RegisterRequestBody>, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;

    // Input Validation
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }
    if (!email.includes('@') || email.length < 5) { // Basic email check
        return res.status(400).json({ message: 'Invalid email format.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long.' });
    }

    // Check if user already exists
    const existingUser = findUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({ message: 'User already exists with this email.' });
    }

    // Hash the password
    const saltRounds = 10;
    const passwordHash = await bcryptjs.hash(password, saltRounds);

    // Create the user
    const newUser = createUser({ email, passwordHash });

    logger.info(`User registered: ${newUser.email} (ID: ${newUser.id})`);
    // Return user data (excluding passwordHash)
    res.status(201).json({ id: newUser.id, email: newUser.email });

  } catch (error) {
    logger.error('Error during user registration:', error);
    // Check if error is an instance of Error to safely access error.message
    const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
    res.status(500).json({ message: 'Internal server error during registration.', error: message });
  }
}) as RequestHandler);

// POST /login
router.post('/login', (async (req: Request<{}, {}, LoginRequestBody>, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;

    // Input validation
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    // Find user by email
    const user = findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials. User not found.' });
    }

    // Compare password
    const isMatch = await bcryptjs.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials. Password mismatch.' });
    }

    // If passwords match, create JWT
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      logger.error('JWT_SECRET is not defined in environment variables.');
      return res.status(500).json({ message: 'Internal server error: JWT configuration missing.' });
    }

    const payload = {
      userId: user.id,
      email: user.email,
    };

    const token = jsonwebtoken.sign(payload, jwtSecret, {
      expiresIn: '7d', // Token expires in 7 days (adjust as needed)
    });

    logger.info(`User logged in: ${user.email}`);
    res.status(200).json({ token });

  } catch (error) {
    logger.error('Error during user login:', error);
    const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
    res.status(500).json({ message: 'Internal server error during login.', error: message });
  }
}) as RequestHandler);

export default router;
