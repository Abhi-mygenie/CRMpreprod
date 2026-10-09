/**
 * Channel-eligibility helpers for Scan & Order customer menu (CR A-1).
 *
 * Decides whether a Product API item is allowed for the active order channel,
 * using the per-item flags carried by the menu transformer (see CR D-1):
 *   - item.dinein   ('Yes' | 'No', default 'Yes')
 *   - item.takeaway ('Yes' | 'No', default 'Yes')
 *   - item.delivery ('Yes' | 'No', default 'Yes')
 *
 * CR-2026-06-17-001 APP-3: Admin channel overrides (category + item level).
 *   Priority cascade: item admin override > category admin override > POS flag.
 *
 * Channel mapping:
 *   - 'dinein'                       -> item.dinein
 *   - 'takeaway' or 'take_away'      -> item.takeaway
 *   - 'delivery'                     -> item.delivery
 *
 * Room flow note (per owner decision in PRODUCT_API_FIELD_MAPPING_AND_BUSINESS_LOGIC_AUDIT):
 *   Room QRs send orderType='dinein', so room scans share the dinein gate.
 *   No separate room flag exists in the API today.
 *
 * Permissive defaults — never accidentally hide items:
 *   - missing/null orderType        -> allow (early menu loads, edge cases)
 *   - missing channel flag on item  -> D-1 transformer already defaults to 'Yes',
 *                                      and we use `!== 'No'` so any non-'No'
 *                                      value (including null/undefined) allows.
 *
 * Out of scope for A-1 (handled in separate CRs):
 *   - is_disable / status / food_stock / live_web / time gates
 *   - PreviousOrderItems re-check in edit-order flow (deferred — owner decision)
 *   - Order placement payload, taxes, charges, KOT, payment, sockets, Firebase
 */

// CR-2026-06-17-001 APP-3: Map orderType to channel key
const getChannelKey = (orderType) => {
  switch (orderType) {
    case 'dinein': return 'dinein';
    case 'takeaway':
    case 'take_away': return 'takeaway';
    case 'delivery': return 'delivery';
    default: return null;
  }
};

/**
 * @param {object|null} item - menu item carrying dinein/takeaway/delivery flags
 * @param {string|null} orderType - 'dinein' | 'takeaway' | 'take_away' | 'delivery' | null
 * @param {object} [adminOverrides] - CR-2026-06-17-001 APP-3: admin channel overrides
 * @param {object} [adminOverrides.categoryOverride] - { dinein: bool, takeaway: bool, delivery: bool } or null
 * @param {object} [adminOverrides.itemOverride] - { dinein: bool, takeaway: bool, delivery: bool } or null
 * @returns {boolean} true = allowed for this channel; false = disallowed
 */
export const isItemAllowedForChannel = (item, orderType, adminOverrides) => {
  if (!item) return false;
  if (!orderType) return true;

  const channelKey = getChannelKey(orderType);
  if (!channelKey) return true;

  // CR-2026-06-17-001 APP-3: Check admin overrides first (item > category > POS)
  if (adminOverrides) {
    // Item-level override wins
    const itemOv = adminOverrides.itemOverride?.[channelKey];
    if (itemOv === true) return true;
    if (itemOv === false) return false;

    // Category-level override
    const catOv = adminOverrides.categoryOverride?.[channelKey];
    if (catOv === true) return true;
    if (catOv === false) return false;
  }

  // Fall back to POS flag
  switch (orderType) {
    case 'dinein':
      return item.dinein !== 'No';
    case 'takeaway':
    case 'take_away':
      return item.takeaway !== 'No';
    case 'delivery':
      return item.delivery !== 'No';
    default:
      return true;
  }
};

/**
 * Human-readable label for the active channel — used in toasts and confirm prompts.
 * @param {string|null} orderType
 * @returns {string}
 */
export const getChannelLabel = (orderType) => {
  switch (orderType) {
    case 'dinein':
      return 'Dine-in';
    case 'takeaway':
    case 'take_away':
      return 'Takeaway';
    case 'delivery':
      return 'Delivery';
    default:
      return 'this order type';
  }
};
