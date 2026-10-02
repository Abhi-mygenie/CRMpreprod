# CR-003 Phase 4 — Coupon ROI Score — UX Wireframe (Line Drawing)

**Date:** 2026-05-27
**Status:** UX wireframe only — no implementation
**Data source:** Live R689 Kunafa Mahal production data

---

## Page: `/coupon-analytics` (existing page, Phase 4 additions marked with ★)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ SIDEBAR          │                                                           │
│                  │  Coupon Analytics                                          │
│ Dashboard        │  All Time coupon performance overview                     │
│ Customers        │                                                           │
│ Loyalty          │  ┌──────────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌─────────┐    │
│ Coupons          │  │ All Time │ │  7D  │ │ 30D  │ │ 90D  │ │ Custom  │    │
│ Wallet           │  └──────────┘ └──────┘ └──────┘ └──────┘ └─────────┘    │
│ WhatsApp ▾       │                              [PDF Report] [CSV]           │
│ ▸ Analytics      │                                                           │
│   Lifecycle      │                                                           │
│   Item Analytics │                                                           │
│   ● Coupon Anlyt │                                                           │
│ Feedback         │                                                           │
│ Add Customer     │                                                           │
│ Migration        │                                                           │
│ Profile          │                                                           │
│                  │                                                           │
│ Logout           │                                                           │
│ ◂ Collapse       │                                                           │
└──────────────────┘                                                           │
```

---

## SECTION 1: Summary Cards (existing 4 + 1 new ★)

```
┌─────────────────┬──────────────────┬──────────────────┬──────────────────┬──────────────────┐
│   [■] 25        │   [■] 4          │   [■] Rs.427.50  │   [■] Rs.106.88  │ ★[▲] 9.1x       │
│   TOTAL COUPONS │   TIMES USED     │   TOTAL DISCOUNT │   AVG DISCOUNT   │   ROI SCORE      │
│   (purple)      │   (orange)       │   (green)        │   (blue)         │   (gold/amber)   │
└─────────────────┴──────────────────┴──────────────────┴──────────────────┴──────────────────┘
```

**★ New 5th card — ROI Score:**
- Value: `9.1x` (computed: gross_revenue / total_discount = 3881.50 / 427.50)
- Icon: TrendingUp (lucide)
- Color: Amber/Gold (#F59E0B)
- Interpretation: "For every Rs.1 discount, Rs.9.10 in orders"

**Data behind each card (R689 real data):**

| Card | Value | Source |
|---|---|---|
| Total Coupons | 25 | `coupons.count({user_id})` — NOT date-filtered |
| Times Used | 4 | `SUM(coupon_usage.count + coupon_transactions.count)` |
| Total Discount | Rs.427.50 | `SUM(coupon_usage.coupon_discount)` |
| Avg Discount | Rs.106.88 | `427.50 / 4` |
| ★ ROI Score | 9.1x | `SUM(order_total + coupon_discount) / SUM(coupon_discount)` |

---

## ★ SECTION 1B: ROI Insight Banner (NEW)

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│  ▲  Strong ROI — Your coupons earned Rs.9.10 for every Rs.1 discount.                   │
│     Coupon customers spend 3.8x more than average (Rs.1,543 vs Rs.411 per order).       │
│                                                                                          │
│     Gross Revenue: Rs.3,881.50    Net Revenue: Rs.3,454.00    Discount Cost: 11.0%       │
│                                                                   ────────────           │
│                                                                   (disc / gross × 100)   │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

**Data points in banner:**

| Label | Value | Formula | R689 |
|---|---|---|---|
| ROI Label | "Strong ROI" | ≥8x = Strong, 4-8x = Good, 2-4x = Watch, <2x = Risk | Strong (9.1x) |
| Headline | "Rs.9.10 for every Rs.1" | ROI score as sentence | 9.1x |
| Basket Lift | "3.8x more" | avg_coupon_order / avg_non_coupon_order | 1543 / 411 = 3.8x |
| Avg coupon order | Rs.1,543 | AVG(orders.order_amount WHERE coupon_discount > 0) | Rs.1,543 |
| Avg normal order | Rs.411 | AVG(orders.order_amount WHERE coupon_discount = 0) | Rs.411 |
| Gross Revenue | Rs.3,881.50 | SUM(order_total + coupon_discount) from coupon_usage | 3881.50 |
| Net Revenue | Rs.3,454.00 | SUM(order_total) from coupon_usage | 3454.00 |
| Discount Cost % | 11.0% | total_discount / gross_revenue × 100 | 427.50 / 3881.50 |

**Color of banner background by ROI band:**

| ROI | Background | Left accent |
|---|---|---|
| ≥ 8x | light green tint (#F0FDF4) | green bar (#329937) |
| 4x – 7.9x | light amber tint (#FFFBEB) | amber bar (#F59E0B) |
| 2x – 3.9x | light orange tint (#FFF7ED) | orange bar (#F26B33) |
| < 2x | light red tint (#FEF2F2) | red bar (#DC2626) |
| < 3 uses total | light gray (#F9FAFB) | gray bar (#9CA3AF) |

---

## SECTION 2: Charts (UNCHANGED from Phase 1-3)

```
┌───────────────────────────────────┬───────────────────────────────────┐
│  Usage by Scope                   │  Usage by Offer Type              │
│                                   │                                   │
│    ┌────────┐                     │   Simple  ████████████████  4     │
│    │ donut  │  ● Category-Level   │                                   │
│    │ chart  │  ● Order-Level      │                                   │
│    └────────┘                     │                                   │
│                                   │                                   │
└───────────────────────────────────┴───────────────────────────────────┘
```

(No changes. Phase 1 charts remain as-is.)

---

## SECTION 3: Special Offer Cards (UNCHANGED from Phase 1)

```
┌───────────────────┬───────────────────┬───────────────────┐
│  ⏰ Happy Hour     │  🎁 BOGO / BXG    │  🔁 Every Nth     │
│                   │                   │                   │
│  With window: 5   │  BOGO orders: 0   │  Orders: 0        │
│  Used in win.: 1  │  BXG orders: 0    │  Benefit items: 0 │
│                   │  Free items: 0    │  Discount: Rs.0   │
│                   │  Discount: Rs.0   │                   │
└───────────────────┴───────────────────┴───────────────────┘
```

(No changes.)

---

## SECTION 4: Coupon Performance Table (existing + ★ new ROI column)

### Table header:

```
┌────┬──────────────────┬──────────────┬──────────┬──────────┬──────┬───────────┬─────────────┬────────────┬─────────┐
│ #  │ CODE             │ TITLE        │ SCOPE    │ TYPE     │ USED │ DISCOUNT  │ ★ ROI       │ LAST USED  │ STATUS  │
│    │ (sortable)       │              │          │          │ (▼)  │ (sortable)│ ★(sortable) │ (sortable) │         │
└────┴──────────────────┴──────────────┴──────────┴──────────┴──────┴───────────┴─────────────┴────────────┴─────────┘
```

### Table rows with real R689 data (sorted by ROI desc):

```
┌────┬──────────────────────┬───────────────────┬────────────┬────────┬──────┬───────────┬──────────────────┬────────────┬──────────┐
│  1 │ SEED_EDGE_STACKABLE  │ Stackable test    │ Order-Lvl  │ Simple │    1 │ Rs.150.00 │ 11.2x  Strong    │ 2026-05-27 │ Active   │
│    │                      │                   │ (orange)   │ (gray) │      │           │ (green)(lowdata) │            │ (green)  │
├────┼──────────────────────┼───────────────────┼────────────┼────────┼──────┼───────────┼──────────────────┼────────────┼──────────┤
│  2 │ FLAT100TEST          │ Flat Rs.100 off   │ Order-Lvl  │ Simple │    1 │ Rs.100.00 │ 11.1x  Strong    │ 2026-05-27 │ Active   │
│    │                      │                   │ (orange)   │ (gray) │      │           │ (green)(lowdata) │            │ (green)  │
├────┼──────────────────────┼───────────────────┼────────────┼────────┼──────┼───────────┼──────────────────┼────────────┼──────────┤
│  3 │ SEED_V2_CATMULTI     │ 10% off kunafa    │ Cat-Level  │ Simple │    1 │  Rs.29.90 │ 10.5x  Strong    │ 2026-05-27 │ Active   │
│    │                      │                   │ (green)    │ (gray) │      │           │ (green)(lowdata) │            │ (green)  │
├────┼──────────────────────┼───────────────────┼────────────┼────────┼──────┼───────────┼──────────────────┼────────────┼──────────┤
│  4 │ SEED_V3A_LUNCH       │ Lunch special     │ Order-Lvl  │ Simple │    1 │ Rs.147.60 │  5.2x  Good      │ 2026-05-27 │ Active   │
│    │                      │                   │ (orange)   │ (gray) │      │           │ (amber)          │            │ (green)  │
├────┼──────────────────────┼───────────────────┼────────────┼────────┼──────┼───────────┼──────────────────┼────────────┼──────────┤
│  5 │ KUNAFA20             │ 20% off all       │ Order-Lvl  │ Simple │    0 │   Rs.0.00 │   —              │ Never      │ Active   │
│    │                      │                   │ (orange)   │ (gray) │      │           │ (gray)           │            │ (green)  │
├────┼──────────────────────┼───────────────────┼────────────┼────────┼──────┼───────────┼──────────────────┼────────────┼──────────┤
│  6 │ SEED_V3B_BOGO        │ BOGO deal         │ Order-Lvl  │ BOGO   │    0 │   Rs.0.00 │   —              │ Never      │ Active   │
│    │                      │                   │ (orange)   │(purple)│      │           │ (gray)           │            │ (green)  │
├────┼──────────────────────┼───────────────────┼────────────┼────────┼──────┼───────────┼──────────────────┼────────────┼──────────┤
│ .. │ ... (21 more rows with 0 usage, ROI = "—")                                                                       │
└────┴──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### ★ ROI column detail rendering:

