# CR-015a — Preview Sample Data Gap for T5 Variables

**Sprint**: ROI Measurement / CRM
**Parent CR**: CR-015 (WhatsApp Template Variable Mapping Fidelity)
**Type**: Sub-CR (defect in preview display layer)
**Discovered**: 2026-05-29, reported by owner via screenshot
**Lifecycle stage**: `cr015a_discovery_complete_planning_ready`

---

## 1. Problem Statement

After mapping new T5 variables (payment_method, order_date, restaurant_order_id, etc.) to template slots in the WhatsApp Automation page, the **preview bubble shows "NA" in red** for those slots. Variables that existed before T5 (customer_name, amount, points_earned) show correct sample values.

This is a **preview-only display issue**. Actual WhatsApp sends work correctly because `build_order_event_context` (T3, Day 2) provides all values from real POS order data at trigger time. The preview is misleading administrators into thinking the mappings are broken.

---

## 2. Root Cause Analysis

### How preview rendering works (3 consumers, 1 data source)

**Backend endpoint**: `GET /api/customers/sample-data` (`routers/customers.py:723`)
- Fetches the first customer doc + user (brand) doc
- Returns a **hardcoded flat dict** of `{var_key: sample_value}` pairs
- Written during CR-004 P2.5 — covers the original 23 variables only

**Frontend consumers** (all use the same pattern: `sampleData[mappedField]`):

| # | File | Function/Line | Usage |
|---|---|---|---|
| 1 | `WhatsAppAutomationContent.jsx:362` | `resolvePreviewWithSampleData()` line 386 | Mapping modal preview bubble + automation card previews + template preview modal |
| 2 | `TemplatesPage.jsx:109` | `resolvePreviewWithSampleData()` line 126 | Templates page preview |
| 3 | `SegmentsPage.jsx:935` | inline preview logic line 939 | Segments broadcast preview |

**All three** do `sampleData[mappedField]` for map-mode variables. If the key doesn't exist in the dict → value is `undefined` → treated as falsy → shows **"NA"** (red).

### What the TestTemplateModal does differently

`TestTemplateModal` (line 18-55 of `WhatsAppAutomationContent.jsx`) takes a **different path** — it looks up `availableVariables.find(v => v.key === mappedField)?.example` (line 46). This pulls the `example` field from the variable registry, which DOES have values for all 37 variables including the 14 new T5 ones.

So the "Send Test" modal would show registry examples. But the main preview bubble (the one in the screenshot) uses the backend sample-data endpoint.

### Gap

| Variable source | Count | Has T5 keys? |
|---|---|---|
| `GET /api/customers/sample-data` (backend) | 23 keys | **NO** — hardcoded before T5 |
| `GET /api/whatsapp/variables` (registry) | 37 keys with `example` field | **YES** — T5 added all 14 |

---

## 3. Affected Variables (complete list)

All 14 T5 variables added in Day 1 are missing from sample-data:

| Key | Registry example | Currently in sample-data? | Preview shows |
|---|---|---|---|
| `payment_method` | `UPI` | NO | **NA** |
| `order_date` | `25 May 2026` | NO | **NA** |
| `order_time` | `7:45 PM` | NO | **NA** |
| `restaurant_order_id` | `KM-1234` | NO | **NA** |
| `transaction_id` | `TXN9876543` | NO | **NA** |
| `table_id` | `T5` | NO | **NA** |
| `waiter_name` | `Ramesh` | NO | **NA** |
| `order_type` | `Dine-In` | NO | **NA** |
| `loyalty_points_used` | `200` | NO | **NA** |
| `loyalty_discount` | `Rs.50` | NO | **NA** |
| `wallet_used` | `Rs.100` | NO | **NA** |
| `tax_amount` | `Rs.85` | NO | **NA** |
| `item_count` | `3` | NO | **NA** |
| `order_notes` | `No onion in biryani` | NO | **NA** |

---

## 4. Existing variables that show empty → "NA" (pre-existing)

These are in sample-data but set to `""` (empty string), so they also show "NA":

| Key | Value in sample-data | Why empty | Preview shows |
|---|---|---|---|
| `order_id` | `""` | No sample order available from customer doc | **NA** |
| `old_tier` | `""` | Can't derive from customer doc | **NA** |
| `expiring_points` | `""` | Would need points expiry calculation | **NA** |
| `expiry_date` | `""` | Same | **NA** |
| `coupon_code` | `""` | No sample coupon selected | **NA** |
| `coupon_title` | `""` | Same | **NA** |
| `coupon_discount` | `""` | Same | **NA** |
| `coupon_expiry` | `""` | Same | **NA** |
| `rating` | `""` | No sample feedback | **NA** |

These are pre-existing and NOT part of this sub-CR (they were empty before T5). Documenting for completeness.

