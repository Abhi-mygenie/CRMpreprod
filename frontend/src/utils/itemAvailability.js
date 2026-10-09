/**
 * Item Availability Utility Functions
 * Pure functions for checking item availability based on live_web and time ranges
 */

/**
 * Convert time string (HH:MM:SS) to seconds since midnight
 * @param {string} timeStr - Time in format "HH:MM:SS" (e.g., "12:00:00")
 * @returns {number} Seconds since midnight (0-86399)
 * @example
 * timeToSeconds("12:00:00") → 43200
 * timeToSeconds("23:59:59") → 86399
 * timeToSeconds("00:00:00") → 0
 */
export const timeToSeconds = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') {
    return null;
  }

  const parts = timeStr.split(':');
  if (parts.length !== 3) {
    return null;
  }

  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  const seconds = parseInt(parts[2], 10);

  // Validate ranges
  if (
    isNaN(hours) || isNaN(minutes) || isNaN(seconds) ||
    hours < 0 || hours > 23 ||
    minutes < 0 || minutes > 59 ||
    seconds < 0 || seconds > 59
  ) {
    return null;
  }

  return (hours * 3600) + (minutes * 60) + seconds;
};

/**
 * Check if an item is available based on live_web, admin timings, and POS time range
 * 
 * Cascade:
 * 1. live_web !== 'Y' → UNAVAILABLE
 * 2. Category has admin timing? → check it
 * 3. Item has admin timing? → use it. Else use POS times. Null POS = 24hr available.
 * 
 * @param {Object} item - Menu item object
 * @param {number} currentTimeInSeconds - Current time in seconds since midnight
 * @param {Object} opts - Optional admin timing overrides
 * @param {Object|null} opts.categoryTiming - { start: "HH:MM", end: "HH:MM" } or null
 * @param {Object|null} opts.itemTiming - { start: "HH:MM", end: "HH:MM" } or null
 * @returns {boolean} true if item is available
 */
export const isItemAvailable = (item, currentTimeInSeconds, opts = {}) => {
  // STEP 1: Check live_web — POS kill switch
  if (!item.live_web || item.live_web !== 'Y') {
    return false;
  }

  // STEP 2: Category admin timing check
  if (opts.categoryTiming) {
    if (!isWithinTimeRange(opts.categoryTiming.start, opts.categoryTiming.end, currentTimeInSeconds)) {
      return false;
    }
  }

  // STEP 3: Item timing — admin override takes priority, then POS, then 24hr
  if (opts.itemTiming) {
    return isWithinTimeRange(opts.itemTiming.start, opts.itemTiming.end, currentTimeInSeconds);
  }

  // No admin override — use POS times
  if (!item.web_available_time_starts || !item.web_available_time_ends) {
    // Null POS times = 24hr available
    return true;
  }

  // POS times exist — check them
  const startSeconds = timeToSeconds(item.web_available_time_starts);
  const endSeconds = timeToSeconds(item.web_available_time_ends);

  if (startSeconds === null || endSeconds === null) {
    return true; // Malformed POS times treated as 24hr
  }

  if (startSeconds === endSeconds) {
    return true; // start === end means always available
  }

  if (startSeconds < endSeconds) {
    return currentTimeInSeconds >= startSeconds && currentTimeInSeconds <= endSeconds;
  } else {
    return currentTimeInSeconds >= startSeconds || currentTimeInSeconds <= endSeconds;
  }
};

/**
 * Check if current time is within a HH:MM time range
 * Works with both HH:MM and HH:MM:SS formats
 * @param {string} start - Start time
 * @param {string} end - End time
 * @param {number} currentTimeInSeconds - Current time in seconds since midnight
 * @returns {boolean}
 */
const isWithinTimeRange = (start, end, currentTimeInSeconds) => {
  if (!start || !end) return true; // No timing = always available

  const startSec = parseTimeToSeconds(start);
  const endSec = parseTimeToSeconds(end);

  if (startSec === null || endSec === null) return true;
  if (startSec === endSec) return true;

  if (startSec < endSec) {
    return currentTimeInSeconds >= startSec && currentTimeInSeconds <= endSec;
  } else {
    return currentTimeInSeconds >= startSec || currentTimeInSeconds <= endSec;
  }
};

/**
 * Parse HH:MM or HH:MM:SS to seconds since midnight
 */
const parseTimeToSeconds = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const parts = timeStr.split(':').map(Number);
  if (parts.length < 2 || parts.some(isNaN)) return null;
  const [h, m, s = 0] = parts;
  return (h * 3600) + (m * 60) + s;
};

