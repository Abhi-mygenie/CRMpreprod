import React from 'react';
import './SkeletonLoaders.css';

/**
 * Skeleton Loader for Landing Page
 */
const LandingPageSkeleton = () => {
  return (
    <div className="landing-page">
      <div className="landing-container">
        <div className="logo-section">
          <div className="skeleton-logo"></div>
        </div>
        <div className="skeleton-welcome-text">
          <div className="skeleton-line"></div>
          <div className="skeleton-line short"></div>
        </div>
        {/* <div className="skeleton-social-icons">
          <div className="skeleton-icon"></div>
          <div className="skeleton-icon"></div>
        </div> */}
        <div className="skeleton-button"></div>
      </div>
    </div>
  );
};

export default LandingPageSkeleton;
