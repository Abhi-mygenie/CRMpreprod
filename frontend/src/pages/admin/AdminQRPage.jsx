import React, { useState, useEffect, useRef, useCallback } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { useAuth } from '../../context/AuthContext';
import logger from '../../utils/logger';
import {
  IoQrCodeOutline,
  IoDownloadOutline,
  IoRefresh,
  IoCloudDownloadOutline,
  IoRestaurantOutline,
  IoBicycleOutline,
  IoBagHandleOutline,
  IoGridOutline,
  IoBedOutline,
} from 'react-icons/io5';
import './AdminPages.css';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const QR_SIZE = 200;

const OrderTypeCard = ({ label, icon: Icon, url, filename }) => {
  const canvasRef = useRef(null);

  const handleDownload = () => {
    const canvas = canvasRef.current?.querySelector('canvas');
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (blob) saveAs(blob, `${filename}.png`);
    });
  };

  return (
    <div className="qr-card" data-testid={`qr-card-${filename}`}>
      <div className="qr-card-header">
        <Icon className="qr-card-icon" />
        <span className="qr-card-label">{label}</span>
      </div>
      <div className="qr-canvas-wrap" ref={canvasRef}>
        <QRCodeCanvas value={url} size={QR_SIZE} level="H" includeMargin />
      </div>
      <p className="qr-card-url" title={url}>{url}</p>
      <button className="qr-download-btn" onClick={handleDownload} data-testid={`download-${filename}`}>
        <IoDownloadOutline /> Download PNG
      </button>
    </div>
  );
};

const TableQRCard = ({ item, url, selectedMenu }) => {
  const canvasRef = useRef(null);
  const isRoom = item.rtype === 'RM';
  const label = isRoom ? `Room ${item.table_no}` : `Table ${item.table_no}`;
  const filename = `${isRoom ? 'room' : 'table'}-${item.table_no}-${selectedMenu}`;

  const handleDownload = () => {
    const canvas = canvasRef.current?.querySelector('canvas');
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (blob) saveAs(blob, `${filename}.png`);
    });
  };

  if (!url) return null;

  return (
    <div className="qr-card qr-card-sm" data-testid={`qr-card-${filename}`}>
      <div className="qr-card-header">
        <span className="qr-card-label">{label}</span>
        {item.title && <span className="qr-card-subtitle">{item.title}</span>}
      </div>
      <div className="qr-canvas-wrap" ref={canvasRef}>
        <QRCodeCanvas value={url} size={160} level="H" includeMargin />
      </div>
      <span className="qr-menu-label">{selectedMenu}</span>
      <button className="qr-download-btn" onClick={handleDownload} data-testid={`download-${filename}`}>
        <IoDownloadOutline /> PNG
      </button>
    </div>
  );
};

