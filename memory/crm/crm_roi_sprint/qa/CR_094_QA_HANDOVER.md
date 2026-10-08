# QA Handover — CR-094 `GET /scan/loyalty-rules/{restaurant_id}` (plan v2)
**Date**: 2026-10-09 · **From**: Implementation Agent · **To**: QA Agent
**Plan**: `planning/CR_094_IMPLEMENTATION_PLAN.md` (v2) · **IA**: `planning/CR_094_IMPACT_ANALYSIS.md` · **Decisions**: `DECISIONS_LOG.md` 2026-10-09 (Q1–Q3, Q4 b, Q5 r689, Q6 +4/no scheduler) · **Risk**: LOW (public read-only whitelist)
**Creds**: `/app/memory/test_credentials.md` · **URL**: `REACT_APP_BACKEND_URL` in `/app/frontend/.env` · **Fixture tenant**: r689 Kunafa Mahal (`pos_0001_restaurant_689`); null-per-tier example r719

## What changed (2 files, markers `# CR-094`)
| File | Change |
|---|---|
| `backend/routers/scan.py` | imports: `Response` (fastapi), `get_redemption_value_for_tier` (core.helpers), `default_loyalty_settings` (core.loyalty) · + `_LOYALTY_RULES_IP_LIMIT (60,60)`, `_LOYALTY_RULES_TIERS`, `_LOYALTY_RULES_FIELDS` (33 keys) · + `GET /loyalty-rules/{restaurant_id}` after `lookup_customer` |
| `backend/tests/test_cr094_loyalty_rules.py` | new, R1–R13 |
Not touched: `core/loyalty.py`, `core/helpers.py`, `pos_loyalty.py`, `server.py`, scheduler, frontend, any POS route/contract, stored data.

## Contract (Customer App)
`GET /api/scan/loyalty-rules/{rid}` — `rid` short (`689`) or full (`pos_0001_restaurant_689`); no auth (any `Authorization` header ignored).
`200 { success:true, message:"Loyalty rules", data:{33 flat keys} }` · `404 {"detail":"Restaurant not found"}` · `429 {"detail":"Too many requests"}` + `Retry-After` (60/min per IP, bucket `lr-ip:{ip}` in `scan_lookup_attempts`). Origin sets `Cache-Control: public, max-age=60`.
Keys: `loyalty_enabled wallet_enabled coupon_enabled · bronze/silver/gold/platinum_earn_percent · tier_silver/gold/platinum_min · redemption_value · bronze/silver/gold/platinum_redemption_value (resolved, never null) · min_redemption_points max_redemption_percent max_redemption_amount(null=no cap) min_order_value · first_visit_bonus_enabled/points · birthday_bonus_enabled/points · anniversary_bonus_enabled/points · feedback_bonus_enabled/points · off_peak_bonus_enabled off_peak_bonus_type(multiplier|flat) off_peak_bonus_value off_peak_start_time off_peak_end_time (HH:MM Asia/Kolkata) · points_expiry_months (0 = never)`.

## Implementation self-test — 13/13 PASS (`pytest tests/test_cr094_loyalty_rules.py -o addopts=""`, preview, 2026-10-09)
| # | Check | Result |
|---|---|---|
| R1 | r689 → 200, `set(data)` == 33-key whitelist exactly, no private keys | ✅ |
| R2 | `999999` → 404 "Restaurant not found" | ✅ |
| R3 | tenant doc lacking keys → defaults fill | ✅ |
| R4 | `Authorization: Bearer junk` → 200 | ✅ |
| R5 | 61 concurrent calls one IP → 60×200 + 1×429; next call 429 + `Retry-After` | ✅ |
| R6 | 15 shared keys == POS `GET /pos/loyalty/settings` (r689 API key) | ✅ |
| R7 | origin `Cache-Control: public, max-age=60` | ✅ (see NOTE-1) |
| R8 | `loyalty_settings` r689 identical before/after | ✅ |
| R9 | short vs full rid identical payload | ✅ |
| R10 | r689 per-tier 1.0/2.0/3.0/4.0; r719 (null per-tier) all 1.0, never null | ✅ |
| R11 | birthday 100 / anniversary 150 present, match doc | ✅ |
| R12 | `max_redemption_amount` 110.0 (r689) / null (r719) | ✅ |
| R13 | `off_peak_bonus_type` ∈ {multiplier, flat} across tenants | ✅ |
Regression (shared limiter): `test_cr093_lookup.py` + `test_cr089_skip_otp.py` → 24 pass / 1 skip ✅. r69 → 404 (BUG-030, expected).

## Findings during self-test (not code defects)
- **NOTE-1 (ENV)**: the preview edge (Cloudflare → ingress) rewrites `Cache-Control` to `no-store, no-cache, must-revalidate` on **every** route (also `/api/health`). Origin header is correct. Customer App on preview will get no-store; **verify on the production domain** before relying on the 60 s cache. Registered as **ENV-002** (`discovery/SESSION_2026_10_09_INTAKE_ENV002_PROD_EDGE_CHECK.md`) — infra checks I1–I6 on production.
- **NOTE-2 (test design)**: 61 sequential round-trips through the edge take >60 s → the sliding window empties before call 61; R5 now fires concurrently with a fresh random IP per run. Same constraint applies to any future ≥60/min limiter test.

## QA asks
1. Re-run R1–R13 independently (backend only; Playwright not needed — no frontend change).
2. Ad-hoc: `loyalty_enabled:false` tenant still returns all 33 keys (r719) · a tenant with `off_peak_bonus_type:"flat"` · XFF spoof with two IPs `"1.2.3.4, 5.6.7.8"` → bucket on first.
3. Confirm no new document in `customers`, `loyalty_settings`, `points_transactions` after the run (only `scan_lookup_attempts`, TTL 60 s).
4. Severity scale per prompt §8 Role 4. Report → `qa/CR_094_QA_REPORT.md` + `test_reports/iteration_9.json`.
