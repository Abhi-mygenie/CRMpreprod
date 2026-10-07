/**
 * SortChips Component - Quick filter/sort chips row
 */
import { Check } from "lucide-react";

export function SortChips({ filters, setFilters }) {
    return (
        <div className="flex gap-1.5 overflow-x-auto pb-3 mb-3 -mx-4 px-4 scrollbar-hide">
            <button
                onClick={() => setFilters({...filters, sort_by: "created_at", sort_order: "desc", inactive_days: null, most_loyal: false})}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all font-body ${
                    filters.sort_by === "created_at" && !filters.inactive_days && !filters.most_loyal
                        ? 'bg-[#329937] text-white' 
                        : 'bg-[#F5F5F5] text-[#F26B33] hover:bg-[#F26B33]/10'
                }`}
                data-testid="sort-tab-recent"
            >
                Recent {filters.sort_by === "created_at" && !filters.inactive_days && !filters.most_loyal && <Check className="w-3 h-3" />}
            </button>
            <button
                onClick={() => setFilters({...filters, most_loyal: true, inactive_days: null, sort_by: "avg_visits_per_month", sort_order: "desc"})}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all font-body ${
                    filters.most_loyal
                        ? 'bg-[#8B5CF6] text-white' 
                        : 'bg-[#F5F5F5] text-[#8B5CF6] hover:bg-[#8B5CF6]/10'
                }`}
                data-testid="sort-tab-most-loyal"
            >
                Most Loyal {filters.most_loyal && <Check className="w-3 h-3" />}
            </button>
            <button
                onClick={() => setFilters({...filters, sort_by: "total_visits", sort_order: "desc", inactive_days: null, most_loyal: false})}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all font-body ${
                    filters.sort_by === "total_visits" && !filters.most_loyal
                        ? 'bg-[#329937] text-white' 
                        : 'bg-[#F5F5F5] text-[#F26B33] hover:bg-[#F26B33]/10'
                }`}
                data-testid="sort-tab-most-visited"
            >
                Visits {filters.sort_by === "total_visits" && !filters.most_loyal && <Check className="w-3 h-3" />}
            </button>
            <button
                onClick={() => setFilters({...filters, sort_by: "total_spent", sort_order: "desc", inactive_days: null, most_loyal: false})}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all font-body ${
                    filters.sort_by === "total_spent" && !filters.most_loyal
                        ? 'bg-[#329937] text-white' 
                        : 'bg-[#F5F5F5] text-[#F26B33] hover:bg-[#F26B33]/10'
                }`}
                data-testid="sort-tab-most-spent"
            >
                Spend {filters.sort_by === "total_spent" && !filters.most_loyal && <Check className="w-3 h-3" />}
            </button>
            <button
                onClick={() => setFilters({...filters, sort_by: "total_points", sort_order: "desc", inactive_days: null, most_loyal: false})}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all font-body ${
                    filters.sort_by === "total_points" && !filters.most_loyal
                        ? 'bg-[#329937] text-white' 
                        : 'bg-[#F5F5F5] text-[#F26B33] hover:bg-[#F26B33]/10'
                }`}
                data-testid="sort-tab-highest-points"
            >
                Points {filters.sort_by === "total_points" && !filters.most_loyal && <Check className="w-3 h-3" />}
            </button>
            <button
                onClick={() => setFilters({...filters, inactive_days: 30, most_loyal: false, sort_by: "last_visit", sort_order: "asc"})}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all font-body ${
                    filters.inactive_days === 30
                        ? 'bg-[#EF4444] text-white' 
                        : 'bg-[#F5F5F5] text-[#EF4444] hover:bg-[#EF4444]/10'
                }`}
                data-testid="sort-tab-inactive"
            >
                Inactive (30d) {filters.inactive_days === 30 && <Check className="w-3 h-3" />}
            </button>
        </div>
    );
}

export default SortChips;
