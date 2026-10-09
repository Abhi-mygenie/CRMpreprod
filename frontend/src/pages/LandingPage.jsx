import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useRestaurantDetails, useStations, buildMenuSectionsQueryOptions } from '../hooks/useMenuData';
import { useQueryClient } from '@tanstack/react-query';
import { useRestaurantId } from '../utils/useRestaurantId';
import { useRestaurantConfig } from '../context/RestaurantConfigContext';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useScannedTable } from '../hooks/useScannedTable';
import { isMultipleMenu } from '../api/utils/restaurantIdConfig';
import { checkTableStatus, getOrderDetails } from '../api/services/orderService';
import { isDineInOrRoom, showsDineInActions, hasAssignedTable, isTakeawayOrDelivery } from '../utils/orderTypeHelpers';
import { isItemAllowedForChannel, getChannelLabel } from '../utils/channelEligibility';
import { isChannelOpen, getChannelNextOpenTime } from '../utils/itemAvailability'; // CR-2026-08-06-001
import { getAuthToken } from '../utils/authToken';
// CR-2026-10-08-001 Step 1: otpPolicy gate removed — skip-otp is always called
import { crmSkipOtpWithRetry } from '../api/services/crmSkipOtpRetry';
import { buildUserId, crmLookupCustomer } from '../api/services/crmService';
import { shouldBlockNonQrOrder, buildNonQrBlockPayload } from '../utils/orderAccessPolicy';
import { postNonQrBlock } from '../api/services/diagnosticsService';
import NonQrBlockModal from '../components/NonQrBlockModal';
import logger from '../utils/logger';
import fetchWithTimeout from '../utils/fetchWithTimeout'; // CR-2026-02-XX-001
import { LandingPageSkeleton } from '../components/SkeletonLoaders';
import PromoBanner from '../components/PromoBanner/PromoBanner';
import HamburgerMenu from '../components/HamburgerMenu/HamburgerMenu';
import LandingCustomerCapture, { isPhoneValid } from '../components/LandingCustomerCapture/LandingCustomerCapture';
import OrderModeSelector from '../components/OrderModeSelector/OrderModeSelector';
import NotificationPopup from '../components/NotificationPopup/NotificationPopup';
import { DEFAULT_THEME } from '../constants/theme';
import { MdOutlineTableRestaurant, MdOutlineRestaurantMenu, MdOutlineEdit } from 'react-icons/md';
import { FaDoorOpen } from 'react-icons/fa';
import { IoCallOutline, IoPersonOutline } from 'react-icons/io5';
import { RiBillLine } from 'react-icons/ri';
import './LandingPage.css';

