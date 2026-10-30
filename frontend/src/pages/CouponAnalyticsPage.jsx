import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
    Ticket, Gift, Clock, Repeat, ChevronUp, ChevronDown,
    Download, CalendarDays, X, FileText, TrendingUp
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveLayout } from "@/components/ResponsiveLayout";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
    CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";

/* ── colour + label maps ─────────────────────────────── */
const SCOPE_CONFIG = {
    order:    { label: "Order-Level",    color: "#F26B33" },
    item:     { label: "Item-Level",     color: "#8B5CF6" },
    category: { label: "Category-Level", color: "#329937" },
    unknown:  { label: "Other",          color: "#9CA3AF" },
};
const OFFER_LABELS = {
    simple: "Simple", bogo: "BOGO", bxg: "Buy X Get Y",
    nth_item: "Every Nth", free_item: "Free Item",
    combo: "Combo", unknown: "Other",
};
const OFFER_COLOR = "#F26B33";
const TIME_OPTIONS = [
    { value: "all", label: "All Time" },
    { value: "7d",  label: "7D" },
    { value: "30d", label: "30D" },
    { value: "90d", label: "90D" },
    { value: "custom", label: "Custom" },
];

/* ── helpers ──────────────────────────────────────────── */
const fmtDate = (d) => {
    if (!d) return "";
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const dy = String(d.getDate()).padStart(2, "0");
    return `${yr}-${mo}-${dy}`;
};
const fmtDateShort = (d) => {
    if (!d) return "Pick";
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};
const toISOStart = (d) => d ? `${fmtDate(d)}T00:00:00+00:00` : null;
const toISOEnd = (d) => d ? `${fmtDate(d)}T23:59:59+00:00` : null;

const escCSV = (v) => {
    const s = String(v ?? "");
    return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"` : s;
};

/* ── tiny reusable components ────────────────────────── */
const StatCard = ({ icon: Icon, label, value, prefix = "", color }) => (
    <Card className="bg-white shadow-sm border border-gray-100">
        <CardContent className="p-4">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: color }}>
                    <Icon className="w-5 h-5 text-white" />
                </div>
                <div>
                    <p className="text-2xl font-bold text-gray-900">{prefix}{value}</p>
                    <p className="text-xs text-gray-500">{label}</p>
                </div>
            </div>
        </CardContent>
    </Card>
);

const InfoRow = ({ label, value }) => (
    <div className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
        <span className="text-sm text-gray-500">{label}</span>
        <span className="text-sm font-semibold text-gray-900">{value}</span>
    </div>
);

const ChartEmpty = ({ message }) => (
    <div className="h-[280px] flex items-center justify-center text-gray-400 text-sm">
        {message}
    </div>
);

const LoadingSkeleton = () => (
    <div data-testid="coupon-analytics-loading" className="space-y-6 animate-pulse">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-gray-200 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="h-[340px] bg-gray-200 rounded-xl" />
            <div className="h-[340px] bg-gray-200 rounded-xl" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => <div key={i} className="h-48 bg-gray-200 rounded-xl" />)}
        </div>
        <div className="h-[300px] bg-gray-200 rounded-xl" />
    </div>
);

const ScopeBadge = ({ scope }) => {
    const cfg = SCOPE_CONFIG[scope] || SCOPE_CONFIG.unknown;
    return (
        <span className="inline-block px-2 py-0.5 rounded text-xs font-medium text-white" style={{ backgroundColor: cfg.color }}>
            {cfg.label}
        </span>
    );
};

const OfferBadge = ({ offer }) => {
    const colors = { simple: "#6B7280", bogo: "#8B5CF6", bxg: "#2563EB", nth_item: "#0D9488", free_item: "#D97706", combo: "#DC2626" };
    return (
        <span className="inline-block px-2 py-0.5 rounded text-xs font-medium text-white" style={{ backgroundColor: colors[offer] || "#6B7280" }}>
            {OFFER_LABELS[offer] || offer}
        </span>
    );
};

