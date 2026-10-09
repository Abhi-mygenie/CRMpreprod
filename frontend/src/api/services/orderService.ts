/**
 * Order Service (TypeScript)
 * Handles all order-related API calls
 * Uses centralized transformers for data mapping
 */

// CR-2026-07-03-004 Step 8b — order-create is a WRITE. Import the 15 s write
// client (aliased to apiClient) so legitimately slow orders on flaky mobile
// networks don't get cancelled at the 8 s read default. See PLAN §Step 8b.
import { apiWriteClient as apiClient } from '../config/axios';
import { ENDPOINTS } from '../config/endpoints';
import logger from '../../utils/logger';

// Import RECEIVE transformers (API → App)
import {
  transformTableStatus,
  transformOrderDetails as transformOrderDetailsFromApi,
  transformPreviousOrderItem,
  calculateVariationsTotal,
  calculateAddonsTotal,
} from '../transformers';

// CR Fix — Single-source-of-truth filter for POS "Check In" system item.
import { filterSystemItems } from '../transformers/systemItemFilter';

// Import SEND transformers (App → API) - from centralized helpers
import {
  transformVariationsForApi,
  transformAddonsForApi,
  transformCartItemForApi,
  transformCartItemsForApi,
  calculateCartItemPrice,
  extractPhoneNumber,
  getDialCode,
  buildMultiMenuPayload,
  allocateServiceChargePerItem,
} from '../transformers/helpers';

// calculateTaxBreakdown import removed — getOrderDetails now uses pure API mapping (SERVICE_CHARGE_MAPPING CR).

// Import types
import {
  ORDER_STATUS,
  ApiOrderDetailsResponse,
  ApiPlaceOrderResponse,
} from '../../types/api/order.types';

import {
  TableStatus,
  OrderDetails,
  PlaceOrderData,
  UpdateOrderData,
} from '../../types/models/order.types';

// ============================================
// Auth Token Helper
// ============================================
const getStoredToken = async () => {
  // Try to get token from localStorage
  const token = localStorage.getItem('authToken');
  if (token) return token;
  
  // Fallback: try to refresh token
  try {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) return null;
    
    const response = await apiClient.post('/auth/refresh', { refresh_token: refreshToken });
    const newToken = response.data?.token;
    if (newToken) {
      localStorage.setItem('authToken', newToken);
      return newToken;
    }
  } catch (e) {
    logger.error('order', 'Token refresh failed:', e);
  }
  return null;
};

// ============================================
// Check Table Status
// ============================================
export const checkTableStatus = async (
  tableId: string | number,
  restaurantId: string | number,
  authToken: string
): Promise<TableStatus & {
  tableStatus: string;
  error?: string;
  /** CR Phase-2 — table type from API (`'RM'` for room, `'TB'` for table, etc.) */
  tableType: string | null;
  /** CR Phase-2 — checked-in guest details when room is occupied */
  guest: { firstName: string; lastName: string; phone: string } | null;
}> => {
  try {
    const response = await apiClient.get(
      ENDPOINTS.CHECK_TABLE_STATUS(tableId, restaurantId),
      {
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
          'zoneId': '3',
          'Authorization': `Bearer ${authToken}`,
        }
      }
    );

    const status = response.data?.status || {};
    const tableStatus = status.table_status || 'Available';
    const orderId = status.order_id || '';

    // CR Phase-2 — preserve table type and guest data from API.
    // Live API uses key `"table type"` (with space). We also read `table_type`
    // (underscore) defensively in case backend normalises later.
    const tableType: string | null = status['table_type'] || status['table type'] || null;
    const ui = status.userinfo;
    const guest = ui
      ? {
          firstName: String(ui.f_name || '').trim(),
          lastName:  String(ui.l_name  || '').trim(),
          phone:     String(ui.phone   || '').replace(/\D/g, ''),
        }
      : null;

    return {
      tableStatus,
      orderId: orderId ? parseInt(orderId, 10) : null,
      isOccupied: tableStatus === 'Not Available' && !!orderId,
      isAvailable: tableStatus === 'Available',
      isInvalid: tableStatus === 'Invalid Table ID or QR code',
      tableType,
      guest,
    };
  } catch (error: any) {
    logger.error('table', 'Failed to check table status:', error);
    return {
      tableStatus: 'Available',
      orderId: null,
      isOccupied: false,
      isAvailable: true,
      isInvalid: false,
      tableType: null,
      guest: null,
      error: error.message,
    };
  }
};

