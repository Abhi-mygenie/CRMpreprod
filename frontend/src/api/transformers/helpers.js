/**
 * Transformer Helpers - JavaScript re-export for JSX component compatibility
 * These functions are centralized here as SINGLE SOURCE OF TRUTH
 */

// ============================================
// RECEIVE Helpers (API Response → Display)
// ============================================

/**
 * Get variation labels from transformed variations array
 * @param {Array} variations - Transformed variations array with { name, type, values: [{ label, price }] }
 * @returns {string} Comma-separated labels
 */
export const getVariationLabels = (variations) => {
  if (!variations || variations.length === 0) return '';
  
  return variations
    .map(v => {
      // Handle transformer format: { values: [{ label, price }] }
      if (v.values && Array.isArray(v.values)) {
        return v.values.map(val => val.label || '').filter(Boolean).join(', ');
      }
      // Handle raw API format: { values: { label: [...] } }
      if (v.values && v.values.label) {
        const labels = Array.isArray(v.values.label) ? v.values.label : [v.values.label];
        return labels.filter(Boolean).join(', ');
      }
      // Fallback
      return v.label || v.name || '';
    })
    .filter(Boolean)
    .join(', ');
};

/**
 * Get addon labels from transformed addons array
 * @param {Array} addons - Transformed addons array with { id, name, price, quantity }
 * @returns {string} Comma-separated labels with quantities
 */
export const getAddonLabels = (addons) => {
  if (!addons || addons.length === 0) return '';
  
  return addons
    .map(a => `${a.name || 'Addon'} x${a.quantity || 1}`)
    .join(', ');
};

/**
 * Calculate total price of variations
 * @param {Array} variations - Transformed variations array
 * @returns {number} Total price of all selected variations
 */
export const calculateVariationsTotal = (variations) => {
  if (!variations || variations.length === 0) return 0;
  
  return variations.reduce((total, variation) => {
    if (variation.values && Array.isArray(variation.values)) {
      const valuesTotal = variation.values.reduce((sum, val) => 
        sum + (parseFloat(val.price) || 0), 0);
      return total + valuesTotal;
    }
    return total;
  }, 0);
};

/**
 * Calculate total price of addons
 * @param {Array} addons - Transformed addons array
 * @returns {number} Total price of all addons (price * quantity)
 */
export const calculateAddonsTotal = (addons) => {
  if (!addons || addons.length === 0) return 0;
  
  return addons.reduce((total, addon) => 
    total + ((parseFloat(addon.price) || 0) * (addon.quantity || 1)), 0);
};

// ============================================
// SEND Helpers (Cart → API Request)
// ============================================

/**
 * Transform cart item variations to API format
 * Groups variations by their parent group name
 * @param {Object} cartItem - Cart item with variations and item.variations
 * @returns {Array} API format: [{ name: "SIZE", values: { label: ["60ML"] } }]
 */
export const transformVariationsForApi = (cartItem) => {
  if (!cartItem.variations || cartItem.variations.length === 0) {
    return [];
  }

  const variationGroups = {};

  // Try to match variations to their group names from original item
  if (cartItem.item?.variations && cartItem.item.variations.length > 0) {
    cartItem.item.variations.forEach((originalVariation) => {
      const variationName = originalVariation.name || 'CHOICE OF';
      
      const selectedValues = cartItem.variations.filter((v) => 
        originalVariation.values?.some((origVal) => origVal.label === v.label)
      );

      if (selectedValues.length > 0) {
        if (!variationGroups[variationName]) {
          variationGroups[variationName] = [];
        }
        selectedValues.forEach((selected) => {
          variationGroups[variationName].push(selected.label);
        });
      }
    });
  } else {
    // Fallback: group all variations under generic name
    const allLabels = cartItem.variations.map((v) => v.label);
    if (allLabels.length > 0) {
      variationGroups['CHOICE OF'] = allLabels;
    }
  }

  return Object.entries(variationGroups).map(([name, labels]) => ({
    name,
    values: { label: labels }
  }));
};

