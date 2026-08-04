import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, Send, Save, Users, FileText, Clock, AlertTriangle, ExternalLink } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveLayout } from "@/components/ResponsiveLayout";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const STEPS = [
    { id: 1, label: "Name & Audience" },
    { id: 2, label: "Message" },
    { id: 3, label: "Schedule & Send" },
];

const CampaignWizardContent = () => {
    const { api } = useAuth();
    const navigate = useNavigate();
    const { id: campaignId } = useParams();
    const isEdit = !!campaignId;

    const [step, setStep] = useState(1);
    const [saving, setSaving] = useState(false);
    const [sending, setSending] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    // Step 1
    const [name, setName] = useState("");
    const [audienceId, setAudienceId] = useState("all-customers");
    const [audienceName, setAudienceName] = useState("All Customers");
    const [audienceCount, setAudienceCount] = useState(0);
    const [optedOutCount, setOptedOutCount] = useState(0);
    const [segments, setSegments] = useState([]);
    const [totalCustomers, setTotalCustomers] = useState(0);

    // Step 2
    const [templateId, setTemplateId] = useState("");
    const [templateName, setTemplateName] = useState("");
    const [templates, setTemplates] = useState([]);
    const [variableMappings, setVariableMappings] = useState({});
    const [variableModes, setVariableModes] = useState({});
    const [allMappings, setAllMappings] = useState({});
    const [allModes, setAllModes] = useState({});
    const [allMenuPickResolved, setAllMenuPickResolved] = useState({});
    const [sampleData, setSampleData] = useState({});
    const [menuPickResolved, setMenuPickResolved] = useState({});

    // Step 3
    const [scheduleType, setScheduleType] = useState("now");
    const [scheduledDate, setScheduledDate] = useState("");
    const [scheduledTime, setScheduledTime] = useState("10:00");
    const [recurringFrequency, setRecurringFrequency] = useState("daily");
    const [recurringDays, setRecurringDays] = useState(["Mon"]);
    const [recurringDayOfMonth, setRecurringDayOfMonth] = useState(1);
    const [recurringEndOption, setRecurringEndOption] = useState("never");
    const [recurringEndDate, setRecurringEndDate] = useState("");
    const [recurringOccurrences, setRecurringOccurrences] = useState("");
    const [dailyLimit, setDailyLimit] = useState({ limit: 1000, used: 0, remaining: 1000 });

    // CR-024 Phase 4 P4.10: Test Send
    const [testPhone, setTestPhone] = useState("");
    const [testSending, setTestSending] = useState(false);

    // CR-024 Phase 4 P4.9: Edit-while-scheduled guard
    const [campaignStatus, setCampaignStatus] = useState("draft");
    const isScheduleLocked = campaignStatus === "scheduled" || campaignStatus === "active";

    const [savedCampaignId, setSavedCampaignId] = useState(campaignId || null);

    useEffect(() => {
        const loadData = async () => {
            try {
                const [segsRes, statsRes, limitRes] = await Promise.all([
                    api.get("/segments"),
                    api.get("/customers/segments/stats"),
                    api.get("/campaigns/daily-limit"),
                ]);
                setSegments(segsRes.data || []);
                setTotalCustomers(statsRes.data?.total || 0);
                setDailyLimit(limitRes.data);
                if (campaignId) {
                    const campRes = await api.get(`/campaigns/${campaignId}`);
                    const c = campRes.data;
                    setName(c.name || "");
                    setAudienceId(c.audience_id || "all-customers");
                    setAudienceName(c.audience_name || "All Customers");
                    setAudienceCount(c.audience_count || 0);
                    setTemplateId(c.template_id || "");
                    setTemplateName(c.template_name || "");
                    setVariableMappings(c.variable_mappings || {});
                    setVariableModes(c.variable_modes || {});
                    setMenuPickResolved(c.menu_pick_resolved || {});
                    setScheduleType(c.schedule_type || "now");
                    setScheduledDate(c.scheduled_date || "");
                    setScheduledTime(c.scheduled_time || "10:00");
                    setRecurringFrequency(c.recurring_frequency || "daily");
                    setRecurringDays(c.recurring_days || ["Mon"]);
                    setRecurringDayOfMonth(c.recurring_day_of_month || 1);
                    setRecurringEndOption(c.recurring_end_option || "never");
                    setRecurringEndDate(c.recurring_end_date || "");
                    setRecurringOccurrences(c.recurring_occurrences || "");
                    setCampaignStatus(c.status || "draft");
                    setSavedCampaignId(c.id);
                }
            } catch (err) { console.error(err); }
        };
        loadData();
    }, [campaignId]);

    useEffect(() => {
        if (step === 2 && templates.length === 0) loadTemplates();
    }, [step]);

    const loadTemplates = async () => {
        try {
            const [tplRes, mapRes, sampleRes] = await Promise.all([
                api.get("/whatsapp/authkey-templates"),
                api.get("/whatsapp/template-variable-map"),
                api.get("/customers/sample-data"),
            ]);
            const formatted = (tplRes.data.templates || [])
                .filter(t => t.temp_status === 1)
                .map(t => ({
                id: t.wid?.toString() || t.id,
                name: t.temp_name || t.name,
                message: (t.temp_body || t.message || "").replace(/\\n/g, "\n").replace(/\\'/g, "'"),
                variables: (t.temp_body?.match(/\{\{\d+\}\}/g) || []).filter((v, i, a) => a.indexOf(v) === i),
                buttons: t.buttons || [],  // CR-069
                // CR-036 B.2 (E-B2-11): carry media enrichment from /authkey-templates
                header_type: t.header_type,
                has_send_media: !!t.has_send_media,
                needs_media_reupload: !!t.needs_media_reupload,
            }));
            setTemplates(formatted);
            const mObj = {}, moObj = {}, mprObj = {};
            (mapRes.data.mappings || []).forEach(m => { mObj[m.template_id] = m.mappings || {}; moObj[m.template_id] = m.modes || {}; mprObj[m.template_id] = m.menu_pick_resolved || {}; });
            setAllMappings(mObj);
            setAllModes(moObj);
            setAllMenuPickResolved(mprObj);
            const sample = sampleRes.data?.sample || {};
            sample.restaurant_name = sampleRes.data?.restaurant_name || "";
            setSampleData(sample);
        } catch (err) { console.error(err); }
    };

    useEffect(() => {
        if (audienceId === "all-customers") {
            setAudienceName("All Customers");
            setAudienceCount(totalCustomers);
        } else {
            const seg = segments.find(s => s.id === audienceId);
            if (seg) { setAudienceName(seg.name); setAudienceCount(seg.customer_count || 0); }
        }
    }, [audienceId, segments, totalCustomers]);

    const isFullyMapped = (tpl) => {
        const hasDynamicBtns = (tpl?.buttons || []).some(b => b.url_type === "dynamic");
        if (!tpl?.variables?.length && !hasDynamicBtns) return true;
        const maps = allMappings[tpl.id] || {};
        const bodyMapped = (tpl.variables || []).every(v => maps[v] && maps[v].trim() !== "");
        // CR-069: check dynamic URL button vars
        const btnMapped = (tpl.buttons || []).filter(b => b.url_type === "dynamic").every(btn => {
            const idx = btn.url?.match(/\{\{(\d+)\}\}/)?.[1] || "0";
            return maps[`btn_url_{{${idx}}}`]?.trim();
        });
        return bodyMapped && btnMapped;
    };

    // CR-036 B.2 (E-B2-12): template has a media header but no uploaded file → block send
    const isMediaBlocked = (tpl) =>
        !!tpl
        && ["image", "video", "document"].includes(tpl.header_type)
        && !tpl.has_send_media;

    const handleTemplateSelect = (tplId) => {
        setTemplateId(tplId);
        const tpl = templates.find(t => t.id === tplId);
        setTemplateName(tpl?.name || "");
        setVariableMappings(allMappings[tplId] || {});
        setVariableModes(allModes[tplId] || {});
        setMenuPickResolved(allMenuPickResolved[tplId] || {});
    };

    const resolvePreview = (mapping, mode) => {
        if (mode === "text") return mapping;
        if (mode === "menu_pick") return menuPickResolved[mapping] || mapping;
        return sampleData[mapping] || mapping || "";
    };

    const currentTemplate = templates.find(t => t.id === templateId);
    const previewMessage = currentTemplate ? (() => {
        let msg = currentTemplate.message;
        (currentTemplate.variables || []).forEach(v => {
            const mapping = variableMappings[v] || "";
            const mode = variableModes[v] || "map";
            msg = msg.replace(v, resolvePreview(mapping, mode) || v);
        });
        return msg;
    })() : "";

    const targetCount = audienceCount - optedOutCount;
    const canStep1 = name.trim().length > 0;
    // CR-036 B.2 (E-B2-15): also gate on media availability for media-header templates
    const canStep2 = templateId && isFullyMapped(currentTemplate) && !isMediaBlocked(currentTemplate);
    const needsDoubleConfirm = scheduleType === "now" && targetCount > 500;
    const sendButtonLabel = sending
        ? (scheduleType === "now" ? "Sending..." : "Scheduling...")
        : scheduleType === "now"
            ? `Send to ${targetCount.toLocaleString()} Customers`
            : scheduleType === "scheduled"
                ? `Schedule Campaign`
                : `Start Recurring Campaign`;

    const buildPayload = () => ({
        name: name.trim(),
        audience_id: audienceId,
        audience_name: audienceName,
        audience_count: audienceCount,
        template_id: templateId,
        template_name: templateName,
        variable_mappings: variableMappings,
        variable_modes: variableModes,
        menu_pick_resolved: menuPickResolved,
        schedule_type: scheduleType,
        scheduled_date: scheduledDate || null,
        scheduled_time: scheduledTime || null,
        recurring_frequency: scheduleType === "recurring" ? recurringFrequency : null,
        recurring_days: scheduleType === "recurring" ? recurringDays : null,
        recurring_day_of_month: scheduleType === "recurring" ? recurringDayOfMonth : null,
        recurring_end_option: scheduleType === "recurring" ? recurringEndOption : null,
        recurring_end_date: scheduleType === "recurring" && recurringEndOption === "after_date" ? (recurringEndDate || null) : null,
        recurring_occurrences: scheduleType === "recurring" && recurringEndOption === "after_occurrences" ? (Number(recurringOccurrences) || null) : null,
    });

    const handleSave = async () => {
        if (!name.trim()) { toast.error("Campaign name is required"); return; }
        setSaving(true);
        try {
            const payload = buildPayload();
            if (savedCampaignId) {
                await api.put(`/campaigns/${savedCampaignId}`, payload);
                toast.success("Campaign saved");
            } else {
                const res = await api.post("/campaigns", payload);
                setSavedCampaignId(res.data.id);
                toast.success("Campaign created as draft");
            }
        } catch (err) { toast.error(err.response?.data?.detail || "Failed to save"); }
        finally { setSaving(false); }
    };

    // CR-024 Phase 4 P4.10: Test Send — persists campaign first (if needed), then fires 1 test message
    const handleTestSend = async () => {
        const phoneRaw = testPhone.trim();
        if (!phoneRaw) { toast.error("Phone number required"); return; }
        if (!templateId) { toast.error("Pick a template first"); return; }
        // Strip + and non-digits except leading country code
        const cleaned = phoneRaw.replace(/\+/g, "").replace(/[^0-9]/g, "");
        if (cleaned.length < 8) { toast.error("Invalid phone number"); return; }
        // Default country code = 91 if 10 digits; otherwise take first 1-3 chars
        let countryCode = "91";
        let phone = cleaned;
        if (cleaned.length > 10) {
            countryCode = cleaned.slice(0, cleaned.length - 10);
            phone = cleaned.slice(-10);
        }
        setTestSending(true);
        try {
            const payload = buildPayload();
            let cid = savedCampaignId;
            if (!cid) {
                const res = await api.post("/campaigns", payload);
                cid = res.data.id;
                setSavedCampaignId(cid);
            } else {
                await api.put(`/campaigns/${cid}`, payload);
            }
            const res = await api.post(`/campaigns/${cid}/test-send`, { phone, country_code: countryCode });
            if (res.data.success) {
                toast.success(`Test message sent to +${countryCode}${phone}`);
            } else {
                toast.error(`Test failed: ${res.data.error || "Unknown error"}`);
            }
        } catch (err) {
            toast.error(err.response?.data?.detail || "Test send failed");
        } finally {
            setTestSending(false);
        }
    };

    const handleSend = async () => {
        setShowConfirm(false);
        setSending(true);
        try {
            const payload = buildPayload();
            let cid = savedCampaignId;
            if (!cid) {
                const res = await api.post("/campaigns", payload);
                cid = res.data.id;
                setSavedCampaignId(cid);
            } else {
                await api.put(`/campaigns/${cid}`, payload);
            }
            const res = await api.post(`/campaigns/${cid}/send`);
            if (scheduleType === "now") {
                toast.success(`Sending to ${res.data.target_count} customers...`);
            } else if (scheduleType === "scheduled") {
                toast.success(`Scheduled for ${scheduledDate} at ${scheduledTime}`);
            } else {
                toast.success(`Recurring ${recurringFrequency} campaign started`);
            }
            navigate("/campaigns");
        } catch (err) { toast.error(err.response?.data?.detail || "Failed to send"); }
        finally { setSending(false); }
    };

    return (
        <div className="p-4 lg:p-6 max-w-[900px] mx-auto" data-testid="campaign-wizard">
            {/* Top bar */}
            <div className="flex items-center gap-3 mb-5 bg-white rounded-xl border border-gray-200 px-4 py-3">
                <Button variant="outline" size="sm" className="rounded-full text-xs" onClick={() => navigate("/campaigns")} data-testid="wizard-back-btn">
                    <ArrowLeft className="w-4 h-4 mr-1" /> Back
                </Button>
                <span className="text-base font-bold">{isEdit ? "Edit Campaign" : "New Campaign"}</span>
                <Badge className={isScheduleLocked ? "bg-blue-100 text-blue-700 text-xs" : "bg-amber-100 text-amber-700 text-xs"}>
                    {isScheduleLocked ? (campaignStatus === "active" ? "Active" : "Scheduled") : "Draft"}
                </Badge>
            </div>

            {/* CR-024 Phase 4 P4.9: Edit-while-scheduled banner */}
            {isScheduleLocked && (
                <div className="mb-5 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm flex items-start gap-2" data-testid="schedule-locked-banner">
                    <AlertTriangle className="w-4 h-4 text-blue-700 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                        <div className="font-semibold text-blue-800">This campaign is {campaignStatus}.</div>
                        <div className="text-blue-700 text-xs mt-0.5">
                            Audience and schedule are locked. You can still edit the template, variable mappings, and campaign name.
                            To change audience or schedule, <strong>Pause</strong> the campaign first from the Campaigns list.
                        </div>
                    </div>
                </div>
            )}

            {/* Wizard Step Indicator (numbered circles, matching mock) */}
            <div className="flex bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
                {STEPS.map((s, i) => {
                    const isActive = step === s.id;
                    const isDone = step > s.id;
                    return (
                        <div
                            key={s.id}
                            onClick={() => { if (isDone) setStep(s.id); }}
                            className={`flex-1 flex flex-col items-center py-4 relative cursor-pointer transition-colors ${
                                isActive ? "bg-orange-50" : isDone ? "bg-green-50" : "bg-white"
                            }`}
                            data-testid={`step-${s.id}`}
                        >
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold mb-1 ${
                                isActive ? "bg-[#F26B33] text-white" : isDone ? "bg-[#25D366] text-white" : "bg-gray-200 text-gray-500"
                            }`}>
                                {isDone ? <Check className="w-3.5 h-3.5" /> : s.id}
                            </div>
                            <span className={`text-xs font-semibold ${
                                isActive ? "text-[#F26B33]" : isDone ? "text-green-600" : "text-gray-500"
                            }`}>{s.label}</span>
                            {i < STEPS.length - 1 && (
                                <span className="absolute right-[-8px] top-1/2 -translate-y-1/2 text-gray-300 text-base z-10">→</span>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* STEP 1: Name & Audience */}
            {step === 1 && (
                <div className="bg-white rounded-xl border border-gray-200 p-6" data-testid="step1-content">
                    <h3 className="text-lg font-bold mb-4">Campaign Details</h3>
                    <div className="mb-4">
                        <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">Campaign Name *</Label>
                        <Input value={name} onChange={e => setName(e.target.value)} placeholder="Enter campaign name" className="mt-1.5" data-testid="campaign-name-input" />
                    </div>
                    <div className="mb-4">
                        <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">Select Audience</Label>
                        <Select value={audienceId} onValueChange={setAudienceId} disabled={isScheduleLocked}>
                            <SelectTrigger className="mt-1.5" data-testid="audience-select"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all-customers">All Customers ({totalCustomers.toLocaleString()} customers)</SelectItem>
                                {segments.map(s => (
                                    <SelectItem key={s.id} value={s.id}>{s.name} ({(s.customer_count || 0).toLocaleString()} customers)</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {!isScheduleLocked && (
                            <p className="text-xs text-gray-500 mt-1.5">or <span className="text-[#F26B33] underline cursor-pointer" onClick={() => navigate("/audiences")}>create a new audience</span></p>
                        )}
                    </div>
                    <div className="bg-green-50 border border-green-200 rounded-xl p-3.5" data-testid="audience-info">
                        <p className="text-sm font-semibold text-green-700">{audienceCount.toLocaleString()} customers will receive this campaign</p>
                        {optedOutCount > 0 && <p className="text-xs text-green-600 mt-1">{optedOutCount} opted out (will be skipped)</p>}
                    </div>
                    <div className="flex justify-end mt-5">
                        <Button onClick={() => setStep(2)} disabled={!canStep1} className="bg-[#F26B33] hover:bg-[#D85A2A] text-white rounded-full" data-testid="next-step2-btn">
                            Next: Choose Message <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                    </div>
                </div>
            )}

            {/* STEP 2: Message (2-column layout matching mock) */}
            {step === 2 && (
                <div className="bg-white rounded-xl border border-gray-200 p-6" data-testid="step2-content">
                    <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
                        {/* Left: Template Selection + Variable Mapping */}
                        <div>
                            <h3 className="text-lg font-bold mb-4">Choose Message Template</h3>
                            <div className="mb-4">
                                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">Template</Label>
                                <Select value={templateId} onValueChange={handleTemplateSelect}>
                                    <SelectTrigger className="mt-1.5" data-testid="template-select"><SelectValue placeholder="Select a template" /></SelectTrigger>
                                    <SelectContent>
                                        {templates.map(t => {
                                            const mapped = isFullyMapped(t);
                                            const mediaBlocked = isMediaBlocked(t);
                                            return (
                                                <SelectItem key={t.id} value={t.id}>
                                                    {t.name} ({(t.variables || []).length} variables{mapped ? ", fully mapped" : ", needs mapping"}{mediaBlocked ? " • media required" : ""})
                                                </SelectItem>
                                            );
                                        })}
                                    </SelectContent>
                                </Select>
                                {/* CR-024 Phase 4 P4.4: Inline guidance when template is not fully mapped */}
                                {templateId && currentTemplate && !isFullyMapped(currentTemplate) && (
                                    <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800" data-testid="needs-mapping-banner">
                                        ⚠ This template has unmapped variables. Click{" "}
                                        <span className="underline cursor-pointer font-semibold" onClick={() => navigate("/templates")}>
                                            Templates page
                                        </span>{" "}
                                        to set defaults, then return here.
                                    </div>
                                )}
                                {/* CR-036 B.2 (E-B2-14): red block banner replaces the dead B.1 amber warning.
                                    Data comes from /authkey-templates enrichment (E-B2-4). Also gates Next via canStep2. */}
                                {templateId && currentTemplate && isMediaBlocked(currentTemplate) && (
                                    <div className="mt-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-800" data-testid="campaign-media-block">
                                        ⛔ This template has a media header but no uploaded file — messages cannot send.{" "}
                                        <span className="underline cursor-pointer font-semibold" onClick={() => navigate("/templates")}>
                                            Go to Templates to re-upload
                                        </span>
                                        , then return here.
                                    </div>
                                )}
                                <p className="text-[11px] text-gray-500 mt-1">Only approved and mapped templates are shown</p>
                                {templateId && currentTemplate && (() => {
                                    const SAFE = new Set(["customer_name","restaurant_name","points_balance","tier","total_visits","total_spent","wallet_balance","instagram_link","google_review_link","feedback_link","points_redeemed"]);
                                    const unsafe = Object.entries(variableMappings)
                                        .filter(([k, v]) => { const mode = (variableModes[k] || "map"); return mode === "map" && v && !SAFE.has(v); })
                                        .map(([k, v]) => ({ variable: k, mapped_to: v }));
                                    if (unsafe.length === 0) return null;
                                    return (
                                        <div className="mt-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-800" data-testid="event-vars-warning">
                                            {unsafe.length} variable(s) are order/event-specific and will be <strong>empty</strong> in campaign sends:
                                            <ul className="mt-1 ml-4 list-disc">
                                                {unsafe.map(u => <li key={u.variable}>{u.variable} → {u.mapped_to}</li>)}
                                            </ul>
                                            Consider using "Text" mode for static values, or pick a template designed for campaigns.
                                        </div>
                                    );
                                })()}
                            </div>

                            {/* Variable Mapping Grid (matching mock) */}
                            {currentTemplate && Object.keys(variableMappings).length > 0 && (
                                <div className="mt-4">
                                    <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2 block">Variable Mapping</Label>
                                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                                        <div className="grid grid-cols-[80px_20px_1fr] gap-y-1.5 gap-x-2 text-xs">
                                            {Object.entries(variableMappings).filter(([k]) => !k.startsWith("btn_url_")).map(([varKey, mapping]) => (
                                                <React.Fragment key={varKey}>
                                                    <span className="text-gray-500 font-mono">{varKey}</span>
                                                    <span className="text-gray-400">→</span>
                                                    <span className="font-semibold text-gray-700">
                                                        {variableModes[varKey] === "text" ? `"${mapping}"` : mapping}
                                                    </span>
                                                </React.Fragment>
                                            ))}
                                            {/* CR-069: Button URL mapping rows */}
                                            {(currentTemplate?.buttons || []).filter(b => b.url_type === "dynamic").map(btn => {
                                                const idx = btn.url?.match(/\{\{(\d+)\}\}/)?.[1] || "0";
                                                const btnKey = `btn_url_{{${idx}}}`;
                                                const mapping = variableMappings[btnKey];
                                                return (
                                                    <React.Fragment key={btnKey}>
                                                        <span className="text-blue-500 font-mono flex items-center gap-1"><ExternalLink className="w-3 h-3" /> "{btn.text}"</span>
                                                        <span className="text-gray-400">→</span>
                                                        <span className="font-semibold text-blue-600">{mapping || <span className="text-amber-500">unmapped</span>}</span>
                                                    </React.Fragment>
                                                );
                                            })}
                                        </div>
                                        {(() => {
                                            const bodyCount = Object.keys(variableMappings).filter(k => !k.startsWith("btn_url_")).length;
                                            const btnCount = (currentTemplate?.buttons || []).filter(b => b.url_type === "dynamic").length;
                                            return <p className="text-[11px] text-green-600 mt-2">All {bodyCount}{btnCount > 0 ? ` body + ${btnCount} button` : ""} variables mapped</p>;
                                        })()}
                                    </div>
                                </div>
                            )}

                            {/* CR-024 Phase 4 P4.10: Test Send — single-recipient dry run */}
                            {templateId && (
                                <div className="mt-4 border border-amber-200 bg-amber-50 rounded-xl p-3" data-testid="test-send-panel">
                                    <Label className="text-xs font-semibold uppercase tracking-wider text-amber-700">Send Test Message</Label>
                                    <p className="text-[11px] text-amber-700 mt-0.5 mb-2">
                                        Verify the template renders correctly before scheduling. Counts as 1 live WhatsApp message.
                                    </p>
                                    <div className="flex gap-2 items-center">
                                        <Input
                                            value={testPhone}
                                            onChange={e => setTestPhone(e.target.value)}
                                            placeholder="9999999999"
                                            className="text-sm bg-white"
                                            data-testid="test-send-phone"
                                        />
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={handleTestSend}
                                            disabled={testSending || !testPhone.trim() || !templateId}
                                            className="rounded-full whitespace-nowrap border-amber-400 text-amber-800 hover:bg-amber-100"
                                            data-testid="test-send-btn"
                                        >
                                            {testSending ? "Sending..." : "Send Test"}
                                        </Button>
                                    </div>
                                </div>
                            )}

                            <div className="flex justify-between mt-6">
                                <Button variant="outline" className="rounded-full" onClick={() => setStep(1)} data-testid="back-step1-btn">
                                    <ArrowLeft className="w-4 h-4 mr-1" /> Back
                                </Button>
                                <Button onClick={() => setStep(3)} disabled={!canStep2} className="bg-[#F26B33] hover:bg-[#D85A2A] text-white rounded-full" data-testid="next-step3-btn">
                                    Next: Schedule & Send <ArrowRight className="w-4 h-4 ml-2" />
                                </Button>
                            </div>
                        </div>

                        {/* Right: WhatsApp Preview */}
                        <div>
                            <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2 block">WhatsApp Preview</Label>
                            <div className="bg-[#e5ddd5] rounded-xl p-4" data-testid="whatsapp-preview">
                                <div className="bg-[#dcf8c6] rounded-xl px-3 py-3 shadow-sm max-w-[300px]">
                                    {previewMessage ? (
                                        <p className="text-[13px] whitespace-pre-wrap leading-relaxed">{previewMessage}</p>
                                    ) : (
                                        <p className="text-[13px] text-gray-400 italic">Select a template to preview</p>
                                    )}
                                    <p className="text-[10px] text-gray-400 text-right mt-1">
                                        {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ✓✓
                                    </p>
                                </div>
                                {/* CR-069: Button bars */}
                                {(currentTemplate?.buttons || []).length > 0 && (
                                    <div className="mt-1 space-y-0.5 max-w-[300px]">
                                        {currentTemplate.buttons.map((btn, i) => (
                                            <div key={i} className="bg-white rounded-lg py-1.5 text-center text-sm text-blue-500 font-medium border border-gray-200 flex items-center justify-center gap-1.5">
                                                {btn.type === "URL" && <ExternalLink className="w-3.5 h-3.5" />}
                                                {btn.text}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* STEP 3: Schedule & Send */}
            {step === 3 && (
                <div className={`bg-white rounded-xl border border-gray-200 p-6 ${isScheduleLocked ? "opacity-60 pointer-events-none" : ""}`} data-testid="step3-content">
                    {isScheduleLocked && (
                        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-800">
                            Schedule is locked. Pause this campaign from the Campaigns list to modify it.
                        </div>
                    )}
                    <h3 className="text-lg font-bold mb-4">When to Send</h3>

                    {/* Send Now */}
                    <div
                        onClick={() => setScheduleType("now")}
                        className={`flex items-start gap-3 p-3 border rounded-xl mb-2 cursor-pointer transition-colors ${
                            scheduleType === "now" ? "border-[#25D366] bg-green-50" : "border-gray-200 hover:border-[#F26B33]"
                        }`}
                    >
                        <div className={`w-[18px] h-[18px] mt-0.5 rounded-full border-2 flex-shrink-0 ${
                            scheduleType === "now" ? "border-[#25D366] bg-[#25D366] shadow-[inset_0_0_0_3px_white]" : "border-gray-300"
                        }`} />
                        <div>
                            <div className="font-semibold text-sm">Send Now</div>
                            <div className="text-xs text-gray-500">Send immediately to all {targetCount.toLocaleString()} customers</div>
                        </div>
                    </div>

                    {/* Schedule for Later */}
                    <div
                        onClick={() => setScheduleType("scheduled")}
                        className={`flex items-start gap-3 p-3 border rounded-xl mb-2 cursor-pointer transition-colors ${
                            scheduleType === "scheduled" ? "border-[#25D366] bg-green-50" : "border-gray-200 hover:border-[#F26B33]"
                        }`}
                    >
                        <div className={`w-[18px] h-[18px] mt-0.5 rounded-full border-2 flex-shrink-0 ${
                            scheduleType === "scheduled" ? "border-[#25D366] bg-[#25D366] shadow-[inset_0_0_0_3px_white]" : "border-gray-300"
                        }`} />
                        <div className="flex-1">
                            <div className="font-semibold text-sm">Schedule for Later</div>
                            <div className="text-xs text-gray-500">Pick a specific date and time</div>
                            {scheduleType === "scheduled" && (
                                <div className="grid grid-cols-2 gap-3 mt-2" onClick={e => e.stopPropagation()}>
                                    <Input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} className="text-sm" data-testid="schedule-date" />
                                    <Input type="time" value={scheduledTime} onChange={e => setScheduledTime(e.target.value)} className="text-sm" data-testid="schedule-time" />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Recurring */}
                    <div
                        onClick={() => setScheduleType("recurring")}
                        className={`flex items-start gap-3 p-3 border rounded-xl mb-2 cursor-pointer transition-colors ${
                            scheduleType === "recurring" ? "border-[#25D366] bg-green-50" : "border-gray-200 hover:border-[#F26B33]"
                        }`}
                    >
                        <div className={`w-[18px] h-[18px] mt-0.5 rounded-full border-2 flex-shrink-0 ${
                            scheduleType === "recurring" ? "border-[#25D366] bg-[#25D366] shadow-[inset_0_0_0_3px_white]" : "border-gray-300"
                        }`} />
                        <div className="flex-1">
                            <div className="font-semibold text-sm">Recurring</div>
                            <div className="text-xs text-gray-500">Send daily, weekly, or monthly</div>
                            {scheduleType === "recurring" && (
                                <div className="grid grid-cols-2 gap-3 mt-2" onClick={e => e.stopPropagation()}>
                                    <Select value={recurringFrequency} onValueChange={setRecurringFrequency}>
                                        <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="daily">Daily</SelectItem>
                                            <SelectItem value="weekly">Weekly</SelectItem>
                                            <SelectItem value="monthly">Monthly</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <Input type="time" value={scheduledTime} onChange={e => setScheduledTime(e.target.value)} className="text-sm" />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Confirmation Box (matching mock amber style) */}
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mt-4" data-testid="confirmation-box">
                        <div className="font-bold text-amber-800 text-sm mb-1">Confirm Campaign Send</div>
                        <div className="text-[13px] text-amber-900 space-y-0.5">
                            <div><strong>Campaign:</strong> {name || "—"}</div>
                            <div><strong>Audience:</strong> {audienceName} ({audienceCount.toLocaleString()} customers{optedOutCount > 0 ? `, ${optedOutCount} opted-out skipped = ${targetCount.toLocaleString()} messages` : ""})</div>
                            <div><strong>Template:</strong> {templateName || "—"}</div>
                            <div><strong>Schedule:</strong> {scheduleType === "now" ? "Send Now" : scheduleType === "scheduled" ? `Scheduled: ${scheduledDate} ${scheduledTime}` : `Recurring: ${recurringFrequency}`}</div>
                            <div><strong>Daily limit:</strong> {dailyLimit.remaining.toLocaleString()} of {dailyLimit.limit.toLocaleString()} remaining today</div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex justify-between items-center mt-5">
                        <Button variant="outline" className="rounded-full" onClick={() => setStep(2)} data-testid="back-step2-btn">
                            <ArrowLeft className="w-4 h-4 mr-1" /> Back
                        </Button>
                        <div className="flex gap-2">
                            <Button variant="outline" className="rounded-full" onClick={handleSave} disabled={saving} data-testid="save-draft-btn">
                                {saving ? "Saving..." : "Save as Draft"}
                            </Button>
                            <Button
                                onClick={() => { needsDoubleConfirm ? setShowConfirm(true) : handleSend(); }}
                                disabled={sending || !templateId}
                                className="bg-[#25D366] hover:bg-[#1da851] text-white rounded-full px-6"
                                data-testid="send-campaign-btn"
                            >
                                {sendButtonLabel}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Double confirmation for >500 */}
            <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
                <AlertDialogContent data-testid="double-confirm-dialog">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2 text-amber-700">
                            <AlertTriangle className="w-5 h-5" /> Large Campaign Warning
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            You are about to send WhatsApp messages to <strong>{targetCount.toLocaleString()}</strong> customers. This cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleSend} className="bg-[#25D366] hover:bg-[#1da851]">
                            Yes, Send to {targetCount.toLocaleString()} Customers
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

const CampaignWizardPage = () => (
    <ResponsiveLayout>
        <CampaignWizardContent />
    </ResponsiveLayout>
);

export default CampaignWizardPage;