const StatusBadge = ({ active }) => (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
        {active ? "Active" : "Inactive"}
    </span>
);

/* ── ROI helpers ─────────────────────────────────────── */
const ROI_BANDS = [
    { min: 8, label: "Strong", color: "#329937", bg: "bg-green-100", text: "text-green-700" },
    { min: 4, label: "Good",   color: "#D97706", bg: "bg-amber-100", text: "text-amber-700" },
    { min: 2, label: "Watch",  color: "#F26B33", bg: "bg-orange-100", text: "text-orange-700" },
    { min: 0, label: "Risk",   color: "#DC2626", bg: "bg-red-100", text: "text-red-700" },
];
const getROIBand = (score) => {
    if (score == null) return null;
    return ROI_BANDS.find(b => score >= b.min) || ROI_BANDS[ROI_BANDS.length - 1];
};

const ROIBadge = ({ score, uses }) => {
    if (score == null) return <span className="text-gray-400">—</span>;
    const band = getROIBand(score);
    return (
        <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1">
                <span className="font-bold text-sm" style={{ color: band.color }}>{score}x</span>
                <span className={`inline-block px-1.5 py-0 rounded text-[10px] font-semibold ${band.bg} ${band.text}`}>{band.label}</span>
            </div>
            {uses != null && uses < 3 && (
                <span className="inline-block px-1.5 py-0 rounded text-[9px] font-medium bg-gray-100 text-gray-500 w-fit">Low Data</span>
            )}
        </div>
    );
};

const BANNER_STYLES = {
    Strong: { bg: "bg-green-50", border: "border-l-green-600", icon: "text-green-600" },
    Good:   { bg: "bg-amber-50",  border: "border-l-amber-500",  icon: "text-amber-500" },
    Watch:  { bg: "bg-orange-50", border: "border-l-orange-500", icon: "text-orange-500" },
    Risk:   { bg: "bg-red-50",    border: "border-l-red-600",    icon: "text-red-600" },
};

/* ── sortable header ─────────────────────────────────── */
const SortHeader = ({ label, field, current, order, onSort }) => {
    const active = current === field;
    return (
        <th
            className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
            onClick={() => onSort(field)}
            data-testid={`sort-${field}`}
        >
            <div className="flex items-center gap-1">
                <span>{label}</span>
                <div className="flex flex-col">
                    <ChevronUp className={`w-3 h-3 ${active && order === "asc" ? "text-[#F26B33]" : "text-gray-300"}`} />
                    <ChevronDown className={`w-3 h-3 -mt-1 ${active && order === "desc" ? "text-[#F26B33]" : "text-gray-300"}`} />
                </div>
            </div>
        </th>
    );
};

/* ── custom tooltip for charts ───────────────────────── */
const ScopeTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0];
    return (
        <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-md text-sm">
            <p className="font-semibold text-gray-800">{d.name}</p>
            <p className="text-gray-600">Used: <span className="font-medium">{d.value}</span></p>
            <p className="text-gray-600">Discount: <span className="font-medium">{d.payload.discount?.toFixed(2)}</span></p>
        </div>
    );
};

