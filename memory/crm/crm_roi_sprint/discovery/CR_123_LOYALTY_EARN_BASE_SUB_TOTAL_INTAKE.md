# CR-123 — Intake: Loyalty earn base uses `order_amount` (post-tax) instead of `order_sub_total_amount` (pre-tax)
**Date**: 2026-10-12 · **Role**: Intake Agent · **Source**: Owner investigation (POS screenshots: 52 vs CRM 54 · order 002563 r478: POS 22 vs CRM 19) · Owner ruling 2026-10-12 (`DECISIONS_LOG.md` "Option B") · **No code changed. No data written.**

---

## 1. Owner report (verbatim intent)

> "in pos it shows 52 … can u check contract and if POS is displaying it right for customer" · "option B" · "2 yes 19 is right amount not 22 … summarize ur understanding gap and proposed fix" · "choose intake role to register CR for gap in loyalty point … does same gap exist for scan and order also validate"

---

## 2. Understanding — two independent gaps, one CRM fix

| # | Gap | Where | Who is right | Status |
|---|---|---|---|---|
| **G1** | Earn base includes GST / service charge. CRM earns % on `order_amount` (bill total incl. tax). POS earns on food value (pre-tax). Example: sub-total ₹1,040 → POS 52; CRM uses ₹1,092 (incl. 5 % GST) → 54. | `routers/pos.py:1449` | **POS** — customers must not earn points on tax. Owner ruled **Option B**: base = `order_sub_total_amount`. | **CRM fix — this CR** |
| **G2** | Loyalty redemption deducted from earn base. CRM: `440 − 44 redeemed = 396 × 5 % = 19`. POS shows 22 (no deduction). | `pos.py:1449` (CRM) · POS display | **CRM** — owner: "19 is right amount not 22". Diner must not earn on the portion paid with their own points. | **No CRM change. POS gap** — POS must display `points_earned` from CRM response instead of self-calculating. Goes in POS brief. |

**Post-fix formula** (locked by owner):
```
earn_base = max(0, order_sub_total_amount − loyalty_redeemed_value)
points    = calculate_points(earn_base, customer, settings)   # tier %, min_order, off-peak unchanged
```

---

## 3. Code reality (confirmed from live code)

### `routers/pos.py` — `POST /api/pos/orders`
```python
1422: order_total=order_data.order_sub_total_amount or order_data.order_amount,   # redemption cap → ALREADY pre-tax
...
1449: earn_base_amount = max(0.0, order_data.order_amount - loyalty_redeemed_value)  # earn → post-tax  ← THE GAP
1451: pts = calculate_points(earn_base_amount, customer, settings)
```
The same handler already uses `order_sub_total_amount or order_amount` for the **redemption** cap (line 1422) but `order_amount` for **earn** (line 1449). Internal inconsistency inside one function — the fix aligns earn with redemption.

- `POSOrderWebhook.order_sub_total_amount: Optional[float] = None` (line 1219) — POS sends it; stored as `orders.order_sub_total` (line 919).
- `core/loyalty.py::calculate_points(order_amount, customer, settings)` — pure math (`min_order_value` gate, tier %, off-peak). **No change needed.**

### DB probe (preprod, orders since 2026-09-01)
- 355 orders · **335 (94 %) carry numeric `order_sub_total`** · 20 missing → `or order_amount` fallback is required and correct.
- Sample r675: `order_amount 641.0 / order_sub_total 580.0 / points_earned 32` → today earns on 641; post-fix earns on 580 (29 pts). Confirms G1 in live data.
- **Edge found**: r675 `order_amount 68.0 / order_sub_total 100.0` — a discounted order. `order_sub_total` is **pre-discount** as well as pre-tax. Switching base to sub-total **removes the implicit deduction of coupon / order discounts** that `order_amount` carried. → **Owner Q1 below.**

