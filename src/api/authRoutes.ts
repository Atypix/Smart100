// src/api/authRoutes.ts
import { Router, Request, Response, NextFunction } from 'express'; // Added Request, Response, NextFunction
import bcryptjs from 'bcryptjs';
import jsonwebtoken from 'jsonwebtoken';
import { createUser, findUserByEmail } from '../services/userService';
import { User } from '../models/user.types';
import logger from '../utils/logger';

const router = Router();

// POST /register
router.post('/register', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  res.status(200).send('OK');
});

// POST /login
router.post('/login', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  res.status(200).send('OK');
});

export default router;
