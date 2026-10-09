/**
 * CRM Service — All CRM API calls
 * Base URL: REACT_APP_CRM_URL (e.g., https://room-scan-validation.preview.emergentagent.com/api)
 * 
 * Auth endpoints: No token required
 * Profile/Address endpoints: CRM customer token required (from login or verify-otp)
 */

const CRM_URL = process.env.REACT_APP_CRM_URL;

if (!CRM_URL) {
  console.error('[CRM] CRITICAL: REACT_APP_CRM_URL is not set in .env');
}

// ============================================
// Per-restaurant API key map
// ============================================
// REACT_APP_CRM_API_KEY is a JSON object: { "<restaurantId>": "<apiKey>", ... }
let CRM_API_KEYS = {};
try {
  const raw = process.env.REACT_APP_CRM_API_KEY;
  if (raw) {
    CRM_API_KEYS = typeof raw === 'string' ? JSON.parse(raw) : raw;
  }
} catch (e) {
  console.error('[CRM] Failed to parse REACT_APP_CRM_API_KEY as JSON:', e);
  CRM_API_KEYS = {};
}

/** Extract restaurant_id from a "pos_{posId}_restaurant_{restaurantId}" userId string */
const getRestaurantIdFromUserId = (userId) => {
  if (!userId) return null;
  const m = String(userId).match(/restaurant_(\d+)/);
  return m ? m[1] : null;
};

/** Extract restaurant_id from a CRM JWT (user_id claim) */
const getRestaurantIdFromToken = (token) => {
  try {
    if (!token) return null;
    const payload = token.split('.')[1];
    if (!payload) return null;
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    const decoded = JSON.parse(atob(padded));
    return getRestaurantIdFromUserId(decoded.user_id);
  } catch {
    return null;
  }
};

/** Get API key for a restaurant id (string or number) */
const getApiKeyForRestaurant = (restaurantId) => {
  if (restaurantId == null) return null;
  return CRM_API_KEYS[String(restaurantId)] || null;
};

// ============================================
// API version flag (Phase-1 migration)
// ============================================
// Read at module load; defaults to v1 if not set or invalid.
// Controls which CRM contract this service talks to (see Phase-1 plan).
// Value flip requires a frontend restart (CRA bakes env vars at dev-server start).
const CRM_API_VERSION = (process.env.REACT_APP_CRM_API_VERSION || 'v1').trim().toLowerCase();
if (!['v1', 'v2'].includes(CRM_API_VERSION)) {
  console.warn(`[CRM] Invalid REACT_APP_CRM_API_VERSION="${CRM_API_VERSION}", defaulting to v1`);
}
console.log(`[CRM] API version: ${CRM_API_VERSION}`);
// eslint-disable-next-line no-unused-vars
const isV2 = () => CRM_API_VERSION === 'v2';

// ============================================
// Helper
// ============================================

/**
 * Build user_id string from restaurant ID and POS ID
 * Format: "pos_{posId}_restaurant_{restaurantId}"
 */
export const buildUserId = (restaurantId, posId = '0001') => {
  return `pos_${posId}_restaurant_${restaurantId}`;
};

/**
 * Internal fetch wrapper with error handling.
 * Pass opts.restaurantId (or opts.userId / opts.token) to attach the per-restaurant x-api-key.
 */
