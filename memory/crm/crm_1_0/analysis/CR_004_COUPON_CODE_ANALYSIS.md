# CR-004 — Coupon Code Flow — Analysis

> **Status:** `analysis_not_started`
> **Sprint:** CRM 1.0
> **Priority:** P1
> **Depends On:** CR-001

## Objective
Validate and fix coupon application, validation, storage, usage tracking, and CRM visibility.

## Sections To Be Filled

### 1. Coupon Processing in `/api/pos/orders` Audit
_Document that coupon_code and coupon_discount are stored but NOT validated or usage-tracked._

### 2. Separate Coupon Endpoints Audit
_Document `/api/pos/coupons/validate` and `/api/pos/coupons/apply` — are they functional?_

### 3. Legacy Endpoint Coupon Processing Audit
_Document coupon handling in `/api/pos/webhook/payment-received`._

### 4. `coupon_usage` Collection Audit
_Check if coupon_usage records are created correctly when coupons are applied._

### 5. Coupon Running Totals Audit
_Check `coupons.total_used` and `customers.total_coupon_used` — are they maintained?_

### 6. CRM UI Audit
_Check Coupons page, Customer Detail coupon section, Dashboard coupon stats._

### 7. Identified Issues
_List all issues found during analysis._

### 8. Recommendations
_Proposed fixes, ordered by priority._

---

**WARNING:** Do not use this placeholder as implementation approval. Analysis must be completed and reviewed before planning begins.
