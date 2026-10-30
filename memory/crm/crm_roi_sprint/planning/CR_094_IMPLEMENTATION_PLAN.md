# CR-094 — Implementation Plan v2: `GET /scan/loyalty-rules/{restaurant_id}`
**Date**: 2026-10-09 (v1) · **v2 amendment 2026-10-09** · **Role**: Planning Agent · **IA**: `planning/CR_094_IMPACT_ANALYSIS.md` (Q1 yes · Q2 yes · Q3 flat) · **Amendment source**: `discovery/SESSION_2026_10_09_INTAKE_CR103_CR104_BUG031_BUG033.md` §8 + `DECISIONS_LOG.md` 2026-10-09 (Q4 **b** · Q5 **r689** · Q6 **+4 fields, scheduler NOT enabled**) · **Risk**: LOW (read-only, whitelisted, not §14; helper call is pure) · **Status**: ⏸ v2 AWAITING OWNER APPROVAL — implementation gate opens on "choose implementation role for CR-094" · **No code changed.**

## 0. What changed v1 → v2
| # | v1 | v2 | Why |
|---|---|---|---|
| A | 29 keys | **33 keys** (+`birthday_bonus_enabled/points`, `anniversary_bonus_enabled/points`) | Q6 — payload open so diner can see/set DOB & anniversary in app profile; awarding scheduler stays a separate item, not enabled |
| B | `*_redemption_value` passed through raw (null for 40/41 tenants) | **resolved server-side** per tier via `core.helpers.get_redemption_value_for_tier` (per-tier → `redemption_value` → 0.25) | Q4 (b) / BUG-031 — one truth, no app-side maths |
| C | R6/V10 parity fixture r69 | **r689** (Kunafa Mahal) | Q5 / BUG-032 — r69 → `pos_0001_restaurant_69` → 404 (BUG-030) |
| D | consumer note: flat names + "hide feedback-bonus copy" | + constants, tz, `0`=never, `null`=no cap, `loyalty_enabled:false` rule, "no automated bonus award is live" | BUG-033 (CA side) + Q6 |
Unchanged: route path, no auth, IP limiter 60/min, 404 unknown rid, defaults fill, `Cache-Control: public, max-age=60`, `_resp` envelope, files touched.

## 1. Edits
**E1 — `routers/scan.py`** (after `lookup_customer`, ~line 303): new route, no auth.
```python
_LOYALTY_RULES_IP_LIMIT = (60, 60)  # CR-094: 60/min per IP (no identity data)
_LOYALTY_RULES_TIERS = ("bronze", "silver", "gold", "platinum")
_LOYALTY_RULES_FIELDS = (  # CR-094 whitelist = POS L-1 (pos_loyalty.py:44) + Q1/Q2/Q6 additions; flat names (Q3). 33 keys.
    "loyalty_enabled", "wallet_enabled", "coupon_enabled",
    "bronze_earn_percent", "silver_earn_percent", "gold_earn_percent", "platinum_earn_percent",
    "tier_silver_min", "tier_gold_min", "tier_platinum_min",
    "redemption_value", "bronze_redemption_value", "silver_redemption_value", "gold_redemption_value", "platinum_redemption_value",
    "min_redemption_points", "max_redemption_percent", "max_redemption_amount", "min_order_value",
    "first_visit_bonus_enabled", "first_visit_bonus_points",
    "birthday_bonus_enabled", "birthday_bonus_points",          # Q6 — informational; award scheduler not enabled
    "anniversary_bonus_enabled", "anniversary_bonus_points",    # Q6 — informational; award scheduler not enabled
    "feedback_bonus_enabled", "feedback_bonus_points",          # Q2 — informational; nothing awards it (CR-104 deferred)
    "off_peak_bonus_enabled", "off_peak_bonus_type", "off_peak_bonus_value", "off_peak_start_time", "off_peak_end_time",
    "points_expiry_months",
)

@router.get("/loyalty-rules/{restaurant_id}")
async def loyalty_rules(restaurant_id: str, request: Request, response: Response):
    """CR-094: public, read-only, whitelisted loyalty rules for the Customer App pre-login preview."""
    retry = await _lookup_rate_limited(f"lr-ip:{_client_ip(request)}", *_LOYALTY_RULES_IP_LIMIT)
    if retry:
        raise HTTPException(status_code=429, detail="Too many requests", headers={"Retry-After": str(retry)})
    rid = _normalize_restaurant_id(restaurant_id)
    if not await db.users.find_one({"id": rid}, {"_id": 0, "id": 1}):
        raise HTTPException(status_code=404, detail="Restaurant not found")
    defaults = default_loyalty_settings(rid)
    settings = {**defaults, **(await db.loyalty_settings.find_one({"user_id": rid}, {"_id": 0}) or {})}
    data = {k: settings.get(k) for k in _LOYALTY_RULES_FIELDS}
    for tier in _LOYALTY_RULES_TIERS:  # CR-094 Q4 (b): effective ₹/point per tier, never null
        data[f"{tier}_redemption_value"] = get_redemption_value_for_tier(tier.capitalize(), settings)
    response.headers["Cache-Control"] = "public, max-age=60"
    return _resp(True, "Loyalty rules", data)
```
Imports: `Response` added to the existing `from fastapi import …` line; `default_loyalty_settings` from `core.loyalty`; `get_redemption_value_for_tier` appended to the existing `from core.helpers import …` line (`scan.py:19`).
Notes: `{**defaults, **doc}` fills keys absent on older docs (11 docs lack per-tier keys) and keeps stored `null`s where the doc has them — the per-tier loop then replaces those four with the effective value. `max_redemption_amount` stays `null` = no cap (documented). `get_redemption_value_for_tier` is a pure read (`helpers.py:32-48`), the same resolver `compute_max_redeemable` uses → POS maths parity by construction.

