import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { GoogleMap, useJsApiLoader, Marker } from '@react-google-maps/api';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useRestaurantConfig } from '../context/RestaurantConfigContext';
import { crmGetAddresses, crmAddAddress, crmDeleteAddress, crmSetDefaultAddress } from '../api/services/crmService';
import { IoArrowBack, IoLocationOutline, IoAddCircleOutline, IoTrashOutline, IoCheckmarkCircle, IoNavigate, IoSearchOutline, IoCloseCircle } from 'react-icons/io5';
import { MdOutlineDeliveryDining, MdOutlineHome, MdOutlineWork, MdOutlineLocationOn, MdMyLocation } from 'react-icons/md';
import toast from 'react-hot-toast';
import './DeliveryAddress.css';

const GOOGLE_MAPS_API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || '';
const MANAGE_BASE_URL = process.env.REACT_APP_IMAGE_BASE_URL || 'https://manage.mygenie.online';
const GOOGLE_MAPS_LIBRARIES = ['places'];

const MAP_CONTAINER_STYLE = { width: '100%', height: '100%' };
const DEFAULT_CENTER = { lat: 31.0397, lng: 77.1245 }; // Shoghi (restaurant fallback)
const MAP_OPTIONS = {
  disableDefaultUI: true,
  zoomControl: true,
  gestureHandling: 'greedy',
  styles: [
    { featureType: 'poi', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  ],
};

const ADDRESS_TYPE_ICONS = {
  Home: MdOutlineHome,
  Work: MdOutlineWork,
  Other: MdOutlineLocationOn,
};

const isValidCoordinate = (value) => Number.isFinite(Number(value));

const hasValidLatLng = (lat, lng) => isValidCoordinate(lat) && isValidCoordinate(lng);

const buildGeocodeQuery = (addr = {}) => (
  [addr.address, addr.house, addr.road, addr.city, addr.state, addr.pincode]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean)
    .join(', ')
);

