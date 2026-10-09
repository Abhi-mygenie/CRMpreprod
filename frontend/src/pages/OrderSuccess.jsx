import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useRestaurantId } from '../utils/useRestaurantId';
import { useRestaurantDetails, useStations } from '../hooks/useMenuData';
import { useRestaurantConfig } from '../context/RestaurantConfigContext';
import { useScannedTable } from '../hooks/useScannedTable';
import { useCart } from '../context/CartContext';
import { isMultipleMenu } from '../api/utils/restaurantIdConfig';
import { getOrderDetails, checkTableStatus } from '../api/services/orderService';
import { getStoredToken } from '../utils/authToken';
import { ENDPOINTS } from '../api/config/endpoints';
import logger from '../utils/logger';
import { isDineInOrRoom, showsDineInActions, hasAssignedTable } from '../utils/orderTypeHelpers';
// Import centralized transformers - SINGLE SOURCE OF TRUTH for label formatting
import { getVariationLabels, getAddonLabels } from '../api/transformers/helpers';
import Header from '../components/Header/Header';
import { IoCheckmarkCircle, IoCallOutline, IoChevronDownOutline, IoChevronUpOutline, IoTimeOutline, IoCheckmarkOutline, IoCheckmarkDoneOutline, IoCloseOutline } from 'react-icons/io5';
import { RiBillLine } from 'react-icons/ri';
import { MdOutlineEdit, MdOutlineRestaurantMenu, MdOutlineTableRestaurant } from 'react-icons/md';
import { FaDoorOpen } from 'react-icons/fa';
import NotificationPopup from '../components/NotificationPopup/NotificationPopup';
import './OrderSuccess.css';

// ─── UI display flags (SERVICE_CHARGE_MAPPING CR) ───────────────────────────
// Hide-not-delete toggles. Flip to true to restore the display. Underlying
// computation / data flow is preserved intentionally.
const SHOW_INTERNAL_ORDER_ID  = false;   // hides the "(825153)" next to "#000065"
const SHOW_PRE_ROUND_BRACKET  = false;   // hides the "(₹494.37)" pre-rounding value next to Grand Total

/**
 * Maps food_status numeric value to status string
 * 1 → Preparing, 2 → Ready, 3 → Cancelled, 5 → Served, 6 → Paid, 7 → Yet to be confirmed
 * Uses item.status (from transformer) or item.foodStatus (legacy)
 */
const mapFoodOrderStatus = (item) => {
  // Use status from transformer, fallback to foodStatus for legacy
  const fStatus = item?.status ?? item?.foodStatus;
  if (fStatus !== undefined && fStatus !== null) {
    const statusMap = {
      1: 'preparing',
      2: 'ready',
      3: 'cancelled',
      5: 'served',
      6: 'paid',
      7: 'pending'
    };
    return statusMap[fStatus] || 'pending';
  }
  
  return 'pending';
};

/**
 * Item Status Badge Component
 * Status: 'preparing' | 'ready' | 'served' | 'cancelled' | 'paid' | 'pending'
 */
const ItemStatusBadge = ({ status }) => {
  const statusConfig = {
    pending: {
      label: 'Yet to be confirmed',
      icon: <IoTimeOutline />,
      className: 'status-pending'
    },
    preparing: {
      label: 'Preparing',
      icon: <IoTimeOutline />,
      className: 'status-preparing'
    },
    ready: {
      label: 'Ready',
      icon: <IoCheckmarkOutline />,
      className: 'status-ready'
    },
    served: {
      label: 'Served',
      icon: <IoCheckmarkDoneOutline />,
      className: 'status-served'
    },
    cancelled: {
      label: 'Cancelled',
      icon: <IoCloseOutline />,
      className: 'status-cancelled'
    },
    paid: {
      label: 'Paid',
      icon: <IoCheckmarkDoneOutline />,
      className: 'status-paid'
    }
  };

  const config = statusConfig[status] || statusConfig.preparing;

  return (
    <span className={`item-status-badge ${config.className}`} data-testid={`status-${status}`}>
      {config.icon}
      <span className="item-status-label">{config.label}</span>
    </span>
  );
};

// Helper: check if a success_config flag is enabled (defaults to Y)
const isConfigEnabled = (restaurant, key) => {
  const config = restaurant?.success_config;
  if (!config) return true;
  const val = config[key];
  if (val === undefined || val === null) return true;
  return val === 'Y' || val === 'y' || val === true || val === '1';
};

