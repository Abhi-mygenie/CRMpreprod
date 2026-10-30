# CRM → POS — Loyalty points: CRM is the source of truth for `points_earned` (CR-123) · 3 asks
**Date:** 2026-10-12
**Owner sends; agents never send.**
**Re:** POS bill screen shows a different "points earned" than CRM credits (52 vs 54 · 22 vs 19) · earn-base rule now fixed on CRM · asks **P-18, P-19, P-20**
**Base URL (preprod preview):** `https://mygenie-crm-preprod.preview.emergentagent.com` · all routes under `/api`

---

## §0 — TL;DR

| | |
|---|---|
| **What was wrong on CRM** | CRM earned loyalty % on the bill total **including GST**. Fixed (CR-123, preprod now). |
| **What is wrong on POS** | POS computes its own "points earned" and shows it on the bill. It ignores the diner's **loyalty redemption** (shows 22 where the correct answer is 19). |
| **The fix on your side** | **Stop calculating points locally. Display `data.points_earned` from the `POST /api/pos/orders` response.** CRM already returns it on every order. |
| **Also** | `bill_amount` on `POST /api/pos/max-redeemable` must be the **pre-tax, pre-discount sub-total** (P-19) · tell us what `self_discount` means (P-20) |

---

## §1 — The earn rule (frozen, owner-ruled 2026-10-12)

```
earn base = order_sub_total_amount          (food value: pre-tax, pre-discount — the field you already send)
          − coupon_discount − order_discount
          − ₹ value of loyalty points redeemed on this order
points    = tier % × earn base              (min-order gate applies to the net base; off-peak bonus on top)
```

| Order | What POS showed | What CRM credits | Why |
|---|---|---|---|
| ₹1,040 food + ₹52 GST = ₹1,092 | **52** ✅ | was 54 → **now 52** | CRM was earning on GST. Fixed. |
| `002563` r478: ₹440, diner redeemed 44 pts (₹44) | **22** ❌ | **19** | 5 % × (440 − 44). A diner must not earn points on the part of the bill they paid with their own points. CRM was already right here. |
| sub-total ₹290, coupon ₹43.50, GST ₹12.33 | — | **12** | 5 % × 246.50. Not 14 (raw sub-total), not 12.9 (total). |

CRM is the loyalty ledger. Whatever POS prints that differs from `points_earned` is a display bug the diner will notice.

---

## §2 — P-18: display `points_earned` from the CRM order response (no local math)

You already receive this on every order:

```json
POST /api/pos/orders  →  200
{ "success": true, "data": {
    "order_id": "...", "pos_order_id": "002563",
    "customer_id": "...", "customer_name": "...",
    "points_earned": 19,                 ← PRINT THIS on the bill / customer screen
    "off_peak_bonus": 0,
    "off_peak_message": null,
    "total_points": 55,                  ← balance after this order (post-redeem, post-earn)
    "tier": "Bronze",
    "loyalty_redeem": { "points_redeemed": 44, "redeemed_value": 44.0, "remaining_points": 36, ... },
    ...
} }
```

- `points_earned` already includes off-peak bonus; `off_peak_bonus` is the breakdown if you want to show "+5 happy-hour bonus".
- Guest / invalid-phone orders: `points_earned: 0`, `customer_id: null` — print nothing.
- If the redemption POS embedded was **rejected** (below min points, insufficient balance), the order is still accepted (we never reject a bill); `loyalty_redeem` is absent and `points_earned` is computed on the undiscounted base. Check for `loyalty_redeem` before printing "₹44 redeemed".

**Ask P-18:** remove the client-side earn calculation on the bill/receipt and bind it to `data.points_earned`. Reply with the POS build in which this lands.

---

## §3 — P-19: `POST /api/pos/max-redeemable` — `bill_amount` is the pre-tax sub-total

This is your pre-bill preview ("customer can redeem up to N, will earn M"). Its `projected_points_earned` is computed on whatever `bill_amount` you send. We never defined it — please confirm you send **`order_sub_total_amount` (pre-tax, pre-discount)**, not the GST-inclusive total. If you send the total, the preview overstates.

Note: the POS preview does **not** yet subtract coupon or redemption (the Customer App preview now accepts optional `points_to_redeem` + `coupon_discount` — CR-123). If you want the same on `/pos/max-redeemable`, say so and we'll register it; it is additive and small. Until then, treat `projected_points_earned` as "earn with no coupon and no redemption".

---

## §4 — P-20: what is `self_discount`?

Your order payload has `order_discount`, `coupon_discount` and `self_discount`. CRM now deducts the first two from the earn base. `self_discount` has never been non-zero in anything we've received. Please tell us: (a) what it represents, (b) whether it reduces the amount the diner pays — if yes, we'll deduct it too.

---

## §5 — Nothing changes in the webhook contract

No new fields required from POS. We rely on what you already send: `order_sub_total_amount`, `coupon_discount`, `order_discount`, `loyalty_points_used`, `loyalty_discount`. When `order_sub_total_amount` is **absent** (≈6 % of orders we see), CRM falls back to `order_amount − redemption` — please keep sending the sub-total on every bill so the tax exclusion applies.

---

## §6 — Please validate on preprod (r689, API key unchanged)

| V | Send to `POST /api/pos/orders` | Expect `data.points_earned` (Bronze 5 %, min-order 200) |
|---|---|---|
| V1 | `order_amount 1092, order_sub_total_amount 1040, gst_tax 52` | **52** |
| V2 | `order_amount 258.83, order_sub_total_amount 290, coupon_discount 43.5, gst_tax 12.33` | **12** |
| V3 | customer with ≥100 pts: `order_amount 340, order_sub_total_amount 440, loyalty_points_used 100, loyalty_discount 100` | **17**, `loyalty_redeem.points_redeemed 100` |
| V4 | same as V3 but customer has <100 pts | order accepted, no `loyalty_redeem`, **22** (earn on 440) |
| V5 | your bill screen for V1–V3 | prints the same number CRM returned |

Reply with `P-18 / P-19 / P-20` answers and V1–V5 results.

---

*CRM internal: CR-123 · `routers/pos.py:1448–1462` earn-base branch · `routers/scan.py:576–617` preview params · owner rulings DECISIONS_LOG 2026-10-12 · POS display gap is POS-side; no CRM change · self-test 12/12 on preprod r689 · asks P-18/19/20 appended to POS ask list (P-8…P-17 outstanding).*
