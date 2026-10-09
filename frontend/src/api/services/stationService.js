/**
 * Station Service
 * Handles all station-related API calls
 */

import apiClient from '../config/axios';
import { ENDPOINTS } from '../config/endpoints';

/**
 * Get all stations for a restaurant
 * @param {string|number} restaurantId - Restaurant ID
 * @returns {Promise} Stations list
 */
export const getStations = async (restaurantId) => {
  try {
    const response = await apiClient.get(ENDPOINTS.STATIONS(restaurantId));
    return response.data;
  } catch (error) {
    throw error;
  }
};

/**
 * Get station details
 * @param {string|number} restaurantId - Restaurant ID
 * @param {string|number} stationId - Station ID
 * @returns {Promise} Station details
 */
export const getStationDetails = async (restaurantId, stationId) => {
  try {
    const response = await apiClient.get(ENDPOINTS.STATION_DETAILS(restaurantId, stationId));
    return response.data;
  } catch (error) {
    throw error;
  }
};

/**
 * Get categories for a station
 * @param {string|number} restaurantId - Restaurant ID
 * @param {string|number} stationId - Station ID
 * @returns {Promise} Categories list
 */
export const getStationCategories = async (restaurantId, stationId) => {
  try {
    const response = await apiClient.get(ENDPOINTS.CATEGORIES(restaurantId, stationId));
    return response.data;
  } catch (error) {
    throw error;
  }
};

// stationService.js
const stationService = {
  getStations,
  getStationDetails,
  getStationCategories,
};

export default stationService;
