import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Header from '../components/Header/Header';
import SearchAndFilterBar from '../components/SearchAndFilterBar/SearchAndFilterBar';
// import SearchBar from '../components/SearchBar/SearchBar'; // Commented out - using merged component
// import FilterPanel from '../components/FilterPanel/FilterPanel'; // Commented out - using merged component
import MenuPanel from '../components/MenuPanel/MenuPanel';
import CategoryBox from '../components/CategoryBox/CategoryBox';
import MenuItem from '../components/MenuItem/MenuItem';
import Footer from '../components/Footer/Footer';
import CustomizeItemModal from '../components/CustomizeItemModal/CustomizeItemModal';
import RepeatItemModal from '../components/RepeatItemModal/RepeatItemModal';
import { MenuItemSkeleton, HeaderSkeleton, CategoryBoxSkeleton } from '../components/SkeletonLoaders';
import PromoBanner from '../components/PromoBanner/PromoBanner';
import { useMenuSections, useStations, useRestaurantDetails, useDietaryTags } from '../hooks/useMenuData';
import { useScannedTable } from '../hooks/useScannedTable';
import { useRestaurantId } from '../utils/useRestaurantId';
import { useRestaurantConfig } from '../context/RestaurantConfigContext';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext'; // BUG-2026-10-06-001 D6
import { getAllergenIcon } from '../utils/allergenIcons';
import { useCurrentTime } from '../hooks/useCurrentTime';
import { isRestaurantOpen, isItemAvailable, isChannelOpen, getChannelNextOpenTime } from '../utils/itemAvailability'; // CR-2026-06-17-003 APP-11 | CR-2026-08-06-001
import { isItemAllowedForChannel } from '../utils/channelEligibility';
import NotificationPopup from '../components/NotificationPopup/NotificationPopup';
import { shouldBlockNonQrOrder, buildNonQrBlockPayload } from '../utils/orderAccessPolicy';
import { postNonQrBlock } from '../api/services/diagnosticsService';
import NonQrBlockModal from '../components/NonQrBlockModal';
import toast from 'react-hot-toast'; // CR-2026-06-17-003 APP-11
import './MenuItems.css';

