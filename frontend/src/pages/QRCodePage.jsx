import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Copy, Download, Check } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import { ResponsiveLayout } from "@/components/ResponsiveLayout";


export default function QRCodePage() {
    const { api, user } = useAuth();
    const [qrData, setQrData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        const fetchQR = async () => {
            try {
                const res = await api.get("/qr/generate");
                setQrData(res.data);
            } catch (err) {
                toast.error("Failed to generate QR code");
            } finally {
                setLoading(false);
            }
        };
        fetchQR();
    }, []);

    const copyLink = () => {
        navigator.clipboard.writeText(qrData.registration_url);
        setCopied(true);
        toast.success("Link copied!");
        setTimeout(() => setCopied(false), 2000);
    };

    const downloadQR = () => {
        const link = document.createElement("a");
        link.download = `${user?.restaurant_name}-qr.png`;
        link.href = qrData.qr_code;
        link.click();
        toast.success("QR Code downloaded!");
    };

    return (

        <ResponsiveLayout>
            <div className="p-4 lg:p-6 xl:p-8 max-w-[1600px] mx-auto">

        
                <h1 className="text-2xl font-bold text-[#1A1A1A] mb-2 font-['Montserrat']" data-testid="qr-page-title">
                    Customer QR Code
                </h1>
                <p className="text-[#52525B] mb-6">Let customers scan to join your loyalty program</p>

                {loading ? (
                    <div className="qr-container animate-pulse flex items-center justify-center" style={{height: 300}}>
                        <div className="w-48 h-48 bg-gray-200 rounded-xl"></div>
                    </div>
                ) : qrData ? (
                    <div className="space-y-4">
                        <div className="qr-container text-center" data-testid="qr-code-container">
                            <p className="text-lg font-semibold text-[#1A1A1A] mb-4 font-['Montserrat']">{user?.restaurant_name}</p>
                            <img 
                                src={qrData.qr_code} 
                                alt="QR Code" 
                                className="mx-auto w-48 h-48"
                                data-testid="qr-code-image"
                            />
                            <p className="text-sm text-[#52525B] mt-4">Scan to join our loyalty program</p>
                        </div>

                        <div className="flex gap-3">
                            <Button 
                                onClick={copyLink}
                                variant="outline"
                                className="flex-1 h-12 rounded-full"
                                data-testid="copy-qr-link-btn"
                            >
                                {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                                {copied ? "Copied!" : "Copy Link"}
                            </Button>
                            <Button 
                                onClick={downloadQR}
                                className="flex-1 h-12 bg-[#F26B33] hover:bg-[#D85A2A] rounded-full"
                                data-testid="download-qr-btn"
                            >
                                <Download className="w-4 h-4 mr-2" /> Download
                            </Button>
                        </div>

                        <Card className="rounded-xl border-0 shadow-sm bg-[#FEF3C7]">
                            <CardContent className="p-4">
                                <p className="text-sm text-[#92400E]">
                                    <strong>Tip:</strong> Print this QR code and place it at your billing counter for easy customer sign-ups!
                                </p>
                            </CardContent>
                        </Card>
                    </div>
                ) : (
                    <div className="text-center py-8">
                        <p className="text-[#52525B]">Failed to generate QR code</p>
                    </div>
                )}
            </div>

        </ResponsiveLayout>

    );
}
