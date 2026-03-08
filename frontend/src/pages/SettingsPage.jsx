import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { MessageSquare, Plus, TrendingUp, Gift, User, LogOut, Edit2, Trash2, Tag, KeyRound, RefreshCw, Check, RotateCcw, Users, ShoppingCart, Wallet } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";

import { ResponsiveLayout } from "@/components/ResponsiveLayout";

import { WhatsAppAutomationContent } from "@/components/shared/WhatsAppAutomationContent";

export default function SettingsPage() {
    const { user, api, logout } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const initialTab = searchParams.get("tab") || "profile";
    const [activeSection, setActiveSection] = useState(initialTab);
    
    // Profile state
    const [whatsappApiKey, setWhatsappApiKey] = useState("");
    const [brandNumber, setBrandNumber] = useState("");
    const [metaWabaId, setMetaWabaId] = useState("");
    const [metaAccessToken, setMetaAccessToken] = useState("");
    const [savingApiKey, setSavingApiKey] = useState(false);
    const [profile, setProfile] = useState({ restaurant_name: "", phone: "", address: "" });
    const [savingProfile, setSavingProfile] = useState(false);

    // Coupons state
    const [coupons, setCoupons] = useState([]);
    const [couponsLoading, setCouponsLoading] = useState(false);
    const [showAddCouponModal, setShowAddCouponModal] = useState(false);
    const [editingCoupon, setEditingCoupon] = useState(null);
    const [customers, setCustomers] = useState([]);
    const [submittingCoupon, setSubmittingCoupon] = useState(false);
    const [newCoupon, setNewCoupon] = useState({
        code: "", discount_type: "percentage", discount_value: "", start_date: "", end_date: "",
        usage_limit: "", per_user_limit: "1", min_order_value: "0", max_discount: "",
        specific_users: [], applicable_channels: ["delivery", "takeaway", "dine_in"], description: ""
    });
    const [showSpecificUsers, setShowSpecificUsers] = useState(false);

    // Loyalty state
    const [loyaltySettings, setLoyaltySettings] = useState(null);
    const [loyaltyLoading, setLoyaltyLoading] = useState(false);
    const [savingLoyalty, setSavingLoyalty] = useState(false);

    // Migration state
    const [migrationStatus, setMigrationStatus] = useState(null);
    const [migrationLoading, setMigrationLoading] = useState(false);
    const [syncingCustomers, setSyncingCustomers] = useState(false);
    const [syncingOrders, setSyncingOrders] = useState(false);
    const [confirmingMigration, setConfirmingMigration] = useState(false);
    const [revertingMigration, setRevertingMigration] = useState(false);
    const [revertingCustomers, setRevertingCustomers] = useState(false);
    const [revertingOrders, setRevertingOrders] = useState(false);

    useEffect(() => {
        const fetchProfileData = async () => {
            try {
                const res = await api.get("/whatsapp/api-key");
                setWhatsappApiKey(res.data.authkey_api_key || "");
                setBrandNumber(res.data.brand_number || "");
                setMetaWabaId(res.data.meta_waba_id || "");
                setMetaAccessToken(res.data.meta_access_token || "");
            } catch (_) {}
            setProfile({ restaurant_name: user?.restaurant_name || "", phone: user?.phone || "", address: user?.address || "" });
        };
        fetchProfileData();
        // Fetch migration status on load to determine if tab should be shown
        fetchMigrationStatus();
    }, []);

    useEffect(() => {
        if (activeSection === "coupons" && coupons.length === 0) {
            fetchCoupons();
            fetchCustomers();
        }
    }, [activeSection]);

    useEffect(() => {
        if (activeSection === "loyalty" && !loyaltySettings) {
            fetchLoyaltySettings();
        }
    }, [activeSection]);

    // Redirect to profile if migration tab is hidden but currently selected
    useEffect(() => {
        if (activeSection === "migration" && migrationStatus && 
            (migrationStatus.migration_confirmed || migrationStatus.migration_skipped_permanently)) {
            setActiveSection("profile");
        }
    }, [migrationStatus, activeSection]);

    useEffect(() => {
        if (activeSection === "migration" && !migrationStatus) {
            fetchMigrationStatus();
        }
    }, [activeSection]);

    const fetchCoupons = async () => {
        setCouponsLoading(true);
        try { const res = await api.get("/coupons"); setCoupons(res.data); } catch (_) { toast.error("Failed to load coupons"); } finally { setCouponsLoading(false); }
    };

    const fetchCustomers = async () => {
        try { const res = await api.get("/customers?limit=500"); setCustomers(res.data); } catch (_) {}
    };

    const fetchLoyaltySettings = async () => {
        setLoyaltyLoading(true);
        try { const res = await api.get("/loyalty/settings"); setLoyaltySettings(res.data); } catch (_) { toast.error("Failed to load loyalty settings"); } finally { setLoyaltyLoading(false); }
    };

    const fetchMigrationStatus = async () => {
        setMigrationLoading(true);
        try { 
            const res = await api.get("/migration/status"); 
            setMigrationStatus(res.data); 
        } catch (_) { 
            toast.error("Failed to load migration status"); 
        } finally { 
            setMigrationLoading(false); 
        }
    };

    const handleSyncCustomers = async () => {
        setSyncingCustomers(true);
        try {
            // Start background sync
            const res = await api.post("/customers/sync-from-mygenie");
            
            if (res.data.status === "started") {
                toast.info("Customer sync started...");
                
                // Poll for status
                const pollStatus = async () => {
                    try {
                        const statusRes = await api.get("/customers/sync-status");
                        const status = statusRes.data;
                        
                        if (status.status === "running") {
                            const processed = status.synced + status.updated;
                            const total = status.total_customers || 0;
                            // Round to nearest 100 for large numbers, 10 for small
                            const roundTo = total > 500 ? 100 : 10;
                            const displayProcessed = Math.floor(processed / roundTo) * roundTo;
                            toast.loading(`Syncing customers... ${displayProcessed}/${total}`, { id: "customer-sync-progress" });
                            setTimeout(pollStatus, 1000); // Poll every 1 second (customers are faster)
                        } else if (status.status === "completed") {
                            toast.dismiss("customer-sync-progress");
                            toast.success(`Synced ${status.synced} new, updated ${status.updated} customers`);
                            setSyncingCustomers(false);
                            fetchMigrationStatus();
                        } else if (status.status === "failed") {
                            toast.dismiss("customer-sync-progress");
                            toast.error(status.error || "Sync failed");
                            setSyncingCustomers(false);
                            fetchMigrationStatus();
                        } else {
                            setSyncingCustomers(false);
                        }
                    } catch (err) {
                        toast.dismiss("customer-sync-progress");
                        setSyncingCustomers(false);
                    }
                };
                
                setTimeout(pollStatus, 500); // Start polling after 0.5 second
            } else {
                toast.error(res.data.message || "Failed to start sync");
                setSyncingCustomers(false);
            }
        } catch (err) {
            toast.error(err.response?.data?.detail || "Failed to sync customers");
            setSyncingCustomers(false);
        }
    };

    const handleSyncOrders = async () => {
        setSyncingOrders(true);
        try {
            // Start background sync
            const res = await api.post("/migration/sync-orders");
            
            if (res.data.status === "started") {
                toast.info("Order sync started. This may take a few minutes...");
                
                // Poll for status
                const pollStatus = async () => {
                    try {
                        const statusRes = await api.get("/migration/sync-orders/status");
                        const status = statusRes.data;
                        
                        if (status.status === "running") {
                            const processed = status.synced + status.updated;
                            const total = status.total_orders || 0;
                            // Round to nearest 100
                            const displayProcessed = Math.floor(processed / 100) * 100;
                            toast.loading(`Syncing orders... ${displayProcessed}/${total}`, { id: "sync-progress" });
                            setTimeout(pollStatus, 2000); // Poll every 2 seconds
                        } else if (status.status === "completed") {
                            toast.dismiss("sync-progress");
                            toast.success(`Synced ${status.synced} new, updated ${status.updated} orders`);
                            setSyncingOrders(false);
                            fetchMigrationStatus();
                        } else if (status.status === "failed") {
                            toast.dismiss("sync-progress");
                            toast.error(status.error || "Sync failed");
                            setSyncingOrders(false);
                            fetchMigrationStatus();
                        } else {
                            setSyncingOrders(false);
                        }
                    } catch (err) {
                        toast.dismiss("sync-progress");
                        setSyncingOrders(false);
                    }
                };
                
                setTimeout(pollStatus, 1000); // Start polling after 1 second
            } else {
                toast.error(res.data.message || "Failed to start sync");
                setSyncingOrders(false);
            }
        } catch (err) {
            toast.error(err.response?.data?.detail || "Failed to sync orders");
            setSyncingOrders(false);
        }
    };

    const handleConfirmMigration = async () => {
        setConfirmingMigration(true);
        try {
            await api.post("/migration/confirm");
            toast.success("Migration confirmed successfully!");
            fetchMigrationStatus();
        } catch (err) {
            toast.error(err.response?.data?.detail || "Failed to confirm migration");
        } finally {
            setConfirmingMigration(false);
        }
    };

    const handleRevertMigration = async () => {
        if (!confirm("This will delete all synced customers and orders. Are you sure?")) return;
        setRevertingMigration(true);
        try {
            const res = await api.post("/migration/revert");
            toast.success(`Reverted: ${res.data.customers_deleted} customers, ${res.data.orders_deleted} orders deleted`);
            fetchMigrationStatus();
        } catch (err) {
            toast.error(err.response?.data?.detail || "Failed to revert migration");
        } finally {
            setRevertingMigration(false);
        }
    };

    const handleRevertCustomers = async () => {
        setRevertingCustomers(true);
        try {
            const res = await api.post("/migration/revert-customers");
            toast.success(`${res.data.customers_deleted} customers deleted`);
            fetchMigrationStatus();
        } catch (err) {
            toast.error(err.response?.data?.detail || "Failed to revert customers");
        } finally {
            setRevertingCustomers(false);
        }
    };

    const handleRevertOrders = async () => {
        setRevertingOrders(true);
        try {
            const res = await api.post("/migration/revert-orders");
            toast.success(`${res.data.orders_deleted} orders deleted`);
            fetchMigrationStatus();
        } catch (err) {
            toast.error(err.response?.data?.detail || "Failed to revert orders");
        } finally {
            setRevertingOrders(false);
        }
    };

    const handleSaveApiKey = async () => {
        setSavingApiKey(true);
        try { 
            await api.put("/whatsapp/api-key", { 
                authkey_api_key: whatsappApiKey,
                brand_number: brandNumber,
                meta_waba_id: metaWabaId,
                meta_access_token: metaAccessToken
            }); 
            toast.success("WhatsApp settings saved!"); 
        } catch (_) { 
            toast.error("Failed to save settings"); 
        } finally { 
            setSavingApiKey(false); 
        }
    };

    const handleSaveProfile = async () => {
        setSavingProfile(true);
        try { await api.put("/auth/profile", profile); toast.success("Profile updated!"); } catch (_) { toast.error("Failed to update profile"); } finally { setSavingProfile(false); }
    };

    const handleSaveLoyalty = async () => {
        setSavingLoyalty(true);
        try { await api.put("/loyalty/settings", loyaltySettings); toast.success("Loyalty settings saved!"); } catch (_) { toast.error("Failed to save settings"); } finally { setSavingLoyalty(false); }
    };

    const handleLogout = () => { logout(); navigate("/login"); toast.success("Logged out successfully"); };

    const resetCouponForm = () => {
        setNewCoupon({ code: "", discount_type: "percentage", discount_value: "", start_date: "", end_date: "", usage_limit: "", per_user_limit: "1", min_order_value: "0", max_discount: "", specific_users: [], applicable_channels: ["delivery", "takeaway", "dine_in"], description: "" });
        setShowSpecificUsers(false); setEditingCoupon(null);
    };

    const handleCouponSubmit = async (e) => {
        e.preventDefault(); setSubmittingCoupon(true);
        try {
            const couponData = { code: newCoupon.code, discount_type: newCoupon.discount_type, discount_value: parseFloat(newCoupon.discount_value), start_date: newCoupon.start_date, end_date: newCoupon.end_date, usage_limit: newCoupon.usage_limit ? parseInt(newCoupon.usage_limit) : null, per_user_limit: parseInt(newCoupon.per_user_limit) || 1, min_order_value: parseFloat(newCoupon.min_order_value) || 0, max_discount: newCoupon.max_discount ? parseFloat(newCoupon.max_discount) : null, specific_users: showSpecificUsers && newCoupon.specific_users.length > 0 ? newCoupon.specific_users : null, applicable_channels: newCoupon.applicable_channels, description: newCoupon.description || null };
            if (editingCoupon) { await api.put(`/coupons/${editingCoupon.id}`, couponData); toast.success("Coupon updated!"); } else { await api.post("/coupons", couponData); toast.success("Coupon created!"); }
            setShowAddCouponModal(false); resetCouponForm(); fetchCoupons();
        } catch (err) { toast.error(err.response?.data?.detail || "Failed to save coupon"); } finally { setSubmittingCoupon(false); }
    };

    const handleEditCoupon = (coupon) => {
        setEditingCoupon(coupon);
        setNewCoupon({ code: coupon.code, discount_type: coupon.discount_type, discount_value: coupon.discount_value.toString(), start_date: coupon.start_date.split("T")[0], end_date: coupon.end_date.split("T")[0], usage_limit: coupon.usage_limit?.toString() || "", per_user_limit: coupon.per_user_limit.toString(), min_order_value: coupon.min_order_value.toString(), max_discount: coupon.max_discount?.toString() || "", specific_users: coupon.specific_users || [], applicable_channels: coupon.applicable_channels, description: coupon.description || "" });
        setShowSpecificUsers(coupon.specific_users && coupon.specific_users.length > 0); setShowAddCouponModal(true);
    };

    const handleDeleteCoupon = async (couponId) => { if (!confirm("Delete this coupon?")) return; try { await api.delete(`/coupons/${couponId}`); toast.success("Coupon deleted"); fetchCoupons(); } catch (_) { toast.error("Failed to delete coupon"); } };

    const toggleChannel = (channel) => { setNewCoupon(prev => ({ ...prev, applicable_channels: prev.applicable_channels.includes(channel) ? prev.applicable_channels.filter(c => c !== channel) : [...prev.applicable_channels, channel] })); };

    const formatDate = (dateStr) => { if (!dateStr) return ""; return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); };

    const isCouponActive = (coupon) => { const now = new Date(); return coupon.is_active && now >= new Date(coupon.start_date) && now <= new Date(coupon.end_date); };

    // Hide Migration tab if migration is completed or skipped permanently
    const shouldShowMigration = !migrationStatus?.migration_confirmed && !migrationStatus?.migration_skipped_permanently;
    
    // All tabs use Orange for non-selected, Green for selected
    const allTabs = [
        { key: "migration", icon: RefreshCw, label: "Migration" },
        { key: "profile", icon: User, label: "Profile" },
        { key: "whatsapp", icon: MessageSquare, label: "WhatsApp" },
        { key: "loyalty", icon: Gift, label: "Loyalty" },
        { key: "coupons", icon: Tag, label: "Coupons" },
        { key: "wallet", icon: Wallet, label: "Wallet" }
    ];
    
    const tabs = shouldShowMigration ? allTabs : allTabs.filter(t => t.key !== "migration");

    return (

        <ResponsiveLayout>
            <div className="p-4 lg:p-6 xl:p-8 max-w-[1600px] mx-auto">

    
                <h1 className="text-2xl font-bold text-[#2B2B2B] mb-6 font-heading" data-testid="settings-title">Settings</h1>

                {/* Tab Cards - All have green border, orange ring around icon
                    Non-selected: outlined icon, Selected: filled icon */}
                <div className="grid grid-cols-5 gap-2 mb-4">
                    {tabs.map(({ key, icon: Icon, label }) => {
                        const isSelected = activeSection === key;
                        // Use WhatsApp green for WhatsApp tab
                        const isWhatsApp = key === "whatsapp";
                        return (
                            <button
                                key={key}
                                onClick={() => setActiveSection(key)}
                                className="flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all bg-white shadow-sm border-2 border-[#329937]"
                                data-testid={`tab-${key}`}
                            >
                                <div 
                                    className={`w-10 h-10 rounded-full flex items-center justify-center border-[3px] border-[#F26B33] ${
                                        isSelected 
                                            ? isWhatsApp ? "bg-[#25D366]" : "bg-[#329937]"
                                            : isWhatsApp ? "bg-[#25D366]/15" : "bg-[#329937]/15"
                                    }`}
                                >
                                    <Icon 
                                        className="w-5 h-5" 
                                        style={{ color: isSelected ? "#FFFFFF" : isWhatsApp ? "#25D366" : "#329937" }} 
                                        strokeWidth={isSelected ? 2.5 : 1.5}
                                    />
                                </div>
                                <p className={`text-[10px] font-medium font-body ${isWhatsApp ? "text-[#25D366]" : "text-[#329937]"}`}>
                                    {label}
                                </p>
                            </button>
                        );
                    })}
                </div>

                {/* Profile Tab Content */}
                {activeSection === "profile" && (
                    <div className="space-y-4">
                        <Card className="rounded-xl border-0 shadow-sm" data-testid="whatsapp-api-key-card">
                            <CardContent className="p-4 space-y-4">
                                <div className="flex items-start gap-3">
                                    <div className="w-10 h-10 rounded-full bg-[#25D366]/10 flex items-center justify-center flex-shrink-0"><MessageSquare className="w-5 h-5 text-[#25D366]" /></div>
                                    <div><p className="font-medium text-[#2B2B2B] font-body">WhatsApp Configuration</p><p className="text-xs text-[#52525B] mt-1 font-body">Configure your WhatsApp Business API credentials</p></div>
                                </div>
                                <div className="space-y-3">
                                    <div>
                                        <Label className="form-label font-body">AuthKey API Key</Label>
                                        <Input type="password" value={whatsappApiKey} onChange={(e) => setWhatsappApiKey(e.target.value)} placeholder="Enter your AuthKey.io API key" className="h-12 rounded-xl font-mono" data-testid="whatsapp-api-key-input" />
                                    </div>
                                    <div>
                                        <Label className="form-label font-body">Brand Number</Label>
                                        <Input value={brandNumber} onChange={(e) => setBrandNumber(e.target.value)} placeholder="e.g., 917666859544" className="h-12 rounded-xl font-mono" data-testid="brand-number-input" />
                                        <p className="text-xs text-gray-400 mt-1">WhatsApp Business phone with country code (no +)</p>
                                    </div>
                                    <div>
                                        <Label className="form-label font-body">Meta WABA ID</Label>
                                        <Input value={metaWabaId} onChange={(e) => setMetaWabaId(e.target.value)} placeholder="e.g., 1427078455442831" className="h-12 rounded-xl font-mono" data-testid="meta-waba-id-input" />
                                        <p className="text-xs text-gray-400 mt-1">WhatsApp Business Account ID from Meta</p>
                                    </div>
                                    <div>
                                        <Label className="form-label font-body">Meta Access Token</Label>
                                        <Input type="password" value={metaAccessToken} onChange={(e) => setMetaAccessToken(e.target.value)} placeholder="Enter Meta access token" className="h-12 rounded-xl font-mono" data-testid="meta-access-token-input" />
                                        <p className="text-xs text-gray-400 mt-1">Permanent access token from Meta Business</p>
                                    </div>
                                </div>
                                <Button onClick={handleSaveApiKey} disabled={savingApiKey} className="w-full h-12 rounded-xl bg-[#25D366] hover:bg-[#1da851] text-white font-body" data-testid="save-whatsapp-api-key-btn">{savingApiKey ? "Saving..." : "Save WhatsApp Settings"}</Button>
                            </CardContent>
                        </Card>
                        <Card className="rounded-xl border-0 shadow-sm" data-testid="profile-card">
                            <CardContent className="p-4 space-y-4">
                                <div className="flex items-start gap-3">
                                    <div className="w-10 h-10 rounded-full bg-[#F26B33]/10 flex items-center justify-center flex-shrink-0"><User className="w-5 h-5 text-[#F26B33]" /></div>
                                    <div><p className="font-medium text-[#2B2B2B] font-body">Business Profile</p><p className="text-xs text-[#52525B] mt-1 font-body">Manage your business details</p></div>
                                </div>
                                <div className="space-y-3">
                                    <div><Label className="form-label">Business Name</Label><Input value={user?.restaurant_name || ""} disabled className="h-12 rounded-xl bg-gray-50 text-gray-500" /></div>
                                    <div><Label className="form-label">Email</Label><Input value={user?.email || ""} disabled className="h-12 rounded-xl bg-gray-50 text-gray-500" /></div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div><Label className="form-label">POS ID</Label><Input value={user?.pos_id || ""} disabled className="h-12 rounded-xl bg-gray-50 text-gray-500" /></div>
                                        <div><Label className="form-label">POS Name</Label><Input value={user?.pos_name || "MyGenie"} disabled className="h-12 rounded-xl bg-gray-50 text-gray-500" /></div>
                                    </div>
                                    <div><Label className="form-label">Phone</Label><Input value={profile.phone} onChange={(e) => setProfile(p => ({...p, phone: e.target.value}))} className="h-12 rounded-xl" /></div>
                                    <div><Label className="form-label">Address</Label><Input value={profile.address} onChange={(e) => setProfile(p => ({...p, address: e.target.value}))} placeholder="Enter business address" className="h-12 rounded-xl" /></div>
                                </div>
                                <Button onClick={handleSaveProfile} disabled={savingProfile} className="w-full h-12 rounded-xl bg-[#F26B33] hover:bg-[#D85A2A] text-white" data-testid="save-profile-btn">{savingProfile ? "Saving..." : "Save Profile"}</Button>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* Coupons Tab Content - Full Inline */}
                {activeSection === "coupons" && (
                    <div className="space-y-4">
                        {/* Coupon Toggle Card */}
                        <Card className="rounded-xl border-2 border-[#F26B33]/20 shadow-sm bg-[#F26B33]/5">
                            <CardContent className="p-4 space-y-4">
                                <div className="flex items-center gap-2">
                                    <Tag className="w-5 h-5 text-[#F26B33]" />
                                    <p className="font-semibold text-[#1A1A1A]">Coupons</p>
                                </div>
                                <p className="text-xs text-[#52525B]">Enable or disable coupons. When disabled, coupon features will be hidden.</p>
                                <div className="flex items-center justify-between p-3 bg-white rounded-lg border">
                                    <div>
                                        <p className="text-sm font-medium">Enable Coupons</p>
                                        <p className="text-xs text-[#52525B]">Create & manage promotional coupons</p>
                                    </div>
                                    <Switch 
                                        checked={loyaltySettings?.coupon_enabled ?? false} 
                                        onCheckedChange={async (c) => {
                                            try {
                                                await api.put("/loyalty/settings", { coupon_enabled: c });
                                                setLoyaltySettings({...loyaltySettings, coupon_enabled: c});
                                                toast.success(c ? "Coupons enabled" : "Coupons disabled");
                                            } catch (_) { toast.error("Failed to update"); }
                                        }} 
                                        data-testid="toggle-coupon"
                                    />
                                </div>
                            </CardContent>
                        </Card>
                        
                        {loyaltySettings?.coupon_enabled ? (
                        <>
                        <div className="flex items-center justify-between">
                            <p className="text-sm text-[#52525B]">Manage promotional coupons</p>
                            <Button onClick={() => { resetCouponForm(); setShowAddCouponModal(true); }} className="h-10 rounded-full bg-[#F26B33] hover:bg-[#D85A2A] px-4" data-testid="add-coupon-btn"><Plus className="w-4 h-4 mr-1" /> New</Button>
                        </div>
                        {couponsLoading ? (
                            <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="bg-white rounded-xl p-4 border animate-pulse"><div className="h-5 bg-gray-200 rounded w-32 mb-2"></div><div className="h-4 bg-gray-200 rounded w-40"></div></div>)}</div>
                        ) : coupons.length === 0 ? (
                            <div className="text-center py-12"><Tag className="w-16 h-16 mx-auto text-gray-300 mb-4" /><p className="text-[#52525B] mb-4">No coupons yet</p><Button onClick={() => setShowAddCouponModal(true)} className="bg-[#F26B33] hover:bg-[#D85A2A] rounded-full">Create your first coupon</Button></div>
                        ) : (
                            <div className="space-y-3">
                                {coupons.map(coupon => (
                                    <Card key={coupon.id} className={`rounded-xl border ${isCouponActive(coupon) ? 'border-[#329937]/30 bg-white' : 'border-gray-200 bg-gray-50'}`}>
                                        <CardContent className="p-4">
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <p className="font-bold text-[#1A1A1A] text-lg">{coupon.code}</p>
                                                        {isCouponActive(coupon) && <Badge className="bg-[#329937]/10 text-[#329937] text-xs border-0">Active</Badge>}
                                                        {!coupon.is_active && <Badge variant="outline" className="text-xs text-gray-500">Inactive</Badge>}
                                                        {coupon.is_active && new Date(coupon.end_date) < new Date() && <Badge variant="outline" className="text-xs text-red-500 border-red-200">Expired</Badge>}
                                                    </div>
                                                    <p className="text-sm text-[#F26B33] font-medium mt-1">{coupon.discount_type === "percentage" ? `${coupon.discount_value}% off` : `₹${coupon.discount_value} off`}{coupon.max_discount && coupon.discount_type === "percentage" && ` (max ₹${coupon.max_discount})`}</p>
                                                    <p className="text-xs text-[#A1A1AA] mt-1">{formatDate(coupon.start_date)} - {formatDate(coupon.end_date)}</p>
                                                    <Badge variant="outline" className="text-xs bg-gray-50 mt-2">Used: {coupon.total_used}{coupon.usage_limit ? `/${coupon.usage_limit}` : ''}</Badge>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <Button variant="ghost" size="sm" onClick={() => handleEditCoupon(coupon)} className="h-9 w-9 p-0 text-[#52525B] hover:text-[#F26B33]"><Edit2 className="w-4 h-4" /></Button>
                                                    <Button variant="ghost" size="sm" onClick={() => handleDeleteCoupon(coupon.id)} className="h-9 w-9 p-0 text-[#52525B] hover:text-red-600"><Trash2 className="w-4 h-4" /></Button>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        )}
                        </>
                        ) : (
                            <div className="text-center py-12">
                                <Tag className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                                <p className="text-[#52525B] mb-2">Coupons are disabled</p>
                                <p className="text-xs text-[#A1A1AA]">Enable coupons to create and manage promotional codes</p>
                            </div>
                        )}
                        <Dialog open={showAddCouponModal} onOpenChange={(open) => { setShowAddCouponModal(open); if (!open) resetCouponForm(); }}>
                            <DialogContent className="max-w-md mx-4 rounded-2xl max-h-[90vh] overflow-hidden flex flex-col">
                                <DialogHeader><DialogTitle>{editingCoupon ? "Edit Coupon" : "Create Coupon"}</DialogTitle></DialogHeader>
                                <form onSubmit={handleCouponSubmit} className="flex-1 overflow-hidden">
                                    <ScrollArea className="h-[calc(90vh-200px)] pr-4">
                                        <div className="space-y-4">
                                            <div><Label className="form-label">Coupon Code</Label><Input value={newCoupon.code} onChange={(e) => setNewCoupon({...newCoupon, code: e.target.value.toUpperCase()})} placeholder="e.g., SAVE10" className="h-12 rounded-xl uppercase" required /></div>
                                            <div><Label className="form-label">Discount Type</Label><Select value={newCoupon.discount_type} onValueChange={(v) => setNewCoupon({...newCoupon, discount_type: v})}><SelectTrigger className="h-12 rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="percentage">Percentage (%)</SelectItem><SelectItem value="fixed">Fixed Amount (₹)</SelectItem></SelectContent></Select></div>
                                            <div><Label className="form-label">Discount Value</Label><Input type="number" value={newCoupon.discount_value} onChange={(e) => setNewCoupon({...newCoupon, discount_value: e.target.value})} className="h-12 rounded-xl" required min="0" /></div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div><Label className="form-label">Start Date</Label><Input type="date" value={newCoupon.start_date} onChange={(e) => setNewCoupon({...newCoupon, start_date: e.target.value})} className="h-12 rounded-xl" required /></div>
                                                <div><Label className="form-label">End Date</Label><Input type="date" value={newCoupon.end_date} onChange={(e) => setNewCoupon({...newCoupon, end_date: e.target.value})} className="h-12 rounded-xl" required /></div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div><Label className="form-label">Usage Limit</Label><Input type="number" value={newCoupon.usage_limit} onChange={(e) => setNewCoupon({...newCoupon, usage_limit: e.target.value})} placeholder="Unlimited" className="h-12 rounded-xl" min="1" /></div>
                                                <div><Label className="form-label">Per User</Label><Input type="number" value={newCoupon.per_user_limit} onChange={(e) => setNewCoupon({...newCoupon, per_user_limit: e.target.value})} className="h-12 rounded-xl" min="1" /></div>
                                            </div>
                                            {newCoupon.discount_type === "percentage" && <div><Label className="form-label">Max Discount (₹)</Label><Input type="number" value={newCoupon.max_discount} onChange={(e) => setNewCoupon({...newCoupon, max_discount: e.target.value})} placeholder="No limit" className="h-12 rounded-xl" /></div>}
                                            <div><Label className="form-label">Min Order (₹)</Label><Input type="number" value={newCoupon.min_order_value} onChange={(e) => setNewCoupon({...newCoupon, min_order_value: e.target.value})} className="h-12 rounded-xl" min="0" /></div>
                                            <div className="space-y-2 border-t pt-4">
                                                <p className="text-sm font-semibold">Channels</p>
                                                {[{id:"delivery",label:"Delivery"},{id:"takeaway",label:"Takeaway"},{id:"dine_in",label:"Dine In"}].map(ch => (
                                                    <label key={ch.id} className="flex items-center justify-between py-1"><span className="text-sm">{ch.label}</span><Checkbox checked={newCoupon.applicable_channels.includes(ch.id)} onCheckedChange={() => toggleChannel(ch.id)} /></label>
                                                ))}
                                            </div>
                                        </div>
                                    </ScrollArea>
                                    <div className="flex gap-2 mt-4 pt-4 border-t">
                                        <Button type="button" variant="outline" onClick={() => setShowAddCouponModal(false)} className="flex-1 h-12 rounded-xl">Cancel</Button>
                                        <Button type="submit" disabled={submittingCoupon} className="flex-1 h-12 rounded-xl bg-[#F26B33] hover:bg-[#D85A2A]">{submittingCoupon ? "Saving..." : "Save"}</Button>
                                    </div>
                                </form>
                            </DialogContent>
                        </Dialog>
                    </div>
                )}

                {/* Wallet Tab Content */}
                {activeSection === "wallet" && (
                    <div className="space-y-4">
                        {/* Wallet Toggle Card */}
                        <Card className="rounded-xl border-2 border-purple-500/20 shadow-sm bg-purple-500/5">
                            <CardContent className="p-4 space-y-4">
                                <div className="flex items-center gap-2">
                                    <Wallet className="w-5 h-5 text-purple-500" />
                                    <p className="font-semibold text-[#1A1A1A]">Wallet</p>
                                </div>
                                <p className="text-xs text-[#52525B]">Enable or disable wallet feature. When disabled, wallet deposits and usage will be hidden.</p>
                                <div className="flex items-center justify-between p-3 bg-white rounded-lg border">
                                    <div>
                                        <p className="text-sm font-medium">Enable Wallet</p>
                                        <p className="text-xs text-[#52525B]">Allow customer wallet deposits & usage</p>
                                    </div>
                                    <Switch 
                                        checked={loyaltySettings?.wallet_enabled ?? false} 
                                        onCheckedChange={async (c) => {
                                            try {
                                                await api.put("/loyalty/settings", { wallet_enabled: c });
                                                setLoyaltySettings({...loyaltySettings, wallet_enabled: c});
                                                toast.success(c ? "Wallet enabled" : "Wallet disabled");
                                            } catch (_) { toast.error("Failed to update"); }
                                        }} 
                                        data-testid="toggle-wallet"
                                    />
                                </div>
                            </CardContent>
                        </Card>
                        
                        {loyaltySettings?.wallet_enabled ? (
                            <Card className="rounded-xl border-0 shadow-sm">
                                <CardContent className="p-6 text-center">
                                    <Wallet className="w-16 h-16 mx-auto text-purple-300 mb-4" />
                                    <p className="font-semibold text-[#1A1A1A]">Wallet Features Coming Soon</p>
                                    <p className="text-sm text-[#52525B] mt-2">Manage customer wallet deposits, balance tracking, and usage history.</p>
                                </CardContent>
                            </Card>
                        ) : (
                            <div className="text-center py-12">
                                <Wallet className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                                <p className="text-[#52525B] mb-2">Wallet is disabled</p>
                                <p className="text-xs text-[#A1A1AA]">Enable wallet to allow customer deposits and payments</p>
                            </div>
                        )}
                    </div>
                )}

                {/* WhatsApp Tab Content - Full Inline */}
                {activeSection === "whatsapp" && (
                    <WhatsAppAutomationContent embedded />
                )}

                {/* Migration Tab Content */}
                {activeSection === "migration" && (
                    <div className="space-y-4">
                        {migrationLoading ? (
                            <div className="animate-pulse space-y-4">
                                <div className="h-32 bg-gray-200 rounded-xl"></div>
                                <div className="h-32 bg-gray-200 rounded-xl"></div>
                            </div>
                        ) : migrationStatus?.migration_confirmed ? (
                            <Card className="rounded-xl border-0 shadow-sm bg-green-50">
                                <CardContent className="p-6 text-center">
                                    <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                                        <Check className="w-8 h-8 text-green-600" />
                                    </div>
                                    <p className="font-semibold text-green-800 text-lg">Migration Complete</p>
                                    <p className="text-sm text-green-600 mt-2">
                                        {migrationStatus.customers_synced} customers synced
                                    </p>
                                    <p className="text-xs text-green-500 mt-1">
                                        Confirmed on {new Date(migrationStatus.migration_confirmed_at).toLocaleDateString()}
                                    </p>
                                </CardContent>
                            </Card>
                        ) : (
                            <>
                                <Card className="rounded-xl border-0 shadow-sm">
                                    <CardContent className="p-4">
                                        <div className="flex items-start gap-3 mb-4">
                                            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                                                <RefreshCw className="w-5 h-5 text-blue-600" />
                                            </div>
                                            <div>
                                                <p className="font-semibold text-[#1A1A1A]">Data Migration</p>
                                                <p className="text-xs text-[#52525B] mt-1">Sync your data from MyGenie POS</p>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>

                                {/* Step 1: Sync Customers */}
                                <Card className="rounded-xl border-0 shadow-sm">
                                    <CardContent className="p-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold">1</div>
                                                <div>
                                                    <p className="font-medium text-[#1A1A1A]">Sync Customers</p>
                                                    <p className="text-xs text-[#52525B]">Import customers from MyGenie</p>
                                                </div>
                                            </div>
                                            {migrationStatus?.customers_synced > 0 && (
                                                <Badge className="bg-green-100 text-green-700 border-0">
                                                    {migrationStatus.customers_synced.toLocaleString()}{migrationStatus.total_customers_in_pos > 0 ? ` / ${migrationStatus.total_customers_in_pos.toLocaleString()}` : ''} synced
                                                </Badge>
                                            )}
                                        </div>
                                        <div className="flex gap-2">
                                            <Button 
                                                onClick={handleSyncCustomers}
                                                disabled={syncingCustomers}
                                                className={`${migrationStatus?.customers_synced > 0 ? 'flex-1' : 'w-full'} h-11 rounded-xl bg-blue-600 hover:bg-blue-700`}
                                                data-testid="sync-customers-btn"
                                            >
                                                <Users className="w-4 h-4 mr-2" />
                                                {syncingCustomers ? "Syncing..." : migrationStatus?.customers_synced > 0 ? "Sync Again" : "Sync Customers"}
                                            </Button>
                                            {migrationStatus?.customers_synced > 0 && (
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button 
                                                            disabled={revertingCustomers}
                                                            variant="outline"
                                                            className="flex-1 h-11 rounded-xl border-red-300 text-red-600 hover:bg-red-50"
                                                            data-testid="revert-customers-btn"
                                                        >
                                                            <RotateCcw className="w-4 h-4 mr-2" />
                                                            {revertingCustomers ? "Reverting..." : "Revert"}
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>Revert Customers?</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                This will delete all {migrationStatus?.customers_synced} synced customers. This action cannot be undone.
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                            <AlertDialogAction onClick={handleRevertCustomers} className="bg-red-600 hover:bg-red-700">
                                                                Delete Customers
                                                            </AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>

                                {/* Step 2: Sync Orders */}
                                <Card className="rounded-xl border-0 shadow-sm">
                                    <CardContent className="p-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold">2</div>
                                                <div>
                                                    <p className="font-medium text-[#1A1A1A]">Sync Orders</p>
                                                    <p className="text-xs text-[#52525B]">Import order history from MyGenie</p>
                                                </div>
                                            </div>
                                            {migrationStatus?.orders_synced > 0 && (
                                                <Badge className="bg-green-100 text-green-700 border-0">
                                                    {migrationStatus.orders_synced.toLocaleString()}{migrationStatus.total_orders_in_pos > 0 ? ` / ${migrationStatus.total_orders_in_pos.toLocaleString()}` : ''} synced
                                                </Badge>
                                            )}
                                        </div>
                                        <div className="flex gap-2">
                                            <Button 
                                                onClick={handleSyncOrders}
                                                disabled={syncingOrders}
                                                className={`${migrationStatus?.orders_synced > 0 ? 'flex-1' : 'w-full'} h-11 rounded-xl bg-blue-600 hover:bg-blue-700`}
                                                data-testid="sync-orders-btn"
                                            >
                                                <ShoppingCart className="w-4 h-4 mr-2" />
                                                {syncingOrders ? "Syncing..." : migrationStatus?.orders_synced > 0 ? "Sync Again" : "Sync Orders"}
                                            </Button>
                                            {migrationStatus?.orders_synced > 0 && (
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button 
                                                            disabled={revertingOrders}
                                                            variant="outline"
                                                            className="flex-1 h-11 rounded-xl border-red-300 text-red-600 hover:bg-red-50"
                                                            data-testid="revert-orders-btn"
                                                        >
                                                            <RotateCcw className="w-4 h-4 mr-2" />
                                                            {revertingOrders ? "Reverting..." : "Revert"}
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>Revert Orders?</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                This will delete all {migrationStatus?.orders_synced} synced orders. This action cannot be undone.
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                            <AlertDialogAction onClick={handleRevertOrders} className="bg-red-600 hover:bg-red-700">
                                                                Delete Orders
                                                            </AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>

                                {/* Step 3: Confirm Migration */}
                                <Card className="rounded-xl border-0 shadow-sm">
                                    <CardContent className="p-4">
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold">3</div>
                                            <div>
                                                <p className="font-medium text-[#1A1A1A]">Confirm Migration</p>
                                                <p className="text-xs text-[#52525B]">Finalize your data sync</p>
                                            </div>
                                        </div>
                                        <Button 
                                            onClick={handleConfirmMigration}
                                            disabled={confirmingMigration || (!migrationStatus?.customers_synced && !migrationStatus?.orders_synced)}
                                            className="w-full h-11 rounded-xl bg-green-600 hover:bg-green-700"
                                            data-testid="confirm-migration-btn"
                                        >
                                            <Check className="w-4 h-4 mr-2" />
                                            {confirmingMigration ? "Confirming..." : "Confirm Migration"}
                                        </Button>
                                    </CardContent>
                                </Card>
                            </>
                        )}
                    </div>
                )}

                {/* Loyalty Tab Content - Full Inline */}
                {activeSection === "loyalty" && (
                    <div className="space-y-4">
                        {loyaltyLoading ? (
                            <div className="animate-pulse space-y-4"><div className="h-32 bg-gray-200 rounded-xl"></div><div className="h-32 bg-gray-200 rounded-xl"></div></div>
                        ) : loyaltySettings && (
                            <>
                                {/* Master Toggles Card */}
                                <Card className="rounded-xl border-2 border-[#329937]/20 shadow-sm bg-[#329937]/5">
                                    <CardContent className="p-4 space-y-4">
                                        <div className="flex items-center gap-2">
                                            <Gift className="w-5 h-5 text-[#329937]" />
                                            <p className="font-semibold text-[#1A1A1A]">Loyalty Points</p>
                                        </div>
                                        <p className="text-xs text-[#52525B]">Enable or disable loyalty points. When disabled, no points calculations will happen during migration.</p>
                                        <div className="flex items-center justify-between p-3 bg-white rounded-lg border">
                                            <div>
                                                <p className="text-sm font-medium">Enable Loyalty Points</p>
                                                <p className="text-xs text-[#52525B]">Points earning & redemption</p>
                                            </div>
                                            <Switch 
                                                checked={loyaltySettings.loyalty_enabled ?? false} 
                                                onCheckedChange={(c) => setLoyaltySettings({...loyaltySettings, loyalty_enabled: c})} 
                                                data-testid="toggle-loyalty"
                                            />
                                        </div>
                                    </CardContent>
                                </Card>
                                
                                {/* Points Earning - Only show if loyalty enabled */}
                                {loyaltySettings.loyalty_enabled && (
                                <>
                                <Card className="rounded-xl border-0 shadow-sm">
                                    <CardContent className="p-4 space-y-4">
                                        <div className="flex items-center gap-2"><TrendingUp className="w-5 h-5 text-[#329937]" /><p className="font-semibold text-[#1A1A1A]">Points Earning</p></div>
                                        <div><Label className="form-label">Min Order Value (₹)</Label><Input type="number" min="0" value={loyaltySettings.min_order_value} onChange={(e) => setLoyaltySettings({...loyaltySettings, min_order_value: parseFloat(e.target.value)})} className="h-12 rounded-xl" /></div>
                                    </CardContent>
                                </Card>
                                <Card className="rounded-xl border-0 shadow-sm">
                                    <CardContent className="p-4">
                                        <p className="font-semibold text-[#1A1A1A] mb-3">Earning % by Tier</p>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div><Label className="form-label text-xs flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-600"></span>Bronze</Label><Input type="number" step="0.5" min="0" max="100" value={loyaltySettings.bronze_earn_percent} onChange={(e) => setLoyaltySettings({...loyaltySettings, bronze_earn_percent: parseFloat(e.target.value)})} className="h-10 rounded-lg" /></div>
                                            <div><Label className="form-label text-xs flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-400"></span>Silver</Label><Input type="number" step="0.5" min="0" max="100" value={loyaltySettings.silver_earn_percent} onChange={(e) => setLoyaltySettings({...loyaltySettings, silver_earn_percent: parseFloat(e.target.value)})} className="h-10 rounded-lg" /></div>
                                            <div><Label className="form-label text-xs flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500"></span>Gold</Label><Input type="number" step="0.5" min="0" max="100" value={loyaltySettings.gold_earn_percent} onChange={(e) => setLoyaltySettings({...loyaltySettings, gold_earn_percent: parseFloat(e.target.value)})} className="h-10 rounded-lg" /></div>
                                            <div><Label className="form-label text-xs flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-500"></span>Platinum</Label><Input type="number" step="0.5" min="0" max="100" value={loyaltySettings.platinum_earn_percent} onChange={(e) => setLoyaltySettings({...loyaltySettings, platinum_earn_percent: parseFloat(e.target.value)})} className="h-10 rounded-lg" /></div>
                                        </div>
                                    </CardContent>
                                </Card>
                                <Card className="rounded-xl border-0 shadow-sm">
                                    <CardContent className="p-4 space-y-4">
                                        <p className="font-semibold text-[#1A1A1A]">Points Redemption</p>
                                        <div className="bg-[#329937]/10 p-3 rounded-lg"><p className="text-sm text-[#329937] font-medium">1 Point = ₹{loyaltySettings.redemption_value}</p></div>
                                        <div><Label className="form-label">Point Value (₹)</Label><Input type="number" step="0.5" min="0.5" value={loyaltySettings.redemption_value} onChange={(e) => setLoyaltySettings({...loyaltySettings, redemption_value: parseFloat(e.target.value)})} className="h-12 rounded-xl" /></div>
                                        <div><Label className="form-label">Min Points to Redeem</Label><Input type="number" min="0" value={loyaltySettings.min_redemption_points} onChange={(e) => setLoyaltySettings({...loyaltySettings, min_redemption_points: parseInt(e.target.value)})} className="h-12 rounded-xl" /></div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div><Label className="form-label text-xs">Max % of Bill</Label><Input type="number" min="1" max="100" value={loyaltySettings.max_redemption_percent || 50} onChange={(e) => setLoyaltySettings({...loyaltySettings, max_redemption_percent: parseFloat(e.target.value)})} className="h-10 rounded-lg" /></div>
                                            <div><Label className="form-label text-xs">Max ₹ Amount</Label><Input type="number" min="0" value={loyaltySettings.max_redemption_amount || 500} onChange={(e) => setLoyaltySettings({...loyaltySettings, max_redemption_amount: parseFloat(e.target.value)})} className="h-10 rounded-lg" /></div>
                                        </div>
                                    </CardContent>
                                </Card>
                                <Card className="rounded-xl border-0 shadow-sm">
                                    <CardContent className="p-4 space-y-4">
                                        <p className="font-semibold text-[#1A1A1A]">Tier Thresholds (Points)</p>
                                        <div className="grid grid-cols-3 gap-3">
                                            <div><Label className="form-label text-xs">Silver</Label><Input type="number" min="0" value={loyaltySettings.tier_silver_min} onChange={(e) => setLoyaltySettings({...loyaltySettings, tier_silver_min: parseInt(e.target.value)})} className="h-10 rounded-lg" /></div>
                                            <div><Label className="form-label text-xs">Gold</Label><Input type="number" min="0" value={loyaltySettings.tier_gold_min} onChange={(e) => setLoyaltySettings({...loyaltySettings, tier_gold_min: parseInt(e.target.value)})} className="h-10 rounded-lg" /></div>
                                            <div><Label className="form-label text-xs">Platinum</Label><Input type="number" min="0" value={loyaltySettings.tier_platinum_min} onChange={(e) => setLoyaltySettings({...loyaltySettings, tier_platinum_min: parseInt(e.target.value)})} className="h-10 rounded-lg" /></div>
                                        </div>
                                    </CardContent>
                                </Card>
                                <Card className="rounded-xl border-0 shadow-sm">
                                    <CardContent className="p-4 space-y-3">
                                        <p className="font-semibold text-[#1A1A1A]">Bonus Features</p>
                                        <div className="flex items-center justify-between"><div><p className="text-sm font-medium">First Visit Bonus</p><p className="text-xs text-[#52525B]">{loyaltySettings.first_visit_bonus_points || 50} pts</p></div><Switch checked={loyaltySettings.first_visit_bonus_enabled ?? true} onCheckedChange={(c) => setLoyaltySettings({...loyaltySettings, first_visit_bonus_enabled: c})} /></div>
                                        <div className="flex items-center justify-between"><div><p className="text-sm font-medium">Birthday Bonus</p><p className="text-xs text-[#52525B]">{loyaltySettings.birthday_bonus_points || 100} pts</p></div><Switch checked={loyaltySettings.birthday_bonus_enabled ?? true} onCheckedChange={(c) => setLoyaltySettings({...loyaltySettings, birthday_bonus_enabled: c})} /></div>
                                        <div className="flex items-center justify-between"><div><p className="text-sm font-medium">Anniversary Bonus</p><p className="text-xs text-[#52525B]">{loyaltySettings.anniversary_bonus_points || 150} pts</p></div><Switch checked={loyaltySettings.anniversary_bonus_enabled ?? true} onCheckedChange={(c) => setLoyaltySettings({...loyaltySettings, anniversary_bonus_enabled: c})} /></div>
                                        <div className="flex items-center justify-between"><div><p className="text-sm font-medium">Feedback Bonus</p><p className="text-xs text-[#52525B]">{loyaltySettings.feedback_bonus_points || 25} pts</p></div><Switch checked={loyaltySettings.feedback_bonus_enabled ?? true} onCheckedChange={(c) => setLoyaltySettings({...loyaltySettings, feedback_bonus_enabled: c})} /></div>
                                    </CardContent>
                                </Card>
                                </>
                                )}
                                
                                <Button onClick={handleSaveLoyalty} className="w-full h-12 bg-[#329937] hover:bg-[#287a2d] rounded-full" disabled={savingLoyalty} data-testid="save-loyalty-btn">{savingLoyalty ? "Saving..." : "Save Settings"}</Button>
                            </>
                        )}
                    </div>
                )}

                {/* Logout - always visible at bottom */}
                <div className="mt-6">
                    <Button 
                        onClick={handleLogout} 
                        variant="outline" 
                        className="w-full h-12 rounded-full border-red-500 text-red-500 hover:bg-red-50" 
                        data-testid="logout-btn"
                    >
                        <LogOut className="w-4 h-4 mr-2" /> Logout
                    </Button>
                </div>
            </div>

        </ResponsiveLayout>

    );
}
