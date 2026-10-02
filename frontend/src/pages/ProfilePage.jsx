import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { User, Building2, MapPin, ShieldCheck, Receipt, Upload, Image, Palette } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveLayout } from "@/components/ResponsiveLayout";

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PINCODE_REGEX = /^[1-9][0-9]{5}$/;
const FSSAI_REGEX = /^[0-9]{14}$/;
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

const GSTIN_STATE_MAP = {
    "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab",
    "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana",
    "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh",
    "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh",
    "13": "Nagaland", "14": "Manipur", "15": "Mizoram",
    "16": "Tripura", "17": "Meghalaya", "18": "Assam",
    "19": "West Bengal", "20": "Jharkhand", "21": "Odisha",
    "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
    "25": "Daman & Diu", "26": "Dadra & Nagar Haveli & Daman & Diu",
    "27": "Maharashtra", "28": "Andhra Pradesh (old)",
    "29": "Karnataka", "30": "Goa", "31": "Lakshadweep",
    "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry",
    "35": "Andaman & Nicobar", "36": "Telangana",
    "37": "Andhra Pradesh", "38": "Ladakh",
};
const INDIAN_STATES = [...new Set(Object.values(GSTIN_STATE_MAP))].sort();

const CURRENCY_OPTIONS = ["Rs.", "\u20B9", "INR"];
const DATE_FORMAT_OPTIONS = ["DD MMM YYYY", "DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"];

const DEFAULT_BILL_SETTINGS = {
    invoice_prefix: "", header_color: "#2B2B2B", accent_color: "#F26B33",
    bill_logo_url: "", show_gstin: true, show_fssai: true, show_sac_code: true,
    sac_code: "", show_loyalty_section: true, show_veg_dots: true,
    show_amount_in_words: true, currency_symbol: "Rs.", footer_message: "Thank you for dining with us!",
    footer_contact: "", tagline: "", terms_and_conditions: "", date_format: "DD MMM YYYY",
    show_customer_gstin: true, social_instagram: "", social_google_review: "",
};

function SectionHeader({ icon: Icon, title, testId }) {
    return (
        <div className="flex items-center gap-2 pt-5 pb-1.5 border-t border-gray-100 mt-5" data-testid={testId}>
            <Icon className="w-4 h-4 text-[#F26B33]" />
            <p className="text-sm font-semibold text-[#2B2B2B]">{title}</p>
        </div>
    );
}

function FieldError({ error, testId }) {
    if (!error) return null;
    return <p className="text-xs text-red-500 mt-0.5" data-testid={testId}>{error}</p>;
}

function ToggleRow({ label, checked, onChange, testId }) {
    return (
        <div className="flex items-center justify-between py-1.5">
            <span className="text-sm text-[#333]">{label}</span>
            <Switch checked={checked} onCheckedChange={onChange} data-testid={testId} />
        </div>
    );
}

