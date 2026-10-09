import React from 'react';
import './SkeletonLoaders.css';

/**
 * Skeleton Loader for Category Box
 */
const CategoryBoxSkeleton = () => {
  return (
    <div className="skeleton-category-item">
      <div className="skeleton-category-box"></div>
      <div className="skeleton-category-name"></div>
    </div>
  );
};

export default CategoryBoxSkeleton;
