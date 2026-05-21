# CR-003 — Loyalty Points Flow — Analysis

> **Status:** `analysis_not_started`
> **Sprint:** CRM 1.0
> **Priority:** P1
> **Depends On:** CR-001

## Objective
Validate and fix loyalty points creation, earning, redemption, balances, and visibility across CRM.

## Sections To Be Filled

### 1. Points Earn Flow Audit
_Trace points calculation: min_order_value threshold, tier-based earn percent, off-peak bonus._

### 2. First Visit Bonus Audit
_Verify bonus is awarded correctly for new customers, not re-awarded on subsequent orders._

### 3. Points Redemption Flow Audit
_Trace redemption path from POS and from legacy /webhook/payment-received endpoint._

### 4. Points Balance Accuracy Audit
_Check if `customers.total_points` accurately reflects sum of all earn/bonus minus redeem/expired._

### 5. Running Totals Audit
_Check `total_points_earned`, `total_points_redeemed` on customer record — are they maintained?_

### 6. Points Expiry and Scheduled Jobs Audit
_Verify cron jobs: birthday bonus, anniversary bonus, expiry reminders, points expiry._

### 7. CRM UI Audit
_Check Customer Detail points tab, Dashboard points section, Loyalty Settings page._

### 8. Identified Issues
_List all issues found during analysis._

### 9. Recommendations
_Proposed fixes, ordered by priority._

---

**WARNING:** Do not use this placeholder as implementation approval. Analysis must be completed and reviewed before planning begins.
