/**
 * Centralized Tax Calculation Utility (CA-004)
 * Single source of truth for GST/VAT tax breakdown.
 * 
 * Used by: ReviewOrder.jsx, orderService.ts
 */

/**
 * Calculate tax for a single item
 * @param {number} fullPrice - Item price including variations + addons
 * @param {number} quantity - Item quantity
 * @param {number} taxPercent - Tax percentage (e.g. 5 for 5%)
 * @param {string} taxType - 'GST' or 'VAT'
 * @param {boolean} isGstEnabled - Whether GST is enabled at restaurant level
 * @returns {{ gst: number, vat: number }}
 */
export const calculateItemTax = (fullPrice, quantity, taxPercent, taxType, isGstEnabled) => {
  const taxAmountPerUnit = parseFloat(((fullPrice * taxPercent) / 100).toFixed(2));
  const totalTax = taxAmountPerUnit * quantity;

  return {
    gst: (taxType === 'GST' && isGstEnabled) ? totalTax : 0,
    vat: (taxType === 'VAT') ? totalTax : 0,
  };
};

/**
 * Calculate full tax breakdown from an array of normalized items
 * 
 * @param {Array<{ fullPrice: number, quantity: number, taxPercent: number, taxType: string, isCancelled: boolean }>} items
 * @param {boolean} isGstEnabled - Whether GST is enabled at restaurant level
 * @returns {{ cgst: number, sgst: number, totalGst: number, vat: number, totalTax: number }}
 */
export const calculateTaxBreakdown = (items, isGstEnabled) => {
  let totalGst = 0;
  let totalVat = 0;

  items.forEach(({ fullPrice, quantity, taxPercent, taxType, isCancelled }) => {
    if (isCancelled) return;

    const { gst, vat } = calculateItemTax(fullPrice, quantity, taxPercent, taxType, isGstEnabled);
    totalGst += gst;
    totalVat += vat;
  });

  totalGst = parseFloat(totalGst.toFixed(2));
  totalVat = parseFloat(totalVat.toFixed(2));

  const cgst = parseFloat((totalGst / 2).toFixed(2));
  const sgst = parseFloat((totalGst / 2).toFixed(2));
  const totalTax = parseFloat((totalGst + totalVat).toFixed(2));

  return { cgst, sgst, totalGst, vat: totalVat, totalTax };
};
