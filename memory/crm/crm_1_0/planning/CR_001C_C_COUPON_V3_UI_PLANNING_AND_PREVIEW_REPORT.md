# CR-001C-C Coupon V3 UI Planning and Preview Report

**Date:** 2026-05-25
**Status:** `cr001c_coupon_v3_ui_preview_ready_for_owner_approval`

---

## 1. Executive Summary

Preview UI created for all three V3 coupon types at `/coupons-v3-preview`. All forms use the approved drawer layout, reuse existing components (item picker, category picker), and are clearly marked as non-functional previews. Owner approval needed before wiring to the production `/coupons` page.

---

## 2. Inputs Reviewed

- `backend/models/schemas.py` — CouponCreate/CouponUpdate: full V3-A/B/C field definitions
- `CouponsPage.jsx` — existing V1+V2 drawer UI (production)
- V3-A/V3-B/V3-C implementation reports
- Client manual (coupon types and use cases)

---

## 3. Current V1+V2 UI Summary

| Component | Location | Reusable? |
|---|---|---|
| Right-side drawer (Sheet) | CouponsPage.jsx | Yes |
| Type selector (7 cards) | CouponsPage.jsx | Yes — just enable V3 types |
| Item Picker (search + checkbox list) | CouponsPage.jsx | Yes |
| Category Picker (pill toggles) | CouponsPage.jsx | Yes |
| Advanced Settings (collapsible) | CouponsPage.jsx | Yes |
| Common fields (code, title, dates, limits, channels) | CouponsPage.jsx | Yes |

---

## 4. V3-A UI Field Map (Happy Hour)

| Backend Field | UI Element | Section |
|---|---|---|
| `offer_type` | Set to `"time_window"` automatically | Hidden |
| `discount_type` | Select: Flat / Percentage | Discount |
| `discount_value` | Number input | Discount |
| `valid_days` | 7 weekday toggle buttons (Mon-Sun) | Time Window |
| `start_time` | Time input (HH:MM) | Time Window |
| `end_time` | Time input (HH:MM) | Time Window |
| `timezone` | Select dropdown (IANA timezones) | Time Window |
| + common fields | code, title, dates, limits, channels | Standard |

---

## 5. V3-B UI Field Map (BOGO / BXGY)

| Backend Field | UI Element | Section |
|---|---|---|
| `offer_type` | Set to `"bogo"` or `"bxgy"` | Offer Type selector |
| `buy_quantity` | Number input | Buy/Get Rules |
| `get_quantity` | Number input | Buy/Get Rules |
| `same_item_required` | Toggle switch | Buy/Get Rules |
| `buy_food_ids` | Item Picker (reused) | Buy Items |
| `get_food_ids` | Item Picker (reused, hidden if same_item) | Get Items |
| `buy_category_ids` / `buy_category_names` | Category Picker (reused) | Alternative |
| `get_discount_type` | 3 buttons: Free / % Off / Rs. Off | Get Benefit |
| `get_discount_value` | Number input (hidden if "free") | Get Benefit |
| `max_applications` | Number input | Advanced |
| `allow_repeat` | Toggle switch | Advanced |
| `apply_to_cheapest_item` | Toggle switch | Advanced |
| `apply_to_highest_item` | Toggle switch | Advanced |
| `requires_get_item_in_cart` | Toggle switch | Advanced |
| `pos_instruction` | Text input | Advanced |
| + common fields | code, title, dates, limits, channels | Standard |

---

## 6. V3-C UI Field Map (Every Nth Item)

| Backend Field | UI Element | Section |
|---|---|---|
| `offer_type` | Set to `"every_nth"` automatically | Hidden |
| `nth_item_number` | Number input (min 2) | Nth Rule |
| `nth_discount_type` | Select: Free / % Off / Rs. Off | Nth Rule |
| `nth_discount_value` | Number input (hidden if "free") | Nth Rule |
| `eligible_food_ids` | Item Picker (reused) | Eligible Items |
| `eligible_category_ids` / `eligible_category_names` | Category Picker (reused) | Eligible Categories |
| `excluded_item_ids` | Item Picker (reused, separate instance) | Excluded Items |
| `excluded_category_ids` | Category Picker | Excluded Categories |
| `max_applications` | Number input | Advanced |
| `allow_repeat` | Toggle switch | Advanced |
| `apply_to_cheapest_item` | Toggle switch | Advanced |
| `apply_to_highest_item` | Toggle switch | Advanced |
| `pos_instruction` | Text input | Advanced |
| + common fields | code, title, dates, limits, channels | Standard |

