import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Users, QrCode, Plus, Star, TrendingUp, ArrowUpRight, ArrowDownRight, ChevronDown, ChevronUp, RotateCcw, ChevronRight, Menu, KeyRound, LogOut, X, ShoppingBag, Wallet, Ticket, UserMinus, Repeat, Calendar, MessageSquare, BarChart3 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ResponsiveLayout } from "@/components/ResponsiveLayout";
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
import { MessageStatusContent } from "@/pages/MessageStatusPage";

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
    const [activeTab, setActiveTab] = useState("crm"); // "crm" or "messages"

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
            <ResponsiveLayout>
                <div className="p-4 lg:p-8 animate-pulse">
                    <div className="h-8 bg-gray-200 rounded w-48 mb-4"></div>
                    {/* Desktop skeleton - 6 columns */}
                    <div className="hidden lg:grid lg:grid-cols-6 gap-4 mb-4">
                        {[...Array(12)].map((_, i) => (
                            <div key={i} className="h-24 bg-gray-200 rounded-xl"></div>
                        ))}
                    </div>
                    {/* Mobile skeleton - 3 columns */}
                    <div className="grid grid-cols-3 gap-2 lg:hidden mb-3">
                        {[...Array(6)].map((_, i) => (
                            <div key={i} className="h-20 bg-gray-200 rounded-xl"></div>
                        ))}
                    </div>
                </div>
            </ResponsiveLayout>
        );
    }

    const handleMigrationComplete = () => {
        setShowMigrationOverlay(false);
        // Refresh dashboard data after migration completes
        fetchDashboardData();
        toast.success("Migration completed! Dashboard refreshed.");
    };

    // Stats card component for reusability
    const StatCard = ({ icon: Icon, label, value, color = "#F26B33", suffix = "", prefix = "", subValue = null, highlight = false }) => (
        <div className={`stats-card-responsive ${highlight ? 'bg-gradient-to-r from-' + color + '/10 to-transparent' : ''}`} data-testid={`${label.toLowerCase().replace(/[\s()]/g, '-')}-card`}>
            <div className={`flex items-center gap-1.5 mb-1.5`} style={{ color }}>
                <Icon className="w-4 h-4 lg:w-5 lg:h-5" />
                <span className="text-[10px] lg:text-xs font-medium uppercase tracking-wider font-body">{label}</span>
            </div>
            <p className="text-xl lg:text-2xl font-bold text-[#2B2B2B] font-heading">
                {prefix}{typeof value === 'number' ? value.toLocaleString() : value}{suffix}
                {subValue && (
                    <span className="text-xs lg:text-sm font-normal text-[#52525B] ml-1">
                        ({subValue})
                    </span>
                )}
            </p>
        </div>
    );

    // Split stat card for Revenue Split display
    const SplitStatCard = ({ icon: Icon, label, repeatValue, newValue, color = "#329937", highlight = false }) => (
        <div className={`stats-card-responsive ${highlight ? 'bg-gradient-to-r from-[#329937]/10 to-transparent' : ''}`} data-testid={`${label.toLowerCase().replace(/[\s()]/g, '-')}-card`}>
            <div className="flex items-center gap-1.5 mb-1.5" style={{ color }}>
                <Icon className="w-4 h-4 lg:w-5 lg:h-5" />
                <span className="text-[10px] lg:text-xs font-medium uppercase tracking-wider font-body">{label}</span>
            </div>
            <p className="text-sm lg:text-lg font-bold text-[#2B2B2B] font-heading">
                <span className="text-[#329937]">{repeatValue}%</span>
                <span className="text-[10px] lg:text-xs font-normal text-[#52525B]"> R </span>
                <span className="text-[#F26B33]">{newValue}%</span>
                <span className="text-[10px] lg:text-xs font-normal text-[#52525B]"> N</span>
            </p>
        </div>
    );

    return (
        <ResponsiveLayout>
            {/* Migration Overlay */}
            {showMigrationOverlay && (
                <MigrationOverlay 
                    api={api}
                    onClose={() => setShowMigrationOverlay(false)}
                    onComplete={handleMigrationComplete}
                />
            )}
            
            <div className="p-4 lg:p-6 xl:p-8 max-w-[1600px] mx-auto">
                {/* Compact Header */}
                <div className="flex items-center justify-between mb-5 lg:mb-6">
                    <div>
                        <h1 className="text-xl lg:text-2xl font-bold text-[#1A1A1A] font-['Georgia']" data-testid="dashboard-title">
                            Dashboard
                        </h1>
                        <p className="text-gray-500 text-sm">Welcome back, {user?.restaurant_name}</p>
                    </div>
                    
                    {/* Profile Dropdown */}
                    <div className="relative">
                        <button 
                            onClick={() => setMenuOpen(!menuOpen)}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
                            data-testid="profile-dropdown"
                        >
                            <Avatar className="w-8 h-8 bg-[#F26B33]">
                                <AvatarFallback className="bg-[#F26B33] text-white font-semibold text-sm">
                                    {user?.restaurant_name?.charAt(0)}
                                </AvatarFallback>
                            </Avatar>
                            <span className="hidden md:inline text-sm font-medium text-gray-700 max-w-[150px] truncate">
                                {user?.restaurant_name}
                            </span>
                            <ChevronDown className="w-4 h-4 text-gray-500" />
                        </button>
                        {menuOpen && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                                <div className="absolute right-0 top-12 w-56 bg-white rounded-xl shadow-lg border border-gray-100 z-50 overflow-hidden">
                                    <div className="p-3 border-b border-gray-100">
                                        <p className="text-sm font-medium text-[#2B2B2B] font-body">{user?.restaurant_name}</p>
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

                {/* Reset Password Modal */}
                {showResetPassword && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                        <div className="bg-white rounded-2xl w-full max-w-sm lg:max-w-md p-6 shadow-xl">
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

                {/* Tab Switcher */}
                <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl max-w-md lg:max-w-lg">
                    <button
                        onClick={() => setActiveTab("crm")}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-all ${
                            activeTab === "crm" 
                                ? "bg-white text-[#F26B33] shadow-sm" 
                                : "text-gray-600 hover:text-gray-900"
                        }`}
                        data-testid="crm-tab"
                    >
                        <BarChart3 className="w-4 h-4" />
                        CRM
                    </button>
                    <button
                        onClick={() => setActiveTab("messages")}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-all ${
                            activeTab === "messages" 
                                ? "bg-white text-[#F26B33] shadow-sm" 
                                : "text-gray-600 hover:text-gray-900"
                        }`}
                        data-testid="messages-tab"
                    >
                        <MessageSquare className="w-4 h-4" />
                        Messages
                    </button>
                </div>

                {/* CRM Content */}
                {activeTab === "crm" && (
                <>
                    {/* Section: Loyalty & Revenue Overview */}
                    <div className="mb-6">
                        <h2 className="text-sm lg:text-base font-semibold text-[#52525B] mb-3 uppercase tracking-wider">Loyalty & Revenue Overview</h2>
                        <div className="grid grid-cols-3 lg:grid-cols-6 gap-2 lg:gap-4">
                            <StatCard icon={Repeat} label="Loyalty Orders" value={stats?.loyalty_orders_percent || 0} suffix="%" color="#F26B33" highlight />
                            <StatCard icon={Repeat} label="Loyalty (30D)" value={stats?.loyalty_orders_percent_30d || 0} suffix="%" color="#F26B33" />
                            <StatCard icon={Repeat} label="Loyalty (7D)" value={stats?.loyalty_orders_percent_7d || 0} suffix="%" color="#F26B33" />
                            <SplitStatCard icon={TrendingUp} label="Revenue Split" repeatValue={stats?.repeat_revenue_percent || 0} newValue={stats?.new_revenue_percent || 0} highlight />
                            <SplitStatCard icon={TrendingUp} label="Split (30D)" repeatValue={stats?.repeat_revenue_percent_30d || 0} newValue={stats?.new_revenue_percent_30d || 0} />
                            <SplitStatCard icon={TrendingUp} label="Split (7D)" repeatValue={stats?.repeat_revenue_percent_7d || 0} newValue={stats?.new_revenue_percent_7d || 0} />
                        </div>
                    </div>

                    {/* Section: Customer Metrics */}
                    <div className="mb-6">
                        <h2 className="text-sm lg:text-base font-semibold text-[#52525B] mb-3 uppercase tracking-wider">Customer Metrics</h2>
                        <div className="grid grid-cols-3 lg:grid-cols-6 gap-2 lg:gap-4">
                            <StatCard icon={Users} label="Customers" value={stats?.total_customers || 0} color="#F26B33" />
                            <StatCard icon={Users} label="Active(30d)" value={stats?.active_customers_30d || 0} color="#329937" />
                            <StatCard icon={TrendingUp} label="New(7d)" value={stats?.new_customers_7d || 0} color="#329937" />
                            <StatCard 
                                icon={Repeat} 
                                label="Repeat 2+" 
                                value={stats?.repeat_2_plus || 0} 
                                color="#F26B33"
                                subValue={stats?.total_customers > 0 ? `${((stats.repeat_2_plus / stats.total_customers) * 100).toFixed(1)}%` : '0%'}
                            />
                            <StatCard 
                                icon={Repeat} 
                                label="Repeat 5+" 
                                value={stats?.repeat_5_plus || 0} 
                                color="#F26B33"
                                subValue={stats?.total_customers > 0 ? `${((stats.repeat_5_plus / stats.total_customers) * 100).toFixed(1)}%` : '0%'}
                            />
                            <StatCard 
                                icon={Repeat} 
                                label="Repeat 10+" 
                                value={stats?.repeat_10_plus || 0} 
                                color="#329937"
                                subValue={stats?.total_customers > 0 ? `${((stats.repeat_10_plus / stats.total_customers) * 100).toFixed(1)}%` : '0%'}
                            />
                        </div>
                    </div>

                    {/* Section: Inactive Customers */}
                    <div className="mb-6">
                        <h2 className="text-sm lg:text-base font-semibold text-[#52525B] mb-3 uppercase tracking-wider">Churn Risk</h2>
                        <div className="grid grid-cols-3 lg:grid-cols-6 gap-2 lg:gap-4">
                            <StatCard 
                                icon={UserMinus} 
                                label="Inactive 30d" 
                                value={stats?.inactive_30d || 0} 
                                color="#EF4444"
                                subValue={stats?.total_customers > 0 ? `${((stats.inactive_30d / stats.total_customers) * 100).toFixed(1)}%` : '0%'}
                            />
                            <StatCard 
                                icon={UserMinus} 
                                label="Inactive 60d" 
                                value={stats?.inactive_60d || 0} 
                                color="#EF4444"
                                subValue={stats?.total_customers > 0 ? `${((stats.inactive_60d / stats.total_customers) * 100).toFixed(1)}%` : '0%'}
                            />
                            <StatCard 
                                icon={UserMinus} 
                                label="Inactive 90d" 
                                value={stats?.inactive_90d || 0} 
                                color="#EF4444"
                                subValue={stats?.total_customers > 0 ? `${((stats.inactive_90d / stats.total_customers) * 100).toFixed(1)}%` : '0%'}
                            />
                            {/* Empty placeholders for desktop grid alignment */}
                            <div className="hidden lg:block"></div>
                            <div className="hidden lg:block"></div>
                            <div className="hidden lg:block"></div>
                        </div>
                    </div>

                    {/* Section: Points - Show only if loyalty_enabled */}
                    {stats?.loyalty_enabled && (
                    <div className="mb-6">
                        <h2 className="text-sm lg:text-base font-semibold text-[#52525B] mb-3 uppercase tracking-wider">Points Overview</h2>
                        <div className="grid grid-cols-3 lg:grid-cols-6 gap-2 lg:gap-4">
                            <StatCard icon={ArrowUpRight} label="Pts Issued" value={stats?.total_points_issued || 0} color="#329937" />
                            <StatCard icon={ArrowDownRight} label="Pts Redeemed" value={stats?.total_points_redeemed || 0} color="#EF4444" />
                            <StatCard icon={Star} label="Pts Balance" value={stats?.points_balance || 0} color="#329937" />
                            <div className="hidden lg:block"></div>
                            <div className="hidden lg:block"></div>
                            <div className="hidden lg:block"></div>
                        </div>
                    </div>
                    )}

                    {/* Section: Wallet - Show only if wallet_enabled */}
                    {stats?.wallet_enabled && (
                    <div className="mb-6">
                        <h2 className="text-sm lg:text-base font-semibold text-[#52525B] mb-3 uppercase tracking-wider">Wallet Overview</h2>
                        <div className="grid grid-cols-3 lg:grid-cols-6 gap-2 lg:gap-4">
                            <StatCard icon={Wallet} label="Wallet In" value={stats?.wallet_issued || 0} prefix="₹" color="#F26B33" />
                            <StatCard icon={Wallet} label="Wallet Out" value={stats?.wallet_used || 0} prefix="₹" color="#EF4444" />
                            <StatCard icon={Wallet} label="Wallet Bal" value={stats?.wallet_balance || 0} prefix="₹" color="#F26B33" />
                            <div className="hidden lg:block"></div>
                            <div className="hidden lg:block"></div>
                            <div className="hidden lg:block"></div>
                        </div>
                    </div>
                    )}

                    {/* Section: Coupons - Show only if coupon_enabled */}
                    {stats?.coupon_enabled && (
                    <div className="mb-6">
                        <h2 className="text-sm lg:text-base font-semibold text-[#52525B] mb-3 uppercase tracking-wider">Coupons</h2>
                        <div className="grid grid-cols-3 lg:grid-cols-6 gap-2 lg:gap-4">
                            <StatCard icon={Ticket} label="Coupons" value={stats?.total_coupons || 0} color="#8B5CF6" />
                            <StatCard icon={Ticket} label="Used" value={stats?.coupons_used || 0} color="#F26B33" />
                            <StatCard icon={Ticket} label="Discount" value={stats?.discount_availed || 0} prefix="₹" color="#8B5CF6" />
                            <div className="hidden lg:block"></div>
                            <div className="hidden lg:block"></div>
                            <div className="hidden lg:block"></div>
                        </div>
                    </div>
                    )}

                    {/* Section: Orders & Revenue */}
                    <div className="mb-6">
                        <h2 className="text-sm lg:text-base font-semibold text-[#52525B] mb-3 uppercase tracking-wider">Orders & Revenue</h2>
                        <div className="grid grid-cols-3 lg:grid-cols-6 gap-2 lg:gap-4">
                            <StatCard icon={ShoppingBag} label="Orders" value={stats?.total_orders || 0} color="#8B5CF6" />
                            <StatCard icon={ShoppingBag} label="Avg Order" value={stats?.avg_order_value || 0} prefix="₹" color="#8B5CF6" />
                            <StatCard icon={Calendar} label="Orders/Day" value={stats?.avg_orders_per_day || 0} color="#8B5CF6" />
                            <StatCard icon={TrendingUp} label="Revenue" value={stats?.total_revenue || 0} prefix="₹" color="#329937" />
                            <StatCard icon={TrendingUp} label="Rev (30D)" value={stats?.revenue_30d || 0} prefix="₹" color="#329937" />
                            <StatCard icon={TrendingUp} label="Rev (7D)" value={stats?.revenue_7d || 0} prefix="₹" color="#329937" />
                        </div>
                    </div>
                </>
                )}

                {/* Messages Content */}
                {activeTab === "messages" && (
                    <div className="max-w-6xl">
                        <MessageStatusContent embedded={true} />
                    </div>
                )}

            </div>
        </ResponsiveLayout>
    );
}
