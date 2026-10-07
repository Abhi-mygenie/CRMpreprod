# QA Handover — CR-089 `skip-otp` rate limit
**Date**: 2026-10-09 · **From**: Implementation Agent · **To**: QA Agent
**Plan**: `planning/CR_089_IMPLEMENTATION_PLAN.md` · **IA**: `planning/CR_089_IMPACT_ANALYSIS.md` · **Risk**: HIGH (sole identity path; new 429)
**Creds**: `/app/memory/test_credentials.md` · **URL**: `REACT_APP_BACKEND_URL` in `/app/frontend/.env`

## What changed (1 file)
`backend/routers/scan.py`: `_SKIP_OTP_IP_LIMIT=(30,60)`, `_SKIP_OTP_PHONE_LIMIT=(5,300)`; `skip_otp_login` gains `request: Request` and a limiter block (reuses `_lookup_rate_limited`, keys `so-ip:<ip>` and `so-ph:<rid>:<digits>`) **before** the find-or-create; 429 `{"detail":"Too many login attempts"}` + `Retry-After`. Find-or-create, token, response untouched.

## Self-test — 10/10 PASS (preview, 2026-10-09)
| # | Check | Result |
|---|---|---|
| S1 | `{}` | 422 ✅ |
| S2 | existing phone, fresh IP | 200 + token ✅ |
| S3 | 31 calls same IP, 31 existing phones | 30×200, 31st 429 `retry-after: 24`, detail "Too many login attempts" ✅ |
| S4 | 6 calls same phone, 6 IPs | 5×200, 6th 429 ✅ |
| S5 | `lookup` from the throttled IP | 200 — separate buckets ✅ |
| S6 | `scan_lookup_attempts` keys | `so-ip`, `so-ph` present alongside `ip`, `ph` ✅ |
| S7 | customers count | 7737 → 7737 ✅ |
| S8 | lookup 200 · `/auth/me` 403 · staff login 200 · register/login 404 ✅ |
| S9 | `test_cr098`, `test_cr084_cr097`, `test_cr093_lookup` | all green (needs `REACT_APP_BACKEND_URL` + `CRM_TEST_OWNER_PASSWORD` in env) ✅ |
| S10 | backend RUNNING, err log clean ✅ |

## QA asks — re-run independently
Use **fresh `X-Forwarded-For` ranges** (not 10.9.x / 10.89.x) and **existing r689 phones only** (pull 40 from Mongo `customers` where `user_id=pos_0001_restaurant_689`, `phone` matches `^[6-9]\d{9}$`) so no customers are created.
1. S1–S8 fresh.
2. After S3's 429, wait for `Retry-After` seconds + 1 → same IP → 200.
3. `Retry-After` is a positive integer ≤ 60 (IP) / ≤ 300 (phone).
4. Phone key normalisation: `"98765 43210"` and `"9876543210"` (same existing phone) share the `so-ph` bucket — 3 calls with spaces + 3 without → 6th is 429.
5. Confirm `customers` count unchanged across the whole run.
6. Backend err log clean.

## Known / out of scope
- Stored phone still raw (CR-085); only the limiter key is digit-normalised.
- `register`/`login` 404 are CR-098, expected.