---

## 5. Fix Options

### Option A — Backend only: Add 14 keys to sample-data endpoint (minimal)

Add the 14 T5 keys to the `sample` dict in `GET /api/customers/sample-data` with static example values matching the registry's `example` field.

**Pros**: Smallest change. Single file edit (~14 lines).
**Cons**: Sample-data and registry `example` fields are now **two sources of truth** for preview values. If future variables are added to the registry, someone must remember to also update sample-data. This is the same gap that created this bug.

**Files**: `routers/customers.py:739-771` only

### Option B — Frontend: Fallback to registry example when sampleData misses (resilient)

In `resolvePreviewWithSampleData()`, after `sampleValue = sampleCustomerData[mappedField]`, add a fallback:
```
if (!sampleValue) {
    const varInfo = availableVariables.find(v => v.key === mappedField);
    sampleValue = varInfo?.example || "";
}
```

**Pros**: Self-healing — any future registry additions automatically show examples in preview without touching the backend. Single source of truth (registry's `example` field).
**Cons**: Requires changes in 3 files (WhatsAppAutomationContent.jsx, TemplatesPage.jsx, SegmentsPage.jsx). SegmentsPage doesn't currently load `availableVariables` — would need to add that fetch.

**Files**: 3 frontend files

### Option C — Both (belt + suspenders)

Do Option A (backend adds the 14 keys) AND Option B (frontend fallback). Preview works immediately via backend, and future-proofs via frontend fallback.

**Recommended**: **Option A + partial Option B** — add the 14 keys to backend (immediate fix), and add the fallback ONLY in `WhatsAppAutomationContent.jsx` where `availableVariables` is already loaded (it's the primary preview consumer and the one in the screenshot). TemplatesPage also has `availableVariables` loaded. SegmentsPage would need extra work — defer.

---

## 6. Dependency Analysis

### What this sub-CR depends on
- **T5 (Day 1)**: The 14 registry entries with `example` fields must exist — ✅ already landed
- **No other dependencies**. This is a pure display-layer fix.

### What depends on this sub-CR
- **Nothing blocks on this.** Actual sends work correctly. This is a UX polish issue for administrators.
- However, owner discovered it during Day 3 validation, so it's high-priority for trust in the mapping UI.

### Interaction with T7
- T7 changes R689's slots {{4}}/{{5}}/{{7}} from garbage to `payment_method`/`order_date`/`points_balance`. After T7 commit, the preview for those slots would STILL show "NA" until this sub-CR is fixed. So this sub-CR should ideally land before or alongside T7 commit for a clean owner experience.

---

## 7. Scope

### In scope
- Add 14 T5 variable keys to `GET /api/customers/sample-data` response
- Add frontend fallback in `resolvePreviewWithSampleData()` in WhatsAppAutomationContent.jsx and TemplatesPage.jsx (where `availableVariables` is already loaded)

### Out of scope
- Fixing pre-existing empty values (order_id, old_tier, coupon_*, etc.) — separate issue, existed before T5
- SegmentsPage fallback (would need to load availableVariables — larger change)
- Making sample-data endpoint dynamic (auto-deriving from registry) — that's a bigger refactor

---

## 8. Effort Estimate

| Component | Work | LoC |
|---|---|---|
| Backend: `routers/customers.py` | Add 14 keys to sample dict | +14 |
| Frontend: `WhatsAppAutomationContent.jsx` | Add fallback in `resolvePreviewWithSampleData` | +4 |
| Frontend: `TemplatesPage.jsx` | Same fallback | +4 |
| Verification | Screenshot preview showing real values | — |
| **Total** | | **~22 LoC** |

**Time**: ~15 minutes implementation + verification.

---

## 9. Acceptance Criteria

| # | Check | Method |
|---|---|---|
| 1 | `GET /api/customers/sample-data` response includes all 14 T5 keys with non-empty values | curl |
| 2 | Mapping modal preview shows sample values (not "NA") for `payment_method`, `order_date`, `restaurant_order_id` | screenshot |
| 3 | Automation card preview shows sample values for mapped T5 variables | screenshot |
| 4 | Pre-existing variables still show correct values (no regression) | screenshot |
| 5 | Frontend fallback: if a future variable is added to registry but NOT to sample-data, preview still shows registry example | code review |
| 6 | 119 existing tests still pass | pytest |

---

## 10. Risk

| Risk | P | Impact | Mitigation |
|---|---|---|---|
| Sample values don't match formatted output (e.g. preview shows "UPI" but send shows "Upi") | Low | Low | Use formatted examples from registry (they already account for formatter output) |
| SegmentsPage still shows NA for T5 variables | Low | Low | Out of scope for now; SegmentsPage broadcast is not actively used |

---

**End of CR-015a discovery. Ready for planning approval.**