/**
 * Transform cart item add-ons to API format
 * Splits into three parallel arrays as API expects
 * @param {Object} cartItem - Cart item with add_ons array
 * @returns {Object} { add_on_ids: [], add_ons: [], add_on_qtys: [] }
 */
export const transformAddonsForApi = (cartItem) => {
  if (!cartItem.add_ons || cartItem.add_ons.length === 0) {
    return {
      add_on_ids: [],
      add_ons: [],
      add_on_qtys: []
    };
  }

  const addOns = cartItem.add_ons;
  return {
    add_on_ids: addOns.map((a) => a.id),
    add_ons: addOns.map((a) => ({
      id: a.id,
      name: a.name,
      price: typeof a.price === 'string' ? parseFloat(a.price) : a.price,
    })),
    add_on_qtys: addOns.map((a) => a.quantity || 1)
  };
};

/**
 * Calculate full item price including variations and addons
 * @param {Object} cartItem - Cart item with price, variations, add_ons
 * @returns {number} Total price for single unit
 */
export const calculateCartItemPrice = (cartItem) => {
  const basePrice = parseFloat(cartItem.price || cartItem.item?.price) || 0;
  
  const variationsTotal = (cartItem.variations || []).reduce((sum, v) => 
    sum + (parseFloat(v.optionPrice || v.price) || 0), 0
  );
  
  const addonsTotal = (cartItem.add_ons || []).reduce((sum, a) => 
    sum + ((parseFloat(a.price) || 0) * (a.quantity || 1)), 0
  );
  
  return basePrice + variationsTotal + addonsTotal;
};

/**
 * Transform full cart item to API format
 * @param {Object} cartItem - Cart item from CartContext
 * @returns {Object} API cart item format
 */
export const transformCartItemForApi = (cartItem, gstEnabled = true) => {
  const variations = transformVariationsForApi(cartItem);
  const { add_on_ids, add_ons, add_on_qtys } = transformAddonsForApi(cartItem);
  const unitPrice = calculateCartItemPrice(cartItem);
  const itemPrice = unitPrice * (cartItem.quantity || 1);

  // Variations and add-ons totals (mirrors transformCartItemForMultiMenu lines 267-272)
  const variationsTotal = (cartItem.variations || []).reduce((sum, v) =>
    sum + (parseFloat(v.optionPrice || v.price) || 0), 0
  );
  const addonsTotal = (cartItem.add_ons || []).reduce((sum, a) =>
    sum + ((parseFloat(a.price) || 0) * (a.quantity || 1)), 0
  );

  // Per-item tax calculation — strict numeric parity with transformCartItemForMultiMenu (lines 274-283).
  // In transformCartItemForMultiMenu the variable named `itemPrice` is the UNIT price (no qty multiplication);
  // here the equivalent is `unitPrice`. Formula: (unitPrice * taxPercent / 100) * qty.
  const taxPercent = parseFloat(cartItem.item?.tax) || 0;
  const taxType = cartItem.item?.tax_type || 'GST';
  const taxAmountPerUnit = parseFloat(((unitPrice * taxPercent) / 100).toFixed(2));
  const taxAmount = taxAmountPerUnit * (cartItem.quantity || 1);
  const gstTaxAmount = (taxType === 'GST' && gstEnabled) ? taxAmount : 0;
  const vatTaxAmount = (taxType === 'VAT') ? taxAmount : 0;
  const effectiveTaxAmount = gstTaxAmount + vatTaxAmount;

  return {
    food_id: String(cartItem.id || cartItem.itemId),
    food_level_notes: cartItem.foodLevelNotes || cartItem.cookingInstructions || '',
    station: cartItem.station || cartItem.item?.station || 'KDS',
    item_campaign_id: cartItem.item_campaign_id || null,
    price: itemPrice.toFixed(2),
    variant: '',
    variations,
    quantity: cartItem.quantity || 1,
    add_on_ids,
    add_ons,
    add_on_qtys,
    // Multi-menu parity additions (478 normal/edit contract alignment with 716)
    total_variation_price: parseFloat(variationsTotal * (cartItem.quantity || 1)),
    total_add_on_price: parseFloat(addonsTotal * (cartItem.quantity || 1)),
    gst_tax_amount: gstTaxAmount,
    vat_tax_amount: vatTaxAmount,
    tax_amount: effectiveTaxAmount,
    discount_on_food: 0,
  };
};

