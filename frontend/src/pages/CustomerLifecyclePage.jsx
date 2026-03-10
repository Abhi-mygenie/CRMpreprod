import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { 
    Users, UserPlus, UserCheck, AlertTriangle, UserX, Clock,
    TrendingUp, TrendingDown, RefreshCw, Download, Search,
    ChevronUp, ChevronDown, MessageSquare, Eye
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { ResponsiveLayout } from "@/components/ResponsiveLayout";
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, 
    ResponsiveContainer, Legend
} from "recharts";

// Stage configuration
const STAGE_CONFIG = {
    new: { 
        label: "New", 
        color: "#329937", 
        bgColor: "bg-green-50", 
        textColor: "text-green-700",
        borderColor: "border-green-200",
        icon: UserPlus,
        description: "First-time customers"
    },
    active: { 
        label: "Active", 
        color: "#62B5E5", 
        bgColor: "bg-blue-50", 
        textColor: "text-blue-700",
        borderColor: "border-blue-200",
        icon: UserCheck,
        description: "Returning customers"
    },
    at_risk: { 
        label: "At Risk", 
        color: "#F59E0B", 
        bgColor: "bg-amber-50", 
        textColor: "text-amber-700",
        borderColor: "border-amber-200",
        icon: AlertTriangle,
        description: "31-60 days inactive"
    },
    dormant: { 
        label: "Dormant", 
        color: "#EF4444", 
        bgColor: "bg-red-50", 
        textColor: "text-red-700",
        borderColor: "border-red-200",
        icon: Clock,
        description: "61-90 days inactive"
    },
    churned: { 
        label: "Churned", 
        color: "#6B7280", 
        bgColor: "bg-gray-50", 
        textColor: "text-gray-700",
        borderColor: "border-gray-200",
        icon: UserX,
        description: "90+ days inactive"
    }
};

// Stage card component
const StageCard = ({ stage, count, percent, isSelected, onClick }) => {
    const config = STAGE_CONFIG[stage];
    const Icon = config.icon;
    
    return (
        <Card 
            className={`cursor-pointer transition-all duration-200 hover:shadow-md ${
                isSelected ? `ring-2 ring-offset-2 ${config.borderColor} ring-${config.color}` : ''
            } ${config.bgColor} border ${config.borderColor}`}
            onClick={onClick}
            data-testid={`stage-card-${stage}`}
        >
            <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center`} 
                         style={{ backgroundColor: config.color }}>
                        <Icon className="w-5 h-5 text-white" />
                    </div>
                    <span className={`text-xs font-medium ${config.textColor}`}>
                        {percent}%
                    </span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{count.toLocaleString()}</p>
                <p className={`text-xs ${config.textColor} font-medium`}>{config.label}</p>
                <p className="text-[10px] text-gray-500 mt-1">{config.description}</p>
            </CardContent>
        </Card>
    );
};

// Stage badge component
const StageBadge = ({ stage }) => {
    const config = STAGE_CONFIG[stage] || STAGE_CONFIG.churned;
    return (
        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${config.bgColor} ${config.textColor} border ${config.borderColor}`}>
            {config.label}
        </span>
    );
};

// Custom tooltip for chart
const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-white p-3 rounded-lg shadow-lg border border-gray-100">
                <p className="font-semibold text-gray-900 mb-2">{label}</p>
                {payload.map((entry, index) => (
                    <div key={index} className="flex items-center gap-2 text-sm">
                        <div className="w-3 h-3 rounded" style={{ backgroundColor: entry.color }}></div>
                        <span className="text-gray-600">{entry.name}:</span>
                        <span className="font-medium">{entry.value}</span>
                    </div>
                ))}
            </div>
        );
    }
    return null;
};

// Sortable column header
const SortableHeader = ({ label, field, currentSort, currentOrder, onSort }) => {
    const isActive = currentSort === field;
    return (
        <th 
            className="px-4 py-3 cursor-pointer hover:bg-gray-100 transition-colors select-none"
            onClick={() => onSort(field)}
            data-testid={`sort-${field}`}
        >
            <div className="flex items-center gap-1">
                <span>{label}</span>
                <div className="flex flex-col">
                    <ChevronUp className={`w-3 h-3 -mb-1 ${isActive && currentOrder === 'asc' ? 'text-[#F26B33]' : 'text-gray-300'}`} />
                    <ChevronDown className={`w-3 h-3 ${isActive && currentOrder === 'desc' ? 'text-[#F26B33]' : 'text-gray-300'}`} />
                </div>
            </div>
        </th>
    );
};

