import { useState, useEffect, useCallback, memo } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { MessageSquare, Settings, Plus, Check, X, Trash2, Eye, Tag, ChevronLeft, KeyRound, Pause, Play, Send, FlaskConical } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ResponsiveLayout } from "@/components/ResponsiveLayout";

// Extracted Test Template Modal — isolated state prevents parent re-renders on typing
const TestTemplateModal = memo(function TestTemplateModal({ open, onClose, template, eventKey, templateVariableMappings, templateVariableModes: parentVariableModes, availableVariables, eventLabels }) {
    const { api } = useAuth();
    const [testPhone, setTestPhone] = useState("");
    const [testCountryCode, setTestCountryCode] = useState("91");
    const [testVariables, setTestVariables] = useState({});
    const [testVariableModes, setTestVariableModes] = useState({});
    const [sendingTest, setSendingTest] = useState(false);
    const [testResult, setTestResult] = useState(null);

    useEffect(() => {
        if (open && template) {
            setTestPhone("");
            setTestCountryCode("91");
            setTestResult(null);
            const savedMapping = templateVariableMappings[template.wid] || {};
            const savedModes = (parentVariableModes || {})[template.wid] || {};
            const vars = {};
            const modes = {};
            const varRegex = /\{\{(\d+)\}\}/g;
            let match;
            while ((match = varRegex.exec(template.temp_body || "")) !== null) {
                const varKey = `{{${match[1]}}}`;
                const mappedField = savedMapping[varKey];
                const mode = savedModes[varKey] || "map";
                if (mode === "text" && mappedField) {
                    vars[varKey] = mappedField;
                } else if (mappedField && mappedField !== "none") {
                    const varInfo = availableVariables.find(v => v.key === mappedField);
                    vars[varKey] = varInfo?.example || "";
                } else {
                    vars[varKey] = "";
                }
                modes[varKey] = mode;
            }
            setTestVariables(vars);
            setTestVariableModes(modes);
        }
    }, [open, template]);

    const handleSendTest = async () => {
        if (!testPhone || testPhone.length < 10) {
            toast.error("Please enter a valid phone number");
            return;
        }
        setSendingTest(true);
        setTestResult(null);
        try {
            const bodyValues = {};
            Object.entries(testVariables).forEach(([key, value]) => {
                const num = key.replace(/[{}]/g, "");
                bodyValues[num] = value || "";
            });
            const response = await api.post("/whatsapp/test-template", {
                template_id: String(template.wid),
                phone: testPhone.replace(/\s/g, ""),
                country_code: String(testCountryCode).replace("+", ""),
                body_values: bodyValues
            });
            setTestResult(response.data);
            if (response.data.success) {
                toast.success("Test message sent successfully!");
            } else {
                const errorMsg = typeof response.data.error === 'string' ? response.data.error : JSON.stringify(response.data.error);
                toast.error(errorMsg || "Failed to send test message");
            }
        } catch (err) {
            let errorMsg = "Failed to send test message";
            const detail = err.response?.data?.detail;
            if (typeof detail === 'string') errorMsg = detail;
            else if (Array.isArray(detail)) errorMsg = detail.map(e => e.msg || e.message || JSON.stringify(e)).join(', ');
            else if (detail && typeof detail === 'object') errorMsg = detail.msg || detail.message || JSON.stringify(detail);
            setTestResult({ success: false, error: errorMsg });
            toast.error(errorMsg);
        } finally {
            setSendingTest(false);
        }
    };

    const getTestPreviewText = () => {
        if (!template?.temp_body) return "";
        let preview = template.temp_body;
        Object.entries(testVariables).forEach(([key, value]) => {
            preview = preview.replace(key, value || `[${key}]`);
        });
        return preview;
    };

    if (!template) return null;

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" onOpenAutoFocus={(e) => e.preventDefault()}>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FlaskConical className="w-5 h-5 text-blue-600" />
                        Test Template
                    </DialogTitle>
                    <DialogDescription>Send a test message to verify your template configuration</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-sm font-medium text-[#1A1A1A]">{template.temp_name}</p>
                        <p className="text-xs text-gray-500">Event: {eventLabels[eventKey] || eventKey}</p>
                    </div>
                    <div className="space-y-2">
                        <Label className="text-sm font-medium">Send Test To</Label>
                        <div className="flex gap-2">
                            <Select value={testCountryCode} onValueChange={setTestCountryCode}>
                                <SelectTrigger className="w-24"><SelectValue placeholder="+91" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="91">+91</SelectItem>
                                    <SelectItem value="1">+1</SelectItem>
                                    <SelectItem value="44">+44</SelectItem>
                                    <SelectItem value="971">+971</SelectItem>
                                </SelectContent>
                            </Select>
                            <Input
                                value={testPhone}
                                onChange={(e) => {
                                    const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
                                    setTestPhone(digits);
                                }}
                                placeholder="9876543210"
                                className="flex-1"
                                data-testid="test-phone-input"
                            />
                        </div>
                    </div>
                    {Object.keys(testVariables).length > 0 && (
                        <div className="space-y-3">
                            <Label className="text-sm font-medium">Template Variables</Label>
                            {Object.entries(testVariables).map(([varKey, value]) => {
                                const mode = testVariableModes[varKey] || "manual";
                                const savedMapping = templateVariableMappings[template.wid]?.[varKey];
                                const fieldInfo = availableVariables.find(v => v.key === savedMapping);
                                return (
                                    <div key={varKey} className="border rounded-lg p-3 bg-gray-50">
                                        <div className="flex items-center justify-between mb-2">
                                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">{varKey}</Badge>
                                            <div className="flex items-center gap-2">
                                                <button onClick={() => setTestVariableModes(prev => ({...prev, [varKey]: "manual"}))} className={`text-xs px-2 py-1 rounded ${mode === "manual" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600"}`}>Manual</button>
                                                <button onClick={() => { setTestVariableModes(prev => ({...prev, [varKey]: "mapped"})); if (fieldInfo) { setTestVariables(prev => ({...prev, [varKey]: fieldInfo.example})); } }} className={`text-xs px-2 py-1 rounded ${mode === "mapped" ? "bg-[#25D366] text-white" : "bg-gray-200 text-gray-600"}`} disabled={!fieldInfo}>Mapped</button>
                                            </div>
                                        </div>
                                        {mode === "manual" ? (
                                            <Input value={value} onChange={(e) => setTestVariables(prev => ({...prev, [varKey]: e.target.value}))} placeholder={`Enter value for ${varKey}`} className="bg-white" data-testid={`test-var-${varKey}`} />
                                        ) : (
                                            <div className="flex items-center gap-2 text-sm">
                                                <span className="text-gray-500">{fieldInfo?.label || savedMapping}:</span>
                                                <span className="font-medium text-[#25D366]">{value}</span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    <div className="space-y-2">
                        <Label className="text-xs text-gray-500">Preview</Label>
                        <div className="bg-[#E5DDD5] p-3 rounded-lg">
                            <div className="bg-[#DCF8C6] rounded-lg p-3 shadow-sm">
                                <p className="text-sm text-[#1A1A1A] whitespace-pre-wrap">{getTestPreviewText()}</p>
                                <div className="flex items-center justify-end gap-1 mt-1">
                                    <span className="text-[10px] text-gray-500">{new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                                    <svg className="w-4 h-4 text-[#53BDEB]" viewBox="0 0 16 15" fill="currentColor"><path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.88a.32.32 0 0 1-.484.032l-.358-.325a.32.32 0 0 0-.484.032l-.378.48a.418.418 0 0 0 .036.54l1.32 1.267a.32.32 0 0 0 .484-.034l6.272-8.048a.366.366 0 0 0-.064-.51zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.88a.32.32 0 0 1-.484.032L1.89 7.77a.366.366 0 0 0-.516.005l-.423.433a.364.364 0 0 0 .006.514l3.255 3.185a.32.32 0 0 0 .484-.033l6.272-8.048a.365.365 0 0 0-.063-.51z"/></svg>
                                </div>
                            </div>
                        </div>
                    </div>
                    {testResult && (
                        <div className={`rounded-lg p-3 ${testResult.success ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
                            {testResult.success ? (
                                <div className="flex items-center gap-2">
                                    <Check className="w-5 h-5 text-green-600" />
                                    <div>
                                        <p className="text-sm font-medium text-green-700">Test sent successfully!</p>
                                        {testResult.message_id && <p className="text-xs text-green-600">Message ID: {String(testResult.message_id)}</p>}
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <X className="w-5 h-5 text-red-600" />
                                    <div>
                                        <p className="text-sm font-medium text-red-700">Failed to send</p>
                                        <p className="text-xs text-red-600">{typeof testResult.error === 'string' ? testResult.error : JSON.stringify(testResult.error)}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={onClose}>Cancel</Button>
                        <Button onClick={handleSendTest} disabled={sendingTest || !testPhone} className="bg-blue-600 hover:bg-blue-700 text-white" data-testid="send-test-btn">
                            {sendingTest ? (<><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />Sending...</>) : (<><Send className="w-4 h-4 mr-2" />Send Test Message</>)}
                        </Button>
                    </DialogFooter>
                </div>
            </DialogContent>
        </Dialog>
    );
});

export function WhatsAppAutomationContent({ embedded = false }) {
    const { api } = useAuth();
    const navigate = useNavigate();
    const [templates, setTemplates] = useState([]);
    const [automationRules, setAutomationRules] = useState([]);
    const [availableEvents, setAvailableEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState("settings");
    const [whatsappApiKey, setWhatsappApiKey] = useState("");
    const [savingApiKey, setSavingApiKey] = useState(false);
    const [authkeyTemplates, setAuthkeyTemplates] = useState([]);
    const [eventMappings, setEventMappings] = useState({});
    const [loadingAuthkeyTemplates, setLoadingAuthkeyTemplates] = useState(false);
    const [savingMappings, setSavingMappings] = useState(false);
    const [editingEvent, setEditingEvent] = useState(null);
    const [editingEventValue, setEditingEventValue] = useState(null);
    
    // Filter state for automation events
    const [automationFilter, setAutomationFilter] = useState("all"); // "all", "active", "not_configured"
    
    // Filter state for templates tab
    const [templateFilter, setTemplateFilter] = useState("approved"); // "all", "approved", "pending", "draft"
    const [categoryFilter, setCategoryFilter] = useState("all"); // "all", "marketing", "utility", "authentication"
    const [mappingToggle, setMappingToggle] = useState("mapped"); // "mapped", "not_mapped" — only when status = approved
    
    // Custom template state
    const [customTemplates, setCustomTemplates] = useState([]);
    const [showAddTemplate, setShowAddTemplate] = useState(false);
    const [editingCustomTemplate, setEditingCustomTemplate] = useState(null);
    const [newTemplate, setNewTemplate] = useState({
        template_name: "",
        category: "utility",
        language: "en",
        header_type: "none",
        header_content: "",
        body: "",
        footer: "",
        buttons: [],
        media_url: ""
    });
    const [savingTemplate, setSavingTemplate] = useState(false);
    
    // Template form state
    const [showTemplateModal, setShowTemplateModal] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState(null);
    const [templateForm, setTemplateForm] = useState({
        name: "",
        message: "",
        media_type: null,
        media_url: "",
        variables: []
    });
    
    // Automation rule form state
    const [showRuleModal, setShowRuleModal] = useState(false);
    const [editingRule, setEditingRule] = useState(null);
    const [ruleForm, setRuleForm] = useState({
        event_type: "",
        template_id: "",
        is_enabled: true,
        delay_minutes: 0
    });

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
    
    // Template preview state for Automation dropdown
    const [showTemplatePreview, setShowTemplatePreview] = useState(false);
    const [previewTemplate, setPreviewTemplate] = useState(null);

    // Test Template state (controlled by parent, content managed by TestTemplateModal)
    const [showTestModal, setShowTestModal] = useState(false);
    const [testingTemplate, setTestingTemplate] = useState(null);
    const [testingEventKey, setTestingEventKey] = useState(null);

    // Available template variables
    const availableVariables = [
        { key: "customer_name", label: "Customer Name", example: "John" },
        { key: "points_balance", label: "Points Balance", example: "1,250" },
        { key: "points_earned", label: "Points Earned", example: "50" },
        { key: "points_redeemed", label: "Points Redeemed", example: "100" },
        { key: "wallet_balance", label: "Wallet Balance", example: "₹500" },
        { key: "amount", label: "Amount", example: "₹1,000" },
        { key: "tier", label: "Customer Tier", example: "Gold" },
        { key: "restaurant_name", label: "Restaurant Name", example: "Demo Restaurant" },
        { key: "coupon_code", label: "Coupon Code", example: "SAVE20" },
        { key: "expiry_date", label: "Expiry Date", example: "31 Dec 2025" }
    ];

    // Helper: Resolve preview text using sample customer data
    const resolvePreviewWithSampleData = (templateBody, mappings, modes) => {
        if (!templateBody) return { text: "", parts: [] };
        const parts = [];
        let remaining = templateBody;
        const varRegex = /\{\{\d+\}\}/g;
        let match;
        let lastIndex = 0;
        
        while ((match = varRegex.exec(templateBody)) !== null) {
            // Add text before this variable
            if (match.index > lastIndex) {
                parts.push({ type: "text", value: templateBody.slice(lastIndex, match.index) });
            }
            const varKey = match[0]; // e.g., "{{1}}"
            const mappedField = mappings?.[varKey];
            const mode = modes?.[varKey] || "map";
            
            if (mappedField && mappedField !== "none") {
                let sampleValue;
                if (mode === "text") {
                    sampleValue = mappedField; // custom text is the value itself
                } else {
                    sampleValue = sampleCustomerData[mappedField];
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

    // Event labels for better display
    // POS Events Labels
    const posEventLabels = {
        "new_order_customer": "New Order (Customer)",
        "new_order_outlet": "New Order (Outlet)",
        "order_confirmed": "Order Confirmed",
        "order_ready_customer": "Order Ready (Customer)",
        "item_ready": "Item Ready",
        "order_served": "Order Served",
        "item_served": "Item Served",
        "order_ready_delivery": "Order Ready (Delivery)",
        "order_dispatched": "Order Dispatched",
        "send_bill_manual": "Send Bill (Manual)",
        "send_bill_auto": "Send Bill (Auto)",
    };

    // CRM Events Labels
    const crmEventLabels = {
        "reset_password": "Reset Password (OTP)",
        "welcome_message": "Welcome Message",
        "birthday": "Birthday Wish",
        "anniversary": "Anniversary Wish",
        "points_earned": "Points Earned",
        "points_expiring": "Points Expiring",
        "feedback_request": "Feedback Request",
    };

    // Combined event labels for backward compatibility
    const eventLabels = {
        ...posEventLabels,
        ...crmEventLabels,
        // Legacy labels for old events
        "points_redeemed": "Points Redeemed",
        "bonus_points": "Bonus Points Given",
        "wallet_credit": "Wallet Top-up",
        "wallet_debit": "Wallet Payment",
        "first_visit": "First Visit Welcome",
        "tier_upgrade": "Tier Upgrade",
        "coupon_earned": "Coupon Received",
        "feedback_received": "Feedback Thank You",
        "inactive_reminder": "Win-back Message",
        "send_bill": "Send Bill (New Order)"
    };

    // POS Events descriptions
    const posEventDescriptions = {
        "new_order_customer": "Notify customer when a new order is placed",
        "new_order_outlet": "Alert outlet/restaurant when a new order is received",
        "order_confirmed": "Confirm order to customer when outlet accepts",
        "order_ready_customer": "Notify customer when order is ready for pickup/serve",
        "item_ready": "Notify customer when a specific item is ready",
        "order_served": "Notify customer when order has been served",
        "item_served": "Notify customer when a specific item has been served",
        "order_ready_delivery": "Alert delivery boy when order is ready for pickup",
        "order_dispatched": "Notify customer when order is out for delivery",
        "send_bill_manual": "Manually send bill/receipt to customer",
        "send_bill_auto": "Automatically send bill after order completion",
    };

    // CRM Events descriptions
    const crmEventDescriptions = {
        "reset_password": "Send OTP for forgot password verification",
        "welcome_message": "Welcome message for new customers",
        "birthday": "Send birthday wishes to customers on their special day",
        "anniversary": "Celebrate customer's anniversary with your business",
        "points_earned": "Notify when customer earns loyalty points",
        "points_expiring": "Remind customers before their points expire",
        "feedback_request": "Request feedback from customers after visit",
    };

    // Combined event descriptions
    const eventDescriptions = {
        ...posEventDescriptions,
        ...crmEventDescriptions,
        // Legacy descriptions
        "points_redeemed": "Notify customer when they redeem their loyalty points",
        "bonus_points": "Send when bonus points are added to customer's account",
        "wallet_credit": "Alert customer when wallet is topped up",
        "wallet_debit": "Confirm when payment is made from wallet",
        "first_visit": "Welcome message for first-time customers",
        "tier_upgrade": "Congratulate customer on reaching a new loyalty tier",
        "coupon_earned": "Notify when customer receives a new coupon",
        "feedback_received": "Thank customer for submitting feedback",
        "inactive_reminder": "Re-engage customers who haven't visited recently",
        "send_bill": "Send bill/receipt after a new order"
    };

    // Event category tab state
    const [eventCategoryTab, setEventCategoryTab] = useState("pos"); // "pos" or "crm"

    // State for automation card configuration modal
    const [showAutomationConfigModal, setShowAutomationConfigModal] = useState(false);
    const [configuringEvent, setConfiguringEvent] = useState(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [templatesRes, rulesRes, eventsRes, apiKeyRes] = await Promise.all([
                api.get("/whatsapp/templates"),
                api.get("/whatsapp/automation"),
                api.get("/whatsapp/automation/events"),
                api.get("/whatsapp/api-key")
            ]);
            setTemplates(templatesRes.data.templates || templatesRes.data || []);
            setAutomationRules(rulesRes.data);
            setAvailableEvents(eventsRes.data.events || []);
            setWhatsappApiKey(apiKeyRes.data.authkey_api_key || "");
            // Auto-load authkey templates if api key exists
            const apiKey = apiKeyRes.data.authkey_api_key || "";
            if (apiKey) {
                try {
                    const [tplRes, mapRes, varMapRes, sampleRes] = await Promise.all([
                        api.get("/whatsapp/authkey-templates"),
                        api.get("/whatsapp/event-template-map"),
                        api.get("/whatsapp/template-variable-map"),
                        api.get("/customers/sample-data")
                    ]);
                    setAuthkeyTemplates(tplRes.data.templates || []);
                    const mapObj = {};
                    (mapRes.data.mappings || []).forEach(m => {
                        mapObj[m.event_key] = { template_id: m.template_id, template_name: m.template_name, is_enabled: m.is_enabled !== false, saved: true };
                    });
                    setEventMappings(mapObj);
                    // Load variable mappings and modes
                    const varMapObj = {};
                    const varModesObj = {};
                    (varMapRes.data.mappings || []).forEach(m => {
                        varMapObj[m.template_id] = m.mappings || {};
                        varModesObj[m.template_id] = m.modes || {};
                    });
                    setTemplateVariableMappings(varMapObj);
                    setTemplateVariableModes(varModesObj);
                    // Load sample customer data
                    const sample = sampleRes.data.sample || {};
                    sample.restaurant_name = sampleRes.data.restaurant_name || "";
                    setSampleCustomerData(sample);
                } catch (_) {}
            }
            // Also fetch custom templates
            try {
                const customRes = await api.get("/whatsapp/custom-templates");
                setCustomTemplates(customRes.data.templates || []);
            } catch (_) {}
        } catch (err) {
            toast.error("Failed to load WhatsApp settings");
        } finally {
            setLoading(false);
        }
    };

    // Template CRUD
    const handleSaveApiKey = async () => {
        setSavingApiKey(true);
        try {
            await api.put("/whatsapp/api-key", { authkey_api_key: whatsappApiKey });
            toast.success("WhatsApp API key saved!");
        } catch (err) {
            toast.error("Failed to save API key");
        } finally {
            setSavingApiKey(false);
        }
    };

    const fetchAuthkeyTemplatesAndMappings = async () => {
        setLoadingAuthkeyTemplates(true);
        try {
            const [tplRes, mapRes] = await Promise.all([
                api.get("/whatsapp/authkey-templates"),
                api.get("/whatsapp/event-template-map")
            ]);
            setAuthkeyTemplates(tplRes.data.templates || []);
            const mapObj = {};
            (mapRes.data.mappings || []).forEach(m => {
                mapObj[m.event_key] = { template_id: m.template_id, template_name: m.template_name, saved: true };
            });
            setEventMappings(mapObj);
        } catch (err) {
            if (err.response?.status === 400) {
                toast.error(err.response.data?.detail || "Add your API key in Settings first");
            } else {
                toast.error("Failed to load AuthKey templates");
            }
        } finally {
            setLoadingAuthkeyTemplates(false);
        }
    };

    const handleSaveEventMapping = async (eventKey, templateId, templateName) => {
        setSavingMappings(true);
        try {
            if (templateId === null) {
                // Clear/unmap the template - send delete request or empty mapping
                await api.delete(`/whatsapp/event-template-map/${eventKey}`);
                setEventMappings(prev => {
                    const newMappings = { ...prev };
                    delete newMappings[eventKey];
                    return newMappings;
                });
                toast.success(`Template removed from ${eventLabels[eventKey] || eventKey}`);
            } else {
                await api.put("/whatsapp/event-template-map", {
                    mappings: [{ event_key: eventKey, template_id: templateId, template_name: templateName, is_enabled: true }]
                });
                setEventMappings(prev => ({
                    ...prev,
                    [eventKey]: { template_id: templateId, template_name: templateName, is_enabled: true, saved: true },
                }));
                toast.success(`Template saved for ${eventLabels[eventKey] || eventKey}`);
            }
            setEditingEvent(null);
            setEditingEventValue(null);
        } catch (err) {
            toast.error("Failed to save mapping");
        } finally {
            setSavingMappings(false);
        }
    };

    const handleToggleEventMapping = async (eventKey) => {
        try {
            const res = await api.post(`/whatsapp/event-template-map/${eventKey}/toggle`);
            setEventMappings(prev => ({
                ...prev,
                [eventKey]: { ...prev[eventKey], is_enabled: res.data.is_enabled },
            }));
            toast.success(`${eventLabels[eventKey] || eventKey} ${res.data.is_enabled ? "enabled" : "disabled"}`);
        } catch (err) {
            toast.error("Failed to toggle");
        }
    };

    // Variable Mapping Functions
    
    // Helper: Check if all template variables are mapped
    const isTemplateFullyMapped = (template) => {
        // Extract variables from template body ({{1}}, {{2}}, etc.)
        const variables = (template.temp_body?.match(/\{\{\d+\}\}/g) || []).filter((v, i, a) => a.indexOf(v) === i);
        
        // If no variables in template, it's considered fully mapped
        if (variables.length === 0) return true;
        
        // Get mappings for this template
        const mappings = templateVariableMappings[template.wid] || {};
        
        // Check if ALL variables have a non-empty mapping
        return variables.every(v => {
            const mapping = mappings[v];
            return mapping && mapping.trim() !== "";
        });
    };
    
    const openVariableMappingModal = (template) => {
        const variables = (template.temp_body.match(/\{\{\d+\}\}/g) || []).filter((v, i, a) => a.indexOf(v) === i);
        setMappingTemplate({ ...template, variables });
        // Load existing mappings and modes for this template
        const existingMappings = templateVariableMappings[template.wid] || {};
        const existingModes = templateVariableModes[template.wid] || {};
        setVariableMappings(existingMappings);
        setVariableMappingModes(existingModes);
        setShowVariableMappingModal(true);
    };

    const handleSaveVariableMapping = async () => {
        setSavingVariableMapping(true);
        try {
            await api.put(`/whatsapp/template-variable-map/${mappingTemplate.wid}`, {
                template_id: mappingTemplate.wid,
                template_name: mappingTemplate.temp_name,
                mappings: variableMappings,
                modes: variableMappingModes
            });
            setTemplateVariableMappings(prev => ({
                ...prev,
                [mappingTemplate.wid]: variableMappings
            }));
            setTemplateVariableModes(prev => ({
                ...prev,
                [mappingTemplate.wid]: variableMappingModes
            }));
            toast.success("Variable mappings saved!");
            setShowVariableMappingModal(false);
            setMappingTemplate(null);
            setVariableMappings({});
            setVariableMappingModes({});
        } catch (err) {
            toast.error("Failed to save variable mappings");
        } finally {
            setSavingVariableMapping(false);
        }
    };

    const fetchVariableMappings = async () => {
        try {
            const res = await api.get("/whatsapp/template-variable-map");
            const mappingsObj = {};
            const modesObj = {};
            (res.data.mappings || []).forEach(m => {
                mappingsObj[m.template_id] = m.mappings || {};
                modesObj[m.template_id] = m.modes || {};
            });
            setTemplateVariableMappings(mappingsObj);
            setTemplateVariableModes(modesObj);
        } catch (err) {
            console.error("Failed to load variable mappings:", err);
        }
    };

    // Custom template functions
    const fetchCustomTemplates = async () => {
        try {
            const res = await api.get("/whatsapp/custom-templates");
            setCustomTemplates(res.data.templates || []);
        } catch (err) {
            console.error("Failed to fetch custom templates:", err);
        }
    };

    const handleSaveCustomTemplate = async () => {
        if (!newTemplate.template_name.trim() || !newTemplate.body.trim()) {
            toast.error("Template name and body are required");
            return;
        }
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
            setNewTemplate({ template_name: "", category: "utility", language: "en", header_type: "none", header_content: "", body: "", footer: "", buttons: [], media_url: "" });
            fetchCustomTemplates();
        } catch (err) {
            toast.error("Failed to save template");
        } finally {
            setSavingTemplate(false);
        }
    };

    const handleDeleteCustomTemplate = async (templateId) => {
        try {
            await api.delete(`/whatsapp/custom-templates/${templateId}`);
            toast.success("Template deleted");
            fetchCustomTemplates();
        } catch (err) {
            toast.error("Failed to delete template");
        }
    };

    const handleSubmitCustomTemplate = async (templateId) => {
        try {
            await api.put(`/whatsapp/custom-templates/${templateId}/submit`);
            toast.success("Template submitted for approval");
            fetchCustomTemplates();
        } catch (err) {
            toast.error("Failed to submit template");
        }
    };

    const openEditCustomTemplate = (template) => {
        setEditingCustomTemplate(template);
        setNewTemplate({
            template_name: template.template_name,
            category: template.category,
            language: template.language,
            header_type: template.header_type || "none",
            header_content: template.header_content || "",
            body: template.body,
            footer: template.footer || "",
            buttons: template.buttons || [],
            media_url: template.media_url || ""
        });
        setShowAddTemplate(true);
    };

    const handleSaveTemplate = async () => {
        try {
            if (editingTemplate) {
                await api.put(`/whatsapp/templates/${editingTemplate.id}`, templateForm);
                toast.success("Template updated!");
            } else {
                await api.post("/whatsapp/templates", templateForm);
                toast.success("Template created!");
            }
            setShowTemplateModal(false);
            setEditingTemplate(null);
            setTemplateForm({ name: "", message: "", media_type: null, media_url: "", variables: [] });
            fetchData();
        } catch (err) {
            toast.error(err.response?.data?.detail || "Failed to save template");
        }
    };

    const handleEditTemplate = (template) => {
        setEditingTemplate(template);
        setTemplateForm({
            name: template.name,
            message: template.message,
            media_type: template.media_type || null,
            media_url: template.media_url || "",
            variables: template.variables || []
        });
        setShowTemplateModal(true);
    };

    const handleDeleteTemplate = async (templateId) => {
        if (!window.confirm("Are you sure you want to delete this template?")) return;
        try {
            await api.delete(`/whatsapp/templates/${templateId}`);
            toast.success("Template deleted!");
            fetchData();
        } catch (err) {
            toast.error(err.response?.data?.detail || "Failed to delete template");
        }
    };

    // Automation Rule CRUD
    const handleSaveRule = async () => {
        try {
            if (editingRule) {
                await api.put(`/whatsapp/automation/${editingRule.id}`, ruleForm);
                toast.success("Automation rule updated!");
            } else {
                await api.post("/whatsapp/automation", ruleForm);
                toast.success("Automation rule created!");
            }
            setShowRuleModal(false);
            setEditingRule(null);
            setRuleForm({ event_type: "", template_id: "", is_enabled: true, delay_minutes: 0 });
            fetchData();
        } catch (err) {
            toast.error(err.response?.data?.detail || "Failed to save rule");
        }
    };

    const handleEditRule = (rule) => {
        setEditingRule(rule);
        setRuleForm({
            event_type: rule.event_type,
            template_id: rule.template_id,
            is_enabled: rule.is_enabled,
            delay_minutes: rule.delay_minutes || 0
        });
        setShowRuleModal(true);
    };

    const handleDeleteRule = async (ruleId) => {
        if (!window.confirm("Are you sure you want to delete this automation rule?")) return;
        try {
            await api.delete(`/whatsapp/automation/${ruleId}`);
            toast.success("Automation rule deleted!");
            fetchData();
        } catch (err) {
            toast.error(err.response?.data?.detail || "Failed to delete rule");
        }
    };

    const handleToggleRule = async (ruleId) => {
        try {
            await api.post(`/whatsapp/automation/${ruleId}/toggle`);
            fetchData();
        } catch (err) {
            toast.error("Failed to toggle rule");
        }
    };

    const toggleVariable = (varKey) => {
        setTemplateForm(prev => ({
            ...prev,
            variables: prev.variables.includes(varKey)
                ? prev.variables.filter(v => v !== varKey)
                : [...prev.variables, varKey]
        }));
    };

    const insertVariableInMessage = (varKey) => {
        setTemplateForm(prev => ({
            ...prev,
            message: prev.message + `{{${varKey}}}`
        }));
        if (!templateForm.variables.includes(varKey)) {
            toggleVariable(varKey);
        }
    };

    // Get template name by ID
    const getTemplateName = (templateId) => {
        const template = templates.find(t => t.id === templateId);
        return template?.name || "Unknown Template";
    };

    // Preview message with variable placeholders highlighted
    const renderPreviewMessage = (message) => {
        if (!message) return "";
        return message.replace(/\{\{(\w+)\}\}/g, (match, varKey) => {
            const varInfo = availableVariables.find(v => v.key === varKey);
            return `[${varInfo?.example || varKey}]`;
        });
    };

    // Open Test Template Modal
    const openTestModal = (eventKey, template) => {
        setTestingEventKey(eventKey);
        setTestingTemplate(template);
        setShowTestModal(true);
    };

    if (loading) {
        const loadingUI = (
            <div className={embedded ? "" : "p-4 max-w-lg mx-auto"}>
                <div className="animate-pulse space-y-4">
                    <div className="h-8 bg-gray-200 rounded w-48"></div>
                    <div className="h-32 bg-gray-200 rounded-xl"></div>
                    <div className="h-32 bg-gray-200 rounded-xl"></div>
                </div>
            </div>
        );
        return embedded ? loadingUI : <ResponsiveLayout>{loadingUI}</ResponsiveLayout>;
    }

    const ContentWrapper = ({ children }) => {
        if (embedded) return <>{children}</>;
        return (
            <ResponsiveLayout>
                <div className="p-4 lg:p-6 xl:p-8 max-w-[1600px] mx-auto">
                    {/* Header */}
                    <div className="flex items-center gap-3 mb-6 lg:mb-8">
                        <button 
                            onClick={() => navigate("/settings")}
                            className="p-2 hover:bg-gray-100 rounded-full lg:hidden"
                            data-testid="back-btn"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <div>
                            <h1 className="text-2xl lg:text-3xl font-bold text-[#1A1A1A] font-['Montserrat']" data-testid="whatsapp-title">
                                WhatsApp Automation
                            </h1>
                            <p className="text-sm lg:text-base text-[#52525B]">Templates & event triggers</p>
                        </div>
                    </div>
                    {children}
                </div>
            </ResponsiveLayout>
        );
    };

    return (
        <ContentWrapper>

                {/* Info Banner */}
                <Card className="rounded-xl border-0 shadow-sm mb-4 bg-[#25D366]/10">
                    <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                            <MessageSquare className="w-5 h-5 text-[#25D366] mt-0.5" />
                            <div className="flex-1">
                                <p className="text-sm font-medium text-[#1A1A1A]">Automated WhatsApp Messages</p>
                                <p className="text-xs text-[#52525B] mt-1">
                                    Create message templates and configure which events trigger automatic WhatsApp messages to your customers.
                                </p>
                            </div>
                            <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => navigate("/message-status")}
                                className="shrink-0"
                                data-testid="view-message-status-btn"
                            >
                                <Eye className="w-4 h-4 mr-1" /> Message Status
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* Automation Content */}
                <div className="mt-4">
                        {!whatsappApiKey ? (
                            <Card className="rounded-xl border-0 shadow-sm">
                                <CardContent className="p-8 text-center">
                                    <KeyRound className="w-12 h-12 text-amber-400 mx-auto mb-3" />
                                    <p className="text-[#52525B]">API Key Required</p>
                                    <p className="text-xs text-gray-400 mt-1">Add your AuthKey.io API key in {embedded ? "the Profile tab" : "Settings"} to use automation</p>
                                    {!embedded && <Button onClick={() => navigate("/settings")} variant="outline" className="mt-4">
                                        Go to Settings
                                    </Button>}
                                </CardContent>
                            </Card>
                        ) : (
                            <>
                                {authkeyTemplates.length === 0 && !loadingAuthkeyTemplates && (
                                    <Button
                                        onClick={fetchAuthkeyTemplatesAndMappings}
                                        className="w-full h-12 bg-[#25D366] hover:bg-[#1da851] rounded-xl mb-4"
                                        data-testid="load-authkey-templates-btn"
                                    >
                                        Load WhatsApp Templates
                                    </Button>
                                )}
                                {loadingAuthkeyTemplates ? (
                                    <Card className="rounded-xl border-0 shadow-sm">
                                        <CardContent className="p-8 text-center">
                                            <div className="w-8 h-8 border-3 border-[#25D366] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                                            <p className="text-[#52525B]">Fetching templates from AuthKey.io...</p>
                                        </CardContent>
                                    </Card>
                                ) : authkeyTemplates.length > 0 && (
                                    <>
                                        {/* POS Events / CRM Events Tab Selector */}
                                        <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-xl">
                                            <button
                                                onClick={() => setEventCategoryTab("pos")}
                                                className={`flex-1 px-4 py-2.5 text-sm font-semibold rounded-lg transition-all ${
                                                    eventCategoryTab === "pos" 
                                                        ? "bg-white text-[#F26B33] shadow-sm" 
                                                        : "text-gray-600 hover:text-gray-900"
                                                }`}
                                                data-testid="pos-events-tab"
                                            >
                                                POS Events
                                            </button>
                                            <button
                                                onClick={() => setEventCategoryTab("crm")}
                                                className={`flex-1 px-4 py-2.5 text-sm font-semibold rounded-lg transition-all ${
                                                    eventCategoryTab === "crm" 
                                                        ? "bg-white text-[#F26B33] shadow-sm" 
                                                        : "text-gray-600 hover:text-gray-900"
                                                }`}
                                                data-testid="crm-events-tab"
                                            >
                                                CRM Events
                                            </button>
                                        </div>

                                        {/* Filter Tabs for Automation */}
                                        {(() => {
                                            // Get events based on selected category tab
                                            const posEvents = Object.keys(posEventLabels);
                                            const crmEvents = Object.keys(crmEventLabels);
                                            const categoryEvents = eventCategoryTab === "pos" ? posEvents : crmEvents;
                                            
                                            const activeCount = categoryEvents.filter(k => eventMappings[k]?.saved && eventMappings[k]?.is_enabled !== false).length;
                                            const notConfiguredCount = categoryEvents.length - categoryEvents.filter(k => eventMappings[k]?.saved).length;
                                            
                                            // Filter events based on filter and category
                                            const filteredEvents = categoryEvents.filter(eventKey => {
                                                const mapped = eventMappings[eventKey];
                                                const isSaved = mapped?.saved;
                                                const isEnabled = mapped?.is_enabled !== false;
                                                
                                                if (automationFilter === "active") return isSaved && isEnabled;
                                                if (automationFilter === "not_configured") return !isSaved;
                                                return true; // "all"
                                            });
                                            
                                            return (
                                                <>
                                                    <div className="flex gap-2 mb-4 border-b border-gray-200 pb-3">
                                                        <button
                                                            onClick={() => setAutomationFilter("all")}
                                                            className={`px-3 py-1.5 text-sm font-medium rounded-full transition-colors ${
                                                                automationFilter === "all" 
                                                                    ? "bg-[#1A1A1A] text-white" 
                                                                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                                            }`}
                                                            data-testid="filter-all-events"
                                                        >
                                                            All ({categoryEvents.length})
                                                        </button>
                                                        <button
                                                            onClick={() => setAutomationFilter("active")}
                                                            className={`px-3 py-1.5 text-sm font-medium rounded-full transition-colors ${
                                                                automationFilter === "active" 
                                                                    ? "bg-[#25D366] text-white" 
                                                                    : "bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20"
                                                            }`}
                                                            data-testid="filter-active-events"
                                                        >
                                                            Active ({activeCount})
                                                        </button>
                                                        <button
                                                            onClick={() => setAutomationFilter("not_configured")}
                                                            className={`px-3 py-1.5 text-sm font-medium rounded-full transition-colors ${
                                                                automationFilter === "not_configured" 
                                                                    ? "bg-gray-500 text-white" 
                                                                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                                            }`}
                                                            data-testid="filter-not-configured-events"
                                                        >
                                                            Not Configured ({notConfiguredCount})
                                                        </button>
                                                    </div>

                                                    {/* Event Cards Grid */}
                                                    <div className="space-y-3" data-testid="automation-events-list">
                                                        {filteredEvents.length === 0 ? (
                                                            <Card className="rounded-xl">
                                                                <CardContent className="p-8 text-center">
                                                                    <p className="text-[#52525B]">No events match this filter</p>
                                                                </CardContent>
                                                            </Card>
                                                        ) : filteredEvents.map(eventKey => {
                                                            const mapped = eventMappings[eventKey];
                                                            const isSaved = mapped?.saved;
                                                            const isEnabled = mapped?.is_enabled !== false;

                                                return (
                                                    <Card 
                                                        key={eventKey} 
                                                        className={`rounded-xl hover:shadow-md transition-shadow ${isSaved && isEnabled ? 'border-l-4 border-l-[#25D366]' : ''}`}
                                                        data-testid={`event-card-${eventKey}`}
                                                    >
                                                        <CardContent className="p-4">
                                                            {/* Row 1: Event name, description & badge */}
                                                            <div className="flex items-start justify-between mb-3">
                                                                <div className="flex-1">
                                                                    <div className="flex items-center gap-2 mb-1">
                                                                        <svg className={`w-4 h-4 ${isSaved && isEnabled ? 'text-[#25D366]' : 'text-gray-400'}`} viewBox="0 0 24 24" fill="currentColor">
                                                                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                                                                        </svg>
                                                                        <h3 className="font-semibold text-[#1A1A1A]" data-testid={`event-name-${eventKey}`}>
                                                                            {eventLabels[eventKey] || eventKey}
                                                                        </h3>
                                                                        <Badge className={`${isSaved ? (isEnabled ? 'bg-[#25D366]' : 'bg-amber-500') : 'bg-gray-400'} text-white text-xs`}>
                                                                            {isSaved ? (isEnabled ? "Active" : "Paused") : "Not Configured"}
                                                                        </Badge>
                                                                    </div>
                                                                    <p className="text-xs text-[#52525B] ml-6">
                                                                        {eventDescriptions[eventKey] || "Send WhatsApp message on this event"}
                                                                    </p>
                                                                </div>
                                                            </div>

                                                            {/* WhatsApp Configuration Status */}
                                                            {isSaved ? (
                                                                <div className={`rounded-lg p-3 mb-3 border ${
                                                                    isEnabled 
                                                                        ? 'bg-[#25D366]/10 border-[#25D366]/20' 
                                                                        : 'bg-gray-100 border-gray-300'
                                                                }`}>
                                                                    <div className="flex items-start justify-between">
                                                                        <div className="flex-1">
                                                                            <div className="flex items-center gap-2 mb-1">
                                                                                <svg className={`w-4 h-4 ${isEnabled ? 'text-[#25D366]' : 'text-gray-400'}`} viewBox="0 0 24 24" fill="currentColor">
                                                                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                                                                                </svg>
                                                                                <span className={`text-sm font-medium ${isEnabled ? 'text-[#25D366]' : 'text-gray-500'}`}>
                                                                                    WhatsApp Template
                                                                                </span>
                                                                                {!isEnabled && (
                                                                                    <Badge variant="outline" className="text-xs bg-gray-200 text-gray-600">Paused</Badge>
                                                                                )}
                                                                            </div>
                                                                            <p className={`text-xs ml-6 ${isEnabled ? 'text-gray-700' : 'text-gray-500'}`}>
                                                                                <span className="font-medium">Template:</span> {mapped.template_name}
                                                                            </p>
                                                                            <p className={`text-xs ml-6 ${isEnabled ? 'text-gray-600' : 'text-gray-400'}`}>
                                                                                <span className="font-medium">Trigger:</span> Automatic on event
                                                                            </p>
                                                                        </div>
                                                                        <div className="flex items-center gap-1">
                                                                            {/* Preview Button */}
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    const tpl = authkeyTemplates.find(t => t.wid === mapped.template_id);
                                                                                    if (tpl) {
                                                                                        setPreviewTemplate(tpl);
                                                                                        setShowTemplatePreview(true);
                                                                                    }
                                                                                }}
                                                                                className="text-gray-500 hover:text-[#25D366] p-1.5 rounded transition-colors hover:bg-[#25D366]/10"
                                                                                title="Preview template"
                                                                                data-testid={`preview-event-${eventKey}`}
                                                                            >
                                                                                <Eye className="w-4 h-4" />
                                                                            </button>
                                                                            {/* Test Button - Only for Active templates */}
                                                                            {isEnabled && (
                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        const tpl = authkeyTemplates.find(t => t.wid === mapped.template_id);
                                                                                        if (tpl) {
                                                                                            openTestModal(eventKey, tpl);
                                                                                        }
                                                                                    }}
                                                                                    className="text-gray-500 hover:text-blue-600 p-1.5 rounded transition-colors hover:bg-blue-50"
                                                                                    title="Send test message"
                                                                                    data-testid={`test-event-${eventKey}`}
                                                                                >
                                                                                    <FlaskConical className="w-4 h-4" />
                                                                                </button>
                                                                            )}
                                                                            {/* Pause/Resume Button */}
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    handleToggleEventMapping(eventKey);
                                                                                }}
                                                                                className={`p-1.5 rounded transition-colors ${
                                                                                    isEnabled 
                                                                                        ? 'text-gray-500 hover:text-amber-600 hover:bg-amber-50' 
                                                                                        : 'text-[#25D366] hover:text-[#20BD5A] hover:bg-[#25D366]/10'
                                                                                }`}
                                                                                title={isEnabled ? "Pause automation" : "Resume automation"}
                                                                                data-testid={`toggle-event-${eventKey}`}
                                                                            >
                                                                                {isEnabled ? (
                                                                                    <Pause className="w-4 h-4" />
                                                                                ) : (
                                                                                    <Play className="w-4 h-4" />
                                                                                )}
                                                                            </button>
                                                                            {/* Delete Button */}
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    if (window.confirm(`Remove template from "${eventLabels[eventKey]}"?`)) {
                                                                                        handleSaveEventMapping(eventKey, null, null);
                                                                                    }
                                                                                }}
                                                                                className="text-gray-400 hover:text-red-500 p-1.5 rounded transition-colors hover:bg-red-50"
                                                                                title="Remove template"
                                                                                data-testid={`delete-event-${eventKey}`}
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
                                                                        <span className="text-xs">No WhatsApp template configured for this event</span>
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* Action Buttons */}
                                                            <div className="flex gap-2">
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    onClick={() => {
                                                                        setConfiguringEvent(eventKey);
                                                                        setEditingEventValue(mapped?.template_id?.toString() || "");
                                                                        setShowAutomationConfigModal(true);
                                                                    }}
                                                                    className="flex-1 h-9"
                                                                    data-testid={`configure-event-${eventKey}`}
                                                                >
                                                                    <Settings className="w-4 h-4 mr-1" />
                                                                    {isSaved ? "Edit" : "Configure"}
                                                                </Button>
                                                                
                                                            </div>
                                                        </CardContent>
                                                    </Card>
                                                );
                                            })}
                                        </div>
                                                </>
                                            );
                                        })()}
                                    </>
                                )}
                            </>
                        )}
                    </div>

                    {/* Automation Configuration Modal */}
                    <Dialog open={showAutomationConfigModal} onOpenChange={setShowAutomationConfigModal}>
                        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                                <DialogTitle>Configure {eventLabels[configuringEvent] || configuringEvent}</DialogTitle>
                                <DialogDescription>
                                    {eventDescriptions[configuringEvent] || "Select a WhatsApp template to send when this event occurs"}
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-2">
                                {/* Template Selection */}
                                <div>
                                    <Label className="text-sm font-medium mb-2 block">WhatsApp Template</Label>
                                    <Select
                                        value={editingEventValue || ""}
                                        onValueChange={(val) => setEditingEventValue(val)}
                                    >
                                        <SelectTrigger className="h-10 rounded-xl" data-testid="modal-select-template">
                                            <SelectValue placeholder="Select a template" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">
                                                <span className="text-gray-500">None (Remove template)</span>
                                            </SelectItem>
                                            {authkeyTemplates
                                                .filter(tpl => isTemplateFullyMapped(tpl))
                                                .map(tpl => (
                                                    <SelectItem key={tpl.wid} value={tpl.wid.toString()}>
                                                        {tpl.temp_name}
                                                    </SelectItem>
                                                ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Template Preview */}
                                {editingEventValue && editingEventValue !== "none" && (
                                    <div className="rounded-lg border border-gray-200 overflow-hidden">
                                        <div className="bg-gray-50 px-3 py-2 border-b border-gray-200">
                                            <span className="text-xs font-medium text-gray-600">Template Preview</span>
                                        </div>
                                        <div className="p-3 bg-[#E5DDD5]">
                                            <div className="bg-[#DCF8C6] rounded-lg p-3 shadow-sm max-w-[280px]">
                                                {(() => {
                                                    const tpl = authkeyTemplates.find(t => t.wid.toString() === editingEventValue);
                                                    if (!tpl) return null;
                                                    const varMappings = templateVariableMappings[tpl.wid] || {};
                                                    const varModes = templateVariableModes[tpl.wid] || {};
                                                    const parts = resolvePreviewWithSampleData(tpl.temp_body, varMappings, varModes);
                                                    return (
                                                        <>
                                                            <p className="text-sm text-[#1A1A1A] whitespace-pre-wrap pr-10">
                                                                {parts.map((part, idx) => {
                                                                    if (part.type === "na") return <span key={idx} className="text-red-500 font-medium">NA</span>;
                                                                    return <span key={idx}>{part.value}</span>;
                                                                })}
                                                            </p>
                                                            <div className="flex items-center justify-end gap-1 mt-1">
                                                                <span className="text-[10px] text-gray-500">
                                                                    {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                                                                </span>
                                                                <svg className="w-4 h-4 text-[#53BDEB]" viewBox="0 0 16 15" fill="currentColor">
                                                                    <path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.88a.32.32 0 0 1-.484.032l-.358-.325a.32.32 0 0 0-.484.032l-.378.48a.418.418 0 0 0 .036.54l1.32 1.267a.32.32 0 0 0 .484-.034l6.272-8.048a.366.366 0 0 0-.064-.51zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.88a.32.32 0 0 1-.484.032L1.89 7.77a.366.366 0 0 0-.516.005l-.423.433a.364.364 0 0 0 .006.514l3.255 3.185a.32.32 0 0 0 .484-.033l6.272-8.048a.365.365 0 0 0-.063-.51z"/>
                                                                </svg>
                                                            </div>
                                                        </>
                                                    );
                                                })()}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="flex justify-end gap-2 pt-2">
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        setShowAutomationConfigModal(false);
                                        setConfiguringEvent(null);
                                        setEditingEventValue(null);
                                    }}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    className="bg-[#25D366] hover:bg-[#1da851] text-white"
                                    disabled={savingMappings || !editingEventValue}
                                    onClick={() => {
                                        if (editingEventValue === "none") {
                                            handleSaveEventMapping(configuringEvent, null, null);
                                        } else {
                                            const tpl = authkeyTemplates.find(t => t.wid.toString() === editingEventValue);
                                            if (tpl) handleSaveEventMapping(configuringEvent, tpl.wid, tpl.temp_name);
                                        }
                                        setShowAutomationConfigModal(false);
                                        setConfiguringEvent(null);
                                        setEditingEventValue(null);
                                    }}
                                    data-testid="modal-save-template"
                                >
                                    {savingMappings ? "Saving..." : "Save Configuration"}
                                </Button>
                            </div>
                        </DialogContent>
                    </Dialog>

                {/* Add Template Dialog */}
                <Dialog open={showAddTemplate} onOpenChange={(open) => {
                    setShowAddTemplate(open);
                    if (!open) { setEditingCustomTemplate(null); setNewTemplate({ template_name: "", category: "utility", language: "en", header_type: "none", header_content: "", body: "", footer: "", buttons: [], media_url: "" }); }
                }}>
                    <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <Plus className="w-5 h-5 text-[#25D366]" />
                                {editingCustomTemplate ? "Edit Template" : "Add New Template"}
                            </DialogTitle>
                            <DialogDescription>
                                {editingCustomTemplate ? "Update your template. Status will reset to Draft." : "Create a new WhatsApp message template."}
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                            {/* Template Name */}
                            <div className="space-y-1">
                                <Label className="text-sm font-medium">Template Name</Label>
                                <Input
                                    value={newTemplate.template_name}
                                    onChange={(e) => setNewTemplate(p => ({...p, template_name: e.target.value}))}
                                    placeholder="e.g., order_confirmation"
                                    className="rounded-lg"
                                    data-testid="new-tpl-name"
                                />
                            </div>
                            
                            {/* Category & Language */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <Label className="text-sm font-medium">Category</Label>
                                    <Select value={newTemplate.category} onValueChange={(val) => setNewTemplate(p => ({...p, category: val}))}>
                                        <SelectTrigger className="rounded-lg" data-testid="new-tpl-category">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="marketing">Marketing</SelectItem>
                                            <SelectItem value="utility">Utility</SelectItem>
                                            <SelectItem value="authentication">Authentication</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-sm font-medium">Language</Label>
                                    <Select value={newTemplate.language} onValueChange={(val) => setNewTemplate(p => ({...p, language: val}))}>
                                        <SelectTrigger className="rounded-lg" data-testid="new-tpl-language">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="en">English</SelectItem>
                                            <SelectItem value="hi">Hindi</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {/* Header */}
                            <div className="space-y-1">
                                <Label className="text-sm font-medium">Header (optional)</Label>
                                <Select value={newTemplate.header_type} onValueChange={(val) => setNewTemplate(p => ({...p, header_type: val, header_content: ""}))}>
                                    <SelectTrigger className="rounded-lg" data-testid="new-tpl-header-type">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">None</SelectItem>
                                        <SelectItem value="text">Text</SelectItem>
                                        <SelectItem value="image">Image</SelectItem>
                                        <SelectItem value="video">Video</SelectItem>
                                        <SelectItem value="document">Document</SelectItem>
                                    </SelectContent>
                                </Select>
                                {newTemplate.header_type === "text" && (
                                    <Input
                                        value={newTemplate.header_content}
                                        onChange={(e) => setNewTemplate(p => ({...p, header_content: e.target.value}))}
                                        placeholder="Header text..."
                                        className="rounded-lg mt-2"
                                        data-testid="new-tpl-header-text"
                                    />
                                )}
                                {(newTemplate.header_type === "image" || newTemplate.header_type === "video" || newTemplate.header_type === "document") && (
                                    <Input
                                        value={newTemplate.media_url}
                                        onChange={(e) => setNewTemplate(p => ({...p, media_url: e.target.value}))}
                                        placeholder="Media URL..."
                                        className="rounded-lg mt-2"
                                        data-testid="new-tpl-media-url"
                                    />
                                )}
                            </div>

                            {/* Body */}
                            <div className="space-y-1">
                                <Label className="text-sm font-medium">Body</Label>
                                <textarea
                                    value={newTemplate.body}
                                    onChange={(e) => setNewTemplate(p => ({...p, body: e.target.value}))}
                                    placeholder={"Hi {{1}},\nYour order {{2}} is confirmed.\nTotal: ₹{{3}}"}
                                    className="w-full min-h-[120px] rounded-lg border border-gray-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#25D366] focus:border-transparent resize-y"
                                    data-testid="new-tpl-body"
                                />
                                <p className="text-xs text-gray-400">Use {"{{1}}"}, {"{{2}}"}, etc. for variables</p>
                            </div>

                            {/* Footer */}
                            <div className="space-y-1">
                                <Label className="text-sm font-medium">Footer (optional)</Label>
                                <Input
                                    value={newTemplate.footer}
                                    onChange={(e) => setNewTemplate(p => ({...p, footer: e.target.value}))}
                                    placeholder="e.g., Reply STOP to unsubscribe"
                                    className="rounded-lg"
                                    data-testid="new-tpl-footer"
                                />
                            </div>
                            
                            {/* Live Preview */}
                            {newTemplate.body && (
                                <div className="space-y-1">
                                    <Label className="text-xs text-gray-500">Preview</Label>
                                    <div className="bg-[#E5DDD5] p-3 rounded-lg">
                                        <div className="bg-[#DCF8C6] rounded-lg p-3 shadow-sm">
                                            {newTemplate.header_type === "text" && newTemplate.header_content && (
                                                <p className="text-sm font-bold text-[#1A1A1A] mb-1">{newTemplate.header_content}</p>
                                            )}
                                            <p className="text-sm text-[#1A1A1A] whitespace-pre-wrap">{newTemplate.body}</p>
                                            {newTemplate.footer && (
                                                <p className="text-xs text-gray-500 mt-2 border-t border-gray-200 pt-1">{newTemplate.footer}</p>
                                            )}
                                            <div className="flex items-center justify-end gap-1 mt-1">
                                                <span className="text-[10px] text-gray-500">
                                                    {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                                                </span>
                                                <svg className="w-4 h-4 text-[#53BDEB]" viewBox="0 0 16 15" fill="currentColor">
                                                    <path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.88a.32.32 0 0 1-.484.032l-.358-.325a.32.32 0 0 0-.484.032l-.378.48a.418.418 0 0 0 .036.54l1.32 1.267a.32.32 0 0 0 .484-.034l6.272-8.048a.366.366 0 0 0-.064-.51zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.88a.32.32 0 0 1-.484.032L1.89 7.77a.366.366 0 0 0-.516.005l-.423.433a.364.364 0 0 0 .006.514l3.255 3.185a.32.32 0 0 0 .484-.033l6.272-8.048a.365.365 0 0 0-.063-.51z"/>
                                                </svg>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <DialogFooter className="gap-2">
                                <Button variant="outline" onClick={() => setShowAddTemplate(false)}>Cancel</Button>
                                <Button
                                    onClick={handleSaveCustomTemplate}
                                    disabled={savingTemplate}
                                    className="bg-[#25D366] hover:bg-[#1da851] text-white"
                                    data-testid="save-new-template-btn"
                                >
                                    {savingTemplate ? "Saving..." : editingCustomTemplate ? "Update Template" : "Save as Draft"}
                                </Button>
                            </DialogFooter>
                        </div>
                    </DialogContent>
                </Dialog>

                {/* Variable Mapping Modal */}
                <Dialog open={showVariableMappingModal} onOpenChange={setShowVariableMappingModal}>
                    <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <Tag className="w-5 h-5" />
                                Map Template Variables
                            </DialogTitle>
                            <DialogDescription>
                                Choose to map each variable to a customer field or enter custom text
                            </DialogDescription>
                        </DialogHeader>
                        {mappingTemplate && (
                            <div className="space-y-4">
                                {/* WhatsApp-style Preview */}
                                <div className="rounded-lg overflow-hidden bg-[#E5DDD5]">
                                    <div className="p-3">
                                        <div className="bg-[#DCF8C6] rounded-lg p-3 shadow-sm">
                                            {(() => {
                                                const parts = resolvePreviewWithSampleData(mappingTemplate.temp_body, variableMappings, variableMappingModes);
                                                return (
                                                    <>
                                                        <p className="text-sm text-[#1A1A1A] whitespace-pre-wrap pr-10">
                                                            {parts.map((part, idx) => {
                                                                if (part.type === "na") return <span key={idx} className="text-red-500 font-medium">NA</span>;
                                                                return <span key={idx}>{part.value}</span>;
                                                            })}
                                                        </p>
                                                        <div className="flex items-center justify-end gap-1 mt-1">
                                                            <span className="text-[10px] text-gray-500">
                                                                {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                                                            </span>
                                                            <svg className="w-4 h-4 text-[#53BDEB]" viewBox="0 0 16 15" fill="currentColor">
                                                                <path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.88a.32.32 0 0 1-.484.032l-.358-.325a.32.32 0 0 0-.484.032l-.378.48a.418.418 0 0 0 .036.54l1.32 1.267a.32.32 0 0 0 .484-.034l6.272-8.048a.366.366 0 0 0-.064-.51zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.88a.32.32 0 0 1-.484.032L1.89 7.77a.366.366 0 0 0-.516.005l-.423.433a.364.364 0 0 0 .006.514l3.255 3.185a.32.32 0 0 0 .484-.033l6.272-8.048a.365.365 0 0 0-.063-.51z"/>
                                                            </svg>
                                                        </div>
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                </div>

                                {/* Variable Mapping Controls */}
                                <div className="space-y-3">
                                    {mappingTemplate.variables?.map(variable => (
                                        <div key={variable} className="bg-gray-50 rounded-xl p-3 space-y-2">
                                            <div className="flex items-center justify-between">
                                                <Badge variant="outline" className="bg-white font-mono text-sm">
                                                    {variable}
                                                </Badge>
                                                <div className="flex rounded-lg border bg-white overflow-hidden">
                                                    <button
                                                        type="button"
                                                        onClick={() => setVariableMappingModes(prev => ({...prev, [variable]: "map"}))}
                                                        className={`px-3 py-1 text-xs font-medium transition-colors ${
                                                            (variableMappingModes[variable] || "map") === "map"
                                                                ? "bg-[#F26B33] text-white"
                                                                : "bg-white text-gray-600 hover:bg-gray-100"
                                                        }`}
                                                        data-testid={`var-mode-map-${variable}`}
                                                    >
                                                        Map to Field
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setVariableMappingModes(prev => ({...prev, [variable]: "text"}))}
                                                        className={`px-3 py-1 text-xs font-medium transition-colors ${
                                                            variableMappingModes[variable] === "text"
                                                                ? "bg-[#F26B33] text-white"
                                                                : "bg-white text-gray-600 hover:bg-gray-100"
                                                        }`}
                                                        data-testid={`var-mode-text-${variable}`}
                                                    >
                                                        Custom Text
                                                    </button>
                                                </div>
                                            </div>
                                            
                                            {variableMappingModes[variable] === "text" ? (
                                                <Input
                                                    type="text"
                                                    value={variableMappings[variable] || ""}
                                                    onChange={(e) => setVariableMappings(prev => ({
                                                        ...prev,
                                                        [variable]: e.target.value
                                                    }))}
                                                    placeholder="Enter custom text..."
                                                    className="h-10 rounded-lg"
                                                    data-testid={`var-text-${variable}`}
                                                />
                                            ) : (
                                                <Select
                                                    value={variableMappings[variable] || ""}
                                                    onValueChange={(val) => setVariableMappings(prev => ({
                                                        ...prev,
                                                        [variable]: val
                                                    }))}
                                                >
                                                    <SelectTrigger className="h-10 rounded-lg bg-white" data-testid={`var-map-${variable}`}>
                                                        <SelectValue placeholder="Select a field..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="none">-- None --</SelectItem>
                                                        {availableVariables.map(field => (
                                                            <SelectItem key={field.key} value={field.key}>
                                                                {field.label} (e.g., {field.example})
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                <DialogFooter className="gap-2">
                                    <Button
                                        variant="outline"
                                        onClick={() => {
                                            setShowVariableMappingModal(false);
                                            setMappingTemplate(null);
                                            setVariableMappings({});
                                            setVariableMappingModes({});
                                        }}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        onClick={handleSaveVariableMapping}
                                        disabled={savingVariableMapping}
                                        className="bg-[#25D366] hover:bg-[#1da851] text-white"
                                        data-testid="save-variable-mapping-btn"
                                    >
                                        {savingVariableMapping ? "Saving..." : "Save Mappings"}
                                    </Button>
                                </DialogFooter>
                            </div>
                        )}
                    </DialogContent>
                </Dialog>

                {/* Template Modal */}
                <Dialog open={showTemplateModal} onOpenChange={setShowTemplateModal}>
                    <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>{editingTemplate ? "Edit Template" : "Create Template"}</DialogTitle>
                            <DialogDescription>
                                Create a reusable message template with dynamic variables.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                            <div>
                                <Label className="form-label">Template Name</Label>
                                <Input 
                                    value={templateForm.name}
                                    onChange={(e) => setTemplateForm({...templateForm, name: e.target.value})}
                                    placeholder="e.g., Welcome Message, Points Update"
                                    className="h-12 rounded-xl"
                                    data-testid="template-name-input"
                                />
                            </div>
                            
                            <div>
                                <Label className="form-label">Message</Label>
                                <Textarea 
                                    value={templateForm.message}
                                    onChange={(e) => setTemplateForm({...templateForm, message: e.target.value})}
                                    placeholder="Hi {{customer_name}}, you've earned {{points_earned}} points!"
                                    className="min-h-[120px] rounded-xl"
                                    data-testid="template-message-input"
                                />
                                <p className="text-xs text-[#52525B] mt-1">Use {"{{variable}}"} to insert dynamic content</p>
                            </div>

                            <div>
                                <Label className="form-label mb-2 block">Insert Variables</Label>
                                <div className="flex flex-wrap gap-2">
                                    {availableVariables.map(v => (
                                        <button
                                            key={v.key}
                                            type="button"
                                            onClick={() => insertVariableInMessage(v.key)}
                                            className={`px-2 py-1 text-xs rounded-lg border transition-colors ${
                                                templateForm.variables.includes(v.key) 
                                                    ? 'bg-[#25D366] text-white border-[#25D366]' 
                                                    : 'bg-white text-[#52525B] border-gray-200 hover:border-[#25D366]'
                                            }`}
                                            data-testid={`var-${v.key}`}
                                        >
                                            {v.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <Label className="form-label">Media Type (Optional)</Label>
                                <Select 
                                    value={templateForm.media_type || "none"}
                                    onValueChange={(v) => setTemplateForm({...templateForm, media_type: v === "none" ? null : v})}
                                >
                                    <SelectTrigger className="h-12 rounded-xl" data-testid="media-type-select">
                                        <SelectValue placeholder="No media" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">No media</SelectItem>
                                        <SelectItem value="image">Image</SelectItem>
                                        <SelectItem value="video">Video</SelectItem>
                                        <SelectItem value="document">Document</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {templateForm.media_type && (
                                <div>
                                    <Label className="form-label">Media URL</Label>
                                    <Input 
                                        value={templateForm.media_url}
                                        onChange={(e) => setTemplateForm({...templateForm, media_url: e.target.value})}
                                        placeholder="https://example.com/image.jpg"
                                        className="h-12 rounded-xl"
                                        data-testid="media-url-input"
                                    />
                                </div>
                            )}

                            {/* Preview */}
                            {templateForm.message && (
                                <div>
                                    <Label className="form-label">Preview</Label>
                                    <div className="bg-[#DCF8C6] p-3 rounded-lg rounded-tl-none">
                                        <p className="text-sm whitespace-pre-wrap">{renderPreviewMessage(templateForm.message)}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                        <DialogFooter className="mt-4">
                            <Button variant="outline" onClick={() => setShowTemplateModal(false)}>
                                Cancel
                            </Button>
                            <Button 
                                onClick={handleSaveTemplate}
                                className="bg-[#25D366] hover:bg-[#20BD5A]"
                                disabled={!templateForm.name || !templateForm.message}
                                data-testid="save-template-btn"
                            >
                                {editingTemplate ? "Update" : "Create"} Template
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Automation Rule Modal */}
                <Dialog open={showRuleModal} onOpenChange={setShowRuleModal}>
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle>{editingRule ? "Edit Automation Rule" : "Add Automation Rule"}</DialogTitle>
                            <DialogDescription>
                                Configure when to automatically send WhatsApp messages.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                            <div>
                                <Label className="form-label">Trigger Event</Label>
                                <Select 
                                    value={ruleForm.event_type}
                                    onValueChange={(v) => setRuleForm({...ruleForm, event_type: v})}
                                    disabled={!!editingRule}
                                >
                                    <SelectTrigger className="h-12 rounded-xl" data-testid="event-type-select">
                                        <SelectValue placeholder="Select an event" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {availableEvents.map(event => {
                                            const hasRule = automationRules.some(r => r.event_type === event.event && r.id !== editingRule?.id);
                                            return (
                                                <SelectItem 
                                                    key={event.event} 
                                                    value={event.event}
                                                    disabled={hasRule}
                                                >
                                                    {eventLabels[event.event] || event.event}
                                                    {hasRule && " (already configured)"}
                                                </SelectItem>
                                            );
                                        })}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div>
                                <Label className="form-label">Message Template</Label>
                                <Select 
                                    value={ruleForm.template_id}
                                    onValueChange={(v) => setRuleForm({...ruleForm, template_id: v})}
                                >
                                    <SelectTrigger className="h-12 rounded-xl" data-testid="template-select">
                                        <SelectValue placeholder="Select a template" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {templates.map(template => (
                                            <SelectItem key={template.id} value={template.id}>
                                                {template.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div>
                                <Label className="form-label">Delay (minutes)</Label>
                                <Input 
                                    type="number"
                                    min="0"
                                    value={ruleForm.delay_minutes}
                                    onChange={(e) => setRuleForm({...ruleForm, delay_minutes: parseInt(e.target.value) || 0})}
                                    className="h-12 rounded-xl"
                                    data-testid="delay-input"
                                />
                                <p className="text-xs text-[#52525B] mt-1">0 = send immediately, or delay by X minutes</p>
                            </div>

                            <div className="flex items-center justify-between">
                                <Label className="form-label">Enable Rule</Label>
                                <Switch 
                                    checked={ruleForm.is_enabled}
                                    onCheckedChange={(checked) => setRuleForm({...ruleForm, is_enabled: checked})}
                                    data-testid="enable-rule-switch"
                                />
                            </div>
                        </div>
                        <DialogFooter className="mt-4">
                            <Button variant="outline" onClick={() => setShowRuleModal(false)}>
                                Cancel
                            </Button>
                            <Button 
                                onClick={handleSaveRule}
                                className="bg-[#F26B33] hover:bg-[#D85A2A]"
                                disabled={!ruleForm.event_type || !ruleForm.template_id}
                                data-testid="save-rule-btn"
                            >
                                {editingRule ? "Update" : "Create"} Rule
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Template Preview Modal */}
                <Dialog open={showTemplatePreview} onOpenChange={setShowTemplatePreview}>
                    <DialogContent className="sm:max-w-md rounded-xl">
                        <DialogHeader>
                            <DialogTitle className="text-lg flex items-center gap-2">
                                <Eye className="w-5 h-5 text-[#25D366]" />
                                {previewTemplate?.temp_name || "Template Preview"}
                            </DialogTitle>
                        </DialogHeader>
                        
                        {previewTemplate && (
                            <div className="space-y-4">
                                {/* Message Preview - WhatsApp Style */}
                                <div className="bg-[#E5DDD5] rounded-xl p-3">
                                    <div className="bg-[#DCF8C6] rounded-lg p-3 shadow-sm">
                                        <p className="text-sm text-gray-800 whitespace-pre-wrap">
                                            {(() => {
                                                const mappings = templateVariableMappings[previewTemplate.wid] || {};
                                                const modes = templateVariableModes[previewTemplate.wid] || {};
                                                const parts = resolvePreviewWithSampleData(previewTemplate.temp_body, mappings, modes);
                                                return parts.map((part, idx) => {
                                                    if (part.type === "na") return <span key={idx} className="text-red-500 font-medium">NA</span>;
                                                    return <span key={idx}>{part.value}</span>;
                                                });
                                            })()}
                                        </p>
                                        <div className="flex items-center justify-end gap-1 mt-2">
                                            <span className="text-[10px] text-gray-500">
                                                {new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                            </span>
                                            <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17 7.48 12l-1.41 1.41L11.66 19l12-12-1.42-1.41zM.41 13.41L6 19l1.41-1.41L1.83 12 .41 13.41z"/>
                                            </svg>
                                        </div>
                                    </div>
                                </div>

                                {/* Variable Mappings */}
                                {(() => {
                                    const variables = (previewTemplate.temp_body.match(/\{\{\d+\}\}/g) || []).filter((v, i, a) => a.indexOf(v) === i);
                                    if (variables.length === 0) return null;
                                    
                                    const mappings = templateVariableMappings[previewTemplate.wid] || {};
                                    
                                    return (
                                        <div className="space-y-2">
                                            <p className="text-sm font-medium text-gray-700">Variable Mappings:</p>
                                            <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                                                {variables.map(v => {
                                                    const mappedField = mappings[v];
                                                    const fieldLabel = mappedField 
                                                        ? availableVariables.find(av => av.key === mappedField)?.label || mappedField 
                                                        : null;
                                                    
                                                    return (
                                                        <div key={v} className="flex items-center justify-between">
                                                            <div className="flex items-center gap-2">
                                                                <Badge variant="outline" className="font-mono text-xs">
                                                                    {v}
                                                                </Badge>
                                                                <span className="text-gray-400">→</span>
                                                                <span className={`text-sm ${fieldLabel ? 'text-[#25D366] font-medium' : 'text-gray-400 italic'}`}>
                                                                    {fieldLabel || "Not mapped"}
                                                                </span>
                                                            </div>
                                                            {fieldLabel ? (
                                                                <Check className="w-4 h-4 text-[#25D366]" />
                                                            ) : (
                                                                <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* Select This Template Button */}
                                <Button
                                    className="w-full bg-[#25D366] hover:bg-[#20BD5A] rounded-xl"
                                    onClick={() => {
                                        if (previewTemplate) {
                                            setEditingEventValue(previewTemplate.wid.toString());
                                        }
                                        setShowTemplatePreview(false);
                                    }}
                                    data-testid="select-preview-template"
                                >
                                    <Check className="w-4 h-4 mr-2" />
                                    Select This Template
                                </Button>
                            </div>
                        )}
                    </DialogContent>
                </Dialog>

                {/* Test Template Modal (extracted component) */}
                <TestTemplateModal
                    open={showTestModal}
                    onClose={() => setShowTestModal(false)}
                    template={testingTemplate}
                    eventKey={testingEventKey}
                    templateVariableMappings={templateVariableMappings}
                    templateVariableModes={templateVariableModes}
                    availableVariables={availableVariables}
                    eventLabels={eventLabels}
                />
        </ContentWrapper>
    );
}

export default function WhatsAppAutomationPage() {
    return <WhatsAppAutomationContent />;
}
