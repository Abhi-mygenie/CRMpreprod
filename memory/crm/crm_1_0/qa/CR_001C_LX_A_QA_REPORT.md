# CR-001C-LX Phase LX-A — QA Report

**Module:** CR-001C-L (Loyalty) — bridge phase **LX**, stage **LX-A**
**Date:** 2026-05-23
**Status:** **`cr001c_lx_a_loyalty_pos_contract_patched_qa_passed_in_preview`**
**Implementation report:** `/app/memory/crm/crm_1_0/implementation/CR_001C_LX_A_IMPLEMENTATION_REPORT.md`
**Static harness:** `/tmp/cr_001c_lx_a_static_qa.py`

---

## 1. QA Overview

| Layer | Result |
|---|---|
| Lint on the 4 touched files | ✅ 0 new findings |
| Backend service health (`GET /api/health`) | ✅ HTTP 200 |
| Static QA harness assertions | ✅ **63 / 63 PASS** |
| Live read-only smoke (preview Mongo, restaurant `18march`) | ✅ **5 / 5 PASS** |
| Regression scope (`git diff --name-only HEAD`) | ✅ Exactly 4 files (as planned) |

---

## 2. Static QA — `/tmp/cr_001c_lx_a_static_qa.py`

Pure / in-memory. No Mongo, no httpx, no supervisor. Imports
`build_pos_loyalty_blob` from `core.loyalty` and
`get_redemption_value_for_tier` from `core.helpers` directly.

### 2.1 Coverage matrix (63 assertions)

| # | Scenario | Assertions | Result |
|---|---|---|---|
| QA-1 | Restaurant-level fallback (no per-tier): `redemption_value=0.5`, Silver/200 → `ratio=0.5`, `points_value=100.0` | 2 | ✅ |
| QA-2 | Per-tier override wins: `silver_redemption_value=1.2`, `redemption_value=0.5`, Silver/200 → `ratio=1.2`, `points_value=240.0` | 2 | ✅ |
| QA-3 | Customer tier not in per-tier overrides falls through to restaurant-level | 1 | ✅ |
| QA-4 | All 4 per-tier set (Bronze 0.25 / Silver 1.0 / Gold 1.5 / Platinum 2.0) | 4 | ✅ |
| QA-5 | `loyalty_enabled=False`: flag flips off, `points_value` still numerically returned, `total_points` unchanged | 3 | ✅ |
| QA-6 | `loyalty_settings` missing (None): `ratio=0.25`, `points_value=round(tp*0.25,2)`, `loyalty_enabled=False` | 3 | ✅ |
| QA-7 | `tier_label` derivation × 4 tiers | 4 | ✅ |
| QA-8 | Strict 6-key shape across 9 scenarios | 9 | ✅ |
| QA-9 | Removed keys absent — `points_monetary_value`, `redemption_value_per_point`, `next_tier`, `points_to_next_tier`, `wallet_balance`, `earn_rate_percent`, `total_visits`, `total_spent` | 8 | ✅ |
| QA-10 | `/pos/customer-lookup` `points_value` tier-aware + flat key-set unchanged vs pre-LX | 2 | ✅ |
| QA-11 | `/pos/customers/{id}` strict 6-key blob + top-level customer fields preserved | 9 | ✅ |
| QA-12 | `/pos/customers/{id}/loyalty` strict 6-key, no `total_visits` / `total_spent` | 3 | ✅ |
| QA-13 | Tier defaults to Bronze when missing | 2 | ✅ |
| QA-14 | Zero points → `points_value=0.0` | 1 | ✅ |
| QA-15 | L3 helper regression: `calculate_points` + `calculate_tier` outputs unchanged | 5 | ✅ |
| QA-16 | `get_redemption_value_for_tier` direct isolation (5 paths through resolver) | 5 | ✅ |
| **Total** | | **63** | **63 / 0 / 0** |

(Plan target was ~51 assertions. Actual harness ships 63.)

### 2.2 Reproducibility

```bash
/root/.venv/bin/python /tmp/cr_001c_lx_a_static_qa.py
# Expected exit code: 0
# Tail:
#   ============================================================
#     CR-001C-LX-A static QA results: 63 passed, 0 failed
#   ============================================================
```

---

## 3. Lint

```
ruff check backend/
```

- Touched files (`models/schemas.py`, `core/helpers.py`, `core/loyalty.py`, `routers/pos.py`) → **0 findings**.
- Pre-existing findings in **unrelated files** (`routers/analytics.py:346,571`, `routers/customers.py:1539`, `services/analytics_service.py:120`) — **not introduced by LX-A**, out of LX-A scope, left untouched.

---

## 4. Service Health

```
sudo supervisorctl restart backend  → started
curl -s -m 5 http://localhost:8001/api/health
{"status":"healthy","timestamp":"2026-05-23T06:49:58.733443+00:00"}
```

Backend booted cleanly on first attempt post-patch; APScheduler started; lifespan complete.

---

## 5. Live Read-Only Smoke — Restaurant `18march`

> Plan named R689 as smoke target. In the running preprod data the
> comparable readiness profile (has `loyalty_settings` + customers with
> non-zero balances) is restaurant **`18march`** (user_id
> `pos_0001_restaurant_478`, email `owner@18march.com`). Read-only smoke
> executed there.

