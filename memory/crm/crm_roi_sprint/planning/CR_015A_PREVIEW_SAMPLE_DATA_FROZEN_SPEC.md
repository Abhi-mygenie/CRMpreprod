# CR-015a — Preview Sample Data Gap — FROZEN SPEC

**Sprint**: ROI Measurement / CRM
**Parent CR**: CR-015 (WhatsApp Template Variable Mapping Fidelity)
**Type**: Sub-CR (preview display-layer defect)
**Discovery**: `discovery/CR_015A_PREVIEW_SAMPLE_DATA_GAP_DISCOVERY.md`
**Lifecycle stage**: `cr015a_IMPLEMENTED` (2026-05-29)
**Frozen on**: 2026-05-29
**Chosen approach**: Option A + partial Option B (per discovery §5 recommendation)

> ✅ IMPLEMENTED 2026-05-29. Backend: 14 T5 sample values added to
> `routers/customers.py` `get_sample_customer_data` (curl-verified — 37 keys total, all 14
> present & non-empty). Frontend: registry-`example` fallback added to
> `resolvePreviewWithSampleData` in `WhatsAppAutomationContent.jsx` + `TemplatesPage.jsx`
> (lint clean, compiles). Verified: Templates mapping modal preview renders values, no red "NA".

> This document is the **implementation contract**. Implement mechanically. If code
> contradicts this spec, STOP and surface to owner. Do NOT re-derive from discovery.

---

## 1. Objective

Eliminate the misleading **"NA"** shown in the WhatsApp template preview bubble for the
14 CR-015 T5 order-context variables, by:
- **(A)** Adding the 14 T5 keys with sample values to the backend `GET /api/customers/sample-data` response.
- **(B)** Adding a registry-`example` fallback in the two frontend preview resolvers that already load `availableVariables`.

Actual WhatsApp sends are unaffected (they use `build_order_event_context` at trigger time).
This is a **preview-only UX fix**.

---

## 2. Pre-implementation verification (already confirmed 2026-05-29)

| Check | Result |
|---|---|
| Backend `sample` dict has 23 keys, missing 14 T5 keys | ✅ Confirmed `routers/customers.py:739-771` |
| Registry `whatsapp_variables.py` defines all 14 T5 keys with `example` | ✅ Confirmed lines 350-526 |
| `WhatsAppAutomationContent.jsx` loads `availableVariables` + uses `sampleCustomerData[mappedField]` | ✅ Lines 285/386/508 |
| `TemplatesPage.jsx` loads `availableVariables` + uses `sampleCustomerData[mappedField]` | ✅ Lines 55/126/161 |
| `SegmentsPage.jsx` — does NOT load registry variables | ⏸ OUT OF SCOPE (defer) |

---

## 3. FROZEN code spec

### 3.1 Backend — `backend/routers/customers.py`

In `get_sample_customer_data()`, inside the returned `sample` dict (currently lines
739-771), **add the following 14 key/value pairs**. Place them in a clearly commented
block. Values are STATIC literals that mirror the registry `example` fields exactly
(so preview matches the field-picker hints `(e.g., ...)`).

```python
            # ── CR-015a (2026-05-29): T5 order-context sample values ──
            # Static examples mirroring whatsapp_variables.py registry `example`
            # fields. Preview-only; live sends use build_order_event_context().
            "payment_method":      "UPI",
            "order_date":          "25 May 2026",
            "order_time":          "7:45 PM",
            "restaurant_order_id": "KM-1234",
            "transaction_id":      "TXN9876543",
            "table_id":            "T5",
            "waiter_name":         "Ramesh",
            "order_type":          "Dine-In",
            "loyalty_points_used": "200",
            "loyalty_discount":    "Rs.50",
            "wallet_used":         "Rs.100",
            "tax_amount":          "Rs.85",
            "item_count":          "3",
            "order_notes":         "No onion in biryani",
```

