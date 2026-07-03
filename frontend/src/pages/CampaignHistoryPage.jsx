import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";      // BUG-009: deep-link to MessageStatus
import { toast } from "sonner";
import { History, CheckCircle2, XCircle, Clock, Send, Users, BarChart3, Download, ChevronDown, FileSpreadsheet } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveLayout } from "@/components/ResponsiveLayout";

const STATUS_BADGE = {
    running: { label: "Running", color: "bg-blue-100 text-blue-700" },
    completed: { label: "Completed", color: "bg-green-100 text-green-700" },
    failed: { label: "Failed", color: "bg-red-100 text-red-700" },
};

const CampaignHistoryContent = () => {
    const { api } = useAuth();
    const navigate = useNavigate();                       // BUG-009
    const [runs, setRuns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [days, setDays] = useState("30");
    const [openExportRunId, setOpenExportRunId] = useState(null);  // CR-042 per-row dropdown

    const fetchRuns = async () => {
        setLoading(true);
        try {
            const res = await api.get(`/campaigns/history/all?days=${days}`);
            setRuns(res.data);
        } catch (err) {
            toast.error("Failed to load campaign history");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchRuns(); }, [days]);

    // CR-042: close per-row export dropdown on outside click
    useEffect(() => {
        if (!openExportRunId) return;
        const handler = (e) => {
            if (!e.target.closest("[data-history-export-wrapper]")) setOpenExportRunId(null);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [openExportRunId]);

    // CR-042: per-run export handler
    const handleRunExport = async (run, format) => {
        setOpenExportRunId(null);
        try {
            const params = new URLSearchParams({ format, run_id: run.id });
            if (run.campaign_id) params.append("campaign_id", run.campaign_id);
            const response = await api.get(`/whatsapp/message-logs/export?${params.toString()}`, { responseType: "blob" });
            const rowCount = response.headers["x-row-count"];
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement("a");
            link.href = url;
            const slug = (run.campaign_name || "run").replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 32);
            link.setAttribute("download", `run_${slug}_${run.id.slice(0, 8)}.${format}`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            toast.success(`Exported ${rowCount || "0"} row${rowCount === "1" ? "" : "s"}`);
        } catch (err) {
            toast.error("Export failed. Please try again.");
        }
    };

    const totalSent = runs.reduce((s, r) => s + (r.total_sent || 0), 0);
    const totalDelivered = runs.reduce((s, r) => s + (r.total_delivered || 0), 0);
    const totalRead = runs.reduce((s, r) => s + (r.total_read || 0), 0);
    const totalFailed = runs.reduce((s, r) => s + (r.total_failed || 0), 0);

    const getDeliveryColor = (pct) => {
        if (pct >= 95) return "text-green-600";
        if (pct >= 85) return "text-amber-600";
        return "text-red-600";
    };

    const getBarColor = (pct) => {
        if (pct >= 95) return "bg-green-500";
        if (pct >= 85) return "bg-amber-500";
        return "bg-red-500";
    };

    return (
        <div className="p-4 lg:p-6 max-w-[1200px] mx-auto" data-testid="campaign-history-page">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-[#2B2B2B]" data-testid="history-title">Campaign History</h1>
                    <p className="text-sm text-gray-500 mt-1">Track delivery and engagement for all campaign runs</p>
                </div>
                <div className="flex gap-2">
                    <Select value={days} onValueChange={setDays}>
                        <SelectTrigger className="w-[140px]" data-testid="days-filter">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="7">Last 7 Days</SelectItem>
                            <SelectItem value="30">Last 30 Days</SelectItem>
                            <SelectItem value="90">Last 90 Days</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* 5 Summary Stats (matching mock) */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
                <Card className="text-center" data-testid="hist-stat-runs">
                    <CardContent className="p-4">
                        <p className="text-2xl font-extrabold text-[#2B2B2B]">{runs.length}</p>
                        <p className="text-[11px] text-gray-500 uppercase tracking-wider mt-1">Campaign Runs</p>
                    </CardContent>
                </Card>
                <Card className="text-center" data-testid="hist-stat-sent">
                    <CardContent className="p-4">
                        <p className="text-2xl font-extrabold text-[#2B2B2B]">{totalSent.toLocaleString()}</p>
                        <p className="text-[11px] text-gray-500 uppercase tracking-wider mt-1">Total Sent</p>
                    </CardContent>
                </Card>
                <Card className="text-center" data-testid="hist-stat-delivered">
                    <CardContent className="p-4">
                        <p className="text-2xl font-extrabold text-green-600">{totalDelivered.toLocaleString()}</p>
                        <p className="text-[11px] text-gray-500 uppercase tracking-wider mt-1">Delivered</p>
                    </CardContent>
                </Card>
                <Card className="text-center" data-testid="hist-stat-read">
                    <CardContent className="p-4">
                        <p className="text-2xl font-extrabold text-blue-600">{totalRead.toLocaleString()}</p>
                        <p className="text-[11px] text-gray-500 uppercase tracking-wider mt-1">Read</p>
                    </CardContent>
                </Card>
                <Card className="text-center" data-testid="hist-stat-failed">
                    <CardContent className="p-4">
                        <p className="text-2xl font-extrabold text-red-600">{totalFailed.toLocaleString()}</p>
                        <p className="text-[11px] text-gray-500 uppercase tracking-wider mt-1">Failed</p>
                    </CardContent>
                </Card>
            </div>

            {/* History Table (matching mock) */}
            {loading ? (
                <div className="text-center py-12 text-gray-500">Loading history...</div>
            ) : runs.length === 0 ? (
                <div className="text-center py-12" data-testid="empty-history">
                    <History className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">No campaign runs yet</p>
                </div>
            ) : (
                <Card>
                    <div className="overflow-x-auto">
                        <table className="w-full" data-testid="history-table">
                            <thead>
                                <tr className="border-b border-gray-200">
                                    <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-3 py-3">Campaign</th>
                                    <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-3 py-3">Audience</th>
                                    <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-3 py-3">Template</th>
                                    <th className="text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-3 py-3">Sent</th>
                                    <th className="text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-3 py-3">Delivered</th>
                                    <th className="text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-3 py-3">Read</th>
                                    <th className="text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-3 py-3">Failed</th>
                                    <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-3 py-3">Delivery %</th>
                                    <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-3 py-3">Date</th>
                                    <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-3 py-3">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {runs.map(run => {
                                    const deliveryPct = run.total_sent > 0 ? ((run.total_delivered / run.total_sent) * 100).toFixed(1) : 0;
                                    return (
                                        <tr key={run.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors" data-testid={`history-row-${run.id}`}>
                                            <td className="px-3 py-3.5 text-sm">
                                                <span className="font-semibold">{run.campaign_name || "Campaign"}</span>
                                            </td>
                                            <td className="px-3 py-3.5 text-sm text-gray-600">{run.audience_name || "—"}</td>
                                            <td className="px-3 py-3.5 text-sm text-gray-600">{run.template_name || "—"}</td>
                                            <td className="px-3 py-3.5 text-sm text-right">{run.total_sent}</td>
                                            <td className="px-3 py-3.5 text-sm text-right text-green-600">{run.total_delivered}</td>
                                            <td className="px-3 py-3.5 text-sm text-right text-blue-600">{run.total_read}</td>
                                            <td className="px-3 py-3.5 text-sm text-right text-red-600">{run.total_failed}</td>
                                            <td className="px-3 py-3.5">
                                                <span className={`text-sm font-semibold ${getDeliveryColor(parseFloat(deliveryPct))}`}>
                                                    {deliveryPct}%
                                                </span>
                                                <div className="w-24 h-1.5 bg-gray-200 rounded-full mt-1">
                                                    <div className={`h-1.5 rounded-full ${getBarColor(parseFloat(deliveryPct))}`} style={{ width: `${deliveryPct}%` }} />
                                                </div>
                                            </td>
                                            <td className="px-3 py-3.5 text-xs text-gray-500">
                                                {new Date(run.started_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })},{' '}
                                                {new Date(run.started_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                                            </td>
                                            <td className="px-3 py-3.5">
                                                <div className="flex gap-1.5 items-center">
                                                    {/* BUG-009: deep-link to Messages page pre-filtered by this run */}
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="text-xs rounded-full"
                                                        data-testid={`history-details-btn-${run.id}`}
                                                        onClick={() => navigate(`/messages?campaign_id=${run.campaign_id}&run_id=${run.id}`)}
                                                        disabled={!run.campaign_id || !run.id}
                                                    >
                                                        Details
                                                    </Button>
                                                    {run.total_failed > 0 && (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="text-xs rounded-full border-orange-300 text-orange-700 hover:bg-orange-50"
                                                            data-testid={`history-resend-failed-${run.id}`}
                                                            onClick={async () => {
                                                                try {
                                                                    const res = await api.post(`/campaigns/${run.campaign_id}/runs/${run.id}/resend-failed`);
                                                                    toast.success(`Resending ${res.data.resending_count} failed message(s)`);
                                                                    setTimeout(() => fetchRuns(), 8000);
                                                                } catch (err) {
                                                                    toast.error(err.response?.data?.detail || "Resend failed");
                                                                }
                                                            }}
                                                        >
                                                            Resend {run.total_failed}
                                                        </Button>
                                                    )}
                                                    {/* CR-042: per-run export dropdown */}
                                                    <div className="relative" data-history-export-wrapper>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="text-xs rounded-full"
                                                            data-testid={`history-export-btn-${run.id}`}
                                                            onClick={() => setOpenExportRunId(openExportRunId === run.id ? null : run.id)}
                                                        >
                                                            <Download className="w-3 h-3 mr-1" />
                                                            Export
                                                            <ChevronDown className="w-3 h-3 ml-0.5" />
                                                        </Button>
                                                        {openExportRunId === run.id && (
                                                            <div className="absolute right-0 top-full mt-1 bg-white border border-gray-100 rounded-xl shadow-lg z-50 min-w-[150px] overflow-hidden">
                                                                <button
                                                                    onClick={() => handleRunExport(run, "csv")}
                                                                    className="flex items-center gap-2 w-full px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                                                                    data-testid={`history-export-csv-${run.id}`}
                                                                >
                                                                    <FileSpreadsheet className="w-3.5 h-3.5 text-green-600" />
                                                                    CSV
                                                                </button>
                                                                <button
                                                                    onClick={() => handleRunExport(run, "xlsx")}
                                                                    className="flex items-center gap-2 w-full px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                                                                    data-testid={`history-export-xlsx-${run.id}`}
                                                                >
                                                                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                                                                    Excel (.xlsx)
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}
        </div>
    );
};

const CampaignHistoryPage = () => (
    <ResponsiveLayout>
        <CampaignHistoryContent />
    </ResponsiveLayout>
);

export default CampaignHistoryPage;
