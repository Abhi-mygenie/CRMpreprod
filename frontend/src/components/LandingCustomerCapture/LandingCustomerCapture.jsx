import React, { useEffect } from 'react';
import { FaLock } from 'react-icons/fa';
import PhoneInput from 'react-phone-number-input';
import { isValidPhoneNumber } from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import './LandingCustomerCapture.css';

const LandingCustomerCapture = ({
  phone,
  setPhone,
  name,
  setName,
  phoneError,
  setPhoneError,
  mandatoryName = false,
  mandatoryPhone = false,
  readOnly = false,
  lockHelperText = '',
}) => {
  // Load saved guest data on mount
  useEffect(() => {
    const savedGuest = localStorage.getItem('guestCustomer');
    if (savedGuest) {
      try {
        const { name: savedName, phone: savedPhone } = JSON.parse(savedGuest);
        if (savedName && !name) setName(savedName);
        if (savedPhone && !phone) setPhone(savedPhone);
      } catch (e) {
        // Ignore parse errors
      }
    }
  }, []);

  const handlePhoneChange = (value) => {
    if (readOnly) return;
    setPhone(value || '');
    setPhoneError('');
  };

  return (
    <div className="landing-customer-capture" data-testid="landing-customer-capture">
      <div className="capture-form">
        <div className="capture-input-group">
          <PhoneInput
            defaultCountry="IN"
            value={phone}
            onChange={handlePhoneChange}
            placeholder="Phone Number"
            disabled={readOnly}
            className={`capture-phone-input ${phoneError ? 'capture-phone-error' : ''} ${readOnly ? 'capture-phone-locked' : ''}`}
            data-testid="capture-phone-input"
          />
          {phoneError && (
            <span className="capture-error-text">{phoneError}</span>
          )}
          {!readOnly && mandatoryPhone && !phoneError && <span className="capture-mandatory-hint">* Required</span>}
        </div>
        <div className="capture-input-group">
          <input
            type="text"
            className={`capture-input ${readOnly ? 'capture-input-locked' : ''}`}
            placeholder="Your Name"
            value={name}
            onChange={(e) => { if (!readOnly) setName(e.target.value); }}
            readOnly={readOnly}
            disabled={readOnly}
            data-testid="capture-name-input"
          />
          {!readOnly && mandatoryName && <span className="capture-mandatory-hint">* Required</span>}
        </div>
        {readOnly && lockHelperText && (
          <div className="capture-lock-helper" data-testid="capture-lock-helper">
            <FaLock size={11} aria-hidden /> {lockHelperText}
          </div>
        )}
      </div>
    </div>
  );
};

// Validation helper - exported for use by LandingPage
export const isPhoneValid = (value) => {
  if (!value) return false;
  if (!isValidPhoneNumber(value)) return false;
  const digits = value.replace(/\D/g, '');
  if (value.startsWith('+91')) return digits.length === 12;
  if (value.startsWith('+98')) return digits.length === 12;
  return digits.length >= 10;
};

export default LandingCustomerCapture;
