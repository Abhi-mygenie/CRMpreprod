import React, { useState, useRef } from 'react';
import { useAdminConfig } from '../../context/AdminConfigContext';
import { IoImagesOutline, IoAddOutline, IoCreateOutline, IoTrashOutline, IoCloseOutline, IoCloudUploadOutline } from 'react-icons/io5';
import './AdminPages.css';

const AdminBannersPage = () => {
  const { config, addBanner, updateBanner, deleteBanner, uploadImage, loading } = useAdminConfig();
  const bannerInputRef = useRef(null);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [editingBannerId, setEditingBannerId] = useState(null);
  const [bannerSizeWarning, setBannerSizeWarning] = useState('');
  const [newBanner, setNewBanner] = useState({
    bannerImage: '',
    bannerTitle: '',
    bannerLink: '',
    bannerOrder: 0,
    bannerEnabled: true,
    displayOn: 'both'
  });

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

  const handleBannerUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingBanner(true);
    const url = await uploadImage(file);
    if (url) {
      setNewBanner(prev => ({ ...prev, bannerImage: url }));
      validateImageDimensions(url);
    }
    setUploadingBanner(false);
    e.target.value = '';
  };

  const handleAddBanner = async () => {
    if (!newBanner.bannerImage || !newBanner.bannerTitle) return;
    await addBanner(newBanner);
    resetForm();
  };

  const handleUpdateBanner = async () => {
    if (!newBanner.bannerImage || !newBanner.bannerTitle) return;
    await updateBanner(editingBannerId, newBanner);
    resetForm();
  };

  const startEdit = (banner) => {
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

  const resetForm = () => {
    setEditingBannerId(null);
    setNewBanner({
      bannerImage: '',
      bannerTitle: '',
      bannerLink: '',
      bannerOrder: 0,
      bannerEnabled: true,
      displayOn: 'both'
    });
    setBannerSizeWarning('');
  };

  if (loading) {
    return <div className="admin-loading">Loading banners...</div>;
  }

  const banners = config.banners || [];

  return (
    <div className="admin-page" data-testid="admin-banners-page">
      <h1 className="admin-page-title">
        <IoImagesOutline /> Promotional Banners
      </h1>
      <p className="admin-page-description">
        Manage promotional banners shown in the app
      </p>

      {/* Banners List */}
      <div className="admin-section">
        <h2 className="admin-section-title">Current Banners ({banners.length})</h2>
        
        {banners.length === 0 ? (
          <div className="admin-empty-state">
            <IoImagesOutline />
            <p>No banners added yet. Add your first promotional banner below.</p>
          </div>
        ) : (
          <div className="admin-banners-list">
            {banners.map((banner, index) => (
              <div 
                key={banner.id} 
                className={`admin-banner-card ${editingBannerId === banner.id ? 'editing' : ''}`}
                data-testid={`banner-${banner.id}`}
              >
                <span className="admin-banner-order">#{index + 1}</span>
                <img src={banner.bannerImage} alt={banner.bannerTitle} className="admin-banner-preview" />
                <div className="admin-banner-info">
                  <h4 className="admin-banner-title">{banner.bannerTitle}</h4>
                  <div className="admin-banner-meta">
                    <span className={`admin-banner-status ${banner.bannerEnabled ? 'active' : 'inactive'}`}>
                      {banner.bannerEnabled ? 'Active' : 'Inactive'}
                    </span>
                    <span className="admin-banner-display">
                      {banner.displayOn === 'landing' ? 'Landing' : banner.displayOn === 'menu' ? 'Menu' : 'Both'}
                    </span>
                  </div>
                </div>
                <div className="admin-banner-actions">
                  <button
                    className="admin-banner-action-btn"
                    onClick={() => startEdit(banner)}
                    data-testid={`edit-banner-${banner.id}`}
                  >
                    <IoCreateOutline />
                  </button>
                  <button
                    className="admin-banner-action-btn delete"
                    onClick={() => deleteBanner(banner.id)}
                    data-testid={`delete-banner-${banner.id}`}
                  >
                    <IoTrashOutline />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Banner Form */}
      <div className="admin-section">
        <div className="admin-banner-form">
          <h3 className="admin-banner-form-title">
            {editingBannerId ? 'Edit Banner' : 'Add New Banner'}
            {editingBannerId && (
              <button className="admin-cancel-btn" onClick={resetForm}>
                <IoCloseOutline /> Cancel
              </button>
            )}
          </h3>

          <div className="admin-form-grid">
            <div className="admin-form-group full-width">
              <label className="admin-form-label">Banner Image *</label>
              <div className="admin-input-with-btn">
                <input
                  type="url"
                  className="admin-form-input"
                  placeholder="https://example.com/banner.jpg"
                  value={newBanner.bannerImage}
                  onChange={(e) => {
                    setNewBanner(prev => ({ ...prev, bannerImage: e.target.value }));
                    validateImageDimensions(e.target.value);
                  }}
                  data-testid="input-bannerImage"
                />
                <input
                  type="file"
                  ref={bannerInputRef}
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleBannerUpload}
                />
                <button
                  type="button"
                  className="admin-upload-btn"
                  onClick={() => bannerInputRef.current?.click()}
                  disabled={uploadingBanner}
                >
                  <IoCloudUploadOutline />
                  {uploadingBanner ? 'Uploading...' : 'Upload'}
                </button>
              </div>
              <span className="admin-form-hint">Recommended: 1200 x 675px (16:9 ratio). Max 5MB.</span>
              {bannerSizeWarning && <span className="admin-size-warning">{bannerSizeWarning}</span>}
              {newBanner.bannerImage && (
                <div className="admin-image-preview-box" style={{ marginTop: '12px' }}>
                  <img src={newBanner.bannerImage} alt="Preview" className="admin-image-preview" style={{ maxHeight: '200px' }} />
                </div>
              )}
            </div>

            <div className="admin-form-group">
              <label className="admin-form-label">Title *</label>
              <input
                type="text"
                className="admin-form-input"
                placeholder="Banner title (e.g., Happy Hour 20% Off)"
                value={newBanner.bannerTitle}
                onChange={(e) => setNewBanner(prev => ({ ...prev, bannerTitle: e.target.value }))}
                data-testid="input-bannerTitle"
              />
            </div>

            <div className="admin-form-group">
              <label className="admin-form-label">Link URL (optional)</label>
              <input
                type="url"
                className="admin-form-input"
                placeholder="https://example.com/promo"
                value={newBanner.bannerLink}
                onChange={(e) => setNewBanner(prev => ({ ...prev, bannerLink: e.target.value }))}
                data-testid="input-bannerLink"
              />
            </div>

            <div className="admin-form-group">
              <label className="admin-form-label">Display Order</label>
              <input
                type="number"
                className="admin-form-input"
                placeholder="0"
                min="0"
                value={newBanner.bannerOrder}
                onChange={(e) => setNewBanner(prev => ({ ...prev, bannerOrder: parseInt(e.target.value) || 0 }))}
                data-testid="input-bannerOrder"
              />
            </div>

            <div className="admin-form-group">
              <label className="admin-form-label">Status</label>
              <button
                type="button"
                className={`admin-status-toggle ${newBanner.bannerEnabled ? 'active' : ''}`}
                onClick={() => setNewBanner(prev => ({ ...prev, bannerEnabled: !prev.bannerEnabled }))}
                data-testid="toggle-bannerEnabled"
              >
                {newBanner.bannerEnabled ? 'Active' : 'Inactive'}
              </button>
            </div>

            <div className="admin-form-group">
              <label className="admin-form-label">Display On</label>
              <select
                className="admin-form-select"
                value={newBanner.displayOn}
                onChange={(e) => setNewBanner(prev => ({ ...prev, displayOn: e.target.value }))}
                data-testid="select-displayOn"
              >
                <option value="both">Both Pages</option>
                <option value="landing">Landing Page Only</option>
                <option value="menu">Menu Page Only</option>
              </select>
            </div>
          </div>

          <button
            className={`admin-add-btn ${editingBannerId ? 'update' : ''}`}
            onClick={editingBannerId ? handleUpdateBanner : handleAddBanner}
            disabled={!newBanner.bannerImage || !newBanner.bannerTitle}
            data-testid={editingBannerId ? 'update-banner-btn' : 'add-banner-btn'}
          >
            {editingBannerId ? (
              <><IoCreateOutline /> Update Banner</>
            ) : (
              <><IoAddOutline /> Add Banner</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminBannersPage;
