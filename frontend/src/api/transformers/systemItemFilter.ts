/**
 * System-item filter — single source of truth for hiding POS-internal
 * pseudo-items from customer-facing UI.
 *
 * Currently filters: "Check In" (hotel room check-in line item).
 *
 * Backend already excludes these from order_amount / order_sub_total_amount,
 * so this filter only affects:
 *   • OrderSuccess "Items Ordered (n)"
 *   • ReviewOrder "Previously Ordered" (PreviousOrderItems)
 *   • CartBar previousItemsCount badge
 *   • billSummary.itemTotal (auto-aligns with backend subtotal)
 *
 * Name match is exact-after-normalisation (case/whitespace/hyphen/underscore).
 * Substrings stay safe — "Check Inside" → "checkinside" ≠ "checkin".
 */

interface MaybeFoodDetails {
  food_details?: { name?: string | null } | null;
}

const normalize = (raw: unknown): string =>
  String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[\s\-_]+/g, '');

/** True when the detail row is the POS "Check In" pseudo-item. */
export const isCheckInSystemItem = (detail: MaybeFoodDetails | null | undefined): boolean => {
  if (!detail) return false;
  return normalize(detail.food_details?.name) === 'checkin';
};

/** Returns the same array with system items removed (purely a display filter). */
export const filterSystemItems = <T extends MaybeFoodDetails>(details: T[] | undefined | null): T[] =>
  (details || []).filter((d) => !isCheckInSystemItem(d));
