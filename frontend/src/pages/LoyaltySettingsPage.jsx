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
import { MobileLayout } from "@/components/MobileLayout";

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
            await api.put("/loyalty/settings", settings);
            toast.success("Settings saved!");
        } catch (err) {
            toast.error("Failed to save settings");
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <MobileLayout>
                <div className="p-4 max-w-lg mx-auto">
                    <div className="animate-pulse space-y-4">
                        <div className="h-8 bg-gray-200 rounded w-48"></div>
                        <div className="h-32 bg-gray-200 rounded-xl"></div>
                    </div>
                </div>
            </MobileLayout>
        );
    }

    return (
        <MobileLayout>
            <div className="p-4 max-w-lg mx-auto">
                <div className="flex items-center gap-3 mb-6">
                    <button onClick={() => navigate("/settings")} className="p-2 hover:bg-gray-100 rounded-full" data-testid="back-btn">
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-[#1A1A1A] font-['Montserrat']" data-testid="loyalty-title">Loyalty Settings</h1>
                        <p className="text-sm text-[#52525B]">Points, tiers & bonuses</p>
                    </div>
                </div>

                {settings && (
                    <>
                        <h2 className="text-lg font-semibold text-[#1A1A1A] mb-3 font-['Montserrat']">Points Earning</h2>
                        <Card className="rounded-xl border-0 shadow-sm mb-4" data-testid="earning-settings-card">
                            <CardContent className="p-4 space-y-4">
                                <div>
                                    <Label className="form-label">Minimum Order Value (₹)</Label>
                                    <Input type="number" min="0" value={settings.min_order_value} onChange={(e) => setSettings({...settings, min_order_value: parseFloat(e.target.value)})} className="h-12 rounded-xl" data-testid="min-order-value-input" />
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
                                        <Input type="number" step="0.5" min="0" max="100" value={settings.bronze_earn_percent} onChange={(e) => setSettings({...settings, bronze_earn_percent: parseFloat(e.target.value)})} className="h-12 rounded-xl" data-testid="bronze-percent-input" />
                                    </div>
                                    <div>
                                        <Label className="form-label flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-gray-400"></span>Silver (%)</Label>
                                        <Input type="number" step="0.5" min="0" max="100" value={settings.silver_earn_percent} onChange={(e) => setSettings({...settings, silver_earn_percent: parseFloat(e.target.value)})} className="h-12 rounded-xl" data-testid="silver-percent-input" />
                                    </div>
                                    <div>
                                        <Label className="form-label flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-yellow-500"></span>Gold (%)</Label>
                                        <Input type="number" step="0.5" min="0" max="100" value={settings.gold_earn_percent} onChange={(e) => setSettings({...settings, gold_earn_percent: parseFloat(e.target.value)})} className="h-12 rounded-xl" data-testid="gold-percent-input" />
                                    </div>
                                    <div>
                                        <Label className="form-label flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-purple-500"></span>Platinum (%)</Label>
                                        <Input type="number" step="0.5" min="0" max="100" value={settings.platinum_earn_percent} onChange={(e) => setSettings({...settings, platinum_earn_percent: parseFloat(e.target.value)})} className="h-12 rounded-xl" data-testid="platinum-percent-input" />
                                    </div>
                                </div>
                                <p className="text-xs text-[#52525B] mt-3">Higher tier customers earn more points per order</p>
                            </CardContent>
                        </Card>

                        <h2 className="text-lg font-semibold text-[#1A1A1A] mb-3 font-['Montserrat']">Points Redemption</h2>
                        <Card className="rounded-xl border-0 shadow-sm mb-4" data-testid="redemption-settings-card">
                            <CardContent className="p-4 space-y-4">
                                <div className="bg-[#329937]/10 p-3 rounded-lg">
                                    <p className="text-sm text-[#329937] font-medium">1 Point = ₹{settings.redemption_value}</p>
                                    <p className="text-xs text-[#52525B] mt-1">Example: {settings.bronze_earn_percent}% on ₹1000 = {Math.round(1000 * settings.bronze_earn_percent / 100)} points = ₹{Math.round(1000 * settings.bronze_earn_percent / 100 * settings.redemption_value)} discount</p>
                                </div>
                                <div>
                                    <Label className="form-label">Point Value (₹ per point)</Label>
                                    <Input type="number" step="0.5" min="0.5" value={settings.redemption_value} onChange={(e) => setSettings({...settings, redemption_value: parseFloat(e.target.value)})} className="h-12 rounded-xl" data-testid="redemption-value-input" />
                                </div>
                                <div>
                                    <Label className="form-label">Minimum Points to Redeem</Label>
                                    <Input type="number" min="0" value={settings.min_redemption_points} onChange={(e) => setSettings({...settings, min_redemption_points: parseInt(e.target.value)})} className="h-12 rounded-xl" data-testid="min-redemption-input" />
                                    <p className="text-xs text-[#52525B] mt-1">Customer needs at least ₹{settings.min_redemption_points} worth points</p>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <Label className="form-label">Max % of Bill</Label>
                                        <Input type="number" min="1" max="100" value={settings.max_redemption_percent || 50} onChange={(e) => setSettings({...settings, max_redemption_percent: parseFloat(e.target.value)})} className="h-12 rounded-xl" data-testid="max-redemption-percent-input" />
                                        <p className="text-xs text-[#52525B] mt-1">Max {settings.max_redemption_percent || 50}% of bill</p>
                                    </div>
                                    <div>
                                        <Label className="form-label">Max ₹ Amount</Label>
                                        <Input type="number" min="0" value={settings.max_redemption_amount || 500} onChange={(e) => setSettings({...settings, max_redemption_amount: parseFloat(e.target.value)})} className="h-12 rounded-xl" data-testid="max-redemption-amount-input" />
                                        <p className="text-xs text-[#52525B] mt-1">Max ₹{settings.max_redemption_amount || 500} per order</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <h2 className="text-lg font-semibold text-[#1A1A1A] mb-3 font-['Montserrat']">Points Expiry</h2>
                        <Card className="rounded-xl border-0 shadow-sm mb-4" data-testid="expiry-settings-card">
                            <CardContent className="p-4 space-y-4">
                                <div className={`p-3 rounded-lg ${settings.points_expiry_months === 0 ? 'bg-gray-100' : 'bg-[#F26B33]/10'}`}>
                                    <p className="text-sm font-medium" style={{color: settings.points_expiry_months === 0 ? '#52525B' : '#F26B33'}}>{settings.points_expiry_months === 0 ? "Points Never Expire" : `Points expire after ${settings.points_expiry_months} months`}</p>
                                    {settings.points_expiry_months > 0 && <p className="text-xs text-[#52525B] mt-1">Customers will be reminded {settings.expiry_reminder_days || 30} days before expiry</p>}
                                </div>
                                <div>
                                    <Label className="form-label">Expiry Period (months)</Label>
                                    <Input type="number" min="0" max="24" value={settings.points_expiry_months ?? 6} onChange={(e) => setSettings({...settings, points_expiry_months: parseInt(e.target.value)})} className="h-12 rounded-xl" data-testid="expiry-months-input" />
                                    <p className="text-xs text-[#52525B] mt-1">Set to 0 for no expiry</p>
                                </div>
                                {(settings.points_expiry_months ?? 6) > 0 && (
                                    <div>
                                        <Label className="form-label">Reminder Before (days)</Label>
                                        <Input type="number" min="7" max="90" value={settings.expiry_reminder_days || 30} onChange={(e) => setSettings({...settings, expiry_reminder_days: parseInt(e.target.value)})} className="h-12 rounded-xl" data-testid="expiry-reminder-input" />
                                        <p className="text-xs text-[#52525B] mt-1">Send reminder X days before points expire</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        <h2 className="text-lg font-semibold text-[#1A1A1A] mb-3 font-['Montserrat']">Tier Thresholds</h2>
                        <Card className="rounded-xl border-0 shadow-sm mb-4" data-testid="tier-settings-card">
                            <CardContent className="p-4">
                                <div className="grid grid-cols-3 gap-3">
                                    <div><Label className="form-label text-xs">Silver</Label><Input type="number" min="0" value={settings.tier_silver_min} onChange={(e) => setSettings({...settings, tier_silver_min: parseInt(e.target.value)})} className="h-10 rounded-lg text-sm" data-testid="tier-silver-input" /></div>
                                    <div><Label className="form-label text-xs">Gold</Label><Input type="number" min="0" value={settings.tier_gold_min} onChange={(e) => setSettings({...settings, tier_gold_min: parseInt(e.target.value)})} className="h-10 rounded-lg text-sm" data-testid="tier-gold-input" /></div>
                                    <div><Label className="form-label text-xs">Platinum</Label><Input type="number" min="0" value={settings.tier_platinum_min} onChange={(e) => setSettings({...settings, tier_platinum_min: parseInt(e.target.value)})} className="h-10 rounded-lg text-sm" data-testid="tier-platinum-input" /></div>
                                </div>
                                <p className="text-xs text-[#52525B] mt-3">Points needed to upgrade customer tier</p>
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
                                        <Input type="number" min="0" value={settings.first_visit_bonus_points ?? 50} onChange={(e) => setSettings({...settings, first_visit_bonus_points: parseInt(e.target.value)})} className="h-12 rounded-xl" data-testid="first-visit-points-input" />
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
                                        <div><Label className="form-label">Bonus Points</Label><Input type="number" min="0" value={settings.birthday_bonus_points ?? 100} onChange={(e) => setSettings({...settings, birthday_bonus_points: parseInt(e.target.value)})} className="h-12 rounded-xl" data-testid="birthday-points-input" /></div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div><Label className="form-label text-xs">Days Before</Label><Input type="number" min="0" max="30" value={settings.birthday_bonus_days_before ?? 0} onChange={(e) => setSettings({...settings, birthday_bonus_days_before: parseInt(e.target.value)})} className="h-10 rounded-lg text-sm" data-testid="birthday-days-before" /></div>
                                            <div><Label className="form-label text-xs">Days After</Label><Input type="number" min="0" max="30" value={settings.birthday_bonus_days_after ?? 7} onChange={(e) => setSettings({...settings, birthday_bonus_days_after: parseInt(e.target.value)})} className="h-10 rounded-lg text-sm" data-testid="birthday-days-after" /></div>
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
                                        <div><Label className="form-label">Bonus Points</Label><Input type="number" min="0" value={settings.anniversary_bonus_points ?? 150} onChange={(e) => setSettings({...settings, anniversary_bonus_points: parseInt(e.target.value)})} className="h-12 rounded-xl" data-testid="anniversary-points-input" /></div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div><Label className="form-label text-xs">Days Before</Label><Input type="number" min="0" max="30" value={settings.anniversary_bonus_days_before ?? 0} onChange={(e) => setSettings({...settings, anniversary_bonus_days_before: parseInt(e.target.value)})} className="h-10 rounded-lg text-sm" /></div>
                                            <div><Label className="form-label text-xs">Days After</Label><Input type="number" min="0" max="30" value={settings.anniversary_bonus_days_after ?? 7} onChange={(e) => setSettings({...settings, anniversary_bonus_days_after: parseInt(e.target.value)})} className="h-10 rounded-lg text-sm" /></div>
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
                                            <Input type="number" min="0" step={settings.off_peak_bonus_type === "multiplier" ? "0.5" : "1"} value={settings.off_peak_bonus_value ?? 2.0} onChange={(e) => setSettings({...settings, off_peak_bonus_value: parseFloat(e.target.value)})} className="h-12 rounded-xl" data-testid="off-peak-value" />
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
                                        <Input type="number" min="0" value={settings.feedback_bonus_points ?? 25} onChange={(e) => setSettings({...settings, feedback_bonus_points: parseInt(e.target.value)})} className="h-12 rounded-xl" data-testid="feedback-points-input" />
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
        </MobileLayout>
    );
}
