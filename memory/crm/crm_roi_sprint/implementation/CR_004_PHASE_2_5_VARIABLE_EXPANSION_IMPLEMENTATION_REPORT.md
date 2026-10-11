# CR-004 — Phase 2.5 · Variable Expansion (10 → 23) — Implementation Report

**CR:** CR-004 WhatsApp Utility + Marketing Message Integration
**Phase:** P2.5 — Variable Expansion
**Sprint:** ROI Measurement Sprint
**Planned:** N/A (no planning doc existed — written retroactively)
**Implemented:** 2026-05-27 (code committed, report written retroactively)
**Status:** `cr004_phase_2_5_complete`

---

## 1. Summary

P2.5 expanded the WhatsApp template variable registry from 10 to 23 variables, organized into 7 categories: general (2), loyalty (9), wallet (2), order (1), coupon (4), feedback (1), links (4). The resolver, formatter, and brand injection from P2 were extended to support the new variables. No UX changes — the expanded list renders automatically via the API-driven dropdown.

---

## 2. Items Delivered

### 2.1 Registry Expansion — `core/whatsapp_variables.py`

**Before (P2):** 10 variables, all in a flat list
**After (P2.5):** 23 variables in 7 categories

**13 new variables added:**

| # | Key | Category | Source Chain | Fills On | Formatter |
|---|---|---|---|---|---|
| 1 | `old_tier` | loyalty | `event.old_tier` | `tier_upgrade` | None |
| 2 | `expiring_points` | loyalty | `event.expiring_points` | `points_expiring` | integer |
| 3 | `total_visits` | loyalty | `customer.total_visits` | `*` | integer |
| 4 | `total_spent` | loyalty | `customer.total_spent` | `*` | currency |
| 5 | `order_id` | order | `event.order_id → event.pos_order_id` | ORDER_EVENTS + `first_visit` | None |
| 6 | `coupon_title` | coupon | `event.coupon_title` | `coupon_earned` | None |
| 7 | `coupon_discount` | coupon | `event.coupon_discount → event.discount` | `coupon_earned` | currency |
| 8 | `coupon_expiry` | coupon | `event.coupon_expiry` | `coupon_earned` | date |
| 9 | `rating` | feedback | `event.rating` | `feedback_received` | None |
| 10 | `einvoice_link` | links | `event.einvoice_link → brand.einvoice_link` | ORDER_EVENTS | None |
| 11 | `instagram_link` | links | `brand.instagram_link` | `*` | None |
| 12 | `google_review_link` | links | `brand.google_review_link` | `*` | None |
| 13 | `feedback_link` | links | `brand.feedback_link` | `*` | None |

The docstring was updated to read:
```
Canonical WhatsApp template variable registry — P2.5 expanded.
23 variables total (10 original + 13 new).
```

### 2.2 Coupon Trigger Site Enriched — `routers/coupons.py:186-197`

The `coupon_earned` event trigger was enriched to pass the new coupon fields:

```python
asyncio.create_task(trigger_whatsapp_event(
    db, user["id"], "coupon_earned", customer,
    {
        "coupon_code": code.upper(),
        "discount": validation["discount"],
        "coupon_discount": validation["discount"],
        "discount_type": coupon.get("discount_type"),
        "discount_value": coupon.get("discount_value"),
        "coupon_title": coupon.get("title", ""),
        "coupon_expiry": coupon.get("end_date", ""),
    }
))
```

### 2.3 Brand Data Projection Expanded — `core/whatsapp.py:427-443`

`trigger_whatsapp_event()` now fetches additional brand-level fields for link variables:

```python
user_doc = await db.users.find_one(
    {"id": user_id},
    {"_id": 0, "authkey_api_key": 1, "restaurant_name": 1,
     "einvoice_link": 1, "instagram_link": 1,
     "google_review_link": 1, "feedback_link": 1},
)
brand_data = {
    "restaurant_name": user_doc.get("restaurant_name", ""),
    "einvoice_link": user_doc.get("einvoice_link", ""),
    "instagram_link": user_doc.get("instagram_link", ""),
    "google_review_link": user_doc.get("google_review_link", ""),
    "feedback_link": user_doc.get("feedback_link", ""),
}
```

### 2.4 Sample Data Endpoint Expanded — `routers/customers.py:723-773`

`GET /api/customers/sample-data` response now returns all 23 keys in the `sample` dict:

