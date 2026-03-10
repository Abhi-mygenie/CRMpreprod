import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { 
    BarChart3, TrendingUp, Users, ArrowUpDown, Search, 
    Filter, Download, RefreshCw, ChevronUp, ChevronDown
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

// Stats card component
const StatsCard = ({ icon: Icon, label, value, suffix = "", color }) => (
    <Card className="bg-white shadow-sm border border-gray-100">
        <CardContent className="p-4">
            <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
                    <Icon className="w-5 h-5 text-white" />
                </div>
                <div>
                    <p className="text-2xl font-bold text-gray-900">{value}{suffix}</p>
                    <p className="text-xs text-gray-500">{label}</p>
                </div>
            </div>
        </CardContent>
    </Card>
);

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

export default function ItemAnalyticsPage() {
    const { api } = useAuth();
    
    // State
    const [items, setItems] = useState([]);
    const [categories, setCategories] = useState([]);
    const [summary, setSummary] = useState({ total_items: 0, avg_repeat_rate: 0 });
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({
        time_period: "all",
        category: "all",
        search: ""
    });
    const [sortBy, setSortBy] = useState("repeat_rate");
    const [sortOrder, setSortOrder] = useState("desc");
    
    // Fetch data
    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                time_period: filters.time_period,
                sort_by: sortBy,
                sort_order: sortOrder,
                limit: "100"
            });
            
            if (filters.category && filters.category !== "all") {
                params.append("category", filters.category);
            }
            if (filters.search) {
                params.append("search", filters.search);
            }
            
            const res = await api.get(`/analytics/item-performance?${params.toString()}`);
            setItems(res.data.items || []);
            setCategories(res.data.categories || []);
            setSummary(res.data.summary || { total_items: 0, avg_repeat_rate: 0 });
        } catch (err) {
            console.error("Failed to fetch item analytics:", err);
            toast.error("Failed to load item analytics");
        } finally {
            setLoading(false);
        }
    }, [api, filters, sortBy, sortOrder]);
    
    useEffect(() => {
        fetchData();
    }, [fetchData]);
    
    // Handle sort
    const handleSort = (field) => {
        if (sortBy === field) {
            setSortOrder(sortOrder === "desc" ? "asc" : "desc");
        } else {
            setSortBy(field);
            setSortOrder("desc");
        }
    };
    
    // Handle filter change
    const handleFilterChange = (key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };
    
    // Export to CSV
    const handleExport = async () => {
        try {
            const res = await api.get(`/analytics/item-performance/export?time_period=${filters.time_period}`);
            const { headers, rows } = res.data;
            
            // Create CSV content
            const csvContent = [
                headers.join(","),
                ...rows.map(row => row.join(","))
            ].join("\n");
            
            // Download
            const blob = new Blob([csvContent], { type: "text/csv" });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `item-analytics-${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
            window.URL.revokeObjectURL(url);
            
            toast.success("Export downloaded successfully");
        } catch (err) {
            toast.error("Failed to export data");
        }
    };
    
    // Repeat rate color based on value
    const getRepeatRateColor = (rate) => {
        if (rate >= 50) return "text-green-600 bg-green-50";
        if (rate >= 40) return "text-blue-600 bg-blue-50";
        if (rate >= 30) return "text-yellow-600 bg-yellow-50";
        return "text-gray-600 bg-gray-50";
    };
    
    return (
        <ResponsiveLayout>
            <div className="p-4 lg:p-6 xl:p-8 max-w-[1600px] mx-auto">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                    <div>
                        <h1 className="text-2xl lg:text-3xl font-bold text-[#1A1A1A] font-['Georgia']" data-testid="item-analytics-title">
                            Item Analytics
                        </h1>
                        <p className="text-gray-500 text-sm mt-1">Track item performance and customer repeat behavior</p>
                    </div>
                    <div className="flex gap-2">
                        <Button 
                            variant="outline" 
                            size="sm"
                            onClick={fetchData}
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
                
                {/* Summary Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <StatsCard 
                        icon={BarChart3} 
                        label="Total Items" 
                        value={summary.total_items} 
                        color="bg-gray-500" 
                    />
                    <StatsCard 
                        icon={TrendingUp} 
                        label="Avg Repeat Rate" 
                        value={summary.avg_repeat_rate} 
                        suffix="%" 
                        color="bg-[#F26B33]" 
                    />
                    <StatsCard 
                        icon={Users} 
                        label="High Performers" 
                        value={items.filter(i => i.repeat_rate >= 50).length} 
                        suffix=" items" 
                        color="bg-green-500" 
                    />
                    <StatsCard 
                        icon={ArrowUpDown} 
                        label="Categories" 
                        value={categories.length} 
                        color="bg-blue-500" 
                    />
                </div>
                
                {/* Filters */}
                <Card className="mb-4 shadow-sm border border-gray-100">
                    <CardContent className="p-3">
                        <div className="flex flex-wrap gap-3 items-center">
                            {/* Time Period */}
                            <Select 
                                value={filters.time_period} 
                                onValueChange={(v) => handleFilterChange("time_period", v)}
                            >
                                <SelectTrigger data-testid="filter-time-period" className="w-[130px]">
                                    <SelectValue placeholder="Time Period" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Time</SelectItem>
                                    <SelectItem value="7d">Last 7 Days</SelectItem>
                                    <SelectItem value="30d">Last 30 Days</SelectItem>
                                    <SelectItem value="90d">Last 90 Days</SelectItem>
                                </SelectContent>
                            </Select>
                            
                            {/* Category */}
                            <Select 
                                value={filters.category} 
                                onValueChange={(v) => handleFilterChange("category", v)}
                            >
                                <SelectTrigger data-testid="filter-category" className="w-[150px]">
                                    <SelectValue placeholder="Category" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Categories</SelectItem>
                                    {categories.map(cat => (
                                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            
                            {/* Search */}
                            <div className="relative flex-1 min-w-[200px]">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <Input 
                                    placeholder="Search item name..."
                                    value={filters.search}
                                    onChange={(e) => handleFilterChange("search", e.target.value)}
                                    className="pl-9"
                                    data-testid="filter-search"
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>
                
                {/* Data Table - Desktop */}
                <div className="hidden lg:block">
                    <Card className="shadow-sm border border-gray-100 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left" data-testid="item-analytics-table">
                                <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b">
                                    <tr>
                                        <th className="px-4 py-3 w-[30%]">Item</th>
                                        <SortableHeader 
                                            label="Total Orders" 
                                            field="total_orders" 
                                            currentSort={sortBy} 
                                            currentOrder={sortOrder} 
                                            onSort={handleSort} 
                                        />
                                        <SortableHeader 
                                            label="Repeat Orders" 
                                            field="repeat_orders" 
                                            currentSort={sortBy} 
                                            currentOrder={sortOrder} 
                                            onSort={handleSort} 
                                        />
                                        <SortableHeader 
                                            label="Repeat Rate (%)" 
                                            field="repeat_rate" 
                                            currentSort={sortBy} 
                                            currentOrder={sortOrder} 
                                            onSort={handleSort} 
                                        />
                                        <SortableHeader 
                                            label="Unique Customers" 
                                            field="unique_customers" 
                                            currentSort={sortBy} 
                                            currentOrder={sortOrder} 
                                            onSort={handleSort} 
                                        />
                                        <SortableHeader 
                                            label="Return Visits" 
                                            field="return_visits" 
                                            currentSort={sortBy} 
                                            currentOrder={sortOrder} 
                                            onSort={handleSort} 
                                        />
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        [...Array(8)].map((_, i) => (
                                            <tr key={i} className="border-b">
                                                <td colSpan={6} className="px-4 py-4">
                                                    <div className="h-6 bg-gray-200 rounded animate-pulse"></div>
                                                </td>
                                            </tr>
                                        ))
                                    ) : items.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                                                <BarChart3 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                                                <p>No item data found</p>
                                                <p className="text-xs mt-1">Try adjusting your filters</p>
                                            </td>
                                        </tr>
                                    ) : (
                                        items.map((item, idx) => (
                                            <tr 
                                                key={item.item_name} 
                                                className={`border-b hover:bg-gray-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}
                                                data-testid={`item-row-${idx}`}
                                            >
                                                <td className="px-4 py-3 font-medium text-gray-900">
                                                    {item.item_name}
                                                </td>
                                                <td className="px-4 py-3 text-gray-600">
                                                    {item.total_orders.toLocaleString()}
                                                </td>
                                                <td className="px-4 py-3 text-gray-600">
                                                    {item.repeat_orders.toLocaleString()}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getRepeatRateColor(item.repeat_rate)}`}>
                                                        {item.repeat_rate}%
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-gray-600">
                                                    {item.unique_customers.toLocaleString()}
                                                </td>
                                                <td className="px-4 py-3 text-gray-600">
                                                    {item.return_visits.toLocaleString()}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </div>
                
                {/* Data Cards - Mobile */}
                <div className="lg:hidden space-y-3">
                    {loading ? (
                        [...Array(5)].map((_, i) => (
                            <Card key={i} className="animate-pulse">
                                <CardContent className="p-4">
                                    <div className="h-24 bg-gray-200 rounded"></div>
                                </CardContent>
                            </Card>
                        ))
                    ) : items.length === 0 ? (
                        <Card>
                            <CardContent className="p-8 text-center text-gray-500">
                                <BarChart3 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                                <p>No item data found</p>
                            </CardContent>
                        </Card>
                    ) : (
                        items.map((item, idx) => (
                            <Card key={item.item_name} className="shadow-sm border border-gray-100">
                                <CardContent className="p-4">
                                    <div className="flex justify-between items-start mb-3">
                                        <h3 className="font-medium text-gray-900 text-sm">{item.item_name}</h3>
                                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getRepeatRateColor(item.repeat_rate)}`}>
                                            {item.repeat_rate}%
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div className="bg-gray-50 p-2 rounded">
                                            <span className="text-gray-500">Total Orders</span>
                                            <p className="font-semibold text-gray-900">{item.total_orders}</p>
                                        </div>
                                        <div className="bg-gray-50 p-2 rounded">
                                            <span className="text-gray-500">Repeat Orders</span>
                                            <p className="font-semibold text-gray-900">{item.repeat_orders}</p>
                                        </div>
                                        <div className="bg-gray-50 p-2 rounded">
                                            <span className="text-gray-500">Unique Customers</span>
                                            <p className="font-semibold text-gray-900">{item.unique_customers}</p>
                                        </div>
                                        <div className="bg-gray-50 p-2 rounded">
                                            <span className="text-gray-500">Return Visits</span>
                                            <p className="font-semibold text-gray-900">{item.return_visits}</p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))
                    )}
                </div>
                
                {/* Results count */}
                {!loading && items.length > 0 && (
                    <p className="text-xs text-gray-500 mt-4 text-center">
                        Showing {items.length} items • Sorted by {sortBy.replace('_', ' ')} ({sortOrder})
                    </p>
                )}
            </div>
        </ResponsiveLayout>
    );
}
