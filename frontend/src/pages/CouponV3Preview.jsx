import { useState } from "react";
import { ResponsiveLayout } from "@/components/ResponsiveLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger
} from "@/components/ui/collapsible";
import {
  Plus, Search, Percent, DollarSign, ShoppingCart, Grid3X3,
  Clock, Gift, Hash, ChevronDown, ChevronRight, X, Settings2,
  ArrowLeft, Info, Filter, Loader2
} from "lucide-react";

const DAYS = [
  { id: 0, short: "Mon" }, { id: 1, short: "Tue" }, { id: 2, short: "Wed" },
  { id: 3, short: "Thu" }, { id: 4, short: "Fri" }, { id: 5, short: "Sat" }, { id: 6, short: "Sun" },
];

const TIMEZONES = [
  "Asia/Kolkata", "Asia/Dubai", "Asia/Riyadh", "Asia/Singapore",
  "Europe/London", "America/New_York", "America/Los_Angeles",
];

const MOCK_ITEMS = [
  { food_id: "182048", name: "Pistachio Cocoa Celebration Habba Cake", price: 379, category: "Dubai Laban" },
  { food_id: "182036", name: "Hazel Kinder Koshari", price: 379, category: "Indo-Fusion Kunafa" },
  { food_id: "182035", name: "Choco Empire Kabsa", price: 329, category: "Indo-Fusion Kunafa" },
  { food_id: "182041", name: "Golden Caramel Nutty Koshari", price: 379, category: "Exotic Kunafas" },
  { food_id: "182042", name: "Classic Cheese Kunafa", price: 299, category: "Authentic Kunafa" },
  { food_id: "182043", name: "Nutella Kunafa Cone", price: 199, category: "Kunafa Cones" },
  { food_id: "182044", name: "Lotus Biscoff Kunafa Bomb", price: 249, category: "Kunafa Bombs" },
  { food_id: "182045", name: "Iced Americano", price: 149, category: "Coffee Essentials" },
  { food_id: "182046", name: "Kunafa Shake", price: 199, category: "Shakes" },
];
const MOCK_CATEGORIES = [
  { id: "5119", name: "Authentic Kunafa" }, { id: "5117", name: "Exotic Kunafas" },
  { id: "5116", name: "Indo-Fusion Kunafa" }, { id: "5118", name: "Kunafa Cones" },
  { id: "5125", name: "Kunafa Bombs" }, { id: "5124", name: "Chocolates" },
  { id: "5126", name: "Shakes" }, { id: "5127", name: "Coffee Essentials" },
  { id: "5120", name: "Combos" }, { id: "6777", name: "Dubai Laban" },
];

const COUPON_TYPES = [
  { id: "order_flat", label: "Flat Discount", desc: "Fixed amount off", icon: DollarSign, phase: "V1", enabled: true, color: "from-blue-500 to-blue-600" },
  { id: "order_percentage", label: "Percentage Off", desc: "% off order total", icon: Percent, phase: "V1", enabled: true, color: "from-orange-500 to-orange-600" },
  { id: "item_discount", label: "Item Discount", desc: "Discount on specific items", icon: ShoppingCart, phase: "V2", enabled: true, color: "from-purple-500 to-purple-600" },
  { id: "category_discount", label: "Category Discount", desc: "Discount on categories", icon: Grid3X3, phase: "V2", enabled: true, color: "from-emerald-500 to-emerald-600" },
  { id: "time_window", label: "Happy Hour", desc: "Time-based promotional offers", icon: Clock, phase: "V3-A", enabled: true, color: "from-cyan-500 to-cyan-600" },
  { id: "bogo", label: "BOGO / BXGY", desc: "Buy X Get Y offers", icon: Gift, phase: "V3-B", enabled: true, color: "from-pink-500 to-pink-600" },
  { id: "every_nth", label: "Every Nth Item", desc: "Nth item free or discounted", icon: Hash, phase: "V3-C", enabled: true, color: "from-amber-500 to-amber-600" },
];

