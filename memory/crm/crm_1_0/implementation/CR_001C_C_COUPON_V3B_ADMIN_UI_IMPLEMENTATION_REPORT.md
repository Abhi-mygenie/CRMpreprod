# CR-001C-C V3-B BOGO / BXGY Admin UI — Implementation Report

**Date:** 2026-05-25
**Phase:** V3-B BOGO / Buy-X-Get-Y — production UI wired to backend
**Status:** `cr001c_coupon_v3b_admin_ui_implementation_qa_passed`
**Plan reference:** `/app/memory/crm/crm_1_0/planning/CR_001C_C_COUPON_V3B_UI_WIRING_PLAN.md`
**Discovery reference:** `/app/memory/crm/crm_1_0/discovery/CR_001C_C_COUPON_V3B_UI_WIRING_GAP_DISCOVERY.md`
**QA report:** `/app/memory/crm/crm_1_0/qa/CR_001C_C_COUPON_V3B_ADMIN_UI_QA_REPORT.md`

---

## 1. Summary

The "BOGO / BXGY" tile at `/coupons` is now live (previously "Soon"). Owner can author / edit / list / toggle / delete buy-and-get coupons in both modes:
- **BOGO same-item**: buy N of item X → get M of item X free / % off / flat off
- **BXGY different-item**: buy N of item set A → get M of item set B free / % off / flat off

All round-trip persistence verified against the external MongoDB. The pre-existing 5 `SEED_V3B_*` seed coupons (created via API in the seed step on 2026-05-25) now rehydrate correctly in edit-mode.

**Single primary file touched:** `frontend/src/pages/CouponsPage.jsx` (+170 / -10 LOC).
**Plus 1 non-breaking line:** `ItemSelector` component gains optional `label = "Select Menu Items"` prop.
**No backend / DB / env / dependency / supervisor changes.**

---

## 2. Critical Implementation Decision (vs. prior guide)

The old `handoff/CR_001C_C_COUPON_V3_UI_IMPLEMENTATION_GUIDE.md` suggested:
- `c.offer_type === "bxgy"` for edit-mode detection
- `payload.offer_type = "bxgy"` for BXGY mode submit

Both were **wrong** — the backend `_v3a_validate_offer_type` (`backend/models/schemas.py:48-65`) rejects `"bxgy"`. The canonical stored value is `"bxg"` (the validator normalises `buy_x_get_y` → `bxg`).

**Applied in the implementation:**
- `resolveTypeFromCoupon`: detects via `c.offer_type === "bogo" || c.offer_type === "bxg"`
- `handleSubmit`: sends `form.same_item_required ? "bogo" : "bxg"` (NEVER `"bxgy"`)
- Final sanity check: `grep -c '"bxgy"' CouponsPage.jsx` → 2 hits, both in safety **comments** warning future developers. **Zero usages in actual payloads.**

---

## 3. Files Changed

| File | Type | LOC delta | Sections touched |
|---|---|---|---|
| `frontend/src/pages/CouponsPage.jsx` | EXTEND | **+170 / -10** | `COUPON_TYPES[bogo]` flip; `EMPTY_FORM` (+9 V3-B fields); `resolveTypeFromCoupon` V3-B branch; new `nthSuffix()` + `v3CouponLabel()` helpers; `ItemSelector` `label` prop; `openEdit` (+9 V3-B rehydration lines); `handleSubmit` (+23 LOC V3-B payload branch); new V3-B form section (~100 LOC) between V3-A and Validity; list-row label uses `v3CouponLabel(coupon) \|\| existing` |

No new imports — all icons (`Gift`, `Settings2`) + components (`Switch`, `Collapsible`, `Input`, `Label`, `Select`, `Separator`) were already imported in the file post-V3-A.
No new dependencies in `package.json`.

---

## 4. Implementation Steps Applied (per plan §6)

