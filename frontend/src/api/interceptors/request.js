/**
 * Request Interceptor
 * Adds authentication tokens and common headers to requests
 */

import { getStoredToken, isTokenExpired } from '../../utils/authToken';
import logger from '../../utils/logger';

/**
 * Get auth token from storage
 * Note: This is a synchronous check - for expired tokens, the API call will handle refresh
 */
const getAuthToken = () => {
  const token = getStoredToken();
  
  // Only return token if it's not expired
  if (token && !isTokenExpired()) {
    return token;
  }
  
  return null;
};

/**
 * Request interceptor
 * Automatically adds token and common headers
 */
export const requestInterceptor = (config) => {
  // Add authentication token if available and not expired
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // Add common headers
  config.headers['Content-Type'] = config.headers['Content-Type'] || 'application/json; charset=UTF-8';
  config.headers['Accept'] = 'application/json';

  logger.api('REQUEST', {
    method: config.method?.toUpperCase(),
    url: config.url,
    payload: config.data || config.params || null,
    headers: config.headers
  });

  return config;
};

/**
 * Request error interceptor
 */
export const requestErrorInterceptor = (error) => {
  return Promise.reject(error);
};
