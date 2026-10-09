import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'react-hot-toast';
import { calculateCartItemPrice } from '../api/transformers/helpers';
import { isItemAllowedForChannel, getChannelLabel } from '../utils/channelEligibility';
import logger from '../utils/logger';

const CartContext = createContext();

// Cart expiration time: 3 hours (in milliseconds)
const CART_EXPIRY_TIME = 3 * 60 * 60 * 1000; // 3 hours

/**
 * Get cart key for localStorage based on restaurant ID
 */
const getCartKey = (restaurantId) => `cart_${restaurantId}`;

/**
 * Get edit order key for localStorage based on restaurant ID
 */
const getEditOrderKey = (restaurantId) => `editOrder_${restaurantId}`;

/**
 * Load cart from localStorage for a specific restaurant
 */
const loadCartFromStorage = (restaurantId) => {
  try {
    const cartKey = getCartKey(restaurantId);
    const stored = localStorage.getItem(cartKey);
    if (!stored) return { items: [], createdAt: Date.now(), expiresAt: Date.now() + CART_EXPIRY_TIME };

    const cartData = JSON.parse(stored);
    
    // Check if cart has expired
    if (cartData.expiresAt && Date.now() > cartData.expiresAt) {
      // Cart expired, clear it
      localStorage.removeItem(cartKey);
      return { items: [], createdAt: Date.now(), expiresAt: Date.now() + CART_EXPIRY_TIME };
    }

    return cartData;
  } catch (error) {
    logger.error('cart', 'Error loading cart from storage:', error);
    return { items: [], createdAt: Date.now(), expiresAt: Date.now() + CART_EXPIRY_TIME };
  }
};

/**
 * Load edit order data from localStorage
 */
const loadEditOrderFromStorage = (restaurantId) => {
  try {
    const editOrderKey = getEditOrderKey(restaurantId);
    const stored = localStorage.getItem(editOrderKey);
    if (!stored) return null;

    const editData = JSON.parse(stored);
    
    // Check if edit session has expired (same expiry as cart)
    if (editData.expiresAt && Date.now() > editData.expiresAt) {
      localStorage.removeItem(editOrderKey);
      return null;
    }

    return editData;
  } catch (error) {
    logger.error('cart', 'Error loading edit order from storage:', error);
    return null;
  }
};

/**
 * Save cart to localStorage for a specific restaurant
 */
const saveCartToStorage = (restaurantId, cartData) => {
  try {
    const cartKey = getCartKey(restaurantId);
    const cartDataString = JSON.stringify(cartData);
    localStorage.setItem(cartKey, cartDataString);
    
    // Broadcast to other tabs using custom event (StorageEvent only fires in other tabs, not current)
    window.dispatchEvent(new CustomEvent('cartUpdated', {
      detail: { key: cartKey, value: cartDataString }
    }));
  } catch (error) {
    logger.error('cart', 'Error saving cart to storage:', error);
  }
};

/**
 * Save edit order data to localStorage
 */
const saveEditOrderToStorage = (restaurantId, editData) => {
  try {
    const editOrderKey = getEditOrderKey(restaurantId);
    if (editData) {
      localStorage.setItem(editOrderKey, JSON.stringify(editData));
    } else {
      localStorage.removeItem(editOrderKey);
    }
  } catch (error) {
    logger.error('cart', 'Error saving edit order to storage:', error);
  }
};

/**
 * Generate unique cart ID for an item
 */
export const generateCartId = (itemId, variations = [], add_ons = []) => {
  // Create unique ID based on item + variations + add-ons
  const variationsKey = JSON.stringify(variations.sort());
  const addOnsKey = JSON.stringify(add_ons.sort());
  return `${itemId}_${variationsKey}_${addOnsKey}`;
};

