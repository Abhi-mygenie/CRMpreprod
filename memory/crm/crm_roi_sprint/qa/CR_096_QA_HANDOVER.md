# QA Handover — CR-096 `POST /scan/feedback` hybrid intake
**Date**: 2026-10-09 · **From**: Implementation Agent · **To**: QA Agent
**Plan**: `planning/CR_096_IMPLEMENTATION_PLAN.md` · **IA**: `planning/CR_096_IMPACT_ANALYSIS.md` · **Decisions**: `DECISIONS_LOG.md` 2026-10-09 (Q1 401 · Q2 400 on invalid phone · Q3 order_id null · Q4 no · Q5 fold schema fix · Q6 keep `linked`) · **Risk**: MEDIUM (public write; never-create + rate limits)
**Creds**: `memory/test_credentials.md` → `owner@kunafamahal.com / Qplazm@10` · **URL**: `REACT_APP_BACKEND_URL` in `/app/frontend/.env` · **Fixture**: r689 Kunafa Mahal · known phone `7505242126` (Abhishek Jain)

## What changed (4 files, markers `# CR-096`)
| File | Change |
|---|---|
| `backend/routers/scan.py` | `FeedbackSubmit` +3 fields (`restaurant_id`, `phone`, `country_code`) · + `_FEEDBACK_IP_LIMIT (10,60)` + `_FEEDBACK_PHONE_LIMIT (3,600)` · + `optional_customer_token` dependency · route rewritten for 3-path logic (~70 lines); `request: Request` added as param; `# CR-096` on all added groups |
| `backend/models/schemas.py` | `Feedback.customer_name` + `Feedback.customer_phone` → `Optional[str] = None` (E4 / Q5) |
| `backend/server.py` | startup: `db.feedback.create_index([("user_id",1),("created_at",-1)])` (E5) |
| `backend/tests/test_cr096_feedback.py` | new — 15 tests (F-A … F-M + F-K2 + F-ZZ) |
Not touched: `core/phone.py`, `core/auth.py`, `routers/feedback.py`, `routers/pos.py`, `FeedbackPage.jsx`, stored data.

## Route contract (Customer App — contract v1.2 additive)
`POST /api/scan/feedback`

**With valid token (Case A):**
`Authorization: Bearer <customer_token>` · body `{rating, message?, order_id?}` → `200 {success:true, message:"Feedback submitted", data:{feedback_id, linked:true}}`; `feedback_count +1`.

**No token, known phone (Case C):** body `{rating, restaurant_id, phone, country_code?="+91"}` → `200 linked:true`; no customer created.

**No token, unknown phone (Case D):** → `200 linked:false`; `customer_phone` stored; no customer created.

**No token, no phone (Case E):** body `{rating, restaurant_id}` → `200 linked:false, identity_source:"none"`.

**Error cases:** bad/expired token → `401` · invalid phone → `400 "Enter a valid mobile number"` · no `restaurant_id` (no token) → `422` · unknown `restaurant_id` → `404` · rating out of range → `400` · rate limit → `429 + Retry-After` (10/min/IP, 3/10min/phone+restaurant).

**Not changed:** token-required cases for all other `/scan/*` routes.

## Pre-existing bug fixed (E4)
`GET /api/feedback` (staff list) was 500-crashing for tenants with scan-sourced feedback rows (`customer_name:None`, schema required `str`). Now `Optional[str] = None`. Affects r478/672/762 — now returns 200.

## Implementation self-test — 15/15 PASS
| # | Test | Result |
|---|---|---|
| F-A | token path: linked, `feedback_count +1` | ✅ |
| F-B | garbage token → 401 | ✅ |
| F-C | no token + known phone → linked, customer count unchanged | ✅ |
| F-D | no token + unknown phone → unlinked, phone stored, no customer created | ✅ |
| F-E | anonymous (no phone) → linked:false, identity_source:"none" | ✅ |
| F-F | invalid phone (`0000000000`) → 400, nothing stored | ✅ |
| F-G | blocked customer phone → stored unlinked | ✅ |
| F-H | unknown `order_id` → `order_id:null`, `order_id_raw` kept | ✅ |
| F-I | no `restaurant_id` (no token) → 422 | ✅ |
| F-J | unknown restaurant_id → 404 | ✅ |
| F-K | IP: 11th request/min → 429 + `Retry-After` | ✅ |
| F-K2 | phone: 4th request/10min → 429 | ✅ |
| F-L | rating 0 → 400 · rating 6 → 400 | ✅ |
| F-M | staff `GET /api/feedback` with anonymous row → 200 (E4 fix verified) | ✅ |
| F-ZZ | cleanup: all test docs deleted; customers count unchanged | ✅ |

Regression (shared limiter): `test_cr093_lookup.py` + `test_cr089_skip_otp.py` → 39 pass / 2 skip / 1 fail.
Fail `test_S10_backend_running_and_log_clean` — transient: check finds intermediate `NameError` traceback from the E3→E2 implementation ordering gap; final backend clean (`Application startup complete`). Pre-existing pattern (same fail during CR-094).

## QA asks
1. Re-run `tests/test_cr096_feedback.py -n 0` independently (backend only). Run command: `cd /app/backend && REACT_APP_BACKEND_URL=... CRM_TEST_OWNER_PASSWORD=Qplazm@10 pytest tests/test_cr096_feedback.py -v -n 0`
2. Ad-hoc: (a) `message` > 500 chars → stored as first 500 · (b) staff `GET /api/feedback` for a tenant that previously had scan feedback (`r478` or `r672`) → no 500 · (c) `identity_source` field present on every doc type.
3. Verify `customers` count and `loyalty_settings` unchanged after the full run.
4. Severity scale per prompt §8 Role 4. Report → `qa/CR_096_QA_REPORT.md` + `test_reports/iteration_9.json` (or next available).
