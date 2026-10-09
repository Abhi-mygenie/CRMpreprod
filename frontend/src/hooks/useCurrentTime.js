import { useState, useEffect } from 'react';

/**
 * Hook to get current time in seconds since midnight
 * Updates every 60 seconds to automatically show/hide Add buttons
 * when time boundaries are crossed
 * 
 * @returns {number} Current time in seconds since midnight (0-86399)
 * @example
 * const currentTimeInSeconds = useCurrentTime();
 * // Returns: 43200 (if current time is 12:00:00)
 */
export const useCurrentTime = () => {
  const [currentTimeInSeconds, setCurrentTimeInSeconds] = useState(() => {
    // Initialize with current time
    const now = new Date();
    return (now.getHours() * 3600) + (now.getMinutes() * 60) + now.getSeconds();
  });

  useEffect(() => {
    // Update immediately on mount
    const updateTime = () => {
      const now = new Date();
      const seconds = (now.getHours() * 3600) + (now.getMinutes() * 60) + now.getSeconds();
      setCurrentTimeInSeconds(seconds);
    };

    // Update every 60 seconds
    const interval = setInterval(updateTime, 60000); // 60000ms = 60 seconds

    // Cleanup interval on unmount
    return () => clearInterval(interval);
  }, []); // Empty dependency array - only run once on mount

  return currentTimeInSeconds;
};
