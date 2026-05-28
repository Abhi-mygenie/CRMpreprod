# CR-001C-C — Coupon Scrap vs Keep Architecture Decision

**Module:** CR-001C-C (Coupon) — architecture decision
**Date:** 2026-05-24
**Status:** `cr001c_coupon_scrap_vs_keep_decision_option_b_hybrid_rebuild_recommended`
**Author:** CRM Team
**Prerequisite:** Capability audit `cr001c_coupon_existing_system_capability_audit_complete_waiting_owner_decisions`

---

## 1. Executive Summary

**Decision: Option B — Keep skeleton, rebuild POS contract and coupon engine.**

The existing coupon system has a sound foundation (collection names, admin CRUD used by frontend, correct flat/percentage math, usage tracking schema) but the POS-facing contract is misaligned with BUG-108 requirements. All three coupon collections are **empty in preprod** — zero data migration risk for any option. The admin frontend CouponsPage actively calls `/api/coupons` CRUD — breaking this would be gratuitous churn.

Option B preserves what works (admin CRUD, collection names, basic discount math) while building fresh POS endpoints (`/pos/coupons/available`, reshaped `/pos/coupons/validate`), a central coupon validation service, structured error codes, and a forward-compatible schema that can grow to support item-level/BOGO/happy-hour in later phases.

---

## 2. Inputs Reviewed

| # | Source | Status |
|---|---|---|
| 1 | `/app/memory/PRD.md` | Read |
| 2 | `/app/memory/crm/crm_1_0/planning/CR_001_INDEX.md` | Read |
| 3 | `/app/memory/crm/crm_1_0/planning/CR_001C_C_COUPON_EXISTING_SYSTEM_CAPABILITY_AUDIT.md` (375 lines) | Full read |
| 4 | `backend/routers/coupons.py` (238 lines) | Full read |
| 5 | `backend/routers/pos.py` — POS coupon endpoints (lines 2400-2476) | Full read |
| 6 | `backend/routers/pos.py` — order webhook coupon fields (lines 1145-1149, 1440-1454) | Inspected |
| 7 | `backend/routers/pos.py` — payment webhook coupon logic (lines 1625-1657) | Inspected |
| 8 | `backend/routers/scan.py` — customer-facing coupons (lines 545-566) | Full read |
| 9 | `backend/models/schemas.py` — Coupon/CouponCreate/CouponUpdate/CouponUsage (lines 460-518) | Full read |
| 10 | `backend/services/analytics_service.py` — coupon_stats (reads `coupon_transactions`) | Inspected |
| 11 | `backend/routers/customers.py` — coupon fields on customer docs | Inspected |
| 12 | `backend/routers/feedback.py` — dashboard coupon stats | Inspected |
| 13 | `frontend/src/pages/CouponsPage.jsx` — admin UI coupon CRUD | Confirmed active usage |
| 14 | `frontend/src/components/ResponsiveLayout.jsx` — sidebar coupon link | Confirmed |
| 15 | MongoDB collections: `coupons` (0), `coupon_usage` (0), `coupon_transactions` (0) | Queried |

---

## 3. Current Coupon System Snapshot

### Collections

| Collection | Docs | Purpose | Usable? |
|---|---:|---|---|
| `coupons` | 0 | Coupon definitions | YES — schema is sound for order-level, extensible |
| `coupon_usage` | 0 | Per-customer usage tracking | YES — needs `order_id` field addition |
| `coupon_transactions` | 0 | Migration-synced historical data | ORPHAN — analytics reads it, but real-time writes to `coupon_usage`. Must unify. |

### Endpoints (12 total)

- 9 admin endpoints (`/api/coupons/*`) — used by frontend CouponsPage
- 2 POS endpoints (`/api/pos/coupons/validate`, `/api/pos/coupons/apply`) — query-param contract, no error codes
- 1 customer-facing (`/api/scan/coupons`) — wrong router for POS use

### Supported types

- ORDER_FLAT: partially (logic correct, contract wrong)
- ORDER_PERCENTAGE: partially (logic correct, contract wrong)
- Everything else: not supported

### Key gaps

- `GET /pos/coupons/available` does not exist
- Validate uses query params, not JSON body
- No structured `error.code` values
- No `coupon_type` discriminator field
- No item/category/BOGO/happy-hour fields
- Final order does not re-validate or record usage
- Analytics reads different collection from real-time writes

---

## 4. Option A — Keep Existing As-Is

### Benefits
- Zero development effort
- No risk of breaking admin frontend

### Risks
- POS BUG-108 coupon integration **completely blocked** — no available endpoint, wrong validate contract, no error codes
- Cannot support any advanced coupon type
- Analytics/usage mismatch persists
- Stagnation — every future coupon requirement requires ad-hoc patches

