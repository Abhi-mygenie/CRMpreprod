# CR-004 — Phase 2.5 · Variable Expansion — Discovery & Analysis Report

**CR:** CR-004 WhatsApp Utility + Marketing Message Integration
**Phase:** P2.5 — Variable Expansion (new phase, inserted between P2 and P3)
**Sprint:** ROI Measurement Sprint
**Date:** 2026-05-28
**Status:** `cr004_p2_5_discovery_complete_ready_for_planning`
**Depends on:** P2 (Variable DB Mapping) — **COMPLETE**
**Mode:** READ-ONLY — no code changes in this report

---

## 1. Purpose

P2 made the existing 10 variables resolve correctly. P2.5 answers: **what additional variables should owners be able to pick from that dropdown?** — grounded in what data actually exists at each trigger site.

---

## 2. Methodology

For every `trigger_whatsapp_event()` call site in the codebase, we extracted the exact `event_data` dict. Combined with the `customer` document fields available at trigger time, this gives us the complete universe of data an owner could theoretically reference in a WhatsApp template.

---

## 3. Complete Event → Data Matrix

### 3.1 POS Events

**`send_bill`** (fires on every POS order — `routers/pos.py:1462`)
```
event_data: {
    order_id, pos_order_id, order_amount, points_earned,
    points_balance, wallet_used, wallet_balance
}
customer fields: name, phone, tier, total_points, total_visits, total_spent, wallet_balance
```

**`first_visit`** (fires when is_new=True — `routers/pos.py:1477`)
```
event_data: {
    first_visit_bonus, order_amount, points_balance
}
customer fields: (same as above)
```

**`tier_upgrade`** (fires on tier change — `routers/pos.py:1489`, `routers/points.py:143`)
```
event_data: {
    old_tier, new_tier, points_balance
}
customer fields: (same, with tier already updated to new_tier)
```

### 3.2 Coupon Events

**`coupon_earned`** (fires when coupon applied — `routers/coupons.py:186`)
```
event_data: {
    coupon_code, discount, discount_type, discount_value
}
customer fields: (standard)
```

Note: The coupon's `title`, `description`, `end_date`, `offer_type` are NOT passed in event_data. They exist on the `coupons` collection but the trigger site doesn't fetch them.

### 3.3 Wallet Events

**`wallet_credit`** (fires on credit — `routers/wallet.py:55`)
```
event_data: {
    amount, wallet_balance
}
```

**`wallet_debit`** (fires on debit — `routers/wallet.py:65`)
```
event_data: {
    amount, wallet_balance
}
```

### 3.4 Points Events

**`bonus_points`** (fires on manual bonus — `routers/points.py:133`)
```
event_data: {
    bonus_points, points_balance
}
```

**`points_earned`** (fires via trigger_points_earned_event helper — multiple callers)
```
event_data: {
    points_earned, points, source, points_balance, balance_after
}
```

### 3.5 Loyalty Cron Events

**`birthday`** (`core/loyalty_jobs.py:105`)
```
event_data: {
    birthday_bonus, points_balance
}
```

**`anniversary`** (`core/loyalty_jobs.py:205`)
```
event_data: {
    anniversary_bonus, points_balance
}
```

**`points_expiring`** (`core/loyalty_jobs.py:288`)
```
event_data: {
    expiring_points, expiry_date (pre-formatted "31 Dec 2026"), points_balance
}
```

### 3.6 Feedback Events

**`feedback_received`** (`services/feedback_service.py:59`)
```
event_data: {
    rating, feedback_message, feedback_id
}
```

### 3.7 POS Gateway Events (external)

**Dynamic events via `/pos/event`** (`routers/pos.py:2174`)
```
event_data: {
    order_id, pos_order_id, restaurant_name,
    ...(whatever external POS passes in event_data.event_data)
}
```

---

## 4. Current 10 Variables vs What's Available

| Current variable | Covered? | Missing data? |
|---|---|---|
| customer_name | Yes | — |
| points_balance | Yes | — |
| points_earned | Yes | — |
| points_redeemed | Partially | Only from customer record; no event fires `points_redeemed` in event_data |
| wallet_balance | Yes | — |
| amount | Yes | — |
| tier | Yes | — |
| restaurant_name | Yes (P2 brand injection) | — |
| coupon_code | Yes | Only on coupon_earned |
| expiry_date | Yes | Only on points_expiring |

---

## 5. Candidate New Variables

### 5.1 Order-related (from `send_bill` / POS events)

| Variable key | Source | Available on events | Why useful |
|---|---|---|---|
| `order_id` | event.order_id | send_bill, first_visit, POS gateway | Reference number in bill messages |
| `order_amount` | event.order_amount (alias of amount) | send_bill, first_visit | Already covered by `amount` but more explicit name |
| `wallet_used` | event.wallet_used | send_bill | "You used Rs.200 from wallet on this order" |

