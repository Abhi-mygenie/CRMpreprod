import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { MessageSquare, Settings, Plus, Edit2, Trash2, Eye, EyeOff, Filter, Clock, Tag, Save, Wallet, KeyRound, Send, Loader2, Lock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveLayout } from "@/components/ResponsiveLayout";
import VariablePicker from "@/components/templates/VariablePicker";
import MenuPickModal from "@/components/templates/MenuPickModal";

export default function TemplatesPage() {
    const { api, user } = useAuth();
    const navigate = useNavigate();
    
    const [whatsappApiKey, setWhatsappApiKey] = useState("");
    const [authkeyTemplates, setAuthkeyTemplates] = useState([]);
    const [loadingAuthkeyTemplates, setLoadingAuthkeyTemplates] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    
    // Template filter state
    const [templateFilter, setTemplateFilter] = useState("approved");
    const [categoryFilter, setCategoryFilter] = useState("all");
    const [mappingToggle, setMappingToggle] = useState("mapped");
    
    // Custom template state
    const [customTemplates, setCustomTemplates] = useState([]);
    const [showAddTemplate, setShowAddTemplate] = useState(false);
    const [editingCustomTemplate, setEditingCustomTemplate] = useState(null);
    const [newTemplate, setNewTemplate] = useState({
        template_name: "", category: "utility", language: "en", header_type: "none", header_content: "", body: "", footer: "", buttons: [], media_url: "", body_examples: [], header_examples: []
    });
    const [savingTemplate, setSavingTemplate] = useState(false);
    const [submittingToMeta, setSubmittingToMeta] = useState(false);
    
    // Variable mapping state
    const [showVariableMappingModal, setShowVariableMappingModal] = useState(false);
    const [mappingTemplate, setMappingTemplate] = useState(null);
    const [variableMappings, setVariableMappings] = useState({});
    const [variableMappingModes, setVariableMappingModes] = useState({});
    const [templateVariableMappings, setTemplateVariableMappings] = useState({});
    const [templateVariableModes, setTemplateVariableModes] = useState({});
    const [savingVariableMapping, setSavingVariableMapping] = useState(false);
    
    // Template in-use tracking (Rule 2: mapped templates can't be deleted)
    const [inUseTemplateIds, setInUseTemplateIds] = useState(new Set());
    
    // Sample customer data for previews
    const [sampleCustomerData, setSampleCustomerData] = useState({});
    
    // Template preview state
    const [expandedPreviews, setExpandedPreviews] = useState({});
    
    // Available variables — fetched from API (CR-004 P1)
    const [availableVariables, setAvailableVariables] = useState([]);

    // CR-020: Variable picker + Menu pick state
    const [pickerOpenFor, setPickerOpenFor] = useState(null); // which {{n}} slot has picker open
    const [menuPickOpenFor, setMenuPickOpenFor] = useState(null); // which {{n}} slot has menu pick open
    const [menuPickResolved, setMenuPickResolved] = useState({}); // { "menu_item:123:name": "Veg Biryani" }
    const [templateMenuPickResolved, setTemplateMenuPickResolved] = useState({}); // per template_id
    const [menuPickInitialTab, setMenuPickInitialTab] = useState("items"); // "items" or "categories"
    // Detect event key for the current template (for suggested chips)
    const [currentEventKey, setCurrentEventKey] = useState("");

    // CR-DIRECT-SEND: Variable labels modal state
    const [showLabelsModal, setShowLabelsModal] = useState(false);
    const [labelsTemplate, setLabelsTemplate] = useState(null);
    const [labelsData, setLabelsData] = useState({});   // {"1": "name", "2": "meeting_link"}
    const [savingLabels, setSavingLabels] = useState(false);

    // CR-004 P2.5-B: Coupon picker state (shared with Automation page)
    const [couponSummary, setCouponSummary] = useState([]);
    const [couponSummaryLoading, setCouponSummaryLoading] = useState(false);
    const [couponSummaryError, setCouponSummaryError] = useState(null);
    const [couponSearchQuery, setCouponSearchQuery] = useState("");
    const [selectedCouponId, setSelectedCouponId] = useState(null);

    const fetchCouponSummary = async () => {
        setCouponSummaryLoading(true);
        setCouponSummaryError(null);
        try {
            const res = await api.get("/coupons/summary");
            setCouponSummary(res.data.coupons || []);
        } catch (err) {
            setCouponSummaryError("Unable to load coupons. Check your connection and try again.");
        } finally {
            setCouponSummaryLoading(false);
        }
    };

    const parseCouponPickMapping = (mapping) => {
        if (!mapping) return null;
        const parts = mapping.split(":");
        if (parts.length === 3 && parts[0] === "coupon") return { couponId: parts[1], field: parts[2] };
        return null;
    };

    const getCouponPickPreviewValue = (mapping) => {
        const parsed = parseCouponPickMapping(mapping);
        if (!parsed) return null;
        const coupon = couponSummary.find(c => c.id === parsed.couponId);
        if (!coupon) return null;
        return { code: coupon.code, title: coupon.title, discount: coupon.discount_display, expiry: coupon.end_date_display }[parsed.field] || "";
    };

    const handleCouponSelect = (coupon) => {
        setSelectedCouponId(coupon.id);
        const newMappings = { ...variableMappings };
        const newModes = { ...variableMappingModes };
        (mappingTemplate?.variables || []).forEach(varKey => {
            const currentMapping = newMappings[varKey];
            const currentField = availableVariables.find(v => v.key === currentMapping);
            if (currentField?.picker === "coupon") {
                const couponField = currentField.key.replace("coupon_", "");
                newMappings[varKey] = `coupon:${coupon.id}:${couponField}`;
                newModes[varKey] = "coupon_pick";
            }
        });
        setVariableMappings(newMappings);
        setVariableMappingModes(newModes);
    };

    const resolvePreviewWithSampleData = (templateBody, mappings, modes, menuResolved) => {
        if (!templateBody) return [];
        const parts = [];
        const varRegex = /\{\{\d+\}\}/g;
        let match;
        let lastIndex = 0;
        while ((match = varRegex.exec(templateBody)) !== null) {
            if (match.index > lastIndex) {
                parts.push({ type: "text", value: templateBody.slice(lastIndex, match.index) });
            }
            const varKey = match[0];
            const mappedField = mappings?.[varKey];
            const mode = modes?.[varKey] || "map";
            if (mappedField && mappedField !== "none") {
                let sampleValue;
                if (mode === "text") sampleValue = mappedField;
                else if (mode === "coupon_pick") sampleValue = getCouponPickPreviewValue(mappedField);
                else if (mode === "menu_pick") sampleValue = (menuResolved || menuPickResolved || {})[mappedField] || "";
                else {
                    sampleValue = sampleCustomerData[mappedField];
                    // CR-015a: fall back to registry example when sample-data lacks the key
                    if (sampleValue === undefined || sampleValue === null || String(sampleValue).trim() === "") {
                        sampleValue = availableVariables.find(v => v.key === mappedField)?.example;
                    }
                }
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
        return parts;
    };

    const isTemplateFullyMapped = (tpl) => {
        const variables = (tpl.temp_body.match(/\{\{\d+\}\}/g) || []).filter((v, i, a) => a.indexOf(v) === i);
        if (variables.length === 0) return true;
        const mappings = templateVariableMappings[tpl.wid] || {};
        return variables.every(v => mappings[v] && mappings[v] !== "none");
    };

    const isTemplateInUse = (templateId) => inUseTemplateIds.has(String(templateId));

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [tplRes, varMapRes, sampleRes, customRes, varsRes, inUseRes] = await Promise.all([
                    api.get("/whatsapp/authkey-templates"),
                    api.get("/whatsapp/template-variable-map"),
                    api.get("/customers/sample-data"),
                    api.get("/whatsapp/custom-templates"),
                    api.get("/whatsapp/variables"),
                    api.get("/whatsapp/templates-in-use"),
                ]);
                const _rawTpls = tplRes.data.templates || [];
                _rawTpls.forEach(t => { if (t.temp_body) t.temp_body = t.temp_body.replace(/\\n/g, "\n").replace(/\\'/g, "'"); });
                setAuthkeyTemplates(_rawTpls);
                setAvailableVariables(varsRes.data.variables || []);
                setInUseTemplateIds(new Set(inUseRes.data.in_use_template_ids || []));
                const varMapObj = {};
                const varModesObj = {};
                const menuResolvedObj = {};
                (varMapRes.data.mappings || []).forEach(m => {
                    varMapObj[m.template_id] = m.mappings || {};
                    varModesObj[m.template_id] = m.modes || {};
                    menuResolvedObj[m.template_id] = m.menu_pick_resolved || {};
                });
                setTemplateVariableMappings(varMapObj);
                setTemplateVariableModes(varModesObj);
                setTemplateMenuPickResolved(menuResolvedObj);
                const sample = sampleRes.data.sample || {};
                sample.restaurant_name = sampleRes.data.restaurant_name || "";
                setSampleCustomerData(sample);
                setCustomTemplates(customRes.data.templates || []);
            } catch (err) {
                console.error("Failed to load templates data:", err);
            }
            // Get API key
            try {
                const res = await api.get("/whatsapp/api-key");
                setWhatsappApiKey(res.data.authkey_api_key || "");
            } catch (_) {}
            setInitialLoading(false);
        };
        fetchData();
    }, []);

    const openVariableMappingModal = (template) => {
        const variables = (template.temp_body.match(/\{\{\d+\}\}/g) || []).filter((v, i, a) => a.indexOf(v) === i);
        setMappingTemplate({ ...template, variables });
        const existingMappings = templateVariableMappings[template.wid] || {};
        const existingModes = templateVariableModes[template.wid] || {};
        setVariableMappings(existingMappings);
        setVariableMappingModes(existingModes);
        // CR-004 P2.5-B: Detect existing coupon_pick
        let detectedCouponId = null;
        for (const [, mapped] of Object.entries(existingMappings)) {
            const parsed = parseCouponPickMapping(mapped);
            if (parsed) { detectedCouponId = parsed.couponId; break; }
        }
        setSelectedCouponId(detectedCouponId);
        setCouponSearchQuery("");
        if (couponSummary.length === 0) fetchCouponSummary();
        // CR-020: Load menu_pick_resolved from stored data
        setMenuPickResolved(templateMenuPickResolved[template.wid] || {});
        setPickerOpenFor(null);
        setMenuPickOpenFor(null);
        // Detect event key for suggested chips
        setCurrentEventKey("");
        // Try to detect from event template map (async)
        api.get("/whatsapp/event-template-map").then(res => {
            const maps = res.data?.mappings || res.data?.events || [];
            const match = maps.find(m => String(m.template_id) === String(template.wid));
            if (match) setCurrentEventKey(match.event_key || "");
        }).catch(() => {});
        setShowVariableMappingModal(true);
    };

    const handleSaveVariableMapping = async () => {
        setSavingVariableMapping(true);
        try {
            const res = await api.put(`/whatsapp/template-variable-map/${mappingTemplate.wid}`, {
                template_id: mappingTemplate.wid, template_name: mappingTemplate.temp_name,
                mappings: variableMappings, modes: variableMappingModes,
                menu_pick_resolved: menuPickResolved,
            });
            const warnings = res.data?.warnings || [];
            if (warnings.length > 0) {
                warnings.forEach(w => toast.warning(w.message, { duration: 5000 }));
            }
            setTemplateVariableMappings(prev => ({ ...prev, [mappingTemplate.wid]: variableMappings }));
            setTemplateVariableModes(prev => ({ ...prev, [mappingTemplate.wid]: variableMappingModes }));
            toast.success("Variable mappings saved!");
            setShowVariableMappingModal(false);
            setMappingTemplate(null);
            setVariableMappings({});
            setVariableMappingModes({});
        } catch (err) { toast.error("Failed to save variable mappings"); }
        finally { setSavingVariableMapping(false); }
    };

    const fetchCustomTemplates = async () => {
        try {
            const res = await api.get("/whatsapp/custom-templates");
            setCustomTemplates(res.data.templates || []);
        } catch (_) {}
    };

    const handleSaveCustomTemplate = async () => {
        if (!newTemplate.template_name.trim() || !newTemplate.body.trim()) { toast.error("Template name and body are required"); return; }
        setSavingTemplate(true);
        try {
            if (editingCustomTemplate) {
                await api.put(`/whatsapp/custom-templates/${editingCustomTemplate.id}`, newTemplate);
                toast.success("Template updated!");
            } else {
                await api.post("/whatsapp/custom-templates", newTemplate);
                toast.success("Template created!");
            }
            setShowAddTemplate(false);
            setEditingCustomTemplate(null);
            setNewTemplate({ template_name: "", category: "utility", language: "en", header_type: "none", header_content: "", body: "", footer: "", buttons: [], media_url: "", body_examples: [], header_examples: [] });
            fetchCustomTemplates();
        } catch (err) { toast.error("Failed to save template"); }
        finally { setSavingTemplate(false); }
    };

    const handleSubmitToMeta = async () => {
        if (!newTemplate.template_name.trim() || !newTemplate.body.trim()) { 
            toast.error("Template name and body are required"); 
            return; 
        }
        
        // Check if body has variables and examples are provided
        const bodyVarCount = (newTemplate.body.match(/\{\{\d+\}\}/g) || []).length;
        if (bodyVarCount > 0 && newTemplate.body_examples.length < bodyVarCount) {
            toast.error(`Please provide ${bodyVarCount} example values for body variables`);
            return;
        }
        
        setSubmittingToMeta(true);
        try {
            const response = await api.post("/whatsapp/create-and-sync-template", newTemplate);
            toast.success(response.data.message || "Template submitted to Meta successfully!");
            setShowAddTemplate(false);
            setEditingCustomTemplate(null);
            setNewTemplate({ template_name: "", category: "utility", language: "en", header_type: "none", header_content: "", body: "", footer: "", buttons: [], media_url: "", body_examples: [], header_examples: [] });
            fetchCustomTemplates();
        } catch (err) { 
            toast.error(err.response?.data?.detail || "Failed to submit template to Meta"); 
        }
        finally { setSubmittingToMeta(false); }
    };

    const handleDeleteCustomTemplate = async (templateId) => {
        try { await api.delete(`/whatsapp/custom-templates/${templateId}`); toast.success("Template deleted"); fetchCustomTemplates(); }
        catch (err) { toast.error("Failed to delete template"); }
    };

    const handleSubmitCustomTemplate = async (templateId) => {
        try { await api.put(`/whatsapp/custom-templates/${templateId}/submit`); toast.success("Template submitted for approval"); fetchCustomTemplates(); }
        catch (err) { toast.error("Failed to submit template"); }
    };

    // CR-DIRECT-SEND: Open labels modal for a CRM template
    const openLabelsModal = (template) => {
        const vars = (template.body || "").match(/\{\{\d+\}\}/g) || [];
        const uniqueVars = [...new Set(vars)].sort((a, b) => {
            const na = parseInt(a.replace(/[{}]/g, ""));
            const nb = parseInt(b.replace(/[{}]/g, ""));
            return na - nb;
        });
        setLabelsTemplate({ ...template, parsedVars: uniqueVars });
        // Pre-populate from existing variable_labels
        const existing = template.variable_labels || {};
        const initialLabels = {};
        uniqueVars.forEach(v => {
            const idx = v.replace(/[{}]/g, "");
            initialLabels[idx] = existing[idx] || "";
        });
        setLabelsData(initialLabels);
        setShowLabelsModal(true);
    };

    const handleSaveLabels = async () => {
        if (!labelsTemplate) return;
        setSavingLabels(true);
        try {
            await api.patch(`/whatsapp/custom-templates/${labelsTemplate.id}/labels`, {
                variable_labels: labelsData
            });
            toast.success("Direct-send labels saved!");
            setShowLabelsModal(false);
            setLabelsTemplate(null);
            setLabelsData({});
            fetchCustomTemplates();
        } catch (err) {
            toast.error("Failed to save labels");
        } finally {
            setSavingLabels(false);
        }
    };

    const openEditCustomTemplate = (template) => {
        setEditingCustomTemplate(template);
        setNewTemplate({
            template_name: template.template_name, category: template.category, language: template.language,
            header_type: template.header_type || "none", header_content: template.header_content || "",
            body: template.body, footer: template.footer || "", buttons: template.buttons || [], media_url: template.media_url || "",
            body_examples: template.body_examples || [], header_examples: template.header_examples || []
        });
        setShowAddTemplate(true);
    };

    return (
        <ResponsiveLayout>
            <div className="p-4 lg:p-6 xl:p-8 max-w-[1600px] mx-auto">
                <div className="flex items-center gap-3 mb-4">
                    <div>
                        <h1 className="text-2xl font-bold text-[#1A1A1A] font-['Montserrat']" data-testid="templates-title">
                            Templates
                        </h1>
                        <p className="text-sm text-[#52525B]">Manage WhatsApp message templates</p>
                    </div>
                </div>
                
                {initialLoading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="w-8 h-8 animate-spin text-[#22C55E]" />
                    </div>
                ) : !whatsappApiKey ? (
                    <Card className="rounded-xl border-0 shadow-sm">
                        <CardContent className="p-8 text-center">
                            <KeyRound className="w-12 h-12 text-amber-400 mx-auto mb-3" />
                            <p className="text-[#52525B]">API Key Required</p>
                            <p className="text-xs text-gray-400 mt-1">Add your AuthKey.io API key in Settings → WhatsApp</p>
                            <Button onClick={() => navigate("/settings")} variant="outline" className="mt-4">Go to Settings</Button>
                        </CardContent>
                    </Card>
                ) : authkeyTemplates.length === 0 && !loadingAuthkeyTemplates ? (
                    <Card className="rounded-xl border-0 shadow-sm">
                        <CardContent className="p-8 text-center">
                            <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                            <p className="text-[#52525B]">No templates found</p>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="space-y-3">
                        {(() => {
                            const approvedAuthkey = authkeyTemplates.filter(tpl => tpl.temp_status === 1);
                            const pendingAuthkey = authkeyTemplates.filter(tpl => tpl.temp_status === 4);
                            const rejectedAuthkey = authkeyTemplates.filter(tpl => tpl.temp_status === 3);
                            const mappedCount = approvedAuthkey.filter(tpl => isTemplateFullyMapped(tpl)).length;
                            const notMappedCount = approvedAuthkey.length - mappedCount;
                            
                            let displayTemplates = [];
                            let displayDrafts = [];
                            
                            if (templateFilter === "all") { displayTemplates = authkeyTemplates; displayDrafts = customTemplates; }
                            else if (templateFilter === "approved") {
                                displayTemplates = approvedAuthkey;
                                // CR-DIRECT-SEND: Also show approved CRM templates so users can set labels
                                displayDrafts = customTemplates.filter(ct => ct.status === "approved");
                                if (mappingToggle === "mapped") {
                                    displayTemplates = displayTemplates.filter(tpl => { const vars = (tpl.temp_body.match(/\{\{\d+\}\}/g) || []).filter((v, i, a) => a.indexOf(v) === i); return vars.length === 0 || isTemplateFullyMapped(tpl); });
                                } else {
                                    displayTemplates = displayTemplates.filter(tpl => { const vars = (tpl.temp_body.match(/\{\{\d+\}\}/g) || []).filter((v, i, a) => a.indexOf(v) === i); return vars.length > 0 && !isTemplateFullyMapped(tpl); });
                                }
                            } else if (templateFilter === "pending") { displayTemplates = pendingAuthkey; displayDrafts = customTemplates.filter(ct => ct.status === "pending"); }
                            else if (templateFilter === "rejected") { displayTemplates = rejectedAuthkey; displayDrafts = customTemplates.filter(ct => ct.status === "rejected"); }
                            else if (templateFilter === "draft") { displayDrafts = customTemplates.filter(ct => ct.status === "draft"); }
                            
                            if (categoryFilter !== "all") { displayDrafts = displayDrafts.filter(ct => ct.category === categoryFilter); displayTemplates = []; }
                            
                            return (
                                <>
                                    <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <Select value={templateFilter} onValueChange={(val) => { setTemplateFilter(val); if (val === "approved") setMappingToggle("mapped"); }}>
                                                <SelectTrigger className="h-9 w-[140px] rounded-full text-sm" data-testid="status-filter"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="approved">Approved ({approvedAuthkey.length})</SelectItem>
                                                    <SelectItem value="pending">Pending ({pendingAuthkey.length})</SelectItem>
                                                    <SelectItem value="rejected">Rejected ({rejectedAuthkey.length})</SelectItem>
                                                    <SelectItem value="draft">Draft</SelectItem>
                                                    <SelectItem value="all">All</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            {templateFilter === "approved" && (
                                                <div className="flex rounded-full border bg-white overflow-hidden">
                                                    <button onClick={() => setMappingToggle("mapped")} className={`px-3 py-1.5 text-sm font-medium transition-colors ${mappingToggle === "mapped" ? "bg-[#25D366] text-white" : "text-gray-600 hover:bg-gray-100"}`} data-testid="toggle-mapped">Mapped ({mappedCount})</button>
                                                    <button onClick={() => setMappingToggle("not_mapped")} className={`px-3 py-1.5 text-sm font-medium transition-colors ${mappingToggle === "not_mapped" ? "bg-amber-500 text-white" : "text-gray-600 hover:bg-gray-100"}`} data-testid="toggle-not-mapped">Not Mapped ({notMappedCount})</button>
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                                                <SelectTrigger className="h-9 w-[150px] rounded-full text-sm" data-testid="category-filter"><Filter className="w-3.5 h-3.5 mr-1 text-gray-500" /><SelectValue placeholder="Category" /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="all">All Categories</SelectItem>
                                                    <SelectItem value="marketing">Marketing</SelectItem>
                                                    <SelectItem value="utility">Utility</SelectItem>
                                                    <SelectItem value="authentication">Authentication</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <Button onClick={() => navigate("/template-builder")} className="bg-[#F26B33] hover:bg-[#D85A2A] text-white rounded-full" data-testid="add-template-btn"><Plus className="w-4 h-4 mr-1" /> Add Template</Button>
                                        </div>
                                    </div>
                                    <div className="border-b border-gray-200 mb-4"></div>
                                    
                                    {/* Draft Templates */}
                                    {displayDrafts.length > 0 && (
                                        <div className="mb-4">
                                            {displayTemplates.length > 0 && <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">CRM Templates</p>}
                                            <div className="space-y-3">
                                                {displayDrafts.map(ct => (
                                                    <Card key={ct.id} className="rounded-xl border-0 shadow-sm overflow-hidden">
                                                        <CardContent className="p-4">
                                                            <div className="flex items-start justify-between mb-2">
                                                                <div>
                                                                    <h4 className="font-semibold text-[#1A1A1A]">{ct.template_name}</h4>
                                                                    <div className="flex items-center gap-2 mt-1">
                                                                        <span className="text-xs text-gray-500 capitalize">{ct.category}</span>
                                                                        <span className="text-xs text-gray-400">|</span>
                                                                        <span className="text-xs text-gray-500">{ct.language === "en" ? "English" : "Hindi"}</span>
                                                                    </div>
                                                                </div>
                                                                <Badge className={`text-xs ${
                                                                    ct.status === "approved" ? "bg-[#25D366] text-white" : 
                                                                    ct.status === "pending" ? "bg-amber-500 text-white" : 
                                                                    ct.status === "rejected" ? "bg-red-500 text-white" : 
                                                                    "bg-gray-400 text-white"
                                                                }`} data-testid={`custom-status-${ct.id}`}>
                                                                    {ct.status === "approved" ? "Approved" : 
                                                                     ct.status === "pending" ? "Pending" : 
                                                                     ct.status === "rejected" ? "Rejected" : 
                                                                     "Draft"}
                                                                </Badge>
                                                            </div>
                                                            <div className="bg-[#E5DDD5] p-3 rounded-lg mt-2">
                                                                <div className="bg-[#DCF8C6] rounded-lg p-3 shadow-sm max-w-[90%] relative">
                                                                    <p className="text-sm text-[#1A1A1A] whitespace-pre-wrap pr-12">{ct.body}</p>
                                                                    {ct.footer && <p className="text-xs text-gray-500 mt-2 border-t border-gray-200 pt-1">{ct.footer}</p>}
                                                                </div>
                                                            </div>
                                                            <div className="flex gap-2 mt-3 flex-wrap">
                                                                {ct.status === "draft" && (
                                                                    <>
                                                                        <Button size="sm" variant="outline" onClick={() => navigate(`/template-builder/${ct.id}`)}><Edit2 className="w-3 h-3 mr-1" /> Edit</Button>
                                                                        <Button size="sm" className="bg-[#F26B33] hover:bg-[#D85A2A] text-white" onClick={() => handleSubmitCustomTemplate(ct.id)}><Send className="w-3 h-3 mr-1" /> Submit</Button>
                                                                    </>
                                                                )}
                                                                {ct.status === "pending" && <span className="text-xs text-amber-600 flex items-center gap-1"><Clock className="w-3 h-3" /> Awaiting approval</span>}
                                                                {ct.status === "rejected" && (
                                                                    <Button size="sm" variant="outline" className="border-red-300 text-red-600 hover:bg-red-50"
                                                                        onClick={() => navigate(`/template-builder/${ct.id}`)}
                                                                        data-testid={`edit-resubmit-${ct.id}`}>
                                                                        <Edit2 className="w-3 h-3 mr-1" /> Edit & Resubmit
                                                                    </Button>
                                                                )}
                                                                {/* CR-DIRECT-SEND: Labels button — shown for all statuses so users can configure before Meta approval */}
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    className={`border-blue-300 text-blue-600 hover:bg-blue-50 ${ct.variable_labels && Object.keys(ct.variable_labels).length > 0 ? "border-green-400 text-green-600 hover:bg-green-50" : ""}`}
                                                                    onClick={() => openLabelsModal(ct)}
                                                                    data-testid={`set-labels-${ct.id}`}
                                                                >
                                                                    <Tag className="w-3 h-3 mr-1" />
                                                                    {ct.variable_labels && Object.keys(ct.variable_labels).length > 0 ? "Edit Labels" : "Set Labels"}
                                                                </Button>
                                                                {isTemplateInUse(ct.id) ? (
                                                                    <span className="text-[10px] text-gray-400 ml-auto flex items-center gap-1" title="Template is in use by events or campaigns">
                                                                        <Lock className="w-3 h-3" /> In Use
                                                                    </span>
                                                                ) : (
                                                                    <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 ml-auto" onClick={() => handleDeleteCustomTemplate(ct.id)} data-testid={`delete-custom-${ct.id}`}><Trash2 className="w-3 h-3" /></Button>
                                                                )}
                                                            </div>
                                                        </CardContent>
                                                    </Card>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    
                                    {displayDrafts.length > 0 && displayTemplates.length > 0 && <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Authkey Templates</p>}
                                    
                                    {displayDrafts.length === 0 && displayTemplates.length === 0 ? (
                                        <Card className="rounded-xl border-0 shadow-sm"><CardContent className="p-8 text-center"><p className="text-[#52525B]">No templates match the current filters</p></CardContent></Card>
                                    ) : displayTemplates.map(tpl => {
                                        const variables = (tpl.temp_body.match(/\{\{\d+\}\}/g) || []).filter((v, i, a) => a.indexOf(v) === i);
                                        const isMapped = isTemplateFullyMapped(tpl);
                                        const mappings = templateVariableMappings[tpl.wid] || {};
                                        const modes = templateVariableModes[tpl.wid] || {};
                                        return (
                                            <Card key={tpl.wid} className="rounded-xl border-0 shadow-sm overflow-hidden">
                                                <CardContent className="p-4">
                                                    <div className="flex items-start justify-between mb-2">
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <h4 className="font-semibold text-[#1A1A1A] truncate">{tpl.temp_name}</h4>
                                                                {tpl.temp_status === 1 && <Badge className="text-[10px] bg-[#25D366] text-white" data-testid={`status-badge-${tpl.wid}`}>Approved</Badge>}
                                                                {tpl.temp_status === 3 && <Badge className="text-[10px] bg-red-500 text-white" data-testid={`status-badge-${tpl.wid}`}>Rejected</Badge>}
                                                                {tpl.temp_status === 4 && <Badge className="text-[10px] bg-amber-500 text-white" data-testid={`status-badge-${tpl.wid}`}>Pending</Badge>}
                                                                {![1, 3, 4].includes(tpl.temp_status) && <Badge className="text-[10px] bg-gray-400 text-white" data-testid={`status-badge-${tpl.wid}`}>Unknown</Badge>}
                                                            </div>
                                                            <span className="text-xs text-gray-500 capitalize">{tpl.meta_data?.category || "utility"}</span>
                                                        </div>
                                                        <div className="flex items-center gap-1.5 ml-2 shrink-0">
                                                            {tpl.temp_status === 1 && (
                                                                <button onClick={() => openVariableMappingModal(tpl)} className="text-xs text-gray-500 hover:text-[#F26B33] flex items-center gap-1 px-2 py-1 rounded-md hover:bg-gray-50 transition-colors" data-testid={`map-vars-${tpl.wid}`}><Tag className="w-3 h-3" /> Map</button>
                                                            )}
                                                            <button onClick={() => setExpandedPreviews(prev => ({...prev, [tpl.wid]: !prev[tpl.wid]}))} className="text-xs text-gray-500 hover:text-[#F26B33] flex items-center gap-1 px-2 py-1 rounded-md hover:bg-gray-50 transition-colors" data-testid={`preview-${tpl.wid}`}>{expandedPreviews[tpl.wid] ? <><EyeOff className="w-3 h-3" /> Hide</> : <><Eye className="w-3 h-3" /> Preview</>}</button>
                                                            {tpl.temp_status === 1 ? (
                                                                <Badge className={`text-xs ${isMapped ? "bg-[#25D366] text-white" : "bg-amber-500 text-white"}`} data-testid={`mapped-badge-${tpl.wid}`}>{isMapped ? "Mapped" : "Not Mapped"}</Badge>
                                                            ) : (
                                                                <>
                                                                    {isTemplateInUse(tpl.wid) && (
                                                                        <button
                                                                            onClick={async () => {
                                                                                if (!window.confirm(`Remove all mappings for rejected template "${tpl.temp_name}"?`)) return;
                                                                                try {
                                                                                    const eventRes = await api.get("/whatsapp/event-template-map");
                                                                                    const events = (eventRes.data.mappings || []).filter(m => String(m.template_id) === String(tpl.wid));
                                                                                    for (const ev of events) { await api.delete(`/whatsapp/event-template-map/${ev.event_key}`).catch(() => {}); }
                                                                                    toast.success("Template unmapped from all events");
                                                                                    const inUseRes = await api.get("/whatsapp/templates-in-use");
                                                                                    setInUseTemplateIds(new Set(inUseRes.data.in_use_template_ids || []));
                                                                                } catch (err) { toast.error("Failed to unmap template"); }
                                                                            }}
                                                                            className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1 px-2 py-1 rounded-md hover:bg-red-50 transition-colors"
                                                                            data-testid={`unmap-${tpl.wid}`}
                                                                        >
                                                                            <Trash2 className="w-3 h-3" /> Unmap
                                                                        </button>
                                                                    )}
                                                                    <Badge className="text-xs bg-gray-400 text-white" data-testid={`mapped-badge-${tpl.wid}`}>Not Usable</Badge>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                    {tpl.temp_status === 1 && variables.length > 0 && (
                                                        <div className="flex flex-wrap gap-1.5 mb-2">
                                                            {variables.map(v => {
                                                                const mappedField = mappings[v];
                                                                const fieldLabel = mappedField ? (availableVariables.find(av => av.key === mappedField)?.label || mappedField) : null;
                                                                return (
                                                                    <span key={v} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${fieldLabel ? "border-[#25D366]/30 bg-[#25D366]/5 text-[#25D366]" : "border-amber-300 bg-amber-50 text-amber-700"}`}>
                                                                        {v}{fieldLabel && <> → {fieldLabel}</>}
                                                                    </span>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                    {expandedPreviews[tpl.wid] && (
                                                    <div className="bg-[#E5DDD5] p-3 rounded-lg mt-2">
                                                        <div className="bg-[#DCF8C6] rounded-lg p-3 shadow-sm max-w-[90%] relative">
                                                            <p className="text-sm text-[#1A1A1A] whitespace-pre-wrap pr-12">
                                                                {(() => {
                                                                    const parts = resolvePreviewWithSampleData(tpl.temp_body, mappings, modes, templateMenuPickResolved[tpl.wid]);
                                                                    return parts.map((part, idx) => {
                                                                        if (part.type === "na") return <span key={idx} className="text-red-500 font-medium">NA</span>;
                                                                        return <span key={idx}>{part.value}</span>;
                                                                    });
                                                                })()}
                                                            </p>
                                                            <div className="flex items-center justify-end gap-1 mt-1">
                                                                <span className="text-[10px] text-gray-500">{new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                                                                <svg className="w-4 h-4 text-[#53BDEB]" viewBox="0 0 16 15" fill="currentColor"><path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.88a.32.32 0 0 1-.484.032l-.358-.325a.32.32 0 0 0-.484.032l-.378.48a.418.418 0 0 0 .036.54l1.32 1.267a.32.32 0 0 0 .484-.034l6.272-8.048a.366.366 0 0 0-.064-.51zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.88a.32.32 0 0 1-.484.032L1.89 7.77a.366.366 0 0 0-.516.005l-.423.433a.364.364 0 0 0 .006.514l3.255 3.185a.32.32 0 0 0 .484-.033l6.272-8.048a.365.365 0 0 0-.063-.51z"/></svg>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    )}
                                                </CardContent>
                                            </Card>
                                        );
                                    })}
                                </>
                            );
                        })()}
                    </div>
                )}
                
                {/* Add Template Dialog */}
                <Dialog open={showAddTemplate} onOpenChange={(open) => { setShowAddTemplate(open); if (!open) { setEditingCustomTemplate(null); setNewTemplate({ template_name: "", category: "utility", language: "en", header_type: "none", header_content: "", body: "", footer: "", buttons: [], media_url: "", body_examples: [], header_examples: [] }); } }}>
                    <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2"><Plus className="w-5 h-5 text-[#25D366]" />{editingCustomTemplate ? "Edit Template" : "Add New Template"}</DialogTitle>
                            <DialogDescription>{editingCustomTemplate ? "Update your template. Status will reset to Draft." : "Create a new WhatsApp message template."}</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                            <div className="space-y-1"><Label className="text-sm font-medium">Template Name</Label><Input value={newTemplate.template_name} onChange={(e) => setNewTemplate(p => ({...p, template_name: e.target.value}))} placeholder="e.g., order_confirmation" className="rounded-lg" data-testid="new-tpl-name" /></div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1"><Label className="text-sm font-medium">Category</Label><Select value={newTemplate.category} onValueChange={(val) => setNewTemplate(p => ({...p, category: val}))}><SelectTrigger className="rounded-lg" data-testid="new-tpl-category"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="marketing">Marketing</SelectItem><SelectItem value="utility">Utility</SelectItem><SelectItem value="authentication">Authentication</SelectItem></SelectContent></Select></div>
                                <div className="space-y-1"><Label className="text-sm font-medium">Language</Label><Select value={newTemplate.language} onValueChange={(val) => setNewTemplate(p => ({...p, language: val}))}><SelectTrigger className="rounded-lg" data-testid="new-tpl-language"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="en">English</SelectItem><SelectItem value="hi">Hindi</SelectItem></SelectContent></Select></div>
                            </div>
                            <div className="space-y-1"><Label className="text-sm font-medium">Header (optional)</Label><Select value={newTemplate.header_type} onValueChange={(val) => setNewTemplate(p => ({...p, header_type: val, header_content: "", header_examples: []}))}><SelectTrigger className="rounded-lg" data-testid="new-tpl-header-type"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">None</SelectItem><SelectItem value="text">Text</SelectItem><SelectItem value="image">Image</SelectItem><SelectItem value="video">Video</SelectItem><SelectItem value="document">Document</SelectItem></SelectContent></Select>
                                {newTemplate.header_type === "text" && (
                                    <>
                                        <Input value={newTemplate.header_content} onChange={(e) => setNewTemplate(p => ({...p, header_content: e.target.value}))} placeholder="Header text with {{1}} variable..." className="rounded-lg mt-2" data-testid="new-tpl-header-text" />
                                        {newTemplate.header_content.includes("{{") && (
                                            <Input 
                                                value={newTemplate.header_examples[0] || ""} 
                                                onChange={(e) => setNewTemplate(p => ({...p, header_examples: [e.target.value]}))} 
                                                placeholder="Example value for header variable" 
                                                className="rounded-lg mt-2 bg-blue-50" 
                                                data-testid="new-tpl-header-example" 
                                            />
                                        )}
                                    </>
                                )}
                                {(newTemplate.header_type === "image" || newTemplate.header_type === "video" || newTemplate.header_type === "document") && <Input value={newTemplate.media_url} onChange={(e) => setNewTemplate(p => ({...p, media_url: e.target.value}))} placeholder="Media URL..." className="rounded-lg mt-2" data-testid="new-tpl-media-url" />}
                            </div>
                            <div className="space-y-1">
                                <Label className="text-sm font-medium">Body</Label>
                                <textarea value={newTemplate.body} onChange={(e) => setNewTemplate(p => ({...p, body: e.target.value, body_examples: []}))} placeholder={"Hi {{1}},\nYour order {{2}} is confirmed.\nTotal: ₹{{3}}"} className="w-full min-h-[120px] rounded-lg border border-gray-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#F26B33] focus:border-transparent resize-y" data-testid="new-tpl-body" />
                                <p className="text-xs text-gray-400">Use {"{{1}}"}, {"{{2}}"}, etc. for variables</p>
                            </div>
                            
                            {/* Body Example Values */}
                            {(() => {
                                const bodyVars = newTemplate.body.match(/\{\{\d+\}\}/g) || [];
                                const uniqueVars = [...new Set(bodyVars)].sort((a, b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/)));
                                if (uniqueVars.length === 0) return null;
                                return (
                                    <div className="space-y-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                                        <Label className="text-sm font-medium text-blue-800">Example Values for Variables (Required for Meta)</Label>
                                        <div className="grid grid-cols-2 gap-2">
                                            {uniqueVars.map((v, i) => (
                                                <div key={v} className="space-y-1">
                                                    <Label className="text-xs text-blue-600">{v}</Label>
                                                    <Input 
                                                        value={newTemplate.body_examples[i] || ""} 
                                                        onChange={(e) => {
                                                            const newExamples = [...newTemplate.body_examples];
                                                            newExamples[i] = e.target.value;
                                                            setNewTemplate(p => ({...p, body_examples: newExamples}));
                                                        }}
                                                        placeholder={`Example for ${v}`}
                                                        className="h-8 text-sm rounded"
                                                        data-testid={`new-tpl-body-example-${i}`}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })()}
                            
                            <div className="space-y-1"><Label className="text-sm font-medium">Footer (optional)</Label><Input value={newTemplate.footer} onChange={(e) => setNewTemplate(p => ({...p, footer: e.target.value}))} placeholder="e.g., Reply STOP to unsubscribe" className="rounded-lg" data-testid="new-tpl-footer" /></div>
                            {newTemplate.body && (
                                <div className="space-y-1"><Label className="text-xs text-gray-500">Preview</Label><div className="bg-[#E5DDD5] p-3 rounded-lg"><div className="bg-[#DCF8C6] rounded-lg p-3 shadow-sm">{newTemplate.header_type === "text" && newTemplate.header_content && <p className="text-sm font-bold text-[#1A1A1A] mb-1">{newTemplate.header_content}</p>}<p className="text-sm text-[#1A1A1A] whitespace-pre-wrap">{newTemplate.body}</p>{newTemplate.footer && <p className="text-xs text-gray-500 mt-2 border-t border-gray-200 pt-1">{newTemplate.footer}</p>}</div></div></div>
                            )}
                            <DialogFooter className="gap-2 flex-col sm:flex-row">
                                <Button variant="outline" onClick={() => setShowAddTemplate(false)}>Cancel</Button>
                                <Button onClick={handleSaveCustomTemplate} disabled={savingTemplate} variant="outline" data-testid="save-new-template-btn">
                                    {savingTemplate ? "Saving..." : "Save as Draft"}
                                </Button>
                                <Button onClick={handleSubmitToMeta} disabled={submittingToMeta} className="bg-[#25D366] hover:bg-[#1da851] text-white" data-testid="submit-to-meta-btn">
                                    {submittingToMeta ? "Submitting..." : "Submit to Meta"}
                                </Button>
                            </DialogFooter>
                        </div>
                    </DialogContent>
                </Dialog>

                {/* Variable Mapping Modal */}
                <Dialog open={showVariableMappingModal} onOpenChange={setShowVariableMappingModal}>
                    <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2"><Tag className="w-5 h-5" />Map Template Variables</DialogTitle>
                            <DialogDescription>
                                {mappingTemplate?.temp_name || "Template"}{currentEventKey ? ` · Event: ${currentEventKey}` : ""}
                            </DialogDescription>
                        </DialogHeader>
                        {mappingTemplate && (
                            <div className="space-y-4">
                                <div className="rounded-lg overflow-hidden bg-[#E5DDD5]"><div className="p-3"><div className="bg-[#DCF8C6] rounded-lg p-3 shadow-sm">
                                    {(() => {
                                        const parts = resolvePreviewWithSampleData(mappingTemplate.temp_body, variableMappings, variableMappingModes, menuPickResolved);
                                        return (<><p className="text-sm text-[#1A1A1A] whitespace-pre-wrap pr-10">{parts.map((part, idx) => { if (part.type === "na") return <span key={idx} className="text-red-500 font-medium">NA</span>; return <span key={idx}>{part.value}</span>; })}</p><div className="flex items-center justify-end gap-1 mt-1"><span className="text-[10px] text-gray-500">{new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}</span><svg className="w-4 h-4 text-[#53BDEB]" viewBox="0 0 16 15" fill="currentColor"><path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.88a.32.32 0 0 1-.484.032l-.358-.325a.32.32 0 0 0-.484.032l-.378.48a.418.418 0 0 0 .036.54l1.32 1.267a.32.32 0 0 0 .484-.034l6.272-8.048a.366.366 0 0 0-.064-.51zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.88a.32.32 0 0 1-.484.032L1.89 7.77a.366.366 0 0 0-.516.005l-.423.433a.364.364 0 0 0 .006.514l3.255 3.185a.32.32 0 0 0 .484-.033l6.272-8.048a.365.365 0 0 0-.063-.51z"/></svg></div></>);
                                    })()}
                                </div></div></div>
                                <div className="space-y-3">
                                    {mappingTemplate.variables?.map(variable => {
                                        const currentMapping = variableMappings[variable];
                                        const currentMode = variableMappingModes[variable] || "map";
                                        const mappedVarInfo = availableVariables.find(v => v.key === currentMapping);
                                        const isCouponVar = mappedVarInfo?.picker === "coupon";
                                        const isCouponPickMode = currentMode === "coupon_pick";
                                        const isMenuPickMode = currentMode === "menu_pick";
                                        const parsed = parseCouponPickMapping(currentMapping);
                                        const pickedCoupon = parsed ? couponSummary.find(c => c.id === parsed.couponId) : null;
                                        // For menu pick, check if binding exists
                                        const menuBindingValue = isMenuPickMode && currentMapping ? menuPickResolved[currentMapping] : null;

                                        return (
                                        <div key={variable} className="bg-gray-50 rounded-xl p-3 space-y-2" data-testid={`slot-${variable}`}>
                                            <div className="flex items-center justify-between">
                                                <Badge variant="outline" className="bg-white font-mono text-sm">{variable}</Badge>
                                                <div className="flex rounded-lg border bg-white overflow-hidden text-[11px]">
                                                    {isCouponVar || isCouponPickMode ? (
                                                        <>
                                                            <button type="button" onClick={() => { setVariableMappingModes(prev => ({...prev, [variable]: "coupon_pick"})); if (couponSummary.length === 0) fetchCouponSummary(); if (selectedCouponId && mappedVarInfo?.key) { const cpn = couponSummary.find(c => c.id === selectedCouponId); if (cpn) { const cf = mappedVarInfo.key.replace("coupon_", ""); setVariableMappings(prev => ({...prev, [variable]: `coupon:${cpn.id}:${cf}`})); } } }} className={`px-2.5 py-1 font-medium transition-colors ${isCouponPickMode ? "bg-[#F26B33] text-white" : "bg-white text-gray-600 hover:bg-gray-100"}`} data-testid={`var-mode-coupon-pick-${variable}`}>Coupon Pick</button>
                                                            <button type="button" onClick={() => { setVariableMappingModes(prev => ({...prev, [variable]: "text"})); setVariableMappings(prev => ({...prev, [variable]: ""})); }} className={`px-2.5 py-1 font-medium transition-colors ${currentMode === "text" ? "bg-[#F26B33] text-white" : "bg-white text-gray-600 hover:bg-gray-100"}`} data-testid={`var-mode-text-${variable}`}>Text</button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <button type="button" onClick={() => setVariableMappingModes(prev => ({...prev, [variable]: "map"}))} className={`px-2.5 py-1 font-medium transition-colors ${currentMode === "map" ? "bg-[#F26B33] text-white" : "bg-white text-gray-600 hover:bg-gray-100"}`} data-testid={`var-mode-map-${variable}`}>Map</button>
                                                            <button type="button" onClick={() => { setVariableMappingModes(prev => ({...prev, [variable]: "text"})); }} className={`px-2.5 py-1 font-medium transition-colors ${currentMode === "text" ? "bg-[#F26B33] text-white" : "bg-white text-gray-600 hover:bg-gray-100"}`} data-testid={`var-mode-text-${variable}`}>Text</button>
                                                            <button type="button" onClick={() => { setVariableMappingModes(prev => ({...prev, [variable]: "menu_pick"})); setMenuPickOpenFor(variable); }} className={`px-2.5 py-1 font-medium transition-colors ${isMenuPickMode ? "bg-[#F26B33] text-white" : "bg-white text-gray-600 hover:bg-gray-100"}`} data-testid={`var-mode-menu-pick-${variable}`}>Menu</button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Coupon pick mode */}
                                            {isCouponPickMode && pickedCoupon ? (
                                                <div className="bg-white border border-green-200 rounded-lg p-2.5 flex items-center gap-2" data-testid={`coupon-picked-${variable}`}>
                                                    <Lock className="w-4 h-4 text-green-600 shrink-0" />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-medium text-gray-900 truncate">{getCouponPickPreviewValue(currentMapping) || "—"}</p>
                                                        <p className="text-xs text-gray-500">from {pickedCoupon.code}</p>
                                                    </div>
                                                </div>
                                            ) : isCouponPickMode && !pickedCoupon ? (
                                                <div className="space-y-2" data-testid={`coupon-picker-${variable}`}>
                                                    {couponSummaryLoading ? (
                                                        <div className="space-y-2">{[1,2,3].map(i => (<div key={i} className="h-14 bg-gray-200 rounded-lg animate-pulse" />))}</div>
                                                    ) : couponSummaryError ? (
                                                        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                                                            <p className="text-sm text-red-600">{couponSummaryError}</p>
                                                            <button onClick={fetchCouponSummary} className="text-xs text-red-700 underline mt-1">Retry</button>
                                                        </div>
                                                    ) : couponSummary.length === 0 ? (
                                                        <div className="bg-gray-100 rounded-lg p-3 text-center"><p className="text-sm text-gray-500">No coupons found.</p></div>
                                                    ) : (
                                                        <>
                                                            <Input type="text" value={couponSearchQuery} onChange={(e) => setCouponSearchQuery(e.target.value)} placeholder="Search coupons..." className="h-8 text-sm rounded-lg" data-testid="coupon-search-input" />
                                                            <div className="max-h-40 overflow-y-auto space-y-1.5">
                                                                {couponSummary.filter(c => { const q = couponSearchQuery.toLowerCase(); return !q || c.code.toLowerCase().includes(q) || (c.title || "").toLowerCase().includes(q); }).map(c => (
                                                                    <button key={c.id} type="button" onClick={() => handleCouponSelect(c)} className="w-full text-left bg-white border rounded-lg p-2 hover:border-[#F26B33] hover:bg-orange-50 transition-colors" data-testid={`coupon-option-${c.code}`}>
                                                                        <div className="flex items-center justify-between">
                                                                            <span className="text-sm font-mono font-medium text-gray-900">{c.code}</span>
                                                                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${c.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>{c.is_active ? "Active" : "Inactive"}</span>
                                                                        </div>
                                                                        <p className="text-xs text-gray-500 truncate">{c.title || "—"} · {c.discount_display}{c.end_date_display ? ` · Exp ${c.end_date_display}` : ""}</p>
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </>
                                                    )}
                                                </div>

                                            /* Menu pick mode */
                                            ) : isMenuPickMode && menuBindingValue ? (
                                                <div className="bg-white border border-green-200 rounded-lg p-2.5 flex items-center gap-2" data-testid={`menu-picked-${variable}`}>
                                                    <Lock className="w-4 h-4 text-green-600 shrink-0" />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-medium text-gray-900 truncate">{menuBindingValue}</p>
                                                        <p className="text-xs text-gray-500">Menu · {currentMapping}</p>
                                                    </div>
                                                    <button type="button" onClick={() => setMenuPickOpenFor(variable)} className="text-xs text-[#F26B33] hover:underline shrink-0">Change</button>
                                                </div>
                                            ) : isMenuPickMode ? (
                                                <button
                                                    type="button"
                                                    onClick={() => setMenuPickOpenFor(variable)}
                                                    className="w-full text-left px-3 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-400 hover:border-[#F26B33] hover:text-[#F26B33] transition-colors"
                                                    data-testid={`menu-pick-trigger-${variable}`}
                                                >
                                                    Click to pick a menu item...
                                                </button>

                                            /* Custom text mode */
                                            ) : currentMode === "text" ? (
                                                <Input type="text" value={variableMappings[variable] || ""} onChange={(e) => setVariableMappings(prev => ({...prev, [variable]: e.target.value}))} placeholder="Enter custom text..." className="h-10 rounded-lg" data-testid={`text-input-${variable}`} />

                                            /* Map mode — grouped picker */
                                            ) : (
                                                <>
                                                    <button
                                                        type="button"
                                                        onClick={() => setPickerOpenFor(variable)}
                                                        className="w-full flex items-center justify-between px-3 py-2 bg-white border border-gray-200 rounded-lg hover:border-[#F26B33] transition-colors cursor-pointer"
                                                        data-testid={`picker-trigger-${variable}`}
                                                    >
                                                        {currentMapping && currentMapping !== "none" ? (
                                                            <span className="flex items-center gap-2">
                                                                <span className={`inline-block w-2 h-2 rounded-full ${
                                                                    availableVariables.find(v => v.key === currentMapping)?.fills_on_events === "*" || (Array.isArray(availableVariables.find(v => v.key === currentMapping)?.fills_on_events) && availableVariables.find(v => v.key === currentMapping)?.fills_on_events.includes(currentEventKey))
                                                                    ? "bg-green-500" : "bg-amber-400"
                                                                }`} />
                                                                <span className="text-sm font-medium text-[#2B2B2B]">
                                                                    {availableVariables.find(v => v.key === currentMapping)?.label || currentMapping}
                                                                </span>
                                                                <span className="text-xs text-gray-400">
                                                                    e.g. {availableVariables.find(v => v.key === currentMapping)?.example || ""}
                                                                </span>
                                                            </span>
                                                        ) : (
                                                            <span className="text-sm text-gray-400">Select a variable...</span>
                                                        )}
                                                        <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
                                                    </button>
                                                    <VariablePicker
                                                        variables={availableVariables}
                                                        eventKey={currentEventKey}
                                                        selectedKey={currentMapping}
                                                        open={pickerOpenFor === variable}
                                                        onClose={() => setPickerOpenFor(null)}
                                                        onMenuPick={(menuTab) => {
                                                            setPickerOpenFor(null);
                                                            setVariableMappingModes(prev => ({...prev, [variable]: "menu_pick"}));
                                                            setMenuPickOpenFor(variable);
                                                            setMenuPickInitialTab(menuTab === "category" ? "categories" : "items");
                                                        }}
                                                        onSelect={(varKey) => {
                                                            setVariableMappings(prev => ({...prev, [variable]: varKey}));
                                                            const selVar = availableVariables.find(v => v.key === varKey);
                                                            if (selVar?.picker === "coupon") {
                                                                setVariableMappingModes(prev => ({...prev, [variable]: "coupon_pick"}));
                                                                if (couponSummary.length === 0) fetchCouponSummary();
                                                                if (selectedCouponId) {
                                                                    const cpn = couponSummary.find(c => c.id === selectedCouponId);
                                                                    if (cpn) {
                                                                        const couponField = varKey.replace("coupon_", "");
                                                                        setVariableMappings(prev => ({...prev, [variable]: `coupon:${cpn.id}:${couponField}`}));
                                                                    }
                                                                }
                                                            }
                                                            setPickerOpenFor(null);
                                                        }}
                                                    />
                                                </>
                                            )}
                                        </div>
                                        );
                                    })}
                                </div>
                                <DialogFooter className="gap-2">
                                    <Button variant="outline" onClick={() => { setShowVariableMappingModal(false); setMappingTemplate(null); setVariableMappings({}); setVariableMappingModes({}); }}>Cancel</Button>
                                    <Button onClick={handleSaveVariableMapping} disabled={savingVariableMapping} className="bg-[#F26B33] hover:bg-[#D85A2A] text-white" data-testid="save-variable-mapping-btn">{savingVariableMapping ? "Saving..." : "Save Mappings"}</Button>
                                </DialogFooter>
                                {/* CR-020: Menu Pick Modal (inside Dialog to avoid Radix pointer-event interception) */}
                                <MenuPickModal
                                    open={!!menuPickOpenFor}
                                    onClose={() => setMenuPickOpenFor(null)}
                                    api={api}
                                    initialTab={menuPickInitialTab}
                                    onPick={(picked) => {
                                        const slot = menuPickOpenFor;
                                        if (!slot) return;
                                        const bindingKey = `${picked.type}:${picked.id}:${picked.field}`;
                                        setVariableMappings(prev => ({...prev, [slot]: bindingKey}));
                                        setVariableMappingModes(prev => ({...prev, [slot]: "menu_pick"}));
                                        setMenuPickResolved(prev => ({...prev, [bindingKey]: picked.resolvedValue}));
                                        setMenuPickOpenFor(null);
                                    }}
                                />
                            </div>
                        )}
                    </DialogContent>
                </Dialog>

                {/* CR-DIRECT-SEND: Variable Labels Modal */}
                <Dialog open={showLabelsModal} onOpenChange={(open) => { if (!open) { setShowLabelsModal(false); setLabelsTemplate(null); setLabelsData({}); } }}>
                    <DialogContent className="max-w-md" data-testid="labels-modal">
                        <DialogHeader>
                            <DialogTitle className="text-lg font-semibold">Set Direct-Send Labels</DialogTitle>
                            <DialogDescription className="text-sm text-gray-500">
                                Map each variable to a label. External servers send these named fields in the flat JSON payload.
                            </DialogDescription>
                        </DialogHeader>
                        {labelsTemplate && (
                            <div className="space-y-4 py-1">
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                    <p className="text-xs font-medium text-blue-700 mb-1">Template: {labelsTemplate.template_name}</p>
                                    {labelsTemplate.authkey_wid ? (
                                        <p className="text-xs text-green-600 flex items-center gap-1">
                                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>
                                            AuthKey synced (wid: {labelsTemplate.authkey_wid})
                                        </p>
                                    ) : (
                                        <p className="text-xs text-amber-600 flex items-center gap-1">
                                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                                            Not synced to AuthKey yet — run sync before using direct-send
                                        </p>
                                    )}
                                </div>

                                {labelsTemplate.parsedVars?.length === 0 && (
                                    <p className="text-sm text-gray-500 text-center py-2">
                                        This template has no variables (no <code className="bg-gray-100 px-1 rounded">{`{{1}}`}</code> placeholders).
                                    </p>
                                )}

                                {labelsTemplate.parsedVars?.map(variable => {
                                    const idx = variable.replace(/[{}]/g, "");
                                    return (
                                        <div key={variable} className="flex items-center gap-3" data-testid={`label-row-${idx}`}>
                                            <div className="shrink-0">
                                                <span className="inline-block px-2.5 py-1 bg-gray-100 rounded-lg font-mono text-sm text-gray-700 border">{variable}</span>
                                            </div>
                                            <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                                            <input
                                                type="text"
                                                value={labelsData[idx] || ""}
                                                onChange={(e) => setLabelsData(prev => ({ ...prev, [idx]: e.target.value.trim().replace(/\s+/g, "_") }))}
                                                placeholder={`e.g. name, meeting_link…`}
                                                className="flex-1 h-9 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F26B33]/30 focus:border-[#F26B33]"
                                                data-testid={`label-input-${idx}`}
                                            />
                                        </div>
                                    );
                                })}

                                {labelsTemplate.parsedVars?.length > 0 && (
                                    <div className="bg-gray-50 rounded-lg p-3 border">
                                        <p className="text-xs font-medium text-gray-600 mb-1.5">Example payload your server should send:</p>
                                        <pre className="text-xs text-gray-700 font-mono leading-relaxed whitespace-pre-wrap break-all">
{`{
  "mobile": "9876543210",
  "country_code": "91",
  "template_id": "${labelsTemplate.id}",${
  Object.entries(labelsData).filter(([, v]) => v).map(([, label]) => `\n  "${label}": "value"`).join(",")
}
}`}
                                        </pre>
                                    </div>
                                )}
                            </div>
                        )}
                        <div className="flex gap-2 justify-end pt-2 border-t">
                            <Button variant="outline" size="sm" onClick={() => { setShowLabelsModal(false); setLabelsTemplate(null); setLabelsData({}); }}>Cancel</Button>
                            <Button
                                size="sm"
                                className="bg-[#F26B33] hover:bg-[#D85A2A] text-white"
                                onClick={handleSaveLabels}
                                disabled={savingLabels}
                                data-testid="save-labels-btn"
                            >
                                {savingLabels ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
                                {savingLabels ? "Saving…" : "Save Labels"}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>

            </div>
        </ResponsiveLayout>
    );
}
