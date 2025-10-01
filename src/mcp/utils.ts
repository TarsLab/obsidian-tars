/**
 * MCP Utility Functions
 * Common helpers and patterns used across MCP modules
 */

/**
 * Extract error message from unknown error type
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Format error with context for logging
 */
export function formatErrorWithContext(context: string, error: unknown): string {
  return `${context}: ${getErrorMessage(error)}`;
}

/**
 * Safe async operation wrapper that logs errors but doesn't throw
 */
export async function safeAsync<T>(
  operation: () => Promise<T>,
  fallback: T,
  errorMessage: string
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    console.warn(formatErrorWithContext(errorMessage, error));
    return fallback;
  }
}

/**
 * Log error with context
 */
export function logError(context: string, error: unknown): void {
  console.error(formatErrorWithContext(context, error));
}

/**
 * Log warning with context
 */
export function logWarning(context: string, error: unknown): void {
  console.warn(formatErrorWithContext(context, error));
}