```python
return {
    "sample": {
        # General (2)
        "customer_name": ..., "restaurant_name": ...,
        # Loyalty (9)
        "points_balance": ..., "points_earned": ..., "points_redeemed": ...,
        "tier": ..., "old_tier": "", "expiring_points": "", "expiry_date": "",
        "total_visits": ..., "total_spent": ...,
        # Wallet (2)
        "wallet_balance": ..., "amount": ...,
        # Order (1)
        "order_id": "",
        # Coupon (4)
        "coupon_code": "", "coupon_title": "", "coupon_discount": "", "coupon_expiry": "",
        # Feedback (1)
        "rating": "",
        # Links (4)
        "einvoice_link": ..., "instagram_link": ...,
        "google_review_link": ..., "feedback_link": ...,
    },
    "restaurant_name": restaurant_name,
}
```

The users doc query was expanded to include link fields:
```python
user_doc = await db.users.find_one(
    {"id": user["id"]},
    {"_id": 0, "restaurant_name": 1, "einvoice_link": 1,
     "instagram_link": 1, "google_review_link": 1, "feedback_link": 1}
)
```

---

## 3. Files Changed

| File | Change Type | Details |
|---|---|---|
| `backend/core/whatsapp_variables.py` | MODIFIED | 10 → 23 variables; added `category` field; added 5 new event-coverage constants |
| `backend/core/whatsapp.py` | MODIFIED | Expanded brand_data projection in `trigger_whatsapp_event` to include link fields |
| `backend/routers/coupons.py` | MODIFIED | Enriched `coupon_earned` event_data with `coupon_title`, `coupon_discount`, `coupon_expiry` |
| `backend/routers/customers.py` | MODIFIED | `get_sample_customer_data` returns all 23 keys; expanded users doc projection for links |

---

## 4. Tests Added

| File | Tests | Status |
|---|---|---|
| `backend/tests/test_whatsapp_p2_5_expansion.py` | 27 tests covering: variable count (23), each new variable resolution, falls_on coverage per variable, category presence, coupon formatter (currency + date), profile links from brand scope, P2 regression (customer_name, tier_upgrade, restaurant_name) | ✅ All 27 pass |

---

## 5. Acceptance Criteria Results

| # | Criterion | Result |
|---|---|---|
| AC-1 | `GET /api/whatsapp/variables` returns 23 variables | ✅ Pass |
| AC-2 | Every variable has `key`, `label`, `example`, `description`, `sources`, `fills_on_events`, `formatter`, `category` | ✅ Pass (unit test `test_all_variables_have_category`) |
| AC-3 | `resolve_variable("coupon_title", {}, {"coupon_title": "Lunch Special"}, {})` → `"Lunch Special"` | ✅ Pass |
| AC-4 | `resolve_variable("total_spent", {"total_spent": 50000}, {}, {})` → `"Rs.50,000"` | ✅ Pass |
| AC-5 | `resolve_variable("coupon_expiry", {}, {"coupon_expiry": "2026-12-31"}, {})` → `"31 Dec 2026"` | ✅ Pass |
| AC-6 | `fills_on("coupon_title", "coupon_earned")` → True; `fills_on("coupon_title", "birthday")` → False | ✅ Pass |
| AC-7 | `fills_on("instagram_link", "birthday")` → True (universal) | ✅ Pass |
| AC-8 | Sample-data endpoint returns all 23 keys | ✅ Pass (verified in code) |
| AC-9 | Variable mapping dropdown shows all 23 variables | ✅ Pass (API-driven, automatic) |
| AC-10 | P2 regression: original 10 variables still resolve correctly | ✅ Pass (3 regression tests in P2.5 test file) |

---

## 6. Combined Test Suite Status

All 4 test files (P1 + P2 + P2.5) pass together:

```
$ python3 -m pytest tests/test_whatsapp_*.py -v
50 passed in 0.73s
```

| File | Tests |
|---|---|
| `test_whatsapp_text_mode.py` | 5 |
| `test_whatsapp_variables_endpoint.py` | 5 |
| `test_whatsapp_resolver.py` | 13 |
| `test_whatsapp_p2_5_expansion.py` | 27 |
| **Total** | **50** |

---

## 7. What Was NOT Done (Owner's P2.5-B Request)

Owner's communication before P2.5 shipped:
> "We will need rich, dynamic fields for coupon — coupon title — so the user can easily select which coupon, because this is the most important part in the model. We might need to redesign the model."

P2.5 added the **data layer** (variables exist, resolve correctly, trigger passes them). The **UX model redesign** (coupon picker in the Variable Mapping Modal) is scoped as **P2.5-B** — see planning doc at:
`/app/memory/crm/crm_roi_sprint/planning/CR_004_PHASE_2_5_B_COUPON_AWARE_DYNAMIC_VARIABLE_MAPPING_PLANNING.md`

---

## 8. Status

`cr004_phase_2_5_complete`

### Next Phase: P2.5-B (Coupon-Aware Dynamic Variable Mapping)
- Planning doc drafted, awaiting owner sign-off
- Introduces `[Pick Coupon]` mode in Variable Mapping Modal
- 4 work items, ~5 sessions estimated
