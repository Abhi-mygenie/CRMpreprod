import React, { useMemo } from 'react';
import Select from 'react-select';
import { MdOutlineTableRestaurant } from "react-icons/md";
import { FaDoorOpen } from "react-icons/fa";
import { hasAssignedTable } from '../../utils/orderTypeHelpers';

// Helper function to check if a string is purely numeric
const isNumeric = (str) => {
  return /^\d+$/.test(str);
};

// Helper function to extract numeric value for sorting
const getNumericValue = (str) => {
  const match = str.match(/\d+/);
  return match ? parseInt(match[0], 10) : Infinity;
};

// Sort function: numeric-first, then alphanumeric
const sortTableNumbers = (a, b) => {
  const aNum = isNumeric(a.table_no);
  const bNum = isNumeric(b.table_no);

  if (aNum && bNum) return parseInt(a.table_no, 10) - parseInt(b.table_no, 10);
  if (aNum && !bNum) return -1;
  if (!aNum && bNum) return 1;

  const aNumValue = getNumericValue(a.table_no);
  const bNumValue = getNumericValue(b.table_no);
  if (aNumValue !== bNumValue) return aNumValue - bNumValue;
  return a.table_no.localeCompare(b.table_no);
};

/**
 * TableRoomSelector — extracted from ReviewOrder.jsx (CA-008 Phase 1)
 * Handles both scanned table display and manual room/table selection
 */
const TableRoomSelector = ({
  // Scanned table props
  isScanned,
  scannedTableId,
  scannedTableNo,
  scannedRoomOrTable,
  scannedOrderType,
  showTableInfo,
  // Manual selection props
  isMultiMenu,
  rooms,
  tables,
  roomOrTable,
  tableNumber,
  tablesLoading,
  tablesError,
  tablesErrorMessage,
  onRoomOrTableChange,
  onTableNumberChange,
  // Restaurant-specific overrides
  restaurantId,
}) => {
  // Restaurant 716 (Hyatt Centric) — always show manual room selector even without a scanned tableId,
  // and hide the Room/Table radio group (force "room" mode).
  const is716 = String(restaurantId) === '716';
  // Get options based on roomOrTable selection (memoized for performance)
  const allOptions = useMemo(() => {
    const source = roomOrTable === 'room' ? rooms : tables;
    return [...source]
      .sort(sortTableNumbers)
      .map(item => ({ value: item.id.toString(), label: item.table_no }));
  }, [roomOrTable, rooms, tables]);

  const handleSelectChange = (selectedOption) => {
    onTableNumberChange(selectedOption ? selectedOption.value : '');
  };

  const handleRoomOrTableChange = (value) => {
    onRoomOrTableChange(value);
  };

  // Validate table number (used for error styling)
  const isTableNumberValid = () => {
    if (!isMultiMenu) return true;
    if (!roomOrTable) return false;
    return String(tableNumber || '').trim().length > 0; // Defensive: tableNumber may arrive as a number
  };

  return (
    <>
      {/* Scanned Table Display — Phase 1: show only when a table/room was scanned from QR */}
      {showTableInfo && !isMultiMenu && isScanned && hasAssignedTable(scannedTableId) && (
        <>
          <div className="review-order-section">
            <div className="review-order-room-table-container">
              <p className="review-order-seated-text">We'll bring your order to</p>
              <div className="review-order-seated-info">
                {scannedRoomOrTable === 'room' ? (
                  <span className="review-order-room-icon"><FaDoorOpen /></span>
                ) : (
                  <span className="review-order-table-icon"><MdOutlineTableRestaurant /></span>
                )}
                <span className="review-order-seated-name">{scannedTableNo}</span>
              </div>
            </div>
          </div>
          <div className="review-order-divider"></div>
        </>
      )}

      {/* Manual Room/Table Selection — multi-menu restaurants, only when table was scanned (or restaurant 716 always) */}
      {isMultiMenu && (hasAssignedTable(scannedTableId) || is716) && (
        <>
          <div className="review-order-section">
            <h2 className="review-order-section-title">Room/Table</h2>
            <div className="review-order-room-table-container">
              {/* Radio Buttons — hidden for restaurant 716 (room-only flow) */}
              {!is716 && (
                <div className="review-order-room-table-radio-group">
                  <span className='review-order-radio-text'>Select : </span>
                  <label className="review-order-radio-label">
                    <input
                      type="radio"
                      name="roomOrTable"
                      value="room"
                      checked={roomOrTable === 'room'}
                      onChange={(e) => handleRoomOrTableChange(e.target.value)}
                      className="review-order-radio-input"
                      data-testid="room-radio"
                    />
                    <span className="review-order-radio-text">Room</span>
                  </label>
                  <label className="review-order-radio-label">
                    <input
                      type="radio"
                      name="roomOrTable"
                      value="table"
                      checked={roomOrTable === 'table'}
                      onChange={(e) => handleRoomOrTableChange(e.target.value)}
                      className="review-order-radio-input"
                      data-testid="table-radio"
                    />
                    <span className="review-order-radio-text">Table</span>
                  </label>
                </div>
              )}

              {/* Searchable Dropdown */}
              {roomOrTable && (
                <div className="review-order-table-input-container">
                  {tablesLoading && (
                    <div className="review-order-select-loading">
                      <div className="review-order-select-skeleton"></div>
                    </div>
                  )}

                  {tablesError && !tablesLoading && (
                    <div className="review-order-select-error">
                      <p className="review-order-error-message">
                        {tablesErrorMessage || 'Failed to load tables/rooms. Please try again.'}
                      </p>
                    </div>
                  )}

                  {!tablesLoading && (
                    <Select
                      options={allOptions}
                      value={allOptions.find(opt => opt.value === tableNumber) || null}
                      onChange={handleSelectChange}
                      filterOption={(option, inputValue) => {
                        if (!inputValue || !inputValue.trim()) return false;
                        return option.label.toLowerCase().includes(inputValue.trim().toLowerCase());
                      }}
                      noOptionsMessage={({ inputValue }) =>
                        inputValue?.trim() ? 'No options found' : 'Start typing to search...'
                      }
                      placeholder={roomOrTable === 'room'
                        ? 'Type your room number'
                        : 'Type your table number'}
                      isClearable
                      isSearchable
                      isDisabled={tablesError || tablesLoading}
                      className={`review-order-select ${!isTableNumberValid() && String(tableNumber || '').length > 0 ? 'error' : ''}`}
                      classNamePrefix="review-order-select"
                    />
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="review-order-divider"></div>
        </>
      )}
    </>
  );
};

export default TableRoomSelector;