export default function CustomerLifecyclePage() {
    const { api } = useAuth();
    const navigate = useNavigate();
    
    // State
    const [summary, setSummary] = useState({
        new: { count: 0, percent: 0 },
        active: { count: 0, percent: 0 },
        at_risk: { count: 0, percent: 0 },
        dormant: { count: 0, percent: 0 },
        churned: { count: 0, percent: 0 }
    });
    const [totalCustomers, setTotalCustomers] = useState(0);
    const [trend, setTrend] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [customersTotal, setCustomersTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [trendLoading, setTrendLoading] = useState(true);
    
    // Filters
    const [selectedStage, setSelectedStage] = useState("all");
    const [trendPeriod, setTrendPeriod] = useState("90d");
    const [sortBy, setSortBy] = useState("last_visit");
    const [sortOrder, setSortOrder] = useState("asc");
    const [search, setSearch] = useState("");
    
    // Fetch summary
    const fetchSummary = useCallback(async () => {
        try {
            const res = await api.get("/analytics/customer-lifecycle");
            setSummary(res.data.summary);
            setTotalCustomers(res.data.total_customers);
        } catch (err) {
            console.error("Failed to fetch lifecycle summary:", err);
            toast.error("Failed to load lifecycle data");
        }
    }, [api]);
    
    // Fetch trend
    const fetchTrend = useCallback(async () => {
        setTrendLoading(true);
        try {
            const res = await api.get(`/analytics/customer-lifecycle/trend?time_period=${trendPeriod}&granularity=weekly`);
            setTrend(res.data.trend || []);
        } catch (err) {
            console.error("Failed to fetch lifecycle trend:", err);
        } finally {
            setTrendLoading(false);
        }
    }, [api, trendPeriod]);
    
    // Fetch customers
    const fetchCustomers = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                stage: selectedStage,
                sort_by: sortBy,
                sort_order: sortOrder,
                limit: "50",
                skip: "0"
            });
            if (search) params.append("search", search);
            
            const res = await api.get(`/analytics/customer-lifecycle/customers?${params.toString()}`);
            setCustomers(res.data.customers || []);
            setCustomersTotal(res.data.total || 0);
        } catch (err) {
            console.error("Failed to fetch customers:", err);
            toast.error("Failed to load customers");
        } finally {
            setLoading(false);
        }
    }, [api, selectedStage, sortBy, sortOrder, search]);
    
    // Initial fetch
    useEffect(() => {
        fetchSummary();
    }, [fetchSummary]);
    
    useEffect(() => {
        fetchTrend();
    }, [fetchTrend]);
    
    useEffect(() => {
        fetchCustomers();
    }, [fetchCustomers]);
    
    // Handle stage card click
    const handleStageClick = (stage) => {
        setSelectedStage(selectedStage === stage ? "all" : stage);
    };
    
    // Handle sort
    const handleSort = (field) => {
        if (sortBy === field) {
            setSortOrder(sortOrder === "desc" ? "asc" : "desc");
        } else {
            setSortBy(field);
            setSortOrder("asc");
        }
    };
    
    // Handle export
    const handleExport = async () => {
        try {
            const res = await api.get(`/analytics/customer-lifecycle/export?stage=${selectedStage}`);
            const { headers, rows } = res.data;
            
            const csvContent = [
                headers.join(","),
                ...rows.map(row => row.join(","))
            ].join("\n");
            
            const blob = new Blob([csvContent], { type: "text/csv" });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `customer-lifecycle-${selectedStage}-${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
            window.URL.revokeObjectURL(url);
            
            toast.success("Export downloaded successfully");
        } catch (err) {
            toast.error("Failed to export data");
        }
    };
    
    // Handle re-engage
    const handleReengage = (customerId) => {
        // Navigate to customer detail with re-engage action
        navigate(`/customers/${customerId}?action=reengage`);
    };
    
    // Handle view customer
    const handleViewCustomer = (customerId) => {
        navigate(`/customers/${customerId}`);
    };
    
    // Refresh all data
    const handleRefresh = () => {
        fetchSummary();
        fetchTrend();
        fetchCustomers();
    };
    
    return (
        <ResponsiveLayout>
            <div className="p-4 lg:p-6 xl:p-8 max-w-[1600px] mx-auto">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                    <div>
                        <h1 className="text-2xl lg:text-3xl font-bold text-[#1A1A1A] font-['Georgia']" data-testid="lifecycle-title">
                            Customer Lifecycle
                        </h1>
                        <p className="text-gray-500 text-sm mt-1">
                            Track customer journey from new to churned • {totalCustomers.toLocaleString()} total customers
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Button 
                            variant="outline" 
                            size="sm"
                            onClick={handleRefresh}
                            data-testid="refresh-btn"
                        >
                            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
                        </Button>
                        <Button 
                            size="sm"
                            onClick={handleExport}
                            className="bg-[#329937] hover:bg-[#287a2c]"
                            data-testid="export-btn"
                        >
                            <Download className="w-4 h-4 mr-1" /> Export
                        </Button>
                    </div>
                </div>
                
                {/* Stage Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 lg:gap-4 mb-6">
                    {Object.entries(STAGE_CONFIG).map(([stage]) => (
                        <StageCard
                            key={stage}
                            stage={stage}
                            count={summary[stage]?.count || 0}
                            percent={summary[stage]?.percent || 0}
                            isSelected={selectedStage === stage}
                            onClick={() => handleStageClick(stage)}
                        />
                    ))}
                </div>
                
                {/* Trend Chart */}
                <Card className="mb-6 shadow-sm border border-gray-100">
                    <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-lg font-semibold">Lifecycle Trend</CardTitle>
                            <Select value={trendPeriod} onValueChange={setTrendPeriod}>
                                <SelectTrigger className="w-[130px]" data-testid="trend-period-select">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="30d">Last 30 Days</SelectItem>
                                    <SelectItem value="90d">Last 90 Days</SelectItem>
                                    <SelectItem value="180d">Last 6 Months</SelectItem>
                                    <SelectItem value="365d">Last Year</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {trendLoading ? (
                            <div className="h-[300px] flex items-center justify-center">
                                <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
                            </div>
                        ) : trend.length === 0 ? (
                            <div className="h-[300px] flex items-center justify-center text-gray-500">
                                No trend data available
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height={300}>
                                <AreaChart data={trend} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                    <XAxis 
                                        dataKey="date" 
                                        tick={{ fontSize: 12 }} 
                                        tickFormatter={(val) => {
                                            const d = new Date(val);
                                            return `${d.getMonth()+1}/${d.getDate()}`;
                                        }}
                                    />
                                    <YAxis tick={{ fontSize: 12 }} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Legend />
                                    <Area type="monotone" dataKey="new" stackId="1" stroke={STAGE_CONFIG.new.color} fill={STAGE_CONFIG.new.color} name="New" />
                                    <Area type="monotone" dataKey="active" stackId="1" stroke={STAGE_CONFIG.active.color} fill={STAGE_CONFIG.active.color} name="Active" />
                                    <Area type="monotone" dataKey="at_risk" stackId="1" stroke={STAGE_CONFIG.at_risk.color} fill={STAGE_CONFIG.at_risk.color} name="At Risk" />
                                    <Area type="monotone" dataKey="dormant" stackId="1" stroke={STAGE_CONFIG.dormant.color} fill={STAGE_CONFIG.dormant.color} name="Dormant" />
                                    <Area type="monotone" dataKey="churned" stackId="1" stroke={STAGE_CONFIG.churned.color} fill={STAGE_CONFIG.churned.color} name="Churned" />
                                </AreaChart>
                            </ResponsiveContainer>
                        )}
                    </CardContent>
                </Card>
                
                {/* Stage Breakdown Bar */}
                <Card className="mb-6 shadow-sm border border-gray-100">
                    <CardContent className="p-4">
                        <p className="text-sm font-medium text-gray-700 mb-3">Stage Distribution</p>
                        <div className="flex h-6 rounded-lg overflow-hidden">
                            {Object.entries(STAGE_CONFIG).map(([stage, config]) => {
                                const percent = summary[stage]?.percent || 0;
                                if (percent === 0) return null;
                                return (
                                    <div
                                        key={stage}
                                        className="flex items-center justify-center text-xs font-medium text-white transition-all cursor-pointer hover:opacity-90"
                                        style={{ 
                                            width: `${percent}%`, 
                                            backgroundColor: config.color,
                                            minWidth: percent > 0 ? '30px' : '0'
                                        }}
                                        onClick={() => handleStageClick(stage)}
                                        title={`${config.label}: ${percent}%`}
                                    >
                                        {percent >= 8 ? `${percent}%` : ''}
                                    </div>
                                );
                            })}
                        </div>
                        <div className="flex flex-wrap gap-4 mt-3">
                            {Object.entries(STAGE_CONFIG).map(([stage, config]) => (
                                <div key={stage} className="flex items-center gap-2 text-xs">
                                    <div className="w-3 h-3 rounded" style={{ backgroundColor: config.color }}></div>
                                    <span className="text-gray-600">{config.label}</span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
                
                {/* Customer Table Section */}
                <Card className="shadow-sm border border-gray-100">
                    <CardHeader className="pb-2">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                            <CardTitle className="text-lg font-semibold">
                                Customers {selectedStage !== "all" && `(${STAGE_CONFIG[selectedStage]?.label})`}
                                <span className="text-sm font-normal text-gray-500 ml-2">
                                    {customersTotal.toLocaleString()} results
                                </span>
                            </CardTitle>
                            <div className="flex gap-2">
                                <Select value={selectedStage} onValueChange={setSelectedStage}>
                                    <SelectTrigger className="w-[140px]" data-testid="stage-filter">
                                        <SelectValue placeholder="Filter Stage" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Stages</SelectItem>
                                        {Object.entries(STAGE_CONFIG).map(([stage, config]) => (
                                            <SelectItem key={stage} value={stage}>{config.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <Input 
                                        placeholder="Search..."
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        className="pl-9 w-[180px]"
                                        data-testid="customer-search"
                                    />
                                </div>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        {/* Desktop Table */}
                        <div className="hidden lg:block overflow-x-auto">
                            <table className="w-full text-sm text-left" data-testid="customers-table">
                                <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-y">
                                    <tr>
                                        <th className="px-4 py-3">Customer</th>
                                        <th className="px-4 py-3">Stage</th>
                                        <SortableHeader 
                                            label="Last Visit" 
                                            field="last_visit" 
                                            currentSort={sortBy} 
                                            currentOrder={sortOrder} 
                                            onSort={handleSort} 
                                        />
                                        <th className="px-4 py-3">Days Inactive</th>
                                        <SortableHeader 
                                            label="Total Visits" 
                                            field="total_visits" 
                                            currentSort={sortBy} 
                                            currentOrder={sortOrder} 
                                            onSort={handleSort} 
                                        />
                                        <SortableHeader 
                                            label="Total Spent" 
                                            field="total_spent" 
                                            currentSort={sortBy} 
                                            currentOrder={sortOrder} 
                                            onSort={handleSort} 
                                        />
                                        <th className="px-4 py-3">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        [...Array(5)].map((_, i) => (
                                            <tr key={i} className="border-b">
                                                <td colSpan={7} className="px-4 py-4">
                                                    <div className="h-6 bg-gray-200 rounded animate-pulse"></div>
                                                </td>
                                            </tr>
                                        ))
                                    ) : customers.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                                                <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                                                <p>No customers found</p>
                                            </td>
                                        </tr>
                                    ) : (
                                        customers.map((customer, idx) => (
                                            <tr 
                                                key={customer.id} 
                                                className={`border-b hover:bg-gray-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}
                                                data-testid={`customer-row-${idx}`}
                                            >
                                                <td className="px-4 py-3">
                                                    <div>
                                                        <p className="font-medium text-gray-900">{customer.name || "—"}</p>
                                                        <p className="text-xs text-gray-500">{customer.phone}</p>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <StageBadge stage={customer.stage} />
                                                </td>
                                                <td className="px-4 py-3 text-gray-600">
                                                    {customer.last_visit ? new Date(customer.last_visit).toLocaleDateString() : "Never"}
                                                </td>
                                                <td className="px-4 py-3">
                                                    {customer.days_since_visit !== null ? (
                                                        <span className={`font-medium ${
                                                            customer.days_since_visit > 60 ? 'text-red-600' :
                                                            customer.days_since_visit > 30 ? 'text-amber-600' :
                                                            'text-green-600'
                                                        }`}>
                                                            {customer.days_since_visit} days
                                                        </span>
                                                    ) : "—"}
                                                </td>
                                                <td className="px-4 py-3 text-gray-600">
                                                    {customer.total_visits || 0}
                                                </td>
                                                <td className="px-4 py-3 text-gray-600">
                                                    ₹{(customer.total_spent || 0).toLocaleString()}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex gap-1">
                                                        {(customer.stage === "at_risk" || customer.stage === "dormant" || customer.stage === "churned") && (
                                                            <Button 
                                                                size="sm" 
                                                                variant="outline"
                                                                className="text-[#F26B33] border-[#F26B33] hover:bg-[#F26B33] hover:text-white"
                                                                onClick={() => handleReengage(customer.id)}
                                                                data-testid={`reengage-${customer.id}`}
                                                            >
                                                                <MessageSquare className="w-3 h-3 mr-1" /> Re-engage
                                                            </Button>
                                                        )}
                                                        <Button 
                                                            size="sm" 
                                                            variant="ghost"
                                                            onClick={() => handleViewCustomer(customer.id)}
                                                            data-testid={`view-${customer.id}`}
                                                        >
                                                            <Eye className="w-4 h-4" />
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                        
                        {/* Mobile Cards */}
                        <div className="lg:hidden p-4 space-y-3">
                            {loading ? (
                                [...Array(3)].map((_, i) => (
                                    <Card key={i} className="animate-pulse">
                                        <CardContent className="p-4">
                                            <div className="h-24 bg-gray-200 rounded"></div>
                                        </CardContent>
                                    </Card>
                                ))
                            ) : customers.length === 0 ? (
                                <div className="text-center text-gray-500 py-8">
                                    <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                                    <p>No customers found</p>
                                </div>
                            ) : (
                                customers.map((customer) => (
                                    <Card key={customer.id} className="shadow-sm border border-gray-100">
                                        <CardContent className="p-4">
                                            <div className="flex justify-between items-start mb-3">
                                                <div>
                                                    <p className="font-medium text-gray-900">{customer.name || "—"}</p>
                                                    <p className="text-xs text-gray-500">{customer.phone}</p>
                                                </div>
                                                <StageBadge stage={customer.stage} />
                                            </div>
                                            <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                                                <div className="bg-gray-50 p-2 rounded">
                                                    <span className="text-gray-500">Last Visit</span>
                                                    <p className="font-semibold">
                                                        {customer.last_visit ? new Date(customer.last_visit).toLocaleDateString() : "Never"}
                                                    </p>
                                                </div>
                                                <div className="bg-gray-50 p-2 rounded">
                                                    <span className="text-gray-500">Visits</span>
                                                    <p className="font-semibold">{customer.total_visits || 0}</p>
                                                </div>
                                                <div className="bg-gray-50 p-2 rounded">
                                                    <span className="text-gray-500">Spent</span>
                                                    <p className="font-semibold">₹{(customer.total_spent || 0).toLocaleString()}</p>
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                {(customer.stage === "at_risk" || customer.stage === "dormant" || customer.stage === "churned") && (
                                                    <Button 
                                                        size="sm" 
                                                        className="flex-1 bg-[#F26B33] hover:bg-[#D85A2A]"
                                                        onClick={() => handleReengage(customer.id)}
                                                    >
                                                        <MessageSquare className="w-3 h-3 mr-1" /> Re-engage
                                                    </Button>
                                                )}
                                                <Button 
                                                    size="sm" 
                                                    variant="outline"
                                                    onClick={() => handleViewCustomer(customer.id)}
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </ResponsiveLayout>
    );
}