const MenuItems = () => {
  const { stationId } = useParams();
  const navigate = useNavigate();
  const { restaurantId } = useRestaurantId();
  const { showFooter: configShowFooter, showPromotionsOnMenu: configShowPromotionsOnMenu, showCategories: configShowCategories, showMenuFab: configShowMenuFab, fetchConfig, logoUrl: configLogoUrl, phone: configPhone, banners: configBanners, restaurantShifts, restaurantOpen, menuOrder, categoryTimings, itemTimings, channelOverrides, allowNonQrOrders,
    deliveryShifts, takeawayShifts, dineInShifts, roomShifts, walkinShifts,
  } = useRestaurantConfig(); // CR-2026-08-06-001: channel shift fields added
  const { isAuthenticated } = useAuth(); // BUG-2026-10-06-001 D6
  const [stationName, setStationName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');
  const [activeDietaryTags, setActiveDietaryTags] = useState([]);
  const [isMenuPanelOpen, setIsMenuPanelOpen] = useState(false);
  const [expandedDescriptions, setExpandedDescriptions] = useState({});
  const [descriptionLimit, setDescriptionLimit] = useState(40);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [customizeModalOpen, setCustomizeModalOpen] = useState(false);
  const [selectedItemForCustomization, setSelectedItemForCustomization] = useState(null);
  const [repeatModalOpen, setRepeatModalOpen] = useState(false);
  const [showNonQrBlockModal, setShowNonQrBlockModal] = useState(false);
  const [selectedItemForRepeat, setSelectedItemForRepeat] = useState(null);
  const categoryHeaderRef = useRef(null);


  // Fetch restaurant details FIRST to get numeric ID
  const { restaurant, loading: restaurantLoading, isFetching: restaurantFetching } = useRestaurantDetails(restaurantId);
  
  // Use numeric ID from restaurant-info response, fallback to restaurantId
  const numericRestaurantId = restaurant?.id?.toString() || restaurantId;

  const { foodFor, orderType: scannedOrderType, isScanned, tableId: scannedTableId, roomOrTable: scannedRoomOrTable } = useScannedTable();

  // Fetch menu sections from API (wait for numeric ID)
  // stationId (from route) takes priority, foodFor (from URL/sessionStorage) as fallback
  const effectiveStationId = stationId || foodFor;
  const { menuSections: rawMenuSections, loading: menuLoading, error: menuError, errorMessage: menuErrorMessage } = useMenuSections(effectiveStationId, numericRestaurantId);

  // Fetch dietary tags for this restaurant
  const { dietaryTagsMapping, allTags, loading: dietaryLoading } = useDietaryTags(numericRestaurantId);

  // Calculate available dietary tags based on CURRENT menu items only
  const availableDietaryTags = useMemo(() => {
    if (!dietaryTagsMapping || !allTags || !rawMenuSections || rawMenuSections.length === 0) {
      return [];
    }
    
    // Get all item IDs from current menu sections
    const currentItemIds = new Set();
    rawMenuSections.forEach(section => {
      section.items?.forEach(item => currentItemIds.add(String(item.id)));
    });
    
    // Find which tags have items in current menu
    const tagsWithItems = new Set();
    currentItemIds.forEach(itemId => {
      const itemTags = dietaryTagsMapping[itemId] || [];
      itemTags.forEach(tag => tagsWithItems.add(tag));
    });
    
    // Filter allTags to only those present in current menu
    return allTags.filter(tag => tagsWithItems.has(tag.id));
  }, [rawMenuSections, dietaryTagsMapping, allTags]);

  // Apply category order and visibility from admin config
  const menuSections = useMemo(() => {
    if (!rawMenuSections || rawMenuSections.length === 0) return rawMenuSections || [];

    // For multiple-menu restaurants, use station-specific category order
    const categoryOrder = stationId
      ? (menuOrder?.stationCategoryOrder?.[stationId] || [])
      : (menuOrder?.categoryOrder || []);
    const categoryVisibility = stationId
      ? (menuOrder?.stationCategoryVisibility?.[stationId] || {})
      : (menuOrder?.categoryVisibility || {});

    if (categoryOrder.length === 0) return rawMenuSections;

    const ordered = [];
    const seen = new Set();

    for (const cat of categoryOrder) {
      const section = rawMenuSections.find(s => {
        const sectionId = s.categoryId || s.sectionName;
        return String(sectionId) === String(cat.id) || s.sectionName === cat.name;
      });
      if (section) {
        if (categoryVisibility[cat.id] !== false) {
          ordered.push(section);
        }
        seen.add(section.sectionName);
      }
    }

    for (const section of rawMenuSections) {
      if (!seen.has(section.sectionName)) {
        ordered.push(section);
      }
    }

    return ordered;
  }, [rawMenuSections, menuOrder, stationId]);

  // Fetch stations for menu panel
  const { stations: stationsData } = useStations(numericRestaurantId);

  // Check if online ordering is enabled AND restaurant is currently open
  // CR-2026-08-06-001: per-channel open check replaces global isRestaurantOpen
  const _channelConfig = { deliveryShifts, takeawayShifts, dineInShifts, roomShifts, walkinShifts, restaurantShifts, restaurantOpen };
  const isCurrentChannelOpen = isChannelOpen(scannedOrderType || 'dinein', _channelConfig);
  const channelOpensAt = isCurrentChannelOpen ? null : getChannelNextOpenTime(scannedOrderType || 'dinein', _channelConfig);
  const isOnlineOrderEnabled = (restaurant?.online_order === 'Yes' || restaurant?.online_order === undefined)
    && restaurantOpen === true
    && isCurrentChannelOpen;

  // Fetch admin config for this restaurant
  useEffect(() => {
    if (restaurantId) {
      fetchConfig(restaurantId);
    }
  }, [restaurantId, fetchConfig]);

  // Cart functionality
  const { addToCart, updateQuantity, getTotalQuantityForItem, cartItems, isEditMode, editingOrderId, clearCart, removeFromCart } = useCart(); // CR-2026-06-17-003 APP-11: added removeFromCart

  // Get current time in seconds since midnight (updates every 60 seconds) - for item availability
  const currentTimeInSeconds = useCurrentTime();

  // CR-2026-06-17-003 APP-11: Auto-remove cart items that have become unavailable mid-session
  useEffect(() => {
    if (!cartItems || cartItems.length === 0) return;
    if (!rawMenuSections || rawMenuSections.length === 0) return;

    // Build lookup from raw menu data
    const itemMap = new Map();
    for (const section of rawMenuSections) {
      const catId = section.categoryId || section.category_id;
      for (const item of (section.items || [])) {
        itemMap.set(String(item.id), { ...item, _categoryId: catId });
      }
    }

    const unavailable = cartItems.filter(ci => {
      const item = itemMap.get(String(ci.itemId || ci.id));
      if (!item) return false;
      const catTiming = categoryTimings?.[item._categoryId] || null;
      const itmTiming = itemTimings?.[String(ci.itemId || ci.id)] || null;
      return !isItemAvailable(item, currentTimeInSeconds, { categoryTiming: catTiming, itemTiming: itmTiming });
    });

    if (unavailable.length > 0) {
      const names = unavailable.map(u => u.name).join(', ');
      toast.error(`Some items are no longer available: ${names}. Removed from your cart.`, { duration: 5000 });
      unavailable.forEach(u => removeFromCart(u.cartId || u.id));
    }
  }, [cartItems, currentTimeInSeconds, categoryTimings, itemTimings, rawMenuSections, removeFromCart]);

  // Update current time every minute for station availability (IST timezone)
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute

    return () => clearInterval(timer);
  }, []);

  // Check if station is available based on IST timing (uses raw 24h API data)
  const isStationAvailable = useCallback((station) => {
    const openTime = station?.openingTime;
    const closeTime = station?.closingTime;
    
    if (!openTime || !closeTime) return true;
    if (openTime === '00:00:00' && (closeTime === '23:59:59' || closeTime === '23:59:00')) return true;

    const istTime = new Date(currentTime.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const currentMinutes = istTime.getHours() * 60 + istTime.getMinutes();

    const openParts = openTime.split(':');
    const closeParts = closeTime.split(':');
    const openMinutes = parseInt(openParts[0], 10) * 60 + parseInt(openParts[1] || 0, 10);
    const closeMinutes = parseInt(closeParts[0], 10) * 60 + parseInt(closeParts[1] || 0, 10);

    if (closeMinutes <= openMinutes) {
      return currentMinutes >= openMinutes || currentMinutes < closeMinutes;
    }
    return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
  }, [currentTime]);

  // Check if current station is unavailable and redirect
  useEffect(() => {
    if (stationId && stationsData.length > 0) {
      const currentStation = stationsData.find(s => s.id === stationId);
      if (currentStation && !isStationAvailable(currentStation)) {
        // Redirect to stations route if current station is unavailable
        if (restaurantId) {
          navigate(`/${restaurantId}/stations`);
        } else {
          navigate('/menu');
        }
      }
    }
  }, [stationId, stationsData, currentTime, restaurantId, navigate, isStationAvailable]);

  // Debug: Log menu sections data
  // useEffect(() => {
  //   console.log('MenuItems - menuSections:', menuSections);
  //   console.log('MenuItems - loading:', menuLoading);
  //   console.log('MenuItems - error:', menuError);
  //   console.log('MenuItems - restaurantId:', restaurantId);
  //   console.log('MenuItems - stationId:', stationId);
  // }, [menuSections, menuLoading, menuError, restaurantId, stationId]);

  // Detect screen size for description limit
  useEffect(() => {
    const updateDescriptionLimit = () => {
      if (window.innerWidth >= 1024) {
        setDescriptionLimit(150);
      } else {
        setDescriptionLimit(40);
      }
    };

    updateDescriptionLimit();
    window.addEventListener('resize', updateDescriptionLimit);

    return () => window.removeEventListener('resize', updateDescriptionLimit);
  }, []);

  useEffect(() => {
    if (stationsData && stationsData.length > 0) {
      const station = stationsData.find(s => s.id === stationId);
      if (station) {
        setStationName(station.name);
      }
    }
  }, [stationId, stationsData]);

  // Reset selectedCategory when station changes
  useEffect(() => {
    setSelectedCategory(null);
  }, [stationId]);

  const toggleMenuPanel = () => {
    setIsMenuPanelOpen(!isMenuPanelOpen);
  };

  const closeMenuPanel = () => {
    setIsMenuPanelOpen(false);
  };

  const toggleSearch = () => {
    setShowSearch(!showSearch);
    if (!showSearch) {
      setSearchQuery('');
    }
  };

  const handleBackToMenu = () => {
    // Preserve restaurant ID in navigation
    if (stationId) {
      navigate(`/${restaurantId}/stations`);
    } else {
      navigate(`/${restaurantId}`);
    }
  };

  const handleFilterChange = (filter) => {
    setActiveFilter(filter);
  };

  // const handleCategoryClick = (categoryName) => {
  //   if (selectedCategory === categoryName) {
  //     setSelectedCategory(null);
  //   } else {
  //     setSelectedCategory(categoryName);
  //     setTimeout(() => {
  //       document.getElementById('items-section')?.scrollIntoView({ behavior: 'smooth' });
  //     }, 100);
  //   }
  //   closeMenuPanel();
  // };
  const handleCategoryClick = (categoryName) => {
    if (selectedCategory === categoryName) {
      setSelectedCategory(null);
    } else {
      setSelectedCategory(categoryName);
      setTimeout(() => {
        if (categoryHeaderRef.current) {
          const headerRect = categoryHeaderRef.current.getBoundingClientRect();
          const absoluteTop = headerRect.top + window.pageYOffset;

          // Offset accounts for:
          // - Header (60px)
          // - Search bar (if visible)
          // - Filter bar (60px)
          // - Padding (20px)
          const offset = 120; // Adjust this value to fine-tune

          window.scrollTo({
            top: absoluteTop - offset,
            behavior: 'smooth'
          });
        }
      }, 100); // Delay allows React to render the category header first
    }
    closeMenuPanel();
  };


  const handleAllCategoryClick = () => {
    setSelectedCategory(null);
    setTimeout(() => {
      document.getElementById('items-section')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleStationClickFromPanel = (newStationId) => {
    // Check if station is available before navigation
    const targetStation = stationsData.find(s => s.id === newStationId);
    if (targetStation && !isStationAvailable(targetStation)) {
      // Don't navigate if station is unavailable
      closeMenuPanel();
      return;
    }

    // Preserve restaurant ID in navigation
    if (restaurantId) {
      navigate(`/${restaurantId}/menu/${newStationId}`);
    } else {
      navigate(`/menu/${newStationId}`);
    }
    closeMenuPanel();
  };

  const toggleDescription = (itemId) => {
    setExpandedDescriptions(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
  };

  const filterItems = (items, categoryId) => {
    let filtered = items;

    // ─────────────────────────────────────────────────────────────────────
    // CR A-1: Channel-availability filter (PRODUCT_API_FIELD_MAPPING audit).
    // CR-2026-06-17-001 APP-3: Admin channel overrides applied per item.
    // Priority: item admin override > category admin override > POS flag.
    // ─────────────────────────────────────────────────────────────────────
    filtered = filtered.filter(item => {
      const adminOverrides = {
        categoryOverride: channelOverrides?.category?.[categoryId] || null,
        itemOverride: channelOverrides?.item?.[String(item.id)] || null,
      };
      return isItemAllowedForChannel(item, scannedOrderType, adminOverrides);
    });

    // CR-2026-06-17-003 APP-11: Drop items that are not currently available
    // (live_web, admin category/item timing, POS time window)
    filtered = filtered.filter(item => {
      const categoryTiming = categoryTimings?.[categoryId] || null;
      const itemTiming = itemTimings?.[String(item.id)] || null;
      return isItemAvailable(item, currentTimeInSeconds, { categoryTiming, itemTiming });
    });

    // CR-2026-09-07-001: Stock-out filter (Layer 1).
    // Default: hide OOS items. If show_out_of_stock_items='Yes', keep them
    // visible (sold-out state rendered in MenuItem.jsx).
    const showStockOut = restaurant?.show_out_of_stock_items === 'Yes';
    if (!showStockOut) {
      filtered = filtered.filter(item => item.stock_out !== 'Y');
    }

    if (searchQuery) {
      filtered = filtered.filter(item =>
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Veg/Non-Veg/Egg filter (single select)
    if (activeFilter === 'veg') {
      filtered = filtered.filter(item => item.isVeg === true);
    } else if (activeFilter === 'non-veg') {
      filtered = filtered.filter(item => item.isVeg === false && item.isEgg !== true);
    } else if (activeFilter === 'egg') {
      filtered = filtered.filter(item => item.isEgg === true);
    }

    // Dietary tags filter (multi-select, AND logic)
    if (activeDietaryTags.length > 0 && dietaryTagsMapping) {
      filtered = filtered.filter(item => {
        const itemTags = dietaryTagsMapping[item.id] || [];
        // Item must have ALL selected tags
        return activeDietaryTags.every(tag => itemTags.includes(tag));
      });
    }

    return filtered;
  };

  /**
   * Reorder items: items in cart move to top, sorted by addedAt (newest first)
   */

  const reorderItemsByCart = useCallback((items) => {
    if (!items || items.length === 0) return items;

    const itemsInCart = [];
    const itemsNotInCart = [];

    items.forEach(item => {
      // Check if ANY variation of this item is in cart
      const isInCart = cartItems.some(ci => String(ci.itemId) === String(item.id));

      if (isInCart) {
        // Find the most recent cart item for this itemId - FIX: Use String() conversion
        const cartItem = cartItems
          .filter(ci => String(ci.itemId) === String(item.id))  // ✅ Add String() conversion
          .sort((a, b) => b.addedAt - a.addedAt)[0]; // Get most recent

        if (cartItem) {  // ✅ Add safety check
          itemsInCart.push({
            ...item,
            _cartAddedAt: cartItem.addedAt // Store addedAt for sorting
          });
        }
      } else {
        itemsNotInCart.push(item);
      }
    });

    // Sort items in cart by addedAt (newest first)
    itemsInCart.sort((a, b) => (b._cartAddedAt || 0) - (a._cartAddedAt || 0));

    // Remove the temporary _cartAddedAt property
    const cleanedItemsInCart = itemsInCart.map(({ _cartAddedAt, ...item }) => item);

    return [...cleanedItemsInCart, ...itemsNotInCart];
  }, [cartItems]);
  /**
   * CR-2026-05-30-002 — Guard C2.
   * Returns true when the add-to-cart attempt should be blocked.
   * Only fires on the FIRST add (cart currently empty) — subsequent adds
   * within the same session are not re-checked (locked semantics CR §4 C2).
   */
  const isBlockedNonQrAdd = useCallback(() => {
    if (cartItems && cartItems.length > 0) return false;
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
    // BUG-2026-10-06-001: record allow + block when enforced; D6 adds isAuthenticated.
    if (allowNonQrOrders === false) {
      postNonQrBlock(
        buildNonQrBlockPayload(
          { restaurantId, scannedRoomOrTable, scannedTableId, isEditMode, isAuthenticated },
          'add_to_cart',
          policy
        )
      );
    }
    if (!policy.block) return false;
    clearCart();
    setShowNonQrBlockModal(true);
    return true;
  }, [
    cartItems, restaurantId, isScanned, scannedTableId, scannedRoomOrTable,
    scannedOrderType, isEditMode, allowNonQrOrders, clearCart, isAuthenticated,
  ]);

  /**
   * Handle add to cart button click
   */
  const handleAddToCart = useCallback((item) => {
    if (isBlockedNonQrAdd()) return;
    const hasVariations = item.variations && item.variations.length > 0;
    const hasAddOns = item.add_ons && item.add_ons.length > 0;

    if (hasVariations || hasAddOns) {
      // Open customization modal
      setSelectedItemForCustomization(item);
      setCustomizeModalOpen(true);
    } else {
      // No variations/add-ons, add directly to cart
      // CR A-1: pass active orderType for defensive eligibility re-check inside CartContext
      addToCart(item, [], [], scannedOrderType);
    }
  }, [addToCart, scannedOrderType, isBlockedNonQrAdd]);

  /**
   * Handle close customization modal
   */
  const handleCloseCustomizeModal = useCallback(() => {
    setCustomizeModalOpen(false);
    setSelectedItemForCustomization(null);
  }, []);

  /**
   * Handle add to cart from customization modal
   */
  const handleAddToCartFromModal = useCallback((item, variations, add_ons) => {
    if (isBlockedNonQrAdd()) return;
    // CR A-1: pass active orderType for defensive eligibility re-check inside CartContext
    addToCart(item, variations, add_ons, scannedOrderType);
  }, [addToCart, scannedOrderType, isBlockedNonQrAdd]);

  /**
   * Handle close repeat modal
   */
  const handleCloseRepeatModal = useCallback(() => {
    setRepeatModalOpen(false);
    setSelectedItemForRepeat(null);
  }, []);

  /**
   * Handle REPEAT action - increment existing cart item with same customizations
   */
  const handleRepeat = useCallback((item) => {
    // Find the most recent cart item for this itemId
    const cartItem = cartItems
      .filter(ci => ci.itemId === item.id)
      .sort((a, b) => b.addedAt - a.addedAt)[0]; // Get most recent

    if (cartItem) {
      // Increment the existing cart item (same variations/add-ons)
      updateQuantity(cartItem.cartId, cartItem.quantity + 1);
    }
    setRepeatModalOpen(false);
    setSelectedItemForRepeat(null);
  }, [cartItems, updateQuantity]);

  /**
   * Handle CUSTOMIZE action - open customization modal
   */
  const handleCustomizeFromRepeat = useCallback((item) => {
    setRepeatModalOpen(false);
    setSelectedItemForRepeat(null);
    setSelectedItemForCustomization(item);
    setCustomizeModalOpen(true);
  }, []);

  /**
   * Handle quantity increment
   */
  const handleIncrement = useCallback((item) => {
    if (isBlockedNonQrAdd()) return;
    const hasVariations = item.variations && item.variations.length > 0;
    const hasAddOns = item.add_ons && item.add_ons.length > 0;

    if (hasVariations || hasAddOns) {
      // Show repeat modal for items with variations/add-ons
      setSelectedItemForRepeat(item);
      setRepeatModalOpen(true);
    } else {
      // No variations/add-ons, increment directly
      const cartItem = cartItems.find(ci => ci.itemId === item.id);
      if (cartItem) {
        updateQuantity(cartItem.cartId, cartItem.quantity + 1);
      } else {
        // Not in cart, add it
        // CR A-1: pass active orderType for defensive eligibility re-check
        addToCart(item, [], [], scannedOrderType);
      }
    }
  }, [cartItems, updateQuantity, addToCart, scannedOrderType, isBlockedNonQrAdd]);

  /**
   * Handle quantity decrement
   */
  const handleDecrement = useCallback((item) => {
    // Find the first/most recent cart item for this itemId
    const cartItem = cartItems
      .filter(ci => ci.itemId === item.id)
      .sort((a, b) => b.addedAt - a.addedAt)[0]; // Get most recent

    if (cartItem) {
      if (cartItem.quantity > 1) {
        updateQuantity(cartItem.cartId, cartItem.quantity - 1);
      } else {
        // Remove from cart when quantity reaches 0
        updateQuantity(cartItem.cartId, 0);
      }
    }
  }, [cartItems, updateQuantity]);

  return (
    <div className="menu-items-page">
      <div className="review-order-page page-transition">

        {/* Show skeleton loader when restaurant data is loading or fetching */}
        {(restaurantLoading || restaurantFetching) ? (
          <HeaderSkeleton showSearchIcon={true} />
        ) : (
          <Header
            brandText={restaurant?.name}
            phone={configPhone || restaurant?.phone}
            onBackClick={handleBackToMenu}
          />
        )}

        {/* {showSearch && (
        <SearchBar
          isVisible={showSearch}
          searchQuery={searchQuery}
          onSearchChange={(e) => setSearchQuery(e.target.value)}
        />
      )} */}

        <MenuPanel
          isOpen={isMenuPanelOpen}
          onClose={closeMenuPanel}
          stationName={stationName}
          menuSections={menuSections}
          stationsData={[]}  // Always show categories-only view in sidebar
          currentStationId={stationId}
          onCategoryClick={handleCategoryClick}
          onStationClick={handleStationClickFromPanel}
          selectedCategory={selectedCategory}
        />

        <div className="menu-items-content">

          {/* CR-2026-08-06-001: Channel unavailability banner */}
          {!isCurrentChannelOpen && restaurantOpen !== false && (
            <div className="channel-unavail-banner" data-testid="channel-unavail-banner">
              <span className="channel-unavail-icon">🕐</span>
              <div className="channel-unavail-text">
                <strong>
                  {scannedOrderType === 'delivery' ? 'Delivery' :
                   scannedOrderType === 'takeaway' ? 'Takeaway' :
                   scannedOrderType === 'walkin'   ? 'Walk-in orders' :
                   scannedOrderType === 'room'     ? 'Room service' :
                   'Ordering'} unavailable right now
                </strong>
                {channelOpensAt
                  ? <span>Opens at {channelOpensAt}. You can still browse the menu.</span>
                  : <span>Currently unavailable. Please check back later.</span>
                }
              </div>
            </div>
          )}

          {/* Error Message */}
          {menuError && (
            <div className="error-message">
              <p>{menuErrorMessage || 'Failed to load menu items. Please try again.'}</p>
            </div>
          )}

          {/* Search + Filter Bar (top) */}
          <SearchAndFilterBar
            searchQuery={searchQuery}
            onSearchChange={(e) => setSearchQuery(e.target.value)}
            activeFilter={activeFilter}
            onFilterChange={handleFilterChange}
            activeDietaryTags={activeDietaryTags}
            onDietaryTagChange={setActiveDietaryTags}
            availableDietaryTags={availableDietaryTags}
          />

          {/* Edit Order Mode Banner */}
          {isEditMode && (
            <div className="edit-mode-banner" data-testid="edit-mode-banner">
              <div className="edit-mode-banner-content">
                <span className="edit-mode-banner-text">
                  Adding items to Order #{editingOrderId}
                </span>
                <div className="edit-mode-banner-buttons">
                  <button 
                    className="edit-mode-banner-view-bill"
                    onClick={() => navigate(`/${restaurantId}/order-success`, {
                      state: {
                        orderData: {
                          orderId: editingOrderId
                        }
                      }
                    })}
                    data-testid="view-bill-btn"
                  >
                    View Bill
                  </button>
                  <button 
                    className="edit-mode-banner-cancel"
                    onClick={clearCart}
                    data-testid="clear-new-items-btn"
                  >
                    Clear New Items
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Promo Banner - controlled by admin config, filtered for menu page */}
          {configShowPromotionsOnMenu && (() => {
            const menuBanners = (configBanners || [])
              .filter(b => b.displayOn === 'menu' || b.displayOn === 'both' || !b.displayOn)
              .map((b, i) => ({
                id: b.id || i,
                image_url: b.bannerImage,
                title: b.bannerTitle,
                link: b.bannerLink,
              }));
            return menuBanners.length > 0 ? <PromoBanner promotions={menuBanners} compact /> : null;
          })()}

          {/* Category Navigation - controlled by admin config */}
          {configShowCategories && (() => {

            if (menuLoading && menuSections.length === 0) {
              return (
                <div className="category-nav">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <CategoryBoxSkeleton key={i} />
                  ))}
                </div>
              );
            }

            if (!menuLoading && menuSections.length > 0) {
              return (
                <div className="category-nav">
                  <div className="category-item">
                    <div
                      role="button"
                      tabIndex={0}
                      className={`category-box ${selectedCategory === null ? 'selected' : ''}`}
                      onClick={handleAllCategoryClick}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleAllCategoryClick(); }}
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" />
                      </svg>
                    </div>
                    <span className="category-name">All</span>
                  </div>

                  {menuSections.map((section, index) => (
                    <CategoryBox
                      key={index}
                      section={section}
                      isSelected={selectedCategory === section.sectionName}
                      onClick={() => handleCategoryClick(section.sectionName)}
                    />
                  ))}
                </div>
              );
            }
            return null;
          })()}



          {/* Top Category Header - Only show when a specific category is selected */}
          {selectedCategory && (
            <div className="category-info-header" ref={categoryHeaderRef}>
              <h2 className="category-info-name">{selectedCategory}</h2>
              <span className="category-info-count">
                ( {filterItems(
                  menuSections
                    .find(section => section.sectionName === selectedCategory)
                    ?.items || [],
                  menuSections.find(section => section.sectionName === selectedCategory)?.categoryId
                ).length} Items)
              </span>
            </div>
          )}

          {/* Loading State - Menu Items */}
          {menuLoading && (
            <div id="items-section">
              <div className="menu-section">
                <div className="items-list">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <MenuItemSkeleton key={i} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Menu Items */}
          {!menuLoading && !menuError && (() => {
            const sectionsToDisplay = selectedCategory
              ? menuSections.filter(section => section.sectionName === selectedCategory)
              : menuSections;

            return (
              <>
                {sectionsToDisplay.length > 0 && (
                  <div id="items-section">
                    {sectionsToDisplay.map((section, sectionIndex) => {
                      // Apply item order and visibility from admin config
                      let orderedSectionItems = section.items;
                      const categoryId = section.categoryId;
                      const itemOrderKey = stationId ? `${stationId}__${categoryId}` : categoryId;
                      const itemOrder = stationId
                        ? (menuOrder?.stationItemOrder?.[itemOrderKey] || [])
                        : (menuOrder?.itemOrder?.[categoryId] || []);
                      const itemVis = stationId
                        ? (menuOrder?.stationItemVisibility?.[itemOrderKey] || {})
                        : (menuOrder?.itemVisibility?.[categoryId] || {});

                      if (itemOrder.length > 0) {
                        const ordered = [];
                        const seen = new Set();
                        for (const o of itemOrder) {
                          const item = section.items.find(i => String(i.id) === String(o.id));
                          if (item) {
                            if (itemVis[o.id] !== false) ordered.push(item);
                            seen.add(String(item.id));
                          }
                        }
                        for (const item of section.items) {
                          if (!seen.has(String(item.id))) ordered.push(item);
                        }
                        orderedSectionItems = ordered;
                      } else {
                        // CR-2026-06-17-001 APP-1: Sort by POS food_order when no admin order set.
                        // Items with food_order=0 (unset) go to end, others sort ascending.
                        const hasFoodOrder = orderedSectionItems.some(i => (i.food_order || 0) > 0);
                        if (hasFoodOrder) {
                          orderedSectionItems = [...orderedSectionItems].sort((a, b) => {
                            const fa = a.food_order || 0;
                            const fb = b.food_order || 0;
                            if (fa === 0 && fb === 0) return 0;
                            if (fa === 0) return 1;
                            if (fb === 0) return -1;
                            return fa - fb;
                          });
                        }
                      }

                      const filteredItems = filterItems(orderedSectionItems, categoryId);

                      // Reorder items: cart items move to top
                      const reorderedItems = reorderItemsByCart(filteredItems);

                      if (reorderedItems.length === 0) {
                        return null;
                      }

                      return (
                        <React.Fragment key={sectionIndex}>
                          {/* Category Header - Show above each section when "All Items" is selected */}
                          {!selectedCategory && (
                            <div className="category-info-header">
                              <h2 className="category-info-name">{section.sectionName}</h2>
                              <span className="category-info-count">
                                ( {filteredItems.length} Items)
                              </span>
                            </div>
                          )}
                          <div className="menu-section">
                            <div className="items-list">
                              {reorderedItems.map((item) => {
                                // Get total quantity across all variations/add-ons
                                const itemQuantity = getTotalQuantityForItem(item.id);
                                const inCart = itemQuantity > 0;

                                return (
                                  <MenuItem
                                    key={item.id}
                                    item={item}
                                    isExpanded={expandedDescriptions[item.id]}
                                    descriptionLimit={descriptionLimit}
                                    onToggleDescription={toggleDescription}
                                    getAllergenIcon={getAllergenIcon}
                                    quantity={itemQuantity}
                                    isInCart={inCart}
                                    onAddToCart={() => handleAddToCart(item)}
                                    onIncrement={() => handleIncrement(item)}
                                    onDecrement={() => handleDecrement(item)}
                                    currentTimeInSeconds={currentTimeInSeconds}
                                    isOnlineOrderEnabled={isOnlineOrderEnabled}
                                    categoryTiming={categoryTimings?.[categoryId]}
                                    itemTiming={itemTimings?.[String(item.id)]}
                                    orderType={scannedOrderType}
                                  />
                                );
                              })}
                            </div>
                          </div>
                        </React.Fragment>
                      );
                    })}
                  </div>
                )}



                {/* Empty State */}
                {sectionsToDisplay.length === 0 && (
                  <div className="empty-state">
                    <p>No menu items available at the moment.</p>
                  </div>
                )}
              </>
            );
          })()}

          {configShowFooter && <Footer />}
        </div>

        {/* Customize Item Modal */}
        <CustomizeItemModal
          isOpen={customizeModalOpen}
          onClose={handleCloseCustomizeModal}
          item={selectedItemForCustomization}
          onAddToCart={handleAddToCartFromModal}
        />

        {/* Repeat Item Modal */}
        <RepeatItemModal
          isOpen={repeatModalOpen}
          onClose={handleCloseRepeatModal}
          item={selectedItemForRepeat}
          onRepeat={handleRepeat}
          onCustomize={handleCustomizeFromRepeat}
        />

      </div>
        {configShowMenuFab !== false && (
          <button className="menu-fab" onClick={toggleMenuPanel}>
            Menu
          </button>
        )}
      <NotificationPopup page="menu" />
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

export default MenuItems;
