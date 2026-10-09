import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * useNotificationPopup — Handles delay, auto-dismiss, and popup selection for a given page.
 * 
 * @param {string} page - Current page identifier: "landing", "review", or "success"
 * @param {Array} popups - notificationPopups array from restaurant config
 * @returns {{ popup: object|null, isVisible: boolean, dismiss: function, secondsRemaining: number|null }}
 */
const useNotificationPopup = (page, popups = []) => {
  const [isVisible, setIsVisible] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(null);
  const delayTimerRef = useRef(null);
  const dismissTimerRef = useRef(null);
  const countdownRef = useRef(null);

  // Find first enabled popup for this page
  const popup = popups.find(p => p.enabled && p.showOn === page) || null;

  const dismiss = useCallback(() => {
    setIsVisible(false);
    setSecondsRemaining(null);
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
  }, []);

  // Stable key: re-trigger when popup appears/changes (handles stale cache → fresh API update)
  const popupKey = popup ? `${popup.id}_${popup.enabled}_${popup.delaySeconds}_${popup.autoDismissSeconds}` : 'none';

  useEffect(() => {
    // Reset on page/popup change
    setIsVisible(false);
    setSecondsRemaining(null);

    if (!popup) return;

    const delay = (popup.delaySeconds || 3) * 1000;

    delayTimerRef.current = setTimeout(() => {
      setIsVisible(true);

      // Auto-dismiss logic
      const autoDismiss = popup.autoDismissSeconds || 0;
      if (autoDismiss > 0) {
        setSecondsRemaining(autoDismiss);

        // Countdown every second
        let remaining = autoDismiss;
        countdownRef.current = setInterval(() => {
          remaining -= 1;
          setSecondsRemaining(remaining);
          if (remaining <= 0) {
            clearInterval(countdownRef.current);
          }
        }, 1000);

        // Dismiss after full duration
        dismissTimerRef.current = setTimeout(() => {
          setIsVisible(false);
          setSecondsRemaining(null);
          if (countdownRef.current) clearInterval(countdownRef.current);
        }, autoDismiss * 1000);
      }
    }, delay);

    // Cleanup on unmount or popup/page change
    return () => {
      if (delayTimerRef.current) clearTimeout(delayTimerRef.current);
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [page, popupKey]);

  return { popup, isVisible, dismiss, secondsRemaining };
};

export default useNotificationPopup;
