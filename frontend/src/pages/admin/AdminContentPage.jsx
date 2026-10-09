import React, { useRef, useState } from 'react';
import { useAdminConfig } from '../../context/AdminConfigContext';
import { IoDocumentOutline, IoCloudUploadOutline, IoAddOutline, IoTrashOutline } from 'react-icons/io5';
import './AdminPages.css';

const AdminContentPage = () => {
  const { config, updateField, uploadImage, loading } = useAdminConfig();
  const aboutImageRef = useRef(null);
  const [uploadingAboutImage, setUploadingAboutImage] = useState(false);

  const handleAboutImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAboutImage(true);
    const url = await uploadImage(file);
    if (url) updateField('aboutUsImage', url);
    setUploadingAboutImage(false);
    e.target.value = '';
  };

  const handleExtraInfoChange = (index, value) => {
    const newItems = [...(config.extraInfoItems || ['', '', '', '', ''])];
    newItems[index] = value;
    updateField('extraInfoItems', newItems);
  };

  const handleFooterLinkChange = (index, field, value) => {
    const newLinks = [...(config.footerLinks || [])];
    newLinks[index] = { ...newLinks[index], [field]: value };
    updateField('footerLinks', newLinks);
  };

  const addFooterLink = () => {
    const newLinks = [...(config.footerLinks || []), { label: '', url: '' }];
    updateField('footerLinks', newLinks);
  };

  const removeFooterLink = (index) => {
    const newLinks = (config.footerLinks || []).filter((_, i) => i !== index);
    updateField('footerLinks', newLinks);
  };

  if (loading) {
    return <div className="admin-loading">Loading content settings...</div>;
  }

  return (
    <div className="admin-page" data-testid="admin-content-page">
      <h1 className="admin-page-title">
        <IoDocumentOutline /> Content
      </h1>
      <p className="admin-page-description">
        Manage your restaurant's content pages and information
      </p>

      {/* About Us Section */}
      <div className="admin-section">
        <h2 className="admin-section-title">About Us</h2>
        
        <div className="admin-form-grid">
          <div className="admin-form-group full-width">
            <label className="admin-form-label">About Us Content</label>
            <textarea
              className="admin-form-textarea"
              placeholder="Tell your customers about your restaurant..."
              value={config.aboutUsContent || ''}
              onChange={(e) => updateField('aboutUsContent', e.target.value)}
              rows={6}
              data-testid="textarea-aboutUsContent"
            />
          </div>

          <div className="admin-form-group">
            <label className="admin-form-label">About Us Image</label>
            <div className="admin-input-with-btn">
              <input
                type="url"
                className="admin-form-input"
                placeholder="https://example.com/about.jpg"
                value={config.aboutUsImage || ''}
                onChange={(e) => updateField('aboutUsImage', e.target.value)}
                data-testid="input-aboutUsImage"
              />
              <input
                type="file"
                ref={aboutImageRef}
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleAboutImageUpload}
              />
              <button
                type="button"
                className="admin-upload-btn"
                onClick={() => aboutImageRef.current?.click()}
                disabled={uploadingAboutImage}
              >
                <IoCloudUploadOutline />
                {uploadingAboutImage ? 'Uploading...' : 'Upload'}
              </button>
            </div>
            {config.aboutUsImage && (
              <div className="admin-image-preview-box" style={{ marginTop: '12px' }}>
                <img src={config.aboutUsImage} alt="About" className="admin-image-preview" />
                <button className="admin-remove-btn" onClick={() => updateField('aboutUsImage', '')}>
                  Remove
                </button>
              </div>
            )}
          </div>

          <div className="admin-form-group">
            <label className="admin-form-label">Opening Hours</label>
            <textarea
              className="admin-form-textarea"
              placeholder="Mon-Fri: 9am-10pm&#10;Sat-Sun: 10am-11pm"
              value={config.openingHours || ''}
              onChange={(e) => updateField('openingHours', e.target.value)}
              rows={4}
              data-testid="textarea-openingHours"
            />
          </div>
        </div>
      </div>

      {/* Contact Information */}
      <div className="admin-section">
        <h2 className="admin-section-title">Contact Information</h2>
        
        <div className="admin-form-grid">
          <div className="admin-form-group full-width">
            <label className="admin-form-label">Address</label>
            <textarea
              className="admin-form-textarea"
              placeholder="123 Restaurant Street, City, State 12345"
              value={config.address || ''}
              onChange={(e) => updateField('address', e.target.value)}
              rows={2}
              data-testid="textarea-address"
            />
          </div>

          <div className="admin-form-group">
            <label className="admin-form-label">Contact Email</label>
            <input
              type="email"
              className="admin-form-input"
              placeholder="contact@restaurant.com"
              value={config.contactEmail || ''}
              onChange={(e) => updateField('contactEmail', e.target.value)}
              data-testid="input-contactEmail"
            />
          </div>

          <div className="admin-form-group">
            <label className="admin-form-label">Google Maps Embed URL</label>
            <input
              type="url"
              className="admin-form-input"
              placeholder="https://www.google.com/maps/embed?..."
              value={config.mapEmbedUrl || ''}
              onChange={(e) => updateField('mapEmbedUrl', e.target.value)}
              data-testid="input-mapEmbedUrl"
            />
          </div>
        </div>
      </div>

      {/* Footer Section */}
      <div className="admin-section">
        <h2 className="admin-section-title">Footer</h2>
        
        <div className="admin-form-grid">
          <div className="admin-form-group full-width">
            <label className="admin-form-label">Footer Text</label>
            <input
              type="text"
              className="admin-form-input"
              placeholder="© 2024 Your Restaurant. All rights reserved."
              value={config.footerText || ''}
              onChange={(e) => updateField('footerText', e.target.value)}
              data-testid="input-footerText"
            />
          </div>

          <div className="admin-form-group full-width">
            <label className="admin-form-label">Footer Links</label>
            {(config.footerLinks || []).map((link, index) => (
              <div key={index} className="admin-input-with-btn" style={{ marginBottom: '8px' }}>
                <input
                  type="text"
                  className="admin-form-input"
                  placeholder="Link Label"
                  value={link.label || ''}
                  onChange={(e) => handleFooterLinkChange(index, 'label', e.target.value)}
                />
                <input
                  type="url"
                  className="admin-form-input"
                  placeholder="https://..."
                  value={link.url || ''}
                  onChange={(e) => handleFooterLinkChange(index, 'url', e.target.value)}
                />
                <button
                  type="button"
                  className="admin-remove-btn"
                  onClick={() => removeFooterLink(index)}
                >
                  <IoTrashOutline />
                </button>
              </div>
            ))}
            <button type="button" className="admin-upload-btn" onClick={addFooterLink}>
              <IoAddOutline /> Add Link
            </button>
          </div>
        </div>
      </div>

      {/* Extra Info Section */}
      <div className="admin-section">
        <h2 className="admin-section-title">Extra Info Items</h2>
        <p className="admin-form-hint" style={{ marginBottom: '16px' }}>
          Additional info displayed on landing page (up to 5 items)
        </p>
        
        <div className="admin-form-grid">
          {[0, 1, 2, 3, 4].map((index) => (
            <div className="admin-form-group" key={index}>
              <label className="admin-form-label">Item {index + 1}</label>
              <input
                type="text"
                className="admin-form-input"
                placeholder={`Extra info ${index + 1}...`}
                value={(config.extraInfoItems || [])[index] || ''}
                onChange={(e) => handleExtraInfoChange(index, e.target.value)}
                data-testid={`input-extraInfo-${index}`}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Feedback Section */}
      <div className="admin-section">
        <h2 className="admin-section-title">Feedback</h2>
        
        <div className="admin-form-grid">
          <div className="admin-form-group">
            <label className="admin-form-label">Enable Feedback</label>
            <button
              type="button"
              className={`admin-status-toggle ${config.feedbackEnabled ? 'active' : ''}`}
              onClick={() => updateField('feedbackEnabled', !config.feedbackEnabled)}
              data-testid="toggle-feedbackEnabled"
            >
              {config.feedbackEnabled ? 'Enabled' : 'Disabled'}
            </button>
          </div>

          <div className="admin-form-group">
            <label className="admin-form-label">Feedback Intro Text</label>
            <input
              type="text"
              className="admin-form-input"
              placeholder="We'd love to hear from you!"
              value={config.feedbackIntroText || ''}
              onChange={(e) => updateField('feedbackIntroText', e.target.value)}
              data-testid="input-feedbackIntroText"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminContentPage;
