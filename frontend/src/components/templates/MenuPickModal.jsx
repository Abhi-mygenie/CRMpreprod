import { useState, useEffect } from "react";
import { Search, X, ArrowLeft, Loader2 } from "lucide-react";

export default function MenuPickModal({ open, onClose, onPick, api, initialTab }) {
  const [tab, setTab] = useState("items");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !api) return;
    setSearch("");
    setTab(initialTab || "items");
    fetchMenuData();
  }, [open]);

  const fetchMenuData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [itemsRes, catsRes] = await Promise.all([
        api.get("/menu/items"),
        api.get("/menu/categories"),
      ]);
      // Filter to active items only (status=1)
      const allItems = itemsRes.data.items || [];
      setItems(allItems.filter(i => i.status === undefined || i.status === 1));
      setCategories(catsRes.data.categories || []);
    } catch (err) {
      setError("Unable to load menu. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleItemNameClick = (item) => {
    onPick({
      type: "menu_item",
      id: item.food_id,
      name: item.name,
      price: item.price,
      field: "name",
      displayLabel: `${item.name} — Name`,
      displaySub: `Menu Item · Rs.${item.price}`,
      resolvedValue: item.name,
    });
  };

  const handleItemPriceClick = (item) => {
    onPick({
      type: "menu_item",
      id: item.food_id,
      name: item.name,
      price: item.price,
      field: "price",
      displayLabel: `${item.name} — Price`,
      displaySub: `Menu Item · Rs.${item.price}`,
      resolvedValue: `Rs.${item.price}`,
    });
  };

  const handleCategoryClick = (cat) => {
    onPick({
      type: "menu_category",
      id: cat.id,
      name: cat.name,
      field: "name",
      displayLabel: `${cat.name} — Name`,
      displaySub: "Menu Category",
      resolvedValue: cat.name,
    });
  };

  const filteredItems = items.filter(i => {
    if (!search.trim()) return true;
    return i.name.toLowerCase().includes(search.toLowerCase());
  });

  const filteredCategories = categories.filter(c => {
    if (!search.trim()) return true;
    return c.name.toLowerCase().includes(search.toLowerCase());
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[52]" data-testid="menu-pick-overlay">
      <div className="fixed inset-0 bg-black/25" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] max-h-[460px] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden z-[53]"
        data-testid="menu-pick-panel">

        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200">
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center bg-gray-100 rounded-md hover:bg-gray-200" data-testid="menu-pick-back">
            <ArrowLeft className="w-4 h-4 text-gray-600" />
          </button>
          <h3 className="text-sm font-bold text-[#2B2B2B]">
            {tab === "items" ? "Pick Menu Item" : "Pick Category"}
          </h3>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder={tab === "items" ? "Search items..." : "Search categories..."}
              className="w-full pl-9 pr-8 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:bg-white focus:border-[#F26B33] outline-none"
              data-testid="menu-pick-search"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => { setTab("items"); setSearch(""); }}
            className={`flex-1 py-2 text-xs font-semibold border-b-2 transition-colors ${
              tab === "items" ? "text-[#F26B33] border-[#F26B33]" : "text-gray-500 border-transparent hover:text-gray-700"
            }`}
            data-testid="menu-tab-items"
          >Items</button>
          <button
            onClick={() => { setTab("categories"); setSearch(""); }}
            className={`flex-1 py-2 text-xs font-semibold border-b-2 transition-colors ${
              tab === "categories" ? "text-[#F26B33] border-[#F26B33]" : "text-gray-500 border-transparent hover:text-gray-700"
            }`}
            data-testid="menu-tab-categories"
          >Categories</button>
        </div>

        {/* Hint */}
        {tab === "items" && !loading && !error && filteredItems.length > 0 && (
          <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100">
            <p className="text-[10px] text-gray-400">Click item name to bind name, click price to bind price</p>
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto px-3 py-2" data-testid="menu-pick-list">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-[#F26B33]" />
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
              <p className="text-sm text-red-600">{error}</p>
              <button onClick={fetchMenuData} className="text-xs text-red-700 underline mt-1">Retry</button>
            </div>
          ) : tab === "items" ? (
            filteredItems.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">No items match your search.</p>
            ) : filteredItems.map(item => (
              <div
                key={item.food_id}
                className="flex items-center border border-gray-200 rounded-lg mb-1.5 overflow-hidden hover:border-[#F26B33] transition-colors"
                data-testid={`menu-item-${item.food_id}`}
              >
                {/* Name area — click to bind name */}
                <button
                  onClick={() => handleItemNameClick(item)}
                  className="flex-1 flex items-center gap-2 p-2.5 text-left hover:bg-orange-50/50 transition-colors"
                  data-testid={`menu-item-name-${item.food_id}`}
                >
                  <div className={`w-3.5 h-3.5 border-[1.5px] rounded-sm flex items-center justify-center shrink-0 ${
                    item.veg ? "border-green-600" : "border-red-600"
                  }`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${item.veg ? "bg-green-600" : "bg-red-600"}`} />
                  </div>
                  <p className="text-[13px] font-medium text-[#2B2B2B]">{item.name}</p>
                </button>
                {/* Price area — click to bind price */}
                <button
                  onClick={() => handleItemPriceClick(item)}
                  className="px-3 py-2.5 text-xs font-medium text-[#52525B] hover:bg-[#F26B33] hover:text-white transition-colors border-l border-gray-200 shrink-0"
                  data-testid={`menu-item-price-${item.food_id}`}
                >
                  Rs.{item.price}
                </button>
              </div>
            ))
          ) : (
            filteredCategories.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">No categories match your search.</p>
            ) : filteredCategories.map(cat => (
              <button
                key={cat.id}
                onClick={() => handleCategoryClick(cat)}
                className="w-full flex items-center justify-between p-2.5 border border-gray-200 rounded-lg mb-1.5 hover:border-[#F26B33] hover:bg-orange-50/50 transition-colors text-left"
                data-testid={`menu-cat-${cat.id}`}
              >
                <p className="text-[13px] font-medium text-[#2B2B2B]">{cat.name}</p>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
