import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import { RestaurantConfigProvider } from './context/RestaurantConfigContext';
import CartWrapper from './components/CartWrapper/CartWrapper';
import CartBar from './components/CartBar/CartBar';
import LandingPage from './pages/LandingPage';
import DiningMenu from './pages/DiningMenu';
import MenuItems from './pages/MenuItems';
import AboutUs from './pages/AboutUs';
import ContactPage from './pages/ContactPage';
import FeedbackPage from './pages/FeedbackPage';
import ReviewOrder from './pages/ReviewOrder';
import OrderSuccess from './pages/OrderSuccess';
import Login from './pages/Login';
import Profile from './pages/Profile';
import AdminSettings from './pages/AdminSettings';
// CR-2026-10-08-001 Step 1: PasswordSetup unreachable from routing; deleted in Step 2
// import PasswordSetup from './pages/PasswordSetup';
import DeliveryAddress from './pages/DeliveryAddress';
import ScrollToTop from './components/ScrollToTop/scrollToTop';
import FaviconRouteReset from './components/FaviconRouteReset/FaviconRouteReset';
import DocumentTitleManager from './components/DocumentTitleManager/DocumentTitleManager';

// CR-2026-10-08-001 Step 1: redirect old /password-setup links to restaurant landing
const PasswordSetupRedirect = () => {
  const { restaurantId } = useParams();
  return <Navigate to={`/${restaurantId}`} replace />;
};

// Admin Layout and Pages (Web optimized)
import AdminLayout from './layouts/AdminLayout';
import AdminSettingsPage from './pages/admin/AdminSettingsPage';
import AdminBrandingPage from './pages/admin/AdminBrandingPage';
import AdminVisibilityPage from './pages/admin/AdminVisibilityPage';
import AdminBannersPage from './pages/admin/AdminBannersPage';
import AdminContentPage from './pages/admin/AdminContentPage';
import AdminMenuPage from './pages/admin/AdminMenuPage';
import AdminDietaryPage from './pages/admin/AdminDietaryPage';
import AdminQRPage from './pages/admin/AdminQRPage';

// Create a QueryClient instance with default options.
// CR-2026-07-03-004 D-03: retry 2× with exponential backoff capped at 5 s
// (was 3× / 30 s cap). Rationale: 30 s cap made users wait ~90 s cumulatively
// when upstream hung, which is exactly what CR-004 is trying to fix.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10 * 60 * 1000,           // 10 minutes
      gcTime: 30 * 60 * 1000,              // 30 minutes (formerly cacheTime)
      retry: 2,                             // CR-2026-07-03-004 D-03
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000), // CR-2026-07-03-004 D-03
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RestaurantConfigProvider>
        <Router>
        <ScrollToTop />
        <FaviconRouteReset />
        <DocumentTitleManager />
          <CartWrapper>
            <Routes>
              {/* Auth Routes */}
              <Route path="/login" element={<Login />} />
              <Route path="/profile" element={<Profile />} />
              
              {/* Admin Routes - Web Layout */}
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<Navigate to="settings" replace />} />
                <Route path="settings" element={<AdminSettingsPage />} />
                <Route path="branding" element={<AdminBrandingPage />} />
                <Route path="visibility" element={<AdminVisibilityPage />} />
                <Route path="banners" element={<AdminBannersPage />} />
                <Route path="content" element={<AdminContentPage />} />
                <Route path="menu" element={<AdminMenuPage />} />
                <Route path="dietary" element={<AdminDietaryPage />} />
                <Route path="qr-scanners" element={<AdminQRPage />} />
              </Route>
              
              {/* Legacy admin route - redirect to new layout */}
              <Route path="/admin/settings" element={<Navigate to="/admin/settings" replace />} />
              
              <Route path="/:restaurantId/password-setup" element={<PasswordSetupRedirect />} />
              <Route path="/:restaurantId/delivery-address" element={<DeliveryAddress />} />
              
              {/* Most specific routes first - Station routes with restaurant ID */}
              <Route path="/:restaurantId/menu" element={<MenuItems />} />
              <Route path="/:restaurantId/menu/:stationId" element={<MenuItems />} />

              
              {/* Menu routes with restaurant ID */}
              <Route path="/:restaurantId/stations" element={<DiningMenu />} />
              
              {/* About Us page with restaurant ID */}
              <Route path="/:restaurantId/about" element={<AboutUs />} />
              
              {/* Contact page with restaurant ID */}
              <Route path="/:restaurantId/contact" element={<ContactPage />} />
              
              {/* Feedback page with restaurant ID */}
              <Route path="/:restaurantId/feedback" element={<FeedbackPage />} />
              
              {/* Review Order page with restaurant ID */}
              <Route path="/:restaurantId/review-order" element={<ReviewOrder />} />

              {/* Review Order page with restaurant ID and station ID */}
              <Route path="/:restaurantId/:stationId/review-order" element={<ReviewOrder />} />
              
              {/* Order Success page with restaurant ID */}
              <Route path="/:restaurantId/order-success" element={<OrderSuccess />} />
        
              {/* Landing page with restaurant ID */}
              <Route path="/:restaurantId" element={<LandingPage />} />
              
              {/* Fallback routes (without restaurant ID - subdomain mode) */}
              <Route path="/stations" element={<DiningMenu />} />
              <Route path="/menu/:stationId" element={<MenuItems />} />
              <Route path="/menu" element={<MenuItems />} />
              {/* <Route path="/order-success" element={<OrderSuccess />} /> */}
              <Route path="/" element={<LandingPage />} />
            </Routes>
            <CartBar />
          </CartWrapper>
          <Toaster 
            position="top-center"
            toastOptions={{
              duration: 4000,
              style: {
                background: 'var(--bg-dark)',
                color: 'var(--text-white)',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--spacing-md)',
                fontFamily: 'var(--font-body)',
              },
            }}
          />
        </Router>
        </RestaurantConfigProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
