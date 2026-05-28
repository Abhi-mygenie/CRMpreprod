import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { 
    MessageSquare, CheckCircle, Clock, XCircle, Eye, 
    RefreshCw, Filter, Calendar, Search, ChevronDown
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
        rejected: { bg: "bg-red-100", text: "text-red-800", border: "border-red-300", icon: XCircle, label: "Failed" }
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
    
    // State
    const [stats, setStats] = useState({ total: 0, delivered: 0, read: 0, pending: 0, rejected: 0 });
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({
        status: "all",
        event_type: "all",
        campaign_id: "all",
        template_name: "all",
        search: "",
        include_test: false,   // CR-004 P3.5 Commit 7: hide owner test sends by default
        date_from: "",
        date_to: ""
    });
    const [filterOptions, setFilterOptions] = useState({
        statuses: ["pending", "delivered", "read", "rejected"],
        event_types: [],
        template_names: [],
        campaigns: []
    });
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [resending, setResending] = useState(false);
    const [pagination, setPagination] = useState({ skip: 0, limit: 50, total: 0 });
    
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
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (filters.status !== "all") params.append("status", filters.status);
            if (filters.event_type !== "all") params.append("event_type", filters.event_type);
            if (filters.campaign_id !== "all") params.append("campaign_id", filters.campaign_id);
            if (filters.template_name !== "all") params.append("template_name", filters.template_name);
            if (filters.search) params.append("search", filters.search);
            // CR-004 P3.5 Commit 7
            if (filters.include_test) params.append("include_test", "true");
            if (filters.date_from) params.append("date_from", filters.date_from);
            if (filters.date_to) params.append("date_to", filters.date_to);
            params.append("skip", pagination.skip);
            params.append("limit", pagination.limit);

            const res = await api.get(`/whatsapp/message-logs?${params.toString()}`);
            setLogs(res.data.logs);
            setPagination(prev => ({ ...prev, total: res.data.total }));
        } catch (err) {
            toast.error("Failed to load message logs");
        } finally {
            setLoading(false);
        }
    }, [api, filters, pagination.skip, pagination.limit]);
    
    // Initial fetch
    useEffect(() => {
        fetchStats();
        fetchFilterOptions();
    }, [fetchStats, fetchFilterOptions]);

    // CR-004 P3.5 Commit 7: refetch logs when filters change
    useEffect(() => {
        fetchLogs();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters, pagination.skip]);
    const handleFilterChange = (key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }));
        setPagination(prev => ({ ...prev, skip: 0 }));
        setSelectedIds(new Set());
    };
    
    // Handle checkbox toggle
    const toggleSelect = (id, status) => {
        // Only allow selection of pending/rejected
        if (status !== "pending" && status !== "rejected") return;
        
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
    
    // Handle select all (only pending/rejected)
    const handleSelectAll = (checked) => {
        if (checked) {
            const eligibleIds = logs
                .filter(log => log.status === "pending" || log.status === "rejected")
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
    const eligibleCount = logs.filter(log => log.status === "pending" || log.status === "rejected").length;
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
            
            {/* Refresh button for embedded mode */}
            {embedded && (
                <div className="flex justify-end mb-4">
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
                                        <th className="px-4 py-3">Status</th>
                                        <th className="px-4 py-3">Time</th>
                                        <th className="px-4 py-3">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        [...Array(5)].map((_, i) => (
                                            <tr key={i} className="border-b">
                                                <td colSpan={6} className="px-3 py-4">
                                                    <div className="h-6 bg-gray-200 rounded animate-pulse"></div>
                                                </td>
                                            </tr>
                                        ))
                                    ) : logs.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="px-3 py-8 text-center text-gray-500">
                                                No messages found
                                            </td>
                                        </tr>
                                    ) : (
                                        logs.map(log => {
                                            const isEligible = log.status === "pending" || log.status === "rejected";
                                            return (
                                                <tr key={log.id} className="bg-white border-b hover:bg-gray-50 transition-colors" data-testid={`message-row-${log.id}`}>
                                                    <td className="px-3 py-3">
                                                        <Checkbox 
                                                            checked={selectedIds.has(log.id)}
                                                            disabled={!isEligible}
                                                            onCheckedChange={() => toggleSelect(log.id, log.status)}
                                                            data-testid={`checkbox-${log.id}`}
                                                        />
                                                    </td>
                                                    <td className="px-3 py-3 font-medium text-gray-900">
                                                        {log.customer_name || "-"}
                                                    </td>
                                                    <td className="px-3 py-3 text-gray-600">
                                                        {log.customer_phone || "-"}
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        <StatusBadge status={log.status} />
                                                    </td>
                                                    <td className="px-3 py-3 text-gray-500 text-xs">
                                                        {formatRelativeTime(log.created_at)}
                                                    </td>
                                                    <td className="px-3 py-3">
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
                            const isEligible = log.status === "pending" || log.status === "rejected";
                            const inFlight = isInFlight(log);
                            return (
                                <Card key={log.id} className="shadow-sm border border-gray-100">
                                    <CardContent className="p-3">
                                        <div className="flex items-start gap-2">
                                            <Checkbox 
                                                checked={selectedIds.has(log.id)}
                                                disabled={!isEligible}
                                                onCheckedChange={() => toggleSelect(log.id, log.status)}
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
                                                {(log.delivered_at || log.read_at) && (
                                                    <div className="text-[10px] text-gray-400 mb-1">
                                                        {log.read_at
                                                            ? `Read ${formatRelativeTime(log.read_at)}`
                                                            : `Delivered ${formatRelativeTime(log.delivered_at)}`}
                                                    </div>
                                                )}
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs text-gray-400">{formatRelativeTime(log.created_at)}</span>
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
