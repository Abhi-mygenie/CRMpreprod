import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useRestaurantDetails } from '../../hooks/useMenuData';

/**
 * DocumentTitleManager
 * --------------------
 * Sets <title> dynamically:
 *   - On restaurant routes (numeric first path segment, e.g. /716, /716/menu),
 *     uses `restaurant.name` from the existing useRestaurantDetails hook
 *     (POS API /web/restaurant-info → data.name) and writes it to
 *     localStorage["restaurant_name_<rid>"] so the boot script in index.html
 *     can apply it synchronously on the next hard refresh (no FOUC).
 *   - On non-restaurant routes (/, /login, /admin/*, /profile, etc.), resets
 *     the title to the default 'MyGenie'.
 *
 * No backend / API change. Re-uses the existing useRestaurantDetails query
 * already firing on every restaurant route, so no new network calls.
 */
const DEFAULT_TITLE = 'MyGenie';
const RESTAURANT_SEGMENT_RE = /^\d+$/;

export default function DocumentTitleManager() {
  const location = useLocation();
  const seg = location.pathname.split('/').filter(Boolean)[0] || '';
  const isRestaurantRoute = RESTAURANT_SEGMENT_RE.test(seg);

  // useRestaurantDetails accepts null/undefined and disables the query then,
  // so passing null on non-restaurant routes is a clean no-op.
  const { restaurant } = useRestaurantDetails(isRestaurantRoute ? seg : null);

  useEffect(() => {
    if (!isRestaurantRoute) {
      if (document.title !== DEFAULT_TITLE) document.title = DEFAULT_TITLE;
      return;
    }
    const name = restaurant?.name;
    if (name && typeof name === 'string' && name.length) {
      if (document.title !== name) document.title = name;
      try {
        localStorage.setItem('restaurant_name_' + seg, name);
      } catch (e) {
        /* localStorage blocked — ignore, title still set in this tab */
      }
    }
  }, [isRestaurantRoute, restaurant?.name, seg]);

  return null;
}
