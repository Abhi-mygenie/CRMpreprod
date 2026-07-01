# POS BUG-108 — Loyalty API Handoff to POS Team

> **🟢 STATUS: GREEN-LIGHT — POS may consume.**
>
> LX-A is implemented in CRM preview. Static QA (63/63) + read-only smoke
> on restaurant `18march` (5/5) passed on 2026-05-23. The 3 endpoints
> listed in §2 may now be consumed by POS in the preview environment.
> Prod deploy will happen in the joint batch with CR-001A Phase 2 +
> CR-001D (per CR-001C-L scope-lock §3 / D5).

---

**CR:** CR-001C-LX (bridge phase inside CR-001C-L Loyalty)
**Phase:** LX-A
**Date drafted:** 2026-05-22
**From:** CRM Team
**To:** POS 3.0 Frontend Team
**Re:** BUG-108 §3.3 (Loyalty tier → ratio configuration) — final API contract
**Parent docs:**
- `/app/memory/crm/crm_1_0/planning/POS3_0_BUG_108_API_INVENTORY_FOR_CRM_2026_05_22.md`
- `/app/memory/crm/crm_1_0/planning/CR_001C_LX_POS_BUG_108_API_CONTRACT_ALIGNMENT_PLAN.md`
- `/app/memory/crm/crm_1_0/planning/CR_001C_LX_A_IMPLEMENTATION_PLAN.md`

---

## 1. Scope of this Handoff

> **BUG-108 is handled in 3 CRM phases:**
> 1. **CR-001C-L Loyalty — active now**
> 2. **CR-001C-C Coupon — next**
> 3. **CR-001C-W Wallet — later**
>
> **This handoff covers only the Loyalty phase. Coupon and Wallet will receive separate CRM plans and handoffs.**

### Phase mapping (BUG-108 → CRM CRs)

| BUG-108 item | CRM owner | Status |
|---|---|---|
| §3.3 Loyalty tier → ratio (this doc) | **CR-001C-L** | **Active — delivered in LX-A** |
| §3.1 `GET /pos/coupons/available` | CR-001C-C | Deferred — opens after Loyalty closes |
| §3.2 `POST /pos/coupons/validate` (BUG-108 body contract + `error.code`) | CR-001C-C | Deferred — opens after Loyalty closes |
| §3.x customer-coupon entitlement model | CR-001C-C | Deferred — opens after Loyalty closes |
| Wallet read-shape audit | CR-001C-W | Deferred — opens after Coupon closes |
| §4 redemption / debit / reversal endpoints | Future redemption CR | Deferred indefinitely per owner sign-off |

### What this doc covers (Phase 1 / Loyalty only)

- Tier-aware `ratio_per_point` exposed in 3 POS loyalty read endpoints.
- New per-tier configuration on the CRM Loyalty admin page (4 fields).

### What this doc explicitly does NOT cover

- BUG-108 §3.1 + §3.2 (coupon endpoints) → see CR-001C-C handoff (future).
- Customer-coupon entitlement model → see CR-001C-C handoff (future).
- Coupon `error.code` taxonomy → see CR-001C-C handoff (future).
- Wallet endpoints (read audit + debit / credit / reverse) → see CR-001C-W handoff (future).
- Any redemption / debit / reversal endpoints → future redemption CR.

---

## 2. Final Endpoint List (LX-A)

Three endpoints are touched. All other POS endpoints are unchanged.

