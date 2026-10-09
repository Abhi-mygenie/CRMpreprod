import React from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { useRestaurantConfig } from '../../context/RestaurantConfigContext';
import useNotificationPopup from '../../hooks/useNotificationPopup';
import './NotificationPopup.css';

/**
 * NotificationPopup — Configurable popup for landing, review, or success pages.
 * Supports 3 variants: modal (overlay), banner (strip), toast (corner).
 * Reads config from RestaurantConfigContext automatically.
 *
 * @param {string} page - "landing" | "review" | "success"
 */
const NotificationPopup = ({ page }) => {
  const { notificationPopups, primaryColor, borderRadius } = useRestaurantConfig();
  const { popup, isVisible, dismiss, secondsRemaining } = useNotificationPopup(page, notificationPopups);
  const navigate = useNavigate();

  if (!popup || !isVisible) return null;

  const { content = {}, style = {} } = popup;
  const { title, message, imageUrl, ctaText, ctaLink, ctaAction } = content;
  const { position = 'center', type = 'modal' } = style;
  const isAutoClose = Number(popup.autoDismissSeconds || 0) > 0;

  const handleCTA = () => {
    if (!ctaAction || ctaAction === 'dismiss') {
      dismiss();
    } else if (ctaAction === 'navigate' && ctaLink) {
      dismiss();
      navigate(ctaLink);
    } else if (ctaAction === 'external_link' && ctaLink) {
      window.open(ctaLink, '_blank', 'noopener,noreferrer');
      dismiss();
    }
  };

  const btnStyle = primaryColor ? { backgroundColor: primaryColor, color: '#fff' } : {};

  // Modal variant
  if (type === 'modal') {
    // Compulsory popup: when admin sets Auto-close = 0 ("manual close with OK button"),
    // the OK button is the only allowed close path. Backdrop click and corner-X
    // must not bypass the acknowledgement. (isAutoClose true → keeps current behavior.)
    const isMandatory = !isAutoClose;
    return (
      <div
        className="np-modal-overlay"
        onClick={isMandatory ? undefined : dismiss}
        data-testid="notification-popup-modal-overlay"
      >
        <div
          className="np-modal-card"
          onClick={e => e.stopPropagation()}
          data-testid="notification-popup-modal"
        >
          {!isMandatory && (
            <button className="np-close-btn" onClick={dismiss} data-testid="notification-popup-close">
              <X size={18} />
            </button>
          )}
          {imageUrl && (
            <img
              src={imageUrl}
              alt=""
              className="np-image"
              onError={e => { e.target.style.display = 'none'; }}
              data-testid="notification-popup-image"
            />
          )}
          <h3 className="np-title" data-testid="notification-popup-title">{title}</h3>
          <p className="np-message" data-testid="notification-popup-message">{message}</p>
          {ctaText && (
            <button
              className="np-cta-btn"
              onClick={handleCTA}
              style={btnStyle}
              data-testid="notification-popup-cta"
            >
              {ctaText}
            </button>
          )}
          {isAutoClose && secondsRemaining !== null && secondsRemaining > 0 && (
            <span className="np-countdown" data-testid="notification-popup-countdown">
              Closing in {secondsRemaining}s
            </span>
          )}
          {!isAutoClose && (
            <button
              className="np-ack-btn"
              onClick={dismiss}
              data-testid="notification-popup-ok"
            >
              OK
            </button>
          )}
        </div>
      </div>
    );
  }

  // Banner variant
  if (type === 'banner') {
    return (
      <div
        className={`np-banner np-banner-${position}`}
        data-testid="notification-popup-banner"
      >
        <div className="np-banner-content">
          {imageUrl && (
            <img
              src={imageUrl}
              alt=""
              className="np-banner-image"
              onError={e => { e.target.style.display = 'none'; }}
            />
          )}
          <div className="np-banner-text">
            <strong className="np-banner-title" data-testid="notification-popup-title">{title}</strong>
            <span className="np-banner-message" data-testid="notification-popup-message">{message}</span>
          </div>
          {ctaText && (
            <button
              className="np-banner-cta"
              onClick={handleCTA}
              style={btnStyle}
              data-testid="notification-popup-cta"
            >
              {ctaText}
            </button>
          )}
        </div>
        <button className="np-banner-close" onClick={dismiss} data-testid="notification-popup-close">
          <X size={16} />
        </button>
        {secondsRemaining !== null && secondsRemaining > 0 && (
          <span className="np-countdown np-banner-countdown" data-testid="notification-popup-countdown">
            {secondsRemaining}s
          </span>
        )}
      </div>
    );
  }

  // Toast variant
  if (type === 'toast') {
    return (
      <div className="np-toast" data-testid="notification-popup-toast">
        <button className="np-toast-close" onClick={dismiss} data-testid="notification-popup-close">
          <X size={14} />
        </button>
        {imageUrl && (
          <img
            src={imageUrl}
            alt=""
            className="np-toast-image"
            onError={e => { e.target.style.display = 'none'; }}
          />
        )}
        <strong className="np-toast-title" data-testid="notification-popup-title">{title}</strong>
        <p className="np-toast-message" data-testid="notification-popup-message">{message}</p>
        {ctaText && (
          <button
            className="np-toast-cta"
            onClick={handleCTA}
            style={btnStyle}
            data-testid="notification-popup-cta"
          >
            {ctaText}
          </button>
        )}
        {secondsRemaining !== null && secondsRemaining > 0 && (
          <span className="np-countdown" data-testid="notification-popup-countdown">
            {secondsRemaining}s
          </span>
        )}
      </div>
    );
  }

  return null;
};

export default NotificationPopup;
