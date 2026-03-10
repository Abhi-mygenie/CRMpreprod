import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { 
    Home, Users, FileText, MessageSquare, Settings, 
    QrCode, Gift, Award, Zap, ChevronLeft, ChevronRight,
    LayoutDashboard, BarChart3, Activity, LogOut
} from "lucide-react";
import { DemoModeBanner } from "@/components/shared/DemoModeBanner";
import { cn } from "@/lib/utils";

export const ResponsiveLayout = ({ children }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    
    const navItems = [
        { path: "/", icon: LayoutDashboard, label: "Dashboard" },
        { path: "/customers", icon: Users, label: "Customers" },
        { path: "/segments", icon: Users, label: "Segments" },
        { path: "/customer-lifecycle", icon: Activity, label: "Lifecycle" },
        { path: "/item-analytics", icon: BarChart3, label: "Item Analytics" },
        { path: "/templates", icon: FileText, label: "Templates" },
        { path: "/qr", icon: QrCode, label: "QR Code" },
        { path: "/feedback", icon: MessageSquare, label: "Feedback" },
        { path: "/coupons", icon: Gift, label: "Coupons" },
        { path: "/loyalty-settings", icon: Award, label: "Loyalty" },
        { path: "/whatsapp-automation", icon: Zap, label: "Automation" },
        { path: "/settings", icon: Settings, label: "Settings" }
    ];

    // Bottom nav items (subset for mobile)
    const mobileNavItems = [
        { path: "/", icon: Home, label: "Home" },
        { path: "/customers", icon: Users, label: "Customers" },
        { path: "/templates", icon: FileText, label: "Templates" },
        { path: "/feedback", icon: MessageSquare, label: "Feedback" },
        { path: "/settings", icon: Settings, label: "Settings" }
    ];

    return (
        <div className="min-h-screen bg-[#F5F5F5]">
            <DemoModeBanner />
            
            {/* Desktop Sidebar - Hidden on mobile */}
            <aside 
                className={cn(
                    "fixed left-0 top-0 h-full bg-white border-r border-gray-100 shadow-sm z-40 transition-all duration-300 hidden lg:flex flex-col",
                    sidebarCollapsed ? "w-[72px]" : "w-[240px]"
                )}
                data-testid="desktop-sidebar"
            >
                {/* Logo */}
                <div className={cn(
                    "h-16 flex items-center border-b border-gray-100 px-4",
                    sidebarCollapsed ? "justify-center" : "justify-between"
                )}>
                    {!sidebarCollapsed && (
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-gradient-to-br from-[#F26B33] to-[#329937] rounded-lg flex items-center justify-center">
                                <span className="text-white font-bold text-sm">M</span>
                            </div>
                            <span className="font-bold text-lg text-[#2B2B2B]">MyGenie</span>
                        </div>
                    )}
                    {sidebarCollapsed && (
                        <div className="w-8 h-8 bg-gradient-to-br from-[#F26B33] to-[#329937] rounded-lg flex items-center justify-center">
                            <span className="text-white font-bold text-sm">M</span>
                        </div>
                    )}
                </div>

                {/* Navigation */}
                <nav className="flex-1 py-4 px-3 overflow-y-auto">
                    <ul className="space-y-1">
                        {navItems.map((item) => {
                            const isActive = location.pathname === item.path;
                            const Icon = item.icon;
                            return (
                                <li key={item.path}>
                                    <button
                                        onClick={() => navigate(item.path)}
                                        className={cn(
                                            "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200",
                                            isActive 
                                                ? "bg-[#F26B33]/10 text-[#F26B33]" 
                                                : "text-[#52525B] hover:bg-gray-50 hover:text-[#2B2B2B]",
                                            sidebarCollapsed && "justify-center px-2"
                                        )}
                                        data-testid={`sidebar-${item.label.toLowerCase().replace(' ', '-')}`}
                                        title={sidebarCollapsed ? item.label : undefined}
                                    >
                                        <Icon className={cn("w-5 h-5 flex-shrink-0", isActive && "stroke-[2.5]")} />
                                        {!sidebarCollapsed && (
                                            <span className="font-medium text-sm">{item.label}</span>
                                        )}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </nav>

                {/* Logout & Collapse */}
                <div className="p-3 border-t border-gray-100 space-y-1">
                    <button
                        onClick={() => {
                            localStorage.removeItem("token");
                            localStorage.removeItem("user");
                            navigate("/login");
                        }}
                        className={cn(
                            "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-red-500 hover:bg-red-50 transition-colors",
                            sidebarCollapsed && "justify-center px-2"
                        )}
                        data-testid="sidebar-logout-btn"
                        title={sidebarCollapsed ? "Logout" : undefined}
                    >
                        <LogOut className="w-5 h-5 flex-shrink-0" />
                        {!sidebarCollapsed && <span className="font-medium text-sm">Logout</span>}
                    </button>
                    <button
                        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-[#52525B] hover:bg-gray-50 transition-colors"
                        data-testid="sidebar-collapse-toggle"
                    >
                        {sidebarCollapsed ? (
                            <ChevronRight className="w-5 h-5" />
                        ) : (
                            <>
                                <ChevronLeft className="w-5 h-5" />
                                <span className="text-sm">Collapse</span>
                            </>
                        )}
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main 
                className={cn(
                    "min-h-screen transition-all duration-300 pb-20 lg:pb-0",
                    sidebarCollapsed ? "lg:ml-[72px]" : "lg:ml-[240px]"
                )}
            >
                {children}
            </main>
            
            {/* Mobile Bottom Navigation - Hidden on desktop */}
            <nav className="mobile-bottom-nav bottom-nav lg:hidden" data-testid="bottom-nav">
                <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
                    {mobileNavItems.map((item) => {
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
