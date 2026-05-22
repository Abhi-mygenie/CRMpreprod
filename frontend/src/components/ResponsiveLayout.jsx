import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { 
    Home, Users, FileText, MessageSquare, Settings, 
    QrCode, Gift, Award, Zap, ChevronLeft, ChevronRight, ChevronDown,
    LayoutDashboard, BarChart3, Activity, LogOut, User, RefreshCw,
    Wallet, UserPlus
} from "lucide-react";
import { DemoModeBanner } from "@/components/shared/DemoModeBanner";
import { cn } from "@/lib/utils";

export const ResponsiveLayout = ({ children }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [expandedGroups, setExpandedGroups] = useState({});
    
    const whatsappChildPaths = ["/settings", "/templates", "/whatsapp-automation", "/segments"];
    const analyticsChildPaths = ["/customer-lifecycle", "/item-analytics"];
    const isWhatsAppChildActive = whatsappChildPaths.includes(location.pathname);
    const isAnalyticsChildActive = analyticsChildPaths.includes(location.pathname);

    const navItems = [
        { path: "/", icon: LayoutDashboard, label: "Dashboard" },
        { path: "/customers", icon: Users, label: "Customers" },
        { path: "/loyalty-settings", icon: Award, label: "Loyalty" },
        { path: "/coupons", icon: Gift, label: "Coupons" },
        { path: "/wallet", icon: Wallet, label: "Wallet" },
        { 
            icon: MessageSquare, 
            label: "WhatsApp",
            group: "whatsapp",
            children: [
                { path: "/settings", icon: Settings, label: "Settings" },
                { path: "/templates", icon: FileText, label: "Templates" },
                { path: "/whatsapp-automation", icon: Zap, label: "Automation" },
                { path: "/segments", icon: Users, label: "Segments" },
            ]
        },
        { 
            icon: BarChart3, 
            label: "Analytics",
            group: "analytics",
            children: [
                { path: "/customer-lifecycle", icon: Activity, label: "Lifecycle" },
                { path: "/item-analytics", icon: BarChart3, label: "Item Analytics" },
            ]
        },
        { path: "/feedback", icon: MessageSquare, label: "Feedback" },
        { path: "/qr", icon: UserPlus, label: "Add Customer" },
        { path: "/migration", icon: RefreshCw, label: "Migration" },
        { path: "/profile", icon: User, label: "Profile" }
    ];

    const toggleGroup = (group) => {
        setExpandedGroups(prev => ({ ...prev, [group]: !prev[group] }));
    };

    const isGroupExpanded = (group) => {
        if (expandedGroups[group] !== undefined) return expandedGroups[group];
        if (group === "whatsapp") return isWhatsAppChildActive;
        if (group === "analytics") return isAnalyticsChildActive;
        return false;
    };

    // Bottom nav items (subset for mobile)
    const mobileNavItems = [
        { path: "/", icon: Home, label: "Home" },
        { path: "/customers", icon: Users, label: "Customers" },
        { path: "/templates", icon: FileText, label: "Templates" },
        { path: "/feedback", icon: MessageSquare, label: "Feedback" },
        { path: "/settings", icon: MessageSquare, label: "WhatsApp" }
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
                            if (item.children) {
                                const Icon = item.icon;
                                const expanded = isGroupExpanded(item.group);
                                const hasActiveChild = item.children.some(c => location.pathname === c.path);
                                return (
                                    <li key={item.label}>
                                        <button
                                            onClick={() => toggleGroup(item.group)}
                                            className={cn(
                                                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200",
                                                hasActiveChild
                                                    ? "text-[#F26B33]"
                                                    : "text-[#52525B] hover:bg-gray-50 hover:text-[#2B2B2B]",
                                                sidebarCollapsed && "justify-center px-2"
                                            )}
                                            data-testid={`sidebar-${item.label.toLowerCase()}`}
                                            title={sidebarCollapsed ? item.label : undefined}
                                        >
                                            <Icon className={cn("w-5 h-5 flex-shrink-0", hasActiveChild && "stroke-[2.5]")} />
                                            {!sidebarCollapsed && (
                                                <>
                                                    <span className="font-medium text-sm flex-1 text-left">{item.label}</span>
                                                    <ChevronDown className={cn("w-4 h-4 transition-transform duration-200", expanded && "rotate-180")} />
                                                </>
                                            )}
                                        </button>
                                        {expanded && !sidebarCollapsed && (
                                            <ul className="mt-1 ml-4 pl-4 border-l border-gray-200 space-y-0.5">
                                                {item.children.map((child) => {
                                                    const isActive = location.pathname === child.path;
                                                    const ChildIcon = child.icon;
                                                    return (
                                                        <li key={child.path}>
                                                            <button
                                                                onClick={() => navigate(child.path)}
                                                                className={cn(
                                                                    "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-all duration-200 text-sm",
                                                                    isActive
                                                                        ? "bg-[#F26B33]/10 text-[#F26B33] font-medium"
                                                                        : "text-[#71717A] hover:bg-gray-50 hover:text-[#2B2B2B]"
                                                                )}
                                                                data-testid={`sidebar-${child.label.toLowerCase().replace(' ', '-')}`}
                                                            >
                                                                <ChildIcon className={cn("w-4 h-4 flex-shrink-0", isActive && "stroke-[2.5]")} />
                                                                <span>{child.label}</span>
                                                            </button>
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        )}
                                    </li>
                                );
                            }
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
