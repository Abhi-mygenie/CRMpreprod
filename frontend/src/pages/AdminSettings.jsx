import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRestaurantConfig } from '../context/RestaurantConfigContext';
import { DEFAULT_THEME } from '../constants/theme';
import { 
  IoLogOutOutline, 
  IoSaveOutline, 
  IoAddOutline, 
  IoTrashOutline, 
  IoToggle,
  IoColorPaletteOutline,
  IoImagesOutline,
  IoCloudUploadOutline,
  IoCreateOutline,
  IoCloseOutline,
  IoDocumentOutline,
  IoEyeOutline,
  IoRestaurantOutline,
  IoTextOutline,
  IoSettingsOutline,
  IoTimeOutline,
  IoPricetagsOutline
} from 'react-icons/io5';
import toast from 'react-hot-toast';
import { getRestaurantDetails } from '../api/services/restaurantService';
import ContentTab from '../components/AdminSettings/ContentTab';
import VisibilityTab from '../components/AdminSettings/VisibilityTab';
import MenuOrderTab from '../components/AdminSettings/MenuOrderTab';
import DietaryTagsAdmin from '../components/AdminSettings/DietaryTagsAdmin';
import '../components/AdminSettings/MenuOrderTab.css';
import '../components/AdminSettings/ContentTab.css';
import '../components/AdminSettings/DietaryTagsAdmin.css';
import './AdminSettings.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const AdminSettings = () => {
  const navigate = useNavigate();
  const { user, token, isRestaurant, logout } = useAuth();
  const { refreshConfig } = useRestaurantConfig();
  
  const [config, setConfig] = useState({
    // Landing Page Visibility
    showLogo: true,
    showWelcomeText: false,
    showDescription: false,
    showSocialIcons: false,
    showTableNumber: true,
    showPoweredBy: true,
    showCallWaiter: false,
    showPayBill: false,
    showLandingCallWaiter: false,
    showLandingPayBill: false,
    showEstimatedTimes: false,
    showFooter: true,
    showLandingCustomerCapture: false,  // Capture name/phone on landing
    showHamburgerMenu: true,  // Show hamburger menu
    showLoginButton: false,    // Show login button on landing
    // Menu Page Visibility
    showPromotionsOnMenu: false,
    showCategories: true,
    showMenuFab: true,
    // Order Page Visibility
    showCustomerDetails: false,
    showCustomerName: false,
    showCustomerPhone: true,
    showCookingInstructions: true,
    showSpecialInstructions: true,
    showPriceBreakdown: true,
    showTableInfo: true,
    showLoyaltyPoints: true,
    showCouponCode: false,
    showWallet: false,
    // Order Status Page
    showFoodStatus: true,
    showOrderStatusTracker: false,
    // Branding - Colors
    logoUrl: '',
    backgroundImageUrl: '',          // Desktop background image
    mobileBackgroundImageUrl: '',    // Mobile background image (portrait 9:16)
    primaryColor: DEFAULT_THEME.primaryColor,
    secondaryColor: DEFAULT_THEME.secondaryColor,
    buttonTextColor: DEFAULT_THEME.buttonTextColor,
    backgroundColor: DEFAULT_THEME.backgroundColor,
    textColor: DEFAULT_THEME.textColor,
    textSecondaryColor: DEFAULT_THEME.textSecondaryColor,
    // Branding - Typography
    fontHeading: 'Poppins',
    fontBody: 'Poppins',
    // Branding - Style
    borderRadius: 'rounded',
    // Branding - Text
    welcomeMessage: 'Welcome!',
    tagline: '',
    instagramUrl: '',
    facebookUrl: '',
    twitterUrl: '',
    youtubeUrl: '',
    whatsappNumber: '',
    phone: '',
    // Content
    aboutUsContent: '',
    aboutUsImage: '',
    openingHours: '',
    footerText: '',
    footerLinks: [],
    address: '',
    contactEmail: '',
    mapEmbedUrl: '',
    feedbackEnabled: false,
    feedbackIntroText: '',
    customPages: [],
    navMenuOrder: [
      { id: 'home', label: 'Home', type: 'builtin', visible: true },
      { id: 'menu', label: 'Menu', type: 'builtin', visible: true },
      { id: 'about', label: 'About Us', type: 'builtin', visible: false },
      { id: 'contact', label: 'Contact', type: 'builtin', visible: false },
      { id: 'feedback', label: 'Feedback', type: 'builtin', visible: false },
      { id: 'login', label: 'Login', type: 'builtin', visible: false },
    ],
    // Banners
    banners: [],
    // Extra Info Section
    showExtraInfo: true,
    extraInfoItems: ['', '', '', '', ''],
    // Custom Text
    browseMenuButtonText: 'Browse Menu',
    // Restaurant Operating Hours
    restaurantOpeningTime: '06:00',
    restaurantClosingTime: '03:00',
  });
  
  const [newBanner, setNewBanner] = useState({
    bannerImage: '',
    bannerTitle: '',
    bannerLink: '',
    bannerOrder: 0,
    bannerEnabled: true,
    displayOn: 'both'
  });
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState('settings');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [uploadingBackgroundImage, setUploadingBackgroundImage] = useState(false);
  const [uploadingMobileBackgroundImage, setUploadingMobileBackgroundImage] = useState(false);
  const [editingBannerId, setEditingBannerId] = useState(null);
  const [bannerSizeWarning, setBannerSizeWarning] = useState('');
  const logoInputRef = useRef(null);
  const bannerInputRef = useRef(null);
  const backgroundImageInputRef = useRef(null);
  const mobileBackgroundImageInputRef = useRef(null);

  const validateImageDimensions = (src) => {
    setBannerSizeWarning('');
    if (!src) return;
    const img = new Image();
    img.onload = () => {
      const ratio = img.width / img.height;
      const expected = 16 / 9;
      if (img.width < 600) {
        setBannerSizeWarning(`Image is too small (${img.width}x${img.height}px). Min width: 600px.`);
      } else if (Math.abs(ratio - expected) > 0.15) {
        setBannerSizeWarning(`Aspect ratio is ${img.width}x${img.height}px. Recommended: 16:9 (e.g. 1200x675px).`);
      }
    };
    img.onerror = () => {};
    img.src = src;
  };

  const uploadImage = async (file, setUploading) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(`${API_URL}/api/upload/image`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Upload failed');
      }
      const data = await response.json();
      toast.success('Image uploaded');
      return `${API_URL}${data.url}`;
    } catch (error) {
      toast.error(error.message || 'Upload failed');
      return null;
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }
    
    if (!isRestaurant) {
      navigate('/profile');
      return;
    }
    
    fetchConfig();
  }, [token, isRestaurant, navigate]);

  const [restaurantFlags, setRestaurantFlags] = useState({});

  const fetchConfig = async () => {
    if (!user?.id) return;
    
    // Use restaurant_id for config - matches what customers use (from URL)
    const configId = user.restaurant_id || user.id;
    
    setLoading(true);
    try {
      const [configResponse, restaurantData] = await Promise.all([
        fetch(`${API_URL}/api/config/${configId}`),
        getRestaurantDetails(configId).catch(() => null)
      ]);
      if (configResponse.ok) {
        const data = await configResponse.json();
        const extraInfoItems = data.extraInfoItems || [];
        while (extraInfoItems.length < 5) extraInfoItems.push('');
        setConfig(prev => ({ ...prev, ...data, extraInfoItems }));
      }
      if (restaurantData) {
        setRestaurantFlags({
          is_loyalty: restaurantData.is_loyalty,
          is_coupon: restaurantData.is_coupon,
          multiple_menu: restaurantData.multiple_menu === 'Yes',
        });
      }
    } catch (error) {
      toast.error('Failed to load configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (field) => {
    setConfig(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const handleChange = (field, value) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/api/config/`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          // Landing Page Visibility
          showLogo: config.showLogo,
          showWelcomeText: config.showWelcomeText,
          showDescription: config.showDescription,
          showSocialIcons: config.showSocialIcons,
          showTableNumber: config.showTableNumber,
          showPoweredBy: config.showPoweredBy,
          showCallWaiter: config.showCallWaiter,
          showPayBill: config.showPayBill,
          showLandingCallWaiter: config.showLandingCallWaiter,
          showLandingPayBill: config.showLandingPayBill,
          showEstimatedTimes: config.showEstimatedTimes,
          showFooter: config.showFooter,
          showLandingCustomerCapture: config.showLandingCustomerCapture,
          showHamburgerMenu: config.showHamburgerMenu,
          showLoginButton: config.showLoginButton,
          showPromotionsOnMenu: config.showPromotionsOnMenu,
          showCategories: config.showCategories,
          showMenuFab: config.showMenuFab,
          // Order Page Visibility
          showCustomerDetails: config.showCustomerDetails,
          showCustomerName: config.showCustomerName,
          showCustomerPhone: config.showCustomerPhone,
          showCookingInstructions: config.showCookingInstructions,
          showSpecialInstructions: config.showSpecialInstructions,
          showPriceBreakdown: config.showPriceBreakdown,
          showTableInfo: config.showTableInfo,
          showLoyaltyPoints: config.showLoyaltyPoints,
          showCouponCode: config.showCouponCode,
          showWallet: config.showWallet,
          // Order Status Page Visibility
          showFoodStatus: config.showFoodStatus,
          showOrderStatusTracker: config.showOrderStatusTracker,
          // Branding - Colors
          logoUrl: config.logoUrl,
          backgroundImageUrl: config.backgroundImageUrl,
          mobileBackgroundImageUrl: config.mobileBackgroundImageUrl,
          primaryColor: config.primaryColor,
          secondaryColor: config.secondaryColor,
          buttonTextColor: config.buttonTextColor,
          backgroundColor: config.backgroundColor,
          textColor: config.textColor,
          textSecondaryColor: config.textSecondaryColor,
          // Branding - Typography
          fontHeading: config.fontHeading,
          fontBody: config.fontBody,
          // Branding - Style
          borderRadius: config.borderRadius,
          // Branding - Text
          welcomeMessage: config.welcomeMessage,
          tagline: config.tagline,
          instagramUrl: config.instagramUrl,
          facebookUrl: config.facebookUrl,
          twitterUrl: config.twitterUrl,
          youtubeUrl: config.youtubeUrl,
          whatsappNumber: config.whatsappNumber,
          phone: config.phone,
          // Content
          aboutUsContent: config.aboutUsContent,
          aboutUsImage: config.aboutUsImage,
          openingHours: config.openingHours,
          footerText: config.footerText,
          footerLinks: config.footerLinks,
          address: config.address,
          contactEmail: config.contactEmail,
          mapEmbedUrl: config.mapEmbedUrl,
          feedbackEnabled: config.feedbackEnabled,
          feedbackIntroText: config.feedbackIntroText,
          navMenuOrder: config.navMenuOrder,
          // Extra Info Section
          showExtraInfo: config.showExtraInfo,
          extraInfoItems: config.extraInfoItems.filter(item => item.trim() !== ''),
          // Custom Text
          browseMenuButtonText: config.browseMenuButtonText,
          // Restaurant Operating Hours
          restaurantOpeningTime: config.restaurantOpeningTime,
          restaurantClosingTime: config.restaurantClosingTime,
          // Menu Order
          menuOrder: config.menuOrder,
        })
      });

      if (response.ok) {
        // Refresh the config context and cache so UI updates immediately
        const restaurantId = user?.restaurant_id;
        if (restaurantId) {
          await refreshConfig(restaurantId);
        }
        toast.success('Settings saved successfully');
      } else {
        throw new Error('Failed to save');
      }
    } catch (error) {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const addBanner = async () => {
    if (!newBanner.bannerImage || !newBanner.bannerTitle) {
      toast.error('Please fill in banner image and title');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/config/banners`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newBanner)
      });

      if (response.ok) {
        const data = await response.json();
        setConfig(prev => ({
          ...prev,
          banners: [...(prev.banners || []), data.banner]
        }));
        setNewBanner({
          bannerImage: '',
          bannerTitle: '',
          bannerLink: '',
          bannerOrder: 0,
          bannerEnabled: true,
          displayOn: 'both'
        });
        toast.success('Banner added');
      } else {
        throw new Error('Failed to add banner');
      }
    } catch (error) {
      toast.error('Failed to add banner');
    }
  };

  const deleteBanner = async (bannerId) => {
    try {
      const response = await fetch(`${API_URL}/api/config/banners/${bannerId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        setConfig(prev => ({
          ...prev,
          banners: prev.banners.filter(b => b.id !== bannerId)
        }));
        toast.success('Banner deleted');
      } else {
        throw new Error('Failed to delete');
      }
    } catch (error) {
      toast.error('Failed to delete banner');
    }
  };

  const startEditBanner = (banner) => {
    setEditingBannerId(banner.id);
    setNewBanner({
      bannerImage: banner.bannerImage || '',
      bannerTitle: banner.bannerTitle || '',
      bannerLink: banner.bannerLink || '',
      bannerOrder: banner.bannerOrder || 0,
      bannerEnabled: banner.bannerEnabled !== false,
      displayOn: banner.displayOn || 'both'
    });
    setBannerSizeWarning('');
  };

  const cancelEditBanner = () => {
    setEditingBannerId(null);
    setNewBanner({ bannerImage: '', bannerTitle: '', bannerLink: '', bannerOrder: 0, bannerEnabled: true, displayOn: 'both' });
    setBannerSizeWarning('');
  };

  const updateBanner = async () => {
    if (!newBanner.bannerImage || !newBanner.bannerTitle) {
      toast.error('Please fill in banner image and title');
      return;
    }
    try {
      const response = await fetch(`${API_URL}/api/config/banners/${editingBannerId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newBanner)
      });
      if (response.ok) {
        setConfig(prev => ({
          ...prev,
          banners: prev.banners.map(b => b.id === editingBannerId ? { ...b, ...newBanner } : b)
        }));
        cancelEditBanner();
        toast.success('Banner updated');
      } else {
        throw new Error('Failed to update banner');
      }
    } catch (error) {
      toast.error('Failed to update banner');
    }
  };

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
    navigate('/');
  };

  // Toggle component for reuse
  const ToggleRow = ({ field, label }) => (
    <div className="toggle-row" data-testid={`toggle-${field}`}>
      <span className="toggle-label">{label}</span>
      <button
        className={`toggle-btn ${config[field] ? 'active' : ''}`}
        onClick={() => handleToggle(field)}
      >
        <IoToggle />
      </button>
    </div>
  );

  // Section navigation tabs
  const sections = [
    { id: 'settings', label: 'Settings', icon: IoSettingsOutline },
    { id: 'branding', label: 'Branding', icon: IoColorPaletteOutline },
    { id: 'visibility', label: 'Visibility', icon: IoEyeOutline },
    { id: 'banners', label: 'Banners', icon: IoImagesOutline },
    { id: 'content', label: 'Content', icon: IoDocumentOutline },
    { id: 'menu', label: 'Menu', icon: IoRestaurantOutline },
    { id: 'dietary', label: 'Dietary Tags', icon: IoPricetagsOutline },
  ];

  if (!user || !isRestaurant) {
    return null;
  }

  if (loading) {
    return (
      <div className="admin-page">
        <div className="loading-state">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="admin-page" data-testid="admin-settings-page">
      {/* Header */}
      <div className="admin-header">
        <div className="header-spacer"></div>
        <h1 className="admin-title">App Settings</h1>
        <button className="logout-btn" onClick={handleLogout} data-testid="admin-logout-btn">
          <IoLogOutOutline />
        </button>
      </div>

      {/* Restaurant Info */}
      <div className="restaurant-card" data-testid="admin-restaurant-info">
        <h2 className="restaurant-name">{user.restaurant_name || 'Restaurant'}</h2>
        <p className="restaurant-email">{user.email}</p>
      </div>

      {/* Section Navigation Tabs */}
      <div className="section-tabs" data-testid="section-tabs">
        {sections.map(({ id, label, icon: Icon, navigateTo }) => (
          <button
            key={id}
            className={`section-tab ${activeSection === id ? 'active' : ''}`}
            onClick={() => {
              if (navigateTo) {
                const restaurantId = user.restaurant_id || user.id;
                navigate(`/${restaurantId}/${navigateTo}`);
              } else {
                setActiveSection(id);
              }
            }}
            data-testid={`tab-${id}`}
          >
            <Icon className="tab-icon" />
            <span className="tab-label">{label}</span>
          </button>
        ))}
      </div>

      {/* Visibility Section (Landing, Menu, Review Order, Order Status) */}
      {activeSection === 'visibility' && (
        <VisibilityTab ToggleRow={ToggleRow} restaurantFlags={restaurantFlags} />
      )}

      {/* Branding Section */}
      {activeSection === 'branding' && (
        <div className="settings-section" data-testid="section-branding">
          <h3 className="section-title">
            <IoColorPaletteOutline className="section-icon" />
            Branding & Appearance
          </h3>
          <p className="section-description">Customize your restaurant's colors, fonts, and images</p>

          {/* Background Image */}
          <div className="form-group">
            <label className="form-label">Background Image</label>
            <span className="form-hint" style={{marginBottom: '8px', display: 'block'}}>Full-screen restaurant ambiance photo for landing page</span>
            <div className="image-upload-field">
              <div className="image-url-row">
                <input
                  type="url"
                  className="form-input"
                  placeholder="https://example.com/restaurant-interior.jpg"
                  value={config.backgroundImageUrl || ''}
                  onChange={(e) => handleChange('backgroundImageUrl', e.target.value)}
                  data-testid="input-backgroundImageUrl"
                />
                <input
                  type="file"
                  ref={backgroundImageInputRef}
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const url = await uploadImage(file, setUploadingBackgroundImage);
                    if (url) handleChange('backgroundImageUrl', url);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  className="upload-btn"
                  onClick={() => backgroundImageInputRef.current?.click()}
                  disabled={uploadingBackgroundImage}
                  data-testid="upload-background-btn"
                >
                  <IoCloudUploadOutline />
                  {uploadingBackgroundImage ? 'Uploading...' : 'Upload'}
                </button>
              </div>
              {config.backgroundImageUrl && (
                <div className="image-preview-box" data-testid="background-preview" style={{marginTop: '12px'}}>
                  <img src={config.backgroundImageUrl} alt="Background preview" className="image-preview-img" style={{maxHeight: '200px'}} onError={(e) => e.target.style.display = 'none'} />
                  <button
                    type="button"
                    className="remove-image-btn"
                    onClick={() => handleChange('backgroundImageUrl', '')}
                    style={{marginTop: '8px', padding: '4px 12px', fontSize: '12px'}}
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Mobile Background Image */}
          <div className="form-group">
            <label className="form-label">Mobile Background Image <span style={{fontSize:'11px', color:'#888', fontWeight:400}}>(portrait, 9:16 ratio)</span></label>
            <span className="form-hint" style={{marginBottom: '8px', display: 'block'}}>Shown on phones (&lt;480px wide). Falls back to desktop image if not set.</span>
            <div className="image-upload-field">
              <div className="image-url-row">
                <input
                  type="url"
                  className="form-input"
                  placeholder="https://example.com/restaurant-mobile.jpg"
                  value={config.mobileBackgroundImageUrl || ''}
                  onChange={(e) => handleChange('mobileBackgroundImageUrl', e.target.value)}
                  data-testid="input-mobileBackgroundImageUrl"
                />
                <input
                  type="file"
                  ref={mobileBackgroundImageInputRef}
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const url = await uploadImage(file, setUploadingMobileBackgroundImage);
                    if (url) handleChange('mobileBackgroundImageUrl', url);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  className="upload-btn"
                  onClick={() => mobileBackgroundImageInputRef.current?.click()}
                  disabled={uploadingMobileBackgroundImage}
                  data-testid="upload-mobile-background-btn"
                >
                  <IoCloudUploadOutline />
                  {uploadingMobileBackgroundImage ? 'Uploading...' : 'Upload'}
                </button>
              </div>
              <span className="form-hint">Recommended: 1080 x 1920px (9:16 ratio). Max 5MB.</span>
              {config.mobileBackgroundImageUrl && (
                <div className="image-preview-box" data-testid="mobile-background-preview" style={{marginTop: '12px'}}>
                  <img src={config.mobileBackgroundImageUrl} alt="Mobile background preview" className="image-preview-img" style={{maxHeight: '200px'}} onError={(e) => e.target.style.display = 'none'} />
                  <button
                    type="button"
                    className="remove-image-btn"
                    onClick={() => handleChange('mobileBackgroundImageUrl', '')}
                    style={{marginTop: '8px', padding: '4px 12px', fontSize: '12px'}}
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Colors Sub-section */}
          <div className="form-subsection">
            <h4 className="form-subsection-title">Colors</h4>
            
            <div className="form-row">
              <div className="form-group half">
                <label className="form-label">Primary Color</label>
                <div className="color-input-wrapper">
                  <input
                    type="color"
                    className="form-color"
                    value={config.primaryColor || DEFAULT_THEME.primaryColor}
                    onChange={(e) => handleChange('primaryColor', e.target.value)}
                    data-testid="input-primaryColor"
                  />
                  <input
                    type="text"
                    className="form-input color-text"
                    value={config.primaryColor || DEFAULT_THEME.primaryColor}
                    onChange={(e) => handleChange('primaryColor', e.target.value)}
                  />
                </div>
                <span className="form-hint">Buttons, links, accents</span>
              </div>

              <div className="form-group half">
                <label className="form-label">Secondary Color</label>
                <div className="color-input-wrapper">
                  <input
                    type="color"
                    className="form-color"
                    value={config.secondaryColor || DEFAULT_THEME.secondaryColor}
                    onChange={(e) => handleChange('secondaryColor', e.target.value)}
                    data-testid="input-secondaryColor"
                  />
                  <input
                    type="text"
                    className="form-input color-text"
                    value={config.secondaryColor || DEFAULT_THEME.secondaryColor}
                    onChange={(e) => handleChange('secondaryColor', e.target.value)}
                  />
                </div>
                <span className="form-hint">Hover states, gradients</span>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group half">
                <label className="form-label">Button Text Color</label>
                <div className="color-input-wrapper">
                  <input
                    type="color"
                    className="form-color"
                    value={config.buttonTextColor || DEFAULT_THEME.buttonTextColor}
                    onChange={(e) => handleChange('buttonTextColor', e.target.value)}
                    data-testid="input-buttonTextColor"
                  />
                  <input
                    type="text"
                    className="form-input color-text"
                    value={config.buttonTextColor || DEFAULT_THEME.buttonTextColor}
                    onChange={(e) => handleChange('buttonTextColor', e.target.value)}
                  />
                </div>
                <span className="form-hint">Text on buttons</span>
              </div>

              <div className="form-group half">
                <label className="form-label">Background Color</label>
                <div className="color-input-wrapper">
                  <input
                    type="color"
                    className="form-color"
                    value={config.backgroundColor || DEFAULT_THEME.backgroundColor}
                    onChange={(e) => handleChange('backgroundColor', e.target.value)}
                    data-testid="input-backgroundColor"
                  />
                  <input
                    type="text"
                    className="form-input color-text"
                    value={config.backgroundColor || DEFAULT_THEME.backgroundColor}
                    onChange={(e) => handleChange('backgroundColor', e.target.value)}
                  />
                </div>
                <span className="form-hint">Page background</span>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group half">
                <label className="form-label">Text Color</label>
                <div className="color-input-wrapper">
                  <input
                    type="color"
                    className="form-color"
                    value={config.textColor || DEFAULT_THEME.textColor}
                    onChange={(e) => handleChange('textColor', e.target.value)}
                    data-testid="input-textColor"
                  />
                  <input
                    type="text"
                    className="form-input color-text"
                    value={config.textColor || DEFAULT_THEME.textColor}
                    onChange={(e) => handleChange('textColor', e.target.value)}
                  />
                </div>
                <span className="form-hint">Main body text</span>
              </div>

              <div className="form-group half">
                <label className="form-label">Secondary Text Color</label>
                <div className="color-input-wrapper">
                  <input
                    type="color"
                    className="form-color"
                    value={config.textSecondaryColor || DEFAULT_THEME.textSecondaryColor}
                    onChange={(e) => handleChange('textSecondaryColor', e.target.value)}
                    data-testid="input-textSecondaryColor"
                  />
                  <input
                    type="text"
                    className="form-input color-text"
                    value={config.textSecondaryColor || DEFAULT_THEME.textSecondaryColor}
                    onChange={(e) => handleChange('textSecondaryColor', e.target.value)}
                  />
                </div>
                <span className="form-hint">Descriptions, hints</span>
              </div>
            </div>
          </div>

          {/* Typography Sub-section */}
          <div className="form-subsection">
            <h4 className="form-subsection-title">Typography</h4>
            
            <div className="form-row">
              <div className="form-group half">
                <label className="form-label">Heading Font</label>
                <select
                  className="form-select"
                  value={config.fontHeading || 'Big Shoulders'}
                  onChange={(e) => handleChange('fontHeading', e.target.value)}
                  data-testid="select-fontHeading"
                >
                  <option value="Big Shoulders">Big Shoulders</option>
                  <option value="Montserrat">Montserrat</option>
                  <option value="Poppins">Poppins</option>
                  <option value="Roboto">Roboto</option>
                  <option value="Open Sans">Open Sans</option>
                  <option value="Playfair Display">Playfair Display</option>
                  <option value="Lato">Lato</option>
                </select>
                <span className="form-hint">Used for titles & headings</span>
              </div>

              <div className="form-group half">
                <label className="form-label">Body Font</label>
                <select
                  className="form-select"
                  value={config.fontBody || 'Montserrat'}
                  onChange={(e) => handleChange('fontBody', e.target.value)}
                  data-testid="select-fontBody"
                >
                  <option value="Montserrat">Montserrat</option>
                  <option value="Poppins">Poppins</option>
                  <option value="Roboto">Roboto</option>
                  <option value="Open Sans">Open Sans</option>
                  <option value="Lato">Lato</option>
                  <option value="Inter">Inter</option>
                  <option value="Nunito">Nunito</option>
                </select>
                <span className="form-hint">Used for body text</span>
              </div>
            </div>
          </div>

          {/* Style Sub-section */}
          <div className="form-subsection">
            <h4 className="form-subsection-title">Style</h4>
            
            <div className="form-group">
              <label className="form-label">Border Radius</label>
              <div className="radius-options">
                {[
                  { value: 'sharp', label: 'Sharp', preview: '0px' },
                  { value: 'slightly-rounded', label: 'Slight', preview: '4px' },
                  { value: 'rounded', label: 'Rounded', preview: '8px' },
                  { value: 'very-rounded', label: 'Very Rounded', preview: '16px' },
                  { value: 'pill', label: 'Pill', preview: '9999px' },
                ].map(option => (
                  <button
                    key={option.value}
                    type="button"
                    className={`radius-option ${config.borderRadius === option.value ? 'active' : ''}`}
                    onClick={() => handleChange('borderRadius', option.value)}
                    data-testid={`radius-${option.value}`}
                  >
                    <span 
                      className="radius-preview" 
                      style={{ borderRadius: option.preview }}
                    />
                    <span className="radius-label">{option.label}</span>
                  </button>
                ))}
              </div>
              <span className="form-hint">Corner roundness for buttons and cards</span>
            </div>
          </div>

          {/* Text Content Sub-section */}
          <div className="form-subsection">
            <h4 className="form-subsection-title">Contact & Social</h4>

            <div className="form-group">
              <label className="form-label">Phone Number</label>
              <input
                type="tel"
                className="form-input"
                placeholder="+91 98765 43210"
                value={config.phone || ''}
                onChange={(e) => handleChange('phone', e.target.value)}
                data-testid="input-phone"
              />
              <span className="form-hint">Overrides POS phone number if set</span>
            </div>

            <div className="form-group">
              <label className="form-label">Instagram URL</label>
              <input
                type="url"
                className="form-input"
                placeholder="https://instagram.com/yourrestaurant"
                value={config.instagramUrl || ''}
                onChange={(e) => handleChange('instagramUrl', e.target.value)}
                data-testid="input-instagramUrl"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Facebook URL</label>
              <input
                type="url"
                className="form-input"
                placeholder="https://facebook.com/yourrestaurant"
                value={config.facebookUrl || ''}
                onChange={(e) => handleChange('facebookUrl', e.target.value)}
                data-testid="input-facebookUrl"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Twitter / X URL</label>
              <input
                type="url"
                className="form-input"
                placeholder="https://x.com/yourrestaurant"
                value={config.twitterUrl || ''}
                onChange={(e) => handleChange('twitterUrl', e.target.value)}
                data-testid="input-twitterUrl"
              />
            </div>

            <div className="form-group">
              <label className="form-label">YouTube URL</label>
              <input
                type="url"
                className="form-input"
                placeholder="https://youtube.com/@yourrestaurant"
                value={config.youtubeUrl || ''}
                onChange={(e) => handleChange('youtubeUrl', e.target.value)}
                data-testid="input-youtubeUrl"
              />
            </div>

            <div className="form-group">
              <label className="form-label">WhatsApp Number</label>
              <input
                type="tel"
                className="form-input"
                placeholder="+91 98765 43210"
                value={config.whatsappNumber || ''}
                onChange={(e) => handleChange('whatsappNumber', e.target.value)}
                data-testid="input-whatsappNumber"
              />
              <span className="form-hint">Used for WhatsApp chat link on the landing page</span>
            </div>
          </div>
        </div>
      )}

      {/* Banners Section */}
      {activeSection === 'banners' && (
        <div className="settings-section" data-testid="section-banners">
          <h3 className="section-title">
            <IoImagesOutline className="section-icon" />
            Promotional Banners
          </h3>
          <p className="section-description">Manage promotional banners shown in the app</p>
          
          {/* Existing Banners */}
          <div className="banners-list">
            {config.banners && config.banners.length > 0 ? (
              config.banners.map((banner, index) => (
                <div key={banner.id} className={`banner-card ${editingBannerId === banner.id ? 'editing' : ''}`} data-testid={`banner-${banner.id}`}>
                  <span className="banner-order">#{index + 1}</span>
                  <img src={banner.bannerImage} alt={banner.bannerTitle} className="banner-preview" />
                  <div className="banner-info">
                    <span className="banner-title">{banner.bannerTitle}</span>
                    <div className="banner-meta">
                      <span className={`banner-status ${banner.bannerEnabled ? 'active' : 'inactive'}`}>
                        {banner.bannerEnabled ? 'Active' : 'Inactive'}
                      </span>
                      <span className="banner-display-on">
                        {banner.displayOn === 'landing' ? 'Landing' : banner.displayOn === 'menu' ? 'Menu' : 'Both'}
                      </span>
                    </div>
                  </div>
                  <div className="banner-actions">
                    <button
                      className="banner-edit-btn"
                      onClick={() => startEditBanner(banner)}
                      data-testid={`edit-banner-${banner.id}`}
                    >
                      <IoCreateOutline />
                    </button>
                    <button
                      className="banner-delete-btn"
                      onClick={() => deleteBanner(banner.id)}
                      data-testid={`delete-banner-${banner.id}`}
                    >
                      <IoTrashOutline />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="no-banners">No banners added yet. Add your first promotional banner below.</p>
            )}
          </div>

          {/* Add/Edit Banner Form */}
          <div className="add-banner-form">
            <div className="form-subtitle-row">
              <h4 className="form-subtitle">{editingBannerId ? 'Edit Banner' : 'Add New Banner'}</h4>
              {editingBannerId && (
                <button className="cancel-edit-btn" onClick={cancelEditBanner} data-testid="cancel-edit-banner-btn">
                  <IoCloseOutline /> Cancel
                </button>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Banner Image *</label>
              <div className="image-upload-field">
                <div className="image-url-row">
                  <input
                    type="url"
                    className="form-input"
                    placeholder="https://example.com/banner.jpg"
                    value={newBanner.bannerImage}
                    onChange={(e) => {
                      setNewBanner(prev => ({ ...prev, bannerImage: e.target.value }));
                      validateImageDimensions(e.target.value);
                    }}
                    onBlur={(e) => validateImageDimensions(e.target.value)}
                    data-testid="input-newBannerImage"
                  />
                  <input
                    type="file"
                    ref={bannerInputRef}
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const url = await uploadImage(file, setUploadingBanner);
                      if (url) {
                        setNewBanner(prev => ({ ...prev, bannerImage: url }));
                        validateImageDimensions(url);
                      }
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    className="upload-btn"
                    onClick={() => bannerInputRef.current?.click()}
                    disabled={uploadingBanner}
                    data-testid="upload-banner-btn"
                  >
                    <IoCloudUploadOutline />
                    {uploadingBanner ? 'Uploading...' : 'Upload'}
                  </button>
                </div>
                <span className="form-hint">Recommended: 1200 x 675px (16:9 ratio). Max 5MB.</span>
                {bannerSizeWarning && (
                  <span className="size-warning" data-testid="banner-size-warning">{bannerSizeWarning}</span>
                )}
                {newBanner.bannerImage && (
                  <div className="image-preview-box" data-testid="banner-image-preview">
                    <img src={newBanner.bannerImage} alt="Banner preview" className="image-preview-img banner-preview-large" onError={(e) => e.target.style.display = 'none'} />
                  </div>
                )}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Title *</label>
              <input
                type="text"
                className="form-input"
                placeholder="Banner title (e.g., Happy Hour 20% Off)"
                value={newBanner.bannerTitle}
                onChange={(e) => setNewBanner(prev => ({ ...prev, bannerTitle: e.target.value }))}
                data-testid="input-newBannerTitle"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Link URL (optional)</label>
              <input
                type="url"
                className="form-input"
                placeholder="https://example.com/promo"
                value={newBanner.bannerLink}
                onChange={(e) => setNewBanner(prev => ({ ...prev, bannerLink: e.target.value }))}
                data-testid="input-newBannerLink"
              />
            </div>
            <div className="form-row">
              <div className="form-group half">
                <label className="form-label">Display Order</label>
                <input
                  type="number"
                  className="form-input"
                  placeholder="0"
                  min="0"
                  value={newBanner.bannerOrder}
                  onChange={(e) => setNewBanner(prev => ({ ...prev, bannerOrder: parseInt(e.target.value) || 0 }))}
                  data-testid="input-newBannerOrder"
                />
              </div>
              <div className="form-group half">
                <label className="form-label">Status</label>
                <button
                  type="button"
                  className={`status-toggle-btn ${newBanner.bannerEnabled ? 'active' : ''}`}
                  onClick={() => setNewBanner(prev => ({ ...prev, bannerEnabled: !prev.bannerEnabled }))}
                  data-testid="toggle-newBannerEnabled"
                >
                  {newBanner.bannerEnabled ? 'Active' : 'Inactive'}
                </button>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group full">
                <label className="form-label">Display On</label>
                <select
                  className="form-select"
                  value={newBanner.displayOn}
                  onChange={(e) => setNewBanner(prev => ({ ...prev, displayOn: e.target.value }))}
                  data-testid="select-bannerDisplayOn"
                >
                  <option value="both">Both Pages</option>
                  <option value="landing">Landing Page Only</option>
                  <option value="menu">Menu Page Only</option>
                </select>
              </div>
            </div>
            <button
              className={`add-banner-btn ${editingBannerId ? 'update-mode' : ''}`}
              onClick={editingBannerId ? updateBanner : addBanner}
              data-testid={editingBannerId ? 'update-banner-btn' : 'add-banner-btn'}
            >
              {editingBannerId ? <><IoSaveOutline /> Update Banner</> : <><IoAddOutline /> Add Banner</>}
            </button>
          </div>
        </div>
      )}

      {/* Content Section */}
      {activeSection === 'content' && (
        <ContentTab config={config} setConfig={setConfig} token={token} uploadImage={uploadImage} ToggleRow={ToggleRow} handleChange={handleChange} />
      )}

      {/* Menu Order Section */}
      {activeSection === 'menu' && (
        <MenuOrderTab config={config} setConfig={setConfig} />
      )}

      {/* Dietary Tags Section */}
      {activeSection === 'dietary' && (
        <div className="settings-section" data-testid="section-dietary">
          <DietaryTagsAdmin 
            restaurantId={user?.restaurant_id || user?.id} 
            token={token}
            multipleMenu={restaurantFlags.multiple_menu}
          />
        </div>
      )}

      {/* Settings Section */}
      {activeSection === 'settings' && (
        <div className="settings-section" data-testid="section-settings">
          <h3 className="section-title">
            <IoSettingsOutline className="section-icon" />
            Settings
          </h3>
          <p className="section-description">Configure your restaurant's basic settings and appearance</p>

          {/* Logo */}
          <div className="form-group">
            <label className="form-label">Logo</label>
            <div className="image-upload-field">
              <div className="image-url-row">
                <input
                  type="url"
                  className="form-input"
                  placeholder="https://example.com/logo.png"
                  value={config.logoUrl || ''}
                  onChange={(e) => handleChange('logoUrl', e.target.value)}
                  data-testid="input-logoUrl-settings"
                />
                <input
                  type="file"
                  ref={logoInputRef}
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const url = await uploadImage(file, setUploadingLogo);
                    if (url) handleChange('logoUrl', url);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  className="upload-btn"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={uploadingLogo}
                  data-testid="upload-logo-btn-settings"
                >
                  <IoCloudUploadOutline />
                  {uploadingLogo ? 'Uploading...' : 'Upload'}
                </button>
              </div>
              <span className="form-hint">Paste a URL or upload an image (max 5MB)</span>
              {config.logoUrl && (
                <div className="image-preview-box" data-testid="logo-preview-settings">
                  <img src={config.logoUrl} alt="Logo preview" className="image-preview-img" onError={(e) => e.target.style.display = 'none'} />
                </div>
              )}
            </div>
          </div>

          {/* Welcome Message */}
          <div className="form-group">
            <label className="form-label">Welcome Message</label>
            <input
              type="text"
              className="form-input"
              placeholder="Welcome to our restaurant!"
              value={config.welcomeMessage || ''}
              onChange={(e) => handleChange('welcomeMessage', e.target.value)}
              data-testid="input-welcomeMessage-settings"
            />
            <span className="form-hint">Main heading shown on landing page</span>
          </div>

          {/* Tagline */}
          <div className="form-group">
            <label className="form-label">Tagline</label>
            <input
              type="text"
              className="form-input"
              placeholder="Your tagline here"
              value={config.tagline || ''}
              onChange={(e) => handleChange('tagline', e.target.value)}
              data-testid="input-tagline-settings"
            />
            <span className="form-hint">Secondary text shown below welcome message</span>
          </div>

          {/* Browse Menu Button Text */}
          <div className="form-group">
            <label className="form-label">Browse Menu Button Text</label>
            <input
              type="text"
              className="form-input"
              placeholder="Browse Menu"
              value={config.browseMenuButtonText || ''}
              onChange={(e) => handleChange('browseMenuButtonText', e.target.value)}
              data-testid="input-browseMenuButtonText-settings"
            />
            <span className="form-hint">Label for the main button on the landing page (default: "Browse Menu")</span>
          </div>

          {/* Restaurant Operating Hours */}
          <div className="form-group">
            <label className="form-label">
              <IoTimeOutline style={{ marginRight: '8px', verticalAlign: 'middle' }} />
              Restaurant Operating Hours
            </label>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap', marginTop: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Opening:</span>
                <input
                  type="time"
                  className="form-input"
                  style={{ width: '140px' }}
                  value={config.restaurantOpeningTime || '06:00'}
                  onChange={(e) => handleChange('restaurantOpeningTime', e.target.value)}
                  data-testid="input-restaurantOpeningTime"
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Closing:</span>
                <input
                  type="time"
                  className="form-input"
                  style={{ width: '140px' }}
                  value={config.restaurantClosingTime || '03:00'}
                  onChange={(e) => handleChange('restaurantClosingTime', e.target.value)}
                  data-testid="input-restaurantClosingTime"
                />
              </div>
            </div>
            <span className="form-hint">Set restaurant operating hours. The "Add" button will be hidden when restaurant is closed. Default: 6:00 AM - 3:00 AM</span>
          </div>
        </div>
      )}

      {/* Save Button */}
      <div className="save-section">
        <button
          className="save-btn"
          onClick={saveConfig}
          disabled={saving}
          data-testid="save-settings-btn"
        >
          <IoSaveOutline />
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
};

export default AdminSettings;
