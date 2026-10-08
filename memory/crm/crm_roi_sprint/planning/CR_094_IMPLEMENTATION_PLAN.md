# CR-094 — Implementation Plan: `GET /scan/loyalty-rules/{restaurant_id}`
**Date**: 2026-10-09 · **Role**: Planning Agent · **IA**: `planning/CR_094_IMPACT_ANALYSIS.md` (closed: Q1 yes · Q2 yes · Q3 flat) · **Risk**: LOW (read-only, whitelisted, not §14) · **Status**: ✅ OWNER APPROVED 2026-10-09 — implementation gate opens on "choose implementation role" · **No code changed.**

## 1. Edits
**E1 — `routers/scan.py`** (after `lookup_customer`, ~line 300): new route, no auth.
```python
_LOYALTY_RULES_IP_LIMIT = (60, 60)  # CR-094: 60/min per IP (no identity data)
_LOYALTY_RULES_FIELDS = (  # whitelist = POS L-1 (pos_loyalty.py:44) + Q1/Q2 additions; flat names (Q3)
    "loyalty_enabled", "wallet_enabled", "coupon_enabled",
    "bronze_earn_percent", "silver_earn_percent", "gold_earn_percent", "platinum_earn_percent",
    "tier_silver_min", "tier_gold_min", "tier_platinum_min",
    "redemption_value", "bronze_redemption_value", "silver_redemption_value", "gold_redemption_value", "platinum_redemption_value",
    "min_redemption_points", "max_redemption_percent", "max_redemption_amount", "min_order_value",
    "first_visit_bonus_enabled", "first_visit_bonus_points",
    "feedback_bonus_enabled", "feedback_bonus_points",
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
    settings = await db.loyalty_settings.find_one({"user_id": rid}, {"_id": 0}) or default_loyalty_settings(rid)
    defaults = default_loyalty_settings(rid)
    response.headers["Cache-Control"] = "public, max-age=60"
    return _resp(True, "Loyalty rules", {k: settings.get(k, defaults.get(k)) for k in _LOYALTY_RULES_FIELDS})
```
Imports: `Response` from fastapi; `default_loyalty_settings` from `core.loyalty`. Defaults fill any key missing on an older tenant doc (same source POS uses). Nothing outside the whitelist can leave.

**E2 — `tests/test_cr094_loyalty_rules.py`** (new): R1 r689 → 200, keys ⊆ whitelist, no private key (`dormant_days_end`, `campaign_daily_limit`, `vip_auto_*`, `user_id`, `id`) · R2 unknown rid `999999` → 404 · R3 tenant with no `loyalty_settings` doc (create temp user? **no** — use projection test: monkeypatch not possible against preview → assert defaults for a key absent on r689 if any; else skip with reason) · R4 no auth header required; `Authorization: Bearer junk` ignored → 200 · R5 61st call/min from one IP → 429 + `Retry-After` · R6 parity: shared keys equal POS `GET /pos/loyalty/settings` for r69 (owner API key) · R7 `Cache-Control` header present · R8 `loyalty_settings` doc unchanged before/after (read-only) · R9 short `"689"` and full `pos_0001_restaurant_689` both resolve.

## 2. Edit order
E2 (red) → E1 → run `test_cr094_loyalty_rules.py`, then `test_cr093_lookup.py` + `test_cr089_skip_otp.py` (shared limiter helper) → QA handover.

## 3. Verification matrix → R1–R9 above + V10 Customer App smoke: r689 Bronze, ₹500 → preview "25 points".
## 4. Files
**WILL change**: `backend/routers/scan.py` (+~35 lines), `backend/tests/test_cr094_loyalty_rules.py` (new). **WILL NOT touch**: `core/loyalty.py`, `pos_loyalty.py`, `loyalty_settings` data, frontend.
## 5. Rollback: `git revert`; no data. ## 6. Consumer: change-log entry + contract v1.1 (flat names as CA-6); note "hide feedback-bonus copy until award CR ships" (Q2).

```
Planning complete: CR-094 · Stage: Implementation Plan · Risk: LOW
Files WILL change: routers/scan.py · tests/test_cr094_loyalty_rules.py
Files WILL NOT touch: core/loyalty.py · pos_loyalty.py · frontend · stored data
Owner decisions: none new
Next: Gate approval → Implementation
```
