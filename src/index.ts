import dotenv from 'dotenv';
dotenv.config();
import logger from './utils/logger';
logger.info('Smart100 Application Initializing...');
logger.info(`NODE_ENV: ${process.env.NODE_ENV}`);
logger.info(`LOG_LEVEL: ${process.env.LOG_LEVEL}`);
