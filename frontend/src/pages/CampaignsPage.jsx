import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Send, Clock, CheckCircle2, AlertCircle, MoreVertical, Trash2, Eye, Megaphone, Pause, Edit2, BarChart3, Copy, MessageSquare } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ResponsiveLayout } from "@/components/ResponsiveLayout";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const STATUS_CONFIG = {
    draft: { label: "Draft", color: "bg-gray-100 text-gray-700" },
    active: { label: "Active", color: "bg-green-100 text-green-700" },
    completed: { label: "Completed", color: "bg-gray-100 text-gray-500" },
    failed: { label: "Failed", color: "bg-red-100 text-red-700" },
    paused: { label: "Paused", color: "bg-yellow-100 text-yellow-700" },
    scheduled: { label: "Scheduled", color: "bg-blue-100 text-blue-700" },
    missed: { label: "Missed", color: "bg-red-100 text-red-700" },
};

// CR-024 Phase 4: format UTC ISO → "8 Jun 10:00 IST" for scheduled rows
const formatNextRunIST = (iso) => {
    if (!iso) return "";
    try {
        const d = new Date(iso);
        const opts = {
            timeZone: "Asia/Kolkata",
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        };
        return `${d.toLocaleString("en-IN", opts)} IST`;
    } catch {
        return iso;
    }
};

