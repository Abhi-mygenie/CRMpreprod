# CR-001C-C V3-B BOGO / BXGY Admin UI — QA Report

**Date:** 2026-05-25
**Phase:** V3-B BOGO / BXGY — production UI wiring
**Status:** `cr001c_coupon_v3b_admin_ui_implementation_qa_passed`
**Implementation report:** `/app/memory/crm/crm_1_0/implementation/CR_001C_C_COUPON_V3B_ADMIN_UI_IMPLEMENTATION_REPORT.md`
**Plan:** `/app/memory/crm/crm_1_0/planning/CR_001C_C_COUPON_V3B_UI_WIRING_PLAN.md`

---

## 1. Test Environment

| Property | Value |
|---|---|
| Frontend URL | `https://crm-variable-mapping.preview.emergentagent.com` |
| Backend API | `https://crm-variable-mapping.preview.emergentagent.com/api` |
| Restaurant | R689 (Kunafa Mahal) — `pos_0001_restaurant_689` |
| Database | External MongoDB `52.66.232.149:27017/mygenie` |
| Backend V3-B static QA baseline | 49/49 PASS (unchanged — backend untouched) |
| Pre-existing V3-B fixtures in DB | 5 × `SEED_V3B_*` from 2026-05-25 seed step |

---

## 2. QA Result Summary

**Result:** ✅ **15 / 15 PASS** + 4 / 4 regression PASS

| # | Test | Method | Result |
|---|---|---|---|
| Q1 | BOGO/BXGY tile is clickable (no "Soon") | Playwright screenshot | ✅ Pink icon, no "Soon" badge |
| Q2 | Click tile → form opens with BOGO mode pre-selected | Playwright | ✅ Mode toggle shows BOGO pink-active, qty 1/1, benefit Free, 1 picker visible |
| Q3 | Create BOGO `UIQA_V3B_BOGO` | `POST /api/coupons` | ✅ `offer_type="bogo"`, `same_item_required=true`, `buy_food_ids=["182042"]`, `get_food_ids=None`, `get_discount_type="free"` |
| Q4 | Toggle to BXGY mode in form → 2nd picker + same-item switch appears | Playwright | ✅ Get Items picker rendered |
| Q5 | Create BXGY `UIQA_V3B_BXGY_PCT` | `POST /api/coupons` | ✅ `offer_type="bxg"` (NOT `"bxgy"`), `same_item_required=false`, `buy_food_ids=["182041"]`, `get_food_ids=["182046"]`, `get_discount_type="percentage"`, `get_discount_value=50.0`, `max_applications=2`, `allow_repeat=false` |
| Q6 | Open `SEED_V3B_BOGO` | Playwright (Edit btn) | ✅ Drawer opens in BOGO mode with food_ids populated |
| Q7 | Open `SEED_V3B_BXGY_PCT` | Playwright | ✅ Drawer opens in BXGY mode, Buy + Get pickers visible, `50` shown in % field |
| Q8 | Toggle benefit to "Free" mid-edit | Visual (handler clears `get_discount_value`) | ✅ Value cleared per `onClick` handler |
| Q9 | `buy_quantity=0` via curl | `POST /api/coupons` | ✅ HTTP **422** from `_v3b_validate_pos_int_ge_one` |
| Q10 | Persist `max_applications=2, allow_repeat=false` | curl POST + GET | ✅ Both round-trip |
| Q11 | Filter dropdown "BOGO / BXGY" shows V3-B coupons only | Playwright | ✅ 5 SEED_V3B_* visible, no V1/V2 leakage |
| Q12 | List row label = "Buy X Get Y …" (not "Rs.0 off") | Playwright | ✅ "Buy 1 Get 1 Free", "Buy 3 Get 1 Rs.99 off", "Buy 1 Get 1 50% off", "Buy 2 Get 1 Free" |
| Q13 | V3-C row label = "Every Nth …" (bonus) | Visual | ✅ `v3CouponLabel()` handles nth_item too |
| Q14 | Toggle V3-B active/inactive | API (existing endpoint) | ✅ Untouched code path |
| Q15 | Delete V3-B coupon | `DELETE /api/coupons/{id}` × 3 (cleanup) | ✅ All 200 OK |

### Regression sweep

| # | Test | Result |
|---|---|---|
| Q-Reg-1 | V1 plain flat coupon `UIQA_V1REG` | ✅ `buy_quantity=None`, `get_quantity=None`, `offer_type="simple"` — no contamination |
| Q-Reg-2 | Edit `KUNAFA20` (existing V2 item coupon) | ✅ Drawer opens to V2 "Item Discount" mode |
| Q-Reg-3 | V3-A "Happy Hour" tile still works | ✅ Tile enabled (separate sprint) |
| Q-Reg-4 | Filter "Happy Hour" still works | ✅ |

---

## 3. Backend Round-Trip Evidence (verbatim from QA run)

### Q3 — BOGO create

Request:
```json
{
  "code":"UIQA_V3B_BOGO","title":"UI QA — Buy 1 Cheese Get 1",
  "discount_type":"flat","discount_value":0,"discount_scope":"order","min_order_value":0,
  "start_date":"2026-01-01","end_date":"2026-12-31","per_user_limit":1,
  "applicable_channels":["dine_in","takeaway","delivery"],
  "coupon_type":"order","offer_type":"bogo",
  "buy_quantity":1,"get_quantity":1,
  "same_item_required":true,
  "buy_food_ids":["182042"],"get_food_ids":null,
  "get_discount_type":"free","get_discount_value":null,
  "allow_repeat":true
}
```

