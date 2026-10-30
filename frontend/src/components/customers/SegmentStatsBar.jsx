/**
 * SegmentStatsBar Component - Tier breakdown display
 */
export function SegmentStatsBar({ segments }) {
    if (!segments) return null;

    return (
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
            <div className="flex-shrink-0 px-3 py-1.5 bg-gray-100 rounded-full text-xs font-medium text-[#52525B]">
                Total: {segments.total?.toLocaleString()}
            </div>
            <div className="flex-shrink-0 px-3 py-1.5 bg-amber-50 rounded-full text-xs font-medium text-amber-700">
                Bronze: {segments.by_tier?.bronze || 0}
            </div>
            <div className="flex-shrink-0 px-3 py-1.5 bg-gray-200 rounded-full text-xs font-medium text-gray-700">
                Silver: {segments.by_tier?.silver || 0}
            </div>
            <div className="flex-shrink-0 px-3 py-1.5 bg-yellow-50 rounded-full text-xs font-medium text-yellow-700">
                Gold: {segments.by_tier?.gold || 0}
            </div>
        </div>
    );
}

export default SegmentStatsBar;
