/**
 * Application Constants
 * 
 * Note: Restaurant ID is now extracted from URL using useRestaurantId hook
 * Supported URL formats:
 * - /478 (path parameter)
 * - /restaurant/478 (path parameter)
 * - /?id=478 (query parameter)
 * - /?restaurantId=478 (query parameter)
 * 
 * Fallback order: URL > Environment Variable > Default '478'
 */

// Default Restaurant ID (fallback only)
// Use useRestaurantId() hook in components to get ID from URL
// export const DEFAULT_RESTAURANT_ID = process.env.REACT_APP_RESTAURANT_ID || '478';

// Legacy export for backward compatibility (deprecated - use useRestaurantId hook instead)

// API Configuration
export const API_CONFIG = {
  TIMEOUT: 30000,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,
};

// Cache Configuration
export const CACHE_CONFIG = {
  MENU_CACHE_TIME: 5 * 60 * 1000, // 5 minutes
  STATION_CACHE_TIME: 10 * 60 * 1000, // 10 minutes
};

const constants = {
  API_CONFIG,
  CACHE_CONFIG,
};

export default constants;
