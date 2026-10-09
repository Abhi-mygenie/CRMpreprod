import React from 'react';
import { useRestaurantConfig } from '../../context/RestaurantConfigContext';
import './Footer.css';

const DEFAULT_EXTRA_INFO = [
  'All prices are exclusive of Govt.Tax/GST',
  'A single pour is 30ml of alcohol'
];

const Footer = () => {
  const { showExtraInfo, extraInfoItems } = useRestaurantConfig();

  // Use custom items if provided, otherwise use defaults
  const items = extraInfoItems?.length > 0 ? extraInfoItems : DEFAULT_EXTRA_INFO;

  // Don't render if showExtraInfo is false
  if (!showExtraInfo) {
    return null;
  }

  return (
    <div className="menu-footer" data-testid="menu-footer">
      <div className="footer-section extra-info-section">
        <h3 className="footer-heading">Extra Info:</h3>
        <ul className="footer-list">
          {items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default Footer;
