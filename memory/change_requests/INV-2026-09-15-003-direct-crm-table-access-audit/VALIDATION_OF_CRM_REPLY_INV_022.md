# Validation of CRM reply INV-022 (2026-09-28) against Customer App code
## Ref: INV-2026-09-15-003 · Reply file: `crm_replies/INV_022_CRM_REPLY_ENDPOINT_VALIDATION.md`
## Verdict: **ACCEPT with 4 impacts for owner to confirm** (F1–F4 below). No contradictions found.

Method: each CRM row checked against `server.py`, `crmService.js`, `LandingPage.jsx`, `ReviewOrder.jsx`,
`FeedbackPage.jsx`, `RestaurantConfigContext.jsx`, `useScannedTable.js`, `backend/.env` keys.

---

## 0. Identity — ✅ matches our code

| CRM said | Our code | Verdict |
|---|---|---|
| Phone = exact 10 digits, no `+91` | `ReviewOrder.jsx:271` strips `+91`; `LandingPage.jsx:373` normalises `.replace(/\D/g,'').replace(/^91/,'').slice(-10)` | ✅ already compliant. Add the same normaliser in front of every `crmService` call (one helper) when wiring B1. |
| Token `restaurant_id` claim is **full** form `pos_0001_restaurant_689` | `crmService.js:30–37` already extracts short id from the full-form `user_id` claim | ✅ no change |
| Don't resend `restaurant_id` on authenticated routes | `crmService.js` only sends it on `register`/`login` bodies (pre-token) | ✅ |

## A. Logged-in endpoints — ✅ all usable; 5 field-mapping notes

| # | CRM "OK, but" | Impact on us | Action |
|---|---|---|---|
| A2 | no `skip`, cap 50 | `Profile.jsx` has no pagination today | none now; CR-088 later |
| A2 | raw order doc, map fields ourselves | adapter: `id→order_id`, `created_at→date`, `order_amount→total`, `order_status→status` | part of CR-2026-09-15-001 |
| A4 | no `order_id` on points row | we only display description/date | none |
| A5 | no `balance_after` | show balance from `/scan/loyalty` instead | part of CR-001 |
| A6 | `end_date` not `expires_at` | adapter | CR-001 |
| A9 | **token required**; `name`/`email` **not accepted**; `order_id` optional | `FeedbackPage.jsx` today is anonymous with Name/Email fields | **F1 — owner decision** (see below) |
| A10 | field is `table_id` | `useScannedTable.js` exposes `tableId` | ✅ when O5 is implemented |

## B. Pre-login — ✅ CRM builds 2 endpoints; 1 behaviour change

| # | CRM answer | Our current flow | Impact |
|---|---|---|---|
| B1 | `POST /scan/auth/lookup {phone, restaurant_id}` → `{exists, name}` (CR-093) | `LandingPage.jsx:86` → our `/api/auth/check-customer` (reads `customers`) | 1-line swap. Our route deleted after. ✅ |
| B2 | points/tier/wallet stay login-gated; "move login before checkout" | **We already do.** `LandingPage.jsx:462` calls `crmSkipOtpWithRetry` when the guest submits phone (per `skipOtp*` config flags) → CRM token exists before checkout → points come from A1. Only the **degraded guest path** (skip-otp failed / OTP flow while CRM SMS is off) shows points via our `/api/customer-lookup` (`ReviewOrder.jsx:418`, `:860`). | **F2** — degraded-guest checkout loses the points/tier preview; name pre-fill stays via B1. Acceptable? |
| B3 | `GET /scan/loyalty-rules/{rid}` public (CR-094); will NOT put it in `/scan/config` | `ReviewOrder.jsx:145` → our `/api/loyalty-settings/{rid}` (reads `loyalty_settings`). Fields CRM listed ⊇ fields we read (`*_earn_percent, redemption_value, min_order_value, first_visit_bonus_*`) | 1-line swap. ✅ |

## C. Admin login — ✅ CRM is right, and we already have the POS code

| CRM said | Our code | Verdict |
|---|---|---|
| Authenticate against **MyGenie POS** directly, as CRM does (`login` → `profile`) | `server.py:410 refresh_pos_token()` **already** calls POS `/auth/vendoremployee/login` with the admin's email+password during our admin login, to fetch a POS token for QR/admin ops. `MYGENIE_API_URL` is in `.env`. | ✅ feasible with small change: stop `db.users.find_one`; call POS login → POS **profile** → take `restaurants[0].id`, `name`; mint our JWT. |
| `pos_id` constant `"0001"` | we hardcode `'0001'` in `LandingPage.jsx:90` and build `pos_0001_restaurant_{id}` | ✅ consistent (POS P3 effectively answered by CRM) |
| Don't call POS "register CRM token" | we never do | ✅ |
| Need POS **profile** endpoint path | we don't have it yet — only `vendoremployee/login` and `/auth/login` | **F3 — ask POS**: profile endpoint + can `restaurants[]` have >1 entry |
| "frozen `users` fields" contract **retired** | — | CR-2026-09-15-004 → new **Option D: POS direct** (replaces A/B). O4/B4 closed. |

