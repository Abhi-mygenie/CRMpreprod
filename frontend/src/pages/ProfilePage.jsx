import { useState, useEffect } from "react";
import { toast } from "sonner";
import { User } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ResponsiveLayout } from "@/components/ResponsiveLayout";

export default function ProfilePage() {
    const { user, api } = useAuth();
    const [profile, setProfile] = useState({ restaurant_name: "", phone: "", address: "" });
    const [savingProfile, setSavingProfile] = useState(false);

    useEffect(() => {
        setProfile({ restaurant_name: user?.restaurant_name || "", phone: user?.phone || "", address: user?.address || "" });
    }, [user]);

    const handleSaveProfile = async () => {
        setSavingProfile(true);
        try {
            await api.put("/auth/profile", profile);
            toast.success("Profile updated!");
        } catch (_) {
            toast.error("Failed to update profile");
        } finally {
            setSavingProfile(false);
        }
    };

    return (
        <ResponsiveLayout>
            <div className="p-4 lg:p-6 xl:p-8 max-w-3xl mx-auto">
                <h1 className="text-2xl font-bold text-[#2B2B2B] mb-6 font-heading" data-testid="profile-title">Profile</h1>

                <Card className="rounded-xl border-0 shadow-sm" data-testid="profile-card">
                    <CardContent className="p-4 space-y-4">
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-full bg-[#F26B33]/10 flex items-center justify-center flex-shrink-0">
                                <User className="w-5 h-5 text-[#F26B33]" />
                            </div>
                            <div>
                                <p className="font-medium text-[#2B2B2B]">Business Profile</p>
                                <p className="text-xs text-[#52525B] mt-1">Manage your business details</p>
                            </div>
                        </div>
                        <div className="space-y-3">
                            <div>
                                <Label className="form-label">Business Name</Label>
                                <Input value={user?.restaurant_name || ""} disabled className="h-12 rounded-xl bg-gray-50 text-gray-500" />
                            </div>
                            <div>
                                <Label className="form-label">Email</Label>
                                <Input value={user?.email || ""} disabled className="h-12 rounded-xl bg-gray-50 text-gray-500" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label className="form-label">POS ID</Label>
                                    <Input value={user?.pos_id || ""} disabled className="h-12 rounded-xl bg-gray-50 text-gray-500" />
                                </div>
                                <div>
                                    <Label className="form-label">POS Name</Label>
                                    <Input value={user?.pos_name || "MyGenie"} disabled className="h-12 rounded-xl bg-gray-50 text-gray-500" />
                                </div>
                            </div>
                            <div>
                                <Label className="form-label">Phone</Label>
                                <Input value={profile.phone} onChange={(e) => setProfile(p => ({...p, phone: e.target.value}))} className="h-12 rounded-xl" data-testid="profile-phone-input" />
                            </div>
                            <div>
                                <Label className="form-label">Address</Label>
                                <Input value={profile.address} onChange={(e) => setProfile(p => ({...p, address: e.target.value}))} placeholder="Enter business address" className="h-12 rounded-xl" data-testid="profile-address-input" />
                            </div>
                        </div>
                        <Button onClick={handleSaveProfile} disabled={savingProfile} className="w-full h-12 rounded-xl bg-[#F26B33] hover:bg-[#D85A2A] text-white" data-testid="save-profile-btn">
                            {savingProfile ? "Saving..." : "Save Profile"}
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </ResponsiveLayout>
    );
}
