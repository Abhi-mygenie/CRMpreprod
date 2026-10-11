# CR-076 — Implementation Plan
## Customer Lifecycle Re-Engage: Bulk Campaign + Automation

**Date**: 2026-08-05  
**Role**: Planning Agent — Implementation Plan  
**Source**: CR_076_LIFECYCLE_REENGAGE_INTAKE.md · CR_076 Impact Analysis  
**Risk**: MEDIUM  
**Dependency**: CR-077 E-A (schema) should land first — CR-076 E-A reads `loyalty_settings`  
  for configurable lifecycle boundaries. Zero behavior change if CR-077 is not yet deployed  
  (fallback defaults = current hardcoded values).

---

## Owner Decisions (Locked)

| Q | Answer |
|---|---|
| Q1 | Per-row: open inline modal on Lifecycle page |
| Q2 | Bulk: "Re-engage [Stage] (N)" button when stage card selected |
| Q3 | Recurring daily campaign re-sends to all currently-in-stage customers |
| Q4 | Add all 5 lifecycle stages to Audiences accordion |
| Q5 | Segment-first flow (use existing Campaign Wizard) |

---

## 5 Edits — Edit-by-Edit

---

### E-A · `backend/core/helpers.py`
**Line**: Insert before `return query` at line 488  
**What**: Add `lifecycle_stage` filter block  
**Risk**: LOW — new block, existing blocks untouched  
**CR-077 integration**: Automatically reads from `loyalty_settings` (if CR-077 is deployed);  
falls back to defaults (30/60/90) if not. Follows existing async DB query pattern at lines 454–477.

```python
# ── CR-076: Lifecycle stage filter ──────────────────────────────────────
if filters.get("lifecycle_stage") and filters["lifecycle_stage"] != "all":
    _ls = await _db.loyalty_settings.find_one({"user_id": user_id}, {"_id": 0}) or {}
    now = datetime.now(timezone.utc)
    _active_days = (_ls.get("at_risk_days_start", 31) - 1)  # default 30
    _risk_end    = _ls.get("at_risk_days_end", 60)
    _dormant_end = _ls.get("dormant_days_end", 90)
    _new_max_v   = _ls.get("new_customer_max_visits", 1)
    _t30 = (now - timedelta(days=_active_days)).isoformat()
    _t60 = (now - timedelta(days=_risk_end)).isoformat()
    _t90 = (now - timedelta(days=_dormant_end)).isoformat()
    stage_val = filters["lifecycle_stage"]
    if stage_val == "new":
        query["total_visits"] = {"$lte": _new_max_v}
        query["last_visit"]   = {"$gte": _t30}
    elif stage_val == "active":
        query["total_visits"] = {"$gte": _new_max_v + 1}
        query["last_visit"]   = {"$gte": _t30}
    elif stage_val == "at_risk":
        query["last_visit"] = {"$lt": _t30, "$gte": _t60}
    elif stage_val == "dormant":
        query["last_visit"] = {"$lt": _t60, "$gte": _t90}
    elif stage_val == "churned":
        query["$and"] = query.get("$and", []) + [
            {"$or": [{"last_visit": {"$lt": _t90}}, {"last_visit": None}]}
        ]
    elif stage_val == "lapsing":   # At Risk + Dormant combo
        query["last_visit"] = {"$lt": _t30, "$gte": _t90}
    elif stage_val == "winback":   # Dormant + Churned combo
        query["$and"] = query.get("$and", []) + [
            {"$or": [{"last_visit": {"$lt": _t60}}, {"last_visit": None}]}
        ]
```

**Verify**: `filters={"lifecycle_stage":"churned"}` on Hungry Keya tenant returns < total customers

---

### E-B · `frontend/src/pages/AudiencesPage.jsx`
**What**: 3 sub-changes  
**Risk**: LOW — additive to existing accordion, no existing sections modified

**E-B.1** — Add `lifecycle_stage` to `DEFAULT_FILTERS` (after line 48):
```js
// Section 0: Lifecycle Stage (CR-076)
lifecycle_stage: "all",
```

**E-B.2** — Add `lifecycle: false` to `openSections` state (line 56):
```js
const [openSections, setOpenSections] = useState({
    lifecycle: false,   // CR-076 — new
    loyalty: true, dates: true, engagement: false, flags: false, tags: false
});
```