### Secondary earn path — `POST /api/pos/webhook/payment-received` (legacy)
`pos.py:2029`: `points_earned = int(webhook_data.bill_amount * earn_percent / 100)` — earns on raw `bill_amount`, no sub-total field on that model, no redemption deduction. **0 calls** in `pos_request_logs` on preprod. → **Owner Q2 below** (propose out of scope — legacy, unused).

---

## 4. Scan & Order (Customer App) — does the same gap exist? **VALIDATED**

**Yes, but by inheritance, not by separate code.** Three surfaces checked:

| Surface | Finding | Action |
|---|---|---|
| **S&O order → points stored** | S&O has **no** order-creation or points-earn route in `routers/scan.py`. Every S&O order is placed through POS and reaches CRM via the same `POST /api/pos/orders` webhook → same `pos.py:1449`. | **Covered automatically by this CR.** No scan-side code. |
| **`POST /scan/max-redeemable` → `projected_points_earned`** (CR-107, `scan.py:596`) | `calculate_points(data.bill_amount, …)` — earns on whatever S&O passes. Contract brief (2026-10-09) never defined `bill_amount` as pre- or post-tax. If S&O sends the cart total incl. GST, the **preview overstates** (same G1, client-side). It also does not deduct the diner's intended redemption (G2) — acceptable at preview time (points not yet chosen) but preview ≠ final if they redeem. | **Contract clarification to S&O** (no code): `bill_amount` = pre-tax cart sub-total; `projected_points_earned` = earn **before** any redemption. **Optional Q3**: add `points_to_redeem` to request so preview can return post-redemption earn. |
| **`GET /scan/loyalty-rules/{rid}`** earn % (CR-094) | S&O may render "You'll earn X %" copy and compute locally. | Add to S&O brief: base = **pre-tax sub-total minus loyalty redeemed**; never compute on total incl. GST; after order, read `points_earned` from CRM, do not self-calculate (same instruction as POS). |

**Conclusion**: one CRM code fix (`pos.py:1449`) corrects stored points for POS **and** S&O orders. S&O needs a **contract note only** (plus optional Q3 enhancement).

---

## 5. Classification

| Field | Value |
|---|---|
| **Type** | **BUG** (loyalty math) — registered as CR for gate tracking |
| **Severity** | **P1** — money-adjacent: every taxed order over-credits points to every loyalty customer on every tenant; POS/CRM balances visibly disagree in front of diners. No workaround. (Not P0: no outage, no data loss; over-credit is small per order.) |
| **Risk** | **LOW** — 1-line change in 1 handler; fallback preserves today's behaviour when `order_sub_total_amount` is absent (6 % of orders); `calculate_points` untouched; redemption path already uses the same expression. |
| **Duplicate check** | **DISTINCT**. Related: CR-001C-LR (2026-05-23) introduced "earn on net amount (Option B)" — that Option B was about **redemption deduction**, not tax. CR-107 (`max-redeemable` preview) — related surface, contract-only follow-up. No open CR covers earn-base tax exclusion. |
| **Evidence** | Captured — owner screenshots (52 vs 54; 22 vs 19), `pos.py:1422` vs `:1449` inconsistency, preprod DB sample (641/580, 68/100), `DECISIONS_LOG.md` 2026-10-12 ruling. |
| **Blast radius** | **SMALL** — `routers/pos.py` 1 line (+ comment). Behavioural: all future POS + S&O orders earn fewer points (tax excluded). **No back-fill** of historical `points_earned` (owner to confirm — Q4). |

---

## 6. Owner questions (must be answered before Planning closes)

