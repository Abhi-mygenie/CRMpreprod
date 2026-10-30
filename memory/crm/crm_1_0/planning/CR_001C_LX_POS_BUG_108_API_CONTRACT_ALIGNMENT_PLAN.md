# CR-001C-LX — POS BUG-108 API Contract Alignment Plan

**Module:** CR-001C-L (Loyalty) — bridge phase **LX** between **L3** and **L4**
**Date:** 2026-05-22
**Mode:** Planning only — no code, no DB, no env, no migration, no deploy.
**Trigger:** POS 3.0 team published BUG-108 API Inventory (2026-05-22) before CR-001C-L Phase L4 began.
**Status target:** `cr001c_lx_bug108_api_contract_alignment_waiting_owner_decision`

---

## 1. Executive Summary

POS BUG-108 needs **read-only support** from CRM for:
1. Customer-available coupon catalog (`GET /pos/coupons/available`) — **does NOT exist** in CRM.
2. Coupon validation (`POST /pos/coupons/validate`) — **already exists** in CRM (`backend/routers/pos.py:2335`) but with a query-string contract; shape does not match the BUG-108 proposal.
3. Loyalty **tier → redemption ratio** so POS stops hardcoding 1:1. POS prefers extending `GET /pos/customers/{id}` (Option A). Today's CRM loyalty blob exposes `redemption_value_per_point` (a **restaurant-level** value), **NOT** the `ratio_per_point` the POS team is asking for. Per-tier redemption ratio is **not stored anywhere** in `LoyaltySettings`.

**Recommendation:** **Pause CR-001C-L Phase L4** for a small, well-scoped LX patch that does **two things only**:

   a. Adds `ratio_per_point`, `tier_label`, and `points_value` fields to the existing `loyalty` blob in `GET /pos/customers/{id}` and `POST /pos/customer-lookup` (Option A). No new endpoint.
   b. Adds the missing per-tier ratio settings to `LoyaltySettings` (`bronze_redemption_value`, `silver_redemption_value`, `gold_redemption_value`, `platinum_redemption_value`) with default values that match the current single-value `redemption_value` so behavior stays identical until owner sets per-tier values.

Coupon (`/pos/coupons/available`, contract-aligned `/pos/coupons/validate`) and Wallet read-shape audits remain owned by **CR-001C-C** and **CR-001C-W** respectively and **are not opened here**. The redemption / debit / reversal lifecycle stays deferred to the future CR.

After LX is approved and merged in preview, L4 (manual redeem `$inc` parity + birthday/anniversary cron `$inc` parity) resumes unchanged.

---

## 2. Inputs Reviewed

### Memory docs
1. `/app/memory/PRD.md`
2. `/app/memory/crm/crm_1_0/planning/CR_001C_MODULE_BREAKDOWN_PLAN.md`
3. `/app/memory/crm/crm_1_0/planning/CR_001C_L_LOYALTY_SCOPE_LOCK.md`
4. `/app/memory/crm/crm_1_0/implementation/CR_001C_L_LOYALTY_L3_IMPLEMENTATION_REPORT.md`
5. `/app/memory/crm/crm_1_0/qa/CR_001C_L_LOYALTY_L3_QA_REPORT.md`
6. `/app/memory/crm/crm_1_0/planning/POS3_0_BUG_108_API_INVENTORY_FOR_CRM_2026_05_22.md`

### Code (read-only inspection)
- `backend/routers/pos.py` — endpoints `POST /pos/customers` (L:201), `POST /pos/customer-lookup` (L:1682), `GET /pos/customers` (L:1980), `GET /pos/customers/{id}` (L:2017), `GET /pos/customers/{id}/loyalty` (L:2296), `POST /pos/coupons/validate` (L:2335), `POST /pos/coupons/apply` (L:2379), `POST /pos/address-lookup` (L:2238).
- `backend/routers/customers.py` — no read endpoints relevant to POS contract; migration/sync logic only.
- `backend/routers/coupons.py` — admin CRUD + admin-auth `POST /api/coupons/validate` (L:103); no per-customer "available" listing.
- `backend/models/schemas.py` — `LoyaltySettings` (L:577), `LoyaltySettingsUpdate` (L:630), `Coupon` (L:490). Confirmed: **no per-tier `*_redemption_value`**; only restaurant-level `redemption_value: float = 1.0` (L:590).
- `backend/core/loyalty.py` — pure helpers `calculate_points` / `calculate_tier`; no monetary-value helper.
- `backend/core/helpers.py` — `get_earn_percent_for_tier(...)`; **no `get_redemption_value_for_tier(...)`** helper yet.