**E-B.3** — Add "Section 0: Lifecycle Stage" accordion **before** the existing Section 1 (before `{/* ── Section 1: Loyalty & Tier ── */}` at line 429):
```jsx
{/* ── Section 0: Lifecycle Stage (CR-076) ── */}
<AccordionItem value="lifecycle" className="border rounded-lg mb-2 overflow-hidden">
  <AccordionTrigger ...>
    <span>Lifecycle Stage</span>
    {newFilters.lifecycle_stage && newFilters.lifecycle_stage !== "all" && (
      <span className="ml-auto mr-2 text-[10px] bg-[#1a1a1a] text-white px-2 py-0.5 rounded-full">1</span>
    )}
  </AccordionTrigger>
  <AccordionContent className="px-4 pb-4">
    <Label className="text-xs font-semibold uppercase text-gray-500">Stage</Label>
    <Select value={newFilters.lifecycle_stage}
            onValueChange={v => setNewFilters(p => ({...p, lifecycle_stage: v}))}>
      <SelectTrigger data-testid="lifecycle-stage-select">
        <SelectValue placeholder="All stages" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Stages</SelectItem>
        <SelectItem value="new">New (first-time, active ≤ 30d)</SelectItem>
        <SelectItem value="active">Active (returning, active ≤ 30d)</SelectItem>
        <SelectItem value="at_risk">At Risk (31–60 days inactive)</SelectItem>
        <SelectItem value="dormant">Dormant (61–90 days inactive)</SelectItem>
        <SelectItem value="churned">Churned (90+ days inactive)</SelectItem>
        <SelectItem value="lapsing">Lapsing (At Risk + Dormant)</SelectItem>
        <SelectItem value="winback">Win-Back Pack (Dormant + Churned)</SelectItem>
      </SelectContent>
    </Select>
  </AccordionContent>
</AccordionItem>
```

Also add `lifecycle_stage` to `getFilterTags()` chip display function (around line 138):
```js
if (filters.lifecycle_stage && filters.lifecycle_stage !== "all")
    tags.push(`Stage: ${filters.lifecycle_stage}`);
```

**Verify**: Create segment with `lifecycle_stage=churned` → preview count matches Lifecycle page churned count

---

### E-C · `frontend/src/pages/CustomerLifecyclePage.jsx`
**What**: Replace dead `navigate()` with inline Re-engage modal  
**Risk**: LOW — replaces broken behavior with working modal; no data fetch changes

**E-C.1** — Add state for Re-engage modal (after existing state declarations):
```js
// CR-076: Re-engage modal state
const [reengageModal, setReengageModal] = useState({ open: false, customer: null });
const [reengageTemplates, setReengageTemplates] = useState([]);
const [reengageTemplate, setReengageTemplate] = useState("");
const [reengageSending, setReengageSending] = useState(false);
```

**E-C.2** — Replace `handleReengage` (lines 291–294) with:
```js
const handleReengage = async (customerId) => {
    const customer = customers.find(c => c.id === customerId);
    if (!customer) return;
    setReengageModal({ open: true, customer });
    setReengageTemplate("");
    if (reengageTemplates.length === 0) {
        try {
            const res = await api.get("/whatsapp/authkey-templates");
            setReengageTemplates((res.data || []).filter(t => t.temp_status === 1));
        } catch { /* silent */ }
    }
};
```

**E-C.3** — Add `handleReengageSend` function:
```js
const handleReengageSend = async () => {
    if (!reengageTemplate || !reengageModal.customer) return;
    setReengageSending(true);
    try {
        // Use DirectSend via WhatsApp automation test-send endpoint
        await api.post("/whatsapp/direct-send", {
            phone: reengageModal.customer.phone,
            template_id: reengageTemplate,
            customer_id: reengageModal.customer.id,
        });
        toast.success(`Message sent to ${reengageModal.customer.name}`);
        setReengageModal({ open: false, customer: null });
    } catch (err) {
        toast.error(err.response?.data?.detail || "Failed to send message");
    } finally {
        setReengageSending(false);
    }
};
```

