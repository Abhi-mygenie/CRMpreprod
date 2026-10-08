import { useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Phone, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { API } from "@/lib/constants";

export default function CustomerRegistrationPage() {
    const { restaurantId } = useParams();
    const [formData, setFormData] = useState({ name: "", phone: "", email: "" });
    const [restaurantName, setRestaurantName] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await axios.post(`${API}/qr/register/${restaurantId}`, formData);
            setSuccess(true);
            toast.success("Registration successful!");
        } catch (err) {
            toast.error(err.response?.data?.detail || "Registration failed");
        } finally {
            setSubmitting(false);
        }
    };

    if (success) {
        return (
            <div className="min-h-screen bg-[#F9F9F7] flex flex-col items-center justify-center p-6">
                <div className="w-20 h-20 bg-[#329937] rounded-full flex items-center justify-center mb-6">
                    <Check className="w-10 h-10 text-white" />
                </div>
                <h1 className="text-2xl font-bold text-[#1A1A1A] text-center font-['Montserrat']">Welcome!</h1>
                <p className="text-[#52525B] text-center mt-2">You're now part of our loyalty program.</p>
                <p className="text-[#52525B] text-center mt-1">Earn points on every visit!</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#F9F9F7] flex flex-col justify-center p-6">
            <div className="max-w-sm mx-auto w-full">
                <div className="text-center mb-8">
                    <img 
                        src="https://customer-assets.emergentagent.com/job_dine-points-app/artifacts/acdjlx1x_mygenie_logo.svg" 
                        alt="MyGenie Logo" 
                        className="h-16 mx-auto mb-4"
                    />
                    <h1 className="text-2xl font-bold text-[#1A1A1A] font-['Montserrat']">Join Our Loyalty Program</h1>
                    <p className="text-[#52525B] mt-2">Earn points on every purchase</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <Label className="form-label">Your Name *</Label>
                        <Input
                            value={formData.name}
                            onChange={(e) => setFormData({...formData, name: e.target.value})}
                            placeholder="Enter your name"
                            className="h-12 rounded-xl"
                            required
                            data-testid="public-reg-name"
                        />
                    </div>
                    <div>
                        <Label className="form-label">Phone Number *</Label>
                        <Input
                            type="tel"
                            value={formData.phone}
                            onChange={(e) => setFormData({...formData, phone: e.target.value})}
                            placeholder="9876543210"
                            className="h-12 rounded-xl"
                            required
                            data-testid="public-reg-phone"
                        />
                    </div>
                    <div>
                        <Label className="form-label">Email (optional)</Label>
                        <Input
                            type="email"
                            value={formData.email}
                            onChange={(e) => setFormData({...formData, email: e.target.value})}
                            placeholder="your@email.com"
                            className="h-12 rounded-xl"
                            data-testid="public-reg-email"
                        />
                    </div>
                    <Button 
                        type="submit" 
                        className="w-full h-12 rounded-full bg-[#F26B33] hover:bg-[#D85A2A] text-white font-semibold active-scale"
                        disabled={submitting}
                        data-testid="public-reg-submit"
                    >
                        {submitting ? "Joining..." : "Join Now"}
                    </Button>
                </form>
            </div>
        </div>
    );
}
