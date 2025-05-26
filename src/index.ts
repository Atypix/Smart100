// src/index.ts
import dotenv from 'dotenv';
dotenv.config(); // Load environment variables from .env file

import logger from './utils/logger'; // Existing logger

import express from 'express'; // Import Express

// Existing initial logs
logger.info('Smart100 Application Initializing...');
logger.info(`NODE_ENV: ${process.env.NODE_ENV}`);
logger.info(`LOG_LEVEL: ${process.env.LOG_LEVEL}`);

export const app = express(); // Export app for testing
const port = process.env.PORT || 3000; // Define the port

// Middleware for parsing JSON and URL-encoded request bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Simple root GET route
app.get('/', (req, res) => {
  res.send('Smart100 API Running');
});

// Mount all API routes
import mainRouter from './api';
app.use('/api', mainRouter);

// Start the server only if the module is run directly
if (require.main === module) {
  app.listen(port, () => {
    logger.info(`Smart100 API server listening on port ${port}`);
  });
}
