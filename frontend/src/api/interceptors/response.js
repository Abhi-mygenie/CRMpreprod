/**
 * Response Interceptor
 * Handles response transformation and error handling
 */

import { getErrorType, ErrorTypes } from '../utils/errorHandler';
import { getAuthToken, clearStoredToken } from '../../utils/authToken';
import logger from '../../utils/logger';

/**
 * Response interceptor
 * Transforms response data and handles common response patterns
 */
export const responseInterceptor = (response) => {
  logger.api('RESPONSE', {
    url: response.config?.url,
    status: response.status,
    data: response.data
  });

  // If API returns data in a nested structure, extract it
  // Modify this based on your API response structure
  if (response.data?.data) {
    response.data = response.data.data;
  }

  return response;
};

/**
 * Response error interceptor
 * Handles errors globally before they reach components
 */
export const responseErrorInterceptor = async (error) => {
  const originalRequest = error.config;
  const errorType = getErrorType(error);

  logger.api('ERROR', {
    url: error.config?.url,
    method: error.config?.method,
    status: error.response?.status,
    message: error.message,
    responseData: error.response?.data
  });

  // Handle 401 - Unauthorized (token expired or invalid)
  if (error.response?.status === 401 && !originalRequest._retry) {
    originalRequest._retry = true;
    
    // Don't retry login endpoint if it fails
    if (originalRequest.url?.includes('/auth/login')) {
      clearStoredToken();
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
      return Promise.reject(error);
    }
    
    try {
      // console.log('[Auth] 401 error, attempting to refresh token...');
      // Try to get a new token
      const newToken = await getAuthToken(true); // Force refresh
      
      // Update the original request with new token
      originalRequest.headers.Authorization = `Bearer ${newToken}`;
      
      // Retry the original request
      const apiClient = (await import('../config/axios')).default;
      return apiClient(originalRequest);
    } catch (refreshError) {
      // Failed to refresh token, clear and reject
      // console.error('[Auth] Failed to refresh token after 401:', refreshError);
      clearStoredToken();
      
      // Dispatch event for app to handle
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
      
      return Promise.reject(refreshError);
    }
  }

  // Handle other unauthorized errors
  if (errorType === ErrorTypes.UNAUTHORIZED && error.response?.status !== 401) {
    // Clear stored tokens
    clearStoredToken();
    
    // Optionally redirect to login
    // window.location.href = '/login';
    
    // Or trigger a custom event for the app to handle
    window.dispatchEvent(new CustomEvent('auth:unauthorized'));
  }

  logger.error('api', 'API Error:', {
    url: error.config?.url,
    method: error.config?.method,
    status: error.response?.status,
    message: error.message,
    data: error.response?.data,
  });

  return Promise.reject(error);
};
