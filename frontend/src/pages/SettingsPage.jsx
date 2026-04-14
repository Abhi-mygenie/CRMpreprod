import { useState, useEffect } from "react";
import { toast } from "sonner";
import { MessageSquare } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ResponsiveLayout } from "@/components/ResponsiveLayout";

export default function SettingsPage() {
    const { api } = useAuth();
    const [whatsappApiKey, setWhatsappApiKey] = useState("");
    const [brandNumber, setBrandNumber] = useState("");
    const [metaWabaId, setMetaWabaId] = useState("");
    const [metaAccessToken, setMetaAccessToken] = useState("");
    const [savingApiKey, setSavingApiKey] = useState(false);

    useEffect(() => {
        const fetchWhatsAppConfig = async () => {
            try {
                const res = await api.get("/whatsapp/api-key");
                setWhatsappApiKey(res.data.authkey_api_key || "");
                setBrandNumber(res.data.brand_number || "");
                setMetaWabaId(res.data.meta_waba_id || "");
                setMetaAccessToken(res.data.meta_access_token || "");
            } catch (_) {}
        };
        fetchWhatsAppConfig();
    }, []);

    const handleSaveApiKey = async () => {
        setSavingApiKey(true);
        try {
            await api.put("/whatsapp/api-key", {
                authkey_api_key: whatsappApiKey,
                brand_number: brandNumber,
                meta_waba_id: metaWabaId,
                meta_access_token: metaAccessToken
            });
            toast.success("WhatsApp settings saved!");
        } catch (_) {
            toast.error("Failed to save settings");
        } finally {
            setSavingApiKey(false);
        }
    };

    return (
        <ResponsiveLayout>
            <div className="p-4 lg:p-6 xl:p-8 max-w-3xl mx-auto">
                <h1 className="text-2xl font-bold text-[#2B2B2B] mb-6 font-heading" data-testid="settings-title">Settings</h1>

                <Card className="rounded-xl border-0 shadow-sm" data-testid="whatsapp-settings-card">
                    <CardContent className="p-4 space-y-4">
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-full bg-[#25D366]/10 flex items-center justify-center flex-shrink-0">
                                <MessageSquare className="w-5 h-5 text-[#25D366]" />
                            </div>
                            <div>
                                <p className="font-medium text-[#2B2B2B]">WhatsApp Configuration</p>
                                <p className="text-xs text-[#52525B] mt-1">Configure your WhatsApp Business API credentials</p>
                            </div>
                        </div>
                        <div className="space-y-3">
                            <div>
                                <Label className="form-label">AuthKey API Key</Label>
                                <Input type="password" value={whatsappApiKey} onChange={(e) => setWhatsappApiKey(e.target.value)} placeholder="Enter your AuthKey.io API key" className="h-12 rounded-xl font-mono" data-testid="whatsapp-api-key-input" />
                            </div>
                            <div>
                                <Label className="form-label">Brand Number</Label>
                                <Input value={brandNumber} onChange={(e) => setBrandNumber(e.target.value)} placeholder="e.g., 917666859544" className="h-12 rounded-xl font-mono" data-testid="brand-number-input" />
                                <p className="text-xs text-gray-400 mt-1">WhatsApp Business phone with country code (no +)</p>
                            </div>
                            <div>
                                <Label className="form-label">Meta WABA ID</Label>
                                <Input value={metaWabaId} onChange={(e) => setMetaWabaId(e.target.value)} placeholder="e.g., 1427078455442831" className="h-12 rounded-xl font-mono" data-testid="meta-waba-id-input" />
                                <p className="text-xs text-gray-400 mt-1">WhatsApp Business Account ID from Meta</p>
                            </div>
                            <div>
                                <Label className="form-label">Meta Access Token</Label>
                                <Input type="password" value={metaAccessToken} onChange={(e) => setMetaAccessToken(e.target.value)} placeholder="Enter Meta access token" className="h-12 rounded-xl font-mono" data-testid="meta-access-token-input" />
                                <p className="text-xs text-gray-400 mt-1">Permanent access token from Meta Business</p>
                            </div>
                        </div>
                        <Button onClick={handleSaveApiKey} disabled={savingApiKey} className="w-full h-12 rounded-xl bg-[#25D366] hover:bg-[#1da851] text-white" data-testid="save-whatsapp-settings-btn">
                            {savingApiKey ? "Saving..." : "Save WhatsApp Settings"}
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </ResponsiveLayout>
    );
}