| Q | Question | Options | Intake recommendation |
|---|---|---|---|
| **Q1** | `order_sub_total` is pre-tax **and pre-discount**. Should coupon / order discounts also be deducted from the earn base? | (a) `sub_total − loyalty_redeemed` only (as ruled — diner earns on coupon-discounted portion) · (b) `sub_total − loyalty_redeemed − coupon_discount − order_discount` (earn only on what the diner actually paid for food) | **(b)** — consistent with the G2 principle "don't earn on what you didn't pay"; but POS currently shows (a)-style numbers (52 = 5 % of raw sub-total), so (b) widens the POS display gap until POS reads `points_earned` from CRM. Owner call. |
| **Q2** | Legacy `payment-received` webhook (`pos.py:2029`) earns on raw `bill_amount`. In scope? | (a) out of scope — 0 calls on preprod, legacy · (b) align too | **(a)** — document as known legacy; revisit if prod logs show traffic. |
| **Q3** | `POST /scan/max-redeemable`: add optional `points_to_redeem` so `projected_points_earned` reflects post-redemption earn? | (a) contract note only · (b) add param (small, additive, scan.py only) | **(a) now**, (b) as a follow-up CR if S&O asks. |
| **Q4** | Back-fill historical `points_earned` / `total_points`? | (a) no — forward-only · (b) recompute | **(a)** — recompute touches customer balances across all tenants; not worth the risk for a few points per order. |

---

## 6a. Owner rulings — 2026-10-12 (gate stays closed; Planning not opened)

| Q | Ruling | Note |
|---|---|---|
| **Q1** | **Discounts are deducted first; loyalty earned on the net.** Owner: "that's already the case … if not, justify your claim." | **Claim justified below (§6b).** It IS the case today — but only *because* CRM earns on `order_amount`, which is already net of discounts. The moment we move the base to `order_sub_total_amount` (pre-discount), that deduction disappears unless we subtract it explicitly. So the ruling = **Q1 (b)**: `earn_base = sub_total − coupon_discount − order_discount − loyalty_redeemed`. |
| **Q2** | **(a)** — legacy `payment-received` webhook out of scope. Documented as legacy; revisit only if prod logs show traffic. | |
| **Q3** | **(b)** — add optional `points_to_redeem` to `POST /scan/max-redeemable` so `projected_points_earned` reflects the post-redemption, post-discount earn. | Scope grows to **2 files** (`routers/pos.py` + `routers/scan.py`). Still LOW risk, additive, backward compatible when omitted. Planning must also decide whether the preview takes `coupon_discount` (S&O knows it from `/scan/coupons/validate`). |
| **Q4** | **(a)** — forward-only. No back-fill of historical `points_earned` / balances. | |

### 6b. Justification for Q1 — what the POS `order_sub_total_amount` actually is (preprod evidence)

Live order **1233135** (r689, 2026-10-12):
```
order_sub_total   290.00
coupon_discount    43.50   = 15 % × 290.00  → coupon was computed ON the sub-total → sub-total is PRE-coupon
gst_tax            12.33   =  5 % × 246.50  → tax computed AFTER coupon
order_amount      216.00   (final paid)
points_earned      10      = 5 % × 216 today (net of coupon AND tax)
```
Live order **1232834** (r675): `order_sub_total 100 · coupon_discount 20 · order_amount 68` — same pattern.
12 of 355 Sept+ orders carry a discount; in **every one** `order_sub_total` is larger than (`order_amount` − tax), i.e. it excludes the discount.

So POS bill structure is: **`sub_total` → − coupon/order discount → + tax → `order_amount`**.

- **Today**: CRM earns on `order_amount` → discounts are implicitly removed ✅, but tax is included ❌.
- **Naive Option B** (raw `sub_total`): tax removed ✅, but discounts come back in ❌ — order 1233135 would earn 5 % × 290 = 14 instead of 12.
- **Ruled formula**: `sub_total − discounts − loyalty_redeemed` → tax removed ✅, discounts removed ✅, redemption removed ✅ → order 1233135 earns 5 % × 246.5 = **12**.

`self_discount` and `order_discount` are also on the webhook model (`pos.py:1221–1223`). Preprod since June: `coupon_discount > 0` on 21 orders · `order_discount > 0` on **0** · `self_discount > 0` on **0**. Include `order_discount` defensively (same semantics); `self_discount` → Planning to confirm with POS what it means before including.

---

## 7. Fix sketch (for Planning — do not implement now)

