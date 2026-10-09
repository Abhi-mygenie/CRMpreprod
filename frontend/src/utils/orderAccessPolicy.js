/**
 * CR-2026-05-30-002 — Non-QR order access policy.
 *
 * Single source of truth for deciding whether a customer's order attempt
 * should be blocked due to missing QR-scan context.
 *
 * Day-1 behaviour: when `allowNonQrOrders` is missing / true / null /
 * undefined, this ALWAYS returns { block: false }. No restaurant is affected
 * until an admin explicitly flips the flag OFF.
 *
 * Hard constraints honoured here:
 *  - HC1: Restaurant 716 is never blocked (CR-level carve-out).
 *  - HC4: Default behaviour preserved (flag defaults to "allowed").
 *  - HC5: isEditMode bypasses all blocks.
 *  - HC6: Takeaway / delivery bypass all blocks.
 *  - HC7: `walkin` QR is a valid scan; not blocked.
 */

const TAKEAWAY_OR_DELIVERY = new Set(['takeaway', 'take_away', 'delivery']);
const VALID_QR_SCAN_TYPES = new Set(['table', 'room', 'walkin']);

/**
 * @param {Object} ctx - runtime context
 * @param {string|number|null} ctx.restaurantId
 * @param {boolean} [ctx.isScanned]            - from useScannedTable()
 * @param {string|null} [ctx.scannedTableId]
 * @param {string|null} [ctx.scannedRoomOrTable] - 'table' | 'room' | 'walkin' | null
 * @param {string|null} [ctx.scannedOrderType]   - 'dinein' | 'takeaway' | 'delivery' | null
 * @param {string|null} [ctx.selectedMode]       - landing-page toggle value
 * @param {boolean} [ctx.isEditMode]
 *
 * @param {Object} config - restaurant config (from RestaurantConfigContext)
 * @param {boolean} [config.allowNonQrOrders]
 *
 * @returns {{ block: boolean, reason: string }}
 */
export const shouldBlockNonQrOrder = (ctx, config) => {
  // HC4: default = allowed. Only `=== false` enables enforcement.
  if (!config || config.allowNonQrOrders !== false) {
    return { block: false, reason: 'policy-disabled' };
  }

  // HC1: 716 carve-out.
  if (String(ctx?.restaurantId) === '716') {
    return { block: false, reason: 'rid-716-carveout' };
  }

  // HC5: edit-mode bypass.
  if (ctx?.isEditMode === true) {
    return { block: false, reason: 'edit-mode' };
  }

  // HC6: takeaway / delivery never blocked.
  if (
    TAKEAWAY_OR_DELIVERY.has(ctx?.selectedMode) ||
    TAKEAWAY_OR_DELIVERY.has(ctx?.scannedOrderType)
  ) {
    return { block: false, reason: 'non-dinein-mode' };
  }

  // HC7 + main rule. "Non-QR" = neither a tableId nor a recognised scan type.
  const hasScannedTableId = !!ctx?.scannedTableId;
  const hasValidScanType = VALID_QR_SCAN_TYPES.has(ctx?.scannedRoomOrTable);
  const isNonQr = !hasScannedTableId && !hasValidScanType;

  return isNonQr
    ? { block: true, reason: 'non-qr-dinein' }
    : { block: false, reason: 'valid-qr' };
};

/**
 * Build the telemetry payload (used by the diagnostics POST).
 * Kept here so the policy module owns the shape of the diagnostic record.
 */
// BUG-2026-10-06-001: payload carries the policy decision so allow-path events
// are distinguishable from blocks. `policy` is optional for back-compat.
export const buildNonQrBlockPayload = (ctx, checkpoint, policy) => ({
  restaurant_id: String(ctx?.restaurantId || ''),
  checkpoint, // 'landing' | 'add_to_cart' | 'place_order'
  scanned_room_or_table: ctx?.scannedRoomOrTable || null,
  final_table_id: ctx?.scannedTableId ? String(ctx.scannedTableId) : '0',
  is_edit_mode: ctx?.isEditMode === true,
  is_authenticated: ctx?.isAuthenticated === true,
  decision: policy?.reason ?? null,
  allowed: policy ? policy.block === false : false,
});
