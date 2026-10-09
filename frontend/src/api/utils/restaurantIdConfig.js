/**
 * Restaurant configuration utilities
 * Determines multi-menu status from POS API's multiple_menu flag
 */

/**
 * Check if a restaurant has multiple menus
 * Uses the multiple_menu flag from the restaurant-info POS API
 * @param {Object} restaurant - Restaurant object from useRestaurantDetails
 * @returns {boolean} true if restaurant is multi-menu
 */
export const isMultipleMenu = (restaurant) => {
  return restaurant?.multiple_menu === 'Yes';
};
