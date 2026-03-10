import { useAuth } from "@/contexts/AuthContext";

export const DemoModeBanner = () => {
    const { isDemoMode } = useAuth();
    
    if (!isDemoMode) return null;
    
    return (
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-4 py-2 text-center sticky top-0 z-50 shadow-md" data-testid="demo-mode-banner">
            <div className="flex items-center justify-center gap-2 text-sm font-medium">
                <span className="text-lg">{"\u{1F3AD}"}</span>
                <span>Demo Mode - Exploring with test data</span>
            </div>
        </div>
    );
};
