# Batch QA + Regression Plan — Waves 1–3 (CR-084 · 097 · 098 · 093 · 089 · 085-A · 085-A2)
**Date**: 2026-10-09 · **Role**: QA Agent (Role 4) + Regression Agent (Role 9) · **Status**: ⏸ AWAITING OWNER APPROVAL · **No code will be changed** (QA never fixes).

## 1. QA status per CR (what is done, what is not)
| CR | Change | Unit/API QA | Report | Owner smoke | Consumer validation | Gap |
|---|---|---|---|---|---|---|
| 084 | customer OTP routes deleted (`scan.py`) | ✅ 15/15 BE + 18/18 FE | `iteration_1.json` | ✅ PASS → 🔒 CLOSED | n/a | none |
| 097 | staff password mgmt deleted (`auth.py` + 3 pages) | ✅ (same run) | `iteration_1.json` | ✅ → 🔒 CLOSED | n/a | none |
| 098 | customer `register`/`login` deleted (`scan.py`) | ✅ 13/13 | `iteration_2.json` | ⏳ | ⏳ Scan & Order | smoke + consumer |
| 093 | `POST /scan/auth/lookup` (`scan.py`, indexes) | ✅ 18/18 | `iteration_3.json` | ⏳ | ⏳ Scan & Order | smoke + consumer |
| 089 | skip-otp rate limit (`scan.py`) | ✅ 14/14 limiter | `iteration_4.json` | ⏳ | ⏳ Scan & Order | smoke + consumer |
| 085-A | `core/phone.py` at 15 points (`pos.py`, `customers.py`, `scan.py`, `migration.py`, `loyalty_jobs.py`) | ✅ 16/17 + 13/13 (the 1 fail = A16, now fixed by A2) | `iteration_5.json` | ⏳ | ⏳ Scan & Order + POS | **A16 re-verify**, smoke, consumer |
| **085-A2** | guest orders + lookup hides flagged (`pos.py`) | ❌ **self-test only (68/68)** | — | ⏳ | ⏳ POS | **independent QA not done** |
| Batch | cross-item interaction regression (Role 9) | ❌ never run | — | — | — | **not done** |

Frontend QA so far: only Wave 1 (iteration_1). 085-A touched CRM Add/Update Customer (422 on invalid phone) and CSV import — **UI error display never QA'd**.

## 2. Phase A — Independent QA of CR-085-A2 (backend, preview URL, owner tenant r69 / `pos_owner_69_bdd4513c`)
Source: `qa/CR_085A2_QA_HANDOVER.md`. Testing agent re-runs the suite **and** executes the open matrix rows:
| # | Case | Expected |
|---|---|---|
| Q1 | `pytest tests/test_cr085a_normalization.py` (22) fresh | 22/22; baseline 7700 before/after |
| Q2 | V5: guest `/pos/orders` + an active r69 coupon code | 200, `coupon_usage.recorded true`, `coupon_usage` doc `customer_id null`; cleaned after |
| Q3 | V12: replay same `pos_order_id` of a guest order | 200 `success:false "Duplicate order"`, no second `orders` doc |
| Q4 | V13: `GET /api/customers?limit=…` + CRM Orders list API + `GET /pos/customers/{id}/orders` | no 500 with null-customer orders present |
| Q5 | guest `/pos/orders` → `whatsapp_message_logs` for that `reference_id` | 0 rows; `invoices` row for the order exists (customer_id "") |
| Q6 | `payment-received` junk phone + `coupon_code` | 200, `guest_order true`, `coupon_applied` present, `final_bill_amount` reduced |
| Q7 | valid-phone `/pos/orders` on r69 (6.1 minimum regression) | 200; `total_points/total_spent/total_visits` incremented; `points_transactions` row; `is_new_customer` logic; response has `guest_order:false` |
| Q8 | invalid phone + matching `pos_customer_id` | links by pos id, full loyalty |
| Q9 | A16 re-verify: `customer-lookup` on a `phone_invalid` record and on `0000000000` | `registered:false` both |

