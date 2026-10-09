import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { useRestaurantId } from '../../utils/useRestaurantId';
import { useRestaurantConfig } from '../../context/RestaurantConfigContext';
import { useRestaurantDetails, useStations } from '../../hooks/useMenuData';
import { isMultipleMenu } from '../../api/utils/restaurantIdConfig';
import { 
  IoMenuOutline, 
  IoCloseOutline, 
  IoPersonOutline, 
  IoReceiptOutline, 
  IoGiftOutline,
  IoInformationCircleOutline,
  IoRestaurantOutline,
  IoLogInOutline,
  IoLogOutOutline,
  IoWalletOutline,
  IoHomeOutline,
  IoCallOutline,
  IoChatbubblesOutline,
  IoDocumentTextOutline,
  IoSettingsOutline
} from 'react-icons/io5';
import { MdSupportAgent } from 'react-icons/md';
import toast from 'react-hot-toast';
import './HamburgerMenu.css';

const HamburgerMenu = ({ restaurantName, phone }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { restaurantId } = useRestaurantId();
  const { restaurant } = useRestaurantDetails(restaurantId);
  const numericRestaurantId = restaurant?.id?.toString() || restaurantId;
  const { stations } = useStations(numericRestaurantId);
  const { isAuthenticated, user, isCustomer, isRestaurant, logout } = useAuth();
  const { navMenuOrder } = useRestaurantConfig();
  const { isEditMode } = useCart();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  // Force close menu on route change
  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const handleNavigation = (path) => {
    // In edit mode, block navigation to Home - user must complete order
    if (isEditMode && (path === menuBasePath || path === '/' || path === `/${restaurantId}`)) {
      toast('Please complete or update your order first', { icon: '⚠️' });
      setIsOpen(false);
      return;
    }
    setIsOpen(false);
    navigate(path);
  };

  const handleLogout = () => {
    // Block logout in edit mode
    if (isEditMode) {
      toast('Please complete or update your order before logging out', { icon: '⚠️' });
      setIsOpen(false);
      return;
    }
    setIsOpen(false);
    logout();
    toast.success('Logged out successfully');
    navigate(restaurantId ? `/${restaurantId}` : '/');
  };

  const menuBasePath = restaurantId ? `/${restaurantId}` : '';
  const loginVisible = navMenuOrder.some(item => item.id === 'login' && item.visible !== false);

  return (
    <div className="hamburger-menu-container" ref={menuRef}>
      {/* Hamburger Icon */}
      <button 
        className="hamburger-btn"
        onClick={() => setIsOpen(!isOpen)}
        data-testid="hamburger-menu-btn"
        aria-label="Menu"
      >
        {isOpen ? <IoCloseOutline /> : <IoMenuOutline />}
      </button>

      {/* Overlay - only render when open */}
      {isOpen && <div className="hamburger-overlay" onClick={() => setIsOpen(false)} />}

      {/* Slide-out Menu - only render when open */}
      {isOpen && (
      <div className="hamburger-drawer open">
        {/* User Header */}
        <div className="hamburger-header">
          {isAuthenticated && isCustomer ? (
            <div className="hamburger-user-info">
              <div className="hamburger-user-avatar">
                <IoPersonOutline />
              </div>
              <div className="hamburger-user-details">
                <span className="hamburger-user-name">Hi, {user?.name?.split(' ')[0] || 'User'}!</span>
                <span className="hamburger-user-points">{user?.total_points || 0} points</span>
              </div>
            </div>
          ) : (
            <div className="hamburger-guest-info">
              <span className="hamburger-guest-text">{restaurantName || 'Welcome'}</span>
            </div>
          )}
        </div>

        {/* Menu Items */}
        <div className="hamburger-menu-items">
          {/* Dynamic Nav Items from config - Menu hidden to force Landing Page flow */}
          {(navMenuOrder.length > 0 ? navMenuOrder : [
            { id: 'home', label: 'Home', type: 'builtin', visible: true },
            { id: 'menu', label: 'Menu', type: 'builtin', visible: true },
            { id: 'about', label: 'About Us', type: 'builtin', visible: false },
            { id: 'contact', label: 'Contact', type: 'builtin', visible: false },
            { id: 'feedback', label: 'Feedback', type: 'builtin', visible: false },
            { id: 'login', label: 'Login', type: 'builtin', visible: false },
          ]).filter(item => item.visible !== false).map((item) => {
            // Login item has special rendering
            if (item.id === 'login') {
              if (isAuthenticated) return null;
              return (
                <button
                  key="login"
                  className="hamburger-item hamburger-item-login"
                  onClick={() => handleNavigation('/login')}
                  data-testid="hamburger-login"
                >
                  <IoLogInOutline className="hamburger-item-icon" />
                  <span>Login</span>
                  <span className="hamburger-item-badge">Earn Rewards</span>
                </button>
              );
            }

            const iconMap = {
              home: IoHomeOutline,
              menu: IoRestaurantOutline,
              about: IoInformationCircleOutline,
              contact: IoCallOutline,
              feedback: IoChatbubblesOutline,
            };
            const pathMap = {
              home: menuBasePath || '/',
              menu: isMultipleMenu(restaurant) ? `${menuBasePath}/stations` : `${menuBasePath}/menu`,
              about: `${menuBasePath}/about`,
              contact: `${menuBasePath}/contact`,
              feedback: `${menuBasePath}/feedback`,
            };

            const Icon = iconMap[item.id] || IoDocumentTextOutline;
            const path = pathMap[item.id] || `${menuBasePath}/page/${item.id}`;

            return (
              <button
                key={item.id}
                className="hamburger-item"
                onClick={() => handleNavigation(path)}
                data-testid={`hamburger-${item.id}`}
              >
                <Icon className="hamburger-item-icon" />
                <span>{item.label}</span>
              </button>
            );
          })}

          <div className="hamburger-divider" />

          {/* Logged In Items - Customer only */}
          {isAuthenticated && isCustomer && (
            <>
              <button 
                className="hamburger-item"
                onClick={() => handleNavigation('/profile')}
                data-testid="hamburger-my-profile"
              >
                <IoPersonOutline className="hamburger-item-icon" />
                <span>My Profile</span>
              </button>

              <button 
                className="hamburger-item"
                onClick={() => handleNavigation('/profile?tab=orders')}
                data-testid="hamburger-my-orders"
              >
                <IoReceiptOutline className="hamburger-item-icon" />
                <span>My Orders</span>
              </button>

              <button 
                className="hamburger-item"
                onClick={() => handleNavigation('/profile?tab=points')}
                data-testid="hamburger-my-points"
              >
                <IoGiftOutline className="hamburger-item-icon" />
                <span>My Points</span>
              </button>

              <button 
                className="hamburger-item"
                onClick={() => handleNavigation('/profile?tab=wallet')}
                data-testid="hamburger-my-wallet"
              >
                <IoWalletOutline className="hamburger-item-icon" />
                <span>My Wallet</span>
              </button>

              <div className="hamburger-divider" />
            </>
          )}

          {/* Logout - Any authenticated user */}
          {isAuthenticated && (
            <button 
              className="hamburger-item hamburger-item-logout"
              onClick={handleLogout}
              data-testid="hamburger-logout"
            >
              <IoLogOutOutline className="hamburger-item-icon" />
              <span>Logout</span>
            </button>
          )}
        </div>

        {/* Admin Settings - Bottom */}
        {isAuthenticated && isRestaurant && (
          <div className="hamburger-settings-section">
            <button
              className="hamburger-item hamburger-item-settings"
              onClick={() => handleNavigation('/admin/settings')}
              data-testid="hamburger-settings"
            >
              <IoSettingsOutline className="hamburger-item-icon" />
              <span>Settings</span>
            </button>
          </div>
        )}

        {/* Footer - Need Help */}
        {phone && (
          <div className="hamburger-help-section">
            <div className="hamburger-help-header">
              <MdSupportAgent className="hamburger-help-icon" />
              <span className="hamburger-help-title">Need Help?</span>
            </div>
            <a href={`tel:${phone}`} className="hamburger-call-btn">
              <IoCallOutline className="hamburger-call-icon" />
              <span>Call us</span>
            </a>
          </div>
        )}

        {/* Footer */}
        <div className="hamburger-footer">
          <span className="hamburger-footer-text">Powered by MyGenie</span>
        </div>
      </div>
      )}
    </div>
  );
};

export default HamburgerMenu;