### Modules NOT inspected (per ownership rule)
Wallet write-path internals, analytics services, dashboard, WhatsApp, scheduler, feedback, auth, frontend — left intentionally untouched at this planning stage.

---

## 3. Current Completed Loyalty State

Current working status used in this plan:
**`cr001c_loyalty_l3_controlled_qa_passed_real_migration_validation_pending`**

> The existing L3 reports record status as **`cr001c_loyalty_l3_migration_parity_qa_passed`**
> (see `implementation/CR_001C_L_LOYALTY_L3_IMPLEMENTATION_REPORT.md` §8 and
> `qa/CR_001C_L_LOYALTY_L3_QA_REPORT.md` §7).
>
> **Interpretation:** the old L3 docs prove static QA (62/62) + controlled
> migration QA (55/55 — real Mongo, mocked httpx, R689) passed. Those
> reports are **not being rewritten**. For the continuation planning,
> we adopt the more precise status because **real owner-triggered
> migration validation on a real restaurant is still pending**, and that
> distinction matters for sequencing LX + L4.

### What is locked-in from L1+L2+L3

| Phase | Shipped | Evidence |
|---|---|---|
| **L1** | `core/loyalty.py` — `calculate_points` + `calculate_tier` shared helper | Scope-lock §5 |
| **L2** | Realtime POS kill-switch via `loyalty_enabled`; `$inc total_points_earned` on realtime; first-visit-bonus init; defensive counter init on POS-create (`pos.py:258-263`) | Scope-lock §2; L3 report §2 |
| **L3** | Migration parity via `core.loyalty` helpers; `loyalty_clean_slate_recalc` flag (`schemas.py:602`); D2 hard-block on missing `loyalty_settings`; D1 expired pre-mark; re-sync dedup; C11 allow-list re-sync safety | L3 implementation report §2; L3 QA report 117/117 |

### What is NOT yet done (and is not reopened by LX)

- **L4** — manual redeem (`routers/points.py::create_points_transaction`) + birthday/anniversary cron (`core/loyalty_jobs.py`) `$inc` parity.
- **L5** — dead-code removal (`_calculate_points` wrapper, `pos_payment_received` legacy endpoint).
- **Real owner-triggered migration validation** on a real preprod restaurant (mocked httpx during L3 controlled QA; live MyGenie call has not happened yet).
- Coupon module (CR-001C-C), Wallet module (CR-001C-W), Visibility (CR-001C-V), `/app/memory/final/`.

LX does **not** reopen any of the above. LX only adds POS-facing **read fields** in two existing endpoints + a per-tier settings extension.

---

## 4. POS BUG-108 Requirement Classification

| # | Requirement (BUG-108) | POS Needs | Current CRM Status | Owner Module | Action in This CR (LX) |
|---|---|---|---|---|---|
| 1 | `GET /pos/customers?search=` | `wallet_balance`, `total_points`, `tier`, `name`, `phone`, `last_visit` | ✅ Already returns all six (`pos.py:2003`) | Loyalty (read-only) | **No change** |
| 2 | `POST /pos/customer-lookup` returns `points_value` | tier-based monetary value of points | ⚠️ Returns `points_value` but as `total_points * redemption_value` (**restaurant-level**, not tier-based) | Loyalty | **Patch in LX** — switch to per-tier `ratio_per_point` and recompute |
| 3 | `GET /pos/customers/{id}` returns a `loyalty` blob | `tier`, `tier_label`, `total_points`, `ratio_per_point`, `points_value`, `loyalty_enabled` | ⚠️ Returns a `loyalty` blob today (`pos.py:2048-2057`) but field names + content differ; uses restaurant-level `redemption_value_per_point` (not `ratio_per_point`), no `tier_label`, no explicit `loyalty_enabled` flag | Loyalty | **Patch in LX** — extend blob with required fields (Option A) |
| 4 | `POST /pos/customers` initializes loyalty counters | `total_points=0`, `total_points_earned=0`, `total_points_redeemed=0`, `wallet_balance=0`, `tier="Bronze"` | ✅ Already initialized correctly post-L2 (`pos.py:258-264`) | Loyalty | **No change** |
| 5 | `GET /pos/coupons/available` (new) | Per-customer eligible coupon catalog | ❌ Endpoint does not exist | **Coupons (CR-001C-C)** | **Defer — out of LX scope** |
| 6 | `POST /pos/coupons/validate` (new contract) | JSON body `{customer_id, coupon_code, order_total, restaurant_id}`; `data.computed_discount_amount`; structured `error.code` taxonomy | ⚠️ Endpoint exists (`pos.py:2335`) but uses query-string args (`code`, `customer_id`, `order_value`, `channel`) and returns flat error messages, not coded errors | **Coupons (CR-001C-C)** | **Defer — out of LX scope.** Existing endpoint stays as-is for non-BUG-108 callers. |
| 7 | Per-tier `ratio_per_point` configuration | Stored per-tier on a per-restaurant basis | ❌ `LoyaltySettings` stores only restaurant-level `redemption_value: float` (no `bronze_redemption_value` etc.) | Loyalty | **Patch in LX** — add 4 per-tier fields + helper |
| 8 | Wallet read fields in customer responses | `wallet_balance` | ✅ Already returned (search, lookup, detail, loyalty-summary endpoints) | **Wallet (CR-001C-W)** | **Audit only — no change in LX** |
| 9 | Wallet debit/credit/reverse, loyalty redeem/reverse, coupon redeem/reverse | All 7 endpoints in BUG-108 §4 | ❌ Out of scope per owner sign-off | **Future redemption CR** | **Do not build** |

