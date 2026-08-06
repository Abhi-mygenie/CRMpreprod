import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ChevronLeft, Save } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ResponsiveLayout } from "@/components/ResponsiveLayout";

// CR-001C-L-FIX Phase 3: Safe numeric input helpers.
// Fixes D8 (parseFloat("") → NaN across 23 inputs) and D5/D6/D7 (|| fallbacks).
const displayNumber = (v) => (v === null || v === undefined || (typeof v === "number" && Number.isNaN(v)) ? "" : v);
const onNumberChange = (setter, field, parser = parseFloat) => (e) => {
    const raw = e.target.value;
    if (raw === "") {
        setter(prev => ({...prev, [field]: ""}));
        return;
    }
    const n = parser(raw);
    if (!Number.isNaN(n)) {
        setter(prev => ({...prev, [field]: n}));
    }
};

export default function LoyaltySettingsPage() {
    const { api } = useAuth();
    const navigate = useNavigate();
    const [settings, setSettings] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const res = await api.get("/loyalty/settings");
                setSettings(res.data);
            } catch (err) {
                toast.error("Failed to load settings");
            } finally {
                setLoading(false);
            }
        };
        fetchSettings();
    }, []);

    const handleSave = async () => {
        setSaving(true);
        try {
            // CR-001C-L-FIX Phase 3: clean up empty strings → null/0 before PATCH.
            const payload = {...settings};
            // Nullable field: "" → null (blank = no limit)
            if (payload.max_redemption_amount === "" || payload.max_redemption_amount === undefined) payload.max_redemption_amount = null;
            // Per-tier overrides: "" → null (blank = use base value)
            for (const tier of ["bronze", "silver", "gold", "platinum"]) {
                const key = `${tier}_redemption_value`;
                if (payload[key] === "" || payload[key] === undefined) payload[key] = null;
            }
            // Integer fields: "" → 0 (safe default for missing)
            const intFields = [
                "min_order_value", "min_redemption_points", "points_expiry_months",
                "expiry_reminder_days", "tier_silver_min", "tier_gold_min", "tier_platinum_min",
                "first_visit_bonus_points", "birthday_bonus_points", "birthday_bonus_days_before",
                "birthday_bonus_days_after", "anniversary_bonus_points", "anniversary_bonus_days_before",
                "anniversary_bonus_days_after", "feedback_bonus_points",
                // CR-077: Lifecycle & Intelligence
                "at_risk_days_start", "at_risk_days_end", "dormant_days_end",
                "new_customer_max_visits", "campaign_daily_limit",
                "vip_score_min", "high_score_min", "medium_score_min",
                "vip_auto_score_threshold", "high_spender_threshold",
            ];
            for (const f of intFields) {
                if (payload[f] === "" || payload[f] === undefined) payload[f] = 0;
            }
            // Float fields: "" → 0
            const floatFields = [
                "bronze_earn_percent", "silver_earn_percent", "gold_earn_percent", "platinum_earn_percent",
                "redemption_value", "max_redemption_percent", "off_peak_bonus_value",
            ];
            for (const f of floatFields) {
                if (payload[f] === "" || payload[f] === undefined) payload[f] = 0;
            }
            await api.put("/loyalty/settings", payload);
            toast.success("Settings saved!");
        } catch (err) {
            toast.error("Failed to save settings");
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <ResponsiveLayout>
                <div className="p-4 lg:p-6 xl:p-8 max-w-[1600px] mx-auto">
                    <div className="animate-pulse space-y-4">
                        <div className="h-8 bg-gray-200 rounded w-48"></div>
                        <div className="h-32 bg-gray-200 rounded-xl"></div>
                    </div>
                </div>
            </ResponsiveLayout>
        );
    }

    return (
        <ResponsiveLayout>
            <div className="p-4 lg:p-6 xl:p-8 max-w-[1600px] mx-auto">
                <div className="mb-6 flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-[#1A1A1A] font-['Montserrat']" data-testid="loyalty-title">Loyalty Settings</h1>
                        <p className="text-sm text-[#52525B]">Points, tiers & bonuses</p>
                    </div>
                    {settings && (
                        <div
                            className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-2 shadow-sm"
                            data-testid="loyalty-master-toggle-wrapper"
                        >
                            <div className="flex flex-col items-end">
                                <Label className="form-label text-xs text-[#52525B] m-0">Loyalty Program</Label>
                                <span
                                    className={`text-sm font-semibold ${settings.loyalty_enabled ? "text-[#329937]" : "text-[#9CA3AF]"}`}
                                    data-testid="loyalty-master-status"
                                >
                                    {settings.loyalty_enabled ? "ON" : "OFF"}
                                </span>
                            </div>
                            <Switch
                                checked={!!settings.loyalty_enabled}
                                onCheckedChange={(checked) => setSettings({ ...settings, loyalty_enabled: checked })}
                                data-testid="loyalty-master-toggle"
                            />
                        </div>
                    )}
                </div>

                {settings && (
                    <>
                        {/* CR-001C-L-FIX Phase 4c: Loyalty-disabled banner (D13, Q6=A) */}
                        {!settings.loyalty_enabled && (
                            <div className="border-2 border-dashed border-orange-400 bg-orange-50 rounded-lg p-3 mb-4" data-testid="loyalty-disabled-banner">
                                <p className="text-sm text-orange-900 font-medium">
                                    Loyalty program is currently DISABLED. Customers earn no points and cannot redeem.
                                </p>
                            </div>
                        )}

                        <h2 className="text-lg font-semibold text-[#1A1A1A] mb-3 font-['Montserrat']">Points Earning</h2>
                        <Card className="rounded-xl border-0 shadow-sm mb-4" data-testid="earning-settings-card">
                            <CardContent className="p-4 space-y-4">
                                <div>
                                    <Label className="form-label">Minimum Order Value (Rs.)</Label>
                                    <Input type="number" min="0" value={displayNumber(settings.min_order_value)} onChange={onNumberChange(setSettings, "min_order_value")} className="h-12 rounded-xl" data-testid="min-order-value-input" />
                                    <p className="text-xs text-[#52525B] mt-1">Customer must spend at least this amount to earn points</p>
                                </div>
                            </CardContent>
                        </Card>

                        <h2 className="text-lg font-semibold text-[#1A1A1A] mb-3 font-['Montserrat']">Earning % by Tier</h2>
                        <Card className="rounded-xl border-0 shadow-sm mb-4" data-testid="tier-earning-card">
                            <CardContent className="p-4">
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <Label className="form-label flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-amber-600"></span>Bronze (%)</Label>
                                        <Input type="number" step="0.5" min="0" max="100" value={displayNumber(settings.bronze_earn_percent)} onChange={onNumberChange(setSettings, "bronze_earn_percent")} className="h-12 rounded-xl" data-testid="bronze-percent-input" />
                                    </div>
                                    <div>
                                        <Label className="form-label flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-gray-400"></span>Silver (%)</Label>
                                        <Input type="number" step="0.5" min="0" max="100" value={displayNumber(settings.silver_earn_percent)} onChange={onNumberChange(setSettings, "silver_earn_percent")} className="h-12 rounded-xl" data-testid="silver-percent-input" />
                                    </div>
                                    <div>
                                        <Label className="form-label flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-yellow-500"></span>Gold (%)</Label>
                                        <Input type="number" step="0.5" min="0" max="100" value={displayNumber(settings.gold_earn_percent)} onChange={onNumberChange(setSettings, "gold_earn_percent")} className="h-12 rounded-xl" data-testid="gold-percent-input" />
                                    </div>
                                    <div>
                                        <Label className="form-label flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-purple-500"></span>Platinum (%)</Label>
                                        <Input type="number" step="0.5" min="0" max="100" value={displayNumber(settings.platinum_earn_percent)} onChange={onNumberChange(setSettings, "platinum_earn_percent")} className="h-12 rounded-xl" data-testid="platinum-percent-input" />
                                    </div>
                                </div>
                                <p className="text-xs text-[#52525B] mt-3">Higher tier customers earn more points per order</p>
                            </CardContent>
                        </Card>

                        <h2 className="text-lg font-semibold text-[#1A1A1A] mb-3 font-['Montserrat']">Points Redemption</h2>
                        <Card className="rounded-xl border-0 shadow-sm mb-4" data-testid="redemption-settings-card">
                            <CardContent className="p-4 space-y-4">
                                <div className="bg-[#329937]/10 p-3 rounded-lg">
                                    <p className="text-sm text-[#329937] font-medium">1 Point = Rs.{displayNumber(settings.redemption_value) || 0}</p>
                                    <p className="text-xs text-[#52525B] mt-1">Example: {displayNumber(settings.bronze_earn_percent) || 0}% on Rs.1000 = {Math.round(1000 * (settings.bronze_earn_percent || 0) / 100)} points = Rs.{Math.round(1000 * (settings.bronze_earn_percent || 0) / 100 * (settings.redemption_value || 0))} discount</p>
                                </div>
                                <div>
                                    <Label className="form-label">Point Value (Rs. per point)</Label>
                                    <Input type="number" step="0.5" min="0.01" value={displayNumber(settings.redemption_value)} onChange={onNumberChange(setSettings, "redemption_value")} className="h-12 rounded-xl" data-testid="redemption-value-input" />
                                </div>
                                {/* CR-001C-L-FIX Phase 4b: Per-tier redemption-value overrides (D12, Q5=A) */}
                                <Collapsible className="mt-1">
                                    <CollapsibleTrigger className="text-xs text-[#52525B] underline cursor-pointer hover:text-[#1A1A1A]" data-testid="per-tier-override-trigger">
                                        Advanced — Per-tier overrides (optional)
                                    </CollapsibleTrigger>
                                    <CollapsibleContent className="mt-2">
                                        <div className="grid grid-cols-2 gap-3">
                                            {["bronze", "silver", "gold", "platinum"].map(tier => (
                                                <div key={tier}>
                                                    <Label className="form-label text-xs capitalize">{tier} Rs./point</Label>
                                                    <Input
                                                        type="number" step="0.01" min="0"
                                                        value={displayNumber(settings[`${tier}_redemption_value`])}
                                                        onChange={onNumberChange(setSettings, `${tier}_redemption_value`)}
                                                        placeholder={`Default ${displayNumber(settings.redemption_value) || 0}`}
                                                        className="h-10 rounded-lg text-sm"
                                                        data-testid={`${tier}-redemption-value-input`}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                        <p className="text-xs text-[#52525B] mt-2">Leave blank to use the base value above.</p>
                                    </CollapsibleContent>
                                </Collapsible>
                                <div>
                                    <Label className="form-label">Minimum Points to Redeem</Label>
                                    <Input type="number" min="0" value={displayNumber(settings.min_redemption_points)} onChange={onNumberChange(setSettings, "min_redemption_points", parseInt)} className="h-12 rounded-xl" data-testid="min-redemption-input" />
                                    <p className="text-xs text-[#52525B] mt-1">At least {displayNumber(settings.min_redemption_points) || 0} points required to redeem</p>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <Label className="form-label">Max % of Bill</Label>
                                        <Input type="number" min="1" max="100" value={displayNumber(settings.max_redemption_percent)} onChange={onNumberChange(setSettings, "max_redemption_percent")} className="h-12 rounded-xl" data-testid="max-redemption-percent-input" />
                                        <p className="text-xs text-[#52525B] mt-1">Max {displayNumber(settings.max_redemption_percent) || 0}% of bill</p>
                                    </div>
                                    <div>
                                        <Label className="form-label">Max Rs. Amount</Label>
                                        <Input type="number" min="0" value={displayNumber(settings.max_redemption_amount)} onChange={onNumberChange(setSettings, "max_redemption_amount")} className="h-12 rounded-xl" data-testid="max-redemption-amount-input" placeholder="No limit" />
                                        <p className="text-xs text-[#52525B] mt-1">{settings.max_redemption_amount ? `Max Rs.${settings.max_redemption_amount} per order` : "No limit per order"}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <h2 className="text-lg font-semibold text-[#1A1A1A] mb-3 font-['Montserrat']">Points Expiry</h2>
                        <Card className="rounded-xl border-0 shadow-sm mb-4" data-testid="expiry-settings-card">
                            <CardContent className="p-4 space-y-4">
                                <div className={`p-3 rounded-lg ${settings.points_expiry_months === 0 ? 'bg-gray-100' : 'bg-[#F26B33]/10'}`}>
                                    <p className="text-sm font-medium" style={{color: settings.points_expiry_months === 0 ? '#52525B' : '#F26B33'}}>{settings.points_expiry_months === 0 ? "Points Never Expire" : `Points expire after ${displayNumber(settings.points_expiry_months) || 0} months`}</p>
                                    {settings.points_expiry_months > 0 && <p className="text-xs text-[#52525B] mt-1">Customers will be reminded {displayNumber(settings.expiry_reminder_days) || 0} days before expiry</p>}
                                </div>
                                <div>
                                    <Label className="form-label">Expiry Period (months)</Label>
                                    <Input type="number" min="0" max="24" value={displayNumber(settings.points_expiry_months)} onChange={onNumberChange(setSettings, "points_expiry_months", parseInt)} className="h-12 rounded-xl" data-testid="expiry-months-input" />
                                    <p className="text-xs text-[#52525B] mt-1">Set to 0 for no expiry</p>
                                </div>
                                {(settings.points_expiry_months ?? 0) > 0 && (
                                    <div>
                                        <Label className="form-label">Reminder Before (days)</Label>
                                        <Input type="number" min="7" max="90" value={displayNumber(settings.expiry_reminder_days)} onChange={onNumberChange(setSettings, "expiry_reminder_days", parseInt)} className="h-12 rounded-xl" data-testid="expiry-reminder-input" />
                                        <p className="text-xs text-[#52525B] mt-1">Send reminder X days before points expire</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        <h2 className="text-lg font-semibold text-[#1A1A1A] mb-3 font-['Montserrat']">Tier Thresholds</h2>
                        <Card className="rounded-xl border-0 shadow-sm mb-4" data-testid="tier-settings-card">
                            <CardContent className="p-4">
                                <div className="grid grid-cols-3 gap-3">
                                    <div><Label className="form-label text-xs">Silver</Label><Input type="number" min="0" value={displayNumber(settings.tier_silver_min)} onChange={onNumberChange(setSettings, "tier_silver_min", parseInt)} className="h-10 rounded-lg text-sm" data-testid="tier-silver-input" /></div>
                                    <div><Label className="form-label text-xs">Gold</Label><Input type="number" min="0" value={displayNumber(settings.tier_gold_min)} onChange={onNumberChange(setSettings, "tier_gold_min", parseInt)} className="h-10 rounded-lg text-sm" data-testid="tier-gold-input" /></div>
                                    <div><Label className="form-label text-xs">Platinum</Label><Input type="number" min="0" value={displayNumber(settings.tier_platinum_min)} onChange={onNumberChange(setSettings, "tier_platinum_min", parseInt)} className="h-10 rounded-lg text-sm" data-testid="tier-platinum-input" /></div>
                                </div>
                                <p className="text-xs text-[#52525B] mt-3">Points needed to upgrade customer tier</p>
                            </CardContent>
                        </Card>

                        {/* ── CR-077: Lifecycle & Engagement Section ── */}
                        <h2 className="text-lg font-semibold text-[#1A1A1A] mb-3 mt-6 font-['Montserrat']">Lifecycle & Engagement</h2>
                        <Card className="rounded-xl border-0 shadow-sm mb-4" data-testid="lifecycle-settings-card">
                            <CardContent className="p-4 space-y-4">
                                <p className="text-xs text-[#52525B]">Controls when customers move between lifecycle stages and campaign thresholds. Defaults match industry standard.</p>
                                <div>
                                    <p className="font-semibold text-sm mb-2">Stage Boundaries (days inactive)</p>
                                    <div className="grid grid-cols-3 gap-3">
                                        <div>
                                            <Label className="form-label text-xs">At Risk starts</Label>
                                            <Input type="number" min="1" max="180" value={displayNumber(settings.at_risk_days_start ?? 31)} onChange={onNumberChange(setSettings, "at_risk_days_start", parseInt)} className="h-10 rounded-lg text-sm" data-testid="at-risk-days-start-input" />
                                            <p className="text-[10px] text-gray-400 mt-1">Default: 31 days</p>
                                        </div>
                                        <div>
                                            <Label className="form-label text-xs">Dormant starts</Label>
                                            <Input type="number" min="1" max="365" value={displayNumber(settings.at_risk_days_end ?? 60)} onChange={onNumberChange(setSettings, "at_risk_days_end", parseInt)} className="h-10 rounded-lg text-sm" data-testid="at-risk-days-end-input" />
                                            <p className="text-[10px] text-gray-400 mt-1">Default: 60 days</p>
                                        </div>
                                        <div>
                                            <Label className="form-label text-xs">Churned starts</Label>
                                            <Input type="number" min="1" max="730" value={displayNumber(settings.dormant_days_end ?? 90)} onChange={onNumberChange(setSettings, "dormant_days_end", parseInt)} className="h-10 rounded-lg text-sm" data-testid="dormant-days-end-input" />
                                            <p className="text-[10px] text-gray-400 mt-1">Default: 90 days</p>
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <Label className="form-label">Daily WhatsApp Campaign Limit</Label>
                                    <Input type="number" min="100" max="50000" value={displayNumber(settings.campaign_daily_limit ?? 1000)} onChange={onNumberChange(setSettings, "campaign_daily_limit", parseInt)} className="h-12 rounded-xl" data-testid="campaign-daily-limit-input" />
                                    <p className="text-xs text-[#52525B] mt-1">Max WhatsApp messages per day via manual campaigns. Default: 1,000.</p>
                                </div>
                                <div>
                                    <Label className="form-label">High Spender Threshold (₹)</Label>
                                    <Input type="number" min="100" value={displayNumber(settings.high_spender_threshold ?? 5000)} onChange={onNumberChange(setSettings, "high_spender_threshold", parseInt)} className="h-12 rounded-xl" data-testid="high-spender-threshold-input" />
                                    <p className="text-xs text-[#52525B] mt-1">Customers spending ≥ this are shown as "High Spenders" in audience chips. Default: ₹5,000.</p>
                                </div>
                                <div className="border-t pt-4">
                                    <div className="flex items-center justify-between mb-3">
                                        <div>
                                            <p className="font-semibold text-[#1A1A1A]">VIP Auto-Promotion</p>
                                            <p className="text-xs text-[#52525B]">Nightly job auto-marks qualifying customers as VIP based on spend + recency</p>
                                        </div>
                                        <Switch checked={settings.vip_auto_promote_enabled ?? false} onCheckedChange={(checked) => setSettings({...settings, vip_auto_promote_enabled: checked})} data-testid="vip-auto-promote-toggle" />
                                    </div>
                                    {settings.vip_auto_promote_enabled && (
                                        <div>
                                            <Label className="form-label text-xs">VIP Score Threshold (0–100)</Label>
                                            <Input type="number" min="50" max="100" value={displayNumber(settings.vip_auto_score_threshold ?? 80)} onChange={onNumberChange(setSettings, "vip_auto_score_threshold", parseInt)} className="h-10 rounded-lg text-sm" data-testid="vip-auto-score-input" />
                                            <p className="text-[10px] text-gray-400 mt-1">Customers scoring ≥ this are auto-flagged as VIP. Default: 80.</p>
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                        <h2 className="text-lg font-semibold text-[#1A1A1A] mb-3 mt-6 font-['Montserrat']">Bonus Features</h2>
                        
                        <Card className="rounded-xl border-0 shadow-sm mb-4">
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <div><p className="font-semibold text-[#1A1A1A]">First Visit Bonus</p><p className="text-xs text-[#52525B]">Welcome new customers</p></div>
                                    <Switch checked={settings.first_visit_bonus_enabled ?? true} onCheckedChange={(checked) => setSettings({...settings, first_visit_bonus_enabled: checked})} data-testid="first-visit-toggle" />
                                </div>
                                {settings.first_visit_bonus_enabled && (
                                    <div>
                                        <Label className="form-label">Bonus Points</Label>
                                        <Input type="number" min="0" value={displayNumber(settings.first_visit_bonus_points)} onChange={onNumberChange(setSettings, "first_visit_bonus_points", parseInt)} className="h-12 rounded-xl" data-testid="first-visit-points-input" />
                                        <p className="text-xs text-[#52525B] mt-1">Points awarded on customer's first purchase</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        <Card className="rounded-xl border-0 shadow-sm mb-4">
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <div><p className="font-semibold text-[#1A1A1A]">Birthday Bonus</p><p className="text-xs text-[#52525B]">Celebrate customer birthdays</p></div>
                                    <Switch checked={settings.birthday_bonus_enabled ?? true} onCheckedChange={(checked) => setSettings({...settings, birthday_bonus_enabled: checked})} data-testid="birthday-toggle" />
                                </div>
                                {settings.birthday_bonus_enabled && (
                                    <div className="space-y-3">
                                        <div><Label className="form-label">Bonus Points</Label><Input type="number" min="0" value={displayNumber(settings.birthday_bonus_points)} onChange={onNumberChange(setSettings, "birthday_bonus_points", parseInt)} className="h-12 rounded-xl" data-testid="birthday-points-input" /></div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div><Label className="form-label text-xs">Days Before</Label><Input type="number" min="0" max="30" value={displayNumber(settings.birthday_bonus_days_before)} onChange={onNumberChange(setSettings, "birthday_bonus_days_before", parseInt)} className="h-10 rounded-lg text-sm" data-testid="birthday-days-before" /></div>
                                            <div><Label className="form-label text-xs">Days After</Label><Input type="number" min="0" max="30" value={displayNumber(settings.birthday_bonus_days_after)} onChange={onNumberChange(setSettings, "birthday_bonus_days_after", parseInt)} className="h-10 rounded-lg text-sm" data-testid="birthday-days-after" /></div>
                                        </div>
                                        <p className="text-xs text-[#52525B]">Bonus valid for specified days around customer's birthday</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        <Card className="rounded-xl border-0 shadow-sm mb-4">
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <div><p className="font-semibold text-[#1A1A1A]">Anniversary Bonus</p><p className="text-xs text-[#52525B]">Celebrate anniversaries</p></div>
                                    <Switch checked={settings.anniversary_bonus_enabled ?? true} onCheckedChange={(checked) => setSettings({...settings, anniversary_bonus_enabled: checked})} data-testid="anniversary-toggle" />
                                </div>
                                {settings.anniversary_bonus_enabled && (
                                    <div className="space-y-3">
                                        <div><Label className="form-label">Bonus Points</Label><Input type="number" min="0" value={displayNumber(settings.anniversary_bonus_points)} onChange={onNumberChange(setSettings, "anniversary_bonus_points", parseInt)} className="h-12 rounded-xl" data-testid="anniversary-points-input" /></div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div><Label className="form-label text-xs">Days Before</Label><Input type="number" min="0" max="30" value={displayNumber(settings.anniversary_bonus_days_before)} onChange={onNumberChange(setSettings, "anniversary_bonus_days_before", parseInt)} className="h-10 rounded-lg text-sm" /></div>
                                            <div><Label className="form-label text-xs">Days After</Label><Input type="number" min="0" max="30" value={displayNumber(settings.anniversary_bonus_days_after)} onChange={onNumberChange(setSettings, "anniversary_bonus_days_after", parseInt)} className="h-10 rounded-lg text-sm" /></div>
                                        </div>
                                        <p className="text-xs text-[#52525B]">Bonus valid for specified days around anniversary date</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        <Card className="rounded-xl border-0 shadow-sm mb-4">
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <div><p className="font-semibold text-[#1A1A1A]">Off-Peak Hours Bonus</p><p className="text-xs text-[#52525B]">Drive traffic during slow hours</p></div>
                                    <Switch checked={settings.off_peak_bonus_enabled ?? false} onCheckedChange={(checked) => setSettings({...settings, off_peak_bonus_enabled: checked})} data-testid="off-peak-toggle" />
                                </div>
                                {settings.off_peak_bonus_enabled && (
                                    <div className="space-y-3">
                                        <div className="grid grid-cols-2 gap-3">
                                            <div><Label className="form-label">Start Time</Label><Input type="time" value={settings.off_peak_start_time ?? "14:00"} onChange={(e) => setSettings({...settings, off_peak_start_time: e.target.value})} className="h-12 rounded-xl" data-testid="off-peak-start" /></div>
                                            <div><Label className="form-label">End Time</Label><Input type="time" value={settings.off_peak_end_time ?? "17:00"} onChange={(e) => setSettings({...settings, off_peak_end_time: e.target.value})} className="h-12 rounded-xl" data-testid="off-peak-end" /></div>
                                        </div>
                                        <div>
                                            <Label className="form-label">Bonus Type</Label>
                                            <Select value={settings.off_peak_bonus_type ?? "multiplier"} onValueChange={(value) => setSettings({...settings, off_peak_bonus_type: value})}><SelectTrigger className="h-12 rounded-xl" data-testid="bonus-type-select"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="multiplier">Multiplier (e.g., 2x points)</SelectItem><SelectItem value="flat">Flat Bonus (e.g., +50 points)</SelectItem></SelectContent></Select>
                                        </div>
                                        <div>
                                            <Label className="form-label">{settings.off_peak_bonus_type === "multiplier" ? "Multiplier (e.g., 2.0 for 2x)" : "Flat Points"}</Label>
                                            <Input type="number" min="0" step={settings.off_peak_bonus_type === "multiplier" ? "0.5" : "1"} value={displayNumber(settings.off_peak_bonus_value)} onChange={onNumberChange(setSettings, "off_peak_bonus_value")} className="h-12 rounded-xl" data-testid="off-peak-value" />
                                            <p className="text-xs text-[#52525B] mt-1">{settings.off_peak_bonus_type === "multiplier" ? "Points will be multiplied by this value" : "Fixed points added to base points"}</p>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        <Card className="rounded-xl border-0 shadow-sm mb-4">
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <div><p className="font-semibold text-[#1A1A1A]">Feedback Bonus</p><p className="text-xs text-[#52525B]">Reward customers for reviews</p></div>
                                    <Switch checked={settings.feedback_bonus_enabled ?? true} onCheckedChange={(checked) => setSettings({...settings, feedback_bonus_enabled: checked})} data-testid="feedback-toggle" />
                                </div>
                                {settings.feedback_bonus_enabled && (
                                    <div>
                                        <Label className="form-label">Bonus Points</Label>
                                        <Input type="number" min="0" value={displayNumber(settings.feedback_bonus_points)} onChange={onNumberChange(setSettings, "feedback_bonus_points", parseInt)} className="h-12 rounded-xl" data-testid="feedback-points-input" />
                                        <p className="text-xs text-[#52525B] mt-1">Points awarded once when customer submits feedback (one-time bonus)</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        <Button onClick={handleSave} className="w-full h-12 bg-[#F26B33] hover:bg-[#D85A2A] rounded-full mb-4" disabled={saving} data-testid="save-settings-btn">
                            {saving ? "Saving..." : "Save All Settings"}
                        </Button>
                    </>
                )}
            </div>
        </ResponsiveLayout>
    );
}