/**
 * Transform array of cart items to API format
 * @param {Array} cartItems - Array of cart items from CartContext
 * @returns {Array} Array of API-formatted cart items
 */
export const transformCartItemsForApi = (cartItems, gstEnabled = true) => {
  return cartItems.map(item => transformCartItemForApi(item, gstEnabled));
};


// ============================================
// Phone Utility Functions
// ============================================

/**
 * Extract phone number without country code
 * @param {string} phoneNumber - Full phone number with or without country code
 * @returns {string} Phone number without country code
 */
export const extractPhoneNumber = (phoneNumber) => {
  if (!phoneNumber || phoneNumber.trim() === '') {
    return '';
  }

  let custPhone = phoneNumber;
  if (phoneNumber.startsWith('+91')) {
    custPhone = phoneNumber.replace('+91', '');
  } else if (phoneNumber.startsWith('+')) {
    // Remove any country code
    custPhone = phoneNumber.replace(/^\+\d+/, '');
  }
  return custPhone;
};

/**
 * Get dial code from phone number
 * @param {string} phoneNumber - Full phone number
 * @returns {string} Dial code (default: '+91')
 */
export const getDialCode = (phoneNumber) => {
  if (!phoneNumber || phoneNumber.trim() === '') {
    return '+91';
  }

  if (phoneNumber.startsWith('+91')) {
    return '+91';
  }
  return phoneNumber.split(' ')[0] || '+91';
};

// ============================================
// Multi-Menu SEND Helpers (Cart → API for Multi-Menu)
// ============================================

/**
 * Transform cart item for multi-menu API format
 * Includes tax calculations per item (GST/VAT)
 * @param {Object} cartItem - Cart item from CartContext
 * @param {boolean} gstEnabled - Whether GST is enabled at restaurant level
 * @returns {Object} API-formatted cart item for multi-menu
 */
export const transformCartItemForMultiMenu = (cartItem, gstEnabled = true) => {
  const variations = transformVariationsForApi(cartItem);
  const { add_on_ids, add_ons, add_on_qtys } = transformAddonsForApi(cartItem);
  const itemPrice = calculateCartItemPrice(cartItem);
  
  // Calculate variations and addons totals
  const variationsTotal = (cartItem.variations || []).reduce((sum, v) => 
    sum + (parseFloat(v.optionPrice || v.price) || 0), 0
  );
  const addonsTotal = (cartItem.add_ons || []).reduce((sum, a) => 
    sum + ((parseFloat(a.price) || 0) * (a.quantity || 1)), 0
  );

  // Tax calculation per item
  const taxPercent = parseFloat(cartItem.item?.tax) || 0;
  const taxType = cartItem.item?.tax_type || 'GST';
  const taxAmountPerUnit = parseFloat(((itemPrice * taxPercent) / 100).toFixed(2));
  const taxAmount = taxAmountPerUnit * (cartItem.quantity || 1);
  
  // Only calculate GST if enabled at restaurant level
  const gstTaxAmount = (taxType === 'GST' && gstEnabled) ? taxAmount : 0;
  const vatTaxAmount = taxType === 'VAT' ? taxAmount : 0;
  const effectiveTaxAmount = gstTaxAmount + vatTaxAmount;

  return {
    food_id: parseInt(cartItem.id || cartItem.itemId) || 0,
    food_level_notes: cartItem.foodLevelNotes || cartItem.cookingInstructions || '',
    station: cartItem.item?.station || cartItem.station || 'OTHER',
    item_campaign_id: null,
    price: itemPrice.toFixed(2),
    variant: '',
    variations,
    quantity: cartItem.quantity || 1,
    add_on_ids,
    add_ons,
    add_on_qtys,
    total_variation_price: parseFloat(variationsTotal * (cartItem.quantity || 1)),
    total_add_on_price: parseFloat(addonsTotal * (cartItem.quantity || 1)),
    gst_tax_amount: gstTaxAmount,
    vat_tax_amount: vatTaxAmount,
    tax_amount: effectiveTaxAmount,
    discount_on_food: 0
  };
};

