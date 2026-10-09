import React from 'react';
import './CategoryBox.css';

const CategoryBox = ({ section, isSelected, onClick }) => {
  // POS returns a default placeholder PNG (food-default-image) when no real
  // category image was uploaded. Treat those as "no image" so we can render
  // a cleaner initial-tile fallback instead of an identical grey icon.
  const isPosDefaultImage = (url) =>
    typeof url === 'string' &&
    /\/admin\/img\/.*food-default-image/i.test(url);

  const hasRealImage =
    section.sectionImage &&
    typeof section.sectionImage === 'string' &&
    section.sectionImage.trim() !== '' &&
    !isPosDefaultImage(section.sectionImage);

  // First letter of category name for the initial-tile fallback.
  const initial = (section.sectionName || '?').trim().charAt(0).toUpperCase();

  const handleImageError = (e) => {
    // If a real image URL fails at runtime, hide it and reveal the initial.
    e.target.style.display = 'none';
    const fallback = e.target.parentElement?.querySelector('.category-box-initial');
    if (fallback) fallback.style.display = 'flex';
  };

  return (
    <div className="category-item">
      <div
        role="button"
        tabIndex={0}
        className={`category-box ${isSelected ? 'selected' : ''} ${!hasRealImage ? 'category-box--no-image' : ''}`}
        onClick={onClick}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
      >
        {hasRealImage ? (
          <>
            <img
              src={section.sectionImage}
              alt={section.sectionName}
              loading="lazy"
              decoding="async"
              onError={handleImageError}
            />
            <span className="category-box-initial" style={{ display: 'none' }}>{initial}</span>
          </>
        ) : (
          <span className="category-box-initial">{initial}</span>
        )}
      </div>
      <span className="category-name">{section.sectionName}</span>
    </div>
  );
};

export default CategoryBox;
