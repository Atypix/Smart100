// src/index.ts
import dotenv from 'dotenv';
dotenv.config(); // Load environment variables from .env file

// Initialize services that depend on environment variables for non-test runs
// For tests, this is handled in setupEnv.ts or similar.
import { initializeApiKeyService } from './services/apiKeyService';

import logger from './utils/logger'; // Existing logger
import express from 'express'; // Import Express
import mainRouter from './api'; // Import mainRouter

export const createApp = () => {
  logger.info('Smart100 Application Initializing (createApp)...');
  logger.info(`NODE_ENV: ${process.env.NODE_ENV}`);
  logger.info(`LOG_LEVEL: ${process.env.LOG_LEVEL}`);
  // Log JWT_SECRET at the point of app creation for debugging test setups
  // This helps confirm if JWT_SECRET from tests/setupEnv.ts is seen when app is created for a test.
  logger.info(`JWT_SECRET when createApp is called: ${process.env.JWT_SECRET ? 'SET' : 'NOT SET OR EMPTY'}`);

  const app = express(); 
  
  // Middleware for parsing JSON and URL-encoded request bodies
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Simple root GET route
  app.get('/', (req, res) => {
    res.send('Smart100 API Running');
  });

  // Mount all API routes
  app.use('/api', mainRouter);

  return app;
};

// This part is for running the actual server, not for tests
if (require.main === module) {
  // Ensure services dependent on env vars are initialized for the running server.
  initializeApiKeyService(); 
  
  const appInstance = createApp();
  const port = process.env.PORT || 3000; // Define the port
  appInstance.listen(port, () => {
    logger.info(`Smart100 API server listening on port ${port}`);
  });
}
