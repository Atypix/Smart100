import winston from 'winston';
import logger from './logger'; // Assuming logger is the configured winston instance

// Helper to safely stringify an object, handling circular references and BigInts
function safeStringify(obj: any): string {
  try {
    return JSON.stringify(obj, (key, value) => {
      if (typeof value === 'bigint') {
        return value.toString() + 'n'; // Convert BigInt to string
      }
      return value;
    }, 2); // Indent for readability
  } catch (e) {
    // Fallback for complex objects that JSON.stringify still fails on (e.g., Proxy)
    if (e instanceof Error) {
        return `[Unserializable Object: ${e.message}]`;
    }
    return '[Unserializable Object]';
  }
}

export function logSafeError(
  loggerInstance: winston.Logger,
  message: string,
  error: any,
  additionalContext?: Record<string, any>
): void {
  let logDetails: Record<string, any> = {
    messagePrimary: message, // Rename to avoid conflict with winston's own 'message'
  };

  if (error instanceof Error) {
    logDetails.errorMessage = error.message;
    logDetails.errorStack = error.stack;
    // Avoid logging the full error object if it's a standard Error,
    // as stack and message are primary. Log specific props if needed.
    // logDetails.errorObject = safeStringify(error); // Or only specific known properties
  } else if (typeof error === 'object' && error !== null) {
    logDetails.errorObject = safeStringify(error);
  } else {
    logDetails.errorValue = String(error); // Log as string if not an object/Error
  }

  if (additionalContext) {
    logDetails.context = safeStringify(additionalContext);
  }

  // Use the loggerInstance passed to it, which should be the main app logger
  loggerInstance.error(message, logDetails);
}
