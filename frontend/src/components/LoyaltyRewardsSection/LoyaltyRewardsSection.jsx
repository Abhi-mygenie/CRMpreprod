import React from 'react';
import { IoGiftOutline } from "react-icons/io5";

/**
 * LoyaltyRewardsSection — extracted from ReviewOrder.jsx (CA-008 Phase 1)
 * Consolidates 3 separate loyalty JSX blocks into one component:
 * 1. Identified customer rewards info (logged in or looked up)
 * 2. No loyalty settings fallback
 * 3. Guest prompt (no phone entered)
 */
const LoyaltyRewardsSection = ({
  configShowLoyaltyPoints,
  restaurant,
  isAuthenticated,
  user,
  lookedUpCustomer,
  loyaltySettings,
  totalToPay,
}) => {
  if (!configShowLoyaltyPoints || restaurant?.is_loyalty !== 'Yes') return null;

  const isIdentified = isAuthenticated || lookedUpCustomer;
  const isGuest = !isAuthenticated && !lookedUpCustomer;

  // Variant 1: Identified customer WITH loyalty settings
  if (isIdentified && loyaltySettings) {
    const custTier = isAuthenticated ? (user?.tier || 'Bronze') : (lookedUpCustomer?.tier || 'Bronze');
    const tier = custTier.toLowerCase();
    const earnPercent = loyaltySettings[`${tier}_earn_percent`] || loyaltySettings.bronze_earn_percent || 5;
    const billAmount = totalToPay;
    const minOrderValue = loyaltySettings.min_order_value || 100;
    const isEligible = billAmount >= minOrderValue;
    const pointsToEarn = Math.round(billAmount * (earnPercent / 100));
    const redemptionValue = loyaltySettings.redemption_value || 0.25;
    const pointsWorth = (pointsToEarn * redemptionValue).toFixed(0);
    const isNewCustomer = lookedUpCustomer && !lookedUpCustomer.found;
    const firstVisitBonus = isNewCustomer && loyaltySettings.first_visit_bonus_enabled ? loyaltySettings.first_visit_bonus_points : 0;

    return (
      <div className="review-order-user-info" data-testid="logged-in-user-info">
        <div className="user-info-content">
          <IoGiftOutline className="user-info-icon" />
          <div className="user-info-text">
            {isEligible ? (
              <>
                <span className="user-info-name">
                  You will earn {pointsToEarn} points on this order!
                </span>
                <span className="user-info-points">
                  Worth ₹{pointsWorth}{firstVisitBonus > 0 ? ` + ${firstVisitBonus} bonus points for first visit` : ''}
                </span>
              </>
            ) : (
              <>
                <span className="user-info-name">Almost there!</span>
                <span className="user-info-points">
                  Add ₹{(minOrderValue - billAmount).toFixed(0)} more to earn points
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Variant 2: Identified customer WITHOUT loyalty settings
  if (isIdentified && !loyaltySettings) {
    return (
      <div className="review-order-user-info" data-testid="logged-in-user-info">
        <div className="user-info-content">
          <IoGiftOutline className="user-info-icon" />
          <div className="user-info-text">
            <span className="user-info-name">
              Hi, {(isAuthenticated ? user?.name?.split(' ')[0] : lookedUpCustomer?.name?.split(' ')[0]) || 'there'}!
            </span>
            <span className="user-info-points">
              {(isAuthenticated ? user?.total_points : lookedUpCustomer?.total_points) || 0} points available
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Variant 3: Guest (no phone entered, not logged in) WITH loyalty settings
  if (isGuest && loyaltySettings) {
    const earnPercent = loyaltySettings.bronze_earn_percent || 5;
    const billAmount = totalToPay;
    const pointsToEarn = Math.round(billAmount * (earnPercent / 100));
    const redemptionValue = loyaltySettings.redemption_value || 0.25;
    const pointsWorth = (pointsToEarn * redemptionValue).toFixed(0);
    const minOrderValue = loyaltySettings.min_order_value || 100;
    const isEligible = billAmount >= minOrderValue;

    return (
      <div className="review-order-login-prompt" data-testid="login-rewards-prompt">
        <div className="login-prompt-content">
          <IoGiftOutline className="login-prompt-icon" />
          <div className="login-prompt-text">
            {isEligible ? (
              <>
                <span className="login-prompt-title">
                  Earn {pointsToEarn} points on this order!
                </span>
                <span className="login-prompt-subtitle">
                  Worth ₹{pointsWorth} — enter your phone number above
                </span>
              </>
            ) : (
              <>
                <span className="login-prompt-title">Earn rewards on this order!</span>
                <span className="login-prompt-subtitle">
                  Add ₹{(minOrderValue - billAmount).toFixed(0)} more to earn points
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default LoyaltyRewardsSection;
