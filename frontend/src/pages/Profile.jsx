import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRestaurantConfig } from '../context/RestaurantConfigContext';
import { crmGetOrders, crmGetPoints, crmGetWallet } from '../api/services/crmService';
import { IoArrowBack, IoPersonOutline, IoWalletOutline, IoReceiptOutline, IoSettingsOutline, IoLogOutOutline, IoGiftOutline } from 'react-icons/io5';
import { MdStars } from 'react-icons/md';
import toast from 'react-hot-toast';
import './Profile.css';

const Profile = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, token, isCustomer, isRestaurant, logout } = useAuth();
  // CR-2026-09-15-001: wallet tab visibility gate (G5)
  const { showWallet } = useRestaurantConfig();
  
  // Get tab from URL query param or default to 'profile'
  const tabFromUrl = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(tabFromUrl || 'profile');
  const [orders, setOrders] = useState([]);
  const [points, setPoints] = useState([]);
  const [wallet, setWallet] = useState({ balance: 0, transactions: [] });
  const [loading, setLoading] = useState(false);
  // CR-2026-09-15-001 D4: total order count from v2 response
  const [ordersTotal, setOrdersTotal] = useState(0);

  useEffect(() => {
    if (!token) {
      navigate('/');
      return;
    }
    
    if (isRestaurant) {
      navigate('/admin/settings');
      return;
    }
  }, [token, isRestaurant, navigate]);

  // Update tab when URL changes
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && ['profile', 'orders', 'points', 'wallet'].includes(tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  useEffect(() => {
    if (activeTab === 'orders' && orders.length === 0) {
      fetchOrders();
    } else if (activeTab === 'points' && points.length === 0) {
      fetchPoints();
    } else if (activeTab === 'wallet' && wallet.transactions.length === 0) {
      fetchWallet();
    }
  }, [activeTab]);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const data = await crmGetOrders(token);
      // CR-2026-09-15-001: CRM v2 returns { orders: [...], total: N }
      setOrders(data.orders || []);
      setOrdersTotal(data.total || 0);
    } catch (error) {
      toast.error('Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  const fetchPoints = async () => {
    setLoading(true);
    try {
      const data = await crmGetPoints(token);
      // CRM returns { total_points, points_value, tier, expiring_soon, transactions: [...] }
      // Normalize: CRM uses 'type' field, our UI expects 'transaction_type'
      const transactions = (data.transactions || []).map(tx => ({
        ...tx,
        transaction_type: tx.type || tx.transaction_type,
      }));
      setPoints(transactions);
    } catch (error) {
      toast.error('Failed to load points history');
    } finally {
      setLoading(false);
    }
  };

  const fetchWallet = async () => {
    setLoading(true);
    try {
      const data = await crmGetWallet(token);
      // CRM returns { wallet_balance, total_received, total_used, transactions: [...] }
      // Normalize: CRM uses 'type' field, our UI expects 'transaction_type'
      const transactions = (data.transactions || []).map(tx => ({
        ...tx,
        transaction_type: tx.type || tx.transaction_type,
      }));
      setWallet({
        balance: data.wallet_balance || 0,
        transactions,
      });
    } catch (error) {
      toast.error('Failed to load wallet');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
    navigate('/');
  };

  const getTierColor = (tier) => {
    switch (tier?.toLowerCase()) {
      case 'platinum': return '#E5E4E2';
      case 'gold': return '#FFD700';
      case 'silver': return '#C0C0C0';
      default: return '#CD7F32';
    }
  };

  // CR-2026-09-15-001 G2: points credit/debit classification
  const isPointsCredit = (type) => ['earn', 'bonus'].includes(type);
  const POINTS_TYPE_LABELS = {
    earn: 'Earned', bonus: 'Bonus reward', redeem: 'Redeemed', expired: 'Expired',
  };

  // CR-2026-09-15-001 G4: raw CRM order_type → display label
  const ORDER_TYPE_LABELS = {
    dinein: 'Dine-in', dine_in: 'Dine-in',
    takeaway: 'Takeaway', take_away: 'Takeaway',
    delivery: 'Delivery',
    walkin: 'In-store', WalkIn: 'In-store', in_store: 'In-store', pos: 'In-store',
  };

  if (!user || !isCustomer) {
    return null;
  }

  return (
    <div className="profile-page" data-testid="profile-page">
      {/* Header */}
      <div className="profile-header">
        <button className="back-btn" onClick={() => navigate(-1)} data-testid="profile-back-btn">
          <IoArrowBack />
        </button>
        <h1 className="profile-title">My Account</h1>
        <button className="logout-btn" onClick={handleLogout} data-testid="profile-logout-btn">
          <IoLogOutOutline />
        </button>
      </div>

      {/* User Info Card */}
      <div className="user-card" data-testid="profile-user-card">
        <div className="user-avatar">
          <IoPersonOutline />
        </div>
        <div className="user-info">
          <h2 className="user-name">{user.name || 'Customer'}</h2>
          <p className="user-phone">{user.phone}</p>
        </div>
        <div className="user-tier" style={{ backgroundColor: getTierColor(user.tier) }}>
          <MdStars />
          <span>{user.tier || 'Bronze'}</span>
        </div>
      </div>

      {/* Stats Row */}
      <div className="stats-row" data-testid="profile-stats">
        <div className="stat-card">
          <IoGiftOutline className="stat-icon" />
          <span className="stat-value">{user.total_points || 0}</span>
          <span className="stat-label">Points</span>
        </div>
        <div className="stat-card">
          <IoWalletOutline className="stat-icon" />
          <span className="stat-value">₹{user.wallet_balance || 0}</span>
          <span className="stat-label">Wallet</span>
        </div>
        <div className="stat-card">
          <IoReceiptOutline className="stat-icon" />
          <span className="stat-value">{user.total_visits || 0}</span>
          <span className="stat-label">Visits</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="profile-tabs" data-testid="profile-tabs">
        <button 
          className={`tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
          onClick={() => setActiveTab('profile')}
        >
          <IoPersonOutline /> Profile
        </button>
        <button 
          className={`tab-btn ${activeTab === 'orders' ? 'active' : ''}`}
          onClick={() => setActiveTab('orders')}
        >
          <IoReceiptOutline /> Orders
        </button>
        <button 
          className={`tab-btn ${activeTab === 'points' ? 'active' : ''}`}
          onClick={() => setActiveTab('points')}
        >
          <IoGiftOutline /> Points
        </button>
        {/* CR-2026-09-15-001 G5: wallet tab shown only when config enables it */}
        {showWallet && (
          <button 
            className={`tab-btn ${activeTab === 'wallet' ? 'active' : ''}`}
            onClick={() => setActiveTab('wallet')}
          >
            <IoWalletOutline /> Wallet
          </button>
        )}
      </div>

      {/* Tab Content */}
      <div className="tab-content" data-testid="profile-tab-content">
        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <div className="profile-details">
            <div className="detail-row">
              <span className="detail-label">Name</span>
              <span className="detail-value">{user.name || '-'}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Phone</span>
              <span className="detail-value">{user.phone || '-'}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Email</span>
              <span className="detail-value">{user.email || '-'}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Tier</span>
              <span className="detail-value">{user.tier || 'Bronze'}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Total Spent</span>
              <span className="detail-value">₹{user.total_spent || 0}</span>
            </div>
          </div>
        )}

        {/* Orders Tab */}
        {activeTab === 'orders' && (
          <div className="orders-list">
            {loading ? (
              <div className="loading-state">Loading orders...</div>
            ) : orders.length === 0 ? (
              <div className="empty-state">
                <IoReceiptOutline className="empty-icon" />
                <p>No orders yet</p>
              </div>
            ) : (
              <>
                {ordersTotal > orders.length && (
                  <div className="orders-count">
                    {/* CR-2026-09-15-001 D4 */}
                    Showing {orders.length} of {ordersTotal} orders
                  </div>
                )}
                {orders.map((order) => (
                <div key={order.id} className="order-card">
                  <div className="order-header">
                    <span className="order-date">
                      {new Date(order.created_at).toLocaleDateString()}
                    </span>
                    <span className="order-amount">₹{order.order_amount}</span>
                  </div>
                  <div className="order-details">
                    <span className="order-type">
                      {/* CR-2026-09-15-001 G4 */}
                      {ORDER_TYPE_LABELS[order.order_type] || order.order_type || 'Order'}
                    </span>
                    <span className="order-points">+{order.points_earned} pts</span>
                  </div>
                  {order.items && order.items.length > 0 && (
                    <div className="order-items">
                      {order.items.slice(0, 3).map((item, idx) => (
                        <span key={idx} className="order-item">{item.item_name}</span>
                      ))}
                      {order.items.length > 3 && (
                        <span className="order-item-more">+{order.items.length - 3} more</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
              </>
            )}
          </div>
        )}

        {/* Points Tab */}
        {activeTab === 'points' && (
          <div className="points-list">
            {loading ? (
              <div className="loading-state">Loading points history...</div>
            ) : points.length === 0 ? (
              <div className="empty-state">
                <IoGiftOutline className="empty-icon" />
                <p>No points transactions yet</p>
              </div>
            ) : (
              points.map((tx) => (
                <div key={tx.id} className="transaction-card">
                  <div className="tx-icon" data-type={tx.transaction_type}>
                    {/* CR-2026-09-15-001 G2 */}
                    {isPointsCredit(tx.transaction_type) ? '+' : '-'}
                  </div>
                  <div className="tx-details">
                    <span className="tx-description">{tx.description}</span>
                    <span className="tx-date">
                      {new Date(tx.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className={`tx-amount ${isPointsCredit(tx.transaction_type) ? 'positive' : 'negative'}`}>
                    {isPointsCredit(tx.transaction_type) ? '+' : '-'}{tx.points} pts
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Wallet Tab */}
        {activeTab === 'wallet' && showWallet && (
          <div className="wallet-section">
            <div className="wallet-balance-card">
              <IoWalletOutline className="wallet-icon" />
              <span className="wallet-balance">₹{wallet.balance || user.wallet_balance || 0}</span>
              <span className="wallet-label">Available Balance</span>
            </div>
            <div className="wallet-transactions">
              <h3 className="section-title">Recent Transactions</h3>
              {loading ? (
                <div className="loading-state">Loading transactions...</div>
              ) : wallet.transactions.length === 0 ? (
                <div className="empty-state">
                  <IoWalletOutline className="empty-icon" />
                  <p>No wallet transactions yet</p>
                </div>
              ) : (
                wallet.transactions.map((tx) => (
                  <div key={tx.id} className="transaction-card">
                    <div className="tx-icon" data-type={tx.transaction_type}>
                      {tx.transaction_type === 'credit' ? '+' : '-'}
                    </div>
                    <div className="tx-details">
                      <span className="tx-description">{tx.description}</span>
                      <span className="tx-date">
                        {new Date(tx.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className={`tx-amount ${tx.transaction_type === 'credit' ? 'positive' : 'negative'}`}>
                      {tx.transaction_type === 'credit' ? '+' : '-'}₹{tx.amount}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Profile;