---

## 7. Reusable Components

| Component | Used in V3-A | Used in V3-B | Used in V3-C |
|---|---|---|---|
| Drawer (Sheet) | Yes | Yes | Yes |
| Type selector | Yes | Yes | Yes |
| Code + Title fields | Yes | Yes | Yes |
| Date pickers | Yes | Yes | Yes |
| Limits (usage, per-user) | Yes | Yes | Yes |
| Channel pills | Yes | Yes | Yes |
| Loyalty stacking toggle | Yes | Yes | Yes |
| Item Picker | No | Yes (buy + get) | Yes (eligible + excluded) |
| Category Picker | No | Yes (buy + get) | Yes (eligible + excluded) |
| Advanced Settings collapsible | Optional | Yes | Yes |
| Offer Summary panel | **NEW** | **NEW** | **NEW** |

---

## 8. New Components Needed

| Component | Purpose |
|---|---|
| **Weekday Selector** | 7 toggle buttons for Mon-Sun (V3-A) |
| **Time Inputs** | Start/end time pickers (V3-A) |
| **Timezone Selector** | IANA timezone dropdown (V3-A) |
| **Offer Type Toggle** | BOGO vs BXGY mode selector (V3-B) |
| **Benefit Type Selector** | Free / % Off / Rs. Off buttons (V3-B, V3-C) |
| **Offer Summary Panel** | Plain-English preview of the coupon being created |

All are small, self-contained UI elements — not complex components.

---

## 9. Preview UI Created

| Route | Status |
|---|---|
| `/coupons-v3-preview` | Live — preview-only, non-functional |

| Form | Fields | Status |
|---|---|---|
| V3-A Happy Hour | Code, title, discount type/value, weekday selector, time pickers, timezone, dates, limits | Ready for review |
| V3-B BOGO/BXGY | Code, title, BOGO/BXGY toggle, buy/get qty, same-item switch, item pickers, benefit type, advanced settings, offer summary | Ready for review |
| V3-C Every Nth | Code, title, nth number, benefit type, item picker, category picker, excluded items, advanced settings, offer summary | Ready for review |

---

## 10. Owner Review Checklist

- [ ] V3-A: Weekday selector layout — 7 buttons OK?
- [ ] V3-A: Time picker — native HTML time input OK or need custom?
- [ ] V3-A: Timezone — dropdown with common timezones OK?
- [ ] V3-B: BOGO/BXGY toggle at top — clear enough?
- [ ] V3-B: "Same Item Required" toggle — understood?
- [ ] V3-B: Benefit type (Free / % Off / Rs. Off) — 3 buttons OK?
- [ ] V3-B: Separate buy/get item pickers when different-item — clear?
- [ ] V3-C: "Every Nth Item" number input with helper text — clear?
- [ ] V3-C: Separate eligible vs excluded item sections — OK?
- [ ] ALL: Offer Summary panel showing plain-English — useful?
- [ ] ALL: Advanced settings collapsible — same pattern as V2?

---

## 11. Recommended Final Implementation Phases

| Phase | Scope | Effort |
|---|---|---|
| **Phase 1** | V3-A Happy Hour — enable in production `/coupons`, wire to backend | Low (mostly form fields) |
| **Phase 2** | V3-B BOGO/BXGY — enable in production, wire buy/get logic | Medium (most complex form) |
| **Phase 3** | V3-C Every Nth — enable in production, wire nth/excluded logic | Medium |

All phases reuse the existing drawer + item/category pickers.

---

## 12. Risks / Open Questions

| # | Risk | Mitigation |
|---|---|---|
| 1 | Item picker uses mock data in preview | Production will use live `/api/menu/items` (already wired in V2) |
| 2 | `pos_food_id` mismatch still blocks item-level matching at POS | Documented separately — no CRM change needed |
| 3 | V3-B form is the most complex — buy+get pickers may confuse users | "Same Item Required" toggle simplifies BOGO; BXGY shows both pickers |

---

## 13. Final Recommendation

Approve the V3 preview UX, then implement in 3 small phases (V3-A → V3-B → V3-C). Each phase adds ~1 form section to the existing drawer — no architectural changes needed.

---

## 14. Final Status

```
cr001c_coupon_v3_ui_preview_ready_for_owner_approval
```
