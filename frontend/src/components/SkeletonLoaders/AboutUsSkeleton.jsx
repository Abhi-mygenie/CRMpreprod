import React from 'react';
import './SkeletonLoaders.css';

const AboutUsSkeleton = () => {
  return (
    <div className="about-us-page skeleton-about-us">
      {/* Header Skeleton */}
      <div className="about-us-header">
        <div className="skeleton-back-btn"></div>
        <div className="skeleton-about-title"></div>
        <div className="skeleton-back-btn"></div>
      </div>

      <div className="about-us-content">
        {/* Branding Skeleton */}
        <div className="about-us-branding">
          <div className="skeleton-about-logo"></div>
          <div className="skeleton-about-name"></div>
          <div className="skeleton-about-tagline"></div>
        </div>

        {/* Sections Skeleton */}
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="about-us-section">
            <div className="skeleton-section-title"></div>
            <div className="skeleton-section-text">
              <div className="skeleton-line"></div>
              <div className="skeleton-line"></div>
              <div className="skeleton-line" style={{ width: '80%' }}></div>
            </div>
          </div>
        ))}

        {/* Contact Box Skeleton */}
        <div className="about-us-contact-box">
          <div className="skeleton-contact-title"></div>
          <div className="about-us-contact-list">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="about-us-contact-item">
                <div className="skeleton-contact-icon"></div>
                <div className="skeleton-contact-text"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AboutUsSkeleton;
