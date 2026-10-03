# INV-022 — Validation of Customer App brief `CRM_BRIEF_ENDPOINT_VALIDATION.md` (ref INV-2026-09-15-003)

**Project:** MyGenie CRM · **Sprint:** `crm_roi_sprint` · **Role:** INVESTIGATION (Role 6) · **Date:** 2026-09-28
**Code changed:** NONE. **Data written:** NONE. All probes read-only against preprod Mongo (`mygenie`).
**Inbound artifact:** `/app/memory/crm/inbox/CRM_BRIEF_ENDPOINT_VALIDATION.md`
**Outbound reply (owner-approved content, send pending owner):** `INV_022_CRM_REPLY_TO_CUSTOMER_APP_ENDPOINT_VALIDATION.md`
**Status:** **FINAL — investigation closed 2026-09-28.** Next gate: INTAKE.

---

## 1. Trigger

Customer App team (after owner discussion) sent a 30-row brief: their owner ruled the Customer App must never read/write CRM collections; everything must come via `/scan/*`. They asked CRM to confirm each row `OK / OK, but / MISSING`, plus two write-locks (D1/D2) and five housekeeping questions.

Owner (CRM) added the **symmetric rule** during this investigation: *CRM must never read Customer App collections directly either.*

## 2. Hypotheses & evidence

| # | Hypothesis | Evidence checked | Result |
|---|---|---|---|
| H1 | Most A-rows already exist as described | `scan.py` routes 351–879, response shapes, DB field samples (`points_transactions`, `wallet_transactions`, `coupons`) | 4 exact, 6 exist with field/auth differences |
| H2 | B-rows (pre-login) have an existing endpoint somewhere in the backend | whole-backend grep: `pos.py:2041 customer-lookup`, `pos_loyalty.py:44 loyalty/settings`, `points.py:304 loyalty/settings` | shapes exist, **auth model doesn't fit** a public web client → new endpoints needed |
| H3 | CRM is the admin identity provider (C1) | `auth.py:360-559 mygenie_login` | **False** — CRM proxies MyGenie POS and caches into `users` |
| H4 | `PUT /scan/config` / `PUT /scan/menu/dietary-tags` are used by CRM | frontend grep, backend grep, tests grep, DB `created_at` trace, Old API doc C4/C5 origin | **Dead code** — orphan endpoints, never called, never built a UI |

Steps used: 9/10.

## 3. Findings

### 3.1 Identity model — confirmed with one correction
- Pre-login `phone` (10-digit, exact string match — CRM does not normalise; CR-085 open) + `restaurant_id` short or full (short normalised to `pos_0001_restaurant_{rid}`).
- Customer JWT claims: `customer_id`, `restaurant_id` (**full** form), `phone`, `type:"customer"`; HS256, 24 h, no refresh.
- Authenticated `/scan/*` routes ignore any `restaurant_id` sent — tenant comes from JWT. ✅ their assumption holds.