// NOTE: getVariationLabels and getAddonLabels are now imported from '../api/transformers'
// This ensures consistent label formatting across the app

// Order status steps mapped to f_order_status values
// 7 → Order Placed, 1 → Confirmed, 2 → Preparing, 5 → Served
const ORDER_STATUSES = [
  { key: 7, label: 'Order Placed' },
  { key: 1, label: 'Confirmed' },
  { key: 2, label: 'Preparing' },
  { key: 5, label: 'Served' },
];

const OrderSuccess = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { restaurantId } = useRestaurantId();
  const { restaurant } = useRestaurantDetails(restaurantId);
  const numericRestaurantId = restaurant?.id?.toString() || restaurantId;
  const { stations } = useStations(numericRestaurantId);
  const { logoUrl: configLogoUrl, phone: configPhone, fetchConfig, showFoodStatus, showOrderStatusTracker, showCallWaiter: configShowCallWaiter, showPayBill: configShowPayBill, successTitle: configSuccessTitle, successMessage: configSuccessMessage } = useRestaurantConfig();
  const { tableNo: scannedTableNo, tableId: scannedTableId, roomOrTable: scannedRoomOrTable, isScanned, orderType: scannedOrderType, clearScannedTable } = useScannedTable();
  const { startEditOrder, clearCart, clearEditMode } = useCart();
  const [isLoadingEdit, setIsLoadingEdit] = useState(false);
  const [showItems, setShowItems] = useState(true);
  const [showBillSummary, setShowBillSummary] = useState(true);
  const [liveOrderItems, setLiveOrderItems] = useState([]);
  const [billSummary, setBillSummary] = useState(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [fOrderStatus, setFOrderStatus] = useState(null);
  const [paymentStatus, setPaymentStatus] = useState(null);
  const [restaurantOrderId, setRestaurantOrderId] = useState(null);
  const [liveOrderAmount, setLiveOrderAmount] = useState(null);
  const [paymentVerified, setPaymentVerified] = useState(false);
  const [isVerifyingPayment, setIsVerifyingPayment] = useState(false);
  // SERVICE_CHARGE_MAPPING CR (adjacent fix) — post-order table/room from API (single source of truth)
  const [apiTableNo, setApiTableNo] = useState(null);
  const [apiTableType, setApiTableType] = useState(null);

  const orderData = location.state?.orderData || null;
  const orderId = orderData?.orderId;
  
  // Use billSummary from location.state (passed from ReviewOrder) as primary source
  const passedBillSummary = orderData?.billSummary || null;

  // ─── SC-GST LABEL SOURCE FIX ─────────────────────────────────────────────
  // billSummary.scGstRate (returned by getOrderDetails transform) can be
  // derived from rounded amounts when the order details API response does not
  // carry restaurant.service_charge_tax — that derivation can produce an
  // off-by-rounding value (e.g. 17.97 → "8.99%" on label) even though the
  // configured rate is 18. Use the configured rate from /web/restaurant-info
  // (already cached by React Query via useRestaurantDetails above) — this is
  // the SAME source ReviewOrder uses. Amounts (scCgst / scSgst /
  // serviceCharge / grandTotal) are NOT touched; only the percentage shown
  // next to the label is corrected.
  const configuredScGstRate = parseFloat(restaurant?.service_charge_tax) || 0;
  const displayScGstRate =
    configuredScGstRate > 0
      ? configuredScGstRate
      : (billSummary?.scGstRate || 0);

  // Use ONLY items from API (single source of truth)
  const allItems = liveOrderItems;
  const totalItemsCount = allItems.reduce((sum, item) => sum + (item.quantity || 1), 0);

  // Initialize billSummary from passed data
  useEffect(() => {
    if (passedBillSummary && !billSummary) {
      setBillSummary(passedBillSummary);
    }
  }, [passedBillSummary, billSummary]);

  // Verify Razorpay payment if payment data exists
  useEffect(() => {
    const verifyPayment = async () => {
      // Check if this is a Razorpay payment that needs verification
      if (!orderData?.isPaid || !orderData?.paymentId || !orderData?.razorpayOrderId || !orderData?.razorpaySignature) {
        return;
      }

      // Don't verify again if already verified
      if (paymentVerified) return;

      setIsVerifyingPayment(true);
      logger.payment('Verifying payment:', {
        razorpay_order_id: orderData.razorpayOrderId,
        razorpay_payment_id: orderData.paymentId,
        razorpay_signature: orderData.razorpaySignature
      });

      try {
        const response = await fetch(ENDPOINTS.RAZORPAY_VERIFY_PAYMENT(), {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            razorpay_order_id: orderData.razorpayOrderId,
            razorpay_payment_id: orderData.paymentId,
            razorpay_signature: orderData.razorpaySignature
          })
        });

        const result = await response.json();
        logger.payment('Verification result:', result);

        if (result.status === 'success') {
          setPaymentVerified(true);
          toast.success('Payment verified successfully!');
        } else {
          logger.error('payment', 'Verification failed:', result.message);
          toast.error(result.message || 'Payment verification failed');
        }
      } catch (error) {
        logger.error('payment', 'Verification error:', error);
        toast.error('Payment verification failed. Please contact support.');
      } finally {
        setIsVerifyingPayment(false);
      }
    };

    verifyPayment();
  }, [orderData, paymentVerified]);

  // Fetch order details and update item statuses
  const fetchOrderStatus = async (isInitial = false) => {
    if (!orderId) return;
    
    try {
      if (isInitial) setIsLoadingStatus(true);
      const orderDetails = await getOrderDetails(orderId);
      
      // Check if table has been merged/transferred (table now free = order moved away)
      // Read scanned table from sessionStorage (always current, avoids stale closure)
      const storageKey = `scanned_table_${restaurantId}`;
      const storedTable = sessionStorage.getItem(storageKey);
      const scannedData = storedTable ? JSON.parse(storedTable) : null;
      const tableIdForCheck = scannedData?.table_id;
      const orderTypeForCheck = scannedData?.order_type;

      // Phase 1: Only check table status when a specific table was scanned
      if (tableIdForCheck && String(tableIdForCheck) !== '0' && hasAssignedTable(tableIdForCheck)) {
        try {
          const tableCheckResult = await checkTableStatus(
            tableIdForCheck,
            numericRestaurantId,
            getStoredToken()
          );
          if (tableCheckResult.isAvailable || tableCheckResult.isInvalid) {
            clearCart();
            clearEditMode();
            navigate(`/${restaurantId}`, { replace: true });
            return;
          }
        } catch (tableCheckErr) {
          logger.error('table', 'Table status check failed:', tableCheckErr);
        }
      }

      if (orderDetails?.previousItems && orderDetails.previousItems.length > 0) {
        // Use transformer properties directly - no manual re-mapping needed
        const updatedItems = orderDetails.previousItems.map(item => ({
          id: item.id,
          name: item.name || item.item?.name || 'Item',
          // Use fullPrice from transformer (already includes variations + addons)
          price: item.fullPrice ?? item.price ?? 0,
          quantity: item.quantity || 1,
          veg: item.veg ?? (item.item?.veg === true || item.item?.veg === 1),
          // Use status from transformer, fallback to foodStatus
          status: item.status,
          foodStatus: item.status ?? item.foodStatus,
          // Use transformed variations/addons
          variations: item.variations || [],
          addons: item.addons || [],
          notes: item.notes || '',
          orderNote: item.orderNote || '',
        }));
        setLiveOrderItems(updatedItems);
        
        // Update order-level status from API
        if (orderDetails.fOrderStatus !== undefined && orderDetails.fOrderStatus !== null) {
          setFOrderStatus(orderDetails.fOrderStatus);
          
          // Hydrate payment status (normalized lowercase: 'paid' | 'unpaid' | null)
          // Drives the EDIT ORDER → BROWSE MENU gate when payment_status === 'paid'.
          if (orderDetails.paymentStatus !== undefined) {
            setPaymentStatus(orderDetails.paymentStatus);
          }
          
          // Store restaurant_order_id from API
          if (orderDetails.restaurantOrderId) {
            setRestaurantOrderId(orderDetails.restaurantOrderId);
          }
          
          // Store live order_amount from API (reflects cancellations)
          if (orderDetails.orderAmount) {
            setLiveOrderAmount(orderDetails.orderAmount);
          }
          
          // Status 3 (Cancelled) or 6 (Paid) → clear state and redirect to landing page
          if (orderDetails.fOrderStatus === 3 || orderDetails.fOrderStatus === 6) {
            clearCart();
            clearEditMode();
            // Restaurant 716 (Hyatt Centric — room-only hotel) intentionally requires a fresh
            // room re-pick on every new order, so we wipe the scanned-table sessionStorage on
            // status 3/6. For all other restaurants the room/table context is a property of the
            // physical scanner (not of the order) and MUST persist so the customer's next order
            // keeps the correct table_id. Without this guard, table_id falls back to '0' at
            // ReviewOrder.jsx:949-951 and POS misclassifies the next order as walk-in / WC.
            if (String(restaurantId) === '716') {
              clearScannedTable();
            }
            // TEMP: customer-facing toasts disabled pending UX/product review.
            // Previously fired: status 3 → "Your order has been cancelled." (icon ❌)
            //                   status 6 → "Payment received. Thank you!" (toast.success)
            // if (orderDetails.fOrderStatus === 3) {
            //   toast('Your order has been cancelled.', { icon: '❌', duration: 4000 });
            // } else {
            //   toast.success('Payment received. Thank you!', { duration: 4000 });
            // }
            navigate(`/${restaurantId}`, { replace: true });
            return;
          }
        }

        // SERVICE_CHARGE_MAPPING CR — pure API mapping (see getOrderDetails in orderService.ts).
        // The billSummary returned from getOrderDetails already carries correct
        // itemTotal / serviceCharge / subtotal / cgst / sgst / vat / totalTax / grandTotal / originalTotal.
        if (orderDetails.billSummary) {
          setBillSummary(orderDetails.billSummary);
        }
        // SERVICE_CHARGE_MAPPING CR (adjacent fix) — post-order table/room from API
        if (orderDetails.tableNo) {
          setApiTableNo(String(orderDetails.tableNo).trim());
        }
        if (orderDetails.tableType) {
          setApiTableType(orderDetails.tableType);
        }
      }
    } catch (error) {
      logger.error('order', 'Failed to fetch order status:', error);
      
      // If order not found (deleted), clear state and redirect
      if (error?.response?.status === 404 || error?.response?.data?.errors) {
        clearCart();
        clearEditMode();
        // 716-only sessionStorage wipe (see ROOM_SCANNER_INTERMITTENT_WC fix above).
        // Other restaurants preserve scan context across 404s — a status-poll blip should not
        // make the next order walk-in.
        if (String(restaurantId) === '716') {
          clearScannedTable();
        }
        toast('Order not found. It may have been deleted.', { icon: '❌', duration: 4000 });
        navigate(`/${restaurantId}`, { replace: true });
        return;
      }
    } finally {
      if (isInitial) setIsLoadingStatus(false);
    }
  };

  // Fetch order status on mount and poll every 1 minute
  useEffect(() => {
    if (!orderId) return;

    // Initial fetch (shows loading state)
    fetchOrderStatus(true);

    // Poll every 60 seconds (silent update, no loading flash)
    const pollInterval = setInterval(() => {
      fetchOrderStatus(false);
    }, 60000);

    // Cleanup on unmount
    return () => clearInterval(pollInterval);
  }, [orderId]);

  // Fetch admin config for this restaurant
  useEffect(() => {
    if (restaurantId) {
      fetchConfig(restaurantId);
    }
  }, [restaurantId, fetchConfig]);

  // Redirect if no order data
  useEffect(() => {
    if (!orderData) {
      if (restaurantId) {
        if (isMultipleMenu(restaurant)) {
          navigate(`/${restaurantId}/stations`, { replace: true });
        } else {
          navigate(`/${restaurantId}/menu`, { replace: true });
        }
      } else {
        navigate('/menu', { replace: true });
      }
    }
  }, [orderData, navigate, restaurantId, stations]);

  if (!orderData) return null;

  // Current order status from f_order_status (default to 7 = Order Placed)
  const currentStepIndex = ORDER_STATUSES.findIndex(s => s.key === (fOrderStatus ?? 7));

  const handleGoToMenu = () => {
    if (isMultipleMenu(restaurant)) {
      navigate(`/${restaurantId}/stations`, { replace: true });
    } else {
      navigate(`/${restaurantId}/menu`, { replace: true });
    }
  };

  const handleEditOrder = async () => {
    if (!orderData?.orderId) {
      logger.error('order', 'No order ID available for editing');
      return;
    }

    // Defensive guard: if payment_status is 'paid', refuse edit (matches OrderSuccess gate)
    if (paymentStatus === 'paid') {
      toast('This order has been paid and cannot be edited.', { icon: 'ℹ️' });
      return;
    }

    setIsLoadingEdit(true);
    try {
      // FIRST: Check if table is still occupied (only when a table was scanned)
      if (scannedTableId && hasAssignedTable(scannedTableId)) {
        const token = await getStoredToken();
        const tableStatus = await checkTableStatus(scannedTableId, restaurantId, token);
        
        // If table is FREE (no active order), redirect to landing page for fresh order
        if (!tableStatus.isOccupied || !tableStatus.orderId) {
          clearEditMode();
          clearCart();
          toast('Table is now free. Starting fresh order.', { icon: 'ℹ️' });
          navigate(`/${restaurantId}`, { replace: true });
          return;
        }
      }

      // Fetch order details from API
      const orderDetails = await getOrderDetails(orderData.orderId);
      
      // Check if order is cancelled or paid
      if (orderDetails.fOrderStatus === 3 || orderDetails.fOrderStatus === 6) {
        clearEditMode();
        clearCart();
        toast(orderDetails.fOrderStatus === 3 ? 'This order was cancelled.' : 'This order has been paid.', { icon: 'ℹ️' });
        navigate(`/${restaurantId}`, { replace: true });
        return;
      }
      
      // Start edit mode with previous items (including cancelled for visibility)
      startEditOrder(
        orderData.orderId,
        orderDetails.previousItems,
        {
          tableId: orderDetails.tableId,
          tableNo: orderDetails.tableNo,
          restaurant: orderDetails.restaurant,
        }
      );

      // Navigate to menu to add more items
      if (isMultipleMenu(restaurant)) {
        navigate(`/${restaurantId}/stations`, { replace: true });
      } else {
        navigate(`/${restaurantId}/menu`, { replace: true });
      }
    } catch (error) {
      logger.error('order', 'Failed to fetch order details for editing:', error);
      // Still allow navigation even if API fails
      navigate(`/${restaurantId}/review-order`, { replace: true });
    } finally {
      setIsLoadingEdit(false);
    }
  };

  const handleCallWaiter = () => {
    // TODO: Integrate with call waiter API
    logger.order('Call waiter triggered for order', orderData.orderId);
  };

  const handlePayBill = () => {
    // TODO: Integrate with pay bill flow
    logger.order('Pay bill triggered for order', orderData.orderId);
  };

  // Config flags
  // FEAT-002-PREP: Call Waiter / Pay Bill only for dine-in/room
  const isDineInContext = showsDineInActions(scannedOrderType);
  const showOrderStatus = showOrderStatusTracker;
  const showCallWaiter = configShowCallWaiter && isDineInContext;
  const showPayBill = configShowPayBill && isDineInContext;
  // SERVICE_CHARGE_MAPPING CR (adjacent fix) — prefer API for post-order display (single source of truth).
  // Fallback to useScannedTable (sessionStorage) only if API hasn't loaded yet.
  const effectiveTableNo = apiTableNo || scannedTableNo;
  const effectiveRoomOrTable = apiTableType
    ? (apiTableType === 'RM' ? 'room' : 'table')
    : scannedRoomOrTable;
  const showTableNumber = isConfigEnabled(restaurant, 'show_table_number') && !!effectiveTableNo;
  
  // Edit Order vs Browse Menu — based on whether a table was scanned and order status
  // Phase 1: hasTable is true only when a specific table/room was scanned (not walk-in)
  // Phase 2: paid orders (payment_status === 'paid') are non-editable — show Browse Menu.
  // Phase 3 (Fix-1, approved): "Yet to confirm" is driven by f_order_status === 7 alone,
  // not by hasTable. Browse Menu is hidden while f_order_status === 7 regardless of scan.
  const hasTable = hasAssignedTable(scannedTableId) && isScanned && scannedTableNo;
  const isPaid = paymentStatus === 'paid';
  const showYetToBeConfirmed = fOrderStatus === 7;
  const showEditOrder = hasTable && fOrderStatus !== 7 && fOrderStatus !== null && !isPaid;
  const showBrowseMenu = fOrderStatus !== 7 && (!hasTable || (hasTable && isPaid));

  return (
    <div className="order-success-page" data-testid="order-success-page">
      <Header
        brandText={restaurant?.name}
        phone={configPhone || restaurant?.phone}
        onBackClick={() => navigate(`/${restaurantId}`)}
      />
      <div className="order-success-container">

        {/* Compact Hero: Icon + Title inline */}
        <div className="order-success-hero-compact">
          <div className="order-success-icon-small" data-testid="order-success-icon">
            <IoCheckmarkCircle />
          </div>
          <div className="order-success-hero-text">
            <h1 className="order-success-title-compact" data-testid="order-success-title">
              {(configSuccessTitle && configSuccessTitle.trim()) || 'Order Placed!'}
            </h1>
            <p className="order-success-message-compact" data-testid="order-success-message">
              {(configSuccessMessage && configSuccessMessage.trim()) || 'Your order is being processed'}
            </p>
          </div>
        </div>

        {/* Order Details Card - Compact */}
        <div className="order-success-card-compact" data-testid="order-success-card">
          {/* Order ID + Total in one row */}
          <div className="order-success-main-row">
            <div className="order-success-order-info">
              <span className="order-success-order-label">Order</span>
              <span className="order-success-order-id">
                #{restaurantOrderId || orderData.orderId || 'N/A'}
                {SHOW_INTERNAL_ORDER_ID && restaurantOrderId && <span> ({orderData.orderId})</span>}
              </span>
            </div>
            <span className="order-success-total">₹{liveOrderAmount || orderData.totalToPay || '0.00'}</span>
          </div>

          {/* Payment Status - Only show for Razorpay payments */}
          {orderData?.isPaid && (
            <div className={`order-success-payment-status ${paymentVerified ? 'payment-success' : 'payment-pending'}`}>
              {isVerifyingPayment ? (
                <span className="payment-verifying">Verifying payment...</span>
              ) : paymentVerified ? (
                <>
                  <IoCheckmarkCircle className="payment-icon success" />
                  <span>Payment Successful</span>
                </>
              ) : (
                <>
                  <IoCloseOutline className="payment-icon failed" />
                  <span>Payment Pending</span>
                </>
              )}
            </div>
          )}

          {/* Table Number - inline (SERVICE_CHARGE_MAPPING CR adjacent fix — effective* prefers API post-order) */}
          {showTableNumber && (
            <div className="order-success-table-row">
              <span className="order-success-table-icon">
                {effectiveRoomOrTable === 'room' ? <FaDoorOpen /> : <MdOutlineTableRestaurant />}
              </span>
              <span className="order-success-table-label">
                {effectiveRoomOrTable === 'room' ? 'Room' : 'Table'}
              </span>
              <span className="order-success-table-value">{effectiveTableNo}</span>
            </div>
          )}
        </div>

        {/* Items Ordered - Collapsible */}
        {(isLoadingStatus || allItems.length > 0) && (
          <div className="order-success-items-card">
            <div 
              className="order-success-items-header"
              onClick={() => setShowItems(!showItems)}
              data-testid="toggle-items-btn"
            >
              <span className="order-success-items-title">
                {isLoadingStatus ? 'Loading Items...' : `Items Ordered (${totalItemsCount})`}
              </span>
              <span className="order-success-items-toggle">
                {showItems ? <IoChevronUpOutline /> : <IoChevronDownOutline />}
              </span>
            </div>
            {showItems && (
              <div className="order-success-items-list">
                {/* Loading State */}
                {isLoadingStatus && (
                  <div className="order-success-items-loading">
                    <span>Fetching order details...</span>
                  </div>
                )}
                
                {/* All Items - Single flat list from API */}
                {!isLoadingStatus && allItems.map((item, index) => (
                  <div key={`item-${index}`} className="order-success-item-row">
                    <div className="order-success-item-info">
                      <span className={`order-success-item-veg ${item.veg ? 'veg' : 'non-veg'}`}>
                        <span className="veg-dot"></span>
                      </span>
                      <div className="order-success-item-details">
                        <span className="order-success-item-name">{item.name || 'Item'}</span>
                        {/* Use transformed variations from transformer */}
                        {item.variations && item.variations.length > 0 && getVariationLabels(item.variations) && (
                          <span className="order-success-item-customization" data-testid={`item-variants-${index}`}>
                            Variants: {getVariationLabels(item.variations)}
                          </span>
                        )}
                        {/* Use addons from transformer (not add_ons) */}
                        {item.addons && item.addons.length > 0 && (
                          <span className="order-success-item-customization" data-testid={`item-addons-${index}`}>
                            Addons: {getAddonLabels(item.addons)}
                          </span>
                        )}
                        {(item.notes || item.foodLevelNotes) && (
                          <span className="order-success-item-customization" data-testid={`item-cooking-${index}`}>
                            🍳 {item.notes || item.foodLevelNotes}
                          </span>
                        )}
                      </div>
                      <span className="order-success-item-qty">x{item.quantity || 1}</span>
                    </div>
                    <div className="order-success-item-right">
                      <span className="order-success-item-price">
                        ₹{((item.price || 0) * (item.quantity || 1)).toFixed(2)}
                      </span>
                      {showFoodStatus && fOrderStatus !== 7 && <ItemStatusBadge status={mapFoodOrderStatus(item)} />}
                    </div>
                  </div>
                ))}
                {/* Order-level special instructions */}
                {allItems.length > 0 && allItems[0]?.orderNote && (
                  <div className="order-success-special-instructions" data-testid="order-special-instructions">
                    <span className="order-success-item-customization">
                      📝 Special Instructions: {allItems[0].orderNote}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Bill Summary - Collapsible */}
        {billSummary && (
          <div className="order-success-bill-card">
            <div 
              className="order-success-bill-header"
              onClick={() => setShowBillSummary(!showBillSummary)}
              data-testid="toggle-bill-btn"
            >
              <span className="order-success-bill-title">
                <RiBillLine /> Bill Summary
              </span>
              <span className="order-success-bill-toggle">
                {showBillSummary ? <IoChevronUpOutline /> : <IoChevronDownOutline />}
              </span>
            </div>
            {showBillSummary && (
              <div className="order-success-bill-content">
                <div className="bill-row">
                  <span className="bill-label">Item Total</span>
                  <span className="bill-value">₹{billSummary.itemTotal.toFixed(2)}</span>
                </div>
                {(billSummary.pointsDiscount > 0 || billSummary.discount > 0) && (
                  <div className="bill-row bill-row-discount">
                    <span className="bill-label">
                      {billSummary.pointsDiscount > 0 
                        ? `Loyalty Points (${billSummary.pointsRedeemed || 0} pts)` 
                        : 'Discount'}
                    </span>
                    <span className="bill-value bill-discount">
                      -₹{(billSummary.pointsDiscount || billSummary.discount || 0).toFixed(2)}
                    </span>
                  </div>
                )}
                {/* Service Charge (SERVICE_CHARGE_MAPPING CR) */}
                {billSummary.serviceCharge > 0 && (
                  <div className="bill-row" data-testid="bill-row-service-charge">
                    <span className="bill-label">Service Charge (Optional)</span>
                    <span className="bill-value">₹{billSummary.serviceCharge.toFixed(2)}</span>
                  </div>
                )}
                <div className="bill-row bill-row-subtotal">
                  <span className="bill-label">Subtotal</span>
                  <span className="bill-value">₹{billSummary.subtotal.toFixed(2)}</span>
                </div>
                {billSummary.cgst > 0 && (
                  <div className="bill-row bill-row-tax">
                    <span className="bill-label-sub">CGST{billSummary.gstRate ? ` ${(billSummary.gstRate / 2).toFixed(billSummary.gstRate % 2 === 0 ? 0 : 2)}%` : ''}</span>
                    <span className="bill-value-sub">₹{billSummary.cgst.toFixed(2)}</span>
                  </div>
                )}
                {billSummary.sgst > 0 && (
                  <div className="bill-row bill-row-tax">
                    <span className="bill-label-sub">SGST{billSummary.gstRate ? ` ${(billSummary.gstRate / 2).toFixed(billSummary.gstRate % 2 === 0 ? 0 : 2)}%` : ''}</span>
                    <span className="bill-value-sub">₹{billSummary.sgst.toFixed(2)}</span>
                  </div>
                )}
                {billSummary.vat > 0 && (
                  <div className="bill-row bill-row-tax">
                    <span className="bill-label-sub">VAT{billSummary.vatRate ? ` ${billSummary.vatRate}%` : ''}</span>
                    <span className="bill-value-sub">₹{billSummary.vat.toFixed(2)}</span>
                  </div>
                )}
                {/* CGST/SGST on Service Charge — compliance rows (SERVICE_CHARGE_MAPPING CR) */}
                {billSummary.scCgst > 0 && (
                  <div className="bill-row bill-row-tax" data-testid="bill-row-sc-cgst">
                    <span className="bill-label-sub">CGST on SC{displayScGstRate ? ` ${(displayScGstRate / 2).toFixed(displayScGstRate % 2 === 0 ? 0 : 2)}%` : ''}</span>
                    <span className="bill-value-sub">₹{billSummary.scCgst.toFixed(2)}</span>
                  </div>
                )}
                {billSummary.scSgst > 0 && (
                  <div className="bill-row bill-row-tax" data-testid="bill-row-sc-sgst">
                    <span className="bill-label-sub">SGST on SC{displayScGstRate ? ` ${(displayScGstRate / 2).toFixed(displayScGstRate % 2 === 0 ? 0 : 2)}%` : ''}</span>
                    <span className="bill-value-sub">₹{billSummary.scSgst.toFixed(2)}</span>
                  </div>
                )}
                <div className="bill-row bill-row-total">
                  <span className="bill-label-total">Grand Total</span>
                  <span className="bill-value-total">
                    ₹{billSummary.grandTotal.toFixed(2)}
                    {SHOW_PRE_ROUND_BRACKET && billSummary.originalTotal != null && (
                      <span style={{ fontSize: '0.8em', opacity: 0.7, marginLeft: '4px' }}>(₹{billSummary.originalTotal.toFixed(2)})</span>
                    )}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Order Status Tracker - Compact */}
        {showOrderStatus && (
          <div className="order-status-tracker-compact" data-testid="order-status-tracker">
            <div className="order-status-steps-compact">
              {ORDER_STATUSES.map((step, idx) => {
                const isCompleted = idx <= currentStepIndex;
                const isCurrent = idx === currentStepIndex;
                return (
                  <div key={step.key} className={`order-status-step-compact ${isCompleted ? 'completed' : ''} ${isCurrent ? 'current' : ''}`}>
                    <div className="order-status-dot-compact">
                      {isCompleted && (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <path d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    {idx < ORDER_STATUSES.length - 1 && (
                      <div className={`order-status-line-compact ${isCompleted && idx < currentStepIndex ? 'filled' : ''}`}></div>
                    )}
                    <span className="order-status-label-compact">{step.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Action Buttons - Landing Page Style */}
        <div className="order-success-actions-compact" data-testid="order-success-actions">
          {/* Yet to be confirmed message - when fOrderStatus === 7 */}
          {showYetToBeConfirmed && (
            <div className="order-success-pending-msg" data-testid="order-pending-confirmation">
              <IoTimeOutline />
              <span>Yet to be confirmed</span>
            </div>
          )}

          {/* Edit Order - when order is confirmed (fOrderStatus !== 7) */}
          {showEditOrder && (
            <button
              className="order-success-btn order-success-btn-primary"
              onClick={handleEditOrder}
              disabled={isLoadingEdit}
              data-testid="order-success-edit-btn"
            >
              <MdOutlineEdit />
              {isLoadingEdit ? 'Loading...' : 'EDIT ORDER'}
            </button>
          )}

          {/* Browse Menu - when no table */}
          {showBrowseMenu && (
            <button
              className="order-success-btn order-success-btn-primary"
              onClick={handleGoToMenu}
              data-testid="order-success-browse-menu-btn"
            >
              <MdOutlineRestaurantMenu />
              BROWSE MENU
            </button>
          )}

          {/* Bottom row: Call Waiter + Pay Bill */}
          <div className="order-success-btn-row">
            {showCallWaiter && (
              <button
                className="order-success-btn order-success-btn-outline"
                onClick={handleCallWaiter}
                data-testid="order-success-call-waiter-btn"
              >
                <IoCallOutline />
                <span>CALL WAITER</span>
              </button>
            )}
            {showPayBill && (
              <button
                className="order-success-btn order-success-btn-outline"
                onClick={handlePayBill}
                data-testid="order-success-pay-bill-btn"
              >
                <RiBillLine />
                <span>PAY BILL</span>
              </button>
            )}
          </div>
        </div>

      </div>
      <NotificationPopup page="success" />
    </div>
  );
};

export default OrderSuccess;
