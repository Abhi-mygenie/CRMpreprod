import React from 'react';
import { IoArrowBackOutline } from 'react-icons/io5';
import { useRestaurantConfig } from '../../context/RestaurantConfigContext';
import HamburgerMenu from '../HamburgerMenu/HamburgerMenu';
import './Header.css';

const Header = ({ brandText, phone, onBackClick }) => {
  const { showHamburgerMenu } = useRestaurantConfig();

  return (
    <div className="menu-items-header" data-testid="app-header">
      <div className="header-left-section">
        {onBackClick && (
          <button className="header-back-btn" onClick={onBackClick} data-testid="header-back-btn">
            <IoArrowBackOutline />
          </button>
        )}
        <h1 className="header-title" data-testid="header-title">{brandText || 'Menu'}</h1>
      </div>
      
      <div className="header-right">
        {showHamburgerMenu && <HamburgerMenu restaurantName={brandText} phone={phone} />}
      </div>
    </div>
  );
};

export default Header;