/**
 * Transform array of cart items to multi-menu API format
 * @param {Array} cartItems - Array of cart items from CartContext
 * @param {boolean} gstEnabled - Whether GST is enabled at restaurant level
 * @returns {Array} Array of API-formatted cart items for multi-menu
 */
export const transformCartItemsForMultiMenu = (cartItems, gstEnabled = true) => {
  return cartItems.map(item => transformCartItemForMultiMenu(item, gstEnabled));
};

/**
 * Allocate total service charge per cart item proportionally to each item's line value.
 * Last item gets the rounding remainder so Σ(item.service_charge) === totalServiceCharge.
 * Mutates `cart` in place AND returns it.
 *
 * Mathematically equivalent to applying SC at the aggregate (handover R3/R4): SC is a flat
 * percentage of the cart, so per-item SC = (item_full_price / itemTotal) × totalSC and the sum
 * equals totalSC. Per-item field is sent because backend stores SC at the item level.
 *
 * @param {Array} cart - Cart array (each item must have { price, quantity })
 * @param {number} totalServiceCharge - Aggregate SC amount (computed in ReviewOrder)
 * @param {number} itemTotal - Sum of item line values (also from ReviewOrder)
 * @returns {Array} The same cart, mutated with `service_charge` per item
 */
export const allocateServiceChargePerItem = (cart, totalServiceCharge, itemTotal) => {
  if (!Array.isArray(cart) || cart.length === 0) return cart;

  const totalSc = parseFloat(totalServiceCharge) || 0;
  const total = parseFloat(itemTotal) || 0;

  if (totalSc <= 0 || total <= 0) {
    cart.forEach((item) => { item.service_charge = 0; });
    return cart;
  }

  let allocated = 0;
  const lastIdx = cart.length - 1;
  cart.forEach((item, idx) => {
    if (idx === lastIdx) {
      // Last item gets the remainder to avoid rounding drift
      item.service_charge = parseFloat((totalSc - allocated).toFixed(2));
    } else {
      const unitPrice = parseFloat(item.price || 0);
      const qty = parseFloat(item.quantity || 1);
      const lineValue = unitPrice * qty;
      const sc = parseFloat(((lineValue / total) * totalSc).toFixed(2));
      item.service_charge = sc;
      allocated += sc;
    }
  });
  return cart;
};

/**
 * Build complete payload for multi-menu order
 * @param {Object} orderData - Order data from ReviewOrder
 * @param {boolean} gstEnabled - Whether GST is enabled
 * @returns {Object} Complete API payload for multi-menu order
 */