### Blockers
- `GET /pos/coupons/available` does not exist
- Validate contract mismatch (query params vs JSON body)
- No structured error codes

### Verdict: **REJECTED.** Existing system cannot serve POS BUG-108 requirements without modification. Keeping it as-is provides zero forward progress.

---

## 5. Option B — Keep Skeleton, Rebuild Contract and Engine

### Benefits
- Preserves admin frontend compatibility (CouponsPage still works)
- Preserves collection names (zero data migration since collections are empty)
- Reuses correct flat/percentage math concepts
- Adds POS-ready endpoints with proper contract
- Creates central coupon service for shared logic (admin + POS + scan)
- Schema can be extended forward-compatibly for advanced types
- Lowest risk/effort ratio

### Risks
- Two validate paths temporarily (old query-param admin + new JSON-body POS) — manageable via shared service
- Must ensure old admin frontend still works after schema additions

### What to keep
- `coupons` collection name and existing document field set (all existing fields stay)
- `coupon_usage` collection name
- Admin CRUD endpoints (`/api/coupons/*`) — keep working as-is for frontend
- Flat/percentage discount concepts (`discount_type`, `discount_value`, `min_order_value`, `max_discount`)
- Per-customer usage tracking (`per_user_limit`, `usage_limit`, `total_used`)
- `specific_users` customer targeting
- `applicable_channels` channel eligibility
- Date range (`start_date`, `end_date`)
- `is_active` toggle
- Pydantic models (`Coupon`, `CouponCreate`, `CouponUpdate`, `CouponUsage`)

### What to rebuild
- **New POS endpoints:**
  - `GET /api/pos/coupons/available` — POS auth, customer_id + order_total, returns eligible list
  - `POST /api/pos/coupons/validate` — JSON body contract, structured `error.code`, computed discount
- **Central coupon validation service** (`core/coupon_service.py` or similar) — shared logic for admin, POS, scan, and final-order paths
- **Structured error codes** — `INVALID_CODE`, `EXPIRED`, `INACTIVE`, `MIN_ORDER_NOT_MET`, `USAGE_LIMIT_REACHED`, `CUSTOMER_NOT_ELIGIBLE`, `CHANNEL_NOT_VALID`
- **Schema additions** (forward-only, optional fields):
  - `coupon_type: str = "order"` — discriminator for future item/category/BOGO
  - `order_id` on `coupon_usage` — link usage to specific order
  - Additional fields as advanced types are added (C2-C4 phases)
- **Final order coupon usage recording** — record at `/pos/orders` time, not at `/coupons/apply` time
- **Analytics alignment** — make analytics read `coupon_usage` (real-time canonical) instead of / in addition to `coupon_transactions`

### What to deprecate
- Old POS validate query-param contract (`POST /api/pos/coupons/validate` with `code`, `customer_id`, `order_value`, `channel` as query params) — mark as legacy, redirect through shared service internally
- Old POS apply endpoint — merge functionality into final-order recording path
- Payment webhook inline coupon logic (lines 1625-1657) — route through shared service
- `coupon_transactions` collection — mark as migration-only legacy; real-time canonical is `coupon_usage`

### Verdict: **RECOMMENDED.** Best balance of effort, compatibility, and forward progress.

---

## 6. Option C — Full Scrap/Delete and Rebuild

### Benefits
- Clean slate — no legacy code to work around
- Ideal schema from day one

### Risks
- **Breaks admin frontend** — CouponsPage calls `/api/coupons` for CRUD; deleting `coupons.py` breaks the dashboard
- Requires rewriting 238 lines of working admin CRUD + Pydantic models
- Requires rewriting scan router coupons endpoint
- More effort than Option B for the same outcome
- Collections are already empty — no data to "clean up"

### Data/compatibility concerns
- Frontend `CouponsPage.jsx` calls `api.get("/coupons")`, `api.post("/coupons", ...)`, `api.put("/coupons/{id}", ...)`, `api.delete("/coupons/{id}")` — all would break
- `ResponsiveLayout.jsx` has sidebar link to `/coupons` — route would 404
- `routers/customers.py` references `total_coupon_used` customer field — would need update
- `routers/feedback.py` + `services/analytics_service.py` call `get_coupon_stats` — would break

### Verdict: **REJECTED.** Excessive breakage for zero incremental benefit over Option B. Collections are empty — there is nothing to "scrap" at the data layer. The working admin CRUD should be preserved.

---

## 7. Collection Decision

