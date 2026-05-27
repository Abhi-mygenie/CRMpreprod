# CR-005 + CR-002B — Authenticated QA Report

**Date:** 2026-05-26
**Sprint:** ROI Measurement for CRM
**Status:** `cr005_and_cr002b_authenticated_qa_passed`

---

## 1. QA Verdict

```
cr005_and_cr002b_authenticated_qa_passed
```

---

## 2. QA Coverage

| CR | Item | Result | Evidence |
|---|---|---|---|
| CR-005 | **B1** — Coupon description in list | **PASS** | Screenshot: `/coupons` page shows descriptions (e.g., "Edge — stackable_with_loyalty + dine_in only + per_user 3", "V3-C every-Nth flat with max_applications") below coupon titles |
| CR-005 | **B1** — Missing description doesn't break UI | **PASS** | Coupons without description (e.g., "TEST HAPPY") render normally with no extra line |
| CR-005 | **B2/B3/B6** — `total_coupon_used` increment code in place | **PASS** | Verified `coupon.py` L2217: `await db.customers.update_one({"id": customer_id, "user_id": user_id}, {"$inc": {"total_coupon_used": 1}})` exists inside `if result.upserted_id is not None` block |
| CR-005 | **B2/B3/B6** — No double increment on replay | **PASS** | Code only runs in `if result.upserted_id is not None` (first insert). Replay path at L2244 skips increment. |
| CR-005 | **B2/B3/B6** — Live increment test | **DEFERRED** | R689 has zero `coupon_usage` records — POS must send `coupon_code + coupon_discount > 0` for increment to fire. CRM code is correct; POS action item. |
| CR-005 | **B5** — Menu error state + retry | **PASS (code)** | `menuError` state, `setMenuError`, `toast.error`, and 3 error banner instances with `data-testid="menu-error-banner"` + `data-testid="menu-retry-btn"` verified in code at L248, L259, L265, L655-658, L751-754, L850-853 |
| CR-005 | **B5** — No silent failure | **PASS** | `catch` block now sets `menuError` state + fires `toast.error` instead of silently swallowing |
| CR-005 | **B7** — Happy Hour discount type toggle visible | **PASS** | Screenshot: Happy Hour form shows "Discount Type" dropdown with "Flat Amount (Rs.)" and "Percentage (%)" options. Both selectable. |
| CR-005 | **B7** — Percentage selection changes form fields | **PASS** | Screenshot: Selecting "Percentage (%)" switches labels to "Discount (%)" + "Max Discount (Rs.)" correctly |
| CR-002B | **Gap 2** — `GET /customers/{id}/coupon-history` exists | **PASS** | Endpoint responds with correct JSON |
| CR-002B | **Gap 2** — Auth enforcement | **PASS** | No auth → HTTP 403 `{"detail":"Not authenticated"}` |
| CR-002B | **Gap 2** — Response shape | **PASS** | Returns `{"customer_id": "...", "coupon_usages": [], "total": 0}` — all fields present, correct types |
| CR-002B | **Gap 2** — Empty customer (zero usage) | **PASS** | Returns `{"coupon_usages": [], "total": 0}` — safe empty response |
| CR-002B | **Gap 2** — Fake customer | **PASS** | Returns HTTP 404 `{"detail":"Customer not found"}` |
| CR-002B | **Gap 2** — Cross-restaurant leakage | **PASS** | R689 token querying R645 customer → HTTP 404 (correctly scoped by `user_id`) |
| CR-002B | **Coupons tab** — 3-tab layout visible | **PASS** | Screenshot: "Points" | "Wallet" | "Coupons" tabs rendered in 3-column grid |
| CR-002B | **Coupons tab** — Empty state | **PASS** | Screenshot: "No coupon usage recorded yet" message shown when zero records |
| CR-002B | **Coupons tab** — Calls coupon-history endpoint | **PASS** | Fetch call verified in code: `api.get(\`/customers/${id}/coupon-history\`)` at L49 |
| CR-002B | **Coupons tab** — Error resilience | **PASS** | Fetch wrapped in `.catch(() => ({ data: { coupon_usages: [] } }))` — page loads even if endpoint fails |

---

## 3. Issues Found (During QA)

| Severity | CR | Issue | Evidence | Fix Applied |
|---|---|---|---|---|
| **Medium** | CR-002B | TabsList change (grid-cols-2 → grid-cols-3, label shortening) did not apply in original implementation — still showed 2 tabs with old labels | Screenshot showed "Points History" / "Wallet History" only, `coupons-tab` not found | **YES — fixed during QA.** `CustomerDetailPage.jsx` L526-529 corrected to `grid-cols-3` with "Points" / "Wallet" / "Coupons" |

---

## 4. Files Changed During QA

| File | Action | Reason |
|---|---|---|
| `frontend/src/pages/CustomerDetailPage.jsx` L526-529 | EDIT (tiny fix) | TabsList grid-cols and labels were not updated in original implementation. Fixed: `grid-cols-2` → `grid-cols-3`, added "Coupons" TabsTrigger, shortened labels. QA-blocking fix — tab was invisible without it. |

---

## 5. Docs Created/Updated

| Path | Action |
|---|---|
| `/app/memory/crm/crm_roi_sprint/qa/CR_005_AND_CR_002B_AUTHENTICATED_QA_REPORT.md` | CREATED (this doc) |
| `/app/memory/crm/crm_roi_sprint/00_register/ROI_MEASUREMENT_CR_REGISTER.md` | UPDATED (status promotion) |

---

## 6. Confirmed Non-Changes

- Product code changed: **YES — 1 tiny QA-blocking fix** (TabsList, documented above)
- DB backfill/migration run: **NO**
- Env changed: **NO**
- Deploy run: **NO**
- `/app/memory/final/` touched/created: **NO**
- `/app/memory/crm/crm_1_0/` modified: **NO**
- CR-003 started: **NO**
- CR-004 started: **NO**

---

## 7. Final Status Updates

| CR | Old Status | New Status |
|---|---|---|
| CR-005 | `cr005_implementation_complete_awaiting_qa` | `cr005_authenticated_qa_passed` |
| CR-002B | `cr002b_implementation_complete_awaiting_qa` | `cr002b_authenticated_qa_passed` |

---

## 8. Deferred QA Items

| Item | Reason | Action Required |
|---|---|---|
| B2 live increment test (POS order with coupon → customer counter +1) | R689 has zero `coupon_usage` records — POS not sending coupon data in orders | POS team must verify order payloads include `coupon_code + coupon_discount > 0` |
| B5 visual test (menu error banner rendering) | Cannot reliably simulate MyGenie API failure in preview | Code verified correct; visual test deferred to manual QA or staging with forced failure |

---

## 9. Recommended Next Agent

Both CRs passed QA. CR-003 (Coupon Analytics Dashboard) is now **UNBLOCKED**.

**Recommended:** `CR-003 Coupon Analytics Dashboard Phase 1 Planning Agent`
