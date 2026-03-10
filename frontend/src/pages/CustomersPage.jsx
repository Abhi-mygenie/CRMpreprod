import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { 
    Users, Plus, Search, ChevronRight, Star, TrendingUp, Gift, Phone, User, Check,
    Edit2, Trash2, Building2, Calendar, MapPin, Filter, Clock, ChevronDown, Tag,
    ChevronLeft, Save, Layers, Wallet, Rocket, Cake, Heart, Utensils, MessageCircle,
    Flag, Crown, Leaf, ChevronUp, Home, Sparkles, X
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ResponsiveLayout } from "@/components/ResponsiveLayout";
import { ComingSoonOverlay } from "@/components/shared/ComingSoonOverlay";
import { COUNTRY_CODES, GENDER_OPTIONS, LANGUAGE_OPTIONS } from "@/lib/constants";

// Helper to format customer name (show NA for @mygenie.online emails)
const formatCustomerName = (name) => {
    if (!name) return "—";
    if (name.includes("@mygenie.online")) return "NA";
    return name;
};

// Helper to check if email should be shown
const shouldShowEmail = (email) => {
    if (!email) return false;
    if (email.includes("@mygenie")) return false;
    return true;
};

// Sortable column header component
const SortableHeader = ({ label, field, currentSort, currentOrder, onSort, align = "left" }) => {
    const isActive = currentSort === field;
    const alignClass = align === "center" ? "justify-center" : "justify-start";
    return (
        <th 
            className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors select-none ${align === "center" ? "text-center" : "text-left"}`}
            onClick={() => onSort(field)}
            data-testid={`sort-${field}`}
        >
            <div className={`flex items-center gap-1 ${alignClass}`}>
                <span>{label}</span>
                <div className="flex flex-col">
                    <ChevronUp className={`w-3 h-3 -mb-1 ${isActive && currentOrder === 'asc' ? 'text-[#F26B33]' : 'text-gray-300'}`} />
                    <ChevronDown className={`w-3 h-3 ${isActive && currentOrder === 'desc' ? 'text-[#F26B33]' : 'text-gray-300'}`} />
                </div>
            </div>
        </th>
    );
};

export default function CustomersPage() {
    const { api, isDemoMode } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [customers, setCustomers] = useState([]);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [showAddModal, setShowAddModal] = useState(location.state?.openAddModal || false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingCustomer, setEditingCustomer] = useState(null);
    const [showFilters, setShowFilters] = useState(location.state?.openFilters || false);
    const [segments, setSegments] = useState(null);
    const [filters, setFilters] = useState({
        tier: "all",
        customer_type: "all",
        last_visit_days: "all",
        city: "",
        sort_by: "created_at",
        sort_order: "desc",
        // New filters
        whatsapp_opt_in: "all",
        vip_flag: "all",
        diet_preference: "all",
        lead_source: "all",
        preferred_time_slot: "all",
        preferred_dining_type: "all",
        has_birthday_this_month: false,
        has_anniversary_this_month: false,
        total_visits: "all",
        blacklist_flag: "all",
        complaint_flag: "all",
        // Phase 3 filters
        gender: "all",
        total_spent: "all",
        is_blocked: "all",
        has_feedback: "all"
    });
    const [expandedFilterGroups, setExpandedFilterGroups] = useState(["basic", "advanced"]);
    const [newCustomer, setNewCustomer] = useState({ 
        // Basic Information
        name: "", 
        phone: "", 
        country_code: "+91",
        email: "", 
        gender: "",
        dob: "",
        anniversary: "",
        preferred_language: "",
        customer_type: "normal",
        segment_tags: [],
        
        // Contact & Marketing Permissions
        whatsapp_opt_in: false,
        promo_whatsapp_allowed: true,
        promo_sms_allowed: true,
        email_marketing_allowed: true,
        call_allowed: true,
        is_blocked: false,
        
        // Loyalty Information
        referral_code: "",
        referred_by: "",
        membership_id: "",
        membership_expiry: "",
        
        // Behavior & Preferences
        favorite_category: "",
        preferred_payment_mode: "",
        
        // Customer Source & Journey
        lead_source: "",
        campaign_source: "",
        assigned_salesperson: "",
        
        // WhatsApp CRM Tracking
        last_whatsapp_sent: "",
        last_whatsapp_response: "",
        last_campaign_clicked: "",
        last_coupon_used: "",
        automation_status_tag: "",
        
        // Corporate Information
        gst_name: "",
        gst_number: "",
        billing_address: "",
        credit_limit: "",
        payment_terms: "",
        
        // Address
        address: "",
        address_line_2: "",
        city: "",
        state: "",
        pincode: "",
        country: "",
        delivery_instructions: "",
        map_location: null,
        
        // Preferences
        allergies: [],
        favorites: [],
        
        // Dining Preferences
        preferred_dining_type: "",
        preferred_time_slot: "",
        favorite_table: "",
        avg_party_size: "",
        diet_preference: "",
        spice_level: "",
        cuisine_preference: "",
        
        // Special Occasions
        kids_birthday: [],
        spouse_name: "",
        festival_preference: [],
        special_dates: [],
        
        // Feedback & Flags
        last_rating: "",
        nps_score: "",
        complaint_flag: false,
        vip_flag: false,
        blacklist_flag: false,
        
        // AI/Advanced
        predicted_next_visit: "",
        churn_risk_score: "",
        recommended_offer_type: "",
        price_sensitivity_score: "",
        
        // Custom Fields
        custom_field_1: "",
        custom_field_2: "",
        custom_field_3: "",
        
        // Notes
        notes: ""
    });
    const [editData, setEditData] = useState({});
    const [submitting, setSubmitting] = useState(false);
    const [showSaveSegmentDialog, setShowSaveSegmentDialog] = useState(false);
    const [segmentName, setSegmentName] = useState("");
    const [savedSegments, setSavedSegments] = useState([]);
    const [selectedSegment, setSelectedSegment] = useState(null);

    const buildQueryString = () => {
        const params = new URLSearchParams();
        if (search) params.append("search", search);
        if (filters.tier && filters.tier !== "all") params.append("tier", filters.tier);
        if (filters.customer_type && filters.customer_type !== "all") params.append("customer_type", filters.customer_type);
        if (filters.last_visit_days && filters.last_visit_days !== "all") params.append("last_visit_days", filters.last_visit_days);
        if (filters.city) params.append("city", filters.city);
        if (filters.sort_by) params.append("sort_by", filters.sort_by);
        if (filters.sort_order) params.append("sort_order", filters.sort_order);
        // New filter params
        if (filters.whatsapp_opt_in && filters.whatsapp_opt_in !== "all") params.append("whatsapp_opt_in", filters.whatsapp_opt_in);
        if (filters.vip_flag && filters.vip_flag !== "all") params.append("vip_flag", filters.vip_flag);
        if (filters.diet_preference && filters.diet_preference !== "all") params.append("diet_preference", filters.diet_preference);
        if (filters.lead_source && filters.lead_source !== "all") params.append("lead_source", filters.lead_source);
        if (filters.preferred_time_slot && filters.preferred_time_slot !== "all") params.append("preferred_time_slot", filters.preferred_time_slot);
        if (filters.preferred_dining_type && filters.preferred_dining_type !== "all") params.append("preferred_dining_type", filters.preferred_dining_type);
        if (filters.has_birthday_this_month) params.append("has_birthday_this_month", "true");
        if (filters.has_anniversary_this_month) params.append("has_anniversary_this_month", "true");
        if (filters.total_visits && filters.total_visits !== "all") params.append("total_visits", filters.total_visits);
        if (filters.blacklist_flag && filters.blacklist_flag !== "all") params.append("blacklist_flag", filters.blacklist_flag);
        if (filters.complaint_flag && filters.complaint_flag !== "all") params.append("complaint_flag", filters.complaint_flag);
        // Phase 3 filters
        if (filters.gender && filters.gender !== "all") params.append("gender", filters.gender);
        if (filters.total_spent && filters.total_spent !== "all") params.append("total_spent", filters.total_spent);
        if (filters.is_blocked && filters.is_blocked !== "all") params.append("is_blocked", filters.is_blocked);
        if (filters.has_feedback && filters.has_feedback !== "all") params.append("has_feedback", filters.has_feedback);
        return params.toString();
    };

    const fetchCustomers = async () => {
        try {
            const queryString = buildQueryString();
            const res = await api.get(`/customers${queryString ? `?${queryString}` : ""}`);
            setCustomers(res.data);
        } catch (err) {
            toast.error("Failed to load customers");
        } finally {
            setLoading(false);
        }
    };

    // Handle column header sort click
    const handleSort = (field) => {
        if (filters.sort_by === field) {
            // Toggle sort order if same field
            setFilters(prev => ({
                ...prev,
                sort_order: prev.sort_order === "desc" ? "asc" : "desc"
            }));
        } else {
            // New field, default to descending
            setFilters(prev => ({
                ...prev,
                sort_by: field,
                sort_order: "desc"
            }));
        }
    };

    const syncFromMyGenie = async () => {
        setSyncing(true);
        try {
            const res = await api.post("/customers/sync-from-mygenie");
            toast.success(res.data.message || "Customers synced successfully!");
            await fetchCustomers(); // Refresh the list
        } catch (err) {
            toast.error(err.response?.data?.detail || "Failed to sync customers from MyGenie");
        } finally {
            setSyncing(false);
        }
    };

    const saveAsSegment = async () => {
        if (!segmentName.trim()) {
            toast.error("Please enter a segment name");
            return;
        }

        try {
            // Save ALL filter values (including "all")
            const segmentFilters = {
                tier: filters.tier,
                customer_type: filters.customer_type,
                last_visit_days: filters.last_visit_days,
                city: filters.city || "",
                total_visits: filters.total_visits,
                total_spent: filters.total_spent,
                diet_preference: filters.diet_preference,
                preferred_time_slot: filters.preferred_time_slot,
                preferred_dining_type: filters.preferred_dining_type,
                gender: filters.gender,
                lead_source: filters.lead_source,
                whatsapp_opt_in: filters.whatsapp_opt_in,
                vip_flag: filters.vip_flag,
                has_birthday_this_month: filters.has_birthday_this_month,
                has_anniversary_this_month: filters.has_anniversary_this_month,
                search: search || ""
            };

            await api.post('/segments', {
                name: segmentName,
                filters: segmentFilters,
                customer_count: customers.length  // Pass displayed count
            });

            toast.success(`Segment "${segmentName}" saved successfully!`);
            setShowSaveSegmentDialog(false);
            setShowFilters(false);
            setSegmentName("");
            fetchSegments();
        } catch (err) {
            toast.error("Failed to save segment");
        }
    };

    const loadSegment = async (segment) => {
        setSelectedSegment(segment);
        const segmentFilters = segment.filters;
        
        setFilters({
            tier: segmentFilters.tier || "all",
            customer_type: segmentFilters.customer_type || "all",
            last_visit_days: segmentFilters.last_visit_days || "all",
            city: segmentFilters.city || "",
            sort_by: "created_at",
            sort_order: "desc"
        });
        setSearch(segmentFilters.search || "");
    };

    const deleteSegment = async (segmentId) => {
        if (!window.confirm("Are you sure you want to delete this segment?")) return;
        
        try {
            await api.delete(`/segments/${segmentId}`);
            toast.success("Segment deleted");
            fetchSegments();
            if (selectedSegment?.id === segmentId) {
                setSelectedSegment(null);
            }
        } catch (err) {
            toast.error("Failed to delete segment");
        }
    };

    const fetchSegments = async () => {
        try {
            // Fetch segment stats for analytics
            const statsRes = await api.get("/customers/segments/stats");
            setSegments(statsRes.data);
            
            // Fetch saved segments for filtering
            const segmentsRes = await api.get('/segments');
            setSavedSegments(segmentsRes.data);
        } catch (err) {
            console.error("Failed to load segments:", err);
        }
    };

    useEffect(() => {
        fetchCustomers();
        fetchSegments();
    }, [search, filters]);

    // Lock body scroll when filter drawer is open
    useEffect(() => {
        if (showFilters) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [showFilters]);

    const handleAddCustomer = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const customerData = {
                name: newCustomer.name,
                phone: newCustomer.phone,
                country_code: newCustomer.country_code,
                email: newCustomer.email || null,
                gender: newCustomer.gender || null,
                dob: newCustomer.dob || null,
                anniversary: newCustomer.anniversary || null,
                preferred_language: newCustomer.preferred_language || null,
                customer_type: newCustomer.customer_type,
                // Corporate fields
                ...(newCustomer.customer_type === "corporate" && {
                    gst_name: newCustomer.gst_name || null,
                    gst_number: newCustomer.gst_number || null,
                    billing_address: newCustomer.billing_address || null,
                    credit_limit: newCustomer.credit_limit ? parseFloat(newCustomer.credit_limit) : null,
                    payment_terms: newCustomer.payment_terms || null,
                }),
                // Address fields
                address: newCustomer.address || null,
                address_line_2: newCustomer.address_line_2 || null,
                city: newCustomer.city || null,
                state: newCustomer.state || null,
                pincode: newCustomer.pincode || null,
                country: newCustomer.country || null,
                delivery_instructions: newCustomer.delivery_instructions || null,
                // Flags
                vip_flag: newCustomer.vip_flag || false,
                complaint_flag: newCustomer.complaint_flag || false,
                blacklist_flag: newCustomer.blacklist_flag || false,
            };
            await api.post("/customers", customerData);
            toast.success("Customer added!");
            setShowAddModal(false);
            resetForm();
            fetchCustomers();
            fetchSegments();
        } catch (err) {
            toast.error(err.response?.data?.detail || "Failed to add customer");
        } finally {
            setSubmitting(false);
        }
    };

    const resetForm = () => {
        setNewCustomer({ 
            // Basic Information
            name: "", phone: "", country_code: "+91", email: "",
            gender: "", dob: "", anniversary: "", preferred_language: "",
            customer_type: "normal", segment_tags: [],
            // Contact & Marketing Permissions
            whatsapp_opt_in: false, promo_whatsapp_allowed: true,
            promo_sms_allowed: true, email_marketing_allowed: true,
            call_allowed: true, is_blocked: false,
            // Loyalty Information
            referral_code: "", referred_by: "", membership_id: "", membership_expiry: "",
            // Behavior & Preferences
            favorite_category: "", preferred_payment_mode: "",
            // Customer Source & Journey
            lead_source: "", campaign_source: "", assigned_salesperson: "",
            // WhatsApp CRM Tracking
            last_whatsapp_sent: "", last_whatsapp_response: "", last_campaign_clicked: "",
            last_coupon_used: "", automation_status_tag: "",
            // Corporate Information
            gst_name: "", gst_number: "", billing_address: "", credit_limit: "", payment_terms: "",
            // Address
            address: "", address_line_2: "", city: "", state: "", pincode: "", country: "",
            delivery_instructions: "", map_location: null,
            // Preferences
            allergies: [], favorites: [],
            // Dining Preferences
            preferred_dining_type: "", preferred_time_slot: "", favorite_table: "",
            avg_party_size: "", diet_preference: "", spice_level: "", cuisine_preference: "",
            // Special Occasions
            kids_birthday: [], spouse_name: "", festival_preference: [], special_dates: [],
            // Feedback & Flags
            last_rating: "", nps_score: "", complaint_flag: false, vip_flag: false, blacklist_flag: false,
            // AI/Advanced
            predicted_next_visit: "", churn_risk_score: "", recommended_offer_type: "", price_sensitivity_score: "",
            // Custom Fields
            custom_field_1: "", custom_field_2: "", custom_field_3: "",
            // Notes
            notes: ""
        });
    };

    const clearFilters = () => {
        setFilters({
            tier: "all",
            customer_type: "all",
            last_visit_days: "all",
            city: "",
            sort_by: "created_at",
            sort_order: "desc",
            whatsapp_opt_in: "all",
            vip_flag: "all",
            diet_preference: "all",
            lead_source: "all",
            preferred_time_slot: "all",
            preferred_dining_type: "all",
            has_birthday_this_month: false,
            has_anniversary_this_month: false,
            total_visits: "all",
            blacklist_flag: "all",
            complaint_flag: "all",
            gender: "all",
            total_spent: "all",
            is_blocked: "all"
        });
    };

    const activeFiltersCount = [
        filters.tier !== "all" ? 1 : 0,
        filters.customer_type !== "all" ? 1 : 0,
        filters.last_visit_days !== "all" ? 1 : 0,
        filters.city ? 1 : 0,
        filters.whatsapp_opt_in !== "all" ? 1 : 0,
        filters.vip_flag !== "all" ? 1 : 0,
        filters.diet_preference !== "all" ? 1 : 0,
        filters.lead_source !== "all" ? 1 : 0,
        filters.preferred_time_slot !== "all" ? 1 : 0,
        filters.preferred_dining_type !== "all" ? 1 : 0,
        filters.has_birthday_this_month ? 1 : 0,
        filters.has_anniversary_this_month ? 1 : 0,
        filters.total_visits !== "all" ? 1 : 0,
        filters.blacklist_flag !== "all" ? 1 : 0,
        filters.complaint_flag !== "all" ? 1 : 0,
        filters.gender !== "all" ? 1 : 0,
        filters.total_spent !== "all" ? 1 : 0,
        filters.is_blocked !== "all" ? 1 : 0
    ].reduce((a, b) => a + b, 0);

    const toggleFilterGroup = (group) => {
        setExpandedFilterGroups(prev => 
            prev.includes(group) 
                ? prev.filter(g => g !== group)
                : [...prev, group]
        );
    };

    const openEditModal = (customer, e) => {
        e.stopPropagation(); // Prevent navigation to detail page
        setEditingCustomer(customer);
        setEditData({
            // Basic Information
            name: customer.name,
            phone: customer.phone,
            country_code: customer.country_code || "+91",
            email: customer.email || "",
            gender: customer.gender || "",
            dob: customer.dob || "",
            anniversary: customer.anniversary || "",
            preferred_language: customer.preferred_language || "",
            customer_type: customer.customer_type || "normal",
            segment_tags: customer.segment_tags || [],
            // Contact & Marketing Permissions
            whatsapp_opt_in: customer.whatsapp_opt_in || false,
            promo_whatsapp_allowed: customer.promo_whatsapp_allowed !== false,
            promo_sms_allowed: customer.promo_sms_allowed !== false,
            email_marketing_allowed: customer.email_marketing_allowed !== false,
            call_allowed: customer.call_allowed !== false,
            is_blocked: customer.is_blocked || false,
            // Loyalty Information
            referral_code: customer.referral_code || "",
            referred_by: customer.referred_by || "",
            membership_id: customer.membership_id || "",
            membership_expiry: customer.membership_expiry || "",
            // Behavior & Preferences
            favorite_category: customer.favorite_category || "",
            preferred_payment_mode: customer.preferred_payment_mode || "",
            // Customer Source & Journey
            lead_source: customer.lead_source || "",
            campaign_source: customer.campaign_source || "",
            last_interaction_date: customer.last_interaction_date || "",
            assigned_salesperson: customer.assigned_salesperson || "",
            // WhatsApp CRM Tracking
            last_whatsapp_sent: customer.last_whatsapp_sent || "",
            last_whatsapp_response: customer.last_whatsapp_response || "",
            last_campaign_clicked: customer.last_campaign_clicked || "",
            last_coupon_used: customer.last_coupon_used || "",
            automation_status_tag: customer.automation_status_tag || "",
            // Corporate Information
            gst_name: customer.gst_name || "",
            gst_number: customer.gst_number || "",
            billing_address: customer.billing_address || "",
            credit_limit: customer.credit_limit || "",
            payment_terms: customer.payment_terms || "",
            // Address
            address: customer.address || "",
            address_line_2: customer.address_line_2 || "",
            city: customer.city || "",
            state: customer.state || "",
            pincode: customer.pincode || "",
            country: customer.country || "",
            delivery_instructions: customer.delivery_instructions || "",
            map_location: customer.map_location || null,
            // Preferences
            allergies: customer.allergies || [],
            favorites: customer.favorites || [],
            // Dining Preferences
            preferred_dining_type: customer.preferred_dining_type || "",
            preferred_time_slot: customer.preferred_time_slot || "",
            favorite_table: customer.favorite_table || "",
            avg_party_size: customer.avg_party_size || "",
            diet_preference: customer.diet_preference || "",
            spice_level: customer.spice_level || "",
            cuisine_preference: customer.cuisine_preference || "",
            // Special Occasions
            kids_birthday: customer.kids_birthday || [],
            spouse_name: customer.spouse_name || "",
            festival_preference: customer.festival_preference || [],
            special_dates: customer.special_dates || [],
            // Feedback & Flags
            last_rating: customer.last_rating || "",
            nps_score: customer.nps_score || "",
            complaint_flag: customer.complaint_flag || false,
            vip_flag: customer.vip_flag || false,
            blacklist_flag: customer.blacklist_flag || false,
            // AI/Advanced
            predicted_next_visit: customer.predicted_next_visit || "",
            churn_risk_score: customer.churn_risk_score || "",
            recommended_offer_type: customer.recommended_offer_type || "",
            price_sensitivity_score: customer.price_sensitivity_score || "",
            // Custom Fields
            custom_field_1: customer.custom_field_1 || "",
            custom_field_2: customer.custom_field_2 || "",
            custom_field_3: customer.custom_field_3 || "",
            // Notes
            notes: customer.notes || ""
        });
        setShowEditModal(true);
    };

    const handleUpdateCustomer = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            // Only send fields that have actual values to avoid overwriting with empty strings
            const cleanData = {};
            for (const [key, value] of Object.entries(editData)) {
                if (value !== "" && value !== null && value !== undefined) {
                    cleanData[key] = value;
                }
            }
            await api.put(`/customers/${editingCustomer.id}`, cleanData);
            toast.success("Customer updated successfully!");
            setShowEditModal(false);
            setEditingCustomer(null);
            fetchCustomers();
        } catch (err) {
            toast.error(err.response?.data?.detail || "Failed to update customer");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <ResponsiveLayout>
            <div className="p-4 lg:p-6 xl:p-8 max-w-[1600px] mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-4 lg:mb-6">
                    <h1 className="text-2xl lg:text-3xl font-bold text-[#1A1A1A] font-['Montserrat']" data-testid="customers-title">
                        Customers
                    </h1>
                    <div className="flex gap-2">
                        {/* Sync button only shows when NOT in demo mode AND no customers exist */}
                        {!isDemoMode && !loading && customers.length === 0 && (
                            <Button 
                                onClick={() => navigate("/settings?tab=migration")}
                                variant="outline"
                                className="rounded-full h-10 px-4 border-[#3B82F6] text-[#3B82F6] hover:bg-[#3B82F6]/10"
                                data-testid="sync-mygenie-btn"
                            >
                                🔄 Sync MyGenie
                            </Button>
                        )}
                        <Button 
                            onClick={() => setShowAddModal(true)}
                            className="bg-[#F26B33] hover:bg-[#D85A2A] rounded-full h-10 px-4"
                            data-testid="add-customer-btn"
                        >
                            <Plus className="w-4 h-4 mr-1" /> Add
                        </Button>
                    </div>
                </div>

                {/* Search & Filter Row */}
                <div className="flex gap-2 lg:gap-4 mb-3 lg:mb-4">
                    <div className="relative flex-1 lg:max-w-md">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#A1A1AA]" />
                        <Input
                            type="text"
                            placeholder="Search by name or phone..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="search-input pl-12"
                            data-testid="customer-search-input"
                        />
                    </div>
                    <Button 
                        variant="outline" 
                        onClick={() => setShowFilters(true)}
                        className={`h-12 px-3 lg:px-4 rounded-xl relative ${activeFiltersCount > 0 ? 'border-[#F26B33] text-[#F26B33]' : ''}`}
                        data-testid="filter-btn"
                    >
                        <Filter className="w-5 h-5" />
                        <span className="hidden lg:inline ml-2">Filters</span>
                        {activeFiltersCount > 0 && (
                            <span className="absolute -top-1 -right-1 w-5 h-5 bg-[#F26B33] text-white text-xs rounded-full flex items-center justify-center">
                                {activeFiltersCount}
                            </span>
                        )}
                    </Button>
                </div>

                {/* Combined Filter Row - Search, Sort Dropdown, Tier Stats */}
                <div className="flex flex-wrap items-center gap-3 mb-4 lg:mb-5">
                    {/* Sort Dropdown */}
                    <Select 
                        value={filters.inactive_days === 30 ? "inactive_30d" : filters.most_loyal ? "most_loyal" : `${filters.sort_by}_${filters.sort_order}`}
                        onValueChange={(value) => {
                            if (value === "inactive_30d") {
                                setFilters({...filters, inactive_days: 30, most_loyal: false, sort_by: "last_visit", sort_order: "asc"});
                            } else if (value === "most_loyal") {
                                setFilters({...filters, most_loyal: true, inactive_days: null, sort_by: "avg_visits_per_month", sort_order: "desc"});
                            } else {
                                const [sortBy, sortOrder] = value.split("_desc").length > 1 ? [value.replace("_desc", ""), "desc"] : [value.replace("_asc", ""), "asc"];
                                setFilters({...filters, sort_by: sortBy || "created_at", sort_order: sortOrder || "desc", inactive_days: null, most_loyal: false});
                            }
                        }}
                    >
                        <SelectTrigger className="w-[160px] h-9 text-sm" data-testid="sort-dropdown">
                            <SelectValue placeholder="Sort by..." />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="created_at_desc">Recent</SelectItem>
                            <SelectItem value="most_loyal">Most Loyal</SelectItem>
                            <SelectItem value="inactive_30d">Inactive (30d)</SelectItem>
                            <SelectItem value="total_visits_desc">Most Visits</SelectItem>
                            <SelectItem value="total_spent_desc">Highest Spend</SelectItem>
                            <SelectItem value="points_balance_desc">Most Points</SelectItem>
                        </SelectContent>
                    </Select>

                    {/* Tier Stats - Inline */}
                    {segments && (
                        <div className="flex gap-2 items-center">
                            <div className="px-3 py-1.5 bg-gray-100 rounded-full text-xs font-medium text-[#52525B]">
                                Total: {segments.total?.toLocaleString()}
                            </div>
                            <div className="px-3 py-1.5 bg-amber-50 rounded-full text-xs font-medium text-amber-700">
                                Bronze: {segments.by_tier?.bronze || 0}
                            </div>
                            <div className="px-3 py-1.5 bg-gray-200 rounded-full text-xs font-medium text-gray-700">
                                Silver: {segments.by_tier?.silver || 0}
                            </div>
                            <div className="px-3 py-1.5 bg-yellow-50 rounded-full text-xs font-medium text-yellow-700">
                                Gold: {segments.by_tier?.gold || 0}
                            </div>
                        </div>
                    )}
                </div>

                {/* Compact Filter Drawer */}
                {showFilters && (
                    <div className="fixed inset-0 z-[10000]" data-testid="filter-drawer">
                        {/* Backdrop */}
                        <div 
                            className="absolute inset-0 bg-black/40 animate-backdrop"
                            onClick={() => setShowFilters(false)}
                        />
                        {/* Slide-down Panel */}
                        <div className="absolute top-0 left-0 right-0 bg-white rounded-b-2xl max-h-[90vh] flex flex-col animate-slide-down shadow-2xl" style={{ overscrollBehavior: 'contain' }}>
                            {/* Header */}
                            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
                                <h2 className="text-sm font-bold text-[#1A1A1A] tracking-wide uppercase">Filters</h2>
                                <div className="flex items-center gap-3">
                                    {activeFiltersCount > 0 && (
                                        <button onClick={clearFilters} className="text-xs text-[#F26B33] font-semibold" data-testid="clear-filters-btn">
                                            Clear all
                                        </button>
                                    )}
                                    <button 
                                        onClick={() => setShowFilters(false)} 
                                        className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                                        data-testid="close-filter-btn"
                                    >
                                        <X className="w-4 h-4 text-gray-500" />
                                    </button>
                                </div>
                            </div>

                            {/* Filter Content */}
                            <div className="flex-1 overflow-y-auto px-3 py-2" style={{ overscrollBehavior: 'contain' }}>
                                <div className="space-y-1">
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
                                            <div className="space-y-2 pt-2 pb-1 px-0.5">
                                                {/* Tier + Inactive */}
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div>
                                                        <Label className="text-[10px] text-[#71717A] uppercase font-medium">Tier</Label>
                                                        <Select value={filters.tier} onValueChange={(v) => setFilters({...filters, tier: v})}>
                                                            <SelectTrigger className="h-8 text-xs">
                                                                <SelectValue placeholder="All" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="all">All tiers</SelectItem>
                                                                <SelectItem value="Bronze">Bronze</SelectItem>
                                                                <SelectItem value="Silver">Silver</SelectItem>
                                                                <SelectItem value="Gold">Gold</SelectItem>
                                                                <SelectItem value="Platinum">Platinum</SelectItem>
                                                            </SelectContent>
                                                        </Select>
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
                                                                <SelectItem value="14">14+ days</SelectItem>
                                                                <SelectItem value="30">30+ days</SelectItem>
                                                                <SelectItem value="60">60+ days</SelectItem>
                                                                <SelectItem value="90">90+ days</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                </div>
                                                {/* Visits + Spent */}
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div>
                                                        <Label className="text-[10px] text-[#71717A] uppercase font-medium">Visits</Label>
                                                        <Select value={filters.total_visits} onValueChange={(v) => setFilters({...filters, total_visits: v})}>
                                                            <SelectTrigger className="h-8 text-xs">
                                                                <SelectValue placeholder="Any" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="all">Any</SelectItem>
                                                                <SelectItem value="0">New (0)</SelectItem>
                                                                <SelectItem value="1-5">1-5</SelectItem>
                                                                <SelectItem value="6-10">6-10</SelectItem>
                                                                <SelectItem value="10+">10+</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                    <div>
                                                        <Label className="text-[10px] text-[#71717A] uppercase font-medium">Spent</Label>
                                                        <Select value={filters.total_spent} onValueChange={(v) => setFilters({...filters, total_spent: v})}>
                                                            <SelectTrigger className="h-8 text-xs" data-testid="filter-total-spent">
                                                                <SelectValue placeholder="Any" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="all">Any</SelectItem>
                                                                <SelectItem value="0-500">&lt;500</SelectItem>
                                                                <SelectItem value="500-2000">500-2K</SelectItem>
                                                                <SelectItem value="2000-5000">2K-5K</SelectItem>
                                                                <SelectItem value="5000-10000">5K-10K</SelectItem>
                                                                <SelectItem value="10000+">10K+</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                </div>
                                                {/* Sort By - hidden, using sort tabs instead */}
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
                                            <div className="space-y-2 pt-2 pb-1 px-0.5">
                                                {/* City + Type */}
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div>
                                                        <Label className="text-[10px] text-[#71717A] uppercase font-medium">City</Label>
                                                        <Input
                                                            type="text"
                                                            placeholder="Enter city"
                                                            value={filters.city}
                                                            onChange={(e) => setFilters({...filters, city: e.target.value})}
                                                            className="h-8 text-xs"
                                                        />
                                                    </div>
                                                    <div>
                                                        <Label className="text-[10px] text-[#71717A] uppercase font-medium">Type</Label>
                                                        <Select value={filters.customer_type} onValueChange={(v) => setFilters({...filters, customer_type: v})}>
                                                            <SelectTrigger className="h-8 text-xs">
                                                                <SelectValue placeholder="All" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="all">All types</SelectItem>
                                                                <SelectItem value="normal">Normal</SelectItem>
                                                                <SelectItem value="corporate">Corporate</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                </div>
                                                {/* Diet + Time Slot */}
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div>
                                                        <Label className="text-[10px] text-[#71717A] uppercase font-medium">Diet</Label>
                                                        <Select value={filters.diet_preference} onValueChange={(v) => setFilters({...filters, diet_preference: v})}>
                                                            <SelectTrigger className="h-8 text-xs">
                                                                <SelectValue placeholder="All" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="all">All</SelectItem>
                                                                <SelectItem value="veg">Veg</SelectItem>
                                                                <SelectItem value="non_veg">Non-Veg</SelectItem>
                                                                <SelectItem value="vegan">Vegan</SelectItem>
                                                                <SelectItem value="jain">Jain</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                    <div>
                                                        <Label className="text-[10px] text-[#71717A] uppercase font-medium">Time Slot</Label>
                                                        <Select value={filters.preferred_time_slot} onValueChange={(v) => setFilters({...filters, preferred_time_slot: v})}>
                                                            <SelectTrigger className="h-8 text-xs">
                                                                <SelectValue placeholder="All" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="all">All</SelectItem>
                                                                <SelectItem value="breakfast">Breakfast</SelectItem>
                                                                <SelectItem value="lunch">Lunch</SelectItem>
                                                                <SelectItem value="evening">Evening</SelectItem>
                                                                <SelectItem value="dinner">Dinner</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                </div>
                                                {/* Dining + Gender */}
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div>
                                                        <Label className="text-[10px] text-[#71717A] uppercase font-medium">Dining</Label>
                                                        <Select value={filters.preferred_dining_type} onValueChange={(v) => setFilters({...filters, preferred_dining_type: v})}>
                                                            <SelectTrigger className="h-8 text-xs">
                                                                <SelectValue placeholder="All" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="all">All</SelectItem>
                                                                <SelectItem value="Dine-In">Dine-In</SelectItem>
                                                                <SelectItem value="Takeaway">Takeaway</SelectItem>
                                                                <SelectItem value="Delivery">Delivery</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                    <div>
                                                        <Label className="text-[10px] text-[#71717A] uppercase font-medium">Gender</Label>
                                                        <Select value={filters.gender} onValueChange={(v) => setFilters({...filters, gender: v})}>
                                                            <SelectTrigger className="h-8 text-xs" data-testid="filter-gender">
                                                                <SelectValue placeholder="All" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="all">All</SelectItem>
                                                                <SelectItem value="male">Male</SelectItem>
                                                                <SelectItem value="female">Female</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                </div>
                                                {/* Source + WhatsApp */}
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div>
                                                        <Label className="text-[10px] text-[#71717A] uppercase font-medium">Source</Label>
                                                        <Select value={filters.lead_source} onValueChange={(v) => setFilters({...filters, lead_source: v})}>
                                                            <SelectTrigger className="h-8 text-xs">
                                                                <SelectValue placeholder="All" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="all">All</SelectItem>
                                                                <SelectItem value="Walk-in">Walk-in</SelectItem>
                                                                <SelectItem value="Swiggy">Swiggy</SelectItem>
                                                                <SelectItem value="Zomato">Zomato</SelectItem>
                                                                <SelectItem value="Instagram">Instagram</SelectItem>
                                                                <SelectItem value="Referral">Referral</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                    <div>
                                                        <Label className="text-[10px] text-[#71717A] uppercase font-medium">WhatsApp</Label>
                                                        <Select value={filters.whatsapp_opt_in} onValueChange={(v) => setFilters({...filters, whatsapp_opt_in: v})}>
                                                            <SelectTrigger className="h-8 text-xs">
                                                                <SelectValue placeholder="All" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="all">All</SelectItem>
                                                                <SelectItem value="true">Opted-In</SelectItem>
                                                                <SelectItem value="false">Not Opted</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                </div>
                                                {/* VIP + Blocked */}
                                                <div className="grid grid-cols-2 gap-2">
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
                                                    <div>
                                                        <Label className="text-[10px] text-[#71717A] uppercase font-medium">Blocked</Label>
                                                        <Select value={filters.is_blocked} onValueChange={(v) => setFilters({...filters, is_blocked: v})}>
                                                            <SelectTrigger className="h-8 text-xs">
                                                                <SelectValue placeholder="All" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="all">All</SelectItem>
                                                                <SelectItem value="true">Blocked</SelectItem>
                                                                <SelectItem value="false">Not Blocked</SelectItem>
                                                            </SelectContent>
                                                        </Select>
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
                                                {/* Checkboxes */}
                                                <div className="flex flex-wrap gap-3 pt-1">
                                                    <label className="flex items-center gap-1.5 text-xs">
                                                        <Checkbox 
                                                            checked={filters.has_birthday_this_month}
                                                            onCheckedChange={(checked) => setFilters({...filters, has_birthday_this_month: checked})}
                                                            className="h-3.5 w-3.5"
                                                        />
                                                        <Cake className="w-3 h-3 text-pink-500" />
                                                        Birthday
                                                    </label>
                                                    <label className="flex items-center gap-1.5 text-xs">
                                                        <Checkbox 
                                                            checked={filters.has_anniversary_this_month}
                                                            onCheckedChange={(checked) => setFilters({...filters, has_anniversary_this_month: checked})}
                                                            className="h-3.5 w-3.5"
                                                        />
                                                        <Heart className="w-3 h-3 text-red-500" />
                                                        Anniversary
                                                    </label>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Saved Segments */}
                                    {savedSegments.length > 0 && (
                                        <div className="pt-1.5">
                                            <Label className="text-[10px] text-[#71717A] uppercase font-medium px-0.5">Saved Segments</Label>
                                            <div className="flex flex-wrap gap-1.5 mt-1">
                                                {savedSegments.map(segment => (
                                                    <button
                                                        key={segment.id}
                                                        onClick={() => {
                                                            loadSegment(segment);
                                                            setShowFilters(false);
                                                        }}
                                                        className="px-2.5 py-1 text-[11px] bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
                                                    >
                                                        {segment.name} ({segment.customer_count})
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="px-3 py-2.5 border-t border-gray-100 bg-white flex gap-2">
                                {activeFiltersCount > 0 && (
                                    <Button 
                                        onClick={() => setShowSaveSegmentDialog(true)}
                                        variant="outline"
                                        className="flex-1 h-9 rounded-xl border-[#F26B33] text-[#F26B33] text-xs font-semibold"
                                        data-testid="save-segment-btn"
                                    >
                                        <Save className="w-3.5 h-3.5 mr-1" /> Save Segment
                                    </Button>
                                )}
                                <Button 
                                    onClick={() => setShowFilters(false)}
                                    className="flex-1 h-9 rounded-xl bg-[#F26B33] hover:bg-[#D85A2A] text-white font-semibold text-xs"
                                    data-testid="apply-filters-btn"
                                >
                                    Show {customers.length} Customers
                                </Button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Save Segment Dialog */}
                {showSaveSegmentDialog && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10002] p-4" onClick={() => setShowSaveSegmentDialog(false)}>
                        <div className="bg-white rounded-2xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
                            <h3 className="text-lg font-semibold mb-4">Save Segment</h3>
                            <div className="space-y-4">
                                <div>
                                    <Label className="text-sm font-medium">Segment Name</Label>
                                    <Input
                                        type="text"
                                        placeholder="e.g., VIP Customers"
                                        value={segmentName}
                                        onChange={(e) => setSegmentName(e.target.value)}
                                        className="mt-1 h-11 rounded-xl"
                                        data-testid="segment-name-input"
                                    />
                                </div>
                                <div className="bg-gray-50 p-3 rounded-lg max-h-40 overflow-y-auto">
                                    <p className="text-xs font-medium text-[#52525B] mb-2">Current Filters:</p>
                                    <div className="space-y-1 text-xs text-[#1A1A1A]">
                                        {filters.tier !== "all" && <p>• Tier: {filters.tier}</p>}
                                        {filters.customer_type !== "all" && <p>• Type: {filters.customer_type}</p>}
                                        {filters.last_visit_days !== "all" && <p>• Inactive: {filters.last_visit_days}+ days</p>}
                                        {filters.city && <p>• City: {filters.city}</p>}
                                        {filters.whatsapp_opt_in !== "all" && <p>• WhatsApp: {filters.whatsapp_opt_in === "true" ? "Opted-In" : "Not Opted"}</p>}
                                        {filters.vip_flag !== "all" && <p>• VIP: {filters.vip_flag === "true" ? "Yes" : "No"}</p>}
                                        {filters.diet_preference !== "all" && <p>• Diet: {filters.diet_preference}</p>}
                                        {filters.lead_source !== "all" && <p>• Source: {filters.lead_source}</p>}
                                        {filters.preferred_time_slot !== "all" && <p>• Time Slot: {filters.preferred_time_slot}</p>}
                                        {filters.preferred_dining_type !== "all" && <p>• Dining: {filters.preferred_dining_type}</p>}
                                        {filters.has_birthday_this_month && <p>• Birthday this month</p>}
                                        {filters.has_anniversary_this_month && <p>• Anniversary this month</p>}
                                        {filters.total_visits !== "all" && <p>• Visits: {filters.total_visits}</p>}
                                        {filters.complaint_flag !== "all" && <p>• Complaints: {filters.complaint_flag === "true" ? "Yes" : "No"}</p>}
                                        {filters.gender !== "all" && <p>• Gender: {filters.gender}</p>}
                                        {filters.total_spent !== "all" && <p>• Spent: {filters.total_spent}</p>}
                                        {filters.is_blocked !== "all" && <p>• Blocked: {filters.is_blocked === "true" ? "Yes" : "No"}</p>}
                                        {filters.blacklist_flag !== "all" && <p>• Blacklist: {filters.blacklist_flag === "true" ? "Yes" : "No"}</p>}
                                        {search && <p>• Search: {search}</p>}
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        onClick={() => {
                                            setShowSaveSegmentDialog(false);
                                            setSegmentName("");
                                        }}
                                        className="flex-1"
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        onClick={saveAsSegment}
                                        className="flex-1 bg-[#F26B33] hover:bg-[#D85A2A]"
                                        data-testid="save-segment-confirm-btn"
                                    >
                                        Save Segment
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Customer List */}
                {loading ? (
                    <div className="space-y-3">
                        {[1,2,3].map(i => (
                            <div key={i} className="customer-list-item animate-pulse">
                                <div className="w-10 h-10 rounded-full bg-gray-200 mr-3"></div>
                                <div className="flex-1">
                                    <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
                                    <div className="h-3 bg-gray-200 rounded w-20"></div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : customers.length === 0 ? (
                    <div className="empty-state">
                        <Users className="empty-state-icon" />
                        <p className="text-[#52525B]">{search || activeFiltersCount > 0 ? "No customers found" : "No customers yet"}</p>
                        {!search && activeFiltersCount === 0 && (
                            <Button 
                                onClick={() => setShowAddModal(true)}
                                className="mt-4 bg-[#F26B33] hover:bg-[#D85A2A] rounded-full"
                            >
                                Add your first customer
                            </Button>
                        )}
                        {activeFiltersCount > 0 && (
                            <Button 
                                onClick={clearFilters}
                                variant="outline"
                                className="mt-4 rounded-full"
                            >
                                Clear filters
                            </Button>
                        )}
                    </div>
                ) : (
                    <>
                        {/* Desktop Table View */}
                        <div className="hidden lg:block bg-white rounded-xl border border-gray-100 overflow-hidden">
                            <table className="w-full">
                                <thead className="bg-gray-50 border-b border-gray-100">
                                    <tr>
                                        <SortableHeader 
                                            label="Customer" 
                                            field="name" 
                                            currentSort={filters.sort_by} 
                                            currentOrder={filters.sort_order} 
                                            onSort={handleSort}
                                            align="left"
                                        />
                                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Phone</th>
                                        <SortableHeader 
                                            label="Visits" 
                                            field="total_visits" 
                                            currentSort={filters.sort_by} 
                                            currentOrder={filters.sort_order} 
                                            onSort={handleSort}
                                            align="center"
                                        />
                                        <SortableHeader 
                                            label="Spent" 
                                            field="total_spent" 
                                            currentSort={filters.sort_by} 
                                            currentOrder={filters.sort_order} 
                                            onSort={handleSort}
                                            align="center"
                                        />
                                        <SortableHeader 
                                            label="Last Visit" 
                                            field="last_visit" 
                                            currentSort={filters.sort_by} 
                                            currentOrder={filters.sort_order} 
                                            onSort={handleSort}
                                            align="center"
                                        />
                                        <SortableHeader 
                                            label="Points" 
                                            field="points_balance" 
                                            currentSort={filters.sort_by} 
                                            currentOrder={filters.sort_order} 
                                            onSort={handleSort}
                                            align="center"
                                        />
                                        <SortableHeader 
                                            label="Wallet" 
                                            field="wallet_balance" 
                                            currentSort={filters.sort_by} 
                                            currentOrder={filters.sort_order} 
                                            onSort={handleSort}
                                            align="center"
                                        />
                                        <SortableHeader 
                                            label="Tier" 
                                            field="tier" 
                                            currentSort={filters.sort_by} 
                                            currentOrder={filters.sort_order} 
                                            onSort={handleSort}
                                            align="center"
                                        />
                                        <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {customers.map((customer) => {
                                        const formatSpent = (amount) => {
                                            if (!amount || amount === 0) return '₹0';
                                            if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
                                            if (amount >= 1000) return `₹${(amount / 1000).toFixed(0)}K`;
                                            return `₹${amount}`;
                                        };
                                        
                                        const formatLastVisit = (dateStr) => {
                                            if (!dateStr) return 'Never';
                                            const date = new Date(dateStr);
                                            const now = new Date();
                                            const diffMs = now - date;
                                            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                                            
                                            if (diffDays === 0) return 'Today';
                                            if (diffDays === 1) return '1d ago';
                                            if (diffDays < 7) return `${diffDays}d ago`;
                                            if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
                                            if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
                                            return `${Math.floor(diffDays / 365)}y ago`;
                                        };
                                        
                                        return (
                                            <tr 
                                                key={customer.id}
                                                className="hover:bg-gray-50 cursor-pointer transition-colors"
                                                onClick={() => navigate(`/customers/${customer.id}`)}
                                                data-testid={`customer-table-row-${customer.id}`}
                                            >
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-3">
                                                        <Avatar className="w-9 h-9">
                                                            <AvatarFallback className={`text-sm font-semibold ${
                                                                customer.customer_type === "corporate" 
                                                                    ? "bg-[#F26B33]/10 text-[#F26B33]" 
                                                                    : "bg-[#329937]/10 text-[#329937]"
                                                            }`}>
                                                                {customer.customer_type === "corporate" ? <Building2 className="w-4 h-4" /> : (formatCustomerName(customer.name) === "NA" ? "?" : customer.name.charAt(0))}
                                                            </AvatarFallback>
                                                        </Avatar>
                                                        <div>
                                                            <p className="font-medium text-[#1A1A1A] text-sm">{formatCustomerName(customer.name)}</p>
                                                            {shouldShowEmail(customer.email) && <p className="text-xs text-gray-400">{customer.email}</p>}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-sm text-gray-600">{customer.phone}</td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className="text-sm font-medium text-gray-700">{customer.total_visits || 0}</span>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className="text-sm font-medium text-gray-700">{formatSpent(customer.total_spent)}</span>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className={`text-sm ${customer.last_visit ? 'text-gray-600' : 'text-gray-400'}`}>
                                                        {formatLastVisit(customer.last_visit)}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className="text-sm font-semibold text-[#329937]">{customer.total_points}</span>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    {customer.wallet_balance > 0 ? (
                                                        <span className="text-sm font-semibold text-[#F26B33]">₹{customer.wallet_balance.toLocaleString()}</span>
                                                    ) : (
                                                        <span className="text-sm text-gray-400">-</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <Badge variant="outline" className={`tier-badge ${customer.tier.toLowerCase()}`}>
                                                        {customer.tier}
                                                    </Badge>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <button
                                                        onClick={(e) => openEditModal(customer, e)}
                                                        className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-[#F26B33]/10 transition-colors mx-auto"
                                                        data-testid={`edit-customer-table-${customer.id}`}
                                                    >
                                                        <Edit2 className="w-4 h-4 text-[#52525B]" />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile List View */}
                        <div className="lg:hidden space-y-2">
                            {customers.map((customer) => {
                                const formatSpent = (amount) => {
                                    if (!amount || amount === 0) return '₹0';
                                    if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
                                    if (amount >= 1000) return `₹${(amount / 1000).toFixed(0)}K`;
                                    return `₹${amount}`;
                                };
                                
                                const formatLastVisit = (dateStr) => {
                                    if (!dateStr) return 'Never';
                                    const date = new Date(dateStr);
                                    const now = new Date();
                                    const diffMs = now - date;
                                    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                                    
                                    if (diffDays === 0) return 'Today';
                                    if (diffDays === 1) return '1d ago';
                                    if (diffDays < 7) return `${diffDays}d ago`;
                                    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
                                    if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
                                    return `${Math.floor(diffDays / 365)}y ago`;
                                };
                                
                                return (
                                    <div
                                        key={customer.id}
                                        className="customer-list-item w-full cursor-pointer"
                                        data-testid={`customer-row-${customer.id}`}
                                        onClick={() => navigate(`/customers/${customer.id}`)}
                                    >
                                        <Avatar className="w-10 h-10 mr-3">
                                            <AvatarFallback className={`font-semibold ${
                                                customer.customer_type === "corporate" 
                                                    ? "bg-[#F26B33]/10 text-[#F26B33]" 
                                                    : "bg-[#329937]/10 text-[#329937]"
                                            }`}>
                                                {customer.customer_type === "corporate" ? <Building2 className="w-5 h-5" /> : (formatCustomerName(customer.name) === "NA" ? "?" : customer.name.charAt(0))}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="font-medium text-[#1A1A1A] truncate">{formatCustomerName(customer.name)}</p>
                                                <button
                                                    onClick={(e) => openEditModal(customer, e)}
                                                    className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center hover:bg-[#F26B33]/10 transition-colors"
                                                    data-testid={`edit-customer-list-${customer.id}`}
                                                >
                                                    <Edit2 className="w-3 h-3 text-[#52525B]" />
                                                </button>
                                            </div>
                                            <p className="text-sm text-[#52525B]">
                                                {customer.total_visits || 0} visits · {formatSpent(customer.total_spent)} · {formatLastVisit(customer.last_visit)}
                                            </p>
                                        </div>
                                        <div className="text-right flex items-center gap-3">
                                            {customer.wallet_balance > 0 && (
                                                <div className="text-right border-r pr-3 border-gray-200">
                                                    <p className="font-semibold text-[#F26B33]">₹{customer.wallet_balance.toLocaleString()}</p>
                                                    <p className="text-[10px] text-[#A1A1AA]">Wallet</p>
                                                </div>
                                            )}
                                            <div className="text-right">
                                                <p className="font-semibold text-[#329937] points-display text-sm">{customer.total_points} pts</p>
                                                <Badge variant="outline" className={`tier-badge ${customer.tier.toLowerCase()}`}>
                                                    {customer.tier}
                                                </Badge>
                                            </div>
                                            <ChevronRight className="w-5 h-5 text-[#A1A1AA]" />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>

            {/* Add Customer Modal */}
            <Dialog open={showAddModal} onOpenChange={(open) => { setShowAddModal(open); if (!open) resetForm(); }}>
                <DialogContent className="max-w-lg mx-4 rounded-2xl max-h-[90vh] overflow-hidden flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="font-['Montserrat']">Add New Customer</DialogTitle>
                        <DialogDescription>Enter customer details to start their loyalty journey.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleAddCustomer} className="flex-1 overflow-hidden">
                        <ScrollArea className="h-[calc(90vh-200px)] pr-4">
                            <Accordion type="multiple" defaultValue={["basic"]} className="w-full">
                                
                                {/* Basic Information - Always Expanded */}
                                <AccordionItem value="basic" className="border-b-0">
                                    <AccordionTrigger className="hover:no-underline py-3 px-3 bg-[#329937]/5 rounded-xl mb-2">
                                        <span className="flex items-center gap-2 text-sm font-semibold text-[#329937]">
                                            <User className="w-4 h-4" /> Basic Information
                                        </span>
                                    </AccordionTrigger>
                                    <AccordionContent className="px-1">
                                        <div className="space-y-4">
                                            <div>
                                                <Label htmlFor="name" className="form-label">Name *</Label>
                                                <Input
                                                    id="name"
                                                    value={newCustomer.name}
                                                    onChange={(e) => setNewCustomer({...newCustomer, name: e.target.value})}
                                                    placeholder="Customer name"
                                                    className="h-11 rounded-xl"
                                                    required
                                                    data-testid="new-customer-name"
                                                />
                                            </div>
                                            
                                            <div>
                                                <Label htmlFor="phone" className="form-label">Phone *</Label>
                                                <div className="flex gap-2">
                                                    <Select 
                                                        value={newCustomer.country_code} 
                                                        onValueChange={(v) => setNewCustomer({...newCustomer, country_code: v})}
                                                    >
                                                        <SelectTrigger className="w-24 h-11 rounded-xl" data-testid="country-code-select">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {COUNTRY_CODES.map(cc => (
                                                                <SelectItem key={cc.code} value={cc.code}>
                                                                    {cc.flag} {cc.code}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    <Input
                                                        id="phone"
                                                        type="tel"
                                                        value={newCustomer.phone}
                                                        onChange={(e) => setNewCustomer({...newCustomer, phone: e.target.value.replace(/\D/g, '')})}
                                                        placeholder="9876543210"
                                                        className="h-11 rounded-xl flex-1"
                                                        required
                                                        maxLength={10}
                                                        data-testid="new-customer-phone"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>

                                {/* Other Information - Address + Personal Details */}
                                <AccordionItem value="other" className="border-b-0">
                                    <AccordionTrigger className="hover:no-underline py-3 px-3 bg-cyan-50 rounded-xl mb-2">
                                        <span className="flex items-center gap-2 text-sm font-semibold text-cyan-600">
                                            <Layers className="w-4 h-4" /> Other Information
                                        </span>
                                    </AccordionTrigger>
                                    <AccordionContent className="px-1">
                                        <div className="space-y-4">
                                            {/* Email */}
                                            <div>
                                                <Label htmlFor="email" className="form-label">Email</Label>
                                                <Input
                                                    id="email"
                                                    type="email"
                                                    value={newCustomer.email}
                                                    onChange={(e) => setNewCustomer({...newCustomer, email: e.target.value})}
                                                    placeholder="customer@email.com"
                                                    className="h-11 rounded-xl"
                                                    data-testid="new-customer-email"
                                                />
                                            </div>

                                            {/* Gender & Language */}
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <Label className="form-label">Gender</Label>
                                                    <Select 
                                                        value={newCustomer.gender} 
                                                        onValueChange={(v) => setNewCustomer({...newCustomer, gender: v})}
                                                    >
                                                        <SelectTrigger className="h-11 rounded-xl" data-testid="new-customer-gender">
                                                            <SelectValue placeholder="Select..." />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {GENDER_OPTIONS.map(opt => (
                                                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <div>
                                                    <Label className="form-label">Language</Label>
                                                    <Select 
                                                        value={newCustomer.preferred_language} 
                                                        onValueChange={(v) => setNewCustomer({...newCustomer, preferred_language: v})}
                                                    >
                                                        <SelectTrigger className="h-11 rounded-xl" data-testid="new-customer-language">
                                                            <SelectValue placeholder="Select..." />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {LANGUAGE_OPTIONS.map(opt => (
                                                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            </div>

                                            {/* DOB & Anniversary */}
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <Label htmlFor="dob" className="form-label flex items-center gap-1">
                                                        <Calendar className="w-3.5 h-3.5" /> Date of Birth
                                                    </Label>
                                                    <Input
                                                        id="dob"
                                                        type="date"
                                                        value={newCustomer.dob}
                                                        onChange={(e) => setNewCustomer({...newCustomer, dob: e.target.value})}
                                                        className="h-11 rounded-xl"
                                                        data-testid="new-customer-dob"
                                                    />
                                                </div>
                                                <div>
                                                    <Label htmlFor="anniversary" className="form-label flex items-center gap-1">
                                                        <Calendar className="w-3.5 h-3.5" /> Anniversary
                                                    </Label>
                                                    <Input
                                                        id="anniversary"
                                                        type="date"
                                                        value={newCustomer.anniversary}
                                                        onChange={(e) => setNewCustomer({...newCustomer, anniversary: e.target.value})}
                                                        className="h-11 rounded-xl"
                                                        data-testid="new-customer-anniversary"
                                                    />
                                                </div>
                                            </div>

                                            {/* Customer Type - Radio Buttons */}
                                            <div>
                                                <Label className="form-label">Customer Type</Label>
                                                <div className="flex items-center gap-6 mt-2">
                                                    <label
                                                        className="flex items-center gap-2 cursor-pointer"
                                                        data-testid="customer-type-normal"
                                                    >
                                                        <input
                                                            type="radio"
                                                            name="customer_type"
                                                            value="normal"
                                                            checked={newCustomer.customer_type === "normal"}
                                                            onChange={() => setNewCustomer({...newCustomer, customer_type: "normal"})}
                                                            className="w-4 h-4 accent-[#329937]"
                                                        />
                                                        <User className="w-4 h-4 text-gray-600" />
                                                        <span className="text-sm font-medium text-gray-700">Normal</span>
                                                    </label>
                                                    <label
                                                        className="flex items-center gap-2 cursor-pointer"
                                                        data-testid="customer-type-corporate"
                                                    >
                                                        <input
                                                            type="radio"
                                                            name="customer_type"
                                                            value="corporate"
                                                            checked={newCustomer.customer_type === "corporate"}
                                                            onChange={() => setNewCustomer({...newCustomer, customer_type: "corporate"})}
                                                            className="w-4 h-4 accent-[#F26B33]"
                                                        />
                                                        <Building2 className="w-4 h-4 text-gray-600" />
                                                        <span className="text-sm font-medium text-gray-700">Corporate</span>
                                                    </label>
                                                </div>
                                            </div>

                                            {/* Inline Corporate Fields */}
                                            {newCustomer.customer_type === "corporate" && (
                                                <div className="space-y-4 p-4 bg-[#F26B33]/5 border border-[#F26B33]/20 rounded-xl" data-testid="inline-corporate-fields">
                                                    <p className="text-xs text-[#F26B33] font-semibold flex items-center gap-1">
                                                        <Building2 className="w-3.5 h-3.5" /> Corporate Details
                                                    </p>
                                                    <div>
                                                        <Label className="form-label">Company/GST Name</Label>
                                                        <Input 
                                                            placeholder="Company name" 
                                                            className="h-11 rounded-xl"
                                                            value={newCustomer.gst_name}
                                                            onChange={(e) => setNewCustomer({...newCustomer, gst_name: e.target.value})}
                                                            data-testid="new-customer-gst-name"
                                                        />
                                                    </div>
                                                    <div>
                                                        <Label className="form-label">GST Number</Label>
                                                        <Input 
                                                            placeholder="22AAAAA0000A1Z5" 
                                                            className="h-11 rounded-xl"
                                                            value={newCustomer.gst_number}
                                                            onChange={(e) => setNewCustomer({...newCustomer, gst_number: e.target.value})}
                                                            data-testid="new-customer-gst-number"
                                                        />
                                                    </div>
                                                    <div>
                                                        <Label className="form-label">Billing Address</Label>
                                                        <Textarea 
                                                            placeholder="Billing address for invoices" 
                                                            className="rounded-xl resize-none" 
                                                            rows={2}
                                                            value={newCustomer.billing_address}
                                                            onChange={(e) => setNewCustomer({...newCustomer, billing_address: e.target.value})}
                                                            data-testid="new-customer-billing-address"
                                                        />
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div>
                                                            <Label className="form-label">Credit Limit</Label>
                                                            <Input 
                                                                placeholder="50000" 
                                                                type="number"
                                                                className="h-11 rounded-xl"
                                                                value={newCustomer.credit_limit}
                                                                onChange={(e) => setNewCustomer({...newCustomer, credit_limit: e.target.value})}
                                                                data-testid="new-customer-credit-limit"
                                                            />
                                                        </div>
                                                        <div>
                                                            <Label className="form-label">Payment Terms</Label>
                                                            <Input 
                                                                placeholder="Net 30" 
                                                                className="h-11 rounded-xl"
                                                                value={newCustomer.payment_terms}
                                                                onChange={(e) => setNewCustomer({...newCustomer, payment_terms: e.target.value})}
                                                                data-testid="new-customer-payment-terms"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Divider */}
                                            <div className="border-t pt-4 mt-4">
                                                <p className="text-xs text-gray-500 font-medium mb-3 flex items-center gap-1">
                                                    <MapPin className="w-3.5 h-3.5" /> Address Details
                                                </p>
                                            </div>

                                            {/* Address Line 1 */}
                                            <div>
                                                <Label className="form-label">Address Line 1</Label>
                                                <Textarea 
                                                    placeholder="House/Flat No., Building..." 
                                                    className="rounded-xl resize-none" 
                                                    rows={2}
                                                    value={newCustomer.address}
                                                    onChange={(e) => setNewCustomer({...newCustomer, address: e.target.value})}
                                                />
                                            </div>
                                            
                                            {/* Address Line 2 */}
                                            <div>
                                                <Label className="form-label">Address Line 2</Label>
                                                <Input 
                                                    placeholder="Street, Area, Landmark" 
                                                    className="h-11 rounded-xl"
                                                    value={newCustomer.address_line_2}
                                                    onChange={(e) => setNewCustomer({...newCustomer, address_line_2: e.target.value})}
                                                />
                                            </div>
                                            
                                            {/* City & State */}
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <Label className="form-label">City</Label>
                                                    <Input 
                                                        placeholder="City" 
                                                        className="h-11 rounded-xl"
                                                        value={newCustomer.city}
                                                        onChange={(e) => setNewCustomer({...newCustomer, city: e.target.value})}
                                                    />
                                                </div>
                                                <div>
                                                    <Label className="form-label">State</Label>
                                                    <Input 
                                                        placeholder="State" 
                                                        className="h-11 rounded-xl"
                                                        value={newCustomer.state}
                                                        onChange={(e) => setNewCustomer({...newCustomer, state: e.target.value})}
                                                    />
                                                </div>
                                            </div>
                                            
                                            {/* Pincode & Country */}
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <Label className="form-label">Pincode</Label>
                                                    <Input 
                                                        placeholder="400001" 
                                                        className="h-11 rounded-xl"
                                                        value={newCustomer.pincode}
                                                        onChange={(e) => setNewCustomer({...newCustomer, pincode: e.target.value})}
                                                    />
                                                </div>
                                                <div>
                                                    <Label className="form-label">Country</Label>
                                                    <Input 
                                                        placeholder="India" 
                                                        className="h-11 rounded-xl"
                                                        value={newCustomer.country}
                                                        onChange={(e) => setNewCustomer({...newCustomer, country: e.target.value})}
                                                    />
                                                </div>
                                            </div>
                                            
                                            {/* Delivery Instructions */}
                                            <div>
                                                <Label className="form-label">Delivery Instructions</Label>
                                                <Textarea 
                                                    placeholder="Ring doorbell twice, leave at door..." 
                                                    className="rounded-xl resize-none" 
                                                    rows={2}
                                                    value={newCustomer.delivery_instructions}
                                                    onChange={(e) => setNewCustomer({...newCustomer, delivery_instructions: e.target.value})}
                                                />
                                            </div>
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>

                                {/* Tags & Flags */}
                                <AccordionItem value="flags" className="border-b-0">
                                    <AccordionTrigger className="hover:no-underline py-3 px-3 bg-indigo-50 rounded-xl mb-2">
                                        <span className="flex items-center gap-2 text-sm font-semibold text-indigo-600">
                                            <Star className="w-4 h-4" /> Tags & Flags
                                        </span>
                                    </AccordionTrigger>
                                    <AccordionContent className="px-1">
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-xl">
                                                <Label className="text-sm text-yellow-700">VIP Customer</Label>
                                                <Switch 
                                                    checked={newCustomer.vip_flag} 
                                                    onCheckedChange={(v) => setNewCustomer({...newCustomer, vip_flag: v})}
                                                />
                                            </div>
                                            <div className="flex items-center justify-between p-3 bg-red-50 rounded-xl">
                                                <Label className="text-sm text-red-700">Blacklisted</Label>
                                                <Switch 
                                                    checked={newCustomer.blacklist_flag} 
                                                    onCheckedChange={(v) => setNewCustomer({...newCustomer, blacklist_flag: v})}
                                                />
                                            </div>
                                            <div className="flex items-center justify-between p-3 bg-orange-50 rounded-xl">
                                                <Label className="text-sm text-orange-700">Complaint Flag</Label>
                                                <Switch 
                                                    checked={newCustomer.complaint_flag} 
                                                    onCheckedChange={(v) => setNewCustomer({...newCustomer, complaint_flag: v})}
                                                />
                                            </div>
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>

                                {/* AI-Detected Preferences */}
                                <AccordionItem value="ai-detected" className="border-b-0">
                                    <AccordionTrigger className="hover:no-underline py-3 px-3 bg-gradient-to-r from-rose-50 to-pink-50 rounded-xl mb-2">
                                        <span className="flex items-center gap-2 text-sm font-semibold text-rose-600">
                                            <Sparkles className="w-4 h-4" /> AI-Detected Preferences
                                            <span className="ml-auto text-[10px] bg-rose-100 text-rose-600 px-2 py-0.5 rounded-full">Auto</span>
                                        </span>
                                    </AccordionTrigger>
                                    <AccordionContent className="px-1">
                                        <div className="bg-gradient-to-br from-rose-50 to-pink-50 rounded-xl p-4 text-center">
                                            <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm">
                                                <Sparkles className="w-6 h-6 text-rose-500" />
                                            </div>
                                            <p className="font-semibold text-gray-800 text-sm">Smart Detection</p>
                                            <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                                                Dining preferences, cuisine choices, spice levels, and festival preferences will be <strong>automatically detected</strong> from order history.
                                            </p>
                                            <div className="flex flex-wrap justify-center gap-2 mt-4">
                                                <span className="px-2 py-1 bg-white rounded-full text-[10px] text-gray-500 shadow-sm">Time Slot</span>
                                                <span className="px-2 py-1 bg-white rounded-full text-[10px] text-gray-500 shadow-sm">Cuisine</span>
                                                <span className="px-2 py-1 bg-white rounded-full text-[10px] text-gray-500 shadow-sm">Spice Level</span>
                                                <span className="px-2 py-1 bg-white rounded-full text-[10px] text-gray-500 shadow-sm">Festivals</span>
                                                <span className="px-2 py-1 bg-white rounded-full text-[10px] text-gray-500 shadow-sm">Diet</span>
                                            </div>
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>

                                {/* Contact Preferences - Coming Soon */}
                                <AccordionItem value="contact" className="border-b-0">
                                    <AccordionTrigger className="hover:no-underline py-3 px-3 bg-blue-50 rounded-xl mb-2">
                                        <span className="flex items-center gap-2 text-sm font-semibold text-blue-600">
                                            <Phone className="w-4 h-4" /> Contact Preferences
                                            <span className="ml-auto text-[10px] bg-blue-100 text-blue-500 px-2 py-0.5 rounded-full">Coming Soon</span>
                                        </span>
                                    </AccordionTrigger>
                                    <AccordionContent className="px-1">
                                        <ComingSoonOverlay color="blue">
                                            <div className="space-y-3 opacity-50">
                                                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                                                    <Label className="text-sm">WhatsApp Opt-in</Label>
                                                    <Switch disabled />
                                                </div>
                                                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                                                    <Label className="text-sm">Promo SMS Allowed</Label>
                                                    <Switch disabled checked />
                                                </div>
                                            </div>
                                        </ComingSoonOverlay>
                                    </AccordionContent>
                                </AccordionItem>

                                {/* Membership - Coming Soon */}
                                <AccordionItem value="membership" className="border-b-0">
                                    <AccordionTrigger className="hover:no-underline py-3 px-3 bg-purple-50 rounded-xl mb-2">
                                        <span className="flex items-center gap-2 text-sm font-semibold text-purple-600">
                                            <Tag className="w-4 h-4" /> Membership
                                            <span className="ml-auto text-[10px] bg-purple-100 text-purple-500 px-2 py-0.5 rounded-full">Coming Soon</span>
                                        </span>
                                    </AccordionTrigger>
                                    <AccordionContent className="px-1">
                                        <ComingSoonOverlay color="purple">
                                            <div className="space-y-4 opacity-50">
                                                <div>
                                                    <Label className="form-label">Membership ID</Label>
                                                    <Input placeholder="External membership ID" className="h-11 rounded-xl" disabled />
                                                </div>
                                                <div>
                                                    <Label className="form-label">Referral Code</Label>
                                                    <Input placeholder="Referral code" className="h-11 rounded-xl" disabled />
                                                </div>
                                            </div>
                                        </ComingSoonOverlay>
                                    </AccordionContent>
                                </AccordionItem>

                                {/* Source & Journey - Coming Soon */}
                                <AccordionItem value="source" className="border-b-0">
                                    <AccordionTrigger className="hover:no-underline py-3 px-3 bg-amber-50 rounded-xl mb-2">
                                        <span className="flex items-center gap-2 text-sm font-semibold text-amber-600">
                                            <TrendingUp className="w-4 h-4" /> Source & Journey
                                            <span className="ml-auto text-[10px] bg-amber-100 text-amber-500 px-2 py-0.5 rounded-full">Coming Soon</span>
                                        </span>
                                    </AccordionTrigger>
                                    <AccordionContent className="px-1">
                                        <ComingSoonOverlay color="amber">
                                            <div className="space-y-4 opacity-50">
                                                <div>
                                                    <Label className="form-label">Lead Source</Label>
                                                    <Input placeholder="How did they find you?" className="h-11 rounded-xl" disabled />
                                                </div>
                                                <div>
                                                    <Label className="form-label">Campaign Source</Label>
                                                    <Input placeholder="UTM or campaign" className="h-11 rounded-xl" disabled />
                                                </div>
                                            </div>
                                        </ComingSoonOverlay>
                                    </AccordionContent>
                                </AccordionItem>

                                {/* Custom Fields & Notes - Coming Soon */}
                                <AccordionItem value="custom" className="border-b-0">
                                    <AccordionTrigger className="hover:no-underline py-3 px-3 bg-gray-100 rounded-xl mb-2">
                                        <span className="flex items-center gap-2 text-sm font-semibold text-gray-600">
                                            <Layers className="w-4 h-4" /> Custom Fields & Notes
                                            <span className="ml-auto text-[10px] bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full">Coming Soon</span>
                                        </span>
                                    </AccordionTrigger>
                                    <AccordionContent className="px-1">
                                        <ComingSoonOverlay color="gray">
                                            <div className="space-y-4 opacity-50">
                                                <div>
                                                    <Label className="form-label">Custom Field 1</Label>
                                                    <Input placeholder="Custom value..." className="h-11 rounded-xl" disabled />
                                                </div>
                                                <div>
                                                    <Label className="form-label">Notes</Label>
                                                    <Textarea placeholder="Special notes..." className="rounded-xl resize-none" rows={2} disabled />
                                                </div>
                                            </div>
                                        </ComingSoonOverlay>
                                    </AccordionContent>
                                </AccordionItem>

                            </Accordion>
                        </ScrollArea>
                        <DialogFooter className="gap-2 pt-4 border-t">
                            <Button 
                                type="button" 
                                variant="outline" 
                                onClick={() => { setShowAddModal(false); resetForm(); }}
                                className="rounded-full"
                            >
                                Cancel
                            </Button>
                            <Button 
                                type="submit" 
                                className="bg-[#F26B33] hover:bg-[#D85A2A] rounded-full"
                                disabled={submitting}
                                data-testid="submit-new-customer"
                            >
                                {submitting ? "Adding..." : "Add Customer"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Edit Customer Modal */}
            <Dialog open={showEditModal} onOpenChange={(open) => { setShowEditModal(open); if (!open) setEditingCustomer(null); }}>
                <DialogContent className="max-w-lg mx-4 rounded-2xl max-h-[90vh] overflow-hidden flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="font-['Montserrat']">Edit Customer</DialogTitle>
                        <DialogDescription>Update customer details</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleUpdateCustomer} className="flex-1 overflow-hidden">
                        <ScrollArea className="h-[calc(90vh-200px)] pr-4">
                            <Accordion type="multiple" defaultValue={["basic"]} className="w-full">

                                {/* Basic Information */}
                                <AccordionItem value="basic" className="border-b-0">
                                    <AccordionTrigger className="hover:no-underline py-3 px-3 bg-[#329937]/5 rounded-xl mb-2">
                                        <span className="flex items-center gap-2 text-sm font-semibold text-[#329937]">
                                            <User className="w-4 h-4" /> Basic Information
                                        </span>
                                    </AccordionTrigger>
                                    <AccordionContent className="px-1">
                                        <div className="space-y-4">
                                            <div>
                                                <Label className="form-label">Name *</Label>
                                                <Input
                                                    value={editData.name || ""}
                                                    onChange={(e) => setEditData({...editData, name: e.target.value})}
                                                    placeholder="Customer name"
                                                    className="h-11 rounded-xl"
                                                    required
                                                    data-testid="edit-list-name-input"
                                                />
                                            </div>
                                            <div>
                                                <Label className="form-label">Phone * (Unique)</Label>
                                                <div className="flex gap-2">
                                                    <Select 
                                                        value={editData.country_code || "+91"} 
                                                        onValueChange={(v) => setEditData({...editData, country_code: v})}
                                                    >
                                                        <SelectTrigger className="w-24 h-11 rounded-xl" data-testid="edit-country-code-select">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {COUNTRY_CODES.map(cc => (
                                                                <SelectItem key={cc.code} value={cc.code}>
                                                                    {cc.flag} {cc.code}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    <Input
                                                        value={editData.phone || ""}
                                                        onChange={(e) => setEditData({...editData, phone: e.target.value.replace(/\D/g, '')})}
                                                        placeholder="9876543210"
                                                        className="flex-1 h-11 rounded-xl"
                                                        required
                                                        maxLength={10}
                                                        data-testid="edit-list-phone-input"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>

                                {/* Other Information */}
                                <AccordionItem value="other" className="border-b-0">
                                    <AccordionTrigger className="hover:no-underline py-3 px-3 bg-cyan-50 rounded-xl mb-2">
                                        <span className="flex items-center gap-2 text-sm font-semibold text-cyan-600">
                                            <Layers className="w-4 h-4" /> Other Information
                                        </span>
                                    </AccordionTrigger>
                                    <AccordionContent className="px-1">
                                        <div className="space-y-4">
                                            {/* Email */}
                                            <div>
                                                <Label className="form-label">Email</Label>
                                                <Input
                                                    type="email"
                                                    value={editData.email || ""}
                                                    onChange={(e) => setEditData({...editData, email: e.target.value})}
                                                    placeholder="customer@email.com"
                                                    className="h-11 rounded-xl"
                                                    data-testid="edit-customer-email"
                                                />
                                            </div>

                                            {/* Gender & Language */}
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <Label className="form-label">Gender</Label>
                                                    <Select value={editData.gender || ""} onValueChange={(v) => setEditData({...editData, gender: v})}>
                                                        <SelectTrigger className="h-11 rounded-xl" data-testid="edit-customer-gender">
                                                            <SelectValue placeholder="Select" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {GENDER_OPTIONS.map(g => (
                                                                <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                <div>
                                                    <Label className="form-label">Language</Label>
                                                    <Select value={editData.preferred_language || ""} onValueChange={(v) => setEditData({...editData, preferred_language: v})}>
                                                        <SelectTrigger className="h-11 rounded-xl" data-testid="edit-customer-language">
                                                            <SelectValue placeholder="Select" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {LANGUAGE_OPTIONS.map(l => (
                                                                <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            </div>

                                            {/* DOB & Anniversary */}
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <Label className="form-label flex items-center gap-1">
                                                        <Calendar className="w-3.5 h-3.5" /> Date of Birth
                                                    </Label>
                                                    <Input
                                                        type="date"
                                                        value={editData.dob || ""}
                                                        onChange={(e) => setEditData({...editData, dob: e.target.value})}
                                                        className="h-11 rounded-xl"
                                                        data-testid="edit-customer-dob"
                                                    />
                                                </div>
                                                <div>
                                                    <Label className="form-label flex items-center gap-1">
                                                        <Calendar className="w-3.5 h-3.5" /> Anniversary
                                                    </Label>
                                                    <Input
                                                        type="date"
                                                        value={editData.anniversary || ""}
                                                        onChange={(e) => setEditData({...editData, anniversary: e.target.value})}
                                                        className="h-11 rounded-xl"
                                                        data-testid="edit-customer-anniversary"
                                                    />
                                                </div>
                                            </div>

                                            {/* Customer Type - Radio Buttons */}
                                            <div>
                                                <Label className="form-label">Customer Type</Label>
                                                <div className="flex items-center gap-6 mt-2">
                                                    <label className="flex items-center gap-2 cursor-pointer" data-testid="edit-customer-type-normal">
                                                        <input
                                                            type="radio"
                                                            name="edit_customer_type"
                                                            value="normal"
                                                            checked={editData.customer_type === "normal"}
                                                            onChange={() => setEditData({...editData, customer_type: "normal"})}
                                                            className="w-4 h-4 accent-[#329937]"
                                                        />
                                                        <User className="w-4 h-4 text-gray-600" />
                                                        <span className="text-sm font-medium text-gray-700">Normal</span>
                                                    </label>
                                                    <label className="flex items-center gap-2 cursor-pointer" data-testid="edit-customer-type-corporate">
                                                        <input
                                                            type="radio"
                                                            name="edit_customer_type"
                                                            value="corporate"
                                                            checked={editData.customer_type === "corporate"}
                                                            onChange={() => setEditData({...editData, customer_type: "corporate"})}
                                                            className="w-4 h-4 accent-[#F26B33]"
                                                        />
                                                        <Building2 className="w-4 h-4 text-gray-600" />
                                                        <span className="text-sm font-medium text-gray-700">Corporate</span>
                                                    </label>
                                                </div>
                                            </div>

                                            {/* Inline Corporate Fields */}
                                            {editData.customer_type === "corporate" && (
                                                <div className="space-y-4 p-4 bg-[#F26B33]/5 border border-[#F26B33]/20 rounded-xl" data-testid="edit-inline-corporate-fields">
                                                    <p className="text-xs text-[#F26B33] font-semibold flex items-center gap-1">
                                                        <Building2 className="w-3.5 h-3.5" /> Corporate Details
                                                    </p>
                                                    <div>
                                                        <Label className="form-label">Company/GST Name</Label>
                                                        <Input
                                                            placeholder="Company name"
                                                            className="h-11 rounded-xl"
                                                            value={editData.gst_name || ""}
                                                            onChange={(e) => setEditData({...editData, gst_name: e.target.value})}
                                                            data-testid="edit-customer-gst-name"
                                                        />
                                                    </div>
                                                    <div>
                                                        <Label className="form-label">GST Number</Label>
                                                        <Input
                                                            placeholder="22AAAAA0000A1Z5"
                                                            className="h-11 rounded-xl"
                                                            value={editData.gst_number || ""}
                                                            onChange={(e) => setEditData({...editData, gst_number: e.target.value})}
                                                            data-testid="edit-customer-gst-number"
                                                        />
                                                    </div>
                                                    <div>
                                                        <Label className="form-label">Billing Address</Label>
                                                        <Textarea
                                                            placeholder="Billing address for invoices"
                                                            className="rounded-xl resize-none"
                                                            rows={2}
                                                            value={editData.billing_address || ""}
                                                            onChange={(e) => setEditData({...editData, billing_address: e.target.value})}
                                                            data-testid="edit-customer-billing-address"
                                                        />
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div>
                                                            <Label className="form-label">Credit Limit</Label>
                                                            <Input
                                                                placeholder="50000"
                                                                type="number"
                                                                className="h-11 rounded-xl"
                                                                value={editData.credit_limit || ""}
                                                                onChange={(e) => setEditData({...editData, credit_limit: e.target.value})}
                                                                data-testid="edit-customer-credit-limit"
                                                            />
                                                        </div>
                                                        <div>
                                                            <Label className="form-label">Payment Terms</Label>
                                                            <Input
                                                                placeholder="Net 30"
                                                                className="h-11 rounded-xl"
                                                                value={editData.payment_terms || ""}
                                                                onChange={(e) => setEditData({...editData, payment_terms: e.target.value})}
                                                                data-testid="edit-customer-payment-terms"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Address Details Divider */}
                                            <div className="border-t pt-4 mt-4">
                                                <p className="text-xs text-gray-500 font-medium mb-3 flex items-center gap-1">
                                                    <MapPin className="w-3.5 h-3.5" /> Address Details
                                                </p>
                                            </div>

                                            {/* Address Line 1 */}
                                            <div>
                                                <Label className="form-label">Address Line 1</Label>
                                                <Textarea
                                                    placeholder="House/Flat No., Building..."
                                                    className="rounded-xl resize-none"
                                                    rows={2}
                                                    value={editData.address || ""}
                                                    onChange={(e) => setEditData({...editData, address: e.target.value})}
                                                    data-testid="edit-customer-address"
                                                />
                                            </div>

                                            {/* Address Line 2 */}
                                            <div>
                                                <Label className="form-label">Address Line 2</Label>
                                                <Input
                                                    placeholder="Street, Area, Landmark"
                                                    className="h-11 rounded-xl"
                                                    value={editData.address_line_2 || ""}
                                                    onChange={(e) => setEditData({...editData, address_line_2: e.target.value})}
                                                    data-testid="edit-customer-address-line-2"
                                                />
                                            </div>

                                            {/* City & State */}
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <Label className="form-label">City</Label>
                                                    <Input
                                                        placeholder="City"
                                                        className="h-11 rounded-xl"
                                                        value={editData.city || ""}
                                                        onChange={(e) => setEditData({...editData, city: e.target.value})}
                                                        data-testid="edit-customer-city"
                                                    />
                                                </div>
                                                <div>
                                                    <Label className="form-label">State</Label>
                                                    <Input
                                                        placeholder="State"
                                                        className="h-11 rounded-xl"
                                                        value={editData.state || ""}
                                                        onChange={(e) => setEditData({...editData, state: e.target.value})}
                                                        data-testid="edit-customer-state"
                                                    />
                                                </div>
                                            </div>

                                            {/* Pincode & Country */}
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <Label className="form-label">Pincode</Label>
                                                    <Input
                                                        placeholder="400001"
                                                        className="h-11 rounded-xl"
                                                        value={editData.pincode || ""}
                                                        onChange={(e) => setEditData({...editData, pincode: e.target.value})}
                                                        data-testid="edit-customer-pincode"
                                                    />
                                                </div>
                                                <div>
                                                    <Label className="form-label">Country</Label>
                                                    <Input
                                                        placeholder="India"
                                                        className="h-11 rounded-xl"
                                                        value={editData.country || ""}
                                                        onChange={(e) => setEditData({...editData, country: e.target.value})}
                                                        data-testid="edit-customer-country"
                                                    />
                                                </div>
                                            </div>

                                            {/* Delivery Instructions */}
                                            <div>
                                                <Label className="form-label">Delivery Instructions</Label>
                                                <Textarea
                                                    placeholder="Ring doorbell twice, leave at door..."
                                                    className="rounded-xl resize-none"
                                                    rows={2}
                                                    value={editData.delivery_instructions || ""}
                                                    onChange={(e) => setEditData({...editData, delivery_instructions: e.target.value})}
                                                    data-testid="edit-customer-delivery-instructions"
                                                />
                                            </div>
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>

                                {/* Tags & Flags */}
                                <AccordionItem value="flags" className="border-b-0">
                                    <AccordionTrigger className="hover:no-underline py-3 px-3 bg-indigo-50 rounded-xl mb-2">
                                        <span className="flex items-center gap-2 text-sm font-semibold text-indigo-600">
                                            <Tag className="w-4 h-4" /> Tags & Flags
                                        </span>
                                    </AccordionTrigger>
                                    <AccordionContent className="px-1">
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between p-3 bg-amber-50 rounded-xl">
                                                <Label className="text-sm flex items-center gap-2">
                                                    <Crown className="w-4 h-4 text-amber-500" /> VIP Customer
                                                </Label>
                                                <Switch
                                                    checked={editData.vip_flag || false}
                                                    onCheckedChange={(checked) => setEditData({...editData, vip_flag: checked})}
                                                    data-testid="edit-customer-vip-flag"
                                                />
                                            </div>
                                            <div className="flex items-center justify-between p-3 bg-red-50 rounded-xl">
                                                <Label className="text-sm flex items-center gap-2">
                                                    <Flag className="w-4 h-4 text-red-500" /> Complaint Flag
                                                </Label>
                                                <Switch
                                                    checked={editData.complaint_flag || false}
                                                    onCheckedChange={(checked) => setEditData({...editData, complaint_flag: checked})}
                                                    data-testid="edit-customer-complaint-flag"
                                                />
                                            </div>
                                            <div className="flex items-center justify-between p-3 bg-gray-100 rounded-xl">
                                                <Label className="text-sm flex items-center gap-2">
                                                    <Flag className="w-4 h-4 text-gray-500" /> Blacklisted
                                                </Label>
                                                <Switch
                                                    checked={editData.blacklist_flag || false}
                                                    onCheckedChange={(checked) => setEditData({...editData, blacklist_flag: checked})}
                                                    data-testid="edit-customer-blacklist-flag"
                                                />
                                            </div>
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>

                                {/* Notes */}
                                <AccordionItem value="notes" className="border-b-0">
                                    <AccordionTrigger className="hover:no-underline py-3 px-3 bg-gray-100 rounded-xl mb-2">
                                        <span className="flex items-center gap-2 text-sm font-semibold text-gray-600">
                                            <Edit2 className="w-4 h-4" /> Notes
                                        </span>
                                    </AccordionTrigger>
                                    <AccordionContent className="px-1">
                                        <div>
                                            <Textarea
                                                placeholder="Any special notes about this customer..."
                                                className="rounded-xl resize-none"
                                                rows={3}
                                                value={editData.notes || ""}
                                                onChange={(e) => setEditData({...editData, notes: e.target.value})}
                                                data-testid="edit-customer-notes"
                                            />
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>

                            </Accordion>
                        </ScrollArea>
                        <DialogFooter className="gap-2 pt-4 border-t">
                            <Button 
                                type="button" 
                                variant="outline" 
                                onClick={() => { setShowEditModal(false); setEditingCustomer(null); }}
                                className="rounded-full"
                            >
                                Cancel
                            </Button>
                            <Button 
                                type="submit" 
                                className="rounded-full bg-[#F26B33] hover:bg-[#D85A2A]"
                                disabled={submitting}
                                data-testid="save-edit-list-btn"
                            >
                                {submitting ? "Saving..." : "Save Changes"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </ResponsiveLayout>
    );
}