```
   ┌─────────────────────────┐
   │                         │
   │  For ROI ≥ 8x:          │       For ROI < 2x, ≥ 3 uses:
   │  ┌──────────────────┐   │       ┌──────────────────┐
   │  │ 11.2x  [Strong]  │   │       │  1.5x  [Risk]    │
   │  │ (green) (green    │   │       │  (red)  (red     │
   │  │         bg badge) │   │       │         bg badge)│
   │  └──────────────────┘   │       └──────────────────┘
   │                         │
   │  For 0 uses:            │       For 1-2 uses:
   │  ┌──────────────────┐   │       ┌──────────────────┐
   │  │      —            │   │       │ 11.2x            │
   │  │   (gray text)     │   │       │ (green number)   │
   │  │                   │   │       │ [Low Data]       │
   │  └──────────────────┘   │       │ (gray tiny badge)│
   │                         │       └──────────────────┘
   └─────────────────────────┘
```

### ★ ROI badge color mapping:

| Condition | Number color | Badge text | Badge bg | Badge text color |
|---|---|---|---|---|
| ≥ 8x, ≥ 3 uses | #329937 (green) | Strong | #DCFCE7 (green-100) | #329937 |
| 4x – 7.9x, ≥ 3 uses | #F59E0B (amber) | Good | #FEF3C7 (amber-100) | #92400E |
| 2x – 3.9x, ≥ 3 uses | #F26B33 (orange) | Watch | #FFEDD5 (orange-100) | #9A3412 |
| < 2x, ≥ 3 uses | #DC2626 (red) | Risk | #FEE2E2 (red-100) | #DC2626 |
| Any ROI, 1-2 uses | (color by band) | Low Data | #F3F4F6 (gray-100) | #6B7280 |
| 0 uses | #9CA3AF (gray) | (none) | (none) | (none) |