| Collection | Decision | Reason | Migration/Data Risk |
|---|---|---|---|
| `coupons` | **KEEP** — extend schema forward-only | Sound field set. Empty (0 docs). Admin frontend depends on it. Add `coupon_type` and future fields as Optional. | ZERO — empty collection |
| `coupon_usage` | **KEEP** — add `order_id` field | Core usage tracking concept is correct. Needs order linkage for final-order recording. | ZERO — empty collection |
| `coupon_transactions` | **DEPRECATE** — mark migration-only legacy | Only written by migration code. Analytics should be redirected to read `coupon_usage` instead. Do not delete (migration may write to it again). | ZERO — empty collection. Migration code still writes to it; do not break migration. |

---

## 8. Endpoint Decision

| Endpoint | Decision | Reason | POS Impact |
|---|---|---|---|
| `POST /api/coupons` (admin create) | **KEEP** | Frontend CouponsPage uses it | None — admin only |
| `GET /api/coupons` (admin list) | **KEEP** | Frontend CouponsPage uses it | None |
| `GET /api/coupons/{id}` (admin get) | **KEEP** | Frontend uses it | None |
| `PUT /api/coupons/{id}` (admin update) | **KEEP** | Frontend uses it | None |
| `DELETE /api/coupons/{id}` (admin delete) | **KEEP** | Frontend uses it | None |
| `POST /api/coupons/{id}/toggle` (admin toggle) | **KEEP** | Frontend uses it | None |
| `POST /api/coupons/validate` (admin validate) | **KEEP as legacy** | May be used by admin; redirect through shared service internally | None — admin only |
| `POST /api/coupons/apply` (admin apply) | **KEEP as legacy** | May be used by admin | None |
| `GET /api/coupons/{id}/usage` (admin usage) | **KEEP** | Useful for admin | None |
| `POST /api/pos/coupons/validate` (POS) | **REBUILD** — new JSON body contract, structured error codes, shared service | Current: query params + message strings. BUG-108 needs JSON body + error.code. | **HIGH** — POS must use new contract |
| `POST /api/pos/coupons/apply` (POS) | **DEPRECATE for POS** — merge into final-order flow | Usage should record at final order, not at apply-click | POS stops calling this; usage happens at `/pos/orders` |
| `GET /api/pos/coupons/available` | **BUILD NEW** | Does not exist. POS needs it for BUG-108. | **HIGH** — new endpoint |
| `GET /api/scan/coupons` (customer-facing) | **KEEP** — redirect through shared service | Works for customer app. Keep separate auth. | None |
| `/api/pos/orders` coupon fields | **ENHANCE** — add re-validation + usage recording at final order time | Currently passthrough only | POS benefits from server-side validation |
| `/api/pos/webhook/payment-received` coupon logic | **REBUILD** — route through shared service | Currently inline duplicate logic | None — legacy path |

---

## 9. Coupon Engine Decision

**Build a central coupon service** (`core/coupon_service.py` or add to `core/coupon.py` following the loyalty pattern):

| Component | Decision |
|---|---|
| **Shared validation function** | BUILD — `validate_coupon(db, user_id, coupon_code, customer, order_value, channel, items=None)` returns structured result with `error.code` or computed discount |
| **Shared available-coupons function** | BUILD — `get_available_coupons(db, user_id, customer, order_value)` returns filtered eligible list |
| **Shared usage-recording function** | BUILD — `record_coupon_usage(db, coupon_id, customer_id, order_id, discount_applied, channel)` with dedup guard |
| Route-level logic in coupons.py | KEEP for admin — redirect through shared service |
| Route-level logic in pos.py | REBUILD — thin wrapper calling shared service |
| Inline logic in payment webhook | REPLACE — call shared service |
| Rule-based schema for advanced types | POSTPONE to C2-C4 — V1 is order-level only |
| `coupon_type` discriminator | ADD in V1 as `Optional[str] = "order"` — forward-compatible |

---

## 10. POS BUG-108 Impact

| Question | Answer |
|---|---|
| Can POS use current coupon system as-is? | **NO** — contract mismatch (query params, no error codes, no available endpoint) |
| What new POS APIs are needed? | `GET /pos/coupons/available` (new) + `POST /pos/coupons/validate` (rebuilt with JSON body + error.code) |
| What coupon types can POS use first? | ORDER_FLAT + ORDER_PERCENTAGE with min_order, max_discount, customer targeting, usage limits |
| What coupon types need future POS cart support? | ITEM_LEVEL, BOGO, FREE_ITEM, BUY_X_GET_Y, EVERY_NTH — all require POS to send `items[]` and/or manipulate cart |

---

## 11. Recommended Coupon V1 Scope

### Include in V1

