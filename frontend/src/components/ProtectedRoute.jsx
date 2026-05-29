import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export const ProtectedRoute = ({ children }) => {
    const { token, loading } = useAuth();
    
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#F9F9F7]">
                <div className="animate-pulse text-[#F26B33] text-lg font-semibold">Loading...</div>
            </div>
        );
    }
    
    if (!token) {
        return <Navigate to="/login" />;
    }
    
    return children;
};