| # | Plan ref | Outcome |
|---|---|---|
| 1 | Flip `COUPON_TYPES[bogo]` → enabled, scope=order, dtype=null, color pink-500/600 | ✅ Done (after one re-application — see §6 lesson learned) |
| 2 | `EMPTY_FORM` += 9 V3-B fields | ✅ Done (after one re-application — see §6 lesson learned) |
| 3 | `resolveTypeFromCoupon` V3-B branch between V3-A and V1/V2 | ✅ |
| 4 | `openEdit` `setForm({...})` += 9 V3-B rehydration lines | ✅ |
| 5 | `handleTypeSelect` — no explicit code change (tile config drives it) | ✅ |
| 6 | `handleSubmit` V3-B payload branch — **`form.same_item_required ? "bogo" : "bxg"`** | ✅ |
| 7 | New Time Window form section guarded by `selectedType === "bogo"` | ✅ |
| 8 | `ItemSelector` optional `label` prop with backward-compat default | ✅ |
| 9 | `nthSuffix()` + `v3CouponLabel()` helpers + list-row label override | ✅ (also covers V3-C labels) |
| 10 | `data-testid` coverage on 11 interactive elements | ✅ |

`data-testid` added: `type-bogo`, `bogo-mode-toggle`, `bogo-mode-bogo`, `bogo-mode-bxgy`, `buy-quantity`, `get-quantity`, `buy-items-selector`, `get-items-selector`, `benefit-free`, `benefit-percentage`, `benefit-flat`, `benefit-value`, `max-applications`, `allow-repeat-switch`, `cheapest-switch`, `highest-switch`, `pos-instruction`.

---

## 5. Verification Highlights

| Check | Result |
|---|---|
| ESLint on `CouponsPage.jsx` | ✅ No issues |
| Forbidden-string check: `grep -c '"bxgy"'` in JSX code → 2 (both in safety comments, zero payloads) | ✅ |
| Frontend HTTP 200 after hot-reload | ✅ |
| Create BOGO same-item via API → fields persist exactly | ✅ `offer_type="bogo"`, `same_item_required=true`, `buy_food_ids=["182042"]`, `get_food_ids=None` |
| Create BXGY %-off via API | ✅ `offer_type="bxg"`, `same_item_required=false`, `get_discount_type="percentage"`, `get_discount_value=50.0`, `max_applications=2`, `allow_repeat=false` |
| Invalid `buy_quantity=0` rejected | ✅ HTTP 422 from `_v3b_validate_pos_int_ge_one` |
| V1 plain flat coupon — no V3-B contamination | ✅ `buy_quantity=None`, `get_quantity=None`, `offer_type="simple"` |
| UI: BOGO tile no longer "Soon"; pink icon active | ✅ Screenshot |
| UI: New BOGO drawer opens with mode=BOGO, 1 picker, Free benefit | ✅ Screenshot |
| UI: Switch to BXGY → Get Items picker appears | ✅ Screenshot |
| UI: Benefit toggle to % → Discount input appears, value persists | ✅ Screenshot |
| UI: List filter "BOGO / BXGY" shows all 5 SEED_V3B_* | ✅ Screenshot |
| UI: List labels read "Buy 1 Get 1 Free", "Buy 3 Get 1 Rs.99 off", "Buy 1 Get 1 50% off" — NOT "Rs.0 off" | ✅ Screenshot |
| UI: Edit pre-existing `SEED_V3B_BXGY_PCT` rehydrates in BXGY mode with all fields populated | ✅ Screenshot |

---

## 6. Lesson Learned — Search-Replace Idempotency

Two of the planned 10 search-replaces in the initial batch **reported "Edit was successful" but the change did not persist** (the `COUPON_TYPES[bogo]` tile flip and the `EMPTY_FORM` V3-B field extension). Root cause hypothesis: file was being recompiled by the hot-reloader at the moment of write, possibly truncating the buffer to a slightly older snapshot before the patch landed. Detection was via:
- `grep -n 'id: "bogo"' CouponsPage.jsx` revealed `enabled: false` still present.
- `grep -n 'buy_food_ids: \[\]' CouponsPage.jsx` returned no hits in EMPTY_FORM (only in usage sites).