const AdminQRPage = () => {
  const { token } = useAuth();
  const [tables, setTables] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [subdomain, setSubdomain] = useState('');
  const [restaurantId, setRestaurantId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [zipping, setZipping] = useState(false);
  
  // New filter states
  const [selectedType, setSelectedType] = useState('all'); // 'all' | 'table' | 'room'
  const [selectedMenu, setSelectedMenu] = useState('Normal'); // Default menu master
  const [menuMasters, setMenuMasters] = useState([]);

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);

    // INV-2026-08-06-001 fix 2a: auto-refresh pos_token on 401 rather than asking user to logout
    const doTableConfigFetch = async (posToken) =>
      fetch(`${API_URL}/api/table-config`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-POS-Token': posToken || '',
        },
      });

    try {
      let posToken = localStorage.getItem('pos_token');
      let res = await doTableConfigFetch(posToken);

      // If POS token is stale/expired, refresh via backend proxy and retry once
      if (res.status === 401) {
        try {
          const refreshRes = await fetch(`${API_URL}/api/pos/auth-token`, { method: 'POST' });
          if (refreshRes.ok) {
            const refreshData = await refreshRes.json();
            if (refreshData.token) {
              posToken = refreshData.token;
              localStorage.setItem('pos_token', posToken);
              res = await doTableConfigFetch(posToken);
            }
          }
        } catch (_) { /* refresh failed — fall through to error handling below */ }
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to fetch table config');
      }
      const data = await res.json();
      const allTables = data.tables || [];
      const allRooms = data.rooms || [];
      
      setTables(allTables);
      setRooms(allRooms);
      setSubdomain(data.subdomain || '');
      setRestaurantId(String(data.restaurant_id || ''));
      
      // Extract unique menu masters from qr_code_urls
      const allMenus = new Set();
      [...allTables, ...allRooms].forEach(item => {
        Object.keys(item.qr_code_urls || {}).forEach(menu => allMenus.add(menu));
      });
      const menuList = [...allMenus];
      setMenuMasters(menuList);
      
      // Set default selected menu if available
      if (menuList.length > 0 && !menuList.includes(selectedMenu)) {
        setSelectedMenu(menuList[0]);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [token, selectedMenu]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Get QR URL from API response based on selected menu
  const getQRUrl = (item) => {
    return item.qr_code_urls?.[selectedMenu] || '';
  };

  // Filter items based on selected type
  const getFilteredItems = () => {
    if (selectedType === 'table') return tables;
    if (selectedType === 'room') return rooms;
    return [...tables, ...rooms];
  };

  const filteredItems = getFilteredItems();

  // Bulk download helper: renders each QR to a canvas and adds to ZIP
  const handleBulkDownload = async (items) => {
    if (items.length === 0) return;
    setZipping(true);
    try {
      const zip = new JSZip();
      const folderName = selectedType === 'room' ? 'rooms' : selectedType === 'table' ? 'tables' : 'qr-codes';
      const folder = zip.folder(`${folderName}-${selectedMenu}`);

      for (const item of items) {
        const url = getQRUrl(item);
        if (!url) continue;
        const blob = await renderQRToBlob(url);
        const prefix = item.rtype === 'RM' ? 'room' : 'table';
        const name = `${prefix}-${item.table_no}-${selectedMenu}.png`;
        folder.file(name, blob);
      }

      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `${folderName}-${selectedMenu}-qr-codes.zip`);
    } catch (e) {
      logger.error('admin', 'ZIP generation failed:', e);
    } finally {
      setZipping(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-page" data-testid="admin-qr-page">
        <h1 className="admin-page-title"><IoQrCodeOutline /> QR Codes</h1>
        <div className="qr-loading">Loading table configuration...</div>
      </div>
    );
  }

  if (error) {
    const isSessionExpired = error.toLowerCase().includes("expired") || 
                             error.toLowerCase().includes("session") ||
                             error.includes("401");
    
    return (
      <div className="admin-page" data-testid="admin-qr-page">
        <h1 className="admin-page-title"><IoQrCodeOutline /> QR Codes</h1>
        <div className="qr-error">
          {isSessionExpired ? (
            <>
              <p style={{ fontSize: '1.1rem', marginBottom: '8px' }}>Your POS session has expired</p>
              <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '16px' }}>
                Re-login to refresh your session. You will be returned here automatically.
              </p>
              <button
                className="qr-retry-btn"
                onClick={() => window.location.href = `/login?redirect=/admin/qr-scanners`}
                data-testid="qr-relogin-btn"
              >
                Re-login
              </button>
            </>
          ) : (
            <>
              <p>{error}</p>
              <button className="qr-retry-btn" onClick={fetchData}><IoRefresh /> Retry</button>
            </>
          )}
        </div>
      </div>
    );
  }

  // Get counts for display
  const tableCount = tables.length;
  const roomCount = rooms.length;
  const filteredCount = filteredItems.length;

  return (
    <div className="admin-page" data-testid="admin-qr-page">
      <h1 className="admin-page-title"><IoQrCodeOutline /> QR Codes</h1>
      <p className="admin-page-description">
        Generate and download QR codes for your restaurant. Customers scan these to place orders.
      </p>

      {/* Filters Section */}
      <div className="qr-filters" data-testid="qr-filters">
        <div className="qr-filter-group">
          <label className="qr-filter-label">Type:</label>
          <div className="qr-filter-tabs">
            <button 
              className={`qr-filter-tab ${selectedType === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedType('all')}
              data-testid="filter-all"
            >
              All ({tableCount + roomCount})
            </button>
            <button 
              className={`qr-filter-tab ${selectedType === 'table' ? 'active' : ''}`}
              onClick={() => setSelectedType('table')}
              data-testid="filter-tables"
            >
              <IoGridOutline /> Tables ({tableCount})
            </button>
            <button 
              className={`qr-filter-tab ${selectedType === 'room' ? 'active' : ''}`}
              onClick={() => setSelectedType('room')}
              data-testid="filter-rooms"
            >
              <IoBedOutline /> Rooms ({roomCount})
            </button>
          </div>
        </div>
        
        <div className="qr-filter-group">
          <label className="qr-filter-label">Menu:</label>
          <select 
            className="qr-filter-select"
            value={selectedMenu}
            onChange={(e) => setSelectedMenu(e.target.value)}
            data-testid="filter-menu"
          >
            {menuMasters.map(menu => (
              <option key={menu} value={menu}>{menu}</option>
            ))}
          </select>
        </div>
      </div>

      {/* QR Codes Grid */}
      <div className="admin-section">
        <div className="qr-section-header">
          <h2 className="admin-section-title">
            {selectedType === 'table' ? <IoGridOutline /> : selectedType === 'room' ? <IoBedOutline /> : null}
            {' '}QR Codes ({filteredCount}) - {selectedMenu} Menu
          </h2>
          <button
            className="qr-bulk-btn"
            onClick={() => handleBulkDownload(filteredItems)}
            disabled={zipping || filteredCount === 0}
            data-testid="bulk-download"
          >
            <IoCloudDownloadOutline /> {zipping ? 'Zipping...' : 'Download All as ZIP'}
          </button>
        </div>
        
        {filteredCount === 0 ? (
          <div className="qr-empty">No tables or rooms found.</div>
        ) : (
          <div className="qr-grid qr-grid-4" data-testid="qr-grid">
            {filteredItems
              .sort((a, b) => {
                const numA = parseInt(a.table_no.replace(/\D/g, ''), 10) || 0;
                const numB = parseInt(b.table_no.replace(/\D/g, ''), 10) || 0;
                return numA - numB;
              })
              .map((item) => (
                <TableQRCard 
                  key={item.id} 
                  item={item} 
                  url={getQRUrl(item)}
                  selectedMenu={selectedMenu}
                />
              ))}
          </div>
        )}
      </div>

      {/* Refresh */}
      <div className="qr-footer">
        <button className="qr-retry-btn" onClick={fetchData} data-testid="qr-refresh-btn">
          <IoRefresh /> Refresh Data
        </button>
      </div>

      {/* INV-2026-08-06-001 fix 2b: Direct Order-Type QR Codes (Delivery, Takeaway, Walk-in, Dine-in) */}
      {restaurantId && (
        <div className="admin-section" data-testid="order-type-qr-section">
          <h2 className="admin-section-title">
            <IoQrCodeOutline /> Direct Order QR Codes
          </h2>
          <p className="admin-page-description">
            QR codes customers can scan to start a specific order type directly — no table scan needed.
          </p>
          <div className="qr-grid qr-grid-4" data-testid="order-type-qr-grid">
            <OrderTypeCard
              label="Delivery"
              icon={IoBicycleOutline}
              url={`${window.location.origin}/${restaurantId}?orderType=delivery`}
              filename={`delivery-${restaurantId}`}
            />
            <OrderTypeCard
              label="Takeaway"
              icon={IoBagHandleOutline}
              url={`${window.location.origin}/${restaurantId}?orderType=takeaway`}
              filename={`takeaway-${restaurantId}`}
            />
            <OrderTypeCard
              label="Walk-in"
              icon={IoRestaurantOutline}
              url={`${window.location.origin}/${restaurantId}?orderType=walkin`}
              filename={`walkin-${restaurantId}`}
            />
            <OrderTypeCard
              label="Dine-in"
              icon={IoGridOutline}
              url={`${window.location.origin}/${restaurantId}?orderType=dinein`}
              filename={`dinein-${restaurantId}`}
            />
          </div>
        </div>
      )}
    </div>
  );
};

/** Offscreen QR render → Blob (for ZIP generation) */
function renderQRToBlob(url) {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const size = QR_SIZE + 20; // include margin
    canvas.width = size;
    canvas.height = size;

    // Use a temporary hidden container
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    document.body.appendChild(container);

    // Render QRCodeCanvas into the container
    const { createRoot } = require('react-dom/client');
    const root = createRoot(container);
    root.render(
      <QRCodeCanvas value={url} size={QR_SIZE} level="H" includeMargin />,
    );

    // Wait for render, then grab the canvas
    setTimeout(() => {
      const qrCanvas = container.querySelector('canvas');
      if (qrCanvas) {
        qrCanvas.toBlob((blob) => {
          root.unmount();
          document.body.removeChild(container);
          resolve(blob);
        });
      } else {
        root.unmount();
        document.body.removeChild(container);
        resolve(new Blob());
      }
    }, 100);
  });
}

export default AdminQRPage;
