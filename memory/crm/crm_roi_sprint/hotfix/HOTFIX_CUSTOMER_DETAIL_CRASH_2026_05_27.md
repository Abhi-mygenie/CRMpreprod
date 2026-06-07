# Hotfix: Customer Detail Page Crash (Mixed Datetime + Missing Wallet Field)

**Date:** 2026-05-27
**Status:** `hotfix_customer_detail_crash_fixed`
**Triggered by:** Clicking Mayur (9328743156) row in Customers list on restaurant 523 (Mayur's Kitchen)

---

## Symptoms

- Clicking customer row → React "Uncaught runtime errors" crash + "Customer not found" toast
- Other customer rows with only old OR only new orders worked fine

---

## Root Causes (2 bugs, same customer)

### Bug 1 — `customers.py:1590` — Mixed naive/aware datetime subtraction

**Endpoint:** `GET /api/customers/{id}/insights`
**Error:** `TypeError: can't subtract offset-naive and offset-aware datetimes`

**Cause:** Migrated orders store `created_at` as naive IST strings (`"2026-05-16 16:11:48"`). Real-time POS orders store `created_at` as UTC-aware strings (`"2026-05-25T04:58:34.874540+00:00"`). Visit-gap calculation subtracted mixed types.

**Fix:** Strip tzinfo from all dates before day-level gap computation:
```python
dates_naive = [dt.replace(tzinfo=None) for dt in dates]
gaps = [(dates_naive[i+1] - dates_naive[i]).days ...]
```

**File:** `/app/backend/routers/customers.py` line 1590

---

### Bug 2 — `wallet.py:82` — Missing `balance_after` field on migrated wallet transactions

**Endpoint:** `GET /api/wallet/transactions/{customer_id}`
**Error:** `pydantic_core.ValidationError: balance_after Field required`

**Cause:** Older migrated wallet transactions in DB lack the `balance_after` field. The `WalletTransaction` Pydantic model required it as `float` (non-optional).

**Fix:** Made `balance_after` optional:
```python
balance_after: Optional[float] = None
```

**File:** `/app/backend/models/schemas.py` line 559

---

## Files Changed

| File | Change |
|---|---|
| `/app/backend/routers/customers.py` | Line 1590: normalize dates to naive before gap subtraction |
| `/app/backend/models/schemas.py` | Line 559: `balance_after: float` → `balance_after: Optional[float] = None` |

---

## Verified

- `GET /api/customers/{id}/insights` → 200 OK (was 500)
- `GET /api/wallet/transactions/{id}` → 200 OK (was 500)
- Customer detail page loads without crash — **confirmed working by owner (2026-05-27)**

---

## Root Pattern

Both bugs stem from **migrated data** (pre-CRM-1.0) having different formats/missing fields compared to real-time POS data. Any endpoint that touches orders or wallet transactions for customers with mixed old+new data is at risk. Future hardening: audit all Pydantic models for required fields that may be absent in migrated records.