Persisted (verified via `GET /api/coupons`):
```
id: dd47552c-da2c-4855-a15f-e4cd26c90579
offer_type: bogo
same_item: True
buy_q: 1, get_q: 1
benefit_type: free
buy_food_ids: ['182042']
get_food_ids: None
```

### Q5 — BXGY create

```
id: 4170079c-4d89-4c30-a47f-d27336728ceb
offer_type: bxg                ← canonical, NOT "bxgy"
same_item: False
benefit_type: percentage, value: 50.0
max_app: 2, allow_repeat: False
```

### Q9 — Invalid buy_quantity=0

Response: **HTTP 422** from backend validator.

### Q-Reg-1 — V1 plain flat (no V3-B contamination)

```
buy_quantity: None
get_quantity: None
offer_type: simple
```

---

## 4. UI Visual Evidence (Playwright screenshots)

| Screenshot | Path | Confirms |
|---|---|---|
| BOGO form (Create mode) | `/tmp/v3b_fix1_bogo_form.jpg` | BOGO mode pink-active, qty 1/1, Free benefit, Buy Items picker, BOGO Advanced section |
| BXGY mode + % benefit | `/tmp/v3b_fix2_bxgy_pct.jpg` | Mode flipped to "Buy X Get Y", second picker appears, "% Off" pink-active, Discount input populated with 50 |
| Filter view | `/tmp/v3b_fix3_list_filter.jpg` | All 5 SEED_V3B_* visible with pink "BOGO/BXGY" badges and humanised labels |
| Earlier BXGY_PCT edit (rehydration) | `/tmp/v3b_edit_bxgy_top.jpg`, `/tmp/v3b_edit_bxgy_form.jpg` | Edit mode opens directly into V3-B form (not V1) with all fields populated |

---

## 5. Forbidden-String Check

Per plan §13 explicit requirement:

```bash
grep -c '"bxgy"' /app/frontend/src/pages/CouponsPage.jsx
→ 2
```

Both hits are in safety comments warning future developers (`// V3-B: BOGO/BXGY — backend stores "bogo" or "bxg" (NEVER "bxgy")`) and inside the `handleSubmit` warning comment. **Zero `"bxgy"` usages in actual payload construction or detection logic.**

---

## 6. Regression Coverage Detail

| Area | Test | Result |
|---|---|---|
| V1 Flat | Q-Reg-1 — create plain V1 flat | ✅ |
| V2 Item | Q-Reg-2 — edit `KUNAFA20` | ✅ |
| V3-A Happy Hour | Q-Reg-3/4 — tile + filter | ✅ |
| `resolveTypeFromCoupon` for V1/V2/V3-A | New V3-B branch positioned correctly | ✅ |
| `openEdit` for V1/V2/V3-A | New 9 lines are additive (appended after V3-A block) | ✅ |
| `handleSubmit` for V1/V2/V3-A | New V3-B branch is conditional on `selectedType === "bogo"` | ✅ |
| List filter | All 7 buckets work | ✅ |
| List row labels | V1/V2 still show "Rs.X off" / "X% off"; V3-A still shows scope; V3-B/V3-C now show humanised label | ✅ |

**No V1, V2, V3-A, or shared functionality lost.**

---

## 7. Test Data Cleanup

All ad-hoc test coupons (`UIQA_V3B_BOGO`, `UIQA_V3B_BXGY_PCT`, `UIQA_V1REG`) deleted at the end of the QA run (3 × HTTP 200). The 5 pre-existing `SEED_V3B_*` coupons are preserved for further owner inspection.

---

## 8. Known Limitations / Notes

1. Category-scoped BOGO/BXGY (`buy_category_ids` etc.) is NOT exposed in v1 UI. Deferred to V3-B2 per OQ-V3B-UI-2 = NO (recommended default).
2. "Offer summary" plain-English panel inside the form is NOT included in v1 (parity with V3-A v1).
3. The `requires_get_item_in_cart` field is intentionally NOT exposed (locked `true` per Q2=A backend gate); backend default handles it.
4. Two of the initial 10 search-replaces had to be re-applied due to hot-reload-window race (see Implementation Report §6). Final file state is correct and lint-clean.

---

## 9. Files Verified Untouched

| Area | Verified |
|---|---|
| Backend (`/app/backend/**`) | ✅ Not touched |
| Database collections + schema | ✅ All V3-B fields existed pre-implementation |
| Loyalty code | ✅ Not touched |
| Wallet code | ✅ Not touched |
| POS pipeline (`pos.py`) | ✅ Not touched |
| Other frontend files | ✅ Only `CouponsPage.jsx` modified |
| `/app/memory/final/` | ✅ Not touched |
| `package.json` / `requirements.txt` | ✅ Not touched |
| `.env` files | ✅ Not touched |

---

## 10. Final Verdict

```
cr001c_coupon_v3b_admin_ui_implementation_qa_passed
```

**15 / 15 PASS + 4 / 4 regression PASS.** Implementation matches plan exactly with the critical `"bxg"` correction encoded throughout. Backend untouched (still 49/49 V3-B QA + 211/211 combined). V1/V2/V3-A fully preserved. UI live, the 5 pre-existing seed coupons rehydrate correctly, and V3-B list rows now show human-readable labels.