const DeliveryAddress = () => {
  const navigate = useNavigate();
  const { restaurantId } = useParams();
  const { crmToken, isCustomer, user, setRestaurantScope } = useAuth();
  const { setDeliveryAddress, setDeliveryCharge, getTotalPrice } = useCart(); // BUG-2026-02-XX-001 — getTotalPrice added
  const { primaryColor, buttonTextColor } = useRestaurantConfig();

  // Google Maps loader
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  // State
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Map state
  const [mapCenter, setMapCenter] = useState(DEFAULT_CENTER);
  const [markerPos, setMarkerPos] = useState(DEFAULT_CENTER);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [geoLoading, setGeoLoading] = useState(false);
  // Tracks whether the browser permission for geolocation is currently
  // 'denied' (set proactively on mount via Permissions API, and also set
  // when getCurrentPosition fires the error callback). Drives the inline
  // help block on the empty-hero. Cleared when GPS later succeeds.
  const [geoBlocked, setGeoBlocked] = useState(false);
  const mapRef = useRef(null);

  // Distance API state
  const [distanceResult, setDistanceResult] = useState(null); // { shipping_status, shipping_charge, shipping_time, distance_km }
  const [distanceLoading, setDistanceLoading] = useState(false);
  const distanceTimerRef = useRef(null);

  // Reverse geocode state
  const [reverseAddress, setReverseAddress] = useState('');

  // Form state
  const [form, setForm] = useState({
    address_type: 'Home',
    address: '',
    house: '',
    floor: '',
    road: '',
    city: '',
    state: '',
    pincode: '',
    latitude: '',
    longitude: '',
    contact_person_name: '',
    contact_person_number: '',
    delivery_instructions: '',
  });

  // Places Autocomplete state
  const [searchQuery, setSearchQuery] = useState('');
  const [predictions, setPredictions] = useState([]);
  const [showPredictions, setShowPredictions] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const sessionTokenRef = useRef(null);
  const searchTimerRef = useRef(null);
  const searchInputRef = useRef(null);

  // ============================================
  // Auth guard + restaurant scope
  // ============================================
  useEffect(() => {
    if (restaurantId) {
      setRestaurantScope(restaurantId);
    }
  }, [restaurantId, setRestaurantScope]);

  useEffect(() => {
    if (!crmToken || !isCustomer) {
      navigate(`/${restaurantId || ''}`);
      return;
    }
    fetchAddresses();
  }, [crmToken, isCustomer]);

  // ============================================
  // Proactive permission detection
  // If the browser has the site's location permission set to 'denied',
  // surface the inline help block immediately so the user doesn't have
  // to click and watch a silent fail. Permissions API isn't universal,
  // so we silently no-op on browsers that lack it (the click path still
  // catches the error and flips geoBlocked).
  // ============================================
  useEffect(() => {
    if (!navigator.permissions || !navigator.permissions.query) return;
    let cancelled = false;
    let permStatus = null;
    navigator.permissions
      .query({ name: 'geolocation' })
      .then((status) => {
        if (cancelled) return;
        permStatus = status;
        setGeoBlocked(status.state === 'denied');
        status.onchange = () => {
          setGeoBlocked(status.state === 'denied');
        };
      })
      .catch(() => { /* Permissions API failed — ignore, click path still works */ });
    return () => {
      cancelled = true;
      if (permStatus) permStatus.onchange = null;
    };
  }, []);

  // ============================================
  // Fetch saved addresses from CRM
  // ============================================
  const fetchAddresses = async () => {
    setLoading(true);
    let needsGpsAutoDetect = false;
    try {
      const data = await crmGetAddresses(crmToken);
      const addrs = data.addresses || [];
      setAddresses(addrs);
      // Pre-select ONLY the explicit default address. If no default exists,
      // we no longer auto-pick the first saved address — instead we trigger
      // GPS auto-detection below so the user isn't shown a misleading
      // fallback map center as if it were a chosen delivery address.
      const defaultAddr = addrs.find(a => a.is_default);
      if (defaultAddr) {
        setSelectedId(defaultAddr.id);
        if (defaultAddr.latitude && defaultAddr.longitude) {
          const pos = { lat: parseFloat(defaultAddr.latitude), lng: parseFloat(defaultAddr.longitude) };
          setMapCenter(pos);
          setMarkerPos(pos);
          checkDistance(pos.lat, pos.lng);
        }
      } else {
        needsGpsAutoDetect = true;
      }
    } catch (err) {
      toast.error('Failed to load addresses');
    } finally {
      setLoading(false);
    }
    // Trigger GPS auto-detection AFTER the loading skeleton clears so the
    // user sees "Detecting your current location..." in the header, not the
    // address-fetch spinner.
    if (needsGpsAutoDetect) {
      applyCurrentLocation();
    }
  };

  // ============================================
  // Browser geolocation — request + apply in one shot
  // Shared by:
  //   - initial auto-detection when no default saved address exists
  //   - manual "Use Current Location" button
  // ============================================
  const applyCurrentLocation = (populateForm = false) => {
    if (!navigator.geolocation) return;
    setGeoLoading(true);
    setSelectedId(null); // GPS overrides any saved-card selection
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const pos = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setCurrentLocation(pos);
        setMarkerPos(pos);
        setMapCenter(pos);
        setGeoLoading(false);
        setGeoBlocked(false); // GPS works — clear any stale 'blocked' state
        checkDistance(pos.lat, pos.lng);
        if (populateForm && GOOGLE_MAPS_API_KEY) {
          // Rich reverse-geocode to auto-fill form fields (city/state/pincode).
          // Mirrors the addressComponents extraction used by handleSelectPrediction
          // so the Places-pick and Use-Current-Location paths feel consistent.
          try {
            const res = await fetch(
              `https://maps.googleapis.com/maps/api/geocode/json?latlng=${pos.lat},${pos.lng}&key=${GOOGLE_MAPS_API_KEY}`
            );
            const data = await res.json();
            const result = data?.results?.[0];
            if (result) {
              setReverseAddress(result.formatted_address || '');
              const comps = result.address_components || [];
              const getComp = (type) => {
                const c = comps.find((x) => x.types.includes(type));
                return c ? c.long_name : '';
              };
              const city = getComp('locality')
                || getComp('administrative_area_level_2')
                || getComp('sublocality_level_1');
              const state = getComp('administrative_area_level_1');
              const pincode = getComp('postal_code');
              setForm((prev) => ({
                ...prev,
                address: result.formatted_address || prev.address,
                city: city || prev.city,
                state: state || prev.state,
                pincode: pincode || prev.pincode,
                latitude: String(pos.lat),
                longitude: String(pos.lng),
              }));
            }
          } catch {
            // Silent fail — map/header/distance are already updated.
          }
        } else {
          reverseGeocode(pos.lat, pos.lng);
        }
      },
      (err) => {
        setGeoLoading(false);
        // err.code === 1 → PERMISSION_DENIED. Surface the inline help block
        // so the user knows the click didn't fail silently. Other error
        // codes (POSITION_UNAVAILABLE=2, TIMEOUT=3) don't mean permission
        // is blocked, so we don't set geoBlocked for those.
        if (err && err.code === 1) {
          setGeoBlocked(true);
        }
        // No fallback selection — header reads "No delivery address selected"
        // and Confirm & Proceed stays disabled. User can still search, drag
        // pin, add an address, or pick a saved card.
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleUseCurrentLocation = () => applyCurrentLocation();
  const handleFormUseCurrentLocation = () => applyCurrentLocation(true);

  // ============================================
  // Reverse geocode (lat/lng → address text)
  // ============================================
  const reverseGeocode = useCallback(async (lat, lng) => {
    if (!GOOGLE_MAPS_API_KEY || !hasValidLatLng(lat, lng)) return;
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}`
      );
      const data = await res.json();
      if (data.results && data.results[0]) {
        setReverseAddress(data.results[0].formatted_address);
      }
    } catch {
      // Silent fail
    }
  }, []);

  // ============================================
  // Distance API — debounced
  // ============================================
  const checkDistance = useCallback((lat, lng) => {
    if (distanceTimerRef.current) clearTimeout(distanceTimerRef.current);

    if (!hasValidLatLng(lat, lng) || !restaurantId) {
      setDistanceLoading(false);
      setDistanceResult(null);
      return;
    }

    setDistanceLoading(true);
    setDistanceResult(null);

    distanceTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`${MANAGE_BASE_URL}/api/v1/config/distance-api-new`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            destination_lat: String(lat),
            destination_lng: String(lng),
            restaurant_id: String(restaurantId),
            order_value: String(getTotalPrice() || 0), // BUG-2026-02-XX-001 — pass actual cart total so distance API returns correct shipping_charge
          }),
        });
        const data = await res.json();
        setDistanceResult(data);
      } catch {
        setDistanceResult({ shipping_status: 'Error' });
      } finally {
        setDistanceLoading(false);
      }
    }, 500);
  }, [restaurantId, getTotalPrice]); // BUG-2026-02-XX-001 — getTotalPrice added to deps so re-check fires on cart change

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (distanceTimerRef.current) clearTimeout(distanceTimerRef.current);
    };
  }, []);

  // ============================================
  // Address selection
  // ============================================
  const handleSelectAddress = (addr) => {
    setSelectedId(addr.id);
    setReverseAddress('');
    if (hasValidLatLng(addr.latitude, addr.longitude)) {
      const pos = { lat: parseFloat(addr.latitude), lng: parseFloat(addr.longitude) };
      setMarkerPos(pos);
      setMapCenter(pos);
      checkDistance(pos.lat, pos.lng);
    } else {
      // Address without lat/lng — try geocoding the address text
      geocodeAddress(addr);
    }
  };

  const geocodeAddress = async (addr) => {
    if (!GOOGLE_MAPS_API_KEY) {
      toast.error('Cannot locate this address (no map key)');
      return;
    }

    const query = buildGeocodeQuery(addr);
    if (!query) {
      toast.error('This address needs more details before we can locate it');
      return;
    }

    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${GOOGLE_MAPS_API_KEY}`
      );
      const data = await res.json();
      if (data.results && data.results[0]) {
        const loc = data.results[0].geometry.location;
        const pos = { lat: loc.lat, lng: loc.lng };
        setMarkerPos(pos);
        setMapCenter(pos);
        checkDistance(pos.lat, pos.lng);
      } else {
        toast.error('Could not locate this address on map');
      }
    } catch {
      toast.error('Failed to geocode address');
    }
  };

  // ============================================
  // Map pin drag
  // ============================================
  const handleMarkerDragEnd = (e) => {
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();
    setMarkerPos({ lat, lng });
    setSelectedId(null); // Deselect saved address since pin was moved
    reverseGeocode(lat, lng);
    checkDistance(lat, lng);
  };

  const onMapLoad = useCallback((map) => {
    mapRef.current = map;
  }, []);

  // ============================================
  // Add new address
  // ============================================
  const handleAddAddress = async () => {
    if (!form.address.trim()) {
      toast.error('Please enter an address');
      return;
    }
    if (!form.contact_person_name.trim() || !form.contact_person_number.trim()) {
      toast.error('Please enter contact name and number');
      return;
    }
    setSaving(true);
    try {
      // If form doesn't have lat/lng, use current marker position
      const submitForm = { ...form };
      if (!submitForm.latitude && markerPos) {
        submitForm.latitude = String(markerPos.lat);
        submitForm.longitude = String(markerPos.lng);
      }
      const newAddr = await crmAddAddress(crmToken, submitForm);
      setAddresses(prev => [...prev, newAddr]);
      setSelectedId(newAddr.id);
      setShowForm(false);
      resetForm();
      toast.success('Address added');
      // Check distance for new address
      if (newAddr.latitude && newAddr.longitude) {
        const pos = { lat: parseFloat(newAddr.latitude), lng: parseFloat(newAddr.longitude) };
        setMarkerPos(pos);
        setMapCenter(pos);
        checkDistance(pos.lat, pos.lng);
      }
    } catch (err) {
      toast.error(err.message || 'Failed to add address');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (addrId) => {
    try {
      await crmDeleteAddress(crmToken, addrId);
      setAddresses(prev => prev.filter(a => a.id !== addrId));
      if (selectedId === addrId) {
        const remaining = addresses.filter(a => a.id !== addrId);
        if (remaining.length > 0) {
          handleSelectAddress(remaining[0]);
        } else {
          setSelectedId(null);
          setDistanceResult(null);
        }
      }
      toast.success('Address deleted');
    } catch {
      toast.error('Failed to delete address');
    }
  };

  const handleSetDefault = async (addrId) => {
    try {
      await crmSetDefaultAddress(crmToken, addrId);
      setAddresses(prev => prev.map(a => ({ ...a, is_default: a.id === addrId })));
    } catch {
      toast.error('Failed to set default');
    }
  };

  // ============================================
  // Continue to menu
  // ============================================
  const handleContinue = () => {
    const selected = addresses.find(a => a.id === selectedId);

    // Build address object for cart
    const addressForCart = selected || {
      address: reverseAddress,
      latitude: String(markerPos.lat),
      longitude: String(markerPos.lng),
    };

    if (!addressForCart.latitude && !markerPos) {
      toast.error('Please select a delivery address');
      return;
    }

    // Ensure lat/lng from marker if missing
    if (!addressForCart.latitude) {
      addressForCart.latitude = String(markerPos.lat);
      addressForCart.longitude = String(markerPos.lng);
    }

    // Store in cart
    setDeliveryAddress(addressForCart);
    setDeliveryCharge(distanceResult?.shipping_charge || 0);
    navigate(`/${restaurantId}/menu`);
  };

  const resetForm = () => {
    setForm({
      address_type: 'Home', address: '', house: '', floor: '', road: '',
      city: '', state: '', pincode: '', latitude: '', longitude: '',
      contact_person_name: user?.name?.trim() || '',
      contact_person_number: user?.phone || '',
      delivery_instructions: '',
    });
    setSearchQuery('');
    setPredictions([]);
    setShowPredictions(false);
  };

  const updateField = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  // ============================================
  // Google Places Autocomplete (New API)
  // ============================================

  // Create a new session token for billing grouping
  const getSessionToken = () => {
    if (!sessionTokenRef.current && window.google) {
      sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
    }
    return sessionTokenRef.current;
  };

  // Reset session token after a place is selected (new session for next search)
  const resetSessionToken = () => {
    sessionTokenRef.current = null;
  };

  // Debounced search for place predictions (New API)
  const handleSearchChange = (value) => {
    setSearchQuery(value);
    if (!value.trim()) {
      setPredictions([]);
      setShowPredictions(false);
      return;
    }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    setSearchLoading(true);

    searchTimerRef.current = setTimeout(async () => {
      if (!isLoaded || !window.google?.maps?.places?.AutocompleteSuggestion) {
        setSearchLoading(false);
        return;
      }
      try {
        const { suggestions } = await window.google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: value,
          sessionToken: getSessionToken(),
          includedRegionCodes: ['in'],
        });
        setPredictions(suggestions || []);
        setShowPredictions((suggestions || []).length > 0);
      } catch {
        setPredictions([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
  };

  // When user selects a prediction (New API)
  const handleSelectPrediction = async (suggestion) => {
    setShowPredictions(false);
    const pred = suggestion.placePrediction;
    setSearchQuery(pred.text?.text || '');

    try {
      const place = pred.toPlace();
      await place.fetchFields({ fields: ['location', 'addressComponents', 'formattedAddress'] });

      const lat = place.location.lat();
      const lng = place.location.lng();
      const components = place.addressComponents || [];

      // Extract address components from new API format
      const getComponent = (type) => {
        const comp = components.find(c => c.types.includes(type));
        return comp ? comp.longText : '';
      };

      const city = getComponent('locality')
        || getComponent('administrative_area_level_2')
        || getComponent('sublocality_level_1');
      const state = getComponent('administrative_area_level_1');
      const pincode = getComponent('postal_code');

      // Auto-populate form fields
      setForm(prev => ({
        ...prev,
        address: place.formattedAddress || pred.text?.text || '',
        city,
        state,
        pincode,
        latitude: String(lat),
        longitude: String(lng),
      }));

      // Move map pin and check delivery distance
      const pos = { lat, lng };
      setMarkerPos(pos);
      setMapCenter(pos);
      // Populate reverseAddress so Confirm & Proceed enables for first-time users
      // who pick a Places suggestion without opening "Add New Address".
      setReverseAddress(place.formattedAddress || pred.text?.text || '');
      // A Places pick is an explicit override of any saved card selection
      setSelectedId(null);
      checkDistance(lat, lng);

      // Reset session token after place selection (billing best practice)
      resetSessionToken();
    } catch {
      toast.error('Failed to get place details');
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setPredictions([]);
    setShowPredictions(false);
  };

  // Cleanup search timer
  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  // ============================================
  // Derived state
  // ============================================
  const isDeliverable = distanceResult?.shipping_status === 'Yes';
  const isNotDeliverable = distanceResult?.shipping_status === 'No';
  const isDistanceError = distanceResult?.shipping_status === 'Error';
  const selectedAddress = addresses.find(a => a.id === selectedId);
  const displayAddress = selectedAddress
    ? [selectedAddress.house, selectedAddress.address, selectedAddress.city].filter(Boolean).join(', ')
    : reverseAddress || '';
  const headerText = geoLoading
    ? 'Detecting your current location...'
    : (displayAddress || 'No delivery address selected');
  const showHeaderHint = !geoLoading && !displayAddress;
  // Hide the map marker until the user has a real address source. This
  // prevents the fallback/default map center (e.g. Shoghi) from being
  // mis-read as a chosen delivery location.
  const hasActiveAddress = Boolean(selectedId) || Boolean(reverseAddress);

  // BUG-2026-02-XX-001 R1: Re-check delivery charge when cart total changes after address load.
  // cartTotal drives this effect; checkDistance already handles the 500ms debounce internally.
  const cartTotal = getTotalPrice();
  useEffect(() => {
    if (!markerPos || !hasActiveAddress) return;
    checkDistance(markerPos.lat, markerPos.lng);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartTotal]); // intentional: only cartTotal; address/marker changes already trigger via their own handlers

  // Empty-hero state: no saved addresses, no active selection/reverse address,
  // and the form isn't open. In this state we hide the map (Shoghi fallback
  // was confusing) and show a centred primary CTA instead.
  const showEmptyHero = !hasActiveAddress && addresses.length === 0 && !showForm;

  // ============================================
  // Render
  // ============================================
  if (loading) {
    return (
      <div className="delivery-address-page" data-testid="delivery-address-loading">
        <div className="delivery-header">
          <button className="da-back-btn" onClick={() => navigate(-1)} data-testid="delivery-back-btn">
            <IoArrowBack />
          </button>
          <h1 className="delivery-title">Delivery Address</h1>
        </div>
        <div className="delivery-loading">Loading addresses...</div>
      </div>
    );
  }

  return (
    <div className="delivery-address-page" data-testid="delivery-address-page">
      {/* Header */}
      <div className="delivery-header">
        <button className="da-back-btn" onClick={() => navigate(-1)} data-testid="delivery-back-btn">
          <IoArrowBack />
        </button>
        <h1 className="delivery-title">
          <MdOutlineDeliveryDining className="delivery-title-icon" />
          Delivery Address
        </h1>
      </div>

      {/* Map Section — hidden in empty-hero state so the fallback map does
          not push primary CTAs below the fold. */}
      {showEmptyHero ? (
        <div className="da-empty-hero" data-testid="empty-state-hero">
          <div className="da-empty-hero-icon" aria-hidden="true">
            <MdMyLocation />
          </div>
          <h2 className="da-empty-hero-title">Where should we deliver?</h2>
          <button
            type="button"
            className="da-empty-hero-primary"
            onClick={handleUseCurrentLocation}
            disabled={geoLoading}
            data-testid="empty-state-use-current-location-btn"
          >
            <MdMyLocation className="da-empty-hero-primary-icon" />
            <span>{geoLoading ? 'Detecting your current location...' : 'Use Current Location'}</span>
          </button>
          {/* Inline help when the browser has Location permission blocked.
              Visible only when geoBlocked is true. The primary button stays
              clickable above so the user can retry after fixing permission
              in another tab. */}
          {geoBlocked && (
            <p
              className="da-empty-hero-blocked"
              data-testid="empty-state-geo-blocked-help"
              role="alert"
            >
              <span className="da-empty-hero-blocked-icon" aria-hidden="true">⚠</span>
              <span>
                <strong>Location is blocked.</strong> Tap the lock icon
                {' '}(<span aria-hidden="true">🔒</span>) in your address bar →
                {' '}Location → <strong>Allow</strong>, or use{' '}
                <strong>Add New Address</strong> below.
              </span>
            </p>
          )}
          <button
            type="button"
            className="da-empty-hero-secondary"
            onClick={() => { resetForm(); setShowForm(true); }}
            data-testid="add-address-btn"
          >
            <IoAddCircleOutline /> Add New Address
          </button>
        </div>
      ) : (
        <div className="da-map-container" data-testid="map-container">
          {isLoaded ? (
            <GoogleMap
              mapContainerStyle={MAP_CONTAINER_STYLE}
              center={mapCenter}
              zoom={15}
              options={MAP_OPTIONS}
              onLoad={onMapLoad}
            >
              {hasActiveAddress && (
                <Marker
                  position={markerPos}
                  draggable
                  onDragEnd={handleMarkerDragEnd}
                />
              )}
            </GoogleMap>
          ) : (
            <div className="da-map-placeholder">Loading map...</div>
          )}
          {/* Use Current Location button on map */}
          <button
            className="da-current-location-btn"
            onClick={handleUseCurrentLocation}
            disabled={geoLoading}
            data-testid="use-current-location-btn"
          >
            <MdMyLocation />
          </button>
        </div>
      )}

      {/* Selected address display — DELIVERING TO header */}
      <div className="da-delivering-header" data-testid="delivering-to-header">
        <span className="da-delivering-label">DELIVERING TO:</span>
        <span className="da-delivering-text" data-testid="delivering-to-text">
          {headerText}
        </span>
        {showHeaderHint && (
          <span className="da-delivering-hint" data-testid="delivering-to-hint">
            Search, use current location, or add a new address to continue.
          </span>
        )}
      </div>

      {/* Distance result bar */}
      <div className="da-distance-bar" data-testid="distance-bar">
        {distanceLoading && (
          <div className="da-distance-checking" data-testid="distance-checking">
            Checking delivery availability...
          </div>
        )}
        {isDeliverable && !distanceLoading && (
          <div className="da-distance-ok" data-testid="distance-ok">
            <MdOutlineDeliveryDining className="da-distance-icon" />
            <span className="da-distance-charge">
              {distanceResult.shipping_charge > 0
                ? `Delivery: ₹${distanceResult.shipping_charge}`
                : 'Free Delivery'}
            </span>
            <span className="da-distance-dot">•</span>
            <span className="da-distance-time">{distanceResult.shipping_time}</span>
            <span className="da-distance-dot">•</span>
            <span className="da-distance-km">{distanceResult.distance}</span>
          </div>
        )}
        {isNotDeliverable && !distanceLoading && (
          <div className="da-distance-no" data-testid="distance-not-available">
            <div>Delivery not available to this location ({distanceResult.distance})</div>
            <div className="da-distance-no-hint" data-testid="distance-not-available-hint">
              Please choose another address closer to the restaurant.
            </div>
          </div>
        )}
        {isDistanceError && !distanceLoading && (
          <div className="da-distance-error" data-testid="distance-error">
            Unable to check delivery. Please try again.
          </div>
        )}
      </div>

      {/* Saved Addresses — hidden in empty-hero state (hero already provides
          the primary actions, so the redundant "No saved addresses" block
          and duplicate Add New Address button are suppressed). */}
      {!showEmptyHero && (
        <>
          <div className="da-section-label">Saved Addresses</div>
          <div className="da-addresses-scroll" data-testid="delivery-addresses-list">
            {addresses.length === 0 && !showForm ? (
              <div className="da-empty" data-testid="no-addresses">
                <IoLocationOutline className="da-empty-icon" />
                <p>No saved addresses</p>
              </div>
            ) : (
          addresses.map((addr) => {
            const TypeIcon = ADDRESS_TYPE_ICONS[addr.address_type] || MdOutlineLocationOn;
            const isSelected = selectedId === addr.id;
            return (
              <div
                key={addr.id}
                className={`da-address-card ${isSelected ? 'da-card-selected' : ''}`}
                onClick={() => handleSelectAddress(addr)}
                data-testid={`address-card-${addr.id}`}
              >
                <div className="da-card-left">
                  <TypeIcon className="da-card-type-icon" />
                </div>
                <div className="da-card-content">
                  <div className="da-card-type-row">
                    <span className="da-card-type-label">{addr.address_type || 'Address'}</span>
                    {addr.is_default && <span className="da-card-default">Default</span>}
                    {isSelected && (
                      <span
                        className="da-card-selected-pill"
                        data-testid={`selected-pill-${addr.id}`}
                      >
                        ● SELECTED
                      </span>
                    )}
                  </div>
                  <p className="da-card-address">
                    {[addr.house, addr.address, addr.city].filter(Boolean).join(', ')}
                  </p>
                  {addr.contact_person_name && (
                    <p className="da-card-contact">{addr.contact_person_name}</p>
                  )}
                </div>
                <div className="da-card-right">
                  {isSelected && <IoCheckmarkCircle className="da-card-check" />}
                  <div className="da-card-actions">
                    {!addr.is_default && (
                      <button
                        className="da-action-btn"
                        onClick={(e) => { e.stopPropagation(); handleSetDefault(addr.id); }}
                        title="Set default"
                        data-testid={`set-default-${addr.id}`}
                      >
                        <IoCheckmarkCircle />
                      </button>
                    )}
                    <button
                      className="da-action-btn da-delete-btn"
                      onClick={(e) => { e.stopPropagation(); handleDelete(addr.id); }}
                      title="Delete"
                      data-testid={`delete-address-${addr.id}`}
                    >
                      <IoTrashOutline />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}

        {/* Add New Address Button */}
        {!showForm && (
          <button
            className="da-add-btn"
            onClick={() => { resetForm(); setShowForm(true); }}
            data-testid="add-address-btn"
          >
            <IoAddCircleOutline /> Add New Address
          </button>
        )}
      </div>
        </>
      )}

      {/* Add Address Form */}
      {showForm && (
        <div className="da-form" data-testid="add-address-form">
          <h3 className="da-form-title">New Address</h3>
          <p className="da-form-hint">Search for your area to get started</p>

          <div className="da-type-toggle">
            {['Home', 'Work', 'Other'].map(t => (
              <button
                key={t}
                className={`da-type-option ${form.address_type === t ? 'da-type-active' : ''}`}
                onClick={() => updateField('address_type', t)}
                style={form.address_type === t ? { backgroundColor: primaryColor, color: buttonTextColor } : {}}
                data-testid={`type-${t.toLowerCase()}`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Places Autocomplete Search */}
          <div className="da-search-wrapper" data-testid="places-search-wrapper">
            <IoSearchOutline className="da-search-icon" />
            <input
              ref={searchInputRef}
              className="da-input da-search-input"
              placeholder="Search area, locality or landmark..."
              value={searchQuery}
              onChange={e => handleSearchChange(e.target.value)}
              onFocus={() => { if (predictions.length > 0) setShowPredictions(true); }}
              data-testid="places-search-input"
              autoComplete="off"
            />
            {searchQuery && (
              <button className="da-search-clear" onClick={clearSearch} data-testid="places-search-clear">
                <IoCloseCircle />
              </button>
            )}
            {showPredictions && predictions.length > 0 && (
              <div className="da-predictions-dropdown" data-testid="places-predictions">
                {predictions.map((s, idx) => (
                  <button
                    key={s.placePrediction?.placeId || idx}
                    className="da-prediction-item"
                    onClick={() => handleSelectPrediction(s)}
                    data-testid={`prediction-${s.placePrediction?.placeId || idx}`}
                  >
                    <IoLocationOutline className="da-prediction-icon" />
                    <div className="da-prediction-text">
                      <span className="da-prediction-main">{s.placePrediction?.mainText?.text}</span>
                      <span className="da-prediction-secondary">{s.placePrediction?.secondaryText?.text}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {searchLoading && (
              <div className="da-search-loading" data-testid="places-search-loading">Searching...</div>
            )}
          </div>

          {/* Use Current Location — clear, visible action in the form */}
          <button
            type="button"
            className="da-form-use-location-btn"
            onClick={handleFormUseCurrentLocation}
            disabled={geoLoading}
            data-testid="form-use-current-location-btn"
          >
            <MdMyLocation className="da-form-use-location-icon" />
            <span>{geoLoading ? 'Detecting your current location...' : 'Use Current Location'}</span>
          </button>

          {/* Auto-populated address (editable) */}
          <input className="da-input" placeholder="Full address *" value={form.address}
            onChange={e => updateField('address', e.target.value)} data-testid="input-address" />

          {/* Auto-populated city & pincode */}
          <div className="da-input-row">
            <input className="da-input" placeholder="City" value={form.city}
              onChange={e => updateField('city', e.target.value)} data-testid="input-city" />
            <input className="da-input" placeholder="Pincode" value={form.pincode}
              onChange={e => updateField('pincode', e.target.value)} data-testid="input-pincode" />
          </div>

          {/* Manual details */}
          <div className="da-input-row">
            <input className="da-input" placeholder="House / Flat No." value={form.house}
              onChange={e => updateField('house', e.target.value)} data-testid="input-house" />
            <input className="da-input" placeholder="Floor" value={form.floor}
              onChange={e => updateField('floor', e.target.value)} data-testid="input-floor" />
          </div>
          <input className="da-input" placeholder="Road / Landmark" value={form.road}
            onChange={e => updateField('road', e.target.value)} data-testid="input-road" />
          <input className="da-input" placeholder="Contact name *" value={form.contact_person_name}
            onChange={e => updateField('contact_person_name', e.target.value)} data-testid="input-contact-name" />
          <input className="da-input" placeholder="Contact phone *" value={form.contact_person_number}
            onChange={e => updateField('contact_person_number', e.target.value)} data-testid="input-contact-phone" />
          <input className="da-input" placeholder="Delivery instructions (optional)" value={form.delivery_instructions}
            onChange={e => updateField('delivery_instructions', e.target.value)} data-testid="input-instructions" />

          <div className="da-form-actions">
            <button className="da-cancel-btn" onClick={() => { setShowForm(false); resetForm(); }} data-testid="cancel-address-btn">
              Cancel
            </button>
            <button className="da-save-btn" onClick={handleAddAddress} disabled={saving}
              style={{ backgroundColor: primaryColor, color: buttonTextColor }} data-testid="save-address-btn">
              {saving ? 'Saving...' : 'Save Address'}
            </button>
          </div>
        </div>
      )}

      {/* Continue Button */}
      <div className="da-continue-wrapper">
        {(() => {
          const isContinueDisabled =
            distanceLoading || isNotDeliverable || (!selectedId && !reverseAddress);
          return (
            <button
              className="da-continue-btn"
              onClick={handleContinue}
              disabled={isContinueDisabled}
              style={{
                backgroundColor: isContinueDisabled ? '#ccc' : primaryColor,
                color: isContinueDisabled ? '#666' : buttonTextColor,
                cursor: isContinueDisabled ? 'not-allowed' : 'pointer',
              }}
              data-testid="continue-to-menu-btn"
            >
              {distanceLoading
                ? 'Checking...'
                : isNotDeliverable
                  ? 'Not Deliverable'
                  : 'Confirm & Proceed to Menu'}
            </button>
          );
        })()}
      </div>
    </div>
  );
};

export default DeliveryAddress;