**Decision needed:** `order_id` is high value. `order_amount` is redundant with `amount`. `wallet_used` is niche.

### 5.2 Coupon-related (from `coupon_earned` event + coupon DB doc)

| Variable key | Source | Available on events | Why useful |
|---|---|---|---|
| `coupon_code` | Already exists | coupon_earned | ✅ Already in the 10 |
| `coupon_discount` | event.discount | coupon_earned | "You saved Rs.150 with this coupon" |
| `coupon_title` | **NOT in event_data** — would need fetch from `coupons` collection | coupon_earned | "Your coupon 'Lunch Special' was applied" |
| `coupon_description` | **NOT in event_data** — would need fetch from `coupons` collection | coupon_earned | Long text — rarely useful in WhatsApp |
| `coupon_expiry` | **NOT in event_data** — coupon.end_date | coupon_earned | "Valid until 31 Dec 2026" |
| `discount_type` | event.discount_type | coupon_earned | "flat" / "percentage" — technical, not user-friendly |
| `discount_value` | event.discount_value | coupon_earned | "20%" or "Rs.100" — the raw value before application |

**Approach for coupon_title / coupon_expiry:** Two options:
- **Option A (simple):** Enrich `event_data` at the coupon_earned trigger site in `routers/coupons.py:186` — add `coupon.get("title")`, `coupon.get("end_date")`, `coupon.get("description")` to the dict. The coupon doc is already loaded there (line 185). Zero extra DB queries.
- **Option B (heavy):** Fetch from coupons collection inside the resolver. Adds a DB call per trigger. Not recommended.

**Recommendation:** Option A — enrich the trigger site. Then add `coupon_title`, `coupon_discount`, `coupon_expiry` to the registry.

### 5.3 Loyalty-related

| Variable key | Source | Available on events | Why useful |
|---|---|---|---|
| `points_balance` | Already exists | All | ✅ Already in the 10 |
| `points_earned` | Already exists | Most | ✅ Already in the 10 |
| `points_redeemed` | Already exists | Limited | ✅ Already in the 10 |
| `tier` | Already exists | All | ✅ Already in the 10 |
| `old_tier` | event.old_tier | tier_upgrade | "Upgraded from Silver to Gold" |
| `expiring_points` | event.expiring_points | points_expiring | "150 points are about to expire" — distinct from points_balance |
| `total_visits` | customer.total_visits | All (from customer doc) | "Thank you for your 25th visit!" |
| `total_spent` | customer.total_spent | All (from customer doc) | "You've spent Rs.50,000 with us" |

**Decision needed:** `old_tier` is useful for upgrade messages. `expiring_points` is distinct from `points_balance` and useful for expiry reminders. `total_visits` and `total_spent` are always available from the customer doc.

### 5.4 Feedback-related

| Variable key | Source | Available on events | Why useful |
|---|---|---|---|
| `rating` | event.rating | feedback_received | "Thank you for your 5-star rating!" |
| `feedback_message` | event.feedback_message | feedback_received | Quote the customer's own words back |

**Decision needed:** `rating` is high value for personalized thank-you messages. `feedback_message` is long text and may exceed WhatsApp variable limits.

### 5.5 Wallet-related

| Variable key | Source | Available on events | Why useful |
|---|---|---|---|
| `wallet_balance` | Already exists | All | ✅ Already in the 10 |
| `amount` | Already exists | Most | ✅ Already in the 10 |
| `wallet_used` | event.wallet_used | send_bill | Niche |

---

## 6. Recommended New Variables (Tiered)

### Tier 1 — High value, zero code change (data already in event_data)

| # | Variable | Source | Events | Formatter |
|---|---|---|---|---|
| 1 | `order_id` | event.order_id | send_bill, first_visit, POS gateway | None |
| 2 | `old_tier` | event.old_tier | tier_upgrade | None |
| 3 | `expiring_points` | event.expiring_points | points_expiring | integer |
| 4 | `total_visits` | customer.total_visits | All (customer doc) | integer |
| 5 | `total_spent` | customer.total_spent | All (customer doc) | currency |
| 6 | `rating` | event.rating | feedback_received | None |

**Implementation:** Add 6 entries to `whatsapp_variables.py`. Zero other code changes.

### Tier 2 — High value, small code change (enrich coupon trigger site)

