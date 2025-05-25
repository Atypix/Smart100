// frontend/src/utils/logger.ts

// A simple console logger wrapper.
// In a real app, this could be more sophisticated (e.g., integrate with a logging service).

const getTimestamp = (): string => new Date().toISOString();

export const logger = {
  info: (...args: any[]): void => {
    console.info(`[INFO] ${getTimestamp()}:`, ...args);
  },
  warn: (...args: any[]): void => {
    console.warn(`[WARN] ${getTimestamp()}:`, ...args);
  },
  error: (...args: any[]): void => {
    console.error(`[ERROR] ${getTimestamp()}:`, ...args);
  },
  debug: (...args: any[]): void => {
    // In a production build, debug logs might be stripped or disabled.
    // For now, always log them.
    console.debug(`[DEBUG] ${getTimestamp()}:`, ...args);
  },
};

// Example usage:
// logger.info('This is an info message.');
// logger.warn('This is a warning.');
// logger.error('This is an error.');
// logger.debug('This is a debug message.');
