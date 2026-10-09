import React from 'react';
import './SkeletonLoaders.css';

/**
 * Skeleton Loader for Station Card
 */
const StationCardSkeleton = () => {
  return (
    <div className="skeleton-station-card">
      <div className="skeleton-station-overlay">
        <div className="skeleton-station-name"></div>
        <div className="skeleton-station-timing"></div>
      </div>
    </div>
  );
};

export default StationCardSkeleton;
