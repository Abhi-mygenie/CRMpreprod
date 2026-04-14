import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function RegisterPage() {
    const [formData, setFormData] = useState({
        email: "",
        password: "",
        restaurant_name: "",
        phone: ""
    });
    const [isLoading, setIsLoading] = useState(false);
    const { register } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            await register(formData);
            toast.success("Account created successfully!");
            navigate("/");
        } catch (err) {
            toast.error(err.response?.data?.detail || "Registration failed");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#F9F9F7] flex flex-col justify-center p-6">
            <div className="max-w-sm mx-auto w-full">
                <div className="text-center mb-8">
                    <img 
                        src="https://customer-assets.emergentagent.com/job_dine-points-app/artifacts/acdjlx1x_mygenie_logo.svg" 
                        alt="MyGenie Logo" 
                        className="h-16 mx-auto mb-4"
                    />
                    <h1 className="text-3xl font-bold text-[#1A1A1A] font-['Montserrat']">Join MyGenie</h1>
                    <p className="text-[#52525B] mt-2">Start your loyalty program today</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <Label htmlFor="restaurant" className="form-label">Restaurant Name</Label>
                        <Input
                            id="restaurant"
                            value={formData.restaurant_name}
                            onChange={(e) => setFormData({...formData, restaurant_name: e.target.value})}
                            placeholder="Your Restaurant"
                            className="h-12 rounded-xl"
                            required
                            data-testid="register-restaurant-input"
                        />
                    </div>
                    <div>
                        <Label htmlFor="phone" className="form-label">Phone Number</Label>
                        <Input
                            id="phone"
                            type="tel"
                            value={formData.phone}
                            onChange={(e) => setFormData({...formData, phone: e.target.value})}
                            placeholder="9876543210"
                            className="h-12 rounded-xl"
                            required
                            data-testid="register-phone-input"
                        />
                    </div>
                    <div>
                        <Label htmlFor="email" className="form-label">Email</Label>
                        <Input
                            id="email"
                            type="email"
                            value={formData.email}
                            onChange={(e) => setFormData({...formData, email: e.target.value})}
                            placeholder="owner@restaurant.com"
                            className="h-12 rounded-xl"
                            required
                            data-testid="register-email-input"
                        />
                    </div>
                    <div>
                        <Label htmlFor="password" className="form-label">Password</Label>
                        <Input
                            id="password"
                            type="password"
                            value={formData.password}
                            onChange={(e) => setFormData({...formData, password: e.target.value})}
                            placeholder="Create a password"
                            className="h-12 rounded-xl"
                            required
                            data-testid="register-password-input"
                        />
                    </div>
                    <Button 
                        type="submit" 
                        className="w-full h-12 rounded-full bg-[#F26B33] hover:bg-[#D85A2A] text-white font-semibold active-scale"
                        disabled={isLoading}
                        data-testid="register-submit-btn"
                    >
                        {isLoading ? "Creating account..." : "Create Account"}
                    </Button>
                </form>

                <p className="text-center mt-6 text-[#52525B]">
                    Already have an account?{" "}
                    <button 
                        onClick={() => navigate("/login")} 
                        className="text-[#F26B33] font-semibold"
                        data-testid="goto-login-btn"
                    >
                        Sign in
                    </button>
                </p>
            </div>
        </div>
    );
}