| # | Variable | Source | Events | Requires |
|---|---|---|---|---|
| 7 | `coupon_title` | event.coupon_title | coupon_earned | Add `coupon.get("title")` to event_data in `routers/coupons.py:186` |
| 8 | `coupon_discount` | event.discount → rename to `coupon_discount` | coupon_earned | Already passed as `discount`; add alias in registry |
| 9 | `coupon_expiry` | event.coupon_expiry | coupon_earned | Add `coupon.get("end_date")` to event_data in `routers/coupons.py:186` |

**Implementation:** 3 registry entries + 2 lines added to the coupon trigger site (title + end_date already on the loaded coupon doc).

### Tier 3 — Nice-to-have

| # | Variable | Source | Why deferred |
|---|---|---|---|
| 10 | `feedback_message` | event.feedback_message | Long text; may exceed WhatsApp body variable limits |
| 11 | `wallet_used` | event.wallet_used | Niche — only on send_bill |
| 12 | `discount_value` | event.discount_value | Technical ("20" vs "Rs.100") — confusing for owners |

---

## 7. Coupon Fields Deep Dive

### What exists on a coupon doc (from DB sample):
- `code` — the coupon code (FLAT100TEST) → already covered by `coupon_code`
- `title` — human-readable name ("Flat 100 Off Test") → **NEW: `coupon_title`**
- `description` — long description → deferred (rarely used in WhatsApp)
- `discount_type` — "flat" / "percentage" → technical, not recommended for template
- `discount_value` — raw number (100.0 for flat, 20.0 for percentage) → deferred
- `end_date` — "2026-12-31" → **NEW: `coupon_expiry`** (formatted as "31 Dec 2026")
- `offer_type` — "simple" / "bogo" / etc. → technical
- `min_order_value` — "500.0" → niche
- `usage_limit` / `per_user_limit` — admin info, not customer-facing

### What's passed to WhatsApp trigger at coupon_earned time (today):
```python
{"coupon_code": code, "discount": discount_amount, "discount_type": type, "discount_value": value}
```

### What should be added:
```python
{"coupon_code": code, "discount": discount_amount, "discount_type": type, "discount_value": value,
 "coupon_title": coupon.get("title", ""), "coupon_expiry": coupon.get("end_date", "")}
```

The coupon doc is already loaded at that trigger site (`coupon` variable at line 185). Zero extra DB queries.

---

## 8. Loyalty Fields Deep Dive

### Customer doc fields always available:
- `total_points` → already covered by `points_balance` (via resolver chain)
- `total_points_earned` → covered by `points_earned` (fallback)
- `total_points_redeemed` → covered by `points_redeemed` (fallback)
- `tier` → already covered
- `wallet_balance` → already covered
- `total_visits` → **NEW: `total_visits`**
- `total_spent` → **NEW: `total_spent`**
- `date_of_birth` → not useful in template (privacy)
- `last_visit` → could be useful but formatting complexity; deferred

### Event-specific loyalty fields:
- `birthday_bonus` / `anniversary_bonus` / `first_visit_bonus` → already resolved via `points_earned` source chain
- `old_tier` / `new_tier` → `new_tier` resolved via `tier`; **`old_tier` is NEW**
- `expiring_points` → **NEW: distinct from `points_balance`**
- `expiry_date` → already covered

---

## 9. Implementation Estimate

| Tier | Variables | Registry entries | Trigger site changes | Tests |
|---|---|---|---|---|
| Tier 1 | 6 | 6 entries in `whatsapp_variables.py` | 0 | 6 unit tests |
| Tier 2 | 3 | 3 entries in `whatsapp_variables.py` | 2 lines in `routers/coupons.py:186` + date formatter for coupon_expiry | 3 unit tests |
| **Total** | **9** | **9 entries** | **2 lines** | **9 tests** |

Total variable count after P2.5: **10 (existing) + 9 (new) = 19 variables** in the dropdown.

---

## 10. Owner Decision Points

| # | Decision | Default |
|---|---|---|
| D2.5-1 | Approve Tier 1 (6 vars) + Tier 2 (3 vars) = 9 new variables? | Yes |
| D2.5-2 | Include `feedback_message` (Tier 3)? Risk: long text in WhatsApp variable | No |
| D2.5-3 | Include `wallet_used` (Tier 3)? Niche. | No |
| D2.5-4 | Coupon title/expiry: enrich trigger site (Option A) vs resolver-level DB fetch (Option B)? | A (enrich trigger site) |
| D2.5-5 | Frontend: group variables by category in dropdown (Order / Coupon / Loyalty / Feedback / General)? | Yes — improves UX for 19 items |

---

## 11. Strict Non-Goals

- No new events (that's P3)
- No new trigger sites
- No DB schema changes
- No new dependencies

---

## 12. Status

```
cr004_p2_5_discovery_complete_ready_for_planning
```

**Next:** Planning doc with exact code-level implementation spec (same format as P1/P2 runbooks).
