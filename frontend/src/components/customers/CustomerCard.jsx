/**
 * CustomerCard Component - Individual customer card display
 */
import { ChevronRight, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export function CustomerCard({ customer, onClick }) {
    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount || 0);
    };

    const formatLastVisit = (dateStr) => {
        if (!dateStr) return "Never";
        const date = new Date(dateStr);
        const now = new Date();
        const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
        if (diffDays === 0) return "Today";
        if (diffDays === 1) return "Yesterday";
        if (diffDays < 7) return `${diffDays}d ago`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
        return `${Math.floor(diffDays / 30)}mo ago`;
    };

    return (
        <button
            onClick={() => onClick(customer)}
            className="w-full bg-white rounded-xl p-3 flex items-center gap-3 hover:bg-gray-50 transition-colors border border-gray-100 shadow-sm text-left"
            data-testid={`customer-card-${customer.id}`}
        >
            <Avatar className="w-10 h-10 flex-shrink-0">
                <AvatarFallback className="bg-[#329937]/10 text-[#329937] text-sm font-semibold">
                    {customer.name?.charAt(0)?.toUpperCase() || "?"}
                </AvatarFallback>
            </Avatar>
            
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <h3 className="font-medium text-[#1A1A1A] truncate text-sm">
                        {customer.name}
                    </h3>
                    <Badge variant="outline" className={`tier-badge ${customer.tier?.toLowerCase()} flex-shrink-0 text-[10px] px-1.5 py-0`}>
                        {customer.tier}
                    </Badge>
                </div>
                <div className="flex items-center gap-2 text-xs text-[#52525B]">
                    <span>{customer.phone}</span>
                    {customer.city && (
                        <>
                            <span>•</span>
                            <span className="flex items-center gap-0.5">
                                <MapPin className="w-3 h-3" />
                                {customer.city}
                            </span>
                        </>
                    )}
                </div>
                <div className="flex items-center gap-2 text-xs text-[#71717A] mt-0.5">
                    <span className="text-[#F26B33] font-medium">{customer.total_points} pts</span>
                    <span>•</span>
                    <span>{customer.total_visits} visits</span>
                    <span>•</span>
                    <span>{formatCurrency(customer.total_spent)}</span>
                    <span>•</span>
                    <span>{formatLastVisit(customer.last_visit)}</span>
                </div>
            </div>
            
            <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
        </button>
    );
}

export default CustomerCard;
