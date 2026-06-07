import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Edit2, Eye, Trash2, Users } from "lucide-react";
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

const AudiencesPageContent = () => {
    const { api } = useAuth();
    const navigate = useNavigate();
    const [segments, setSegments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [totalCustomers, setTotalCustomers] = useState(0);
    const [campaigns, setCampaigns] = useState([]);
    const [filter, setFilter] = useState("all");

    // Create segment state
    const [showCreate, setShowCreate] = useState(false);
    const [newName, setNewName] = useState("");
    const [newFilters, setNewFilters] = useState({ tier: "all", last_visit_days: "all", total_spent: "all", total_visits: "all", has_birthday_this_month: false, vip_flag: "all", whatsapp_opt_in: "all" });
    const [previewCount, setPreviewCount] = useState(null);
    const [saving, setSaving] = useState(false);

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

    const getFilterTags = (filters) => {
        if (!filters) return [];
        const tags = [];
        if (filters.tier && filters.tier !== "all") tags.push(`Tier: ${Array.isArray(filters.tier) ? filters.tier.join(", ") : filters.tier}`);
        if (filters.last_visit_days && filters.last_visit_days !== "all") tags.push(`Last Visit: ${filters.last_visit_days}+ days`);
        if (filters.total_spent && filters.total_spent !== "all") tags.push(`Spent: ${filters.total_spent}`);
        if (filters.total_visits && filters.total_visits !== "all") tags.push(`Visits: ${filters.total_visits}`);
        if (filters.has_birthday_this_month) tags.push("Birthday: This Month");
        if (filters.vip_flag && filters.vip_flag !== "all") tags.push("VIP: Yes");
        if (filters.whatsapp_opt_in && filters.whatsapp_opt_in !== "all") tags.push("Opt-in: Yes");
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
            await api.post("/segments", { name: newName.trim(), filters: newFilters, customer_count: previewCount });
            toast.success("Audience created");
            setShowCreate(false);
            setNewName("");
            setNewFilters({ tier: "all", last_visit_days: "all", total_spent: "all", total_visits: "all", has_birthday_this_month: false, vip_flag: "all", whatsapp_opt_in: "all" });
            setPreviewCount(null);
            fetchData();
        } catch (err) {
            toast.error("Failed to create audience");
        } finally {
            setSaving(false);
        }
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

            {/* Create Dialog */}
            <Dialog open={showCreate} onOpenChange={setShowCreate}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Create New Audience</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label className="text-xs font-semibold uppercase">Audience Name</Label>
                            <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g., Gold Customers" className="mt-1" data-testid="new-audience-name" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label className="text-xs font-semibold uppercase">Tier</Label>
                                <Select value={newFilters.tier} onValueChange={v => setNewFilters(p => ({ ...p, tier: v }))}>
                                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
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
                                <Label className="text-xs font-semibold uppercase">Last Visit</Label>
                                <Select value={newFilters.last_visit_days} onValueChange={v => setNewFilters(p => ({ ...p, last_visit_days: v }))}>
                                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
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
                                <Label className="text-xs font-semibold uppercase">Total Spent</Label>
                                <Select value={newFilters.total_spent} onValueChange={v => setNewFilters(p => ({ ...p, total_spent: v }))}>
                                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Any amount</SelectItem>
                                        <SelectItem value="0-500">Under 500</SelectItem>
                                        <SelectItem value="500-2000">500 - 2,000</SelectItem>
                                        <SelectItem value="2000-5000">2,000 - 5,000</SelectItem>
                                        <SelectItem value="5000-10000">5,000 - 10,000</SelectItem>
                                        <SelectItem value="10000+">10,000+</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label className="text-xs font-semibold uppercase">Visits</Label>
                                <Select value={newFilters.total_visits} onValueChange={v => setNewFilters(p => ({ ...p, total_visits: v }))}>
                                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Any</SelectItem>
                                        <SelectItem value="0">0 visits</SelectItem>
                                        <SelectItem value="1-5">1-5</SelectItem>
                                        <SelectItem value="6-10">6-10</SelectItem>
                                        <SelectItem value="10+">10+</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Checkbox checked={newFilters.has_birthday_this_month} onCheckedChange={v => setNewFilters(p => ({ ...p, has_birthday_this_month: v }))} />
                            <Label className="text-sm">Birthday this month</Label>
                        </div>
                        <div className="flex items-center gap-3">
                            <Button variant="outline" onClick={handlePreviewCount} className="rounded-full" data-testid="preview-count-btn">Preview Count</Button>
                            {previewCount !== null && <span className="text-sm font-semibold text-[#F26B33]">{previewCount.toLocaleString()} customers match</span>}
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                            <Button onClick={handleCreate} disabled={saving} className="bg-[#F26B33] hover:bg-[#D85A2A] text-white" data-testid="save-audience-btn">
                                {saving ? "Creating..." : "Create Audience"}
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
