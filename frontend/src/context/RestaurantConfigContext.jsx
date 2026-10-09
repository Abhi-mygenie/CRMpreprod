import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { DEFAULT_THEME } from '../constants/theme';
import logger from '../utils/logger';
import toast from 'react-hot-toast';
import fetchWithTimeout from '../utils/fetchWithTimeout'; // CR-2026-07-03-004

const RestaurantConfigContext = createContext(null);

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

// CR-2026-07-03-001 — manual cache-bust escape hatch.
// If URL has ?bustCache=1 (alias ?nocache=1), the context will:
//   1. NOT hydrate <html> from the cached restaurant_config_<rid>
//   2. still call /api/config/<rid>; saveConfigToCache then overwrites
//      the stale blob with the fresh data on the same visit.
// Default behaviour (no query param) is fully preserved.
const shouldBustCache = () => {
  try {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    const v = (params.get('bustCache') || params.get('nocache') || '').toLowerCase();
    return v === '1' || v === 'true' || v === 'yes';
  } catch (_e) {
    return false;
  }
};

const DEFAULT_CONFIG = {
  // Landing Page
  showLogo: true,
  showWelcomeText: false,
  showDescription: false,
  showSocialIcons: false,
  showTableNumber: true,
  showPromotions: true,
  showPoweredBy: true,
  showCallWaiter: false,
  showPayBill: false,
  showLandingCallWaiter: false,
  showLandingPayBill: false,
  showEstimatedTimes: false,
  showAboutUs: true,
  showFooter: true,
  showLandingCustomerCapture: false,  // Capture name/phone on landing
  showHamburgerMenu: true,  // Show hamburger menu
  showLoginButton: false,    // Show login button on landing
  // Menu Page
  showPromotionsOnMenu: false,
  showCategories: true,
  showMenuFab: true,  // Menu FAB button
  // Order Page
  showCustomerDetails: false,
  showCustomerName: false,
  showCustomerPhone: true,
  showCookingInstructions: true,
  showSpecialInstructions: true,
  showPriceBreakdown: true,
  showTableInfo: true,
  showLoyaltyPoints: true,
  showCouponCode: false,
  showWallet: false,
  // Order Status Page
  showFoodStatus: true,  // Show food item status (Preparing/Ready/Served)
  showOrderStatusTracker: false,  // Show order status progress bar
  // Branding - Colors
  logoUrl: null,
  backgroundImageUrl: null,          // Desktop landing page background image
  mobileBackgroundImageUrl: null,    // Mobile landing page background image (9:16)
  primaryColor: null,
  secondaryColor: null,
  buttonTextColor: null,
  backgroundColor: null,
  textColor: null,
  textSecondaryColor: null,
  // Branding - Typography
  fontHeading: null,
  fontBody: null,
  // Branding - Style
  borderRadius: null,
  // Branding - Text
  welcomeMessage: null,
  tagline: null,
  // Order Success Page (admin-configurable; consumer falls back to defaults when null/empty)
  successTitle: null,
  successMessage: null,
  instagramUrl: null,
  facebookUrl: null,
  twitterUrl: null,
  youtubeUrl: null,
  whatsappNumber: null,
  phone: null,
  address: null,
  contactEmail: null,
  mapEmbedUrl: null,
  aboutUsContent: null,
  aboutUsImage: null,
  openingHours: null,
  footerText: null,
  footerLinks: [],
  feedbackEnabled: false,
  feedbackIntroText: null,
  customPages: [],
  navMenuOrder: [],
  menuOrder: {},
  banners: [],
  // Extra Info Section
  showExtraInfo: true,
  extraInfoItems: [],
  // Custom Text
  browseMenuButtonText: 'Browse Menu',
  // Customer Capture - Mandatory fields
  mandatoryCustomerName: false,
  mandatoryCustomerPhone: false,
  // OTP Configuration per order type (LEGACY — DEAD FLAGS, never read at runtime)
  otpRequiredDineIn: false,
  otpRequiredTakeaway: false,
  otpRequiredDineInWithTable: false,
  otpRequiredWalkIn: false,
  otpRequiredRoomOrders: false,
  // Skip-OTP toggles per order type (CR-2026-05-30-001 Item 1).
  // Default false → show /password-setup (current behaviour). Admin opts in by
  // setting true to silently bypass the OTP/password-setup screen via crmSkipOtp.
  skipOtpDineIn: false,
  skipOtpTakeaway: false,
  skipOtpDineInWithTable: false,
  skipOtpWalkIn: false,
  skipOtpRoomOrders: false,
  skipOtpDelivery: false,
  // Non-QR order access policy — CR-2026-05-30-002.
  // Default true → no enforcement, no block, no telemetry (current behaviour).
  allowNonQrOrders: true,
  // Restaurant Operating Shifts
  restaurantShifts: [{ start: '06:00', end: '03:00' }],
  // Restaurant Open master toggle (default open)
  restaurantOpen: true,
  // CR-2026-08-06-001: Per-channel shifts. null = fall back to restaurantShifts = open 24/7.
  deliveryShifts: null,
  takeawayShifts: null,
  dineInShifts: null,
  roomShifts: null,
  walkinShifts: null,
  // Category & Item Timings
  categoryTimings: {},
  itemTimings: {},
  // Payment Options Configuration (FEAT-001)
  codEnabled: false,
  onlinePaymentDinein: true,
  onlinePaymentTakeaway: true,
  onlinePaymentDelivery: true,
  payOnlineLabel: 'Pay Online',
  payAtCounterLabel: 'Pay at Counter',
  // Powered By Configuration (DFA-004)
  poweredByText: 'Powered by',
  poweredByLogoUrl: '/assets/images/mygenie_logo.svg',
  // Notification Popups (FEAT-003)
  notificationPopups: [],
};