---

## 5. Existing POS Customer API Audit

Verified line-by-line against `backend/routers/pos.py` at this commit.

| # | Endpoint | File / Line | Current Returned Fields | Missing for BUG-108 | Required Action |
|---|---|---|---|---|---|
| 5.1 | `GET /pos/customers?search={q}&limit=` | `pos.py:1980` | `id`, `name`, `phone`, `tier`, `total_points`, `wallet_balance`, `last_visit` | none (matches §2.1) | None. Keep verbatim. |
| 5.2 | `POST /pos/customer-lookup` | `pos.py:1682` | `registered`, `customer_id`, `name`, `phone`, `tier`, `total_points`, **`points_value` (computed from restaurant-level `redemption_value`)**, `wallet_balance`, `total_visits`, `total_spent`, `allergies`, `favorites`, `last_visit`, `addresses` | `points_value` is **not tier-based** today | **LX:** switch `points_value` to `total_points * get_redemption_value_for_tier(tier, settings)`. No new field. |
| 5.3 | `GET /pos/customers/{id}` | `pos.py:2017` | full customer doc + computed `loyalty` blob: `total_points`, `points_monetary_value`, `tier`, `next_tier`, `points_to_next_tier`, `wallet_balance`, `earn_rate_percent`, `redemption_value_per_point`; `recent_orders`; `addresses` | `tier_label`, `ratio_per_point`, `points_value`, `loyalty_enabled` | **LX:** extend the `loyalty` blob with the 4 missing keys. **Keep existing keys verbatim** so today's consumers do not break (additive only). |
| 5.4 | `POST /pos/customers` | `pos.py:201` | Creates customer with `total_points=0`, `total_points_earned=0`, `total_points_redeemed=0`, `wallet_balance=0.0`, `tier="Bronze"` | none | None. L2 already correct. |
| 5.5 | `PUT /pos/customers/{id}` | `pos.py:358` | (not inspected in detail — does not touch loyalty counters) | n/a for BUG-108 | None. |
| 5.6 | `POST /pos/address-lookup` | `pos.py:2238` | address-only response | n/a for BUG-108 | None. |
| 5.7 | `GET /pos/customers/{id}/loyalty` | `pos.py:2296` | Same loyalty-blob shape as `GET /pos/customers/{id}` | Same gaps as 5.3 | **LX:** same extension applied here too (single source of truth — share a helper). |
| 5.8 | `POST /pos/coupons/validate` | `pos.py:2335` | Query-arg contract; returns flat `message` strings; success returns `code, discount, final_amount, discount_type, discount_value` | Body contract + `computed_discount_amount` + coded `error.code` taxonomy | **Defer to CR-001C-C.** Do not modify in LX. |

---

## 6. Loyalty Ratio Contract Decision — Option A vs B

### Option A — Extend existing `GET /pos/customers/{id}` (+ `POST /pos/customer-lookup`)

