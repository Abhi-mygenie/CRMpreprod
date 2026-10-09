import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AdminConfigProvider, useAdminConfig } from '../context/AdminConfigContext';
import {
  IoSettingsOutline,
  IoColorPaletteOutline,
  IoEyeOutline,
  IoImagesOutline,
  IoDocumentOutline,
  IoRestaurantOutline,
  IoPricetagsOutline,
  IoLogOutOutline,
  IoMenuOutline,
  IoCloseOutline,
  IoSaveOutline,
  IoQrCodeOutline
} from 'react-icons/io5';
import toast from 'react-hot-toast';
import './AdminLayout.css';

const navItems = [
  { path: 'settings', label: 'Settings', icon: IoSettingsOutline },
  { path: 'branding', label: 'Branding', icon: IoColorPaletteOutline },
  { path: 'visibility', label: 'Visibility', icon: IoEyeOutline },
  { path: 'banners', label: 'Banners', icon: IoImagesOutline },
  { path: 'content', label: 'Content', icon: IoDocumentOutline },
  { path: 'menu', label: 'Menu Order', icon: IoRestaurantOutline },
  { path: 'dietary', label: 'Dietary Tags', icon: IoPricetagsOutline },
  { path: 'qr-scanners', label: 'QR Codes', icon: IoQrCodeOutline },
];

const AdminLayoutContent = () => {
  const navigate = useNavigate();
  const { user, logout, isRestaurant, token } = useAuth();
  const { saving, saveConfig, isDirty, discardChanges } = useAdminConfig();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Redirect if not restaurant user
  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }
    if (!isRestaurant) {
      navigate('/profile');
      return;
    }
  }, [token, isRestaurant, navigate]);

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
    navigate('/');
  };

  const handleSave = async () => {
    await saveConfig();
  };

  if (!user || !isRestaurant) {
    return null;
  }

  return (
    <div className="admin-layout" data-testid="admin-layout">
      {/* Mobile Header */}
      <div className="admin-mobile-header">
        <button
          className="admin-mobile-menu-btn"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          data-testid="admin-mobile-menu-btn"
        >
          {mobileMenuOpen ? <IoCloseOutline /> : <IoMenuOutline />}
        </button>
        <h1 className="admin-mobile-title">Admin Panel</h1>
        <button className="admin-mobile-logout" onClick={handleLogout}>
          <IoLogOutOutline />
        </button>
      </div>

      {/* Sidebar */}
      <aside className={`admin-sidebar ${sidebarOpen ? 'open' : 'collapsed'} ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <div className="admin-sidebar-header">
          <div className="admin-sidebar-brand">
            <h2 className="admin-sidebar-title">Admin Panel</h2>
            <p className="admin-sidebar-restaurant">{user.restaurant_name || 'Restaurant'}</p>
          </div>
          <button
            className="admin-sidebar-toggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            data-testid="admin-sidebar-toggle"
          >
            {sidebarOpen ? '◀' : '▶'}
          </button>
        </div>

        <nav className="admin-sidebar-nav">
          {navItems.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={`/admin/${path}`}
              className={({ isActive }) =>
                `admin-sidebar-item ${isActive ? 'active' : ''}`
              }
              onClick={() => setMobileMenuOpen(false)}
              data-testid={`admin-nav-${path}`}
            >
              <Icon className="admin-sidebar-icon" />
              <span className="admin-sidebar-label">{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="admin-sidebar-footer">
          <button
            className="admin-logout-btn"
            onClick={handleLogout}
            data-testid="admin-logout-btn"
          >
            <IoLogOutOutline className="admin-sidebar-icon" />
            <span className="admin-sidebar-label">Logout</span>
          </button>
        </div>
      </aside>

      {/* Mobile Overlay */}
      {mobileMenuOpen && (
        <div
          className="admin-mobile-overlay"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className={`admin-main ${sidebarOpen ? '' : 'expanded'}`}>
        <div className="admin-content-header">
          <div className="admin-content-info">
            <p className="admin-content-email">{user.email}</p>
          </div>
          <button
            className={`admin-save-btn ${isDirty ? 'has-changes' : ''}`}
            onClick={handleSave}
            disabled={saving || !isDirty}
            data-testid="admin-save-btn"
          >
            <IoSaveOutline />
            {saving ? 'Saving...' : isDirty ? 'Save Changes' : 'Saved'}
          </button>
        </div>

        {/* CR-2026-06-17-002 APP-10: Sticky unsaved-changes banner */}
        {isDirty && (
          <div
            className="unsaved-changes-banner"
            data-testid="unsaved-changes-banner"
            role="status"
          >
            <span className="unsaved-icon" aria-hidden="true">🟠</span>
            <span className="unsaved-msg">You have unsaved changes.</span>
            <button
              type="button"
              className="banner-save-now-btn"
              data-testid="banner-save-now-btn"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save Now'}
            </button>
            <button
              type="button"
              className="banner-discard-btn"
              data-testid="banner-discard-btn"
              onClick={() => {
                if (window.confirm('Discard all unsaved changes since last save? This cannot be undone.')) {
                  discardChanges();
                }
              }}
            >
              Discard
            </button>
          </div>
        )}

        <div className="admin-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

const AdminLayout = () => {
  return (
    <AdminConfigProvider>
      <AdminLayoutContent />
    </AdminConfigProvider>
  );
};

export default AdminLayout;