| # | Endpoint | Auth | Change in LX-A |
|---|---|---|---|
| 2.1 | `POST /api/pos/customer-lookup` | `X-API-Key` | `points_value` is now **tier-aware** (uses customer's tier to look up the per-tier ratio). All other flat response fields unchanged. |
| 2.2 | `GET /api/pos/customers/{customer_id}` | `X-API-Key` | Nested `loyalty` blob is replaced with a **strict 6-key shape** (see §3). Top-level customer fields unchanged. |
| 2.3 | `GET /api/pos/customers/{customer_id}/loyalty` | `X-API-Key` | Response `data` is now the **strict 6-key loyalty blob** (see §3). |

All three call sites use a single shared helper `core.loyalty.build_pos_loyalty_blob(customer, settings)` — guaranteed identical math.

> **Note on URL prefix:** All endpoints are served behind `/api`. Full URL form is `${REACT_APP_BACKEND_URL}/api/pos/...`. The shorthand `/pos/...` used in BUG-108 inventory and below maps to `/api/pos/...` at the edge.

---

## 3. Final Response Shape — Loyalty Blob (6 keys, locked)

```json
{
  "tier": "Gold",
  "tier_label": "Gold Member",
  "total_points": 480,
  "ratio_per_point": 1.5,
  "points_value": 720.0,
  "loyalty_enabled": true
}
```

### Field definitions

| Field | Type | Description |
|---|---|---|
| `tier` | `string` | One of `"Bronze"`, `"Silver"`, `"Gold"`, `"Platinum"`. Defaults to `"Bronze"` if customer record has no tier. |
| `tier_label` | `string` | Human-friendly tier label. Derived as `"{tier} Member"` (e.g. `"Gold Member"`). Reserved for owner-configurable labels in a future CR; today always follows this pattern. |
| `total_points` | `int` | Current spendable points balance. Defaults to `0`. |
| `ratio_per_point` | `float` | **Rupees per point.** Resolution order: per-tier override → restaurant-level `redemption_value` → `0.25` default. |
| `points_value` | `float` | `round(total_points × ratio_per_point, 2)`. Rupee value of the customer's current balance. |
| `loyalty_enabled` | `bool` | Restaurant-wide kill-switch. If `false`, POS frontend SHOULD hide loyalty UI even though `points_value` is still numerically returned. |

### Removed (vs pre-LX shape) — DO NOT consume

The following keys were returned by the pre-LX version of `GET /pos/customers/{id}` and `GET /pos/customers/{id}/loyalty`. They are **NO LONGER RETURNED**:

| Removed key | Replacement |
|---|---|
| `points_monetary_value` | Use `points_value` |
| `redemption_value_per_point` | Use `ratio_per_point` |
| `next_tier` | Not exposed in BUG-108 contract. If needed, request via CR-001C-V or a future LX iteration. |
| `points_to_next_tier` | Same as `next_tier`. |
| `wallet_balance` (inside loyalty blob) | Use top-level `wallet_balance` on `GET /pos/customers/{id}` (unchanged at top level). |
| `earn_rate_percent` | Not exposed in BUG-108 contract. |
| `total_visits` (inside loyalty payload of endpoint 2.3) | Available on top-level of `GET /pos/customers/{id}`. |
| `total_spent` (same) | Same. |

POS team: please ensure no code path reads any of the removed keys before the GREEN-LIGHT banner flips. CRM has verified its own frontend does not consume these keys from the `/pos/*` endpoints.

---

## 4. Endpoint-Level Response Examples (Bronze / Silver / Gold)

### 4.1 `POST /api/pos/customer-lookup`

**Request:**

```http
POST /api/pos/customer-lookup
X-API-Key: <crm_token>
Content-Type: application/json

{ "phone": "9876543210" }
```

**Bronze customer (no per-tier override; restaurant-level `redemption_value = 0.25`):**

```json
{
  "success": true,
  "message": "Customer found",
  "data": {
    "registered": true,
    "customer_id": "cust_bronze_001",
    "name": "Ravi Kumar",
    "phone": "9876543210",
    "tier": "Bronze",
    "total_points": 120,
    "points_value": 30.0,
    "wallet_balance": 0.0,
    "total_visits": 3,
    "total_spent": 1450.0,
    "allergies": [],
    "favorites": [],
    "last_visit": "2026-05-20T13:14:11+00:00",
    "addresses": []
  }
}
```

**Silver customer (per-tier override `silver_redemption_value = 1.0`):**

```json
{
  "success": true,
  "message": "Customer found",
  "data": {
    "registered": true,
    "customer_id": "cust_silver_002",
    "name": "Priya Sharma",
    "phone": "9123456780",
    "tier": "Silver",
    "total_points": 620,
    "points_value": 620.0,
    "wallet_balance": 50.0,
    "total_visits": 12,
    "total_spent": 8900.0,
    "allergies": ["peanut"],
    "favorites": ["paneer-tikka"],
    "last_visit": "2026-05-22T19:45:02+00:00",
    "addresses": [ /* … */ ]
  }
}
```

**Gold customer (per-tier override `gold_redemption_value = 1.5`):**

```json
{
  "success": true,
  "message": "Customer found",
  "data": {
    "registered": true,
    "customer_id": "cust_gold_003",
    "name": "Anita Verma",
    "phone": "9988776655",
    "tier": "Gold",
    "total_points": 480,
    "points_value": 720.0,
    "wallet_balance": 1200.0,
    "total_visits": 34,
    "total_spent": 28450.0,
    "allergies": [],
    "favorites": ["butter-chicken", "gulab-jamun"],
    "last_visit": "2026-05-22T20:10:11+00:00",
    "addresses": [ /* … */ ]
  }
}
```

> Note: this endpoint stays **flat** (no nested loyalty blob), matching POS inventory §2.2. Only `points_value` is recomputed using the new helper.

---

### 4.2 `GET /api/pos/customers/{customer_id}`

**Bronze:**

```json
{
  "success": true,
  "message": "Customer found",
  "data": {
    "id": "cust_bronze_001",
    "name": "Ravi Kumar",
    "phone": "9876543210",
    "tier": "Bronze",
    "total_points": 120,
    "wallet_balance": 0.0,
    /* … other top-level customer fields … */
    "loyalty": {
      "tier": "Bronze",
      "tier_label": "Bronze Member",
      "total_points": 120,
      "ratio_per_point": 0.25,
      "points_value": 30.0,
      "loyalty_enabled": true
    },
    "recent_orders": [ /* up to 5 */ ],
    "addresses": [ /* … */ ]
  }
}
```

**Silver:**

```json
{
  "success": true,
  "message": "Customer found",
  "data": {
    "id": "cust_silver_002",
    "name": "Priya Sharma",
    "phone": "9123456780",
    "tier": "Silver",
    "total_points": 620,
    "wallet_balance": 50.0,
    /* … */
    "loyalty": {
      "tier": "Silver",
      "tier_label": "Silver Member",
      "total_points": 620,
      "ratio_per_point": 1.0,
      "points_value": 620.0,
      "loyalty_enabled": true
    },
    "recent_orders": [ /* … */ ],
    "addresses": [ /* … */ ]
  }
}
```

**Gold:**

```json
{
  "success": true,
  "message": "Customer found",
  "data": {
    "id": "cust_gold_003",
    "name": "Anita Verma",
    "phone": "9988776655",
    "tier": "Gold",
    "total_points": 480,
    "wallet_balance": 1200.0,
    /* … */
    "loyalty": {
      "tier": "Gold",
      "tier_label": "Gold Member",
      "total_points": 480,
      "ratio_per_point": 1.5,
      "points_value": 720.0,
      "loyalty_enabled": true
    },
    "recent_orders": [ /* … */ ],
    "addresses": [ /* … */ ]
  }
}
```

---

### 4.3 `GET /api/pos/customers/{customer_id}/loyalty`

Returns the loyalty blob as the entire `data` payload — strict 6 keys.

**Gold (same customer as 4.2):**

```json
{
  "success": true,
  "message": "Loyalty summary",
  "data": {
    "tier": "Gold",
    "tier_label": "Gold Member",
    "total_points": 480,
    "ratio_per_point": 1.5,
    "points_value": 720.0,
    "loyalty_enabled": true
  }
}
```

---

## 5. Fallback Behavior — Where `ratio_per_point` Comes From

Resolution at request time (per-customer, every request):

```
1. settings.{tier.lower()}_redemption_value     (per-tier override; e.g. silver_redemption_value)
2. settings.redemption_value                    (restaurant-level legacy field)
3. 0.25                                         (final hardcoded fallback)
```

| Restaurant setup | What POS sees |
|---|---|
| Owner has not configured per-tier; `redemption_value = 1.0` (restaurant-level) | `ratio_per_point = 1.0` for every tier |
| Owner sets `gold_redemption_value = 1.5` only; `redemption_value = 1.0` | Gold customers see `1.5`; Bronze/Silver/Platinum see `1.0` |
| Owner sets all 4 per-tier values; `redemption_value` still set | Each tier sees its own per-tier value; restaurant-level ignored |
| Owner has NOT created `loyalty_settings` for the restaurant | `ratio_per_point = 0.25`, `loyalty_enabled = false` |

> **Owner action to set per-tier values (until admin UI lands):**
>
> `PATCH /api/loyalty-settings`
> Body: `{ "bronze_redemption_value": 0.25, "silver_redemption_value": 1.0, "gold_redemption_value": 1.5, "platinum_redemption_value": 2.0 }`
>
> Setting a field to `null` removes the override and falls back to restaurant-level. An admin-UI follow-up is planned as part of CR-001C-L close-out.

### `loyalty_enabled` semantics

- `true` → POS may show loyalty UI and treat `points_value` as redeemable.
- `false` → POS SHOULD hide loyalty UI. `points_value` is still returned numerically for informational/auditing purposes only.
- Missing `loyalty_settings` doc → `false`.

---

## 6. What Did NOT Change (LX-A)

| Endpoint | Change in LX-A? |
|---|---|
| `GET /api/pos/customers?search=` | **No change.** Same fields. |
| `POST /api/pos/customers` | **No change.** Loyalty counters already initialized correctly to zero (post-CR-001C-L L1/L2). |
| `PUT /api/pos/customers/{id}` | **No change.** |
| `POST /api/pos/address-lookup` | **No change.** |
| `POST /api/pos/orders` (realtime POS write-path) | **No change.** Earn-side math uses `core.loyalty.calculate_points`, unchanged since L1+L2. |
| `POST /api/pos/coupons/validate` | **No change.** See §7. |
| `POST /api/pos/coupons/apply` | **No change.** See §7. |
| Any other endpoint | **No change.** |

---

## 7. Coupon Endpoints — Deferred to CR-001C-C

| BUG-108 item | Current state | Owner module |
|---|---|---|
| `GET /pos/coupons/available?customer_id=&order_total=&restaurant_id=` (§3.1) | **Does not exist** in CRM. | **CR-001C-C** (Coupons module) |
| `POST /pos/coupons/validate` with BUG-108 JSON-body contract + `error.code` taxonomy (§3.2) | Endpoint exists at `POST /api/pos/coupons/validate` (query-string contract, flat error messages). Will be reshaped to match BUG-108 contract inside CR-001C-C. | **CR-001C-C** |

### Why deferred

Per the owner-locked module sequence in `CR_001C_MODULE_BREAKDOWN_PLAN.md`:

1. CR-001C-L (Loyalty) — in progress
2. CR-001C-C (Coupons) — starts after CR-001C-L closes
3. CR-001C-W (Wallet) — after CR-001C-C
4. CR-001C-V (Visibility) — after CR-001C-W + CR-001A Phase 2 live

Coupon work — including BUG-108 §3.1 + §3.2 + the per-customer entitlement model — opens at CR-001C-C Stage A. POS team will receive a similar API handoff doc for coupons once that module reaches its Stage E.

### What POS can do in the meantime

- Continue using the existing query-string `POST /api/pos/coupons/validate` for ad-hoc validation if needed.
- Do NOT start consuming a `GET /pos/coupons/available` endpoint; it does not exist.

---

## 8. Wallet & Redemption — Deferred

### 8.1 Wallet — CR-001C-W

Wallet **read fields** (`wallet_balance`) are already returned at top level by all relevant POS endpoints (customer-search, customer-lookup, customer-detail). LX-A does not change this; no work needed for POS to display the wallet balance today.

Wallet **write paths** (`POST /pos/wallet/debit`, `POST /pos/wallet/credit`, `POST /pos/wallet/reverse`) → **CR-001C-W** (Wallet module). Out of scope for LX-A.

### 8.2 Loyalty redemption — Future redemption CR

Per BUG-108 §4 and owner sign-off:

| Deferred endpoint | Reason |
|---|---|
| `POST /pos/loyalty/redeem` | Q4 — deferred to future redemption CR |
| `POST /pos/loyalty/reverse` | Q5 — no reversal needed |
| `POST /pos/coupons/redeem` | Q4/Q5 — deferred |
| `POST /pos/coupons/reverse` | Q5 — not needed |
| `POST /pos/wallet/debit` | Q4 — deferred |
| `POST /pos/wallet/credit` (refund) | Q5 — not needed |
| `POST /pos/wallet/reverse` | Q5 — not needed |

These will be addressed in a separate future Change Request after CR-001C closes. POS team will receive a dedicated API inventory + handoff doc for the redemption phase at that time.

---

## 9. QA Evidence & Status

> **✅ COMPLETE — LX-A implemented, static QA + read-only smoke passed on 2026-05-23.**
> Full reports:
> - Implementation: `/app/memory/crm/crm_1_0/implementation/CR_001C_LX_A_IMPLEMENTATION_REPORT.md`
> - QA: `/app/memory/crm/crm_1_0/qa/CR_001C_LX_A_QA_REPORT.md`

### 9.1 Static QA harness (`/tmp/cr_001c_lx_a_static_qa.py`)

- **File:** `/tmp/cr_001c_lx_a_static_qa.py`
- **Total assertions:** 63 (plan target ~51)
- **Passed:** 63
- **Failed:** 0
- **Coverage matrix:** see `CR_001C_LX_A_IMPLEMENTATION_PLAN.md` §6.1 (expanded to 16 sections; matrix matches plan rows QA-1 → QA-15 plus QA-16 = direct helper isolation)

### 9.2 Live read-only smoke (preview Mongo, restaurant `18march`)

> Plan named R689; in the running preprod data the comparable readiness
> profile is restaurant `18march` (`pos_0001_restaurant_478`). Smoke
> executed there.

- **GET `/api/pos/customers/{custA}`** — strict 6-key `loyalty` blob, top-level customer fields preserved: ✅ PASS
- **GET `/api/pos/customers/{custA}/loyalty`** — strict 6-key payload, no `total_visits` / `total_spent`: ✅ PASS
- **POST `/api/pos/customer-lookup`** (`phone=9742526341`) — flat lookup shape unchanged vs pre-LX; tier-aware `points_value`: ✅ PASS
- **Per-tier override test** — set `bronze_redemption_value=1.5` → re-fetch `/loyalty` → `ratio_per_point=1.5`, `points_value=192.0` (= 128 × 1.5); reverted; re-fetch returns `ratio_per_point=0.25` (restaurant-level fallback): ✅ PASS
- **Mutation discipline** — only `loyalty_settings.bronze_redemption_value` touched then reverted; no customer / order / `points_transactions` / `wallet_transactions` writes: ✅ PASS

### 9.3 Lint + service health

- `ruff check` on the 4 touched files: ✅ 0 new findings
- `GET /api/health` after backend restart: ✅ HTTP 200, `{"status":"healthy", …}`

### 9.4 Regression smoke

- `core.loyalty.calculate_points` + `calculate_tier` outputs match L3 inputs: ✅ PASS (QA-15 in harness)
- `git diff --name-only HEAD` shows exactly 4 files modified: ✅ PASS — `backend/{core/helpers.py, core/loyalty.py, models/schemas.py, routers/pos.py}`

### 9.5 Status POS can rely on

**Current:**

> **Status: `cr001c_lx_a_loyalty_pos_contract_patched_qa_passed_in_preview`**
> Endpoint contracts above are live on the CRM preview pod. **POS may consume in preview.**

After prod deploy (in the joint batch with CR-001A Phase 2 + CR-001D, per D5):

> **Status: `cr001c_lx_a_live_in_prod_in_joint_batch`**
> POS may consume in production.

---

## 10. Open Items POS Team Should Be Aware Of

| Item | Notes |
|---|---|
| Admin UI for per-tier values | Not in LX-A. A tiny frontend follow-up is planned at CR-001C-L close-out. Until then, owner sets values via `PATCH /api/loyalty-settings`. |
| `tier_label` customization | Today derived as `"{tier} Member"`. If POS wants owner-configurable labels (e.g. `"VIP Gold"`), open a tiny follow-up CR; CRM will add 4 settings fields and the helper. |
| `next_tier` / `points_to_next_tier` (removed) | If POS needs tier-progress UI (e.g. "20 more points to Silver"), open a request and CRM will add them back as additional keys in a future LX iteration. They are NOT in the BUG-108 §3.3 contract today. |
| Real owner-triggered migration validation | Pending. Will run on the preview pod after LX-A is live; sample loyalty blobs for real R689 customers will be added to §5.3 of `CR_001C_LX_POS_BUG_108_API_INVENTORY_FOR_CRM_2026_05_22.md` Out-of-Band Asks (item §5.1). |
| Coupon handoff | Will follow as a separate document `handoff/CR_001C_C_POS_BUG_108_COUPON_API_HANDOFF_TO_POS.md` when CR-001C-C Stage E closes. |

---

## 11. Single Source of Truth — Pointer Table

| Topic | Where to look |
|---|---|
| Endpoint contract | This doc, §2 + §3 |
| Sample responses | This doc, §4 |
| Fallback behavior | This doc, §5 |
| What's deferred and why | This doc, §7 + §8 |
| CRM-side implementation detail | `CR_001C_LX_A_IMPLEMENTATION_PLAN.md` |
| CRM-side bridge plan rationale | `CR_001C_LX_POS_BUG_108_API_CONTRACT_ALIGNMENT_PLAN.md` |
| POS team's original inventory | `POS3_0_BUG_108_API_INVENTORY_FOR_CRM_2026_05_22.md` |
| CRM module breakdown / sequencing | `CR_001C_MODULE_BREAKDOWN_PLAN.md` |
| L1/L2/L3 close-out evidence | `implementation/CR_001C_L_LOYALTY_L3_IMPLEMENTATION_REPORT.md`, `qa/CR_001C_L_LOYALTY_L3_QA_REPORT.md` |

---

## 12. Sign-off Block

**CRM Team — LX-A delivery:**
- Implementation: ✅ COMPLETE (2026-05-23) — see `implementation/CR_001C_LX_A_IMPLEMENTATION_REPORT.md`
- Static QA: ✅ 63 / 63 PASS
- `18march` smoke: ✅ 5 / 5 PASS (R689 substituted because `18march` has the comparable readiness profile in current preprod data)
- This handoff doc finalized: ✅ Banner flipped to GREEN-LIGHT 2026-05-23

**POS Team — acknowledgment of consumed contract:**
- Reviewed §2 + §3 + §4 + §5: ☐
- Confirmed no code reads removed keys (§3 last subsection): ☐
- Acknowledged §7 (coupon deferral) and §8 (wallet + redemption deferral): ☐
- Ready to consume endpoints in preview after banner flips to GREEN-LIGHT: ☐

---

**End of POS handoff (DRAFT).**

> Once LX-A is implemented and QA passes, CRM team will:
> 1. Replace every "_TBD_" in §9 with concrete results.
> 2. Flip the banner at the top of this document to GREEN-LIGHT.
> 3. Notify POS team in the standing channel that they may begin consuming the 3 endpoints listed in §2.
