import React, { useState } from 'react';
import {
  IoHomeOutline,
  IoRestaurantOutline,
  IoCartOutline,
  IoCheckmarkCircleOutline,
  IoKeyOutline,
} from 'react-icons/io5';

const SUB_TABS = [
  { id: 'landing', label: 'Landing Page', icon: IoHomeOutline },
  { id: 'menu', label: 'Menu Page', icon: IoRestaurantOutline },
  { id: 'review', label: 'Review Order', icon: IoCartOutline },
  { id: 'orderStatus', label: 'Order Status', icon: IoCheckmarkCircleOutline },
  { id: 'auth', label: 'Auth & OTP', icon: IoKeyOutline },
];

const VisibilityTab = ({ ToggleRow, restaurantFlags = {} }) => {
  const [activeSubTab, setActiveSubTab] = useState('landing');

  return (
    <div className="settings-section" data-testid="section-visibility">
      {/* Sub-tabs */}
      <div className="content-sub-tabs">
        {SUB_TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`content-sub-tab ${activeSubTab === id ? 'active' : ''}`}
            onClick={() => setActiveSubTab(id)}
            data-testid={`visibility-tab-${id}`}
          >
            <Icon className="tab-icon" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Landing Page */}
      {activeSubTab === 'landing' && (
        <div className="content-panel" data-testid="panel-landing">
          <h3 className="section-title">
            <IoHomeOutline className="section-icon" />
            Landing Page
          </h3>
          <p className="section-description">Control what elements are visible on the landing page</p>
          <div className="toggle-list">
            <ToggleRow field="showHamburgerMenu" label="Hamburger Menu" />
            <ToggleRow field="showLoginButton" label="Login Button" />
            <ToggleRow field="showLogo" label="Restaurant Logo" />
            <ToggleRow field="showWelcomeText" label="Welcome Message" />
            <ToggleRow field="showDescription" label="Restaurant Description" />
            <ToggleRow field="showSocialIcons" label="Social Media Icons" />
            <ToggleRow field="showFooter" label="Footer Section" />
            <ToggleRow field="showPoweredBy" label="Powered by MyGenie" />
            <ToggleRow field="showLandingCustomerCapture" label="Capture Customer Details (Name & Phone)" />
            <ToggleRow field="mandatoryCustomerName" label="Customer Name is Mandatory" />
            <ToggleRow field="mandatoryCustomerPhone" label="Customer Phone is Mandatory" />
            <ToggleRow field="showLandingCallWaiter" label="Call Waiter Button" />
            <ToggleRow field="showLandingPayBill" label="Pay Bill Button" />
          </div>
        </div>
      )}

      {/* Menu Page */}
      {activeSubTab === 'menu' && (
        <div className="content-panel" data-testid="panel-menu">
          <h3 className="section-title">
            <IoRestaurantOutline className="section-icon" />
            Menu Page
          </h3>
          <p className="section-description">Control what elements are visible on the menu page</p>
          <div className="toggle-list">
            <ToggleRow field="showPromotionsOnMenu" label="Promotional Banners" />
            <ToggleRow field="showCategories" label="Category Navigation" />
            <ToggleRow field="showMenuFab" label="Menu Button (FAB)" />
          </div>
        </div>
      )}

      {/* Review Order */}
      {activeSubTab === 'review' && (
        <div className="content-panel" data-testid="panel-review">
          <h3 className="section-title">
            <IoCartOutline className="section-icon" />
            Review Order
          </h3>
          <p className="section-description">Control what elements are visible on the order/checkout page</p>
          <div className="toggle-list">
            <ToggleRow field="showCustomerDetails" label="Customer Details Section" />
            <ToggleRow field="showCustomerName" label="Customer Name Field" />
            <ToggleRow field="showCustomerPhone" label="Customer Phone Field" />
            <ToggleRow field="showCookingInstructions" label="Cooking Instructions" />
            <ToggleRow field="showSpecialInstructions" label="Special Instructions" />
            <ToggleRow field="showPriceBreakdown" label="Price Breakdown" />
            <ToggleRow field="showTableInfo" label="Table Information" />
            {restaurantFlags.is_loyalty === 'Yes' && <ToggleRow field="showLoyaltyPoints" label="Loyalty Points" />}
            {restaurantFlags.is_coupon === 'Yes' && <ToggleRow field="showCouponCode" label="Coupon Code" />}
            <ToggleRow field="showWallet" label="Wallet" />
          </div>
        </div>
      )}

      {/* Order Status */}
      {activeSubTab === 'orderStatus' && (
        <div className="content-panel" data-testid="panel-order-status">
          <h3 className="section-title">
            <IoCheckmarkCircleOutline className="section-icon" />
            Order Status
          </h3>
          <p className="section-description">Control what elements are visible on the order success page</p>
          <div className="toggle-list">
            <ToggleRow field="showTableNumber" label="Table/Room Number Badge" />
            <ToggleRow field="showCallWaiter" label="Call Waiter Button" />
            <ToggleRow field="showPayBill" label="Pay Bill Button" />
            <ToggleRow field="showEstimatedTimes" label="Estimated Times on Order Status" />
            <ToggleRow field="showFoodStatus" label="Food Item Status (Preparing/Ready/Served)" />
            <ToggleRow field="showOrderStatusTracker" label="Order Status Tracker (Progress Bar)" />
          </div>
        </div>
      )}

    </div>
  );
};

export default VisibilityTab;
