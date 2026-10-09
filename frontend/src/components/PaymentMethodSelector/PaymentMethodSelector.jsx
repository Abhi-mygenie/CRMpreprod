import React from 'react';
import { MdOutlinePayment, MdOutlinePointOfSale } from 'react-icons/md';
import './PaymentMethodSelector.css';

/**
 * PaymentMethodSelector Component
 * Allows user to choose between Online Payment and COD (Pay at Counter)
 * 
 * @param {Object} props
 * @param {boolean} props.showOnline - Whether to show online payment option
 * @param {boolean} props.showCod - Whether to show COD option
 * @param {string} props.selected - Currently selected option: 'online' | 'cod'
 * @param {function} props.onSelect - Callback when selection changes
 * @param {string} props.onlineLabel - Custom label for online option (default: "Pay Online")
 * @param {string} props.codLabel - Custom label for COD option (default: "Pay at Counter")
 * @param {boolean} props.disabled - Disable selection
 */
const PaymentMethodSelector = ({
  showOnline = true,
  showCod = true,
  selected = 'online',
  onSelect,
  onlineLabel = 'Pay Online',
  codLabel = 'Pay at Counter',
  disabled = false
}) => {
  // Don't render if no options or only one option
  if (!showOnline && !showCod) return null;
  if (showOnline && !showCod) return null; // Only online - no need to show selector
  if (!showOnline && showCod) return null; // Only COD - no need to show selector

  const handleSelect = (method) => {
    if (!disabled && onSelect) {
      onSelect(method);
    }
  };

  return (
    <div className="payment-method-selector" data-testid="payment-method-selector">
      <div className="payment-method-header">
        <MdOutlinePayment className="payment-method-icon" />
        <span className="payment-method-title">Payment Method</span>
      </div>
      
      <div className="payment-method-options">
        {showOnline && (
          <button
            type="button"
            className={`payment-option ${selected === 'online' ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
            onClick={() => handleSelect('online')}
            disabled={disabled}
            data-testid="payment-option-online"
          >
            <div className="payment-option-radio">
              <div className={`radio-outer ${selected === 'online' ? 'selected' : ''}`}>
                {selected === 'online' && <div className="radio-inner" />}
              </div>
            </div>
            <div className="payment-option-content">
              <MdOutlinePayment className="payment-option-icon" />
              <span className="payment-option-label">{onlineLabel}</span>
            </div>
          </button>
        )}
        
        {showCod && (
          <button
            type="button"
            className={`payment-option ${selected === 'cod' ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
            onClick={() => handleSelect('cod')}
            disabled={disabled}
            data-testid="payment-option-cod"
          >
            <div className="payment-option-radio">
              <div className={`radio-outer ${selected === 'cod' ? 'selected' : ''}`}>
                {selected === 'cod' && <div className="radio-inner" />}
              </div>
            </div>
            <div className="payment-option-content">
              <MdOutlinePointOfSale className="payment-option-icon" />
              <span className="payment-option-label">{codLabel}</span>
            </div>
          </button>
        )}
      </div>
    </div>
  );
};

export default PaymentMethodSelector;