**E-C.4** — Add Re-engage Modal JSX (before `</ResponsiveLayout>` closing tag):
```jsx
{/* CR-076: Per-row Re-engage Modal */}
{reengageModal.open && reengageModal.customer && (
    <Dialog open={reengageModal.open} onOpenChange={open => !open && setReengageModal({ open: false, customer: null })}>
      <DialogContent className="sm:max-w-md" data-testid="reengage-modal">
        <DialogHeader>
          <DialogTitle>Send WhatsApp Message</DialogTitle>
          <DialogDescription>Send a re-engagement message to this customer</DialogDescription>
        </DialogHeader>
        {/* Customer context */}
        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
          <div className="w-10 h-10 rounded-lg bg-[#FFF3EE] flex items-center justify-center font-bold text-[#F26B33]">
            {reengageModal.customer.name?.split(" ").map(w => w[0]).join("").toUpperCase().slice(0,2) || "??"}
          </div>
          <div>
            <p className="font-semibold">{reengageModal.customer.name}</p>
            <p className="text-xs text-gray-500">{reengageModal.customer.phone}</p>
          </div>
          <StageBadge stage={reengageModal.customer.stage} />
        </div>
        {/* Template picker */}
        <div>
          <label className="text-xs font-semibold uppercase text-gray-500">WhatsApp Template</label>
          <Select value={reengageTemplate} onValueChange={setReengageTemplate}>
            <SelectTrigger data-testid="reengage-template-select">
              <SelectValue placeholder="Select approved template..." />
            </SelectTrigger>
            <SelectContent>
              {reengageTemplates.map(t => (
                <SelectItem key={t.wid || t.id} value={String(t.wid || t.id)}>
                  {t.temp_name || t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setReengageModal({ open: false, customer: null })}>Cancel</Button>
          <Button onClick={handleReengageSend} disabled={!reengageTemplate || reengageSending}
                  className="bg-[#25D366] hover:bg-[#128C4E] text-white" data-testid="reengage-send-btn">
            {reengageSending ? "Sending..." : "Send Message"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
)}
```

**E-C.5** — Add "Re-engage [Stage] (N)" bulk banner when stage is selected:
In the existing header actions area (around line 320), add after Export button:
```jsx
{selectedStage !== "all" && ["at_risk","dormant","churned"].includes(selectedStage) && (
    <Button
        size="sm"
        className="bg-[#F26B33] hover:bg-[#D85A22] text-white"
        onClick={() => navigate(`/campaigns/new?audience_stage=${selectedStage}&audience_count=${summary[selectedStage]?.count || 0}`)}
        data-testid="bulk-reengage-btn"
    >
        <MessageSquare className="w-4 h-4 mr-1" />
        Re-engage {STAGE_CONFIG[selectedStage]?.label} ({(summary[selectedStage]?.count || 0).toLocaleString()})
    </Button>
)}
```

Add imports needed: `Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter` from shadcn, `Select, SelectContent, SelectItem, SelectTrigger, SelectValue`.

**Verify**:
- Re-engage button on churned customer row opens modal with name + stage badge
- Template dropdown shows only approved (temp_status=1) templates
- Bulk "Re-engage Churned (N)" button appears when Churned stage card is selected
- Bulk button navigates to `/campaigns/new?audience_stage=churned&audience_count=N`

---

### E-D · `frontend/src/pages/CustomerDetailPage.jsx`
**What**: Handle `?action=reengage` URL param — open WhatsApp send modal on mount  
**Risk**: LOW — additive import + mount effect only, no existing logic changed

**E-D.1** — Add `useSearchParams` to router import (line 2):
```js
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
```

**E-D.2** — Add state + effect for reengage action (after existing state at ~line 44):
```js
const [searchParams] = useSearchParams();              // CR-076
const [showReengageModal, setShowReengageModal] = useState(false); // CR-076
// Auto-open reengage modal if ?action=reengage in URL
useEffect(() => {
    if (searchParams.get("action") === "reengage" && customer) {
        setShowReengageModal(true);
    }
}, [searchParams, customer]);
```

**E-D.3** — Add minimal Re-engage CTA button on the page (in the customer header action area — near existing Edit button):
```jsx
{["at_risk","dormant","churned"].includes(customer?.lifecycle_stage) && (
    <Button size="sm" variant="outline"
            className="text-[#F26B33] border-[#F26B33] hover:bg-[#F26B33] hover:text-white"
            onClick={() => setShowReengageModal(true)}
            data-testid="detail-reengage-btn">
        <MessageCircle className="w-4 h-4 mr-1" /> Re-engage
    </Button>
)}
```

Note: `lifecycle_stage` is not currently stored on customers — this button will only show if the detail page starts computing it. For now, the button shows unconditionally from `?action=reengage` link (the URL param modal is the primary path).

**Verify**: Navigate to `/customers/{id}?action=reengage` → modal opens automatically

---