export default function ProfilePage() {
    const { user, api, refreshUser } = useAuth();
    const [profile, setProfile] = useState({
        phone: "", gstin: "", legal_name: "", state: "",
        address_line1: "", address_line2: "", city: "", pincode: "",
        fssai_license: "", pan: "", vat_number: "",
    });
    const [bs, setBs] = useState({ ...DEFAULT_BILL_SETTINGS });
    const [errors, setErrors] = useState({});
    const [savingProfile, setSavingProfile] = useState(false);
    const [savingBill, setSavingBill] = useState(false);
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const logoInputRef = useRef(null);

    useEffect(() => {
        if (!user) return;
        setProfile({
            phone: user.phone || "",
            gstin: user.gstin || "",
            legal_name: user.legal_name || "",
            state: user.state || "",
            address_line1: user.address_line1 || "",
            address_line2: user.address_line2 || "",
            city: user.city || "",
            pincode: user.pincode || "",
            fssai_license: user.fssai_license || "",
            pan: user.pan || "",
            vat_number: user.vat_number || "",
        });
        if (user.bill_settings) {
            setBs(prev => ({ ...prev, ...user.bill_settings }));
        }
    }, [user]);

    const set = (key, val) => setProfile(p => ({ ...p, [key]: val }));
    const setB = (key, val) => setBs(p => ({ ...p, [key]: val }));
    const clearError = (key) => setErrors(e => { const n = { ...e }; delete n[key]; return n; });

    const validateField = (key, value) => {
        if (!value) { clearError(key); return; }
        const checks = {
            gstin: [GSTIN_REGEX, "Invalid GSTIN format"],
            pincode: [PINCODE_REGEX, "Must be 6 digits"],
            fssai_license: [FSSAI_REGEX, "Must be 14 digits"],
            pan: [PAN_REGEX, "Invalid PAN format"],
        };
        const check = checks[key];
        if (!check) return;
        if (!check[0].test(value.toUpperCase())) setErrors(e => ({ ...e, [key]: check[1] }));
        else clearError(key);
    };

    const handleGstinBlur = () => {
        const gstin = profile.gstin.trim().toUpperCase();
        set("gstin", gstin);
        validateField("gstin", gstin);
        if (gstin.length >= 2 && GSTIN_REGEX.test(gstin)) {
            const stateName = GSTIN_STATE_MAP[gstin.substring(0, 2)];
            if (stateName) set("state", stateName);
        }
    };

    const handleSaveProfile = async () => {
        const ve = {};
        if (profile.gstin && !GSTIN_REGEX.test(profile.gstin.toUpperCase())) ve.gstin = "Invalid GSTIN";
        if (profile.pincode && !PINCODE_REGEX.test(profile.pincode)) ve.pincode = "Must be 6 digits";
        if (profile.fssai_license && !FSSAI_REGEX.test(profile.fssai_license)) ve.fssai_license = "Must be 14 digits";
        if (profile.pan && !PAN_REGEX.test(profile.pan.toUpperCase())) ve.pan = "Invalid PAN";
        if (Object.keys(ve).length > 0) { setErrors(ve); toast.error("Fix validation errors"); return; }
        setSavingProfile(true);
        try {
            await api.put("/auth/profile", { ...profile, gstin: profile.gstin.toUpperCase(), pan: profile.pan.toUpperCase() });
            await refreshUser();
            toast.success("Profile updated!");
        } catch (err) { toast.error(err.response?.data?.detail || "Failed to update profile"); }
        finally { setSavingProfile(false); }
    };

    const handleSaveBillSettings = async () => {
        setSavingBill(true);
        try {
            await api.put("/auth/profile", { bill_settings: bs });
            await refreshUser();
            toast.success("Bill settings saved!");
        } catch (err) { toast.error(err.response?.data?.detail || "Failed to save bill settings"); }
        finally { setSavingBill(false); }
    };

    const handleLogoUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 512000) { toast.error("Image must be under 500KB"); return; }
        setUploadingLogo(true);
        try {
            const form = new FormData();
            form.append("file", file);
            const res = await api.post("/auth/profile/logo", form, { headers: { "Content-Type": "multipart/form-data" } });
            setB("bill_logo_url", res.data.logo_url);
            await refreshUser();
            toast.success("Logo uploaded!");
        } catch (err) { toast.error(err.response?.data?.detail || "Failed to upload logo"); }
        finally { setUploadingLogo(false); }
    };

    const logoPreviewUrl = bs.bill_logo_url
        ? (bs.bill_logo_url.startsWith("http") ? bs.bill_logo_url : `${process.env.REACT_APP_BACKEND_URL}${bs.bill_logo_url}`)
        : null;

    return (
        <ResponsiveLayout>
            <div className="p-4 lg:p-6 xl:p-8 max-w-3xl mx-auto space-y-6">
                <h1 className="text-2xl font-bold text-[#2B2B2B]" data-testid="profile-title">Profile</h1>

                {/* ===== Card 1: Business Profile ===== */}
                <Card className="rounded-xl border-0 shadow-sm" data-testid="profile-card">
                    <CardContent className="p-4 space-y-3">
                        <div className="flex items-start gap-3 pb-2">
                            <div className="w-10 h-10 rounded-full bg-[#F26B33]/10 flex items-center justify-center shrink-0"><User className="w-5 h-5 text-[#F26B33]" /></div>
                            <div><p className="font-medium text-[#2B2B2B]">Business Profile</p><p className="text-xs text-[#52525B] mt-0.5">Manage your business details</p></div>
                        </div>
                        <div><Label className="form-label">Business Name</Label><Input value={user?.restaurant_name || ""} disabled className="h-11 rounded-xl bg-gray-50 text-gray-500" /></div>
                        <div><Label className="form-label">Email</Label><Input value={user?.email || ""} disabled className="h-11 rounded-xl bg-gray-50 text-gray-500" /></div>
                        <div className="grid grid-cols-2 gap-3">
                            <div><Label className="form-label">POS ID</Label><Input value={user?.pos_id || ""} disabled className="h-11 rounded-xl bg-gray-50 text-gray-500" /></div>
                            <div><Label className="form-label">POS Name</Label><Input value={user?.pos_name || "MyGenie"} disabled className="h-11 rounded-xl bg-gray-50 text-gray-500" /></div>
                        </div>
                        <div><Label className="form-label">Phone</Label><Input value={profile.phone} onChange={(e) => set("phone", e.target.value)} className="h-11 rounded-xl" data-testid="profile-phone-input" /></div>

                        <SectionHeader icon={Building2} title="Tax & Compliance" testId="profile-section-tax" />
                        <div><Label className="form-label">GSTIN</Label><Input value={profile.gstin} onChange={(e) => { set("gstin", e.target.value.toUpperCase()); clearError("gstin"); }} onBlur={handleGstinBlur} placeholder="e.g. 29ABCDE1234F1Z5" maxLength={15} className={`h-11 rounded-xl uppercase ${errors.gstin ? "border-red-400" : ""}`} data-testid="profile-gstin-input" /><FieldError error={errors.gstin} testId="profile-gstin-error" /></div>
                        <div><Label className="form-label">Legal Business Name</Label><Input value={profile.legal_name} onChange={(e) => set("legal_name", e.target.value)} placeholder="Legal entity name (if different)" className="h-11 rounded-xl" data-testid="profile-legal-name-input" /></div>
                        <div>
                            <Label className="form-label">State</Label>
                            <Select value={profile.state} onValueChange={(val) => set("state", val)}>
                                <SelectTrigger className="h-11 rounded-xl" data-testid="profile-state-select"><SelectValue placeholder="Select state (auto-filled from GSTIN)" /></SelectTrigger>
                                <SelectContent>{INDIAN_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>

                        <SectionHeader icon={MapPin} title="Address" testId="profile-section-address" />
                        <div><Label className="form-label">Address Line 1</Label><Input value={profile.address_line1} onChange={(e) => set("address_line1", e.target.value)} placeholder="Street, building, shop #" className="h-11 rounded-xl" data-testid="profile-address-line1-input" /></div>
                        <div><Label className="form-label">Address Line 2</Label><Input value={profile.address_line2} onChange={(e) => set("address_line2", e.target.value)} placeholder="Area, landmark (optional)" className="h-11 rounded-xl" data-testid="profile-address-line2-input" /></div>
                        <div className="grid grid-cols-2 gap-3">
                            <div><Label className="form-label">City</Label><Input value={profile.city} onChange={(e) => set("city", e.target.value)} placeholder="City" className="h-11 rounded-xl" data-testid="profile-city-input" /></div>
                            <div><Label className="form-label">Pincode</Label><Input value={profile.pincode} onChange={(e) => { set("pincode", e.target.value); clearError("pincode"); }} onBlur={() => validateField("pincode", profile.pincode)} placeholder="e.g. 560001" maxLength={6} className={`h-11 rounded-xl ${errors.pincode ? "border-red-400" : ""}`} data-testid="profile-pincode-input" /><FieldError error={errors.pincode} testId="profile-pincode-error" /></div>
                        </div>

                        <SectionHeader icon={ShieldCheck} title="Additional Compliance" testId="profile-section-compliance" />
                        <div className="grid grid-cols-2 gap-3">
                            <div><Label className="form-label">FSSAI License #</Label><Input value={profile.fssai_license} onChange={(e) => { set("fssai_license", e.target.value); clearError("fssai_license"); }} onBlur={() => validateField("fssai_license", profile.fssai_license)} placeholder="14-digit number" maxLength={14} className={`h-11 rounded-xl ${errors.fssai_license ? "border-red-400" : ""}`} data-testid="profile-fssai-input" /><FieldError error={errors.fssai_license} testId="profile-fssai-error" /></div>
                            <div><Label className="form-label">PAN</Label><Input value={profile.pan} onChange={(e) => { set("pan", e.target.value.toUpperCase()); clearError("pan"); }} onBlur={() => validateField("pan", profile.pan)} placeholder="e.g. ABCDE1234F" maxLength={10} className={`h-11 rounded-xl uppercase ${errors.pan ? "border-red-400" : ""}`} data-testid="profile-pan-input" /><FieldError error={errors.pan} testId="profile-pan-error" /></div>
                        </div>
                        <div><Label className="form-label">VAT Registration Number</Label><Input value={profile.vat_number} onChange={(e) => set("vat_number", e.target.value)} placeholder="VAT registration number" className="h-11 rounded-xl" data-testid="profile-vat-input" /></div>

                        <Button onClick={handleSaveProfile} disabled={savingProfile} className="w-full h-12 rounded-xl bg-[#F26B33] hover:bg-[#D85A2A] text-white mt-4" data-testid="save-profile-btn">
                            {savingProfile ? "Saving..." : "Save Profile"}
                        </Button>
                    </CardContent>
                </Card>

                {/* ===== Card 2: Bill / Invoice Settings ===== */}
                <Card className="rounded-xl border-0 shadow-sm" data-testid="bill-settings-card">
                    <CardContent className="p-4 space-y-3">
                        <div className="flex items-start gap-3 pb-2">
                            <div className="w-10 h-10 rounded-full bg-[#F26B33]/10 flex items-center justify-center shrink-0"><Receipt className="w-5 h-5 text-[#F26B33]" /></div>
                            <div><p className="font-medium text-[#2B2B2B]">Bill / Invoice Settings</p><p className="text-xs text-[#52525B] mt-0.5">Customize how your invoices look to customers</p></div>
                        </div>

                        {/* Branding */}
                        <SectionHeader icon={Palette} title="Branding" testId="bill-section-branding" />
                        <div>
                            <Label className="form-label">Bill Logo</Label>
                            <div className="flex items-center gap-3 mt-1">
                                {logoPreviewUrl ? (
                                    <img src={logoPreviewUrl} alt="Logo" className="w-14 h-14 rounded-lg object-contain border border-gray-200 bg-white" data-testid="bill-logo-preview" />
                                ) : (
                                    <div className="w-14 h-14 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50"><Image className="w-5 h-5 text-gray-400" /></div>
                                )}
                                <div className="flex-1 space-y-1.5">
                                    <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleLogoUpload} data-testid="bill-logo-file-input" />
                                    <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo} data-testid="bill-logo-upload-btn">
                                        <Upload className="w-3 h-3 mr-1" /> {uploadingLogo ? "Uploading..." : "Upload Image"}
                                    </Button>
                                    <Input value={bs.bill_logo_url} onChange={(e) => setB("bill_logo_url", e.target.value)} placeholder="Or paste logo URL..." className="h-8 rounded-lg text-xs" data-testid="bill-logo-url-input" />
                                </div>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div><Label className="form-label">Invoice Prefix</Label><Input value={bs.invoice_prefix} onChange={(e) => setB("invoice_prefix", e.target.value.toUpperCase())} placeholder={user?.restaurant_name?.substring(0,2)?.toUpperCase() || "INV"} maxLength={5} className="h-11 rounded-xl uppercase" data-testid="bill-invoice-prefix" /></div>
                            <div><Label className="form-label">Tagline</Label><Input value={bs.tagline} onChange={(e) => setB("tagline", e.target.value)} placeholder="e.g. Since 2018" maxLength={120} className="h-11 rounded-xl" data-testid="bill-tagline" /></div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label className="form-label">Header Color</Label>
                                <div className="flex items-center gap-2">
                                    <input type="color" value={bs.header_color} onChange={(e) => setB("header_color", e.target.value)} className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5" data-testid="bill-header-color" />
                                    <Input value={bs.header_color} onChange={(e) => setB("header_color", e.target.value)} className="h-10 rounded-lg text-xs font-mono flex-1" />
                                </div>
                            </div>
                            <div>
                                <Label className="form-label">Accent Color</Label>
                                <div className="flex items-center gap-2">
                                    <input type="color" value={bs.accent_color} onChange={(e) => setB("accent_color", e.target.value)} className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5" data-testid="bill-accent-color" />
                                    <Input value={bs.accent_color} onChange={(e) => setB("accent_color", e.target.value)} className="h-10 rounded-lg text-xs font-mono flex-1" />
                                </div>
                            </div>
                        </div>

                        {/* Display Options */}
                        <SectionHeader icon={Receipt} title="Display Options" testId="bill-section-display" />
                        <div className="space-y-1 bg-gray-50 rounded-xl p-3">
                            <ToggleRow label="Show GSTIN on Invoice" checked={bs.show_gstin} onChange={(v) => setB("show_gstin", v)} testId="bill-toggle-gstin" />
                            <ToggleRow label="Show FSSAI on Invoice" checked={bs.show_fssai} onChange={(v) => setB("show_fssai", v)} testId="bill-toggle-fssai" />
                            <ToggleRow label="Show SAC/HSN Code" checked={bs.show_sac_code} onChange={(v) => setB("show_sac_code", v)} testId="bill-toggle-sac" />
                            <ToggleRow label="Show Loyalty Rewards" checked={bs.show_loyalty_section} onChange={(v) => setB("show_loyalty_section", v)} testId="bill-toggle-loyalty" />
                            <ToggleRow label="Show Veg/Non-veg Dots" checked={bs.show_veg_dots} onChange={(v) => setB("show_veg_dots", v)} testId="bill-toggle-veg" />
                            <ToggleRow label="Show Amount in Words" checked={bs.show_amount_in_words} onChange={(v) => setB("show_amount_in_words", v)} testId="bill-toggle-words" />
                            <ToggleRow label="Show Customer GSTIN (B2B)" checked={bs.show_customer_gstin} onChange={(v) => setB("show_customer_gstin", v)} testId="bill-toggle-cust-gstin" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div><Label className="form-label">SAC Code</Label><Input value={bs.sac_code} onChange={(e) => setB("sac_code", e.target.value)} placeholder="e.g. 996331" maxLength={10} className="h-11 rounded-xl" data-testid="bill-sac-code" /></div>
                            <div>
                                <Label className="form-label">Currency Symbol</Label>
                                <Select value={bs.currency_symbol} onValueChange={(v) => setB("currency_symbol", v)}>
                                    <SelectTrigger className="h-11 rounded-xl" data-testid="bill-currency"><SelectValue /></SelectTrigger>
                                    <SelectContent>{CURRENCY_OPTIONS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div>
                            <Label className="form-label">Date Format</Label>
                            <Select value={bs.date_format} onValueChange={(v) => setB("date_format", v)}>
                                <SelectTrigger className="h-11 rounded-xl" data-testid="bill-date-format"><SelectValue /></SelectTrigger>
                                <SelectContent>{DATE_FORMAT_OPTIONS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>

                        {/* Footer */}
                        <SectionHeader icon={Receipt} title="Footer & Social" testId="bill-section-footer" />
                        <div><Label className="form-label">Thank You Message</Label><Input value={bs.footer_message} onChange={(e) => setB("footer_message", e.target.value)} placeholder="Thank you for dining with us!" className="h-11 rounded-xl" data-testid="bill-footer-message" /></div>
                        <div><Label className="form-label">Contact Info</Label><Input value={bs.footer_contact} onChange={(e) => setB("footer_contact", e.target.value)} placeholder={user?.phone || "Phone number"} className="h-11 rounded-xl" data-testid="bill-footer-contact" /></div>
                        <div><Label className="form-label">Terms & Conditions</Label><textarea value={bs.terms_and_conditions} onChange={(e) => setB("terms_and_conditions", e.target.value)} placeholder="Optional fine print..." rows={2} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:border-[#F26B33]" data-testid="bill-terms" /></div>
                        <div className="grid grid-cols-2 gap-3">
                            <div><Label className="form-label">Instagram</Label><Input value={bs.social_instagram} onChange={(e) => setB("social_instagram", e.target.value)} placeholder="@username" className="h-11 rounded-xl" data-testid="bill-instagram" /></div>
                            <div><Label className="form-label">Google Review Link</Label><Input value={bs.social_google_review} onChange={(e) => setB("social_google_review", e.target.value)} placeholder="https://g.page/..." className="h-11 rounded-xl" data-testid="bill-google-review" /></div>
                        </div>

                        <Button onClick={handleSaveBillSettings} disabled={savingBill} className="w-full h-12 rounded-xl bg-[#F26B33] hover:bg-[#D85A2A] text-white mt-4" data-testid="save-bill-settings-btn">
                            {savingBill ? "Saving..." : "Save Bill Settings"}
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </ResponsiveLayout>
    );
}
