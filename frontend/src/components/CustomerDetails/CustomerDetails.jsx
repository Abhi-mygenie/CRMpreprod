import React, { useState, useEffect } from 'react';
import { FaLock } from 'react-icons/fa';
// import { IoPersonSharp } from "react-icons/io5";
import PhoneInput from 'react-phone-number-input';
import { isValidPhoneNumber } from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import './CustomerDetails.css';

const CustomerDetails = ({
  name = '',
  phone = '',
  onNameChange,
  onPhoneChange,
  showTitle = true,
  className = '',
  showPhoneError = false,
  showName = true,
  showPhone = true,
  readOnly = false,
  lockHelperText = '',
}) => {
  const [phoneError, setPhoneError] = useState('');
  const [phoneValue, setPhoneValue] = useState(phone || '');

  // Sync phone value with prop
  useEffect(() => {
    setPhoneValue(phone || '');
  }, [phone]);

  // Validate phone number (10 digits for India)
  const validatePhone = (value) => {
    if (!value) {
      return { isValid: false, error: '' };
    }

    // Check if it's a valid international phone number
    if (!isValidPhoneNumber(value)) {
      return { isValid: false, error: 'Please enter a valid phone number' };
    }

    // For India (+91), check if it's exactly 10 digits
    if (value.startsWith('+91')) {
      const digits = value.replace(/\D/g, '');
      const phoneDigits = digits.slice(2); // Remove country code (91)
      
      if (phoneDigits.length !== 10) {
        return { isValid: false, error: 'Phone number must be 10 digits' };
      }
    }

    return { isValid: true, error: '' };
  };

  // Handle phone change
  const handlePhoneChange = (value) => {
    if (readOnly) return;
    setPhoneValue(value || '');

    // Validate
    const validation = validatePhone(value);
    setPhoneError(validation.error);

    // Notify parent
    onPhoneChange?.(value || '');
  };

  // Show error if prop is true
  useEffect(() => {
    if (showPhoneError) {
      const validation = validatePhone(phoneValue);
      if (!validation.isValid) {
        setPhoneError(validation.error || 'Please Enter 10 Digit Phone Number');
      }
    }
  }, [showPhoneError, phoneValue]);

  return (
    <div className={`customer-details ${className} ${readOnly ? 'customer-details-locked' : ''}`}>
      {showTitle && (
        <h2 className="customer-details-title">Customer Details</h2>
      )}
      <div className="customer-details-form">
        {showPhone && (
        <div className="customer-details-input-group">
          {/* <label className="customer-details-label">Phone Number</label> */}
          <PhoneInput
            defaultCountry="IN"
            value={phoneValue}
            onChange={handlePhoneChange}
            placeholder="Enter phone number"
            disabled={readOnly}
            className={`customer-details-phone-input ${phoneError ? 'customer-details-phone-input-error' : ''} ${readOnly ? 'customer-details-phone-locked' : ''}`}
          />
          {phoneError && (
            <div className="customer-details-error">{phoneError}</div>
          )}
        </div>
        )}
        {showName && (
        <div className="customer-details-input-group">
          {/* <label className="customer-details-label">Name</label> */}
          <input
            type="text"
            className={`customer-details-input ${readOnly ? 'customer-details-input-locked' : ''}`}
            value={name}
            onChange={(e) => { if (!readOnly) onNameChange?.(e.target.value); }}
            placeholder="Enter your name"
            readOnly={readOnly}
            disabled={readOnly}
          />
        </div>
        )}
        {readOnly && lockHelperText && (
          <div className="customer-details-lock-helper" data-testid="customer-details-lock-helper">
            <FaLock size={11} aria-hidden /> {lockHelperText}
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomerDetails;