```python
# routers/pos.py:1449 — CR-123 (owner Q1 ruling: discounts first, then earn on the net)
earn_base_amount = max(
    0.0,
    (order_data.order_sub_total_amount or order_data.order_amount)
    - float(order_data.coupon_discount or 0)
    - float(order_data.order_discount or 0)
    - loyalty_redeemed_value,
)
```
Fallback caveat for Planning: when `order_sub_total_amount` is absent (6 % of orders) `order_amount` is already net of discounts — subtracting them again would double-deduct. Planning must branch: `if sub_total present: sub_total − discounts − redeemed` else `order_amount − redeemed` (today's behaviour).

```python
# routers/scan.py — POST /scan/max-redeemable (owner Q3 = b)
class ScanMaxRedeemableRequest(BaseModel):
    bill_amount: float                      # pre-tax, pre-discount cart sub-total
    points_to_redeem: Optional[int] = None  # CR-123: preview earn after redemption
    coupon_discount: Optional[float] = None # CR-123: Planning to confirm
# projected_points_earned = calculate_points(bill_amount − coupon_discount − points_to_redeem × ratio_per_point, …)
```

Companion (no code): S&O brief §4 note · POS brief: "read `points_earned` from CRM response; stop self-calculating".

---

## 8. Verification sketch

| V | Case | Expected |
|---|---|---|
| V1 | Webhook: `order_amount 1092`, `order_sub_total_amount 1040`, 5 % tier, no redemption | `points_earned 52` (was 54) |
| V1b | Replay order 1233135: `sub_total 290`, `coupon_discount 43.5`, `gst 12.33`, `order_amount 216` | `points_earned 12` (was 10; naive sub-total would give 14) |
| V2 | Webhook: `order_amount 440`, `order_sub_total_amount 440`, redeem 44 pts (₹44) | `points_earned 19` (unchanged — G2 preserved) |
| V3 | Webhook without `order_sub_total_amount` but with `coupon_discount` | falls back to `order_amount − redeemed` — identical to today, **no double deduction** |
| V8 | `POST /scan/max-redeemable {bill_amount 1040, points_to_redeem 100}` (ratio 1.0) | `projected_points_earned = 5 % × 940 = 47` |
| V4 | `order_sub_total_amount` below `min_order_value` but `order_amount` above | 0 points (gate now on pre-tax base) |
| V5 | Guest order / `loyalty_enabled=false` | 0 points — unchanged |
| V6 | Regression: `tests/` loyalty + POS order suites | PASS |
| V7 | `POST /scan/max-redeemable {bill_amount: 1040}` | `projected_points_earned 52` — confirms S&O preview matches stored value when S&O passes pre-tax |

---

```
Intake complete: CR-123
Classification: BUG (loyalty math) — tracked as CR
Severity: P1
Risk: LOW
Duplicate check: DISTINCT (related: CR-001C-LR redemption-net ruling; CR-107 preview surface)
Evidence: captured (owner screenshots 52/54 + 22/19; pos.py:1422 vs :1449; preprod DB 641/580, 68/100; DECISIONS_LOG 2026-10-12)
Blast radius: SMALL (routers/pos.py ~5 lines + routers/scan.py ~6 lines; all future POS + S&O orders earn on pre-tax, post-discount, post-redemption base; no back-fill)
S&O validation: same gap inherited — fixed by the same pos.py change; plus Q3(b) additive preview param in scan.py
Owner rulings 2026-10-12: Q1 = discounts deducted first (claim justified §6b) · Q2 = a (legacy out of scope) · Q3 = b (add points_to_redeem) · Q4 = a (forward-only)
Docs updated: discovery/CR_123_LOYALTY_EARN_BASE_SUB_TOTAL_INTAKE.md · 00_register row 77 · CR_STATUS_DASHBOARD · DECISIONS_LOG
Next: GATE CLOSED — owner said "stay at gate". Planning opens only on "choose planning role for CR-123"
```