export const buildMultiMenuPayload = (orderData, gstEnabled = true) => {
  const {
    cartItems,
    customerName,
    customerPhone,
    tableNumber,
    tableId,
    specialInstructions,
    orderNote,
    couponCode,
    restaurantId,
    subtotal,
    totalToPay,
    pointsRedeemed = 0,
    pointsDiscount = 0,
    deliveryAddress = null,
    deliveryCharge = 0,
    // SC fields (SERVICE_CHARGE_MAPPING CR)
    serviceCharge = 0,
    gstOnServiceCharge = 0,
    itemTotal = 0,
    finalSubtotal,
    // ROUND_UP_PAYLOAD_GAP fix — restaurant round-off amount (roundedTotal - totalToPay); 0 when disabled
    roundUpAmount = 0,
  } = orderData;

  const cart = transformCartItemsForMultiMenu(cartItems, gstEnabled);
  // Allocate service charge per item (SERVICE_CHARGE_MAPPING CR)
  allocateServiceChargePerItem(cart, serviceCharge, itemTotal);
  const custPhone = extractPhoneNumber(customerPhone || '');
  const dialCode = getDialCode(customerPhone || '');

  // Root level tax amounts (sum from all items + SC-GST at root, NOT inside cart loop)
  const itemGstTaxAmount = parseFloat(
    cart.reduce((sum, item) => sum + (item.gst_tax_amount || 0), 0).toFixed(2)
  );
  const itemVatTaxAmount = parseFloat(
    cart.reduce((sum, item) => sum + (item.vat_tax_amount || 0), 0).toFixed(2)
  );
  const gstOnSc = parseFloat((gstOnServiceCharge || 0).toFixed(2));
  const totalGstTaxAmount = parseFloat((itemGstTaxAmount + gstOnSc).toFixed(2));
  const totalVatTaxAmount = itemVatTaxAmount;
  const rootTaxAmount = parseFloat((totalGstTaxAmount + totalVatTaxAmount).toFixed(2));

  return {
    data: {
      cart,
      coupon_discount_amount: 0,
      coupon_discount_title: null,
      order_amount: parseFloat((totalToPay || 0).toFixed(2)),
      dial_code: dialCode,
      otp: '',
      address_id: deliveryAddress?.id || deliveryAddress?.pos_address_id || '',
      order_type: orderData.orderType || 'dinein',
      payment_method: 'cash_on_delivery',
      payment_id: '',
      fcm_token: '',
      order_note: specialInstructions || orderNote || '',
      coupon_code: couponCode !== '0' ? (couponCode || '') : '',
      restaurant_id: parseInt(restaurantId) || 0,
      distance: 1,
      delivery_charge: String(deliveryCharge || 0),
      schedule_at: null,
      discount_amount: pointsDiscount,
      tax_amount: rootTaxAmount,
      // Backend-confirmed contract:
      //   order_sub_total_amount      = Item Total only (pure food/cart amount)
      //   order_sub_total_without_tax = Pre-tax billable subtotal (item total - discount + SC + delivery)
      order_sub_total_amount: parseFloat(((itemTotal && itemTotal > 0) ? itemTotal : (subtotal || 0)).toFixed(2)),
      order_sub_total_without_tax: parseFloat(((finalSubtotal !== undefined ? finalSubtotal : subtotal) || 0).toFixed(2)),
      address: deliveryAddress?.address || '',
      latitude: deliveryAddress?.latitude || '',
      longitude: deliveryAddress?.longitude || '',
      pincode: deliveryAddress?.pincode || '',
      air_bnb_id: '',
      payment_type: orderData.paymentType || 'postpaid',
      contact_person_name: deliveryAddress?.contact_person_name || '',
      contact_person_number: deliveryAddress?.contact_person_number || '',
      address_type: deliveryAddress?.address_type || '',
      road: deliveryAddress?.road || '',
      house: deliveryAddress?.house || '',
      table_id: String(tableId || tableNumber || '0'),
      floor: deliveryAddress?.floor || '',
      dm_tips: '',
      subscription_order: '0',
      subscription_type: 'daily',
      subscription_days: '[]',
      subscription_quantity: '1',
      subscription_start_at: '',
      subscription_end_at: '',
      cust_phone: custPhone || '',
      cust_name: customerName || '',
      cust_email: '',
      estimatedTime: '',
      discount_type: pointsRedeemed > 0 ? 'Loyality' : '',
      points_redeemed: pointsRedeemed,
      points_discount: pointsDiscount,
      // Multi-menu specific root fields
      total_gst_tax_amount: totalGstTaxAmount,
      total_vat_tax_amount: totalVatTaxAmount,
      total_service_tax_amount: parseFloat((serviceCharge || 0).toFixed(2)),
      service_gst_tax_amount: parseFloat((gstOnServiceCharge || 0).toFixed(2)),
      round_up: parseFloat(((roundUpAmount) || 0).toFixed(2)),
      tip_tax_amount: 0
    }
  };
};
