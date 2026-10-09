import React from 'react';
import './SkeletonLoaders.css';

/**
 * Skeleton Loader for Menu Item Card
 */
const MenuItemSkeleton = () => {
  return (
    <div className="skeleton-menu-item">
      <div className="skeleton-item-content">
        <div className="skeleton-veg-label"></div>
        <div className="skeleton-item-name"></div>
        <div className="skeleton-item-price"></div>
        <div className="skeleton-item-description">
          <div className="skeleton-line"></div>
          <div className="skeleton-line short"></div>
        </div>
      </div>
      <div className="skeleton-item-image"></div>
    </div>
  );
};

export default MenuItemSkeleton;
