/**
 * Restaurant Service
 * Handles all restaurant-related API calls
 */

import apiClient from '../config/axios';
import { ENDPOINTS } from '../config/endpoints';

/**
 * Get restaurant details
 * @param {string|number} restaurantId - Restaurant ID
 * @returns {Promise} Restaurant details
 */
export const getRestaurantDetails = async (restaurantId) => {
  try {
    const payload = {
      restaurant_web: restaurantId
    };
    const response = await apiClient.post(ENDPOINTS.RESTAURANT_DETAILS() , payload);
    return response.data;
  } catch (error) {
    throw error;
  }
};

/**
 * Get menu items for a restaurant
 * @param {string|number} restaurantId - Restaurant ID
 * @returns {Promise} Menu items
 */
export const getMenuItems = async (restaurantId) => {
  try {
    const response = await apiClient.get(ENDPOINTS.MENU_ITEMS(restaurantId));
    return response.data;
  } catch (error) {
    throw error;
  }
};

/**
 * Get menu sections for a restaurant
 * @param {string|number} restaurantId - Restaurant ID
 * @returns {Promise} Menu sections
 */
export const getMenuSections = async (restaurantId) => {
  try {
    const response = await apiClient.get(ENDPOINTS.MENU_SECTIONS(restaurantId));
    return response.data;
  } catch (error) {
    throw error;
  }
};

/**
 * Get restaurant products (food items)
 * @param {string|number} restaurantId - Restaurant ID
 * @param {string|number} categoryId - Category ID (default: "0" for all categories)
 * @param {string|number|null} stationId - Station ID
 * @returns {Promise} Restaurant products with categories and items
 */
export const getRestaurantProducts = async (restaurantId, categoryId = "0" , stationId) => {
  try {
    // 1. Prepare the payload (data to send)
    const payload = {
      restaurant_id: String(restaurantId),
      category_id: String(categoryId), // This is ALWAYS "0" as you requested
    };

    // 2. ONLY add station_id if it exists (not null/undefined)
    // if (stationId) {
    //   payload.station_id = String(stationId);
    // }

    //3. Only add station_id(food_for) if it exists (not null/undefined)
    if (stationId) {
      payload.food_for = String(stationId);
    }
    // console.log("Calling API with Payload:", payload);
    const response = await apiClient.post(ENDPOINTS.RESTAURANT_PRODUCTS(), payload);
    return response.data;
  } catch (error) {
    throw error;
  }
};

export const getMenuMaster = async (restaurantId) => {
  const response = await apiClient.post(ENDPOINTS.MENU_MASTER(), {
    restaurant_id: String(restaurantId),
  });
  return response.data;
};

// restaurantService.js
const restaurantService = {
  getRestaurantDetails,
  getMenuItems,
  getMenuSections,
  getRestaurantProducts,
  getMenuMaster,
};


export default restaurantService;
