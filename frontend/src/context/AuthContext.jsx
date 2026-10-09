import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { crmGetProfile } from '../api/services/crmService';
import logger from '../utils/logger';
import fetchWithTimeout, { DEFAULT_WRITE_TIMEOUT_MS } from '../utils/fetchWithTimeout'; // CR-2026-07-03-004
const AuthContext = createContext(null);

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

// Helper: get per-restaurant CRM token key
const crmTokenKey = (restaurantId) => `crm_token_${restaurantId}`;

// Helper: extract restaurant ID from a CRM token's user_id claim
const getRestaurantIdFromToken = (token) => {
  try {
    const payload = token.split('.')[1];
    const padded = payload + '='.repeat((4 - payload.length % 4) % 4);
    const decoded = JSON.parse(atob(padded));
    // user_id format: "pos_0001_restaurant_{restaurantId}"
    const match = decoded.user_id?.match(/restaurant_(\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userType, setUserType] = useState(null);
  const [token, setToken] = useState(null);
  const [crmToken, setCrmToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentRestaurantId, setCurrentRestaurantId] = useState(null);
  const scopeRequestRef = useRef(0); // Track latest scope request to avoid races

  // Check admin token on mount (non-restaurant-scoped)
  useEffect(() => {
    const checkAdminAuth = async () => {
      const storedAdminToken = localStorage.getItem('auth_token');
      if (storedAdminToken) {
        try {
          const response = await fetchWithTimeout(`${API_URL}/api/auth/me`, {
            headers: { 'Authorization': `Bearer ${storedAdminToken}` }
          }); // CR-2026-07-03-004 — 8 s read timeout
          const contentType = response.headers.get('content-type');
          if (!contentType || !contentType.includes('application/json')) {
            setLoading(false);
            return;
          }
          if (response.ok) {
            const data = await response.json();
            setUser(data.user);
            setUserType(data.user_type);
            setToken(storedAdminToken);
          } else {
            localStorage.removeItem('auth_token');
          }
        } catch (error) {
          logger.error('auth', 'Admin auth check failed:', error);
          localStorage.removeItem('auth_token');
        }
      }
      setLoading(false);
    };

    // Only check admin on mount — CRM auth is handled by setRestaurantScope
    // But we need to handle the initial page load where user may already be on a restaurant page
    // Check if there's a legacy crm_token (from before migration) and migrate it
    const legacyToken = localStorage.getItem('crm_token');
    if (legacyToken) {
      const legacyRestId = getRestaurantIdFromToken(legacyToken);
      if (legacyRestId) {
        // Migrate to per-restaurant key
        localStorage.setItem(crmTokenKey(legacyRestId), legacyToken);
      }
      localStorage.removeItem('crm_token');
    }

    checkAdminAuth();
  }, []);

  /**
   * Set the restaurant scope for customer auth.
   * Call this from any page that has restaurantId.
   * Handles: token stashing, restoring, and session invalidation.
   */
  const setRestaurantScope = useCallback(async (restaurantId) => {
    if (!restaurantId) return;
    const restIdStr = String(restaurantId);

    // Skip if already scoped to this restaurant
    if (currentRestaurantId === restIdStr && crmToken) return;

    const requestId = ++scopeRequestRef.current;

    // Check if we have a stored token for this restaurant
    const storedToken = localStorage.getItem(crmTokenKey(restIdStr));

    if (storedToken) {
      // Validate the stored token
      try {
        const profile = await crmGetProfile(storedToken);
        // Check if this request is still the latest
        if (requestId !== scopeRequestRef.current) return;

        setUser(profile);
        setUserType('customer');
        setCrmToken(storedToken);
        setToken(storedToken);
        setCurrentRestaurantId(restIdStr);
        return;
      } catch (error) {
        // Token expired or invalid — remove it
        if (requestId !== scopeRequestRef.current) return;
        logger.error('auth', `CRM token for restaurant ${restIdStr} expired:`, error);
        localStorage.removeItem(crmTokenKey(restIdStr));
      }
    }

    // No valid token for this restaurant — clear customer session
    if (requestId !== scopeRequestRef.current) return;
    // Only clear if current session is customer type (don't clear admin sessions)
    if (userType === 'customer') {
      setUser(null);
      setUserType(null);
      setCrmToken(null);
      setToken(null);
    }
    setCurrentRestaurantId(restIdStr);
  }, [currentRestaurantId, crmToken, userType]);

  // Admin login (used by Login.jsx — our backend, admin only)
  const login = async (phoneOrEmail, otpOrPassword, isOTP = true, restaurantContext = null) => {
    const body = { phone_or_email: phoneOrEmail };

    if (isOTP) {
      body.otp = otpOrPassword;
    } else {
      body.password = otpOrPassword;
    }
    
    if (restaurantContext) {
      body.restaurant_id = restaurantContext.restaurant_id;
      body.pos_id = restaurantContext.pos_id || "0001";
    }

    const response = await fetchWithTimeout(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }, DEFAULT_WRITE_TIMEOUT_MS); // CR-2026-07-03-004 — 15 s write timeout

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      logger.error('auth', 'Non-JSON response:', text);
      throw new Error('Server is temporarily unavailable. Please try again.');
    }

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.detail || 'Login failed');
    }

    setUser(data.user);
    setUserType(data.user_type);
    setToken(data.token);
    localStorage.setItem('auth_token', data.token);
    
    if (data.restaurant_context) {
      localStorage.setItem('restaurant_context', JSON.stringify(data.restaurant_context));
    }
    
    return data;
  };

  // Admin auth setter (used by Login.jsx for direct admin login)
  const setAuth = (newToken, newUser, newUserType) => {
    setUser(newUser);
    setUserType(newUserType);
    setToken(newToken);
    localStorage.setItem('auth_token', newToken);
  };

  // CRM customer auth setter — now restaurant-scoped
  const setCrmAuth = (newCrmToken, customerProfile, restaurantId) => {
    setUser(customerProfile);
    setUserType('customer');
    setCrmToken(newCrmToken);
    setToken(newCrmToken);
    const restIdStr = restaurantId ? String(restaurantId) : getRestaurantIdFromToken(newCrmToken);
    if (restIdStr) {
      localStorage.setItem(crmTokenKey(restIdStr), newCrmToken);
      setCurrentRestaurantId(restIdStr);
    }
  };

  const logout = () => {
    // Clear current restaurant's CRM token
    if (currentRestaurantId) {
      localStorage.removeItem(crmTokenKey(currentRestaurantId));
    }
    setUser(null);
    setUserType(null);
    setToken(null);
    setCrmToken(null);
    localStorage.removeItem('auth_token');
    localStorage.removeItem('crm_token'); // Legacy cleanup
    localStorage.removeItem('pos_token');
    localStorage.removeItem('restaurant_context');
  };

  const value = {
    user,
    userType,
    token,
    crmToken,
    loading,
    currentRestaurantId,
    isAuthenticated: !!token,
    isCustomer: userType === 'customer',
    isRestaurant: userType === 'restaurant',
    setRestaurantScope,
    login,
    setAuth,
    setCrmAuth,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
