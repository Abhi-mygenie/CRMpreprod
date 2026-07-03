# CR-021 — Closeout

**Status**: 🟢 CLOSED — code complete, QA 142/142 pass, no live-test gating
**Closed**: 2026-06-06
**Discovery**: `../discovery/CR_021_COUPON_DISTRIBUTE_AND_POS_ZERO_DISCOVERY.md`
**Plan**: `../planning/CR_021_COUPON_DISTRIBUTE_AND_POS_ZERO_PLAN.md`
**Implementation report**: `./CR_021_IMPLEMENTATION_REPORT.md`

---

## 1. What shipped

Three independent coupon defects fixed in one CR, plus a hidden runtime coercion bug caught during plan review.

| # | Defect | Fix |
|---|---|---|
| B1 | BOGO/BXG/Nth: discount concentrates on cheapest single item-line instead of distributing across distinct eligible lines | `_v3b_select_get_units` rewritten with group-sort-roundrobin algorithm (D1) |
| B2 | Usage-limit silently bypassed when POS sends `coupon_discount=0` for CRM-authoritative coupon | `record_coupon_usage_for_order` defers skip decision until after validation; records using `crm_computed` for ALL coupon types (D3) when POS=0 AND CRM>0 |
| B3 | Form forces `per_user_limit=1` default; no way to choose Unlimited from UI | Frontend default flipped to empty/Unlimited; Pydantic schema default → None; runtime `or 1` coercions removed in `core/coupon.py:1727` and `routers/coupons.py:194` (D4) |
| Hidden | Runtime coerced `per_user_limit None → 1` even after schema accepted null | Caught during planning §3.5 audit; fixed in `core/coupon.py:1727` + `routers/coupons.py:194` |

---

## 2. Owner objective achieved

> *"If POS sends by mistake, CRM should honour and record drift in log."*

Operationalized as **universal CRM safety net** across V1 simple, V2 item-scope, V3-B BOGO/BXG, V3-C Nth. Every `coupon_usage` row now reflects either POS-sent (when non-zero) or CRM-computed (when POS=0). `discount_mismatch=True` is the audit flag for any drift. `usage_limit` and `per_user_limit` enforced from order #2 onwards regardless of POS reliability.

---

## 3. Files touched

| File | Lines | Net change |
|---|---|---|
| `backend/core/coupon.py` | 743–807 (selector), 2078–2230 (recorder), 1727 (per_user runtime) | ~95 LoC added/modified |
| `backend/routers/pos.py` | 1568 (gate), 1618–1623 (dead elif removed) | ~7 LoC removed/changed |
| `backend/routers/coupons.py` | 194 (legacy per_user check) | 3 LoC modified |
| `backend/models/schemas.py` | 584, 757 (CouponCreate + Coupon defaults) | 2 LoC modified |
| `frontend/src/pages/CouponsPage.jsx` | 76, 295, 364, 938 | 4 LoC modified |
| `backend/tests/qa_cr021_distribute_and_pos_zero.py` | new | 366 LoC, 52 assertions |

---

## 4. QA results

| Suite | Result |
|---|---|
| `qa_cr001c_c_coupon_v3_b_bogo_bxgy.py` (legacy regression) | **49/49 PASS, 0 FAIL** |
| `qa_cr001c_c_coupon_v3_c_every_nth.py` (legacy regression) | **41/41 PASS, 0 FAIL** |
| `qa_cr021_distribute_and_pos_zero.py` (new) | **52/52 PASS, 0 FAIL** |
| **GRAND TOTAL** | **142/142 PASS, 0 FAIL** |

Zero legacy assertion edits needed — distribute-first is fully back-compat for single-line carts (the only shape the legacy suites covered).

---

## 5. Owner-visible behavior changes

| Surface | Before | After |
|---|---|---|
| Cart `mtest + 5Star + xyz12` (BOGO Buy mtest, Get 5Star/xyz12, get_qty=1) | Discounts 5Star only | Same — only 1 unit needed; cheapest wins |
| Cart `2× mtest + 5Star + xyz12` (BOGO, 2 apps × 1 get_qty = 2 units) | Discounts 5Star only (₹25 + ₹25 = ₹50 if 5Star qty=2; else partial) | Discounts 1× 5Star + 1× xyz12 (₹25 + ₹125 = ₹150) — distributes |
| Cart `mtest=1 + xyz12=1 + 5Star=2` Nth=2 free | Discounts 2× 5Star (₹100 total) | Discounts 1× 5Star + 1× mtest (₹300 total) |
| POS sends `code + discount=0` (any class), CRM computes > 0 | Silent skip; `total_used` never increments; customer re-uses indefinitely | Recorded with `crm_computed`, `discount_mismatch=True`, `total_used` increments → 2nd order blocked if usage_limit reached |
| Form "Per User Limit" default on create | `1` | empty (Unlimited) — placeholder shows "Unlimited" |

