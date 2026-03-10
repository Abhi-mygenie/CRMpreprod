import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider as AuthProviderComponent } from "@/contexts/AuthContext";

// Pages
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import DashboardPage from "@/pages/DashboardPage";
import CustomersPage from "@/pages/CustomersPage";
import CustomerDetailPage from "@/pages/CustomerDetailPage";
import SegmentsPage from "@/pages/SegmentsPage";
import TemplatesPage from "@/pages/TemplatesPage";
import QRCodePage from "@/pages/QRCodePage";
import FeedbackPage from "@/pages/FeedbackPage";
import CouponsPage from "@/pages/CouponsPage";
import SettingsPage from "@/pages/SettingsPage";
import LoyaltySettingsPage from "@/pages/LoyaltySettingsPage";
import WhatsAppAutomationPage from "@/components/shared/WhatsAppAutomationContent";
import CustomerRegistrationPage from "@/pages/CustomerRegistrationPage";
import MessageStatusPage from "@/pages/MessageStatusPage";
import ItemAnalyticsPage from "@/pages/ItemAnalyticsPage";
import CustomerLifecyclePage from "@/pages/CustomerLifecyclePage";

// Components
import { ProtectedRoute } from "@/components/ProtectedRoute";

function App() {
    return (
        <AuthProviderComponent>
            <div className="App">
                <Toaster position="top-center" richColors />
                <BrowserRouter>
                    <Routes>
                        {/* Public Routes */}
                        <Route path="/login" element={<LoginPage />} />
                        <Route path="/register" element={<RegisterPage />} />
                        <Route path="/register-customer/:restaurantId" element={<CustomerRegistrationPage />} />

                        {/* Protected Routes */}
                        <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
                        <Route path="/customers" element={<ProtectedRoute><CustomersPage /></ProtectedRoute>} />
                        <Route path="/customers/:id" element={<ProtectedRoute><CustomerDetailPage /></ProtectedRoute>} />
                        <Route path="/segments" element={<ProtectedRoute><SegmentsPage /></ProtectedRoute>} />
                        <Route path="/templates" element={<ProtectedRoute><TemplatesPage /></ProtectedRoute>} />
                        <Route path="/qr" element={<ProtectedRoute><QRCodePage /></ProtectedRoute>} />
                        <Route path="/feedback" element={<ProtectedRoute><FeedbackPage /></ProtectedRoute>} />
                        <Route path="/coupons" element={<ProtectedRoute><CouponsPage /></ProtectedRoute>} />
                        <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
                        <Route path="/loyalty-settings" element={<ProtectedRoute><LoyaltySettingsPage /></ProtectedRoute>} />
                        <Route path="/whatsapp-automation" element={<ProtectedRoute><WhatsAppAutomationPage /></ProtectedRoute>} />
                        <Route path="/message-status" element={<ProtectedRoute><MessageStatusPage /></ProtectedRoute>} />
                        <Route path="/item-analytics" element={<ProtectedRoute><ItemAnalyticsPage /></ProtectedRoute>} />
                        <Route path="/customer-lifecycle" element={<ProtectedRoute><CustomerLifecyclePage /></ProtectedRoute>} />

                        {/* Fallback */}
                        <Route path="*" element={<Navigate to="/" />} />
                    </Routes>
                </BrowserRouter>
            </div>
        </AuthProviderComponent>
    );
}

export default App;
