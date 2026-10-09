import React from 'react';
import { IoLockClosedOutline, IoTimeOutline, IoCheckmarkOutline, IoCheckmarkDoneOutline } from 'react-icons/io5';
import { useRestaurantConfig } from '../../context/RestaurantConfigContext';
// Import centralized transformers - SINGLE SOURCE OF TRUTH for label formatting
import { getVariationLabels, getAddonLabels } from '../../api/transformers/helpers';
import './PreviousOrderItems.css';

/**
 * Item Status Badge Component
 * Status: 'pending' | 'preparing' | 'ready' | 'served' | 'cancelled' | 'paid'
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
      icon: <IoTimeOutline />,
      className: 'status-cancelled'
    },
    paid: {
      label: 'Paid',
      icon: <IoCheckmarkDoneOutline />,
      className: 'status-paid'
    }
  };

  const config = statusConfig[status] || statusConfig.pending;

  return (
    <span className={`item-status-badge ${config.className}`} data-testid={`status-${status}`}>
      {config.icon}
      <span className="item-status-label">{config.label}</span>
    </span>
  );
};

/**
 * Maps food_status numeric value to status string
 * Uses item.status (from transformer) or item.foodStatus (legacy)
 */
const mapFoodOrderStatus = (item) => {
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
 * PreviousOrderItems Component
 * Displays read-only items from a previous order during edit mode
 * These items cannot be modified or removed
 * 
 * Expects items with transformer properties:
 * - name: string
 * - fullPrice: number (base + variations + addons)
 * - variations: Variation[] (transformed)
 * - addons: Addon[] (transformed)
 * - status/foodStatus: number
 */
const PreviousOrderItems = ({ items, orderId }) => {
  const { showFoodStatus } = useRestaurantConfig();
  if (!items || items.length === 0) return null;

  // Calculate subtotal using fullPrice from transformer (already includes variations + addons)
  const subtotal = items.reduce((total, item) => {
    const status = item.status ?? item.foodStatus;
    if (status === 3) return total; // Skip cancelled items
    // Use fullPrice from transformer, fallback to price for backward compatibility
    const itemPrice = item.fullPrice ?? item.price ?? 0;
    return total + (itemPrice * (item.quantity || 1));
  }, 0);

  return (
    <div className="previous-order-section" data-testid="previous-order-section">
      {/* Section Header */}
      <div className="previous-order-header">
        <div className="previous-order-title-row">
          <IoLockClosedOutline className="previous-order-lock-icon" />
          <h3 className="previous-order-title">Previously Ordered</h3>
        </div>
      </div>

      {/* Items List */}
      <div className="previous-order-items-list">
        {items.map((item, index) => {
          // Use fullPrice from transformer (already calculated)
          const fullPrice = item.fullPrice ?? item.price ?? 0;
          
          // Use transformer's getVariationLabels with transformed variations
          const variationLabels = getVariationLabels(item.variations || []);
          
          // Use transformer's getAddonLabels with transformed addons
          const addonLabels = getAddonLabels(item.addons || []);
          
          return (
            <div 
              key={item.id || index} 
              className="previous-order-item"
              data-testid={`previous-order-item-${item.id || index}`}
            >
              <div className="previous-order-item-info">
                {/* Item name - use name directly from transformer */}
                <span className="previous-order-item-name">{item.name || item.item?.name || 'Unknown Item'}</span>
                
                {/* Variations */}
                {variationLabels && (
                  <span className="previous-order-item-customization" data-testid={`prev-item-variants-${index}`}>
                    Variants: {variationLabels}
                  </span>
                )}
                
                {/* Add-ons */}
                {addonLabels && (
                  <span className="previous-order-item-customization" data-testid={`prev-item-addons-${index}`}>
                    Addons: {addonLabels}
                  </span>
                )}
              </div>
              
              {/* Quantity, Price and Status - all inline */}
              <div className="previous-order-item-right">
                <span className="previous-order-item-quantity">x{item.quantity || 1}</span>
                <span className="previous-order-item-price">
                  ₹{(fullPrice * (item.quantity || 1)).toFixed(2)}
                </span>
                {showFoodStatus && <ItemStatusBadge status={mapFoodOrderStatus(item)} />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PreviousOrderItems;
