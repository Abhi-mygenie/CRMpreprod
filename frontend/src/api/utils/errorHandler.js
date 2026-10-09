/**
 * Centralized Error Handling
 * Handles different types of API errors and returns user-friendly messages
 */

export const ErrorTypes = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  SERVER_ERROR: 'SERVER_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
};

/**
 * Get user-friendly error message based on error type
 */
export const getErrorMessage = (error) => {
  // If error has a custom message from API
  if (error?.response?.data?.message) {
    return error.response.data.message;
  }

  if (error?.response?.data?.error) {
    return error.response.data.error;
  }

  // Handle different error types
  if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
    return 'Request timeout. Please check your connection and try again.';
  }

  if (error.message === 'Network Error' || !error.response) {
    return 'Network error. Please check your internet connection.';
  }

  const status = error?.response?.status;

  switch (status) {
    case 400:
      return 'Invalid request. Please check your input.';
    case 401:
      return 'Unauthorized. Please login again.';
    case 403:
      return 'Access forbidden. You don\'t have permission to access this resource.';
    case 404:
      return 'Resource not found.';
    case 422:
      return 'Validation error. Please check your input.';
    case 500:
      return 'Server error. Please try again later.';
    case 502:
      return 'Bad gateway. The server is temporarily unavailable.';
    case 503:
      return 'Service unavailable. Please try again later.';
    default:
      return error?.message || 'An unexpected error occurred. Please try again.';
  }
};

/**
 * Get error type for conditional handling
 */
export const getErrorType = (error) => {
  if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
    return ErrorTypes.TIMEOUT_ERROR;
  }

  if (error.message === 'Network Error' || !error.response) {
    return ErrorTypes.NETWORK_ERROR;
  }

  const status = error?.response?.status;

  switch (status) {
    case 401:
      return ErrorTypes.UNAUTHORIZED;
    case 403:
      return ErrorTypes.FORBIDDEN;
    case 404:
      return ErrorTypes.NOT_FOUND;
    case 422:
      return ErrorTypes.VALIDATION_ERROR;
    case 500:
    case 502:
    case 503:
      return ErrorTypes.SERVER_ERROR;
    default:
      return ErrorTypes.UNKNOWN_ERROR;
  }
};

/**
 * Check if error is retryable
 */
export const isRetryableError = (error) => {
  const errorType = getErrorType(error);
  return [
    ErrorTypes.NETWORK_ERROR,
    ErrorTypes.TIMEOUT_ERROR,
    ErrorTypes.SERVER_ERROR,
  ].includes(errorType);
};
