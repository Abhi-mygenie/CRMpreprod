import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * FaviconRouteReset
 * -----------------
 * On non-restaurant routes (e.g. /login, /admin/*, /, /profile), reset the
 * <link rel="icon"> back to the default /favicon.svg, so a tab that previously
 * had a restaurant brand favicon set (by RestaurantConfigContext) does not
 * carry it over into admin / default screens.
 *
 * Restaurant routes are detected as a single numeric first path segment
 * (e.g. /716, /716/menu, /716/order-success/...) — matching the URL pattern
 * used elsewhere in the SPA.
 *
 * No-op on every other route. No backend / API change. Cosmetic only.
 */
const RESTAURANT_SEGMENT_RE = /^\d+$/;
const DEFAULT_FAVICON_HREF = '/favicon.svg';

export default function FaviconRouteReset() {
  const location = useLocation();

  useEffect(() => {
    const seg = location.pathname.split('/').filter(Boolean)[0] || '';
    const isRestaurantRoute = RESTAURANT_SEGMENT_RE.test(seg);
    if (isRestaurantRoute) return; // RestaurantConfigContext owns the favicon here

    const link = document.querySelector("link[rel='icon']");
    if (!link) return;
    if (link.getAttribute('href') !== DEFAULT_FAVICON_HREF) {
      link.setAttribute('type', 'image/svg+xml');
      link.setAttribute('href', DEFAULT_FAVICON_HREF);
    }
  }, [location.pathname]);

  return null;
}