---

## ★ SECTION 5: ROI Distribution Mini-Chart (OPTIONAL / NICE-TO-HAVE)

Only relevant when restaurant has 5+ coupons with usage. Not applicable to R689 today (only 4 have usage).

```
  Coupon ROI Distribution (4 coupons with usage)
  ┌──────────────────────────────────────────────────────┐
  │                                                      │
  │  Risk (<2x)    │                                     │  0 coupons
  │  Watch (2-4x)  │                                     │  0 coupons
  │  Good  (4-8x)  │████                                 │  1 coupon   (SEED_V3A_LUNCH)
  │  Strong (8x+)  │████████████████                     │  3 coupons
  │                 ├────┬────┬────┬────┬────             │
  │                 0    1    2    3    4                  │
  │                                                      │
  └──────────────────────────────────────────────────────┘
```

---

## FULL PAGE FLOW (TOP TO BOTTOM):

```
  ┌───────────────────────────────────────────────────────────────────┐
  │  [header] Coupon Analytics | All Time | 7D | 30D | 90D | Custom │
  │                                                 [PDF] [CSV]      │
  ├───────────────────────────────────────────────────────────────────┤
  │                                                                   │
  │  ┌───────┐ ┌───────┐ ┌───────────┐ ┌───────────┐ ┌─────────┐   │
  │  │  25   │ │   4   │ │ Rs.427.50 │ │ Rs.106.88 │ │ ★ 9.1x  │   │
  │  │ TOTAL │ │ USED  │ │ DISCOUNT  │ │ AVG DISC  │ │ ROI     │   │
  │  └───────┘ └───────┘ └───────────┘ └───────────┘ └─────────┘   │
  │                                                                   │
  ├ ★ ROI INSIGHT BANNER ────────────────────────────────────────────┤
  │  ▲ Strong ROI — Rs.9.10 earned per Rs.1 discount                 │
  │    Coupon orders avg Rs.1,543 vs normal Rs.411 (3.8x lift)       │
  │    Gross: Rs.3,882  |  Net: Rs.3,454  |  Discount Cost: 11.0%   │
  ├───────────────────────────────────────────────────────────────────┤
  │                                                                   │
  │  ┌─── Usage by Scope ──────┐  ┌─── Usage by Offer Type ────┐    │
  │  │    (donut chart)        │  │    (bar chart)              │    │
  │  └─────────────────────────┘  └─────────────────────────────┘    │
  │                                                                   │
  │  ┌── Happy Hour ─┐ ┌── BOGO/BXG ──┐ ┌── Every Nth ──┐          │
  │  │ window: 5     │ │ BOGO: 0      │ │ Orders: 0     │          │
  │  │ used: 1       │ │ BXG: 0       │ │ Benefit: 0    │          │
  │  └───────────────┘ └──────────────┘ └───────────────┘          │
  │                                                                   │
  ├─── Coupon Performance (25) ──────────────────────────────────────┤
  │ # │ CODE          │ TITLE    │ SCOPE │ TYPE │ USED│ DISC │★ ROI │
  │───┼───────────────┼──────────┼───────┼──────┼─────┼──────┼──────│
  │ 1 │ SEED_EDGE_ST..│ Stack..  │Order  │Simple│  1  │ 150  │11.2x │
  │   │               │          │       │      │     │      │Strong│
  │ 2 │ FLAT100TEST   │ Flat100  │Order  │Simple│  1  │ 100  │11.1x │
  │   │               │          │       │      │     │      │Strong│
  │ 3 │ SEED_V2_CATM..│ 10% ku.. │Cat   │Simple│  1  │  30  │10.5x │
  │   │               │          │       │      │     │      │Strong│
  │ 4 │ SEED_V3A_LUN..│ Lunch..  │Order  │Simple│  1  │ 148  │ 5.2x │
  │   │               │          │       │      │     │      │Good  │
  │ 5 │ KUNAFA20      │ 20% off  │Order  │Simple│  0  │   0  │  —   │
  │ 6 │ SEED_V3B_BOGO │ BOGO     │Order  │BOGO  │  0  │   0  │  —   │
  │...│ (19 more)     │          │       │      │  0  │   0  │  —   │
  ├───────────────────────────────────────────────────────────────────┤
  │  [footer] Computer-generated report. Powered by MyGenie CRM.     │
  └───────────────────────────────────────────────────────────────────┘
```

