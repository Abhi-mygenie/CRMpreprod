import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useRestaurantId } from '../utils/useRestaurantId';
import logger from '../utils/logger';

/**
 * Hook to manage scanned table/room information from QR code
 * Reads from URL params and persists in sessionStorage
 * 
 * @returns {Object} { tableId, tableNo, roomOrTable, orderType, isScanned, clearScannedTable }
 */
export const useScannedTable = () => {
  const { restaurantId } = useRestaurantId();
  const [searchParams] = useSearchParams();
  const [scannedTable, setScannedTable] = useState(null);

  useEffect(() => {
    if (!restaurantId) return;

    const storageKey = `scanned_table_${restaurantId}`;
    
    // Check URL params for new scan
    const urlTableId = searchParams.get('tableId') || searchParams.get('table_id');
    const urlTableNo = searchParams.get('tableName') || searchParams.get('table_no');
    const urlType = searchParams.get('type'); // "table" | "room" | "walkin" | null
    const urlOrderType = searchParams.get('orderType') || searchParams.get('order_type'); // "dinein" | "delivery" | "takeaway" | null
    const urlFoodFor = searchParams.get('foodFor') || searchParams.get('food_for'); // menu filter e.g. "Normal", "Party"
    
    if (urlTableId || urlTableNo || urlOrderType) {
      // Validate type parameter — recognize table, room, and walkin
      const roomOrTable = (urlType === 'room' || urlType === 'table' || urlType === 'walkin') 
        ? urlType 
        : null;
      
      // Validate orderType - default to 'dinein' if invalid/missing
      // NOTE: 'dinein' default is intentional for backward compatibility — old QR codes lack orderType param
      const orderType = (urlOrderType === 'dinein' || urlOrderType === 'delivery' || urlOrderType === 'takeaway' || urlOrderType === 'take_away')
        ? urlOrderType
        : 'dinein';
      
      const newTable = {
        table_id: urlTableId,
        table_no: urlTableNo,
        room_or_table: roomOrTable,
        order_type: orderType,
        food_for: urlFoodFor || null
      };
      
      // Always overwrite on new scan
      sessionStorage.setItem(storageKey, JSON.stringify(newTable));
      setScannedTable(newTable);
      return;
    }
    
    // If no URL params, check sessionStorage (existing scan)
    try {
      const stored = sessionStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        setScannedTable(parsed);
      } else {
        setScannedTable(null);
      }
    } catch (error) {
      logger.error('table', 'Error reading scanned table:', error);
      setScannedTable(null);
    }
  }, [restaurantId, searchParams]);

  return {
    tableId: scannedTable?.table_id || null,
    tableNo: scannedTable?.table_no || null,
    roomOrTable: scannedTable?.room_or_table || null,
    orderType: scannedTable?.order_type || null,
    foodFor: scannedTable?.food_for || null,
    isScanned: !!scannedTable,
    /** Update orderType in sessionStorage (for mode switching between takeaway/delivery) */
    updateOrderType: (newOrderType) => {
      if (!restaurantId || !scannedTable) return;
      const updated = { ...scannedTable, order_type: newOrderType };
      const storageKey = `scanned_table_${restaurantId}`;
      sessionStorage.setItem(storageKey, JSON.stringify(updated));
      setScannedTable(updated);
    },
    clearScannedTable: () => {
      if (restaurantId) {
        sessionStorage.removeItem(`scanned_table_${restaurantId}`);
        setScannedTable(null);
      }
    }
  };
};