/* ── main page ───────────────────────────────────────── */
export default function CouponAnalyticsPage() {
    const { api } = useAuth();
    const [data, setData] = useState(null);
    const [topCoupons, setTopCoupons] = useState([]);
    const [loading, setLoading] = useState(true);
    const [timePeriod, setTimePeriod] = useState("all");
    const [sortBy, setSortBy] = useState("times_used");
    const [sortOrder, setSortOrder] = useState("desc");
    const [exporting, setExporting] = useState(false);
    const [exportingPDF, setExportingPDF] = useState(false);

    /* custom date range state */
    const [customFrom, setCustomFrom] = useState(null);
    const [customTo, setCustomTo] = useState(null);
    const [showFromCal, setShowFromCal] = useState(false);
    const [showToCal, setShowToCal] = useState(false);

    /* build query string for API calls */
    const buildQS = useCallback(() => {
        if (timePeriod === "custom") {
            const parts = [];
            if (customFrom) parts.push(`date_from=${encodeURIComponent(toISOStart(customFrom))}`);
            if (customTo)   parts.push(`date_to=${encodeURIComponent(toISOEnd(customTo))}`);
            return parts.length ? `?${parts.join("&")}` : "";
        }
        return `?time_period=${timePeriod}`;
    }, [timePeriod, customFrom, customTo]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const qs = buildQS();
            const [statsResp, topResp] = await Promise.all([
                api.get(`/analytics/coupons${qs}`),
                api.get(`/analytics/coupons/top${qs}`),
            ]);
            setData(statsResp.data);
            setTopCoupons(topResp.data.coupons || []);
        } catch {
            toast.error("Failed to load coupon analytics");
        } finally {
            setLoading(false);
        }
    }, [buildQS]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        // For custom mode, only fetch when at least one date is set
        if (timePeriod === "custom" && !customFrom && !customTo) return;
        fetchData();
    }, [fetchData]); // eslint-disable-line react-hooks/exhaustive-deps

    /* ── CSV export ──────────────────────────────────── */
    const handleExport = async () => {
        setExporting(true);
        try {
            const qs = buildQS();
            const res = await api.get(`/analytics/coupons/export${qs}`);
            const { headers, rows } = res.data;
            const csvContent = [
                headers.map(escCSV).join(","),
                ...rows.map(row => row.map(escCSV).join(","))
            ].join("\n");
            const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `coupon-analytics-${new Date().toISOString().split("T")[0]}.csv`;
            a.click();
            window.URL.revokeObjectURL(url);
            toast.success("Export downloaded successfully");
        } catch {
            toast.error("Failed to export data");
        } finally {
            setExporting(false);
        }
    };

    /* ── PDF export ────────────────────────────────── */
    const handleExportPDF = async () => {
        setExportingPDF(true);
        try {
            const qs = buildQS();
            const res = await api.get(`/analytics/coupons/pdf${qs}`, { responseType: "blob" });
            const url = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
            const a = document.createElement("a");
            a.href = url;
            a.download = `coupon-analytics-${new Date().toISOString().split("T")[0]}.pdf`;
            a.click();
            window.URL.revokeObjectURL(url);
            toast.success("PDF report downloaded");
        } catch {
            toast.error("Failed to generate PDF report");
        } finally {
            setExportingPDF(false);
        }
    };

    /* ── client-side sort for table ──────────────────── */
    const handleSort = (field) => {
        if (sortBy === field) {
            setSortOrder(o => o === "desc" ? "asc" : "desc");
        } else {
            setSortBy(field);
            setSortOrder("desc");
        }
    };

    const sortedCoupons = [...topCoupons].sort((a, b) => {
        let va = a[sortBy], vb = b[sortBy];
        if (typeof va === "string") va = va.toLowerCase();
        if (typeof vb === "string") vb = vb.toLowerCase();
        if (va == null) va = "";
        if (vb == null) vb = "";
        if (va < vb) return sortOrder === "asc" ? -1 : 1;
        if (va > vb) return sortOrder === "asc" ? 1 : -1;
        return 0;
    });

    /* ── derived data ────────────────────────────────── */
    const avgDiscount =
        data && data.coupons_used > 0
            ? (data.discount_availed / data.coupons_used).toFixed(2)
            : null;

    const scopeData = data
        ? Object.entries(data.breakdown_by_scope)
              .filter(([, v]) => v.used > 0)
              .map(([k, v]) => ({
                  name: SCOPE_CONFIG[k]?.label || k,
                  used: v.used,
                  discount: v.discount,
                  color: SCOPE_CONFIG[k]?.color || "#9CA3AF",
              }))
        : [];

    const offerData = data
        ? Object.entries(data.breakdown_by_offer_type)
              .filter(([, v]) => v.used > 0)
              .map(([k, v]) => ({
                  name: OFFER_LABELS[k] || k,
                  used: v.used,
                  discount: v.discount,
              }))
        : [];

    const nthList = data?.nth_item_usage?.by_nth_number
        ? Object.entries(data.nth_item_usage.by_nth_number)
        : [];

    const periodLabel = timePeriod === "custom"
        ? (customFrom || customTo)
            ? `${customFrom ? fmtDateShort(customFrom) : "..."} — ${customTo ? fmtDateShort(customTo) : "..."}`
            : "Select dates"
        : (TIME_OPTIONS.find(o => o.value === timePeriod)?.label || "All Time");

    /* ── pill select handler ─────────────────────────── */
    const handlePillClick = (val) => {
        setTimePeriod(val);
        if (val !== "custom") {
            setCustomFrom(null);
            setCustomTo(null);
        }
    };

    /* ── render ──────────────────────────────────────── */
    return (
        <ResponsiveLayout>
            <div className="p-4 lg:p-8 max-w-7xl mx-auto" data-testid="coupon-analytics-page">
                {/* Header + date pills + export */}
                <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div>
                        <h1 className="text-xl lg:text-2xl font-bold text-gray-900">Coupon Analytics</h1>
                        <p className="text-sm text-gray-500 mt-1">{periodLabel} coupon performance overview</p>
                    </div>
                    <div className="flex flex-col sm:items-end gap-2">
                        <div className="flex gap-1 bg-gray-100 rounded-lg p-1" data-testid="time-period-filter">
                            {TIME_OPTIONS.map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => handlePillClick(opt.value)}
                                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                                        timePeriod === opt.value
                                            ? "bg-[#F26B33] text-white shadow-sm"
                                            : "text-gray-600 hover:text-gray-900"
                                    }`}
                                    data-testid={`filter-${opt.value}`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>

                        {/* Custom date pickers row */}
                        {timePeriod === "custom" && (
                            <div className="flex items-center gap-2 flex-wrap" data-testid="custom-date-range">
                                {/* From picker */}
                                <Popover open={showFromCal} onOpenChange={setShowFromCal}>
                                    <PopoverTrigger asChild>
                                        <button
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-gray-200 bg-white text-sm hover:border-[#F26B33] transition-colors"
                                            data-testid="date-from-picker"
                                        >
                                            <CalendarDays className="w-3.5 h-3.5 text-gray-400" />
                                            <span className={customFrom ? "text-gray-900" : "text-gray-400"}>
                                                {customFrom ? fmtDate(customFrom) : "From"}
                                            </span>
                                        </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="end">
                                        <Calendar
                                            mode="single"
                                            selected={customFrom}
                                            onSelect={(d) => { setCustomFrom(d); setShowFromCal(false); }}
                                            disabled={(d) => d > new Date() || (customTo && d > customTo)}
                                            initialFocus
                                        />
                                    </PopoverContent>
                                </Popover>

                                <span className="text-gray-400 text-sm">to</span>

                                {/* To picker */}
                                <Popover open={showToCal} onOpenChange={setShowToCal}>
                                    <PopoverTrigger asChild>
                                        <button
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-gray-200 bg-white text-sm hover:border-[#F26B33] transition-colors"
                                            data-testid="date-to-picker"
                                        >
                                            <CalendarDays className="w-3.5 h-3.5 text-gray-400" />
                                            <span className={customTo ? "text-gray-900" : "text-gray-400"}>
                                                {customTo ? fmtDate(customTo) : "To"}
                                            </span>
                                        </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="end">
                                        <Calendar
                                            mode="single"
                                            selected={customTo}
                                            onSelect={(d) => { setCustomTo(d); setShowToCal(false); }}
                                            disabled={(d) => d > new Date() || (customFrom && d < customFrom)}
                                            initialFocus
                                        />
                                    </PopoverContent>
                                </Popover>

                                {/* Clear button */}
                                {(customFrom || customTo) && (
                                    <button
                                        onClick={() => { setCustomFrom(null); setCustomTo(null); }}
                                        className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                                        data-testid="clear-custom-dates"
                                        title="Clear dates"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Export buttons */}
                        <div className="flex gap-2">
                            <button
                                onClick={handleExportPDF}
                                disabled={exportingPDF || loading || !data}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#F26B33] text-white text-sm font-medium hover:bg-[#e05a25] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                data-testid="export-pdf-btn"
                            >
                                <FileText className="w-4 h-4" />
                                {exportingPDF ? "Generating..." : "PDF Report"}
                            </button>
                            <button
                                onClick={handleExport}
                                disabled={exporting || loading || !data}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:border-[#F26B33] hover:text-[#F26B33] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                data-testid="export-csv-btn"
                            >
                                <Download className="w-4 h-4" />
                                {exporting ? "Exporting..." : "CSV"}
                            </button>
                        </div>
                    </div>
                </div>

                {loading ? (
                    <LoadingSkeleton />
                ) : !data ? (
                    <div data-testid="coupon-analytics-error" className="flex flex-col items-center justify-center h-64 text-gray-500">
                        <p>Unable to load data. Please try again.</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {/* ── Section 1: Summary Cards (5 cards) ── */}
                        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 lg:gap-4">
                            <div data-testid="stat-total-coupons">
                                <StatCard icon={Ticket} label="Total Coupons" value={data.total_coupons} color="#8B5CF6" />
                            </div>
                            <div data-testid="stat-times-used">
                                <StatCard icon={Ticket} label="Times Used" value={data.coupons_used} color="#F26B33" />
                            </div>
                            <div data-testid="stat-total-discount">
                                <StatCard icon={Ticket} label="Total Discount" value={data.discount_availed?.toFixed(2)} prefix="₹" color="#329937" />
                            </div>
                            <div data-testid="stat-avg-discount">
                                <StatCard icon={Ticket} label="Avg Discount / Use" value={avgDiscount ?? "—"} prefix={avgDiscount ? "₹" : ""} color="#62B5E5" />
                            </div>
                            <div data-testid="stat-roi-score">
                                <Card className="bg-white shadow-sm border-2 border-amber-300">
                                    <CardContent className="p-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-amber-500">
                                                <TrendingUp className="w-5 h-5 text-white" />
                                            </div>
                                            <div>
                                                {data.roi?.score != null ? (
                                                    <>
                                                        <div className="flex items-center gap-1.5">
                                                            <p className="text-2xl font-bold text-amber-600">{data.roi.score}x</p>
                                                            {(() => { const b = getROIBand(data.roi.score); return b ? <span className={`px-1.5 py-0 rounded text-[10px] font-semibold ${b.bg} ${b.text}`}>{b.label}</span> : null; })()}
                                                        </div>
                                                        <p className="text-xs text-gray-500">ROI Score</p>
                                                    </>
                                                ) : (
                                                    <>
                                                        <p className="text-2xl font-bold text-gray-400">—</p>
                                                        <p className="text-xs text-gray-500">ROI Score</p>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        </div>

                        {/* ── Section 1B: ROI Insight Banner ────── */}
                        {data.roi?.score != null && (() => {
                            const band = getROIBand(data.roi.score);
                            const bs = BANNER_STYLES[band?.label] || BANNER_STYLES.Good;
                            return (
                                <div className={`rounded-xl p-4 border-l-4 ${bs.bg} ${bs.border}`} data-testid="roi-insight-banner">
                                    <div className="flex gap-3">
                                        <TrendingUp className={`w-5 h-5 mt-0.5 flex-shrink-0 ${bs.icon}`} />
                                        <div>
                                            <p className="text-sm font-bold text-gray-900">
                                                {band?.label} ROI ({data.roi.score}x) — Your coupons earned ₹{data.roi.score.toFixed(2)} for every ₹1 discount
                                            </p>
                                            {data.roi.basket_lift != null && data.roi.basket_lift > 1 && (
                                                <p className="text-xs text-gray-600 mt-1">
                                                    Coupon customers spend <span className="font-semibold">{data.roi.basket_lift}x more</span> than average
                                                    (₹{data.roi.avg_coupon_order?.toLocaleString()} vs ₹{data.roi.avg_all_order?.toLocaleString()} per order)
                                                </p>
                                            )}
                                            <div className="flex gap-5 mt-2 text-xs text-gray-500">
                                                <span>Gross Revenue: <span className="font-semibold text-gray-700">₹{data.roi.gross_revenue?.toLocaleString()}</span></span>
                                                <span>Net Revenue: <span className="font-semibold text-gray-700">₹{data.roi.net_revenue?.toLocaleString()}</span></span>
                                                <span>Discount Cost: <span className="font-semibold text-gray-700">{data.roi.discount_cost_pct}%</span></span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* ── Section 2: Charts Row ────────────── */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <Card className="shadow-sm border border-gray-100" data-testid="chart-usage-by-scope">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm font-semibold text-gray-700">Usage by Scope</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    {scopeData.length === 0 ? (
                                        <ChartEmpty message="No usage data yet" />
                                    ) : (
                                        <ResponsiveContainer width="100%" height={280}>
                                            <PieChart>
                                                <Pie data={scopeData} dataKey="used" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={95} paddingAngle={2}>
                                                    {scopeData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                                                </Pie>
                                                <Tooltip content={<ScopeTooltip />} />
                                                <Legend />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    )}
                                </CardContent>
                            </Card>

                            <Card className="shadow-sm border border-gray-100" data-testid="chart-usage-by-offer-type">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm font-semibold text-gray-700">Usage by Offer Type</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    {offerData.length === 0 ? (
                                        <ChartEmpty message="No usage data yet" />
                                    ) : (
                                        <ResponsiveContainer width="100%" height={280}>
                                            <BarChart data={offerData} layout="vertical" margin={{ left: 80, right: 20, top: 10, bottom: 10 }}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                                <XAxis type="number" tick={{ fontSize: 12 }} />
                                                <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={75} />
                                                <Tooltip formatter={(val, name) => name === "used" ? [val, "Used"] : [val, name]} labelFormatter={(l) => l} contentStyle={{ fontSize: 13 }} />
                                                <Bar dataKey="used" fill={OFFER_COLOR} radius={[0, 4, 4, 0]} name="used" />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    )}
                                </CardContent>
                            </Card>
                        </div>

                        {/* ── Section 3: Special Offer Cards ───── */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                            <Card className="shadow-sm border border-gray-100" data-testid="card-happy-hour">
                                <CardHeader className="pb-2">
                                    <div className="flex items-center gap-2">
                                        <Clock className="w-5 h-5 text-amber-500" />
                                        <CardTitle className="text-sm font-semibold text-gray-700">Happy Hour</CardTitle>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <InfoRow label="Coupons with time window" value={data.time_window_usage?.coupons_with_window ?? 0} />
                                    <InfoRow label="Used within window" value={data.time_window_usage?.used_within_window ?? 0} />
                                </CardContent>
                            </Card>

                            <Card className="shadow-sm border border-gray-100" data-testid="card-bogo-bxgy">
                                <CardHeader className="pb-2">
                                    <div className="flex items-center gap-2">
                                        <Gift className="w-5 h-5 text-purple-500" />
                                        <CardTitle className="text-sm font-semibold text-gray-700">BOGO / Buy X Get Y</CardTitle>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <InfoRow label="BOGO orders" value={data.bxgy_usage?.bogo_orders ?? 0} />
                                    <InfoRow label="BXG orders" value={data.bxgy_usage?.bxg_orders ?? 0} />
                                    <InfoRow label="Free items given" value={data.bxgy_usage?.free_units_given ?? 0} />
                                    <InfoRow label="Discounted items" value={data.bxgy_usage?.discounted_units_given ?? 0} />
                                    <InfoRow label="Discount amount" value={`₹${(data.bxgy_usage?.discount_amount ?? 0).toFixed(2)}`} />
                                </CardContent>
                            </Card>

                            <Card className="shadow-sm border border-gray-100" data-testid="card-every-nth">
                                <CardHeader className="pb-2">
                                    <div className="flex items-center gap-2">
                                        <Repeat className="w-5 h-5 text-teal-500" />
                                        <CardTitle className="text-sm font-semibold text-gray-700">Every Nth</CardTitle>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <InfoRow label="Orders" value={data.nth_item_usage?.orders ?? 0} />
                                    <InfoRow label="Benefit items given" value={data.nth_item_usage?.benefit_units_given ?? 0} />
                                    <InfoRow label="Discount amount" value={`₹${(data.nth_item_usage?.discount_amount ?? 0).toFixed(2)}`} />
                                    {nthList.length > 0 && (
                                        <div className="mt-2 pt-2 border-t border-gray-100">
                                            <p className="text-xs text-gray-400 mb-1">By Nth number</p>
                                            <div className="flex flex-wrap gap-2">
                                                {nthList.map(([n, count]) => (
                                                    <span key={n} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-md">Every {n}th: {count}x</span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>

                        {/* ── Section 4: Top Coupons Table ─────── */}
                        <Card className="shadow-sm border border-gray-100" data-testid="table-top-coupons">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-semibold text-gray-700">Coupon Performance</CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                {sortedCoupons.length === 0 ? (
                                    <div className="p-8 text-center text-gray-400 text-sm">No coupons created yet</div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead className="bg-gray-50 border-b border-gray-100">
                                                <tr>
                                                    <SortHeader label="Code" field="code" current={sortBy} order={sortOrder} onSort={handleSort} />
                                                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Title</th>
                                                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Scope</th>
                                                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                                                    <SortHeader label="Used" field="times_used" current={sortBy} order={sortOrder} onSort={handleSort} />
                                                    <SortHeader label="Discount" field="total_discount" current={sortBy} order={sortOrder} onSort={handleSort} />
                                                    <SortHeader label="ROI" field="roi_score" current={sortBy} order={sortOrder} onSort={handleSort} />
                                                    <SortHeader label="Last Used" field="last_used" current={sortBy} order={sortOrder} onSort={handleSort} />
                                                    <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50">
                                                {sortedCoupons.map((c) => (
                                                    <tr key={c.code} className="hover:bg-gray-50 transition-colors">
                                                        <td className="px-3 py-2.5 font-mono text-xs text-gray-800 whitespace-nowrap">{c.code}</td>
                                                        <td className="px-3 py-2.5 text-gray-600 max-w-[200px] truncate">{c.title || "—"}</td>
                                                        <td className="px-3 py-2.5"><ScopeBadge scope={c.discount_scope} /></td>
                                                        <td className="px-3 py-2.5"><OfferBadge offer={c.offer_type} /></td>
                                                        <td className="px-3 py-2.5 font-semibold text-gray-900">{c.times_used}</td>
                                                        <td className="px-3 py-2.5 text-gray-700">₹{c.total_discount.toFixed(2)}</td>
                                                        <td className="px-3 py-2.5"><ROIBadge score={c.roi_score} uses={c.times_used} /></td>
                                                        <td className="px-3 py-2.5 text-gray-500 text-xs whitespace-nowrap">
                                                            {c.last_used ? c.last_used.slice(0, 10) : "Never"}
                                                        </td>
                                                        <td className="px-3 py-2.5"><StatusBadge active={c.is_active} /></td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                )}
            </div>
        </ResponsiveLayout>
    );
}