**Pros**
- POS frontend's stated preference (BUG-108 §3.3) — "Option A is preferred because it avoids an extra round-trip."
- Customer-detail load already carries the right context (tier, total_points, settings join).
- Additive only — no breaking changes to existing field names.
- Per-customer correctness: if a customer's tier evolved on the last order, the next POS load gets the right ratio without a separate config fetch.

**Cons**
- Tier table not directly exposed. POS cannot pre-render a "all tier ratios" reference table from one call. (Not needed for BUG-108: POS only needs the ratio for the current customer.)

### Option B — New endpoint `GET /pos/loyalty/config?restaurant_id={id}`

**Pros**
- Exposes the full tier table (`Bronze/Silver/Gold/Platinum` ratios + `min_visits` or `min_points`).
- Cacheable client-side (one call per restaurant per session).

**Cons**
- Extra round-trip on every POS customer load (or POS must build a session cache layer).
- BUG-108 inventory explicitly says Option A is preferred.
- Adds a new endpoint surface that must be covered by tests, auth, restaurant-scoping.

### Recommendation — **Option A**

Reason: matches POS team's stated preference, additive (no breaking change), and per-customer accurate. We **also** keep the door open for Option B as a future enhancement if POS later needs a tier reference table (e.g., for "Upgrade to Gold to earn 1.5×" upsell tooltips). Option B is not built in LX.

---

## 7. Proposed Loyalty Blob Shape (Option A)

### 7.1 Where it appears

- `GET /pos/customers/{id}` response body, under top-level `loyalty` key.
- `POST /pos/customer-lookup` response body — `points_value` recalculated using the same per-tier helper (no shape change for the lookup response — only the value source changes).
- `GET /pos/customers/{id}/loyalty` response body — same loyalty blob (shared helper).

### 7.2 Proposed shape (additive — does not remove existing fields)

```json
{
  "loyalty": {
    "tier": "Gold",
    "tier_label": "Gold Member",
    "total_points": 480,
    "ratio_per_point": 1.5,
    "points_value": 720.0,
    "loyalty_enabled": true,

    "points_monetary_value": 720.0,
    "next_tier": "Platinum",
    "points_to_next_tier": 4520,
    "wallet_balance": 1200.0,
    "earn_rate_percent": 10.0,
    "redemption_value_per_point": 1.5
  }
}
```

The block above shows the **target shape**. Items above the blank line are **new** in LX; items below the blank line are **existing fields kept verbatim** so existing consumers do not regress.

### 7.3 Field definitions

| Field | Source | Calculation |
|---|---|---|
| `tier` | `customer.tier` | as-is (already correct after L1/L2/L3) |
| `tier_label` | derived | `f"{tier} Member"` if `tier` ∈ {Bronze, Silver, Gold, Platinum} else `tier` (fallback). Owner may override per restaurant later — out of LX. |
| `total_points` | `customer.total_points` | as-is |
| `ratio_per_point` | `loyalty_settings.{tier}_redemption_value` (NEW) | per-tier; see §7.4 |
| `points_value` | derived | `round(total_points * ratio_per_point, 2)` |
| `loyalty_enabled` | `loyalty_settings.loyalty_enabled` | kill-switch already in L1/L2 (Q-LOYALTY-1) |
| `points_monetary_value` | derived | **Identical** to `points_value` — kept as alias for backward compat with the current POS frontend until POS deprecates it |
| `next_tier`, `points_to_next_tier`, `wallet_balance`, `earn_rate_percent`, `redemption_value_per_point` | existing | unchanged from `pos.py:2049-2057` |

### 7.4 Where `ratio_per_point` comes from

`LoyaltySettings` today has a **single** `redemption_value: float = 1.0` (`schemas.py:590`). It is **restaurant-level**, not per-tier.

BUG-108 (§3.3) says owner has confirmed the ratio is **per-tier** on the Loyalty admin screen. CRM must therefore add four per-tier fields:

```
LoyaltySettings.bronze_redemption_value:   float = redemption_value  (default → mirrors current)
LoyaltySettings.silver_redemption_value:   float = redemption_value
LoyaltySettings.gold_redemption_value:     float = redemption_value
LoyaltySettings.platinum_redemption_value: float = redemption_value
```

Resolution helper (proposed name): `core.helpers.get_redemption_value_for_tier(tier, settings) -> float`. Identical pattern to existing `get_earn_percent_for_tier(...)`. **Note: this helper is proposed for LX; it is not yet implemented.**

