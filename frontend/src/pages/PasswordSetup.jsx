import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
// CR-2026-10-07-002: OTP functions removed from crmService; import cleaned
import { crmRegister, crmLogin, crmSkipOtp, buildUserId } from '../api/services/crmService';
import { IoEyeOutline, IoEyeOffOutline, IoArrowBack } from 'react-icons/io5';
import './PasswordSetup.css';

const PasswordSetup = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { setCrmAuth } = useAuth();

  // Data passed from LandingPage
  const {
    phone = '',
    name = '',
    restaurantId = '',
    customerExists = false,
    hasPassword = false,
    customerName = '',
    orderMode = '',
  } = location.state || {};

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const [authMethod, setAuthMethod] = useState('password'); // 'password' | 'set-password'

  const displayName = customerName || name || '';
  const isNewCustomer = !customerExists;  // Truly new — not in our DB at all
  const userId = buildUserId(restaurantId);

  const navigateToMenu = () => {
    // Delivery mode → go to delivery address page first
    if (orderMode === 'delivery') {
      navigate(`/${restaurantId}/delivery-address`);
      return;
    }
    if (restaurantId) {
      navigate(`/${restaurantId}/menu`);
    } else {
      navigate('/menu');
    }
  };

  const handleSkip = async () => {
    setError('');
    setIsLoading(true);
    try {
      const data = await crmSkipOtp(phone, userId);
      if (data?.token) {
        const customerProfile = { name: displayName, phone, ...data.customer };
        setCrmAuth(data.token, customerProfile, restaurantId);
        navigateToMenu();
      } else {
        toast.error('Could not continue. Please try again.');
      }
    } catch (err) {
      toast.error(err?.message || 'Could not continue. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // UX-GAP-01: Direct-to-password routing
  // Skip the intermediate "choose" screen when we already know what the user needs.
  // - Existing customer WITH password → jump to password login
  // - Existing customer WITHOUT password (or new) → jump to set-password
  // - Edge case (customerExists undefined) → stay on 'choose' as safety fallback
  useEffect(() => {
    if (customerExists && hasPassword) {
      setAuthMethod('password');
    } else if (customerExists && !hasPassword) {
      setAuthMethod('set-password');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Set password (new customer or existing without password) → CRM /customer/register
  const handleSetPassword = async () => {
    setError('');
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);
    try {
      const data = await crmRegister(phone, password, userId, displayName);

      if (data.token) {
        setCrmAuth(data.token, data.customer, restaurantId);
      }
      // Save customer details for ReviewOrder pre-fill
      const guestData = { name: displayName, phone, restaurantId };
      localStorage.setItem('guestCustomer', JSON.stringify(guestData));
      toast.success('Password set successfully!');
      navigateToMenu();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Login with existing password → CRM /customer/login
  const handleLogin = async () => {
    setError('');
    if (!password) {
      setError('Please enter your password');
      return;
    }

    setIsLoading(true);
    try {
      const data = await crmLogin(phone, password, userId);

      if (data.token) {
        setCrmAuth(data.token, data.customer, restaurantId);
      }
      const loginName = data.customer?.name || displayName;
      const guestData = { name: loginName, phone, restaurantId };
      localStorage.setItem('guestCustomer', JSON.stringify(guestData));
      toast.success(`Welcome back, ${loginName}!`);
      navigateToMenu();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Set password — only for NEW customers (not in our DB at all)
  // Existing customers without password get OTP chooser below
  if (isNewCustomer) {
    return (
      <div className="password-setup-page" data-testid="password-set-page">
        <div className="password-setup-container">
          <h2 className="password-setup-title">
            {customerExists ? `Welcome back${displayName ? `, ${displayName}` : ''}!` : 'Create your account'}
          </h2>
          <p className="password-setup-subtitle">
            Set a password for quick login next time
          </p>

          <div className="password-input-group">
            <div className="password-input-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                className="password-input"
                placeholder="Password (min 6 characters)"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                data-testid="set-password-input"
              />
              <button className="password-toggle" onClick={() => setShowPassword(!showPassword)} type="button">
                {showPassword ? <IoEyeOffOutline /> : <IoEyeOutline />}
              </button>
            </div>
          </div>

          <div className="password-input-group">
            <div className="password-input-wrapper">
              <input
                type={showConfirm ? 'text' : 'password'}
                className="password-input"
                placeholder="Confirm Password"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setError(''); }}
                data-testid="confirm-password-input"
              />
              <button className="password-toggle" onClick={() => setShowConfirm(!showConfirm)} type="button">
                {showConfirm ? <IoEyeOffOutline /> : <IoEyeOutline />}
              </button>
            </div>
          </div>

          {error && <p className="password-error" data-testid="set-password-error">{error}</p>}

          <button
            className="password-setup-btn primary"
            onClick={handleSetPassword}
            disabled={isLoading}
            data-testid="save-continue-btn"
          >
            {isLoading ? 'Saving...' : 'Save & Continue'}
          </button>

          <button className="password-skip-link" onClick={handleSkip} data-testid="skip-password-btn">
            Skip for now
          </button>
        </div>
      </div>
    );
  }

  // Mask phone for display: +919579504871 → +91 •••••04871
  const maskedPhone = phone ? phone.replace(/(\+\d{2})(\d+)(\d{5})/, '$1 •••••$3') : '';

  // State A2: authMethod = 'set-password' (existing customer without password, chose to set one)
  if (authMethod === 'set-password') {
    return (
      <div className="password-setup-page" data-testid="password-set-page">
        <div className="password-setup-container">
          <button
            className="password-back-btn"
            onClick={() => { setAuthMethod('choose'); setError(''); setPassword(''); setConfirmPassword(''); }}
            data-testid="set-password-back-btn"
          >
            <IoArrowBack /> Back
          </button>
          <h2 className="password-setup-title">
            Welcome back{displayName ? `, ${displayName}` : ''}!
          </h2>
          <p className="password-setup-subtitle">
            Set a password for quick login next time
          </p>

          <div className="password-input-group">
            <div className="password-input-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                className="password-input"
                placeholder="Password (min 6 characters)"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                data-testid="set-password-input"
              />
              <button className="password-toggle" onClick={() => setShowPassword(!showPassword)} type="button">
                {showPassword ? <IoEyeOffOutline /> : <IoEyeOutline />}
              </button>
            </div>
          </div>

          <div className="password-input-group">
            <div className="password-input-wrapper">
              <input
                type={showConfirm ? 'text' : 'password'}
                className="password-input"
                placeholder="Confirm Password"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setError(''); }}
                data-testid="confirm-password-input"
              />
              <button className="password-toggle" onClick={() => setShowConfirm(!showConfirm)} type="button">
                {showConfirm ? <IoEyeOffOutline /> : <IoEyeOutline />}
              </button>
            </div>
          </div>

          {error && <p className="password-error" data-testid="set-password-error">{error}</p>}

          <button
            className="password-setup-btn primary"
            onClick={handleSetPassword}
            disabled={isLoading}
            data-testid="save-continue-btn"
          >
            {isLoading ? 'Saving...' : 'Save & Continue'}
          </button>

          <button className="password-skip-link" onClick={handleSkip} data-testid="skip-password-btn">
            Skip for now
          </button>
        </div>
      </div>
    );
  }

  // State C: authMethod = 'password' (existing password flow — mostly unchanged)
  return (
    <div className="password-setup-page" data-testid="password-login-page">
      <div className="password-setup-container">
        <button
          className="password-back-btn"
          onClick={() => { setAuthMethod('choose'); setError(''); setPassword(''); }}
          data-testid="password-back-btn"
        >
          <IoArrowBack /> Back
        </button>
        <h2 className="password-setup-title">
          Welcome back{displayName ? `, ${displayName}` : ''}!
        </h2>

        <div className="password-input-group">
          <div className="password-input-wrapper">
            <input
              type={showPassword ? 'text' : 'password'}
              className="password-input"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              data-testid="login-password-input"
            />
            <button className="password-toggle" onClick={() => setShowPassword(!showPassword)} type="button">
              {showPassword ? <IoEyeOffOutline /> : <IoEyeOutline />}
            </button>
          </div>
        </div>

        {error && <p className="password-error" data-testid="login-password-error">{error}</p>}

        <button
          className="password-setup-btn primary"
          onClick={handleLogin}
          disabled={isLoading}
          data-testid="login-btn"
        >
          {isLoading ? 'Logging in...' : 'Login'}
        </button>

        <div className="otp-actions">
          <button
            className="password-forgot-link"
            onClick={() => toast('Password reset coming soon', { icon: 'ℹ️' })}
            style={{ color: '#9ca3af', cursor: 'not-allowed' }}
            title="Available soon"
            data-testid="forgot-password-btn"
          >
            Forgot password?
          </button>
          <button className="password-skip-link" onClick={handleSkip} data-testid="skip-login-btn">
            Skip for now
          </button>
      </div>
    </div>
  );
};

export default PasswordSetup;