## 3. Phase B — Cross-item regression (Role 9) — shared files `scan.py`, `pos.py`, `customers.py`, `auth.py`
| # | Interaction | Test | Expected |
|---|---|---|---|
| I1 | 089 limiter key vs 085-A canonical phone | skip-otp 5× `9838777712` then 1× `+91 9838777712` and 1× `09838777712` same restaurant | **Expected per design**: all three hit the same `so-ph:` bucket → 6th call 429. **Known gap**: limiter key is `re.sub(r"\D","",phone)` (digits only) → `+91…` yields `919838777712` ≠ bucket → NOT throttled. Record as **MINOR finding** (bucket evasion by prefix) for a follow-up CR; **not** a fix in this QA |
| I2 | 093 lookup `phone_invalid` exclusion vs 085-A W3 flagged POS-created doc | create junk via `POST /pos/customers` → `scan lookup` same phone r69 | 400 (invalid) — and for a valid-but-flagged doc (cannot exist after A2) n/a |
| I3 | Deletions hold after later edits to the same files | `request-otp`, `verify-otp`, `scan register`, `scan login`, `auth/register`, `auth/forgot-password/*`, `PUT auth/reset-password` | all 404 `{detail:"Not Found"}` |
| I4 | skip-otp (098/089/085-A) still the working identity path | `98387 77712` r689 → 200 token, no new doc; `/scan/auth/me` 200; `/scan/orders` 200 | unchanged |
| I5 | 085-A W9/W10 vs CRM customers CRUD | POST valid formatted `+91 98765 43xxx` → stored digits + cc + `phone_raw`; PUT same phone different format → no duplicate; PUT invalid → 422 | unchanged |
| I6 | 085-A W11 import vs W9 dedup | CSV with `9876500002` and `+91 98765 00002` | 400 in-file duplicate (Option 1) or 1 row created, never 2 |
| I7 | Addendum 6.6 identity | POS create existing phone → merges (no dup); POS update preserves `total_points`; `/register-customer/{rid}` (W12) valid → created, invalid → 422 | unchanged |
| I8 | Staff login (097) + POS key auth untouched | `POST /auth/login` owner → 200 `access_token` + `mygenie_token`; bad `X-API-Key` → 401/403 | unchanged |
| I9 | Full pytest set, **one suite at a time**, `scan_lookup_attempts` cleared between | 084/097 · 098 · 093 · 089 · 085a · phone | all PASS, baseline 7700 |

## 4. Phase C — Frontend regression (Playwright, desktop 1920×800 + mobile 390×844)
| # | Screen | Check |
|---|---|---|
| F1 | `/login` (097) | no forgot-password UI; login with owner creds → dashboard |
| F2 | Dashboard profile menu (097) | tenant name/email + Logout only |
| F3 | `/customers` Add Customer (085-A W9) | phone `12345` → inline/toast error "Enter a valid mobile number", no row added; `+91 98765 43210` → saved, list shows `9876543210` |
| F4 | `/customers` Edit (W10) | change phone to `00000 00000` → error shown, record unchanged |
| F5 | `/customers` CSV import (W11) | file with dup-format phones → error message visible, import blocked |
| F6 | `/register` (097) | logged-out → `/login`; logged-in → dashboard |
| F7 | Orders / customer detail with a guest order (A2) | page renders, no crash, guest order shows without customer |
| F8 | `/whatsapp-automation` CRM Events | 15 cards, no "Reset Password (OTP)" |

## 5. Phase D — Owner smoke checklist (owner runs after A–C PASS; closes 098/093/089/085-A/085-A2)
1. Open Customer App on preview, enter a phone with spaces → logs into the existing account (no duplicate).
2. Enter `0000000000` → "Enter a valid mobile number".
3. In POS test till: bill with junk phone → bill accepted, no points; bill with real phone → points as before; customer lookup with junk phone → "not found".
4. CRM → Customers → Add with `12345` → clear error; Add with `+91 …` → saved clean.
5. CRM → login still works with POS creds; no reset-password anywhere.
Consumer validation (Scan & Order for 098/093/089/085-A; POS for 085-A/A2) runs in parallel — notes already in `handoff/`.

## 6. Guard-rails
- Preview URL from `/app/frontend/.env`; creds `/app/memory/test_credentials.md`; POS `X-API-Key` from `users.api_key` of `pos_owner_69_bdd4513c`.
- **Real orders only into tenant r69** (owner test tenant, 0 WhatsApp event maps → no outbound messages). Tenants 689/788/478: **read-only** probes only.
- Every created customer/order/coupon_usage/invoice deleted; `customers` count must return to **7700**; `scan_lookup_attempts` cleared at end.
- No stored document modified except test artefacts. No code changes (Role 4/9).
- Severity: BLOCKER / MAJOR / MINOR / NOTE per system prompt.

## 7. Execution & deliverables
- Testing agent run 1: Phase A + B (backend) → `test_reports/iteration_6.json`.
- Testing agent run 2: Phase C (frontend) → `test_reports/iteration_7.json`.
- QA report `qa/BATCH_QA_REGRESSION_REPORT_2026_10_09.md` + dashboard rows + I1 finding registered (MINOR, follow-up CR candidate).
- Estimated ~45 min agent time.

```
QA plan ready: Waves 1–3 (084 097 098 093 089 085-A 085-A2)
Not yet QA'd: CR-085-A2 (independent), batch cross-item regression, frontend for 085-A
Known interaction gap to record: I1 limiter key ≠ canonical phone (MINOR)
Next: OWNER APPROVAL → execute Phase A+B → Phase C → report
```
