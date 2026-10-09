import React, { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { CartProvider } from '../../context/CartContext';

/**
 * CartWrapper: provides CartContext to all children.
 * Uses useLocation() to parse restaurantId from the URL path
 * because this component lives OUTSIDE <Routes> and cannot use useParams().
 */
const CartWrapper = ({ children }) => {
  const location = useLocation();

  // Extract restaurantId from pathname directly (cannot use useParams outside Routes)
  const restaurantId = useMemo(() => {
    // 1. Try path param: /709/menu, /709/review-order, etc.
    const pathMatch = location.pathname.match(/^\/([^/]+)/);
    if (pathMatch) {
      const segment = pathMatch[1];
      const excluded = ['menu', 'stations', 'about', 'review-order', 'order-success', 'login', 'profile', 'admin', 'feedback', 'contact'];
      if (!excluded.includes(segment) && !segment.includes('.') && segment !== '') {
        return segment;
      }
    }
    // 2. Try query param: /?id=709
    const searchParams = new URLSearchParams(location.search);
    const queryId = searchParams.get('id') || searchParams.get('restaurantId');
    if (queryId) return queryId;

    return 'default';
  }, [location.pathname, location.search]);

  return (
    <CartProvider restaurantId={restaurantId}>
      {children}
    </CartProvider>
  );
};

export default CartWrapper;