### 5.1 Test setup (no mutation)

- Customer A: `id=1080aad6-…`, `tier=Bronze`, `total_points=128`.
- Customer B: `id=d7778af3-…`, `tier=Bronze`, `total_points=0`, `phone=9742526341`.
- `loyalty_settings` before run: `redemption_value=0.25`, all 4 per-tier `None`, `loyalty_enabled=None`.

### 5.2 Results

| # | Endpoint | Setup | Expected | Got | Pass |
|---|---|---|---|---|---|
| 1 | `GET /api/pos/customers/{custA}` | default settings | strict 6-key `loyalty` blob; `tier=Bronze`, `tier_label="Bronze Member"`, `total_points=128`, `ratio_per_point=0.25`, `points_value=32.0`, `loyalty_enabled=false`; top-level customer fields preserved | exactly that. Top-level keys returned: `addresses`, `allergies`, `…`, `wallet_balance`, `total_points`, `recent_orders`, `…` (all preserved). Loyalty key-set = `{loyalty_enabled, points_value, ratio_per_point, tier, tier_label, total_points}` | ✅ |
| 2 | `GET /api/pos/customers/{custA}/loyalty` | default settings | response `data` is strict 6-key blob, no `total_visits` / `total_spent` | exactly that | ✅ |
| 3 | `POST /api/pos/customer-lookup` `{"phone":"9742526341"}` | default settings | flat lookup shape unchanged vs pre-LX; `points_value=0.0` (tier-aware via helper still resolves to 0 for tp=0) | exactly that; lookup key-set equals pre-LX `{registered, customer_id, name, phone, tier, total_points, points_value, wallet_balance, total_visits, total_spent, allergies, favorites, last_visit, addresses}` | ✅ |
| 4 | Owner-style override smoke: set `bronze_redemption_value=1.5` on `loyalty_settings`; re-fetch loyalty for custA (128 pts, Bronze) | per-tier active | `ratio_per_point=1.5`, `points_value=192.0` (= 128 × 1.5) | exactly that | ✅ |
| 5 | Revert `bronze_redemption_value` to `None`; re-fetch loyalty for custA | per-tier removed | `ratio_per_point` falls back through restaurant-level to `0.25` | exactly that. Settings post-revert byte-identical to pre-run. | ✅ |

### 5.3 Mutation discipline

Only mutation during smoke: `loyalty_settings.bronze_redemption_value` was set to `1.5` then reverted to its original value (`None`). Verified post-revert via re-fetch. **No customer, order, points_transactions, wallet_transactions or any other collection was written to.**

---

## 6. Risk Matrix Re-Validation

| # | Risk (per plan §7) | Mitigation in code | Coverage | Result |
|---|---|---|---|---|
| R-1 | New per-tier fields persist as `null` for existing restaurants | Helper falls through `null → restaurant-level → 0.25` | QA-1, QA-3, smoke step 5 | ✅ |
| R-2 | Pydantic rejects older clients' POST/PATCH bodies | All 4 new fields `Optional[float] = None` on Update model | implicit / no schema error in service start | ✅ |
| R-3 | Removed keys break a hidden consumer | Pre-prod, no live POS yet; grep frontend src confirms no internal use; documented in handoff §3 | doc, plus QA-9 + QA-12 negative assertions | ✅ |
| R-4 | Realtime POS write-path drifts | Untouched in LX-A | grep — no change to `_save_order_and_transactions`, `_find_or_create_customer`, `_calculate_points` | ✅ |
| R-5 | `loyalty_enabled=false` with `points_value>0` confuses POS | Blob still returns numeric `points_value`; POS frontend decides display; handoff §5 documents this | QA-5 | ✅ |
| R-6 | `tier` field unknown / missing on customer | Defaults to `Bronze` | QA-13 | ✅ |
| R-7 | `loyalty_settings` missing `loyalty_enabled` key | `(settings or {}).get("loyalty_enabled", False) → False` | QA-6, smoke step 1 | ✅ |

---

## 7. Status Transition

| Phase | Before | After |
|---|---|---|
| LX-A | `cr001c_lx_a_implementation_plan_awaiting_go_implement` | **`cr001c_lx_a_loyalty_pos_contract_patched_qa_passed_in_preview`** |
| POS handoff banner | DRAFT (contract locked, QA pending) | **GREEN-LIGHT — POS may consume** |

---

## 8. Out-of-Scope Re-confirmation

- ❌ L4 / L5 — not started
- ❌ Coupon (CR-001C-C) — not started
- ❌ Wallet (CR-001C-W) — not started
- ❌ Redemption / debit / reversal endpoints — not built
- ❌ Migration code — not touched
- ❌ Realtime POS write-path — not touched
- ❌ Frontend admin UI — not built
- ❌ Prod deploy — not done
- ❌ `/app/memory/final/` — untouched
- ❌ Existing L1/L2/L3 reports — untouched
- ❌ Smoke mutations — only the per-tier value, reverted

---

## 9. Sign-off

CRM team — LX-A QA passed in preview. POS team unblocked.
Awaiting owner go-ahead for L4.
