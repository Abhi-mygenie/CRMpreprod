# CR-123 — Impact Analysis: Loyalty earn base = pre-tax, post-discount, post-redemption
**Date**: 2026-10-12 · **Role**: Planning Agent · **Risk**: LOW · **No code changed. No data written.**
**Intake**: `discovery/CR_123_LOYALTY_EARN_BASE_SUB_TOTAL_INTAKE.md` (§6a owner rulings Q1–Q4, §6b evidence)

---

## 1. Registered? ✅
Register row 77 · dashboard row 123 · state `cr123_registered_2026_10_12_q1_q4_ruled_gate_closed`. All four owner questions ruled; no open decisions block this IA.

---

## 2. Code reality (confirmed from live code, 2026-10-12)

### 2.1 Primary — `POST /api/pos/orders` · `routers/pos.py:1336` handler

```python
# 1219  POSOrderWebhook.order_sub_total_amount: Optional[float] = None   # POS sends; 94 % of Sept+ orders
# 1221  order_discount: float = 0.0
# 1222  self_discount: float = 0.0
# 1228  coupon_discount: float = 0.0   (aliases couponDiscount / coupon_amount / coupon_discount_amount)

# 1422  redeem_loyalty_points(... order_total=order_data.order_sub_total_amount or order_data.order_amount ...)
#       → redemption CAP already on pre-tax base ✅

# 1449  earn_base_amount = max(0.0, order_data.order_amount - loyalty_redeemed_value)   ← THE GAP (post-tax)
# 1451  pts = calculate_points(earn_base_amount, customer, settings)
# 1452  points_earned = pts["total_points"]
```

Downstream of `points_earned` (all read the variable — none recompute):
| Line | Consumer | Effect of CR-123 |
|---|---|---|
| 1492 | `new_points = current_points + points_earned` | correct balance automatically |
| 1534 | `$inc total_points_earned` | correct lifetime total |
| 1543 → 1056–1070 | `_save_order_and_transactions` → `points_transactions` row | correct `points`; **description at 1057 prints `Rs.{order_amount}`** — will be misleading (base ≠ order_amount) → cosmetic edit E2 |
| 998 | `orders.points_earned` | correct |
| 1562 | `build_order_event_context(points_earned=…)` → WhatsApp templates | correct value flows to `{{points_earned}}` |
| 1751 | `POSResponse.data.points_earned` | **this is the number POS must display** (owner G2 ruling) |

### 2.2 `core/loyalty.py::calculate_points(order_amount, customer, settings)` — lines 55–100
Pure math: `min_order_value` gate → tier % → off-peak bonus. Takes whatever base it is given. **No change.** Note: the `min_order_value` gate will now apply to the **net** base (V4 in matrix) — this is the correct reading of "min order".

### 2.3 Secondary — `POST /api/scan/max-redeemable` · `routers/scan.py:576–608` (CR-107)
```python
576  class ScanMaxRedeemableRequest(BaseModel): bill_amount: float
593  cap = compute_max_redeemable(customer, settings, data.bill_amount)
596  pts = calculate_points(data.bill_amount, customer, settings)   ← preview earns on raw bill_amount
607  "projected_points_earned": projected_earned
```
Owner Q3 = (b): add optional `points_to_redeem` so preview = post-redemption earn. `cap["ratio_per_point"]` and `cap["max_points_redeemable"]` are already computed two lines above — the conversion is free.

### 2.4 Mirror surface — `POST /api/pos/max-redeemable` · `routers/pos.py:471–565`
Same preview logic for POS (`projected_points_earned`, `projected_tier_after`). Same ambiguity (`bill_amount` undefined pre/post-tax; no redemption deduction). **Not in CR-123 scope** (owner ruled Q3 for scan only). → D1 below.

### 2.5 Legacy — `POST /api/pos/webhook/payment-received` · `pos.py:1788`, earn at `:2029`
Owner Q2 = (a): out of scope. 0 preprod calls. Documented as legacy.

