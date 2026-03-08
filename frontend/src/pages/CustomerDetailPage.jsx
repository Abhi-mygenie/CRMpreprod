import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Plus, ChevronRight, ArrowUpRight, ArrowDownRight, Gift, Phone, Mail, Edit2, Save, Wallet, ChevronLeft, TrendingUp, TrendingDown, Clock, CalendarDays, Utensils, Sparkles, MessageCircle, Ticket } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveLayout } from "@/components/ResponsiveLayout";

export default function CustomerDetailPage() {
    const { id } = useParams();
    const { api } = useAuth();
    const navigate = useNavigate();
    const [customer, setCustomer] = useState(null);
    const [transactions, setTransactions] = useState([]);
    const [walletTransactions, setWalletTransactions] = useState([]);
    const [expiringPoints, setExpiringPoints] = useState(null);
    const [insights, setInsights] = useState(null);
    const [insightsLoading, setInsightsLoading] = useState(true);
    const [loyaltyDetails, setLoyaltyDetails] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState("points");
    const [showPointsModal, setShowPointsModal] = useState(false);
    const [showWalletModal, setShowWalletModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [pointsAction, setPointsAction] = useState("earn");
    const [walletAction, setWalletAction] = useState("credit");
    const [pointsData, setPointsData] = useState({ points: "", bill_amount: "", description: "" });
    const [walletData, setWalletData] = useState({ amount: "", bonus: "", bonusType: "wallet", description: "", payment_method: "cash" });
    const [editData, setEditData] = useState({});
    const [submitting, setSubmitting] = useState(false);

    const fetchData = async () => {
        try {
            const [customerRes, txRes, walletTxRes, expiringRes] = await Promise.all([
                api.get(`/customers/${id}`),
                api.get(`/points/transactions/${id}`),
                api.get(`/wallet/transactions/${id}`),
                api.get(`/points/expiring/${id}`)
            ]);
            setCustomer(customerRes.data);
            setTransactions(txRes.data);
            setWalletTransactions(walletTxRes.data);
            setExpiringPoints(expiringRes.data);
        } catch (err) {
            toast.error("Customer not found");
            navigate("/customers");
        } finally {
            setLoading(false);
        }
    };

    const fetchInsights = async () => {
        try {
            setInsightsLoading(true);
            const res = await api.get(`/customers/${id}/insights`);
            setInsights(res.data);
        } catch (err) {
            // Insights are non-critical, fail silently
        } finally {
            setInsightsLoading(false);
        }
    };

    const fetchLoyaltyDetails = async () => {
        try {
            const res = await api.get(`/customers/${id}/loyalty-details`);
            setLoyaltyDetails(res.data);
        } catch (err) {
            // Non-critical, fail silently
        }
    };

    useEffect(() => {
        fetchData();
        fetchInsights();
        fetchLoyaltyDetails();
    }, [id]);

    const handlePointsTransaction = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await api.post("/points/transaction", {
                customer_id: id,
                points: parseInt(pointsData.points),
                transaction_type: pointsAction,
                description: pointsData.description || `${pointsAction === "bonus" ? "Bonus points" : "Points redeemed"}`,
                bill_amount: null
            });
            toast.success(`Points ${pointsAction === "bonus" ? "awarded" : "redeemed"} successfully!`);
            setShowPointsModal(false);
            setPointsData({ points: "", bill_amount: "", description: "" });
            fetchData();
        } catch (err) {
            toast.error(err.response?.data?.detail || "Transaction failed");
        } finally {
            setSubmitting(false);
        }
    };

    const handleWalletTransaction = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const paidAmount = parseFloat(walletData.amount);
            const bonusAmount = walletAction === "credit" && walletData.bonus ? parseFloat(walletData.bonus) : 0;
            const bonusType = walletData.bonusType || "wallet";
            
            // Credit wallet with paid amount (+ bonus if bonus goes to wallet)
            const walletCredit = bonusType === "wallet" ? paidAmount + bonusAmount : paidAmount;
            
            await api.post("/wallet/transaction", {
                customer_id: id,
                amount: walletAction === "credit" ? walletCredit : paidAmount,
                transaction_type: walletAction,
                description: walletData.description || (walletAction === "credit" 
                    ? (bonusAmount > 0 && bonusType === "wallet" ? `Paid ₹${paidAmount} + Bonus ₹${bonusAmount}` : "Wallet recharge")
                    : "Payment made"),
                payment_method: walletData.payment_method
            });
            
            // If bonus goes to points, add points separately
            if (walletAction === "credit" && bonusAmount > 0 && bonusType === "points") {
                await api.post("/points/transaction", {
                    customer_id: id,
                    points: bonusAmount,
                    transaction_type: "bonus",
                    description: `Bonus points on wallet recharge of ₹${paidAmount}`
                });
            }
            
            if (walletAction === "credit" && bonusAmount > 0) {
                if (bonusType === "wallet") {
                    toast.success(`₹${walletCredit} added to wallet (₹${paidAmount} paid + ₹${bonusAmount} bonus)!`);
                } else {
                    toast.success(`₹${paidAmount} added to wallet + ${bonusAmount} bonus points!`);
                }
            } else {
                toast.success(`₹${paidAmount} ${walletAction === "credit" ? "added to" : "deducted from"} wallet!`);
            }
            setShowWalletModal(false);
            setWalletData({ amount: "", bonus: "", bonusType: "wallet", description: "", payment_method: "cash" });
            fetchData();
        } catch (err) {
            toast.error(err.response?.data?.detail || "Transaction failed");
        } finally {
            setSubmitting(false);
        }
    };

    const openEditModal = () => {
        setEditData({
            name: customer.name,
            phone: customer.phone,
            country_code: customer.country_code || "+91",
            email: customer.email || "",
            dob: customer.dob || "",
            anniversary: customer.anniversary || "",
            customer_type: customer.customer_type || "normal",
            gst_name: customer.gst_name || "",
            gst_number: customer.gst_number || "",
            address: customer.address || "",
            city: customer.city || "",
            pincode: customer.pincode || "",
            allergies: customer.allergies || [],
            notes: customer.notes || ""
        });
        setShowEditModal(true);
    };

    const handleUpdateCustomer = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            // Only send fields that have actual values to avoid overwriting with empty strings
            const cleanData = {};
            for (const [key, value] of Object.entries(editData)) {
                if (value !== "" && value !== null && value !== undefined) {
                    cleanData[key] = value;
                }
            }
            await api.put(`/customers/${id}`, cleanData);
            toast.success("Customer updated successfully!");
            setShowEditModal(false);
            fetchData();
        } catch (err) {
            toast.error(err.response?.data?.detail || "Failed to update customer");
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <ResponsiveLayout>
                <div className="p-4 animate-pulse">
                    <div className="h-32 bg-gray-200 rounded-xl mb-4"></div>
                    <div className="h-24 bg-gray-200 rounded-xl"></div>
                </div>
            </ResponsiveLayout>
        );
    }

    return (
        <ResponsiveLayout>
            <div className="p-4 lg:p-6 xl:p-8 max-w-[1600px] mx-auto">
                {/* Back Button */}
                <button 
                    onClick={() => navigate("/customers")}
                    className="flex items-center text-[#52525B] mb-4"
                    data-testid="back-to-customers"
                >
                    <ChevronRight className="w-5 h-5 rotate-180 mr-1" />
                    Back to Customers
                </button>

                {/* Customer Card */}
                <Card className="rounded-2xl mb-4 overflow-hidden border-0 shadow-md" data-testid="customer-profile-card">
                    <div className="loyalty-card-gradient p-5 text-white">
                        <div className="flex items-start justify-between">
                            <div>
                                <h1 className="text-2xl font-bold font-['Montserrat']">{customer.name}</h1>
                                <div className="flex items-center gap-2 mt-1 text-white/80">
                                    <Phone className="w-4 h-4" />
                                    <span>{customer.phone}</span>
                                </div>
{/* Email hidden as per requirement */}
                                {/* Stats Subtitle */}
                                <div className="flex items-center gap-1.5 mt-2 text-white/90 text-sm">
                                    <span>{customer.total_visits} visit{customer.total_visits !== 1 ? 's' : ''}</span>
                                    <span className="text-white/50">•</span>
                                    <span>₹{customer.total_spent.toLocaleString()} spent</span>
                                    <span className="text-white/50">•</span>
                                    <span>Last: {customer.last_visit ? new Date(customer.last_visit).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : "N/A"}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={openEditModal}
                                    className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors"
                                    data-testid="edit-customer-btn"
                                >
                                    <Edit2 className="w-4 h-4" />
                                </button>
                                <Badge className={`tier-badge ${customer.tier.toLowerCase()} bg-white/20 border-0`}>
                                    {customer.tier}
                                </Badge>
                            </div>
                        </div>
                    </div>
                    
                    {/* Points, Wallet & Coupons Summary */}
                    <CardContent className="p-4 bg-white">
                        <div className="grid grid-cols-3 gap-3 mb-4">
                            {/* Points Card */}
                            <div className="p-3 bg-[#329937]/10 rounded-xl">
                                <p className="text-xs text-[#52525B] uppercase tracking-wider text-center">Points</p>
                                <p className="text-2xl font-bold text-[#329937] font-['Montserrat'] points-display text-center" data-testid="customer-points">
                                    {customer.total_points.toLocaleString()}
                                </p>
                                {loyaltyDetails && (
                                    <p className="text-xs text-[#329937]/70 text-center font-medium" data-testid="points-money-value">
                                        = ₹{loyaltyDetails.points_money_value}
                                    </p>
                                )}
                                <div className="border-t border-[#329937]/20 mt-2 pt-2">
                                    <div className="flex justify-between text-xs">
                                        <span className="text-[#52525B]">Earned</span>
                                        <span className="font-medium text-[#329937]">
                                            {(customer.total_points_earned || 0).toLocaleString()}
                                            {loyaltyDetails && <span className="text-[#329937]/60 ml-0.5">(₹{loyaltyDetails.earned_money_value})</span>}
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-xs mt-1">
                                        <span className="text-[#52525B]">Redeemed</span>
                                        <span className="font-medium text-[#EF4444]">
                                            {(customer.total_points_redeemed || 0).toLocaleString()}
                                            {loyaltyDetails && <span className="text-[#EF4444]/60 ml-0.5">(₹{loyaltyDetails.redeemed_money_value})</span>}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            {/* Wallet Card */}
                            <div className="p-3 bg-[#F26B33]/10 rounded-xl">
                                <p className="text-xs text-[#52525B] uppercase tracking-wider text-center">Wallet</p>
                                <p className="text-2xl font-bold text-[#F26B33] font-['Montserrat'] text-center" data-testid="customer-wallet">
                                    ₹{(customer.wallet_balance || 0).toLocaleString()}
                                </p>
                                <div className="border-t border-[#F26B33]/20 mt-2 pt-2">
                                    <div className="flex justify-between text-xs">
                                        <span className="text-[#52525B]">Added</span>
                                        <span className="font-medium text-[#329937]">₹{(customer.total_wallet_received || 0).toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between text-xs mt-1">
                                        <span className="text-[#52525B]">Used</span>
                                        <span className="font-medium text-[#EF4444]">₹{(customer.total_wallet_used || 0).toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>
                            {/* Coupons Card */}
                            <div className="p-3 bg-[#8B5CF6]/10 rounded-xl">
                                <p className="text-xs text-[#52525B] uppercase tracking-wider text-center">Coupons</p>
                                <p className="text-2xl font-bold text-[#8B5CF6] font-['Montserrat'] text-center" data-testid="customer-coupons-used">
                                    {(customer.total_coupon_used || 0)}
                                </p>
                                <p className="text-xs text-[#8B5CF6]/70 text-center font-medium">used</p>
                                <div className="border-t border-[#8B5CF6]/20 mt-2 pt-2">
                                    <div className="flex justify-between text-xs">
                                        <span className="text-[#52525B]">Available</span>
                                        <span className="font-medium text-[#8B5CF6]" data-testid="coupons-available-count">
                                            {loyaltyDetails?.active_coupons?.length || 0}
                                        </span>
                                    </div>
                                    {loyaltyDetails?.active_coupons?.length > 0 && (
                                        <div className="mt-1.5 space-y-1">
                                            {loyaltyDetails.active_coupons.slice(0, 2).map((c) => (
                                                <div key={c.id} className="flex items-center gap-1" data-testid={`coupon-code-${c.code}`}>
                                                    <Ticket className="w-3 h-3 text-[#8B5CF6] shrink-0" />
                                                    <span className="text-[10px] font-mono font-semibold text-[#8B5CF6] truncate">{c.code}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        
                        {/* Expiring Points Warning */}
                        {expiringPoints && expiringPoints.expiring_soon > 0 && (
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4" data-testid="expiring-points-warning">
                                <div className="flex items-start gap-2">
                                    <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                                        <span className="text-white text-xs font-bold">!</span>
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-amber-800">
                                            {expiringPoints.expiring_soon} points expiring soon
                                        </p>
                                        <p className="text-xs text-amber-600 mt-0.5">
                                            {expiringPoints.expiring_date && 
                                                `Expires on ${new Date(expiringPoints.expiring_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
                                            }
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                        
                        {/* Action Buttons */}
                        <div className="grid grid-cols-2 gap-3">
                            <Button 
                                onClick={() => { setPointsAction("bonus"); setShowPointsModal(true); }}
                                className="h-11 bg-[#329937] hover:bg-[#287A2D] rounded-full text-sm"
                                data-testid="add-points-btn"
                            >
                                <Gift className="w-4 h-4 mr-1" /> Give Bonus
                            </Button>
                            <Button 
                                onClick={() => { setWalletAction("credit"); setShowWalletModal(true); }}
                                className="h-11 bg-[#F26B33] hover:bg-[#D85A2A] rounded-full text-sm"
                                data-testid="add-wallet-btn"
                            >
                                <Plus className="w-4 h-4 mr-1" /> Add Money
                            </Button>
                        </div>
                        {/* HIDDEN: Redeem and Use Wallet functionality - commented out as per requirement */}
                        {/* 
                        <div className="grid grid-cols-2 gap-3 mt-2">
                            <Button 
                                onClick={() => { setPointsAction("redeem"); setShowPointsModal(true); }}
                                variant="outline"
                                className="h-11 border-[#329937] text-[#329937] hover:bg-[#329937]/10 rounded-full text-sm"
                                disabled={customer.total_points === 0}
                                data-testid="redeem-points-btn"
                            >
                                <Gift className="w-4 h-4 mr-1" /> Redeem
                            </Button>
                            <Button 
                                onClick={() => { setWalletAction("debit"); setShowWalletModal(true); }}
                                variant="outline"
                                className="h-11 border-[#F26B33] text-[#F26B33] hover:bg-[#F26B33]/10 rounded-full text-sm"
                                disabled={!customer.wallet_balance || customer.wallet_balance === 0}
                                data-testid="debit-wallet-btn"
                            >
                                <ArrowDownRight className="w-4 h-4 mr-1" /> Use Wallet
                            </Button>
                        </div>
                        */}
                    </CardContent>
                </Card>

                {/* AI Insights Card */}
                {!insightsLoading && insights && (insights.top_items?.length > 0 || insights.common_notes?.length > 0 || insights.preferred_day || insights.avg_frequency_days) && (
                    <Card className="rounded-xl border-0 shadow-sm mb-4 overflow-hidden" data-testid="insights-card">
                        <div className="bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-2.5 flex items-center gap-2 border-b border-amber-100">
                            <Sparkles className="w-4 h-4 text-amber-500" />
                            <span className="text-sm font-semibold text-amber-800">AI Insights</span>
                        </div>
                        <CardContent className="p-4 space-y-3">
                            {/* Top Items */}
                            {insights.top_items?.length > 0 && (
                                <div className="flex items-start gap-2.5" data-testid="insight-top-items">
                                    <Utensils className="w-4 h-4 text-[#F26B33] mt-0.5 shrink-0" />
                                    <div>
                                        <p className="text-xs text-[#52525B] font-medium mb-1">Top Items</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {insights.top_items.map((item, i) => (
                                                <span key={i} className="inline-flex items-center gap-1 bg-orange-50 text-orange-700 text-xs font-medium px-2 py-0.5 rounded-full">
                                                    {item.name} <span className="text-orange-400">({item.count}x)</span>
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Top Categories */}
                            {insights.top_categories?.length > 0 && (
                                <div className="flex items-start gap-2.5" data-testid="insight-categories">
                                    <Gift className="w-4 h-4 text-purple-500 mt-0.5 shrink-0" />
                                    <div>
                                        <p className="text-xs text-[#52525B] font-medium mb-1">Preferred Cuisine</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {insights.top_categories.map((cat, i) => (
                                                <span key={i} className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 text-xs font-medium px-2 py-0.5 rounded-full">
                                                    {cat.name} <span className="text-purple-400">({cat.percent}%)</span>
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Visit Pattern Row */}
                            <div className="flex flex-wrap gap-x-6 gap-y-2">
                                {/* Frequency */}
                                {insights.avg_frequency_days && (
                                    <div className="flex items-center gap-2" data-testid="insight-frequency">
                                        <Clock className="w-4 h-4 text-blue-500 shrink-0" />
                                        <span className="text-xs text-[#1A1A1A]">Every <strong>~{insights.avg_frequency_days} days</strong></span>
                                    </div>
                                )}

                                {/* Preferred Day */}
                                {insights.preferred_day && (
                                    <div className="flex items-center gap-2" data-testid="insight-day">
                                        <CalendarDays className="w-4 h-4 text-green-500 shrink-0" />
                                        <span className="text-xs text-[#1A1A1A]">Prefers <strong>{insights.preferred_day}s</strong></span>
                                    </div>
                                )}

                                {/* Preferred Time */}
                                {insights.preferred_time && (
                                    <div className="flex items-center gap-2" data-testid="insight-time">
                                        <Clock className="w-4 h-4 text-indigo-500 shrink-0" />
                                        <span className="text-xs text-[#1A1A1A]"><strong>{insights.preferred_time}</strong></span>
                                    </div>
                                )}
                            </div>

                            {/* Spending Trend */}
                            {insights.spending_trend && (
                                <div className="flex items-center gap-2" data-testid="insight-spending">
                                    {insights.spending_trend.direction === "up" ? (
                                        <TrendingUp className="w-4 h-4 text-green-500 shrink-0" />
                                    ) : (
                                        <TrendingDown className="w-4 h-4 text-red-500 shrink-0" />
                                    )}
                                    <span className="text-xs text-[#1A1A1A]">
                                        Spending <strong className={insights.spending_trend.direction === "up" ? "text-green-600" : "text-red-600"}>
                                            {insights.spending_trend.direction === "up" ? "+" : ""}{insights.spending_trend.change_percent}%
                                        </strong> vs last 3 months
                                    </span>
                                </div>
                            )}

                            {/* Common Customizations */}
                            {insights.common_notes?.length > 0 && (
                                <div className="flex items-start gap-2.5" data-testid="insight-notes">
                                    <MessageCircle className="w-4 h-4 text-teal-500 mt-0.5 shrink-0" />
                                    <div>
                                        <p className="text-xs text-[#52525B] font-medium mb-1">Common Requests</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {insights.common_notes.map((n, i) => (
                                                <span key={i} className="bg-teal-50 text-teal-700 text-xs px-2 py-0.5 rounded-full">
                                                    {n.note}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}

                {/* Tabs for Points & Wallet History */}
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-2 mb-4">
                        <TabsTrigger value="points" data-testid="points-tab">Points History</TabsTrigger>
                        <TabsTrigger value="wallet" data-testid="wallet-tab">Wallet History</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="points">
                        {transactions.length === 0 ? (
                            <div className="stats-card text-center py-8">
                                <p className="text-[#52525B]">No points transactions yet</p>
                            </div>
                        ) : (
                            <Card className="rounded-xl border-0 shadow-sm">
                                <CardContent className="p-4">
                                    {transactions.map((tx, index) => (
                                        <div key={tx.id} className={`transaction-item ${index === 0 ? "opacity-0 animate-fade-in" : ""}`}>
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                                    tx.transaction_type === "redeem" ? "bg-red-100" : "bg-green-100"
                                                }`}>
                                                    {tx.transaction_type === "redeem" ? (
                                                        <ArrowDownRight className="w-4 h-4 text-red-600" />
                                                    ) : (
                                                        <ArrowUpRight className="w-4 h-4 text-green-600" />
                                                    )}
                                                </div>
                                                <div>
                                                    <p className="font-medium text-[#1A1A1A] text-sm">{tx.description}</p>
                                                    <p className="text-xs text-[#A1A1AA]">
                                                        {new Date(tx.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                    </p>
                                                </div>
                                            </div>
                                            <p className={`font-semibold points-display ${
                                                tx.transaction_type === "redeem" ? "transaction-redeem" : "transaction-earn"
                                            }`}>
                                                {tx.transaction_type === "redeem" ? "-" : "+"}{tx.points}
                                            </p>
                                        </div>
                                    ))}
                                </CardContent>
                            </Card>
                        )}
                    </TabsContent>
                    
                    <TabsContent value="wallet">
                        {walletTransactions.length === 0 ? (
                            <div className="stats-card text-center py-8">
                                <p className="text-[#52525B]">No wallet transactions yet</p>
                            </div>
                        ) : (
                            <Card className="rounded-xl border-0 shadow-sm">
                                <CardContent className="p-4">
                                    {walletTransactions.map((tx, index) => (
                                        <div key={tx.id} className={`transaction-item ${index === 0 ? "opacity-0 animate-fade-in" : ""}`}>
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                                    tx.transaction_type === "debit" ? "bg-red-100" : "bg-green-100"
                                                }`}>
                                                    {tx.transaction_type === "debit" ? (
                                                        <ArrowDownRight className="w-4 h-4 text-red-600" />
                                                    ) : (
                                                        <ArrowUpRight className="w-4 h-4 text-green-600" />
                                                    )}
                                                </div>
                                                <div>
                                                    <p className="font-medium text-[#1A1A1A] text-sm">{tx.description}</p>
                                                    <p className="text-xs text-[#A1A1AA]">
                                                        {tx.payment_method && <span className="uppercase">{tx.payment_method} • </span>}
                                                        {new Date(tx.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                    </p>
                                                </div>
                                            </div>
                                            <p className={`font-semibold ${
                                                tx.transaction_type === "debit" ? "text-red-600" : "text-green-600"
                                            }`}>
                                                {tx.transaction_type === "debit" ? "-" : "+"}₹{tx.amount}
                                            </p>
                                        </div>
                                    ))}
                                </CardContent>
                            </Card>
                        )}
                    </TabsContent>
                </Tabs>
            </div>

            {/* Points Modal */}
            <Dialog open={showPointsModal} onOpenChange={setShowPointsModal}>
                <DialogContent className="max-w-sm mx-4 rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="font-['Montserrat']">
                            {pointsAction === "bonus" ? "Give Bonus Points" : "Redeem Points"}
                            {/* HIDDEN: Redeem button is hidden from UI but modal still works if triggered */}
                        </DialogTitle>
                        <DialogDescription>
                            {pointsAction === "bonus" 
                                ? "Award bonus points as a reward or gift" 
                                : `Available: ${customer?.total_points} points`
                            }
                            {/* HIDDEN: Redeem functionality - pointsAction="redeem" case still works but button is hidden from UI */}
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handlePointsTransaction}>
                        <div className="space-y-4 py-4">
                            <div>
                                <Label htmlFor="points" className="form-label">Points *</Label>
                                <Input
                                    id="points"
                                    type="number"
                                    min="1"
                                    max={pointsAction === "redeem" ? customer?.total_points : undefined}
                                    value={pointsData.points}
                                    onChange={(e) => setPointsData({...pointsData, points: e.target.value})}
                                    placeholder="Enter points"
                                    className="h-12 rounded-xl"
                                    required
                                    data-testid="points-amount-input"
                                />
                            </div>
                            <div>
                                <Label htmlFor="desc" className="form-label">Reason / Note *</Label>
                                <Input
                                    id="desc"
                                    value={pointsData.description}
                                    onChange={(e) => setPointsData({...pointsData, description: e.target.value})}
                                    placeholder={pointsAction === "bonus" ? "Birthday gift, Loyalty reward, etc." : "Discount applied"}
                                    className="h-12 rounded-xl"
                                    required
                                    data-testid="points-description-input"
                                />
                            </div>
                        </div>
                        <DialogFooter className="gap-2">
                            <Button 
                                type="button" 
                                variant="outline" 
                                onClick={() => setShowPointsModal(false)}
                                className="rounded-full"
                            >
                                Cancel
                            </Button>
                            <Button 
                                type="submit" 
                                className={`rounded-full ${pointsAction === "bonus" ? "bg-[#329937] hover:bg-[#287A2D]" : "bg-[#F26B33] hover:bg-[#D85A2A]"}`}
                                disabled={submitting}
                                data-testid="submit-points-btn"
                            >
                                {submitting ? "Processing..." : pointsAction === "bonus" ? "Give Points" : "Redeem"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Wallet Modal */}
            <Dialog open={showWalletModal} onOpenChange={setShowWalletModal}>
                <DialogContent className="max-w-sm mx-4 rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="font-['Montserrat']">
                            {walletAction === "credit" ? "Add Money to Wallet" : "Use Wallet Balance"}
                            {/* HIDDEN: Use Wallet button is hidden from UI but modal still works if triggered */}
                        </DialogTitle>
                        <DialogDescription>
                            Current balance: ₹{customer?.wallet_balance?.toLocaleString() || 0}
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleWalletTransaction}>
                        <div className="space-y-4 py-4">
                            <div>
                                <Label htmlFor="amount" className="form-label">
                                    {walletAction === "credit" ? "Amount Paid (₹) *" : "Amount (₹) *"}
                                </Label>
                                <Input
                                    id="amount"
                                    type="number"
                                    min="1"
                                    max={walletAction === "debit" ? customer?.wallet_balance : undefined}
                                    value={walletData.amount}
                                    onChange={(e) => setWalletData({...walletData, amount: e.target.value})}
                                    placeholder="Enter amount"
                                    className="h-12 rounded-xl"
                                    required
                                    data-testid="wallet-amount-input"
                                />
                            </div>
                            {walletAction === "credit" && (
                                <>
                                    <div>
                                        <Label htmlFor="bonus" className="form-label">Bonus Amount</Label>
                                        <Input
                                            id="bonus"
                                            type="number"
                                            min="0"
                                            value={walletData.bonus}
                                            onChange={(e) => setWalletData({...walletData, bonus: e.target.value})}
                                            placeholder="0"
                                            className="h-12 rounded-xl"
                                            data-testid="wallet-bonus-input"
                                        />
                                    </div>
                                    
                                    {/* Bonus Type Selector */}
                                    {walletData.bonus && parseFloat(walletData.bonus) > 0 && (
                                        <div>
                                            <Label className="form-label">Give Bonus As</Label>
                                            <div className="flex gap-2 mt-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setWalletData({...walletData, bonusType: "wallet"})}
                                                    className={`flex-1 py-3 px-3 rounded-xl text-sm font-medium border-2 transition-colors ${
                                                        walletData.bonusType === "wallet" 
                                                            ? "bg-[#329937]/10 text-[#329937] border-[#329937]" 
                                                            : "bg-white text-[#52525B] border-gray-200 hover:border-[#329937]"
                                                    }`}
                                                    data-testid="bonus-type-wallet"
                                                >
                                                    <div className="flex flex-col items-center gap-1">
                                                        <Wallet className="w-5 h-5" />
                                                        <span>Wallet Balance</span>
                                                        <span className="text-xs opacity-70">+₹{walletData.bonus}</span>
                                                    </div>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setWalletData({...walletData, bonusType: "points"})}
                                                    className={`flex-1 py-3 px-3 rounded-xl text-sm font-medium border-2 transition-colors ${
                                                        walletData.bonusType === "points" 
                                                            ? "bg-[#F26B33]/10 text-[#F26B33] border-[#F26B33]" 
                                                            : "bg-white text-[#52525B] border-gray-200 hover:border-[#F26B33]"
                                                    }`}
                                                    data-testid="bonus-type-points"
                                                >
                                                    <div className="flex flex-col items-center gap-1">
                                                        <Gift className="w-5 h-5" />
                                                        <span>Loyalty Points</span>
                                                        <span className="text-xs opacity-70">+{walletData.bonus} pts</span>
                                                    </div>
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                    
                                    {/* Total Credit Preview */}
                                    {walletData.amount && (
                                        <div className="p-3 bg-[#329937]/10 rounded-xl border border-[#329937]/20">
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-[#52525B]">Amount Paid:</span>
                                                <span className="font-medium">₹{walletData.amount}</span>
                                            </div>
                                            {walletData.bonus && parseFloat(walletData.bonus) > 0 && (
                                                <>
                                                    <div className="flex justify-between items-center text-sm mt-1">
                                                        <span className="text-[#52525B]">Bonus ({walletData.bonusType === "wallet" ? "Wallet" : "Points"}):</span>
                                                        <span className={`font-medium ${walletData.bonusType === "wallet" ? "text-[#329937]" : "text-[#F26B33]"}`}>
                                                            {walletData.bonusType === "wallet" ? `+₹${walletData.bonus}` : `+${walletData.bonus} pts`}
                                                        </span>
                                                    </div>
                                                </>
                                            )}
                                            <div className="flex justify-between items-center text-sm mt-2 pt-2 border-t border-[#329937]/20">
                                                <span className="font-semibold text-[#1A1A1A]">Wallet Credit:</span>
                                                <span className="font-bold text-[#329937]">
                                                    ₹{walletData.bonusType === "wallet" 
                                                        ? (parseFloat(walletData.amount || 0) + parseFloat(walletData.bonus || 0)).toLocaleString()
                                                        : parseFloat(walletData.amount || 0).toLocaleString()
                                                    }
                                                </span>
                                            </div>
                                            {walletData.bonus && parseFloat(walletData.bonus) > 0 && walletData.bonusType === "points" && (
                                                <div className="flex justify-between items-center text-sm mt-1">
                                                    <span className="font-semibold text-[#1A1A1A]">Points Credit:</span>
                                                    <span className="font-bold text-[#F26B33]">+{walletData.bonus} pts</span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    
                                    <div>
                                        <Label className="form-label">Payment Method</Label>
                                        <div className="flex gap-2 mt-2">
                                            {["cash", "upi", "card"].map((method) => (
                                                <button
                                                    key={method}
                                                    type="button"
                                                    onClick={() => setWalletData({...walletData, payment_method: method})}
                                                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${
                                                        walletData.payment_method === method 
                                                            ? "bg-[#F26B33] text-white border-[#F26B33]" 
                                                            : "bg-white text-[#52525B] border-gray-200 hover:border-[#F26B33]"
                                                    }`}
                                                    data-testid={`payment-method-${method}`}
                                                >
                                                    {method.toUpperCase()}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
                            <div>
                                <Label htmlFor="wallet-desc" className="form-label">Description</Label>
                                <Input
                                    id="wallet-desc"
                                    value={walletData.description}
                                    onChange={(e) => setWalletData({...walletData, description: e.target.value})}
                                    placeholder={walletAction === "credit" ? "Wallet recharge" : "Bill payment"}
                                    className="h-12 rounded-xl"
                                    data-testid="wallet-description-input"
                                />
                            </div>
                        </div>
                        <DialogFooter className="gap-2">
                            <Button 
                                type="button" 
                                variant="outline" 
                                onClick={() => setShowWalletModal(false)}
                                className="rounded-full"
                            >
                                Cancel
                            </Button>
                            <Button 
                                type="submit" 
                                className={`rounded-full ${walletAction === "credit" ? "bg-[#329937] hover:bg-[#287A2D]" : "bg-[#F26B33] hover:bg-[#D85A2A]"}`}
                                disabled={submitting}
                                data-testid="submit-wallet-btn"
                            >
                                {submitting ? "Processing..." : walletAction === "credit" ? "Add Money" : "Use Balance"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Edit Customer Modal */}
            <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
                <DialogContent className="max-w-md mx-4 rounded-2xl max-h-[90vh] overflow-hidden">
                    <DialogHeader>
                        <DialogTitle className="font-['Montserrat']">Edit Customer</DialogTitle>
                        <DialogDescription>Update customer details</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleUpdateCustomer}>
                        <ScrollArea className="h-[60vh] pr-4">
                            <div className="space-y-4 py-2">
                                <div>
                                    <Label className="form-label">Name *</Label>
                                    <Input
                                        value={editData.name || ""}
                                        onChange={(e) => setEditData({...editData, name: e.target.value})}
                                        placeholder="Customer name"
                                        className="h-11 rounded-xl"
                                        required
                                        data-testid="edit-name-input"
                                    />
                                </div>
                                
                                <div>
                                    <Label className="form-label">Phone Number * (Unique)</Label>
                                    <div className="flex gap-2">
                                        <Select 
                                            value={editData.country_code || "+91"} 
                                            onValueChange={(v) => setEditData({...editData, country_code: v})}
                                        >
                                            <SelectTrigger className="w-24 h-11 rounded-xl">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="+91">+91</SelectItem>
                                                <SelectItem value="+1">+1</SelectItem>
                                                <SelectItem value="+44">+44</SelectItem>
                                                <SelectItem value="+971">+971</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <Input
                                            value={editData.phone || ""}
                                            onChange={(e) => setEditData({...editData, phone: e.target.value})}
                                            placeholder="9876543210"
                                            className="flex-1 h-11 rounded-xl"
                                            required
                                            data-testid="edit-phone-input"
                                        />
                                    </div>
                                    <p className="text-xs text-[#52525B] mt-1">Phone number must be unique</p>
                                </div>

                                <div>
                                    <Label className="form-label">Email</Label>
                                    <Input
                                        type="email"
                                        value={editData.email || ""}
                                        onChange={(e) => setEditData({...editData, email: e.target.value})}
                                        placeholder="customer@email.com"
                                        className="h-11 rounded-xl"
                                        data-testid="edit-email-input"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <Label className="form-label">Date of Birth</Label>
                                        <Input
                                            type="date"
                                            value={editData.dob || ""}
                                            onChange={(e) => setEditData({...editData, dob: e.target.value})}
                                            className="h-11 rounded-xl"
                                            data-testid="edit-dob-input"
                                        />
                                    </div>
                                    <div>
                                        <Label className="form-label">Anniversary</Label>
                                        <Input
                                            type="date"
                                            value={editData.anniversary || ""}
                                            onChange={(e) => setEditData({...editData, anniversary: e.target.value})}
                                            className="h-11 rounded-xl"
                                            data-testid="edit-anniversary-input"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <Label className="form-label">Customer Type</Label>
                                    <Select 
                                        value={editData.customer_type || "normal"} 
                                        onValueChange={(v) => setEditData({...editData, customer_type: v})}
                                    >
                                        <SelectTrigger className="h-11 rounded-xl" data-testid="edit-customer-type">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="normal">Normal</SelectItem>
                                            <SelectItem value="corporate">Corporate</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {editData.customer_type === "corporate" && (
                                    <>
                                        <div>
                                            <Label className="form-label">GST Name</Label>
                                            <Input
                                                value={editData.gst_name || ""}
                                                onChange={(e) => setEditData({...editData, gst_name: e.target.value})}
                                                placeholder="Company Name"
                                                className="h-11 rounded-xl"
                                            />
                                        </div>
                                        <div>
                                            <Label className="form-label">GST Number</Label>
                                            <Input
                                                value={editData.gst_number || ""}
                                                onChange={(e) => setEditData({...editData, gst_number: e.target.value})}
                                                placeholder="29ABCDE1234F1Z5"
                                                className="h-11 rounded-xl"
                                            />
                                        </div>
                                    </>
                                )}

                                <div>
                                    <Label className="form-label">City</Label>
                                    <Input
                                        value={editData.city || ""}
                                        onChange={(e) => setEditData({...editData, city: e.target.value})}
                                        placeholder="Mumbai"
                                        className="h-11 rounded-xl"
                                    />
                                </div>

                                <div>
                                    <Label className="form-label">Address</Label>
                                    <Input
                                        value={editData.address || ""}
                                        onChange={(e) => setEditData({...editData, address: e.target.value})}
                                        placeholder="Full address"
                                        className="h-11 rounded-xl"
                                    />
                                </div>

                                <div>
                                    <Label className="form-label">Notes</Label>
                                    <Input
                                        value={editData.notes || ""}
                                        onChange={(e) => setEditData({...editData, notes: e.target.value})}
                                        placeholder="Any special notes..."
                                        className="h-11 rounded-xl"
                                    />
                                </div>
                            </div>
                        </ScrollArea>
                        <DialogFooter className="mt-4">
                            <Button 
                                type="button" 
                                variant="outline" 
                                onClick={() => setShowEditModal(false)}
                                className="rounded-full"
                            >
                                Cancel
                            </Button>
                            <Button 
                                type="submit" 
                                className="rounded-full bg-[#F26B33] hover:bg-[#D85A2A]"
                                disabled={submitting}
                                data-testid="save-edit-btn"
                            >
                                {submitting ? "Saving..." : "Save Changes"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </ResponsiveLayout>
    );
}