**Constraints**:
- Do NOT change any existing key/value in the dict.
- Do NOT change the `if not customer: return {"sample": {}, ...}` early-return branch
  (preview with no customers is acceptable to show variable placeholders).
- These are static strings, NOT derived from `customer`/`user_doc`.

### 3.2 Frontend — `WhatsAppAutomationContent.jsx` `resolvePreviewWithSampleData` (line ~386)

Current:
```javascript
                } else {
                    sampleValue = sampleCustomerData[mappedField];
                }
```

Frozen replacement:
```javascript
                } else {
                    sampleValue = sampleCustomerData[mappedField];
                    // CR-015a: fall back to registry example when sample-data lacks the key
                    if (sampleValue === undefined || sampleValue === null || String(sampleValue).trim() === "") {
                        sampleValue = availableVariables.find(v => v.key === mappedField)?.example;
                    }
                }
```

### 3.3 Frontend — `TemplatesPage.jsx` `resolvePreviewWithSampleData` (line ~126)

Current:
```javascript
                else sampleValue = sampleCustomerData[mappedField];
```

Frozen replacement:
```javascript
                else {
                    sampleValue = sampleCustomerData[mappedField];
                    // CR-015a: fall back to registry example when sample-data lacks the key
                    if (sampleValue === undefined || sampleValue === null || String(sampleValue).trim() === "") {
                        sampleValue = availableVariables.find(v => v.key === mappedField)?.example;
                    }
                }
```

**Constraints**:
- `availableVariables` is in scope in both component bodies (verified). No new fetch needed.
- The downstream `if (sampleValue && String(sampleValue).trim() !== "")` check already
  handles `undefined` → "NA". After the fallback, mapped T5 variables will resolve to the
  registry example and render as `data`, not `na`.
- Do NOT touch `text` / `coupon_pick` branches.

### 3.4 Out of scope (DO NOT IMPLEMENT)

- `SegmentsPage.jsx` fallback — needs a new `/whatsapp/variables` fetch. Deferred.
- Pre-existing empty keys (`order_id`, `old_tier`, `coupon_*`, `rating`, `expiring_points`,
  `expiry_date`) — these were empty before T5; not part of this sub-CR.
- Making sample-data dynamically derive from the registry — larger refactor, separate CR.

---

## 4. Acceptance checks (must pass before closeout)

| # | Check | Method |
|---|---|---|
| 1 | `GET /api/customers/sample-data` returns all 14 T5 keys with non-empty values | curl (auth: `access_token`) |
| 2 | Mapping modal preview shows `payment_method`→"UPI", `order_date`→"25 May 2026" (not "NA") | screenshot |
| 3 | Pre-existing variables (`customer_name`, `amount`, `points_earned`) still render correctly | screenshot |
| 4 | Frontend fallback resolves a registry-only key even if backend omits it (resilience) | code review |
| 5 | All 119 existing pytest cases still pass | `pytest tests/test_cr015_*.py tests/test_whatsapp_*.py -q` |
| 6 | Frontend compiles with no lint errors | `yarn lint` / compile |

---

## 5. Effort & files

| Component | File | Change |
|---|---|---|
| Backend | `routers/customers.py` | +14 lines in `sample` dict |
| Frontend | `WhatsAppAutomationContent.jsx` | +4 lines fallback |
| Frontend | `TemplatesPage.jsx` | +4 lines fallback |

**Total ~22 LoC. ~15 min implementation + verification.**

---

## 6. Sequencing note (T7 interaction)

Per discovery §6: after the T7 commit, R689 slots {{4}}/{{5}}/{{7}} map to
`payment_method`/`order_date`/`points_balance`. With CR-015a landed, those slots will show
real sample values in preview. **CR-015a should land BEFORE the T7 commit** for a clean
owner verification experience. Sequence: CR-015a → T7 commit → Day 4.

---

**End of CR-015a FROZEN SPEC. Ready for owner approval to implement.**