**E2 — `tests/test_cr094_loyalty_rules.py`** (new; pattern of `test_cr093_lookup.py`: `BASE_URL` from env, Mongo read-only via `dotenv_values`, `X-Forwarded-For` per test). Fixture tenant **r689** (`pos_0001_restaurant_689`, Kunafa Mahal: loyalty on, per-tier ₹1/2/3/4, `max_redemption_amount` 110, `api_key` present).
- R1 `GET /689` → 200, `success:true`, `set(data) == set(_LOYALTY_RULES_FIELDS)` (33, exact), none of `dormant_days_end`, `campaign_daily_limit`, `vip_auto_promote_enabled`, `vip_score_min`, `user_id`, `id`, `custom_field_1_label`, `expiry_reminder_days`.
- R2 `GET /999999` → 404 `"Restaurant not found"`.
- R3 defaults fill: pick a tenant doc lacking a whitelisted key (probe: 11 docs lack `bronze_redemption_value`; pick the first with standard id) → key present, value from `default_loyalty_settings`; skip with reason if none.
- R4 `Authorization: Bearer junk` → 200 (ignored).
- R5 61st call/min from one IP → 429 + `Retry-After` (calls 1–60 → 200).
- R6 parity (**r689**, API key read from `users` doc): every key in POS `GET /pos/loyalty/settings.data` equals ours **except** `redemption_value`-family only where POS ships raw — assert the 14 shared non-redemption keys equal exactly, and `redemption_value` equal.
- R7 `Cache-Control: public, max-age=60` present.
- R8 `loyalty_settings` doc for r689 byte-identical before/after (read-only).
- R9 `GET /689` and `GET /pos_0001_restaurant_689` → identical `data`.
- **R10 (Q4 b)** r689 → `bronze/silver/gold/platinum_redemption_value == 1.0/2.0/3.0/4.0`; tenant with per-tier null (e.g. r719, `redemption_value` 1.0) → all four `== 1.0`, none `null`.
- **R11 (Q6)** `birthday_bonus_enabled/points`, `anniversary_bonus_enabled/points` present; r689 → `True/100`, `True/150`.
- **R12** `max_redemption_amount` is `null` for a no-cap tenant (r719) and `110.0` for r689.
- **R13** `off_peak_bonus_type ∈ {"multiplier","flat"}` for every tenant with a doc (loop 41 docs via DB, compare to API for 3 sampled).

## 2. Edit order
E2 (red) → E1 → `pytest tests/test_cr094_loyalty_rules.py` → `test_cr093_lookup.py` + `test_cr089_skip_otp.py` (shared `_lookup_rate_limited`) → QA handover.

## 3. Verification matrix
R1–R13 above + **V10 smoke (r689)**: Bronze diner, ₹500 bill → app preview "25 points" (`int(500 × 5 / 100)`), "1 pt = ₹1"; Silver preview "1 pt = ₹2".

## 4. Files
**WILL change**: `backend/routers/scan.py` (+~40 lines, 2 import edits), `backend/tests/test_cr094_loyalty_rules.py` (new). **WILL NOT touch**: `core/loyalty.py`, `core/helpers.py`, `pos_loyalty.py`, `server.py`/scheduler, `loyalty_settings` data, frontend, any POS route or contract (owner: none this batch).

## 5. Rollback
`git revert`; no data, no index.

## 6. Consumer note (Scan & Order change-log row + contract v1.1 additive)
- Route, no auth, IP 60/min, cached 60 s, `{success,message,data}`; **33 flat keys** exactly as listed in E1 (CA-6 names).
- `*_redemption_value` are **effective ₹ per point per tier** (already resolved; never null). `redemption_value` is the restaurant-level number for display only.
- `max_redemption_amount: null` = **no cap**. `points_expiry_months: 0` = **never expires**. `off_peak_bonus_type ∈ {"multiplier","flat"}`; `off_peak_*_time` = `HH:MM` restaurant-local (Asia/Kolkata).
- **`loyalty_enabled:false` → show no earn/redeem copy** (numbers are still returned).
- **Bonus fields are informational only**: `first_visit_*` is awarded at first order; `birthday_*`, `anniversary_*` **award scheduler is not enabled** (owner, this batch); `feedback_*` **not awarded by anything** (CR-104 deferred to 096 closure). Do not promise "+N points" for these three.
- Diner may set `dob` / `anniversary` via existing `PUT /scan/profile` (token required).
- Unknown rid → 404. r69 short id → 404 until BUG-030 is decided.

```
Planning complete: CR-094 (plan v2 amendment)
Stage: Implementation Plan
Code reality: NONE
Risk: LOW
Files WILL change: routers/scan.py · tests/test_cr094_loyalty_rules.py
Files WILL NOT touch: core/loyalty.py · core/helpers.py · pos_loyalty.py · scheduler · frontend · stored data · any POS route/contract
Owner decisions: none new (Q4 b · Q5 r689 · Q6 +4/no scheduler already locked)
Docs: planning/CR_094_IMPLEMENTATION_PLAN.md (v2)
Next: Gate approval of v2 → "choose implementation role for CR-094"
```
