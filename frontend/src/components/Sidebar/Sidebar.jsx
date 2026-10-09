import React from 'react';
import { IoCloseOutline, IoHomeOutline, IoInformationCircleOutline, IoNotificationsOutline, IoPersonOutline, IoCall } from "react-icons/io5";
import { MdSupportAgent } from "react-icons/md";
import './Sidebar.css';

const Sidebar = ({ isOpen, onClose, logoUrl, title, description, phone, onHomeClick, onAboutClick, onServicesClick, onContactClick }) => {
  return (
    <>
      {/* Sidebar Overlay */}
      {isOpen && <div className="sidebar-overlay" onClick={onClose}></div>}

      {/* Sidebar */}
      <div className={`sidebar ${isOpen ? 'open' : ''}`}>
        {/* Header Section */}
        <div className="sidebar-header">
          <div className="sidebar-header-content">
            {logoUrl ? (
              <img 
                src={logoUrl} 
                alt={title || 'Logo'} 
                className="sidebar-logo" 
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            ) : null}
            <div className="sidebar-title-wrapper">
              <h2 className="sidebar-title">{title || 'Menu'}</h2>
              {/* {description && (
                <p className="sidebar-description">{description}</p>
              )} */}
            </div>
          </div>
          <button className="sidebar-close-btn" onClick={onClose}>
            <IoCloseOutline color="#ffffff" />
          </button>
        </div>
        <div className="sidebar-divider"></div>

        {/* Navigation Section */}
        <div className="sidebar-content">
          <div className="sidebar-nav-item" onClick={onHomeClick}>
            <div className="sidebar-nav-icon-box">
              <IoHomeOutline className="sidebar-nav-icon" />
            </div>
            <span className="sidebar-nav-label">Home</span>
            <span className="sidebar-nav-arrow">›</span>
          </div>

          {/* <div className="sidebar-nav-item" onClick={onAboutClick}>
            <div className="sidebar-nav-icon-box">
              <IoInformationCircleOutline className="sidebar-nav-icon" />
            </div>
            <span className="sidebar-nav-label">About</span>
            <span className="sidebar-nav-arrow">›</span>
          </div>

          <div className="sidebar-nav-item" onClick={onServicesClick}>
            <div className="sidebar-nav-icon-box">
              <IoNotificationsOutline className="sidebar-nav-icon" />
            </div>
            <span className="sidebar-nav-label">Services</span>
            <span className="sidebar-nav-arrow">›</span>
          </div>

          <div className="sidebar-nav-item" onClick={onContactClick}>
            <div className="sidebar-nav-icon-box">
              <IoPersonOutline className="sidebar-nav-icon" />
            </div>
            <span className="sidebar-nav-label">Contact</span>
            <span className="sidebar-nav-arrow">›</span>
          </div> */}
        </div>

        {/* Footer Section - Need Help */}
        <div className="sidebar-footer">
          <div className="sidebar-divider"></div>
          <div className="sidebar-help-section">
            <div className="sidebar-help-header">
              <MdSupportAgent className="sidebar-help-icon" />
              <h3 className="sidebar-help-title">Need Help?</h3>
            </div>
            {/* {phone && (
              <a href={`tel:${phone}`} className="sidebar-help-phone-link">
                <span className="sidebar-help-phone">Contact support: {phone} </span>
                <IoCall  className="sidebar-help-phone-icon" />
              </a>
            )} */}
            {phone && (
              <a href={`tel:${phone}`} className="sidebar-call-us-btn">
                <IoCall className="sidebar-call-us-icon" />
                <span className="sidebar-call-us-text">Call us</span>
              </a>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
