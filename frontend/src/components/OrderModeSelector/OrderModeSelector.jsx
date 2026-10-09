import React from 'react';
import { MdOutlineShoppingBag, MdOutlineDeliveryDining } from 'react-icons/md';
import './OrderModeSelector.css';

/**
 * OrderModeSelector — Takeaway/Delivery toggle on landing page.
 * Shown only when orderType is takeaway or delivery.
 * Allows switching between the two modes.
 */
// CR-2026-08-06-001: deliveryOpen, takeawayOpen, deliveryOpensAt, takeawayOpensAt added
const OrderModeSelector = ({
  mode, onModeChange, primaryColor, textColor,
  deliveryOpen = true, takeawayOpen = true,
  deliveryOpensAt = null, takeawayOpensAt = null,
}) => {
  const channels = [
    { key: 'takeaway', label: 'Takeaway', Icon: MdOutlineShoppingBag,     isOpen: takeawayOpen, opensAt: takeawayOpensAt },
    { key: 'delivery', label: 'Delivery', Icon: MdOutlineDeliveryDining,  isOpen: deliveryOpen, opensAt: deliveryOpensAt },
  ];

  return (
    <div className="order-mode-selector" data-testid="order-mode-selector">
      {channels.map(({ key, label, Icon, isOpen, opensAt }) => {
        const isActive = mode === key && isOpen;
        const isClosed = !isOpen;
        return (
          <button
            key={key}
            className={`order-mode-btn ${isActive ? 'order-mode-btn-active' : ''} ${isClosed ? 'order-mode-btn-closed' : ''}`}
            onClick={() => !isClosed && onModeChange(key)}
            disabled={isClosed}
            style={isActive ? { backgroundColor: primaryColor, color: textColor } : {}}
            data-testid={`order-mode-${key}-btn`}
            aria-disabled={isClosed}
          >
            <Icon className="order-mode-icon" />
            <span>{label}</span>
            {isClosed && (
              <span className="order-mode-opens-at" data-testid={`order-mode-${key}-opens-at`}>
                {opensAt ? `Opens ${opensAt}` : 'Unavailable'}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default OrderModeSelector;