Lookup order at request time:
1. If `loyalty_settings.{tier}_redemption_value` is present → use it.
2. Else fall back to `loyalty_settings.redemption_value` (restaurant-level).
3. Else default `0.25` (the current hardcoded fallback in `pos.py:2031`).

This guarantees **zero behavior change** for any restaurant that has not yet set per-tier values. Owner can flip per-tier values from the Loyalty admin page (UI change is **out of LX**; admin currently can set `redemption_value`, and we can defer the per-tier UI to a tiny follow-up frontend touch in CR-001C-L close-out).

> ⚠️ If owner clarifies that **`ratio_per_point` should mean something different** (e.g., points-per-rupee instead of rupees-per-point), the calculation formula reverses to `total_points / ratio_per_point`. Q-LX5 below pins this down.

### 7.5 What does NOT change

- `core/loyalty.py::calculate_points` — untouched (LX adds value-side math only, not earn-side).
- Migration order-sync — untouched (no new earn columns).
- `LoyaltySettingsUpdate` — adds 4 optional fields; no existing field removed.
- POS create / update / search / address-lookup / orders / events / max-redeemable endpoints — all untouched.
- Realtime POS write-path (`_save_order_and_transactions`) — untouched.

---

## 8. Coupon API Gap

| Endpoint | BUG-108 Spec | Current CRM | Owner Module | LX Decision |
|---|---|---|---|---|
| `GET /pos/coupons/available?customer_id=&order_total=&restaurant_id=` | Server filters by entitlement, `min_order`, `is_active`, expiry; response shape per §3.1 | **Does not exist** | **CR-001C-C** | **Do not build in LX.** |
| `POST /pos/coupons/validate` (BUG-108 body contract + coded errors) | JSON body `{customer_id, coupon_code, order_total, restaurant_id}`; `data.computed_discount_amount`; `error.code ∈ {INVALID_CODE, EXPIRED, MIN_ORDER_NOT_MET, NOT_ENTITLED, ALREADY_USED, INACTIVE}` | Endpoint exists at `pos.py:2335` with **query-string** contract; returns flat `message` strings (no `error.code` taxonomy) | **CR-001C-C** | **Do not build/modify in LX.** Existing endpoint preserved for non-BUG-108 callers; aligned contract is a coupon-module concern. |
| Customer-coupon entitlement model | Implicit prerequisite (BUG-108 §5.2) | Today, entitlement is encoded via `Coupon.specific_users: Optional[List[str]]` + `Coupon.applicable_channels: List[str]` (`schemas.py:471-472, 503-504`). No dedicated entitlement collection. | **CR-001C-C** | **Document only.** Design decision belongs to CR-001C-C Stage A. |

Confirmation per owner sign-off and BUG-108 §4: redemption / debit / reversal endpoints stay deferred to the future redemption CR. **No coupon writes in LX.**

---

## 9. Wallet API Gap

| Read field | Current CRM | LX Decision |
|---|---|---|
| `wallet_balance` on search response | ✅ Returned (`pos.py:2003`) | None |
| `wallet_balance` on lookup response | ✅ Returned (`pos.py:1716`) | None |
| `wallet_balance` on customer detail | ✅ Returned (raw + inside `loyalty` blob at `pos.py:2054`) | None |

No wallet read gap identified for BUG-108.

Confirmation per BUG-108 §4: `/pos/wallet/debit`, `/pos/wallet/credit`, `/pos/wallet/reverse` stay deferred. **No wallet write/debit/credit/reverse in LX.** Full wallet correctness audit is **CR-001C-W**.

---

## 10. Impact on CR-001C-L Phase L4

### Should L4 wait?

**Yes — L4 should wait for LX to merge first.** Reasons:

1. **Touch overlap is zero, sequencing benefit is high.** L4 touches `routers/points.py::create_points_transaction` and `core/loyalty_jobs.py` (`$inc` parity). LX touches `models/schemas.py` (4 new per-tier fields), `core/helpers.py` (one new helper), and `routers/pos.py` (read-side patches in 3 endpoints). Disjoint files, but doing LX first means L4 QA can assert against a **stable POS read contract**.

2. **POS frontend is blocked on §3.3 today.** BUG-108 §7 sequence step 1 says "CRM team replies with statuses." Replying with "ratio_per_point shipped on Option A path" unblocks POS faster than waiting for L4 to finish.

