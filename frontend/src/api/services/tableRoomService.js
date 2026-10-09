/**
 * Table/Room Service
 * Handles API calls for fetching table and room configurations
 */

import apiClient from '../config/axios';
import { ENDPOINTS } from '../config/endpoints';
import logger from '../../utils/logger';

/**
 * Get table configuration for a restaurant
 * @param {string} restaurantId - Restaurant ID
 * @returns {Promise<Object>} { rooms: Array, tables: Array }
 */
export const getTableConfig = async (restaurantId) => {
  try {
    // console.log('[TableRoomService] restaurantId:', restaurantId); // Better logging
    const response = await apiClient.post(ENDPOINTS.RESTAURANT_TABLE_ROOMS(), {
      restaurant_id: restaurantId
    });
   
    // console.log('[TableRoomService] Full response:', response.data); // Log full response
    // console.log('[TableRoomService] Tables:', response.data?.tables); // Use flattened structure
    // Extract tables array from response
    const tablesData = response.data?.tables || [];

    // Separate rooms and tables based on rtype
    const rooms = tablesData
      .filter(item => item.rtype === 'RM')
      .map(item => ({
        id: item.id,
        table_no: item.table_no,
        rtype: item.rtype
      }));

    const tables = tablesData
      .filter(item => item.rtype === 'TB')
      .map(item => ({
        id: item.id,
        table_no: item.table_no,
        rtype: item.rtype
      }));
    //   console.log('[TableRoomService] Rooms count:', rooms.length); // Debug log
    //   console.log('[TableRoomService] Tables count:', tables.length); // Debug log
    return {
      rooms,
      tables
    };
  } catch (error) {
    logger.error('table', 'Failed to fetch table config:', error);
    throw error;
  }
};
