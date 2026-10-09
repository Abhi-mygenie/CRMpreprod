import React, { useRef, useState } from 'react';
import { useAdminConfig } from '../../context/AdminConfigContext';
import { IoSettingsOutline, IoCloudUploadOutline, IoTimeOutline, IoAddCircleOutline, IoTrashOutline, IoCardOutline, IoWalletOutline, IoNotificationsOutline } from 'react-icons/io5';
import './AdminPages.css';

const AdminSettingsPage = () => {
  const { config, updateField, uploadImage, loading } = useAdminConfig();
  const logoInputRef = useRef(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    const url = await uploadImage(file);
    if (url) updateField('logoUrl', url);
    setUploadingLogo(false);
    e.target.value = '';
  };

  if (loading) {
    return <div className="admin-loading">Loading settings...</div>;
  }

  return (
    <div className="admin-page" data-testid="admin-settings-page">
      <h1 className="admin-page-title">
        <IoSettingsOutline /> Settings
      </h1>
      <p className="admin-page-description">
        Configure your restaurant's basic settings and appearance
      </p>

      {/* Logo Section */}
      <div className="admin-section">
        <h2 className="admin-section-title">Restaurant Logo</h2>
        
        <div className="admin-form-grid">
          <div className="admin-form-group">
            <label className="admin-form-label">Logo URL</label>
            <div className="admin-input-with-btn">
              <input
                type="url"
                className="admin-form-input"
                placeholder="https://example.com/logo.png"
                value={config.logoUrl || ''}
                onChange={(e) => updateField('logoUrl', e.target.value)}
                data-testid="input-logoUrl"
              />
              <input
                type="file"
                ref={logoInputRef}
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleLogoUpload}
              />
              <button
                type="button"
                className="admin-upload-btn"
                onClick={() => logoInputRef.current?.click()}
                disabled={uploadingLogo}
                data-testid="upload-logo-btn"
              >
                <IoCloudUploadOutline />
                {uploadingLogo ? 'Uploading...' : 'Upload'}
              </button>
            </div>
            <span className="admin-form-hint">Paste a URL or upload an image (max 5MB)</span>
          </div>

          <div className="admin-form-group">
            <label className="admin-form-label">Preview</label>
            {config.logoUrl ? (
              <div className="admin-image-preview-box">
                <img
                  src={config.logoUrl}
                  alt="Logo preview"
                  className="admin-image-preview"
                  onError={(e) => e.target.style.display = 'none'}
                />
              </div>
            ) : (
              <div className="admin-image-placeholder">No logo uploaded</div>
            )}
          </div>
        </div>
      </div>

      {/* Welcome Message Section */}
      <div className="admin-section">
        <h2 className="admin-section-title">Landing Page Text</h2>
        
        <div className="admin-form-grid">
          <div className="admin-form-group">
            <label className="admin-form-label">Welcome Message</label>
            <input
              type="text"
              className="admin-form-input"
              placeholder="Welcome to our restaurant!"
              value={config.welcomeMessage || ''}
              onChange={(e) => updateField('welcomeMessage', e.target.value)}
              data-testid="input-welcomeMessage"
            />
            <span className="admin-form-hint">Main heading shown on landing page</span>
          </div>

          <div className="admin-form-group">
            <label className="admin-form-label">Tagline</label>
            <input
              type="text"
              className="admin-form-input"
              placeholder="Your tagline here"
              value={config.tagline || ''}
              onChange={(e) => updateField('tagline', e.target.value)}
              data-testid="input-tagline"
            />
            <span className="admin-form-hint">Secondary text shown below welcome message</span>
          </div>

          <div className="admin-form-group full-width">
            <label className="admin-form-label">Browse Menu Button Text</label>
            <input
              type="text"
              className="admin-form-input"
              placeholder="Browse Menu"
              value={config.browseMenuButtonText || ''}
              onChange={(e) => updateField('browseMenuButtonText', e.target.value)}
              data-testid="input-browseMenuButtonText"
            />
            <span className="admin-form-hint">Label for the main button on the landing page</span>
          </div>
        </div>
      </div>

      {/* Order Success Page Text Section */}
      <div className="admin-section">
        <h2 className="admin-section-title">Order Success Page Text</h2>

        <div className="admin-form-grid">
          <div className="admin-form-group">
            <label className="admin-form-label">Order Success — Title</label>
            <input
              type="text"
              className="admin-form-input"
              placeholder="Order Placed!"
              value={config.successTitle || ''}
              onChange={(e) => updateField('successTitle', e.target.value)}
              data-testid="input-successTitle"
            />
            <span className="admin-form-hint">Shown as the headline on the Order Success page. Leave blank to use default ("Order Placed!").</span>
          </div>

          <div className="admin-form-group">
            <label className="admin-form-label">Order Success — Message</label>
            <input
              type="text"
              className="admin-form-input"
              placeholder="Your order is being processed"
              value={config.successMessage || ''}
              onChange={(e) => updateField('successMessage', e.target.value)}
              data-testid="input-successMessage"
            />
            <span className="admin-form-hint">Shown below the headline. Leave blank to use default ("Your order is being processed").</span>
          </div>
        </div>
      </div>

      {/* Operating Shifts Section */}
      <div className="admin-section">
        <h2 className="admin-section-title">
          <IoTimeOutline /> Restaurant Operating Shifts
        </h2>
        <p className="admin-form-hint" style={{ marginBottom: '16px' }}>
          Define up to 4 shifts. The "Add to cart" button is only visible when restaurant is open and within active shifts.
        </p>

        <div className="admin-master-toggle-row" data-testid="restaurant-open-toggle-row">
          <div className="admin-master-toggle-info">
            <span className="admin-master-toggle-label">Restaurant Open</span>
            <span className="admin-form-hint">Master switch — when OFF, the "Add" button is hidden for all customers</span>
          </div>
          <label className="admin-master-toggle-switch" data-testid="restaurant-open-toggle">
            <input
              type="checkbox"
              checked={config.restaurantOpen !== false}
              onChange={(e) => updateField('restaurantOpen', e.target.checked)}
            />
            <span className="admin-master-toggle-knob"></span>
          </label>
        </div>

        <div style={{ opacity: config.restaurantOpen !== false ? 1 : 0.5, pointerEvents: config.restaurantOpen !== false ? 'auto' : 'none' }}>
        {(config.restaurantShifts || [{ start: '06:00', end: '03:00' }]).map((shift, index) => (
          <div key={index} className="admin-shift-row" data-testid={`shift-row-${index}`}>
            <span className="admin-shift-label">Shift {index + 1}</span>
            <div className="admin-form-group">
              <label className="admin-form-label">Start</label>
              <input
                type="time"
                className="admin-form-input"
                value={shift.start || ''}
                onChange={(e) => {
                  const shifts = [...(config.restaurantShifts || [{ start: '06:00', end: '03:00' }])];
                  shifts[index] = { ...shifts[index], start: e.target.value };
                  updateField('restaurantShifts', shifts);
                }}
                data-testid={`shift-${index}-start`}
              />
            </div>
            <div className="admin-form-group">
              <label className="admin-form-label">End</label>
              <input
                type="time"
                className="admin-form-input"
                value={shift.end || ''}
                onChange={(e) => {
                  const shifts = [...(config.restaurantShifts || [{ start: '06:00', end: '03:00' }])];
                  shifts[index] = { ...shifts[index], end: e.target.value };
                  updateField('restaurantShifts', shifts);
                }}
                data-testid={`shift-${index}-end`}
              />
            </div>
            {(config.restaurantShifts || []).length > 1 && (
              <button
                type="button"
                className="admin-shift-remove-btn"
                onClick={() => {
                  const shifts = [...(config.restaurantShifts || [])];
                  shifts.splice(index, 1);
                  updateField('restaurantShifts', shifts);
                }}
                data-testid={`shift-${index}-remove`}
              >
                <IoTrashOutline />
              </button>
            )}
          </div>
        ))}

        {(config.restaurantShifts || [{ start: '06:00', end: '03:00' }]).length < 4 && (
          <button
            type="button"
            className="admin-add-shift-btn"
            onClick={() => {
              const shifts = [...(config.restaurantShifts || [{ start: '06:00', end: '03:00' }])];
              shifts.push({ start: '', end: '' });
              updateField('restaurantShifts', shifts);
            }}
            data-testid="add-shift-btn"
          >
            <IoAddCircleOutline /> Add Shift
          </button>
        )}
        </div>
      </div>

      {/* CR-2026-08-06-001: Channel Hours — per-channel time control */}
      <div className="admin-section" data-testid="channel-hours-section">
        <h2 className="admin-section-title">
          <IoTimeOutline /> Channel Hours
        </h2>
        <p className="admin-form-hint" style={{ marginBottom: '16px' }}>
          Set specific hours per ordering channel. Leave blank to use global shifts above.
          Blank + no global shifts = open 24/7.
        </p>
        {[
          { key: 'deliveryShifts', label: 'Delivery',     testId: 'delivery' },
          { key: 'takeawayShifts', label: 'Takeaway',     testId: 'takeaway' },
          { key: 'dineInShifts',   label: 'Dine-in',      testId: 'dinein'   },
          { key: 'roomShifts',     label: 'Room Service', testId: 'room'     },
          { key: 'walkinShifts',   label: 'Walk-in',      testId: 'walkin'   },
        ].map(({ key, label, testId }) => {
          const shift = (config[key] && config[key][0]) || { start: '', end: '' };
          return (
            <div key={key} className="admin-shift-row" data-testid={`channel-${testId}-row`}>
              <span className="admin-shift-label" style={{ minWidth: '100px' }}>{label}</span>
              <div className="admin-form-group">
                <label className="admin-form-label">Open</label>
                <input
                  type="time"
                  className="admin-form-input"
                  value={shift.start || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) {
                      updateField(key, null);
                    } else {
                      updateField(key, [{ start: val, end: shift.end || '' }]);
                    }
                  }}
                  data-testid={`channel-${testId}-start`}
                />
              </div>
              <div className="admin-form-group">
                <label className="admin-form-label">Close</label>
                <input
                  type="time"
                  className="admin-form-input"
                  value={shift.end || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) {
                      updateField(key, null);
                    } else {
                      updateField(key, [{ start: shift.start || '', end: val }]);
                    }
                  }}
                  data-testid={`channel-${testId}-end`}
                />
              </div>
              {config[key] && (
                <button
                  type="button"
                  className="admin-shift-remove-btn"
                  onClick={() => updateField(key, null)}
                  data-testid={`channel-${testId}-clear`}
                  title="Clear (use global shifts)"
                >
                  <IoTrashOutline />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Payment Options Section (FEAT-001) */}
      <div className="admin-section" data-testid="payment-settings-section">
        <h2 className="admin-section-title">
          <IoCardOutline /> Payment Options
        </h2>
        <p className="admin-form-hint" style={{ marginBottom: '16px' }}>
          Configure how customers can pay for their orders
        </p>

        {/* COD Toggle */}
        <div className="admin-master-toggle-row" data-testid="cod-enabled-toggle-row">
          <div className="admin-master-toggle-info">
            <span className="admin-master-toggle-label">
              <IoWalletOutline style={{ marginRight: '8px', verticalAlign: 'middle' }} />
              Cash on Delivery (COD)
            </span>
            <span className="admin-form-hint">Allow customers to pay at counter/billing</span>
          </div>
          <label className="admin-master-toggle-switch" data-testid="cod-enabled-toggle">
            <input
              type="checkbox"
              checked={config.codEnabled === true}
              onChange={(e) => updateField('codEnabled', e.target.checked)}
            />
            <span className="admin-master-toggle-knob"></span>
          </label>
        </div>

        {/* Online Payment Section */}
        <div className="admin-subsection">
          <h3 className="admin-subsection-title">
            <IoCardOutline style={{ marginRight: '8px', verticalAlign: 'middle' }} />
            Online Payment by Order Type
          </h3>
          <p className="admin-form-hint" style={{ marginBottom: '12px' }}>
            Enable online payment (Razorpay) for specific order types
          </p>

          <div className="admin-toggle-list">
            <div className="admin-toggle-row" data-testid="online-dinein-toggle-row">
              <span className="admin-toggle-label">Dine-in Orders</span>
              <label className="admin-master-toggle-switch" data-testid="online-dinein-toggle">
                <input
                  type="checkbox"
                  checked={config.onlinePaymentDinein !== false}
                  onChange={(e) => updateField('onlinePaymentDinein', e.target.checked)}
                />
                <span className="admin-master-toggle-knob"></span>
              </label>
            </div>

            <div className="admin-toggle-row" data-testid="online-takeaway-toggle-row">
              <span className="admin-toggle-label">Takeaway Orders</span>
              <label className="admin-master-toggle-switch" data-testid="online-takeaway-toggle">
                <input
                  type="checkbox"
                  checked={config.onlinePaymentTakeaway !== false}
                  onChange={(e) => updateField('onlinePaymentTakeaway', e.target.checked)}
                />
                <span className="admin-master-toggle-knob"></span>
              </label>
            </div>

            <div className="admin-toggle-row" data-testid="online-delivery-toggle-row">
              <span className="admin-toggle-label">Delivery Orders</span>
              <label className="admin-master-toggle-switch" data-testid="online-delivery-toggle">
                <input
                  type="checkbox"
                  checked={config.onlinePaymentDelivery !== false}
                  onChange={(e) => updateField('onlinePaymentDelivery', e.target.checked)}
                />
                <span className="admin-master-toggle-knob"></span>
              </label>
            </div>
          </div>
        </div>

        {/* Custom Labels Section */}
        <div className="admin-subsection">
          <h3 className="admin-subsection-title">Custom Labels</h3>
          <p className="admin-form-hint" style={{ marginBottom: '12px' }}>
            Customize the text shown on payment options (leave blank for defaults)
          </p>

          <div className="admin-form-grid">
            <div className="admin-form-group">
              <label className="admin-form-label">Online Payment Label</label>
              <input
                type="text"
                className="admin-form-input"
                placeholder="Pay Online"
                value={config.payOnlineLabel || ''}
                onChange={(e) => updateField('payOnlineLabel', e.target.value)}
                maxLength={30}
                data-testid="input-payOnlineLabel"
              />
              <span className="admin-form-hint">e.g., "UPI/Card", "Pay Now"</span>
            </div>

            <div className="admin-form-group">
              <label className="admin-form-label">COD Label</label>
              <input
                type="text"
                className="admin-form-input"
                placeholder="Pay at Counter"
                value={config.payAtCounterLabel || ''}
                onChange={(e) => updateField('payAtCounterLabel', e.target.value)}
                maxLength={30}
                data-testid="input-payAtCounterLabel"
              />
              <span className="admin-form-hint">e.g., "Cash", "Pay Later"</span>
            </div>
          </div>
        </div>

        {/* Info Note */}
        <div className="admin-info-note" data-testid="payment-info-note">
          <span className="admin-info-icon">ℹ️</span>
          <span>Online payment requires Razorpay configuration. Contact support if you need to set up Razorpay for your restaurant.</span>
        </div>
      </div>

      {/* Notification Popups Section (FEAT-003) */}
      <div className="admin-section" data-testid="notification-popup-settings">
        <h2 className="admin-section-title">
          <IoNotificationsOutline /> Notification Popups
        </h2>
        <p className="admin-section-description">
          Configure popups that appear on customer-facing pages. One popup per page (Landing, Review, Success).
        </p>

        {(config.notificationPopups || []).map((popup, index) => {
          const content = popup.content || {};
          const style = popup.style || {};

          const updatePopup = (field, value) => {
            const updated = [...(config.notificationPopups || [])];
            updated[index] = { ...updated[index], [field]: value };
            updateField('notificationPopups', updated);
          };
          const updateContent = (field, value) => {
            const updated = [...(config.notificationPopups || [])];
            updated[index] = { ...updated[index], content: { ...content, [field]: value } };
            updateField('notificationPopups', updated);
          };
          const updateStyle = (field, value) => {
            const updated = [...(config.notificationPopups || [])];
            updated[index] = { ...updated[index], style: { ...style, [field]: value } };
            updateField('notificationPopups', updated);
          };

          return (
            <div key={popup.id || index} className="np-admin-card" data-testid={`popup-card-${index}`}>
              {/* Card Header */}
              <div className="np-admin-header">
                <div className="np-admin-header-left">
                  <select
                    className="np-admin-page-select"
                    value={popup.showOn || 'landing'}
                    onChange={(e) => updatePopup('showOn', e.target.value)}
                    data-testid={`popup-showOn-${index}`}
                  >
                    <option value="landing">Landing Page</option>
                    <option value="menu">Menu Page</option>
                    <option value="review">Review Order</option>
                    <option value="success">Order Success</option>
                  </select>
                </div>
                <div className="np-admin-header-right">
                  <label className="np-admin-toggle" data-testid={`popup-enabled-${index}`}>
                    <input
                      type="checkbox"
                      checked={popup.enabled || false}
                      onChange={(e) => updatePopup('enabled', e.target.checked)}
                    />
                    <span className="np-admin-toggle-track">
                      <span className="np-admin-toggle-knob" />
                    </span>
                    <span className={`np-admin-toggle-text ${popup.enabled ? 'active' : ''}`}>
                      {popup.enabled ? 'ON' : 'OFF'}
                    </span>
                  </label>
                  <button
                    className="np-admin-delete-btn"
                    onClick={() => {
                      const updated = (config.notificationPopups || []).filter((_, i) => i !== index);
                      updateField('notificationPopups', updated);
                    }}
                    data-testid={`popup-delete-${index}`}
                  >
                    <IoTrashOutline />
                  </button>
                </div>
              </div>

              {/* Content Section */}
              <div className="np-admin-group">
                <div className="np-admin-group-label">Content</div>
                <div className="np-admin-field">
                  <label className="np-admin-label">Title <span className="np-admin-required">*</span></label>
                  <input
                    type="text"
                    className="np-admin-input"
                    value={content.title || ''}
                    onChange={(e) => updateContent('title', e.target.value)}
                    placeholder="e.g., Welcome Offer!"
                    data-testid={`popup-title-${index}`}
                  />
                </div>
                <div className="np-admin-field">
                  <label className="np-admin-label">Message <span className="np-admin-required">*</span></label>
                  <textarea
                    className="np-admin-input np-admin-textarea"
                    rows={3}
                    value={content.message || ''}
                    onChange={(e) => updateContent('message', e.target.value)}
                    placeholder="e.g., Get 15% off your first order"
                    data-testid={`popup-message-${index}`}
                  />
                </div>
                <div className="np-admin-field">
                  <label className="np-admin-label">Image URL <span className="np-admin-optional">(optional)</span></label>
                  <input
                    type="text"
                    className="np-admin-input"
                    value={content.imageUrl || ''}
                    onChange={(e) => updateContent('imageUrl', e.target.value)}
                    placeholder="/api/uploads/promo.png or https://..."
                    data-testid={`popup-imageUrl-${index}`}
                  />
                </div>
                <div className="np-admin-field">
                  <label className="np-admin-label">Button Text <span className="np-admin-optional">(optional — leave empty for no button)</span></label>
                  <input
                    type="text"
                    className="np-admin-input"
                    value={content.ctaText || ''}
                    onChange={(e) => updateContent('ctaText', e.target.value)}
                    placeholder="e.g., Order Now"
                    data-testid={`popup-ctaText-${index}`}
                  />
                </div>
                {content.ctaText && (
                  <div className="np-admin-row-2col">
                    <div className="np-admin-field">
                      <label className="np-admin-label">Button Link</label>
                      <input
                        type="text"
                        className="np-admin-input"
                        value={content.ctaLink || ''}
                        onChange={(e) => updateContent('ctaLink', e.target.value)}
                        placeholder="/menu or https://..."
                        data-testid={`popup-ctaLink-${index}`}
                      />
                    </div>
                    <div className="np-admin-field">
                      <label className="np-admin-label">Button Action</label>
                      <select
                        className="np-admin-input np-admin-select"
                        value={content.ctaAction || 'navigate'}
                        onChange={(e) => updateContent('ctaAction', e.target.value)}
                        data-testid={`popup-ctaAction-${index}`}
                      >
                        <option value="navigate">Navigate (same tab)</option>
                        <option value="dismiss">Just Close Popup</option>
                        <option value="external_link">Open Link (new tab)</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Display & Timing Row */}
              <div className="np-admin-row-2col">
                {/* Display Section */}
                <div className="np-admin-group">
                  <div className="np-admin-group-label">Display</div>
                  <div className="np-admin-field">
                    <label className="np-admin-label">Type</label>
                    <div className="np-admin-type-options">
                      {[
                        { value: 'modal', label: 'Modal', icon: '▣' },
                        { value: 'banner', label: 'Banner', icon: '▬' },
                        { value: 'toast', label: 'Toast', icon: '▢' },
                      ].map(opt => (
                        <button
                          key={opt.value}
                          className={`np-admin-type-btn ${(style.type || 'modal') === opt.value ? 'active' : ''}`}
                          onClick={() => updateStyle('type', opt.value)}
                          data-testid={`popup-type-${opt.value}-${index}`}
                        >
                          <span className="np-admin-type-icon">{opt.icon}</span>
                          <span>{opt.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="np-admin-field">
                    <label className="np-admin-label">Position</label>
                    <div className="np-admin-position-options">
                      {['top', 'center', 'bottom'].map(pos => (
                        <button
                          key={pos}
                          className={`np-admin-position-btn ${(style.position || 'center') === pos ? 'active' : ''}`}
                          onClick={() => updateStyle('position', pos)}
                          data-testid={`popup-position-${pos}-${index}`}
                        >
                          <div className="np-admin-position-preview">
                            <div className={`np-admin-position-bar np-admin-position-bar-${pos}`} />
                          </div>
                          <span>{pos.charAt(0).toUpperCase() + pos.slice(1)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Timing Section */}
                <div className="np-admin-group">
                  <div className="np-admin-group-label">Timing</div>
                  <div className="np-admin-field">
                    <label className="np-admin-label">Show after</label>
                    <div className="np-admin-input-suffix">
                      <input
                        type="number"
                        className="np-admin-input np-admin-input-num"
                        min={1}
                        max={30}
                        value={popup.delaySeconds || 3}
                        onChange={(e) => updatePopup('delaySeconds', parseInt(e.target.value) || 3)}
                        data-testid={`popup-delay-${index}`}
                      />
                      <span className="np-admin-suffix">seconds</span>
                    </div>
                  </div>
                  <div className="np-admin-field">
                    <label className="np-admin-label">Auto-close after</label>
                    <div className="np-admin-input-suffix">
                      <input
                        type="number"
                        className="np-admin-input np-admin-input-num"
                        min={0}
                        max={60}
                        value={popup.autoDismissSeconds || 0}
                        onChange={(e) => updatePopup('autoDismissSeconds', parseInt(e.target.value) || 0)}
                        data-testid={`popup-autodismiss-${index}`}
                      />
                      <span className="np-admin-suffix">seconds</span>
                    </div>
                    <span className="np-admin-hint">0 = manual close with OK button instead of countdown</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* Add Popup Button (max 3) */}
        {(config.notificationPopups || []).length < 4 && (
          <button
            className="admin-add-btn"
            onClick={() => {
              const existing = config.notificationPopups || [];
              const usedPages = existing.map(p => p.showOn);
              const availablePages = ['landing', 'menu', 'review', 'success'].filter(p => !usedPages.includes(p));
              const newPopup = {
                id: `popup-${Date.now()}`,
                enabled: false,
                showOn: availablePages[0] || 'landing',
                delaySeconds: 3,
                autoDismissSeconds: 0,
                content: { title: '', message: '' },
                style: { position: 'center', type: 'modal' }
              };
              updateField('notificationPopups', [...existing, newPopup]);
            }}
            data-testid="popup-add-btn"
          >
            <IoAddCircleOutline /> Add Popup
          </button>
        )}
      </div>
    </div>
  );
};

export default AdminSettingsPage;