3. **No behavioral risk to L4.** LX is read-side only and additive. Default values mirror current behavior, so already-running restaurants are unaffected.

4. **Real owner-triggered migration validation (still pending)** can run *after* LX and *before* L4. This makes the LX patch usable in that validation run too (POS would otherwise see hardcoded 1:1 during owner's first live test).

### Does LX affect manual-redeem or cron work?

- **Manual redeem (L4):** indirectly. After LX, manual-redeem can read `get_redemption_value_for_tier(...)` instead of `settings.redemption_value` if redemption math is tier-aware. If owner confirms redemption is tier-aware, L4 should pick up the new helper. **Open question — see Q-LX6.**
- **Birthday / anniversary cron (L4):** no impact. Cron uses bonus *points*, not monetary value.

### Recommendation

**Add LX patch first, then resume L4.** L4 scope and exit criteria do not change.

---

## 11. Owner Questions

### Q-LX1 — Should we add the POS loyalty blob patch (LX) before L4?

- **A.** Yes — pause L4, ship LX (`ratio_per_point`, `tier_label`, `points_value`, `loyalty_enabled`) in `GET /pos/customers/{id}`, `POST /pos/customer-lookup`, `GET /pos/customers/{id}/loyalty`, plus the 4 per-tier `*_redemption_value` settings.
- **B.** No — finish L4 first, then LX.
- **C.** No — LX is part of CR-001C-C; defer everything until coupon module starts.

**Recommended: A.**

---

### Q-LX2 — Should coupon endpoints (`GET /pos/coupons/available`, BUG-108-shaped `POST /pos/coupons/validate`) be planned immediately after Loyalty closes as CR-001C-C?

- **A.** Yes — CR-001C-C Stage A starts the same day CR-001C-L Phase L5 closes.
- **B.** No — start CR-001C-W (Wallet) first per the original module order (Loyalty → Coupons → Wallet → Visibility). BUG-108 coupon work happens inside CR-001C-C Stage E once that module reaches that stage.
- **C.** No — pull coupon endpoints into a parallel small CR-001C-LC bridge analogous to LX, while CR-001C-W runs.

**Recommended: A.** Owner's module order (CR-001C → L → C → W → V) puts Coupons next anyway; doing BUG-108 inside CR-001C-C Stage E is the cleanest path.

---

### Q-LX3 — Option A or Option B for tier ratio exposure?

- **A.** Option A — extend existing `GET /pos/customers/{id}` + `POST /pos/customer-lookup` (`+ GET /pos/customers/{id}/loyalty`) with `ratio_per_point`, `tier_label`, `points_value`, `loyalty_enabled`. No new endpoint.
- **B.** Option B — add a new `GET /pos/loyalty/config?restaurant_id={id}` endpoint that returns the full tier table.
- **C.** Both — do A now (covers BUG-108), open B as a follow-up only when POS explicitly needs the tier reference table.

**Recommended: A** (and we will keep C in our pocket if POS ever asks for it).

---

### Q-LX4 — If per-tier redemption ratio is not currently stored (and it isn't), what's the fallback?

- **A.** **Add the four per-tier fields** to `LoyaltySettings` (`bronze/silver/gold/platinum_redemption_value`) with defaults that mirror today's `redemption_value`. CRM resolution order: per-tier → restaurant-level → 0.25. Owner can flip per-tier values from the Loyalty admin page **after** an admin-UI follow-up (frontend touch is **not** in LX).
- **B.** **Block LX** until the owner ships the admin-UI for per-tier values first.
- **C.** **Temporary fallback only** — keep using restaurant-level `redemption_value` for `ratio_per_point` in LX, do not add new schema fields; revisit when admin-UI is built.

**Recommended: A** if POS truly needs per-tier numbers immediately; **C** is acceptable as a strictly temporary fallback if owner prefers to delay schema growth. **A** is cleaner because it unblocks POS without a future migration of restaurants.

---

### Q-LX5 — What does `ratio_per_point` mean exactly?

- **A.** Rupees per point. `points_value = total_points × ratio_per_point`. (Matches BUG-108 §3.3 example: 480 points × 1.5 = 720.)
- **B.** Points per rupee. `points_value = total_points / ratio_per_point`.
- **C.** Some other interpretation — please specify.

**Recommended: A.** BUG-108's worked example unambiguously implies A (480 × 1.5 = 720). Confirm so we lock the math.

---

### Q-LX6 — Should L4 manual-redeem read the new tier-aware `get_redemption_value_for_tier(...)` helper too?

- **A.** Yes — once LX merges, L4's manual-redeem path (`routers/points.py::create_points_transaction`) and any redemption-cap math switches to the new helper. This keeps math consistent across POS-read and manual-redeem.
- **B.** No — L4 stays on the restaurant-level `redemption_value` for now. Tier-aware redemption math is a separate later CR.
- **C.** Add a small L4.5 follow-up specifically for redemption-math consistency, after L4 closes.

**Recommended: A** if Q-LX5 is `A` and Q-LX4 is `A` (consistency wins). **B** is acceptable if owner wants to scope L4 minimally.

---

## 12. Recommended Next Step

**Option A — Add small Loyalty POS response patch (LX) now, then resume L4.**

- B. Continue L4 first, then patch POS response.
- C. Defer all BUG-108 work until after Loyalty module closure.

**Recommended: A.**

LX would be a single small implementation cycle:

1. **Stage LX-A (logic):** add `bronze/silver/gold/platinum_redemption_value` to `LoyaltySettings` + `LoyaltySettingsUpdate`; add `core.helpers.get_redemption_value_for_tier(tier, settings)`; extend the `loyalty` blob in `pos.py:2017` (`/pos/customers/{id}`), `pos.py:2296` (`/pos/customers/{id}/loyalty`), and the `points_value` calc in `pos.py:1682` (`/pos/customer-lookup`) to use the new helper.
2. **Stage LX-B (QA):** static QA harness for (a) backward compat — restaurants without per-tier values continue to return today's monetary values; (b) per-tier values override — set `gold_redemption_value=1.5`, set customer tier to Gold, assert `loyalty.ratio_per_point==1.5`, `loyalty.points_value == total_points*1.5`; (c) `loyalty_enabled=False` flips the new `loyalty_enabled` flag to `false` without zeroing `total_points`.
3. **Stage LX-C (close):** controlled smoke test on R689 (read-only, no writes); restore state; flip status to `cr001c_lx_loyalty_pos_contract_patched_in_preview`; resume L4.

Files expected to change (forecast only; not implemented in this plan):

```
backend/models/schemas.py        +8 −0    (4 fields on LoyaltySettings, 4 optional on LoyaltySettingsUpdate)
backend/core/helpers.py          +12 −0   (one new helper)
backend/routers/pos.py           +20 −5   (loyalty blob in 2 read paths + lookup points_value)
```

No frontend, no DB, no migration, no env, no deploy. Roughly a half-day of implementation + harness time.

---

## 13. Final Status

**`cr001c_lx_bug108_api_contract_alignment_waiting_owner_decision`**

Owner: please reply with answers to Q-LX1 … Q-LX6 (defaults shown). On approval, LX-A implementation begins. If owner rejects A on Q-LX1, L4 resumes immediately and BUG-108 §3.3 is rolled into CR-001C-C Stage E.

### Confirmations (planning hygiene)

- ✅ No code changed
- ✅ No DB mutated
- ✅ No env changed
- ✅ No migration triggered
- ✅ No deploy
- ✅ No supervisor restart
- ✅ L4 not started
- ✅ Coupon implementation not started
- ✅ Wallet implementation not started
- ✅ `/app/memory/final/` untouched
- ✅ Existing L3 reports untouched (status `cr001c_loyalty_l3_migration_parity_qa_passed` preserved verbatim; LX-level status `cr001c_loyalty_l3_controlled_qa_passed_real_migration_validation_pending` lives only inside this LX plan, per owner's interpretation in §3)
- ✅ Only this one new file created in `planning/`
- ✅ POS BUG-108 inventory document saved at `planning/POS3_0_BUG_108_API_INVENTORY_FOR_CRM_2026_05_22.md` from the owner-supplied artifact

### ⏸ Hard Gate — Owner Action Required

Reply with one of:
1. **"LX approved — proceed to LX-A implementation per Q-LX defaults"** → I move into LX-A (still no code in this thread until owner explicitly says go-implement).
2. **"LX approved with overrides: Q-LX#: …"** → I revise this plan and re-publish.
3. **"Reject LX — continue L4"** → I close LX as `cr001c_lx_bug108_api_contract_alignment_rejected_l4_resumed` and start L4 planning instead.
4. **"Hold — clarify [item]"** → I clarify before any further step.

**No implementation, migration, or deploy starts until this gate clears.**
