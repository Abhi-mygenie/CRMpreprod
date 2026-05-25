import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Plus, Search, Percent, DollarSign, ShoppingCart, Grid3X3,
  Clock, Gift, Hash, ChevronDown, ChevronRight, X, Settings2,
  Edit2, Trash2, Loader2, ArrowLeft, Tag, Filter
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger
} from "@/components/ui/collapsible";
import { ResponsiveLayout } from "@/components/ResponsiveLayout";

const SCOPE_COLORS = {
  order: "bg-blue-50 text-blue-700 border-blue-200",
  item: "bg-purple-50 text-purple-700 border-purple-200",
  category: "bg-emerald-50 text-emerald-700 border-emerald-200",
};
const SCOPE_LABELS = { order: "Order", item: "Item", category: "Category" };

const COUPON_TYPES = [
  { id: "order_flat", label: "Flat Discount", desc: "Fixed amount off the order total", icon: DollarSign, phase: "V1", enabled: true, scope: "order", dtype: "flat", color: "from-blue-500 to-blue-600" },
  { id: "order_percentage", label: "Percentage Off", desc: "Percentage off the order total", icon: Percent, phase: "V1", enabled: true, scope: "order", dtype: "percentage", color: "from-orange-500 to-orange-600" },
  { id: "item_discount", label: "Item Discount", desc: "Discount on specific menu items", icon: ShoppingCart, phase: "V2", enabled: true, scope: "item", dtype: null, color: "from-purple-500 to-purple-600" },
  { id: "category_discount", label: "Category Discount", desc: "Discount on entire categories", icon: Grid3X3, phase: "V2", enabled: true, scope: "category", dtype: null, color: "from-emerald-500 to-emerald-600" },
  { id: "time_window", label: "Happy Hour", desc: "Time-based promotional offers", icon: Clock, phase: "V3-A", enabled: false },
  { id: "bogo", label: "BOGO / BXGY", desc: "Buy X Get Y free or discounted", icon: Gift, phase: "V3-B", enabled: false },
  { id: "every_nth", label: "Every Nth Item", desc: "Nth item free or discounted", icon: Hash, phase: "V3-C", enabled: false },
];

const EMPTY_FORM = {
  code: "", title: "", description: "", discount_type: "flat",
  discount_value: "", min_order_value: "0", max_discount: "",
  start_date: "", end_date: "", usage_limit: "", per_user_limit: "1",
  applicable_channels: ["delivery", "takeaway", "dine_in"],
  specific_users: [], stackable_with_loyalty: false,
  discount_scope: "order", offer_type: "simple",
  eligible_food_ids: [], eligible_category_ids: [], eligible_category_names: [],
  min_item_qty: "", max_applicable_qty: "",
  apply_to_cheapest_item: false, apply_to_highest_item: false,
  pos_instruction: "",
};

function resolveTypeFromCoupon(c) {
  const scope = c.discount_scope || "order";
  if (scope === "item") return "item_discount";
  if (scope === "category") return "category_discount";
  return c.discount_type === "percentage" ? "order_percentage" : "order_flat";
}

function formatDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// ─── Item Selector ───
function ItemSelector({ items, selected, onToggle, loading }) {
  const [q, setQ] = useState("");
  const filtered = items.filter(i => !q || i.name.toLowerCase().includes(q.toLowerCase()) || i.food_id.includes(q));
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold text-gray-700">Select Menu Items</Label>
        <span className="text-xs text-gray-400">{selected.length} selected</span>
      </div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map(id => {
            const it = items.find(i => i.food_id === id);
            return (
              <Badge key={id} className="bg-purple-50 text-purple-700 border-purple-200 text-xs pl-2.5 pr-1 py-1 gap-1.5 font-normal">
                {it?.name || id}
                <button onClick={() => onToggle(id)} className="hover:bg-purple-200/50 rounded-full p-0.5 ml-0.5"><X className="w-3 h-3" /></button>
              </Badge>
            );
          })}
        </div>
      )}
      <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
        <div className="relative border-b border-gray-100">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input placeholder="Search items by name..." value={q} onChange={e => setQ(e.target.value)}
            className="pl-11 h-11 rounded-none border-0 focus-visible:ring-0 text-sm" data-testid="menu-item-search" />
        </div>
        <div className="max-h-52 overflow-y-auto divide-y divide-gray-50">
          {loading ? (
            <div className="flex items-center justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No items found</p>
          ) : (
            filtered.map(item => (
              <label key={item.food_id} className="flex items-center gap-3.5 px-4 py-3 hover:bg-gray-50/80 cursor-pointer transition-colors">
                <Checkbox checked={selected.includes(item.food_id)} onCheckedChange={() => onToggle(item.food_id)}
                  className="data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600" data-testid={`item-${item.food_id}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{item.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">ID: {item.food_id} · Rs.{item.price}</p>
                </div>
              </label>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Category Selector ───
function CategorySelector({ categories, selected, onToggle, loading }) {
  if (loading) return <div className="flex items-center justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold text-gray-700">Select Categories</Label>
        <span className="text-xs text-gray-400">{selected.length} selected</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {categories.map(cat => {
          const isSel = selected.some(s => s.id === cat.id);
          return (
            <button key={cat.id} type="button" onClick={() => onToggle(cat)}
              className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${
                isSel ? "bg-emerald-600 text-white border-emerald-600 shadow-sm shadow-emerald-200" : "bg-white text-gray-600 border-gray-200 hover:border-emerald-300 hover:bg-emerald-50/50"
              }`} data-testid={`cat-${cat.id}`}>
              {cat.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Page ───
export default function CouponsPage() {
  const { api } = useAuth();
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState(null);
  const [selectedType, setSelectedType] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterScope, setFilterScope] = useState("all");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [menuItems, setMenuItems] = useState([]);
  const [menuCategories, setMenuCategories] = useState([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [selectedCats, setSelectedCats] = useState([]);

  const fetchCoupons = useCallback(async () => {
    try { const res = await api.get("/coupons"); setCoupons(res.data); }
    catch { toast.error("Failed to load coupons"); }
    finally { setLoading(false); }
  }, [api]);

  const fetchMenu = useCallback(async () => {
    setMenuLoading(true);
    try {
      const [ir, cr] = await Promise.all([api.get("/menu/items"), api.get("/menu/categories")]);
      setMenuItems(ir.data.items || []);
      setMenuCategories(cr.data.categories || []);
    } catch { /* menu fetch fail is non-fatal */ }
    finally { setMenuLoading(false); }
  }, [api]);

  useEffect(() => { fetchCoupons(); }, [fetchCoupons]);

  const openCreate = () => {
    setEditingCoupon(null);
    setSelectedType(null);
    setForm({ ...EMPTY_FORM });
    setSelectedCats([]);
    setAdvancedOpen(false);
    setSheetOpen(true);
    fetchMenu();
  };

  const openEdit = (coupon) => {
    setEditingCoupon(coupon);
    setSelectedType(resolveTypeFromCoupon(coupon));
    setForm({
      code: coupon.code || "", title: coupon.title || "", description: coupon.description || "",
      discount_type: coupon.discount_type || "flat",
      discount_value: String(coupon.discount_value ?? ""),
      min_order_value: String(coupon.min_order_value ?? "0"),
      max_discount: coupon.max_discount != null ? String(coupon.max_discount) : "",
      start_date: (coupon.start_date || "").split("T")[0],
      end_date: (coupon.end_date || "").split("T")[0],
      usage_limit: coupon.usage_limit != null ? String(coupon.usage_limit) : "",
      per_user_limit: String(coupon.per_user_limit ?? "1"),
      applicable_channels: coupon.applicable_channels || ["delivery", "takeaway", "dine_in"],
      specific_users: coupon.specific_users || [],
      stackable_with_loyalty: coupon.stackable_with_loyalty || false,
      discount_scope: coupon.discount_scope || "order",
      offer_type: coupon.offer_type || "simple",
      eligible_food_ids: coupon.eligible_food_ids || [],
      eligible_category_ids: coupon.eligible_category_ids || [],
      eligible_category_names: coupon.eligible_category_names || [],
      min_item_qty: coupon.min_item_qty != null ? String(coupon.min_item_qty) : "",
      max_applicable_qty: coupon.max_applicable_qty != null ? String(coupon.max_applicable_qty) : "",
      apply_to_cheapest_item: coupon.apply_to_cheapest_item || false,
      apply_to_highest_item: coupon.apply_to_highest_item || false,
      pos_instruction: coupon.pos_instruction || "",
    });
    const cats = (coupon.eligible_category_ids || []).map((id, i) => ({ id, name: (coupon.eligible_category_names || [])[i] || id }));
    setSelectedCats(cats);
    setAdvancedOpen(false);
    setSheetOpen(true);
    fetchMenu();
  };

  const handleTypeSelect = (typeId) => {
    const t = COUPON_TYPES.find(ct => ct.id === typeId);
    if (!t || !t.enabled) return;
    setSelectedType(typeId);
    setForm(prev => ({ ...prev, discount_scope: t.scope || "order", discount_type: t.dtype || prev.discount_type }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        code: form.code, title: form.title || null, description: form.description || null,
        discount_type: form.discount_type, discount_value: parseFloat(form.discount_value),
        discount_scope: form.discount_scope, min_order_value: parseFloat(form.min_order_value) || 0,
        max_discount: form.max_discount ? parseFloat(form.max_discount) : null,
        start_date: form.start_date, end_date: form.end_date,
        usage_limit: form.usage_limit ? parseInt(form.usage_limit) : null,
        per_user_limit: parseInt(form.per_user_limit) || 1,
        applicable_channels: form.applicable_channels,
        specific_users: form.specific_users.length > 0 ? form.specific_users : null,
        stackable_with_loyalty: form.stackable_with_loyalty,
        offer_type: form.offer_type || "simple",
        coupon_type: form.discount_scope === "order" ? "order" : form.discount_scope,
      };
      if (form.discount_scope === "item") {
        payload.eligible_food_ids = form.eligible_food_ids.length > 0 ? form.eligible_food_ids : null;
        payload.min_item_qty = form.min_item_qty ? parseInt(form.min_item_qty) : null;
        payload.max_applicable_qty = form.max_applicable_qty ? parseInt(form.max_applicable_qty) : null;
        payload.apply_to_cheapest_item = form.apply_to_cheapest_item;
        payload.apply_to_highest_item = form.apply_to_highest_item;
      }
      if (form.discount_scope === "category") {
        payload.eligible_category_ids = selectedCats.map(c => c.id);
        payload.eligible_category_names = selectedCats.map(c => c.name);
        payload.min_item_qty = form.min_item_qty ? parseInt(form.min_item_qty) : null;
        payload.max_applicable_qty = form.max_applicable_qty ? parseInt(form.max_applicable_qty) : null;
        payload.apply_to_cheapest_item = form.apply_to_cheapest_item;
        payload.apply_to_highest_item = form.apply_to_highest_item;
      }
      if (form.pos_instruction) payload.pos_instruction = form.pos_instruction;

      if (editingCoupon) { await api.put(`/coupons/${editingCoupon.id}`, payload); toast.success("Coupon updated!"); }
      else { await api.post("/coupons", payload); toast.success("Coupon created!"); }
      setSheetOpen(false);
      fetchCoupons();
    } catch (err) { toast.error(err.response?.data?.detail || "Failed to save coupon"); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this coupon?")) return;
    try { await api.delete(`/coupons/${id}`); toast.success("Deleted"); fetchCoupons(); }
    catch { toast.error("Failed to delete"); }
  };

  const handleToggle = async (coupon) => {
    try { await api.post(`/coupons/${coupon.id}/toggle`); fetchCoupons(); }
    catch { toast.error("Failed to toggle"); }
  };

  const toggleFoodId = (fid) => setForm(p => ({ ...p, eligible_food_ids: p.eligible_food_ids.includes(fid) ? p.eligible_food_ids.filter(x => x !== fid) : [...p.eligible_food_ids, fid] }));
  const toggleCategory = (cat) => setSelectedCats(p => p.some(c => c.id === cat.id) ? p.filter(c => c.id !== cat.id) : [...p, cat]);
  const toggleChannel = (ch) => setForm(p => ({ ...p, applicable_channels: p.applicable_channels.includes(ch) ? p.applicable_channels.filter(c => c !== ch) : [...p.applicable_channels, ch] }));

  const filteredCoupons = coupons.filter(c => {
    const scope = c.discount_scope || "order";
    return (filterScope === "all" || scope === filterScope) && (!searchQuery || c.code.toLowerCase().includes(searchQuery.toLowerCase()) || (c.title || "").toLowerCase().includes(searchQuery.toLowerCase()));
  });

  const isPercentage = form.discount_type === "percentage";
  const isV2 = form.discount_scope === "item" || form.discount_scope === "category";
  const typeConfig = COUPON_TYPES.find(t => t.id === selectedType);

  return (
    <ResponsiveLayout>
      <div className="p-4 lg:p-6 xl:p-8 max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight" data-testid="coupons-title">Coupons</h1>
            <p className="text-sm text-gray-500 mt-0.5">{coupons.length} total coupons</p>
          </div>
          <Button onClick={openCreate} className="h-11 rounded-xl bg-[#F26B33] hover:bg-[#D95826] px-6 font-semibold shadow-sm shadow-orange-200" data-testid="coupon-create-btn">
            <Plus className="w-4 h-4 mr-2" /> New Coupon
          </Button>
        </div>

        {/* Search + Filter */}
        <div className="flex items-center gap-3 mb-5">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input placeholder="Search by code or title..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              className="pl-11 h-11 rounded-xl border-gray-200 bg-white" data-testid="coupon-search" />
          </div>
          <Select value={filterScope} onValueChange={setFilterScope}>
            <SelectTrigger className="w-[150px] h-11 rounded-xl bg-white" data-testid="coupon-filter">
              <Filter className="w-4 h-4 mr-2 text-gray-400" /><SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="order">Order Level</SelectItem>
              <SelectItem value="item">Item Level</SelectItem>
              <SelectItem value="category">Category Level</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-3">{[1, 2, 3].map(i => (<div key={i} className="bg-white rounded-xl p-5 border animate-pulse"><div className="h-5 bg-gray-200 rounded w-32 mb-2" /><div className="h-4 bg-gray-200 rounded w-48" /></div>))}</div>
        ) : filteredCoupons.length === 0 ? (
          <div className="text-center py-16">
            <Tag className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 mb-4">{searchQuery || filterScope !== "all" ? "No coupons match your filters" : "No coupons yet"}</p>
            {!searchQuery && filterScope === "all" && <Button onClick={openCreate} className="bg-[#F26B33] hover:bg-[#D95826] rounded-xl">Create your first coupon</Button>}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredCoupons.map(coupon => {
              const scope = coupon.discount_scope || "order";
              const expired = coupon.is_active && new Date(coupon.end_date) < new Date();
              return (
                <Card key={coupon.id} className={`rounded-xl border transition-all hover:shadow-sm ${coupon.is_active && !expired ? "border-gray-200 bg-white" : "border-gray-100 bg-gray-50/60"}`} data-testid={`coupon-card-${coupon.id}`}>
                  <CardContent className="px-5 py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0 mr-4">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className="text-base font-bold text-gray-900 font-mono tracking-wide">{coupon.code}</span>
                          <Badge className={`text-[10px] font-semibold border px-2 py-0.5 ${SCOPE_COLORS[scope] || SCOPE_COLORS.order}`}>{SCOPE_LABELS[scope] || "Order"}</Badge>
                          {coupon.is_active && !expired && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />}
                          {expired && <Badge variant="outline" className="text-[10px] text-red-500 border-red-200">Expired</Badge>}
                          {!coupon.is_active && <Badge variant="outline" className="text-[10px] text-gray-400 border-gray-200">Inactive</Badge>}
                        </div>
                        {coupon.title && <p className="text-sm text-gray-500 mt-1">{coupon.title}</p>}
                        <div className="flex items-center gap-3 mt-2">
                          <span className="text-sm font-semibold text-[#F26B33]">
                            {coupon.discount_type === "percentage" ? `${coupon.discount_value}% off${coupon.max_discount ? ` (max Rs.${coupon.max_discount})` : ""}` : `Rs.${coupon.discount_value} off`}
                          </span>
                          <span className="text-xs text-gray-400">|</span>
                          <span className="text-xs text-gray-400">Used {coupon.total_used}{coupon.usage_limit ? `/${coupon.usage_limit}` : ""}</span>
                          <span className="text-xs text-gray-400">|</span>
                          <span className="text-xs text-gray-400">{formatDate(coupon.start_date)} — {formatDate(coupon.end_date)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Switch checked={coupon.is_active} onCheckedChange={() => handleToggle(coupon)} className="data-[state=checked]:bg-emerald-500 scale-90" data-testid={`toggle-${coupon.id}`} />
                        <Button variant="ghost" size="sm" onClick={() => openEdit(coupon)} className="h-9 w-9 p-0 text-gray-400 hover:text-[#F26B33] hover:bg-orange-50 rounded-lg" data-testid={`edit-${coupon.id}`}><Edit2 className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(coupon.id)} className="h-9 w-9 p-0 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg" data-testid={`delete-${coupon.id}`}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ━━━ DRAWER ━━━ */}
      <Sheet open={sheetOpen} onOpenChange={o => { if (!o) setSheetOpen(false); }}>
        <SheetContent className="w-full sm:max-w-[580px] p-0 flex flex-col" side="right">
          <SheetHeader className="px-6 pt-6 pb-4 border-b border-gray-100 shrink-0">
            <div className="flex items-center gap-3">
              {selectedType && (
                <button type="button" onClick={() => { if (!editingCoupon) setSelectedType(null); }}
                  className={`w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors ${editingCoupon ? "opacity-50 cursor-default" : ""}`}>
                  <ArrowLeft className="w-4 h-4 text-gray-500" />
                </button>
              )}
              <div>
                <SheetTitle className="text-lg font-bold text-gray-900">{selectedType ? (editingCoupon ? "Edit Coupon" : "Create Coupon") : "Choose Coupon Type"}</SheetTitle>
                <SheetDescription className="text-sm text-gray-500 mt-0.5">{selectedType ? typeConfig?.label : "Select the type of promotion to create"}</SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <ScrollArea className="flex-1">
            <div className="px-6 py-5">
              {/* Type Selector */}
              {!selectedType && (
                <div className="space-y-3">
                  {COUPON_TYPES.map(t => (
                    <button key={t.id} type="button" onClick={() => handleTypeSelect(t.id)} disabled={!t.enabled}
                      className={`w-full text-left p-4 rounded-xl border-2 transition-all group ${t.enabled ? "border-gray-150 bg-white hover:border-[#F26B33]/40 hover:shadow-sm cursor-pointer" : "border-gray-100 bg-gray-50/40 cursor-not-allowed"}`}
                      data-testid={`type-${t.id}`}>
                      <div className="flex items-center gap-4">
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${t.enabled ? `bg-gradient-to-br ${t.color} text-white shadow-sm` : "bg-gray-100 text-gray-400"}`}><t.icon className="w-5 h-5" /></div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className={`text-sm font-semibold ${t.enabled ? "text-gray-900" : "text-gray-400"}`}>{t.label}</p>
                            <Badge className={`text-[9px] px-1.5 py-0 font-mono ${t.enabled ? "bg-gray-100 text-gray-500 border-gray-200" : "bg-gray-100 text-gray-300 border-gray-100"}`}>{t.phase}</Badge>
                          </div>
                          <p className={`text-xs mt-0.5 ${t.enabled ? "text-gray-500" : "text-gray-300"}`}>{t.desc}</p>
                        </div>
                        {t.enabled ? <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-[#F26B33] transition-colors shrink-0" /> : <Badge className="text-[9px] px-2 py-0.5 bg-amber-50 text-amber-600 border-amber-200 shrink-0">Soon</Badge>}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Form */}
              {selectedType && (
                <form id="coupon-form" onSubmit={handleSubmit} className="space-y-6">
                  {/* Identity */}
                  <div className="space-y-4">
                    <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Coupon Details</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-sm font-medium text-gray-700 mb-1.5 block">Code</Label>
                        <Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })}
                          placeholder="e.g. SAVE20" className="h-11 rounded-xl font-mono uppercase bg-gray-50/50 border-gray-200 focus:bg-white" required data-testid="coupon-code" />
                      </div>
                      <div>
                        <Label className="text-sm font-medium text-gray-700 mb-1.5 block">Display Title</Label>
                        <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                          placeholder="e.g. Weekend Special" className="h-11 rounded-xl bg-gray-50/50 border-gray-200 focus:bg-white" data-testid="coupon-title" />
                      </div>
                    </div>
                  </div>

                  <Separator className="bg-gray-100" />

                  {/* Discount Rules */}
                  <div className="space-y-4">
                    <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Discount Rules</p>
                    {isV2 && (
                      <div>
                        <Label className="text-sm font-medium text-gray-700 mb-1.5 block">Discount Type</Label>
                        <Select value={form.discount_type} onValueChange={v => setForm({ ...form, discount_type: v })}>
                          <SelectTrigger className="h-11 rounded-xl bg-gray-50/50" data-testid="discount-type-select"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="flat">Flat Amount (Rs.)</SelectItem>
                            <SelectItem value="percentage">Percentage (%)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-sm font-medium text-gray-700 mb-1.5 block">{isPercentage ? "Discount (%)" : "Discount (Rs.)"}</Label>
                        <Input type="number" value={form.discount_value} onChange={e => setForm({ ...form, discount_value: e.target.value })}
                          placeholder={isPercentage ? "20" : "100"} className="h-11 rounded-xl bg-gray-50/50" required min="0" data-testid="discount-value" />
                      </div>
                      <div>
                        <Label className="text-sm font-medium text-gray-700 mb-1.5 block">{isPercentage ? "Max Discount (Rs.)" : "Min Order (Rs.)"}</Label>
                        <Input type="number" value={isPercentage ? form.max_discount : form.min_order_value}
                          onChange={e => setForm({ ...form, [isPercentage ? "max_discount" : "min_order_value"]: e.target.value })}
                          placeholder={isPercentage ? "No limit" : "0"} className="h-11 rounded-xl bg-gray-50/50" min="0" data-testid="secondary-value" />
                      </div>
                    </div>
                  </div>

                  {/* V2 Selectors */}
                  {form.discount_scope === "item" && (<><Separator className="bg-gray-100" /><ItemSelector items={menuItems} selected={form.eligible_food_ids} onToggle={toggleFoodId} loading={menuLoading} /></>)}
                  {form.discount_scope === "category" && (<><Separator className="bg-gray-100" /><CategorySelector categories={menuCategories} selected={selectedCats} onToggle={toggleCategory} loading={menuLoading} /></>)}

                  <Separator className="bg-gray-100" />

                  {/* Validity */}
                  <div className="space-y-4">
                    <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Validity & Limits</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-sm font-medium text-gray-700 mb-1.5 block">Start Date</Label>
                        <Input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })}
                          className="h-11 rounded-xl bg-gray-50/50" required data-testid="start-date" />
                      </div>
                      <div>
                        <Label className="text-sm font-medium text-gray-700 mb-1.5 block">End Date</Label>
                        <Input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })}
                          className="h-11 rounded-xl bg-gray-50/50" required data-testid="end-date" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-sm font-medium text-gray-700 mb-1.5 block">Total Usage Limit</Label>
                        <Input type="number" value={form.usage_limit} onChange={e => setForm({ ...form, usage_limit: e.target.value })}
                          placeholder="Unlimited" className="h-11 rounded-xl bg-gray-50/50" min="1" data-testid="usage-limit" />
                      </div>
                      <div>
                        <Label className="text-sm font-medium text-gray-700 mb-1.5 block">Per User Limit</Label>
                        <Input type="number" value={form.per_user_limit} onChange={e => setForm({ ...form, per_user_limit: e.target.value })}
                          placeholder="1" className="h-11 rounded-xl bg-gray-50/50" min="1" data-testid="per-user-limit" />
                      </div>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-gray-700 mb-2 block">Channels</Label>
                      <div className="flex gap-2">
                        {[{ id: "dine_in", label: "Dine In" }, { id: "takeaway", label: "Takeaway" }, { id: "delivery", label: "Delivery" }].map(ch => (
                          <button key={ch.id} type="button" onClick={() => toggleChannel(ch.id)}
                            className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${form.applicable_channels.includes(ch.id) ? "bg-[#F26B33] text-white border-[#F26B33] shadow-sm shadow-orange-200" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"}`}
                            data-testid={`ch-${ch.id}`}>
                            {ch.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50/80 border border-gray-100">
                      <div>
                        <p className="text-sm font-medium text-gray-800">Stackable with Loyalty Points</p>
                        <p className="text-xs text-gray-400 mt-0.5">Allow alongside loyalty redemption</p>
                      </div>
                      <Switch checked={form.stackable_with_loyalty} onCheckedChange={v => setForm({ ...form, stackable_with_loyalty: v })} data-testid="stackable-toggle" />
                    </div>
                  </div>

                  <Separator className="bg-gray-100" />

                  {/* Description */}
                  <div>
                    <Label className="text-sm font-medium text-gray-700 mb-1.5 block">Description <span className="text-gray-400 font-normal">(optional)</span></Label>
                    <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                      placeholder="Internal note about this coupon..." className="rounded-xl resize-none bg-gray-50/50" rows={2} data-testid="description" />
                  </div>

                  {/* Advanced */}
                  <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                    <CollapsibleTrigger className="flex items-center gap-2 w-full py-3 text-sm font-medium text-gray-500 hover:text-gray-700" data-testid="advanced-trigger">
                      <Settings2 className="w-4 h-4" /> Advanced Settings
                      {advancedOpen ? <ChevronDown className="w-4 h-4 ml-auto" /> : <ChevronRight className="w-4 h-4 ml-auto" />}
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="p-4 rounded-xl bg-gray-50/80 border border-gray-100 space-y-4 mt-1">
                        {isPercentage && form.discount_scope === "order" && (
                          <div>
                            <Label className="text-sm font-medium text-gray-700 mb-1.5 block">Min Order (Rs.)</Label>
                            <Input type="number" value={form.min_order_value} onChange={e => setForm({ ...form, min_order_value: e.target.value })}
                              placeholder="0" className="h-10 rounded-xl bg-white" min="0" />
                          </div>
                        )}
                        {isV2 && (
                          <>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <Label className="text-sm font-medium text-gray-700 mb-1.5 block">Min Item Qty</Label>
                                <Input type="number" value={form.min_item_qty} onChange={e => setForm({ ...form, min_item_qty: e.target.value })} placeholder="1" className="h-10 rounded-xl bg-white" min="1" />
                              </div>
                              <div>
                                <Label className="text-sm font-medium text-gray-700 mb-1.5 block">Max Applicable Qty</Label>
                                <Input type="number" value={form.max_applicable_qty} onChange={e => setForm({ ...form, max_applicable_qty: e.target.value })} placeholder="No limit" className="h-10 rounded-xl bg-white" min="1" />
                              </div>
                            </div>
                            <div className="flex items-center justify-between py-1">
                              <p className="text-sm text-gray-700">Apply to cheapest item</p>
                              <Switch checked={form.apply_to_cheapest_item} onCheckedChange={v => setForm({ ...form, apply_to_cheapest_item: v, apply_to_highest_item: v ? false : form.apply_to_highest_item })} />
                            </div>
                            <div className="flex items-center justify-between py-1">
                              <p className="text-sm text-gray-700">Apply to highest item</p>
                              <Switch checked={form.apply_to_highest_item} onCheckedChange={v => setForm({ ...form, apply_to_highest_item: v, apply_to_cheapest_item: v ? false : form.apply_to_cheapest_item })} />
                            </div>
                          </>
                        )}
                        <div>
                          <Label className="text-sm font-medium text-gray-700 mb-1.5 block">POS Instruction</Label>
                          <Input value={form.pos_instruction} onChange={e => setForm({ ...form, pos_instruction: e.target.value })}
                            placeholder="Internal note for POS team..." className="h-10 rounded-xl bg-white" />
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                  <div className="h-4" />
                </form>
              )}
            </div>
          </ScrollArea>

          {/* Sticky Footer */}
          {selectedType && (
            <div className="px-6 py-4 border-t border-gray-100 bg-white shrink-0">
              <Button type="submit" form="coupon-form" disabled={submitting}
                className="w-full h-12 bg-[#F26B33] hover:bg-[#D95826] rounded-xl font-semibold text-base shadow-sm shadow-orange-200" data-testid="save-coupon-btn">
                {submitting ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving...</> : (editingCoupon ? "Update Coupon" : "Create Coupon")}
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </ResponsiveLayout>
  );
}