// ============================================
// Get Order Details
// ============================================
export const getOrderDetails = async (orderId: number | string): Promise<OrderDetails & {
  fOrderStatus: number;
  paymentStatus: string | null;
  restaurantOrderId?: string;
  tableId?: string;
  tableNo?: string;
  tableType?: string | null;
  restaurant?: any;
  deliveryCharge?: number;
}> => {
  try {
    const response = await apiClient.get(ENDPOINTS.GET_ORDER_DETAILS(orderId), {
      headers: {
        'Content-Type': 'application/json',
      }
    });

    const orderData: ApiOrderDetailsResponse = response.data;
    // CR Fix — filter POS "Check In" system item from the live path that
    // feeds OrderSuccess "Items Ordered" and ReviewOrder "Previously Ordered".
    // Backend totals (order_amount, order_sub_total_amount, *_tax_amount, etc.)
    // are denormalised onto every detail row by the API, so we capture
    // `firstDetail` from the ORIGINAL (unfiltered) array to guarantee monetary
    // calculations are unchanged even in the degenerate case where Check In
    // was the only row. `details` (filtered) is used for items mapping +
    // per-row reductions — Check In has zero tax/VAT/SC so reductions match.
    const rawDetails = orderData.details || [];
    const details = filterSystemItems(rawDetails);
    const firstDetail: any = rawDetails[0] || {};

    // Transform previous items using centralized transformer (needed for UI rendering)
    const previousItems = details.map(detail => {
      const item = transformPreviousOrderItem(detail);
      return {
        ...item,
        orderId: (detail as any).order_id,
        unitPrice: item.price,
        item: {
          id: item.foodId,
          name: item.name,
          description: item.description || '',
          image: item.image || '',
          price: item.price,
          veg: item.veg,
          tax: item.tax,
          tax_type: item.taxType,
        },
        orderNote: (detail as any).order_note || '',
      };
    });

    const fOrderStatus = firstDetail.f_order_status ?? ORDER_STATUS.YET_TO_CONFIRM;
    const restaurantOrderId = firstDetail.restaurant_order_id ?? null;

    // Payment status — read defensively from per-detail or root, normalize to lowercase.
    // Used by OrderSuccess/LandingPage to gate the EDIT ORDER button (paid → no edit).
    const rawPaymentStatus =
      (firstDetail as any).payment_status ??
      (orderData as any).payment_status ??
      null;
    const paymentStatus = rawPaymentStatus
      ? String(rawPaymentStatus).toLowerCase()
      : null;

    // ─── SERVICE_CHARGE_MAPPING CR — pure API mapping, no client-side recompute ───
    // All values come directly from backend response fields.
    // Reference: handover R-runtime-2 resolution, SUMMARY.md §5.
    const restaurantMeta: any = (orderData as any).restaurant || {};
    const totalVat = parseFloat(firstDetail.total_vat_tax_amount)
      || details.reduce((sum, d: any) => sum + (parseFloat(d.vat_tax_amount) || 0), 0);
    const serviceCharge = parseFloat(firstDetail.total_service_tax_amount)
      || details.reduce((sum, d: any) => sum + (parseFloat(d.service_charge) || 0), 0);
    // Backend-confirmed contract:
    //   order_sub_total_amount      → Item Total only
    //   order_sub_total_without_tax → Pre-tax billable subtotal
    const itemTotal   = parseFloat(firstDetail.order_sub_total_amount) || 0;
    const subtotal    = parseFloat(firstDetail.order_sub_total_without_tax) || 0;
    const totalTax    = parseFloat(firstDetail.total_tax_amount) || 0;
    const grandTotal  = parseFloat(firstDetail.order_amount) || 0;
    const orderDiscount = parseFloat(firstDetail.order_discount) || 0;
    // Total GST: prefer backend's correctly-labeled payload_total_gst_tax_amount; fallback to derivation
    const totalGst = parseFloat(firstDetail.payload_total_gst_tax_amount)
      || parseFloat((totalTax - totalVat).toFixed(2));
    // SC-GST: prefer direct backend field; fallback to derivation
    const scGst = parseFloat(firstDetail.service_gst_tax_amount)
      || parseFloat(((totalGst) - details.reduce((sum, d: any) => sum + (parseFloat(d.gst_tax_amount) || 0), 0)).toFixed(2));
    const itemGst = parseFloat((totalGst - scGst).toFixed(2));
    const cgst   = parseFloat((itemGst / 2).toFixed(2));
    const sgst   = parseFloat((itemGst / 2).toFixed(2));
    const scCgst = parseFloat((scGst / 2).toFixed(2));
    const scSgst = parseFloat((scGst / 2).toFixed(2));
    // Rates — uniform derivation from items (null if mixed)
    const gstRates = [...new Set(details.filter((d: any) => (d?.food_details?.tax_type || '').toUpperCase() === 'GST').map((d: any) => parseFloat(d?.food_details?.tax) || 0))];
    const vatRates = [...new Set(details.filter((d: any) => (d?.food_details?.tax_type || '').toUpperCase() === 'VAT').map((d: any) => parseFloat(d?.food_details?.tax) || 0))];
    const gstRate = gstRates.length === 1 ? gstRates[0] : null;
    const vatRate = vatRates.length === 1 ? vatRates[0] : (parseFloat(restaurantMeta.vat_percent) || null);
    // SC-GST rate: prefer the configured percentage from restaurant config —
    // it's the integer-clean value the user expects to see on the bill (e.g. 18%).
    // Fall back to deriving from rounded amounts only when the configured field
    // is missing/zero (legacy orders or restaurants that don't expose it).
    const configuredScGstRate = parseFloat(restaurantMeta.service_charge_tax);
    const scGstRate = Number.isFinite(configuredScGstRate) && configuredScGstRate > 0
      ? configuredScGstRate
      : ((serviceCharge > 0 && scGst > 0)
          ? parseFloat(((scGst / serviceCharge) * 100).toFixed(2))
          : null);
    const localTotal  = parseFloat((subtotal + totalTax).toFixed(2));
    const originalTotal = (grandTotal !== localTotal && localTotal > 0) ? localTotal : null;

    return {
      orderId: typeof orderId === 'string' ? parseInt(orderId, 10) : orderId,
      orderAmount: grandTotal,
      subtotal,
      subtotalWithoutTax: itemTotal,
      tableNo: orderData.table_no,
      tableId: (orderData as any).table_id,
      orderStatus: orderData.order_status,
      orderType: orderData.order_type,
      fOrderStatus,
      paymentStatus,
      restaurantOrderId,
      items: [],
      previousItems,
      restaurant: restaurantMeta,
      deliveryCharge: (orderData as any).delivery_charge,
      // SERVICE_CHARGE_MAPPING CR (adjacent fix) — expose table meta for OrderSuccess to read
      tableType: firstDetail.table_type || null,
      billSummary: {
        itemTotal,
        serviceCharge,
        discount: orderDiscount,
        subtotal,
        cgst,
        sgst,
        scCgst,
        scSgst,
        vat: totalVat,
        gstRate,
        vatRate,
        scGstRate,
        totalTax,
        grandTotal,
        originalTotal,
      } as any
    };
  } catch (error) {
    logger.error('order', 'Failed to fetch order details:', error);
    throw error;
  }
};

