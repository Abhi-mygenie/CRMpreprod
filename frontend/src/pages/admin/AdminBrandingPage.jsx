import React, { useRef, useState } from 'react';
import { useAdminConfig } from '../../context/AdminConfigContext';
import { IoColorPaletteOutline, IoCloudUploadOutline } from 'react-icons/io5';
import { DEFAULT_THEME } from '../../constants/theme';
import './AdminPages.css';

const AdminBrandingPage = () => {
  const { config, updateField, uploadImage, loading } = useAdminConfig();
  const backgroundInputRef = useRef(null);
  const mobileBackgroundInputRef = useRef(null);
  const [uploadingBg, setUploadingBg] = useState(false);
  const [uploadingMobileBg, setUploadingMobileBg] = useState(false);

  const handleBackgroundUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingBg(true);
    const url = await uploadImage(file);
    if (url) updateField('backgroundImageUrl', url);
    setUploadingBg(false);
    e.target.value = '';
  };

  const handleMobileBackgroundUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingMobileBg(true);
    const url = await uploadImage(file);
    if (url) updateField('mobileBackgroundImageUrl', url);
    setUploadingMobileBg(false);
    e.target.value = '';
  };

  if (loading) {
    return <div className="admin-loading">Loading branding settings...</div>;
  }

  const radiusOptions = [
    { value: 'sharp', label: 'Sharp', preview: '0px' },
    { value: 'slightly-rounded', label: 'Slight', preview: '4px' },
    { value: 'rounded', label: 'Rounded', preview: '8px' },
    { value: 'very-rounded', label: 'Very Rounded', preview: '16px' },
    { value: 'pill', label: 'Pill', preview: '9999px' },
  ];

  const fontOptions = [
    'Big Shoulders', 'Montserrat', 'Poppins', 'Roboto', 'Open Sans', 
    'Playfair Display', 'Lato', 'Inter', 'Nunito'
  ];

  return (
    <div className="admin-page" data-testid="admin-branding-page">
      <h1 className="admin-page-title">
        <IoColorPaletteOutline /> Branding
      </h1>
      <p className="admin-page-description">
        Customize your restaurant's colors, fonts, and images
      </p>

      {/* Background Images Section */}
      <div className="admin-section">
        <h2 className="admin-section-title">Background Images</h2>
        
        <div className="admin-form-grid">
          {/* Desktop Background */}
          <div className="admin-form-group">
            <label className="admin-form-label">Desktop Background</label>
            <div className="admin-input-with-btn">
              <input
                type="url"
                className="admin-form-input"
                placeholder="https://example.com/background.jpg"
                value={config.backgroundImageUrl || ''}
                onChange={(e) => updateField('backgroundImageUrl', e.target.value)}
                data-testid="input-backgroundImageUrl"
              />
              <input
                type="file"
                ref={backgroundInputRef}
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleBackgroundUpload}
              />
              <button
                type="button"
                className="admin-upload-btn"
                onClick={() => backgroundInputRef.current?.click()}
                disabled={uploadingBg}
              >
                <IoCloudUploadOutline />
                {uploadingBg ? 'Uploading...' : 'Upload'}
              </button>
            </div>
            {config.backgroundImageUrl && (
              <div className="admin-image-preview-box" style={{ marginTop: '12px' }}>
                <img src={config.backgroundImageUrl} alt="Background" className="admin-image-preview" />
                <button className="admin-remove-btn" onClick={() => updateField('backgroundImageUrl', '')}>
                  Remove
                </button>
              </div>
            )}
          </div>

          {/* Mobile Background */}
          <div className="admin-form-group">
            <label className="admin-form-label">Mobile Background <span className="admin-label-hint">(9:16 ratio)</span></label>
            <div className="admin-input-with-btn">
              <input
                type="url"
                className="admin-form-input"
                placeholder="https://example.com/mobile-bg.jpg"
                value={config.mobileBackgroundImageUrl || ''}
                onChange={(e) => updateField('mobileBackgroundImageUrl', e.target.value)}
                data-testid="input-mobileBackgroundImageUrl"
              />
              <input
                type="file"
                ref={mobileBackgroundInputRef}
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleMobileBackgroundUpload}
              />
              <button
                type="button"
                className="admin-upload-btn"
                onClick={() => mobileBackgroundInputRef.current?.click()}
                disabled={uploadingMobileBg}
              >
                <IoCloudUploadOutline />
                {uploadingMobileBg ? 'Uploading...' : 'Upload'}
              </button>
            </div>
            <span className="admin-form-hint">Falls back to desktop image if not set</span>
            {config.mobileBackgroundImageUrl && (
              <div className="admin-image-preview-box" style={{ marginTop: '12px' }}>
                <img src={config.mobileBackgroundImageUrl} alt="Mobile Background" className="admin-image-preview" />
                <button className="admin-remove-btn" onClick={() => updateField('mobileBackgroundImageUrl', '')}>
                  Remove
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Colors Section */}
      <div className="admin-section">
        <h2 className="admin-section-title">Colors</h2>
        
        <div className="admin-form-grid three-col">
          {[
            { key: 'primaryColor', label: 'Primary Color', hint: 'Buttons, links, accents', default: DEFAULT_THEME.primaryColor },
            { key: 'secondaryColor', label: 'Secondary Color', hint: 'Hover states, gradients', default: DEFAULT_THEME.secondaryColor },
            { key: 'buttonTextColor', label: 'Button Text', hint: 'Text on buttons', default: DEFAULT_THEME.buttonTextColor },
            { key: 'backgroundColor', label: 'Background', hint: 'Page background', default: DEFAULT_THEME.backgroundColor },
            { key: 'textColor', label: 'Text Color', hint: 'Main body text', default: DEFAULT_THEME.textColor },
            { key: 'textSecondaryColor', label: 'Secondary Text', hint: 'Descriptions, hints', default: DEFAULT_THEME.textSecondaryColor },
          ].map(({ key, label, hint, default: defaultVal }) => (
            <div className="admin-form-group" key={key}>
              <label className="admin-form-label">{label}</label>
              <div className="admin-color-input">
                <input
                  type="color"
                  value={config[key] || defaultVal}
                  onChange={(e) => updateField(key, e.target.value)}
                  data-testid={`color-${key}`}
                />
                <input
                  type="text"
                  className="admin-form-input"
                  value={config[key] || defaultVal}
                  onChange={(e) => updateField(key, e.target.value)}
                />
              </div>
              <span className="admin-form-hint">{hint}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Typography Section */}
      <div className="admin-section">
        <h2 className="admin-section-title">Typography</h2>
        
        <div className="admin-form-grid">
          <div className="admin-form-group">
            <label className="admin-form-label">Heading Font</label>
            <select
              className="admin-form-select"
              value={config.fontHeading || 'Poppins'}
              onChange={(e) => updateField('fontHeading', e.target.value)}
              data-testid="select-fontHeading"
            >
              {fontOptions.map(font => (
                <option key={font} value={font}>{font}</option>
              ))}
            </select>
            <span className="admin-form-hint">Used for titles & headings</span>
          </div>

          <div className="admin-form-group">
            <label className="admin-form-label">Body Font</label>
            <select
              className="admin-form-select"
              value={config.fontBody || 'Poppins'}
              onChange={(e) => updateField('fontBody', e.target.value)}
              data-testid="select-fontBody"
            >
              {fontOptions.map(font => (
                <option key={font} value={font}>{font}</option>
              ))}
            </select>
            <span className="admin-form-hint">Used for body text</span>
          </div>
        </div>
      </div>

      {/* Border Radius Section */}
      <div className="admin-section">
        <h2 className="admin-section-title">Border Style</h2>
        
        <div className="admin-radius-options">
          {radiusOptions.map(option => (
            <button
              key={option.value}
              type="button"
              className={`admin-radius-option ${config.borderRadius === option.value ? 'active' : ''}`}
              onClick={() => updateField('borderRadius', option.value)}
              data-testid={`radius-${option.value}`}
            >
              <span className="admin-radius-preview" style={{ borderRadius: option.preview }} />
              <span className="admin-radius-label">{option.label}</span>
            </button>
          ))}
        </div>
        <span className="admin-form-hint">Corner roundness for buttons and cards</span>
      </div>

      {/* Social Links Section */}
      <div className="admin-section">
        <h2 className="admin-section-title">Contact & Social</h2>
        
        <div className="admin-form-grid">
          <div className="admin-form-group">
            <label className="admin-form-label">Phone Number</label>
            <input
              type="tel"
              className="admin-form-input"
              placeholder="+91 98765 43210"
              value={config.phone || ''}
              onChange={(e) => updateField('phone', e.target.value)}
              data-testid="input-phone"
            />
          </div>

          <div className="admin-form-group">
            <label className="admin-form-label">WhatsApp Number</label>
            <input
              type="tel"
              className="admin-form-input"
              placeholder="+91 98765 43210"
              value={config.whatsappNumber || ''}
              onChange={(e) => updateField('whatsappNumber', e.target.value)}
              data-testid="input-whatsappNumber"
            />
          </div>

          <div className="admin-form-group">
            <label className="admin-form-label">Instagram URL</label>
            <input
              type="url"
              className="admin-form-input"
              placeholder="https://instagram.com/yourrestaurant"
              value={config.instagramUrl || ''}
              onChange={(e) => updateField('instagramUrl', e.target.value)}
              data-testid="input-instagramUrl"
            />
          </div>

          <div className="admin-form-group">
            <label className="admin-form-label">Facebook URL</label>
            <input
              type="url"
              className="admin-form-input"
              placeholder="https://facebook.com/yourrestaurant"
              value={config.facebookUrl || ''}
              onChange={(e) => updateField('facebookUrl', e.target.value)}
              data-testid="input-facebookUrl"
            />
          </div>

          <div className="admin-form-group">
            <label className="admin-form-label">Twitter / X URL</label>
            <input
              type="url"
              className="admin-form-input"
              placeholder="https://x.com/yourrestaurant"
              value={config.twitterUrl || ''}
              onChange={(e) => updateField('twitterUrl', e.target.value)}
              data-testid="input-twitterUrl"
            />
          </div>

          <div className="admin-form-group">
            <label className="admin-form-label">YouTube URL</label>
            <input
              type="url"
              className="admin-form-input"
              placeholder="https://youtube.com/@yourrestaurant"
              value={config.youtubeUrl || ''}
              onChange={(e) => updateField('youtubeUrl', e.target.value)}
              data-testid="input-youtubeUrl"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminBrandingPage;
