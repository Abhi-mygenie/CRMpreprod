/**
 * API Response Types - Order Related
 * These types represent EXACT structure returned by the API
 * DO NOT modify field names - they must match API response
 */

// ============================================
// Order Status Constants
// ============================================
export const ORDER_STATUS = {
  CONFIRMED: 1,
  PREPARING: 2,
  CANCELLED: 3,
  READY: 4,
  SERVED: 5,
  PAID: 6,
  YET_TO_CONFIRM: 7,
} as const;

export type OrderStatusType = typeof ORDER_STATUS[keyof typeof ORDER_STATUS];

// ============================================
// Check Table Status API Response
// GET /customer/check-table-status
// ============================================
export interface ApiCheckTableStatusResponse {
  is_available: boolean;
  order_id: number | null;
  message?: string;
}

// ============================================
// Get Order Details API Response
// GET /air-bnb/get-order-details/{orderId}
// ============================================
export interface ApiOrderDetailsResponse {
  order_id: number;
  order_amount: string;
  order_sub_total_amount?: string;
  order_sub_total_without_tax?: string;
  table_no: string;
  order_status: string;
  order_type: string;
  // Payment fields (newly added by POS) — may appear at root or per-detail
  payment_status?: string | null; // 'paid' | 'unpaid' | null
  payment_type?: string | null;   // 'prepaid' | 'postpaid' | null
  details: ApiOrderDetailItem[];
}

export interface ApiOrderDetailItem {
  id: number;
  food_id: number;
  order_id: number;
  quantity: number;
  unit_price: string;
  discount_on_food: string;
  discount_type: string;
  tax_amount: string;
  food_level_notes: string | null;
  foodStatus: OrderStatusType;
  food_details: ApiFoodDetails;
  variation: ApiVariation[];
  add_ons: ApiAddon[];
  item_campaign_id: number | null;
  price: number;
  total_add_on_price: number;
  // Payment fields (newly added by POS at detail level)
  payment_status?: string | null; // 'paid' | 'unpaid' | null
  payment_type?: string | null;   // 'prepaid' | 'postpaid' | null
  paid_status?: number;
  payment_id?: string | null;
}

export interface ApiFoodDetails {
  id: number;
  name: string;
  description: string | null;
  image: string | null;
  price: number;
  category_id: number;
  veg: number | boolean;
  available_time_starts: string | null;
  available_time_ends: string | null;
  tax: number;
  tax_type: string;
  tax_calc?: string; // "Inclusive" or "Exclusive"
}

// ============================================
// Variation Structure (API Response)
// ============================================
export interface ApiVariation {
  name: string;
  type: 'single' | 'multiple';
  min: string;
  max: string;
  required: 'on' | 'off';
  values: ApiVariationValue[];
}

export interface ApiVariationValue {
  label: string;
  optionPrice: string;
}

// ============================================
// Addon Structure (API Response)
// ============================================
export interface ApiAddon {
  id: number;
  name: string;
  price: number;
  quantity: number;
}

// ============================================
// Place Order API Request
// POST /customer/order/place
// ============================================
export interface ApiPlaceOrderRequest {
  restaurant_id: string;
  table_id: string;
  order_type: string;
  payment_type: string;
  payment_method: string;
  order_amount: number;
  order_sub_total_amount: number;
  order_sub_total_without_tax: number;
  tax_amount: number;
  discount_amount: number;
  order_note: string;
  cart: ApiCartItem[];
  cust_name?: string;
  cust_phone?: string;
  points_redeemed?: number;
  points_discount?: number;
}

export interface ApiCartItem {
  food_id: string;
  quantity: number;
  price: string;
  food_level_notes: string;
  station: string;
  item_campaign_id: number | null;
  variant: string;
  variations: ApiCartVariation[];
  add_on_ids: number[];
  add_ons: ApiCartAddon[];
  add_on_qtys: number[];
}

export interface ApiCartVariation {
  name: string;
  values: {
    label: string[];
  };
}

export interface ApiCartAddon {
  id: number;
  name: string;
  price: number;
}

// ============================================
// Update Order API Request
// POST /customer/order/update-customer-order
// ============================================
export interface ApiUpdateOrderRequest extends ApiPlaceOrderRequest {
  order_id: string;
}

// ============================================
// Stock-Out Types (CR-2026-09-07-001)
// ============================================
export interface StockOutFoodItem {
  type: 'food';
  food_id: string | number;
  food_name: string;
  message: string;
}

export interface StockOutAddonItem {
  type: 'addon';
  food_id: string | number;
  food_name: string;
  addon_id: string | number;
  addon_name: string;
  message: string;
}

// ============================================
// Place/Update Order API Response
// ============================================
export interface ApiPlaceOrderResponse {
  message: string;
  order_id: number;
  // CR-2026-09-07-001: stock-out error fields (HTTP 422 path)
  error?: string;
  out_of_stock_items?: (StockOutFoodItem | StockOutAddonItem)[];
}

// ============================================
// Restaurant Info API Response
// POST /web/restaurant-info
// ============================================
export interface ApiRestaurantInfoResponse {
  id: number;
  name: string;
  gst_status: boolean | string;
  restaurent_gst?: number;
  vat?: {
    status: boolean;
    value: number;
  };
  success_config?: {
    show_item_total: string;
    show_subtotal: string;
    show_gst_amount: string;
  };
  show_out_of_stock_items?: 'Yes' | 'No'; // CR-2026-09-07-001
}

// ============================================
// Product/Menu API Response
// POST /web/restaurant-product
// ============================================
export interface ApiProductResponse {
  id: number;
  name: string;
  description: string | null;
  image: string | null;
  price: number;
  category_id: number;
  category_ids: number[];
  veg: number | boolean;
  tax: number;
  tax_type: string;
  tax_calc?: string;
  variations: ApiProductVariation[];
  add_ons: ApiProductAddon[];
  station?: string;
  stock_out?: 'Y' | 'N';       // CR-2026-09-07-001
  is_inventory?: 'Yes' | 'No'; // FYI — FE reads stock_out only
}

export interface ApiProductVariation {
  name: string;
  type: 'single' | 'multiple';
  min: number;
  max: number;
  required: 'on' | 'off';
  values: ApiVariationValue[];
}

export interface ApiProductAddon {
  id: number;
  name: string;
  price: number;
  stock_out?: 'Y' | 'N'; // CR-2026-09-07-001
}