### E-E · `frontend/src/pages/CampaignWizardPage.jsx`
**What**: Read `?audience_stage=` URL param on mount → pre-populate audience with lifecycle segment  
**Risk**: LOW — additive mount effect only; no existing wizard logic changed

**E-E.1** — Add `useSearchParams` to imports (line ~5):
```js
import { ..., useSearchParams } from "react-router-dom";
```

**E-E.2** — Add `useSearchParams` hook + mount effect (after existing state declarations ~line 37):
```js
const [searchParams] = useSearchParams(); // CR-076

// Pre-fill audience from lifecycle page navigation
useEffect(() => {
    const audienceStage = searchParams.get("audience_stage");
    const audienceCount = parseInt(searchParams.get("audience_count") || "0");
    if (audienceStage && audienceStage !== "all") {
        const STAGE_LABELS = {
            new: "New Customers", active: "Active Customers",
            at_risk: "At Risk Customers", dormant: "Dormant Customers",
            churned: "Churned Customers", lapsing: "Lapsing Customers",
            winback: "Win-Back Pack",
        };
        // Use lifecycle_stage as audience_id (build_customer_query will resolve it)
        setAudienceId(`lifecycle_stage:${audienceStage}`);
        setAudienceName(STAGE_LABELS[audienceStage] || audienceStage);
        setAudienceCount(audienceCount);
    }
}, []); // eslint-disable-line react-hooks/exhaustive-deps
```

**E-E.3** — Handle `lifecycle_stage:` prefixed audience ID in campaign save payload.
When `audienceId` starts with `lifecycle_stage:`, the Campaign Wizard sends it as `audience_id`. The backend `_resolve_audience_customers()` needs to handle this prefix.

Add to `backend/routers/campaigns.py::_resolve_audience_customers()`:
```python
# CR-076: lifecycle stage audience
if audience_id.startswith("lifecycle_stage:"):
    stage = audience_id.split(":", 1)[1]
    from core.helpers import build_customer_query
    query = await build_customer_query(user_id, {"lifecycle_stage": stage})
    customers_cursor = db.customers.find(query, {"_id": 0})
    return await customers_cursor.to_list(None)
```

**Verify**: Navigate from Lifecycle page to Campaign Wizard → audience pre-populated → campaign creates successfully

---

## Files WILL Change

| File | Edit | Risk |
|---|---|---|
| `backend/core/helpers.py` | E-A: lifecycle_stage filter block | LOW |
| `backend/routers/campaigns.py` | E-E.3: lifecycle audience resolver | LOW |
| `frontend/src/pages/AudiencesPage.jsx` | E-B: Section 0 accordion + DEFAULT_FILTERS | LOW |
| `frontend/src/pages/CustomerLifecyclePage.jsx` | E-C: inline Re-engage modal + bulk CTA | MEDIUM |
| `frontend/src/pages/CustomerDetailPage.jsx` | E-D: handle ?action=reengage | LOW |
| `frontend/src/pages/CampaignWizardPage.jsx` | E-E: pre-fill from audience_stage param | LOW |

## Files WILL NOT Change

`core/coupon.py` · `core/loyalty.py` · `routers/pos.py` · `routers/auth.py` ·  
`core/whatsapp.py` · `routers/whatsapp.py` · `routers/analytics.py` ·  
`core/campaign_jobs.py` · `models/schemas.py`

---

## Verification Matrix

| # | Test | Expected |
|---|---|---|
| V1 | `filters={"lifecycle_stage":"churned"}` in build_customer_query | Returns customers with last_visit > 90 days |
| V2 | AudiencesPage — create segment with lifecycle_stage=at_risk | Segment preview shows at_risk customer count |
| V3 | Lifecycle page — click stage card → bulk CTA button appears | "Re-engage Churned (N)" button visible |
| V4 | Lifecycle page — bulk CTA click | Navigates to /campaigns/new?audience_stage=churned |
| V5 | Campaign Wizard from lifecycle link | Audience pre-filled with "Churned Customers" |
| V6 | Lifecycle page — row Re-engage button | Modal opens with customer name + stage badge |
| V7 | Re-engage modal — select template + Send | WhatsApp sent, success toast shown |
| V8 | CustomerDetailPage `?action=reengage` | Modal auto-opens on load |
| V9 | Lapsing audience chip | Returns at_risk + dormant customers combined |
| V10 | Campaign with lifecycle_stage audience saved + sent | Campaign executes, logs to message_logs |