const CampaignsPageContent = () => {
    const { api } = useAuth();
    const navigate = useNavigate();
    const [campaigns, setCampaigns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("all");
    const [dailyLimit, setDailyLimit] = useState({ limit: 1000, used: 0, remaining: 1000 });
    const [deleteId, setDeleteId] = useState(null);

    const fetchCampaigns = async () => {
        try {
            const [campaignsRes, limitRes] = await Promise.all([
                api.get("/campaigns"),
                api.get("/campaigns/daily-limit"),
            ]);
            setCampaigns(campaignsRes.data);
            setDailyLimit(limitRes.data);
        } catch (err) {
            toast.error("Failed to load campaigns");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchCampaigns(); }, []);

    const handleDelete = async () => {
        if (!deleteId) return;
        try {
            await api.delete(`/campaigns/${deleteId}`);
            toast.success("Campaign deleted");
            setDeleteId(null);
            fetchCampaigns();
        } catch (err) {
            toast.error("Failed to delete campaign");
        }
    };

    // Determine effective status for display (draft+scheduled → Scheduled, missed kept as missed)
    const getDisplayStatus = (c) => {
        if (c.status === "missed") return "missed";
        if (c.status === "scheduled") return "scheduled";
        if (c.status === "draft" && c.schedule_type === "scheduled") return "scheduled";
        return c.status;
    };

    // CR-024 Phase 4 P4.11: Re-run a missed campaign — reset to scheduled and re-fire via /send.
    const handleRerunMissed = async (cid) => {
        try {
            await api.put(`/campaigns/${cid}`, { schedule_type: "now" });
            await api.post(`/campaigns/${cid}/send`);
            toast.success("Campaign re-queued for immediate send");
            fetchCampaigns();
        } catch (err) {
            toast.error(err.response?.data?.detail || "Failed to re-run");
        }
    };

    // CR-024 Phase 4 P4.6: Pause / Resume actions
    const handlePause = async (cid) => {
        try {
            await api.post(`/campaigns/${cid}/pause`);
            toast.success("Campaign paused");
            fetchCampaigns();
        } catch (err) {
            toast.error(err.response?.data?.detail || "Failed to pause");
        }
    };
    const handleResume = async (cid) => {
        try {
            const res = await api.post(`/campaigns/${cid}/resume`);
            toast.success(res.data?.message || "Campaign resumed");
            fetchCampaigns();
        } catch (err) {
            toast.error(err.response?.data?.detail || "Failed to resume");
        }
    };

    // CR-024 Phase 4 P4.7: Clone a campaign as a new draft.
    const handleClone = async (cid) => {
        try {
            const res = await api.post(`/campaigns/${cid}/clone`);
            toast.success(`Cloned as "${res.data.name}"`);
            fetchCampaigns();
            navigate(`/campaigns/${res.data.id}`);
        } catch (err) {
            toast.error(err.response?.data?.detail || "Failed to clone");
        }
    };

    const filtered = filter === "all" ? campaigns : campaigns.filter(c => {
        const ds = getDisplayStatus(c);
        return ds === filter;
    });

    const totalSent = campaigns.reduce((s, c) => s + (c.total_sent || 0), 0);
    const totalDelivered = campaigns.reduce((s, c) => s + (c.total_delivered || 0), 0);
    const avgDelivery = totalSent > 0 ? Math.round((totalDelivered / totalSent) * 100) : 0;
    const activeCount = campaigns.filter(c => c.status === "active" || (c.status === "completed" && c.schedule_type === "recurring")).length;
    const scheduledCount = campaigns.filter(c => c.status === "draft" && c.schedule_type === "scheduled").length;
    const completedCount = campaigns.filter(c => c.status === "completed").length;
    const draftCount = campaigns.filter(c => c.status === "draft" && c.schedule_type !== "scheduled").length;

    return (
        <div className="p-4 lg:p-6 max-w-[1200px] mx-auto" data-testid="campaigns-page">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-[#2B2B2B]" data-testid="campaigns-title">Campaigns</h1>
                    <p className="text-sm text-gray-500 mt-1">Create and manage WhatsApp marketing campaigns</p>
                </div>
                <Button
                    onClick={() => navigate("/campaigns/new")}
                    className="bg-[#F26B33] hover:bg-[#D85A2A] text-white rounded-full"
                    data-testid="new-campaign-btn"
                >
                    <Plus className="w-4 h-4 mr-2" /> New Campaign
                </Button>
            </div>

            {/* 5 Stat Cards (matching mock) */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
                <Card className="text-center" data-testid="stats-total">
                    <CardContent className="p-4">
                        <p className="text-2xl font-extrabold text-[#2B2B2B]">{campaigns.length}</p>
                        <p className="text-[11px] text-gray-500 uppercase tracking-wider mt-1">Total Campaigns</p>
                    </CardContent>
                </Card>
                <Card className="text-center" data-testid="stats-active">
                    <CardContent className="p-4">
                        <p className="text-2xl font-extrabold text-green-600">{activeCount}</p>
                        <p className="text-[11px] text-gray-500 uppercase tracking-wider mt-1">Active</p>
                    </CardContent>
                </Card>
                <Card className="text-center" data-testid="stats-scheduled">
                    <CardContent className="p-4">
                        <p className="text-2xl font-extrabold text-blue-600">{scheduledCount}</p>
                        <p className="text-[11px] text-gray-500 uppercase tracking-wider mt-1">Scheduled</p>
                    </CardContent>
                </Card>
                <Card className="text-center" data-testid="stats-sent">
                    <CardContent className="p-4">
                        <p className="text-2xl font-extrabold text-[#2B2B2B]">{totalSent.toLocaleString()}</p>
                        <p className="text-[11px] text-gray-500 uppercase tracking-wider mt-1">Messages Sent</p>
                    </CardContent>
                </Card>
                <Card className="text-center" data-testid="stats-delivery">
                    <CardContent className="p-4">
                        <p className="text-2xl font-extrabold text-green-600">{avgDelivery}%</p>
                        <p className="text-[11px] text-gray-500 uppercase tracking-wider mt-1">Avg. Delivery</p>
                    </CardContent>
                </Card>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-4">
                {[
                    { key: "all", label: `All (${campaigns.length})` },
                    { key: "active", label: `Active (${activeCount})` },
                    { key: "scheduled", label: `Scheduled (${scheduledCount})` },
                    { key: "completed", label: `Completed (${completedCount})` },
                    { key: "draft", label: `Draft (${draftCount})` },
                ].map(t => (
                    <button
                        key={t.key}
                        onClick={() => setFilter(t.key)}
                        className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                            filter === t.key ? "bg-[#1a1a1a] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                        }`}
                        data-testid={`filter-${t.key}`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Campaign List */}
            {loading ? (
                <div className="text-center py-12 text-gray-500">Loading campaigns...</div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-12" data-testid="empty-state">
                    <Megaphone className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 mb-4">No campaigns yet</p>
                    <Button onClick={() => navigate("/campaigns/new")} className="bg-[#F26B33] hover:bg-[#D85A2A] text-white rounded-full">
                        Create your first campaign
                    </Button>
                </div>
            ) : (
                <div className="space-y-3">
                    {filtered.map(campaign => {
                        const ds = getDisplayStatus(campaign);
                        const cfg = STATUS_CONFIG[ds] || STATUS_CONFIG.draft;
                        const isOld = ds === "completed" && campaign.run_count <= 1 && campaign.total_sent > 400;
                        return (
                            <div
                                key={campaign.id}
                                className={`flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-200 hover:border-[#F26B33] hover:shadow-sm transition-all ${isOld ? "opacity-60" : ""}`}
                                data-testid={`campaign-row-${campaign.id}`}
                            >
                                {/* Name & meta */}
                                <div className="flex-1 min-w-0">
                                    <div className="font-semibold text-sm text-[#1a1a1a]" data-testid="campaign-name">{campaign.name}</div>
                                    <div className="text-xs text-gray-500 mt-0.5">
                                        Audience: {campaign.audience_name || "All"} ({campaign.audience_count || 0})
                                        {campaign.template_name && <> &middot; Template: {campaign.template_name}</>}
                                        {campaign.schedule_type === "scheduled" && campaign.scheduled_date && (
                                            <> &middot; Scheduled: {campaign.scheduled_date}, {campaign.scheduled_time || "10:00"}</>
                                        )}
                                        {campaign.schedule_type === "recurring" && <> &middot; Recurring</>}
                                        {campaign.last_run_at && campaign.status === "completed" && (
                                            <> &middot; Sent {new Date(campaign.last_run_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</>
                                        )}
                                    </div>
                                    {/* CR-024 Phase 4 P4.5: next_run_at line for scheduled campaigns */}
                                    {ds === "scheduled" && campaign.next_run_at && (
                                        <div className="text-xs text-blue-600 mt-1 flex items-center gap-1" data-testid="campaign-next-run">
                                            <Clock className="w-3 h-3" />
                                            Next run: {formatNextRunIST(campaign.next_run_at)}
                                        </div>
                                    )}
                                    {/* CR-024 Phase 4 P4.11: missed campaign error reason */}
                                    {ds === "missed" && campaign.error && (
                                        <div className="text-xs text-red-600 mt-1 flex items-center gap-1" data-testid="campaign-missed-reason" title={campaign.error}>
                                            <AlertCircle className="w-3 h-3" />
                                            {campaign.error}
                                        </div>
                                    )}
                                </div>

                                {/* Stat columns (mock style) */}
                                <div className="flex gap-5 items-center">
                                    <div className="text-center min-w-[50px]">
                                        <div className="text-base font-bold text-[#1a1a1a]">
                                            {campaign.total_sent > 0 ? campaign.total_sent.toLocaleString() : (ds === "scheduled" ? campaign.audience_count : "—")}
                                        </div>
                                        <div className="text-[10px] text-gray-500">{ds === "scheduled" ? "Target" : "Sent"}</div>
                                    </div>
                                    <div className="text-center min-w-[50px]">
                                        <div className="text-base font-bold text-green-600">
                                            {campaign.total_delivered > 0 ? campaign.total_delivered.toLocaleString() : "—"}
                                        </div>
                                        <div className="text-[10px] text-gray-500">Delivered</div>
                                    </div>
                                    <div className="text-center min-w-[50px]">
                                        <div className="text-base font-bold text-blue-600">
                                            {campaign.total_read > 0 ? campaign.total_read.toLocaleString() : "—"}
                                        </div>
                                        <div className="text-[10px] text-gray-500">Read</div>
                                    </div>
                                    <div className="text-center min-w-[50px]">
                                        <div className="text-base font-bold text-red-600">
                                            {campaign.total_failed > 0 ? campaign.total_failed.toLocaleString() : "—"}
                                        </div>
                                        <div className="text-[10px] text-gray-500">Failed</div>
                                    </div>
                                </div>

                                {/* Badge */}
                                <Badge className={`${cfg.color} text-xs px-3 py-1`} data-testid="campaign-status">
                                    {cfg.label}
                                </Badge>

                                {/* CR-026: Inline "Messages" deep-link */}
                                {(campaign.total_sent > 0 || ds === "completed" || ds === "active") && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="text-xs rounded-full"
                                        onClick={() => navigate(`/message-status?campaign_id=${campaign.id}`)}
                                        data-testid="campaign-messages-btn"
                                    >
                                        <MessageSquare className="w-3 h-3 mr-1" /> Messages
                                    </Button>
                                )}

                                {/* Action button */}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-xs rounded-full"
                                    onClick={() => navigate(`/campaigns/${campaign.id}`)}
                                    data-testid="campaign-action-btn"
                                >
                                    {ds === "draft" || ds === "scheduled" ? "Edit" : "View"}
                                </Button>

                                {/* More menu */}
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="campaign-more-btn">
                                            <MoreVertical className="w-4 h-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={() => navigate(`/campaigns/${campaign.id}`)}>
                                            <Eye className="w-4 h-4 mr-2" /> View
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleClone(campaign.id)} data-testid="campaign-clone">
                                            <Copy className="w-4 h-4 mr-2" /> Clone as new draft
                                        </DropdownMenuItem>
                                        {/* CR-026: View Messages deep-link (dropdown) */}
                                        {(campaign.total_sent > 0 || ds === "completed" || ds === "active") && (
                                            <DropdownMenuItem
                                                onClick={() => navigate(`/message-status?campaign_id=${campaign.id}`)}
                                                data-testid="campaign-view-messages"
                                            >
                                                <MessageSquare className="w-4 h-4 mr-2" /> View Messages
                                            </DropdownMenuItem>
                                        )}
                                        {(ds === "scheduled" || ds === "active") && (
                                            <DropdownMenuItem onClick={() => handlePause(campaign.id)} data-testid="campaign-pause">
                                                <Pause className="w-4 h-4 mr-2" /> Pause
                                            </DropdownMenuItem>
                                        )}
                                        {ds === "paused" && (
                                            <DropdownMenuItem onClick={() => handleResume(campaign.id)} data-testid="campaign-resume">
                                                <Send className="w-4 h-4 mr-2" /> Resume
                                            </DropdownMenuItem>
                                        )}
                                        {ds === "missed" && (
                                            <DropdownMenuItem onClick={() => handleRerunMissed(campaign.id)} data-testid="campaign-rerun-missed">
                                                <Send className="w-4 h-4 mr-2" /> Re-run now
                                            </DropdownMenuItem>
                                        )}
                                        <DropdownMenuItem onClick={() => setDeleteId(campaign.id)} className="text-red-600">
                                            <Trash2 className="w-4 h-4 mr-2" /> Delete
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Delete confirmation */}
            <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Campaign</AlertDialogTitle>
                        <AlertDialogDescription>This will permanently delete this campaign. This action cannot be undone.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel data-testid="delete-cancel-btn">Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700" data-testid="delete-confirm-btn">Delete</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

const CampaignsPage = () => (
    <ResponsiveLayout>
        <CampaignsPageContent />
    </ResponsiveLayout>
);

export default CampaignsPage;
