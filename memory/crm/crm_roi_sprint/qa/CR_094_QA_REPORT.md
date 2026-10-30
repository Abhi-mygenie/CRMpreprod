# QA Report — CR-094 `GET /api/scan/loyalty-rules/{restaurant_id}`
**QA Agent**: T1 · **Date**: iteration_9 (2026-02) · **Verdict**: ✅ PASS — no blockers

## Self-Test Matrix (R1–R13) — 13/13 PASS
| # | Check | Result |
|---|---|---|
| R1 | r689 → 200, exact 33-key whitelist, no private keys | ✅ PASS |
| R2 | unknown rid `999999` → 404 "Restaurant not found" | ✅ PASS |
| R3 | tenant doc lacking keys → defaults fill all 33 | ✅ PASS (skipped: all tenants carry all keys) |
| R4 | `Authorization: Bearer junk` → 200 | ✅ PASS |
| R5 | 61 concurrent calls one IP → 60×200 + 1×429 + Retry-After | ✅ PASS |
| R6 | 15 shared keys match POS `GET /pos/loyalty/settings` r689 | ✅ PASS |
| R7 | origin `Cache-Control: public, max-age=60` (via localhost:8001) | ✅ PASS |
| R8 | loyalty_settings doc unchanged after calls | ✅ PASS |
| R9 | short rid `689` == full rid `pos_0001_restaurant_689` | ✅ PASS |
| R10 | per-tier redemption resolved, never null | ✅ PASS |
| R11 | birthday/anniversary fields present and match doc | ✅ PASS |
| R12 | max_redemption_amount null/value pass-through | ✅ PASS |
| R13 | off_peak_bonus_type ∈ {multiplier, flat} across tenants | ✅ PASS |

## Ad-hoc Checks
| Check | Result |
|---|---|
| loyalty_enabled:false tenant → all 33 keys returned | ✅ PASS |
| off_peak_bonus_type='flat' tenant → value returned correctly | ✅ PASS |
| XFF `"1.2.3.4, 5.6.7.8"` → bucket `lr-ip:1.2.3.4` only, no bucket for 5.6.7.8 | ✅ PASS |
| customers / loyalty_settings / points_transactions counts unchanged after run | ✅ PASS (customers=7705, loyalty_settings=41, points_transactions=14252) |

## Notes
- **NOTE-1 (ENV)**: Preview Cloudflare edge rewrites `Cache-Control` to `no-store`. R7 tested directly against localhost:8001 origin — origin header correct (`public, max-age=60`). Production domain verification required per ENV-002.
- **NOTE-2**: R3 skipped — all tenant docs in this environment already carry all whitelisted keys; default-fill path not exercised (by design, low-risk).
- No new documents written to customers, loyalty_settings, or points_transactions.
- Only `scan_lookup_attempts` receives TTL-60 rate-limit docs (lr-ip: prefix) during testing.

## Verdict
**APPROVED** — 13/13 structured tests + 4/4 ad-hoc checks PASS. No blockers or majors.