// ============================================
// Transform Cart Items for API (uses centralized helpers)
// ============================================
const transformCartItems = (cartItems: any[], gstEnabled = true) => {
  // Use centralized transformer from helpers.js
  return transformCartItemsForApi(cartItems, gstEnabled);
};

// ============================================
// Place Order (handles both normal and multi-menu)
// ============================================
export const placeOrder = async (orderData: any): Promise<ApiPlaceOrderResponse> => {
  try {
    const formData = new FormData();
    const gstEnabled = orderData.gstEnabled !== false;
    const isMultiMenu = orderData.isMultipleMenuType === true;

    // Use autopaid endpoint ONLY for restaurant 716 (Hyatt Centric)
    // All other restaurants (including multi-menu) use the normal place endpoint
    if (isMultiMenu) {
      const multiMenuPayload = buildMultiMenuPayload(orderData, gstEnabled) as { data: any };
      formData.append('data', JSON.stringify(multiMenuPayload.data));

      const is716 = String(orderData.restaurantId) === '716';
      const endpoint = is716
        ? ENDPOINTS.PLACE_ORDER_AUTOPAID()
        : ENDPOINTS.PLACE_ORDER();

      const response = await apiClient.post(endpoint, formData, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${orderData.authToken}`,
          'zoneId': '[1]',
          'X-localization': 'en',
          'latitude': '0',
          'longitude': '0'
        }
      });

      return response.data;
    }

    // Normal (non-multi-menu) order flow
    const cart = transformCartItems(orderData.cartItems || [], gstEnabled);
    const custPhone = extractPhoneNumber(orderData.customerPhone || '');
    const dialCode = getDialCode(orderData.customerPhone || '') || orderData.dialCode || '+91';

    // SC fields (SERVICE_CHARGE_MAPPING CR)
    const serviceCharge = parseFloat(orderData.serviceCharge || 0);
    const itemTotal     = parseFloat(orderData.itemTotal || 0);
    const finalSubtotal = parseFloat(
      orderData.finalSubtotal !== undefined && orderData.finalSubtotal !== null
        ? orderData.finalSubtotal
        : (orderData.subtotal || 0)
    );
    // Root-level GST/VAT bucket totals (multi-menu parity for 478 normal contract)
    const totalGstTaxAmount = parseFloat(orderData.totalGstTaxAmount || 0) || 0;
    const totalVatTaxAmount = parseFloat(orderData.totalVatTaxAmount || 0) || 0;
    // Allocate per-item service_charge (R7: identical across writers; backend stores at item level)
    allocateServiceChargePerItem(cart, serviceCharge, itemTotal);

    const payloadData = {
      address_id: '',
      dial_code: dialCode,
      payment_id: '',
      payment_type: orderData.paymentType || 'postpaid',
      delivery_charge: String(orderData.deliveryCharge || 0),
      fcm_token: '',
      otp: '',
      pincode: orderData.deliveryAddress?.pincode || '',
      cust_email: '',
      table_id: String(orderData.tableId || orderData.tableNumber || ''),
      air_bnb_id: '',
      cart,
      coupon_discount_amount: 0,
      coupon_discount_title: null,
      distance: 1,
      cust_name: orderData.customerName || '',
      cust_phone: custPhone || orderData.customerPhone || '',
      schedule_at: null,
      order_amount: Math.ceil(orderData.totalToPay || 0),
      order_note: orderData.orderNote || orderData.specialInstructions || '',
      order_type: orderData.orderType || 'dinein',
      payment_method: 'cash_on_delivery',
      coupon_code: orderData.couponCode !== '0' ? (orderData.couponCode || '') : '',
      restaurant_id: String(orderData.restaurantId),
      address: orderData.deliveryAddress?.address || '',
      latitude: orderData.deliveryAddress?.latitude || '',
      longitude: orderData.deliveryAddress?.longitude || '',
      address_type: orderData.deliveryAddress?.address_type || '',
      contact_person_name: orderData.deliveryAddress?.contact_person_name || '',
      contact_person_number: orderData.deliveryAddress?.contact_person_number || '',
      discount_amount: orderData.pointsDiscount || 0,
      tax_amount: parseFloat((orderData.totalTax || 0).toFixed(2)),
      // Backend-confirmed contract:
      //   order_sub_total_amount      = Item Total only (pure food/cart amount)
      //   order_sub_total_without_tax = Pre-tax billable subtotal (item total - discount + SC + delivery)
      order_sub_total_amount: parseFloat(((itemTotal > 0) ? itemTotal : (orderData.subtotal || 0)).toFixed(2)),
      order_sub_total_without_tax: parseFloat(finalSubtotal.toFixed(2)),
      // SC fields (SERVICE_CHARGE_MAPPING CR)
      total_service_tax_amount: parseFloat(serviceCharge.toFixed(2)),
      service_gst_tax_amount: parseFloat((parseFloat(orderData.gstOnServiceCharge || 0)).toFixed(2)),
      // Multi-menu parity additions (478 normal contract alignment with 716)
      total_gst_tax_amount: parseFloat(totalGstTaxAmount.toFixed(2)),
      total_vat_tax_amount: parseFloat(totalVatTaxAmount.toFixed(2)),
      round_up: parseFloat(((orderData.roundUpAmount) || 0).toFixed(2)),
      tip_tax_amount: 0,
      road: orderData.deliveryAddress?.road || '',
      house: orderData.deliveryAddress?.house || '',
      floor: orderData.deliveryAddress?.floor || '',
      dm_tips: '',
      estimatedTime: '',
      subscription_order: '0',
      subscription_type: 'daily',
      subscription_quantity: '1',
      subscription_days: '[]',
      subscription_start_at: '',
      subscription_end_at: '',
      discount_type: orderData.pointsRedeemed > 0 ? 'Loyality' : '',
      points_redeemed: orderData.pointsRedeemed || 0,
      points_discount: orderData.pointsDiscount || 0,
    };

    // DEBUG: Log payload before sending to API
    logger.order('[BUG-035 TEST] placeOrder Payload:', {
      payment_type: payloadData.payment_type,
      restaurant_id: payloadData.restaurant_id,
      table_id: payloadData.table_id,
      order_type: payloadData.order_type,
      order_amount: payloadData.order_amount
    });

    formData.append('data', JSON.stringify(payloadData));

    const response = await apiClient.post(ENDPOINTS.PLACE_ORDER(), formData, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'multipart/form-data',
        'Authorization': `Bearer ${orderData.authToken}`,
        'zoneId': '3',
      }
    });

    return response.data;
  } catch (error: any) {
    logger.error('order', 'Failed to place order:', error);
    // CR-2026-09-07-001: detect POS stock-out 422 and throw typed error
    if (
      error?.response?.status === 422 &&
      Array.isArray(error?.response?.data?.out_of_stock_items) &&
      error.response.data.out_of_stock_items.length > 0
    ) {
      const stockOutError: any = new Error('STOCK_OUT');
      stockOutError.isStockOut = true;
      stockOutError.out_of_stock_items = error.response.data.out_of_stock_items;
      throw stockOutError;
    }
    throw error;
  }
};

// ============================================
// Update Customer Order
// ============================================
export const updateCustomerOrder = async ({
  orderId,
  cartItems,
  restaurantId,
  tableId = '0',
  orderType = 'dinein',
  paymentType = 'postpaid',
  orderNote = '',
  authToken,
  customerName = '',
  customerPhone = '',
  dialCode = '+91',
  totalToPay = 0,
  subtotal = 0,
  totalTax = 0,
  pointsDiscount = 0,
  pointsRedeemed = 0,
  // SC fields (SERVICE_CHARGE_MAPPING CR)
  serviceCharge = 0,
  gstOnServiceCharge = 0,
  itemTotal = 0,
  finalSubtotal,
  // Multi-menu parity additions (478 edit contract alignment with 716)
  totalGstTaxAmount = 0,
  totalVatTaxAmount = 0,
  gstEnabled = true,
  // Delivery (DELIVERY_CHARGE_GATING CR D-6): 478 edit parity with placeOrder's delivery_charge handling
  deliveryCharge = 0,
  // ROUND_UP_PAYLOAD_GAP fix — restaurant round-off amount (roundedTotal - totalToPay); 0 when disabled
  roundUpAmount = 0,
}: any): Promise<ApiPlaceOrderResponse> => {
  try {
    const formData = new FormData();

    // Transform cart items using centralized transformer
    const cart = transformCartItemsForApi(cartItems, gstEnabled);
    // Allocate per-item service_charge (R7: identical across writers; backend stores at item level)
    allocateServiceChargePerItem(cart, parseFloat(serviceCharge) || 0, parseFloat(itemTotal) || 0);

    const effectiveSubtotal = finalSubtotal !== undefined && finalSubtotal !== null
      ? finalSubtotal
      : subtotal;
    const effectiveItemTotal = (itemTotal && itemTotal > 0) ? itemTotal : subtotal;

    const payloadData = {
      order_id: String(orderId),
      address_id: '',
      dial_code: dialCode,
      payment_id: '',
      payment_type: paymentType,
      delivery_charge: String(deliveryCharge || 0),
      fcm_token: '',
      otp: '',
      pincode: '',
      cust_email: '',
      table_id: String(tableId),
      air_bnb_id: '',
      cart,
      coupon_discount_amount: 0,
      coupon_discount_title: null,
      distance: 1,
      cust_name: customerName,
      cust_phone: customerPhone,
      schedule_at: null,
      order_amount: Math.ceil(totalToPay),
      order_note: orderNote,
      order_type: orderType,
      payment_method: 'cash_on_delivery',
      coupon_code: '',
      restaurant_id: String(restaurantId),
      address: '',
      latitude: '',
      longitude: '',
      address_type: '',
      contact_person_name: '',
      contact_person_number: '',
      discount_amount: pointsDiscount,
      tax_amount: parseFloat(totalTax.toFixed(2)),
      // Backend-confirmed contract:
      //   order_sub_total_amount      = Item Total only (pure food/cart amount)
      //   order_sub_total_without_tax = Pre-tax billable subtotal (item total - discount + SC + delivery)
      order_sub_total_amount: parseFloat(effectiveItemTotal.toFixed(2)),
      order_sub_total_without_tax: parseFloat(effectiveSubtotal.toFixed(2)),
      // SC fields (SERVICE_CHARGE_MAPPING CR)
      total_service_tax_amount: parseFloat(serviceCharge.toFixed(2)),
      service_gst_tax_amount: parseFloat((parseFloat(gstOnServiceCharge as any) || 0).toFixed(2)),
      // Multi-menu parity additions (478 edit contract alignment with 716)
      total_gst_tax_amount: parseFloat((parseFloat(totalGstTaxAmount as any) || 0).toFixed(2)),
      total_vat_tax_amount: parseFloat((parseFloat(totalVatTaxAmount as any) || 0).toFixed(2)),
      round_up: parseFloat(((roundUpAmount as any) || 0).toFixed(2)),
      tip_tax_amount: 0,
      road: '',
      house: '',
      floor: '',
      dm_tips: '',
      estimatedTime: '',
      subscription_order: '0',
      subscription_type: 'daily',
      subscription_quantity: '1',
      subscription_days: '[]',
      subscription_start_at: '',
      subscription_end_at: '',
      discount_type: pointsRedeemed > 0 ? 'Loyality' : '',
      points_redeemed: pointsRedeemed,
      points_discount: pointsDiscount,
    };

    formData.append('data', JSON.stringify(payloadData));

    const response = await apiClient.post(
      `${process.env.REACT_APP_API_BASE_URL}/customer/order/update-customer-order`,
      formData,
      {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${authToken}`,
          'zoneId': '3',
        }
      }
    );

    return response.data;
  } catch (error: any) {
    logger.error('order', 'Failed to update customer order:', error);
    // CR-2026-09-07-001: detect POS stock-out 422 and throw typed error
    if (
      error?.response?.status === 422 &&
      Array.isArray(error?.response?.data?.out_of_stock_items) &&
      error.response.data.out_of_stock_items.length > 0
    ) {
      const stockOutError: any = new Error('STOCK_OUT');
      stockOutError.isStockOut = true;
      stockOutError.out_of_stock_items = error.response.data.out_of_stock_items;
      throw stockOutError;
    }
    throw error;
  }
};

// ============================================
// Exports
// ============================================
export { getStoredToken };
export { ORDER_STATUS };
