import React from 'react';
import { IoFlameOutline, IoNutritionOutline, IoWarningOutline, IoInformationCircleOutline } from 'react-icons/io5';
import QuantitySelector from '../QuantitySelector/QuantitySelector';
import { isItemAvailable } from '../../utils/itemAvailability';
import { isItemAllowedForChannel } from '../../utils/channelEligibility';
import './MenuItem.css';
import logger from '../../utils/logger';

const MenuItem = ({
  item,
  isExpanded,
  descriptionLimit,
  onToggleDescription,
  getAllergenIcon,
  quantity = 0,
  isInCart = false,
  onAddToCart,
  onIncrement,
  onDecrement,
  currentTimeInSeconds = 0,
  isOnlineOrderEnabled = true,
  categoryTiming = null,
  itemTiming = null,
  orderType = null,
}) => {
  const shouldTruncate = item.description && item.description.length > descriptionLimit;
  const displayDescription = isExpanded || !shouldTruncate
    ? item.description
    : `${item.description.substring(0, descriptionLimit)}...`;

  // Determine if we have a valid REAL image (not a POS-side default placeholder).
  // The POS API returns a hard-coded default URL for items without real photos:
  //   https://preprod.mygenie.online/public/assets/admin/img/.../food-default-image.png
  // These should be treated as "no image" so we render the compact card.
  const isPosDefaultImage = (url) =>
    typeof url === 'string' &&
    /\/admin\/img\/.*food-default-image/i.test(url);
  const hasImage = item.image
    && typeof item.image === 'string'
    && item.image.trim() !== ''
    && !isPosDefaultImage(item.image);

  // Check if item is customizable (has variations or add_ons)
  const isCustomizable = (item.variations && item.variations.length > 0) ||
    (item.add_ons && item.add_ons.length > 0);

  // Check if item is available based on live_web, admin timings, and POS time range
  const isAvailable = isItemAvailable(item, currentTimeInSeconds, { categoryTiming, itemTiming });

  // CR A-1: Channel eligibility — defense-in-depth in addition to MenuItems.jsx
  // page-level filter. Items disallowed for the active orderType have ADD hidden.
  // Permissive default: when orderType is null/unknown, item is allowed.
  const isChannelAllowed = isItemAllowedForChannel(item, orderType);

  // CR-2026-09-07-001: Stock-out state (Layer 1 render).
  const isStockOut = item.stock_out === 'Y';
  const isLowStock = !isStockOut && item.food_stock !== null && item.food_stock > 0 && item.food_stock <= 3;

  const handleImageError = (e) => {
    // Hide the failed image
    e.target.style.display = 'none';
    // Show the default placeholder if it exists
    const placeholder = e.target.parentElement?.querySelector('.item-image-placeholder');
    if (placeholder) {
      placeholder.style.display = 'flex';
    }
  };

  // ─── Reusable JSX blocks ──────────────────────────────────────────────────
  // Veg/Name/Price header — used in BOTH image and no-image layouts.
  const headerBlock = (
    <>
      <span className={`veg-label ${item.isEgg ? 'egg' : item.isVeg ? 'veg' : 'non-veg'}`}>
        <span className="veg-dot"></span>
      </span>
      <h3 className="item-name">{item.name}</h3>
      <div className="item-price">₹{item.price}</div>
    </>
  );

  // Optional metadata (kcal / portion / allergens / description with Read More).
  // Hidden when none has content. Rendered inside `.item-content` for image
  // cards (matches existing layout) and inside `.item-content-meta` below the
  // main row for no-image cards (so ADD aligns with name+price, not metadata).
  const showsKcal      = item.kcal && parseFloat(item.kcal) > 0;
  const showsPortion   = item.portion && parseFloat(item.portion) > 0;
  const showsAllergens = item.allergens && item.allergens.length > 0;
  const hasMeta = showsKcal || showsPortion || showsAllergens || !!displayDescription;

  const metaBlock = (
    <>
      {showsKcal && (
        <div className="item-allergens">
          <span className="allergen-icon-wrapper">
            <IoFlameOutline className="item-info-icon" />
          </span>
          <span className="kcal-name">
            {item.kcal} kcal
          </span>
        </div>
      )}

      {showsPortion && (
        <div className="item-allergens">
          <span className="allergen-icon-wrapper">
            <IoNutritionOutline className="item-info-icon" />
          </span>
          <span className="portion-name">
            {item.portion}
          </span>
        </div>
      )}

      {showsAllergens && (
        <div className="item-allergens">
          <span className="allergen-icon-wrapper">
            <IoWarningOutline className="item-info-icon" />
          </span>
          <span className="allergen-name">
            Contains: {item.allergens
              .map((allergen) => allergen.charAt(0).toUpperCase() + allergen.slice(1).toLowerCase())
              .join(', ')}
          </span>
        </div>
      )}

      {displayDescription && (
        <div className="item-allergens">
          <span className="allergen-icon-wrapper">
            <IoInformationCircleOutline className="item-info-icon" />
          </span>
          <div className="item-description-wrapper">
            <p className="item-description">
              {displayDescription}
              {shouldTruncate && (
                <button
                  className="read-more-btn"
                  onClick={() => onToggleDescription(item.id)}
                >
                  {isExpanded ? 'Read Less' : 'Read More'}
                </button>
              )}
            </p>
          </div>
        </div>
      )}
    </>
  );

  // Action area (ADD or QuantitySelector + Customisable pill) — used in
  // no-image layout only. Image-mode keeps its inline absolute ADD inside
  // the image-box (unchanged below).
  const actionArea = (
    <div className="item-action-area">
      {isInCart ? (
        <QuantitySelector
          quantity={quantity}
          onIncrement={onIncrement}
          onDecrement={onDecrement}
        />
      ) : isStockOut ? (
        <div className="sold-out-badge" data-testid="menu-item-sold-out-badge">
          Sold Out
        </div>
      ) : isAvailable && isOnlineOrderEnabled ? (
        <button className="add-btn add-btn--inline" onClick={onAddToCart}>
          ADD
        </button>
      ) : null}
      {isLowStock && !isInCart && (
        <div className="low-stock-badge" data-testid="menu-item-low-stock-badge">
          Only {item.food_stock} left
        </div>
      )}
      {isCustomizable && (
        <div className="customisable-indicator customisable-indicator--inline">
          Customisable
        </div>
      )}
    </div>
  );

  return (
    <div className={`menu-item ${!hasImage ? 'menu-item--no-image' : ''}`}>
      {hasImage ? (
        <>
          {/* IMAGE-PRESENT LAYOUT — UNCHANGED from prior version */}
          <div className="item-content">
            {headerBlock}
            {metaBlock}
          </div>

          {/* Image Box Container with Customisable Text */}
          <div className="item-image-container">
            <div className="item-image-box">
              <img
                src={item.image}
                alt={item.name}
                className={`item-image${isStockOut ? ' item-image--sold-out' : ''}`}
                loading="lazy"
                decoding="async"
                onError={handleImageError}
              />
              {/* Hidden default placeholder for fallback (image fails to load) */}
              <div className="item-image-placeholder" style={{ display: 'none' }}>
                <img
                  src={
                    item.isEgg
                      ? '/assets/images/E_Food_Img.svg'
                      : item.isVeg
                        ? '/assets/images/V_FOOD_IMG.svg'
                        : '/assets/images/NV_FOOD_IMG.svg'
                  }
                  alt={
                    item.isEgg
                      ? 'Egg Food'
                      : item.isVeg
                        ? 'Veg Food'
                        : 'Non-Veg Food'
                  }
                  className="default-food-icon"
                />
              </div>

              {isInCart ? (
                <QuantitySelector
                  quantity={quantity}
                  onIncrement={onIncrement}
                  onDecrement={onDecrement}
                />
              ) : isStockOut ? (
                <div className="sold-out-badge sold-out-badge--overlay" data-testid="menu-item-sold-out-badge">
                  Sold Out
                </div>
              ) : isAvailable && isOnlineOrderEnabled && isChannelAllowed ? (
                <button className="add-btn" onClick={onAddToCart}>
                  ADD
                </button>
              ) : null}
            </div>

            {isCustomizable && (
              <div className="customisable-indicator">
                Customisable
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          {/* NO-IMAGE LAYOUT — Hybrid (Option C):
              Card is a top-level flex row.
              Left: header (veg/name/price) + optional meta stacked.
              Right: action column spans full card height with ADD vertically
              centered against the entire left content. */}
          <div className="item-content-main">
            {headerBlock}
            {hasMeta && (
              <div className="item-content-meta">
                {metaBlock}
              </div>
            )}
          </div>
          {actionArea}
        </>
      )}
    </div>
  );
};

export default MenuItem;
