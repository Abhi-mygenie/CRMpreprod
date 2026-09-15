import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Edit2, Users, RefreshCw, ChevronDown, ChevronUp, X as XIcon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ResponsiveLayout } from "@/components/ResponsiveLayout";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import TagChip from "@/components/TagChip";

const AudiencesPageContent = () => {
    const { api } = useAuth();
    const navigate = useNavigate();
    const [segments, setSegments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [totalCustomers, setTotalCustomers] = useState(0);
    const [campaigns, setCampaigns] = useState([]);
    const [filter, setFilter] = useState("all");

    // Create / Edit segment state (CR-024 Phase 4 P4.1)
    const [showCreate, setShowCreate] = useState(false);
    const [editingSeg, setEditingSeg] = useState(null);
    // CR-033: expanded filter set across 4 sections (Tags section added in CR-034)
    const DEFAULT_FILTERS = {
        // Section 1: Loyalty & Tier
        tier: "all", total_visits: "all", total_spent: "all",
        total_points_earned: "all", wallet_balance: "all", total_coupon_used: "all",
        // Section 2: Dates & Occasions
        last_visit_days: "all", has_birthday_this_month: false,
        has_anniversary_this_month: false, birthday_month: "all",
        age_bracket: "all", created_at_days: "all",
        // Section 3: WhatsApp & Engagement
        whatsapp_opt_in: "all", received_campaign_id: "all",
        whatsapp_status_failed: false, never_messaged: false,
        // Section 4: Customer Flags & Profile
        vip_flag: "all", is_blocked: "all", blacklist_flag: "all",
        complaint_flag: "all", lead_source: "all", has_gst: "all", gender: "all",
        // Section 5: Tags (CR-034)
        tags: [], tags_mode: "any",
        // Section 0: Lifecycle Stage (CR-076)
        lifecycle_stage: "all",
    };
    const [newName, setNewName] = useState("");
    const [newFilters, setNewFilters] = useState(DEFAULT_FILTERS);
    const [previewCount, setPreviewCount] = useState(null);
    const [saving, setSaving] = useState(false);

    // CR-033: accordion section open/close state
    const [openSections, setOpenSections] = useState({ lifecycle: false, loyalty: true, dates: true, engagement: false, flags: false, tags: false }); // CR-076
    // CR-034: tag catalog for the filter section
    const [availableTags, setAvailableTags] = useState([]);

    // Preview customers
    const [previewSeg, setPreviewSeg] = useState(null);
    const [previewCustomers, setPreviewCustomers] = useState([]);
    const [previewLoading, setPreviewLoading] = useState(false);

    // Delete
    const [deleteId, setDeleteId] = useState(null);

    const fetchData = async () => {
        try {
            const [segsRes, statsRes, campsRes] = await Promise.all([
                api.get("/segments"),
                api.get("/customers/segments/stats"),
                api.get("/campaigns"),
            ]);
            setSegments(segsRes.data || []);
            setTotalCustomers(statsRes.data?.total || 0);
            setCampaigns(campsRes.data || []);
        } catch (err) {
            toast.error("Failed to load audiences");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    // CR-034: fetch tag catalog when audience dialog opens
    useEffect(() => {
        if (showCreate) {
            api.get("/customers/tags").then(r => setAvailableTags(r.data?.tags || [])).catch(() => {});
        }
    }, [showCreate]);

    const getCampaignCount = (segId) => {
        if (segId === "all-customers") return campaigns.filter(c => c.audience_id === "all-customers").length;
        return campaigns.filter(c => c.audience_id === segId).length;
    };

    const allAudiences = [
        { id: "all-customers", name: "All Customers", customer_count: totalCustomers, filters: {}, isDefault: true },
        ...segments,
    ];

    const usedIds = new Set(campaigns.map(c => c.audience_id));
    const filtered = filter === "all" ? allAudiences
        : filter === "used" ? allAudiences.filter(a => usedIds.has(a.id))
        : allAudiences.filter(a => !usedIds.has(a.id));

    // CR-033: maps chip label back to its filter key for dismissal
    const chipLabelToFilterKey = (label) => {
        if (label.startsWith("Tier:")) return "tier";
        if (label.startsWith("Inactive:")) return "last_visit_days";
        if (label.startsWith("Spent:")) return "total_spent";
        if (label.startsWith("Visits:")) return "total_visits";
        if (label === "Birthday: This Month") return "has_birthday_this_month";
        if (label === "Anniversary: This Month") return "has_anniversary_this_month";
        if (label.startsWith("Birthday Month:")) return "birthday_month";
        if (label.startsWith("Age:")) return "age_bracket";
        if (label.startsWith("Signed up:")) return "created_at_days";
        if (label === "VIP: Yes") return "vip_flag";
        if (label === "WA: Opted-In") return "whatsapp_opt_in";
        if (label === "Blocked") return "is_blocked";
        if (label === "Blacklisted") return "blacklist_flag";
        if (label === "Has Complaint") return "complaint_flag";
        if (label.startsWith("Gender:")) return "gender";
        if (label.startsWith("Source:")) return "lead_source";
        if (label === "Has GST") return "has_gst";
        if (label === "WA Failed") return "whatsapp_status_failed";
        if (label === "Never WA'd") return "never_messaged";
        if (label.startsWith("Wallet:")) return "wallet_balance";
        if (label.startsWith("Coupons:")) return "total_coupon_used";
        if (label.startsWith("Points:")) return "total_points_earned";
        if (label.startsWith("Campaign:")) return "received_campaign_id";
        if (label.startsWith("Tags:")) return "tags";
        if (label.startsWith("Stage:")) return "lifecycle_stage";   // CR-076
        return null;
    };

    const getFilterTags = (filters) => {
        if (!filters) return [];
        const tags = [];
        if (filters.tier && filters.tier !== "all") tags.push(`Tier: ${Array.isArray(filters.tier) ? filters.tier.join(", ") : filters.tier}`);
        if (filters.last_visit_days && filters.last_visit_days !== "all") tags.push(`Inactive: ${filters.last_visit_days}+ days`);
        if (filters.total_spent && filters.total_spent !== "all") tags.push(`Spent: ₹${filters.total_spent}`);
        if (filters.total_visits && filters.total_visits !== "all") tags.push(`Visits: ${filters.total_visits}`);
        if (filters.total_points_earned && filters.total_points_earned !== "all") tags.push(`Points: ${filters.total_points_earned}`);
        if (filters.wallet_balance && filters.wallet_balance !== "all") tags.push(`Wallet: ${filters.wallet_balance}`);
        if (filters.total_coupon_used && filters.total_coupon_used !== "all") tags.push(`Coupons: ${filters.total_coupon_used}`);
        if (filters.has_birthday_this_month) tags.push("Birthday: This Month");
        if (filters.has_anniversary_this_month) tags.push("Anniversary: This Month");
        if (filters.birthday_month && filters.birthday_month !== "all") tags.push(`Birthday Month: ${filters.birthday_month}`);
        if (filters.age_bracket && filters.age_bracket !== "all") tags.push(`Age: ${filters.age_bracket}`);
        if (filters.created_at_days && filters.created_at_days !== "all") tags.push(`Signed up: last ${filters.created_at_days}d`);
        if (filters.vip_flag && filters.vip_flag !== "all") tags.push("VIP: Yes");
        if (filters.whatsapp_opt_in && filters.whatsapp_opt_in !== "all") tags.push("WA: Opted-In");
        if (filters.is_blocked && filters.is_blocked !== "all") tags.push("Blocked");
        if (filters.blacklist_flag && filters.blacklist_flag !== "all") tags.push("Blacklisted");
        if (filters.complaint_flag && filters.complaint_flag !== "all") tags.push("Has Complaint");
        if (filters.gender && filters.gender !== "all") tags.push(`Gender: ${filters.gender}`);
        if (filters.lead_source && filters.lead_source !== "all") tags.push(`Source: ${filters.lead_source}`);
        if (filters.has_gst && filters.has_gst !== "all") tags.push("Has GST");
        if (filters.whatsapp_status_failed) tags.push("WA Failed");
        if (filters.never_messaged) tags.push("Never WA'd");
        if (filters.received_campaign_id && filters.received_campaign_id !== "all") tags.push(`Campaign: ${filters.received_campaign_id}`);
        if (filters.tags && filters.tags.length > 0) tags.push(`Tags: ${filters.tags.join(", ")}`);
        if (filters.lifecycle_stage && filters.lifecycle_stage !== "all") tags.push(`Stage: ${filters.lifecycle_stage}`);  // CR-076
        return tags;
    };

    const handlePreviewCount = async () => {
        try {
            const res = await api.post("/segments/preview-count", { filters: newFilters });
            setPreviewCount(res.data.count);
        } catch (err) {
            toast.error("Failed to preview count");
        }
    };

    const handleCreate = async () => {
        if (!newName.trim()) { toast.error("Name is required"); return; }
        setSaving(true);
        try {
            if (editingSeg) {
                // CR-024 Phase 4 P4.1: Edit mode — PUT existing segment
                await api.put(`/segments/${editingSeg.id}`, { name: newName.trim(), filters: newFilters });
                toast.success("Audience updated");
            } else {
                await api.post("/segments", { name: newName.trim(), filters: newFilters, customer_count: previewCount });
                toast.success("Audience created");
            }
            closeCreateDialog();
            fetchData();
        } catch (err) {
            toast.error(err.response?.data?.detail || (editingSeg ? "Failed to update" : "Failed to create"));
        } finally {
            setSaving(false);
        }
    };

    const handleEdit = (seg) => {
        setEditingSeg(seg);
        setNewName(seg.name || "");
        setNewFilters({ ...DEFAULT_FILTERS, ...(seg.filters || {}) });
        setPreviewCount(seg.customer_count || null);
        setShowCreate(true);
    };

    const closeCreateDialog = () => {
        setShowCreate(false);
        setEditingSeg(null);
        setNewName("");
        setNewFilters(DEFAULT_FILTERS);
        setPreviewCount(null);
    };

    const handlePreview = async (seg) => {
        setPreviewSeg(seg);
        setPreviewLoading(true);
        try {
            if (seg.id === "all-customers") {
                const res = await api.get("/customers?limit=50");
                setPreviewCustomers(res.data.customers || res.data || []);
            } else {
                const res = await api.get(`/segments/${seg.id}/customers`);
                setPreviewCustomers(res.data.customers || res.data || []);
            }
        } catch (err) {
            setPreviewCustomers([]);
        } finally {
            setPreviewLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteId) return;
        try {
            await api.delete(`/segments/${deleteId}`);
            toast.success("Audience deleted");
            setDeleteId(null);
            fetchData();
        } catch (err) {
            toast.error("Failed to delete audience");
        }
    };

    // CR-024 Phase 4 P4.2: Refresh customer count for a single segment.
    const [refreshing, setRefreshing] = useState({});
    const handleRefreshCount = async (segId) => {
        if (segId === "all-customers") return;
        setRefreshing(p => ({ ...p, [segId]: true }));
        try {
            const res = await api.post(`/segments/${segId}/refresh-count`);
            setSegments(segs => segs.map(s => s.id === segId
                ? { ...s, customer_count: res.data.customer_count, last_counted_at: res.data.last_counted_at }
                : s));
            toast.success("Count refreshed");
        } catch (err) {
            toast.error("Refresh failed");
        } finally {
            setRefreshing(p => ({ ...p, [segId]: false }));
        }
    };

    const formatRelativeTime = (iso) => {
        if (!iso) return "Never counted";
        const diffMs = Date.now() - new Date(iso).getTime();
        const m = Math.floor(diffMs / 60000);
        if (m < 1) return "Just now";
        if (m < 60) return `${m}m ago`;
        const h = Math.floor(m / 60);
        if (h < 24) return `${h}h ago`;
        return `${Math.floor(h / 24)}d ago`;
    };

    const usedCount = allAudiences.filter(a => usedIds.has(a.id)).length;
    const unusedCount = allAudiences.filter(a => !usedIds.has(a.id)).length;

    return (
        <div className="p-4 lg:p-6 max-w-[1200px] mx-auto" data-testid="audiences-page">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-[#2B2B2B]" data-testid="audiences-title">Audiences</h1>
                    <p className="text-sm text-gray-500 mt-1">Create and manage customer segments for targeted campaigns</p>
                </div>
                <Button onClick={() => setShowCreate(true)} className="bg-[#F26B33] hover:bg-[#D85A2A] text-white rounded-full" data-testid="create-audience-btn">
                    <Plus className="w-4 h-4 mr-2" /> Create Audience
                </Button>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-5">
                {[
                    { key: "all", label: `All (${allAudiences.length})` },
                    { key: "used", label: `Used in Campaigns (${usedCount})` },
                    { key: "unused", label: `Unused (${unusedCount})` },
                ].map(t => (
                    <button
                        key={t.key}
                        onClick={() => setFilter(t.key)}
                        className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                            filter === t.key ? "bg-[#1a1a1a] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                        }`}
                        data-testid={`audience-filter-${t.key}`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Audience Grid (3 columns, matching mock) */}
            {loading ? (
                <div className="text-center py-12 text-gray-500">Loading audiences...</div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {filtered.map(seg => {
                        const tags = getFilterTags(seg.filters);
                        const campCount = getCampaignCount(seg.id);
                        return (
                            <div
                                key={seg.id}
                                className={`p-4 bg-white rounded-xl border hover:border-[#F26B33] transition-colors ${seg.isDefault ? "border-l-[3px] border-l-[#F26B33] border-t border-r border-b border-gray-200" : "border-gray-200"}`}
                                data-testid={`audience-card-${seg.id}`}
                            >
                                <div className="flex items-center gap-2 font-semibold text-sm">
                                    {seg.name}
                                    {seg.isDefault && <Badge className="bg-amber-100 text-amber-700 text-[10px]">Default</Badge>}
                                </div>
                                <div className="text-2xl font-extrabold text-[#F26B33] my-2">
                                    {(seg.customer_count || 0).toLocaleString()}
                                </div>
                                {/* CR-024 Phase 4 P4.2: last_counted_at + refresh */}
                                {!seg.isDefault && (
                                    <div className="text-[10px] text-gray-400 flex items-center gap-1 mb-1" data-testid={`audience-last-counted-${seg.id}`}>
                                        Counted {formatRelativeTime(seg.last_counted_at)}
                                        <button
                                            onClick={() => handleRefreshCount(seg.id)}
                                            disabled={refreshing[seg.id]}
                                            className="ml-1 hover:text-[#F26B33] transition-colors disabled:opacity-50"
                                            title="Refresh count"
                                            data-testid={`audience-refresh-${seg.id}`}
                                        >
                                            <RefreshCw className={`w-3 h-3 ${refreshing[seg.id] ? "animate-spin" : ""}`} />
                                        </button>
                                    </div>
                                )}
                                {seg.isDefault ? (
                                    <div className="text-xs text-gray-500">Every customer in your database</div>
                                ) : tags.length > 0 ? (
                                    <div className="flex flex-wrap gap-1 my-2">
                                        {tags.map((tag, i) => (
                                            <span key={i} className="px-2 py-0.5 bg-gray-100 rounded text-[11px] text-gray-600">{tag}</span>
                                        ))}
                                    </div>
                                ) : null}
                                <div className="text-[11px] text-gray-500 mt-2">
                                    {campCount > 0 ? `Used in ${campCount} campaign${campCount > 1 ? "s" : ""}` : "Not used yet"}
                                </div>
                                {!seg.isDefault && (
                                    <div className="flex gap-1.5 mt-3">
                                        <button onClick={() => handleEdit(seg)} className="px-3 py-1.5 text-xs font-medium bg-white border border-gray-200 rounded-full hover:border-[#F26B33] hover:text-[#F26B33] transition-colors" data-testid="audience-edit-btn">
                                            <Edit2 className="w-3 h-3 inline mr-1" /> Edit
                                        </button>
                                        <button onClick={() => handlePreview(seg)} className="px-3 py-1.5 text-xs font-medium bg-white border border-gray-200 rounded-full hover:border-[#F26B33] hover:text-[#F26B33] transition-colors" data-testid="audience-preview-btn">
                                            Preview
                                        </button>
                                        <button onClick={() => setDeleteId(seg.id)} className="px-3 py-1.5 text-xs font-medium bg-white border border-red-200 text-red-600 rounded-full hover:bg-red-50 transition-colors" data-testid="audience-delete-btn">
                                            Delete
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {/* Create New Card (dashed border, matching mock) */}
                    <div
                        onClick={() => setShowCreate(true)}
                        className="p-4 bg-white rounded-xl border-2 border-dashed border-gray-200 hover:border-[#F26B33] flex items-center justify-center min-h-[180px] cursor-pointer transition-colors"
                        data-testid="create-new-audience-card"
                    >
                        <div className="text-center text-gray-500">
                            <div className="text-2xl mb-2">+</div>
                            <div className="text-sm font-semibold">Create New Audience</div>
                            <div className="text-[11px]">Define filters to target customers</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Create / Edit Dialog — CR-033: wider dialog with accordion sections */}
            <Dialog open={showCreate} onOpenChange={(o) => { if (!o) closeCreateDialog(); else setShowCreate(true); }}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="audience-dialog">
                    <DialogHeader>
                        <DialogTitle>{editingSeg ? `Edit Audience: ${editingSeg.name}` : "Create New Audience"}</DialogTitle>
                        <p className="text-xs text-gray-400 mt-0.5">Filters combine with AND · Multi-select within a filter = OR</p>
                    </DialogHeader>

                    {editingSeg && getCampaignCount(editingSeg.id) > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800" data-testid="audience-in-use-warning">
                            ⚠ This audience is used in {getCampaignCount(editingSeg.id)} campaign(s). Scheduled campaigns will use updated filters on next run.
                        </div>
                    )}

                    <div className="space-y-3">
                        {/* Audience Name */}
                        <div>
                            <Label className="text-xs font-semibold uppercase">Audience Name</Label>
                            <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g., Gold Regulars — Birthday This Month" className="mt-1" data-testid="new-audience-name" />
                        </div>

                        {/* Active filter chips — dismissible */}
                        {getFilterTags(newFilters).length > 0 && (
                            <div className="flex flex-wrap gap-1.5 p-2 bg-gray-50 rounded-lg border border-gray-100">
                                {getFilterTags(newFilters).map((t, i) => (
                                    <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-gray-200 rounded-full text-[11px] text-gray-600">
                                        {t}
                                        <button
                                            onClick={() => {
                                                const key = chipLabelToFilterKey(t);
                                                if (key) setNewFilters(p => ({ ...p, [key]: Array.isArray(DEFAULT_FILTERS[key]) ? [] : (typeof DEFAULT_FILTERS[key] === "boolean" ? false : "all") }));
                                            }}
                                            className="ml-0.5 text-gray-400 hover:text-gray-700 leading-none"
                                        >×</button>
                                    </span>
                                ))}
                                <button onClick={() => setNewFilters(DEFAULT_FILTERS)} className="text-[10px] text-gray-400 hover:text-red-500 px-1 ml-1">Clear all</button>
                            </div>
                        )}

                        {/* ── Section 0: Lifecycle Stage (CR-076) ── */}
                        <Collapsible open={openSections.lifecycle} onOpenChange={v => setOpenSections(p => ({...p, lifecycle: v}))}>
                            <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2.5 bg-teal-50 border border-teal-100 rounded-lg text-xs font-bold uppercase tracking-wide text-teal-700 hover:bg-teal-100 transition-colors" data-testid="lifecycle-stage-section">
                                <span>Lifecycle Stage</span>
                                <div className="flex items-center gap-2">
                                    {newFilters.lifecycle_stage && newFilters.lifecycle_stage !== "all" && (
                                        <span className="bg-teal-600 text-white rounded-full text-[10px] px-1.5 py-0.5 font-bold">1</span>
                                    )}
                                    {openSections.lifecycle ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                </div>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                                <div className="border border-t-0 border-teal-100 rounded-b-lg p-3 bg-white">
                                    <Label className="text-xs font-semibold uppercase text-gray-500">Stage</Label>
                                    <Select value={newFilters.lifecycle_stage} onValueChange={v => setNewFilters(p => ({...p, lifecycle_stage: v}))}>
                                        <SelectTrigger className="mt-1" data-testid="lifecycle-stage-select">
                                            <SelectValue placeholder="All stages" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Stages</SelectItem>
                                            <SelectItem value="new">New (first-time, active &le;30d)</SelectItem>
                                            <SelectItem value="active">Active (returning, active &le;30d)</SelectItem>
                                            <SelectItem value="at_risk">At Risk (31–60 days inactive)</SelectItem>
                                            <SelectItem value="dormant">Dormant (61–90 days inactive)</SelectItem>
                                            <SelectItem value="churned">Churned (90+ days inactive)</SelectItem>
                                            <SelectItem value="lapsing">Lapsing (At Risk + Dormant)</SelectItem>
                                            <SelectItem value="winback">Win-Back Pack (Dormant + Churned)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </CollapsibleContent>
                        </Collapsible>

                        {/* ── Section 1: Loyalty & Tier ── */}
                        <Collapsible open={openSections.loyalty} onOpenChange={v => setOpenSections(p => ({...p, loyalty: v}))}>
                            <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2.5 bg-orange-50 border border-orange-100 rounded-lg text-xs font-bold uppercase tracking-wide text-orange-600 hover:bg-orange-100 transition-colors">
                                <span>Loyalty & Tier</span>
                                <div className="flex items-center gap-2">
                                    {[newFilters.tier, newFilters.total_visits, newFilters.total_spent, newFilters.total_points_earned, newFilters.wallet_balance, newFilters.total_coupon_used].filter(v => v && v !== "all").length > 0 && (
                                        <span className="bg-[#F26B33] text-white rounded-full text-[10px] px-1.5 py-0.5 font-bold">
                                            {[newFilters.tier, newFilters.total_visits, newFilters.total_spent, newFilters.total_points_earned, newFilters.wallet_balance, newFilters.total_coupon_used].filter(v => v && v !== "all").length}
                                        </span>
                                    )}
                                    {openSections.loyalty ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                </div>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                                <div className="border border-t-0 border-orange-100 rounded-b-lg p-3 grid grid-cols-2 gap-3 bg-white">
                                    <div>
                                        <Label className="text-xs font-semibold uppercase text-gray-500">Tier</Label>
                                        <Select value={newFilters.tier} onValueChange={v => setNewFilters(p => ({...p, tier: v}))}>
                                            <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">All Tiers</SelectItem>
                                                <SelectItem value="Bronze">Bronze</SelectItem>
                                                <SelectItem value="Silver">Silver</SelectItem>
                                                <SelectItem value="Gold">Gold</SelectItem>
                                                <SelectItem value="Platinum">Platinum</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label className="text-xs font-semibold uppercase text-gray-500">Total Visits</Label>
                                        <Select value={newFilters.total_visits} onValueChange={v => setNewFilters(p => ({...p, total_visits: v}))}>
                                            <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">Any</SelectItem>
                                                <SelectItem value="0">0 visits</SelectItem>
                                                <SelectItem value="1-5">1–5</SelectItem>
                                                <SelectItem value="6-10">6–10</SelectItem>
                                                <SelectItem value="10+">10+</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label className="text-xs font-semibold uppercase text-gray-500">Total Spent</Label>
                                        <Select value={newFilters.total_spent} onValueChange={v => setNewFilters(p => ({...p, total_spent: v}))}>
                                            <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">Any amount</SelectItem>
                                                <SelectItem value="0-500">Under ₹500</SelectItem>
                                                <SelectItem value="500-2000">₹500 – 2,000</SelectItem>
                                                <SelectItem value="2000-5000">₹2,000 – 5,000</SelectItem>
                                                <SelectItem value="5000-10000">₹5,000 – 10,000</SelectItem>
                                                <SelectItem value="10000+">₹10,000+</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label className="text-xs font-semibold uppercase text-gray-500">Points Earned</Label>
                                        <Select value={newFilters.total_points_earned} onValueChange={v => setNewFilters(p => ({...p, total_points_earned: v}))}>
                                            <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">Any</SelectItem>
                                                <SelectItem value="low">Low (0–100)</SelectItem>
                                                <SelectItem value="mid">Mid (101–500)</SelectItem>
                                                <SelectItem value="high">High (501–2000)</SelectItem>
                                                <SelectItem value="very_high">Very High (2000+)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label className="text-xs font-semibold uppercase text-gray-500">Wallet Balance</Label>
                                        <Select value={newFilters.wallet_balance} onValueChange={v => setNewFilters(p => ({...p, wallet_balance: v}))}>
                                            <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">Any</SelectItem>
                                                <SelectItem value="zero">Zero (₹0)</SelectItem>
                                                <SelectItem value="low">Low (₹1–500)</SelectItem>
                                                <SelectItem value="mid">Mid (₹501–2,000)</SelectItem>
                                                <SelectItem value="high">High (₹2,000+)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label className="text-xs font-semibold uppercase text-gray-500">Coupons Used</Label>
                                        <Select value={newFilters.total_coupon_used} onValueChange={v => setNewFilters(p => ({...p, total_coupon_used: v}))}>
                                            <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">Any</SelectItem>
                                                <SelectItem value="0">None</SelectItem>
                                                <SelectItem value="1-5">1–5</SelectItem>
                                                <SelectItem value="6+">6+</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </CollapsibleContent>
                        </Collapsible>

                        {/* ── Section 2: Dates & Occasions ── */}
                        <Collapsible open={openSections.dates} onOpenChange={v => setOpenSections(p => ({...p, dates: v}))}>
                            <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2.5 bg-blue-50 border border-blue-100 rounded-lg text-xs font-bold uppercase tracking-wide text-blue-600 hover:bg-blue-100 transition-colors">
                                <span>Dates & Occasions</span>
                                <div className="flex items-center gap-2">
                                    {(() => {
                                        const count = [newFilters.last_visit_days, newFilters.birthday_month, newFilters.age_bracket, newFilters.created_at_days].filter(v => v && v !== "all").length
                                            + [newFilters.has_birthday_this_month, newFilters.has_anniversary_this_month].filter(Boolean).length;
                                        return count > 0 ? <span className="bg-blue-600 text-white rounded-full text-[10px] px-1.5 py-0.5 font-bold">{count}</span> : null;
                                    })()}
                                    {openSections.dates ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                </div>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                                <div className="border border-t-0 border-blue-100 rounded-b-lg p-3 grid grid-cols-2 gap-3 bg-white">
                                    <div>
                                        <Label className="text-xs font-semibold uppercase text-gray-500">Last Visit</Label>
                                        <Select value={newFilters.last_visit_days} onValueChange={v => setNewFilters(p => ({...p, last_visit_days: v}))}>
                                            <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">Any time</SelectItem>
                                                <SelectItem value="7">7+ days ago</SelectItem>
                                                <SelectItem value="14">14+ days ago</SelectItem>
                                                <SelectItem value="30">30+ days ago</SelectItem>
                                                <SelectItem value="60">60+ days ago</SelectItem>
                                                <SelectItem value="90">90+ days ago</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label className="text-xs font-semibold uppercase text-gray-500">Signed Up</Label>
                                        <Select value={newFilters.created_at_days} onValueChange={v => setNewFilters(p => ({...p, created_at_days: v}))}>
                                            <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">Any time</SelectItem>
                                                <SelectItem value="7">Last 7 days</SelectItem>
                                                <SelectItem value="30">Last 30 days</SelectItem>
                                                <SelectItem value="90">Last 90 days</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label className="text-xs font-semibold uppercase text-gray-500">Birthday Month</Label>
                                        <Select value={newFilters.birthday_month} onValueChange={v => setNewFilters(p => ({...p, birthday_month: v}))}>
                                            <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">Any month</SelectItem>
                                                {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m, i) => (
                                                    <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label className="text-xs font-semibold uppercase text-gray-500">Age Bracket</Label>
                                        <Select value={newFilters.age_bracket} onValueChange={v => setNewFilters(p => ({...p, age_bracket: v}))}>
                                            <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">Any age</SelectItem>
                                                <SelectItem value="18-25">18–25</SelectItem>
                                                <SelectItem value="26-35">26–35</SelectItem>
                                                <SelectItem value="36-50">36–50</SelectItem>
                                                <SelectItem value="50+">50+</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="flex items-center gap-2 col-span-1">
                                        <Checkbox id="bday-month" checked={newFilters.has_birthday_this_month} onCheckedChange={v => setNewFilters(p => ({...p, has_birthday_this_month: v}))} />
                                        <Label htmlFor="bday-month" className="text-xs cursor-pointer">Birthday this month</Label>
                                    </div>
                                    <div className="flex items-center gap-2 col-span-1">
                                        <Checkbox id="anniv-month" checked={newFilters.has_anniversary_this_month} onCheckedChange={v => setNewFilters(p => ({...p, has_anniversary_this_month: v}))} />
                                        <Label htmlFor="anniv-month" className="text-xs cursor-pointer">Anniversary this month</Label>
                                    </div>
                                </div>
                            </CollapsibleContent>
                        </Collapsible>

                        {/* ── Section 3: WhatsApp & Engagement ── */}
                        <Collapsible open={openSections.engagement} onOpenChange={v => setOpenSections(p => ({...p, engagement: v}))}>
                            <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2.5 bg-green-50 border border-green-100 rounded-lg text-xs font-bold uppercase tracking-wide text-green-700 hover:bg-green-100 transition-colors">
                                <span>WhatsApp & Engagement</span>
                                <div className="flex items-center gap-2">
                                    {(() => {
                                        const count = [newFilters.whatsapp_opt_in, newFilters.received_campaign_id].filter(v => v && v !== "all").length
                                            + [newFilters.whatsapp_status_failed, newFilters.never_messaged].filter(Boolean).length;
                                        return count > 0 ? <span className="bg-green-600 text-white rounded-full text-[10px] px-1.5 py-0.5 font-bold">{count}</span> : null;
                                    })()}
                                    {openSections.engagement ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                </div>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                                <div className="border border-t-0 border-green-100 rounded-b-lg p-3 grid grid-cols-2 gap-3 bg-white">
                                    <div>
                                        <Label className="text-xs font-semibold uppercase text-gray-500">WhatsApp Opted-In</Label>
                                        <Select value={newFilters.whatsapp_opt_in} onValueChange={v => setNewFilters(p => ({...p, whatsapp_opt_in: v}))}>
                                            <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">All</SelectItem>
                                                <SelectItem value="true">Opted In</SelectItem>
                                                <SelectItem value="false">Not Opted In</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label className="text-xs font-semibold uppercase text-gray-500">Received Campaign</Label>
                                        <Select value={newFilters.received_campaign_id} onValueChange={v => setNewFilters(p => ({...p, received_campaign_id: v}))}>
                                            <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">Any / All</SelectItem>
                                                {campaigns.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Checkbox id="wa-failed" checked={newFilters.whatsapp_status_failed} onCheckedChange={v => setNewFilters(p => ({...p, whatsapp_status_failed: v}))} />
                                        <Label htmlFor="wa-failed" className="text-xs cursor-pointer">WA message failed recently</Label>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Checkbox id="never-wa" checked={newFilters.never_messaged} onCheckedChange={v => setNewFilters(p => ({...p, never_messaged: v}))} />
                                        <Label htmlFor="never-wa" className="text-xs cursor-pointer">Never messaged on WhatsApp</Label>
                                    </div>
                                </div>
                            </CollapsibleContent>
                        </Collapsible>

                        {/* ── Section 4: Customer Flags & Profile ── */}
                        <Collapsible open={openSections.flags} onOpenChange={v => setOpenSections(p => ({...p, flags: v}))}>
                            <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2.5 bg-purple-50 border border-purple-100 rounded-lg text-xs font-bold uppercase tracking-wide text-purple-700 hover:bg-purple-100 transition-colors">
                                <span>Customer Flags & Profile</span>
                                <div className="flex items-center gap-2">
                                    {[newFilters.vip_flag, newFilters.is_blocked, newFilters.blacklist_flag, newFilters.complaint_flag, newFilters.lead_source, newFilters.has_gst, newFilters.gender].filter(v => v && v !== "all").length > 0 && (
                                        <span className="bg-purple-600 text-white rounded-full text-[10px] px-1.5 py-0.5 font-bold">
                                            {[newFilters.vip_flag, newFilters.is_blocked, newFilters.blacklist_flag, newFilters.complaint_flag, newFilters.lead_source, newFilters.has_gst, newFilters.gender].filter(v => v && v !== "all").length}
                                        </span>
                                    )}
                                    {openSections.flags ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                </div>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                                <div className="border border-t-0 border-purple-100 rounded-b-lg p-3 grid grid-cols-2 gap-3 bg-white">
                                    <div>
                                        <Label className="text-xs font-semibold uppercase text-gray-500">VIP Status</Label>
                                        <Select value={newFilters.vip_flag} onValueChange={v => setNewFilters(p => ({...p, vip_flag: v}))}>
                                            <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">All</SelectItem>
                                                <SelectItem value="true">VIP Only</SelectItem>
                                                <SelectItem value="false">Non-VIP</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label className="text-xs font-semibold uppercase text-gray-500">Gender</Label>
                                        <Select value={newFilters.gender} onValueChange={v => setNewFilters(p => ({...p, gender: v}))}>
                                            <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">All</SelectItem>
                                                <SelectItem value="male">Male</SelectItem>
                                                <SelectItem value="female">Female</SelectItem>
                                                <SelectItem value="other">Other</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label className="text-xs font-semibold uppercase text-gray-500">Lead Source</Label>
                                        <Select value={newFilters.lead_source} onValueChange={v => setNewFilters(p => ({...p, lead_source: v}))}>
                                            <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">All Sources</SelectItem>
                                                {["Walk-in","Swiggy","Zomato","Instagram","Facebook","Google","Referral","Airbnb","WhatsApp","Phone Call"].map(s => (
                                                    <SelectItem key={s} value={s}>{s}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label className="text-xs font-semibold uppercase text-gray-500">Has GST</Label>
                                        <Select value={newFilters.has_gst} onValueChange={v => setNewFilters(p => ({...p, has_gst: v}))}>
                                            <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">All</SelectItem>
                                                <SelectItem value="true">Has GST No.</SelectItem>
                                                <SelectItem value="false">No GST No.</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Checkbox id="chk-blocked" checked={newFilters.is_blocked === "true" || newFilters.is_blocked === true} onCheckedChange={v => setNewFilters(p => ({...p, is_blocked: v ? "true" : "all"}))} />
                                        <Label htmlFor="chk-blocked" className="text-xs cursor-pointer">Blocked</Label>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Checkbox id="chk-blacklist" checked={newFilters.blacklist_flag === "true" || newFilters.blacklist_flag === true} onCheckedChange={v => setNewFilters(p => ({...p, blacklist_flag: v ? "true" : "all"}))} />
                                        <Label htmlFor="chk-blacklist" className="text-xs cursor-pointer">Blacklisted</Label>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Checkbox id="chk-complaint" checked={newFilters.complaint_flag === "true" || newFilters.complaint_flag === true} onCheckedChange={v => setNewFilters(p => ({...p, complaint_flag: v ? "true" : "all"}))} />
                                        <Label htmlFor="chk-complaint" className="text-xs cursor-pointer">Has Complaint</Label>
                                    </div>
                                </div>
                            </CollapsibleContent>
                        </Collapsible>

                        {/* ── Section 5: Tags (CR-034) ── */}
                        <Collapsible open={openSections.tags} onOpenChange={v => setOpenSections(p => ({...p, tags: v}))}>
                            <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2.5 bg-orange-50 border border-orange-200 rounded-lg text-xs font-bold uppercase tracking-wide text-[#F26B33] hover:bg-orange-100 transition-colors">
                                <span>Tags</span>
                                <div className="flex items-center gap-2">
                                    {newFilters.tags.length > 0 && (
                                        <span className="bg-[#F26B33] text-white rounded-full text-[10px] px-1.5 py-0.5 font-bold">{newFilters.tags.length}</span>
                                    )}
                                    {openSections.tags ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                </div>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                                <div className="border border-t-0 border-orange-200 rounded-b-lg p-3 space-y-2 bg-white">
                                    <Label className="text-xs text-gray-500">Include customers with these tags:</Label>
                                    {/* Selected tags */}
                                    {newFilters.tags.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5">
                                            {newFilters.tags.map(t => (
                                                <TagChip key={t} tag={t} onRemove={tag => setNewFilters(p => ({...p, tags: p.tags.filter(x => x !== tag)}))} />
                                            ))}
                                        </div>
                                    )}
                                    {/* Available tags to add */}
                                    {availableTags.filter(t => !newFilters.tags.includes(t)).length > 0 && (
                                        <div className="flex flex-wrap gap-1.5 pt-1">
                                            <span className="text-[10px] text-gray-400 self-center">Add:</span>
                                            {availableTags.filter(t => !newFilters.tags.includes(t)).map(t => (
                                                <TagChip key={t} tag={t} onClick={tag => setNewFilters(p => ({...p, tags: [...p.tags, tag]}))} className="opacity-60 hover:opacity-100" />
                                            ))}
                                        </div>
                                    )}
                                    {availableTags.length === 0 && (
                                        <p className="text-[11px] text-gray-400 italic">No tags created yet. Add tags to customers first.</p>
                                    )}
                                    {/* AND/OR toggle — only shown when 2+ tags selected */}
                                    {newFilters.tags.length > 1 && (
                                        <div className="flex items-center gap-2 pt-1">
                                            <span className="text-xs text-gray-500">Match:</span>
                                            <div className="flex border border-gray-200 rounded-md overflow-hidden text-[11px]">
                                                <button
                                                    onClick={() => setNewFilters(p => ({...p, tags_mode: "any"}))}
                                                    className={`px-3 py-1 font-semibold transition-colors ${newFilters.tags_mode === "any" ? "bg-[#F26B33] text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
                                                >ANY (OR)</button>
                                                <button
                                                    onClick={() => setNewFilters(p => ({...p, tags_mode: "all"}))}
                                                    className={`px-3 py-1 font-semibold transition-colors ${newFilters.tags_mode === "all" ? "bg-[#F26B33] text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
                                                >ALL (AND)</button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </CollapsibleContent>
                        </Collapsible>

                        {/* Preview count + actions */}
                        <div className="flex items-center justify-between bg-orange-50 border border-orange-100 rounded-lg px-3 py-2.5">
                            <div>
                                {previewCount !== null ? (
                                    <span className="text-[#F26B33] font-extrabold text-lg">{previewCount.toLocaleString()}</span>
                                ) : (
                                    <span className="text-gray-400 text-sm">—</span>
                                )}
                                <span className="text-xs text-gray-500 ml-2">customers match</span>
                            </div>
                            <Button variant="outline" onClick={handlePreviewCount} className="rounded-full h-8 text-xs" data-testid="preview-count-btn">Preview Count</Button>
                        </div>

                        <div className="flex justify-end gap-2 pt-1">
                            <Button variant="outline" onClick={closeCreateDialog} className="rounded-full">Cancel</Button>
                            <Button onClick={handleCreate} disabled={saving} className="bg-[#F26B33] hover:bg-[#D85A2A] text-white rounded-full" data-testid="save-audience-btn">
                                {saving ? (editingSeg ? "Updating..." : "Creating...") : (editingSeg ? "Update Audience" : "Create Audience")}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Preview Dialog */}
            <Dialog open={!!previewSeg} onOpenChange={() => setPreviewSeg(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>{previewSeg?.name} — Customers</DialogTitle>
                    </DialogHeader>
                    <ScrollArea className="max-h-[400px]">
                        {previewLoading ? (
                            <div className="text-center py-8 text-gray-500">Loading...</div>
                        ) : previewCustomers.length === 0 ? (
                            <div className="text-center py-8 text-gray-500">No customers found</div>
                        ) : (
                            <div className="space-y-2">
                                {previewCustomers.slice(0, 50).map((c, i) => (
                                    <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
                                        <Avatar className="h-8 w-8">
                                            <AvatarFallback className="text-xs bg-gray-100">{(c.name || "?")[0]}</AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium truncate">{c.name || "Unknown"}</div>
                                            <div className="text-xs text-gray-500">{c.phone || ""}</div>
                                        </div>
                                        <Badge className="text-[10px] bg-gray-100 text-gray-600">{c.tier || "Bronze"}</Badge>
                                    </div>
                                ))}
                            </div>
                        )}
                    </ScrollArea>
                </DialogContent>
            </Dialog>

            {/* Delete confirmation */}
            <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Audience</AlertDialogTitle>
                        <AlertDialogDescription>This will permanently delete this audience segment. Campaigns using it will keep their data.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

const AudiencesPage = () => (
    <ResponsiveLayout>
        <AudiencesPageContent />
    </ResponsiveLayout>
);

export default AudiencesPage;
