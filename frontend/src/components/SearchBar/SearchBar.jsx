import React from 'react';
import './SearchBar.css';

const SearchBar = ({ isVisible, searchQuery, onSearchChange }) => {
  if (!isVisible) return null;

  return (
    <div className="search-bar-container">
      <div className="search-bar">
        <svg 
          className="search-icon" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="8"></circle>
          <path d="m21 21-4.35-4.35"></path>
        </svg>
        <input
          type="text"
          className="search-input"
          placeholder="Search menu items..."
          value={searchQuery}
          onChange={onSearchChange}
          autoFocus
        />
      </div>
    </div>
  );
};

export default SearchBar;