const crmFetch = async (endpoint, options = {}) => {
  const url = `${CRM_URL}${endpoint}`;
  const { headers: optionHeaders, restaurantId, userId, token, ...restOptions } = options;

  // Resolve restaurant id from the first available source
  const resolvedRestId =
    restaurantId ||
    getRestaurantIdFromUserId(userId) ||
    getRestaurantIdFromToken(token) ||
    getRestaurantIdFromUserId(
      (() => {
        try {
          const body = restOptions.body ? JSON.parse(restOptions.body) : null;
          return body?.user_id;
        } catch {
          return null;
        }
      })()
    );

  const apiKey = getApiKeyForRestaurant(resolvedRestId);
  if (!apiKey && resolvedRestId) {
    console.warn(`[CRM] No API key configured for restaurant_id=${resolvedRestId}`);
  }

  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'x-api-key': apiKey } : {}),
      ...optionHeaders,
    },
    ...restOptions,
  });

  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    const text = await response.text();
    throw new Error(text || `CRM returned non-JSON response (${response.status})`);
  }

  const data = await response.json();

  if (!response.ok) {
    const message = data.detail
      ? (typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail))
      : `CRM error (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.data = data;
    // CR-2026-05-30-001: surface Retry-After (seconds) to enable client-side
    // backoff in crmSkipOtpRetry. Additive; no existing caller reads it.
    const retryAfterHeader = response.headers.get('retry-after');
    if (retryAfterHeader) {
      const seconds = parseInt(retryAfterHeader, 10);
      if (!Number.isNaN(seconds) && seconds >= 0) {
        error.retryAfterMs = seconds * 1000;
      }
    }
    throw error;
  }

  // ============================================
  // v2 response-envelope adapter
  // ============================================
  // v2 wraps every response in { success, message, data }.
  // v1 returns bare objects and will NOT match this shape — passes through unchanged.
  // Business errors in v2 arrive as HTTP 200 with success:false — must throw here.
  if (
    data &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    'success' in data &&
    'data' in data
  ) {
    if (data.success === false) {
      const err = new Error(data.message || 'CRM returned success:false');
      err.data = data;
      err.isBusinessError = true;
      throw err;
    }
    return data.data;
  }

  return data;
};

/**
 * Authenticated fetch — adds Bearer token + per-restaurant x-api-key (derived from token)
 */
const crmAuthFetch = async (endpoint, token, options = {}) => {
  return crmFetch(endpoint, {
    ...options,
    token, // used by crmFetch to resolve restaurant -> x-api-key
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
    },
  });
};

// ============================================
// Auth — No token required
// ============================================

/**
 * Register customer with phone + password
 * Creates new customer or links password to existing (no password set)
 * Returns: { success, token, customer, is_new_customer }
 *
 * v1 path: POST /customer/register — body { phone, password, user_id, name?, email? }
 * v2 path: POST /scan/auth/register — body { phone, name, password, restaurant_id, email? }
 *          (name required in v2; customer object synthesized in response)
 */
export const crmRegister = async (phone, password, userId, name = '', email = '') => {
  if (isV2()) {
    const restaurantId = getRestaurantIdFromUserId(userId);
    const body = {
      phone: stripPhonePrefix(phone),
      password,
      name,
      restaurant_id: restaurantId,
    };
    if (email) body.email = email;
    const data = await crmFetch('/scan/auth/register', {
      method: 'POST',
      body: JSON.stringify(body),
      userId,
    });
    return {
      success: true,
      token: data?.token,
      customer: { id: data?.customer_id, phone: stripPhonePrefix(phone), name },
    };
  }

  // v1 — unchanged
  const body = { phone: stripPhonePrefix(phone), password, user_id: userId };
  if (name) body.name = name;
  if (email) body.email = email;

  return crmFetch('/customer/register', {
    method: 'POST',
    body: JSON.stringify(body),
  });
};

/**
 * Login customer with phone + password
 * Returns: { success, token, customer } (customer includes addresses)
 *
 * v1 path: POST /customer/login — body { phone, password, user_id }
 * v2 path: POST /scan/auth/login — body { phone, password, restaurant_id }
 *          (no addresses returned in v2; synthesized customer with name='')
 */
export const crmLogin = async (phone, password, userId) => {
  if (isV2()) {
    const restaurantId = getRestaurantIdFromUserId(userId);
    const data = await crmFetch('/scan/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        phone: stripPhonePrefix(phone),
        password,
        restaurant_id: restaurantId,
      }),
      userId,
    });
    return {
      success: true,
      token: data?.token,
      customer: { id: data?.customer_id, phone: stripPhonePrefix(phone), name: '' },
    };
  }

  // v1 — unchanged
  return crmFetch('/customer/login', {
    method: 'POST',
    body: JSON.stringify({ phone: stripPhonePrefix(phone), password, user_id: userId }),
  });
};

/**
 * Strip country code prefix from phone for CRM API calls.
 * CRM expects bare digits (e.g., "7505242126"), not "+917505242126".
 * The country_code field is sent separately.
 */
const stripPhonePrefix = (phone) => {
  if (!phone) return phone;
  // Remove + and leading country code (91 for India, etc.)
  let bare = phone.replace(/^\+/, '');
  // If starts with 91 and remaining is 10 digits, strip 91
  if (bare.startsWith('91') && bare.length === 12) {
    return bare.slice(2);
  }
  return bare;
};

// ============================================
// Skip-OTP and Lookup — no auth required
// ============================================

/**
 * Skip-OTP frictionless login (v2 only — added post-Phase-1 for UX-GAP-01)
 * Grants a valid customer JWT without OTP verification.
 * Auto-creates customer record if phone doesn't exist.
 * Returns: { success, token, customer, is_new_customer }
 *
 * v2 path: POST /scan/auth/skip-otp — body { phone, restaurant_id }
 *          Response envelope unwrapped by crmFetch; synthesized to v1-like shape.
 * No v1 equivalent — this call always uses v2.
 */
export const crmSkipOtp = async (phone, userId) => {
  const restaurantId = getRestaurantIdFromUserId(userId);
  const data = await crmFetch('/scan/auth/skip-otp', {
    method: 'POST',
    body: JSON.stringify({
      phone: stripPhonePrefix(phone),
      restaurant_id: restaurantId,
      country_code: '+91', // CR-085-A: send separately for canonical matching
    }),
    userId, // used by crmFetch to resolve restaurant -> x-api-key
  });
  return {
    success: true,
    token: data?.token,
    customer: { id: data?.customer_id, phone: data?.phone, name: '' },
    is_new_customer: data?.is_new_customer,
  };
};

/**
 * CR-2026-10-03-004 Part A: Pre-login customer lookup via CRM.
 * Replaces POST /api/auth/check-customer (which read db.customers directly).
 *
 * v2 path: POST /scan/auth/lookup — body { phone (digits only), restaurant_id }
 * Response normalised to { exists, customer: { name } | null } (D1=adapter)
 * so LandingPage call sites require no changes to their reads.
 * No auth token required — lookup is a public endpoint.
 */
export const crmLookupCustomer = async (phone, restaurantId) => {
  const data = await crmFetch('/scan/auth/lookup', {
    method: 'POST',
    body: JSON.stringify({
      phone: stripPhonePrefix(phone),
      restaurant_id: String(restaurantId),
      country_code: '+91', // CR-085-A: send separately for canonical matching
    }),
  });
  return {
    exists: data?.exists ?? false,
    customer: data?.exists ? { name: data.name || '' } : null,
  };
};

/**
 * CR-2026-10-03-004 Part B: Per-restaurant loyalty rules via CRM.
 * Replaces GET /api/loyalty-settings (which read db.loyalty_settings directly).
 *
 * v2 path: GET /scan/loyalty-rules/{rid}  (public endpoint, no auth required)
 * crmFetch unwraps {success, message, data} envelope → caller receives data directly.
 * Returns null on 404 (unknown restaurant → loyalty section hidden, per G4).
 * Caller must use per-tier *_redemption_value fields; never fall back to flat redemption_value (G1).
 */
export const crmGetLoyaltyRules = async (restaurantId) => {
  try {
    return await crmFetch(`/scan/loyalty-rules/${restaurantId}`, { method: 'GET' });
  } catch (err) {
    // 404 = restaurant has no loyalty config → hide section (G4)
    if (err?.status === 404 || err?.message?.includes('404')) return null;
    throw err;
  }
};

// ============================================
// Profile — CRM token required
// ============================================

/**
 * Get current customer profile (same data as login/verify-otp response)
 * Returns: { id, name, phone, email, tier, total_points, addresses, ... }
 *
 * v1 path: GET /customer/me
 * v2 path: GET /scan/auth/me  (envelope unwrapped by crmFetch -> bare profile)
 */
export const crmGetProfile = async (token) => {
  if (isV2()) {
    return crmAuthFetch('/scan/auth/me', token, { method: 'GET' });
  }
  return crmAuthFetch('/customer/me', token, { method: 'GET' });
};

/**
 * Get customer order history
 * v1: GET /customer/me/orders  v2: GET /scan/orders (skip not supported in v2)
 * Returns: { orders: [...], total: N }
 */
export const crmGetOrders = async (token, limit = 50, skip = 0) => {
  // CR-2026-09-15-001: v1 path → 404 on CRM v2
  if (isV2()) {
    return crmAuthFetch(`/scan/orders?limit=${limit}`, token, { method: 'GET' });
  }
  return crmAuthFetch(`/customer/me/orders?limit=${limit}&skip=${skip}`, token, { method: 'GET' });
};

/**
 * CR-2026-10-03-003: submit diner feedback to CRM (token path; CRM CR-096).
 * Body per contract §4c: { rating, message?, order_id? } + restaurant_id (short form).
 * Response shape untyped (contract L7) — callers only need the 2xx.
 */
export const crmSubmitFeedback = async (token, { rating, message, orderId, restaurantId }) => {
  const body = { rating, restaurant_id: String(restaurantId) };
  if (message) body.message = message;
  if (orderId) body.order_id = orderId;
  return crmAuthFetch('/scan/feedback', token, { method: 'POST', body: JSON.stringify(body) });
};

/**
 * Get customer points balance + transaction history
 * v1: GET /customer/me/points
 * v2: GET /scan/loyalty (balance/tier) + GET /scan/points/history (ledger) — parallel
 * Returns: { total_points, tier, transactions: [...] }
 */
export const crmGetPoints = async (token, limit = 50) => {
  // CR-2026-09-15-001: v1 path → 404; v2 splits balance and history across two endpoints
  if (isV2()) {
    const [loyalty, history] = await Promise.all([
      crmAuthFetch('/scan/loyalty', token, { method: 'GET' }),
      crmAuthFetch(`/scan/points/history?limit=${limit}`, token, { method: 'GET' }),
    ]);
    return {
      total_points: loyalty?.total_points ?? 0,
      tier: loyalty?.tier ?? 'Bronze',
      transactions: history?.transactions ?? [],
    };
  }
  return crmAuthFetch(`/customer/me/points?limit=${limit}`, token, { method: 'GET' });
};

/**
 * Get customer wallet balance + transaction history
 * v1: GET /customer/me/wallet
 * v2: GET /scan/loyalty (wallet_balance) + GET /scan/wallet/history (ledger) — parallel
 * Returns: { wallet_balance, transactions: [...] }
 */
export const crmGetWallet = async (token, limit = 50) => {
  // CR-2026-09-15-001: v1 path → 404; v2 splits balance and history across two endpoints
  if (isV2()) {
    const [loyalty, history] = await Promise.all([
      crmAuthFetch('/scan/loyalty', token, { method: 'GET' }),
      crmAuthFetch(`/scan/wallet/history?limit=${limit}`, token, { method: 'GET' }),
    ]);
    return {
      wallet_balance: loyalty?.wallet_balance ?? 0,
      transactions: history?.transactions ?? [],
    };
  }
  return crmAuthFetch(`/customer/me/wallet?limit=${limit}`, token, { method: 'GET' });
};

// ============================================
// Addresses — CRM token required
// ============================================

/**
 * Get all saved addresses
 * Returns: { customer_id, addresses: [...], total }
 *
 * v1 path: GET /customer/me/addresses
 * v2 path: GET /scan/addresses  (flat route; envelope unwrapped to { addresses, count })
 */
export const crmGetAddresses = async (token) => {
  if (isV2()) {
    const data = await crmAuthFetch('/scan/addresses', token, { method: 'GET' });
    if (data && Array.isArray(data.addresses)) {
      return { addresses: data.addresses };
    }
    return data;
  }
  return crmAuthFetch('/customer/me/addresses', token, { method: 'GET' });
};

/**
 * Add a new delivery address
 * Returns: flat address object (v1 shape) — so DeliveryAddress.jsx can read newAddr.id / .latitude / .longitude directly.
 *          Dedup case: adds _deduplicated: true so caller can detect it if needed.
 *
 * v1 path: POST /customer/me/addresses
 * v2 path: POST /scan/addresses  (flat route; server-side dedup on address+pincode)
 */
export const crmAddAddress = async (token, addressData) => {
  if (isV2()) {
    const data = await crmAuthFetch('/scan/addresses', token, {
      method: 'POST',
      body: JSON.stringify(addressData),
    });
    if (data?.address) {
      // Normal add — return full flat address object
      return data.address;
    }
    // Dedup case — v2 only returns address_id; synthesize from request payload
    return {
      id: data?.address_id,
      ...addressData,
      _deduplicated: true,
    };
  }
  return crmAuthFetch('/customer/me/addresses', token, {
    method: 'POST',
    body: JSON.stringify(addressData),
  });
};

/**
 * Update an existing address (send only fields to change)
 * Returns: { success, message, address_id }
 *
 * v1 path: PUT /customer/me/addresses/{id}
 * v2 path: PUT /scan/addresses/{addr_id}  (flat route; returns only address_id — re-fetch for latest)
 */
export const crmUpdateAddress = async (token, addressId, addressData) => {
  if (isV2()) {
    const data = await crmAuthFetch(`/scan/addresses/${addressId}`, token, {
      method: 'PUT',
      body: JSON.stringify(addressData),
    });
    return {
      success: true,
      message: 'Address updated',
      address_id: data?.address_id || addressId,
    };
  }
  return crmAuthFetch(`/customer/me/addresses/${addressId}`, token, {
    method: 'PUT',
    body: JSON.stringify(addressData),
  });
};

/**
 * Delete an address
 * Returns: { success, message, address_id }
 *
 * v1 path: DELETE /customer/me/addresses/{id}  (returned { remaining_addresses })
 * v2 path: DELETE /scan/addresses/{addr_id}    (remaining_addresses not returned; re-fetch for list)
 */
export const crmDeleteAddress = async (token, addressId) => {
  if (isV2()) {
    const data = await crmAuthFetch(`/scan/addresses/${addressId}`, token, {
      method: 'DELETE',
    });
    return {
      success: true,
      message: 'Address deleted',
      address_id: data?.address_id || addressId,
    };
  }
  return crmAuthFetch(`/customer/me/addresses/${addressId}`, token, {
    method: 'DELETE',
  });
};

/**
 * Set an address as default
 * Returns: { success, message, address_id }
 *
 * v1 path: POST /customer/me/addresses/{id}/set-default
 * v2 path: PUT  /scan/addresses/{addr_id}/default  (METHOD and PATH both change)
 *          Idempotent — setting already-default returns success.
 */
export const crmSetDefaultAddress = async (token, addressId) => {
  if (isV2()) {
    const data = await crmAuthFetch(`/scan/addresses/${addressId}/default`, token, {
      method: 'PUT',
    });
    return {
      success: true,
      message: 'Default address set',
      address_id: data?.address_id || addressId,
    };
  }

  return crmAuthFetch(`/customer/me/addresses/${addressId}/set-default`, token, {
    method: 'POST',
  });
};
