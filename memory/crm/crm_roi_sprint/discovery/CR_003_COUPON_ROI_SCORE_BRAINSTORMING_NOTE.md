# CR-003 — Coupon ROI Score — Brainstorming Note

**Sprint:** ROI Measurement Sprint
**Date:** 2026-05-27
**Status:** `brainstorming_note_only — no implementation, no code, no plan`
**Author:** CRM ROI Measurement Sprint Agent

---

## 0. Data Investigation Summary

Before brainstorming, we queried live production data to ground every recommendation in reality.

**Key discovery: `coupon_usage` already stores `order_total` (net order amount after discount) on every record.**

| Field in `coupon_usage` | Meaning | Present on all records? |
|---|---|---|
| `order_total` | Net order amount (what customer paid, AFTER discount) | Yes — 100% of records |
| `order_value` | Same as `order_total` (duplicate field) | Yes |
| `coupon_discount` | Discount amount given | Yes |
| `eligible_subtotal` | Subtotal of eligible items only (before discount) | Yes |
| `order_id` | FK to `orders` collection | Yes |

**Proof that `order_total` is NET (post-discount), not GROSS:**

| Coupon | order_total | coupon_discount | order_total + discount (= gross) | orders.order_amount |
|---|---|---|---|---|
| FLAT100TEST | 1,014 | 100 | 1,114 | 1,014 (matches — NET) |
| SEED_EDGE_STACKABLE | 1,537 | 150 | 1,687 | 1,537 (matches — NET) |
| SEED_V3A_LUNCH | 620 | 147.6 | 767.6 | 620 (matches — NET) |
| SEED_V2_CATMULTI | 283 | 29.9 | 312.9 | 283 (matches — NET) |

Therefore: **Gross Revenue = order_total + coupon_discount**.

**Real ROI numbers from live restaurants:**

| Restaurant | Uses | Discount Given | Net Revenue | Gross Revenue | ROI (gross/disc) |
|---|---|---|---|---|---|
| R523 (11 uses) | 11 | ₹1,713 | ₹17,195 | ₹18,908 | **11.0x** |
| R689 (4 uses) | 4 | ₹428 | ₹3,454 | ₹3,882 | **9.1x** |
| R391 (5 uses) | 5 | ₹260 | ₹953 | ₹1,213 | **4.7x** |

**Bonus insight — coupon orders vs all orders (R689):**

| Metric | All Orders | Coupon Orders | Delta |
|---|---|---|---|
| Average order value | ₹412.20 | ₹1,542.92 | **3.7x higher** |

This alone is a powerful owner insight: "Customers using coupons spend 3.7x more than average."

---

## 1. What Should Coupon ROI Score Mean?

**Plain English definition:**

> "For every ₹1 you gave away as coupon discount, how many rupees did customers spend on that order?"

It answers the restaurant owner's core question: **"Are my coupons bringing in money, or just giving it away?"**