### 3.2 Section A — logged-in (token)
| # | Verdict | Difference |
|---|---|---|
| A1 | OK | `/auth/me` = full customer doc minus `password_hash`; `/loyalty` = `total_points, tier, next_tier, points_to_next_tier, wallet_balance, points_monetary_value, earn_rate_percent, redemption_value_per_point, total_visits, total_spent` |
| A2 | OK, but | no `skip` (limit only, default 20, cap 50); raw order doc fields (`id, pos_order_id, restaurant_order_id, order_amount, order_status, created_at, order_created_at…`); `total` = full count |
| A3 | OK | full order doc incl. `items[]` (`item_name, item_qty, item_price, variant, add_ons, item_category`); own orders only |
| A4 | OK, but | fields `points, transaction_type(earn/redeem/bonus/expired), description, created_at`; **no `order_id`**; `total` = rows returned |
| A5 | OK, but | fields `amount, transaction_type, description, created_at`; **no `balance_after`** |
| A6 | OK, but | rich coupon doc; **no `expires_at`** → use `end_date`; useful: `code, title, description, discount_type, discount_value, max_discount, min_order_value, start_date, end_date, valid_days, per_user_limit, my_usage_count` |
| A7 | OK | accepts `name, email, dob, anniversary, gender, preferred_language, allergies[], favorites[], diet_preference, spice_level, cuisine_preference`; phone immutable |
| A8 | OK | unchanged |
| A9 | OK, but | **token required**; body `{rating 1–5, message?, order_id?}`; **`name`/`email` not accepted** (taken from token's customer) |
| A10 | OK, but | body field is **`table_id`** (+ optional `message`), not `table_no`; token required; writes `pos_event_logs` |

### 3.3 Section B — pre-login (phone + rid only) — all MISSING, CRM builds
| # | Verdict | Why existing endpoints don't fit | CRM will build |
|---|---|---|---|
| B1 | MISSING | `POST /api/pos/customer-lookup` needs tenant POS API key (cannot ship in a browser) and returns full customer + loyalty + documents | **`POST /scan/auth/lookup`** → `{exists, name}` only; no create, no token, rate-limited |
| B2 | MISSING | same; and exposing points/tier/wallet from a typed phone is a privacy leak | **Points/tier/wallet require login.** Name prefill via B1 endpoint. Customer App moves OTP/login before checkout |
| B3 | MISSING | `GET /api/pos/loyalty/settings` (CR-080 L-1) has the right whitelist but POS auth; `GET /api/loyalty/settings` is staff-only full doc; `/scan/config` is Customer-App-owned (must not be polluted) | **`GET /scan/loyalty-rules/{rid}`** public, CR-080 whitelist + `min_order_value`, `first_visit_bonus_enabled`, `first_visit_bonus_points` |

`skip-otp` as a B1 stand-in is **rejected**: it creates a customer per typed phone with zero verification (junk data + CR-089 amplification).

### 3.4 Section C — admin login → Option (a) chosen
CRM is **not** the identity provider. `POST /api/auth/login` → MyGenie POS `login` → POS `profile` → derives `restaurant_id = restaurants[0].id`, `pos_id="0001"` (hardcoded), caches in `users`, mints a CRM **staff** JWT. Side-effects: re-hash password, API-key backfill, register CRM token with POS, tax-field sync, loyalty-settings creation. `GET /api/auth/me` also returns `meta_access_token`.

**Option (a) — Customer App authenticates against MyGenie POS directly** (owner preferred):
| Area | Impact |
|---|---|
| CRM code | none |
| `users` collection | Customer App stops reading it → prior "frozen `users` read-contract" **retired** |
| JWT-secret overlap (P0 Issue 3) | resolved by design — no shared secret |
| Fields they get | `restaurants[0].id`, `name`, `phone`, `emp_email`; `pos_id` hardcode `"0001"` like CRM |
| Dependency | POS uptime (same as CRM today) |
| POS coordination | same `MYGENIE_API_URL` / login / profile endpoints; **must not** call the CRM-token-registration endpoint |
| C2 | not needed |
| Risk | multi-restaurant admins — CRM takes `restaurants[0]`; ask POS if `restaurants[]` is ever >1 |

### 3.5 Section D — write-locks (owner: D1 YES, D2 YES)
**Origin:** April-2026 API-doc exercise (`/app/memory/Old API doc/`) found `customer_app_config` (28 docs) and `dietary_tags_mapping` (5 docs) with zero CRM code. The plan marked them "Planned C4/C5 — CRM admin updates branding from dashboard". `scan.py` was built accordingly; the CRM **frontend screen was never built**. Assumption that CRM would be the Customer App's admin surface was never agreed with that team.

**Dead-code evidence:** no frontend reference; no backend caller; no tests; none of the 13 config docs has `created_at` (CRM PUT adds it on insert → CRM never created one); `dietary_tags_mapping` does not exist in preprod.

**Danger evidence:** routes still mounted; any CRM staff JWT can write; **unscoped** — `restaurant_id` taken from URL, never compared to `user["id"]` → admin of A can overwrite B's config. 61 keys (`AppConfigUpdate`, `scan.py:102-170`). Last-writer-wins, no audit.

**Decision:** remove **all four** routes — `PUT+GET /scan/config/{rid}`, `PUT+GET /scan/menu/dietary-tags/{rid}` (GETs per symmetric rule). CRM impact: zero. **Sequencing:** Customer App currently reads `GET /scan/config` → they confirm cutover to their own collection → CRM removes.

### 3.6 Section E — housekeeping
| # | Answer |
|---|---|
| E1 | Fallback secret already removed in repo (`core/auth.py:11` `os.environ['JWT_SECRET']`, no default). Live build provenance = GAP-11 (open) |
| E2 | No — PUT stores the URL form as-is (`scan.py:761`); moot after D1 removal. All 13 docs use short ids |
| E3 | Preprod: `pos_event_logs` MISSING (created on first event) · `otp_tokens` MISSING (CRM uses `customer_otps`, 5 docs) · `segment_whatsapp_config` MISSING · `message_logs` MISSING. Prod not probed |
| E4 | `import_logs`, `webhook_logs`, `coupon_distributions`, `customer_documents` — all **CRM-owned** |
| E5 | Yes, once ownership board received (`CRM_BRIEF_OWNERSHIP_BOARD.md` not in CRM inbox) |

### 3.7 Symmetric-rule impact on CRM
- CRM reads Customer-App-owned collections only in `scan.py` C4/C5 (`customer_app_config`, `dietary_tags_mapping`) → removed with D1/D2.
- `pos_event_logs` written by CRM (`scan.py` call-waiter/request-bill, `pos.py:2484`), read by nobody in CRM → **ownership unresolved**; ask Customer App/POS in brief.

## 4. Owner rulings recorded (2026-09-28)
1. B1/B2 — agreed: name-only lookup; points need login. CRM builds.
2. B3 — agreed: CRM builds and names the endpoint. CRM builds.
3. C1 — Option (a). Impact table to be validated by Customer App.
4. D1 — YES. D2 — YES. Expanded to GETs under symmetric rule.
5. Send nothing until owner approves outbound brief.
6. Symmetric rule: CRM never reads Customer App collections.
7. Customer App → CRM data only via API; prior `users` read-freeze retired.

## 5. Proposed intake items (NOT registered — INTAKE gate)
| Proposed | Scope | Sev / Risk | Est. |
|---|---|---|---|
| CR-093 | `POST /scan/auth/lookup` — phone+rid → `{exists,name}`; no create/token; rate-limit | P1 / HIGH (auth-adjacent, public) | ~1 h |
| CR-094 | `GET /scan/loyalty-rules/{rid}` — public whitelist (CR-080 L-1 + `min_order_value`, `first_visit_bonus_*`) | P2 / MEDIUM | ~1 h |
| CR-095 | Remove `/scan/config` + `/scan/menu/dietary-tags` (4 routes) after Customer App cutover confirmation; includes unscoped-tenant hole | P1 / CRITICAL (other team's prod data) | ~15 min + cutover gate |
| — | C1 Option (a): no CRM code; coordination note to POS agent | — | — |
| — | Retire `users` read-freeze on dashboard | — | docs |

Related existing: CR-088 (`skip`, `total`), CR-089 (skip-otp guard rails), CR-085 (phone format), GAP-11.

## 6. Open questions carried into the brief
- Q-CA-1: Confirm cutover date for reading `customer_app_config` directly (gates CR-095).
- Q-CA-2: Who owns / consumes `pos_event_logs`?
- Q-CA-3: Validate C1 Option (a) impact on your admin panel; confirm you will not call CRM-token registration.
- Q-CA-4: Validate impact of B1/B2/B3 contracts on your landing + checkout flows.
- Q-CA-5: Send `CRM_BRIEF_OWNERSHIP_BOARD.md` (E5).
- Q-POS-1: Is `restaurants[]` on the profile response ever >1 for a single admin?

---

```text
Investigation complete: INV-022
Root cause: Customer App brief validated — 4 rows exact, 6 rows exist with field/auth differences, B1-B3 + C1-C2 missing (B via new CRM endpoints; C via POS-direct auth). PUT/GET /scan/config + dietary-tags are orphan, unscoped routes from an unagreed April-2026 assumption.
Classification: INTERACTION (cross-app contract) + BE (dead/unscoped routes)
Confidence: HIGH
Steps used: 9/10
Evidence: backend/routers/scan.py · backend/routers/auth.py:360-559 · backend/core/auth.py:11 · backend/routers/pos.py:2041 · backend/routers/pos_loyalty.py:44 · Old API doc/API_DOC_CRM_APP.md §C4-C5 · preprod Mongo (customer_app_config ×13, collections existence)
Recommendation: Owner approves outbound brief → INTAKE for CR-093 / CR-094 / CR-095 → PLANNING
Report: crm/crm_roi_sprint/investigations/INV_022_CRM_REPLY_ENDPOINT_VALIDATION_BRIEF.md
```
