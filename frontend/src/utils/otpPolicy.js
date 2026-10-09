/**
 * otpPolicy — CR-2026-05-30-001 Item 1
 *
 * Resolves which admin-config flag governs OTP for the customer's current
 * order context, and whether the OTP/password-setup page should be shown.
 *
 * Design (Plan C — new flag names):
 *   - Flag namespace: `skipOtp*` (NEW — does NOT reuse the dead `otpRequired*`
 *     flags, because those have explicit `false` values persisted in production
 *     and reusing them would cause a Day-1 behaviour change).
 *   - Missing / null / undefined / false → show /password-setup (current behaviour)
 *   - Only an explicit boolean `true` skips the page.
 *
 * Used by `LandingPage.jsx` to gate the navigate('/password-setup', ...) call.
 *
 * Hard constraint: Restaurant 716 is IN-scope for Item 1 and honours these
 * flags like every other restaurant. (Items 2/3 of the CR carve 716 out
 * separately; do NOT carry that carve-out into Item 1.)
 */

import { hasAssignedTable } from './orderTypeHelpers';

/**
 * Resolve the admin-config flag name that governs OTP for the current order context.
 *
 * @param {object} ctx
 * @param {string|undefined} ctx.selectedMode         - 'dinein' | 'takeaway' | 'delivery' | ...
 * @param {string|undefined} ctx.scannedOrderType     - from QR (`type=order_type`)
 * @param {string|undefined} ctx.scannedRoomOrTable   - 'room' | 'table' | 'walkin'
 * @param {string|undefined} ctx.scannedTableId       - table_id from QR
 * @returns {string} one of the skipOtp* flag names
 */
export function pickOtpFlag({
  selectedMode,
  scannedOrderType,
  scannedRoomOrTable,
  scannedTableId,
} = {}) {
  if (scannedRoomOrTable === 'room') return 'skipOtpRoomOrders';
  if (scannedRoomOrTable === 'walkin') return 'skipOtpWalkIn';
  if (scannedOrderType === 'delivery' || selectedMode === 'delivery') return 'skipOtpDelivery';
  if (scannedOrderType === 'takeaway' || selectedMode === 'takeaway') return 'skipOtpTakeaway';
  if (
    scannedOrderType === 'dinein' &&
    hasAssignedTable(scannedTableId) &&
    scannedRoomOrTable === 'table'
  ) {
    return 'skipOtpDineInWithTable';
  }
  return 'skipOtpDineIn';
}

/**
 * Returns true if the password-setup / OTP page should be shown for this flag value.
 * Default = show (current behaviour). Only an explicit boolean `true` skips.
 *
 * @param {string} flagName - one of the skipOtp* keys from pickOtpFlag()
 * @param {object} config   - the restaurant config object (from RestaurantConfigContext)
 * @returns {boolean}
 */
export function shouldShowOtpPage(flagName, config) {
  if (!flagName) return true;
  return config?.[flagName] !== true;
}