The symptom in the browser was an `Uncaught TypeError: Cannot read properties of undefined (reading 'length')` inside `ItemSelector` (because the form passed `selected={form.buy_food_ids}` where `form.buy_food_ids` was undefined for the missing EMPTY_FORM key).

**Resolution:** re-applied both search-replaces individually with the same payload. Both landed on retry. Verified by `grep` immediately after each.

**Mitigation for future sprints:** after each batch of search-replaces, run `grep` on a distinctive new string from each edit to confirm persistence before running QA.

---

## 7. Scope Discipline

- ✅ Touched only `frontend/src/pages/CouponsPage.jsx` (primary) + 1-line in `ItemSelector` (same file).
- ✅ V1+V2+V3-A behaviour preserved — regression tests confirm.
- ✅ V3-C tile still "Soon" — no premature wiring.
- ✅ `/coupons-v3-preview` route preserved.
- ✅ No changes to backend, DB, env, dependencies, supervisor, Wallet, Loyalty, POS pipeline, `/app/memory/final/`.

---

## 8. Out of Scope (deferred, per plan §11)

- Category-scoped buy/get pickers (`buy_category_ids` / `get_category_ids`) → V3-B2
- "Offer summary" plain-English panel inside the form → V3-B2
- V3-C Every-Nth UI wiring → next sprint (V3-C plan)
- Removing `/coupons-v3-preview` route → after V3-C ships

---

## 9. Acceptance Criteria — Status

| # | Acceptance criterion (from plan §12) | Met |
|---|---|---|
| 1 | "BOGO / BXGY" tile no longer marked "Soon" and is clickable | ✅ |
| 2 | Form has all required sections (mode toggle, buy/get qty, item pickers, benefit, validity, advanced) | ✅ |
| 3 | BOGO create → `offer_type="bogo"`, `same_item_required=true`, food ids persisted | ✅ |
| 4 | BXGY create → `offer_type="bxg"` (NOT "bxgy"), `same_item_required=false`, separate `buy_food_ids` + `get_food_ids` | ✅ |
| 5 | Edit pre-existing `SEED_V3B_*` coupons → drawer opens in matching mode with all fields populated | ✅ |
| 6 | List filter "BOGO / BXGY" shows all V3-B coupons | ✅ |
| 7 | List row reads "Buy X Get Y …" for V3-B (and "Every Nth …" for V3-C as a bonus) | ✅ |
| 8 | All existing V1+V2+V3-A flows still work | ✅ |
| 9 | No backend / DB / env / dependency / supervisor change | ✅ |
| 10 | ESLint clean, no new warnings | ✅ |

---

## 10. Effort

| Step | Estimated | Actual |
|---|---|---|
| Edits #1-#6 | 25 min | ~15 min (initial batch parallel) + ~5 min recovery for missed edits |
| Edit #7 (form section ~100 LOC) | 35 min | ~15 min |
| Edits #8-#10 (label prop + helpers + list label) | 12 min | ~8 min |
| Manual QA Q1-Q15 + regression sweep | 25 min | ~15 min (parallel curl + Playwright) |
| Implementation + QA reports + index update | 15 min | ~12 min |
| **Total** | **~1.8 h** | **~70 min** |

Roughly half the planned estimate due to parallel tool execution; the search-replace idempotency issue cost ~10 minutes of diagnostic time but didn't blow the budget.

---

## 11. Final Status

```
cr001c_coupon_v3b_admin_ui_implementation_qa_passed
```

Backend unchanged (still 49/49 V3-B QA + combined 211/211 across V1→V3-C). UI wiring complete. Owner can now author BOGO + BXGY coupons from `/coupons` immediately. Pre-existing 5 `SEED_V3B_*` rehydrate correctly in edit mode.

**Next ready-to-pick:** **V3-C Every Nth Item UI wiring** (`COUPON_TYPES[every_nth].enabled` is the only remaining "Soon" tile). The `v3CouponLabel()` helper from this sprint already produces correct list-row labels for V3-C as a side benefit.
