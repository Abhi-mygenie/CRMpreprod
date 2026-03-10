import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Eye, EyeOff, X, ArrowLeft } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import axios from "axios";

const API_URL = process.env.REACT_APP_BACKEND_URL;

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const { login, setUserAndToken } = useAuth();
    const navigate = useNavigate();

    // Forgot Password State
    const [showForgotPassword, setShowForgotPassword] = useState(false);
    const [forgotStep, setForgotStep] = useState(1); // 1: email, 2: otp, 3: new password
    const [forgotEmail, setForgotEmail] = useState("");
    const [otp, setOtp] = useState("");
    const [displayOtp, setDisplayOtp] = useState(""); // For testing mode
    const [resetToken, setResetToken] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmNewPassword, setConfirmNewPassword] = useState("");
    const [forgotLoading, setForgotLoading] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);

    // Load saved credentials on mount
    useEffect(() => {
        const savedEmail = localStorage.getItem("remembered_email");
        const savedPassword = localStorage.getItem("remembered_password");
        if (savedEmail && savedPassword) {
            setEmail(savedEmail);
            setPassword(savedPassword);
            setRememberMe(true);
        }
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            if (rememberMe) {
                localStorage.setItem("remembered_email", email);
                localStorage.setItem("remembered_password", password);
            } else {
                localStorage.removeItem("remembered_email");
                localStorage.removeItem("remembered_password");
            }
            await login(email, password);
            toast.success("Welcome back!");
            navigate("/");
        } catch (err) {
            toast.error(err.response?.data?.detail || "Login failed");
        } finally {
            setIsLoading(false);
        }
    };

    // Forgot Password Handlers
    const handleRequestOtp = async () => {
        if (!forgotEmail) {
            toast.error("Please enter your email");
            return;
        }
        setForgotLoading(true);
        try {
            const res = await axios.post(`${API_URL}/api/auth/forgot-password/request-otp`, {
                email: forgotEmail
            });
            toast.success("OTP sent!");
            // If OTP is returned (testing mode), display it
            if (res.data.otp) {
                setDisplayOtp(res.data.otp);
            }
            setForgotStep(2);
        } catch (err) {
            toast.error(err.response?.data?.detail || "Failed to send OTP");
        } finally {
            setForgotLoading(false);
        }
    };

    const handleVerifyOtp = async () => {
        if (!otp || otp.length < 6) {
            toast.error("Please enter the 6-digit OTP");
            return;
        }
        setForgotLoading(true);
        try {
            const res = await axios.post(`${API_URL}/api/auth/forgot-password/verify-otp`, {
                email: forgotEmail,
                otp: otp
            });
            toast.success("OTP verified!");
            setResetToken(res.data.reset_token);
            setForgotStep(3);
        } catch (err) {
            toast.error(err.response?.data?.detail || "Invalid OTP");
        } finally {
            setForgotLoading(false);
        }
    };

    const handleResetPassword = async () => {
        if (!newPassword || newPassword.length < 6) {
            toast.error("Password must be at least 6 characters");
            return;
        }
        if (newPassword !== confirmNewPassword) {
            toast.error("Passwords do not match");
            return;
        }
        setForgotLoading(true);
        try {
            const res = await axios.post(`${API_URL}/api/auth/forgot-password/reset`, {
                email: forgotEmail,
                reset_token: resetToken,
                new_password: newPassword
            });
            
            // Auto-login with returned token
            if (res.data.access_token && res.data.user) {
                setUserAndToken(res.data.user, res.data.access_token);
                toast.success("Password reset successfully! Welcome back!");
                closeForgotPassword();
                navigate("/");
            } else {
                toast.success("Password reset successfully! Please login.");
                closeForgotPassword();
            }
        } catch (err) {
            toast.error(err.response?.data?.detail || "Failed to reset password");
        } finally {
            setForgotLoading(false);
        }
    };

    const closeForgotPassword = () => {
        setShowForgotPassword(false);
        setForgotStep(1);
        setForgotEmail("");
        setOtp("");
        setDisplayOtp("");
        setResetToken("");
        setNewPassword("");
        setConfirmNewPassword("");
    };

    return (
        <div className="min-h-screen bg-[#F5F5F5] flex flex-col justify-center p-6">
            <div className="max-w-sm mx-auto w-full">
                <div className="text-center mb-8">
                    <img 
                        src="https://customer-assets.emergentagent.com/job_dine-points-app/artifacts/acdjlx1x_mygenie_logo.svg" 
                        alt="MyGenie Logo" 
                        className="h-20 mx-auto"
                    />
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <Label htmlFor="email" className="form-label font-body">Email</Label>
                        <Input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="owner@restaurant.com"
                            className="h-12 rounded-xl"
                            required
                            data-testid="login-email-input"
                        />
                    </div>
                    <div>
                        <Label htmlFor="password" className="form-label font-body">Password</Label>
                        <div className="relative">
                            <Input
                                id="password"
                                type={showPassword ? "text" : "password"}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Enter password"
                                className="h-12 rounded-xl pr-12"
                                required
                                data-testid="login-password-input"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-[#A1A1AA] hover:text-[#52525B] transition-colors"
                                data-testid="toggle-password-visibility"
                            >
                                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                        </div>
                    </div>
                    
                    <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={rememberMe}
                                onChange={(e) => setRememberMe(e.target.checked)}
                                className="w-4 h-4 rounded border-gray-300 text-[#F26B33] focus:ring-[#F26B33]"
                                data-testid="remember-me-checkbox"
                            />
                            <span className="text-sm text-[#52525B] font-body">Remember me</span>
                        </label>
                        <button 
                            type="button"
                            onClick={() => setShowForgotPassword(true)}
                            className="text-sm text-[#F26B33] font-medium hover:underline font-body"
                            data-testid="forgot-password-btn"
                        >
                            Forgot password?
                        </button>
                    </div>

                    <Button 
                        type="submit" 
                        className="w-full h-12 rounded-full bg-[#F26B33] hover:bg-[#D85A2A] text-white font-semibold active-scale font-body"
                        disabled={isLoading}
                        data-testid="login-submit-btn"
                    >
                        {isLoading ? "Signing in..." : "Sign In"}
                    </Button>
                    
                    <div className="relative my-4">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-gray-200"></div>
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="px-2 bg-[#F5F5F5] text-gray-500">or</span>
                        </div>
                    </div>
                    
                    <Button 
                        type="button"
                        onClick={async () => {
                            setIsLoading(true);
                            try {
                                const res = await axios.post(`${API_URL}/api/auth/demo-login`);
                                setUserAndToken(res.data.user, res.data.access_token);
                                toast.success("Demo login successful!");
                                navigate("/");
                            } catch (err) {
                                toast.error("Demo login failed");
                            } finally {
                                setIsLoading(false);
                            }
                        }}
                        className="w-full h-12 rounded-full bg-gray-600 hover:bg-gray-700 text-white font-semibold active-scale font-body"
                        disabled={isLoading}
                        data-testid="demo-login-btn"
                    >
                        Demo Login
                    </Button>
                </form>
            </div>

            {/* Forgot Password Modal */}
            {showForgotPassword && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-2">
                                {forgotStep > 1 && (
                                    <button 
                                        onClick={() => setForgotStep(forgotStep - 1)}
                                        className="p-1 hover:bg-gray-100 rounded-lg"
                                    >
                                        <ArrowLeft className="w-5 h-5 text-[#52525B]" />
                                    </button>
                                )}
                                <h2 className="text-xl font-bold text-[#2B2B2B] font-heading">
                                    {forgotStep === 1 && "Forgot Password"}
                                    {forgotStep === 2 && "Enter OTP"}
                                    {forgotStep === 3 && "New Password"}
                                </h2>
                            </div>
                            <button onClick={closeForgotPassword} className="p-1 hover:bg-gray-100 rounded-lg">
                                <X className="w-5 h-5 text-[#52525B]" />
                            </button>
                        </div>

                        {/* Step 1: Enter Email */}
                        {forgotStep === 1 && (
                            <div className="space-y-4">
                                <p className="text-sm text-[#52525B] font-body">
                                    Enter your email address and we'll send you an OTP to reset your password.
                                </p>
                                <div>
                                    <Label className="form-label font-body">Email</Label>
                                    <Input
                                        type="email"
                                        value={forgotEmail}
                                        onChange={(e) => setForgotEmail(e.target.value)}
                                        placeholder="owner@restaurant.com"
                                        className="h-12 rounded-xl"
                                        data-testid="forgot-email-input"
                                    />
                                </div>
                                <Button
                                    onClick={handleRequestOtp}
                                    disabled={forgotLoading}
                                    className="w-full h-12 rounded-full bg-[#F26B33] hover:bg-[#D85A2A] text-white font-semibold font-body"
                                    data-testid="request-otp-btn"
                                >
                                    {forgotLoading ? "Sending..." : "Send OTP"}
                                </Button>
                            </div>
                        )}

                        {/* Step 2: Enter OTP */}
                        {forgotStep === 2 && (
                            <div className="space-y-4">
                                <p className="text-sm text-[#52525B] font-body">
                                    Enter the 6-digit OTP sent to your phone.
                                </p>
                                
                                {/* Testing Mode - Show OTP */}
                                {displayOtp && (
                                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                                        <p className="text-xs text-amber-700 font-medium mb-1">Testing Mode (WhatsApp not configured)</p>
                                        <p className="text-2xl font-bold text-amber-800 tracking-widest text-center">{displayOtp}</p>
                                    </div>
                                )}
                                
                                <div>
                                    <Label className="form-label font-body">OTP</Label>
                                    <Input
                                        type="text"
                                        value={otp}
                                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                        placeholder="Enter 6-digit OTP"
                                        className="h-12 rounded-xl text-center text-xl tracking-widest"
                                        maxLength={6}
                                        data-testid="otp-input"
                                    />
                                </div>
                                <Button
                                    onClick={handleVerifyOtp}
                                    disabled={forgotLoading || otp.length < 6}
                                    className="w-full h-12 rounded-full bg-[#F26B33] hover:bg-[#D85A2A] text-white font-semibold font-body"
                                    data-testid="verify-otp-btn"
                                >
                                    {forgotLoading ? "Verifying..." : "Verify OTP"}
                                </Button>
                                <button
                                    onClick={handleRequestOtp}
                                    className="w-full text-sm text-[#F26B33] font-medium hover:underline font-body"
                                    disabled={forgotLoading}
                                >
                                    Resend OTP
                                </button>
                            </div>
                        )}

                        {/* Step 3: New Password */}
                        {forgotStep === 3 && (
                            <div className="space-y-4">
                                <p className="text-sm text-[#52525B] font-body">
                                    Enter your new password.
                                </p>
                                <div>
                                    <Label className="form-label font-body">New Password</Label>
                                    <div className="relative">
                                        <Input
                                            type={showNewPassword ? "text" : "password"}
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                            placeholder="Enter new password"
                                            className="h-12 rounded-xl pr-12"
                                            data-testid="new-password-input"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowNewPassword(!showNewPassword)}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-[#A1A1AA] hover:text-[#52525B]"
                                        >
                                            {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                        </button>
                                    </div>
                                </div>
                                <div>
                                    <Label className="form-label font-body">Confirm Password</Label>
                                    <Input
                                        type="password"
                                        value={confirmNewPassword}
                                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                                        placeholder="Confirm new password"
                                        className="h-12 rounded-xl"
                                        data-testid="confirm-new-password-input"
                                    />
                                </div>
                                <Button
                                    onClick={handleResetPassword}
                                    disabled={forgotLoading}
                                    className="w-full h-12 rounded-full bg-[#329937] hover:bg-[#287A2D] text-white font-semibold font-body"
                                    data-testid="reset-password-btn"
                                >
                                    {forgotLoading ? "Resetting..." : "Reset Password"}
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
