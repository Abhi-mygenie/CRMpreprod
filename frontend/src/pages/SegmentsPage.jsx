import { useState, useEffect } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { toast } from "sonner";
import { MessageSquare, Settings, Search, Phone, Check, Edit2, Trash2, Eye, Calendar, Filter, Clock, Save, Wallet, Pause, Play, Send } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const SegmentsPageContent = () => {
    const { api } = useAuth();
    const navigate = useNavigate();
    const [segments, setSegments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedSegment, setSelectedSegment] = useState(null);
    const [showSendMessage, setShowSendMessage] = useState(false);
    const [messageTemplate, setMessageTemplate] = useState("");
    const [selectedCampaign, setSelectedCampaign] = useState("");
    const [showEditDialog, setShowEditDialog] = useState(false);
    const [editingSegment, setEditingSegment] = useState(null);
    const [segmentName, setSegmentName] = useState("");
    const [templateVariables, setTemplateVariables] = useState({});
    const [sendOption, setSendOption] = useState("now");
    const [scheduledDate, setScheduledDate] = useState("");
    const [scheduledTime, setScheduledTime] = useState("10:00");
    const [recurringFrequency, setRecurringFrequency] = useState("daily");
    const [recurringDays, setRecurringDays] = useState([]);
    const [recurringDayOfMonth, setRecurringDayOfMonth] = useState("1");
    const [recurringEndOption, setRecurringEndOption] = useState("never");
    const [recurringEndDate, setRecurringEndDate] = useState("");
    const [recurringOccurrences, setRecurringOccurrences] = useState("10");
    const [templates, setTemplates] = useState([]);
    const [templatesLoading, setTemplatesLoading] = useState(false);
    const [totalCustomersCount, setTotalCustomersCount] = useState(0);
    const [segmentTemplateVariableMappings, setSegmentTemplateVariableMappings] = useState({});
    const [segmentSampleData, setSegmentSampleData] = useState({});
    const [segmentTemplateVariableModes, setSegmentTemplateVariableModes] = useState({});
    const [variableModes, setVariableModes] = useState({});
    const [whatsappConfigs, setWhatsappConfigs] = useState({});
    const [segmentFilter, setSegmentFilter] = useState("all");

    // Sample campaigns - in real app, fetch from API
    const campaigns = [
        { id: "new_year", name: "New Year Sale 2026" },
        { id: "weekend_special", name: "Weekend Special" },
        { id: "loyalty_boost", name: "Loyalty Boost" },
        { id: "win_back", name: "Win-back Campaign" },
        { id: "birthday_club", name: "Birthday Club" }
    ];

    // Available database fields for variable mapping (same as Automation tab)
    const availableFields = [
        { key: "customer_name", label: "Customer Name", example: "John Doe" },
        { key: "phone", label: "Phone Number", example: "+91 98765 43210" },
        { key: "points_balance", label: "Points Balance", example: "500" },
        { key: "points_earned", label: "Points Earned", example: "50" },
        { key: "points_redeemed", label: "Points Redeemed", example: "100" },
        { key: "wallet_balance", label: "Wallet Balance", example: "₹250" },
        { key: "amount", label: "Amount", example: "₹1,500" },
        { key: "tier", label: "Tier", example: "Gold" },
        { key: "restaurant_name", label: "Restaurant Name", example: "Demo Restaurant" },
        { key: "coupon_code", label: "Coupon Code", example: "SAVE20" },
        { key: "expiry_date", label: "Expiry Date", example: "31 Mar 2026" },
        { key: "order_id", label: "Order ID", example: "ORD-12345" },
        { key: "visit_count", label: "Visit Count", example: "15" }
    ];

    // Fetch templates from API
    const fetchTemplates = async () => {
        setTemplatesLoading(true);
        try {
            // Fetch templates, variable mappings, and sample data in parallel
            const [templatesRes, mappingsRes, sampleRes] = await Promise.all([
                api.get("/whatsapp/authkey-templates"),
                api.get("/whatsapp/template-variable-map"),
                api.get("/customers/sample-data")
            ]);
            
            const authkeyTemplates = templatesRes.data.templates || [];
            // Transform authkey templates to match expected format
            const formattedTemplates = authkeyTemplates.map(tpl => ({
                id: tpl.wid?.toString() || tpl.id,
                name: tpl.temp_name || tpl.name,
                message: tpl.temp_body || tpl.message || "",
                variables: (tpl.temp_body?.match(/\{\{\d+\}\}/g) || []).filter((v, i, a) => a.indexOf(v) === i),
                mediaType: tpl.media_type || null,
                mediaUrl: tpl.media_url || null
            }));
            setTemplates(formattedTemplates);
            
            // Process variable mappings and modes
            const mappingsObj = {};
            const modesObj = {};
            (mappingsRes.data.mappings || []).forEach(m => {
                mappingsObj[m.template_id] = m.mappings || {};
                modesObj[m.template_id] = m.modes || {};
            });
            setSegmentTemplateVariableMappings(mappingsObj);
            setSegmentTemplateVariableModes(modesObj);
            
            // Load sample customer data
            const sample = sampleRes.data.sample || {};
            sample.restaurant_name = sampleRes.data.restaurant_name || "";
            setSegmentSampleData(sample);
        } catch (err) {
            console.error("Failed to fetch templates:", err);
            setTemplates([]);
        } finally {
            setTemplatesLoading(false);
        }
    };
    
    // Helper: Check if all template variables are mapped
    const isSegmentTemplateFullyMapped = (template) => {
        // If no variables in template, it's considered fully mapped
        if (!template.variables || template.variables.length === 0) return true;
        
        // Get mappings for this template
        const mappings = segmentTemplateVariableMappings[template.id] || {};
        
        // Check if ALL variables have a non-empty mapping
        return template.variables.every(v => {
            const mapping = mappings[v];
            return mapping && mapping.trim() !== "";
        });
    };

    // Fetch templates when modal opens
    useEffect(() => {
        if (showSendMessage) {
            fetchTemplates();
        }
    }, [showSendMessage]);

    // Get current selected template
    const currentTemplate = templates.find(t => t.id === messageTemplate);

    // Generate preview with filled variables
    const getPreviewMessage = () => {
        if (!currentTemplate) return "";
        let preview = currentTemplate.message;
        // Replace static variables
        preview = preview.replace(/\{\{name\}\}/g, "John Doe");
        preview = preview.replace(/\{\{points\}\}/g, "500");
        // Replace dynamic variables with user input
        Object.keys(templateVariables).forEach(key => {
            preview = preview.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), templateVariables[key] || `[${key}]`);
        });
        return preview;
    };

    // Handle template change - reset variables and modes
    const handleTemplateChange = (templateId) => {
        setMessageTemplate(templateId);
        const template = templates.find(t => t.id === templateId);
        if (template?.variables) {
            const initialVars = {};
            const initialModes = {};
            template.variables.forEach(v => { 
                initialVars[v] = ""; 
                initialModes[v] = "map"; // Default to map mode
            });
            setTemplateVariables(initialVars);
            setVariableModes(initialModes);
        } else {
            setTemplateVariables({});
            setVariableModes({});
        }
    };

    useEffect(() => {
        fetchSegments();
    }, []);

    const fetchSegments = async () => {
        try {
            const [segmentsRes, statsRes, configsRes] = await Promise.all([
                api.get('/segments'),
                api.get('/customers/segments/stats'),
                api.get('/segments/whatsapp-configs/all')
            ]);
            setSegments(segmentsRes.data);
            // Get total customers count from stats endpoint
            const totalCount = statsRes.data.total || 0;
            setTotalCustomersCount(totalCount);
            // Build a map of segment_id -> config
            const configsMap = {};
            (configsRes.data.configs || []).forEach(cfg => {
                configsMap[cfg.segment_id] = cfg;
            });
            setWhatsappConfigs(configsMap);
        } catch (err) {
            toast.error("Failed to load segments");
        } finally {
            setLoading(false);
        }
    };

    const deleteSegment = async (segmentId) => {
        try {
            await api.delete(`/segments/${segmentId}`);
            toast.success("Segment deleted");
            fetchSegments();
        } catch (err) {
            toast.error("Failed to delete segment");
        }
    };

    // Save WhatsApp config for a segment
    const saveWhatsappConfig = async (segmentId) => {
        const currentTpl = templates.find(t => t.id === messageTemplate);
        if (!currentTpl) return;
        
        const configData = {
            template_id: messageTemplate,
            template_name: currentTpl.name,
            variable_mappings: templateVariables,
            variable_modes: variableModes,
            schedule_type: sendOption,
            scheduled_date: scheduledDate || null,
            scheduled_time: scheduledTime,
            recurring_frequency: sendOption === "recurring" ? recurringFrequency : null,
            recurring_days: recurringDays,
            recurring_day_of_month: recurringDayOfMonth,
            recurring_end_option: recurringEndOption,
            recurring_end_date: recurringEndDate || null,
            recurring_occurrences: recurringOccurrences
        };
        
        try {
            await api.post(`/segments/${segmentId}/whatsapp-config`, configData);
            // Update local state
            setWhatsappConfigs(prev => ({
                ...prev,
                [segmentId]: { ...configData, segment_id: segmentId, is_active: true }
            }));
            return true;
        } catch (err) {
            console.error("Failed to save WhatsApp config:", err);
            return false;
        }
    };

    // Remove WhatsApp config from a segment
    const removeWhatsappConfig = async (segmentId) => {
        if (!window.confirm("Permanently delete WhatsApp automation for this segment?")) return;
        
        try {
            await api.delete(`/segments/${segmentId}/whatsapp-config`);
            toast.success("WhatsApp automation deleted");
            setWhatsappConfigs(prev => {
                const newConfigs = { ...prev };
                delete newConfigs[segmentId];
                return newConfigs;
            });
        } catch (err) {
            toast.error("Failed to delete automation");
        }
    };

    // Toggle (pause/resume) WhatsApp config for a segment
    const toggleWhatsappConfig = async (segmentId) => {
        const currentConfig = whatsappConfigs[segmentId];
        const isCurrentlyActive = currentConfig?.is_active !== false;
        
        try {
            const res = await api.patch(`/segments/${segmentId}/whatsapp-config/toggle`);
            toast.success(res.data.message);
            setWhatsappConfigs(prev => ({
                ...prev,
                [segmentId]: { ...prev[segmentId], is_active: res.data.is_active }
            }));
        } catch (err) {
            toast.error("Failed to toggle automation");
        }
    };

    // Get schedule description for display
    const getScheduleDescription = (config) => {
        if (!config) return "";
        
        if (config.schedule_type === "now") {
            return "Send immediately";
        } else if (config.schedule_type === "scheduled") {
            const date = config.scheduled_date ? new Date(config.scheduled_date).toLocaleDateString() : "";
            return `Scheduled: ${date} at ${config.scheduled_time}`;
        } else if (config.schedule_type === "recurring") {
            const freq = config.recurring_frequency;
            if (freq === "daily") {
                return `Daily at ${config.scheduled_time}`;
            } else if (freq === "weekly") {
                const days = (config.recurring_days || []).join(", ");
                return `Weekly (${days}) at ${config.scheduled_time}`;
            } else if (freq === "monthly") {
                return `Monthly (${config.recurring_day_of_month}th) at ${config.scheduled_time}`;
            }
        }
        return "";
    };

    const updateSegment = async () => {
        if (!segmentName.trim()) {
            toast.error("Please enter a segment name");
            return;
        }

        try {
            await api.put(`/segments/${editingSegment.id}`, {
                name: segmentName
            });
            toast.success("Segment updated");
            setShowEditDialog(false);
            setEditingSegment(null);
            setSegmentName("");
            fetchSegments();
        } catch (err) {
            toast.error("Failed to update segment");
        }
    };

    const viewSegmentCustomers = async (segment) => {
        setSelectedSegment(segment);
        try {
            // For "All Customers" segment, fetch all customers
            if (segment.id === "all-customers") {
                const res = await api.get('/customers?limit=500');
                setSelectedSegment({...segment, customers: res.data.customers || res.data});
            } else {
                const res = await api.get(`/segments/${segment.id}/customers`);
                setSelectedSegment({...segment, customers: res.data});
            }
        } catch (err) {
            toast.error("Failed to load customers");
        }
    };

    // Default "All Customers" segment
    const allCustomersSegment = {
        id: "all-customers",
        name: "All Customers",
        customer_count: totalCustomersCount,
        created_at: null, // No creation date for default segment
        filters: {},
        isDefault: true
    };

    // Combined segments list with "All Customers" at top
    const allSegments = [allCustomersSegment, ...segments];

    if (loading) {
        return (
                <div className="p-4 max-w-lg mx-auto">
                    <div className="flex items-center justify-center h-64">
                        <p className="text-[#52525B]">Loading segments...</p>
                    </div>
                </div>
        );
    }

    // Count active WhatsApp configs
    const activeConfigsCount = Object.values(whatsappConfigs).filter(c => c?.is_active !== false).length;
    const notConfiguredCount = allSegments.length - Object.keys(whatsappConfigs).length;
    
    // Filtered segments based on filter
    const filteredSegments = allSegments.filter(segment => {
        const hasConfig = !!whatsappConfigs[segment.id];
        const isConfigActive = hasConfig && whatsappConfigs[segment.id].is_active !== false;
        
        if (segmentFilter === "active") return isConfigActive;
        if (segmentFilter === "not_configured") return !hasConfig;
        return true; // "all"
    });

    return (
            <div className="p-4 max-w-lg mx-auto" data-testid="segments-page">
                {/* Info Card */}
                <Card className="rounded-xl border-0 shadow-sm bg-[#25D366]/5 mb-4">
                    <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                            <MessageSquare className="w-5 h-5 text-[#25D366] mt-0.5" />
                            <div>
                                <h3 className="font-semibold text-[#1A1A1A]">Customer Segments</h3>
                                <p className="text-sm text-[#52525B]">
                                    Create segments and configure WhatsApp automation for targeted messaging.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Filter Tabs */}
                <div className="flex gap-2 mb-4 border-b border-gray-200 pb-3">
                    <button
                        onClick={() => setSegmentFilter("all")}
                        className={`px-3 py-1.5 text-sm font-medium rounded-full transition-colors ${
                            segmentFilter === "all" 
                                ? "bg-[#1A1A1A] text-white" 
                                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                        data-testid="filter-all-segments"
                    >
                        All ({allSegments.length})
                    </button>
                    <button
                        onClick={() => setSegmentFilter("active")}
                        className={`px-3 py-1.5 text-sm font-medium rounded-full transition-colors ${
                            segmentFilter === "active" 
                                ? "bg-[#25D366] text-white" 
                                : "bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20"
                        }`}
                        data-testid="filter-active-segments"
                    >
                        Active ({activeConfigsCount})
                    </button>
                    <button
                        onClick={() => setSegmentFilter("not_configured")}
                        className={`px-3 py-1.5 text-sm font-medium rounded-full transition-colors ${
                            segmentFilter === "not_configured" 
                                ? "bg-gray-500 text-white" 
                                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                        data-testid="filter-not-configured-segments"
                    >
                        Not Configured ({notConfiguredCount})
                    </button>
                </div>

                {/* Segments List */}
                <div className="space-y-3" data-testid="segments-list">
                    {filteredSegments.length === 0 ? (
                        <Card className="rounded-xl">
                            <CardContent className="p-8 text-center">
                                <p className="text-[#52525B]">No segments match this filter</p>
                            </CardContent>
                        </Card>
                    ) : filteredSegments.map(segment => {
                        const hasConfig = !!whatsappConfigs[segment.id];
                        const isConfigActive = hasConfig && whatsappConfigs[segment.id].is_active !== false;
                        
                        return (
                            <Card 
                                key={segment.id} 
                                className={`rounded-xl hover:shadow-md transition-shadow ${hasConfig && isConfigActive ? 'border-l-4 border-l-[#25D366]' : ''}`}
                                data-testid={`segment-card-${segment.id}`}
                            >
                                <CardContent className="p-4">
                                    {/* Row 1: Segment name, description & badge - matching WhatsApp Automation style */}
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <svg className={`w-4 h-4 ${hasConfig && isConfigActive ? 'text-[#25D366]' : 'text-gray-400'}`} viewBox="0 0 24 24" fill="currentColor">
                                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                                                </svg>
                                                <h3 className="font-semibold text-[#1A1A1A]" data-testid={`segment-name-${segment.id}`}>
                                                    {segment.name}
                                                </h3>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        viewSegmentCustomers(segment);
                                                    }}
                                                    className="text-gray-400 hover:text-[#F26B33] p-0.5 rounded transition-colors"
                                                    title="View customers"
                                                    data-testid={`view-segment-inline-${segment.id}`}
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </button>
                                                {!segment.isDefault && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setEditingSegment(segment);
                                                            setSegmentName(segment.name);
                                                            setShowEditDialog(true);
                                                        }}
                                                        className="text-gray-400 hover:text-[#F26B33] p-0.5 rounded transition-colors"
                                                        title="Edit segment name"
                                                        data-testid={`edit-segment-inline-${segment.id}`}
                                                    >
                                                        <Edit2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                                {!segment.isDefault && (
                                                    <AlertDialog>
                                                        <AlertDialogTrigger asChild>
                                                            <button
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="text-gray-400 hover:text-red-500 p-0.5 rounded transition-colors"
                                                                title="Delete segment"
                                                                data-testid={`delete-segment-inline-${segment.id}`}
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </AlertDialogTrigger>
                                                        <AlertDialogContent>
                                                            <AlertDialogHeader>
                                                                <AlertDialogTitle>Delete Segment?</AlertDialogTitle>
                                                                <AlertDialogDescription>
                                                                    Are you sure you want to delete "{segment.name}"? This action cannot be undone.
                                                                </AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <AlertDialogFooter>
                                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                                <AlertDialogAction 
                                                                    onClick={() => deleteSegment(segment.id)} 
                                                                    className="bg-red-600 hover:bg-red-700"
                                                                >
                                                                    Delete
                                                                </AlertDialogAction>
                                                            </AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    </AlertDialog>
                                                )}
                                                <Badge className={`${hasConfig ? (isConfigActive ? 'bg-[#25D366]' : 'bg-amber-500') : 'bg-gray-400'} text-white text-xs`}>
                                                    {hasConfig ? (isConfigActive ? "Active" : "Paused") : "Not Configured"}
                                                </Badge>
                                            </div>
                                            <p className="text-xs text-[#52525B] ml-6">
                                                {segment.isDefault 
                                                    ? "Includes all customers in your database" 
                                                    : `${segment.customer_count} customers in this segment`}
                                            </p>
                                        </div>
                                    </div>
                                    
                                    {/* Filter Tags - only for non-default segments */}
                                    {!segment.isDefault && segment.filters && Object.keys(segment.filters).length > 0 && (
                                        <div className="flex flex-wrap gap-1.5 mb-3 ml-6">
                                            {segment.filters.tier && segment.filters.tier !== "all" && (
                                                <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">
                                                    Tier: {segment.filters.tier}
                                                </span>
                                            )}
                                            {segment.filters.city && (
                                                <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">
                                                    City: {segment.filters.city}
                                                </span>
                                            )}
                                            {segment.filters.customer_type && segment.filters.customer_type !== "all" && (
                                                <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">
                                                    Type: {segment.filters.customer_type}
                                                </span>
                                            )}
                                            {segment.filters.last_visit_days && segment.filters.last_visit_days !== "all" && (
                                                <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">
                                                    Inactive: {segment.filters.last_visit_days}+ days
                                                </span>
                                            )}
                                            {segment.filters.total_visits && segment.filters.total_visits !== "all" && (
                                                <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">
                                                    Visits: {segment.filters.total_visits}
                                                </span>
                                            )}
                                            {segment.filters.total_spent && segment.filters.total_spent !== "all" && (
                                                <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">
                                                    Spent: {segment.filters.total_spent}
                                                </span>
                                            )}
                                            {segment.filters.search && (
                                                <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">
                                                    Search: {segment.filters.search}
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    {/* WhatsApp Configuration Status - matching WhatsApp Automation style */}
                                    {hasConfig ? (
                                        <div className={`rounded-lg p-3 mb-3 border ${
                                            isConfigActive 
                                                ? 'bg-[#25D366]/10 border-[#25D366]/20' 
                                                : 'bg-gray-100 border-gray-300'
                                        }`}>
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <svg className={`w-4 h-4 ${isConfigActive ? 'text-[#25D366]' : 'text-gray-400'}`} viewBox="0 0 24 24" fill="currentColor">
                                                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                                                        </svg>
                                                        <span className={`text-sm font-medium ${isConfigActive ? 'text-[#25D366]' : 'text-gray-500'}`}>
                                                            WhatsApp Template
                                                        </span>
                                                        {!isConfigActive && (
                                                            <Badge variant="outline" className="text-xs bg-gray-200 text-gray-600">Paused</Badge>
                                                        )}
                                                    </div>
                                                    <p className={`text-xs ml-6 ${isConfigActive ? 'text-gray-700' : 'text-gray-500'}`}>
                                                        <span className="font-medium">Template:</span> {whatsappConfigs[segment.id].template_name}
                                                    </p>
                                                    <p className={`text-xs ml-6 ${isConfigActive ? 'text-gray-600' : 'text-gray-400'}`}>
                                                        <span className="font-medium">Schedule:</span> {getScheduleDescription(whatsappConfigs[segment.id])}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    {/* Pause/Resume Button */}
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            toggleWhatsappConfig(segment.id);
                                                        }}
                                                        className={`p-1.5 rounded transition-colors ${
                                                            isConfigActive 
                                                                ? 'text-gray-500 hover:text-amber-600 hover:bg-amber-50' 
                                                                : 'text-[#25D366] hover:text-[#20BD5A] hover:bg-[#25D366]/10'
                                                        }`}
                                                        title={isConfigActive ? "Pause automation" : "Resume automation"}
                                                        data-testid={`toggle-whatsapp-${segment.id}`}
                                                    >
                                                        {isConfigActive ? (
                                                            <Pause className="w-4 h-4" />
                                                        ) : (
                                                            <Play className="w-4 h-4" />
                                                        )}
                                                    </button>
                                                    {/* Delete Button */}
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            removeWhatsappConfig(segment.id);
                                                        }}
                                                        className="text-gray-400 hover:text-red-500 p-1.5 rounded transition-colors hover:bg-red-50"
                                                        title="Delete automation"
                                                        data-testid={`delete-whatsapp-${segment.id}`}
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="bg-gray-50 rounded-lg p-3 mb-3 border border-gray-200">
                                            <div className="flex items-center gap-2 text-gray-500">
                                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <circle cx="12" cy="12" r="10"/>
                                                </svg>
                                                <span className="text-xs">No WhatsApp template configured for this segment</span>
                                            </div>
                                        </div>
                                    )}

                                    {/* Action Buttons - Configure only */}
                                    <div className="flex gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                viewSegmentCustomers(segment);
                                                setShowSendMessage(true);
                                            }}
                                            className="flex-1 h-9"
                                            data-testid={`configure-segment-${segment.id}`}
                                        >
                                            <Settings className="w-4 h-4 mr-1" />
                                            {hasConfig ? "Edit" : "Configure"}
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>

                {/* View Customers Modal */}
                {selectedSegment && !showSendMessage && (
                    <Dialog open={true} onOpenChange={() => setSelectedSegment(null)}>
                        <DialogContent className="max-w-md mx-4 rounded-2xl max-h-[80vh] overflow-hidden flex flex-col">
                            <DialogHeader>
                                <DialogTitle className="font-['Montserrat']">Customers in "{selectedSegment.name}"</DialogTitle>
                                <DialogDescription>
                                    {selectedSegment.customer_count} customers match this segment
                                </DialogDescription>
                            </DialogHeader>
                            <div className="flex-1 overflow-y-auto max-h-[50vh]" style={{ overscrollBehavior: 'contain' }}>
                                {selectedSegment.customers ? (
                                    <div className="space-y-2 pr-2">
                                        {selectedSegment.customers.length === 0 ? (
                                            <p className="text-center text-[#52525B] py-4">No customers in this segment</p>
                                        ) : (
                                            selectedSegment.customers.map(customer => (
                                                <button
                                                    key={customer.id}
                                                    onClick={() => {
                                                        setSelectedSegment(null);
                                                        navigate(`/customers/${customer.id}`);
                                                    }}
                                                    className="w-full p-3 bg-gray-50 rounded-xl flex items-center justify-between hover:bg-gray-100 transition-colors text-left"
                                                    data-testid={`segment-customer-${customer.id}`}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <Avatar className="w-9 h-9">
                                                            <AvatarFallback className="bg-[#329937]/10 text-[#329937] text-sm font-semibold">
                                                                {customer.name.charAt(0)}
                                                            </AvatarFallback>
                                                        </Avatar>
                                                        <div>
                                                            <p className="font-medium text-[#1A1A1A] text-sm">{customer.name}</p>
                                                            <p className="text-xs text-[#52525B]">{customer.phone}</p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-sm font-medium text-[#F26B33]">{customer.total_points} pts</p>
                                                        <Badge variant="outline" className={`tier-badge ${customer.tier.toLowerCase()} text-xs`}>
                                                            {customer.tier}
                                                        </Badge>
                                                    </div>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                ) : (
                                    <p className="text-center text-[#52525B] py-8">Loading customers...</p>
                                )}
                            </div>
                        </DialogContent>
                    </Dialog>
                )}

                {/* Send Message Modal */}
                {showSendMessage && selectedSegment && (
                    <Dialog open={true} onOpenChange={() => {
                        setShowSendMessage(false);
                        setSelectedSegment(null);
                        setSelectedCampaign("");
                        setMessageTemplate("");
                        setTemplateVariables({});
                        setVariableModes({});
                        setSendOption("now");
                        setScheduledDate("");
                        setScheduledTime("10:00");
                        setRecurringFrequency("daily");
                        setRecurringDays([]);
                        setRecurringDayOfMonth("1");
                        setRecurringEndOption("never");
                        setRecurringEndDate("");
                        setRecurringOccurrences("10");
                    }}>
                        <DialogContent className="max-w-lg mx-4 rounded-2xl max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                                <DialogTitle className="font-['Montserrat'] flex items-center gap-2">
                                    <svg className="w-5 h-5 text-[#25D366]" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                                    </svg>
                                    Send WhatsApp Message
                                </DialogTitle>
                                <DialogDescription>
                                    Send to {selectedSegment.customer_count} customers in "{selectedSegment.name}"
                                </DialogDescription>
                            </DialogHeader>

                            <div className="space-y-4">
                                {/* Template Dropdown */}
                                <div>
                                    <Label className="text-sm font-medium">Choose Template</Label>
                                    <Select value={messageTemplate} onValueChange={handleTemplateChange} disabled={templatesLoading}>
                                        <SelectTrigger className="h-11 rounded-xl mt-1" data-testid="template-select">
                                            <SelectValue placeholder={templatesLoading ? "Loading templates..." : "Select a template..."} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {templatesLoading ? (
                                                <div className="p-4 text-center text-sm text-gray-500">
                                                    Loading templates...
                                                </div>
                                            ) : templates.filter(t => isSegmentTemplateFullyMapped(t)).length === 0 ? (
                                                <div className="p-4 text-center text-sm text-gray-500">
                                                    No templates available. Please map variables in WhatsApp Settings.
                                                </div>
                                            ) : (
                                                templates.filter(t => isSegmentTemplateFullyMapped(t)).map(template => (
                                                    <SelectItem key={template.id} value={template.id}>
                                                        <div className="flex items-center gap-2">
                                                            {template.mediaType === "image" && <span>🖼️</span>}
                                                            {template.mediaType === "video" && <span>🎬</span>}
                                                            {!template.mediaType && <span>📝</span>}
                                                            {template.name}
                                                        </div>
                                                    </SelectItem>
                                                ))
                                            )}
                                        </SelectContent>
                                    </Select>
                                    {templates.length > 0 && (
                                        <p className="text-xs text-gray-500 mt-1">{templates.filter(t => isSegmentTemplateFullyMapped(t)).length} of {templates.length} templates ready to use</p>
                                    )}
                                </div>

                                {/* Template Preview - Shown immediately after template selection */}
                                {messageTemplate && currentTemplate && (
                                    <div className="rounded-xl border overflow-hidden bg-[#E5DDD5]">
                                        <div className="p-3">
                                            <p className="text-xs font-medium text-[#52525B] mb-2 bg-white/80 rounded px-2 py-1 inline-block">
                                                📱 Message Preview
                                            </p>
                                            
                                            {/* WhatsApp Style Message Bubble */}
                                            <div className="bg-[#DCF8C6] rounded-lg p-3 shadow-sm">
                                                {/* Media Preview */}
                                                {currentTemplate?.mediaType === "image" && currentTemplate.mediaUrl && (
                                                    <div className="mb-2 rounded-lg overflow-hidden">
                                                        <img 
                                                            src={currentTemplate.mediaUrl} 
                                                            alt="Template media" 
                                                            className="w-full h-32 object-cover"
                                                        />
                                                    </div>
                                                )}
                                                {currentTemplate?.mediaType === "video" && currentTemplate.mediaUrl && (
                                                    <div className="mb-2 rounded-lg overflow-hidden bg-black relative">
                                                        <div className="w-full h-24 flex items-center justify-center bg-gray-900">
                                                            <div className="text-center text-white">
                                                                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-1">
                                                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                                                        <path d="M8 5v14l11-7z"/>
                                                                    </svg>
                                                                </div>
                                                                <p className="text-xs">Video</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                                
                                                {/* Message Text */}
                                                <p className="text-sm text-gray-800 whitespace-pre-wrap">
                                                    {(() => {
                                                        const mappings = segmentTemplateVariableMappings[currentTemplate.id] || {};
                                                        const modes = segmentTemplateVariableModes[currentTemplate.id] || {};
                                                        const templateBody = currentTemplate.message || "";
                                                        const varRegex = /\{\{\d+\}\}/g;
                                                        let match;
                                                        let lastIndex = 0;
                                                        const parts = [];
                                                        while ((match = varRegex.exec(templateBody)) !== null) {
                                                            if (match.index > lastIndex) {
                                                                parts.push({ type: "text", value: templateBody.slice(lastIndex, match.index) });
                                                            }
                                                            const varKey = match[0];
                                                            const mappedField = mappings[varKey];
                                                            const mode = modes[varKey] || "map";
                                                            if (mappedField && mappedField !== "none") {
                                                                const sampleValue = mode === "text" ? mappedField : segmentSampleData[mappedField];
                                                                if (sampleValue && String(sampleValue).trim() !== "") {
                                                                    parts.push({ type: "data", value: String(sampleValue) });
                                                                } else {
                                                                    parts.push({ type: "na", value: "NA" });
                                                                }
                                                            } else {
                                                                parts.push({ type: "var", value: varKey });
                                                            }
                                                            lastIndex = match.index + match[0].length;
                                                        }
                                                        if (lastIndex < templateBody.length) {
                                                            parts.push({ type: "text", value: templateBody.slice(lastIndex) });
                                                        }
                                                        return parts.map((part, idx) => {
                                                            if (part.type === "na") return <span key={idx} className="text-red-500 font-medium">NA</span>;
                                                            return <span key={idx}>{part.value}</span>;
                                                        });
                                                    })()}
                                                </p>
                                                
                                                {/* Timestamp */}
                                                <div className="flex items-center justify-end gap-1 mt-1">
                                                    <span className="text-[10px] text-gray-500">
                                                        {new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                    </span>
                                                    <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
                                                        <path d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17 7.48 12l-1.41 1.41L11.66 19l12-12-1.42-1.41zM.41 13.41L6 19l1.41-1.41L1.83 12 .41 13.41z"/>
                                                    </svg>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}




                                {/* Scheduling Options */}
                                <div className="space-y-4 border-t pt-4">
                                    <Label className="text-sm font-medium flex items-center gap-2">
                                        <Clock className="w-4 h-4" />
                                        When to Send
                                    </Label>
                                    
                                    {/* Send Option Radio Buttons */}
                                    <div className="space-y-2">
                                        <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-gray-50 transition-colors" data-testid="send-now-option">
                                            <input
                                                type="radio"
                                                name="sendOption"
                                                value="now"
                                                checked={sendOption === "now"}
                                                onChange={(e) => setSendOption(e.target.value)}
                                                className="w-4 h-4 text-[#25D366] focus:ring-[#25D366]"
                                            />
                                            <div>
                                                <p className="font-medium text-sm">Send Now</p>
                                                <p className="text-xs text-gray-500">Send immediately (one-time)</p>
                                            </div>
                                        </label>
                                        
                                        <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-gray-50 transition-colors" data-testid="schedule-option">
                                            <input
                                                type="radio"
                                                name="sendOption"
                                                value="scheduled"
                                                checked={sendOption === "scheduled"}
                                                onChange={(e) => setSendOption(e.target.value)}
                                                className="w-4 h-4 text-[#25D366] focus:ring-[#25D366]"
                                            />
                                            <div>
                                                <p className="font-medium text-sm">Schedule for Later</p>
                                                <p className="text-xs text-gray-500">Send on a specific date & time</p>
                                            </div>
                                        </label>
                                        
                                        <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-gray-50 transition-colors" data-testid="recurring-option">
                                            <input
                                                type="radio"
                                                name="sendOption"
                                                value="recurring"
                                                checked={sendOption === "recurring"}
                                                onChange={(e) => setSendOption(e.target.value)}
                                                className="w-4 h-4 text-[#25D366] focus:ring-[#25D366]"
                                            />
                                            <div>
                                                <p className="font-medium text-sm">Recurring</p>
                                                <p className="text-xs text-gray-500">Send daily, weekly, or monthly</p>
                                            </div>
                                        </label>
                                    </div>

                                    {/* Scheduled Date/Time Picker */}
                                    {sendOption === "scheduled" && (
                                        <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <Label className="text-xs text-gray-600 flex items-center gap-1">
                                                        <Calendar className="w-3 h-3" /> Date
                                                    </Label>
                                                    <Input
                                                        type="date"
                                                        value={scheduledDate}
                                                        onChange={(e) => setScheduledDate(e.target.value)}
                                                        min={new Date().toISOString().split('T')[0]}
                                                        className="h-10 rounded-lg mt-1"
                                                        data-testid="scheduled-date"
                                                    />
                                                </div>
                                                <div>
                                                    <Label className="text-xs text-gray-600 flex items-center gap-1">
                                                        <Clock className="w-3 h-3" /> Time
                                                    </Label>
                                                    <Input
                                                        type="time"
                                                        value={scheduledTime}
                                                        onChange={(e) => setScheduledTime(e.target.value)}
                                                        className="h-10 rounded-lg mt-1"
                                                        data-testid="scheduled-time"
                                                    />
                                                </div>
                                            </div>
                                            {scheduledDate && scheduledTime && (
                                                <p className="text-xs text-[#25D366] font-medium">
                                                    📅 Scheduled for: {new Date(`${scheduledDate}T${scheduledTime}`).toLocaleString()}
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    {/* Recurring Options */}
                                    {sendOption === "recurring" && (
                                        <div className="bg-gray-50 rounded-xl p-4 space-y-4">
                                            {/* Frequency Selection */}
                                            <div>
                                                <Label className="text-xs text-gray-600 mb-2 block">Frequency</Label>
                                                <div className="flex gap-2">
                                                    {[
                                                        { value: "daily", label: "Daily" },
                                                        { value: "weekly", label: "Weekly" },
                                                        { value: "monthly", label: "Monthly" }
                                                    ].map(freq => (
                                                        <button
                                                            key={freq.value}
                                                            type="button"
                                                            onClick={() => setRecurringFrequency(freq.value)}
                                                            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                                                                recurringFrequency === freq.value
                                                                    ? "bg-[#25D366] text-white"
                                                                    : "bg-white border hover:bg-gray-100"
                                                            }`}
                                                            data-testid={`freq-${freq.value}`}
                                                        >
                                                            {freq.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Weekly Day Selection */}
                                            {recurringFrequency === "weekly" && (
                                                <div>
                                                    <Label className="text-xs text-gray-600 mb-2 block">Select Days</Label>
                                                    <div className="flex gap-1 flex-wrap">
                                                        {[
                                                            { value: "mon", label: "Mon" },
                                                            { value: "tue", label: "Tue" },
                                                            { value: "wed", label: "Wed" },
                                                            { value: "thu", label: "Thu" },
                                                            { value: "fri", label: "Fri" },
                                                            { value: "sat", label: "Sat" },
                                                            { value: "sun", label: "Sun" }
                                                        ].map(day => (
                                                            <button
                                                                key={day.value}
                                                                type="button"
                                                                onClick={() => {
                                                                    setRecurringDays(prev => 
                                                                        prev.includes(day.value)
                                                                            ? prev.filter(d => d !== day.value)
                                                                            : [...prev, day.value]
                                                                    );
                                                                }}
                                                                className={`w-10 h-10 rounded-full text-xs font-medium transition-colors ${
                                                                    recurringDays.includes(day.value)
                                                                        ? "bg-[#25D366] text-white"
                                                                        : "bg-white border hover:bg-gray-100"
                                                                }`}
                                                                data-testid={`day-${day.value}`}
                                                            >
                                                                {day.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Monthly Day Selection */}
                                            {recurringFrequency === "monthly" && (
                                                <div>
                                                    <Label className="text-xs text-gray-600 mb-1">Day of Month</Label>
                                                    <Select value={recurringDayOfMonth} onValueChange={setRecurringDayOfMonth}>
                                                        <SelectTrigger className="h-10 rounded-lg" data-testid="day-of-month">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                                                                <SelectItem key={day} value={day.toString()}>
                                                                    {day === 1 ? "1st" : day === 2 ? "2nd" : day === 3 ? "3rd" : `${day}th`} of each month
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            )}

                                            {/* Time Selection */}
                                            <div>
                                                <Label className="text-xs text-gray-600 flex items-center gap-1 mb-1">
                                                    <Clock className="w-3 h-3" /> Send Time
                                                </Label>
                                                <Input
                                                    type="time"
                                                    value={scheduledTime}
                                                    onChange={(e) => setScheduledTime(e.target.value)}
                                                    className="h-10 rounded-lg"
                                                    data-testid="recurring-time"
                                                />
                                            </div>

                                            {/* End Condition */}
                                            <div>
                                                <Label className="text-xs text-gray-600 mb-2 block">Ends</Label>
                                                <div className="space-y-2">
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input
                                                            type="radio"
                                                            name="endOption"
                                                            value="never"
                                                            checked={recurringEndOption === "never"}
                                                            onChange={(e) => setRecurringEndOption(e.target.value)}
                                                            className="w-4 h-4 text-[#25D366]"
                                                        />
                                                        <span className="text-sm">Never</span>
                                                    </label>
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input
                                                            type="radio"
                                                            name="endOption"
                                                            value="date"
                                                            checked={recurringEndOption === "date"}
                                                            onChange={(e) => setRecurringEndOption(e.target.value)}
                                                            className="w-4 h-4 text-[#25D366]"
                                                        />
                                                        <span className="text-sm">On date</span>
                                                        {recurringEndOption === "date" && (
                                                            <Input
                                                                type="date"
                                                                value={recurringEndDate}
                                                                onChange={(e) => setRecurringEndDate(e.target.value)}
                                                                min={new Date().toISOString().split('T')[0]}
                                                                className="h-8 rounded-lg ml-2 w-40"
                                                                data-testid="end-date"
                                                            />
                                                        )}
                                                    </label>
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input
                                                            type="radio"
                                                            name="endOption"
                                                            value="occurrences"
                                                            checked={recurringEndOption === "occurrences"}
                                                            onChange={(e) => setRecurringEndOption(e.target.value)}
                                                            className="w-4 h-4 text-[#25D366]"
                                                        />
                                                        <span className="text-sm">After</span>
                                                        {recurringEndOption === "occurrences" && (
                                                            <>
                                                                <Input
                                                                    type="number"
                                                                    value={recurringOccurrences}
                                                                    onChange={(e) => setRecurringOccurrences(e.target.value)}
                                                                    min="1"
                                                                    max="100"
                                                                    className="h-8 rounded-lg w-16 text-center"
                                                                    data-testid="occurrences"
                                                                />
                                                                <span className="text-sm">occurrences</span>
                                                            </>
                                                        )}
                                                    </label>
                                                </div>
                                            </div>

                                            {/* Summary */}
                                            <div className="bg-white rounded-lg p-3 border">
                                                <p className="text-xs text-[#25D366] font-medium">
                                                    🔄 {recurringFrequency === "daily" && `Every day at ${scheduledTime}`}
                                                    {recurringFrequency === "weekly" && `Every ${recurringDays.length > 0 ? recurringDays.join(", ") : "..."} at ${scheduledTime}`}
                                                    {recurringFrequency === "monthly" && `On the ${recurringDayOfMonth}${recurringDayOfMonth === "1" ? "st" : recurringDayOfMonth === "2" ? "nd" : recurringDayOfMonth === "3" ? "rd" : "th"} of each month at ${scheduledTime}`}
                                                    {recurringEndOption === "date" && recurringEndDate && ` until ${new Date(recurringEndDate).toLocaleDateString()}`}
                                                    {recurringEndOption === "occurrences" && ` for ${recurringOccurrences} times`}
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                                    <p className="text-xs text-amber-800">
                                        <strong>⚠️ Coming Soon:</strong> WhatsApp Business API integration is in development.
                                    </p>
                                </div>

                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        onClick={() => {
                                            setShowSendMessage(false);
                                            setSelectedSegment(null);
                                            setSelectedCampaign("");
                                            setMessageTemplate("");
                                            setTemplateVariables({});
                                            setVariableModes({});
                                            setSendOption("now");
                                            setScheduledDate("");
                                            setScheduledTime("10:00");
                                            setRecurringFrequency("daily");
                                            setRecurringDays([]);
                                            setRecurringDayOfMonth("1");
                                            setRecurringEndOption("never");
                                            setRecurringEndDate("");
                                            setRecurringOccurrences("10");
                                        }}
                                        className="flex-1 rounded-xl"
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        onClick={async () => {
                                            // Save the WhatsApp config
                                            const saved = await saveWhatsappConfig(selectedSegment.id);
                                            
                                            const scheduleInfo = sendOption === "now" 
                                                ? "Automation configured!" 
                                                : sendOption === "scheduled" 
                                                    ? `Scheduled for ${new Date(`${scheduledDate}T${scheduledTime}`).toLocaleString()}`
                                                    : `Recurring ${recurringFrequency}`;
                                            
                                            if (saved) {
                                                toast.success(`WhatsApp automation saved! ${scheduleInfo}`);
                                            } else {
                                                toast.error("Failed to save automation");
                                            }
                                            
                                            setShowSendMessage(false);
                                            setSelectedSegment(null);
                                            setSelectedCampaign("");
                                            setMessageTemplate("");
                                            setTemplateVariables({});
                                            setVariableModes({});
                                            setSendOption("now");
                                            setScheduledDate("");
                                            setScheduledTime("10:00");
                                            setRecurringFrequency("daily");
                                            setRecurringDays([]);
                                            setRecurringDayOfMonth("1");
                                            setRecurringEndOption("never");
                                            setRecurringEndDate("");
                                            setRecurringOccurrences("10");
                                        }}
                                        className="flex-1 bg-[#25D366] hover:bg-[#20BD5A] rounded-xl"
                                        disabled={
                                            !messageTemplate || 
                                            (sendOption === "scheduled" && !scheduledDate) ||
                                            (sendOption === "recurring" && recurringFrequency === "weekly" && recurringDays.length === 0)
                                        }
                                        data-testid="send-message-btn"
                                    >
                                        {sendOption === "now" ? (
                                            <>
                                                <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
                                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                                                </svg>
                                                Send Now
                                            </>
                                        ) : (
                                            <>
                                                <Calendar className="w-4 h-4 mr-2" />
                                                {sendOption === "scheduled" ? "Schedule Message" : "Set Recurring"}
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </div>
                        </DialogContent>
                    </Dialog>
                )}

                {/* Edit Segment Modal */}
                {showEditDialog && editingSegment && (
                    <Dialog open={true} onOpenChange={() => setShowEditDialog(false)}>
                        <DialogContent className="max-w-sm mx-4 rounded-2xl">
                            <DialogHeader>
                                <DialogTitle className="font-['Montserrat']">Edit Segment</DialogTitle>
                                <DialogDescription>Update the segment name</DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4">
                                <div>
                                    <Label className="text-sm font-medium">Segment Name</Label>
                                    <Input
                                        type="text"
                                        value={segmentName}
                                        onChange={(e) => setSegmentName(e.target.value)}
                                        className="h-11 rounded-xl mt-1"
                                        placeholder="Enter segment name"
                                        data-testid="edit-segment-name-input"
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        onClick={() => {
                                            setShowEditDialog(false);
                                            setEditingSegment(null);
                                            setSegmentName("");
                                        }}
                                        className="flex-1 rounded-xl"
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        onClick={updateSegment}
                                        className="flex-1 bg-[#F26B33] hover:bg-[#D85A2A] rounded-xl"
                                        data-testid="save-segment-btn"
                                    >
                                        Save
                                    </Button>
                                </div>
                            </div>
                        </DialogContent>
                    </Dialog>
                )}
            </div>
    );
}


export function SegmentsPage() {
    return <Navigate to="/customers" />;
}
