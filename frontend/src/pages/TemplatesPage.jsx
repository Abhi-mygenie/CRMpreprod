import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { MessageSquare, Settings, Plus, Edit2, Trash2, Eye, EyeOff, Filter, Clock, Tag, Save, Wallet, KeyRound, Send, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveLayout } from "@/components/ResponsiveLayout";

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
    
    // Sample customer data for previews
    const [sampleCustomerData, setSampleCustomerData] = useState({});
    
    // Template preview state
    const [expandedPreviews, setExpandedPreviews] = useState({});
    
    const availableVariables = [
        { key: "customer_name", label: "Customer Name", example: "John" },
        { key: "points_balance", label: "Points Balance", example: "500" },
        { key: "points_earned", label: "Points Earned", example: "100" },
        { key: "points_redeemed", label: "Points Redeemed", example: "50" },
        { key: "wallet_balance", label: "Wallet Balance", example: "₹200" },
        { key: "amount", label: "Amount", example: "₹1500" },
        { key: "tier", label: "Customer Tier", example: "Gold" },
        { key: "restaurant_name", label: "Restaurant Name", example: "Demo Restaurant" },
        { key: "coupon_code", label: "Coupon Code", example: "SAVE20" },
        { key: "expiry_date", label: "Expiry Date", example: "31 Dec 2025" }
    ];

    const resolvePreviewWithSampleData = (templateBody, mappings, modes) => {
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
                const sampleValue = mode === "text" ? mappedField : sampleCustomerData[mappedField];
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

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [tplRes, varMapRes, sampleRes, customRes] = await Promise.all([
                    api.get("/whatsapp/authkey-templates"),
                    api.get("/whatsapp/template-variable-map"),
                    api.get("/customers/sample-data"),
                    api.get("/whatsapp/custom-templates")
                ]);
                setAuthkeyTemplates(tplRes.data.templates || []);
                const varMapObj = {};
                const varModesObj = {};
                (varMapRes.data.mappings || []).forEach(m => {
                    varMapObj[m.template_id] = m.mappings || {};
                    varModesObj[m.template_id] = m.modes || {};
                });
                setTemplateVariableMappings(varMapObj);
                setTemplateVariableModes(varModesObj);
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
        setVariableMappings(templateVariableMappings[template.wid] || {});
        setVariableMappingModes(templateVariableModes[template.wid] || {});
        setShowVariableMappingModal(true);
    };

    const handleSaveVariableMapping = async () => {
        setSavingVariableMapping(true);
        try {
            await api.put(`/whatsapp/template-variable-map/${mappingTemplate.wid}`, {
                template_id: mappingTemplate.wid, template_name: mappingTemplate.temp_name,
                mappings: variableMappings, modes: variableMappingModes
            });
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
                            const mappedCount = authkeyTemplates.filter(tpl => isTemplateFullyMapped(tpl)).length;
                            const notMappedCount = authkeyTemplates.length - mappedCount;
                            
                            const approvedAuthkey = authkeyTemplates;
                            let displayTemplates = [];
                            let displayDrafts = [];
                            
                            if (templateFilter === "all") { displayTemplates = authkeyTemplates; displayDrafts = customTemplates; }
                            else if (templateFilter === "approved") {
                                displayTemplates = approvedAuthkey;
                                if (mappingToggle === "mapped") {
                                    displayTemplates = displayTemplates.filter(tpl => { const vars = (tpl.temp_body.match(/\{\{\d+\}\}/g) || []).filter((v, i, a) => a.indexOf(v) === i); return vars.length === 0 || isTemplateFullyMapped(tpl); });
                                } else {
                                    displayTemplates = displayTemplates.filter(tpl => { const vars = (tpl.temp_body.match(/\{\{\d+\}\}/g) || []).filter((v, i, a) => a.indexOf(v) === i); return vars.length > 0 && !isTemplateFullyMapped(tpl); });
                                }
                            } else if (templateFilter === "pending") { displayTemplates = []; }
                            else if (templateFilter === "draft") { displayDrafts = customTemplates; }
                            
                            if (categoryFilter !== "all") { displayDrafts = displayDrafts.filter(ct => ct.category === categoryFilter); displayTemplates = []; }
                            
                            return (
                                <>
                                    <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <Select value={templateFilter} onValueChange={(val) => { setTemplateFilter(val); if (val === "approved") setMappingToggle("mapped"); }}>
                                                <SelectTrigger className="h-9 w-[140px] rounded-full text-sm" data-testid="status-filter"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="approved">Approved</SelectItem>
                                                    <SelectItem value="pending">Pending</SelectItem>
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
                                            <Button onClick={() => { setEditingCustomTemplate(null); setNewTemplate({ template_name: "", category: "utility", language: "en", header_type: "none", header_content: "", body: "", footer: "", buttons: [], media_url: "" }); setShowAddTemplate(true); }} className="bg-[#F26B33] hover:bg-[#D85A2A] text-white rounded-full" data-testid="add-template-btn"><Plus className="w-4 h-4 mr-1" /> Add Template</Button>
                                        </div>
                                    </div>
                                    <div className="border-b border-gray-200 mb-4"></div>
                                    
                                    {/* Draft Templates */}
                                    {displayDrafts.length > 0 && (
                                        <div className="mb-4">
                                            {displayTemplates.length > 0 && <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Draft Templates</p>}
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
                                                                <Badge className={`text-xs ${ct.status === "approved" ? "bg-[#25D366] text-white" : ct.status === "pending" ? "bg-amber-500 text-white" : "bg-gray-400 text-white"}`}>{ct.status === "approved" ? "Approved" : ct.status === "pending" ? "Pending" : "Draft"}</Badge>
                                                            </div>
                                                            <div className="bg-[#E5DDD5] p-3 rounded-lg mt-2">
                                                                <div className="bg-[#DCF8C6] rounded-lg p-3 shadow-sm max-w-[90%] relative">
                                                                    <p className="text-sm text-[#1A1A1A] whitespace-pre-wrap pr-12">{ct.body}</p>
                                                                    {ct.footer && <p className="text-xs text-gray-500 mt-2 border-t border-gray-200 pt-1">{ct.footer}</p>}
                                                                </div>
                                                            </div>
                                                            <div className="flex gap-2 mt-3">
                                                                {ct.status === "draft" && (
                                                                    <>
                                                                        <Button size="sm" variant="outline" onClick={() => openEditCustomTemplate(ct)}><Edit2 className="w-3 h-3 mr-1" /> Edit</Button>
                                                                        <Button size="sm" className="bg-[#F26B33] hover:bg-[#D85A2A] text-white" onClick={() => handleSubmitCustomTemplate(ct.id)}><Send className="w-3 h-3 mr-1" /> Submit</Button>
                                                                    </>
                                                                )}
                                                                {ct.status === "pending" && <span className="text-xs text-amber-600 flex items-center gap-1"><Clock className="w-3 h-3" /> Awaiting approval</span>}
                                                                <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 ml-auto" onClick={() => handleDeleteCustomTemplate(ct.id)}><Trash2 className="w-3 h-3" /></Button>
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
                                                            <h4 className="font-semibold text-[#1A1A1A] truncate">{tpl.temp_name}</h4>
                                                            <span className="text-xs text-gray-500 capitalize">{tpl.meta_data?.category || "utility"}</span>
                                                        </div>
                                                        <div className="flex items-center gap-1.5 ml-2 shrink-0">
                                                            <button onClick={() => openVariableMappingModal(tpl)} className="text-xs text-gray-500 hover:text-[#F26B33] flex items-center gap-1 px-2 py-1 rounded-md hover:bg-gray-50 transition-colors" data-testid={`map-vars-${tpl.wid}`}><Tag className="w-3 h-3" /> Map</button>
                                                            <button onClick={() => setExpandedPreviews(prev => ({...prev, [tpl.wid]: !prev[tpl.wid]}))} className="text-xs text-gray-500 hover:text-[#F26B33] flex items-center gap-1 px-2 py-1 rounded-md hover:bg-gray-50 transition-colors" data-testid={`preview-${tpl.wid}`}>{expandedPreviews[tpl.wid] ? <><EyeOff className="w-3 h-3" /> Hide</> : <><Eye className="w-3 h-3" /> Preview</>}</button>
                                                            <Badge className={`text-xs ${isMapped ? "bg-[#25D366] text-white" : "bg-amber-500 text-white"}`}>{isMapped ? "Mapped" : "Not Mapped"}</Badge>
                                                        </div>
                                                    </div>
                                                    {variables.length > 0 && (
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
                                                                    const parts = resolvePreviewWithSampleData(tpl.temp_body, mappings, modes);
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
                    <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2"><Tag className="w-5 h-5" />Map Template Variables</DialogTitle>
                            <DialogDescription>Choose to map each variable to a customer field or enter custom text</DialogDescription>
                        </DialogHeader>
                        {mappingTemplate && (
                            <div className="space-y-4">
                                <div className="rounded-lg overflow-hidden bg-[#E5DDD5]"><div className="p-3"><div className="bg-[#DCF8C6] rounded-lg p-3 shadow-sm">
                                    {(() => {
                                        const parts = resolvePreviewWithSampleData(mappingTemplate.temp_body, variableMappings, variableMappingModes);
                                        return (<><p className="text-sm text-[#1A1A1A] whitespace-pre-wrap pr-10">{parts.map((part, idx) => { if (part.type === "na") return <span key={idx} className="text-red-500 font-medium">NA</span>; return <span key={idx}>{part.value}</span>; })}</p><div className="flex items-center justify-end gap-1 mt-1"><span className="text-[10px] text-gray-500">{new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}</span><svg className="w-4 h-4 text-[#53BDEB]" viewBox="0 0 16 15" fill="currentColor"><path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.88a.32.32 0 0 1-.484.032l-.358-.325a.32.32 0 0 0-.484.032l-.378.48a.418.418 0 0 0 .036.54l1.32 1.267a.32.32 0 0 0 .484-.034l6.272-8.048a.366.366 0 0 0-.064-.51zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.88a.32.32 0 0 1-.484.032L1.89 7.77a.366.366 0 0 0-.516.005l-.423.433a.364.364 0 0 0 .006.514l3.255 3.185a.32.32 0 0 0 .484-.033l6.272-8.048a.365.365 0 0 0-.063-.51z"/></svg></div></>);
                                    })()}
                                </div></div></div>
                                <div className="space-y-3">
                                    {mappingTemplate.variables?.map(variable => (
                                        <div key={variable} className="bg-gray-50 rounded-xl p-3 space-y-2">
                                            <div className="flex items-center justify-between">
                                                <Badge variant="outline" className="bg-white font-mono text-sm">{variable}</Badge>
                                                <div className="flex rounded-lg border bg-white overflow-hidden">
                                                    <button type="button" onClick={() => setVariableMappingModes(prev => ({...prev, [variable]: "map"}))} className={`px-3 py-1 text-xs font-medium transition-colors ${(variableMappingModes[variable] || "map") === "map" ? "bg-[#F26B33] text-white" : "bg-white text-gray-600 hover:bg-gray-100"}`}>Map to Field</button>
                                                    <button type="button" onClick={() => setVariableMappingModes(prev => ({...prev, [variable]: "text"}))} className={`px-3 py-1 text-xs font-medium transition-colors ${variableMappingModes[variable] === "text" ? "bg-[#F26B33] text-white" : "bg-white text-gray-600 hover:bg-gray-100"}`}>Custom Text</button>
                                                </div>
                                            </div>
                                            {variableMappingModes[variable] === "text" ? (
                                                <Input type="text" value={variableMappings[variable] || ""} onChange={(e) => setVariableMappings(prev => ({...prev, [variable]: e.target.value}))} placeholder="Enter custom text..." className="h-10 rounded-lg" />
                                            ) : (
                                                <Select value={variableMappings[variable] || ""} onValueChange={(val) => setVariableMappings(prev => ({...prev, [variable]: val}))}><SelectTrigger className="h-10 rounded-lg bg-white"><SelectValue placeholder="Select a field..." /></SelectTrigger><SelectContent><SelectItem value="none">-- None --</SelectItem>{availableVariables.map(field => (<SelectItem key={field.key} value={field.key}>{field.label} (e.g., {field.example})</SelectItem>))}</SelectContent></Select>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                <DialogFooter className="gap-2">
                                    <Button variant="outline" onClick={() => { setShowVariableMappingModal(false); setMappingTemplate(null); setVariableMappings({}); setVariableMappingModes({}); }}>Cancel</Button>
                                    <Button onClick={handleSaveVariableMapping} disabled={savingVariableMapping} className="bg-[#F26B33] hover:bg-[#D85A2A] text-white" data-testid="save-variable-mapping-btn">{savingVariableMapping ? "Saving..." : "Save Mappings"}</Button>
                                </DialogFooter>
                            </div>
                        )}
                    </DialogContent>
                </Dialog>

            </div>
        </ResponsiveLayout>
    );
}
