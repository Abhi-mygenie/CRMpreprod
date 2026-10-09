/**
 * Cart Transformer
 * Transforms internal cart data to API request format
 * For Place Order and Update Order API calls
 */

import {
  ApiCartItem,
  ApiCartVariation,
  ApiCartAddon,
  ApiPlaceOrderRequest,
  ApiUpdateOrderRequest,
} from '../../types/api/order.types';

import {
  CartItem,
  SelectedVariation,
  SelectedAddon,
  PlaceOrderData,
  UpdateOrderData,
} from '../../types/models/order.types';

// ============================================
// Transform Selected Variations to API Format
// ============================================
export const transformVariationsToApi = (
  selectedVariations: SelectedVariation[],
  originalVariations?: { variations: { name: string; values: { label: string }[] }[] }
): ApiCartVariation[] => {
  if (!selectedVariations || selectedVariations.length === 0) return [];

  // Group selected variations by their parent group name
  const variationGroups: Record<string, string[]> = {};

  selectedVariations.forEach(selected => {
    // Try to find the group name from original item variations
    let groupName = selected.groupName || 'CHOICE OF';
    
    if (originalVariations?.variations) {
      const matchingGroup = originalVariations.variations.find(v =>
        v.values?.some(val => val.label === selected.label)
      );
      if (matchingGroup) {
        groupName = matchingGroup.name;
      }
    }

    if (!variationGroups[groupName]) {
      variationGroups[groupName] = [];
    }
    variationGroups[groupName].push(selected.label);
  });

  return Object.entries(variationGroups).map(([name, labels]) => ({
    name,
    values: { label: labels },
  }));
};

// ============================================
// Transform Selected Addons to API Format
// ============================================
export const transformAddonsToApi = (addons: SelectedAddon[]): {
  addOnIds: number[];
  addOns: ApiCartAddon[];
  addOnQtys: number[];
} => {
  if (!addons || addons.length === 0) {
    return { addOnIds: [], addOns: [], addOnQtys: [] };
  }

  const addOnIds = addons.map(a => a.id);
  const addOns: ApiCartAddon[] = addons.map(a => ({
    id: a.id,
    name: a.name,
    price: a.price,
  }));
  const addOnQtys = addons.map(a => a.quantity);

  return { addOnIds, addOns, addOnQtys };
};

// ============================================
// Transform Cart Item to API Format
// ============================================
export const transformCartItemToApi = (cartItem: CartItem): ApiCartItem => {
  const variations = transformVariationsToApi(
    cartItem.variations,
    cartItem.item ? { variations: cartItem.item.variations as any } : undefined
  );
  
  const { addOnIds, addOns, addOnQtys } = transformAddonsToApi(cartItem.addons);

  // Calculate item price including variations and addons
  const variationsTotal = cartItem.variations.reduce((sum, v) => sum + v.price, 0);
  const addonsTotal = cartItem.addons.reduce((sum, a) => sum + (a.price * a.quantity), 0);
  const itemPrice = cartItem.basePrice + variationsTotal + addonsTotal;

  return {
    food_id: String(cartItem.id),
    quantity: cartItem.quantity,
    price: itemPrice.toFixed(2),
    food_level_notes: cartItem.notes || '',
    station: cartItem.station || 'KDS',
    item_campaign_id: cartItem.itemCampaignId || null,
    variant: '',
    variations,
    add_on_ids: addOnIds,
    add_ons: addOns,
    add_on_qtys: addOnQtys,
  };
};

// ============================================
// Transform Place Order Data to API Request
// ============================================
export const transformPlaceOrderToApi = (data: PlaceOrderData): ApiPlaceOrderRequest => {
  const cart = data.cartItems.map(transformCartItemToApi);

  return {
    restaurant_id: data.restaurantId,
    table_id: data.tableId,
    order_type: data.orderType,
    payment_type: data.paymentType,
    payment_method: 'cash_on_delivery',
    order_amount: Math.ceil(data.totalToPay),
    order_sub_total_amount: parseFloat(data.subtotal.toFixed(2)),
    order_sub_total_without_tax: parseFloat(data.subtotal.toFixed(2)),
    // NOTE (subtotal contract): this legacy helper is currently dead (not imported
    // by any live page; only re-exported through transformers/index.{ts,js}). It
    // sends the same value to both fields, which is only safe in degenerate cases
    // (no SC / no delivery / no discount). If this helper is ever re-wired, update
    // it to follow the backend-confirmed contract: order_sub_total_amount = item
    // total only; order_sub_total_without_tax = pre-tax billable subtotal.
    tax_amount: parseFloat(data.totalTax.toFixed(2)),
    discount_amount: data.pointsDiscount || 0,
    order_note: data.orderNote || '',
    cart,
    cust_name: data.customerName || '',
    cust_phone: data.customerPhone || '',
    points_redeemed: data.pointsRedeemed || 0,
    points_discount: data.pointsDiscount || 0,
  };
};

// ============================================
// Transform Update Order Data to API Request
// ============================================
export const transformUpdateOrderToApi = (data: UpdateOrderData): ApiUpdateOrderRequest => {
  const baseRequest = transformPlaceOrderToApi(data);
  
  return {
    ...baseRequest,
    order_id: String(data.orderId),
  };
};
