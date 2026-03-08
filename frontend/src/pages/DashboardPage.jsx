import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Users, QrCode, Plus, Star, TrendingUp, ArrowUpRight, ArrowDownRight, ChevronDown, ChevronUp, RotateCcw, ChevronRight, Menu, KeyRound, LogOut, X, ShoppingBag, Wallet, Ticket, UserMinus, Repeat, Calendar } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MobileLayout } from "@/components/MobileLayout";
import { MigrationOverlay } from "@/components/MigrationOverlay";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";

export default function DashboardPage() {
    const { user, api, logout } = useAuth();
    const navigate = useNavigate();
    const [stats, setStats] = useState(null);
    const [recentCustomers, setRecentCustomers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [sortBy, setSortBy] = useState("recent");
    const [quickActionsOpen, setQuickActionsOpen] = useState(false);
    const [showMigrationOverlay, setShowMigrationOverlay] = useState(false);
    const [migrationChecked, setMigrationChecked] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [showResetPassword, setShowResetPassword] = useState(false);
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [resetLoading, setResetLoading] = useState(false);

    const handleResetPassword = async () => {
        if (!currentPassword || !newPassword || !confirmPassword) {
            toast.error("Please fill all fields");
            return;
        }
        if (newPassword !== confirmPassword) {
            toast.error("New passwords do not match");
            return;
        }
        if (newPassword.length < 6) {
            toast.error("Password must be at least 6 characters");
            return;
        }
        setResetLoading(true);
        try {
            await api.put("/auth/reset-password", {
                current_password: currentPassword,
                new_password: newPassword
            });
            toast.success("Password updated successfully");
            setShowResetPassword(false);
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
        } catch (err) {
            toast.error(err.response?.data?.detail || "Failed to reset password");
        } finally {
            setResetLoading(false);
        }
    };

    const handleLogout = () => {
        logout();
        navigate("/login");
    };

    const fetchCustomers = async (sort) => {
        try {
            let endpoint = "/customers?limit=5";
            if (sort === "most_visited") {
                endpoint = "/customers?limit=5&sort_by=total_visits&sort_order=desc";
            } else if (sort === "most_spent") {
                endpoint = "/customers?limit=5&sort_by=total_spent&sort_order=desc";
            } else if (sort === "highest_points") {
                endpoint = "/customers?limit=5&sort_by=total_points&sort_order=desc";
            }
            const res = await api.get(endpoint);
            setRecentCustomers(res.data);
        } catch (err) {
            console.error("Failed to fetch customers", err);
        }
    };

    // Check migration status on first load
    useEffect(() => {
        const checkMigrationStatus = async () => {
            try {
                const res = await api.get("/migration/status");
                // Show overlay if migration not confirmed and not skipped permanently
                if (!res.data.migration_confirmed && !res.data.migration_skipped_permanently) {
                    setShowMigrationOverlay(true);
                }
            } catch (err) {
                console.error("Failed to check migration status", err);
            } finally {
                setMigrationChecked(true);
            }
        };
        checkMigrationStatus();
    }, []);

    const fetchDashboardData = async () => {
        try {
            const [statsRes, customersRes] = await Promise.all([
                api.get("/analytics/dashboard"),
                api.get("/customers?limit=5")
            ]);
            setStats(statsRes.data);
            setRecentCustomers(customersRes.data);
        } catch (err) {
            toast.error("Failed to load dashboard");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDashboardData();
    }, []);

    useEffect(() => {
        if (!loading) {
            fetchCustomers(sortBy);
        }
    }, [sortBy]);

    if (loading) {
        return (
            <MobileLayout>
                <div className="p-4 animate-pulse">
                    <div className="h-8 bg-gray-200 rounded w-48 mb-4"></div>
                    <div className="grid grid-cols-3 gap-2 mb-3">
                        <div className="h-20 bg-gray-200 rounded-xl"></div>
                        <div className="h-20 bg-gray-200 rounded-xl"></div>
                        <div className="h-20 bg-gray-200 rounded-xl"></div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        <div className="h-20 bg-gray-200 rounded-xl"></div>
                        <div className="h-20 bg-gray-200 rounded-xl"></div>
                        <div className="h-20 bg-gray-200 rounded-xl"></div>
                    </div>
                </div>
            </MobileLayout>
        );
    }

    const handleMigrationComplete = () => {
        setShowMigrationOverlay(false);
        // Refresh dashboard data after migration completes
        fetchDashboardData();
        toast.success("Migration completed! Dashboard refreshed.");
    };

    return (
        <MobileLayout>
            {/* Migration Overlay */}
            {showMigrationOverlay && (
                <MigrationOverlay 
                    api={api}
                    onClose={() => setShowMigrationOverlay(false)}
                    onComplete={handleMigrationComplete}
                />
            )}
            
            <div className="p-4 max-w-lg mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-5">
                    <div>
                        <p className="text-[#52525B] text-sm font-body">Welcome</p>
                        <h1 className="text-2xl font-bold text-[#2B2B2B] font-heading" data-testid="restaurant-name">
                            {user?.restaurant_name}
                        </h1>
                    </div>
                    <div className="flex items-center gap-3">
                        <Avatar className="w-10 h-10 bg-[#F26B33]">
                            <AvatarFallback className="bg-[#F26B33] text-white font-semibold">
                                {user?.restaurant_name?.charAt(0)}
                            </AvatarFallback>
                        </Avatar>
                        {/* Hamburger Menu */}
                        <div className="relative">
                            <button 
                                onClick={() => setMenuOpen(!menuOpen)}
                                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                                data-testid="hamburger-menu"
                            >
                                <Menu className="w-6 h-6 text-[#52525B]" />
                            </button>
                            {menuOpen && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                                    <div className="absolute right-0 top-12 w-56 bg-white rounded-xl shadow-lg border border-gray-100 z-50 overflow-hidden">
                                        <div className="p-3 border-b border-gray-100">
                                            <p className="text-sm font-medium text-[#2B2B2B] font-body">User</p>
                                            <p className="text-xs text-[#52525B] font-body truncate">{user?.email}</p>
                                        </div>
                                        <div className="py-1">
                                            <button
                                                onClick={() => { setMenuOpen(false); setShowResetPassword(true); }}
                                                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                                                data-testid="reset-password-btn"
                                            >
                                                <KeyRound className="w-4 h-4 text-[#F26B33]" />
                                                <span className="text-sm text-[#2B2B2B] font-body">Reset Password</span>
                                            </button>
                                            <button
                                                onClick={handleLogout}
                                                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                                                data-testid="logout-btn"
                                            >
                                                <LogOut className="w-4 h-4 text-red-500" />
                                                <span className="text-sm text-red-500 font-body">Logout</span>
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* Reset Password Modal */}
                {showResetPassword && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                        <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-bold text-[#2B2B2B] font-heading">Reset Password</h2>
                                <button onClick={() => setShowResetPassword(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                                    <X className="w-5 h-5 text-[#52525B]" />
                                </button>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-[#52525B] mb-1 font-body">Current Password</label>
                                    <input
                                        type="password"
                                        value={currentPassword}
                                        onChange={(e) => setCurrentPassword(e.target.value)}
                                        className="w-full h-11 px-4 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F26B33] font-body"
                                        placeholder="Enter current password"
                                        data-testid="current-password-input"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-[#52525B] mb-1 font-body">New Password</label>
                                    <input
                                        type="password"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        className="w-full h-11 px-4 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F26B33] font-body"
                                        placeholder="Enter new password"
                                        data-testid="new-password-input"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-[#52525B] mb-1 font-body">Confirm New Password</label>
                                    <input
                                        type="password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        className="w-full h-11 px-4 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F26B33] font-body"
                                        placeholder="Confirm new password"
                                        data-testid="confirm-password-input"
                                    />
                                </div>
                                <Button
                                    onClick={handleResetPassword}
                                    disabled={resetLoading}
                                    className="w-full h-12 rounded-full bg-[#F26B33] hover:bg-[#D85A2A] text-white font-semibold font-body mt-2"
                                    data-testid="submit-reset-password"
                                >
                                    {resetLoading ? "Updating..." : "Update Password"}
                                </Button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Stats Grid - 6 Rows x 3 Columns */}
                
                {/* Header Row 1: Loyalty Orders % - Total, 30D, 7D */}
                <div className="grid grid-cols-3 gap-2 mb-2">
                    <div className="stats-card-compact bg-gradient-to-r from-[#F26B33]/10 to-transparent" data-testid="loyalty-orders-total-card">
                        <div className="flex items-center gap-1 text-[#F26B33] mb-1">
                            <Repeat className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-medium uppercase tracking-wider font-body">Loyalty Orders</span>
                        </div>
                        <p className="text-xl font-bold text-[#F26B33] font-heading">
                            {stats?.loyalty_orders_percent || 0}%
                        </p>
                    </div>
                    <div className="stats-card-compact" data-testid="loyalty-orders-30d-card">
                        <div className="flex items-center gap-1 text-[#F26B33] mb-1">
                            <Repeat className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-medium uppercase tracking-wider font-body">Loyalty (30D)</span>
                        </div>
                        <p className="text-xl font-bold text-[#F26B33] font-heading">
                            {stats?.loyalty_orders_percent_30d || 0}%
                        </p>
                    </div>
                    <div className="stats-card-compact" data-testid="loyalty-orders-7d-card">
                        <div className="flex items-center gap-1 text-[#F26B33] mb-1">
                            <Repeat className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-medium uppercase tracking-wider font-body">Loyalty (7D)</span>
                        </div>
                        <p className="text-xl font-bold text-[#F26B33] font-heading">
                            {stats?.loyalty_orders_percent_7d || 0}%
                        </p>
                    </div>
                </div>

                {/* Header Row 2: Revenue Split - Total, 30D, 7D */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                    <div className="stats-card-compact bg-gradient-to-r from-[#329937]/10 to-transparent" data-testid="revenue-split-total-card">
                        <div className="flex items-center gap-1 text-[#329937] mb-1">
                            <TrendingUp className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-medium uppercase tracking-wider font-body">Revenue Split</span>
                        </div>
                        <p className="text-sm font-bold text-[#2B2B2B] font-heading">
                            <span className="text-[#329937]">{stats?.repeat_revenue_percent || 0}%</span>
                            <span className="text-[10px] font-normal text-[#52525B]"> R </span>
                            <span className="text-[#F26B33]">{stats?.new_revenue_percent || 0}%</span>
                            <span className="text-[10px] font-normal text-[#52525B]"> N</span>
                        </p>
                    </div>
                    <div className="stats-card-compact" data-testid="revenue-split-30d-card">
                        <div className="flex items-center gap-1 text-[#329937] mb-1">
                            <TrendingUp className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-medium uppercase tracking-wider font-body">Split (30D)</span>
                        </div>
                        <p className="text-sm font-bold text-[#2B2B2B] font-heading">
                            <span className="text-[#329937]">{stats?.repeat_revenue_percent_30d || 0}%</span>
                            <span className="text-[10px] font-normal text-[#52525B]"> R </span>
                            <span className="text-[#F26B33]">{stats?.new_revenue_percent_30d || 0}%</span>
                            <span className="text-[10px] font-normal text-[#52525B]"> N</span>
                        </p>
                    </div>
                    <div className="stats-card-compact" data-testid="revenue-split-7d-card">
                        <div className="flex items-center gap-1 text-[#329937] mb-1">
                            <TrendingUp className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-medium uppercase tracking-wider font-body">Split (7D)</span>
                        </div>
                        <p className="text-sm font-bold text-[#2B2B2B] font-heading">
                            <span className="text-[#329937]">{stats?.repeat_revenue_percent_7d || 0}%</span>
                            <span className="text-[10px] font-normal text-[#52525B]"> R </span>
                            <span className="text-[#F26B33]">{stats?.new_revenue_percent_7d || 0}%</span>
                            <span className="text-[10px] font-normal text-[#52525B]"> N</span>
                        </p>
                    </div>
                </div>

                {/* Row 1: Total Customers, Active (30D), New (7D) */}
                <div className="grid grid-cols-3 gap-2 mb-2">
                    <div className="stats-card-compact" data-testid="total-customers-card">
                        <div className="flex items-center gap-1 text-[#F26B33] mb-1">
                            <Users className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-medium uppercase tracking-wider font-body">Customers</span>
                        </div>
                        <p className="text-xl font-bold text-[#2B2B2B] font-heading">
                            {stats?.total_customers || 0}
                        </p>
                    </div>
                    <div className="stats-card-compact" data-testid="active-customers-card">
                        <div className="flex items-center gap-1 text-[#329937] mb-1">
                            <Users className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-medium uppercase tracking-wider font-body">Active(30d)</span>
                        </div>
                        <p className="text-xl font-bold text-[#2B2B2B] font-heading">
                            {stats?.active_customers_30d || 0}
                        </p>
                    </div>
                    <div className="stats-card-compact" data-testid="new-customers-card">
                        <div className="flex items-center gap-1 text-[#329937] mb-1">
                            <TrendingUp className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-medium uppercase tracking-wider font-body">New(7d)</span>
                        </div>
                        <p className="text-xl font-bold text-[#2B2B2B] font-heading">
                            {stats?.new_customers_7d || 0}
                        </p>
                    </div>
                </div>

                {/* Row 2: Repeat 2+, Repeat 5+, Repeat 10+ */}
                <div className="grid grid-cols-3 gap-2 mb-2">
                    <div className="stats-card-compact" data-testid="repeat-2-card">
                        <div className="flex items-center gap-1 text-[#F26B33] mb-1">
                            <Repeat className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-medium uppercase tracking-wider font-body">Repeat 2+</span>
                        </div>
                        <p className="text-xl font-bold text-[#2B2B2B] font-heading">
                            {stats?.repeat_2_plus || 0}
                            <span className="text-xs font-normal text-[#52525B] ml-1">
                                ({stats?.total_customers > 0 ? ((stats.repeat_2_plus / stats.total_customers) * 100).toFixed(1) : 0}%)
                            </span>
                        </p>
                    </div>
                    <div className="stats-card-compact" data-testid="repeat-5-card">
                        <div className="flex items-center gap-1 text-[#F26B33] mb-1">
                            <Repeat className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-medium uppercase tracking-wider font-body">Repeat 5+</span>
                        </div>
                        <p className="text-xl font-bold text-[#2B2B2B] font-heading">
                            {stats?.repeat_5_plus || 0}
                            <span className="text-xs font-normal text-[#52525B] ml-1">
                                ({stats?.total_customers > 0 ? ((stats.repeat_5_plus / stats.total_customers) * 100).toFixed(1) : 0}%)
                            </span>
                        </p>
                    </div>
                    <div className="stats-card-compact" data-testid="repeat-10-card">
                        <div className="flex items-center gap-1 text-[#329937] mb-1">
                            <Repeat className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-medium uppercase tracking-wider font-body">Repeat 10+</span>
                        </div>
                        <p className="text-xl font-bold text-[#2B2B2B] font-heading">
                            {stats?.repeat_10_plus || 0}
                            <span className="text-xs font-normal text-[#52525B] ml-1">
                                ({stats?.total_customers > 0 ? ((stats.repeat_10_plus / stats.total_customers) * 100).toFixed(1) : 0}%)
                            </span>
                        </p>
                    </div>
                </div>

                {/* Row 3: Inactive 30D, 60D, 90D */}
                <div className="grid grid-cols-3 gap-2 mb-2">
                    <div className="stats-card-compact" data-testid="inactive-30d-card">
                        <div className="flex items-center gap-1 text-[#EF4444] mb-1">
                            <UserMinus className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-medium uppercase tracking-wider font-body">Inactive 30d</span>
                        </div>
                        <p className="text-xl font-bold text-[#2B2B2B] font-heading">
                            {stats?.inactive_30d || 0}
                            <span className="text-xs font-normal text-[#52525B] ml-1">
                                ({stats?.total_customers > 0 ? ((stats.inactive_30d / stats.total_customers) * 100).toFixed(1) : 0}%)
                            </span>
                        </p>
                    </div>
                    <div className="stats-card-compact" data-testid="inactive-60d-card">
                        <div className="flex items-center gap-1 text-[#EF4444] mb-1">
                            <UserMinus className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-medium uppercase tracking-wider font-body">Inactive 60d</span>
                        </div>
                        <p className="text-xl font-bold text-[#2B2B2B] font-heading">
                            {stats?.inactive_60d || 0}
                            <span className="text-xs font-normal text-[#52525B] ml-1">
                                ({stats?.total_customers > 0 ? ((stats.inactive_60d / stats.total_customers) * 100).toFixed(1) : 0}%)
                            </span>
                        </p>
                    </div>
                    <div className="stats-card-compact" data-testid="inactive-90d-card">
                        <div className="flex items-center gap-1 text-[#EF4444] mb-1">
                            <UserMinus className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-medium uppercase tracking-wider font-body">Inactive 90d</span>
                        </div>
                        <p className="text-xl font-bold text-[#2B2B2B] font-heading">
                            {stats?.inactive_90d || 0}
                            <span className="text-xs font-normal text-[#52525B] ml-1">
                                ({stats?.total_customers > 0 ? ((stats.inactive_90d / stats.total_customers) * 100).toFixed(1) : 0}%)
                            </span>
                        </p>
                    </div>
                </div>

                {/* Row 4: Points Issued, Points Redeemed, Points Balance - Show only if loyalty_enabled */}
                {stats?.loyalty_enabled && (
                <div className="grid grid-cols-3 gap-2 mb-2">
                    <div className="stats-card-compact" data-testid="points-issued-card">
                        <div className="flex items-center gap-1 text-[#329937] mb-1">
                            <ArrowUpRight className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-medium uppercase tracking-wider font-body">Pts Issued</span>
                        </div>
                        <p className="text-xl font-bold text-[#2B2B2B] font-heading points-display">
                            {stats?.total_points_issued?.toLocaleString() || 0}
                        </p>
                    </div>
                    <div className="stats-card-compact" data-testid="points-redeemed-card">
                        <div className="flex items-center gap-1 text-[#EF4444] mb-1">
                            <ArrowDownRight className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-medium uppercase tracking-wider font-body">Pts Redeemed</span>
                        </div>
                        <p className="text-xl font-bold text-[#2B2B2B] font-heading points-display">
                            {stats?.total_points_redeemed?.toLocaleString() || 0}
                        </p>
                    </div>
                    <div className="stats-card-compact" data-testid="points-balance-card">
                        <div className="flex items-center gap-1 text-[#329937] mb-1">
                            <Star className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-medium uppercase tracking-wider font-body">Pts Balance</span>
                        </div>
                        <p className="text-xl font-bold text-[#2B2B2B] font-heading points-display">
                            {stats?.points_balance?.toLocaleString() || 0}
                        </p>
                    </div>
                </div>
                )}

                {/* Row 5: Wallet Issued, Wallet Used, Wallet Balance - Show only if wallet_enabled */}
                {stats?.wallet_enabled && (
                <div className="grid grid-cols-3 gap-2 mb-2">
                    <div className="stats-card-compact" data-testid="wallet-issued-card">
                        <div className="flex items-center gap-1 text-[#F26B33] mb-1">
                            <Wallet className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-medium uppercase tracking-wider font-body">Wallet In</span>
                        </div>
                        <p className="text-xl font-bold text-[#2B2B2B] font-heading">
                            ₹{stats?.wallet_issued?.toLocaleString() || 0}
                        </p>
                    </div>
                    <div className="stats-card-compact" data-testid="wallet-used-card">
                        <div className="flex items-center gap-1 text-[#EF4444] mb-1">
                            <Wallet className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-medium uppercase tracking-wider font-body">Wallet Out</span>
                        </div>
                        <p className="text-xl font-bold text-[#2B2B2B] font-heading">
                            ₹{stats?.wallet_used?.toLocaleString() || 0}
                        </p>
                    </div>
                    <div className="stats-card-compact" data-testid="wallet-balance-card">
                        <div className="flex items-center gap-1 text-[#F26B33] mb-1">
                            <Wallet className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-medium uppercase tracking-wider font-body">Wallet Bal</span>
                        </div>
                        <p className="text-xl font-bold text-[#2B2B2B] font-heading">
                            ₹{stats?.wallet_balance?.toLocaleString() || 0}
                        </p>
                    </div>
                </div>
                )}

                {/* Row 6: Total Coupons, Coupons Used, Discount Availed - Show only if coupon_enabled */}
                {stats?.coupon_enabled && (
                <div className="grid grid-cols-3 gap-2 mb-2">
                    <div className="stats-card-compact" data-testid="total-coupons-card">
                        <div className="flex items-center gap-1 text-[#8B5CF6] mb-1">
                            <Ticket className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-medium uppercase tracking-wider font-body">Coupons</span>
                        </div>
                        <p className="text-xl font-bold text-[#2B2B2B] font-heading">
                            {stats?.total_coupons || 0}
                        </p>
                    </div>
                    <div className="stats-card-compact" data-testid="coupons-used-card">
                        <div className="flex items-center gap-1 text-[#F26B33] mb-1">
                            <Ticket className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-medium uppercase tracking-wider font-body">Used</span>
                        </div>
                        <p className="text-xl font-bold text-[#2B2B2B] font-heading">
                            {stats?.coupons_used || 0}
                        </p>
                    </div>
                    <div className="stats-card-compact" data-testid="discount-availed-card">
                        <div className="flex items-center gap-1 text-[#8B5CF6] mb-1">
                            <Ticket className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-medium uppercase tracking-wider font-body">Discount</span>
                        </div>
                        <p className="text-xl font-bold text-[#2B2B2B] font-heading">
                            ₹{stats?.discount_availed?.toLocaleString() || 0}
                        </p>
                    </div>
                </div>
                )}

                {/* Row 7: Total Orders, Avg Order Value, Avg Orders/Day */}
                <div className="grid grid-cols-3 gap-2 mb-2">
                    <div className="stats-card-compact" data-testid="total-orders-card">
                        <div className="flex items-center gap-1 text-[#8B5CF6] mb-1">
                            <ShoppingBag className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-medium uppercase tracking-wider font-body">Orders</span>
                        </div>
                        <p className="text-xl font-bold text-[#2B2B2B] font-heading">
                            {stats?.total_orders || 0}
                        </p>
                    </div>
                    <div className="stats-card-compact" data-testid="avg-order-value-card">
                        <div className="flex items-center gap-1 text-[#8B5CF6] mb-1">
                            <ShoppingBag className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-medium uppercase tracking-wider font-body">Avg Order</span>
                        </div>
                        <p className="text-xl font-bold text-[#2B2B2B] font-heading">
                            ₹{stats?.avg_order_value?.toLocaleString() || 0}
                        </p>
                    </div>
                    <div className="stats-card-compact" data-testid="avg-orders-per-day-card">
                        <div className="flex items-center gap-1 text-[#8B5CF6] mb-1">
                            <Calendar className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-medium uppercase tracking-wider font-body">Orders/Day</span>
                        </div>
                        <p className="text-xl font-bold text-[#2B2B2B] font-heading">
                            {stats?.avg_orders_per_day || 0}
                        </p>
                    </div>
                </div>

                {/* Row 8: Revenue - Total, 30D, 7D */}
                <div className="grid grid-cols-3 gap-2 mb-2">
                    <div className="stats-card-compact" data-testid="total-revenue-card">
                        <div className="flex items-center gap-1 text-[#329937] mb-1">
                            <TrendingUp className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-medium uppercase tracking-wider font-body">Revenue</span>
                        </div>
                        <p className="text-xl font-bold text-[#2B2B2B] font-heading">
                            ₹{stats?.total_revenue?.toLocaleString() || 0}
                        </p>
                    </div>
                    <div className="stats-card-compact" data-testid="revenue-30d-card">
                        <div className="flex items-center gap-1 text-[#329937] mb-1">
                            <TrendingUp className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-medium uppercase tracking-wider font-body">Rev (30D)</span>
                        </div>
                        <p className="text-xl font-bold text-[#2B2B2B] font-heading">
                            ₹{stats?.revenue_30d?.toLocaleString() || 0}
                        </p>
                    </div>
                    <div className="stats-card-compact" data-testid="revenue-7d-card">
                        <div className="flex items-center gap-1 text-[#329937] mb-1">
                            <TrendingUp className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-medium uppercase tracking-wider font-body">Rev (7D)</span>
                        </div>
                        <p className="text-xl font-bold text-[#2B2B2B] font-heading">
                            ₹{stats?.revenue_7d?.toLocaleString() || 0}
                        </p>
                    </div>
                </div>

            </div>
        </MobileLayout>
    );
}
