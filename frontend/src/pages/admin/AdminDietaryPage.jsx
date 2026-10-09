import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useAdminConfig } from '../../context/AdminConfigContext';
import { IoPricetagsOutline } from 'react-icons/io5';
import DietaryTagsAdmin from '../../components/AdminSettings/DietaryTagsAdmin';
import './AdminPages.css';
import '../../components/AdminSettings/DietaryTagsAdmin.css';

const AdminDietaryPage = () => {
  const { user, token } = useAuth();
  const { restaurantFlags, loading } = useAdminConfig();

  if (loading) {
    return <div className="admin-loading">Loading dietary tags...</div>;
  }

  const restaurantId = user?.restaurant_id || user?.id;

  return (
    <div className="admin-page" data-testid="admin-dietary-page">
      <h1 className="admin-page-title">
        <IoPricetagsOutline /> Dietary Tags
      </h1>
      <p className="admin-page-description">
        Manage dietary tags and assign them to menu items
      </p>

      <div className="admin-section">
        <DietaryTagsAdmin
          restaurantId={restaurantId}
          token={token}
          multipleMenu={restaurantFlags.multiple_menu}
        />
      </div>
    </div>
  );
};

export default AdminDietaryPage;