// Fix 10 — stale cache after admin save.
// After the first fetch, `fetchConfig` short-circuits on the same restaurantId,
// so an already-open customer tab never re-fetches. The listeners installed by
// the provider call `softRefreshConfig` on visibility/focus (throttled) and on
// `storage` events (same-browser cross-tab). This constant limits how often we
// hit GET /api/config/<rid> per tab.
const CONFIG_SOFT_REFRESH_THROTTLE_MS = 30 * 1000;

export const RestaurantConfigProvider = ({ children }) => {
  // Synchronously hydrate from localStorage cache (anti-flash on hard refresh).
  // Mirrors the same `restaurant_config_<rid>` key used by loadConfigFromCache /
  // saveConfigToCache below. On any failure (no rid in URL, no cache, malformed
  // JSON, blocked storage), falls through to DEFAULT_CONFIG with no regression.
  const getInitialConfigFromCache = () => {
    try {
      if (typeof window === 'undefined') return null;
      // CR-2026-07-03-001 — with ?bustCache=1, skip cache-first paint entirely.
      // We do NOT remove the stored blob here: the subsequent /api/config fetch
      // will overwrite it via saveConfigToCache with fresh data. Removing here
      // races with saveConfigToCache when multiple consumers call fetchConfig
      // in parallel and left the entry empty in tests.
      if (shouldBustCache()) return null;
      const seg = window.location.pathname.split('/').filter(Boolean)[0];
      if (!seg) return null;
      const raw = window.localStorage && localStorage.getItem(`restaurant_config_${seg}`);
      if (!raw) return null;
      const cached = JSON.parse(raw);
      if (!cached || typeof cached !== 'object') return null;
      return { rid: seg, data: cached };
    } catch (_e) {
      return null;
    }
  };
  const initialCache = getInitialConfigFromCache();

  const [config, setConfig] = useState(
    initialCache ? { ...DEFAULT_CONFIG, ...initialCache.data } : DEFAULT_CONFIG
  );
  const [configLoading, setConfigLoading] = useState(false);
  // CR-2026-08-06-001 BUG-FIX: Always start null so fetchConfig always makes one
  // API call on first load, even when there is a cache. This ensures fresh
  // per-channel shift data (deliveryShifts etc.) is always loaded.
  // The cache still hydrates `config` for instant visual render; the API
  // call then overwrites it with up-to-date config before the user interacts.
  const [configRestaurantId, setConfigRestaurantId] = useState(null);

  // Helper to get cache key for restaurant config
  const getConfigCacheKey = (restaurantId) => `restaurant_config_${restaurantId}`;

  // Load config from localStorage cache (instant brand colors on refresh)
  const loadConfigFromCache = useCallback((restaurantId) => {
    try {
      const cached = localStorage.getItem(getConfigCacheKey(restaurantId));
      if (cached) {
        const cachedConfig = JSON.parse(cached);
        setConfig({ ...DEFAULT_CONFIG, ...cachedConfig });
        setConfigRestaurantId(restaurantId);
        return true;
      }
    } catch (error) {
      logger.error('menu', 'Failed to load config from cache:', error);
    }
    return false;
  }, []);

  // Save config to localStorage cache
  const saveConfigToCache = (restaurantId, data) => {
    try {
      localStorage.setItem(getConfigCacheKey(restaurantId), JSON.stringify(data));
    } catch (error) {
      logger.error('menu', 'Failed to save config to cache:', error);
    }
  };

  const fetchConfig = useCallback(async (restaurantId) => {
    if (!restaurantId || restaurantId === configRestaurantId) return;

    // CR-2026-07-03-001 — if ?bustCache=1 is present, skip the cache-first
    // paint so the stale blob can't flash before the network resolves.
    // NOTE: purging the cache is done ONCE at mount by
    // getInitialConfigFromCache. Do NOT purge here — a second consumer's
    // removeItem() could race a concurrent saveConfigToCache() and leave
    // the entry empty.
    const bust = shouldBustCache();

    // Load from cache FIRST (instant brand colors) — unless we're busting.
    const hasCached = bust ? false : loadConfigFromCache(restaurantId);

    // Then fetch from API to get latest (in case config was updated)
    setConfigLoading(!hasCached); // Only show loading if no cache
    try {
      const response = await fetchWithTimeout(`${API_URL}/api/config/${restaurantId}`); // CR-2026-07-03-004 — 8 s read
      if (response.ok) {
        const data = await response.json();
        setConfig({ ...DEFAULT_CONFIG, ...data });
        setConfigRestaurantId(restaurantId);
        // Save to cache for next time
        saveConfigToCache(restaurantId, data);
      }
    } catch (error) {
      logger.error('menu', 'Failed to fetch restaurant config:', error);
      // CR-2026-07-03-004 D-05 — non-blocking toast for background config timeout.
      // aria-live=polite semantics handled by react-hot-toast internally.
      if (error && error.name === 'TimeoutError') {
        toast('Some restaurant details are taking a moment to update.', {
          duration: 5000,
          id: 'timeout-error-config-toast', // dedup key = data-testid
        });
      }
    } finally {
      setConfigLoading(false);
    }
  }, [configRestaurantId, loadConfigFromCache]);

  // Force refresh config (used after Admin Settings save)
  const refreshConfig = useCallback(async (restaurantId) => {
    if (!restaurantId) return;
    
    // 1. Clear cached restaurant ID (so fetchConfig doesn't skip)
    setConfigRestaurantId(null);
    
    // 2. Clear localStorage cache
    const cacheKey = `restaurant_config_${restaurantId}`;
    localStorage.removeItem(cacheKey);
    
    // 3. Re-fetch from API
    setConfigLoading(true);
    try {
      const response = await fetchWithTimeout(`${API_URL}/api/config/${restaurantId}`); // CR-2026-07-03-004 — 8 s read
      if (response.ok) {
        const data = await response.json();
        setConfig({ ...DEFAULT_CONFIG, ...data });
        setConfigRestaurantId(restaurantId);
        // Save to cache
        localStorage.setItem(cacheKey, JSON.stringify(data));
      }
    } catch (error) {
      logger.error('menu', 'Failed to refresh restaurant config:', error);
      if (error && error.name === 'TimeoutError') {
        toast('Some restaurant details are taking a moment to update.', {
          duration: 5000,
          id: 'timeout-error-config-toast',
        });
      }
    } finally {
      setConfigLoading(false);
    }
  }, []);

  // Apply dynamic branding CSS variables when config changes
  useEffect(() => {
    const root = document.documentElement;
    
    // Primary Color - only override CSS default if config has value
    if (config.primaryColor) {
      const primary = config.primaryColor;
      root.style.setProperty('--color-primary', primary);
      root.style.setProperty('--text-link', primary);
      root.style.setProperty('--border-primary', primary);
      root.style.setProperty('--text-blue-hero', primary);
      root.style.setProperty('--color-primary-darker', primary);
      root.style.setProperty('--color-primary-darkest', primary);
      root.style.setProperty('--text-blue-dark', primary);
      root.style.setProperty('--text-blue-medium', primary);
      root.style.setProperty('--text-blue-light', primary);
    }
    
    // Secondary Color (for hover states, gradients)
    if (config.secondaryColor) {
      const secondary = config.secondaryColor;
      root.style.setProperty('--color-primary-dark', secondary);
      root.style.setProperty('--text-link-hover', secondary);
    }
    
    // Button Text Color
    root.style.setProperty('--button-text-color', config.buttonTextColor || DEFAULT_THEME.buttonTextColor);
    
    // Background Color
    root.style.setProperty('--bg-primary', config.backgroundColor || DEFAULT_THEME.backgroundColor);
    
    // Text Color (for body text, descriptions, etc.)
    {
      const textColor = config.textColor || DEFAULT_THEME.textColor;
      root.style.setProperty('--text-color', textColor);
      root.style.setProperty('--text-primary', textColor);
    }
    
    // Text Secondary Color (for secondary text)
    {
      const textSecondary = config.textSecondaryColor || DEFAULT_THEME.textSecondaryColor;
      root.style.setProperty('--text-secondary-color', textSecondary);
      root.style.setProperty('--text-secondary', textSecondary);
    }
    
    // Font Heading
    {
      const fontMap = {
        'Big Shoulders': "'Big Shoulders Display', sans-serif",
        'Montserrat': "'Montserrat', sans-serif",
        'Poppins': "'Poppins', sans-serif",
        'Roboto': "'Roboto', sans-serif",
        'Open Sans': "'Open Sans', sans-serif",
        'Playfair Display': "'Playfair Display', serif",
        'Lato': "'Lato', sans-serif",
      };
      const font = config.fontHeading || 'Poppins';
      root.style.setProperty('--font-heading', fontMap[font] || font);
    }
    
    // Font Body
    {
      const fontMap = {
        'Montserrat': "'Montserrat', sans-serif",
        'Poppins': "'Poppins', sans-serif",
        'Roboto': "'Roboto', sans-serif",
        'Open Sans': "'Open Sans', sans-serif",
        'Lato': "'Lato', sans-serif",
        'Inter': "'Inter', sans-serif",
        'Nunito': "'Nunito', sans-serif",
      };
      const font = config.fontBody || 'Poppins';
      root.style.setProperty('--font-body', fontMap[font] || font);
    }
    
    // Border Radius - affects buttons, badges AND containers proportionally
    if (config.borderRadius) {
      const radiusMap = {
        //                   button    badge   sm    md     lg     xl
        'sharp':          { button: '0px',    badge: '0px',    sm: '0px',  md: '0px',  lg: '0px',  xl: '0px'  },
        'slightly-rounded':{ button: '4px',   badge: '6px',    sm: '2px',  md: '4px',  lg: '6px',  xl: '8px'  },
        'rounded':         { button: '8px',   badge: '12px',   sm: '4px',  md: '8px',  lg: '12px', xl: '16px' },
        'very-rounded':    { button: '12px',  badge: '16px',   sm: '6px',  md: '12px', lg: '16px', xl: '20px' },
        'pill':            { button: '9999px',badge: '9999px', sm: '8px',  md: '14px', lg: '18px', xl: '24px' },
      };
      const radii = radiusMap[config.borderRadius];
      if (radii) {
        root.style.setProperty('--radius-button', radii.button);
        root.style.setProperty('--radius-badge', radii.badge);
        root.style.setProperty('--radius-container-sm', radii.sm);
        root.style.setProperty('--radius-container-md', radii.md);
        root.style.setProperty('--radius-container-lg', radii.lg);
        root.style.setProperty('--radius-container-xl', radii.xl);
      }
    }
    // Note: No cleanup function - CSS variables should persist across navigation
    // Removing them caused brand colors to reset to blue defaults on page transitions
  }, [config.primaryColor, config.secondaryColor, config.buttonTextColor, config.backgroundColor, config.fontHeading, config.fontBody, config.borderRadius]);

  // Favicon — update <link rel="icon"> when restaurant logoUrl is available.
  // Idempotent; runs after first config fetch and on any subsequent logoUrl change.
  // Falls back to the default /favicon.svg when logoUrl is missing/empty.
  useEffect(() => {
    if (!config.logoUrl || typeof config.logoUrl !== 'string') return;
    let link = document.querySelector("link[rel='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.removeAttribute('type'); // let browser sniff PNG/JPG/SVG
    link.href = config.logoUrl;
  }, [config.logoUrl]);

  // Helper: check boolean with default true
  const isOn = (key) => config[key] !== false;

  const value = {
    config,
    configLoading,
    fetchConfig,
    refreshConfig,
    // Landing Page
    showLogo: isOn('showLogo'),
    showWelcomeText: isOn('showWelcomeText'),
    showDescription: isOn('showDescription'),
    showSocialIcons: isOn('showSocialIcons'),
    showTableNumber: isOn('showTableNumber'),
    showPromotions: isOn('showPromotions'),
    showPoweredBy: isOn('showPoweredBy'),
    showCallWaiter: isOn('showCallWaiter'),
    showPayBill: isOn('showPayBill'),
    showLandingCallWaiter: isOn('showLandingCallWaiter'),
    showLandingPayBill: isOn('showLandingPayBill'),
    showEstimatedTimes: config.showEstimatedTimes === true,
    showAboutUs: isOn('showAboutUs'),
    showFooter: isOn('showFooter'),
    showLandingCustomerCapture: config.showLandingCustomerCapture === true,  // Default OFF
    showHamburgerMenu: isOn('showHamburgerMenu'),
    showLoginButton: isOn('showLoginButton'),      // Default ON
    // Menu Page
    showPromotionsOnMenu: isOn('showPromotionsOnMenu'),
    showCategories: isOn('showCategories'),
    showMenuFab: isOn('showMenuFab'),
    // Order Page
    showCustomerDetails: isOn('showCustomerDetails'),
    showCustomerName: isOn('showCustomerName'),
    showCustomerPhone: isOn('showCustomerPhone'),
    showCookingInstructions: isOn('showCookingInstructions'),
    showSpecialInstructions: isOn('showSpecialInstructions'),
    showPriceBreakdown: isOn('showPriceBreakdown'),
    showTableInfo: isOn('showTableInfo'),
    showLoyaltyPoints: isOn('showLoyaltyPoints'),
    showCouponCode: isOn('showCouponCode'),
    showWallet: isOn('showWallet'),
    // Order Status Page
    showFoodStatus: isOn('showFoodStatus'),
    showOrderStatusTracker: isOn('showOrderStatusTracker'),
    // Branding - Colors
    logoUrl: config.logoUrl,
    backgroundImageUrl: config.backgroundImageUrl,
    mobileBackgroundImageUrl: config.mobileBackgroundImageUrl,
    primaryColor: config.primaryColor,
    secondaryColor: config.secondaryColor,
    buttonTextColor: config.buttonTextColor,
    backgroundColor: config.backgroundColor,
    textColor: config.textColor,
    textSecondaryColor: config.textSecondaryColor,
    // Branding - Typography
    fontHeading: config.fontHeading,
    fontBody: config.fontBody,
    // Branding - Style
    borderRadius: config.borderRadius,
    // Branding - Text
    welcomeMessage: config.welcomeMessage,
    tagline: config.tagline,
    // Order Success Page (admin-configurable; UI falls back to defaults when null/empty)
    successTitle: config.successTitle,
    successMessage: config.successMessage,
    instagramUrl: config.instagramUrl,
    facebookUrl: config.facebookUrl,
    twitterUrl: config.twitterUrl,
    youtubeUrl: config.youtubeUrl,
    whatsappNumber: config.whatsappNumber,
    phone: config.phone,
    address: config.address,
    contactEmail: config.contactEmail,
    mapEmbedUrl: config.mapEmbedUrl,
    aboutUsContent: config.aboutUsContent,
    aboutUsImage: config.aboutUsImage,
    openingHours: config.openingHours,
    footerText: config.footerText,
    footerLinks: config.footerLinks || [],
    feedbackEnabled: config.feedbackEnabled === true,
    feedbackIntroText: config.feedbackIntroText,
    customPages: config.customPages || [],
    navMenuOrder: config.navMenuOrder || [],
    menuOrder: config.menuOrder || {},
    banners: (config.banners || []).filter(b => b.bannerEnabled !== false).sort((a, b) => (a.bannerOrder || 0) - (b.bannerOrder || 0)).slice(0, 5),
    // Extra Info Section
    showExtraInfo: config.showExtraInfo !== false,
    extraInfoItems: config.extraInfoItems || [],
    // Custom Text
    browseMenuButtonText: config.browseMenuButtonText || 'Browse Menu',
    // Customer Capture - Mandatory fields
    mandatoryCustomerName: config.mandatoryCustomerName === true,
    mandatoryCustomerPhone: config.mandatoryCustomerPhone === true,
    // OTP Configuration per order type (LEGACY — kept for admin UI back-compat)
    otpRequiredDineIn: config.otpRequiredDineIn === true,
    otpRequiredTakeaway: config.otpRequiredTakeaway === true,
    otpRequiredDineInWithTable: config.otpRequiredDineInWithTable === true,
    otpRequiredWalkIn: config.otpRequiredWalkIn === true,
    otpRequiredRoomOrders: config.otpRequiredRoomOrders === true,
    // Skip-OTP toggles (CR-2026-05-30-001 Item 1) — `=== true` so missing/false
    // resolves to "do not skip" (show password-setup, current behaviour).
    skipOtpDineIn: config.skipOtpDineIn === true,
    skipOtpTakeaway: config.skipOtpTakeaway === true,
    skipOtpDineInWithTable: config.skipOtpDineInWithTable === true,
    skipOtpWalkIn: config.skipOtpWalkIn === true,
    skipOtpRoomOrders: config.skipOtpRoomOrders === true,
    skipOtpDelivery: config.skipOtpDelivery === true,
    // Non-QR order access policy (CR-2026-05-30-002). Default true (enforced
    // only when admin explicitly sets false). `!== false` so missing / null /
    // undefined resolves to "allowed", preserving Day-1 behaviour.
    allowNonQrOrders: config.allowNonQrOrders !== false,
    // Restaurant Operating Shifts
    restaurantShifts: config.restaurantShifts || [{ start: '06:00', end: '03:00' }],
    // Restaurant Open master toggle
    restaurantOpen: config.restaurantOpen !== false,
    // CR-2026-08-06-001: Per-channel shifts — null = use global restaurantShifts fallback
    deliveryShifts: config.deliveryShifts ?? null,
    takeawayShifts: config.takeawayShifts ?? null,
    dineInShifts:   config.dineInShifts   ?? null,
    roomShifts:     config.roomShifts     ?? null,
    walkinShifts:   config.walkinShifts   ?? null,
    // Category & Item Timings
    categoryTimings: config.categoryTimings || {},
    itemTimings: config.itemTimings || {},
    // CR-2026-06-17-001 APP-4: Station timing overrides
    stationTimings: config.stationTimings || {},
    // CR-2026-06-17-001 APP-3: Channel overrides
    channelOverrides: config.channelOverrides || {},
    // Payment Options Configuration (FEAT-001)
    codEnabled: config.codEnabled === true,
    onlinePaymentDinein: config.onlinePaymentDinein !== false,
    onlinePaymentTakeaway: config.onlinePaymentTakeaway !== false,
    onlinePaymentDelivery: config.onlinePaymentDelivery !== false,
    payOnlineLabel: config.payOnlineLabel || 'Pay Online',
    payAtCounterLabel: config.payAtCounterLabel || 'Pay at Counter',
    // Powered By Configuration (DFA-004)
    poweredByText: config.poweredByText || 'Powered by',
    poweredByLogoUrl: config.poweredByLogoUrl !== undefined ? config.poweredByLogoUrl : '/assets/images/mygenie_logo.svg',
    // Notification Popups (FEAT-003)
    notificationPopups: config.notificationPopups || [],
  };

  return (
    <RestaurantConfigContext.Provider value={value}>
      {children}
    </RestaurantConfigContext.Provider>
  );
};

export const useRestaurantConfig = () => {
  const context = useContext(RestaurantConfigContext);
  if (!context) {
    throw new Error('useRestaurantConfig must be used within a RestaurantConfigProvider');
  }
  return context;
};

export default RestaurantConfigContext;
