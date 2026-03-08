import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Users, Plus, User, Edit2, Trash2, Tag } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ResponsiveLayout } from "@/components/ResponsiveLayout";

export default function CouponsPage() {
    const { api } = useAuth();
    const navigate = useNavigate();
    const [coupons, setCoupons] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingCoupon, setEditingCoupon] = useState(null);
    const [customers, setCustomers] = useState([]);
    const [submitting, setSubmitting] = useState(false);
    const [newCoupon, setNewCoupon] = useState({
        code: "",
        discount_type: "percentage",
        discount_value: "",
        start_date: "",
        end_date: "",
        usage_limit: "",
        per_user_limit: "1",
        min_order_value: "0",
        max_discount: "",
        specific_users: [],
        applicable_channels: ["delivery", "takeaway", "dine_in"],
        description: ""
    });
    const [showSpecificUsers, setShowSpecificUsers] = useState(false);

    const fetchCoupons = async () => {
        try {
            const res = await api.get("/coupons");
            setCoupons(res.data);
        } catch (err) {
            toast.error("Failed to load coupons");
        } finally {
            setLoading(false);
        }
    };

    const fetchCustomers = async () => {
        try {
            const res = await api.get("/customers?limit=500");
            setCustomers(res.data);
        } catch (err) {
            console.error("Failed to load customers");
        }
    };

    useEffect(() => {
        fetchCoupons();
        fetchCustomers();
    }, []);

    const resetForm = () => {
        setNewCoupon({
            code: "",
            discount_type: "percentage",
            discount_value: "",
            start_date: "",
            end_date: "",
            usage_limit: "",
            per_user_limit: "1",
            min_order_value: "0",
            max_discount: "",
            specific_users: [],
            applicable_channels: ["delivery", "takeaway", "dine_in"],
            description: ""
        });
        setShowSpecificUsers(false);
        setEditingCoupon(null);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const couponData = {
                code: newCoupon.code,
                discount_type: newCoupon.discount_type,
                discount_value: parseFloat(newCoupon.discount_value),
                start_date: newCoupon.start_date,
                end_date: newCoupon.end_date,
                usage_limit: newCoupon.usage_limit ? parseInt(newCoupon.usage_limit) : null,
                per_user_limit: parseInt(newCoupon.per_user_limit) || 1,
                min_order_value: parseFloat(newCoupon.min_order_value) || 0,
                max_discount: newCoupon.max_discount ? parseFloat(newCoupon.max_discount) : null,
                specific_users: showSpecificUsers && newCoupon.specific_users.length > 0 ? newCoupon.specific_users : null,
                applicable_channels: newCoupon.applicable_channels,
                description: newCoupon.description || null
            };

            if (editingCoupon) {
                await api.put(`/coupons/${editingCoupon.id}`, couponData);
                toast.success("Coupon updated!");
            } else {
                await api.post("/coupons", couponData);
                toast.success("Coupon created!");
            }
            setShowAddModal(false);
            resetForm();
            fetchCoupons();
        } catch (err) {
            toast.error(err.response?.data?.detail || "Failed to save coupon");
        } finally {
            setSubmitting(false);
        }
    };

    const handleEdit = (coupon) => {
        setEditingCoupon(coupon);
        setNewCoupon({
            code: coupon.code,
            discount_type: coupon.discount_type,
            discount_value: coupon.discount_value.toString(),
            start_date: coupon.start_date.split("T")[0],
            end_date: coupon.end_date.split("T")[0],
            usage_limit: coupon.usage_limit?.toString() || "",
            per_user_limit: coupon.per_user_limit.toString(),
            min_order_value: coupon.min_order_value.toString(),
            max_discount: coupon.max_discount?.toString() || "",
            specific_users: coupon.specific_users || [],
            applicable_channels: coupon.applicable_channels,
            description: coupon.description || ""
        });
        setShowSpecificUsers(coupon.specific_users && coupon.specific_users.length > 0);
        setShowAddModal(true);
    };

    const handleDelete = async (couponId) => {
        if (!confirm("Are you sure you want to delete this coupon?")) return;
        try {
            await api.delete(`/coupons/${couponId}`);
            toast.success("Coupon deleted");
            fetchCoupons();
        } catch (err) {
            toast.error("Failed to delete coupon");
        }
    };

    const toggleChannel = (channel) => {
        if (newCoupon.applicable_channels.includes(channel)) {
            setNewCoupon({
                ...newCoupon,
                applicable_channels: newCoupon.applicable_channels.filter(c => c !== channel)
            });
        } else {
            setNewCoupon({
                ...newCoupon,
                applicable_channels: [...newCoupon.applicable_channels, channel]
            });
        }
    };

    const toggleUser = (userId) => {
        if (newCoupon.specific_users.includes(userId)) {
            setNewCoupon({
                ...newCoupon,
                specific_users: newCoupon.specific_users.filter(id => id !== userId)
            });
        } else {
            setNewCoupon({
                ...newCoupon,
                specific_users: [...newCoupon.specific_users, userId]
            });
        }
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return "";
        const date = new Date(dateStr);
        return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    };

    const isCouponActive = (coupon) => {
        const now = new Date();
        const start = new Date(coupon.start_date);
        const end = new Date(coupon.end_date);
        return coupon.is_active && now >= start && now <= end;
    };

    return (
        <ResponsiveLayout>
            <div className="p-4 lg:p-6 xl:p-8 max-w-[1600px] mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <h1 className="text-2xl font-bold text-[#1A1A1A] font-['Montserrat']" data-testid="coupons-title">
                        Coupons
                    </h1>
                    <Button
                        onClick={() => { resetForm(); setShowAddModal(true); }}
                        className="h-10 rounded-full bg-[#F26B33] hover:bg-[#D85A2A] px-4"
                        data-testid="add-coupon-btn"
                    >
                        <Plus className="w-4 h-4 mr-1" /> New
                    </Button>
                </div>
                <p className="text-sm text-[#52525B] mb-4">Manage promotional coupons</p>

                {/* Content */}
                {loading ? (
                    <div className="space-y-3">
                        {[1,2,3].map(i => (
                            <div key={i} className="bg-white rounded-xl p-4 border border-gray-100 animate-pulse">
                                <div className="h-5 bg-gray-200 rounded w-32 mb-2"></div>
                                <div className="h-4 bg-gray-200 rounded w-40"></div>
                            </div>
                        ))}
                    </div>
                ) : coupons.length === 0 ? (
                    <div className="text-center py-12">
                        <Tag className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                        <p className="text-[#52525B] mb-4">No coupons yet</p>
                        <Button 
                            onClick={() => setShowAddModal(true)}
                            className="bg-[#F26B33] hover:bg-[#D85A2A] rounded-full"
                        >
                            Create your first coupon
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {coupons.map((coupon) => (
                            <Card 
                                key={coupon.id}
                                className={`rounded-xl border ${isCouponActive(coupon) ? 'border-[#329937]/30 bg-white' : 'border-gray-200 bg-gray-50'}`}
                                data-testid={`coupon-card-${coupon.id}`}
                            >
                                <CardContent className="p-4">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <p className="font-bold text-[#1A1A1A] text-lg">{coupon.code}</p>
                                                {isCouponActive(coupon) && (
                                                    <Badge className="bg-[#329937]/10 text-[#329937] text-xs border-0">Active</Badge>
                                                )}
                                                {!coupon.is_active && (
                                                    <Badge variant="outline" className="text-xs text-gray-500">Inactive</Badge>
                                                )}
                                                {coupon.is_active && new Date(coupon.end_date) < new Date() && (
                                                    <Badge variant="outline" className="text-xs text-red-500 border-red-200">Expired</Badge>
                                                )}
                                            </div>
                                            <p className="text-sm text-[#F26B33] font-medium mt-1">
                                                {coupon.discount_type === "percentage" 
                                                    ? `${coupon.discount_value}% off` 
                                                    : `₹${coupon.discount_value} off`}
                                                {coupon.max_discount && coupon.discount_type === "percentage" && 
                                                    ` (max ₹${coupon.max_discount})`}
                                            </p>
                                            <p className="text-xs text-[#A1A1AA] mt-1">
                                                {formatDate(coupon.start_date)} - {formatDate(coupon.end_date)}
                                            </p>
                                            <div className="flex items-center gap-2 mt-3 flex-wrap">
                                                <Badge variant="outline" className="text-xs bg-gray-50">
                                                    Used: {coupon.total_used}{coupon.usage_limit ? `/${coupon.usage_limit}` : ''}
                                                </Badge>
                                                {coupon.applicable_channels.map(ch => (
                                                    <Badge key={ch} variant="outline" className="text-xs capitalize bg-white">
                                                        {ch.replace("_", " ")}
                                                    </Badge>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Button 
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleEdit(coupon)}
                                                className="h-9 w-9 p-0 text-[#52525B] hover:text-[#F26B33] hover:bg-[#F26B33]/10"
                                                data-testid={`edit-coupon-${coupon.id}`}
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </Button>
                                            <Button 
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleDelete(coupon.id)}
                                                className="h-9 w-9 p-0 text-[#52525B] hover:text-red-600 hover:bg-red-50"
                                                data-testid={`delete-coupon-${coupon.id}`}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            {/* Add/Edit Coupon Modal */}
            <Dialog open={showAddModal} onOpenChange={(open) => { setShowAddModal(open); if (!open) resetForm(); }}>
                <DialogContent className="max-w-md mx-4 rounded-2xl max-h-[90vh] overflow-hidden flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="font-['Montserrat']">
                            {editingCoupon ? "Edit Coupon" : "Create Coupon"}
                        </DialogTitle>
                        <DialogDescription>
                            {editingCoupon ? "Update coupon details" : "Add a new promotional coupon"}
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="flex-1 overflow-hidden">
                        <ScrollArea className="h-[calc(90vh-200px)] pr-4">
                            <div className="space-y-4">
                                
                                <div>
                                    <Label className="form-label">Coupon Code</Label>
                                    <Input
                                        value={newCoupon.code}
                                        onChange={(e) => setNewCoupon({...newCoupon, code: e.target.value.toUpperCase()})}
                                        placeholder="e.g., SAVE10, WELCOME20"
                                        className="h-12 rounded-xl uppercase"
                                        required
                                        data-testid="coupon-code-input"
                                    />
                                </div>

                                <div>
                                    <Label className="form-label">Discount Type</Label>
                                    <Select 
                                        value={newCoupon.discount_type} 
                                        onValueChange={(v) => setNewCoupon({...newCoupon, discount_type: v})}
                                    >
                                        <SelectTrigger className="h-12 rounded-xl" data-testid="discount-type-select">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="percentage">Percentage (%)</SelectItem>
                                            <SelectItem value="fixed">Fixed Amount (₹)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div>
                                    <Label className="form-label">Discount Value</Label>
                                    <Input
                                        type="number"
                                        value={newCoupon.discount_value}
                                        onChange={(e) => setNewCoupon({...newCoupon, discount_value: e.target.value})}
                                        placeholder={newCoupon.discount_type === "percentage" ? "10" : "100"}
                                        className="h-12 rounded-xl"
                                        required
                                        min="0"
                                        max={newCoupon.discount_type === "percentage" ? "100" : undefined}
                                        data-testid="discount-value-input"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <Label className="form-label">Start Date</Label>
                                        <Input
                                            type="date"
                                            value={newCoupon.start_date}
                                            onChange={(e) => setNewCoupon({...newCoupon, start_date: e.target.value})}
                                            className="h-12 rounded-xl"
                                            required
                                            data-testid="start-date-input"
                                        />
                                    </div>
                                    <div>
                                        <Label className="form-label">End Date</Label>
                                        <Input
                                            type="date"
                                            value={newCoupon.end_date}
                                            onChange={(e) => setNewCoupon({...newCoupon, end_date: e.target.value})}
                                            className="h-12 rounded-xl"
                                            required
                                            data-testid="end-date-input"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <Label className="form-label">Usage Limit</Label>
                                        <Input
                                            type="number"
                                            value={newCoupon.usage_limit}
                                            onChange={(e) => setNewCoupon({...newCoupon, usage_limit: e.target.value})}
                                            placeholder="Unlimited"
                                            className="h-12 rounded-xl"
                                            min="1"
                                            data-testid="usage-limit-input"
                                        />
                                    </div>
                                    <div>
                                        <Label className="form-label">Per User Limit</Label>
                                        <Input
                                            type="number"
                                            value={newCoupon.per_user_limit}
                                            onChange={(e) => setNewCoupon({...newCoupon, per_user_limit: e.target.value})}
                                            placeholder="1"
                                            className="h-12 rounded-xl"
                                            min="1"
                                            data-testid="per-user-limit-input"
                                        />
                                    </div>
                                </div>

                                {newCoupon.discount_type === "percentage" && (
                                    <div>
                                        <Label className="form-label">Max Discount (₹)</Label>
                                        <Input
                                            type="number"
                                            value={newCoupon.max_discount}
                                            onChange={(e) => setNewCoupon({...newCoupon, max_discount: e.target.value})}
                                            placeholder="No limit"
                                            className="h-12 rounded-xl"
                                            min="0"
                                            data-testid="max-discount-input"
                                        />
                                    </div>
                                )}

                                <div>
                                    <Label className="form-label">Min Order Value (₹)</Label>
                                    <Input
                                        type="number"
                                        value={newCoupon.min_order_value}
                                        onChange={(e) => setNewCoupon({...newCoupon, min_order_value: e.target.value})}
                                        placeholder="0"
                                        className="h-12 rounded-xl"
                                        min="0"
                                        data-testid="min-order-input"
                                    />
                                </div>

                                {/* Specific Users */}
                                <div className="flex items-center justify-between py-2">
                                    <Label className="form-label mb-0">Select Specific Users</Label>
                                    <Checkbox
                                        checked={showSpecificUsers}
                                        onCheckedChange={setShowSpecificUsers}
                                        data-testid="specific-users-checkbox"
                                    />
                                </div>

                                {showSpecificUsers && (
                                    <div className="max-h-40 overflow-y-auto border rounded-xl p-3 space-y-2">
                                        {customers.length === 0 ? (
                                            <p className="text-sm text-[#52525B]">No customers found</p>
                                        ) : (
                                            customers.map(customer => (
                                                <label key={customer.id} className="flex items-center gap-2 cursor-pointer">
                                                    <Checkbox
                                                        checked={newCoupon.specific_users.includes(customer.id)}
                                                        onCheckedChange={() => toggleUser(customer.id)}
                                                    />
                                                    <span className="text-sm">{customer.name} ({customer.phone})</span>
                                                </label>
                                            ))
                                        )}
                                    </div>
                                )}

                                {/* Applicable Channels */}
                                <div className="space-y-3 border-t pt-4">
                                    <div className="flex items-center justify-between">
                                        <p className="text-sm font-semibold text-[#1A1A1A]">Applicable Channels</p>
                                        <button
                                            type="button"
                                            onClick={() => setNewCoupon({
                                                ...newCoupon, 
                                                applicable_channels: newCoupon.applicable_channels.length === 3 
                                                    ? [] 
                                                    : ["delivery", "takeaway", "dine_in"]
                                            })}
                                            className="text-xs text-[#F26B33]"
                                        >
                                            {newCoupon.applicable_channels.length === 3 ? "Deselect All" : "Select All"}
                                        </button>
                                    </div>
                                    <p className="text-xs text-[#52525B]">Channel Name</p>
                                    {[
                                        { id: "delivery", label: "Delivery" },
                                        { id: "takeaway", label: "Takeaway" },
                                        { id: "dine_in", label: "Dine In" }
                                    ].map(channel => (
                                        <label key={channel.id} className="flex items-center justify-between py-2">
                                            <span className="text-sm text-[#52525B]">{channel.label}</span>
                                            <Checkbox
                                                checked={newCoupon.applicable_channels.includes(channel.id)}
                                                onCheckedChange={() => toggleChannel(channel.id)}
                                                data-testid={`channel-${channel.id}`}
                                            />
                                        </label>
                                    ))}
                                </div>

                                {/* Description */}
                                <div>
                                    <Label className="form-label">Description (Optional)</Label>
                                    <Textarea
                                        value={newCoupon.description}
                                        onChange={(e) => setNewCoupon({...newCoupon, description: e.target.value})}
                                        placeholder="Internal note about this coupon..."
                                        className="rounded-xl resize-none"
                                        rows={2}
                                        data-testid="coupon-description"
                                    />
                                </div>
                            </div>
                        </ScrollArea>
                        <DialogFooter className="pt-4 border-t">
                            <Button 
                                type="submit" 
                                className="w-full h-12 bg-[#F26B33] hover:bg-[#D85A2A] rounded-full"
                                disabled={submitting}
                                data-testid="save-coupon-btn"
                            >
                                {submitting ? "Saving..." : (editingCoupon ? "Update Coupon" : "Create Coupon")}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </ResponsiveLayout>
    );
}
