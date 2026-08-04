import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import TagChip from "@/components/TagChip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandItem, CommandEmpty } from "@/components/ui/command";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
    Users, Plus, Search, ChevronRight, Star, TrendingUp, Gift, Phone, User, Check,
    Edit2, Trash2, Building2, Calendar, MapPin, Filter, Clock, ChevronDown, Tag,
    ChevronLeft, Save, Layers, Wallet, Rocket, Cake, Heart, Utensils, MessageCircle,
    Flag, Crown, Leaf, ChevronUp, Home, Sparkles, X,
    Upload, Download, FileSpreadsheet, History, AlertCircle, CheckCircle
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    if (!name) return "NA";
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
    const { api } = useAuth();
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
        whatsapp_opt_in: true,
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

    // CR-034: tag state
    const [availableTags, setAvailableTags] = useState([]);
    const [tagPopoverOpen, setTagPopoverOpen] = useState({});
    const [tagSearchInput, setTagSearchInput] = useState({});

    // CR-043-A: tag filter state (chip strip + multi-select popover)
    const [activeTagFilters, setActiveTagFilters] = useState(new Set());
    const [tagFilterMode, setTagFilterMode] = useState("any");
    const [tagsWithCounts, setTagsWithCounts] = useState([]);
    const [tagRefreshCounter, setTagRefreshCounter] = useState(0);
    const [showAllTagChips, setShowAllTagChips] = useState(false);

    // CR-035: Export / Import state
    const [showExportDropdown, setShowExportDropdown]   = useState(false);
    const [showImportModal, setShowImportModal]         = useState(false);
    const [importStep, setImportStep]                   = useState(1);
    const [importFile, setImportFile]                   = useState(null);
    const [importPreview, setImportPreview]             = useState(null);
    const [importResult, setImportResult]               = useState(null);
    const [importLoading, setImportLoading]             = useState(false);
    const [importHistory, setImportHistory]             = useState([]);
    const [showImportHistory, setShowImportHistory]     = useState(false);
    // CR-060: preview vs errors tab inside the import modal (Step 2)
    const [importTab, setImportTab]                     = useState("preview");

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
        // CR-043-A: tag filter
        if (activeTagFilters.size > 0) {
            params.append("tags", [...activeTagFilters].join(","));
            params.append("tags_mode", tagFilterMode);
        }
        return params.toString();
    };

    // CR-034 + CR-043-B: add tag — keeps popover open for multi-select
    // autosave, bumps refresh counter so chip strip counts update.
    const handleAddTag = async (customerId, tag) => {
        const t = tag.trim();
        if (!t) return;
        try {
            await api.post(`/customers/${customerId}/tags`, { tags: [t] });
            setCustomers(prev => prev.map(c => c.id === customerId
                ? { ...c, tags: [...new Set([...(c.tags || []), t])] }
                : c
            ));
            if (!availableTags.includes(t)) setAvailableTags(prev => [...prev, t].sort());
            // CR-043-B: clear the search input so user can search for the next
            // tag without having to delete the previous one — but keep popover OPEN.
            setTagSearchInput(p => ({ ...p, [customerId]: "" }));
            setTagRefreshCounter(c => c + 1);   // CR-043-A: refresh strip counts
        } catch { toast.error("Failed to add tag"); }
    };

    const handleRemoveTag = async (customerId, tag) => {
        try {
            await api.delete(`/customers/${customerId}/tags/${encodeURIComponent(tag)}`);
            setCustomers(prev => prev.map(c => c.id === customerId
                ? { ...c, tags: (c.tags || []).filter(t => t !== tag) }
                : c
            ));
            setTagRefreshCounter(c => c + 1);   // CR-043-A: refresh strip counts
        } catch { toast.error("Failed to remove tag"); }
    };

    // CR-043-A: chip-strip handlers
    const handleToggleTagFilter = (tag) => {
        setActiveTagFilters(prev => {
            const next = new Set(prev);
            if (next.has(tag)) next.delete(tag);
            else next.add(tag);
            return next;
        });
    };
    const handleClearTagFilters = () => setActiveTagFilters(new Set());

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

    const fetchSegments = async () => {
        try {
            const statsRes = await api.get("/customers/segments/stats");
            setSegments(statsRes.data);
        } catch (err) {
            console.error("Failed to load segments:", err);
        }
    };

    useEffect(() => {
        fetchCustomers();
        fetchSegments();
    }, [search, filters, activeTagFilters, tagFilterMode]);   // CR-043-A: react to tag filter changes

    // CR-034: fetch tag catalog once on mount
    useEffect(() => {
        api.get("/customers/tags").then(r => setAvailableTags(r.data?.tags || [])).catch(() => {});
    }, []);

    // CR-043-A: fetch tag catalog WITH counts — refreshes when tags added/removed
    useEffect(() => {
        api.get("/customers/tags?with_counts=true")
            .then(r => setTagsWithCounts(r.data?.tags || []))
            .catch(() => setTagsWithCounts([]));
    }, [tagRefreshCounter]);

    // CR-035: fetch import history once on mount
    useEffect(() => {
        api.get("/customers/import-history").then(r => setImportHistory(r.data || [])).catch(() => {});
    }, []);

    // CR-035: close export dropdown on outside click
    useEffect(() => {
        if (!showExportDropdown) return;
        const handler = (e) => {
            if (!e.target.closest("#export-btn-wrapper")) setShowExportDropdown(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [showExportDropdown]);

    // CR-035: export handler
    const handleExport = async (format) => {
        setShowExportDropdown(false);
        try {
            const response = await api.get(`/customers/export?format=${format}`, { responseType: "blob" });
            const url  = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement("a");
            link.href  = url;
            const date = new Date().toISOString().slice(0,10).replace(/-/g,"_");
            link.setAttribute("download", `customers_export_${date}.${format}`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            toast.success(`Customers exported as ${format.toUpperCase()}`);
        } catch {
            toast.error("Export failed. Please try again.");
        }
    };

    const handleDownloadTemplate = async (format = "csv") => {
        try {
            const response = await api.get(`/customers/sample-import-template?format=${format}`, { responseType: "blob" });
            const url  = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement("a");
            link.href  = url;
            link.setAttribute("download", `import_template.${format}`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch {
            toast.error("Failed to download template.");
        }
    };

    const handleFileSelect = async (file) => {
        if (!file) return;
        const name = file.name.toLowerCase();
        if (!name.endsWith(".csv") && !name.endsWith(".xlsx")) {
            toast.error("Only .csv and .xlsx files are supported.");
            return;
        }
        setImportFile(file);
        setImportLoading(true);
        try {
            const formData = new FormData();
            formData.append("file", file);
            const response = await api.post("/customers/import-preview", formData, {
                headers: { "Content-Type": "multipart/form-data" },
            });
            setImportPreview(response.data);
            setImportStep(2);
        } catch (err) {
            toast.error(err.response?.data?.detail || "Failed to parse file.");
        } finally {
            setImportLoading(false);
        }
    };

    const handleConfirmImport = async () => {
        if (!importFile) return;
        setImportLoading(true);
        try {
            const formData = new FormData();
            formData.append("file", importFile);
            const response = await api.post("/customers/import", formData, {
                headers: { "Content-Type": "multipart/form-data" },
            });
            setImportResult(response.data);
            setImportStep(3);
            fetchCustomers();
            fetchSegments();
            api.get("/customers/import-history").then(r => setImportHistory(r.data || [])).catch(() => {});
        } catch (err) {
            toast.error(err.response?.data?.detail || "Import failed.");
        } finally {
            setImportLoading(false);
        }
    };

    const resetImportModal = () => {
        setShowImportModal(false);
        setImportStep(1);
        setImportFile(null);
        setImportPreview(null);
        setImportResult(null);
        setImportLoading(false);
        setImportTab("preview");   // CR-060
    };

    // CR-060: client-side CSV download of the full error list (no backend round-trip)
    const handleDownloadErrorCsv = () => {
        if (!importPreview?.all_errors?.length) return;
        const esc = (v) => {
            if (v === null || v === undefined) return "";
            const s = String(v);
            return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const header = "row,reason\n";
        const body = importPreview.all_errors.map(e => `${esc(e.row)},${esc(e.reason)}`).join("\n");
        const blob = new Blob([header + body], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const safe = (importPreview.filename || "import").replace(/[^a-zA-Z0-9._-]/g, "_");
        a.download = `import-errors-${safe}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    };

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
            whatsapp_opt_in: true, promo_whatsapp_allowed: true,
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
                    <div className="flex gap-2 items-center">
                        {/* Sync button only shows when no customers exist */}
                        {!loading && customers.length === 0 && (
                            <Button 
                                onClick={() => navigate("/settings?tab=migration")}
                                variant="outline"
                                className="rounded-full h-10 px-4 border-[#3B82F6] text-[#3B82F6] hover:bg-[#3B82F6]/10"
                                data-testid="sync-mygenie-btn"
                            >
                                🔄 Sync MyGenie
                            </Button>
                        )}

                        {/* CR-035: Export dropdown */}
                        <div className="relative" id="export-btn-wrapper">
                            <Button
                                variant="outline"
                                onClick={() => setShowExportDropdown(v => !v)}
                                className="rounded-full h-10 px-4 border-gray-300 text-gray-700 hover:border-gray-400 hover:bg-gray-50"
                                data-testid="export-customers-btn"
                            >
                                <Download className="w-4 h-4 mr-1.5" />
                                Export
                                <ChevronDown className="w-3.5 h-3.5 ml-1" />
                            </Button>
                            {showExportDropdown && (
                                <div className="absolute top-full right-0 mt-1.5 bg-white border border-gray-100 rounded-xl shadow-lg z-50 min-w-[175px] overflow-hidden">
                                    <div className="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-50">
                                        Download all customers
                                    </div>
                                    <button
                                        onClick={() => handleExport("csv")}
                                        className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                                        data-testid="export-csv-btn"
                                    >
                                        <FileSpreadsheet className="w-4 h-4 text-green-600" />
                                        Export as CSV
                                    </button>
                                    <button
                                        onClick={() => handleExport("xlsx")}
                                        className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                                        data-testid="export-xlsx-btn"
                                    >
                                        <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
                                        Export as Excel
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* CR-035: Import button */}
                        <Button
                            variant="outline"
                            onClick={() => { setShowImportModal(true); setImportStep(1); }}
                            className="rounded-full h-10 px-4 border-gray-300 text-gray-700 hover:border-gray-400 hover:bg-gray-50"
                            data-testid="import-customers-btn"
                        >
                            <Upload className="w-4 h-4 mr-1.5" />
                            Import
                        </Button>

                        {/* Existing Add button — unchanged */}
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

                {/* CR-043-A: Tag chip strip — quick tag filters, top-6 by usage, More ▾ to expand */}
                {tagsWithCounts.length > 0 && (
                    <div
                        className="mb-4 rounded-lg border border-gray-200 bg-white p-3"
                        data-testid="tag-chip-strip"
                    >
                        <div className="mb-2 flex items-center justify-between">
                            <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                                Filter by tag
                            </span>
                            {activeTagFilters.size > 0 && (
                                <div className="flex items-center gap-3 text-xs">
                                    <label className="flex items-center gap-1 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="tag-filter-mode"
                                            checked={tagFilterMode === "any"}
                                            onChange={() => setTagFilterMode("any")}
                                            data-testid="tag-filter-mode-any"
                                        />
                                        Any
                                    </label>
                                    <label className="flex items-center gap-1 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="tag-filter-mode"
                                            checked={tagFilterMode === "all"}
                                            onChange={() => setTagFilterMode("all")}
                                            data-testid="tag-filter-mode-all"
                                        />
                                        All
                                    </label>
                                    <button
                                        onClick={handleClearTagFilters}
                                        className="text-gray-500 underline hover:text-gray-700"
                                        data-testid="tag-filter-clear"
                                    >
                                        Clear
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {(showAllTagChips ? tagsWithCounts : tagsWithCounts.slice(0, 6)).map(({ tag, count }) => {
                                const isActive = activeTagFilters.has(tag);
                                return (
                                    <button
                                        key={tag}
                                        onClick={() => handleToggleTagFilter(tag)}
                                        data-testid={`tag-chip-${tag}`}
                                        className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                                            isActive
                                                ? "bg-[#F26B33] text-white"
                                                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                                        }`}
                                    >
                                        {isActive ? "✓" : "+"}
                                        <span className="ml-1">{tag}</span>
                                        <span className={`text-[10px] ${isActive ? "text-white/80" : "text-gray-400"}`}>
                                            ({count})
                                        </span>
                                    </button>
                                );
                            })}
                            {tagsWithCounts.length > 6 && (
                                <button
                                    onClick={() => setShowAllTagChips(s => !s)}
                                    className="text-xs text-gray-600 underline hover:text-[#F26B33]"
                                    data-testid="tag-chip-more"
                                >
                                    {showAllTagChips ? "Less ▴" : `More (${tagsWithCounts.length - 6}) ▾`}
                                </button>
                            )}
                        </div>
                        {activeTagFilters.size > 0 && (
                            <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-1.5">
                                <span className="text-xs text-gray-500 mr-1 self-center">Active:</span>
                                {[...activeTagFilters].map(tag => (
                                    <span
                                        key={tag}
                                        className="inline-flex items-center gap-1 rounded-full bg-[#F26B33]/10 px-2 py-0.5 text-xs text-[#F26B33]"
                                        data-testid={`active-tag-filter-${tag}`}
                                    >
                                        {tag}
                                        <button
                                            onClick={() => handleToggleTagFilter(tag)}
                                            className="hover:opacity-70"
                                            aria-label={`Remove ${tag}`}
                                        >
                                            ✕
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                )}

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
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="px-3 py-2.5 border-t border-gray-100 bg-white flex gap-2">
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

                {/* CR-035: Import History (collapsible, shown when history exists) */}
                {importHistory.length > 0 && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-4">
                        <button
                            className="flex items-center justify-between w-full px-5 py-3.5 hover:bg-gray-50/50 transition-colors rounded-2xl"
                            onClick={() => setShowImportHistory(v => !v)}
                            data-testid="import-history-toggle"
                        >
                            <div className="flex items-center gap-2">
                                <History className="w-4 h-4 text-[#F26B33]" />
                                <span className="font-semibold text-sm text-gray-800">Import History</span>
                                <span className="text-xs text-gray-400 ml-1">({importHistory.length} run{importHistory.length > 1 ? "s" : ""})</span>
                            </div>
                            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${showImportHistory ? "rotate-180" : ""}`} />
                        </button>
                        {showImportHistory && (
                            <div className="border-t border-gray-50 divide-y divide-gray-50">
                                {importHistory.map((log, idx) => (
                                    <div key={log.id || idx} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50/50 transition-colors">
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${log.failed === 0 ? "bg-green-100" : log.imported + log.updated > 0 ? "bg-amber-100" : "bg-red-100"}`}>
                                            {log.failed === 0
                                                ? <CheckCircle className="w-4 h-4 text-green-600" />
                                                : <AlertCircle className={`w-4 h-4 ${log.imported + log.updated > 0 ? "text-amber-600" : "text-red-500"}`} />
                                            }
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium text-gray-800 truncate">{log.filename}</div>
                                            <div className="text-xs text-gray-400 mt-0.5">
                                                {new Date(log.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {log.format?.toUpperCase()}
                                            </div>
                                        </div>
                                        <div className="flex gap-3 text-xs font-semibold flex-shrink-0">
                                            {log.imported > 0 && <span className="text-green-600">+{log.imported} new</span>}
                                            {log.updated  > 0 && <span className="text-blue-600">{log.updated} updated</span>}
                                            {log.failed   > 0 && <span className="text-red-500">{log.failed} failed</span>}
                                        </div>
                                        <div className="text-xs text-gray-400 flex-shrink-0">{log.total_rows} rows</div>
                                    </div>
                                ))}
                            </div>
                        )}
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
                                                {/* CR-034: tag chips — desktop */}
                                                <td className="px-4 py-3">
                                                    <div className="flex flex-wrap gap-1 items-center">
                                                        {(customer.tags || []).map(tag => (
                                                            <span key={tag} onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
                                                                <TagChip tag={tag} onRemove={() => handleRemoveTag(customer.id, tag)} />
                                                            </span>
                                                        ))}
                                                        <Popover open={!!tagPopoverOpen[customer.id]} onOpenChange={v => setTagPopoverOpen(p => ({ ...p, [customer.id]: v }))}>
                                                            <PopoverTrigger asChild>
                                                                <button
                                                                    onClick={e => e.stopPropagation()}
                                                                    className="px-2 py-0.5 border border-dashed border-gray-300 rounded-full text-[10px] text-gray-400 hover:border-[#F26B33] hover:text-[#F26B33] transition-colors whitespace-nowrap"
                                                                    data-testid={`open-tag-popover-${customer.id}`}
                                                                >
                                                                    + tag
                                                                </button>
                                                            </PopoverTrigger>
                                                            {/* CR-043-B: multi-select autosave popover — check to add,
                                                                uncheck to remove. Search filters catalog; if the search
                                                                string doesn't match any existing tag, a "Create ..." row
                                                                appears. Popover stays open until user clicks Done. */}
                                                            <PopoverContent
                                                                className="w-[280px] p-3"
                                                                align="start"
                                                                onClick={e => e.stopPropagation()}
                                                                onPointerDown={e => e.stopPropagation()}
                                                                data-testid={`tag-popover-${customer.id}`}
                                                            >
                                                                <div className="mb-2 text-sm font-semibold text-[#1A1A1A]">
                                                                    Tags for {customer.name || "customer"}
                                                                </div>

                                                                {(customer.tags || []).length > 0 && (
                                                                    <>
                                                                        <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-gray-500">Current</div>
                                                                        <div className="mb-3 flex flex-wrap gap-1">
                                                                            {(customer.tags || []).map(t => (
                                                                                <span
                                                                                    key={t}
                                                                                    className="inline-flex items-center gap-1 rounded-full bg-[#F26B33]/10 px-2 py-0.5 text-xs text-[#F26B33]"
                                                                                    data-testid={`popover-current-tag-${customer.id}-${t}`}
                                                                                >
                                                                                    {t}
                                                                                    <button
                                                                                        onClick={() => handleRemoveTag(customer.id, t)}
                                                                                        className="hover:opacity-70"
                                                                                        aria-label={`Remove ${t}`}
                                                                                    >
                                                                                        ✕
                                                                                    </button>
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                    </>
                                                                )}

                                                                <input
                                                                    type="text"
                                                                    placeholder="Search or type a new tag…"
                                                                    value={tagSearchInput[customer.id] || ""}
                                                                    onChange={e => setTagSearchInput(p => ({ ...p, [customer.id]: e.target.value }))}
                                                                    className="mb-2 w-full text-xs px-2 py-1.5 border border-gray-200 rounded focus:outline-none focus:border-[#F26B33]"
                                                                    data-testid={`tag-search-input-${customer.id}`}
                                                                />

                                                                {(() => {
                                                                    const q = (tagSearchInput[customer.id] || "").toLowerCase();
                                                                    const catalog = tagsWithCounts.length > 0
                                                                        ? tagsWithCounts
                                                                        : availableTags.map(t => ({ tag: t, count: 0 }));
                                                                    const filtered = catalog.filter(({ tag }) => tag.toLowerCase().includes(q));
                                                                    const trimmed = (tagSearchInput[customer.id] || "").trim();
                                                                    const exactMatch = catalog.some(({ tag }) => tag.toLowerCase() === trimmed.toLowerCase());
                                                                    return (
                                                                        <>
                                                                            <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-gray-500">Available</div>
                                                                            <div className="mb-2 max-h-48 overflow-y-auto">
                                                                                {filtered.length === 0 && !trimmed && (
                                                                                    <div className="text-xs text-gray-400 px-2 py-1">No tags yet — type to create one.</div>
                                                                                )}
                                                                                {filtered.map(({ tag, count }) => {
                                                                                    const isApplied = (customer.tags || []).includes(tag);
                                                                                    return (
                                                                                        <label
                                                                                            key={tag}
                                                                                            className="flex items-center justify-between rounded px-2 py-1.5 hover:bg-gray-50 cursor-pointer"
                                                                                            data-testid={`tag-option-${customer.id}-${tag}`}
                                                                                        >
                                                                                            <span className="flex items-center gap-2 text-xs text-[#1A1A1A]">
                                                                                                <input
                                                                                                    type="checkbox"
                                                                                                    checked={isApplied}
                                                                                                    onChange={() => {
                                                                                                        if (isApplied) handleRemoveTag(customer.id, tag);
                                                                                                        else handleAddTag(customer.id, tag);
                                                                                                    }}
                                                                                                    data-testid={`tag-checkbox-${customer.id}-${tag}`}
                                                                                                />
                                                                                                <span>{tag}</span>
                                                                                            </span>
                                                                                            {count > 0 && (
                                                                                                <span className="text-[10px] text-gray-400">({count})</span>
                                                                                            )}
                                                                                        </label>
                                                                                    );
                                                                                })}
                                                                            </div>
                                                                            {trimmed && !exactMatch && (
                                                                                <button
                                                                                    onClick={() => handleAddTag(customer.id, trimmed)}
                                                                                    className="w-full mb-2 rounded-md bg-[#F26B33] px-3 py-2 text-xs font-medium text-white hover:bg-[#F26B33]/90"
                                                                                    data-testid={`popover-create-tag-${customer.id}`}
                                                                                >
                                                                                    + Create &quot;{trimmed}&quot;
                                                                                </button>
                                                                            )}
                                                                        </>
                                                                    );
                                                                })()}

                                                                <div className="flex justify-end pt-2 border-t border-gray-100">
                                                                    <button
                                                                        onClick={() => setTagPopoverOpen(p => ({ ...p, [customer.id]: false }))}
                                                                        className="text-xs font-medium text-[#F26B33] hover:opacity-70"
                                                                        data-testid={`popover-done-${customer.id}`}
                                                                    >
                                                                        Done
                                                                    </button>
                                                                </div>
                                                            </PopoverContent>
                                                        </Popover>
                                                    </div>
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
                                        {/* CR-034: tag chips — mobile */}
                                        {(customer.tags || []).length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-2 px-1">
                                                {(customer.tags || []).map(tag => (
                                                    <TagChip key={tag} tag={tag} onRemove={() => handleRemoveTag(customer.id, tag)} />
                                                ))}
                                            </div>
                                        )}
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

                                            {/* BUG-011: WhatsApp opt-in toggle (was a hidden false default) */}
                                            <div className="flex items-center justify-between rounded-xl border border-gray-200 px-3 py-2.5">
                                                <div>
                                                    <Label className="form-label mb-0">WhatsApp Opt-In</Label>
                                                    <p className="text-[11px] text-gray-500">Off = customer is excluded from all WhatsApp campaigns</p>
                                                </div>
                                                <Switch
                                                    checked={newCustomer.whatsapp_opt_in}
                                                    onCheckedChange={(v) => setNewCustomer({...newCustomer, whatsapp_opt_in: v})}
                                                    data-testid="new-customer-whatsapp-opt-in"
                                                />
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

                                            {/* BUG-011: WhatsApp opt-in toggle */}
                                            <div className="flex items-center justify-between rounded-xl border border-gray-200 px-3 py-2.5">
                                                <div>
                                                    <Label className="form-label mb-0">WhatsApp Opt-In</Label>
                                                    <p className="text-[11px] text-gray-500">Off = customer is excluded from all WhatsApp campaigns</p>
                                                </div>
                                                <Switch
                                                    checked={editData.whatsapp_opt_in !== false}
                                                    onCheckedChange={(v) => setEditData({...editData, whatsapp_opt_in: v})}
                                                    data-testid="edit-customer-whatsapp-opt-in"
                                                />
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

            {/* CR-035: Import Modal */}
            <Dialog open={showImportModal} onOpenChange={(open) => { if (!open) resetImportModal(); }}>
                {/* CR-060: expanded modal so the Errors tab has room for a scrollable table */}
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="font-['Montserrat'] text-lg">
                            {importStep === 3 ? "Import Complete" : "Import Customers"}
                        </DialogTitle>
                        {importStep < 3 && (
                            <p className="text-xs text-gray-500 mt-0.5">
                                {importStep === 1
                                    ? "Upload a CSV or Excel file — max 5,000 rows"
                                    : `${importPreview?.filename} · ${importPreview?.total_rows} rows detected`
                                }
                            </p>
                        )}
                    </DialogHeader>

                    {/* Step indicator */}
                    <div className="flex items-center gap-2 my-1">
                        {[1,2,3].map((s, i) => (
                            <div key={s} className="flex items-center gap-2 flex-1">
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-colors ${importStep > s ? "bg-green-500 text-white" : importStep === s ? "bg-[#F26B33] text-white" : "bg-gray-200 text-gray-400"}`}>
                                    {importStep > s ? <CheckCircle className="w-3.5 h-3.5" /> : s}
                                </div>
                                {i < 2 && <div className={`flex-1 h-0.5 transition-colors ${importStep > s ? "bg-green-500" : "bg-gray-200"}`} />}
                            </div>
                        ))}
                        <span className="ml-1 text-xs text-gray-400 flex-shrink-0">Step {importStep} of 3</span>
                    </div>

                    {/* Step 1: Upload */}
                    {importStep === 1 && (
                        <div>
                            <label
                                htmlFor="import-file-input"
                                className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-xl p-8 cursor-pointer hover:border-[#F26B33] hover:bg-orange-50/30 transition-all mb-4"
                                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("border-[#F26B33]", "bg-orange-50/30"); }}
                                onDragLeave={(e) => { e.currentTarget.classList.remove("border-[#F26B33]", "bg-orange-50/30"); }}
                                onDrop={(e) => { e.preventDefault(); handleFileSelect(e.dataTransfer.files[0]); }}
                                data-testid="import-dropzone"
                            >
                                {importLoading
                                    ? <div className="flex flex-col items-center gap-2">
                                        <div className="w-8 h-8 border-2 border-[#F26B33] border-t-transparent rounded-full animate-spin" />
                                        <p className="text-sm text-gray-500">Parsing file…</p>
                                      </div>
                                    : <>
                                        <Upload className="w-10 h-10 text-gray-300 mb-2" />
                                        <p className="font-semibold text-gray-700 text-sm">Drop file here, or <span className="text-[#F26B33]">browse</span></p>
                                        <p className="text-xs text-gray-400 mt-1">Supports .csv and .xlsx — max 5,000 rows</p>
                                      </>
                                }
                                <input id="import-file-input" type="file" accept=".csv,.xlsx" className="hidden" onChange={(e) => handleFileSelect(e.target.files[0])} data-testid="import-file-input" />
                            </label>
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-xs text-amber-700">
                                <span className="font-semibold">Required columns:</span> <code className="bg-amber-100 px-1 rounded">name</code> and <code className="bg-amber-100 px-1 rounded">phone</code>. Optional: email, dob, city, address, tags (comma-separated). Duplicate phone → update existing customer.
                            </div>
                            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                                <span className="text-xs text-gray-600">Not sure of the format?</span>
                                <button onClick={() => handleDownloadTemplate("csv")} className="text-xs font-semibold text-[#F26B33] hover:underline flex items-center gap-1">
                                    <Download className="w-3 h-3" /> Download Sample CSV
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 2: Preview */}
                    {importStep === 2 && importPreview && (
                        <div>
                            <div className="grid grid-cols-3 gap-3 mb-4">
                                <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                                    <div className="text-xl font-bold text-green-700">{importPreview.new_count}</div>
                                    <div className="text-xs text-green-600 mt-0.5">New</div>
                                </div>
                                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
                                    <div className="text-xl font-bold text-blue-700">{importPreview.update_count}</div>
                                    <div className="text-xs text-blue-600 mt-0.5">Will update</div>
                                </div>
                                {/* CR-060: Errors card is clickable → jumps to Errors tab */}
                                <button
                                    type="button"
                                    data-testid="import-errors-card"
                                    onClick={() => importPreview.error_count > 0 && setImportTab("errors")}
                                    disabled={importPreview.error_count === 0}
                                    className={`bg-red-50 border rounded-xl p-3 text-center transition-all ${
                                        importPreview.error_count === 0
                                            ? "border-red-200 cursor-default"
                                            : "cursor-pointer hover:bg-red-100 " + (importTab === "errors" ? "border-red-500 ring-2 ring-red-200" : "border-red-200")
                                    }`}
                                >
                                    <div className="text-xl font-bold text-red-600">{importPreview.error_count}</div>
                                    <div className="text-xs text-red-500 mt-0.5">Errors{importPreview.error_count > 0 ? " · view" : ""}</div>
                                </button>
                            </div>

                            {/* CR-060: tab bar — Preview | Errors (Errors hidden when count=0) */}
                            <div className="flex items-center gap-1 border-b border-gray-100 mb-3">
                                <button
                                    type="button"
                                    data-testid="import-tab-preview"
                                    onClick={() => setImportTab("preview")}
                                    className={`px-3 py-2 text-xs font-semibold transition-colors border-b-2 -mb-px ${
                                        importTab === "preview"
                                            ? "border-[#F26B33] text-[#F26B33]"
                                            : "border-transparent text-gray-500 hover:text-gray-700"
                                    }`}
                                >
                                    Preview (first 5)
                                </button>
                                {importPreview.error_count > 0 && (
                                    <button
                                        type="button"
                                        data-testid="import-tab-errors"
                                        onClick={() => setImportTab("errors")}
                                        className={`px-3 py-2 text-xs font-semibold transition-colors border-b-2 -mb-px ${
                                            importTab === "errors"
                                                ? "border-red-500 text-red-600"
                                                : "border-transparent text-gray-500 hover:text-gray-700"
                                        }`}
                                    >
                                        Errors ({importPreview.error_count})
                                    </button>
                                )}
                            </div>

                            {/* CR-060: Preview tab body */}
                            {importTab === "preview" && (
                                <>
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Preview — first 5 rows</p>
                                    <div className="rounded-xl border border-gray-100 overflow-hidden mb-4">
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-xs">
                                                <thead className="bg-gray-50"><tr>
                                                    <th className="px-3 py-2 text-left font-semibold text-gray-500">#</th>
                                                    <th className="px-3 py-2 text-left font-semibold text-gray-500">Name</th>
                                                    <th className="px-3 py-2 text-left font-semibold text-gray-500">Phone</th>
                                                    <th className="px-3 py-2 text-left font-semibold text-gray-500">Status</th>
                                                </tr></thead>
                                                <tbody className="divide-y divide-gray-50">
                                                    {importPreview.preview_rows.map(row => (
                                                        <tr key={row.row} className={row.status === "error" ? "bg-red-50/60" : ""}>
                                                            <td className="px-3 py-2 text-gray-400">{row.row}</td>
                                                            <td className="px-3 py-2 font-medium">{row.name || <span className="text-gray-400 italic">—</span>}</td>
                                                            <td className="px-3 py-2 text-gray-600">{row.phone || <span className="text-red-500">missing</span>}</td>
                                                            <td className="px-3 py-2">
                                                                {row.status === "new"    && <span className="text-green-600 font-medium">New</span>}
                                                                {row.status === "update" && <span className="text-blue-600 font-medium">Update</span>}
                                                                {row.status === "error"  && <span className="text-red-500 font-medium text-xs">{row.reason}</span>}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                    {importPreview.error_count > 0 && (
                                        <div className="bg-red-50 border border-red-100 rounded-xl p-2.5 mb-3 text-xs text-red-600 flex items-start gap-2">
                                            <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                                            <span>
                                                <span className="font-semibold">{importPreview.error_count} row{importPreview.error_count > 1 ? "s" : ""} will be skipped</span> due to errors. Valid rows ({importPreview.new_count + importPreview.update_count}) will still import.{" "}
                                                <button
                                                    type="button"
                                                    onClick={() => setImportTab("errors")}
                                                    className="font-semibold underline hover:no-underline"
                                                    data-testid="import-errors-inline-link"
                                                >
                                                    View all errors →
                                                </button>
                                            </span>
                                        </div>
                                    )}
                                </>
                            )}

                            {/* CR-060: Errors tab body — full scrollable error list + CSV download */}
                            {importTab === "errors" && importPreview.error_count > 0 && (
                                <>
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                            All errors — {importPreview.error_count} row{importPreview.error_count > 1 ? "s" : ""} skipped
                                        </p>
                                        <button
                                            type="button"
                                            onClick={handleDownloadErrorCsv}
                                            data-testid="import-errors-download"
                                            className="text-xs font-semibold text-[#F26B33] hover:underline flex items-center gap-1"
                                        >
                                            <Download className="w-3 h-3" /> Download error rows (CSV)
                                        </button>
                                    </div>
                                    <div className="rounded-xl border border-red-100 overflow-hidden mb-4">
                                        <div className="max-h-[240px] overflow-y-auto">
                                            <table className="w-full text-xs">
                                                <thead className="bg-red-50 sticky top-0 z-10">
                                                    <tr>
                                                        <th className="px-3 py-2 text-left font-semibold text-red-700 w-16">Row</th>
                                                        <th className="px-3 py-2 text-left font-semibold text-red-700">Reason</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-red-50">
                                                    {importPreview.all_errors.map((e, idx) => (
                                                        <tr key={`${e.row}-${idx}`} className="bg-white hover:bg-red-50/40" data-testid={`import-error-row-${e.row}`}>
                                                            <td className="px-3 py-2 text-gray-500 font-mono">{e.row}</td>
                                                            <td className="px-3 py-2 text-red-700">{e.reason}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-2.5 mb-3 text-xs text-amber-700 flex items-start gap-2">
                                        <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                                        <span>Fix these rows in your source file and re-upload, or proceed to import only the valid rows ({importPreview.new_count + importPreview.update_count}).</span>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* Step 3: Result */}
                    {importStep === 3 && importResult && (
                        <div>
                            <div className="text-center mb-5">
                                <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                    <CheckCircle className="w-7 h-7 text-green-600" />
                                </div>
                                <h3 className="text-lg font-bold font-['Montserrat'] text-gray-900">Import Successful</h3>
                                <p className="text-xs text-gray-400 mt-1">{importResult.filename}</p>
                            </div>
                            <div className="grid grid-cols-3 gap-3 mb-4">
                                <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                                    <div className="text-2xl font-bold text-green-700">{importResult.imported}</div>
                                    <div className="text-xs text-green-600 mt-0.5">Created</div>
                                </div>
                                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
                                    <div className="text-2xl font-bold text-blue-700">{importResult.updated}</div>
                                    <div className="text-xs text-blue-600 mt-0.5">Updated</div>
                                </div>
                                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                                    <div className="text-2xl font-bold text-red-600">{importResult.failed}</div>
                                    <div className="text-xs text-red-500 mt-0.5">Failed</div>
                                </div>
                            </div>
                            {importResult.errors?.length > 0 && (
                                <div className="bg-gray-50 rounded-xl border border-gray-100 p-3 mb-3">
                                    <p className="text-xs font-semibold text-gray-600 mb-2">Failed rows (skipped)</p>
                                    <div className="space-y-1.5 max-h-32 overflow-y-auto">
                                        {importResult.errors.slice(0, 10).map((e, i) => (
                                            <div key={i} className="flex items-center gap-2 text-xs">
                                                <span className="bg-red-100 text-red-600 rounded px-1.5 py-0.5 font-mono font-medium">Row {e.row}</span>
                                                <span className="text-gray-500">{e.reason}</span>
                                            </div>
                                        ))}
                                        {importResult.errors.length > 10 && (
                                            <p className="text-xs text-gray-400">…and {importResult.errors.length - 10} more</p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <DialogFooter className="flex gap-3 mt-2">
                        {importStep === 1 && (
                            <Button variant="outline" className="flex-1 rounded-full" onClick={resetImportModal}>Cancel</Button>
                        )}
                        {importStep === 2 && (
                            <>
                                <Button variant="outline" className="flex-1 rounded-full" onClick={() => { setImportStep(1); setImportPreview(null); }} disabled={importLoading}>← Back</Button>
                                <Button
                                    className="flex-1 rounded-full bg-[#F26B33] hover:bg-[#D85A2A] text-white"
                                    onClick={handleConfirmImport}
                                    disabled={importLoading || (importPreview?.new_count + importPreview?.update_count === 0)}
                                    data-testid="confirm-import-btn"
                                >
                                    {importLoading
                                        ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />Importing…</>
                                        : `Import ${(importPreview?.new_count || 0) + (importPreview?.update_count || 0)} Customers`
                                    }
                                </Button>
                            </>
                        )}
                        {importStep === 3 && (
                            <>
                                <Button variant="outline" className="flex-1 rounded-full" onClick={() => { resetImportModal(); setShowImportHistory(true); }}>View History</Button>
                                <Button className="flex-1 rounded-full bg-[#F26B33] hover:bg-[#D85A2A] text-white" onClick={resetImportModal} data-testid="import-done-btn">Done</Button>
                            </>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </ResponsiveLayout>
    );
}