| Feature | Effort | Notes |
|---|---|---|
| `GET /api/pos/coupons/available` | NEW | POS auth, customer_id + order_total, returns eligible list |
| `POST /api/pos/coupons/validate` (JSON body) | REBUILD | Structured error.code, computed discount |
| ORDER_FLAT | EXISTING | `discount_type="flat"` already in schema |
| ORDER_PERCENTAGE | EXISTING | `discount_type="percentage"` already in schema |
| `min_order_value` enforcement | EXISTING | Already validated |
| `max_discount` cap | EXISTING | Already applied for percentage |
| `is_active` / date range | EXISTING | Already checked |
| `per_user_limit` / `usage_limit` | EXISTING | Already enforced |
| `specific_users` targeting | EXISTING | Already checked |
| `applicable_channels` | EXISTING | Already checked |
| Structured error codes | NEW | `INVALID_CODE`, `EXPIRED`, `INACTIVE`, `MIN_ORDER_NOT_MET`, `USAGE_LIMIT_REACHED`, `CUSTOMER_NOT_ELIGIBLE`, `CHANNEL_NOT_VALID` |
| `coupon_type: "order"` field | NEW (forward-only) | Added to schema as Optional, default "order" |
| Central coupon service | NEW | Shared validation + available-list logic |
| Final order usage recording | NEW | Record `coupon_usage` with `order_id` at `/pos/orders` time |
| Analytics alignment | PATCH | Make `get_coupon_stats` read `coupon_usage` too |

### Postpone to V2+

| Feature | Phase | Reason |
|---|---|---|
| ITEM_FLAT / ITEM_PERCENTAGE | C2 | Needs `applicable_items[]`, item-aware engine, POS sends `items[]` |
| CATEGORY_FLAT / CATEGORY_PERCENTAGE | C2 | Needs `applicable_categories[]`, category resolution |
| FREE_ITEM | C3 | Needs POS cart integration or instruction display |
| BOGO / BUY_X_GET_Y | C3 | Needs item matching, POS cart manipulation |
| EVERY_NTH_ITEM_FREE | C3 | Needs per-customer-per-item frequency counter |
| HAPPY_HOUR / TIME_WINDOW | C4 | Needs time-window fields, restaurant timezone |
| FIRST_ORDER | V1 stretch or V2 | Simple flag + `total_visits` check — low effort |
| LOYALTY_TIER_BASED | V1 stretch or V2 | Simple `tier_required` field + tier check — low effort |
| BIRTHDAY / ANNIVERSARY | V2 | Date-window check (pattern exists in loyalty) |
| WIN_BACK | V2 | `inactive_days` + last_visit check |
| CAMPAIGN_COUPON | V2 | `campaign_id` linkage |
| WALLET_CASHBACK | CR-001C-W | Wallet dependency |
| REFERRAL_COUPON | Future CR | Referral engine needed |

---

## 12. Owner Decisions Required Next

### V1 Scope

1. **Confirm V1 = ORDER_FLAT + ORDER_PERCENTAGE only?**
   - a. Yes, minimal V1 (recommended)
   - b. Also include FIRST_ORDER + TIER_BASED (low-effort add-ons)
   - c. Also include ITEM_LEVEL + CATEGORY (medium effort, needs POS items[])

### Stacking

2. **Can coupon + loyalty points stack on the same order?**
   - a. Yes, both allowed (current behavior, recommended for V1)
   - b. No, mutually exclusive
   - c. Configurable per restaurant

3. **Discount application order when stacked?**
   - a. Coupon first, then loyalty, then wallet (recommended)
   - b. Owner-configurable order

### Final Order

4. **Record coupon usage at final order time only?**
   - a. Yes, record only when `/pos/orders` payload arrives (recommended — prevents phantom usage on cancelled orders)
   - b. Keep current: record at `/coupons/apply` time

5. **Should CRM re-validate coupon at final order time?**
   - a. Yes, re-validate code + limits (recommended)
   - b. No, trust POS passthrough

### Tax

6. **Coupon discount applies to?**
   - a. Subtotal before tax (recommended)
   - b. Total after tax
   - c. Configurable

---

## 13. Final Architecture Decision

`Decision: Option B — Keep skeleton, rebuild POS contract and coupon engine`

**Keep:** `coupons` + `coupon_usage` collections, admin CRUD endpoints, flat/percentage discount concepts, Pydantic models, frontend compatibility.

**Rebuild:** POS coupon endpoints (available + validate with JSON body + error codes), central coupon validation service, final-order usage recording, analytics alignment.

**Deprecate:** POS `/coupons/apply` (merge into final-order flow), payment webhook inline coupon logic (route through service), `coupon_transactions` as real-time canonical (mark migration-only).

**Do not build yet:** Item-level, BOGO, free-item, happy-hour, wallet cashback, referral, combo types.

---

## 14. Final Status

`cr001c_coupon_scrap_vs_keep_decision_option_b_hybrid_rebuild_recommended`

Architecture decision is locked. Coupon V1 implementation may begin once owner confirms the 6 decisions in section 12. No code, DB, or env changes were made.
