import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { IoArrowBack, IoLocationOutline, IoCallOutline, IoMailOutline, IoLogoInstagram, IoLogoFacebook, IoLogoTwitter, IoLogoYoutube, IoLogoWhatsapp } from 'react-icons/io5';
import { useRestaurantDetails } from '../hooks/useMenuData';
import { useRestaurantId } from '../utils/useRestaurantId';
import { useRestaurantConfig } from '../context/RestaurantConfigContext';
import './ContactPage.css';

const ContactPage = () => {
  const navigate = useNavigate();
  const { restaurantId } = useRestaurantId();
  const { restaurant } = useRestaurantDetails(restaurantId);
  const config = useRestaurantConfig();

  useEffect(() => {
    if (restaurantId) config.fetchConfig(restaurantId);
  }, [restaurantId]);

  const phone = config.phone || restaurant?.phone || '';
  const address = config.address || '';
  const email = config.contactEmail || '';
  const mapUrl = config.mapEmbedUrl || '';
  const openingHours = config.openingHours || '';

  const socials = [
    { url: config.instagramUrl, icon: IoLogoInstagram, label: 'Instagram', color: '#E4405F' },
    { url: config.facebookUrl, icon: IoLogoFacebook, label: 'Facebook', color: '#1877F2' },
    { url: config.twitterUrl, icon: IoLogoTwitter, label: 'Twitter / X', color: '#1DA1F2' },
    { url: config.youtubeUrl, icon: IoLogoYoutube, label: 'YouTube', color: '#FF0000' },
    { url: config.whatsappNumber ? `https://wa.me/${config.whatsappNumber.replace(/[^0-9]/g, '')}` : '', icon: IoLogoWhatsapp, label: 'WhatsApp', color: '#25D366' },
  ].filter(s => s.url);

  return (
    <div className="contact-page" data-testid="contact-page">
      <div className="contact-header">
        <button className="contact-back-btn" onClick={() => navigate(-1)} data-testid="contact-back-btn">
          <IoArrowBack />
        </button>
        <h1 className="contact-title">Contact Us</h1>
        <div className="contact-header-spacer" />
      </div>

      <div className="contact-content">
        <p className="contact-intro">We'd love to hear from you. Reach out through any of the channels below.</p>

        <div className="contact-cards">
          {phone && (
            <a href={`tel:${phone}`} className="contact-card" data-testid="contact-phone">
              <IoCallOutline className="contact-card-icon" />
              <div className="contact-card-body">
                <span className="contact-card-label">Phone</span>
                <span className="contact-card-value">{phone}</span>
              </div>
            </a>
          )}

          {email && (
            <a href={`mailto:${email}`} className="contact-card" data-testid="contact-email">
              <IoMailOutline className="contact-card-icon" />
              <div className="contact-card-body">
                <span className="contact-card-label">Email</span>
                <span className="contact-card-value">{email}</span>
              </div>
            </a>
          )}

          {address && (
            <div className="contact-card" data-testid="contact-address">
              <IoLocationOutline className="contact-card-icon" />
              <div className="contact-card-body">
                <span className="contact-card-label">Address</span>
                <span className="contact-card-value">{address}</span>
              </div>
            </div>
          )}
        </div>

        {/* Social Media */}
        {socials.length > 0 && (
          <div className="contact-section" data-testid="contact-socials">
            <h2 className="contact-section-title">Follow Us</h2>
            <div className="contact-social-links">
              {socials.map(({ url, icon: Icon, label, color }) => (
                <a key={label} href={url} target="_blank" rel="noopener noreferrer" className="contact-social-link" style={{ '--social-color': color }} data-testid={`contact-social-${label.toLowerCase().replace(/\s/g, '-')}`}>
                  <Icon className="contact-social-icon" />
                  <span>{label}</span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Opening Hours */}
        {openingHours && (
          <div className="contact-section" data-testid="contact-hours">
            <h2 className="contact-section-title">Opening Hours</h2>
            <div className="contact-hours-content" dangerouslySetInnerHTML={{ __html: openingHours }} />
          </div>
        )}

        {/* Map */}
        {mapUrl && (
          <div className="contact-section" data-testid="contact-map">
            <h2 className="contact-section-title">Find Us</h2>
            <div className="contact-map-wrapper">
              <iframe src={mapUrl} title="Restaurant location" className="contact-map-iframe" loading="lazy" allowFullScreen referrerPolicy="no-referrer-when-downgrade" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ContactPage;
