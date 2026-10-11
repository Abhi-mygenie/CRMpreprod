import { X } from "lucide-react";

/**
 * CR-034: Reusable tag chip pill.
 *
 * Props:
 *   tag       (string)   — tag label to display
 *   onRemove  (fn|null)  — called with tag string when × is clicked; if null, no × shown
 *   onClick   (fn|null)  — called with tag string on chip click (for filter selection)
 *   selected  (bool)     — adds ring highlight when used as a selectable option
 *   className (string)   — additional classes
 */

// Deterministic color per tag (consistent across renders)
const TAG_PALETTES = [
    { bg: "bg-orange-50",  border: "border-orange-200", text: "text-orange-600"  },
    { bg: "bg-green-50",   border: "border-green-200",  text: "text-green-700"   },
    { bg: "bg-purple-50",  border: "border-purple-200", text: "text-purple-700"  },
    { bg: "bg-blue-50",    border: "border-blue-200",   text: "text-blue-700"    },
    { bg: "bg-pink-50",    border: "border-pink-200",   text: "text-pink-700"    },
    { bg: "bg-amber-50",   border: "border-amber-200",  text: "text-amber-700"   },
    { bg: "bg-teal-50",    border: "border-teal-200",   text: "text-teal-700"    },
];

function getTagPalette(tag) {
    let hash = 0;
    for (let i = 0; i < tag.length; i++) {
        hash = tag.charCodeAt(i) + ((hash << 5) - hash);
    }
    return TAG_PALETTES[Math.abs(hash) % TAG_PALETTES.length];
}

const TagChip = ({ tag, onRemove = null, onClick = null, selected = false, className = "" }) => {
    const palette = getTagPalette(tag);
    return (
        <span
            onClick={onClick ? () => onClick(tag) : undefined}
            className={`
                inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border
                ${palette.bg} ${palette.border} ${palette.text}
                ${onClick ? "cursor-pointer hover:opacity-75 transition-opacity" : ""}
                ${selected ? "ring-2 ring-offset-1 ring-current" : ""}
                ${className}
            `.trim()}
        >
            {tag}
            {onRemove && (
                <button
                    onClick={(e) => { e.stopPropagation(); onRemove(tag); }}
                    className="hover:opacity-60 transition-opacity rounded-full flex-shrink-0"
                    aria-label={`Remove tag ${tag}`}
                >
                    <X className="w-2.5 h-2.5" />
                </button>
            )}
        </span>
    );
};

export default TagChip;
