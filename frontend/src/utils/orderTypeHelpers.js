/**
 * Order Type Helpers
 * Single source of truth for order type and table requirement checks.
 * 
 * 5 scenarios:
 * - Table QR:    type=table, orderType=dinein, tableId=X → table auto-filled
 * - Room QR:     type=room,  orderType=dinein, tableId=X → room auto-filled
 * - Walk-in QR:  type=walkin, orderType=dinein/takeaway/delivery, no tableId → no table
 * - Walk-in Menu: type=walkin, orderType=dinein, no tableId, foodFor=X → no table
 * - Direct URL:  no params → no table
 * 
 * KEY RULE: Table is required ONLY when tableId is present in the URL.
 */

/**
 * Check if order type is dine-in or room context (seated customer).
 * Used for: Call Waiter, Pay Bill, table status polling.
 * Returns true for null/undefined (backward compat — old QR codes without orderType).
 * @param {string|null|undefined} orderType
 * @returns {boolean}
 */
export const isDineInOrRoom = (orderType) => {
  return !orderType || orderType === 'dinein' || orderType === 'room';
};

/**
 * Check if order type is takeaway or delivery
 * @param {string|null|undefined} orderType
 * @returns {boolean}
 */
export const isTakeawayOrDelivery = (orderType) => {
  return orderType === 'takeaway' || orderType === 'delivery' || orderType === 'take_away';
};

/**
 * Check if a table/room was assigned via QR scan.
 * KEY RULE: Table is required ONLY when tableId is present in URL.
 * Walk-in dine-in, takeaway, delivery — all have no tableId → no table needed.
 * @param {string|null|undefined} scannedTableId - tableId from useScannedTable hook
 * @returns {boolean}
 */
export const hasAssignedTable = (scannedTableId) => {
  return !!scannedTableId && String(scannedTableId) !== '0';
};

/**
 * Check if table status polling is needed.
 * Only when a specific table was scanned (Table/Room QR) — not for walk-in.
 * @param {string|null|undefined} scannedTableId
 * @returns {boolean}
 */
export const needsTableCheck = (scannedTableId) => {
  return hasAssignedTable(scannedTableId);
};

/**
 * Check if Call Waiter / Pay Bill actions are relevant.
 * Relevant for dine-in and room service (seated context), including walk-in dine-in.
 * NOT relevant for takeaway/delivery.
 * @param {string|null|undefined} orderType
 * @returns {boolean}
 */
export const showsDineInActions = (orderType) => {
  return isDineInOrRoom(orderType);
};

/**
 * Check if the scanned type is a walk-in (no assigned table/room)
 * @param {string|null|undefined} roomOrTable - type param from QR
 * @returns {boolean}
 */
export const isWalkin = (roomOrTable) => {
  return roomOrTable === 'walkin';
};
