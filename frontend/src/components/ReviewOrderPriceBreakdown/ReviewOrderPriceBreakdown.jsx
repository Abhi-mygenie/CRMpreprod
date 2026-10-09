import React from 'react';
import { RiFileList3Line } from "react-icons/ri";
import './ReviewOrderPriceBreakdown.css';

const ReviewOrderPriceBreakdown = ({
  subtotal = 0,
  cgst = 0,
  sgst = 0,
  totalGst = 0,
  vat = 0,
  totalToPay = 0,
  showHeader = true
}) => {
  return (
    <div className="review-order-price-breakdown">
      {showHeader && (
      <div className="review-order-price-header">
        <span className="review-order-price-icon"><RiFileList3Line /></span>
        <h3 className="review-order-price-title">Price Breakdown</h3>
      </div>
      )}

      <div className="review-order-price-content">
        <div className="review-order-price-row">
          <span className="review-order-price-label">Subtotal</span>
          <span className="review-order-price-value">₹{subtotal.toFixed(2)}</span>
        </div>

        {(cgst > 0 || sgst > 0 || totalGst > 0 || vat > 0) && (<div className="review-order-price-divider"></div>
        )}
        {cgst > 0 && (
          <>
            <div className="review-order-price-row">
              <span className="review-order-price-label">CGST</span>
              <span className="review-order-price-value">₹{cgst.toFixed(2)}</span>
            </div>
          </>
        )}

        {sgst > 0 && (
          <div className="review-order-price-row">
            <span className="review-order-price-label">SGST</span>
            <span className="review-order-price-value">₹{sgst.toFixed(2)}</span>
          </div>
        )}

        {totalGst > 0 && (
          <div className="review-order-price-row">
            <span className="review-order-price-label">Total GST</span>
            <span className="review-order-price-value">₹{totalGst.toFixed(2)}</span>
          </div>
        )}

        {vat > 0 && (
          <>
            {/* <div className="review-order-price-divider"></div> */}
            <div className="review-order-price-row">
              <span className="review-order-price-label">Total VAT</span>
              <span className="review-order-price-value">₹{vat.toFixed(2)}</span>
            </div>
          </>
        )}

        <div className="review-order-price-divider"></div>

        <div className="review-order-price-row review-order-price-total">
          <span className="review-order-price-label">Total</span>
          <span className="review-order-price-value">₹{totalToPay.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
};

export default ReviewOrderPriceBreakdown;
