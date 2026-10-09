import React from 'react';
import './QuantitySelector.css';

const QuantitySelector = ({ quantity, onIncrement, onDecrement }) => {
  return (
    <div className="quantity-selector">
      <button
        className="quantity-btn quantity-btn-decrease"
        onClick={onDecrement}
        aria-label="Decrease quantity"
      >
        <span className="quantity-icon">−</span>
      </button>
      <span className="quantity-value">{quantity}</span>
      <button
        className="quantity-btn quantity-btn-increase"
        onClick={onIncrement}
        aria-label="Increase quantity"
      >
        <span className="quantity-icon">+</span>
      </button>
    </div>
  );
};

export default QuantitySelector;
