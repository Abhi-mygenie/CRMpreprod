/**
 * FilterDrawer Component - Customer filter slide-down modal
 */
import { useState } from "react";
import { 
    Filter, ChevronDown, X, Save, Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export function FilterDrawer({ 
    isOpen, 
    onClose, 
    filters, 
    setFilters, 
    expandedFilterGroups, 
    setExpandedFilterGroups,
    onSaveSegment,
    onResetFilters
}) {
    if (!isOpen) return null;

    const toggleFilterGroup = (group) => {
        setExpandedFilterGroups(prev => 
            prev.includes(group) 
                ? prev.filter(g => g !== group)
                : [...prev, group]
        );
    };

    return (
        <div className="fixed inset-0 z-[10000]" data-testid="filter-drawer">
            {/* Backdrop */}
            <div 
                className="absolute inset-0 bg-black/50" 
                onClick={onClose}
            />
            
            {/* Slide-down Panel */}
            <div className="absolute top-0 left-0 right-0 bg-white rounded-b-2xl max-h-[90vh] flex flex-col animate-slide-down shadow-2xl" style={{ overscrollBehavior: 'contain' }}>
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b">
                    <div className="flex items-center gap-2">
                        <Filter className="w-4 h-4 text-[#F26B33]" />
                        <h2 className="font-semibold text-[#1A1A1A]">Filters</h2>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                {/* Filter Content */}
                <div className="flex-1 overflow-y-auto px-3 py-2" style={{ overscrollBehavior: 'contain' }}>
                    <div className="space-y-3">
                        {/* === BASIC SECTION === */}
                        <div data-testid="filter-section-basic">
                            <button
                                onClick={() => toggleFilterGroup("basic")}
                                className="flex items-center justify-between w-full px-2.5 py-2 rounded-lg bg-[#E5E5E5] hover:bg-[#D9D9D9] transition-colors"
                                data-testid="filter-toggle-basic"
                            >
                                <span className="text-xs font-bold text-[#1A1A1A] uppercase tracking-wider">Basic</span>
                                <ChevronDown className={`w-3.5 h-3.5 text-gray-600 transition-transform duration-200 ${expandedFilterGroups.includes("basic") ? "rotate-180" : ""}`} />
                            </button>
                            
                            {expandedFilterGroups.includes("basic") && (
                                <div className="space-y-2.5 pt-2.5 pb-1.5">
                                    {/* Tier + Type */}
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <Label className="text-[10px] text-[#71717A] uppercase font-medium">Tier</Label>
                                            <Select value={filters.tier} onValueChange={(v) => setFilters({...filters, tier: v})}>
                                                <SelectTrigger className="h-8 text-xs">
                                                    <SelectValue placeholder="All" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="all">All</SelectItem>
                                                    <SelectItem value="bronze">Bronze</SelectItem>
                                                    <SelectItem value="silver">Silver</SelectItem>
                                                    <SelectItem value="gold">Gold</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <Label className="text-[10px] text-[#71717A] uppercase font-medium">Type</Label>
                                            <Select value={filters.customer_type} onValueChange={(v) => setFilters({...filters, customer_type: v})}>
                                                <SelectTrigger className="h-8 text-xs">
                                                    <SelectValue placeholder="All" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="all">All</SelectItem>
                                                    <SelectItem value="normal">Normal</SelectItem>
                                                    <SelectItem value="vip">VIP</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    
                                    {/* City + Inactive */}
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <Label className="text-[10px] text-[#71717A] uppercase font-medium">City</Label>
                                            <Input 
                                                value={filters.city} 
                                                onChange={(e) => setFilters({...filters, city: e.target.value})}
                                                placeholder="Any"
                                                className="h-8 text-xs"
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-[10px] text-[#71717A] uppercase font-medium">Inactive</Label>
                                            <Select value={filters.last_visit_days} onValueChange={(v) => setFilters({...filters, last_visit_days: v})}>
                                                <SelectTrigger className="h-8 text-xs">
                                                    <SelectValue placeholder="All" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="all">All</SelectItem>
                                                    <SelectItem value="7">7+ days</SelectItem>
                                                    <SelectItem value="15">15+ days</SelectItem>
                                                    <SelectItem value="30">30+ days</SelectItem>
                                                    <SelectItem value="60">60+ days</SelectItem>
                                                    <SelectItem value="90">90+ days</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    {/* Sort By + Order */}
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <Label className="text-[10px] text-[#71717A] uppercase font-medium">Sort By</Label>
                                            <Select value={filters.sort_by} onValueChange={(v) => setFilters({...filters, sort_by: v})}>
                                                <SelectTrigger className="h-8 text-xs">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="created_at">Date Added</SelectItem>
                                                    <SelectItem value="last_visit">Last Visit</SelectItem>
                                                    <SelectItem value="total_spent">Total Spent</SelectItem>
                                                    <SelectItem value="total_points">Total Points</SelectItem>
                                                    <SelectItem value="total_visits">Total Visits</SelectItem>
                                                    <SelectItem value="name">Name</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <Label className="text-[10px] text-[#71717A] uppercase font-medium">Order</Label>
                                            <Select value={filters.sort_order} onValueChange={(v) => setFilters({...filters, sort_order: v})}>
                                                <SelectTrigger className="h-8 text-xs">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="desc">Descending</SelectItem>
                                                    <SelectItem value="asc">Ascending</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* === ADVANCED SECTION === */}
                        <div data-testid="filter-section-advanced">
                            <button
                                onClick={() => toggleFilterGroup("advanced")}
                                className="flex items-center justify-between w-full px-2.5 py-2 rounded-lg bg-[#F8F8F8] hover:bg-[#F0F0F0] transition-colors"
                                data-testid="filter-toggle-advanced"
                            >
                                <span className="text-xs font-bold text-[#1A1A1A] uppercase tracking-wider">Advanced</span>
                                <ChevronDown className={`w-3.5 h-3.5 text-gray-500 transition-transform duration-200 ${expandedFilterGroups.includes("advanced") ? "rotate-180" : ""}`} />
                            </button>
                            
                            {expandedFilterGroups.includes("advanced") && (
                                <div className="space-y-2.5 pt-2.5 pb-1.5">
                                    {/* Visits + Spent */}
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <Label className="text-[10px] text-[#71717A] uppercase font-medium">Visits</Label>
                                            <Select value={filters.total_visits} onValueChange={(v) => setFilters({...filters, total_visits: v})}>
                                                <SelectTrigger className="h-8 text-xs">
                                                    <SelectValue placeholder="All" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="all">All</SelectItem>
                                                    <SelectItem value="0">0</SelectItem>
                                                    <SelectItem value="1-5">1-5</SelectItem>
                                                    <SelectItem value="6-10">6-10</SelectItem>
                                                    <SelectItem value="10+">10+</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <Label className="text-[10px] text-[#71717A] uppercase font-medium">Spent</Label>
                                            <Select value={filters.total_spent} onValueChange={(v) => setFilters({...filters, total_spent: v})}>
                                                <SelectTrigger className="h-8 text-xs">
                                                    <SelectValue placeholder="All" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="all">All</SelectItem>
                                                    <SelectItem value="0-500">₹0-500</SelectItem>
                                                    <SelectItem value="500-2000">₹500-2K</SelectItem>
                                                    <SelectItem value="2000-5000">₹2K-5K</SelectItem>
                                                    <SelectItem value="5000-10000">₹5K-10K</SelectItem>
                                                    <SelectItem value="10000+">₹10K+</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    {/* Gender + Source */}
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <Label className="text-[10px] text-[#71717A] uppercase font-medium">Gender</Label>
                                            <Select value={filters.gender} onValueChange={(v) => setFilters({...filters, gender: v})}>
                                                <SelectTrigger className="h-8 text-xs">
                                                    <SelectValue placeholder="All" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="all">All</SelectItem>
                                                    <SelectItem value="male">Male</SelectItem>
                                                    <SelectItem value="female">Female</SelectItem>
                                                    <SelectItem value="other">Other</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <Label className="text-[10px] text-[#71717A] uppercase font-medium">Source</Label>
                                            <Select value={filters.lead_source} onValueChange={(v) => setFilters({...filters, lead_source: v})}>
                                                <SelectTrigger className="h-8 text-xs">
                                                    <SelectValue placeholder="All" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="all">All</SelectItem>
                                                    <SelectItem value="walk-in">Walk-in</SelectItem>
                                                    <SelectItem value="online">Online</SelectItem>
                                                    <SelectItem value="referral">Referral</SelectItem>
                                                    <SelectItem value="campaign">Campaign</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    {/* WhatsApp + VIP */}
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <Label className="text-[10px] text-[#71717A] uppercase font-medium">WhatsApp</Label>
                                            <Select value={filters.whatsapp_opt_in} onValueChange={(v) => setFilters({...filters, whatsapp_opt_in: v})}>
                                                <SelectTrigger className="h-8 text-xs">
                                                    <SelectValue placeholder="All" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="all">All</SelectItem>
                                                    <SelectItem value="true">Opted In</SelectItem>
                                                    <SelectItem value="false">Not Opted In</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <Label className="text-[10px] text-[#71717A] uppercase font-medium">VIP</Label>
                                            <Select value={filters.vip_flag} onValueChange={(v) => setFilters({...filters, vip_flag: v})}>
                                                <SelectTrigger className="h-8 text-xs">
                                                    <SelectValue placeholder="All" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="all">All</SelectItem>
                                                    <SelectItem value="true">VIP Only</SelectItem>
                                                    <SelectItem value="false">Non-VIP</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    {/* Birthday + Anniversary Toggles */}
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="flex items-center justify-between bg-gray-50 px-2 py-1.5 rounded">
                                            <Label className="text-[10px] text-[#71717A] uppercase font-medium">Birthday this month</Label>
                                            <Switch 
                                                checked={filters.has_birthday_this_month}
                                                onCheckedChange={(v) => setFilters({...filters, has_birthday_this_month: v})}
                                                className="scale-75"
                                            />
                                        </div>
                                        <div className="flex items-center justify-between bg-gray-50 px-2 py-1.5 rounded">
                                            <Label className="text-[10px] text-[#71717A] uppercase font-medium">Anniversary</Label>
                                            <Switch 
                                                checked={filters.has_anniversary_this_month}
                                                onCheckedChange={(v) => setFilters({...filters, has_anniversary_this_month: v})}
                                                className="scale-75"
                                            />
                                        </div>
                                    </div>

                                    {/* Blacklist + Complaint */}
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <Label className="text-[10px] text-[#71717A] uppercase font-medium">Blacklist</Label>
                                            <Select value={filters.blacklist_flag} onValueChange={(v) => setFilters({...filters, blacklist_flag: v})}>
                                                <SelectTrigger className="h-8 text-xs">
                                                    <SelectValue placeholder="All" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="all">All</SelectItem>
                                                    <SelectItem value="true">Blacklisted</SelectItem>
                                                    <SelectItem value="false">Not Blacklisted</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <Label className="text-[10px] text-[#71717A] uppercase font-medium">Complaint</Label>
                                            <Select value={filters.complaint_flag} onValueChange={(v) => setFilters({...filters, complaint_flag: v})}>
                                                <SelectTrigger className="h-8 text-xs">
                                                    <SelectValue placeholder="All" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="all">All</SelectItem>
                                                    <SelectItem value="true">Has Complaints</SelectItem>
                                                    <SelectItem value="false">No Complaints</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    {/* Feedback */}
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <Label className="text-[10px] text-[#71717A] uppercase font-medium">Feedback</Label>
                                            <Select value={filters.has_feedback} onValueChange={(v) => setFilters({...filters, has_feedback: v})}>
                                                <SelectTrigger className="h-8 text-xs">
                                                    <SelectValue placeholder="All" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="all">All</SelectItem>
                                                    <SelectItem value="true">Given Feedback</SelectItem>
                                                    <SelectItem value="false">No Feedback</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-3 py-3 border-t bg-gray-50 flex gap-2">
                    <Button 
                        variant="outline" 
                        className="flex-1 h-9 text-xs"
                        onClick={onResetFilters}
                        data-testid="reset-filters-btn"
                    >
                        Reset
                    </Button>
                    <Button 
                        className="flex-1 h-9 text-xs bg-[#329937] hover:bg-[#2a7d2e]"
                        onClick={onSaveSegment}
                        data-testid="save-segment-btn"
                    >
                        <Save className="w-3.5 h-3.5 mr-1" /> Save Segment
                    </Button>
                    <Button 
                        className="flex-1 h-9 text-xs bg-[#F26B33] hover:bg-[#D85A2A]"
                        onClick={onClose}
                        data-testid="apply-filters-btn"
                    >
                        <Check className="w-3.5 h-3.5 mr-1" /> Apply
                    </Button>
                </div>
            </div>
        </div>
    );
}

export default FilterDrawer;
