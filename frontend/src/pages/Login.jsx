import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { IoArrowBack, IoMailOutline, IoLockClosedOutline } from 'react-icons/io5';
import { useAuth } from '../context/AuthContext';
import { useRestaurantId } from '../utils/useRestaurantId';
import { useRestaurantDetails } from '../hooks/useMenuData';
import { useRestaurantConfig } from '../context/RestaurantConfigContext';
import './Login.css';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const Login = () => {
  const navigate = useNavigate();
  const { setAuth } = useAuth();
  const { restaurantId } = useRestaurantId();
  const { restaurant } = useRestaurantDetails(restaurantId);
  const { logoUrl: configLogoUrl } = useRestaurantConfig();

  // Support redirect param: /login?redirect=/admin/qr-scanners
  const redirectTo = new URLSearchParams(window.location.search).get('redirect') || null;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const logoSrc = configLogoUrl || null;

  useEffect(() => {
    setError('');
  }, [email, password]);

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Please enter email and password');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_or_email: email.trim(),
          password: password.trim(),
        }),
      });
      
      const rawText = await res.text();
      let data;
      try {
        data = JSON.parse(rawText);
      } catch (parseError) {
        throw new Error('Invalid server response');
      }
      
      if (!res.ok) throw new Error(data.detail || 'Login failed');

      setAuth(data.token, data.user, data.user_type);
      
      if (data.pos_token) {
        localStorage.setItem('pos_token', data.pos_token);
      }

      if (data.user_type === 'restaurant') {
        navigate(redirectTo || '/admin/settings');
      } else {
        // Non-admin login — redirect to landing
        navigate(restaurantId ? `/${restaurantId}` : '/');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    navigate(-1);
  };

  return (
    <div className="login-page">
      <div className="login-container">

        {/* Header */}
        <div className="login-header">
          <button className="back-btn" onClick={handleBack} data-testid="login-back-btn">
            <IoArrowBack size={20} />
          </button>
          <h1 className="login-title">Restaurant Admin Login</h1>
        </div>

        {/* Logo */}
        <div className="login-logo-section">
          {logoSrc ? (
            <img
              src={logoSrc}
              alt={restaurant?.name || 'Restaurant'}
              className="login-logo"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          ) : restaurant?.name ? (
            <h2 className="login-restaurant-name-fallback">{restaurant.name}</h2>
          ) : null}
          {restaurant?.name && (
            <p className="login-restaurant-name">{restaurant.name}</p>
          )}
        </div>

        {/* Messages */}
        {error && <p className="login-message login-error" data-testid="login-error">{error}</p>}

        {/* Admin Login Form */}
        <form className="login-form" onSubmit={handleAdminLogin}>
          <div className="input-group">
            <span className="input-icon"><IoMailOutline /></span>
            <input
              type="email"
              className="login-input"
              placeholder="Admin email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              data-testid="login-email-input"
              autoFocus
            />
          </div>
          <div className="input-group">
            <span className="input-icon"><IoLockClosedOutline /></span>
            <input
              type="password"
              className="login-input"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              data-testid="login-password-input"
            />
          </div>
          <button
            type="submit"
            className="login-btn login-btn-primary"
            disabled={loading}
            data-testid="login-submit-btn"
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        {/* Customer note */}
        <div className="login-footer">
          <p className="login-note">
            Customers: please login from the restaurant page
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
