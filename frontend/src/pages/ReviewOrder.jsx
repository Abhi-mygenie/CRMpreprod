import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { isValidPhoneNumber } from 'react-phone-number-input';
import { useCart } from '../context/CartContext';
import { useRestaurantId } from '../utils/useRestaurantId';
import { useRestaurantDetails, useTableConfig, useStations } from '../hooks/useMenuData';
import { useQueryClient } from '@tanstack/react-query'; // CR-2026-06-17-003 APP-12
import { isItemAvailable } from '../utils/itemAvailability'; // CR-2026-06-17-003 APP-12
import { useScannedTable } from '../hooks/useScannedTable';
import { useAuth } from '../context/AuthContext';
import { useRestaurantConfig } from '../context/RestaurantConfigContext';
import { useCurrentTime } from '../hooks/useCurrentTime'; // CR-2026-06-17-003 APP-12
import { getAuthToken, isTokenExpired } from '../utils/authToken';
import { placeOrder, updateCustomerOrder, checkTableStatus, getOrderDetails } from '../api/services/orderService';
import { DEFAULT_THEME } from '../constants/theme';
import { ENDPOINTS } from '../api/config/endpoints';
import OrderItemCard from '../components/OrderItemCard/OrderItemCard';
import PreviousOrderItems from '../components/PreviousOrderItems/PreviousOrderItems';
import { IoArrowBackOutline, IoPersonOutline } from "react-icons/io5";
import { isMultipleMenu } from '../api/utils/restaurantIdConfig';
import { MdOutlineShoppingBag } from "react-icons/md";
// import { GiShoppingCart } from "react-icons/gi";
import ReviewOrderPriceBreakdown from '../components/ReviewOrderPriceBreakdown/ReviewOrderPriceBreakdown';
import { RiFileList3Line } from "react-icons/ri";
import CustomerDetails from '../components/CustomerDetails/CustomerDetails';
import PaymentMethodSelector from '../components/PaymentMethodSelector';
import TableRoomSelector from '../components/TableRoomSelector/TableRoomSelector';
import LoyaltyRewardsSection from '../components/LoyaltyRewardsSection/LoyaltyRewardsSection';
import { calculateCartItemPrice } from '../api/transformers/helpers';
import { calculateTaxBreakdown } from '../utils/taxCalculation';
import { isDineInOrRoom, hasAssignedTable } from '../utils/orderTypeHelpers';
import logger from '../utils/logger';
import fetchWithTimeout, { DEFAULT_WRITE_TIMEOUT_MS } from '../utils/fetchWithTimeout'; // CR-2026-02-XX-001
import NotificationPopup from '../components/NotificationPopup/NotificationPopup';
import { shouldBlockNonQrOrder, buildNonQrBlockPayload } from '../utils/orderAccessPolicy';
import { isChannelOpen, getChannelNextOpenTime } from '../utils/itemAvailability'; // CR-2026-08-06-001
import { postNonQrBlock } from '../api/services/diagnosticsService';
import NonQrBlockModal from '../components/NonQrBlockModal';
import './ReviewOrder.css';
import { crmGetLoyaltyRules } from '../api/services/crmService'; // CR-2026-10-03-004 Part B

// === CA-008 Phase 2: Extracted pure helper functions ===

const buildBillSummary = ({ itemTotal, pointsDiscount, pointsToRedeem, subtotalAfterDiscount, serviceCharge, finalSubtotal, itemCgst, itemSgst, scCgst, scSgst, finalCgst, finalSgst, finalVat, finalTotalTax, gstRate, vatRate, scGstRate, roundedTotal, hasRoundingDiff, totalToPay }) => ({
  itemTotal,
  pointsDiscount,
  pointsRedeemed: pointsToRedeem,
  serviceCharge,
  subtotal: finalSubtotal,
  subtotalBeforeServiceCharge: subtotalAfterDiscount,
  cgst: itemCgst,
  sgst: itemSgst,
  scCgst,
  scSgst,
  vat: finalVat,
  gstRate,
  vatRate,
  scGstRate,
  totalTax: finalTotalTax,
  // Kept for any legacy consumer expecting combined values
  finalCgst,
  finalSgst,
  grandTotal: roundedTotal,
  originalTotal: hasRoundingDiff ? totalToPay : null
});

const buildOrderItems = (cartItems) => cartItems.map(item => ({
  name: item.item?.name || 'Item',
  quantity: item.quantity,
  price: item.item?.price || item.totalPrice / item.quantity,
  totalPrice: item.totalPrice,
  veg: item.item?.veg === 1 || item.item?.veg === true
}));

const buildPreviousItems = (previousOrderItems, isEditMode) => {
  if (!isEditMode) return [];
  return previousOrderItems.map(item => ({
    name: item.item?.name || 'Item',
    quantity: item.quantity,
    price: item.unitPrice || item.price || 0,
    totalPrice: (item.unitPrice || item.price || 0) * item.quantity,
    veg: item.item?.veg === true || item.item?.veg === 1
  }));
};