// ─── Reusable Item Picker ───
function ItemPicker({ label, items, selected, onToggle }) {
  const [q, setQ] = useState("");
  const filtered = items.filter(i => !q || i.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold text-gray-700">{label}</Label>
        <span className="text-xs text-gray-400">{selected.length} selected</span>
      </div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map(id => {
            const it = items.find(i => i.food_id === id);
            return (<Badge key={id} className="bg-purple-50 text-purple-700 border-purple-200 text-xs pl-2.5 pr-1 py-1 gap-1 font-normal">
              {it?.name || id}<button onClick={() => onToggle(id)} className="hover:bg-purple-200/50 rounded-full p-0.5 ml-0.5"><X className="w-3 h-3" /></button>
            </Badge>);
          })}
        </div>
      )}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="relative border-b border-gray-100">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input placeholder="Search items..." value={q} onChange={e => setQ(e.target.value)} className="pl-10 h-10 rounded-none border-0 focus-visible:ring-0 text-sm" />
        </div>
        <div className="max-h-44 overflow-y-auto divide-y divide-gray-50">
          {filtered.map(item => (
            <label key={item.food_id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer">
              <Checkbox checked={selected.includes(item.food_id)} onCheckedChange={() => onToggle(item.food_id)} className="data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600" />
              <div className="flex-1 min-w-0"><p className="text-sm font-medium text-gray-800 truncate">{item.name}</p><p className="text-xs text-gray-400">{item.category} · Rs.{item.price}</p></div>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Reusable Category Picker ───
function CategoryPicker({ label, categories, selected, onToggle }) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-semibold text-gray-700">{label}</Label>
      <div className="flex flex-wrap gap-2">
        {categories.map(cat => {
          const isSel = selected.some(s => s.id === cat.id);
          return (<button key={cat.id} type="button" onClick={() => onToggle(cat)}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium border transition-all ${isSel ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-gray-600 border-gray-200 hover:border-emerald-300"}`}>
            {cat.name}
          </button>);
        })}
      </div>
    </div>
  );
}

// ─── Offer Summary ───
function OfferSummary({ type, state }) {
  let text = "";
  if (type === "time_window") {
    const dayNames = (state.validDays || []).map(d => DAYS.find(dd => dd.id === d)?.short).filter(Boolean).join(", ");
    text = `Happy Hour: ${state.discountValue || "?"}${state.discountType === "percentage" ? "%" : " Rs."} off on orders${dayNames ? ` every ${dayNames}` : ""}${state.startTime && state.endTime ? ` from ${state.startTime} to ${state.endTime}` : ""}${state.timezone ? ` (${state.timezone})` : ""}.`;
  } else if (type === "bogo") {
    const getBenefit = state.getDiscountType === "free" ? "free" : state.getDiscountType === "percentage" ? `${state.getDiscountValue || "?"}% off` : `Rs.${state.getDiscountValue || "?"} off`;
    text = `Buy ${state.buyQty || "?"} item(s), get ${state.getQty || "?"} item(s) ${getBenefit}.${state.maxApplications ? ` Max ${state.maxApplications} application(s) per order.` : ""}${state.sameItem ? " Same item required." : ""}`;
  } else if (type === "every_nth") {
    const nthBenefit = state.nthDiscountType === "free" ? "free" : state.nthDiscountType === "percentage" ? `${state.nthDiscountValue || "?"}% off` : `Rs.${state.nthDiscountValue || "?"} off`;
    text = `Every ${state.nthNumber || "?"}th item is ${nthBenefit}.${state.maxApplications ? ` Max ${state.maxApplications} free item(s) per order.` : ""}`;
  }
  if (!text) return null;
  return (
    <div className="p-4 rounded-xl bg-blue-50/80 border border-blue-200">
      <p className="text-xs font-bold uppercase tracking-widest text-blue-500 mb-1">Offer Preview</p>
      <p className="text-sm text-blue-800 leading-relaxed">{text}</p>
    </div>
  );
}

export default function CouponV3Preview() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedType, setSelectedType] = useState(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // V3-A state
  const [validDays, setValidDays] = useState([]);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [discountType, setDiscountType] = useState("percentage");
  const [discountValue, setDiscountValue] = useState("");

  // V3-B state
  const [bogoMode, setBogoMode] = useState("bogo"); // "bogo" | "bxgy"
  const [buyQty, setBuyQty] = useState("1");
  const [getQty, setGetQty] = useState("1");
  const [getDiscountType, setGetDiscountType] = useState("free");
  const [getDiscountValue, setGetDiscountValue] = useState("");
  const [sameItem, setSameItem] = useState(true);
  const [buyFoodIds, setBuyFoodIds] = useState([]);
  const [getFoodIds, setGetFoodIds] = useState([]);
  const [buyCatIds, setBuyCatIds] = useState([]);
  const [getCatIds, setGetCatIds] = useState([]);
  const [maxApplications, setMaxApplications] = useState("");
  const [allowRepeat, setAllowRepeat] = useState(true);
  const [cheapest, setCheapest] = useState(false);
  const [highest, setHighest] = useState(false);
  const [posInstruction, setPosInstruction] = useState("");

  // V3-C state
  const [nthNumber, setNthNumber] = useState("");
  const [nthDiscountType, setNthDiscountType] = useState("free");
  const [nthDiscountValue, setNthDiscountValue] = useState("");
  const [nthFoodIds, setNthFoodIds] = useState([]);
  const [nthCatIds, setNthCatIds] = useState([]);
  const [excludedFoodIds, setExcludedFoodIds] = useState([]);

  const toggleDay = (d) => setValidDays(p => p.includes(d) ? p.filter(x => x !== d) : [...p, d]);
  const toggleList = (list, setList, id) => setList(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const toggleCatList = (list, setList, cat) => setList(p => p.some(c => c.id === cat.id) ? p.filter(c => c.id !== cat.id) : [...p, cat]);

  const resetState = () => {
    setValidDays([]); setStartTime(""); setEndTime(""); setTimezone("Asia/Kolkata");
    setDiscountType("percentage"); setDiscountValue("");
    setBogoMode("bogo"); setBuyQty("1"); setGetQty("1"); setGetDiscountType("free"); setGetDiscountValue("");
    setSameItem(true); setBuyFoodIds([]); setGetFoodIds([]); setBuyCatIds([]); setGetCatIds([]);
    setMaxApplications(""); setAllowRepeat(true); setCheapest(false); setHighest(false); setPosInstruction("");
    setNthNumber(""); setNthDiscountType("free"); setNthDiscountValue("");
    setNthFoodIds([]); setNthCatIds([]); setExcludedFoodIds([]);
    setAdvancedOpen(false);
  };

  const openCreate = () => { resetState(); setSelectedType(null); setSheetOpen(true); };
  const typeConfig = COUPON_TYPES.find(t => t.id === selectedType);

  return (
    <ResponsiveLayout>
      <div className="p-4 lg:p-6 xl:p-8 max-w-[1600px] mx-auto">
        {/* Preview Banner */}
        <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-amber-800">V3 Coupon UI Preview — For Approval Only</p>
              <p className="text-sm text-amber-700 mt-1">Non-functional mockup showing V3-A (Happy Hour), V3-B (BOGO/BXGY), V3-C (Every Nth) forms. No data is saved. Review and approve.</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Coupons — V3 Preview</h1>
            <p className="text-sm text-gray-500 mt-0.5">V3-A Happy Hour · V3-B BOGO/BXGY · V3-C Every Nth</p>
          </div>
          <Button onClick={openCreate} className="h-11 rounded-xl bg-[#F26B33] hover:bg-[#D95826] px-6 font-semibold shadow-sm shadow-orange-200">
            <Plus className="w-4 h-4 mr-2" /> Preview New Coupon
          </Button>
        </div>
      </div>

      {/* ━━━ DRAWER ━━━ */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-[580px] p-0 flex flex-col" side="right">
          <SheetHeader className="px-6 pt-6 pb-4 border-b border-gray-100 shrink-0">
            <div className="flex items-center gap-3">
              {selectedType && (
                <button onClick={() => setSelectedType(null)} className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50">
                  <ArrowLeft className="w-4 h-4 text-gray-500" />
                </button>
              )}
              <div>
                <SheetTitle className="text-lg font-bold text-gray-900">{selectedType ? "Create Coupon" : "Choose Coupon Type"}</SheetTitle>
                <SheetDescription className="text-sm text-gray-500 mt-0.5">{selectedType ? typeConfig?.label : "All 7 types including V3"}</SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <ScrollArea className="flex-1">
            <div className="px-6 py-5">
              {/* Type Selector */}
              {!selectedType && (
                <div className="space-y-3">
                  {COUPON_TYPES.map(t => (
                    <button key={t.id} onClick={() => { setSelectedType(t.id); resetState(); }}
                      className="w-full text-left p-4 rounded-xl border-2 border-gray-150 bg-white hover:border-[#F26B33]/40 hover:shadow-sm cursor-pointer transition-all group"
                      data-testid={`type-${t.id}`}>
                      <div className="flex items-center gap-4">
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-br ${t.color} text-white shadow-sm`}><t.icon className="w-5 h-5" /></div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-gray-900">{t.label}</p>
                            <Badge className="text-[9px] px-1.5 py-0 font-mono bg-gray-100 text-gray-500 border-gray-200">{t.phase}</Badge>
                          </div>
                          <p className="text-xs mt-0.5 text-gray-500">{t.desc}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-[#F26B33] shrink-0" />
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* ━━━ V3-A: Happy Hour ━━━ */}
              {selectedType === "time_window" && (
                <div className="space-y-6">
                  <div className="space-y-4">
                    <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Coupon Details</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label className="text-sm font-medium text-gray-700 mb-1.5 block">Code</Label><Input placeholder="e.g. HAPPYHOUR" className="h-11 rounded-xl font-mono uppercase bg-gray-50/50" /></div>
                      <div><Label className="text-sm font-medium text-gray-700 mb-1.5 block">Title</Label><Input placeholder="e.g. Lunch Happy Hour" className="h-11 rounded-xl bg-gray-50/50" /></div>
                    </div>
                  </div>
                  <Separator className="bg-gray-100" />
                  <div className="space-y-4">
                    <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Discount</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-sm font-medium text-gray-700 mb-1.5 block">Type</Label>
                        <Select value={discountType} onValueChange={setDiscountType}>
                          <SelectTrigger className="h-11 rounded-xl bg-gray-50/50"><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="flat">Flat (Rs.)</SelectItem><SelectItem value="percentage">Percentage (%)</SelectItem></SelectContent>
                        </Select>
                      </div>
                      <div><Label className="text-sm font-medium text-gray-700 mb-1.5 block">Value</Label><Input type="number" value={discountValue} onChange={e => setDiscountValue(e.target.value)} placeholder={discountType === "percentage" ? "20" : "100"} className="h-11 rounded-xl bg-gray-50/50" /></div>
                    </div>
                  </div>
                  <Separator className="bg-gray-100" />
                  <div className="space-y-4">
                    <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Time Window</p>
                    <div>
                      <Label className="text-sm font-medium text-gray-700 mb-2 block">Valid Days</Label>
                      <div className="flex gap-1.5">
                        {DAYS.map(d => (
                          <button key={d.id} type="button" onClick={() => toggleDay(d.id)}
                            className={`w-11 h-11 rounded-xl text-sm font-semibold border transition-all ${validDays.includes(d.id) ? "bg-cyan-600 text-white border-cyan-600 shadow-sm" : "bg-white text-gray-500 border-gray-200 hover:border-cyan-300"}`}>
                            {d.short}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label className="text-sm font-medium text-gray-700 mb-1.5 block">Start Time</Label><Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="h-11 rounded-xl bg-gray-50/50" /></div>
                      <div><Label className="text-sm font-medium text-gray-700 mb-1.5 block">End Time</Label><Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="h-11 rounded-xl bg-gray-50/50" /></div>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-gray-700 mb-1.5 block">Timezone</Label>
                      <Select value={timezone} onValueChange={setTimezone}>
                        <SelectTrigger className="h-11 rounded-xl bg-gray-50/50"><SelectValue /></SelectTrigger>
                        <SelectContent>{TIMEZONES.map(tz => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Separator className="bg-gray-100" />
                  <div className="space-y-4">
                    <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Validity</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label className="text-sm font-medium text-gray-700 mb-1.5 block">Start Date</Label><Input type="date" className="h-11 rounded-xl bg-gray-50/50" /></div>
                      <div><Label className="text-sm font-medium text-gray-700 mb-1.5 block">End Date</Label><Input type="date" className="h-11 rounded-xl bg-gray-50/50" /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label className="text-sm font-medium text-gray-700 mb-1.5 block">Usage Limit</Label><Input type="number" placeholder="Unlimited" className="h-11 rounded-xl bg-gray-50/50" /></div>
                      <div><Label className="text-sm font-medium text-gray-700 mb-1.5 block">Per User Limit</Label><Input type="number" placeholder="1" defaultValue="1" className="h-11 rounded-xl bg-gray-50/50" /></div>
                    </div>
                  </div>
                  <OfferSummary type="time_window" state={{ discountType, discountValue, validDays, startTime, endTime, timezone }} />
                </div>
              )}

              {/* ━━━ V3-B: BOGO / BXGY ━━━ */}
              {selectedType === "bogo" && (
                <div className="space-y-6">
                  <div className="space-y-4">
                    <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Coupon Details</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label className="text-sm font-medium text-gray-700 mb-1.5 block">Code</Label><Input placeholder="e.g. BOGO_KUNAFA" className="h-11 rounded-xl font-mono uppercase bg-gray-50/50" /></div>
                      <div><Label className="text-sm font-medium text-gray-700 mb-1.5 block">Title</Label><Input placeholder="e.g. Buy 1 Get 1 Free" className="h-11 rounded-xl bg-gray-50/50" /></div>
                    </div>
                  </div>
                  <Separator className="bg-gray-100" />
                  <div className="space-y-4">
                    <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Offer Type</p>
                    <div className="flex gap-2">
                      {[{ id: "bogo", label: "Buy 1 Get 1 (BOGO)" }, { id: "bxgy", label: "Buy X Get Y" }].map(m => (
                        <button key={m.id} type="button" onClick={() => setBogoMode(m.id)}
                          className={`flex-1 py-3 rounded-xl text-sm font-semibold border-2 transition-all ${bogoMode === m.id ? "bg-pink-50 text-pink-700 border-pink-400" : "bg-white text-gray-500 border-gray-200 hover:border-pink-300"}`}>
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Separator className="bg-gray-100" />
                  <div className="space-y-4">
                    <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Buy / Get Rules</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label className="text-sm font-medium text-gray-700 mb-1.5 block">Buy Quantity</Label><Input type="number" value={buyQty} onChange={e => setBuyQty(e.target.value)} min="1" className="h-11 rounded-xl bg-gray-50/50" /></div>
                      <div><Label className="text-sm font-medium text-gray-700 mb-1.5 block">Get Quantity</Label><Input type="number" value={getQty} onChange={e => setGetQty(e.target.value)} min="1" className="h-11 rounded-xl bg-gray-50/50" /></div>
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50/80 border border-gray-100">
                      <div><p className="text-sm font-medium text-gray-800">Same Item Required</p><p className="text-xs text-gray-400 mt-0.5">Buy and get must be the same item</p></div>
                      <Switch checked={sameItem} onCheckedChange={setSameItem} />
                    </div>
                    <ItemPicker label="Buy Items (what customer buys)" items={MOCK_ITEMS} selected={buyFoodIds} onToggle={(id) => toggleList(buyFoodIds, setBuyFoodIds, id)} />
                    {!sameItem && <ItemPicker label="Get Items (what customer receives)" items={MOCK_ITEMS} selected={getFoodIds} onToggle={(id) => toggleList(getFoodIds, setGetFoodIds, id)} />}
                  </div>
                  <Separator className="bg-gray-100" />
                  <div className="space-y-4">
                    <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Get Benefit</p>
                    <div className="flex gap-2">
                      {[{ id: "free", label: "Free" }, { id: "percentage", label: "% Off" }, { id: "flat", label: "Rs. Off" }].map(b => (
                        <button key={b.id} type="button" onClick={() => setGetDiscountType(b.id)}
                          className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all ${getDiscountType === b.id ? "bg-pink-600 text-white border-pink-600" : "bg-white text-gray-500 border-gray-200"}`}>
                          {b.label}
                        </button>
                      ))}
                    </div>
                    {getDiscountType !== "free" && (
                      <div><Label className="text-sm font-medium text-gray-700 mb-1.5 block">{getDiscountType === "percentage" ? "Discount (%)" : "Discount (Rs.)"}</Label>
                        <Input type="number" value={getDiscountValue} onChange={e => setGetDiscountValue(e.target.value)} placeholder={getDiscountType === "percentage" ? "50" : "100"} className="h-11 rounded-xl bg-gray-50/50" />
                      </div>
                    )}
                  </div>
                  <Separator className="bg-gray-100" />
                  <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                    <CollapsibleTrigger className="flex items-center gap-2 w-full py-3 text-sm font-medium text-gray-500 hover:text-gray-700">
                      <Settings2 className="w-4 h-4" /> Advanced Settings {advancedOpen ? <ChevronDown className="w-4 h-4 ml-auto" /> : <ChevronRight className="w-4 h-4 ml-auto" />}
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="p-4 rounded-xl bg-gray-50/80 border border-gray-100 space-y-4 mt-1">
                        <div className="grid grid-cols-2 gap-3">
                          <div><Label className="text-sm font-medium text-gray-700 mb-1.5 block">Max Applications</Label><Input type="number" value={maxApplications} onChange={e => setMaxApplications(e.target.value)} placeholder="No limit" className="h-10 rounded-xl bg-white" /></div>
                          <div className="flex items-center justify-between pt-6"><p className="text-sm text-gray-700">Allow Repeat</p><Switch checked={allowRepeat} onCheckedChange={setAllowRepeat} /></div>
                        </div>
                        <div className="flex items-center justify-between py-1"><p className="text-sm text-gray-700">Apply to cheapest item</p><Switch checked={cheapest} onCheckedChange={v => { setCheapest(v); if (v) setHighest(false); }} /></div>
                        <div className="flex items-center justify-between py-1"><p className="text-sm text-gray-700">Apply to highest item</p><Switch checked={highest} onCheckedChange={v => { setHighest(v); if (v) setCheapest(false); }} /></div>
                        <div><Label className="text-sm font-medium text-gray-700 mb-1.5 block">POS Instruction</Label><Input value={posInstruction} onChange={e => setPosInstruction(e.target.value)} placeholder="e.g. Add free item at counter" className="h-10 rounded-xl bg-white" /></div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                  <OfferSummary type="bogo" state={{ buyQty, getQty, getDiscountType, getDiscountValue, maxApplications, sameItem }} />
                </div>
              )}

              {/* ━━━ V3-C: Every Nth ━━━ */}
              {selectedType === "every_nth" && (
                <div className="space-y-6">
                  <div className="space-y-4">
                    <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Coupon Details</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label className="text-sm font-medium text-gray-700 mb-1.5 block">Code</Label><Input placeholder="e.g. 5TH_FREE" className="h-11 rounded-xl font-mono uppercase bg-gray-50/50" /></div>
                      <div><Label className="text-sm font-medium text-gray-700 mb-1.5 block">Title</Label><Input placeholder="e.g. Every 5th Coffee Free" className="h-11 rounded-xl bg-gray-50/50" /></div>
                    </div>
                  </div>
                  <Separator className="bg-gray-100" />
                  <div className="space-y-4">
                    <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Nth Item Rule</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-sm font-medium text-gray-700 mb-1.5 block">Every Nth Item</Label>
                        <Input type="number" value={nthNumber} onChange={e => setNthNumber(e.target.value)} placeholder="e.g. 5" min="2" className="h-11 rounded-xl bg-gray-50/50" />
                        <p className="text-xs text-gray-400 mt-1">e.g. 5 = every 5th item gets the benefit</p>
                      </div>
                      <div>
                        <Label className="text-sm font-medium text-gray-700 mb-1.5 block">Benefit Type</Label>
                        <Select value={nthDiscountType} onValueChange={setNthDiscountType}>
                          <SelectTrigger className="h-11 rounded-xl bg-gray-50/50"><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="free">Free</SelectItem><SelectItem value="percentage">% Off</SelectItem><SelectItem value="flat">Rs. Off</SelectItem></SelectContent>
                        </Select>
                      </div>
                    </div>
                    {nthDiscountType !== "free" && (
                      <div><Label className="text-sm font-medium text-gray-700 mb-1.5 block">{nthDiscountType === "percentage" ? "Discount (%)" : "Discount (Rs.)"}</Label>
                        <Input type="number" value={nthDiscountValue} onChange={e => setNthDiscountValue(e.target.value)} placeholder={nthDiscountType === "percentage" ? "50" : "100"} className="h-11 rounded-xl bg-gray-50/50" />
                      </div>
                    )}
                  </div>
                  <Separator className="bg-gray-100" />
                  <div className="space-y-4">
                    <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Eligible Items</p>
                    <ItemPicker label="Items eligible for Nth discount" items={MOCK_ITEMS} selected={nthFoodIds} onToggle={(id) => toggleList(nthFoodIds, setNthFoodIds, id)} />
                    <CategoryPicker label="Or select by category" categories={MOCK_CATEGORIES} selected={nthCatIds} onToggle={(cat) => toggleCatList(nthCatIds, setNthCatIds, cat)} />
                  </div>
                  <Separator className="bg-gray-100" />
                  <ItemPicker label="Excluded Items (won't count for Nth)" items={MOCK_ITEMS} selected={excludedFoodIds} onToggle={(id) => toggleList(excludedFoodIds, setExcludedFoodIds, id)} />
                  <Separator className="bg-gray-100" />
                  <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                    <CollapsibleTrigger className="flex items-center gap-2 w-full py-3 text-sm font-medium text-gray-500 hover:text-gray-700">
                      <Settings2 className="w-4 h-4" /> Advanced Settings {advancedOpen ? <ChevronDown className="w-4 h-4 ml-auto" /> : <ChevronRight className="w-4 h-4 ml-auto" />}
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="p-4 rounded-xl bg-gray-50/80 border border-gray-100 space-y-4 mt-1">
                        <div className="grid grid-cols-2 gap-3">
                          <div><Label className="text-sm font-medium text-gray-700 mb-1.5 block">Max Applications</Label><Input type="number" value={maxApplications} onChange={e => setMaxApplications(e.target.value)} placeholder="No limit" className="h-10 rounded-xl bg-white" /></div>
                          <div className="flex items-center justify-between pt-6"><p className="text-sm text-gray-700">Allow Repeat</p><Switch checked={allowRepeat} onCheckedChange={setAllowRepeat} /></div>
                        </div>
                        <div className="flex items-center justify-between py-1"><p className="text-sm text-gray-700">Apply to cheapest item</p><Switch checked={cheapest} onCheckedChange={v => { setCheapest(v); if (v) setHighest(false); }} /></div>
                        <div className="flex items-center justify-between py-1"><p className="text-sm text-gray-700">Apply to highest item</p><Switch checked={highest} onCheckedChange={v => { setHighest(v); if (v) setCheapest(false); }} /></div>
                        <div><Label className="text-sm font-medium text-gray-700 mb-1.5 block">POS Instruction</Label><Input value={posInstruction} onChange={e => setPosInstruction(e.target.value)} placeholder="e.g. 5th item automatically free" className="h-10 rounded-xl bg-white" /></div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                  <OfferSummary type="every_nth" state={{ nthNumber, nthDiscountType, nthDiscountValue, maxApplications }} />
                </div>
              )}

              {/* V1/V2 placeholder */}
              {selectedType && !["time_window", "bogo", "every_nth"].includes(selectedType) && (
                <div className="text-center py-12">
                  <p className="text-gray-500">V1/V2 form — already implemented on <span className="font-mono text-[#F26B33]">/coupons</span></p>
                </div>
              )}

              <div className="h-6" />
            </div>
          </ScrollArea>

          {selectedType && ["time_window", "bogo", "every_nth"].includes(selectedType) && (
            <div className="px-6 py-4 border-t border-gray-100 bg-white shrink-0">
              <Button className="w-full h-12 bg-[#F26B33] hover:bg-[#D95826] rounded-xl font-semibold text-base shadow-sm shadow-orange-200" disabled>
                Preview Only — Create Coupon
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </ResponsiveLayout>
  );
}
