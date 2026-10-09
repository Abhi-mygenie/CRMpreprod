import React from 'react';
import './PriceBreakdown.css';

const PriceBreakdown = ({ 
  basePrice, 
  variationsTotal = 0, 
  addonsTotal = 0, 
  quantity = 1 
}) => {
  const subtotal = basePrice + variationsTotal + addonsTotal;
  const total = subtotal * quantity;

  return (
    <div className="price-breakdown">
      <h3 className="price-breakdown-title">Price Breakdown</h3>
      
      <div className="price-breakdown-content">
        <div className="price-breakdown-row">
          <span className="price-breakdown-label">Base Price</span>
          <span className="price-breakdown-value">₹{basePrice.toFixed(2)}</span>
        </div>

        {variationsTotal > 0 && (
          <div className="price-breakdown-row">
            <span className="price-breakdown-label">Variations</span>
            <span className="price-breakdown-value">+₹{variationsTotal.toFixed(2)}</span>
          </div>
        )}

        {addonsTotal > 0 && (
          <div className="price-breakdown-row">
            <span className="price-breakdown-label">Addons</span>
            <span className="price-breakdown-value">+₹{addonsTotal.toFixed(2)}</span>
          </div>
        )}

        <div className="price-breakdown-divider"></div>

        <div className="price-breakdown-row">
          <span className="price-breakdown-label">Subtotal</span>
          <span className="price-breakdown-value">₹{subtotal.toFixed(2)}</span>
        </div>

        <div className="price-breakdown-row">
          <span className="price-breakdown-label">Quantity</span>
          <span className="price-breakdown-value">x{quantity}</span>
        </div>

        <div className="price-breakdown-divider"></div>

        <div className="price-breakdown-row price-breakdown-total">
          <span className="price-breakdown-label">Total</span>
          <span className="price-breakdown-value">₹{total.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
};

export default PriceBreakdown;
