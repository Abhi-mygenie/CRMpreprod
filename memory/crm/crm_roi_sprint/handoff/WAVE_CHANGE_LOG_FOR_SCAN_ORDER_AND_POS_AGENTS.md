# Running change log for Scan & Order (Customer App) and POS agents
**Purpose** (owner ruling 2026-10-08): every CRM change that touches a route, payload, collection or behaviour the Customer App or POS can see is recorded here **at the end of each implementation**. After all waves close, this log is consolidated into **new contracts** for both teams (supersedes `CONTRACT_CUSTOMER_APP_CRM_v1.0` for Customer App; `CR_079_CR_081_CR_080_POS_API_CONTRACT_v1_FINAL.md` lineage for POS).

**Rules**
- A row is **DRAFT** when written at planning; flipped to **CONFIRMED** by the Implementation Agent at exit gate with date + evidence.
- Owner approves the outbound send; agents never send on their own.
- Columns: *Audience* = Customer App / POS / Both.

---

## Wave 1 — Security cleanup

### CR-084 — Customer OTP flow removed
| Field | Value |
|---|---|
| Status | **CLOSED both sides** — CRM 🔒 2026-10-08 (QA 15/15, owner smoke) · **Customer App confirmed 2026-10-08**: residual OTP code deleted, grep 0 results |
| Audience | Customer App |
| Removed | `POST /api/scan/auth/request-otp` · `POST /api/scan/auth/verify-otp` → **404** (verified on preview 2026-10-08; pre-change 422) |
| Unchanged | `POST /api/scan/auth/skip-otp` (today's login) · `POST /api/scan/auth/register` · `POST /api/scan/auth/login` (password) · all token-gated `/scan/*` |
| Coming | `POST /api/scan/auth/lookup` (CR-093) — exists-check without token/creation |
| Collections | `customer_otps` no longer written (5 legacy docs remain; drop deferred) |
| Why | OTP code was returned in the response body (`dev_otp`) → anyone could mint a customer JWT. Owner: Customer App has no OTP step. |
| Action for Customer App | Remove any residual call to the two routes. No payload changes elsewhere. |
| Evidence at CONFIRM | curl 404 ×2 ✅ · skip-otp 422-on-`{}` (alive) ✅ · login 200 ✅ · session: `handoff/SESSION_2026_10_08_HANDOVER_WAVE1_CR084_CR097_IMPL.md` |

### CR-097 — Staff password management removed
| Field | Value |
|---|---|
| Status | **CONFIRMED 2026-10-08** (implemented, self-test 12/12; QA pending) |
| Audience | POS (informational) |
| Removed | `POST /api/auth/register` · `PUT /api/auth/reset-password` · `POST /api/auth/forgot-password/{request-otp,verify-otp,reset}` → **404** (verified on preview 2026-10-08; pre-change 422/403/400) |
| Unchanged | `POST /api/auth/login` → `mygenie-login` → POS `MYGENIE_LOGIN_ENDPOINT` + profile. Token push `register_crm_token_with_pos` unchanged. |
| Collections | `otp_tokens` no longer written (0 docs). `users.password_hash` still cached at login, never read. |
| WhatsApp | `reset_password` CRM automation event removed from `CRM_EVENTS` (no tenant had mapped a template). |
| Why | CRM has no local credential store in practice — 40/40 users provisioned via POS. Staff OTP was also returned in response body. |
| Action for POS | None. POS remains the single owner of staff passwords; "forgot password" is a POS-side flow. |
| Evidence at CONFIRM | curl 404 ×5 ✅ · login 200 ✅ · `GET /whatsapp/automation/events` crm_events 15 ✅ · session: `handoff/SESSION_2026_10_08_HANDOVER_WAVE1_CR084_CR097_IMPL.md` |

### CR-090 — Closed OBSOLETE (no code)
| Audience | Customer App (informational) |
| Note | CRM will not build an OTP delivery channel or customer password reset. Customer identity: POS auth (C1-a) + CRM `skip-otp`/`lookup`. |

---

## Wave 2 — Customer App unblockers
### CR-098 — Customer password routes removed
| Field | Value |
|---|---|
| Status | **CONFIRMED 2026-10-08** (implemented, self-test 9/9; QA pending) |
| Audience | Customer App |
| Removed | `POST /api/scan/auth/register` · `POST /api/scan/auth/login` (phone + password) → **404** (verified on preview 2026-10-08; pre-change 422) |
| Unchanged | `POST /api/scan/auth/skip-otp` (the only identity path) · `GET /api/scan/auth/me` · all token-gated `/scan/*` |
| Coming | `POST /api/scan/auth/lookup` (CR-093, next) |
| Why | Owner ruling (a)/(b) 2026-10-08: skip-otp is the only path; 2 password-holders, both test data; no reset flow; `register` could set a password on any existing customer by phone. |
| Action for Customer App | Remove `/password-setup` and any call to the two routes. Retire per-restaurant `skipOtp*` flags. |
| Evidence | curl 404 ×2 · skip-otp 200 for the former password-holder (no lock-out) · staff login 200 |

### CR-093 — `POST /scan/auth/lookup` LIVE
| Field | Value |
|---|---|
| Status | **CONFIRMED 2026-10-08** (implemented, self-test 12/12; QA + consumer validation pending) |
| Audience | Customer App |
| New | `POST /api/scan/auth/lookup` `{phone, country_code?="+91", restaurant_id}` → `200 {exists, name\|null}` · 400 invalid · 429 + `Retry-After` (10/min/IP, 5/5min/phone+rid). Read-only, never creates, no token. Duplicates → oldest. Blocked → `exists:false`. |
| Unchanged | `skip-otp`, `/auth/me`, all other `/scan/*` |
| Known gap | stored phones with embedded `+cc`/spaces or missing `country_code` don't match until CR-085 |
| Evidence | L1–L12 in `qa/CR_093_QA_HANDOVER.md`; customers count unchanged 7737; IXSCAN on `idx_customers_user_phone` |
| Validation note | `handoff/CRM_TO_SCAN_ORDER_CR093_LOOKUP_LIVE_PLEASE_VALIDATE_2026_10_08.md` (owner sends) |

### CR-089 — `skip-otp` rate-limited
| Field | Value |
|---|---|
| Status | **CONFIRMED 2026-10-09** (implemented, self-test 10/10; QA + consumer validation pending) |
| Audience | Customer App |
| Changed | `POST /api/scan/auth/skip-otp` may now return `429 {"detail":"Too many login attempts"}` + `Retry-After`. Limits: **30/min per IP**, **5 per 5 min per phone+restaurant**. Separate buckets from `lookup`. |
| Unchanged | request shape, success response, find-or-create, 24 h token |
| Evidence | S3 31st call 429 `retry-after: 24`; S4 6th call 429; lookup from throttled IP 200; customers count unchanged |
| Validation note | `handoff/CRM_TO_SCAN_ORDER_CR089_SKIP_OTP_RATE_LIMIT_PLEASE_VALIDATE_2026_10_09.md` (owner sends) |

_CR-094 loyalty-rules — row added when implemented_

### POS-facing note 2026-10-08 (owner-corrected: gaps are CRM-side; POS ask is optional)
| Field | Value |
|---|---|
| Status | **INFO / optional ask — not yet sent** (goes with consolidated POS contract) |
| Audience | POS |
| What POS already does right | Customer sync object and `POST /api/pos/customers` send `phone` **and** `country_code` as separate fields. |
| Optional ask | Add `country_code` to the order webhook (`customer_phone` only today) and to `POST /api/pos/customer-lookup` (`phone` only). Nice-to-have; CRM defaults `+91`. Entry-screen validation (no `+`, spaces, placeholders in `phone`) welcome but CRM will normalise regardless. |
| CRM-side fixes (CR-085, no POS dependency) | (1) normalise `phone` on every write path (sync, webhook, POS-create, skip-otp, Add Customer); (2) importer writes `country_code`; (3) importer same-phone double insert; (4) one dedup key `{user_id, phone, country_code}` on every channel (today only sync); (5) webhook must not create on blank phone. |
| Evidence | 7,383/7,385 synced carry `country_code:"+91"` incl. `phone:"+61 404668073"` — CRM stored it verbatim (`customers.py:373`). Every real-phone duplicate group: POS held 1 record, CRM made the extras. |

## Wave 3 — Customer identity foundation
### CR-085-A + 085-A2 — canonical phone + guest orders (IMPLEMENTED 2026-10-09; A2 QA pending)
| Field | Value |
|---|---|
| Status | **CONFIRMED 2026-10-09** (implemented; QA + consumer validation pending) |
| Audience | **Both** |
| Customer App | `skip-otp` and `lookup` now normalise `phone` (spaces/dashes/`+91`/leading 0 removed; foreign `+cc` → `country_code`) and match on `{restaurant, phone, country_code}` → a diner typed as `"98387 77712"` logs into the **same** record as `9838777712`. **Invalid phone → `400 "Enter a valid mobile number"`** on `skip-otp` (new). |
| POS | All POS routes accept exactly what they accept today; **nothing is rejected**. Stored `phone` is now digits-only + `country_code`; `phone_raw` kept when we changed it; junk phones (`0000000000`, 9-digit…) stored with `phone_invalid:true` and excluded from WhatsApp/loyalty jobs/lookup. **085-A2 LIVE on preview 2026-10-09**: bills with a junk/blank phone are now **GUEST ORDERS** — `/pos/orders` returns `success:true` with `customer_id:null`, `guest_order:true`, `guest_reason:"invalid_phone"`, `points_earned:0`, `tier:null`; no customer is created or credited, no WhatsApp sent, invoice still generated; coupon usage still recorded (no per-customer limit). `pos_customer_id` match still wins (full loyalty). `payment-received` with junk phone → `customer_id:null, guest_order:true` + coupon maths. **`customer-lookup` now returns `registered:false` for junk phones and for records flagged `phone_invalid`** → capture a fresh number. Send `pos_customer_id` or a valid phone to keep attribution. |
| Evidence | A2/A5/A6/A8/A13 in `qa/CR_085A_QA_HANDOVER.md` |
| Field | Value |
|---|---|
| Status | **DRAFT** (IA closed 2026-10-09) → CONFIRMED at implementation |
| Audience | POS (informational) · Customer App (informational) |
| Behaviour change | Bills arriving with an **invalid/placeholder phone** (`0000000000`, 9-digit, etc.) and **no `pos_customer_id`** will be stored as **guest orders** (`customer_id: null`) instead of adding a visit to a placeholder customer. Bills with `pos_customer_id` are unaffected (matched on it first). Valid phones are normalised (spaces/`+91`/leading 0 removed; foreign `+cc` kept as `country_code`). |
| Ask (optional) | If a restaurant wants a shared walk-in bucket, send its `pos_customer_id`. |
| No change | All POS routes, payloads and response shapes unchanged. Nothing is ever rejected on POS paths. |
_CR-086 · CR-087 · CR-096 — rows added when planned_

## Wave 4 — Cleanup + hardening
_CR-095 · CR-089 · CR-088_

---

## Consolidation checklist (run after last wave closes)
- [ ] Every row CONFIRMED with date + evidence
- [ ] Customer App contract v2 drafted from Customer-App rows (supersedes v1.0 §4a/§4b/§4c)
- [ ] POS contract addendum drafted from POS rows
- [ ] Owner sign-off → send