/**
 * Check if current time falls within a single shift
 * @param {string} start - Start time "HH:MM"
 * @param {string} end - End time "HH:MM"
 * @param {number} currentTimeInMinutes - Current time in minutes since midnight
 * @returns {boolean}
 */
const isWithinShift = (start, end, currentTimeInMinutes) => {
  if (!start || !end) return false;

  const [openHours, openMinutes] = start.split(':').map(Number);
  const openingTimeInMinutes = (openHours * 60) + (openMinutes || 0);

  const [closeHours, closeMinutes] = end.split(':').map(Number);
  const closingTimeInMinutes = (closeHours * 60) + (closeMinutes || 0);

  if (closingTimeInMinutes < openingTimeInMinutes) {
    // Overnight shift (e.g., 20:00 → 01:00)
    return currentTimeInMinutes >= openingTimeInMinutes || currentTimeInMinutes < closingTimeInMinutes;
  } else {
    // Same-day shift (e.g., 07:00 → 11:00)
    return currentTimeInMinutes >= openingTimeInMinutes && currentTimeInMinutes < closingTimeInMinutes;
  }
};

/**
 * Check if restaurant is currently open based on shifts
 * Supports multiple shifts (up to 4). Falls back to legacy single open/close.
 * @param {Array|null} shifts - Array of { start, end } objects, or null/undefined
 * @param {string} openingTime - Legacy single opening time (fallback)
 * @param {string} closingTime - Legacy single closing time (fallback)
 * @returns {boolean} True if restaurant is open (current time within any shift)
 */
export const isRestaurantOpen = (shifts, openingTime, closingTime) => {
  const now = new Date();
  const currentTimeInMinutes = (now.getHours() * 60) + now.getMinutes();

  // Use shifts array if available
  if (Array.isArray(shifts) && shifts.length > 0) {
    return shifts.some(shift => isWithinShift(shift.start, shift.end, currentTimeInMinutes));
  }

  // Legacy fallback: single opening/closing time
  if (!openingTime || !closingTime) return true;
  return isWithinShift(openingTime, closingTime, currentTimeInMinutes);
};

// CR-2026-08-06-001: Per-channel time control helpers

const CHANNEL_SHIFT_KEY = {
  delivery: 'deliveryShifts',
  takeaway: 'takeawayShifts',
  dinein:   'dineInShifts',
  room:     'roomShifts',
  walkin:   'walkinShifts',
};

/**
 * Check if a specific order channel is currently open.
 * Priority: restaurantOpen master toggle → channel shifts → global restaurantShifts → true (24/7).
 * @param {string} channel - 'delivery'|'takeaway'|'dinein'|'room'|'walkin'
 * @param {object} config  - from useRestaurantConfig()
 * @returns {boolean}
 */
export const isChannelOpen = (channel, config) => {
  if (!config) return true;
  // Master toggle — if restaurant is closed, all channels are closed
  if (config.restaurantOpen === false) return false;
  const key = CHANNEL_SHIFT_KEY[channel];
  const channelShifts = key ? config[key] : null;
  // Channel-specific shifts set → use them
  if (Array.isArray(channelShifts) && channelShifts.length > 0) {
    return isRestaurantOpen(channelShifts);
  }
  // Fallback to global restaurantShifts
  return isRestaurantOpen(config.restaurantShifts);
};

/**
 * Get the next opening time string for a channel ("11:00 AM") or null if not configured.
 * @param {string} channel
 * @param {object} config
 * @returns {string|null}
 */
export const getChannelNextOpenTime = (channel, config) => {
  if (!config) return null;
  const key = CHANNEL_SHIFT_KEY[channel];
  const channelShifts = key ? config[key] : null;
  const shifts = (Array.isArray(channelShifts) && channelShifts.length > 0)
    ? channelShifts
    : config.restaurantShifts;
  if (!Array.isArray(shifts) || shifts.length === 0) return null;
  const now = new Date();
  const currentMins = now.getHours() * 60 + now.getMinutes();
  // Find the next shift start after current time
  for (const shift of shifts) {
    if (!shift.start) continue;
    const [h, m] = shift.start.split(':').map(Number);
    const startMins = h * 60 + (m || 0);
    if (startMins > currentMins) {
      const suffix = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      const mm = String(m || 0).padStart(2, '0');
      return `${h12}:${mm} ${suffix}`;
    }
  }
  // No shift starts later today — return first shift of next day
  const first = shifts[0];
  if (!first?.start) return null;
  const [h, m] = first.start.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  const mm = String(m || 0).padStart(2, '0');
  return `${h12}:${mm} ${suffix}`;
};
