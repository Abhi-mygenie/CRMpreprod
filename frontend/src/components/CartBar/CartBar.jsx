import React, { useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import './CartBar.css';

const CartBar = () => {
  const { 
    getTotalItems, 
    getTotalPrice, 
    restaurantId: cartRestaurantId,
    isEditMode,
    previousOrderItems,
    getPreviousOrderTotal
  } = useCart();
  const navigate = useNavigate();
  const location = useLocation();

  // Extract restaurantId from pathname as fallback (memoized for performance)
  const pathRestaurantId = useMemo(() => {
    const pathMatch = location.pathname.match(/^\/([^/]+)/);
    if (pathMatch) {
      const firstSegment = pathMatch[1];
      // Exclude known route paths
      const excludedPaths = ['menu', 'stations', 'about', 'review-order'];
      //  ignore segments that look like hostnames
      if (!excludedPaths.includes(firstSegment) && !firstSegment.includes('.')) {
        return firstSegment;
      }

    }
    return null;
  }, [location.pathname]);

  // console.log('cartRestaurantId', cartRestaurantId);
  // console.log('pathRestaurantId', pathRestaurantId);

  // Use cart's restaurantId first, fallback to pathname extraction
  const restaurantId = cartRestaurantId && cartRestaurantId !== 'default'
    ? cartRestaurantId
    : pathRestaurantId;

  // Hide bar on review order page
  const isReviewOrderPage = location.pathname.includes('/review-order');

  const isMenuItemsPage = location.pathname.includes('/menu');

  const totalItems = getTotalItems();
  const totalPrice = getTotalPrice();
  const isVisible = totalItems > 0 && !isReviewOrderPage && isMenuItemsPage;

  // Add/remove body class for padding when bar is visible
  useEffect(() => {
    if (isVisible) {
      document.body.classList.add('cart-bar-visible');
    } else {
      document.body.classList.remove('cart-bar-visible');
    }

    return () => {
      document.body.classList.remove('cart-bar-visible');
    };
  }, [isVisible]);


  const stationId = useMemo(() => {
    // Pattern: /:restaurantId/menu/:stationId
    const pathMatch = location.pathname.match(/\/menu\/([^/]+)/);
    if (pathMatch) {
      return pathMatch[1];
    }
    return null;
  }, [location.pathname]);


  // Don't render if not visible
  if (!isVisible) {
    return null;
  }


  const handleViewCart = () => {
    if (restaurantId) {
      if (stationId) {
        // Navigate with stationId if available
        navigate(`/${restaurantId}/${stationId}/review-order`);
      } else {
        // Navigate without stationId
        navigate(`/${restaurantId}/review-order`);
      }
    }
  };

  // Calculate counts and totals
  const newItemsCount = totalItems;
  const newItemsPrice = totalPrice;
  const previousItemsCount = isEditMode ? previousOrderItems.reduce((sum, item) => sum + (item.quantity || 1), 0) : 0;
  const previousItemsPrice = isEditMode ? getPreviousOrderTotal() : 0;
  const totalItemsCount = newItemsCount + previousItemsCount;
  const grandTotal = newItemsPrice + previousItemsPrice;

  // Text for display
  const itemText = isEditMode 
    ? `${newItemsCount} New + ${previousItemsCount} Previous (${totalItemsCount} Total)`
    : (totalItems === 1 ? '1 Item Added' : `${totalItems} Items Added`);

  return (
    <div className="cart-bar">
      <div className="cart-bar-content">
        <div className="cart-bar-info">
          <div className="cart-bar-item-count">{itemText}</div>
          <div className="cart-bar-total-price">
            {isEditMode 
              ? `₹${newItemsPrice.toFixed(2)} + ₹${previousItemsPrice.toFixed(2)} = ₹${grandTotal.toFixed(2)}`
              : `₹${totalPrice.toFixed(2)}`
            }
          </div>
        </div>
        <button className="cart-bar-view-btn" onClick={handleViewCart}>
          View Cart
        </button>
      </div>
    </div>
  );
};

export default CartBar;