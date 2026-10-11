import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { 
    MessageSquare, CheckCircle, Clock, XCircle, Eye, 
    RefreshCw, Filter, Calendar, Search, ChevronDown,
    Download, FileSpreadsheet, Target,        // CR-042 + BUG-009
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { ResponsiveLayout } from "@/components/ResponsiveLayout";

// Status badge component
const StatusBadge = ({ status }) => {
    const config = {
        delivered: { bg: "bg-green-100", text: "text-green-800", border: "border-green-300", icon: CheckCircle, label: "Delivered" },
        read: { bg: "bg-blue-100", text: "text-blue-800", border: "border-blue-300", icon: Eye, label: "Read" },
        pending: { bg: "bg-yellow-100", text: "text-yellow-800", border: "border-yellow-300", icon: Clock, label: "Pending" },
        rejected: { bg: "bg-red-100", text: "text-red-800", border: "border-red-300", icon: XCircle, label: "Failed" },
        // CR-036 B.2 (E-B2-6): "Not Sent" distinguishes pre-send G5 skips from provider rejections
        failed: { bg: "bg-amber-100", text: "text-amber-800", border: "border-amber-300", icon: XCircle, label: "Not Sent" }
    };
    
    const { bg, text, border, icon: Icon, label } = config[status] || config.pending;
    
    return (
        <Badge className={`${bg} ${text} ${border} border flex items-center gap-1 px-2 py-1`}>
            <Icon className="w-3 h-3" />
            {label}
        </Badge>
    );
};

// Stats card component - compact for embedded view
const StatsCard = ({ icon: Icon, label, value, color }) => (
    <Card className="bg-white shadow-sm border border-gray-100">
        <CardContent className="p-2">
            <div className="flex flex-col items-center text-center">
                <div className={`w-7 h-7 rounded-md flex items-center justify-center mb-1 ${color}`}>
                    <Icon className="w-3.5 h-3.5 text-white" />
                </div>
                <p className="text-base font-bold text-gray-900">{value.toLocaleString()}</p>
                <p className="text-[9px] text-gray-500 font-medium">{label}</p>
            </div>
        </CardContent>
    </Card>
);

// Format relative time
const formatRelativeTime = (dateStr) => {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
};

// Exportable content component for embedding
export function MessageStatusContent({ embedded = false }) {
    const { api } = useAuth();
    
    // CR-026: URL params for campaign deep-link
    // BUG-012 (E-A1): hook moved above filters state so lazy initializer can read searchParams once on mount
    const [searchParams, setSearchParams] = useSearchParams();

    // State
    const [stats, setStats] = useState({ total: 0, delivered: 0, read: 0, pending: 0, rejected: 0, failed: 0, media_missing: 0 });
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    // BUG-012 (E-A1): lazy initializer reads URL once — eliminates the mount-effect double-fetch race
    const [filters, setFilters] = useState(() => ({
        status: "all",
        event_type: "all",
        campaign_id: searchParams.get("campaign_id") || "all",   // BUG-012
        run_id: searchParams.get("run_id") || "all",             // BUG-012
        template_name: "all",
        search: "",
        include_test: false,   // CR-004 P3.5 Commit 7: hide owner test sends by default
        date_from: "",
        date_to: "",
        status_note: "all",    // CR-036 B.2 (E-B2-7): media_missing chip toggle
    }));
    const [filterOptions, setFilterOptions] = useState({
        statuses: ["pending", "delivered", "read", "rejected"],
        event_types: [],
        template_names: [],
        campaigns: []
    });
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [resending, setResending] = useState(false);
    const [pagination, setPagination] = useState({ skip: 0, limit: 50, total: 0 });
    const [expandedRow, setExpandedRow] = useState(null);
    const [showExportDropdown, setShowExportDropdown] = useState(false);   // CR-042

    // BUG-012 (E-A3): last-request-wins guard for fetchLogs — stale responses cannot overwrite fresh state
    const fetchSeq = useRef(0);

    // BUG-012 (E-A2): mount effect removed — filters are seeded lazily above (E-A1); the initial
    // filter-driven effect below is the single source of truth for the first fetch.
    
    // Fetch stats
    const fetchStats = useCallback(async () => {
        try {
            // CR-004 P3.5 Commit 7: pass include_test + date range
            const params = new URLSearchParams();
            if (filters.include_test) params.append("include_test", "true");
            if (filters.date_from) params.append("date_from", filters.date_from);
            if (filters.date_to) params.append("date_to", filters.date_to);
            const qs = params.toString();
            const res = await api.get(`/whatsapp/message-stats${qs ? `?${qs}` : ""}`);
            setStats(res.data);
        } catch (err) {
            console.error("Failed to fetch stats", err);
        }
    }, [api, filters.include_test, filters.date_from, filters.date_to]);
    
    // Fetch filter options
    const fetchFilterOptions = useCallback(async () => {
        try {
            const res = await api.get("/whatsapp/message-filters");
            setFilterOptions(res.data);
        } catch (err) {
            console.error("Failed to fetch filter options", err);
        }
    }, [api]);
    
    // Fetch logs
    const fetchLogs = useCallback(async () => {
        // BUG-012 (E-A3): capture request sequence BEFORE await; drop stale responses
        const seq = ++fetchSeq.current;
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (filters.status !== "all") params.append("status", filters.status);
            if (filters.event_type !== "all") params.append("event_type", filters.event_type);
            if (filters.campaign_id !== "all") params.append("campaign_id", filters.campaign_id);
            if (filters.run_id !== "all" && filters.run_id) params.append("run_id", filters.run_id);   // BUG-009 + CR-042
            if (filters.template_name !== "all") params.append("template_name", filters.template_name);
            if (filters.status_note !== "all") params.append("status_note", filters.status_note);  // CR-036 B.2 (E-B2-8)
            if (filters.search) params.append("search", filters.search);
            // CR-004 P3.5 Commit 7
            if (filters.include_test) params.append("include_test", "true");
            if (filters.date_from) params.append("date_from", filters.date_from);
            if (filters.date_to) params.append("date_to", filters.date_to);
            params.append("skip", pagination.skip);
            params.append("limit", pagination.limit);

            const res = await api.get(`/whatsapp/message-logs?${params.toString()}`);
            // BUG-012 (E-A3): only the latest request may mutate visible state
            if (seq !== fetchSeq.current) return;
            setLogs(res.data.logs);
            setPagination(prev => ({ ...prev, total: res.data.total }));
        } catch (err) {
            if (seq !== fetchSeq.current) return;   // BUG-012: also drop stale errors
            toast.error("Failed to load message logs");
        } finally {
            if (seq === fetchSeq.current) setLoading(false);   // BUG-012
        }
    }, [api, filters, pagination.skip, pagination.limit]);
    
    // Initial fetch
    useEffect(() => {
        fetchStats();
        fetchFilterOptions();
    }, [fetchStats, fetchFilterOptions]);

    // CR-004 P3.5 Commit 7: refetch logs when filters change
    // BUG-012: fetchLogs is stable via useCallback deps (api, filters, pagination.skip/limit),
    // so we depend on the callback itself. E-A3 seq guard handles overlapping in-flight requests.
    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);
    // CR-042: close export dropdown on outside click
    useEffect(() => {
        if (!showExportDropdown) return;
        const handler = (e) => {
            if (!e.target.closest("#messages-export-wrapper") &&
                !e.target.closest("#messages-export-wrapper-embedded")) {
                setShowExportDropdown(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [showExportDropdown]);

    // CR-042: filter-aware export from Message Status page
    const handleExport = async (format) => {
        setShowExportDropdown(false);
        try {
            const params = new URLSearchParams({ format });
            if (filters.status !== "all") params.append("status", filters.status);
            if (filters.event_type !== "all") params.append("event_type", filters.event_type);
            if (filters.campaign_id !== "all") params.append("campaign_id", filters.campaign_id);
            if (filters.run_id !== "all" && filters.run_id) params.append("run_id", filters.run_id);
            if (filters.template_name !== "all") params.append("template_name", filters.template_name);
            if (filters.status_note !== "all") params.append("status_note", filters.status_note);  // CR-036 B.2 (E-B2-8)
            if (filters.search) params.append("search", filters.search);
            if (filters.include_test) params.append("include_test", "true");
            if (filters.date_from) params.append("date_from", filters.date_from);
            if (filters.date_to) params.append("date_to", filters.date_to);
            const response = await api.get(`/whatsapp/message-logs/export?${params.toString()}`, { responseType: "blob" });
            const rowCount = response.headers["x-row-count"];
            const rowCap = response.headers["x-row-cap"];
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement("a");
            link.href = url;
            const date = new Date().toISOString().slice(0,10).replace(/-/g,"_");
            link.setAttribute("download", `message_report_${date}.${format}`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            if (rowCount && rowCap && parseInt(rowCount) >= parseInt(rowCap)) {
                toast.warning(`Showing first ${rowCap} rows. Refine filters for a smaller export.`);
            } else {
                toast.success(`Exported ${rowCount || "0"} row${rowCount === "1" ? "" : "s"}`);
            }
        } catch {
            toast.error("Export failed. Please try again.");
        }
    };

    const handleFilterChange = (key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }));
        setPagination(prev => ({ ...prev, skip: 0 }));
        setSelectedIds(new Set());
    };
    
    // Handle checkbox toggle
    const toggleSelect = (id, status, statusNote) => {
        // CR-036 B.3 (E-B3-14): pending/rejected + failed(media_missing) are resendable
        if (status !== "pending" && status !== "rejected" && !(status === "failed" && statusNote === "media_missing")) return;
        
        setSelectedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    };
    
    // Handle select all (only resendable rows)
    const handleSelectAll = (checked) => {
        if (checked) {
            const eligibleIds = logs
                .filter(isResendable)
                .map(log => log.id);
            setSelectedIds(new Set(eligibleIds));
        } else {
            setSelectedIds(new Set());
        }
    };
    
    // Resend selected messages
    const handleResend = async (ids = null) => {
        const idsToResend = ids || Array.from(selectedIds);
        if (idsToResend.length === 0) {
            toast.error("No messages selected");
            return;
        }
        
        setResending(true);
        try {
            const res = await api.post("/whatsapp/resend", { message_ids: idsToResend });
            toast.success(`Resent ${res.data.success_count}/${res.data.total} messages`);
            // CR-036 B.3 (E-B3-14): surface media_still_missing skips
            const stillMissing = (res.data.results || []).filter(r => r.error === "media_still_missing").length;
            if (stillMissing > 0) {
                toast.warning(`${stillMissing} message(s) skipped — template media still missing. Re-upload it on the Templates page first.`);
            }
            setSelectedIds(new Set());
            fetchLogs();
            fetchStats();
        } catch (err) {
            toast.error("Failed to resend messages");
        } finally {
            setResending(false);
        }
    };
    
    // Get eligible count for select all
    // CR-036 B.3 (E-B3-14): failed(media_missing) rows are resendable too
    const isResendable = (log) =>
        log.status === "pending" || log.status === "rejected" ||
        (log.status === "failed" && log.status_note === "media_missing");
    const eligibleCount = logs.filter(isResendable).length;
    const allEligibleSelected = eligibleCount > 0 && selectedIds.size === eligibleCount;

    // CR-004 P3.5 Commit 7: in-flight grace period for resend (mirrors backend 30-min guard)
    const isInFlight = (log) => {
        if (log.status !== "pending") return false;
        const created = log.created_at ? new Date(log.created_at).getTime() : 0;
        const ageMs = Date.now() - created;
        const historyLen = (log.status_history || []).length;
        return ageMs < 30 * 60 * 1000 && historyLen <= 1;
    };
    
    const content = (
        <div className={embedded ? "" : "p-4 lg:p-6 xl:p-8 max-w-[1600px] mx-auto"}>
            {/* Header - only show when not embedded */}
            {!embedded && (
                <div className="flex items-center justify-between mb-6 lg:mb-8">
                    <h1 className="text-2xl lg:text-3xl font-bold text-[#1A1A1A] font-['Georgia']" data-testid="message-status-title">
                        Message Status
                    </h1>
                    <div className="flex gap-2 items-center">
                        {/* CR-042: Export dropdown */}
                        <div className="relative" id="messages-export-wrapper">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowExportDropdown(v => !v)}
                                data-testid="messages-export-btn"
                            >
                                <Download className="w-4 h-4 mr-1" />
                                Export
                                <ChevronDown className="w-3 h-3 ml-0.5" />
                            </Button>
                            {showExportDropdown && (
                                <div className="absolute right-0 top-full mt-1 bg-white border border-gray-100 rounded-xl shadow-lg z-50 min-w-[175px] overflow-hidden">
                                    <div className="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-50">
                                        Download filtered messages
                                    </div>
                                    <button
                                        onClick={() => handleExport("csv")}
                                        className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                                        data-testid="messages-export-csv"
                                    >
                                        <FileSpreadsheet className="w-4 h-4 text-green-600" />
                                        Export as CSV
                                    </button>
                                    <button
                                        onClick={() => handleExport("xlsx")}
                                        className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                                        data-testid="messages-export-xlsx"
                                    >
                                        <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
                                        Export as Excel
                                    </button>
                                </div>
                            )}
                        </div>
                        <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => { fetchStats(); fetchLogs(); }}
                            data-testid="refresh-btn"
                        >
                            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
                        </Button>
                    </div>
                </div>
            )}
            
            {/* Refresh button for embedded mode */}
            {embedded && (
                <div className="flex justify-end mb-4 gap-2">
                    {/* CR-042: Export dropdown (embedded) */}
                    <div className="relative" id="messages-export-wrapper-embedded">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowExportDropdown(v => !v)}
                            data-testid="messages-export-btn-embedded"
                        >
                            <Download className="w-4 h-4 mr-1" />
                            Export
                            <ChevronDown className="w-3 h-3 ml-0.5" />
                        </Button>
                        {showExportDropdown && (
                            <div className="absolute right-0 top-full mt-1 bg-white border border-gray-100 rounded-xl shadow-lg z-50 min-w-[175px] overflow-hidden">
                                <button
                                    onClick={() => handleExport("csv")}
                                    className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                                    data-testid="messages-export-csv-embedded"
                                >
                                    <FileSpreadsheet className="w-4 h-4 text-green-600" />
                                    CSV
                                </button>
                                <button
                                    onClick={() => handleExport("xlsx")}
                                    className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                                    data-testid="messages-export-xlsx-embedded"
                                >
                                    <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
                                    Excel
                                </button>
                            </div>
                        )}
                    </div>
                    <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => { fetchStats(); fetchLogs(); }}
                        data-testid="refresh-btn"
                    >
                        <RefreshCw className="w-4 h-4 mr-1" /> Refresh
                    </Button>
                </div>
            )}
                
                {/* Stats Cards */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 lg:gap-4 mb-6 lg:mb-8">
                    <StatsCard icon={MessageSquare} label="Total" value={stats.total} color="bg-gray-500" />
                    <StatsCard icon={CheckCircle} label="Delivered" value={stats.delivered} color="bg-green-500" />
                    <StatsCard icon={Eye} label="Read" value={stats.read} color="bg-blue-500" />
                    <StatsCard icon={Clock} label="Pending" value={stats.pending} color="bg-yellow-500" />
                    <StatsCard icon={XCircle} label="Failed" value={stats.rejected} color="bg-red-500" />
                </div>
                
                {/* CR-026: campaign filter banner */}
                {filters.campaign_id !== "all" && (
                    <div
                        className="mb-3 flex items-center justify-between rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-sm"
                        data-testid="campaign-filter-banner"
                    >
                        <span className="text-blue-800">
                            Filtered by campaign:{" "}
                            <strong>
                                {filterOptions.campaigns.find(c => c.id === filters.campaign_id)?.name || filters.campaign_id}
                            </strong>
                        </span>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-blue-700 hover:text-blue-900 text-xs"
                            onClick={() => {
                                handleFilterChange("campaign_id", "all");
                                setSearchParams({});
                            }}
                            data-testid="campaign-filter-clear"
                        >
                            Clear
                        </Button>
                    </div>
                )}

                {/* BUG-009: contextual banner when landing with a specific run scope */}
                {filters.run_id && filters.run_id !== "all" && (
                    <div
                        className="mb-3 flex items-center justify-between rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm"
                        data-testid="filtered-to-run-banner"
                    >
                        <span className="text-emerald-900 flex items-center gap-2">
                            <Target className="w-4 h-4" aria-hidden="true" />
                            <span>
                                Filtered to run: <span className="font-mono text-xs">{filters.run_id}</span>
                            </span>
                        </span>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-emerald-700 hover:text-emerald-900 text-xs"
                            onClick={() => {
                                handleFilterChange("run_id", "all");
                                // Preserve campaign_id filter — only drop the run scope
                                const params = new URLSearchParams(searchParams);
                                params.delete("run_id");
                                setSearchParams(params);
                            }}
                            data-testid="clear-run-filter-btn"
                        >
                            Clear run filter
                        </Button>
                    </div>
                )}

                {/* Filters */}
                <Card className="mb-4 shadow-sm border border-gray-100">
                    <CardContent className="p-3">
                        <div className="flex flex-wrap gap-2">
                            {/* Status Filter */}
                            <Select value={filters.status} onValueChange={(v) => handleFilterChange("status", v)}>
                                <SelectTrigger data-testid="filter-status" className="w-[100px] text-xs h-9">
                                    <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Status</SelectItem>
                                    <SelectItem value="pending">Pending</SelectItem>
                                    <SelectItem value="delivered">Delivered</SelectItem>
                                    <SelectItem value="read">Read</SelectItem>
                                    <SelectItem value="rejected">Failed</SelectItem>
                                </SelectContent>
                            </Select>

                            {/* CR-036 B.2 (E-B2-9): Media Missing chip — visible only when count > 0.
                                Click toggles status_note=media_missing filter; status dropdown unaffected. */}
                            {stats.media_missing > 0 && (
                                <button
                                    type="button"
                                    data-testid="media-missing-chip"
                                    onClick={() => handleFilterChange(
                                        "status_note",
                                        filters.status_note === "media_missing" ? "all" : "media_missing"
                                    )}
                                    className={`h-9 px-3 rounded-full border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                                        filters.status_note === "media_missing"
                                            ? "bg-amber-500 border-amber-500 text-white"
                                            : "bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100"
                                    }`}
                                >
                                    <XCircle className="w-3.5 h-3.5" />
                                    Media Missing ({stats.media_missing.toLocaleString()})
                                </button>
                            )}
                            
                            {/* Event Type Filter */}
                            <Select value={filters.event_type} onValueChange={(v) => handleFilterChange("event_type", v)}>
                                <SelectTrigger data-testid="filter-event-type" className="w-[100px] text-xs h-9">
                                    <SelectValue placeholder="Event" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Events</SelectItem>
                                    {filterOptions.event_types.map(e => (
                                        <SelectItem key={e} value={e}>{e.replace(/_/g, " ")}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            
                            {/* Campaign Filter */}
                            <Select value={filters.campaign_id} onValueChange={(v) => handleFilterChange("campaign_id", v)}>
                                <SelectTrigger data-testid="filter-campaign" className="w-[110px] text-xs h-9">
                                    <SelectValue placeholder="Campaign" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Campaigns</SelectItem>
                                    {filterOptions.campaigns.map(c => (
                                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            
                            {/* Template Filter */}
                            <Select value={filters.template_name} onValueChange={(v) => handleFilterChange("template_name", v)}>
                                <SelectTrigger data-testid="filter-template" className="w-[110px] text-xs h-9">
                                    <SelectValue placeholder="Template" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Templates</SelectItem>
                                    {filterOptions.template_names.map(t => (
                                        <SelectItem key={t} value={t}>{t}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            
                            {/* Search */}
                            <div className="relative flex-1 min-w-[120px]">
                                <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <Input 
                                    placeholder="Search name or phone..."
                                    value={filters.search}
                                    onChange={(e) => handleFilterChange("search", e.target.value)}
                                    className="pl-8 text-xs h-9"
                                    data-testid="filter-search"
                                />
                            </div>

                            {/* CR-004 P3.5 Commit 7: date range */}
                            <Input
                                type="date"
                                value={filters.date_from}
                                onChange={(e) => handleFilterChange("date_from", e.target.value)}
                                className="text-xs h-9 w-[140px]"
                                data-testid="filter-date-from"
                                title="From date"
                            />
                            <Input
                                type="date"
                                value={filters.date_to}
                                onChange={(e) => handleFilterChange("date_to", e.target.value)}
                                className="text-xs h-9 w-[140px]"
                                data-testid="filter-date-to"
                                title="To date"
                            />

                            {/* CR-004 P3.5 Commit 7: include test sends toggle */}
                            <label className="flex items-center gap-1.5 text-xs h-9 px-2 cursor-pointer select-none" title="Show owner-initiated test sends">
                                <Checkbox
                                    checked={filters.include_test}
                                    onCheckedChange={(v) => handleFilterChange("include_test", !!v)}
                                    data-testid="filter-include-test"
                                />
                                <span className="text-gray-600">Show test sends</span>
                            </label>
                        </div>
                    </CardContent>
                </Card>
                
                {/* Bulk Actions Bar */}
                {eligibleCount > 0 && (
                    <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3 mb-4 border border-gray-200">
                        <div className="flex items-center gap-3">
                            <Checkbox 
                                checked={allEligibleSelected}
                                onCheckedChange={handleSelectAll}
                                data-testid="select-all-checkbox"
                            />
                            <span className="text-sm text-gray-600">
                                Select All ({eligibleCount} resendable)
                            </span>
                        </div>
                        {selectedIds.size > 0 && (
                            <Button 
                                size="sm"
                                onClick={() => handleResend()}
                                disabled={resending}
                                className="bg-[#F26B33] hover:bg-[#D85A2A]"
                                data-testid="resend-selected-btn"
                            >
                                <RefreshCw className={`w-4 h-4 mr-1 ${resending ? "animate-spin" : ""}`} />
                                Resend Selected ({selectedIds.size})
                            </Button>
                        )}
                    </div>
                )}
                
                {/* Message Logs Table - Desktop */}
                <div className="hidden lg:block">
                    <Card className="shadow-sm border border-gray-100 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b">
                                    <tr>
                                        <th className="px-4 py-3 w-10"></th>
                                        <th className="px-4 py-3">Name</th>
                                        <th className="px-4 py-3">Phone</th>
                                        <th className="px-4 py-3">Event</th>
                                        <th className="px-4 py-3">Template</th>
                                        <th className="px-4 py-3">Status</th>
                                        <th className="px-4 py-3">Time</th>
                                        <th className="px-4 py-3">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        [...Array(5)].map((_, i) => (
                                            <tr key={i} className="border-b">
                                                <td colSpan={8} className="px-3 py-4">
                                                    <div className="h-6 bg-gray-200 rounded animate-pulse"></div>
                                                </td>
                                            </tr>
                                        ))
                                    ) : logs.length === 0 ? (
                                        <tr>
                                            <td colSpan={8} className="px-3 py-8 text-center text-gray-500">
                                                No messages found
                                            </td>
                                        </tr>
                                    ) : (
                                        logs.map(log => {
                                            const isEligible = isResendable(log);
                                            return (
                                                <React.Fragment key={log.id}>
                                                <tr className="bg-white border-b hover:bg-gray-50 transition-colors cursor-pointer" data-testid={`message-row-${log.id}`} onClick={() => setExpandedRow(expandedRow === log.id ? null : log.id)}>
                                                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                                                        <Checkbox 
                                                            checked={selectedIds.has(log.id)}
                                                            disabled={!isEligible}
                                                            onCheckedChange={() => toggleSelect(log.id, log.status, log.status_note)}
                                                            data-testid={`checkbox-${log.id}`}
                                                        />
                                                    </td>
                                                    <td className="px-3 py-3 font-medium text-gray-900">
                                                        {log.customer_name || "-"}
                                                    </td>
                                                    <td className="px-3 py-3 text-gray-600">
                                                        {log.customer_phone || "-"}
                                                    </td>
                                                    <td className="px-3 py-3 text-xs">
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-medium" data-testid={`event-type-${log.id}`}>
                                                            {(log.event_type || "-").replace(/_/g, " ")}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-3 text-xs">
                                                        <span className="truncate block max-w-[140px] text-gray-600" title={log.template_name} data-testid={`template-name-${log.id}`}>{log.template_name || "-"}</span>
                                                        {log.status === "rejected" && (log.failure_reason || log.error) && (
                                                            <span className="text-red-500 text-[10px] block mt-0.5 truncate max-w-[140px]" title={log.failure_reason || log.error} data-testid={`failure-reason-${log.id}`}>
                                                                {log.failure_reason || log.error}
                                                            </span>
                                                        )}
                                                        {/* CR-036 B.2 (E-B2-10): media_missing reason text */}
                                                        {log.status_note === "media_missing" && (
                                                            <span className="text-amber-600 text-[10px] block mt-0.5 truncate max-w-[140px]" title="Media missing — re-upload template header" data-testid={`media-missing-reason-${log.id}`}>
                                                                Media missing — re-upload template header
                                                            </span>
                                                        )}
                                                        {/* BUG-011: opted_out skip reason */}
                                                        {log.status_note === "opted_out" && (
                                                            <span className="text-amber-600 text-[10px] block mt-0.5 truncate max-w-[140px]" title="Skipped — customer opted out of WhatsApp" data-testid={`opted-out-reason-${log.id}`}>
                                                                Skipped — customer opted out of WhatsApp
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        <StatusBadge status={log.status} />
                                                    </td>
                                                    <td className="px-3 py-3 text-gray-500 text-xs">
                                                        {/* CR-065 (D6=a): resent time replaces original on row */}
                                                        {log.resend_count > 0 ? (
                                                            <span data-testid={`resent-time-${log.id}`}>
                                                                Resent {formatRelativeTime(log.last_resend_at)}
                                                                <span className="ml-1 text-[10px] text-amber-600 font-semibold" data-testid={`resent-badge-${log.id}`}>×{log.resend_count}</span>
                                                            </span>
                                                        ) : formatRelativeTime(log.created_at)}
                                                    </td>
                                                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                                                        {isEligible && (
                                                            <Button 
                                                                size="sm" 
                                                                variant="outline"
                                                                onClick={() => handleResend([log.id])}
                                                                disabled={resending}
                                                                data-testid={`resend-btn-${log.id}`}
                                                            >
                                                                <RefreshCw className="w-3 h-3 mr-1" /> Resend
                                                            </Button>
                                                        )}
                                                    </td>
                                                </tr>
                                                {expandedRow === log.id && (
                                                    <tr className="bg-gray-50 border-b" data-testid={`expanded-row-${log.id}`}>
                                                        <td colSpan={8} className="px-6 py-4">
                                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                                                <div>
                                                                    <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Message Details</h4>
                                                                    <div className="space-y-1.5 text-xs">
                                                                        <div><span className="text-gray-500">Event:</span> <span className="font-medium">{(log.event_type || "-").replace(/_/g, " ")}</span></div>
                                                                        <div><span className="text-gray-500">Template:</span> <span className="font-medium">{log.template_name || "-"}</span></div>
                                                                        {log.pos_order_id && <div><span className="text-gray-500">Order:</span> <span className="font-medium">#{log.pos_order_id}</span></div>}
                                                                        {log.campaign_id && <div><span className="text-gray-500">Campaign:</span> <span className="font-medium">{log.campaign_id}</span></div>}
                                                                        {log.body_values && Object.keys(log.body_values).length > 0 && (
                                                                            <div>
                                                                                <span className="text-gray-500">Values sent:</span>
                                                                                <div className="mt-1 flex flex-wrap gap-1">
                                                                                    {Object.entries(log.body_values).map(([k, v]) => (
                                                                                        <span key={k} className="px-1.5 py-0.5 bg-white border rounded text-[10px]">
                                                                                            {`{{${k}}}`}={v || <span className="text-gray-400">empty</span>}
                                                                                        </span>
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                        {(log.failure_reason || log.error) && (
                                                                            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded" data-testid={`failure-detail-${log.id}`}>
                                                                                <span className="text-red-600 font-medium">Failure: </span>
                                                                                <span className="text-red-700">{log.failure_reason || log.error}</span>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                <div>
                                                                    <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Status Timeline</h4>
                                                                    <div className="space-y-2">
                                                                        {(log.status_history || []).map((h, idx) => (
                                                                            <div key={idx} className="flex items-center gap-2 text-xs">
                                                                                <div className={`w-2 h-2 rounded-full ${
                                                                                    h.status === "read" ? "bg-blue-500" :
                                                                                    h.status === "delivered" ? "bg-green-500" :
                                                                                    h.status === "rejected" ? "bg-red-500" :
                                                                                    "bg-yellow-500"
                                                                                }`} />
                                                                                <span className="font-medium capitalize">{h.status}</span>
                                                                                <span className="text-gray-400">{formatRelativeTime(h.timestamp)}</span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                                </React.Fragment>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </div>
                
                {/* Message Logs Cards - Mobile */}
                <div className="lg:hidden space-y-3">
                    {loading ? (
                        [...Array(3)].map((_, i) => (
                            <Card key={i} className="animate-pulse">
                                <CardContent className="p-4">
                                    <div className="h-20 bg-gray-200 rounded"></div>
                                </CardContent>
                            </Card>
                        ))
                    ) : logs.length === 0 ? (
                        <Card>
                            <CardContent className="p-8 text-center text-gray-500">
                                No messages found
                            </CardContent>
                        </Card>
                    ) : (
                        logs.map(log => {
                            const isEligible = isResendable(log);
                            const inFlight = isInFlight(log);
                            return (
                                <Card key={log.id} className="shadow-sm border border-gray-100">
                                    <CardContent className="p-3">
                                        <div className="flex items-start gap-2">
                                            <Checkbox 
                                                checked={selectedIds.has(log.id)}
                                                disabled={!isEligible}
                                                onCheckedChange={() => toggleSelect(log.id, log.status, log.status_note)}
                                                className="mt-1"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between mb-1">
                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                        <span className="font-medium text-gray-900 text-sm truncate">{log.customer_name || log.customer_phone || "-"}</span>
                                                        {log.is_test && (
                                                            <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200">TEST</span>
                                                        )}
                                                    </div>
                                                    <StatusBadge status={log.status} />
                                                </div>
                                                {log.customer_name && (
                                                    <div className="text-xs text-gray-500 mb-1">{log.customer_phone}</div>
                                                )}
                                                <div className="flex items-center gap-1.5 mb-1">
                                                    <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 rounded text-gray-600 font-medium" data-testid={`mobile-event-${log.id}`}>
                                                        {(log.event_type || "").replace(/_/g, " ")}
                                                    </span>
                                                    {log.template_name && (
                                                        <span className="text-[10px] text-gray-400 truncate max-w-[120px]">{log.template_name}</span>
                                                    )}
                                                </div>
                                                {log.status === "rejected" && (log.failure_reason || log.error) && (
                                                    <div className="text-[10px] text-red-500 mb-1" data-testid={`mobile-failure-${log.id}`}>
                                                        {log.failure_reason || log.error}
                                                    </div>
                                                )}
                                                {/* CR-036 B.2 (E-B2-10): media_missing reason on mobile card */}
                                                {log.status_note === "media_missing" && (
                                                    <div className="text-[10px] text-amber-600 mb-1" data-testid={`mobile-media-missing-${log.id}`}>
                                                        Media missing — re-upload template header
                                                    </div>
                                                )}
                                                {/* BUG-011: opted_out skip reason on mobile card */}
                                                {log.status_note === "opted_out" && (
                                                    <div className="text-[10px] text-amber-600 mb-1" data-testid={`mobile-opted-out-${log.id}`}>
                                                        Skipped — customer opted out of WhatsApp
                                                    </div>
                                                )}
                                                {(log.delivered_at || log.read_at) && (
                                                    <div className="text-[10px] text-gray-400 mb-1">
                                                        {log.read_at
                                                            ? `Read ${formatRelativeTime(log.read_at)}`
                                                            : `Delivered ${formatRelativeTime(log.delivered_at)}`}
                                                    </div>
                                                )}
                                                <div className="flex items-center justify-between">
                                                    {/* CR-065 (D6=a): resent time on mobile card */}
                                                    <span className="text-xs text-gray-400" data-testid={log.resend_count > 0 ? `mobile-resent-time-${log.id}` : undefined}>
                                                        {log.resend_count > 0 ? (
                                                            <>Resent {formatRelativeTime(log.last_resend_at)} <span className="text-[10px] text-amber-600 font-semibold">×{log.resend_count}</span></>
                                                        ) : formatRelativeTime(log.created_at)}
                                                    </span>
                                                    {isEligible && (
                                                        <Button 
                                                            size="sm" 
                                                            variant="outline"
                                                            onClick={() => handleResend([log.id])}
                                                            disabled={resending || inFlight}
                                                            title={inFlight ? "Waiting for delivery report (auto-updates)" : undefined}
                                                        >
                                                            <RefreshCw className="w-3 h-3 mr-1" /> Resend
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })
                    )}
                </div>
                
                {/* Pagination */}
                {pagination.total > pagination.limit && (
                    <div className="flex items-center justify-between mt-4">
                        <span className="text-sm text-gray-500">
                            Showing {pagination.skip + 1}-{Math.min(pagination.skip + pagination.limit, pagination.total)} of {pagination.total}
                        </span>
                        <div className="flex gap-2">
                            <Button 
                                variant="outline" 
                                size="sm"
                                disabled={pagination.skip === 0}
                                onClick={() => setPagination(prev => ({ ...prev, skip: Math.max(0, prev.skip - prev.limit) }))}
                            >
                                Previous
                            </Button>
                            <Button 
                                variant="outline" 
                                size="sm"
                                disabled={pagination.skip + pagination.limit >= pagination.total}
                                onClick={() => setPagination(prev => ({ ...prev, skip: prev.skip + prev.limit }))}
                            >
                                Next
                            </Button>
                        </div>
                    </div>
                )}
            </div>
    );
    
    // Return with or without ResponsiveLayout wrapper
    if (embedded) {
        return content;
    }
    
    return (
        <ResponsiveLayout>
            {content}
        </ResponsiveLayout>
    );
}

// Default export for standalone page
export default function MessageStatusPage() {
    return <MessageStatusContent embedded={false} />;
}
