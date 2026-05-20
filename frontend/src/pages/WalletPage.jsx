import { useState, useEffect } from "react";
import { Wallet } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { ResponsiveLayout } from "@/components/ResponsiveLayout";

export default function WalletPage() {
    const { api } = useAuth();
    const [walletEnabled, setWalletEnabled] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchWalletStatus = async () => {
            try {
                const res = await api.get("/loyalty/settings");
                setWalletEnabled(res.data?.wallet_enabled || false);
            } catch (_) {}
            finally { setLoading(false); }
        };
        fetchWalletStatus();
    }, []);

    if (loading) {
        return (
            <ResponsiveLayout>
                <div className="p-4 lg:p-6 xl:p-8 max-w-3xl mx-auto">
                    <div className="animate-pulse h-48 bg-gray-200 rounded-xl"></div>
                </div>
            </ResponsiveLayout>
        );
    }

    return (
        <ResponsiveLayout>
            <div className="p-4 lg:p-6 xl:p-8 max-w-3xl mx-auto">
                <h1 className="text-2xl font-bold text-[#2B2B2B] mb-6 font-heading" data-testid="wallet-title">Wallet</h1>

                {walletEnabled ? (
                    <Card className="rounded-xl border-0 shadow-sm" data-testid="wallet-card">
                        <CardContent className="p-6 text-center">
                            <Wallet className="w-16 h-16 mx-auto text-purple-300 mb-4" />
                            <p className="font-semibold text-[#1A1A1A]">Wallet Features Coming Soon</p>
                            <p className="text-sm text-[#52525B] mt-2">Manage customer wallet deposits, balance tracking, and usage history.</p>
                        </CardContent>
                    </Card>
                ) : (
                    <Card className="rounded-xl border-0 shadow-sm" data-testid="wallet-disabled-card">
                        <CardContent className="p-6 text-center">
                            <Wallet className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                            <p className="text-[#52525B] mb-2">Wallet is disabled</p>
                            <p className="text-xs text-[#A1A1AA]">Enable wallet in Loyalty settings to allow customer deposits and payments</p>
                        </CardContent>
                    </Card>
                )}
            </div>
        </ResponsiveLayout>
    );
}
