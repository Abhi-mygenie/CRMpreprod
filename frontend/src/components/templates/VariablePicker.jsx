import { useState, useEffect, useRef, useMemo } from "react";
import { Receipt, Star, User, Ticket, Building2, MessageSquare, UtensilsCrossed, Search, X, Clock } from "lucide-react";

const BLOCK_ORDER = [
  { key: "order_bill", label: "Order / Bill", Icon: Receipt, bg: "bg-orange-50", text: "text-orange-600" },
  { key: "loyalty",    label: "Loyalty",      Icon: Star,    bg: "bg-amber-50",  text: "text-amber-600" },
  { key: "customer",   label: "Customer",     Icon: User,    bg: "bg-blue-50",   text: "text-blue-600" },
  { key: "coupon",     label: "Coupon",       Icon: Ticket,  bg: "bg-pink-50",   text: "text-pink-600" },
  { key: "brand",      label: "Brand / Links",Icon: Building2, bg: "bg-green-50", text: "text-green-600" },
  { key: "feedback",   label: "Feedback",     Icon: MessageSquare, bg: "bg-purple-50", text: "text-purple-600" },
  { key: "menu",       label: "Menu",         Icon: UtensilsCrossed, bg: "bg-yellow-50", text: "text-yellow-700", isNew: true },
];

const RECENTLY_USED_KEY = "cr020_recently_used";
const MAX_RECENT = 5;

