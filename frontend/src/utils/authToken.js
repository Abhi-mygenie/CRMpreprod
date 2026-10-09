// src/utils/authToken.js

import logger from './logger';

// Storage keys
const TOKEN_STORAGE_KEY = 'order_auth_token';
const TOKEN_EXPIRY_KEY = 'order_token_expiry';

// Token expiration: 30 minutes
const TOKEN_EXPIRY_TIME = 10 * 60 * 1000; // 30 minutes in milliseconds

// CR-2026-07-03-000: POS service credentials are no longer bundled into the frontend.
// The FastAPI backend now proxies token issuance via POST /api/pos/auth-token,
// reading server-side env vars MYGENIE_POS_LOGIN_PHONE / _PASSWORD.

/**
 * Get stored token from localStorage
 */
export const getStoredToken = () => {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
};

/**
 * Get token expiration timestamp
 */
export const getTokenExpiry = () => {
  const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);
  return expiry ? parseInt(expiry, 10) : null;
};

/**
 * Check if token is expired (30-minute custom expiration)
 * @returns {boolean} true if token is expired or doesn't exist
 */
export const isTokenExpired = () => {
  const token = getStoredToken();
  const expiry = getTokenExpiry();
  
  // No token or no expiry = expired
  if (!token || !expiry) {
    return true;
  }
  
  const now = Date.now();
  const isExpired = now >= expiry;
  
  if (isExpired) {
    // console.log('[Auth] Token expired (30-minute limit)', {
    //   expiredAt: new Date(expiry).toISOString(),
    //   now: new Date(now).toISOString()
    // });
  }
  
  return isExpired;
};

/**
 * Store token with 30-minute expiration
 * @param {string} token - JWT token from login API
 */
export const storeToken = (token) => {
  const expiry = Date.now() + TOKEN_EXPIRY_TIME; // 30 minutes from now
  
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
  localStorage.setItem(TOKEN_EXPIRY_KEY, expiry.toString());
  
  console.log('[Auth] Token stored', {
    expiresAt: new Date(expiry).toISOString(),
    expiresIn: '10 minutes'
  });
};

/**
 * Clear stored token
 */
export const clearStoredToken = () => {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(TOKEN_EXPIRY_KEY);
  // console.log('[Auth] Token cleared');
};

/**
 * Call FastAPI to get a fresh POS token.
 * CR-2026-07-03-000: creds no longer bundled — server-side proxy issues the token.
 * @returns {Promise<string>} POS auth token
 */
export const loginForToken = async () => {
  const BACKEND = process.env.REACT_APP_BACKEND_URL;
  if (!BACKEND) {
    logger.error('auth', 'CRITICAL: REACT_APP_BACKEND_URL is not set — cannot obtain POS token');
    throw new Error('Backend URL not configured');
  }

  try {
    console.log('[Auth] Requesting POS token via backend proxy...');

    const response = await fetch(`${BACKEND}/api/pos/auth-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Backend token proxy returned ${response.status}${detail ? ` — ${detail}` : ''}`);
    }

    const data = await response.json();

    if (data && data.token) {
      storeToken(data.token); // Store with 30-minute expiration

      console.log('[Auth] POS token received via proxy', {
        tokenReceived: true,
        isPhoneVerified: data.is_phone_verified,
        userId: data.user_id,
      });

      return data.token;
    }

    throw new Error('No token in response');
  } catch (error) {
    console.error('[Auth] Token proxy failed:', error);
    clearStoredToken();

    const errorMessage = error.message || 'Login failed';
    throw new Error(`Failed to get authentication token: ${errorMessage}`);
  }
};

/**
 * Get auth token - checks expiration, gets new token if expired
 * @param {boolean} forceRefresh - Force new token even if current is valid
 * @returns {Promise<string>} JWT token
 */
export const getAuthToken = async (forceRefresh = false) => {
  // Force refresh - get new token
  if (forceRefresh) {
    console.log('[Auth] Force refresh requested');
    return await loginForToken();
  }
  
  // Check if we have a stored token
  const storedToken = getStoredToken();
  
  // No token - get new one
  if (!storedToken) {
    console.log('[Auth] No token found, fetching new token');
    return await loginForToken();
  }
  
  // Check if token is expired (30-minute check)
  if (isTokenExpired()) {
    console.log('[Auth] Token expired, fetching new token');
    return await loginForToken();
  }
  
  // Token is still valid
  const expiry = getTokenExpiry();
  const timeLeft = Math.floor((expiry - Date.now()) / 1000 / 60);
  console.log('[Auth] Using existing token', {
    expiresIn: `${timeLeft} minutes`,
    expiresAt: new Date(expiry).toISOString()
  });
  
  return storedToken;
};
