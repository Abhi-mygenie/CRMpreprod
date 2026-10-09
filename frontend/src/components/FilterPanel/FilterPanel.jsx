import React from 'react';
import './FilterPanel.css';

const FilterPanel = ({ activeFilter, onFilterChange }) => {
  return (
    <div className="filter-panel">
      <button
        className={`filter-option ${activeFilter === 'all' ? 'active' : ''}`}
        onClick={() => onFilterChange('all')}
      >
        <span className="filter-text">All Items</span>
      </button>
      
      <button
        className={`filter-option ${activeFilter === 'veg' ? 'active' : ''}`}
        onClick={() => onFilterChange('veg')}
      >
        <span className="veg">
          <span className="veg-dot"></span>
        </span>
        <span className="filter-text">Veg</span>
      </button>
      
      <button
        className={`filter-option ${activeFilter === 'egg' ? 'active' : ''}`}
        onClick={() => onFilterChange('egg')}
      >
        <span className="egg">
          <span className="veg-dot"></span>
        </span>
        <span className="filter-text">Egg</span>
      </button>
      
      <button
        className={`filter-option ${activeFilter === 'non-veg' ? 'active' : ''}`}
        onClick={() => onFilterChange('non-veg')}
      >
        <span className="non-veg">
          <span className="veg-dot"></span>
        </span>
        <span className="filter-text">Non-Veg</span>
      </button>
    </div>
  );
};

export default FilterPanel;
