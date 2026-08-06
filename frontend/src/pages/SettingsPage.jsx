import { useState, useEffect } from "react";
import { toast } from "sonner";
import { MessageSquare, Eye, EyeOff, Link2, Copy, RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ResponsiveLayout } from "@/components/ResponsiveLayout";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export default function SettingsPage() {
    const { api } = useAuth();
    const [whatsappApiKey, setWhatsappApiKey] = useState("");
    const [brandNumber, setBrandNumber] = useState("");
    const [metaWabaId, setMetaWabaId] = useState("");
    const [metaAccessToken, setMetaAccessToken] = useState("");
    const [metaAppId, setMetaAppId] = useState("");
    const [savingApiKey, setSavingApiKey] = useState(false);
    const [showAuthKey, setShowAuthKey] = useState(false);
    const [showMetaToken, setShowMetaToken] = useState(false);
    const [posApiKey, setPosApiKey] = useState("");
    const [showPosKey, setShowPosKey] = useState(false);
    const [regenerating, setRegenerating] = useState(false);

    useEffect(() => {
        const fetchWhatsAppConfig = async () => {
            try {
                const res = await api.get("/whatsapp/api-key");
                setWhatsappApiKey(res.data.authkey_api_key || "");
                setBrandNumber(res.data.brand_number || "");
                setMetaWabaId(res.data.meta_waba_id || "");
                setMetaAccessToken(res.data.meta_access_token || "");
                setMetaAppId(res.data.meta_app_id || "");
            } catch (_) {}
        };
        fetchWhatsAppConfig();
        const fetchPosKey = async () => {
            try {
                const res = await api.get("/pos/api-key");
                setPosApiKey(res.data.api_key || "");
            } catch (_) {}
        };
        fetchPosKey();
    }, []);

    const handleSaveApiKey = async () => {
        setSavingApiKey(true);
        try {
            await api.put("/whatsapp/api-key", {
                authkey_api_key: whatsappApiKey,
                brand_number: brandNumber,
                meta_waba_id: metaWabaId,
                meta_access_token: metaAccessToken,
                meta_app_id: metaAppId
            });
            toast.success("WhatsApp settings saved!");
        } catch (_) {
            toast.error("Failed to save settings");
        } finally {
            setSavingApiKey(false);
        }
    };

    const handleCopyPosKey = () => {
        navigator.clipboard.writeText(posApiKey);
        toast.success("API key copied to clipboard");
    };

    const handleRegenerate = async () => {
        setRegenerating(true);
        try {
            const res = await api.post("/pos/api-key/regenerate");
            setPosApiKey(res.data.api_key || "");
            if (res.data.pushed_to_pos) {
                toast.success("New key generated and pushed to POS");
            } else {
                toast.success("New key generated. POS push will retry on next login.");
            }
        } catch (_) {
            toast.error("Failed to regenerate key");
        } finally {
            setRegenerating(false);
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
                                <div className="relative">
                                    <Input type={showAuthKey ? "text" : "password"} value={whatsappApiKey} onChange={(e) => setWhatsappApiKey(e.target.value)} placeholder="Enter your AuthKey.io API key" className="h-12 rounded-xl font-mono pr-12" data-testid="whatsapp-api-key-input" />
                                    <button type="button" onClick={() => setShowAuthKey((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#52525B] hover:text-[#2B2B2B] transition-colors" aria-label={showAuthKey ? "Hide AuthKey API Key" : "Show AuthKey API Key"} data-testid="toggle-authkey-visibility-btn">
                                        {showAuthKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
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
                                <div className="relative">
                                    <Input type={showMetaToken ? "text" : "password"} value={metaAccessToken} onChange={(e) => setMetaAccessToken(e.target.value)} placeholder="Enter Meta access token" className="h-12 rounded-xl font-mono pr-12" data-testid="meta-access-token-input" />
                                    <button type="button" onClick={() => setShowMetaToken((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#52525B] hover:text-[#2B2B2B] transition-colors" aria-label={showMetaToken ? "Hide Meta Access Token" : "Show Meta Access Token"} data-testid="toggle-meta-token-visibility-btn">
                                        {showMetaToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                                <p className="text-xs text-gray-400 mt-1">Permanent access token from Meta Business</p>
                            </div>
                            <div>
                                <Label className="form-label">Meta App ID</Label>
                                <Input value={metaAppId} onChange={(e) => setMetaAppId(e.target.value)} placeholder="e.g., 1234567890123456" className="h-12 rounded-xl font-mono" data-testid="meta-app-id-input" />
                                <p className="text-xs text-gray-400 mt-1">Meta developer App ID that issues your access token (required for template media uploads — CR-036)</p>
                            </div>
                        </div>
                        <Button onClick={handleSaveApiKey} disabled={savingApiKey} className="w-full h-12 rounded-xl bg-[#25D366] hover:bg-[#1da851] text-white" data-testid="save-whatsapp-settings-btn">
                            {savingApiKey ? "Saving..." : "Save WhatsApp Settings"}
                        </Button>
                    </CardContent>
                </Card>

                <Card className="rounded-xl border-0 shadow-sm mt-6" data-testid="pos-integration-card">
                    <CardContent className="p-4 space-y-4">
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-full bg-[#F26B33]/10 flex items-center justify-center flex-shrink-0">
                                <Link2 className="w-5 h-5 text-[#F26B33]" />
                            </div>
                            <div>
                                <p className="font-medium text-[#2B2B2B]">POS Integration</p>
                                <p className="text-xs text-[#52525B] mt-1">Share this key with your POS team so they can send orders and access CRM</p>
                            </div>
                        </div>
                        <div className="space-y-3">
                            <div>
                                <Label className="form-label">CRM API Key</Label>
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <Input
                                            type={showPosKey ? "text" : "password"}
                                            value={posApiKey}
                                            readOnly
                                            className="h-12 rounded-xl font-mono pr-12 bg-gray-50"
                                            data-testid="pos-api-key-input"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPosKey((v) => !v)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#52525B] hover:text-[#2B2B2B] transition-colors"
                                            data-testid="toggle-pos-key-visibility-btn"
                                        >
                                            {showPosKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                    <Button
                                        variant="outline"
                                        onClick={handleCopyPosKey}
                                        className="h-12 rounded-xl px-4"
                                        data-testid="copy-pos-key-btn"
                                    >
                                        <Copy className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button
                                    variant="outline"
                                    className="w-full h-12 rounded-xl border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                                    disabled={regenerating}
                                    data-testid="regenerate-pos-key-btn"
                                >
                                    <RefreshCw className={`w-4 h-4 mr-2 ${regenerating ? "animate-spin" : ""}`} />
                                    {regenerating ? "Regenerating..." : "Regenerate Key"}
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Regenerate API Key?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        The old key will stop working immediately. Your POS system will lose access until the new key is shared. The new key will be pushed to POS automatically.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel data-testid="cancel-regenerate-btn">Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                        onClick={handleRegenerate}
                                        className="bg-red-600 hover:bg-red-700"
                                        data-testid="confirm-regenerate-btn"
                                    >
                                        Regenerate
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </CardContent>
                </Card>
            </div>
        </ResponsiveLayout>
    );
}
