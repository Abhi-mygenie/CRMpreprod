import React from 'react';
import './SkeletonLoaders.css';

/**
 * Skeleton Loader for Header Component
 * @param {boolean} showSearchIcon - Whether to show search icon skeleton (default: false)
 */
const HeaderSkeleton = ({ showSearchIcon = false }) => {
  return (
    <div className="menu-items-header skeleton-header">
      <div className="header-left-section">
        {/* Back button skeleton */}
        <div className="skeleton-header-icon"></div>
        {/* Title skeleton */}
        <div className="skeleton-brand-text"></div>
      </div>

      <div className="header-right">
        {showSearchIcon && (
          <div className="skeleton-header-icon"></div>
        )}
        <div className="skeleton-header-icon"></div>
      </div>
    </div>
  );
};

export default HeaderSkeleton;
