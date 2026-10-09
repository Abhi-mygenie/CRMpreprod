import React from 'react';
import { IoTimeOutline, IoRestaurantOutline } from 'react-icons/io5';
import './StationCard.css';

const StationCard = ({ station, isAvailable, onClick, onPrefetch }) => {
  const hasImage = station.image && station.image !== '';
  const hasTiming = station.timing && station.timing !== '';

  return (
    <div
      className={`station-card ${!isAvailable ? 'disabled' : ''}`}
      onClick={onClick}
      onMouseEnter={onPrefetch}
      onFocus={onPrefetch}
      onTouchStart={onPrefetch}
      data-testid={`station-card-${station.id}`}
    >
      {/* Full-bleed image or placeholder background */}
      {hasImage ? (
        <img src={station.image} alt={station.name} className="station-card-bg" />
      ) : (
        <div className="station-card-bg-placeholder">
          <IoRestaurantOutline className="station-card-bg-icon" />
        </div>
      )}

      {/* Dark overlay */}
      <div className="station-card-overlay" />

      {/* Centered text content */}
      <div className="station-card-content">
        <h3 className="station-card-name">{station.name}</h3>
        {hasTiming && (
          <span className={`station-card-timing ${isAvailable ? 'open' : 'closed'}`}>
            <IoTimeOutline />
            {isAvailable ? station.timing : `Opens ${station.timing}`}
          </span>
        )}
      </div>

      {/* Unavailable badge */}
      {!isAvailable && (
        <div className="station-card-unavailable-badge">Currently Unavailable</div>
      )}
    </div>
  );
};

export default StationCard;
