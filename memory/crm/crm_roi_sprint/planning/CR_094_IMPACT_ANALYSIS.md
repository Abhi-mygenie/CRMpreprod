# CR-094 — Impact Analysis: public `GET /scan/loyalty-rules/{restaurant_id}`
**Date**: 2026-10-09 · **Role**: Planning Agent · **Intake**: `discovery/SESSION_2026_09_28_BATCH_INTAKE_CR093_CR095.md` §2 · Contract v1.0 §4c (fields agreed; CA-6 acknowledged 2026-10-09) · **Status**: ⏸ OWNER APPROVAL REQUIRED (Q1–Q3) · **No code changed.**

## 1. Why
Customer App B3 (INV-022): show "you will earn N points" before login and explain tiers. Today the only loyalty read on `/scan` is `GET /scan/loyalty` (`scan.py:340`) — **token-required**, returns the diner's own balance + their tier's earn rate. The restaurant-level rule-set is exposed only to POS (`pos_loyalty.py:44`, `X-API-Key`). Folding into `/scan/config` was rejected (Customer-App-owned, being retired under CR-095).

## 2. Code reality (read-only 2026-10-09)
| Fact | Evidence |
|---|---|
| Shape already exists for POS: `GET /pos/loyalty/settings` returns 15 whitelisted fields | `pos_loyalty.py:44-75` |
| Defaults single source: `default_loyalty_settings(user_id)` | `core/loyalty.py:27` |
| `/scan` auth-free pattern + `_normalize_restaurant_id` exist (lookup, skip-otp) | `scan.py:31, 280` |
| `loyalty_settings` doc for r689 has 55 keys incl. per-tier `*_earn_percent`, `*_redemption_value`, `min_order_value`, `first_visit_bonus_*`, `feedback_bonus_*`, `off_peak_*`, lifecycle thresholds, campaign limits, VIP auto-promote | probe |
| No public read of `loyalty_settings` today → no leakage baseline | grep |
| `restaurant_id` in Customer App calls = short form `"689"` (contract O-8) | signoff doc |

## 3. Proposed response (whitelist — nothing else leaves the server)
```json
{ "loyalty_enabled": true, "wallet_enabled": false, "coupon_enabled": true,
  "earn_percent": {"Bronze":5.0,"Silver":7.0,"Gold":10.0,"Platinum":15.0},
  "tier_thresholds": {"Silver":500,"Gold":1500,"Platinum":5000},
  "redemption_value": 1.0,
  "redemption_value_by_tier": {"Bronze":1.0,"Silver":1.0,"Gold":1.2,"Platinum":1.5},   // Q1
  "min_redemption_points": 50, "max_redemption_percent": 30, "max_redemption_amount": null,
  "min_order_value": 0,
  "first_visit_bonus": {"enabled": true, "points": 50},
  "feedback_bonus": {"enabled": false, "points": 0},                                    // Q2
  "off_peak_bonus": {"enabled": false, "type": "percent", "value": 0, "start": "14:00", "end": "17:00"},
  "points_expiry_months": 12 }
```
Contract §4c names per-tier `*_earn_percent` flat (CA-6: `bronze_earn_percent`, …). **Q3**: ship flat names exactly as CA-6 acknowledged (recommended — zero adapter risk) vs the nested shape above.
**Excluded** (stay private): lifecycle days (`dormant_*`, `at_risk_*`), `campaign_daily_limit`, VIP auto-promote, birthday/anniversary windows, custom field labels, `high_spender_threshold`, `loyalty_clean_slate_recalc`, `id`, `user_id`.

## 4. Behaviour
- Public, **no auth**, read-only, **never writes**, `Cache-Control: public, max-age=60`.
- Unknown restaurant → 404 `{"detail":"Restaurant not found"}` (users lookup by `_normalize_restaurant_id`, honouring BUG-030 later).
- Missing `loyalty_settings` doc → defaults via `default_loyalty_settings` (same as POS).
- Rate limit: IP 60/min (lighter than lookup — no identity info) using `_lookup_rate_limited` key `lr-ip:`; **no** phone bucket (no phone).
- Calculation **unchanged** — this is a read; Customer App computes the preview; CRM remains source of truth at order time (`/pos/orders`).

## 5. Impact / blast radius
Files: `routers/scan.py` (+~40 lines), tests. Not §14. Reads `loyalty_settings` + `users` only. Exposes restaurant loyalty configuration publicly (already visible to diners through earned points) — whitelist keeps internal thresholds private. Risk **MEDIUM → LOW** with whitelist; blast radius Customer App only.

## 6. Owner questions
| Q | Question | Recommendation |
|---|---|---|
| Q1 | Include per-tier `*_redemption_value` (intake Q1)? | **Yes** — needed for "worth ₹N" preview; already public to the diner via `/scan/loyalty` for own tier |
| Q2 | Include `feedback_bonus_*` so the feedback form can say "earn 20 points"? (ties to CR-096) | **Yes** |
| Q3 | Field shape: **flat** (`bronze_earn_percent`, … exactly as CA-6) or nested | **Flat** — Customer App adapter is already written against flat names |

## 7. Verification (draft)
V1 r689 → 200 whitelist only (assert no excluded key present) · V2 unknown rid → 404 · V3 tenant without settings doc → defaults · V4 no auth header needed; `X-API-Key`/Bearer ignored · V5 61st call/min from one IP → 429 · V6 response equals POS `/pos/loyalty/settings` for shared fields (parity) · V7 `loyalty_settings` unchanged (read-only) · V8 Customer App smoke: "you will earn N" for r689 Bronze = 5% of ₹500 = 25.

```
Planning complete: CR-094
Stage: Impact Analysis
Code reality: NONE on /scan (POS equivalent exists)
Risk: LOW (read-only, whitelisted)
Files WILL change: routers/scan.py (+1 route) · tests/test_cr094_loyalty_rules.py (new)
Files WILL NOT touch: core/loyalty.py · pos_loyalty.py · frontend · stored data
Owner decisions: Q1 redemption-by-tier · Q2 feedback bonus · Q3 flat vs nested
Docs: planning/CR_094_IMPACT_ANALYSIS.md
Next: owner answers → Implementation Plan
```
