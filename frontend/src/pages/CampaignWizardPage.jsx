import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, Send, Save, Users, FileText, Clock, AlertTriangle } from "lucide-react";
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
            const formatted = (tplRes.data.templates || []).map(t => ({
                id: t.wid?.toString() || t.id,
                name: t.temp_name || t.name,
                message: t.temp_body || t.message || "",
                variables: (t.temp_body?.match(/\{\{\d+\}\}/g) || []).filter((v, i, a) => a.indexOf(v) === i),
            }));
            setTemplates(formatted);
            const mObj = {}, moObj = {};
            (mapRes.data.mappings || []).forEach(m => { mObj[m.template_id] = m.mappings || {}; moObj[m.template_id] = m.modes || {}; });
            setAllMappings(mObj);
            setAllModes(moObj);
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
        if (!tpl?.variables?.length) return true;
        const maps = allMappings[tpl.id] || {};
        return tpl.variables.every(v => maps[v] && maps[v].trim() !== "");
    };

    const handleTemplateSelect = (tplId) => {
        setTemplateId(tplId);
        const tpl = templates.find(t => t.id === tplId);
        setTemplateName(tpl?.name || "");
        setVariableMappings(allMappings[tplId] || {});
        setVariableModes(allModes[tplId] || {});
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
    const canStep2 = templateId && isFullyMapped(currentTemplate);
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
                <Badge className="bg-amber-100 text-amber-700 text-xs">Draft</Badge>
            </div>

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
                        <Select value={audienceId} onValueChange={setAudienceId}>
                            <SelectTrigger className="mt-1.5" data-testid="audience-select"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all-customers">All Customers ({totalCustomers.toLocaleString()} customers)</SelectItem>
                                {segments.map(s => (
                                    <SelectItem key={s.id} value={s.id}>{s.name} ({(s.customer_count || 0).toLocaleString()} customers)</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-gray-500 mt-1.5">or <span className="text-[#F26B33] underline cursor-pointer" onClick={() => navigate("/audiences")}>create a new audience</span></p>
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
                                        {templates.filter(t => isFullyMapped(t)).map(t => (
                                            <SelectItem key={t.id} value={t.id}>{t.name} ({(t.variables || []).length} variables, fully mapped)</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-[11px] text-gray-500 mt-1">Only templates with all variables mapped are shown</p>
                            </div>

                            {/* Variable Mapping Grid (matching mock) */}
                            {currentTemplate && Object.keys(variableMappings).length > 0 && (
                                <div className="mt-4">
                                    <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2 block">Variable Mapping</Label>
                                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                                        <div className="grid grid-cols-[80px_20px_1fr] gap-y-1.5 gap-x-2 text-xs">
                                            {Object.entries(variableMappings).map(([varKey, mapping]) => (
                                                <React.Fragment key={varKey}>
                                                    <span className="text-gray-500 font-mono">{varKey}</span>
                                                    <span className="text-gray-400">→</span>
                                                    <span className="font-semibold text-gray-700">
                                                        {variableModes[varKey] === "text" ? `"${mapping}"` : mapping}
                                                    </span>
                                                </React.Fragment>
                                            ))}
                                        </div>
                                        <p className="text-[11px] text-green-600 mt-2">All {Object.keys(variableMappings).length} variables mapped</p>
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
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* STEP 3: Schedule & Send */}
            {step === 3 && (
                <div className="bg-white rounded-xl border border-gray-200 p-6" data-testid="step3-content">
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
                                <div className="grid grid-cols-2 gap-3 mt-2">
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
                                <div className="grid grid-cols-2 gap-3 mt-2">
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
