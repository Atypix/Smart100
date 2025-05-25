// src/api/index.ts
import { Router } from 'express';
import authRoutes from './authRoutes';
import dataRoutes from './dataRoutes';
import strategyRoutes from './strategyRoutes';
import apiKeyRoutes from './apiKeyRoutes'; // Import the new API key routes
import logger from '../utils/logger';

const mainRouter = Router();

// Mount authentication routes
mainRouter.use('/auth', authRoutes);
logger.info('Auth routes mounted under /auth');

// Mount data routes
mainRouter.use('/data', dataRoutes);
logger.info('Data routes mounted under /data');

// Mount strategy routes
mainRouter.use('/strategies', strategyRoutes);
logger.info('Strategy routes mounted under /strategies');

// Mount API Key Management routes
mainRouter.use('/keys', apiKeyRoutes); // Mount the new API key routes under /keys
logger.info('API Key routes mounted under /keys');

export default mainRouter;