---

## 3. Proposed design

### 3.1 Earn base (pos.py:1449) — ruled formula with safe fallback

```
if order_sub_total_amount is present (truthy):
    base = order_sub_total_amount
         − coupon_discount
         − order_discount
         − loyalty_redeemed_value
else:                                   # POS omitted sub-total (6 % of orders)
    base = order_amount − loyalty_redeemed_value        # today's behaviour, unchanged
earn_base = max(0, base)
```

Why branch instead of `(sub_total or order_amount) − discounts`: `order_amount` is **already net of discounts**; subtracting them again would double-deduct on the fallback path (intake §7 caveat).

Not deducted: `self_discount` (never non-zero on preprod; meaning unconfirmed with POS → D2), `wallet_used` (wallet is the diner's own prepaid money — it *is* payment; earning on it is correct), `tip_amount`/`delivery_charge`/`round_up` (not in sub-total to begin with).

### 3.2 Scan preview (scan.py:576–608) — additive, backward compatible

```
Request:  { bill_amount: float, points_to_redeem?: int, coupon_discount?: float }
Compute:  effective_pts  = min(points_to_redeem or 0, cap.max_points_redeemable)   # never preview more than allowed
          redeem_value   = effective_pts × cap.ratio_per_point
          earn_base      = max(0, bill_amount − (coupon_discount or 0) − redeem_value)
          projected      = calculate_points(earn_base, customer, settings).total_points
Response: + "earn_base_preview": earn_base          # additive — lets S&O show "earning on ₹946"
          + "points_to_redeem_applied": effective_pts
```
When both new fields are omitted → identical to today. `bill_amount` contract = **pre-tax, pre-discount cart sub-total** (same meaning as POS `order_sub_total_amount`), so preview and stored value agree.

`coupon_discount` on the preview is additive and optional — S&O already has it from `POST /scan/coupons/validate.computed_discount`. Included per intake §7 "Planning to confirm" → D3.

### 3.3 Cosmetic — points_transactions description (pos.py:1057)
`"Earned on order {id} (Rs.{order_amount})"` → `"Earned on order {id} (Rs.{earn_base_amount:.2f} net)"`. Requires passing `earn_base_amount` into `_save_order_and_transactions` (1 new kwarg, default `None` → falls back to old text). Keeps the staff-facing points history honest about the base.

---

## 4. Data flow trace — order 1233135 (r689, real preprod order) before/after

```
POS webhook: sub_total 290 · coupon_discount 43.5 · gst 12.33 · order_amount 216 · loyalty_points_used 0 · tier Bronze 5 %

TODAY                                   CR-123
earn_base = 216 − 0 = 216               earn_base = 290 − 43.5 − 0 − 0 = 246.5
points    = int(216 × 5 %) = 10         points    = int(246.5 × 5 %) = 12
tx desc   "… (Rs.216.0)"                tx desc   "… (Rs.246.50 net)"
POSResponse.points_earned = 10          POSResponse.points_earned = 12   ← POS displays this
```

Order 002563 (r478): `order_amount 440`, sub-total 440 (no tax), redeem 44 pts @ ₹1 → base 396 → **19** both before and after (G2 preserved; POS's 22 remains a POS display gap).

Scan preview, same cart: `{bill_amount 290, coupon_discount 43.5}` → `projected_points_earned 12` — matches stored.

---

## 5. Affected files

### WILL change
| File | Lines | Change | Size |
|---|---|---|---|
| `routers/pos.py` | 1444–1449 | E1 — earn-base branch (§3.1) + comment | ~8 lines |
| `routers/pos.py` | 874–880 sig · 1057 desc · 1543 call | E2 — `earn_base_amount` kwarg → description | ~4 lines |
| `routers/scan.py` | 576–578 model · 594–597 compute · 598–608 response | E3 — `points_to_redeem` + `coupon_discount` + 2 response keys (§3.2) | ~10 lines |

**Total ≈ 22 lines, 2 files.**

### WILL NOT change
| File / thing | Reason |
|---|---|
| `core/loyalty.py` | `calculate_points`, `compute_max_redeemable`, `redeem_loyalty_points` used as-is |
| `core/coupon.py` · `core/whatsapp.py` | untouched; consume `points_earned` only |
| `routers/pos.py:471–565` (`/pos/max-redeemable`) | out of scope → D1 |
| `routers/pos.py:1788–2080` (`payment-received`) | owner Q2 = a |
| `models/schemas.py` · frontend · MongoDB documents/indexes · `.env` | no schema, no migration, no back-fill (owner Q4 = a) |

---

## 6. Downstream consumers & contracts

| Consumer | Impact | Action |
|---|---|---|
| **POS** (`POSResponse.data.points_earned`) | Value changes (lower on taxed orders, higher on coupon orders vs today's post-tax). POS currently self-calculates → shows a different number. | **POS brief**: display `points_earned` from CRM response; stop computing locally. Already in DECISIONS_LOG 2026-10-12. |
| **S&O** (`/scan/max-redeemable`) | Additive fields only. Existing call unchanged. | **S&O brief**: `bill_amount` = pre-tax pre-discount sub-total; send `points_to_redeem` + `coupon_discount` for exact preview; after order read `points_earned`. |
| **WhatsApp templates** (`{{points_earned}}`) | Correct value, no template change | none |
| **CRM dashboard** (points history) | New rows show "net" base in description; old rows unchanged | none |
| **Customers' balances** | Forward-only; no retro adjustment | none (owner Q4) |

---

## 7. Risk assessment

| Area | Risk | Reasoning |
|---|---|---|
| Earn math | **LOW** | One arithmetic expression; same `calculate_points` helper; branch mirrors line 1422's existing `sub_total or order_amount` idiom |
| Fallback path | **LOW** | Explicit branch → identical to today when sub-total absent; no double deduction |
| Negative base | **NONE** | `max(0, …)` retained; coupon > sub-total (e.g. order 1233091: 300 − 197) → base 103, fine |
| `min_order_value` gate on net | **LOW / intended** | A ₹1,092 bill with ₹1,040 food under a ₹1,050 min-order now earns 0 — this is the correct reading; note for owner in V4 |
| Scan preview | **LOW** | Additive optional fields; clamp to `max_points_redeemable`; defaults preserve today's response |
| §14 hotspot `routers/pos.py` orders handler | **MEDIUM-file, LOW-change** | CRITICAL file but the edit is 8 lines inside a single already-commented block (CR-001C-LR) |
| Behaviour visible to diners | **MEDIUM (perception)** | Taxed orders earn ~5 % fewer points than before. Announce via POS display fix so POS and CRM agree. |

---

## 8. Conflict check

| With | Overlap | Resolution |
|---|---|---|
| CR-119/120/121/122 (scan.py) | Different hunks (`scan.py:177–241`, `468–573`, `619–673`) vs CR-123 `576–608` | none |
| Wave A G1–G4 (`customers.py`, `customer_sync`, scripts) | different files | none |
| CR-085-A2 guest path (`pos.py:1364–1380, 1450`) | adjacent lines | CR-123 edits line 1449 only; `is_guest` guard at 1450 untouched |
| CR-007 redemption block (`pos.py:1367–1438`) | provides `loyalty_redeemed_value` | consumed, not modified |
| CR-107 (scan max-redeemable) | same route | CR-123 extends it additively |
| October batch (not yet deployed) | same files | CR-123 ships **after** Oct batch smoke/deploy — do not merge into that batch |

---

## 9. Owner decisions surfaced by this IA

| D | Decision | Options | Recommendation |
|---|---|---|---|
| **D1** | Mirror the preview change to `POST /pos/max-redeemable` (POS's own preview)? | (a) no — POS brief tells them `bill_amount` = pre-tax; separate CR if POS asks · (b) yes, same additive fields now | **(a)** — keep CR-123 tight; POS not yet reading `points_earned` anyway |
| **D2** | Include `self_discount` in the deduction? | (a) no — never non-zero, meaning unconfirmed · (b) yes | **(a)**; ask POS what it means in the brief |
| **D3** | Include optional `coupon_discount` on `/scan/max-redeemable`? | (a) yes (additive, S&O already has the value) · (b) `points_to_redeem` only | **(a)** |
| **D4** | Cosmetic E2 (transaction description shows net base)? | (a) yes · (b) skip | **(a)** — 4 lines, staff-facing honesty |

If owner is silent, Planning proceeds with all recommendations (a/a/a/a) in the Implementation Plan.

---

## 10. Verification matrix

| V | Case | Expected |
|---|---|---|
| V1 | Webhook `order_amount 1092 · sub_total 1040 · no discount · no redeem · 5 %` | `points_earned 52` (today 54) |
| V1b | Replay 1233135: `sub_total 290 · coupon 43.5 · gst 12.33 · amount 216` | `12` (today 10; naive sub-total 14) |
| V2 | `amount 440 · sub_total 440 · redeem 44 pts @ ₹1` | `19` (unchanged) |
| V3 | No `order_sub_total_amount`, `coupon_discount 10`, `amount 99` | `int(99 × 5 %) = 4` — identical to today, **no double deduction** |
| V4 | `sub_total 1040 · amount 1092 · min_order_value 1050` | `0` — gate on net base (document for owner) |
| V5 | Guest order / `loyalty_enabled=false` | `0` — unchanged |
| V6 | Coupon > sub-total (`300 − 197`) | base 103 → `5` |
| V7 | `points_transactions` row for V1b | description contains `Rs.246.50 net` |
| V8 | `POST /scan/max-redeemable {bill_amount 1040}` | `projected_points_earned 52`, `earn_base_preview 1040`, `points_to_redeem_applied 0` — today's shape + 2 keys |
| V9 | `{bill_amount 1040, points_to_redeem 100}` ratio 1.0 | `47`, `earn_base_preview 940` |
| V10 | `{bill_amount 290, coupon_discount 43.5}` | `12` — matches V1b stored value |
| V11 | `points_to_redeem 9999` with `max_points_redeemable 200` | clamped: `points_to_redeem_applied 200` |
| V12 | Regression: `test_iter6_phase_a.py` · `test_iter6_phase_b.py` · `test_cr085a_normalization.py` · `test_cr082_requires_customer.py` · `test_cr094_loyalty_rules.py` | PASS (CR-085a 429-timing NOTEs tolerated as documented) |

---

```
Planning complete: CR-123
Stage: Impact Analysis
Code reality: FULL (pos.py:1219–1228 model · :1422 vs :1449 · :1057 desc · :1751 response · scan.py:576–608 · loyalty.py:55–100 · pos.py:471–565 mirror · :2029 legacy)
Risk: LOW
Files WILL change: routers/pos.py (E1 earn-base branch ~8 lines; E2 description kwarg ~4 lines) · routers/scan.py (E3 preview params ~10 lines)
Files WILL NOT touch: core/loyalty.py · core/coupon.py · core/whatsapp.py · pos.py /pos/max-redeemable · pos.py payment-received · models/schemas.py · frontend · DB/indexes · .env
Owner decisions: D1 mirror POS preview (rec a: no) · D2 self_discount (rec a: no) · D3 coupon_discount on scan preview (rec a: yes) · D4 cosmetic desc (rec a: yes) — proceed on recommendations if silent
Downstream briefs: POS (display points_earned from CRM) · S&O (bill_amount = pre-tax sub-total; new optional preview fields)
Docs: planning/CR_123_IMPACT_ANALYSIS.md
Next: Implementation Plan gate opens on "choose planning role for implementation planning of CR-123"
```