It is NOT:
- Profit margin (we don't know food cost)
- Incremental revenue (we can't prove the customer wouldn't have ordered without the coupon)
- Lifetime value (we're measuring single-order return, not repeat behavior)

It IS:
- A practical, measurable ratio of order revenue to discount cost
- Comparable across coupons, time periods, and restaurants
- Actionable: low ROI = review the coupon, high ROI = keep it running

---

## 2. Best Formula (Recommended)

### Primary metric: **Coupon Revenue Multiplier**

```
ROI Score = Gross Order Revenue / Total Discount Given
         = SUM(order_total + coupon_discount) / SUM(coupon_discount)
```

**Using R689 as example:**
```
Gross Revenue = (283 + 29.9) + (1014 + 100) + (1537 + 150) + (620 + 147.6) = 3,881.5
Total Discount = 29.9 + 100 + 150 + 147.6 = 427.5
ROI Score = 3,881.5 / 427.5 = 9.1x
```

**Why GROSS, not NET?**

- Gross represents the full customer spend the coupon attracted.
- The owner wants to know "how much did the customer spend" not "how much did I keep after the coupon."
- Net revenue ratio is always exactly (Gross ROI − 1), so it's redundant as a separate headline number.
- Industry standard for promotional ROI uses gross revenue.

### Secondary metric: **Discount Cost Ratio**

```
Discount Cost % = Total Discount / Gross Revenue × 100
```

R689 example: 427.5 / 3,881.5 × 100 = **11.0%**

This tells the owner: "11% of your coupon order revenue went to discounts."

### Tertiary metric (bonus): **Coupon Basket Lift**

```
Basket Lift = Avg Coupon Order Value / Avg All Order Value
```

R689 example: 1,542.92 / 412.20 = **3.7x**

This is the "wow" metric: "Customers using coupons spend 3.7x more."

---

## 3. Other Formula Options Considered (and why rejected)

| Formula | Definition | Pros | Cons | Verdict |
|---|---|---|---|---|
| **Net Revenue / Discount** | (order_total) / discount | Simple | Always = Gross ROI − 1. Redundant. | Rejected — derivative |
| **Profit ROI** | (Revenue − COGS − Discount) / Discount | Most accurate | Requires food cost data we don't have | Rejected — data unavailable |
| **Incremental Revenue** | (Coupon order revenue − what they would have spent anyway) / Discount | Ideal econometric measure | Impossible without A/B test or control group | Rejected — not computable |
| **Discount % of Revenue** | Discount / Gross Revenue × 100 | Easy to understand | Not a "multiplier" — harder to benchmark | Keep as secondary metric |
| **Revenue per Coupon Use** | Gross Revenue / Number of Uses | Shows average order size | Doesn't account for discount amount | Keep as supporting data |

---

## 4. Data Needed

### Already available (no backend changes needed for aggregation):

| Source | Field | Used For |
|---|---|---|
| `coupon_usage` | `order_total` | Net order revenue (per use) |
| `coupon_usage` | `coupon_discount` | Discount given (per use) |
| `coupon_usage` | `coupon_code` | Per-coupon grouping |
| `coupon_usage` | `offer_type` | BOGO/Nth special handling |
| `coupon_usage` | `order_id` | Join to orders (for status check) |

### Needs new aggregation (backend change):

| What | Why | Complexity |
|---|---|---|
| `SUM(order_total + coupon_discount)` grouped by coupon_code | Per-coupon ROI | Low — one `$group` stage |
| `SUM(order_total + coupon_discount)` global | Global ROI for summary card | Low — one `$group` stage |
| Avg order value for all orders (no coupon) | Basket Lift computation | Low — one `$group` on `orders` |
| Join to `orders.order_status` | Exclude cancelled/refunded | Medium — `$lookup` or separate query |

### NOT needed (and why):

| Data | Why not |
|---|---|
| Food cost / COGS | Not tracked in CRM — profit ROI not feasible |
| Customer purchase history (without coupon) | Incremental revenue calculation is econometric, not applicable |
| POS payment method breakdown | Irrelevant to coupon ROI |

---

## 5. Can Current Analytics Data Support This?

**Mostly yes. One new aggregation pipeline needed.**

| Requirement | Current state | Gap |
|---|---|---|
| Global ROI score | `get_coupon_stats()` computes `discount_availed` but NOT `sum(order_total)` | **Gap: add `order_total` sum to existing pipeline** |
| Per-coupon ROI | `/coupons/top` computes `times_used` and `total_discount` but NOT `total_revenue` per coupon | **Gap: add `order_total` sum to usage aggregation** |
| Basket Lift | Not computed anywhere | **Gap: new query on `orders` for avg order value** |
| Cancelled order exclusion | `coupon_usage` has no `order_status` field | **Gap: either `$lookup` to orders or accept the small inaccuracy** |

**Estimated backend effort: ~30 lines of aggregation code. No schema changes. No new collections.**

---

## 6. UI Placement Ideas

### 6A. Summary Card (RECOMMENDED — highest impact)

Add a **5th summary card** to the existing 4-card row:

```
[ Total Coupons: 25 ] [ Times Used: 4 ] [ Total Discount: ₹427.50 ] [ Avg Discount: ₹106.88 ] [ ROI Score: 9.1x ]
```

- Color: Gold/amber (#F59E0B) — distinct from existing purple/orange/green/blue
- Icon: TrendingUp from lucide-react
- The "x" suffix makes it immediately parseable as a multiplier

**Alternative: Replace "Avg Discount / Use" with ROI Score** (since avg discount is less actionable than ROI). Keep avg discount in the table instead.

### 6B. Per-Coupon Column in Top Coupons Table (RECOMMENDED)

Add an **"ROI" column** after "Discount" in the existing sortable table:

| Code | Title | ... | Used | Discount | **ROI** | Last Used | Status |
|---|---|---|---|---|---|---|---|
| FLAT100TEST | Flat 100 off | ... | 1 | ₹100 | **11.1x** | 2026-05-27 | Active |
| SEED_V2_CATMULTI | 10% Kunafa | ... | 1 | ₹29.9 | **10.5x** | 2026-05-27 | Active |
| KUNAFA20 | 20% off all | ... | 0 | ₹0 | **—** | Never | Active |

- Sortable (owners can find their best and worst ROI coupons)
- Show "—" for 0-usage coupons
- Show "< 3 uses" badge for low-sample coupons

### 6C. Per-Coupon ROI Badge / Color (RECOMMENDED)

Color the ROI value in the table:

| ROI Range | Color | Badge Text | Meaning |
|---|---|---|---|
| ≥ 8x | Green (#329937) | Strong | Every ₹1 discount brings ₹8+ revenue |
| 4x — 7.9x | Amber (#F59E0B) | Good | Healthy return |
| 2x — 3.9x | Orange (#F26B33) | Watch | Discount is a significant portion of revenue |
| < 2x | Red (#DC2626) | Risk | Discount exceeds 50% of gross revenue |
| < 3 uses | Gray (#9CA3AF) | Low Data | Not enough usage to be statistically meaningful |

### 6D. Basket Lift Insight Card (NICE-TO-HAVE)

Below the summary cards, a subtle insight banner:

```
💡 Customers using coupons spend 3.7x more than average (₹1,543 vs ₹412)
```

This is the "aha moment" metric. Even if ROI looks marginal, the basket lift tells the owner coupons are attracting premium orders.

### 6E. Warning Label on Coupon Table (NICE-TO-HAVE)

For coupons with ROI < 2x and ≥ 3 uses, show a small warning icon:

```
⚠ SEED_BOGO_FREE — ROI 1.5x — discount is 67% of order revenue
```

---

## 7. Owner-Friendly Labels

The score MUST be understandable by a non-technical restaurant owner who has never seen "ROI" before.

### Recommended label system:

| Score | Label | Tooltip / Explanation |
|---|---|---|
| ≥ 8x | **Strong ROI** | "For every ₹1 discount, customers spent ₹8+. This coupon is working great." |
| 4x – 7.9x | **Good ROI** | "For every ₹1 discount, customers spent ₹4-8. Healthy return." |
| 2x – 3.9x | **Watch** | "For every ₹1 discount, customers spent ₹2-4. Discount is a large part of the order. Consider reducing the discount or targeting higher-value orders." |
| < 2x | **Margin Risk** | "For every ₹1 discount, customers spent less than ₹2. You may be losing money after food costs. Review this coupon." |
| 0 uses | **Not Used** | "This coupon hasn't been used yet. No ROI to calculate." |
| 1-2 uses | **Not Enough Data** | "Only used 1-2 times. Need more usage for a reliable score." |
| Discount = 0 | **N/A** | "No discount was applied (edge case)." |

### The "gold standard" owner sentence:

> "Your coupons earned ₹9.10 in orders for every ₹1 you gave as discount. That's a **Strong ROI**."

This should appear as a sentence below the ROI summary card.

---

## 8. Edge Cases

### 8.1 Zero discount (coupon_discount = 0)
- **Can this happen?** Theoretically if a coupon validates but gives ₹0 discount (e.g., percentage coupon on a ₹0 eligible subtotal).
- **Handling:** ROI = N/A. Show "—". Do not divide by zero. Do not include in global ROI aggregation.

### 8.2 BOGO / Free Item coupons
- **How it works:** The coupon gives items for free. `coupon_discount` = monetary value of free items. `order_total` = net order after the free item deduction.
- **Impact on ROI:** ROI formula works correctly. A BOGO that gives a ₹200 item free on a ₹800 order = gross ₹1,000 / disc ₹200 = 5x ROI. Accurate.
- **Special case:** BOGO where the entire order IS the free item (buy 1 pizza, get 1 free, customer orders only 2 pizzas). ROI could be as low as 2x. This is expected and correct — the owner IS giving away 50%.

### 8.3 Cancelled / refunded orders
- **Current state:** All 12 R689 coupon orders are `delivered` + `paid`. No cancellations observed.
- **Risk:** If a coupon order is cancelled after `coupon_usage` was recorded, the ROI overstates revenue.
- **Recommended handling (Phase 1):** Accept the inaccuracy. Cancellation rate on coupon orders is typically <2% in restaurant POS.
- **Recommended handling (Phase 2):** Add `$lookup` to `orders` collection to exclude `order_status = 'cancelled'` or `payment_status != 'paid'`.

### 8.4 Low usage coupons (1-2 uses)
- **Problem:** A coupon used once on a ₹5,000 order shows ROI 50x. Used once on a ₹100 order shows ROI 1x. Neither is statistically meaningful.
- **Handling:** Show "Not Enough Data" for < 3 uses. Still compute and display the number, but with a gray color and qualifier text. Do NOT hide it — the owner should see the data exists but isn't reliable yet.
- **Threshold choice:** 3 uses is the minimum. 5+ would be ideal for statistical reliability, but most restaurant coupons have low single-digit usage. 3 is pragmatic.

### 8.5 Coupon used only once
- **Handling:** Same as 8.4. Show the ROI number with "1 use — not enough data" qualifier.
- **In the global ROI card:** Still include single-use coupons in the global aggregation (since the global number is across ALL usage, which has enough volume).

### 8.6 Very high discount (>50% of order)
- **Example:** ₹500 order with ₹400 discount = ROI 1.25x. This means the customer paid ₹100 and got ₹500 worth of food.
- **Handling:** This falls in the "Margin Risk" band (<2x). The red color and "Review this coupon" tooltip will alert the owner.

### 8.7 Legacy `coupon_transactions` (migration data)
- **Problem:** Legacy records do NOT have `order_total` field (only `discount_amount`).
- **Handling:** Legacy usage contributes to "Times Used" and "Total Discount" but NOT to ROI calculation. ROI is computed only from `coupon_usage` records that have `order_total > 0`.
- **Disclosure:** If a coupon has legacy-only usage, show "ROI not available for legacy orders" or simply "—".

### 8.8 Stacked coupons (multiple coupons on one order)
- **Current state:** The existing engine supports stackable coupons (SEED_EDGE_STACKABLE). Each coupon creates its own `coupon_usage` record with its own `coupon_discount` but the SAME `order_total`.
- **Impact:** If two coupons are used on the same order, both records point to the same `order_total`. The global ROI will double-count the order revenue.
- **Handling (Phase 1):** Accept the double-count. Stacking is rare in practice.
- **Handling (Phase 2):** Deduplicate by `order_id` in the global aggregation. Per-coupon ROI remains correct (each coupon's discount against the order total).

---

## 9. Backend / Frontend Impact Assessment

### Backend changes needed:

| Change | File | Effort | Risk |
|---|---|---|---|
| Add `order_revenue_gross` aggregation to `get_coupon_stats()` | `analytics_service.py` | ~10 lines | Very low — adds one `$group` to existing pipeline |
| Add `total_revenue` per coupon to `/coupons/top` | `routers/analytics.py` | ~5 lines | Very low — adds `order_total` + `coupon_discount` sum to existing `$group` |
| Add avg order value query (for basket lift) | `analytics_service.py` | ~8 lines | Low — new query on `orders` |
| Add ROI fields to `/coupons/export` and `/coupons/pdf` | `routers/analytics.py`, `pdf_report.py` | ~10 lines each | Low |

**Total backend: ~40-50 lines. No schema changes. No new indexes. No new collections.**

### Frontend changes needed:

| Change | File | Effort |
|---|---|---|
| Add 5th summary card (ROI Score) or replace Avg Discount | `CouponAnalyticsPage.jsx` | ~15 lines |
| Add ROI column to Top Coupons table | `CouponAnalyticsPage.jsx` | ~20 lines |
| Add color-coded ROI badge component | `CouponAnalyticsPage.jsx` | ~15 lines |
| Add basket lift insight banner (optional) | `CouponAnalyticsPage.jsx` | ~10 lines |
| Add tooltip explanations | `CouponAnalyticsPage.jsx` | ~10 lines |

**Total frontend: ~50-70 lines. No new dependencies. No new pages.**

### What does NOT need to change:

- No DB schema changes
- No new collections
- No new indexes (existing `coupon_usage` queries already cover this)
- No new npm dependencies
- No POS contract changes
- No migration scripts

---

## 10. Recommended Next Step

### Classification: **CR-003 Phase 4**

**Rationale:**
- This is a natural extension of the Coupon Analytics Dashboard (CR-003)
- It uses the SAME data source (`coupon_usage`) that Phase 1-3 already query
- It adds columns/cards to the SAME page (`/coupon-analytics`)
- The backend changes extend EXISTING functions (`get_coupon_stats`, `/coupons/top`)
- It does NOT require a new page, new route, or new POS contract

**It should NOT be a separate CR because:**
- No new architectural surface area
- No cross-team dependency (POS doesn't need to change)
- No new data collection mechanism
- Total effort is < 100 lines of code

### Recommended implementation order:

1. **Backend:** Add `order_revenue_gross` to `get_coupon_stats()` response
2. **Backend:** Add `total_revenue` + `roi_score` to `/coupons/top` response
3. **Frontend:** Add 5th summary card (or replace Avg Discount)
4. **Frontend:** Add ROI column with color badges to table
5. **Frontend:** Add basket lift insight banner
6. **Backend+Frontend:** Add ROI to PDF report and CSV export
7. **QA:** Verify with R689 + R523 data

### Pre-requisites before implementation:

- Owner confirms they understand and want this metric (it's a brainstorming idea, not a locked requirement)
- Owner confirms the color-band thresholds (8x / 4x / 2x boundaries)
- Owner confirms whether to replace "Avg Discount" card or add a 5th card

---

## Appendix: R689 Per-Coupon ROI Preview

| Coupon | Discount | Net Revenue | Gross Revenue | ROI | Label |
|---|---|---|---|---|---|
| FLAT100TEST | ₹100.00 | ₹1,014 | ₹1,114 | **11.1x** | Strong |
| SEED_V2_CATMULTI | ₹29.90 | ₹283 | ₹312.90 | **10.5x** | Strong |
| SEED_EDGE_STACKABLE | ₹150.00 | ₹1,537 | ₹1,687 | **11.2x** | Strong |
| SEED_V3A_LUNCH | ₹147.60 | ₹620 | ₹767.60 | **5.2x** | Good |
| **Global** | **₹427.50** | **₹3,454** | **₹3,881.50** | **9.1x** | **Strong** |

---

**Status:** Brainstorming complete. No implementation. No code. No plan. No CRM 1.0 docs touched. No `/app/memory/final/` created.