export const CartProvider = ({ children, restaurantId }) => {
  const [cart, setCart] = useState(() => loadCartFromStorage(restaurantId));
  const [editOrder, setEditOrder] = useState(() => loadEditOrderFromStorage(restaurantId));
  const isUpdatingFromStorage = useRef(false);

  // Computed values for edit mode
  const isEditMode = editOrder !== null;
  const editingOrderId = editOrder?.orderId || null;
  const previousOrderItems = editOrder?.previousItems || [];

  // Listen for storage events from other tabs
  useEffect(() => {
    const cartKey = getCartKey(restaurantId);
    
    // Handle storage events from other tabs (only fires in other tabs, not current)
    const handleStorageChange = (e) => {
      if (e.key === cartKey && e.newValue) {
        try {
          isUpdatingFromStorage.current = true;
          const cartData = JSON.parse(e.newValue);
          // Check expiration
          if (cartData.expiresAt && Date.now() > cartData.expiresAt) {
            setCart({ items: [], createdAt: Date.now(), expiresAt: Date.now() + CART_EXPIRY_TIME });
          } else {
            setCart(cartData);
          }
        } catch (error) {
          logger.error('cart', 'Error parsing cart from storage event:', error);
        } finally {
          // Reset flag after a short delay to allow state update
          setTimeout(() => {
            isUpdatingFromStorage.current = false;
          }, 100);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [restaurantId]);

  // Track previous restaurant ID in localStorage to detect changes across component re-mounts
  const PREV_RESTAURANT_KEY = 'prevRestaurantId';

  // Clear all cart state when restaurantId changes (scan & order app - user is at one restaurant at a time)
  useEffect(() => {
    const prevRestaurantId = localStorage.getItem(PREV_RESTAURANT_KEY);
    
    // Only clear if restaurant actually changed (not on initial mount or same restaurant)
    if (prevRestaurantId && prevRestaurantId !== restaurantId && restaurantId !== 'default') {
      // Clear cart - start fresh for new restaurant
      const emptyCart = { items: [], createdAt: Date.now(), expiresAt: Date.now() + CART_EXPIRY_TIME };
      setCart(emptyCart);
      saveCartToStorage(restaurantId, emptyCart);
      
      // Clear edit order state
      setEditOrder(null);
      saveEditOrderToStorage(restaurantId, null);
      
      // Clear old restaurant's localStorage data
      localStorage.removeItem(getCartKey(prevRestaurantId));
      localStorage.removeItem(getEditOrderKey(prevRestaurantId));
      
      logger.cart(`Restaurant changed from ${prevRestaurantId} to ${restaurantId} - cleared all cart state`);
    }
    
    // Store current restaurant ID for next comparison
    if (restaurantId && restaurantId !== 'default') {
      localStorage.setItem(PREV_RESTAURANT_KEY, restaurantId);
    }
  }, [restaurantId]);

  // Save cart to localStorage whenever it changes (but not when updating from storage)
  useEffect(() => {
    if (restaurantId && !isUpdatingFromStorage.current) {
      saveCartToStorage(restaurantId, cart);
    }
  }, [cart, restaurantId]);

  // Save edit order to localStorage whenever it changes
  useEffect(() => {
    if (restaurantId) {
      saveEditOrderToStorage(restaurantId, editOrder);
    }
  }, [editOrder, restaurantId]);

  /**
   * Add item to cart.
   *
   * CR A-1: Defensive channel-eligibility re-check.
   * The 4th parameter `activeOrderType` is optional. When provided and the item
   * is not allowed for that channel (per item.dinein/takeaway/delivery), the
   * add is silently rejected with a toast. Render-time gates in MenuItem.jsx
   * already hide the ADD button for disallowed items; this is defense-in-depth
   * for any caller that bypasses the render gate (search edge cases, deep
   * links, programmatic flows, future tests).
   *
   * Permissive defaults:
   *   - activeOrderType omitted/null  -> no channel check (legacy callers OK)
   *   - item missing channel flags    -> D-1 default 'Yes' applies; allowed
   */
  const addToCart = useCallback((item, variations = [], add_ons = [], activeOrderType = null) => {
    // CR A-1: defensive channel guard
    if (activeOrderType && !isItemAllowedForChannel(item, activeOrderType)) {
      const channelLabel = getChannelLabel(activeOrderType);
      toast.error(`"${item?.name || 'This item'}" is not available for ${channelLabel} orders.`);
      logger.cart('addToCart blocked by channel rule', { itemId: item?.id, name: item?.name, activeOrderType });
      return;
    }
    // CR-2026-09-07-001: Stock-out guard (Layer 2).
    if (item.stock_out === 'Y') {
      toast.error(`"${item?.name || 'This item'}" is currently out of stock.`);
      logger.cart('addToCart blocked by stock-out', { itemId: item?.id, name: item?.name });
      return;
    }
    setCart((prevCart) => {
      const cartId = generateCartId(item.id, variations, add_ons);
      
      // Check if item already exists in cart
      const existingItemIndex = prevCart.items.findIndex(cartItem => cartItem.cartId === cartId);
      
      if (existingItemIndex >= 0) {
        // Item exists, increment quantity
        const updatedItems = [...prevCart.items];
        updatedItems[existingItemIndex] = {
          ...updatedItems[existingItemIndex],
          quantity: updatedItems[existingItemIndex].quantity + 1,
          addedAt: Date.now() // Update timestamp to move to top
        };
        
        // Reorder: move updated item to top
        const itemToMove = updatedItems.splice(existingItemIndex, 1)[0];
        updatedItems.unshift(itemToMove);
        
        return {
          ...prevCart,
          items: updatedItems,
          expiresAt: Date.now() + CART_EXPIRY_TIME
        };
      } else {
        // New item, add to cart
        const newItem = {
          cartId,
          itemId: String(item.id),
          quantity: 1,
          item: { ...item },
          variations: [...variations],
          add_ons: [...add_ons],
          cookingInstructions: '', // Initialize cooking instructions
          addedAt: Date.now()
        };
        
        // Add new item at the top
        return {
          ...prevCart,
          items: [newItem, ...prevCart.items],
          expiresAt: Date.now() + CART_EXPIRY_TIME
        };
      }
    });
  }, []);

  /**
   * Update item quantity in cart
   */
  const updateQuantity = useCallback((cartId, newQuantity) => {
    if (newQuantity <= 0) {
      removeFromCart(cartId);
      return;
    }

    setCart((prevCart) => {
      const updatedItems = prevCart.items.map(cartItem => {
        if (cartItem.cartId === cartId) {
          return {
            ...cartItem,
            quantity: newQuantity,
            addedAt: Date.now() // Update timestamp to move to top
          };
        }
        return cartItem;
      });

      // Reorder: move updated item to top
      const itemIndex = updatedItems.findIndex(item => item.cartId === cartId);
      if (itemIndex > 0) {
        const itemToMove = updatedItems.splice(itemIndex, 1)[0];
        updatedItems.unshift(itemToMove);
      }

      return {
        ...prevCart,
        items: updatedItems,
        expiresAt: Date.now() + CART_EXPIRY_TIME
      };
    });
  }, []);

  /**
   * Remove item from cart
   */
  const removeFromCart = useCallback((cartId) => {
    setCart((prevCart) => ({
      ...prevCart,
      items: prevCart.items.filter(item => item.cartId !== cartId),
      expiresAt: Date.now() + CART_EXPIRY_TIME
    }));
  }, []);

  /**
   * Get quantity of an item in cart
   */
  const getItemQuantity = useCallback((itemId, variations = [], add_ons = []) => {
    const cartId = generateCartId(itemId, variations, add_ons);
    const cartItem = cart.items.find(item => item.cartId === cartId);
    return cartItem ? cartItem.quantity : 0;
  }, [cart.items]);

  /**
   * Check if item is in cart
   */
  const isItemInCart = useCallback((itemId, variations = [], add_ons = []) => {
    return getItemQuantity(itemId, variations, add_ons) > 0;
  }, [getItemQuantity]);

  /**
   * Clear entire cart
   */
  const clearCart = useCallback(() => {
    setCart({
      items: [],
      createdAt: Date.now(),
      expiresAt: Date.now() + CART_EXPIRY_TIME
    });
  }, []);

  /**
   * Get total items count in cart
   */
  const getTotalItems = useCallback(() => {
    return cart.items.reduce((total, item) => total + item.quantity, 0);
  }, [cart.items]);

  /**
   * Get total price of cart (including variations and add-ons)
   * Uses centralized calculateCartItemPrice (CA-003 fix)
   */
  const getTotalPrice = useCallback(() => {
    return cart.items.reduce((total, cartItem) => {
      const itemSubtotal = calculateCartItemPrice(cartItem);
      return total + (itemSubtotal * cartItem.quantity);
    }, 0);
  }, [cart.items]);

  /**
   * Get total quantity of an item across all variations/add-ons combinations
   */
  const getTotalQuantityForItem = useCallback((itemId) => {
    return cart.items
      .filter(cartItem => cartItem.itemId === itemId)
      .reduce((total, cartItem) => total + cartItem.quantity, 0);
  }, [cart.items]);

  /**
   * Update cooking instructions for a cart item
   */
  const updateCookingInstructions = useCallback((cartId, instructions) => {
    setCart((prevCart) => {
      const updatedItems = prevCart.items.map(item => {
        if (item.cartId === cartId) {
          return {
            ...item,
            cookingInstructions: instructions.trim() || '' // Trim and allow empty string
          };
        }
        return item;
      });

      return {
        ...prevCart,
        items: updatedItems,
        expiresAt: Date.now() + CART_EXPIRY_TIME
      };
    });
  }, []);

  /**
   * Start edit order mode
   * @param {string|number} orderId - The order ID being edited
   * @param {Array} previousItems - Items from the previous order (read-only)
   * @param {Object} orderMeta - Additional order metadata (tableId, tableNo, etc.)
   */
  const startEditOrder = useCallback((orderId, previousItems, orderMeta = {}) => {
    setEditOrder({
      orderId,
      previousItems,
      tableId: orderMeta.tableId || null,
      tableNo: orderMeta.tableNo || null,
      restaurant: orderMeta.restaurant || null,
      createdAt: Date.now(),
      expiresAt: Date.now() + CART_EXPIRY_TIME
    });
  }, []);

  /**
   * Clear edit order mode and reset to normal ordering
   */
  const clearEditMode = useCallback(() => {
    setEditOrder(null);
    // Optionally clear the cart when exiting edit mode
    // clearCart();
  }, []);

  /**
   * Get combined payload for order submission in edit mode
   * Returns both previous items (for reference) and new items
   */
  const getEditOrderPayload = useCallback(() => {
    if (!isEditMode) return null;
    
    return {
      orderId: editingOrderId,
      previousItems: previousOrderItems,
      newItems: cart.items,
      tableId: editOrder?.tableId,
      tableNo: editOrder?.tableNo,
    };
  }, [isEditMode, editingOrderId, previousOrderItems, cart.items, editOrder]);

  /**
   * Calculate total price including previous order items (for display)
   * Now uses fullPrice from transformer (already includes base + variations + add-ons)
   */
  const getPreviousOrderTotal = useCallback(() => {
    if (!previousOrderItems || previousOrderItems.length === 0) return 0;
    
    // Exclude cancelled items (status === 3 or foodStatus === 3) from total
    return previousOrderItems.reduce((total, item) => {
      const status = item.status ?? item.foodStatus;
      if (status === 3) return total; // Skip cancelled items
      
      // Use fullPrice from transformer (already calculated)
      // Fallback to manual calculation for backward compatibility
      const fullPrice = item.fullPrice ?? (() => {
        const basePrice = parseFloat(item.unitPrice) || parseFloat(item.price) || 0;
        
        // Calculate variations total from variations[].values[].price
        let variationsTotal = 0;
        if (item.variations && item.variations.length > 0) {
          item.variations.forEach(v => {
            // Transformer format: { values: [{ label, price }] }
            if (v.values && Array.isArray(v.values)) {
              v.values.forEach(val => {
                variationsTotal += parseFloat(val.price ?? val.optionPrice) || 0;
              });
            }
          });
        }
        
        // Calculate add-ons total from addons[].price * quantity
        let addonsTotal = 0;
        const addons = item.addons || item.add_ons || [];
        if (addons.length > 0) {
          addons.forEach(a => {
            addonsTotal += (parseFloat(a.price) || 0) * (a.quantity || 1);
          });
        }
        
        return basePrice + variationsTotal + addonsTotal;
      })();
      
      return total + (fullPrice * (item.quantity || 1));
    }, 0);
  }, [previousOrderItems]);

  /**
   * Get combined total (previous + new items)
   */
  const getCombinedTotal = useCallback(() => {
    return getPreviousOrderTotal() + getTotalPrice();
  }, [getPreviousOrderTotal, getTotalPrice]);

  /**
   * Get total item count including previous order items
   */
  const getCombinedItemCount = useCallback(() => {
    const previousCount = previousOrderItems.reduce((total, item) => total + item.quantity, 0);
    return previousCount + getTotalItems();
  }, [previousOrderItems, getTotalItems]);

  // Delivery address state (Phase 3)
  const [deliveryAddress, setDeliveryAddressState] = useState(null);
  // BUG-2026-02-XX-001 persist: load persisted delivery charge on mount
  const [deliveryCharge, setDeliveryCharge] = useState(() => {
    if (!restaurantId || restaurantId === 'default') return 0;
    const stored = localStorage.getItem(`delivery_charge_${restaurantId}`);
    return stored ? (parseFloat(stored) || 0) : 0;
  });

  // BUG-2026-02-XX-001 persist: wrap setter to persist charge to localStorage
  const persistDeliveryCharge = useCallback((charge) => {
    setDeliveryCharge(charge);
    if (restaurantId && restaurantId !== 'default') {
      localStorage.setItem(`delivery_charge_${restaurantId}`, String(charge));
    }
  }, [restaurantId]);

  const setDeliveryAddress = (address) => {
    setDeliveryAddressState(address);
    if (address) {
      localStorage.setItem(`delivery_${restaurantId}`, JSON.stringify(address));
    } else {
      localStorage.removeItem(`delivery_${restaurantId}`);
    }
  };

  const clearDeliveryAddress = () => {
    setDeliveryAddressState(null);
    setDeliveryCharge(0);
    localStorage.removeItem(`delivery_${restaurantId}`);
    localStorage.removeItem(`delivery_charge_${restaurantId}`); // BUG-2026-02-XX-001 persist
  };

  // Load delivery address from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`delivery_${restaurantId}`);
      if (stored) setDeliveryAddressState(JSON.parse(stored));
    } catch (e) { /* ignore */ }
  }, [restaurantId]);

  const value = {
    // Cart items and basic operations
    cartItems: cart.items,
    addToCart,
    updateQuantity,
    removeFromCart,
    getItemQuantity,
    getTotalQuantityForItem,
    isItemInCart,
    clearCart,
    getTotalItems,
    getTotalPrice,
    updateCookingInstructions,
    restaurantId,
    
    // Edit order mode
    isEditMode,
    editingOrderId,
    previousOrderItems,
    startEditOrder,
    clearEditMode,
    getEditOrderPayload,
    getPreviousOrderTotal,
    getCombinedTotal,
    getCombinedItemCount,

    // Delivery (Phase 3)
    deliveryAddress,
    deliveryCharge,
    setDeliveryAddress,
    setDeliveryCharge: persistDeliveryCharge, // BUG-2026-02-XX-001 persist
    clearDeliveryAddress,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};

export default CartContext;
