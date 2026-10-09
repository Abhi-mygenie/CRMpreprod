import apiClient from '../config/axios';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

/**
 * Get available dietary tags (global list)
 */
export const getAvailableDietaryTags = async () => {
  const response = await fetch(`${API_URL}/api/dietary-tags/available`);
  if (!response.ok) {
    throw new Error('Failed to fetch available dietary tags');
  }
  return response.json();
};

/**
 * Get dietary tag mappings for a restaurant
 */
export const getDietaryTagsMapping = async (restaurantId) => {
  const response = await fetch(`${API_URL}/api/dietary-tags/${restaurantId}`);
  if (!response.ok) {
    throw new Error('Failed to fetch dietary tags mapping');
  }
  return response.json();
};

/**
 * Update dietary tag mappings for a restaurant (admin only)
 */
export const updateDietaryTagsMapping = async (restaurantId, mappings, token) => {
  const response = await fetch(`${API_URL}/api/dietary-tags/${restaurantId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ mappings })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to update dietary tags');
  }
  return response.json();
};

export default {
  getAvailableDietaryTags,
  getDietaryTagsMapping,
  updateDietaryTagsMapping
};
