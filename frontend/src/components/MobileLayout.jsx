import { useNavigate, useLocation } from "react-router-dom";
import { Home, Users, FileText, MessageSquare, Settings } from "lucide-react";
import { DemoModeBanner } from "@/components/shared/DemoModeBanner";

export const MobileLayout = ({ children }) => {
    const navigate = useNavigate();
    const location = useLocation();
    
    const navItems = [
        { path: "/", icon: Home, label: "Home" },
        { path: "/customers", icon: Users, label: "Customers" },
        { path: "/templates", icon: FileText, label: "Templates" },
        { path: "/feedback", icon: MessageSquare, label: "Feedback" },
        { path: "/settings", icon: Settings, label: "Settings" }
    ];

    return (
        <div className="min-h-screen bg-[#F5F5F5] pb-20">
            <DemoModeBanner />
            {children}
            
            {/* Bottom Navigation */}
            <nav className="mobile-bottom-nav bottom-nav" data-testid="bottom-nav">
                <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
                    {navItems.map((item) => {
                        const isActive = location.pathname === item.path;
                        const Icon = item.icon;
                        return (
                            <button
                                key={item.path}
                                onClick={() => navigate(item.path)}
                                className={`mobile-bottom-nav-item flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors ${
                                    isActive 
                                        ? "text-[#329937]" 
                                        : "text-[#F26B33] hover:text-[#D85A2A]"
                                }`}
                                data-testid={`nav-${item.label.toLowerCase()}`}
                            >
                                <Icon className="w-5 h-5" strokeWidth={isActive ? 2 : 1.5} />
                                <span className="text-xs font-body">{item.label}</span>
                            </button>
                        );
                    })}
                </div>
            </nav>
        </div>
    );
};