---

## 6. Risk vs reality

| Risk from plan | Outcome |
|---|---|
| R1: legacy fixtures bake in cheapest-greedy expected discounts | Did NOT materialize. All 90 legacy assertions green on first run. |
| R2: accounting drift on POS=0 records | Mitigation in place: `discount_mismatch=True` flag visible in CR-003 dashboard. Operator note added to PRD. |
| R3: V1 misclassification | Moot — D3 went all-in. No whitelist. |
| R5: legacy fixtures need expected-value updates | Did NOT materialize. |
| R8: off-by-one in selector | Smoke test case I (need 10, have 2) handled cleanly — no infinite loop, returns 2 units. |
| R9: `effective_pos_sent` stale reference | Caught by regression suites; rename consistent across usage_doc + return dict. |

---

## 7. Production deployment readiness

✅ All code in place on preview pod `https://624af823-7129-4097-96fa-856cfd1bfa5e.preview.emergentagent.com`.
✅ Backend hot-reload + manual restart applied (because schema change).
✅ Frontend hot-reload picked up changes automatically.
✅ No DB migration required (existing coupons untouched).
✅ Safe to roll back per plan §7 (`git checkout -- <file>` for each touched file).

⚠ **Operational note for ops team**: V1 simple coupons may now create more `discount_mismatch=True` rows than before. Reconcile via CR-003 dashboard weekly. This is **expected** and is the silent-loop closure.

---

## 8. Out-of-scope tracker (deferred items from discovery)

| # | Item | Status |
|---|---|---|
| O1 | Customer-choice benefit selection (cashier picks at POS) | Deferred — separate UX CR |
| O2 | Cap-1-per-line strict mode | Not requested |
| O3 | POS-sent < CRM-computed override (Gap C) | Confirmed out of scope — POS wins when non-zero |
| O4 | Stackable / multi-coupon order | Untouched |
| O5 | Backfill / retro-record of historically-missed usages | Deferred — admin-tool CR if needed |
| O6 | Extending Mayur expired test coupons' `valid_to` | Owner left as-is — QA uses synthetic `pos_cr021_test` user |
| O7 | UI exposure of `allow_repeat` / `max_applications` | Already in UI; no work needed |

---

## 9. Decisions log entries (added)

1. **D1 (CR-021)**: BOGO/BXG/Nth benefit-unit selection uses distribute-first round-robin across distinct eligible item-lines. Cheapest line wins tie-break by default; `apply_to_highest_item=True` flips to highest. Single helper `_v3b_select_get_units` serves both V3-B and V3-C compute paths.
2. **D2/D3 (CR-021)**: `record_coupon_usage_for_order` is the universal CRM safety net. When POS sends `coupon_discount=0` AND CRM computes > 0, CRM records the redemption using `crm_computed_discount`, sets `discount_mismatch=True`, and logs `coupon_pos_zero_drift_recorded`. Applies to ALL coupon classes (no whitelist). Skip only when CRM also computes 0.
3. **D4 (CR-021)**: Form default for `per_user_limit` is empty / `null` (Unlimited). Pydantic schema accepts `Optional[int] = None`. Runtime `or 1` coercions in `core/coupon.py:1727` and `routers/coupons.py:194` removed — `None` and `0` both mean Unlimited.
4. **D-runtime-fix (CR-021)**: Caught during planning §3.5 audit — schema change alone was insufficient; runtime had two `or 1` coercions that would have silently defeated the new default. Lesson: future schema-default changes must grep for runtime coercions before declaring done.

---

## 10. PARK status block

```
status:         closed
parked_reason:  N/A — all work shipped
resume_signal:  N/A — CR closed
follow_up:      Monitor `discount_mismatch=True` rate in CR-003 dashboard for 1 week
                post-deploy to confirm V1 simple POS-zero rate is within ops tolerance.
```

---

**END OF CLOSEOUT — CR-021**
