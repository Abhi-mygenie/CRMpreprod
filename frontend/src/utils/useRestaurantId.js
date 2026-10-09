/**
 * Custom Hook: useRestaurantId
 * Extracts restaurant ID from URL (path, query, or hostname)
 * For hostname mode, resolves to numeric ID via restaurant-info API.
 *
 * Supports:
 * - /478 (path parameter)
 * - /?id=478 (query parameter)
 * - hyatt.mygenie.online (tenant subdomain → resolved via backend)
 * - sattivikdelights.com (white-label custom domain → resolved via backend)
 * - www.sattivikdelights.com (normalised to sattivikdelights.com before resolution)
 */

import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { getRestaurantDetails } from '../api/services/restaurantService';

// Module-level cache: hostname string → numeric restaurant ID
// Persists across component re-mounts and navigations
const subdomainIdCache = {};

/**
 * Get the hostname key to send to the backend resolver, or null when no
 * hostname-based resolution should be attempted (localhost / preview / system).
 *
 * Returns:
 *   - localhost / 127.0.0.1                       → null (use dev fallback)
 *   - *.preview.emergentagent.com                 → null (Emergent preview host)
 *   - mygenie.online (bare base)                  → null
 *   - <system>.mygenie.online (admin/api/cdn/app) → null
 *   - hyatt.mygenie.online                        → "hyatt.mygenie.online"
 *   - sattivikdelights.com                        → "sattivikdelights.com"
 *   - www.sattivikdelights.com                    → "sattivikdelights.com" (www stripped)
 *
 * @returns {string|null}
 */
export const getSubdomain = () => {
  const rawHostname = (window.location.hostname || '').toLowerCase();

  // Development — localhost / loopback / *.localhost
  if (
    rawHostname === 'localhost' ||
    rawHostname.startsWith('127.0.0.1') ||
    rawHostname.endsWith('.localhost')
  ) {
    return null;
  }

  // Emergent preview platform hosts — not customer-facing tenant domains
  if (rawHostname.endsWith('.preview.emergentagent.com')) {
    return null;
  }

  // Normalise: strip a single leading "www." prefix so custom domains and their
  // www. equivalents share one resolver key.
  const hostname = rawHostname.replace(/^www\./, '');

  // Bare base domain (the platform's own marketing site, not a tenant)
  if (hostname === 'mygenie.online') {
    return null;
  }

  const parts = hostname.split('.');

  // Bare / single-label hostnames are not resolvable
  if (parts.length < 2) {
    return null;
  }

  // *.mygenie.online tenant subdomains — keep existing behaviour
  if (hostname.endsWith('.mygenie.online')) {
    // System subdomains are not tenants
    const firstLabel = parts[0];
    const systemSubdomains = ['admin', 'api', 'cdn', 'app'];
    if (systemSubdomains.includes(firstLabel)) {
      return null;
    }
    return hostname; // e.g. "hyatt.mygenie.online"
  }

  // White-label custom domain — send full hostname (post www-strip) as resolver key
  return hostname;
};

/**
 * Get restaurant identifier (ID or subdomain → resolved to numeric ID)
 * Priority: Path > Query > Resolved subdomain ID > Raw subdomain > Env > Default
 */
export const useRestaurantId = () => {
  const params = useParams();
  const [searchParams] = useSearchParams();

  // 1. Try path parameter first (e.g., /478)
  const pathRestaurantId = params.restaurantId || params.id;

  // 2. Try query parameter (e.g., ?id=478)
  const queryRestaurantId = searchParams.get('id') || searchParams.get('restaurantId');

  // 3. Try subdomain (e.g., hyatt.mygenie.online)
  const subdomain = getSubdomain();

  const needsResolution = !pathRestaurantId && !queryRestaurantId && !!subdomain;

  // Initialize from cache for instant hit on subsequent navigations
  const [resolvedId, setResolvedId] = useState(
    needsResolution ? subdomainIdCache[subdomain] || null : null
  );

  // Resolve subdomain → numeric ID via API (one-time per subdomain)
  useEffect(() => {
    if (!needsResolution) return;

    // Already cached
    if (subdomainIdCache[subdomain]) {
      setResolvedId(subdomainIdCache[subdomain]);
      return;
    }

    getRestaurantDetails(subdomain)
      .then(data => {
        if (data?.id) {
          const numericId = String(data.id);
          subdomainIdCache[subdomain] = numericId;
          setResolvedId(numericId);
        }
      })
      .catch(() => {
        // Resolution failed — subdomain string will be used as fallback
      });
  }, [subdomain, needsResolution]);

  // 4. Fallback chain
  const envRestaurantId = process.env.REACT_APP_RESTAURANT_ID;
  const defaultRestaurantId = "478"; // 18march - hardcoded for preview

  // Priority: path > query > resolved numeric ID > (null while resolving) > env > default
  const restaurantId =
    pathRestaurantId ||
    queryRestaurantId ||
    resolvedId ||
    (needsResolution ? null : (subdomain || envRestaurantId || defaultRestaurantId));

  const isSubdomainMode = needsResolution;

  return {
    restaurantId,
    isSubdomainMode,
    subdomain,
  };
};

export default useRestaurantId;