const ReviewOrder = () => {
  const navigate = useNavigate();
  const { restaurantId } = useRestaurantId();
  const { isAuthenticated, user, isCustomer, setRestaurantScope } = useAuth();
  const { showCustomerDetails: configShowCustomerDetails, showCustomerName: configShowCustomerName, showCustomerPhone: configShowCustomerPhone, showCookingInstructions: configShowCookingInstructions, showSpecialInstructions: configShowSpecialInstructions, showPriceBreakdown: configShowPriceBreakdown, showTableInfo: configShowTableInfo, showLoyaltyPoints: configShowLoyaltyPoints, showCouponCode: configShowCouponCode, fetchConfig, codEnabled, onlinePaymentDinein, onlinePaymentTakeaway, onlinePaymentDelivery, payOnlineLabel, payAtCounterLabel, allowNonQrOrders, categoryTimings, itemTimings,
    deliveryShifts, takeawayShifts, dineInShifts, roomShifts, walkinShifts,
    restaurantShifts, restaurantOpen,
  } = useRestaurantConfig(); // CR-2026-06-17-003 APP-12 | CR-2026-08-06-001
  // console.log('restaurantId', restaurantId);

  // Inside ReviewOrder component, add:
  const location = useLocation();
  const params = useParams();
  const stationId = location.state?.stationId || params.stationId;

  const { 
    cartItems, 
    getTotalItems, 
    getTotalPrice, 
    clearCart,
    // Edit order mode
    isEditMode,
    editingOrderId,
    previousOrderItems,
    clearEditMode,
    getPreviousOrderTotal,
    // Delivery (Phase 3)
    deliveryAddress,
    deliveryCharge,
    setDeliveryCharge, // BUG-2026-02-XX-001 Plan R2
    clearDeliveryAddress,
    removeFromCart, // CR-2026-06-17-003 APP-12
  } = useCart();

  // CR-2026-06-17-003 APP-12: Current time for availability validation
  const currentTimeInSeconds = useCurrentTime();

  // Fetch restaurant details FIRST to get numeric ID
  const { restaurant } = useRestaurantDetails(restaurantId);
  
  // Use numeric ID from restaurant-info response, fallback to restaurantId
  const numericRestaurantId = restaurant?.id?.toString() || restaurantId;
  const { stations } = useStations(numericRestaurantId);
  // CR-2026-06-17-003 APP-12: QueryClient for forced menu refetch before place-order
  const queryClient = useQueryClient();

  // Fetch admin config
  useEffect(() => {
    if (numericRestaurantId) {
      fetchConfig(numericRestaurantId);
      setRestaurantScope(numericRestaurantId);
    }
  }, [numericRestaurantId, fetchConfig, setRestaurantScope]);

  // CR-2026-10-03-004 Part B: loyalty rules from CRM (replaces backend loyalty-settings direct DB read)
  useEffect(() => {
    const fetchLoyaltyRules = async () => {
      if (!numericRestaurantId) return;
      try {
        const data = await crmGetLoyaltyRules(numericRestaurantId);
        setLoyaltySettings(data); // null on 404 → loyalty section hidden (G4)
      } catch (error) {
        logger.error('order', 'Failed to fetch loyalty rules:', error);
      }
    };
    fetchLoyaltyRules();
  }, [numericRestaurantId]);

  // Fetch table/room configuration (uses numeric ID)
  const { rooms, tables, loading: tablesLoading, error: tablesError, errorMessage: tablesErrorMessage } = useTableConfig(numericRestaurantId);

  // Scanned table from QR code
  const {
    tableId: scannedTableId,
    tableNo: scannedTableNo,
    isScanned,
    roomOrTable: scannedRoomOrTable,
    orderType: scannedOrderType,
  } = useScannedTable();

  // console.log('🔍 Debug Scanned Table:', {
  //   restaurantId,
  //   scannedTableId,
  //   scannedTableNo,
  //   scannedRoomOrTable,
  //   scannedOrderType,
  //   isScanned
  // });


  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  // CR Phase-2 — when customer was auto-populated from a checked-in room,
  // the corresponding `guestCustomer.locked` flag in localStorage is `true`.
  // This makes Review Order render the fields read-only with a lock helper.
  const [isCustomerDetailsLocked, setIsCustomerDetailsLocked] = useState(false);
  const [tableNumber, setTableNumber] = useState('');
  const [roomOrTable, setRoomOrTable] = useState(null); // 'room' | 'table' | null
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [couponCode, setCouponCode] = useState('');
  
  // Payment method selection state (FEAT-001)
  const [paymentMethod, setPaymentMethod] = useState('cod'); // 'online' | 'cod' — default COD, user switches to online if Razorpay configured
  // Session storage key for customer info persistence during edit order
  const SESSION_CUSTOMER_KEY = 'sessionCustomerInfo';

  // ─── SERVICE_CHARGE_MAPPING CR (adjacent fix) — persist manually-selected room/table ───
  // For restaurants where the user PICKS a room/table (e.g. 716) instead of arriving via QR,
  // write the selection to sessionStorage using the same key shape as useScannedTable, so
  // downstream screens (OrderSuccess, menu) can read via the hook without parallel code paths.
  // Effective only for pre-order screens; OrderSuccess prefers API values post-order.
  useEffect(() => {
    if (!numericRestaurantId || !roomOrTable) return;
    if (!tableNumber) return;
    // 716 (Hyatt Centric): when the room came from manual selection (no scanner
    // context), do NOT persist it. Otherwise useScannedTable would re-hydrate it
    // on the next visit and auto-select a stale room. Scanner-provided rooms
    // (scannedTableId truthy) still persist via useScannedTable's own write.
    if (String(numericRestaurantId) === '716' && !scannedTableId) return;
    const pool = roomOrTable === 'room' ? rooms : tables;
    const entry = (pool || []).find((x) => String(x.id) === String(tableNumber));
    if (!entry) return;
    try {
      sessionStorage.setItem(
        `scanned_table_${numericRestaurantId}`,
        JSON.stringify({
          table_id: String(entry.id), // Coerce to string — keeps the "URL-param" contract used by useScannedTable consumers (avoids tableNumber.trim crash downstream).
          table_no: entry.table_no,
          room_or_table: roomOrTable,
          order_type: 'dinein',
          food_for: null,
        })
      );
    } catch (e) {
      // ignore quota / privacy errors
    }
  }, [numericRestaurantId, tableNumber, roomOrTable, rooms, tables, scannedTableId]);

  // Save customer info to sessionStorage whenever it changes
  useEffect(() => {
    if ((customerName || customerPhone) && numericRestaurantId) {
      sessionStorage.setItem(SESSION_CUSTOMER_KEY, JSON.stringify({
        name: customerName,
        phone: customerPhone,
        restaurantId: numericRestaurantId
      }));
    }
  }, [customerName, customerPhone, numericRestaurantId]);

  // Loyalty settings for points calculation
  const [loyaltySettings, setLoyaltySettings] = useState(null);

  // Points redemption state
  const [isUsingPoints, setIsUsingPoints] = useState(false);
  const [showNonQrBlockModal, setShowNonQrBlockModal] = useState(false);
  const [pointsToRedeem, setPointsToRedeem] = useState(0);
  const [pointsDiscount, setPointsDiscount] = useState(0);

  // Customer lookup state (phone-based identification)
  const [lookedUpCustomer, setLookedUpCustomer] = useState(null); // { found, name, total_points, tier }
  const [isLookingUp, setIsLookingUp] = useState(false);

  const [showPhoneError, setShowPhoneError] = useState(false);

  // Token management state
  const [authToken, setAuthToken] = useState(null);
  const [isLoadingToken, setIsLoadingToken] = useState(false);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  // SECURITY: Synchronous guard to prevent double-fire before React re-render disables the button.
  // useRef is used (not useState) because ref updates are synchronous and don't cause re-renders.
  const isPlacingOrderRef = useRef(false);
  // SECURITY: Tracks whether placeOrder API was dispatched in the current attempt.
  // Used to detect network-loss scenarios where order may have reached server but no response came back.
  const orderDispatchedRef = useRef(false);
  const deliveryChargeTimerRef = useRef(null); // BUG-2026-02-XX-001 Plan R3: debounce for cart-change delivery re-check

  // Countdown state for empty-cart redirect
  const [countdown, setCountdown] = useState(10);

  // Strip country code prefix from phone for PhoneInput (it handles country code via flag dropdown)
  const stripCountryCode = (phone) => {
    if (!phone) return '';
    if (phone.startsWith('+91')) return phone.slice(3);
    if (phone.startsWith('91') && phone.length > 10) return phone.slice(2);
    return phone;
  };

  // Pre-fill from sessionStorage first (for edit order scenarios)
  // Only pre-fill if stored restaurantId matches current restaurant
  useEffect(() => {
    try {
      const savedSession = sessionStorage.getItem(SESSION_CUSTOMER_KEY);
      if (savedSession) {
        const { name, phone, restaurantId: savedRestaurantId } = JSON.parse(savedSession);
        
        // Only pre-fill if restaurant matches (or no restaurantId stored - legacy data)
        if (savedRestaurantId && savedRestaurantId !== numericRestaurantId) {
          // Different restaurant - clear the stale data
          sessionStorage.removeItem(SESSION_CUSTOMER_KEY);
          return;
        }
        
        if (name && !customerName) setCustomerName(name);
        if (phone && !customerPhone) {
          // Store E.164 format (+91...) so PhoneInput shows India flag correctly
          const formattedPhone = phone.startsWith('+') ? phone : `+91${phone.replace(/^\+?91/, '')}`;
          setCustomerPhone(formattedPhone);
        }
      }
    } catch (e) {
      // Ignore parse errors
    }
  }, [numericRestaurantId]);

  // Pre-fill from guest capture (localStorage) - only if sessionStorage didn't have data
  // Only pre-fill if stored restaurantId matches current restaurant
  useEffect(() => {
    if (!isAuthenticated && !customerName && !customerPhone) {
      try {
        const savedGuest = localStorage.getItem('guestCustomer');
        if (savedGuest) {
          const { name, phone, restaurantId: savedRestaurantId, locked } = JSON.parse(savedGuest);

          // Only pre-fill if restaurant matches (or no restaurantId stored - legacy data)
          if (savedRestaurantId && savedRestaurantId !== numericRestaurantId) {
            // Different restaurant - clear the stale data
            localStorage.removeItem('guestCustomer');
            return;
          }

          if (name && !customerName) setCustomerName(name);
          if (phone && !customerPhone) {
            // Store E.164 format (+91...) so PhoneInput shows India flag correctly
            const formattedPhone = phone.startsWith('+') ? phone : `+91${phone.replace(/^\+?91/, '')}`;
            setCustomerPhone(formattedPhone);
          }
          // CR Phase-2 — if the guest was auto-populated from a checked-in room,
          // honour the lock flag so the fields render read-only.
          if (locked === true) setIsCustomerDetailsLocked(true);
        }
      } catch (e) {
        // Ignore parse errors
      }
    }
  }, [isAuthenticated, customerName, customerPhone, numericRestaurantId]);

  // Pre-fill from logged in user
  useEffect(() => {
    if (isAuthenticated && isCustomer && user) {
      if (user.name && !customerName) setCustomerName(user.name);
      if (user.phone && !customerPhone) {
        // Store E.164 format (+91...) so PhoneInput shows India flag correctly
        const phone = user.phone;
        const formattedPhone = phone.startsWith('+') ? phone : `+91${phone.replace(/^\+?91/, '')}`;
        setCustomerPhone(formattedPhone);
      }
      // Set looked up customer from auth user data
      setLookedUpCustomer({
        found: true,
        name: user.name || '',
        total_points: user.total_points || 0,
        tier: user.tier || 'Bronze',
      });
    }
  }, [isAuthenticated, isCustomer, user]);

  // Reset ALL form states when restaurant changes (scan & order app - user is at one restaurant at a time)
  // Uses localStorage to track previous restaurant ID (survives component re-mounts)
  const PREV_RESTAURANT_KEY = 'prevRestaurantId';
  
  useEffect(() => {
    const prevRestaurantId = localStorage.getItem(PREV_RESTAURANT_KEY);
    
    // Only reset if restaurant actually changed (not on initial mount)
    if (prevRestaurantId && prevRestaurantId !== numericRestaurantId && numericRestaurantId) {
      // Clear customer details
      setCustomerName('');
      setCustomerPhone('');
      setIsCustomerDetailsLocked(false);
      setLookedUpCustomer(null);
      
      // Clear table/room selection
      setTableNumber('');
      setRoomOrTable(null);
      
      // Clear order details
      setSpecialInstructions('');
      setCouponCode('');
      
      // Clear loyalty/points state
      setLoyaltySettings(null);
      setIsUsingPoints(false);
      setPointsToRedeem(0);
      setPointsDiscount(0);
      
      // Clear session/local storage for customer details
      sessionStorage.removeItem('sessionCustomerInfo');
      localStorage.removeItem('guestCustomer');
      
      // Clear auth token on restaurant change
      localStorage.removeItem('auth_token');
      
      logger.order(`Restaurant changed from ${prevRestaurantId} to ${numericRestaurantId} - cleared all form states`);
    }
    
    // Store current restaurant ID for next comparison (CartContext also does this, but this ensures it's set)
    if (numericRestaurantId) {
      localStorage.setItem(PREV_RESTAURANT_KEY, numericRestaurantId);
    }
  }, [numericRestaurantId]);

  // CR-2026-10-03-004 Part C: customer-lookup retired — F2=(a): no token → no points/tier block shown.
  // Name pre-fill comes from sessionStorage/guestCustomer (set at LandingPage). No retry, no toast.

  // Validate phone number (10 digits for India)
  const isPhoneNumberValid = useMemo(() => {
    // if (!customerPhone) return false;
    if (!customerPhone || customerPhone.trim() === '') {
      return true;
    }

    // Check if it's a valid international phone number
    if (!isValidPhoneNumber(customerPhone)) {
      return false;
    }

    // For India (+91), check if it's exactly 10 digits
    if (customerPhone.startsWith('+91')) {
      const digits = customerPhone.replace(/\D/g, '');
      const phoneDigits = digits.slice(2); // Remove country code (91)
      return phoneDigits.length === 10;
    }

    // For other countries, just check if it's valid
    return true;
  }, [customerPhone]);

  // Check if customer details are filled
  const isCustomerDetailsFilled = useMemo(() => {
    return customerName.trim().length > 0 && isPhoneNumberValid;
  }, [customerName, isPhoneNumberValid]);

  // Clear phone error when phone becomes valid
  useEffect(() => {
    if (isPhoneNumberValid && showPhoneError) {
      setShowPhoneError(false);
    }
  }, [isPhoneNumberValid, showPhoneError]);

  // Control visibility of coupon and loyalty sections
  // Show only if: (1) API value is true AND (2) Customer details are filled
  const showCoupon = useMemo(() => {
    if (!restaurant) return false;

    // Check API value (support multiple possible field names)
    const couponEnabled =
      restaurant.is_coupon === 'Yes';


    // Both conditions must be true + admin config toggle
    return couponEnabled && isCustomerDetailsFilled && configShowCouponCode;
  }, [restaurant, isCustomerDetailsFilled, configShowCouponCode]);

  const showLoyalty = useMemo(() => {
    if (!restaurant) return false;

    // Check API value (support multiple possible field names)
    const loyaltyEnabled =
      restaurant.is_loyalty === 'Yes';


    // Both conditions must be true + admin config toggle
    return loyaltyEnabled && isCustomerDetailsFilled && configShowLoyaltyPoints;
  }, [restaurant, isCustomerDetailsFilled, configShowLoyaltyPoints]);

  // Check if restaurant has multiple menus (table number required)
  const isMultiMenu = isMultipleMenu(restaurant);

  // Order page configurability flags - from admin config
  const showCustomerDetails = configShowCustomerDetails;
  const showCustomerName = configShowCustomerName;
  const showCustomerPhone = configShowCustomerPhone;
  const showCookingInstructions = configShowCookingInstructions;
  const showSpecialInstructions = configShowSpecialInstructions;
  const showPriceBreakdown = configShowPriceBreakdown;
  const showTableInfo = configShowTableInfo;

  // Payment options logic (FEAT-001)
  const hasRazorpayKey = !!restaurant?.razorpay?.razorpay_key;
  
  // Determine online payment availability based on order type
  const onlinePaymentEnabled = useMemo(() => {
    if (!hasRazorpayKey) return false;
    const orderType = scannedOrderType || 'dinein';
    if (orderType === 'dinein') return onlinePaymentDinein;
    if (orderType === 'takeaway') return onlinePaymentTakeaway;
    if (orderType === 'delivery') return onlinePaymentDelivery;
    return onlinePaymentDinein; // Default to dinein setting
  }, [hasRazorpayKey, scannedOrderType, onlinePaymentDinein, onlinePaymentTakeaway, onlinePaymentDelivery]);
  
  const showPaymentSelector = onlinePaymentEnabled && codEnabled;
  
  // Set default payment method based on available options
  useEffect(() => {
    if (onlinePaymentEnabled && !codEnabled) {
      setPaymentMethod('online');
    } else if (!onlinePaymentEnabled && codEnabled) {
      setPaymentMethod('cod');
    } else if (onlinePaymentEnabled && codEnabled) {
      setPaymentMethod('online'); // Default to online when both available
    }
  }, [onlinePaymentEnabled, codEnabled]);

  // Validate room/table selection and number (required for multi-menu restaurants)
  const isTableNumberValid = () => {
    if (!isMultiMenu) return true; // Not required for other restaurants
    if (!roomOrTable) return false; // Must select Room or Table
    return String(tableNumber || '').trim().length > 0; // Defensive: tableNumber may arrive as a number from session-storage write-back
  };

  // Handle room/table selection change
  const handleRoomOrTableChange = (value) => {
    setRoomOrTable(value);
    setTableNumber('');
  };

  // Handle change table button click
  // const handleChangeTable = () => {
  //   clearScannedTable();
  //   setTableNumber('');
  //   setRoomOrTable(null);
  // };

  // FEAT-002-PREP: Auto-fill table only for dine-in/room orders
  useEffect(() => {
    const is716 = String(restaurantId) === '716';
    const needsTableAutoFill = isDineInOrRoom(scannedOrderType) && scannedTableId;
    if (isScanned && needsTableAutoFill) {
      setTableNumber(scannedTableId); // Set table_id for API payload
      // Restaurant 716 (Hyatt Centric) is a room-only hotel — always use 'room' regardless of QR type
      setRoomOrTable(is716 ? 'room' : (scannedRoomOrTable || 'table'));
    }
  }, [isScanned, scannedTableId, scannedRoomOrTable, scannedOrderType, restaurantId]);

  // Restaurant 716: force 'room' type and start every new order with an empty selection.
  // Runs on mount (and whenever restaurantId changes) so returning to Review after a success
  // or switching restaurants always requires a fresh room pick.
  useEffect(() => {
    if (String(restaurantId) !== '716') return;
    setRoomOrTable('room');
    // Only clear tableNumber if the URL/scan didn't pre-fill it — the auto-fill effect above
    // will re-populate it on the next tick when a scanned tableId is present.
    if (!scannedTableId) {
      setTableNumber('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  const totalItems = getTotalItems();
  const subtotal = getTotalPrice();
  
  // Previous order subtotal (for edit mode)
  const previousSubtotal = isEditMode ? getPreviousOrderTotal() : 0;

  // Calculate totals (GST, VAT will be added in future)
  // ─── Tax Calculation (from cart items) ────────────────────────
  // CA-004: Uses centralized calculateTaxBreakdown utility
  const taxBreakdown = useMemo(() => {
    const isGstEnabled = restaurant?.gst_status === true || restaurant?.gst_status === 'Yes';
    
    logger.tax('=== TAX DEBUG START ===');
    logger.tax('GST Status (restaurant level):', isGstEnabled);
    logger.tax('Cart items (new):', cartItems.length);
    logger.tax('Previous order items:', previousOrderItems?.length || 0);

    // Normalize NEW cart items
    const newItems = cartItems.map((cartItem, index) => {
      const fullPrice = calculateCartItemPrice(cartItem);
      const taxPercent = parseFloat(cartItem.item.tax) || 0;
      const taxType = cartItem.item.tax_type || 'GST';

      logger.tax(`New Item ${index + 1}: ${cartItem.item.name?.substring(0, 20)}`);
      logger.tax(`  - Price: ₹${fullPrice}, Qty: ${cartItem.quantity}`);
      logger.tax(`  - Tax: ${taxPercent}% (${taxType})`);

      return { fullPrice, quantity: cartItem.quantity, taxPercent, taxType, isCancelled: false };
    });

    // Normalize PREVIOUS order items (exclude cancelled: foodStatus === 3)
    const prevItems = (previousOrderItems || []).map((prevItem, index) => {
      const fullPrice = prevItem.fullPrice ?? prevItem.price ?? 0;
      const quantity = prevItem.quantity || 1;
      const taxPercent = parseFloat(prevItem.item?.tax) || 0;
      const taxType = prevItem.item?.tax_type || 'GST';
      const isCancelled = prevItem.foodStatus === 3;

      if (!isCancelled) {
        logger.tax(`Previous Item ${index + 1}: ${prevItem.item?.name?.substring(0, 20)}`);
        logger.tax(`  - Full Price: ₹${fullPrice}, Qty: ${quantity}`);
        logger.tax(`  - Tax: ${taxPercent}% (${taxType})`);
      }

      return { fullPrice, quantity, taxPercent, taxType, isCancelled };
    });

    const result = calculateTaxBreakdown([...newItems, ...prevItems], isGstEnabled);

    logger.tax('=== TAX DEBUG SUMMARY ===');
    logger.tax(`Total GST: ₹${result.totalGst} (CGST: ₹${result.cgst}, SGST: ₹${result.sgst})`);
    logger.tax(`Total VAT: ₹${result.vat}`);
    logger.tax('=== TAX DEBUG END ===');

    return result;
  }, [cartItems, previousOrderItems, restaurant?.gst_status]);

  const { cgst, sgst, totalGst, vat, totalTax } = taxBreakdown;

  // ─── Final totals ──────────────────────────────────────────────
  // Item Total = sum of all item prices (before tax, before discounts)
  const itemTotal = previousSubtotal + subtotal;
  
  // Subtotal after discounts (this is the base for tax calculation)
  const subtotalAfterDiscount = Math.max(0, itemTotal - pointsDiscount);
  
  // Recalculate tax on discounted amount (proportional reduction)
  const discountRatio = itemTotal > 0 ? subtotalAfterDiscount / itemTotal : 1;
  const adjustedCgst = parseFloat((cgst * discountRatio).toFixed(2));
  const adjustedSgst = parseFloat((sgst * discountRatio).toFixed(2));
  const adjustedVat = parseFloat((vat * discountRatio).toFixed(2));
  const adjustedTotalTax = parseFloat((adjustedCgst + adjustedSgst + adjustedVat).toFixed(2));

  // ─── Service Charge Mapping (SERVICE_CHARGE_MAPPING CR) ─────────
  // Read service-charge keys from restaurant_details API
  const scAutoApply        = restaurant?.auto_service_charge === 'Yes';
  const scPct              = parseFloat(restaurant?.service_charge_percentage) || 0;
  const scGstRate          = parseFloat(restaurant?.service_charge_tax) || 0;
  // D-1 (DELIVERY_CHARGE_GATING CR): SC applies only to dine-in / room. Takeaway and delivery exempted.
  // isDineInOrRoom returns true for 'dinein', 'room', and null/undefined (legacy QR codes — backward compat).
  const applyServiceCharge = scAutoApply && scPct > 0 && isDineInOrRoom(scannedOrderType);
  const isGstEnabledForSc  = restaurant?.gst_status === true || restaurant?.gst_status === 'Yes';

  // SC base = subtotalAfterDiscount (R2). GST-on-SC gated by gst_status & scGstRate (R3).
  const serviceCharge      = applyServiceCharge
                              ? subtotalAfterDiscount * scPct / 100
                              : 0;
  const gstOnServiceCharge = (applyServiceCharge && isGstEnabledForSc && scGstRate > 0)
                              ? serviceCharge * scGstRate / 100
                              : 0;
  const scCgst             = parseFloat((gstOnServiceCharge / 2).toFixed(2));
  const scSgst             = parseFloat((gstOnServiceCharge / 2).toFixed(2));

  // ─── Delivery Charge gating (DELIVERY_CHARGE_GATING CR D-2) ─────
  // Delivery charge from CartContext is non-zero only when delivery address is selected,
  // but we additionally gate on orderType === 'delivery' for explicit safety.
  const includeDelivery   = scannedOrderType === 'delivery';
  // CR-2026-02-XX-002: POS restaurant.takeaway_charges funds packaging fee for takeaway orders.
  // Returns 0 for all other order types and restaurants that have no takeaway_charges configured.
  const takeawaySurcharge = (scannedOrderType === 'takeaway')
                          ? (restaurant?.takeaway_charges || 0)
                          : 0;
  const effectiveDeliveryCharge = (includeDelivery
                                ? (parseFloat(deliveryCharge) || 0)
                                : 0) + takeawaySurcharge;

  // ─── Delivery GST (DELIVERY_CHARGE_GATING CR D-3, updated CR-2026-06-17-004) ─────
  // Priority chain: prefer delivery-specific rate from POS (delivery_charge_gst),
  // fall back to general item GST rate (gst_tax_percent), else 0.
  // Gated by gst_status (R3), includeDelivery (D-2), rate > 0, delivery > 0.
  // Folds into total_gst_tax_amount via finalCgst/finalSgst — no new payload field.
  const deliveryGstRate     = parseFloat(restaurant?.delivery_charge_gst) || parseFloat(restaurant?.gst_tax_percent) || 0;
  const applyDeliveryGst    = includeDelivery && isGstEnabledForSc && deliveryGstRate > 0 && effectiveDeliveryCharge > 0;
  const gstOnDeliveryCharge = applyDeliveryGst ? effectiveDeliveryCharge * deliveryGstRate / 100 : 0;
  const deliveryCgst        = parseFloat((gstOnDeliveryCharge / 2).toFixed(2));
  const deliverySgst        = parseFloat((gstOnDeliveryCharge / 2).toFixed(2));

  // Uniform tax rates across items (for compliance display). null if mixed.
  const gstItems = (cartItems || []).filter(i => (i?.item?.tax_type || '').toUpperCase() === 'GST');
  const vatItems = (cartItems || []).filter(i => (i?.item?.tax_type || '').toUpperCase() === 'VAT');
  const uniqueGstRates = [...new Set(gstItems.map(i => parseFloat(i?.item?.tax) || 0))];
  const uniqueVatRates = [...new Set(vatItems.map(i => parseFloat(i?.item?.tax) || 0))];
  const gstRate = uniqueGstRates.length === 1 ? uniqueGstRates[0] : null;
  const vatRate = uniqueVatRates.length === 1 ? uniqueVatRates[0] : null;

  // Split aggregates (R4: SC-GST kept separate for display; VAT untouched)
  const itemCgst      = adjustedCgst;
  const itemSgst      = adjustedSgst;
  // D-3 (DELIVERY_CHARGE_GATING CR): include delivery-CGST/SGST alongside item-CGST/SGST and SC-CGST/SGST.
  const finalCgst     = parseFloat((adjustedCgst + scCgst + deliveryCgst).toFixed(2));
  const finalSgst     = parseFloat((adjustedSgst + scSgst + deliverySgst).toFixed(2));
  const finalVat      = adjustedVat;
  const finalTotalTax = parseFloat((finalCgst + finalSgst + finalVat).toFixed(2));
  // D-2 (DELIVERY_CHARGE_GATING CR): include delivery charge in subtotal so it flows into totalToPay and order_amount.
  const finalSubtotal = parseFloat((subtotalAfterDiscount + serviceCharge + effectiveDeliveryCharge).toFixed(2));

  // Grand Total = finalSubtotal + finalTotalTax (R5: single round at the end)
  const totalToPay = parseFloat((finalSubtotal + finalTotalTax).toFixed(2));

  // Round up to ceiling if restaurant has total_round enabled
  const isRoundingEnabled = restaurant?.total_round === 'Yes';
  const roundedTotal = isRoundingEnabled ? Math.ceil(totalToPay) : totalToPay;
  const hasRoundingDiff = isRoundingEnabled && roundedTotal !== totalToPay;
  // ROUND_UP_PAYLOAD_GAP fix — positive round-off amount (roundedTotal - totalToPay),
  // 0 when round-off is disabled. Threaded into place/update order payloads as `round_up`.
  const roundUpAmount = isRoundingEnabled
    ? Math.max(0, parseFloat((roundedTotal - totalToPay).toFixed(2)))
    : 0;

  // console.log('totalTax', totalTax);
  // console.log('totalGst', totalGst);
  // console.log('totalVat', vat);
  // console.log('cgst', cgst);
  // console.log('sgst', sgst);
  // console.log('vat', vat);
  // console.log('subtotal', subtotal);
  // console.log('totalToPay', totalToPay);


  // Get token on component mount
  useEffect(() => {
    const fetchToken = async () => {
      setIsLoadingToken(true);
      try {
        // console.log('[ReviewOrder] Fetching auth token...');
        const token = await getAuthToken(); // Will get new token or use existing if valid
        setAuthToken(token);
        // console.log('[ReviewOrder] Token ready');
      } catch (error) {
        // console.error('[ReviewOrder] Failed to get auth token:', error);
        toast.error('Unable to initialize. Please refresh the page.');
      } finally {
        setIsLoadingToken(false);
      }
    };

    fetchToken();
  }, []); // Only run once on mount

  // BUG-2026-02-XX-001 Plan R3: Re-check delivery charge whenever cart total (subtotal) changes.
  // Extends R2 (mount-only fix) to also cover cart modifications while already on ReviewOrder.
  // Guards at the top ensure the API only fires for delivery orders with a valid saved address;
  // all other order types hit the first guard and return immediately — zero API calls.
  useEffect(() => {
    if (scannedOrderType !== 'delivery') return;
    if (!deliveryAddress?.latitude || !deliveryAddress?.longitude) return;
    if (!restaurantId) return;

    if (deliveryChargeTimerRef.current) clearTimeout(deliveryChargeTimerRef.current);

    deliveryChargeTimerRef.current = setTimeout(async () => {
      try {
        const MANAGE_BASE_URL = process.env.REACT_APP_IMAGE_BASE_URL || 'https://manage.mygenie.online';
        const res = await fetch(`${MANAGE_BASE_URL}/api/v1/config/distance-api-new`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            destination_lat: String(deliveryAddress.latitude),
            destination_lng: String(deliveryAddress.longitude),
            restaurant_id: String(restaurantId),
            order_value: String(subtotal || 0),
          }),
        });
        const data = await res.json();
        if (data?.shipping_status === 'Yes') {
          setDeliveryCharge(parseFloat(data.shipping_charge) || 0);
        }
      } catch {
        // Silent fail — stale charge is shown; order flow must not be blocked
      }
    }, 500);

    return () => {
      if (deliveryChargeTimerRef.current) clearTimeout(deliveryChargeTimerRef.current);
    };
  // BUG-2026-02-XX-001 Plan R5: added scannedOrderType to dep array.
  // useScannedTable initialises scannedTable as null (useState(null)) and loads from sessionStorage
  // inside its own useEffect — so scannedOrderType is null on the very first render of ReviewOrder.
  // On fresh mount the effect fires, guard "scannedOrderType !== 'delivery'" blocks it (null !== 'delivery'),
  // then useScannedTable's effect sets scannedOrderType to 'delivery', but subtotal and deliveryAddress
  // are unchanged so the effect never re-fires — leaving a stale delivery charge.
  // Adding scannedOrderType ensures the effect re-fires when it transitions null → 'delivery'.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal, deliveryAddress, scannedOrderType]); // BUG-2026-02-XX-001 Plan R5

  // Auto-redirect if cart is empty — counts down 10→0 then goes to LandingPage
  useEffect(() => {
    if (totalItems === 0) {
      setCountdown(10);

      const tickInterval = setInterval(() => {
        setCountdown(prev => (prev > 0 ? prev - 1 : 0));
      }, 1000);

      const redirectTimer = setTimeout(() => {
        if (restaurantId) {
          if (isMultiMenu) {
            navigate(`/${restaurantId}/stations`, { replace: true });
          } else {
            navigate(`/${restaurantId}/menu`, { replace: true });
          }
        }
      }, 10000); // 10 seconds = 10000ms

      return () => {
        clearInterval(tickInterval);
        clearTimeout(redirectTimer);
      };
    }
  }, [totalItems, navigate, restaurantId, isMultiMenu]);

  // Handle back button click
  const handleBackClick = () => {
    if (restaurantId) {
      if (isMultiMenu) {
        navigate(`/${restaurantId}/menu/${stationId}`);
      } else {
        navigate(`/${restaurantId}/menu`);
      }
    }
  };

  // Handle navigate to menu — routes through LandingPage so business logic
  // (check table status → Edit Order or Browse Menu) is always applied.
  const handleNavigateToMenu = () => {
    if (restaurantId) {
      if (isMultiMenu) {
        navigate(`/${restaurantId}/stations`, { replace: true });
      } else {
        navigate(`/${restaurantId}`, { replace: true });
      }
    }
  };

  // Handle loyalty points redemption
  // CR-2026-10-03-004 Part B: G1 per-tier redemption value; G3 CRM redemption caps enforced
  const handleUsePoints = () => {
    const availablePoints = isAuthenticated ? (user?.total_points || 0) : (lookedUpCustomer?.total_points || 0);
    const tier = (isAuthenticated ? user?.tier : lookedUpCustomer?.tier) || 'Bronze';
    const tierKey = `${tier.toLowerCase()}_redemption_value`;
    const redemptionValue = loyaltySettings?.[tierKey] || loyaltySettings?.bronze_redemption_value || 0;

    if (!availablePoints || !redemptionValue) return;

    // G3: CRM caps — each enforced independently; most restrictive wins
    const minPoints = loyaltySettings?.min_redemption_points || 0;
    if (availablePoints < minPoints) return; // below floor — cannot redeem

    // Cap 1: can't exceed subtotal
    let maxDiscount = subtotal;
    // Cap 2: max_redemption_percent (% of subtotal)
    const maxPct = loyaltySettings?.max_redemption_percent;
    if (maxPct) maxDiscount = Math.min(maxDiscount, subtotal * (maxPct / 100));
    // Cap 3: max_redemption_amount (absolute ₹ ceiling, e.g. ₹110 on restaurant 689)
    const maxAmt = loyaltySettings?.max_redemption_amount;
    if (maxAmt) maxDiscount = Math.min(maxDiscount, maxAmt);

    const maxPointsToUse = Math.floor(maxDiscount / redemptionValue);
    const pointsToUse = Math.min(availablePoints, maxPointsToUse);
    const discount = pointsToUse * redemptionValue;

    setPointsToRedeem(pointsToUse);
    setPointsDiscount(discount);
    setIsUsingPoints(true);
  };

  // Handle remove points redemption
  const handleRemovePoints = () => {
    setPointsToRedeem(0);
    setPointsDiscount(0);
    setIsUsingPoints(false);
  };

  // Handle place order
  const handlePlaceOrder = async () => {
    // CR-2026-05-30-002 — Guard C3 (Place/Update Order).
    // Final defence: even if C1/C2 were bypassed (e.g. customer arrived from a
    // deep link to /review-order, or admin flipped the flag mid-session),
    // refuse to submit a non-QR order.
    {
      const policy = shouldBlockNonQrOrder(
        {
          restaurantId,
          isScanned,
          scannedTableId,
          scannedRoomOrTable,
          scannedOrderType,
          isEditMode,
        },
        { allowNonQrOrders }
      );
      // BUG-2026-10-06-001: record the decision on both paths when enforced.
      if (allowNonQrOrders === false) {
        postNonQrBlock(
          buildNonQrBlockPayload(
            { restaurantId, scannedRoomOrTable, scannedTableId, isEditMode, isAuthenticated },
            'place_order',
            policy
          )
        );
      }
      if (policy.block) {
        clearCart();
        setShowNonQrBlockModal(true);
        return;
      }
    }

    // CR-2026-08-06-001: Channel time gate — hard block if channel is currently closed
    {
      const _chCfg = { deliveryShifts, takeawayShifts, dineInShifts, roomShifts, walkinShifts, restaurantShifts, restaurantOpen };
      if (!isChannelOpen(scannedOrderType || 'dinein', _chCfg)) {
        const opensAt = getChannelNextOpenTime(scannedOrderType || 'dinein', _chCfg);
        const chLabel =
          scannedOrderType === 'delivery' ? 'Delivery' :
          scannedOrderType === 'takeaway' ? 'Takeaway' :
          scannedOrderType === 'room'     ? 'Room service' :
          scannedOrderType === 'walkin'   ? 'Walk-in orders' : 'Ordering';
        toast.error(
          opensAt
            ? `${chLabel} is unavailable right now. Opens at ${opensAt}.`
            : `${chLabel} is currently unavailable.`,
          { duration: 4000 }
        );
        return;
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CR Phase-1 — Room Scanner Safety Guard (pre-submit)
    // ─────────────────────────────────────────────────────────────────────────
    // For QR flows where URL says `type=room`, prevent the silent
    // table_id='0' fallback at line ~949 from leaking a room order to WC.
    //
    // 716 NATURAL EXCLUSION: 716 uses manual room selection (no QR scan).
    // For 716, scannedRoomOrTable is null when entered via direct URL, so
    // this guard does NOT fire. For 716 with an actual room QR scan,
    // scannedTableId is valid and the guard passes through. Either way,
    // 716's existing dedicated block immediately below remains the source
    // of truth for 716.
    if (
      String(restaurantId) !== '716' &&
      scannedRoomOrTable === 'room' &&
      !hasAssignedTable(scannedTableId)
    ) {
      toast.error('Room context lost. Please rescan the QR code.');
      return;
    }

    // Restaurant 716 (Hyatt Centric): room selection is mandatory for every new order, no fallback.
    if (String(restaurantId) === '716') {
      if (!String(tableNumber || '').trim() || !hasAssignedTable(tableNumber)) {
        toast('Please select your Room');
        return;
      }
    } else if (isMultiMenu && hasAssignedTable(scannedTableId)) {
      // Phase 1: Table was scanned — it's auto-filled, no manual validation needed
    } else if (isMultiMenu && !hasAssignedTable(scannedTableId) && isDineInOrRoom(scannedOrderType) && !scannedOrderType) {
      // Legacy: multi-menu with no QR scan and no orderType — require manual table selection
      if (!roomOrTable) {
        toast('Please Select Your Room or Table');
        return;
      }
      if (!String(tableNumber || '').trim()) {
        const message = roomOrTable === 'room'
          ? 'Please Enter Your Room Number'
          : 'Please Enter Your Table Number';
        toast(message);
        return;
      }
    }
    // Walk-in (dinein/takeaway/delivery with no tableId) — no table validation needed

    // Validate phone number only if provided (optional field)
    if (customerPhone && customerPhone.trim() !== '' && !isPhoneNumberValid) {
      setShowPhoneError(true);
      toast.error('Please enter a valid 10-digit phone number');
      return;
    }

    // CR-2026-09-07-001: Layer 3 pre-submission cache-check.
    // Reads React Query cache — no API call. Layer 3 API (422) is the backstop for cache misses.
    {
      const cachedMenu = queryClient.getQueryData(['menuSections', restaurantId, stationId]) || [];
      const stockProblems = [];
      for (const cartItem of cartItems) {
        const foodId = String(cartItem.itemId);
        let cachedItem = null;
        outer: for (const section of cachedMenu) {
          for (const it of (section.items || [])) {
            if (String(it.id) === foodId) { cachedItem = it; break outer; }
          }
        }
        if (!cachedItem) continue; // cache miss — Layer 3 (422) backstop handles it
        if (cachedItem.stock_out === 'Y') {
          stockProblems.push({ type: 'oos', name: cartItem.item?.name || 'Item' });
        } else if (
          cachedItem.food_stock !== null &&
          cachedItem.food_stock > 0 &&
          cartItem.quantity > cachedItem.food_stock
        ) {
          stockProblems.push({
            type: 'low',
            name: cartItem.item?.name || 'Item',
            available: cachedItem.food_stock,
            inCart: cartItem.quantity,
          });
        }
      }
      if (stockProblems.length > 0) {
        const parts = stockProblems.map(p =>
          p.type === 'oos'
            ? `${p.name} is sold out`
            : `Only ${p.available} ${p.name} available (you have ${p.inCart})`
        );
        const msg = stockProblems.length === 1
          ? (stockProblems[0].type === 'oos'
              ? `"${stockProblems[0].name}" is sold out. Please remove it from your cart to continue.`
              : `Only ${stockProblems[0].available} "${stockProblems[0].name}" available. You have ${stockProblems[0].inCart} in your cart.`)
          : `Some items need attention: ${parts.join(' · ')}`;
        toast.error(msg, { duration: 6000 });
        return;
      }
    }

    // SECURITY FIX 1: Synchronous double-click guard.
    // Placed AFTER validation so early returns don't permanently lock the ref.
    // React's setState is async — setIsPlacingOrder(true) doesn't disable the button
    // until the next render cycle. A fast double-click can bypass the disabled check.
    // This ref check is synchronous and blocks any concurrent invocation immediately.
    if (isPlacingOrderRef.current) return;
    isPlacingOrderRef.current = true;
    orderDispatchedRef.current = false; // Reset dispatch tracker for this attempt

    // Clear phone error if phone is empty (optional)
    if (!customerPhone || customerPhone.trim() === '') {
      setShowPhoneError(false);
    }

    // Check if token is expired and get new one if needed
    let token = authToken;

    if (!token || isTokenExpired()) {
      setIsLoadingToken(true);
      try {
        // console.log('[ReviewOrder] Token expired or missing, fetching new token...');
        token = await getAuthToken();
        setAuthToken(token);
        // console.log('[ReviewOrder] New token obtained');
      } catch (error) {
        // console.error('[ReviewOrder] Failed to get token:', error);
        toast.error('Session expired. Please refresh the page and try again.');
        setIsLoadingToken(false);
        isPlacingOrderRef.current = false;
        return;
      } finally {
        setIsLoadingToken(false);
      }
    }

    // === CA-008 Phase 2: Shared Razorpay checkout function ===
    // Defined BEFORE try/catch so it's accessible in both main flow and 401 retry flow
    const openRazorpayCheckout = async (orderResponse, label = 'Razorpay') => {
      logger.razorpay(`[${label}] Payment required:`, {
        razorpay_id: orderResponse.razorpay_id,
        razorpay_key: restaurant.razorpay.razorpay_key,
        order_id: orderResponse.order_id,
        total_amount: orderResponse.total_amount
      });

      const createOrderResponse = await fetchWithTimeout(ENDPOINTS.RAZORPAY_CREATE_ORDER(), {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: String(orderResponse.order_id) })
      }, DEFAULT_WRITE_TIMEOUT_MS); // CR-2026-02-XX-001 — 15 s write (POS)

      const razorpayOrder = await createOrderResponse.json();
      logger.razorpay(`[${label}] Create order response:`, razorpayOrder);

      if (razorpayOrder.error) {
        throw new Error(razorpayOrder.message || 'Failed to create Razorpay order');
      }

      const billSummary = buildBillSummary({ itemTotal, pointsDiscount, pointsToRedeem, subtotalAfterDiscount, serviceCharge, finalSubtotal, itemCgst, itemSgst, scCgst, scSgst, finalCgst, finalSgst, finalVat, finalTotalTax, gstRate, vatRate, scGstRate, roundedTotal, hasRoundingDiff, totalToPay });

      const options = {
        key: razorpayOrder.key || restaurant.razorpay.razorpay_key,
        amount: razorpayOrder.amount_in_paise || (orderResponse.total_amount * 100),
        currency: 'INR',
        name: restaurant?.name || 'Restaurant',
        description: `Order #${orderResponse.order_id}`,
        order_id: razorpayOrder.order_id,
        handler: function (paymentResponse) {
          logger.razorpay(`[${label}] Payment success:`, paymentResponse);
          clearCart();
          // Restaurant 716: every new order must require a fresh room selection.
          if (String(restaurantId) === '716') {
            setTableNumber('');
            setRoomOrTable('room');
          }
          navigate(`/${restaurantId}/order-success`, {
            state: {
              orderData: {
                orderId: orderResponse.order_id,
                totalToPay: orderResponse.total_amount,
                paymentId: paymentResponse.razorpay_payment_id,
                razorpayOrderId: paymentResponse.razorpay_order_id,
                razorpaySignature: paymentResponse.razorpay_signature,
                isPaid: true,
                isEditedOrder: isEditMode,
                billSummary
              }
            }
          });
        },
        prefill: {
          name: customerName || '',
          contact: customerPhone || ''
        },
        theme: {
          color: restaurant?.primaryColor || DEFAULT_THEME.primaryColor
        },
        modal: {
          ondismiss: function () {
            logger.razorpay(`[${label}] Payment modal dismissed`);
            toast.error('Payment cancelled');
            setIsPlacingOrder(false);
            isPlacingOrderRef.current = false;
            orderDispatchedRef.current = false;
          }
        }
      };

      const razorpay = new window.Razorpay(options);
      razorpay.open();
    };

    // Place order or Update order (if in edit mode)
    setIsPlacingOrder(true);
    let response; // BUG-2026-09-08-001: must be outside try{} so catch{} can read it
    try {
      // Phase 1: Table ID only when a specific table was scanned. All others get '0'.
      const finalTableId = hasAssignedTable(scannedTableId)
        ? scannedTableId
        : (isMultiMenu && tableNumber && hasAssignedTable(tableNumber) ? tableNumber : '0');

      // Restaurant 716: room pick is mandatory, never send '0' to POS.
      if (String(restaurantId) === '716' && !hasAssignedTable(finalTableId)) {
        toast('Please select your Room');
        setIsPlacingOrder(false);
        isPlacingOrderRef.current = false;
        return;
      }

      // Check if we're in edit mode
      if (isEditMode && editingOrderId) {
        // ═══ BUG-039 FIX: Set orderDispatchedRef before edit order API call ═══
        // Same as new order flow — if network drops during updateCustomerOrder,
        // catch block will show duplicate-prevention warning instead of generic error
        orderDispatchedRef.current = true;
        
        // FIRST: Check if table is still occupied before updating
        if (finalTableId && String(finalTableId) !== '0') {
          try {
            const tableStatus = await checkTableStatus(finalTableId, restaurantId, token);
            
            // If table is FREE, redirect to landing page for fresh order
            if (!tableStatus.isOccupied || !tableStatus.orderId) {
              clearEditMode();
              clearCart();
              toast('Table is now free. Redirecting to start fresh order.', { icon: 'ℹ️' });
              setIsPlacingOrder(false);
              isPlacingOrderRef.current = false;
              navigate(`/${restaurantId}`, { replace: true });
              return;
            }
          } catch (tableCheckErr) {
            logger.error('table', 'Table status check failed:', tableCheckErr);
            // Continue with order on error (fail-safe)
          }
        }

        // VERIFY: Check if original order is still active before updating
        try {
          const currentOrderDetails = await getOrderDetails(editingOrderId);
          if (currentOrderDetails.fOrderStatus === 3 || currentOrderDetails.fOrderStatus === 6) {
            // Order is cancelled or paid - can't update, clear edit mode and place as new
            toast('Order has been completed. Placing as new order.', { icon: 'ℹ️' });
            clearEditMode();
            // Don't return - fall through to place new order
          } else {
            // Order is still active - proceed with update
            response = await updateCustomerOrder({
              orderId: editingOrderId,
              cartItems,
              restaurantId,
              tableId: finalTableId,
              orderType: scannedOrderType || 'dinein',
              paymentType: 'postpaid',
              orderNote: specialInstructions,
              authToken: token,
              customerName,
              customerPhone: customerPhone || '',
              totalToPay: roundedTotal,
              subtotal: subtotalAfterDiscount,
              totalTax: finalTotalTax,
              pointsDiscount,
              pointsRedeemed: pointsToRedeem,
              // SC fields (SERVICE_CHARGE_MAPPING CR)
              serviceCharge,
              gstOnServiceCharge,
              itemTotal,
              finalSubtotal,
              // Multi-menu parity additions (478 contract alignment)
              totalGstTaxAmount: finalCgst + finalSgst,
              totalVatTaxAmount: finalVat,
              gstEnabled: isGstEnabledForSc,
              // D-5 (DELIVERY_CHARGE_GATING CR): wire gated delivery charge to edit-order writer (consumed by D-6)
              deliveryCharge: effectiveDeliveryCharge,
              // ROUND_UP_PAYLOAD_GAP fix — propagate computed round-off diff
              roundUpAmount,
            });

            // Clear edit mode after successful update
            clearEditMode();
            
            toast.success('Order updated successfully!');
          }
        } catch (orderCheckErr) {
          logger.error('order', 'Failed to verify order status:', orderCheckErr);
          // On error, try to update anyway (fail-safe)
          response = await updateCustomerOrder({
            orderId: editingOrderId,
            cartItems,
            restaurantId,
            tableId: finalTableId,
            orderType: scannedOrderType || 'dinein',
            paymentType: 'postpaid',
            orderNote: specialInstructions,
            authToken: token,
            customerName,
            customerPhone: customerPhone || '',
            totalToPay: roundedTotal,
            subtotal: subtotalAfterDiscount,
            totalTax: finalTotalTax,
            pointsDiscount,
            pointsRedeemed: pointsToRedeem,
            // SC fields (SERVICE_CHARGE_MAPPING CR)
            serviceCharge,
            gstOnServiceCharge,
            itemTotal,
            finalSubtotal,
            // Multi-menu parity additions (478 contract alignment)
            totalGstTaxAmount: finalCgst + finalSgst,
            totalVatTaxAmount: finalVat,
            gstEnabled: isGstEnabledForSc,
            // D-5 (DELIVERY_CHARGE_GATING CR): wire gated delivery charge to edit-order writer (consumed by D-6)
            deliveryCharge: effectiveDeliveryCharge,
            // ROUND_UP_PAYLOAD_GAP fix — propagate computed round-off diff
            roundUpAmount,
          });
          clearEditMode();
          toast.success('Order updated successfully!');
        }
      }
      
      // Place new order (either not in edit mode, or edit mode was cleared due to paid/cancelled order)
      if (!response) {
        // CRITICAL HARDCODING: Restaurant 716 (Hyatt Centric) allows multiple orders per table
        // Skip table status check for 716 - they don't use edit order flow
        // See: CODE_AUDIT.md Section 11 for documentation
        const skipTableCheckFor716 = String(restaurantId) === '716';
        
        // NEW: Check table status before placing new order (prevent duplicate orders)
        // Skip for restaurant 716 which allows multiple orders on same table
        if (!skipTableCheckFor716 && finalTableId && String(finalTableId) !== '0') {
          try {
            const tableStatus = await checkTableStatus(finalTableId, restaurantId, token);
            if (tableStatus.isOccupied && tableStatus.orderId) {
              // Table already has an active order - block new order
              toast.error('This table already has an active order. Please edit the existing order instead.');
              setIsPlacingOrder(false);
              isPlacingOrderRef.current = false;
              navigate(`/${restaurantId}`);
              return;
            }
          } catch (tableCheckErr) {
            logger.error('table', 'Table status check failed:', tableCheckErr);
            // Continue with order on error (fail-safe)
          }
        }

        // CR-2026-06-17-003 APP-12: Pre-place-order availability validation
        // Force-refresh the menu cache (APP-13 dependency) before validating.
        try {
          await queryClient.refetchQueries({ queryKey: ['menuSections', restaurantId, stationId] });
        } catch (refetchErr) {
          logger.warn('order', 'Menu refetch failed, using cached data:', refetchErr);
        }
        const freshMenuData = queryClient.getQueryData(['menuSections', restaurantId, stationId]) || [];
        const itemLookup = new Map();
        for (const section of freshMenuData) {
          for (const item of (section.items || [])) {
            itemLookup.set(String(item.id), { ...item, _categoryId: section.categoryId || section.category_id });
          }
        }

        const blockedItems = cartItems.filter(ci => {
          const item = itemLookup.get(String(ci.itemId || ci.id));
          if (!item) return false; // unknown items: don't block
          const catTiming = categoryTimings?.[item._categoryId];
          const itmTiming = itemTimings?.[String(ci.itemId || ci.id)];
          return !isItemAvailable(item, currentTimeInSeconds, { categoryTiming: catTiming, itemTiming: itmTiming });
        });

        if (blockedItems.length > 0) {
          const names = blockedItems.map(b => b.name).join(', ');
          toast.error(`Some items are no longer available and were removed from your order: ${names}. Please review and try again.`, {
            duration: 6000,
          });
          blockedItems.forEach(b => removeFromCart(b.cartId || b.id));
          setIsPlacingOrder(false);
          isPlacingOrderRef.current = false;
          return;
        }
        // END CR-2026-06-17-003 APP-12

        // Place new order
        // SECURITY: Mark that the API call is about to be dispatched.
        // If a network error occurs (no response), this flag tells the catch block
        // that the request may have reached the server even though we got no response.
        orderDispatchedRef.current = true;
        
        // Check if GST is enabled at restaurant level
        const isGstEnabled = restaurant?.gst_status === true || restaurant?.gst_status === 'Yes';
        
        // Determine payment type based on user selection (FEAT-001)
        // 'online' → 'prepaid' (Razorpay), 'cod' → 'postpaid'
        const selectedPaymentType = paymentMethod === 'online' ? 'prepaid' : 'postpaid';
        const shouldTriggerRazorpay = paymentMethod === 'online' && hasRazorpayKey;
        
        // DEBUG: Log payment configuration before placing order
        logger.order('[FEAT-001] Payment Config:', {
          paymentMethod,
          selectedPaymentType,
          shouldTriggerRazorpay,
          hasRazorpayKey,
          codEnabled,
          onlinePaymentEnabled,
          restaurantId,
          tableId: finalTableId
        });
        
        response = await placeOrder({
          cartItems,
          customerName,
          customerPhone: customerPhone || '',
          tableNumber: finalTableId,
          specialInstructions,
          couponCode,
          restaurantId,
          subtotal,
          totalToPay: roundedTotal,
          totalTax: finalTotalTax,
          orderType: scannedOrderType,
          isMultipleMenuType: isMultiMenu,
          token,
          // Points redemption
          pointsRedeemed: pointsToRedeem,
          pointsDiscount: pointsDiscount,
          // GST status
          gstEnabled: isGstEnabled,
          // Payment type based on user selection (FEAT-001)
          paymentType: selectedPaymentType,
          // Delivery address (Phase 3)
          deliveryAddress: deliveryAddress || null,
          deliveryCharge: effectiveDeliveryCharge,   // D-5 (DELIVERY_CHARGE_GATING CR): use D-2 gated value (0 on non-delivery)
          // SC fields (SERVICE_CHARGE_MAPPING CR)
          serviceCharge,
          gstOnServiceCharge,
          itemTotal,
          finalSubtotal,
          // Multi-menu parity additions (478 contract alignment)
          totalGstTaxAmount: finalCgst + finalSgst,
          totalVatTaxAmount: finalVat,
          // ROUND_UP_PAYLOAD_GAP fix — propagate computed round-off diff
          roundUpAmount,
        });
      }

      // DEBUG: Log full response to verify razorpay_id
      logger.order('[PlaceOrder Response]', response);

      // Check if Razorpay payment flow needed (only for online payment selection)
      const shouldProcessRazorpay = paymentMethod === 'online' && response?.razorpay_id && restaurant?.razorpay?.razorpay_key;
      
      if (shouldProcessRazorpay) {
        try {
          await openRazorpayCheckout(response, 'Razorpay');
          return; // Don't proceed to success page yet - wait for payment
        } catch (razorpayError) {
          logger.error('razorpay', 'Failed to create order:', razorpayError);
          toast.error('Payment initialization failed. Please try again.');
          setIsPlacingOrder(false);
          isPlacingOrderRef.current = false;
          return;
        }
      }

      // Clear cart after successful order (non-payment flow)
      clearCart();

      // Restaurant 716: every new order must require a fresh room selection.
      if (String(restaurantId) === '716') {
        setTableNumber('');
        setRoomOrTable('room');
      }

      // Navigate to success page with order data
      navigate(`/${restaurantId}/order-success`, {
        state: {
          orderData: {
            orderId: response?.order_id || editingOrderId || null,
            totalToPay: response?.total_amount || roundedTotal.toFixed(2),
            isEditedOrder: isEditMode,
            items: buildOrderItems(cartItems),
            previousItems: buildPreviousItems(previousOrderItems, isEditMode),
            billSummary: buildBillSummary({ itemTotal, pointsDiscount, pointsToRedeem, subtotalAfterDiscount, serviceCharge, finalSubtotal, itemCgst, itemSgst, scCgst, scSgst, finalCgst, finalSgst, finalVat, finalTotalTax, gstRate, vatRate, scGstRate, roundedTotal, hasRoundingDiff, totalToPay })
          }
        }
      });

    } catch (error) {
      // console.error('[ReviewOrder] Failed to place order:', error);

      // SECURITY FIX 2: Network-loss duplicate order prevention.
      // If error.response is undefined, the request was sent but no response was received
      // (network drop, timeout, server crash mid-request). The order MAY have been processed
      // server-side. We must NOT silently retry or show a generic "try again" message —
      // doing so risks placing a duplicate order.
      // SECURITY FIX 2 (refined): Only flag true network loss.
      // Conditions, ALL must hold:
      //   (a) we dispatched the request (`orderDispatchedRef`),
      //   (b) we never received a response object back (`!response`),
      //   (c) axios reports no HTTP response (`!error.response`),
      //   (d) the error looks like a real transport-layer failure.
      // This avoids misclassifying post-success JS exceptions (e.g.
      // buildBillSummary / clearCart / navigate throwing AFTER placeOrder
      // resolved with a real order_id) as "network loss", which previously
      // showed the duplicate-order warning even though the order succeeded.
      const isTransportError =
        error?.isAxiosError === true ||
        error?.code === 'ECONNABORTED' ||
        error?.code === 'ERR_NETWORK' ||
        error?.code === 'ETIMEDOUT' ||
        error?.message === 'Network Error';
      const isTrueNetworkLoss =
        orderDispatchedRef.current &&
        !response &&
        !error?.response &&
        isTransportError;

      if (isTrueNetworkLoss) {
        toast.error(
          'Network error: your order request was sent but we lost the connection. ' +
          'Please check your order history before placing again to avoid duplicates.',
          { duration: 8000 }
        );
      } else if (error.response?.status === 401) {
        // 401 = server explicitly rejected auth BEFORE processing the order.
        // Safe to retry — the order was never created.
        try {
          // console.log('[ReviewOrder] Token expired during request, refreshing...');
          const newToken = await getAuthToken(true);
          setAuthToken(newToken);

          // Phase 1: Same table logic as main flow
          const retryTableId = hasAssignedTable(scannedTableId)
            ? scannedTableId
            : (isMultiMenu && tableNumber && hasAssignedTable(tableNumber) ? tableNumber : '0');

          // Restaurant 716: room pick is mandatory on retry too.
          if (String(restaurantId) === '716' && !hasAssignedTable(retryTableId)) {
            toast('Please select your Room');
            setIsPlacingOrder(false);
            isPlacingOrderRef.current = false;
            return;
          }

          let retryResponse;

          // Check if we're in edit mode for retry
          if (isEditMode && editingOrderId) {
            retryResponse = await updateCustomerOrder({
              orderId: editingOrderId,
              cartItems,
              restaurantId,
              tableId: retryTableId,
              orderType: scannedOrderType || 'dinein',
              paymentType: 'postpaid',
              orderNote: specialInstructions,
              authToken: newToken,
              customerName,
              customerPhone: customerPhone || '',
              totalToPay: roundedTotal,
              subtotal: subtotalAfterDiscount,
              totalTax: finalTotalTax,
              pointsDiscount,
              pointsRedeemed: pointsToRedeem,
              // SC fields (SERVICE_CHARGE_MAPPING CR)
              serviceCharge,
              gstOnServiceCharge,
              itemTotal,
              finalSubtotal,
              // Multi-menu parity additions (478 contract alignment)
              totalGstTaxAmount: finalCgst + finalSgst,
              totalVatTaxAmount: finalVat,
              gstEnabled: isGstEnabledForSc,
              // D-5 (DELIVERY_CHARGE_GATING CR): wire gated delivery charge to edit-order retry writer (consumed by D-6)
              deliveryCharge: effectiveDeliveryCharge,
              // ROUND_UP_PAYLOAD_GAP fix — propagate computed round-off diff
              roundUpAmount,
            });

            // Clear edit mode after successful update
            clearEditMode();
            
            toast.success('Order updated successfully!');
          } else {
            // BUG-041 FIX: Use paymentMethod (user's selection), NOT razorpay_key existence
            const retryPaymentType = paymentMethod === 'online' ? 'prepaid' : 'postpaid';

            retryResponse = await placeOrder({
              cartItems,
              customerName,
              customerPhone: customerPhone || '',
              tableNumber: retryTableId,
              specialInstructions,
              couponCode,
              restaurantId,
              orderType: scannedOrderType,
              subtotal,
              totalToPay: roundedTotal,
              totalTax: finalTotalTax,
              isMultipleMenuType: isMultiMenu,
              token: newToken,
              // Points redemption
              pointsRedeemed: pointsToRedeem,
              pointsDiscount: pointsDiscount,
              // BUG-041 FIX: payment type from user selection, not key existence
              paymentType: retryPaymentType,
              // SC fields (SERVICE_CHARGE_MAPPING CR)
              serviceCharge,
              gstOnServiceCharge,
              itemTotal,
              finalSubtotal,
              // Multi-menu parity additions (478 contract alignment)
              totalGstTaxAmount: finalCgst + finalSgst,
              totalVatTaxAmount: finalVat,
              gstEnabled: isGstEnabledForSc,
              // D-5 (DELIVERY_CHARGE_GATING CR): wire gated delivery charge to placeOrder retry
              deliveryCharge: effectiveDeliveryCharge,
              // ROUND_UP_PAYLOAD_GAP fix — propagate computed round-off diff
              roundUpAmount,
            });
          }

          // BUG-040 FIX: Check if Razorpay payment flow needed after 401 retry
          const shouldRetryRazorpay = paymentMethod === 'online' && retryResponse?.razorpay_id && restaurant?.razorpay?.razorpay_key;

          if (shouldRetryRazorpay) {
            try {
              await openRazorpayCheckout(retryResponse, 'Razorpay-Retry');
              return; // Wait for payment
            } catch (razorpayError) {
              logger.error('razorpay', 'Retry failed:', razorpayError);
              toast.error('Payment initialization failed. Please try again.');
              setIsPlacingOrder(false);
              isPlacingOrderRef.current = false;
              return;
            }
          }

          // COD retry: navigate to success directly
          clearCart();

          // Restaurant 716: every new order must require a fresh room selection.
          if (String(restaurantId) === '716') {
            setTableNumber('');
            setRoomOrTable('room');
          }

          navigate(`/${restaurantId}/order-success`, {
            state: {
              orderData: {
                orderId: retryResponse?.order_id || editingOrderId || null,
                totalToPay: retryResponse?.total_amount || roundedTotal.toFixed(2),
                isEditedOrder: isEditMode,
                items: buildOrderItems(cartItems),
                previousItems: buildPreviousItems(previousOrderItems, isEditMode),
                billSummary: buildBillSummary({ itemTotal, pointsDiscount, pointsToRedeem, subtotalAfterDiscount, serviceCharge, finalSubtotal, itemCgst, itemSgst, scCgst, scSgst, finalCgst, finalSgst, finalVat, finalTotalTax, gstRate, vatRate, scGstRate, roundedTotal, hasRoundingDiff, totalToPay })
              }
            }
          });

        } catch (retryError) {
          logger.error('order', 'Failed to place order after retry:', retryError);
          toast.error('Session expired. Please refresh the page and try again.');
        }
      } else if (error.isStockOut) {
        // CR-2026-09-07-001: Stock-out hard stop (Layer 3 backstop).
        // Fires when pre-submission cache-check missed a stale/absent item.
        // Do NOT navigate. Do NOT clearCart. Cart preserved so user can edit.
        const items = error.out_of_stock_items || [];
        const parts = items.map((i) =>
          i.type === 'addon'
            ? `${i.addon_name} (addon for ${i.food_name})`
            : i.food_name
        );
        const msg = items.length === 1
          ? (items[0].type === 'addon'
              ? `"${items[0].addon_name}" (addon for "${items[0].food_name}") is out of stock. Please update your cart.`
              : `"${items[0].food_name}" is out of stock. Please remove it from your cart.`)
          : `Some items are out of stock: ${parts.join(', ')}. Please update your cart.`;
        toast.error(msg, { duration: 6000 });
      } else {
        // Generic-error branch (also catches post-success JS exceptions now).
        // If `response.order_id` is already known, the server accepted the
        // order — navigate the user to Order Success rather than leaving them
        // on a stale Review Order screen with an unhelpful toast.
        const errorMessage = error.response?.data?.message ||
          error.response?.data?.errors?.message ||
          (isEditMode ? 'Failed to update order. Please try again.' : 'Failed to place order. Please try again.');

        if (response?.order_id) {
          logger.error('order', 'Post-place-order error (order_id received):', error, { orderId: response.order_id });
          // Best-effort cart cleanup — guarded so it can't re-throw and re-enter catch.
          try { clearCart(); } catch (_) { /* noop */ }
          navigate(`/${restaurantId}/order-success`, {
            state: {
              orderData: {
                orderId: response.order_id,
                totalToPay: response.total_amount || roundedTotal.toFixed(2),
                isEditedOrder: isEditMode,
                items: buildOrderItems(cartItems),
                previousItems: buildPreviousItems(previousOrderItems, isEditMode),
              }
            }
          });
        } else {
          toast.error(errorMessage);
        }
      }
    } finally {
      isPlacingOrderRef.current = false;
      orderDispatchedRef.current = false;
      setIsPlacingOrder(false);
    }
  };

  // Show loading state if token is being fetched
  // if (isLoadingToken) {
  //   return (
  //     <div className="review-order-page">
  //       <div className="review-order-header">
  //         <button className="review-order-back-btn" onClick={handleBackClick}>
  //           <IoArrowBackOutline />
  //         </button>
  //         <h1 className="review-order-title">Order Review</h1>
  //       </div>
  //       <div className="review-order-loading">
  //         <p>Initializing...</p>
  //       </div>
  //     </div>
  //   );
  // }

  // Empty cart state
  if (totalItems === 0) {
    return (
      <div className="review-order-page">
        {/* <div className="review-order-header">
          <button className="review-order-back-btn" onClick={handleBackClick}>
            <IoArrowBackOutline />
          </button>
          <h1 className="review-order-title">Order Review</h1>
        </div> */}

        <div className="review-order-empty">
          <button
            className="review-order-empty-btn"
            onClick={handleNavigateToMenu}
          >
            Browse Menu
          </button>
          <p className="review-order-empty-redirect">
            Redirecting in <span className="review-order-countdown">{countdown}</span>
          </p>
          <div className="review-order-progress-track">
            <div
              className="review-order-progress-bar"
              style={{ width: `${(countdown / 10) * 100}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="review-order-page">
      <div className="review-order-page page-transition">
        {/* Header */}
        <div className="review-order-header">
          <button className="review-order-back-btn" onClick={handleBackClick}>
            <IoArrowBackOutline />
          </button>
          <h1 className="review-order-title">Order Review</h1>
        </div>



        <div className="review-order-content">

          {/* Table/Room Selection — CA-008 Phase 1: extracted to component */}
          <TableRoomSelector
            isScanned={isScanned}
            scannedTableId={scannedTableId}
            scannedTableNo={scannedTableNo}
            scannedRoomOrTable={scannedRoomOrTable}
            scannedOrderType={scannedOrderType}
            showTableInfo={showTableInfo}
            isMultiMenu={isMultiMenu}
            rooms={rooms}
            tables={tables}
            roomOrTable={roomOrTable}
            tableNumber={tableNumber}
            tablesLoading={tablesLoading}
            tablesError={tablesError}
            tablesErrorMessage={tablesErrorMessage}
            onRoomOrTableChange={handleRoomOrTableChange}
            onTableNumberChange={setTableNumber}
            restaurantId={restaurantId}
          />


          {/* Customer Details - configurable */}
          {!isMultiMenu && showCustomerDetails && (<>  <div className="review-order-section">
            <div className="review-order-section-header">
              <div className="review-order-section-title-icon"><IoPersonOutline size={16} /></div>
              <h2 className="review-order-section-title">Customer Details</h2>
            </div>
            <CustomerDetails
              name={customerName}
              phone={customerPhone}
              onNameChange={setCustomerName}
              onPhoneChange={setCustomerPhone}
              showPhoneError={showPhoneError}
              showName={showCustomerName}
              showPhone={showCustomerPhone}
              showTitle={false}
              readOnly={isCustomerDetailsLocked}
              lockHelperText={isCustomerDetailsLocked ? 'Fetched from checked-in room' : ''}
            />
          </div>
            <div className="review-order-divider"></div>

          </>
          )}

          {/* Divider after Customer Details */}
          {/* <div className="review-order-divider"></div> */}

          {/* Previous Order Items - Show only in edit mode */}
          {isEditMode && previousOrderItems && previousOrderItems.length > 0 && (
            <>
              <PreviousOrderItems 
                items={previousOrderItems} 
                orderId={editingOrderId}
              />
              <div className="review-order-divider"></div>
            </>
          )}

          {/* Order Items - New items (editable) */}
          <div className="review-order-section">
            <div className="review-order-section-header">
              <div className="review-order-section-title-icon"><MdOutlineShoppingBag size={16} /></div>
              <h2 className="review-order-section-title">
                {isEditMode ? 'New Items' : 'Order Items'}
              </h2>
              <div className="review-order-items-badge">
                <span className="review-order-items-count">{totalItems} items</span>
              </div>
            </div>
            <div className="review-order-items-list">
              {cartItems.map((cartItem) => (
                <OrderItemCard key={cartItem.cartId} cartItem={cartItem} showCookingInstructions={showCookingInstructions} />
              ))}
              {/* Special Instructions inside items card */}
              {showSpecialInstructions && (
                <div className="review-order-special-inline">
                  <textarea
                    className="review-order-textarea-inline"
                    value={specialInstructions}
                    onChange={(e) => setSpecialInstructions(e.target.value)}
                    placeholder="Special Instructions..."
                    rows={1}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Divider after Order Items */}
          <div className="review-order-divider"></div>

          {/* Price Breakdown - with integrated Coupon & Loyalty */}
          {showPriceBreakdown && (
          <div className="review-order-section">
            <div className="review-order-section-header">
              <div className="review-order-section-title-icon"><RiFileList3Line size={16} /></div>
              <h2 className="review-order-section-title">Price Breakdown</h2>
            </div>
            
            <div className="review-order-price-card">
              {/* Item Total */}
              <div className="price-row">
                <span className="price-label">Item Total</span>
                <span className="price-value">₹{itemTotal.toFixed(2)}</span>
              </div>

              {/* Service Charge (SERVICE_CHARGE_MAPPING CR) */}
              {serviceCharge > 0 && (
                <div className="price-row price-row-sub" data-testid="row-service-charge">
                  <span className="price-label-sub">Service Charge (Optional)</span>
                  <span className="price-value-sub">₹{serviceCharge.toFixed(2)}</span>
                </div>
              )}

              {/* Coupon Code - inline */}
              {showCoupon && (
                <div className="price-row price-row-input">
                  <div className="price-input-group">
                    <span className="price-input-icon">🏷️</span>
                    <input
                      type="text"
                      className="price-inline-input"
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value)}
                      placeholder="Enter coupon code"
                      data-testid="coupon-input"
                    />
                  </div>
                  <button className="price-inline-btn" data-testid="apply-coupon-btn">Apply</button>
                </div>
              )}

              {/* Loyalty Points - inline */}
              {showLoyalty && (
                (() => {
                  const pts = lookedUpCustomer?.found 
                    ? (lookedUpCustomer?.total_points || 0) 
                    : (isAuthenticated ? (user?.total_points || 0) : 0);
                  // CR-2026-10-03-004 Part B: G1 per-tier redemption value
                  const _tier = (isAuthenticated ? user?.tier : lookedUpCustomer?.tier) || 'Bronze';
                  const rdv = loyaltySettings?.[`${_tier.toLowerCase()}_redemption_value`] || loyaltySettings?.bronze_redemption_value || 0;
                  
                  // If points are being used, show the applied discount
                  if (isUsingPoints && pointsToRedeem > 0) {
                    return (
                      <div className="price-row price-row-input price-row-discount">
                        <div className="price-input-group">
                          <span className="price-input-icon">🎁</span>
                          <span className="price-loyalty-text price-loyalty-applied">
                            Using {pointsToRedeem} points (-₹{pointsDiscount.toFixed(0)})
                          </span>
                        </div>
                        <button 
                          className="price-inline-btn price-inline-btn-remove" 
                          data-testid="remove-loyalty-btn"
                          onClick={handleRemovePoints}
                        >
                          Remove
                        </button>
                      </div>
                    );
                  }
                  
                  // Show available points with Use button
                  return (
                    <div className="price-row price-row-input">
                      <div className="price-input-group">
                        <span className="price-input-icon">🎁</span>
                        <span className="price-loyalty-text">
                          {pts} points{rdv ? ` (Worth ₹${(pts * rdv).toFixed(0)})` : ''}
                        </span>
                      </div>
                      <button 
                        className="price-inline-btn" 
                        data-testid="redeem-loyalty-btn" 
                        disabled={!pts}
                        onClick={handleUsePoints}
                      >
                        Use
                      </button>
                    </div>
                  );
                })()
              )}

              {/* Delivery Address (Phase 3) */}
              {deliveryAddress && scannedOrderType === 'delivery' && (
                <div className="price-row delivery-address-summary" data-testid="delivery-address-summary">
                  <div className="delivery-summary-label">
                    <span className="price-label">Delivery to:</span>
                    <span className="delivery-summary-text">
                      {[deliveryAddress.house, deliveryAddress.address, deliveryAddress.city].filter(Boolean).join(', ')}
                    </span>
                    {deliveryAddress.contact_person_name && (
                      <span className="delivery-summary-contact">
                        {deliveryAddress.contact_person_name} • {deliveryAddress.contact_person_number}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Delivery Charge */}
              {scannedOrderType === 'delivery' && (
                <div className="price-row price-row-sub">
                  <span className="price-label-sub">Delivery Charge</span>
                  <span className="price-value-sub">{deliveryCharge > 0 ? `₹${deliveryCharge.toFixed(2)}` : 'Free'}</span>
                </div>
              )}

              {/* CR-2026-02-XX-002 Q3-B: Takeaway Charges — packaging/handling fee from POS restaurant.takeaway_charges */}
              {scannedOrderType === 'takeaway' && takeawaySurcharge > 0 && (
                <div className="price-row price-row-sub">
                  <span className="price-label-sub">Takeaway Charges</span>
                  <span className="price-value-sub">₹{takeawaySurcharge.toFixed(2)}</span>
                </div>
              )}

              {/* Subtotal (before taxes) */}
              <div className="price-row price-row-subtotal">
                <span className="price-label">Subtotal</span>
                <span className="price-value">₹{finalSubtotal.toFixed(2)}</span>
              </div>

              {/* GST/VAT breakdown — Variant 2 (SERVICE_CHARGE_MAPPING CR): split item-tax and SC-tax rows, each with % suffix for compliance */}
              {itemCgst > 0 && (
                <>
                  <div className="price-row price-row-sub">
                    <span className="price-label-sub">CGST{gstRate ? ` ${(gstRate / 2).toFixed(gstRate % 2 === 0 ? 0 : 2)}%` : ''}</span>
                    <span className="price-value-sub">₹{itemCgst.toFixed(2)}</span>
                  </div>
                  <div className="price-row price-row-sub">
                    <span className="price-label-sub">SGST{gstRate ? ` ${(gstRate / 2).toFixed(gstRate % 2 === 0 ? 0 : 2)}%` : ''}</span>
                    <span className="price-value-sub">₹{itemSgst.toFixed(2)}</span>
                  </div>
                </>
              )}
              {vat > 0 && (
                <div className="price-row price-row-sub">
                  <span className="price-label-sub">VAT{vatRate ? ` ${vatRate}%` : ''}</span>
                  <span className="price-value-sub">₹{adjustedVat.toFixed(2)}</span>
                </div>
              )}
              {scCgst > 0 && (
                <>
                  <div className="price-row price-row-sub" data-testid="row-sc-cgst">
                    <span className="price-label-sub">CGST on SC{scGstRate ? ` ${(scGstRate / 2).toFixed(scGstRate % 2 === 0 ? 0 : 2)}%` : ''}</span>
                    <span className="price-value-sub">₹{scCgst.toFixed(2)}</span>
                  </div>
                  <div className="price-row price-row-sub" data-testid="row-sc-sgst">
                    <span className="price-label-sub">SGST on SC{scGstRate ? ` ${(scGstRate / 2).toFixed(scGstRate % 2 === 0 ? 0 : 2)}%` : ''}</span>
                    <span className="price-value-sub">₹{scSgst.toFixed(2)}</span>
                  </div>
                </>
              )}
              {deliveryCgst > 0 && (
                <>
                  <div className="price-row price-row-sub" data-testid="row-delivery-cgst">
                    <span className="price-label-sub">CGST on Delivery{deliveryGstRate ? ` ${(deliveryGstRate / 2).toFixed(deliveryGstRate % 2 === 0 ? 0 : 2)}%` : ''}</span>
                    <span className="price-value-sub">₹{deliveryCgst.toFixed(2)}</span>
                  </div>
                  <div className="price-row price-row-sub" data-testid="row-delivery-sgst">
                    <span className="price-label-sub">SGST on Delivery{deliveryGstRate ? ` ${(deliveryGstRate / 2).toFixed(deliveryGstRate % 2 === 0 ? 0 : 2)}%` : ''}</span>
                    <span className="price-value-sub">₹{deliverySgst.toFixed(2)}</span>
                  </div>
                </>
              )}

              {/* Total */}
              <div className="price-row price-row-total">
                <span className="price-label-total">Grand Total</span>
                <span className="price-value-total">
                  ₹{roundedTotal.toFixed(2)}
                  {hasRoundingDiff && (
                    <span style={{ fontSize: '0.8em', opacity: 0.7, marginLeft: '4px' }}>(₹{totalToPay.toFixed(2)})</span>
                  )}
                </span>
              </div>
            </div>
          </div>
          )}

          {/* Loyalty Rewards — CA-008 Phase 1: extracted to component */}
          <LoyaltyRewardsSection
            configShowLoyaltyPoints={configShowLoyaltyPoints}
            restaurant={restaurant}
            isAuthenticated={isAuthenticated}
            user={user}
            lookedUpCustomer={lookedUpCustomer}
            loyaltySettings={loyaltySettings}
            totalToPay={totalToPay}
          />
        </div>

        {/* Fixed Footer with Payment Selector + Button (FEAT-001) */}
        <div className="review-order-footer">
          {/* Payment Method Selector */}
          {showPaymentSelector && !isEditMode && (
            <PaymentMethodSelector
              showOnline={onlinePaymentEnabled}
              showCod={codEnabled}
              selected={paymentMethod}
              onSelect={setPaymentMethod}
              onlineLabel={payOnlineLabel}
              codLabel={payAtCounterLabel}
              disabled={isPlacingOrder}
            />
          )}
          
          {/* Place Order Button */}
          <button
            className="review-order-place-btn"
            onClick={handlePlaceOrder}
            disabled={totalItems === 0 || isPlacingOrder || isLoadingToken}
            data-testid="place-order-btn"
          >
            {isPlacingOrder 
              ? (isEditMode ? 'Updating Order...' : 'Placing Order...') 
              : (isEditMode 
                  ? `Update Order ₹${roundedTotal.toFixed(2)}` 
                  : (paymentMethod === 'online' && hasRazorpayKey
                      ? `Pay & Proceed ₹${roundedTotal.toFixed(2)}`
                      : `Place Order ₹${roundedTotal.toFixed(2)}`)
                )
            }
          </button>
        </div>
      </div>
      <NotificationPopup page="review" />
      <NonQrBlockModal
        open={showNonQrBlockModal}
        onRescan={() => {
          setShowNonQrBlockModal(false);
          navigate(`/${restaurantId}`);
        }}
      />
    </div>
  );
};

export default ReviewOrder;
