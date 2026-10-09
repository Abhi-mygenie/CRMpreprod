import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { IoArrowBack } from 'react-icons/io5';
import { useRestaurantDetails } from '../hooks/useMenuData';
import { useRestaurantId } from '../utils/useRestaurantId';
import { useRestaurantConfig } from '../context/RestaurantConfigContext';
import { AboutUsSkeleton } from '../components/SkeletonLoaders';
import './AboutUs.css';

const AboutUs = () => {
  const navigate = useNavigate();
  const { restaurantId } = useRestaurantId();
  const { restaurant, loading } = useRestaurantDetails(restaurantId);
  const config = useRestaurantConfig();

  useEffect(() => {
    if (restaurantId) config.fetchConfig(restaurantId);
  }, [restaurantId]);

  const aboutImage = config.aboutUsImage || '';
  const aboutContent = config.aboutUsContent || '';
  const openingHours = config.openingHours || '';
  const logoUrl = config.logoUrl || null;

  if (loading) return <AboutUsSkeleton />;

  return (
    <div className="about-us-page" data-testid="about-us-page">
      <div className="about-us-header">
        <button className="about-us-back-btn" onClick={() => navigate(-1)} data-testid="about-back-btn">
          <IoArrowBack className="back-icon" />
        </button>
        <h1 className="about-us-title">About Us</h1>
        <div className="about-us-header-spacer" />
      </div>

      <div className="about-us-content">
        {/* Hero Image */}
        {aboutImage && (
          <div className="about-hero-image" data-testid="about-hero-image">
            <img src={aboutImage} alt={restaurant?.name || 'Restaurant'} onError={(e) => (e.target.style.display = 'none')} />
          </div>
        )}

        {/* Restaurant Branding */}
        <div className="about-us-branding">
          {logoUrl ? (
            <img src={logoUrl} alt={restaurant?.name || 'Restaurant Logo'} className="about-us-logo" onError={(e) => { e.target.style.display = 'none'; }} />
          ) : null}
          <h2 className="about-us-restaurant-name">{restaurant?.name || 'Restaurant'}</h2>
          {config.tagline && (
            <p className="about-us-tagline">{config.tagline}</p>
          )}
        </div>

        {/* Rich Content from Admin */}
        {aboutContent && (
          <div className="about-rich-content" data-testid="about-rich-content" dangerouslySetInnerHTML={{ __html: aboutContent }} />
        )}

        {/* Opening Hours */}
        {openingHours && (
          <div className="about-section" data-testid="about-hours">
            <h3 className="about-section-title">Opening Hours</h3>
            <div className="about-hours-content" dangerouslySetInnerHTML={{ __html: openingHours }} />
          </div>
        )}
      </div>
    </div>
  );
};

export default AboutUs;