const LandingPage = () => {
  const navigate = useNavigate();
  const { restaurantId } = useRestaurantId();
  const { isAuthenticated, setRestaurantScope, setCrmAuth } = useAuth();
  const { startEditOrder, clearCart, cartItems, removeFromCart, isEditMode } = useCart();
  const { fetchConfig, showCallWaiter: configShowCallWaiter, showPayBill: configShowPayBill, showLandingCallWaiter: configShowLandingCallWaiter, showLandingPayBill: configShowLandingPayBill, showFooter: configShowFooter, showLogo: configShowLogo, showWelcomeText: configShowWelcomeText, showDescription: configShowDescription, showSocialIcons: configShowSocialIcons, showTableNumber: configShowTableNumber, showPoweredBy: configShowPoweredBy, showLandingCustomerCapture: configShowLandingCustomerCapture, showHamburgerMenu: configShowHamburgerMenu, showLoginButton: configShowLoginButton, logoUrl: configLogoUrl, backgroundImageUrl: configBackgroundImageUrl, mobileBackgroundImageUrl: configMobileBackgroundImageUrl, primaryColor: configPrimaryColor, buttonTextColor: configButtonTextColor, welcomeMessage: configWelcomeMessage, tagline: configTagline, banners: configBanners, instagramUrl: configInstagramUrl, facebookUrl: configFacebookUrl, twitterUrl: configTwitterUrl, youtubeUrl: configYoutubeUrl, whatsappNumber: configWhatsappNumber, phone: configPhone, browseMenuButtonText, mandatoryCustomerName, mandatoryCustomerPhone, poweredByText, poweredByLogoUrl, allowNonQrOrders,
    deliveryShifts, takeawayShifts, restaurantShifts, restaurantOpen,
  } = useRestaurantConfig(); // CR-2026-08-06-001: channel shift fields added

  const { tableNo: scannedTableNo, tableId: scannedTableId, roomOrTable: scannedRoomOrTable, isScanned, orderType: scannedOrderType, foodFor: scannedFoodFor, updateOrderType } = useScannedTable();

  const { restaurant, loading, error } = useRestaurantDetails(restaurantId);
  const actualRestaurantId = restaurant?.id?.toString() || restaurantId;
  const { stations } = useStations(actualRestaurantId);
  const queryClient = useQueryClient();

  // State for customer capture flow
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [capturedPhone, setCapturedPhone] = useState('');
  const [capturedName, setCapturedName] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [isCheckingCustomer, setIsCheckingCustomer] = useState(false);

  // Cached check-customer result (debounced phone lookup)
  const [customerLookup, setCustomerLookup] = useState(null); // { exists, customer, phone }
  const [isAutoLooking, setIsAutoLooking] = useState(false);
  const lastAutoFilledName = useRef(''); // Track the actual auto-filled name value
  const lookupTimerRef = useRef(null);
  const lastLookedUpPhone = useRef('');

  // Debounced auto-lookup: when phone is valid, check-customer in background
  useEffect(() => {
    // Clear previous timer
    if (lookupTimerRef.current) clearTimeout(lookupTimerRef.current);

    // Skip if authenticated or phone not valid
    if (isAuthenticated || !capturedPhone || !isPhoneValid(capturedPhone)) {
      setCustomerLookup(null);
      return;
    }

    // Skip if we already looked up this exact phone
    if (lastLookedUpPhone.current === capturedPhone) return;

    lookupTimerRef.current = setTimeout(async () => {
      setIsAutoLooking(true);
      try {
        // CR-2026-10-03-004 Part A: CRM lookup replaces backend check-customer
        const data = await crmLookupCustomer(capturedPhone, restaurantId);
        lastLookedUpPhone.current = capturedPhone;
        setCustomerLookup({ ...data, phone: capturedPhone });

        if (data.exists && data.customer?.name) {
          // Customer found — auto-fill name (or replace stale auto-filled name)
          if (!capturedName.trim() || capturedName.trim() === lastAutoFilledName.current.trim()) {
            setCapturedName(data.customer.name);
            lastAutoFilledName.current = data.customer.name;
          }
        } else {
          // Customer not found — clear name only if it was auto-filled (not user-typed)
          if (capturedName.trim() && capturedName.trim() === lastAutoFilledName.current.trim()) {
            setCapturedName('');
          }
          lastAutoFilledName.current = '';
        }
      } catch (err) {
        logger.error('order', 'Auto customer lookup failed:', err);
        setCustomerLookup(null);
      } finally {
        setIsAutoLooking(false);
      }
    }, 500); // 500ms debounce

    return () => {
      if (lookupTimerRef.current) clearTimeout(lookupTimerRef.current);
    };
  }, [capturedPhone, isAuthenticated, restaurantId, capturedName]);

  // State for table status check (edit order detection)
  // CR Phase-1 (Room Scanner Availability Gate): we additionally store `isAvailable`
  // so we can distinguish 'Available' (vacant for room flow) from
  // 'Not Available + no orderId' (checked-in, no active order yet).
  // CR Phase-2 (Room Guest Auto-Populate + Lock): we also store `tableType`,
  // `guestLocked`, `guestIncomplete`, `guestName`, `guestPhone` so the UI can
  // auto-fill + lock the customer fields when a checked-in room is detected.
  const [tableStatusCheck, setTableStatusCheck] = useState({
    isLoading: false,
    isOccupied: false,
    isAvailable: false,
    existingOrderId: null,
    isChecked: false,
    error: null,
    tableType: null,
    guestLocked: false,
    guestIncomplete: false,
    guestName: '',
    guestPhone: '',
  });

  // State for edit order loading
  const [isLoadingEditOrder, setIsLoadingEditOrder] = useState(false);
  const [showNonQrBlockModal, setShowNonQrBlockModal] = useState(false);

  // Phase 2: Takeaway/Delivery mode state
  const isTakeawayDeliveryMode = isTakeawayOrDelivery(scannedOrderType);
  const [selectedMode, setSelectedMode] = useState(scannedOrderType === 'delivery' ? 'delivery' : 'takeaway');

  // CR-2026-08-06-001: per-channel availability for the mode selector
  const _chConfig = { deliveryShifts, takeawayShifts, restaurantShifts, restaurantOpen };
  const isDeliveryOpen  = isChannelOpen('delivery', _chConfig);
  const isTakeawayOpen  = isChannelOpen('takeaway', _chConfig);
  const deliveryOpensAt = isDeliveryOpen  ? null : getChannelNextOpenTime('delivery', _chConfig);
  const takeawayOpensAt = isTakeawayOpen  ? null : getChannelNextOpenTime('takeaway', _chConfig);

  // Handle mode switch (takeaway ↔ delivery)
  // CR A-1: prompt-and-confirm UX before removing channel-disallowed cart items.
  // If switching to a new channel would invalidate any item already in the cart,
  // ask the user to confirm. On confirm, remove disallowed items + apply switch.
  // On cancel, revert (no state change).
  const handleModeChange = (newMode) => {
    // Identify items in cart that would be disallowed by the new channel.
    const disallowed = (cartItems || []).filter(
      (ci) => !isItemAllowedForChannel(ci?.item, newMode)
    );

    if (disallowed.length > 0) {
      const names = disallowed
        .map((ci) => ci?.item?.name)
        .filter(Boolean)
        .slice(0, 5);
      const namesStr = names.length === disallowed.length
        ? names.join(', ')
        : `${names.join(', ')} and ${disallowed.length - names.length} more`;
      const channelLabel = getChannelLabel(newMode);
      const confirmed = window.confirm(
        `Switching to ${channelLabel} will remove ${disallowed.length} item(s) not available for ${channelLabel}:\n\n${namesStr}\n\nContinue?`
      );
      if (!confirmed) {
        // User cancelled — do nothing, keep current mode.
        return;
      }
      // User confirmed — remove disallowed items.
      disallowed.forEach((ci) => {
        if (ci?.cartId) removeFromCart(ci.cartId);
      });
      toast.success(`Removed ${disallowed.length} item(s) not available for ${channelLabel}.`);
    }

    setSelectedMode(newMode);
    if (updateOrderType) {
      updateOrderType(newMode);
    }
  };

  // Sync selectedMode when scannedOrderType changes (initial load)
  useEffect(() => {
    if (scannedOrderType === 'delivery' || scannedOrderType === 'takeaway') {
      setSelectedMode(scannedOrderType);
    }
  }, [scannedOrderType]);

  // Fetch admin config and set auth scope when restaurantId is available
  // Also reset customer capture state when restaurant changes (component reuse by React Router)
  useEffect(() => {
    if (restaurantId) {
      fetchConfig(restaurantId);
      setRestaurantScope(restaurantId);
      // Clear stale customer capture from previous restaurant
      setCapturedPhone('');
      setCapturedName('');
      setCustomerLookup(null);
      lastAutoFilledName.current = '';
      lastLookedUpPhone.current = '';
    }
  }, [restaurantId, fetchConfig, setRestaurantScope]);

  // PERF: Idle prefetch of default menu for SINGLE-MENU restaurants only.
  // Multi-menu restaurants (e.g., Hyatt 716) are skipped because the user
  // must pick a station on /<rid>/stations next — we cannot know which.
  // Multi-menu prefetch is handled on the Stations page (hover/touch/focus).
  //
  // Uses the same query key/fn as `useMenuSections`, so MenuItems.jsx will
  // hit the cache (or join the in-flight request) instead of refetching.
  useEffect(() => {
    if (!restaurant || !restaurantId) return;
    if (isMultipleMenu(restaurant)) return; // skip multi-menu

    const rid = restaurant.id?.toString() || restaurantId;
    // Match exactly what MenuItems.jsx will use:
    //   effectiveStationId = stationId (URL, undefined here) || foodFor
    const stationId = scannedFoodFor || undefined;

    const ric = window.requestIdleCallback || ((cb) => setTimeout(cb, 200));
    const cic = window.cancelIdleCallback || clearTimeout;
    const handle = ric(() => {
      queryClient.prefetchQuery(buildMenuSectionsQueryOptions(rid, stationId));
    }, { timeout: 2000 });

    return () => cic(handle);
  }, [restaurant, restaurantId, scannedFoodFor, queryClient]);

  // Reset table status check on component mount to ensure fresh check every time
  // This fixes the stale cache bug where paid orders still appeared active
  useEffect(() => {
    setTableStatusCheck({
      isLoading: false,
      isOccupied: false,
      isAvailable: false,
      existingOrderId: null,
      isChecked: false,
      error: null,
      tableType: null,
      guestLocked: false,
      guestIncomplete: false,
      guestName: '',
      guestPhone: '',
    });
  }, []); // Empty deps = runs on mount only

  // Check table status on load (only for non-multi-menu restaurants with scanned table)
  // If table has an active order, auto-redirect to OrderSuccess
  useEffect(() => {
    const checkTable = async () => {
      // Skip if: no table scanned, or is multi-menu restaurant, or already checked this session
      if (!isScanned || !scannedTableId || !restaurantId) return;
      // Phase 1: Table status check only when a specific table/room was scanned (not walk-in)
      if (!hasAssignedTable(scannedTableId)) return;
      // CR Phase-1 Room Scanner Gate: must wait for restaurant data to load before deciding
      // multi-menu skip — otherwise we race against the data fetch and 716 gets a transient
      // status check that incorrectly classifies it (716 is multi-menu and must be skipped).
      if (!restaurant) return;
      if (isMultipleMenu(restaurant)) return;
      if (tableStatusCheck.isChecked) return;

      setTableStatusCheck(prev => ({ ...prev, isLoading: true }));

      try {
        // Get auth token (will refresh if expired)
        let token;
        try {
          token = await getAuthToken();
        } catch (tokenErr) {
          logger.error('auth', 'Token fetch failed, retrying...', tokenErr);
          // Retry once with force refresh
          token = await getAuthToken(true);
        }

        const numericRestaurantId = restaurant?.id || restaurantId;
        const result = await checkTableStatus(scannedTableId, numericRestaurantId, token);

        // Handle invalid table ID
        if (result.isInvalid) {
          toast.error('Invalid table. Please scan a valid QR code.');
          setTableStatusCheck({
            isLoading: false,
            isOccupied: false,
            isAvailable: false,
            existingOrderId: null,
            isChecked: true,
            error: 'Invalid table',
            tableType: null,
            guestLocked: false,
            guestIncomplete: false,
            guestName: '',
            guestPhone: '',
          });
          return;
        }

        // If table has an active order, auto-redirect to OrderSuccess
        if (result.isOccupied && result.orderId) {
          try {
            // Fetch order details to check status
            const orderDetails = await getOrderDetails(result.orderId);

            // BUG-042 FIX: If the order contains ONLY system items (e.g. POS
            // "Check In" placeholder), it's not a real food order. Skip redirect
            // and treat as "no active order" so the user sees Browse Menu and
            // the Phase 2 guest auto-populate flow runs normally.
            // `previousItems` is already filtered by `filterSystemItems` in
            // `getOrderDetails`, so Check In rows are stripped — length === 0
            // means no real food items exist.
            const hasRealFoodItems = (orderDetails.previousItems?.length ?? 0) > 0;

            if (!hasRealFoodItems) {
              logger.info('order', `[BUG-042] Order ${result.orderId} is check-in-only (no real food items). Skipping redirect.`);
              // Nullify so downstream shows Browse Menu, not Edit Order.
              result.orderId = null;
              result.isOccupied = false;
              // Fall through to Phase 2 guest auto-populate.
            } else if (orderDetails.fOrderStatus !== 3 && orderDetails.fOrderStatus !== 6) {
              // Real food order, active — auto-redirect to OrderSuccess page
              navigate(`/${numericRestaurantId}/order-success`, {
                state: {
                  orderData: {
                    orderId: result.orderId,
                    totalToPay: orderDetails.billSummary?.grandTotal || 0,
                    billSummary: orderDetails.billSummary,
                  }
                }
              });
              return; // Don't update state, we're navigating away
            } else {
              // Order is cancelled or paid - clear any stale cart data
              // This prevents users from accidentally adding items to a paid order
              clearCart();
            }
          } catch (orderErr) {
            logger.error('order', 'Failed to fetch order details for auto-redirect:', orderErr);
            // On error, fall through to show Edit Order button (user can retry manually)
          }
        }

        // CR Phase-2 — Room guest auto-populate + lock.
        // For room scans where the room is checked-in and the API returned
        // complete guest details, seed name/phone fields and persist a
        // `locked` flag so ReviewOrder also renders them read-only.
        // We compute eligibility here so it's a single source of truth.
        const isCheckedInRoom =
          scannedRoomOrTable === 'room' &&
          (result.tableType === 'RM') &&
          result.tableStatus === 'Not Available';
        const guest = result.guest || null;
        const guestNameJoined = guest
          ? `${guest.firstName} ${guest.lastName}`.trim().replace(/\s+/g, ' ')
          : '';
        const guestPhoneDigits = guest ? String(guest.phone || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '').slice(-10) : '';
        const guestPhoneE164 = guestPhoneDigits.length === 10 ? `+91${guestPhoneDigits}` : '';
        const isGuestComplete = !!guestNameJoined && !!guestPhoneE164;
        const isCheckedInWithGuest = isCheckedInRoom && isGuestComplete;
        // RM + Not Available BUT incomplete guest = treat as blocked (per S1 owner decision)
        const isCheckedInIncomplete = isCheckedInRoom && !isGuestComplete;

        if (isCheckedInWithGuest) {
          // Seed local state and persist lock for ReviewOrder.
          setCapturedName(guestNameJoined);
          setCapturedPhone(guestPhoneE164);
          try {
            localStorage.setItem('guestCustomer', JSON.stringify({
              name: guestNameJoined,
              phone: guestPhoneE164,
              restaurantId: String(numericRestaurantId),
              locked: true,
              source: 'checked-in-room',
            }));
          } catch (_e) { /* localStorage may be full / disabled — non-fatal */ }
        }

        setTableStatusCheck({
          isLoading: false,
          isOccupied: result.isOccupied,
          isAvailable: result.isAvailable === true,
          existingOrderId: result.orderId || null,
          isChecked: true,
          error: result.error || null,
          // CR Phase-2 fields
          tableType: result.tableType || null,
          guestLocked: isCheckedInWithGuest,
          guestIncomplete: isCheckedInIncomplete,
          guestName: isCheckedInWithGuest ? guestNameJoined : '',
          guestPhone: isCheckedInWithGuest ? guestPhoneE164 : '',
        });
      } catch (err) {
        logger.error('table', 'Table status check failed:', err);
        // Fallback to browse menu on error
        setTableStatusCheck({
          isLoading: false,
          isOccupied: false,
          isAvailable: false,
          existingOrderId: null,
          isChecked: true,
          error: err.message,
          tableType: null,
          guestLocked: false,
          guestIncomplete: false,
          guestName: '',
          guestPhone: '',
        });
      }
    };

    checkTable();
  }, [isScanned, scannedTableId, scannedOrderType, scannedRoomOrTable, restaurantId, restaurant, tableStatusCheck.isChecked, navigate, clearCart]);

  // Theme colors now controlled by local admin config only (not POS)

  // CR-2026-05-30-001 Item 1: silent skip-OTP helper.
  // Called from handleDiningMenuClick when the matching otpRequired* flag is
  // explicitly `false`. Mirrors PasswordSetup.handleSkip + navigateToMenu so
  // the user lands on the same destination as a successful OTP login.
  // Failure semantics:
  //   - 409   → CR-2026-10-08-001 Step 1: degrade to guest (password path removed, CRM CR-098)
  //   - 4xx   → toast error, stay on landing
  //   - 429 exhausted → CR-2026-09-15-002: wait-time toast, stay on landing
  //   - else  → degraded guest mode (proceed to menu without CRM token, D=b)
  const silentSkipOtpAndNavigate = async ({ phone, name, data, restaurantId: rid, orderMode }) => {
    const userId = buildUserId(rid);
    // CR-2026-10-08-001 Step 1: hasJustAuthenticated added (D3) — isAuthenticated is stale
    // at call time (React state not flushed yet); pass token result to unblock delivery.
    const navigateAfterSkip = ({ hasJustAuthenticated = false } = {}) => {
      if (orderMode === 'delivery' && !hasJustAuthenticated && !isAuthenticated) {
        toast.error('Please login to use delivery');
        return;
      }
      if (orderMode === 'delivery') {
        navigate(`/${rid}/delivery-address`);
        return;
      }
      if (isMultipleMenu(restaurant)) {
        navigate(`/${rid}/stations`);
      } else {
        navigate(`/${rid}/menu`);
      }
    };

    try {
      const result = await crmSkipOtpWithRetry(phone, userId);
      if (result?.token) {
        const customerProfile = { name, phone, ...(result.customer || {}) };
        setCrmAuth(result.token, customerProfile, rid);
      }
      // Persist guestCustomer regardless of CRM token, so downstream payloads
      // (cust_name, cust_phone) carry the captured identity.
      const guestData = { name, phone, restaurantId: rid };
      localStorage.setItem('guestCustomer', JSON.stringify(guestData));
      navigateAfterSkip({ hasJustAuthenticated: !!result?.token });
    } catch (err) {
      const status = err?.status;
      if (status === 409) {
        // CR-2026-10-08-001 Step 1: password path removed (CRM CR-098).
        // Degrade to guest so diner can still order (D4).
        logger.order('[crmSkipOtp] 409 — password path removed, degrading to guest');
        const guestData = { name, phone, restaurantId: rid };
        localStorage.setItem('guestCustomer', JSON.stringify(guestData));
        toast('Continuing as guest');
        navigateAfterSkip({ hasJustAuthenticated: false });
        return;
      }
      if (status === 400 || status === 401 || status === 403 || status === 404 || status === 422) {
        // User-correctable / config error — keep them on landing
        logger.order(`[crmSkipOtp] ${status} — staying on landing`);
        toast.error(err?.message || 'Could not continue. Please try again.');
        return;
      }
      if (status === 429) {
        // CR-2026-09-15-002 (folded): 429 exhausted — show wait time, stay on landing
        const waitSecs = err?.retryAfterMs ? Math.ceil(err.retryAfterMs / 1000) : 0;
        const msg = waitSecs > 0
          ? `Too many attempts. Please try again in ${waitSecs} seconds.`
          : 'Too many attempts. Please try again shortly.';
        logger.order(`[crmSkipOtp] 429 exhausted — staying on landing (retryAfterMs=${err?.retryAfterMs})`);
        toast.error(msg);
        return;
      }
      // Retries exhausted, transport error, 5xx → degraded guest (D=b)
      logger.order(`[crmSkipOtp] retries exhausted (status=${status || 'network'}) — degrading to guest`);
      const guestData = { name, phone, restaurantId: rid };
      localStorage.setItem('guestCustomer', JSON.stringify(guestData));
      toast('Continuing as guest');
      navigateAfterSkip({ hasJustAuthenticated: false });
    }
  };

  const handleDiningMenuClick = async () => {
    const actualRestaurantId = restaurant?.id || restaurantId;
    console.log('[Landing] Browse Menu clicked', { isAuthenticated, isTakeawayDeliveryMode, capturedPhone, capturedName, selectedMode });

    // CR-2026-05-30-002 — Guard C1 (Landing → Browse Menu).
    // Fires when admin set allowNonQrOrders=false and the customer has no
    // valid QR-scan context. Bypasses (716, takeaway/delivery, edit-mode,
    // walk-in QR) are handled inside shouldBlockNonQrOrder.
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
      // BUG-2026-10-06-001: gated behind the logger (prod-silent unless debug:order)
      logger.order('[CR-002 C1] policy decision', {
        policy, allowNonQrOrders, restaurantId, isScanned,
        scannedTableId, scannedRoomOrTable, scannedOrderType, isEditMode,
      });
      // BUG-2026-10-06-001: record the decision on BOTH paths when the policy
      // is enforced (allowNonQrOrders === false). Never when the switch is on (D1).
      if (allowNonQrOrders === false) {
        postNonQrBlock(
          buildNonQrBlockPayload(
            { restaurantId, scannedRoomOrTable, scannedTableId, isEditMode, isAuthenticated },
            'landing',
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

    // CR Phase-1 — Room Scanner Availability Gate (defensive guard)
    // Block Browse Menu when room scanner says room is vacant / context lost / status unknown.
    // The button itself is hidden via `roomBlocked` below, but this guard catches
    // any programmatic / accessibility / stale-state path that bypasses the UI.
    if (scannedRoomOrTable === 'room' && !hasAssignedTable(scannedTableId)) {
      toast.error('Room context lost. Please rescan the QR code.');
      return;
    }
    if (
      scannedRoomOrTable === 'room' &&
      tableStatusCheck.isChecked &&
      !tableStatusCheck.isLoading &&
      (
        tableStatusCheck.isAvailable === true ||
        !!tableStatusCheck.error ||
        tableStatusCheck.guestIncomplete === true
      )
    ) {
      toast.error('This room is currently checked out, so ordering is disabled. Please contact staff.');
      return;
    }

    // Phase 2: Validate mandatory fields for takeaway/delivery
    if (isTakeawayDeliveryMode && !isAuthenticated) {
      if (!capturedPhone || !isPhoneValid(capturedPhone)) {
        setPhoneError('Please enter a valid phone number');
        return;
      }
      if (!capturedName.trim()) {
        toast.error('Please enter your name');
        return;
      }
    }

    // If customer capture is enabled (config-based), validate + lookup
    // Skip entirely for authenticated users — they're already identified
    if (!isAuthenticated && (configShowLandingCustomerCapture || isTakeawayDeliveryMode)) {
      // Validate mandatory fields (config-driven for dine-in, always for takeaway/delivery)
      if (effectiveMandatoryPhone && (!capturedPhone || !isPhoneValid(capturedPhone))) {
        setPhoneError('Please enter a valid phone number');
        return;
      }
      if (effectiveMandatoryName && !capturedName.trim()) {
        toast.error('Please enter your name');
        return;
      }
      
      // If phone is provided, do customer lookup
      if (capturedPhone && isPhoneValid(capturedPhone)) {
        // Use cached lookup if available for this phone, otherwise fetch
        let data = customerLookup && customerLookup.phone === capturedPhone ? customerLookup : null;

        if (!data) {
          setIsCheckingCustomer(true);
          try {
            // CR-2026-10-03-004 Part A: CRM lookup replaces backend check-customer
            data = await crmLookupCustomer(capturedPhone, restaurantId);
          } catch (err) {
            logger.error('order', 'Customer lookup failed:', err);
            // On error, save as guest and go to menu
            const guestData = { name: capturedName, phone: capturedPhone, restaurantId };
            localStorage.setItem('guestCustomer', JSON.stringify(guestData));
            if (isMultipleMenu(restaurant)) {
              navigate(`/${actualRestaurantId}/stations`);
            } else {
              navigate(`/${actualRestaurantId}/menu`);
            }
            setIsCheckingCustomer(false);
            return;
          }
          setIsCheckingCustomer(false);
        }
          
        // CR-2026-10-08-001 Step 1: skipOtp* gate removed — skip-otp is always the identity path.
        // CRM CR-098 deleted register/login; password page is unreachable. All diners go through
        // silentSkipOtpAndNavigate regardless of per-restaurant skipOtp* config flags.
        if (data.exists) {
          const customerName = data.customer?.name || '';
          if (customerName && !capturedName.trim()) {
            setCapturedName(customerName);
          }
          await silentSkipOtpAndNavigate({
            phone: capturedPhone,
            name: capturedName || customerName,
            data,
            restaurantId: actualRestaurantId,
            orderMode: selectedMode,
          });
        } else {
          await silentSkipOtpAndNavigate({
            phone: capturedPhone,
            name: capturedName,
            data: { exists: false, customer: null },
            restaurantId: actualRestaurantId,
            orderMode: selectedMode,
          });
        }
        return;
      }
    }
    
    // No phone or capture disabled → go directly to menu (or delivery address for delivery)
    if (capturedName || capturedPhone) {
      const guestData = { name: capturedName, phone: capturedPhone, restaurantId };
      localStorage.setItem('guestCustomer', JSON.stringify(guestData));
    }
    // Delivery mode requires login for addresses — prompt if guest
    if (selectedMode === 'delivery' && !isAuthenticated) {
      toast.error('Please login to use delivery');
      return;
    }
    if (selectedMode === 'delivery' && isAuthenticated) {
      navigate(`/${actualRestaurantId}/delivery-address`);
      return;
    }
    if (isMultipleMenu(restaurant)) {
      navigate(`/${actualRestaurantId}/stations`);
    } else {
      navigate(`/${actualRestaurantId}/menu`);
    }
  };

  const handleCallWaiter = () => {
    // TODO: Integrate with call waiter API
    logger.order('Call waiter triggered');
  };

  const handlePayBill = () => {
    // TODO: Integrate with pay bill flow
    logger.order('Pay bill triggered');
  };

  // Handle Edit Order click - fetch order details and enter edit mode
  const handleEditOrderClick = async () => {
    if (!tableStatusCheck.existingOrderId) return;

    setIsLoadingEditOrder(true);
    try {
      // Fetch order details from API
      const orderDetails = await getOrderDetails(tableStatusCheck.existingOrderId);

      // CHECK: If order is "yet to be confirmed" (fOrderStatus === 7), redirect to OrderSuccess
      if (orderDetails.fOrderStatus === 7) {
        const actualRestaurantId = restaurant?.id || restaurantId;
        navigate(`/${actualRestaurantId}/order-success`, {
          state: {
            orderData: {
              orderId: tableStatusCheck.existingOrderId,
              totalToPay: orderDetails.billSummary?.grandTotal || 0,
              billSummary: orderDetails.billSummary,
            }
          }
        });
        return;  // Don't enter edit mode
      }

      // CHECK: If order is cancelled or paid, don't allow edit
      if (orderDetails.fOrderStatus === 3 || orderDetails.fOrderStatus === 6) {
        toast(orderDetails.fOrderStatus === 3 ? 'This order was cancelled.' : 'This order has been paid.', { icon: 'ℹ️' });
        // Table should be available now - just go to menu for new order
        const actualRestaurantId = restaurant?.id || restaurantId;
        if (isMultipleMenu(restaurant)) {
          navigate(`/${actualRestaurantId}/stations`);
        } else {
          navigate(`/${actualRestaurantId}/menu`);
        }
        return;
      }

      // CHECK: Paid orders (payment_status === 'paid') cannot be edited.
      // Server-side gate matching OrderSuccess.jsx — prevents prepaid/settled orders from entering edit mode.
      if (orderDetails.paymentStatus === 'paid') {
        toast('This order has been paid.', { icon: 'ℹ️' });
        const actualRestaurantId = restaurant?.id || restaurantId;
        if (isMultipleMenu(restaurant)) {
          navigate(`/${actualRestaurantId}/stations`);
        } else {
          navigate(`/${actualRestaurantId}/menu`);
        }
        return;
      }

      // Start edit mode with previous items (only for confirmed orders: fOrderStatus 1, 2, 5)
      startEditOrder(
        tableStatusCheck.existingOrderId,
        orderDetails.previousItems,
        {
          tableId: orderDetails.tableId || scannedTableId,
          tableNo: orderDetails.tableNo || scannedTableNo,
          restaurant: orderDetails.restaurant,
        }
      );

      // Navigate to menu to add more items
      const actualRestaurantId = restaurant?.id || restaurantId;
      if (isMultipleMenu(restaurant)) {
        navigate(`/${actualRestaurantId}/stations`);
      } else {
        navigate(`/${actualRestaurantId}/menu`);
      }
    } catch (err) {
      logger.error('order', 'Failed to fetch order details for editing:', err);
      toast.error('Failed to load order. Starting fresh.');
      // On error, fallback to normal menu navigation
      const actualRestaurantId = restaurant?.id || restaurantId;
      navigate(`/${actualRestaurantId}/menu`);
    } finally {
      setIsLoadingEditOrder(false);
    }
  };

  if (loading || !restaurantId) {
    return <LandingPageSkeleton />;
  }

  if (error) {
    return (
      <div className="landing-page">
        <div className="landing-container">
          <div className="error-message">
            <p>Failed to load restaurant information. Please try again later.</p>
          </div>
        </div>
      </div>
    );
  }

  const restaurantName = restaurant?.name || 'MyGenie';
  // Tagline from local config only (not from MyGenie API)
  const tagline = configTagline || '';
  // Logo from local config only (DFA-003: no fallback — no logo if not configured)
  const logoUrl = configLogoUrl || null;
  const phone = configPhone || restaurant?.phone || '';
  // Instagram from local config only
  const instagramUrl = configInstagramUrl || '';
  const facebookUrl = configFacebookUrl || '';
  const twitterUrl = configTwitterUrl || '';
  const youtubeUrl = configYoutubeUrl || '';
  const whatsappNumber = configWhatsappNumber || '';

  // All visibility controlled by admin config (defaults to true)
  // FEAT-002-PREP: Call Waiter / Pay Bill only relevant for dine-in/room
  const isDineInContext = showsDineInActions(scannedOrderType);
  const showLogo = configShowLogo;
  const showWelcome = configShowWelcomeText;
  const showDescription = configShowDescription && tagline;
  const showSocial = configShowSocialIcons && (phone || instagramUrl || facebookUrl || twitterUrl || youtubeUrl || whatsappNumber);
  const showTable = configShowTableNumber && isScanned && scannedTableNo && hasAssignedTable(scannedTableId);
  const showBrowseMenu = true; // Always show Browse Menu / Edit Order button
  const showCallWaiter = configShowLandingCallWaiter && isDineInContext;
  const showPayBill = configShowLandingPayBill && isDineInContext;
  const showPoweredBy = configShowPoweredBy;

  // ───────────────────────────────────────────────────────────────────────────
  // CR Phase-1 — Room Scanner Availability Gate
  // ───────────────────────────────────────────────────────────────────────────
  // For QR flows where URL says `type=room`, we use the existing
  // /customer/check-table-status response to determine whether the room is
  // vacant/checked-out (block) vs checked-in (allow).
  //
  //   table_status === 'Available'   → isAvailable=true  → ROOM VACANT  → BLOCK
  //   table_status === 'Not Available' + no orderId → isOccupied=false, isAvailable=false → CHECKED-IN, NO ORDER → ALLOW
  //   table_status === 'Not Available' + orderId    → isOccupied=true  → ACTIVE ORDER → existing Edit Order flow handles it
  //   API failure / network error → safe-default block for room flow
  //
  // 716 NATURAL EXCLUSION (evidence): the /customer/check-table-status API
  // call is already skipped for multi-menu restaurants at line ~238
  // (`if (isMultipleMenu(restaurant)) return;`). 716 IS multi-menu, so
  // tableStatusCheck.isChecked stays false for 716 — this gate never fires.
  // 716's existing manual room-pick flow at ReviewOrder.jsx:545-554, 802-807
  // remains untouched.
  const isRoomScanner = scannedRoomOrTable === 'room';
  const roomContextLost = isRoomScanner && !hasAssignedTable(scannedTableId);
  const roomNotCheckedIn =
    isRoomScanner &&
    tableStatusCheck.isChecked &&
    !tableStatusCheck.isLoading &&
    (
      // Phase 1: room reported Available (vacant) or API errored — block.
      tableStatusCheck.isAvailable === true ||
      !!tableStatusCheck.error ||
      // Phase 2 (S1): RM + Not Available BUT guest details missing/incomplete
      // -> reuse the same "Room Checked Out" blocked card (per owner decision).
      tableStatusCheck.guestIncomplete === true
    );
  const roomBlocked = roomContextLost || roomNotCheckedIn;
  let roomBlockedTitle = 'Room Checked Out';
  let roomBlockedMessage = 'This room is currently checked out, so ordering is disabled. Please contact staff.';
  if (roomContextLost) {
    roomBlockedTitle = 'Room context lost';
    roomBlockedMessage = 'Please rescan the QR code.';
  } else if (tableStatusCheck.error) {
    roomBlockedTitle = 'Unable to verify room';
    roomBlockedMessage = 'Please try again or contact staff.';
  }

  // Admin config overrides for welcome message
  const displayWelcomeMessage = configWelcomeMessage || `Welcome to ${restaurantName}!`;
  const displayTagline = configTagline;

  // Button colors from local config only (no POS fallback)
  const btnColor = configPrimaryColor || DEFAULT_THEME.primaryColor;
  const btnTextColor = configButtonTextColor || DEFAULT_THEME.buttonTextColor;

  // Phase 2: Customer capture logic
  // For takeaway/delivery: ALWAYS show and ALWAYS mandatory (unless logged in)
  // For dine-in/walk-in: show from config
  // CR Phase-2 (Room Guest Auto-Populate): force-show + lock when a checked-in
  // room returned full guest details, so the user can see the auto-populated
  // (read-only) name/phone before tapping Browse Menu.
  const showCustomerCapture = isTakeawayDeliveryMode
    ? !isAuthenticated  // Always show for takeaway/delivery (mandatory)
    : (tableStatusCheck.guestLocked || (configShowLandingCustomerCapture && !isAuthenticated));

  // Phase 2: For takeaway/delivery, name+phone are always mandatory
  const effectiveMandatoryName = isTakeawayDeliveryMode ? true : mandatoryCustomerName;
  const effectiveMandatoryPhone = isTakeawayDeliveryMode ? true : mandatoryCustomerPhone;

  // Phase 2: Validate if takeaway/delivery requirements are met
  const isTakeawayDeliveryReady = !isTakeawayDeliveryMode || isAuthenticated || 
    (capturedName.trim().length > 0 && capturedPhone && isPhoneValid(capturedPhone));

  // Check if we have a background image
  const hasBackgroundImage = !!configBackgroundImageUrl;
  // Mobile image falls back to desktop if not set
  const mobileImg = configMobileBackgroundImageUrl || configBackgroundImageUrl;

  return (
    <div 
      className={`landing-page ${hasBackgroundImage ? 'has-background-image' : ''}`} 
      data-testid="landing-page"
      style={hasBackgroundImage ? {
        '--landing-bg-desktop': `url(${configBackgroundImageUrl})`,
        '--landing-bg-mobile': `url(${mobileImg})`,
      } : {}}
    >
      {/* Hamburger Menu - Controlled by config */}
      {configShowHamburgerMenu !== false && (
        <div className="landing-hamburger-wrapper">
          <HamburgerMenu restaurantName={restaurant?.name} phone={phone} />
        </div>
      )}

      {/* Login Button - Top right only if not logged in and config allows */}
      {!isAuthenticated && configShowLoginButton !== false && (
        <div className="landing-login-wrapper">
          <button 
            className={`landing-login-btn ${hasBackgroundImage ? 'on-image' : ''}`}
            onClick={() => navigate('/login')}
            style={{ backgroundColor: 'var(--color-primary)', color: 'var(--button-text-color)' }}
            data-testid="landing-login-btn"
          >
            <IoPersonOutline />
            <span>Login</span>
          </button>
        </div>
      )}

      <div className="landing-container">

        {/* 1. Logo */}
        {showLogo && (
          <div className="logo-section" data-testid="landing-logo">
            {logoUrl ? (
            <img
              src={logoUrl}
              alt={restaurantName}
              className="brand-logo"
              onError={(e) => {
                e.target.style.display = 'none';
              }}
            />
            ) : (
              <h2 className="brand-name-fallback">{restaurantName}</h2>
            )}
          </div>
        )}

        {/* 2. Welcome Text */}
        {showWelcome && (
          <h1 className="welcome-text" data-testid="landing-welcome">
            {displayWelcomeMessage}
          </h1>
        )}

        {/* 2.5 Tagline */}
        {displayTagline && (
          <p className="tagline-text" data-testid="landing-tagline">
            {displayTagline}
          </p>
        )}

        {/* 3. Description - uses tagline from local config (skip if tagline section already shows it) */}
        {showDescription && tagline && !displayTagline && (
          <p className={`description-text ${hasBackgroundImage ? 'on-image' : ''}`} data-testid="landing-description">
            {tagline}
          </p>
        )}

        {/* 3.2 Admin Config Banners - Show only when NO background image */}
        {!hasBackgroundImage && configBanners.filter(b => b.displayOn === 'landing' || b.displayOn === 'both' || !b.displayOn).length > 0 && (
          <div className="config-banner-carousel" data-testid="config-banner-carousel">
            <PromoBanner
              promotions={configBanners
                .filter(b => b.displayOn === 'landing' || b.displayOn === 'both' || !b.displayOn)
                .map((b, i) => ({
                  id: b.id || i,
                  image_url: b.bannerImage,
                  title: b.bannerTitle,
                  link: b.bannerLink,
                }))}
              autoPlayInterval={4000}
            />
          </div>
        )}

        {/* 4. Table Number Display */}
        {showTable && (
          <div className="table-badge" data-testid="landing-table-badge">
            <span className="table-badge-icon">
              {scannedRoomOrTable === 'room' ? <FaDoorOpen /> : <MdOutlineTableRestaurant />}
            </span>
            <span className="table-badge-label">
              {scannedRoomOrTable === 'room' ? 'Room' : 'Table'}
            </span>
            <span className="table-badge-number">{scannedTableNo}</span>
          </div>
        )}

        {/* Phase 2: Takeaway/Delivery Mode Selector */}
        {isTakeawayDeliveryMode && (
          <OrderModeSelector
            mode={selectedMode}
            onModeChange={handleModeChange}
            primaryColor={btnColor}
            textColor={btnTextColor}
            deliveryOpen={isDeliveryOpen}
            takeawayOpen={isTakeawayOpen}
            deliveryOpensAt={deliveryOpensAt}
            takeawayOpensAt={takeawayOpensAt}
          />
        )}

        {/* 4.5 Customer Capture Form — always shown for takeaway/delivery, config-driven for dine-in */}
        {showCustomerCapture && (
          <LandingCustomerCapture
            phone={capturedPhone}
            setPhone={(val) => {
              setCapturedPhone(val);
            }}
            name={capturedName}
            setName={(val) => {
              setCapturedName(val);
            }}
            phoneError={phoneError}
            setPhoneError={setPhoneError}
            mandatoryName={effectiveMandatoryName}
            mandatoryPhone={effectiveMandatoryPhone}
            readOnly={tableStatusCheck.guestLocked === true}
            lockHelperText="Fetched from checked-in room"
          />
        )}

        {/* Welcome back hint when name auto-filled from check-customer */}
        {lastAutoFilledName.current && customerLookup?.exists && capturedName.trim() === lastAutoFilledName.current.trim() && (
          <p className="landing-welcome-back-hint" data-testid="welcome-back-hint">
            Welcome back, {capturedName}!
          </p>
        )}

        {/* Auto-lookup spinner */}
        {isAutoLooking && (
          <p className="landing-auto-looking" data-testid="auto-looking-hint">
            Checking...
          </p>
        )}

        {/* 5. Action Buttons */}
        <div className="landing-actions" data-testid="landing-actions">
          {/* Dynamic Button: Edit Order OR Browse Menu */}
          {showBrowseMenu && (roomBlocked ? (
            /* CR Phase-1: Room scanner blocked — vacant room or context lost */
            <div
              className="landing-room-blocked"
              data-testid="landing-room-blocked"
              role="alert"
              style={{
                background: 'var(--color-surface, #fff8f0)',
                border: '1px solid var(--color-warning, #f59e0b)',
                borderRadius: 12,
                padding: '20px 16px',
                textAlign: 'center',
                color: 'var(--text-primary)',
              }}
            >
              <FaDoorOpen
                size={32}
                style={{ color: 'var(--color-warning, #f59e0b)', marginBottom: 8 }}
                aria-hidden
              />
              <p
                style={{ margin: '8px 0 4px', fontWeight: 700, fontSize: 18 }}
                data-testid="landing-room-blocked-title"
              >
                {roomBlockedTitle}
              </p>
              <p
                style={{ margin: 0, fontSize: 14, opacity: 0.85 }}
                data-testid="landing-room-blocked-message"
              >
                {roomBlockedMessage}
              </p>
            </div>
          ) : (
            <>
              {/* Loading state while checking table status */}
              {tableStatusCheck.isLoading && (
                <button
                  className="landing-btn landing-btn-primary"
                  disabled
                  style={{ backgroundColor: 'var(--color-primary)', color: 'var(--button-text-color)', opacity: 0.7 }}
                  data-testid="landing-btn-loading"
                >
                  <span className="landing-btn-spinner"></span>
                  Checking...
                </button>
              )}

              {/* Edit Order button - when table is occupied */}
              {!tableStatusCheck.isLoading && tableStatusCheck.isOccupied && tableStatusCheck.existingOrderId && (
                <button
                  className="landing-btn landing-btn-primary"
                  onClick={handleEditOrderClick}
                  disabled={isLoadingEditOrder}
                  style={{ backgroundColor: 'var(--color-primary)', color: 'var(--button-text-color)', opacity: isLoadingEditOrder ? 0.7 : 1 }}
                  data-testid="landing-edit-order-btn"
                >
                  {isLoadingEditOrder ? (
                    <>
                      <span className="landing-btn-spinner"></span>
                      Loading...
                    </>
                  ) : (
                    <>
                      <MdOutlineEdit className="landing-btn-icon" />
                      EDIT ORDER
                    </>
                  )}
                </button>
              )}

              {/* Browse Menu button - when table is available or no table scanned */}
              {!tableStatusCheck.isLoading && (!tableStatusCheck.isOccupied || !tableStatusCheck.existingOrderId) && (
                <button
                  className={`landing-btn landing-btn-primary ${isTakeawayDeliveryMode && !isTakeawayDeliveryReady ? 'landing-btn-disabled' : ''}`}
                  onClick={handleDiningMenuClick}
                  disabled={isCheckingCustomer || (isTakeawayDeliveryMode && !isTakeawayDeliveryReady)}
                  style={{ backgroundColor: 'var(--color-primary)', color: 'var(--button-text-color)', opacity: (isCheckingCustomer || (isTakeawayDeliveryMode && !isTakeawayDeliveryReady)) ? 0.5 : 1 }}
                  data-testid="landing-browse-menu-btn"
                >
                  {isCheckingCustomer ? (
                    <>
                      <span className="landing-btn-spinner"></span>
                      Checking...
                    </>
                  ) : (
                    <>
                      <MdOutlineRestaurantMenu className="landing-btn-icon" />
                      {browseMenuButtonText}
                    </>
                  )}
                </button>
              )}
            </>
          ))}

          {/* Call Waiter & Pay Bill - Secondary Row */}
          {(showCallWaiter || showPayBill) && (
            <div className="landing-secondary-actions">
              {showCallWaiter && (
                <button
                  className="landing-btn landing-btn-secondary"
                  onClick={handleCallWaiter}
                  data-testid="landing-call-waiter-btn"
                >
                  <IoCallOutline className="landing-btn-icon" />
                  Call Waiter
                </button>
              )}
              {showPayBill && (
                <button
                  className="landing-btn landing-btn-secondary"
                  onClick={handlePayBill}
                  data-testid="landing-pay-bill-btn"
                >
                  <RiBillLine className="landing-btn-icon" />
                  Pay Bill
                </button>
              )}
            </div>
          )}
        </div>

        {/* 6. Social Icons */}
        {showSocial && (
          <div className="social-icons" data-testid="landing-social-icons">
            {instagramUrl && (
              <a href={instagramUrl} target="_blank" rel="noopener noreferrer" className="icon-link" aria-label="Instagram">
                <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                  <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                  <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
                </svg>
              </a>
            )}
            {facebookUrl && (
              <a href={facebookUrl} target="_blank" rel="noopener noreferrer" className="icon-link" aria-label="Facebook">
                <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path>
                </svg>
              </a>
            )}
            {twitterUrl && (
              <a href={twitterUrl} target="_blank" rel="noopener noreferrer" className="icon-link" aria-label="Twitter / X">
                <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4l11.733 16h4.267l-11.733 -16z"></path>
                  <path d="M4 20l6.768 -6.768m2.46 -2.46l6.772 -6.772"></path>
                </svg>
              </a>
            )}
            {youtubeUrl && (
              <a href={youtubeUrl} target="_blank" rel="noopener noreferrer" className="icon-link" aria-label="YouTube">
                <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19.13C5.12 19.56 12 19.56 12 19.56s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"></path>
                  <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"></polygon>
                </svg>
              </a>
            )}
            {whatsappNumber && (
              <a href={`https://wa.me/${whatsappNumber.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className="icon-link" aria-label="WhatsApp">
                <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
                </svg>
              </a>
            )}
            {phone && (
              <a href={`tel:${phone}`} className="icon-link" aria-label="Phone">
                <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                </svg>
              </a>
            )}
          </div>
        )}

      </div>

      {/* 9. Powered by - Configurable (DFA-004) */}
      {showPoweredBy && (
        <footer className="landing-footer" data-testid="landing-footer">
          <p>
            {poweredByText}{' '}
            {poweredByLogoUrl && (
              <img src={poweredByLogoUrl} alt={poweredByText} className="footer-logo" onError={(e) => { e.target.style.display = 'none'; }} />
            )}
          </p>
        </footer>
      )}
      <NotificationPopup page="landing" />
      <NonQrBlockModal
        open={showNonQrBlockModal}
        onRescan={() => {
          setShowNonQrBlockModal(false);
          navigate(`/${restaurant?.id || restaurantId}`);
        }}
      />
    </div>
  );
};

export default LandingPage;
