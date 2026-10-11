# CR-004 — Phase 2.5-B · Coupon-Aware Dynamic Variable Mapping — QA Report

**CR:** CR-004 WhatsApp Utility + Marketing Message Integration
**Phase:** P2.5-B — Coupon-Aware Dynamic Variable Mapping (Model Redesign)
**Sprint:** ROI Measurement Sprint
**Date:** 2026-05-28
**Status:** `cr004_phase_2_5b_qa_passed`
**Test user:** `owner@kunafamahal.com` / `Qplazm@10` (R689 Kunafa Mahal)

---

## 1. QA Verdict

```
cr004_phase_2_5b_qa_passed
```

All 12 scenarios passed. No product code changed by QA.

---

## 2. Backend QA (6 scenarios)

| # | Scenario | Result | Evidence |
|---|---|---|---|
| B1 | `GET /coupons/summary` returns coupon list | PASS | 25 coupons returned. Each has 10 fields: `id, code, title, discount_type, discount_value, discount_display, end_date, end_date_display, is_active, offer_type` |
| B2 | `discount_display` computed correctly | PASS | Examples: `"Rs.99 off"` (flat), `"10% off"` (percentage). End date formatted: `"28 May 2026"` |
| B3 | 4 coupon variables include `picker: "coupon"` | PASS | `coupon_code`, `coupon_title`, `coupon_discount`, `coupon_expiry` — all have `"picker": "coupon"` in API response |
| B4 | `GET /whatsapp/variables` returns picker field | PASS | Non-coupon variables do NOT have `picker` field. Only 4 coupon-category vars have it |
| B5 | Coupon summary scoped to user | PASS | Returns coupons for R689 Kunafa Mahal only (25 coupons matching known test data) |
| B6 | Auth rejection on summary endpoint | PASS | No auth → 403/401 |

### Coupon Summary Sample

```json
{
  "id": "1c698f06-997b-4e4d-965c-9244a82f4a9d",
  "code": "TEST HAPPY",
  "title": "abhishek happy",
  "discount_type": "flat",
  "discount_value": 99.0,
  "discount_display": "Rs.99 off",
  "end_date": "2026-05-28",
  "end_date_display": "28 May 2026",
  "is_active": true,
  "offer_type": "simple"
}
```

---

## 3. Frontend QA (6 scenarios)

| # | Scenario | Result | Evidence |
|---|---|---|---|
| F1 | Templates page loads with Map/Preview buttons | PASS | Screenshot: templates listed with `Map`, `Preview`, `Mapped` status badges |
| F2 | WhatsApp Automation page loads | PASS | Screenshot: event cards (POS Events/CRM Events), configured/not-configured badges, Edit/Configure buttons |
| F3 | Variable mapping shows 3-mode support | PASS | Code-verified: coupon-category vars get `[Pick Coupon] [Custom Text]` toggle; other vars get `[Map to Field] [Custom Text]` |
| F4 | Coupon picker functionality (code-verified) | PASS | `fetchCouponSummary` calls `/coupons/summary`, `handleCouponSelect` auto-fills sibling coupon variables, search filter implemented |
| F5 | Auto-fill siblings on coupon pick | PASS | Code-verified: selecting a coupon on any coupon variable updates all sibling coupon variables in the template with locked read-only cards |
| F6 | WhatsApp preview resolves `coupon_pick` | PASS | `getCouponPickPreviewValue` parses `coupon:<id>:<field>` and shows real coupon data in preview |

---

## 4. `coupon_pick` Validation (code-verified from router)

| # | Check | Expected | Result |
|---|---|---|---|
| V1 | Format: `coupon:<id>:<field>` | Exactly 3 colon-separated parts | PASS (code at `routers/whatsapp.py`) |
| V2 | Field whitelist | `code\|title\|discount\|expiry` | PASS |
| V3 | Coupon ID cannot contain `:` | Colon guard | PASS |
| V4 | Coupon must exist + belong to user | 404 if not | PASS |
| V5 | `coupon_pick` skipped in `fills_on` warnings | No false warnings | PASS |

---

## 5. Scope Guard

| # | Check | Result |
|---|---|---|
| S1 | `/coupons/summary` endpoint exists | PASS |
| S2 | `picker: "coupon"` on 4 coupon vars | PASS |
| S3 | 3-mode toggle (Map/Pick Coupon/Custom Text) | PASS |
| S4 | Auto-fill siblings | PASS |
| S5 | Locked read-only cards for picked values | PASS (code-verified) |
| S6 | No new dependencies | PASS |
| S7 | Product code changed by QA | NO |
| S8 | DB changed | NO |

---

## 6. Issues Found

None.

---

## 7. Status

```
cr004_phase_2_5b_qa_passed
```

End of CR-004 Phase 2.5-B QA.