function getRecentlyUsed() {
  try { return JSON.parse(localStorage.getItem(RECENTLY_USED_KEY) || "[]").slice(0, MAX_RECENT); }
  catch { return []; }
}
function addRecentlyUsed(varKey) {
  const recent = getRecentlyUsed().filter(k => k !== varKey);
  recent.unshift(varKey);
  localStorage.setItem(RECENTLY_USED_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
}

function fillsOn(variable, eventKey) {
  if (!eventKey || !variable) return false;
  const f = variable.fills_on_events;
  if (f === "*") return true;
  if (Array.isArray(f)) return f.includes(eventKey);
  return false;
}

function FillDot({ fills }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${fills ? "bg-green-500" : "bg-amber-400"}`}
      title={fills ? "Reliably fills on this event" : "May not fill on this event"}
    />
  );
}

export default function VariablePicker({ variables, eventKey, selectedKey, onSelect, onMenuPick, open, onClose }) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(new Set());
  const panelRef = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    if (open) { setSearch(""); if (searchRef.current) searchRef.current.focus(); }
  }, [open]);

  const recentKeys = useMemo(() => getRecentlyUsed(), [open]);
  const varsByKey = useMemo(() => {
    const m = {};
    (variables || []).forEach(v => { m[v.key] = v; });
    return m;
  }, [variables]);

  const suggested = useMemo(() => {
    if (!eventKey) return [];
    return (variables || []).filter(v => fillsOn(v, eventKey)).slice(0, 5);
  }, [variables, eventKey]);

  const recentVars = recentKeys.map(k => varsByKey[k]).filter(Boolean);

  const filteredBlocks = useMemo(() => {
    const q = search.toLowerCase().trim();
    return BLOCK_ORDER.map(block => {
      const vars = (variables || []).filter(v => v.block === block.key);
      const sortedVars = [...vars].sort((a, b) => a.label.localeCompare(b.label));
      const filtered = q ? sortedVars.filter(v => v.label.toLowerCase().includes(q) || v.key.toLowerCase().includes(q)) : sortedVars;
      return { ...block, vars: filtered, totalCount: vars.length };
    }).filter(b => b.vars.length > 0);
  }, [variables, search]);

  // Auto-expand blocks when searching
  useEffect(() => {
    if (search.trim()) setExpanded(new Set(filteredBlocks.map(b => b.key)));
  }, [search, filteredBlocks]);

  const handleSelect = (varKey) => {
    addRecentlyUsed(varKey);
    onSelect(varKey);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" data-testid="variable-picker-overlay">
      <div className="fixed inset-0 bg-black/25" onClick={onClose} />
      <div
        ref={panelRef}
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] max-h-[580px] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden z-[51]"
        data-testid="variable-picker-panel"
      >
        {/* Search */}
        <div className="p-3 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search variables..."
              className="w-full pl-9 pr-8 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:bg-white focus:border-[#F26B33] outline-none"
              data-testid="variable-picker-search"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Suggested chips */}
        {!search && suggested.length > 0 && (
          <div className="px-3 py-2 border-b border-gray-100" data-testid="suggested-chips">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">Suggested for {eventKey}</p>
            <div className="flex flex-wrap gap-1.5">
              {suggested.map(v => (
                <button
                  key={v.key}
                  onClick={() => handleSelect(v.key)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 border border-gray-200 rounded-full text-[11px] font-medium text-[#2B2B2B] hover:bg-orange-50 hover:border-[#F26B33] hover:text-[#F26B33] transition-colors"
                  data-testid={`suggested-${v.key}`}
                >
                  <FillDot fills={true} />
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Recently used */}
        {!search && recentVars.length > 0 && (
          <div className="px-3 py-2 border-b border-gray-100 bg-gray-50" data-testid="recently-used">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1.5 flex items-center gap-1">
              <Clock className="w-3 h-3" /> Recently Used
            </p>
            <div className="flex flex-wrap gap-1.5">
              {recentVars.map(v => (
                <button
                  key={v.key}
                  onClick={() => handleSelect(v.key)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-gray-200 rounded-full text-[11px] font-medium text-[#2B2B2B] hover:bg-orange-50 hover:border-[#F26B33] hover:text-[#F26B33] transition-colors"
                  data-testid={`recent-${v.key}`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Grouped block list */}
        <div className="flex-1 overflow-y-auto py-1" data-testid="variable-blocks">
          {filteredBlocks.map(block => {
            const isExpanded = expanded.has(block.key);
            const { Icon } = block;
            return (
              <div key={block.key} data-testid={`block-${block.key}`}>
                <button
                  onClick={() => setExpanded(prev => { const n = new Set(prev); n.has(block.key) ? n.delete(block.key) : n.add(block.key); return n; })}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 hover:bg-gray-50 transition-colors"
                  data-testid={`block-header-${block.key}`}
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${block.bg} ${block.text}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-[#2B2B2B] flex-1 text-left">
                    {block.label}
                    {block.isNew && (
                      <span className="ml-1.5 px-1.5 py-0.5 bg-yellow-200 text-yellow-800 rounded text-[9px] font-bold">NEW</span>
                    )}
                  </span>
                  <span className="text-[11px] text-gray-400">{block.totalCount}</span>
                  <span className={`text-gray-400 text-xs transition-transform ${isExpanded ? "rotate-90" : ""}`}>&#9654;</span>
                </button>
                {isExpanded && (
                  <div className="pl-12 pr-3 pb-1.5">
                    {block.key === "menu" && onMenuPick ? (
                      <div className="space-y-1">
                        <button
                          onClick={() => { onMenuPick("item"); onClose(); }}
                          className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-left hover:bg-orange-50/50 transition-colors"
                          data-testid="menu-pick-item-btn"
                        >
                          <span className="inline-block w-2 h-2 rounded-full bg-green-500 shrink-0" />
                          <span className="text-xs font-medium text-[#2B2B2B] flex-1">Pick a Menu Item</span>
                          <span className="text-[11px] text-[#F26B33] font-medium">Browse &rarr;</span>
                        </button>
                        <button
                          onClick={() => { onMenuPick("category"); onClose(); }}
                          className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-left hover:bg-orange-50/50 transition-colors"
                          data-testid="menu-pick-category-btn"
                        >
                          <span className="inline-block w-2 h-2 rounded-full bg-green-500 shrink-0" />
                          <span className="text-xs font-medium text-[#2B2B2B] flex-1">Pick a Menu Category</span>
                          <span className="text-[11px] text-[#F26B33] font-medium">Browse &rarr;</span>
                        </button>
                      </div>
                    ) : (
                    block.vars.map(v => {
                      const fills = fillsOn(v, eventKey);
                      const isSelected = v.key === selectedKey;
                      return (
                        <button
                          key={v.key}
                          onClick={() => handleSelect(v.key)}
                          className={`w-full flex items-center gap-2 px-2.5 py-[6px] rounded-md text-left transition-colors ${
                            isSelected ? "bg-orange-50 border border-[#F26B33]/30" : "hover:bg-orange-50/50"
                          }`}
                          data-testid={`var-${v.key}`}
                        >
                          <FillDot fills={fills} />
                          <span className="text-xs font-medium text-[#2B2B2B] flex-1">{v.label}</span>
                          <span className="text-[11px] text-gray-400 whitespace-nowrap">{v.example}</span>
                        </button>
                      );
                    })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
