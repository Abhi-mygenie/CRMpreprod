# CR-004 — Phase 2.5 · Variable Expansion — Implementation Report

**CR:** CR-004 WhatsApp Utility + Marketing Message Integration
**Phase:** P2.5 — Variable Expansion
**Sprint:** ROI Measurement Sprint
**Date:** 2026-05-28
**Status:** `cr004_phase_2_5_complete`

---

## 1. Summary

Expanded WhatsApp template variables from 10 to **23** across 7 categories. All variables resolve via P2's source-chain resolver. 50/50 tests pass.

---

## 2. New Variables Added (13)

### Tier 1 — Data already in event_data (6 vars, zero trigger-site changes):

| Variable | Category | Example | Available on |
|---|---|---|---|
| `order_id` | order | ORD-12345 | send_bill, first_visit |
| `old_tier` | loyalty | Silver | tier_upgrade only |
| `expiring_points` | loyalty | 150 | points_expiring only |
| `total_visits` | loyalty | 25 | All (from customer doc) |
| `total_spent` | loyalty | Rs.50,000 | All (from customer doc) |
| `rating` | feedback | 5 | feedback_received only |

### Tier 2 — Coupon trigger site enriched (3 vars):

| Variable | Category | Example | Available on |
|---|---|---|---|
| `coupon_title` | coupon | Lunch Special | coupon_earned |
| `coupon_discount` | coupon | Rs.150 | coupon_earned |
| `coupon_expiry` | coupon | 31 Dec 2026 | coupon_earned |

### Profile Links — Brand-level placeholders (4 vars):

| Variable | Category | Example | Source |
|---|---|---|---|
| `einvoice_link` | links | https://inv.com/123 | event (per-order) or brand (default) |
| `instagram_link` | links | https://ig.com/myplace | brand (profile) |
| `google_review_link` | links | https://g.page/r/x | brand (profile) |
| `feedback_link` | links | https://forms.gle/abc | brand (profile) |

---

## 3. Files Changed

| File | Action | Purpose |
|---|---|---|
| `core/whatsapp_variables.py` | Overwrite | 23 variables with categories, sources, fills_on, formatters |
| `core/whatsapp.py` | Edit | `trigger_whatsapp_event` now fetches profile link fields from users doc |
| `routers/coupons.py` | Edit | Added `coupon_title`, `coupon_expiry`, `coupon_discount` to coupon_earned event_data |
| `routers/customers.py` | Edit | `sample-data` returns all 23 variable keys for preview |
| `tests/test_whatsapp_p2_5_expansion.py` | New | 25 tests for new variables |
| `tests/test_whatsapp_variables_endpoint.py` | Edit | Updated expected count from 10 to 23 |

---

## 4. Tests

| Suite | Count | Result |
|---|---|---|
| P2.5 expansion tests | 25 | All PASS |
| P2 resolver tests | 19 | All PASS (regression) |
| P1 text-mode tests | 5 | All PASS (regression) |
| P1 endpoint test | 1 | PASS (updated) |
| **Total** | **50** | **All PASS** |

---

## 5. Variable Categories (for future frontend grouping)

| Category | Variables |
|---|---|
| general | customer_name, restaurant_name |
| loyalty | points_balance, points_earned, points_redeemed, tier, old_tier, expiring_points, expiry_date, total_visits, total_spent |
| wallet | wallet_balance, amount |
| order | order_id |
| coupon | coupon_code, coupon_title, coupon_discount, coupon_expiry |
| feedback | rating |
| links | einvoice_link, instagram_link, google_review_link, feedback_link |

---

## 6. Profile Link Fields (Future Work)

The 4 link variables (`einvoice_link`, `instagram_link`, `google_review_link`, `feedback_link`) resolve from the `users` collection. These fields **do not exist on user documents yet**. When the Profile page adds these fields and saves them to `users`, the variables will automatically resolve — zero code change needed in the WhatsApp pipeline.

---

## 7. Status

```
cr004_phase_2_5_complete
```