## D. Write-locks — ✅ agreed; our answer to Q-CA-1 is "already"

| # | CRM said | Our code |
|---|---|---|
| D1 | O1 = Customer App; CRM removes `PUT` **and** `GET /scan/config/{rid}` after we confirm we read config directly | `RestaurantConfigContext.jsx` → `GET /api/config/<rid>` (our backend, our collection). **No** frontend file calls `/scan/config`. ✅ CRM can remove both routes **now**. |
| D2 | CRM removes `PUT`+`GET /scan/menu/dietary-tags/{rid}` | we call our `/api/dietary-tags/available`. No `/scan/menu/dietary-tags` caller. ✅ remove now. |

## E. Housekeeping — board updates

| # | CRM said | Board / doc update |
|---|---|---|
| E1 | JWT fallback **removed** in codebase; live host build being verified (GAP-11) | **O3 → effectively resolved**; keep one line: "confirm live host runs it". |
| E2 | PUT doesn't normalise rid; moot after D1; all 13 docs short-id | B3 (old) closed. |
| E3 | none of the 4 exist in preprod; `customer_otps` is the OTP store, **`otp_tokens` does not exist** | board: drop `otp_tokens` row; `pos_event_logs` stays (auto-create). |
| E4 | `import_logs`, `webhook_logs`, `coupon_distributions`, `customer_documents` = **CRM-owned** | board: 4 rows move from "Unknown owner" → "CRM exclusive". POS P2 closed. |
| E5 | will fill board JSON — **has not received the file** | owner to send `CRM_BRIEF_OWNERSHIP_BOARD.md` (Q-CA-5). |

---

## F. Four things the owner must confirm before we reply

| # | Question | Recommended answer |
|---|---|---|
| **F1** | Feedback becomes **login-only** (CRM takes name/phone from token; no `name`/`email` fields; optional `order_id`). Accept, or ask CRM for an anonymous-feedback CR? | **Accept.** In skip-otp flows the diner already has a token. Remove Name/Email fields; add "which order?" picker (optional). |
| **F2** | Degraded-guest checkout (no CRM token) loses the points/tier preview. Name pre-fill survives via B1. Accept? | **Accept.** Degraded path is already a fallback; points preview there was reading CRM's table. |
| **F3** | Admin login moves to **POS direct** (CR-004 Option D). Needs POS profile endpoint from POS team. Approve direction? | **Approve.** We already call POS login in the same flow; removes last CRM-table read. |
| **F4** | Q-CA-1 date: we already read both collections directly → tell CRM "remove the 4 routes now"? | **Yes — "already true, remove now".** |

## G. Draft answers to CRM's Q-CA-1…5 (send after F1–F4 confirmed)

| # | Answer |
|---|---|
| Q-CA-1 | **Already true today.** `RestaurantConfigContext` reads `GET /api/config/{rid}` (ours); dietary tags via `GET /api/dietary-tags/available` (ours). No Customer App code calls `/scan/config` or `/scan/menu/dietary-tags`. Remove all 4 routes at your convenience. |
| Q-CA-2 | **Customer App does not read `pos_event_logs`.** Our Call Waiter / Pay Bill buttons are stubs; when wired (O5) we will only `POST /scan/call-waiter` / `/scan/request-bill`. Consumer must be POS or it is dead — we have asked POS (P1). |
| Q-CA-3 | **Validated, accepted.** We already call POS `/auth/vendoremployee/login` during admin login (`refresh_pos_token`). We will add POS profile → `restaurants[0].id`, mint our own JWT, and stop reading `users`. We will not call CRM-token registration. Open with POS: profile endpoint path; multi-restaurant `restaurants[]`. |
| Q-CA-4 | **Validated.** B1 → replaces our `check-customer`. B3 → replaces our `loyalty-settings`. B2: login already precedes checkout in all skip-otp flows (`crmSkipOtp` on landing page); only the degraded-guest fallback loses points preview — accepted. Feedback: accept login-only, will drop name/email fields. Please proceed with CR-093/094. |
| Q-CA-5 | Attached: `CRM_BRIEF_OWNERSHIP_BOARD.md`. |

## H. Residual open items after this reply

- **Owner:** F1–F4 (above) · O5 Call Waiter scope · O7 approve deleting 14 dead sites.
- **POS:** P1 (`pos_event_logs` consumer) · P4 (phone format) · **new P5** POS profile endpoint + multi-restaurant.
  P2 (closed by E4) · P3 (closed by C1: `pos_id` constant).
- **CRM:** build CR-093 (lookup) / CR-094 (loyalty-rules) / CR-095 (remove 4 routes) · fill board JSON · GAP-11 live-host check.