---

## DATA POINT REFERENCE — EVERY NUMBER TRACED TO SOURCE

### Summary Card: ROI Score = 9.1x

```
Source:  coupon_usage WHERE user_id = 'pos_0001_restaurant_689'
Query:  $group → SUM(order_total + coupon_discount) / SUM(coupon_discount)

  order_total is NET (verified: matches orders.order_amount)
  gross = order_total + coupon_discount

  SEED_V2_CATMULTI:    283 + 29.9  =  312.90 gross
  FLAT100TEST:         1014 + 100   = 1114.00 gross
  SEED_EDGE_STACKABLE: 1537 + 150   = 1687.00 gross
  SEED_V3A_LUNCH:       620 + 147.6 =  767.60 gross
  ─────────────────────────────────────────────
  TOTAL:               3454 + 427.5 = 3881.50 gross

  ROI = 3881.50 / 427.50 = 9.078... ≈ 9.1x
```

### Insight Banner: Basket Lift = 3.8x

```
Source:  orders WHERE user_id = 'pos_0001_restaurant_689'

  AVG(order_amount) WHERE coupon_discount > 0  → Rs.1,543  (12 orders)
  AVG(order_amount) WHERE coupon_discount = 0  → Rs.411    (8,062 orders)

  Basket Lift = 1543 / 411 = 3.753... ≈ 3.8x
```

