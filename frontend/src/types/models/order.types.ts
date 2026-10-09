/**
 * Internal Model Types - Order Related
 * These types represent our INTERNAL data structure
 * Used throughout the application after transformation from API
 */

import { OrderStatusType } from '../api/order.types';

// ============================================
// Table Status (Internal)
// ============================================
export interface TableStatus {
  isOccupied: boolean;
  isAvailable: boolean;
  orderId: number | null;
  isInvalid?: boolean;
  error?: string;
}

// ============================================
// Order Item (Internal)
// ============================================
export interface OrderItem {
  id: number;
  foodId: number;
  name: string;
  description?: string;
  image?: string;
  price: number;           // Base price
  fullPrice: number;       // Base + variations + addons
  quantity: number;
  veg: boolean;
  status: OrderStatusType;
  notes?: string;
  variations: Variation[];
  addons: Addon[];
  tax: number;
  taxType: string;
  taxCalc?: 'Inclusive' | 'Exclusive';
}

// ============================================
// Variation (Internal)
// ============================================
export interface Variation {
  name: string;              // e.g., "Choice Of Size"
  type: 'single' | 'multiple';
  required: boolean;
  values: VariationValue[];
}

export interface VariationValue {
  label: string;             // e.g., "30ML", "60ML"
  price: number;             // Additional price for this option
  selected?: boolean;        // For cart selection tracking
}

// ============================================
// Addon (Internal)
// ============================================
export interface Addon {
  id: number;
  name: string;
  price: number;
  quantity: number;
}

// ============================================
// Cart Item (Internal)
// ============================================
export interface CartItem {
  cartId: string;           // Unique cart identifier
  id: number;               // Food ID
  name: string;
  description?: string;
  image?: string;
  basePrice: number;
  quantity: number;
  veg: boolean;
  variations: SelectedVariation[];
  addons: SelectedAddon[];
  notes?: string;
  station?: string;
  itemCampaignId?: number | null;
  
  // Original item reference (for variation groups)
  item?: {
    variations: Variation[];
    addons: Addon[];
  };
}

export interface SelectedVariation {
  label: string;
  price: number;
  groupName?: string;       // Parent variation group name
}

export interface SelectedAddon {
  id: number;
  name: string;
  price: number;
  quantity: number;
}

// ============================================
// Order Details (Internal)
// ============================================
export interface OrderDetails {
  orderId: number;
  orderAmount: number;
  subtotal: number;
  subtotalWithoutTax: number;
  tableNo: string;
  tableId?: string;
  orderStatus: string;
  orderType: string;
  fOrderStatus: OrderStatusType;
  paymentStatus?: string | null; // normalized lowercase: 'paid' | 'unpaid' | null
  items: OrderItem[];
  previousItems: OrderItem[];
  
  // Bill Summary
  billSummary?: BillSummary;
  
  // Restaurant reference
  restaurant?: {
    id: number;
    name: string;
  };
}

export interface BillSummary {
  itemTotal: number;
  subtotal: number;
  cgst: number;
  sgst: number;
  vat: number;
  totalTax: number;
  discount: number;
  grandTotal: number;
  originalTotal?: number | null;
  roundingAdjustment?: number;
  // SERVICE_CHARGE_MAPPING CR — SC breakdown
  serviceCharge?: number;
  scCgst?: number;      // CGST on service charge (per side)
  scSgst?: number;      // SGST on service charge (per side)
  gstRate?: number;     // uniform GST % across items (e.g., 18); null if mixed
  vatRate?: number;     // uniform VAT % across items (e.g., 22); null if mixed
  scGstRate?: number;   // GST rate applied on service charge (e.g., 18)
}

// ============================================
// Previous Order Items (for Edit Mode)
// ============================================
export interface PreviousOrderItem extends OrderItem {
  foodStatus: OrderStatusType;
  unitPrice: number;
  variationsTotal: number;
  addonsTotal: number;
}

// ============================================
// Edit Order State
// ============================================
export interface EditOrderState {
  orderId: number;
  previousItems: PreviousOrderItem[];
  tableId?: string;
  tableNo?: string;
  restaurant?: {
    id: number;
    name: string;
  };
}

// ============================================
// Place/Update Order Data
// ============================================
export interface PlaceOrderData {
  restaurantId: string;
  tableId: string;
  orderType: string;
  paymentType: string;
  cartItems: CartItem[];
  customerName?: string;
  customerPhone?: string;
  orderNote?: string;
  totalToPay: number;
  subtotal: number;
  totalTax: number;
  pointsDiscount?: number;
  pointsRedeemed?: number;
  authToken: string;
}

export interface UpdateOrderData extends PlaceOrderData {
  orderId: number;
}

// ============================================
// Order Response (Internal)
// ============================================
export interface OrderResponse {
  success: boolean;
  orderId: number;
  message: string;
}