### Insight Banner: Discount Cost = 11.0%

```
  427.50 / 3881.50 × 100 = 11.017... ≈ 11.0%
```

### Per-Coupon ROI (table):

```
  SEED_EDGE_STACKABLE: (1537 + 150) / 150 = 1687 / 150 = 11.247x ≈ 11.2x
  FLAT100TEST:         (1014 + 100) / 100 = 1114 / 100 = 11.140x ≈ 11.1x
  SEED_V2_CATMULTI:    (283 + 29.9) / 29.9 = 312.9 / 29.9 = 10.464x ≈ 10.5x
  SEED_V3A_LUNCH:      (620 + 147.6) / 147.6 = 767.6 / 147.6 = 5.200x ≈ 5.2x
  KUNAFA20:            0 uses → "—"
```

---

## TOOLTIP / HOVER CONTENT

### On ROI Summary Card hover:
```
┌─────────────────────────────────────────────────┐
│  Coupon ROI Score                                │
│                                                  │
│  For every Rs.1 given as discount,               │
│  customers spent Rs.9.10 on coupon orders.       │
│                                                  │
│  Formula:                                        │
│  Gross Order Revenue / Total Discount            │
│  = Rs.3,882 / Rs.428 = 9.1x                     │
│                                                  │
│  Based on 4 coupon uses across 4 coupons.        │
└─────────────────────────────────────────────────┘
```

### On per-coupon ROI cell hover:
```
┌─────────────────────────────────────────────────┐
│  FLAT100TEST — ROI 11.1x                         │
│                                                  │
│  Order revenue (gross): Rs.1,114                 │
│  Discount given:        Rs.100                   │
│  Net revenue:           Rs.1,014                 │
│  Discount cost:         9.0% of order            │
│                                                  │
│  ⚠ Based on 1 use — need 3+ for reliability     │
└─────────────────────────────────────────────────┘
```

---

## EDGE CASE RENDERING

### No coupon usage at all (new restaurant):
```
  ROI Card:     "—"  (gray)
  Banner:       "No coupon usage yet. ROI will appear after coupons are used."
  Table ROI:    all "—"
```

### All coupons < 3 uses (like R689 today):
```
  ROI Card:     "9.1x"  (green, BUT with small "Low Data" sub-label)
  Banner:       Shows data, but adds "(based on 4 uses — score will stabilize with more usage)"
  Table ROI:    Shows numbers with "Low Data" gray badge on each
```

### Mixed: some coupons with 3+ uses, some with 1-2:
```
  ROI Card:     Global ROI across ALL uses (includes low-usage coupons in aggregate)
  Table:        3+ use coupons get colored badge (Strong/Good/Watch/Risk)
                1-2 use coupons get number + gray "Low Data" badge
                0 use coupons get "—"
```

---

**Status:** UX wireframe only. No implementation. No code changes. No CRM 1.0 docs touched. No `/app/memory/final/` created.
