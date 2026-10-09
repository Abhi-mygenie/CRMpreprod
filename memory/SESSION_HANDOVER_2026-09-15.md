# SESSION HANDOVER — 2026-09-15 (Profile data / CRM contract / shared-DB / order linkage)

**Branch:** `sep15` · **Code changed this session:** **NONE** (docs, registry, control decisions only)
**Roles run:** Investigation (INV-2026-09-15-001, closed) → Intake (CR-2026-09-15-001/-002/-003, INV-2026-09-15-002)
**Operating prompt:** `memory/control/MYGENIE_CUSTOMER_APP_AGENT_SYSTEM_PROMPT_ALPHA_v0_1.md` (now v0.1a — §2 Database row says *shared with CRM*)
**Owner decisions file:** `memory/control/OWNER_DECISIONS_2026-09-15.md` — **read first, do not re-ask these**

---

## 0. Start-of-session checklist for the next agent

1. Read this file, then `control/OWNER_DECISIONS_2026-09-15.md`, then `change_requests/README.md` rows dated 2026-09-15.
2. Credentials: `memory/test_credentials.md` (untracked) — UAT restaurant admin for **rid 689 (Kunafa Mahal)**. Never print them.
3. Environment facts: `https://crm.mygenie.online/api` = **UAT CRM**; `REACT_APP_CRM_API_VERSION=v2`; **MongoDB is shared with CRM** (verified). Production CRM URL + prod DB identity: **unknown, owner to confirm at release time**.
4. Owner's standing instruction across this whole thread: **follow the gates, no code without an approved plan, "no code edit" until told otherwise.**
5. Mandatory session-start block (role/reason/risk/docs/blockers/next) — owner expects it.

---

## 1. Where the investigation stands (plain English)

- Customer Profile page gets its data **from CRM directly**, not from our FastAPI backend. Header card works (`GET /scan/auth/me`). **Orders / Points / Wallet tabs are broken** because `crmService.js` still calls v1 paths `/customer/me/*` that return 404 on CRM v2. The correct CRM endpoints exist (`/scan/orders`, `/scan/loyalty`, `/scan/points/history`, `/scan/wallet/history`) — live-verified.
- Our backend's `/api/customer/*` routes are **not called by the frontend** (INV-2026-09-12-001) — true, but they are redundant *readers* of the same shared DB, not proof the feature is dead. The earlier "can be deleted outright" wording is **withdrawn**.
- **Owner chose Option A:** CRM owns customer data (login, profile, orders, points, wallet, addresses); Customer App owns the app shell (admin login, config CRUD, uploads, POS proxy, dietary tags, diagnostics).
- CRM's follow-up INV-018 explains why order history will often be empty even after the fix: 72% of orders are unlinked (93% of those have no phone from POS; CRM has zero phone normalisation → duplicate customers). Canonical phone agreed = **10-digit national, digits only**. Our +91 path already complies; our **non-+91 path blanks the number** (bug, CR-2026-09-15-003).

---

## 2. Registered items and their state

| ID | Title | Status | Next role | Blocked by |
|---|---|---|---|---|
| INV-2026-09-15-001 | Profile tabs 404 on CRM v2 + CRM contract verification (Profile + OTP) | ✅ CLOSED | — | — |
| **CR-2026-09-15-001** | Profile → CRM v2 adapter (orders/points/wallet, points ± mapping, `order_type` labels, wallet-tab gate) — 2 FE files | 📝 REGISTERED | **PLANNING** (Impact Analysis + Implementation Plan) | **Owner "go" only** — nothing else blocks it |
| CR-2026-09-15-002 | Remove dead skip-otp 409/429/Retry-After branches (OD-3 accept) | 📝 PARKED | Planning after -001; sequence with CR-2026-09-12-013 | -001 |
| CR-2026-09-15-003 | Canonical phone alignment; fix `extractPhoneNumber` blanking non-+91 numbers | 📝 BLOCKED | Planning | POS answers Q6/Q7/Q10/Q11; owner decision on CRM P-8; sequence with CR-2026-09-12-009 |
| INV-2026-09-15-002 | Shared-DB collection ownership map (who reads/writes, defaults, CRM config write-lock per OD-7, auth-secret overlap) | 📝 REGISTERED | Investigation | Owner "go" + CRM counterpart |
| CR-2026-09-12-007 | Fold-ins added: G8 remove dead `x-api-key` map; G6 JWT helper read `restaurant_id` claim | addendum written | at its Planning | OD-4 = yes **after plan approval** |
| CR-2026-09-12-006 / -014 | SHARED-DB GUARD appended: route deletion only; no collection change without owner + CRM; MySQL migration blocked until ownership map | addendum written | — | INV-2026-09-15-002 |

---

## 3. Owner decisions already taken (do NOT re-ask)

| ID | Decision |
|---|---|
| D-A | **Option A** — CRM owns customer data; we own app shell |
| OD-1 | `crm.mygenie.online` = **UAT** |
| OD-2 | Moot — shared DB, single `showWallet` flag; gate on our `RestaurantConfigContext.showWallet` |
| OD-3 | **Accept** that skip-otp logs in password customers without password (security risk accepted in writing) |
| OD-4 | **Yes** remove `x-api-key` mechanism — **after plan approval** |
| OD-5 | Not explicitly answered → treated as owner awareness; "No orders yet" is a valid state |
| OD-7 | **We** (Customer App admin UI) own writes to `customer_app_config`; CRM `PUT /scan/config/{rid}` to be treated read-only / locked by CRM |
| UAT tenant | rid **689**, pos_id 0001 (from owner's admin login) |

---

## 4. Open questions / decisions still pending from owner

| # | Question | Needed for |
|---|---|---|
| P1 | **"Go" for Planning CR-2026-09-15-001** (I proposed: mint one UAT customer token on rid 689 via skip-otp — creates one test customer on UAT CRM — capture real responses, write plan) | unblocks the customer-visible fix |
| P2 | Approve / decline CRM proposals **P-8** (normalise phone everywhere), **P-9** (migration creates customers), **P-10** (backfill + merge 38 duplicates) | CR-2026-09-15-003 scope |
| P3 | Forward POS questions (§6 below) to the POS team | CR-2026-09-15-003 |
| P4 | "Go" for INV-2026-09-15-002 and name a CRM counterpart | CR-006 / CR-014 / CR-010 unblock |
| P5 | Pre-existing leak: the admin password owner shared is already in **29 tracked docs** under `memory/` (Feb–Sep handovers). Recommend rotate + raise CR-2026-07-03-012 priority. **Not touched.** | security |
| P6 | Production CRM URL and prod `MONGO_URL`/`DB_NAME` (must be CRM's prod DB) | release checklist |
| D1/D4 | Owner said they'd get CRM clarification: missing-header status is 401 not 403 (doc error); `total` semantics differ across ledgers | contract doc hygiene |

---

## 5. CRM artefacts received (archived in `change_requests/INV-2026-09-15-001-profile-data-crm-v2-contract-gap/crm_reply/`)

| File | What it is |
|---|---|
| `INV_017_CRM_CONTRACT_REPLY_TO_CUSTOMER_APP.md` | Our questionnaire with every answer filled |
| `INV_017_CUSTOMER_SCAN_API_CONTRACT_v2.md` | Formal as-built `/scan/*` contract (envelope, auth, fields, PROPOSED P-1…P-6) |
| `INV_017_CUSTOMER_APP_CONTRACT_GAPS.md` | CRM's own gap matrix |
| `INV_017_openapi_scan_v2.json` | OpenAPI export — 26 ops / 21 paths / 14 schemas; **all 200 responses are `{}` untyped** → real responses must be captured in Planning |
| `INV_018_ORDER_LINKAGE_GAPS.md` | Order-linkage numbers, GAP-13/14, P-8/P-9/P-10, POS questions |

Our own artefacts in the same folder: `INTAKE_DOC.md`, `INVESTIGATION_REPORT.md`, `CRM_CONTRACT_VERIFICATION_REQUEST.md`, `CRM_REPLY_VALIDATION.md` (§2 confirmations, §3 D1–D4, §4 G1–G10, §5 OD-1..7, §8 addendum, §9 next steps, §10 shared-DB consequences S1–S7).

---

## 6. Questions for the POS team (send as-is)

Q1–Q9 are CRM's (INV-018 §5); Q10–Q11 are ours.

1. Why is `cust_mobile` empty on 44,682 orders — cashier skipping, or POS not sending phone in some flows (dine-in/table, KOT-first, room-service, aggregator)?
2. Does POS hold a customer `user_id` for those orders even when phone is blank? If yes, send it on `POST /api/pos/orders` — CRM matches on `pos_customer_id` first.
3. Top tenants 541, 644, **689**, 601, 623 — dine-in-heavy, or a POS build/flow dropping the phone?
4. Source of the 4+ phone formats (`9876543210`, `+91…`, `91…`, spaces/11–14 digits)?
5. Can POS normalise to **10-digit national, no +91, no spaces, no leading 0** on `POST /api/pos/orders`, `/api/pos/customer-lookup`, `/api/pos/customers`?
6. Do non-Indian numbers exist? If so agree E.164 for those only.
7. Confirm the exact format POS emits today so the app locks skip-otp/login/register to it.
8. Does `/pos/customers/{customer_id}/orders` return `user_id` for old orders (backfill by `pos_customer_id`)?
9. Is a POS customer export available to reconcile the 38 duplicate pairs?
10. **(ours)** When an app-placed order carries `cust_phone` as 10-digit national, does POS forward it to CRM **unchanged** or reformat it?
11. **(ours)** If `cust_phone` arrives empty from the app (today true for any non-+91 number), does POS reject, accept as walk-in, or substitute a default?

---

## 7. Code truth the next agent can rely on (all verified this session, `sep15`)

| Item | Location | Fact |
|---|---|---|
| Profile data source | `pages/Profile.jsx:4,56,69,87` | imports `crmGetOrders/Points/Wallet` from `crmService`; toasts "Failed to load …" on error |
| Broken calls | `api/services/crmService.js:399,407,415` | v1 paths `/customer/me/{orders,points,wallet}` — **no `isV2()` branch** |
| Working v2 calls | `crmService.js:388 (crmGetProfile), 430-543 (addresses)` | pattern to copy |
| Envelope adapter | `crmService.js:148-170` | unwraps `{success,message,data}`; throws on `success:false` |
| Already CRM-shaped UI | `Profile.jsx:253 item.item_name`, `:280 transaction_type === 'earn'` | less mapping than CRM assumed; **`bonus` currently renders as "−"** (G2) |
| Wallet flag | `context/RestaurantConfigContext.jsx:61,462 showWallet` (default false) | Profile ignores it today (G5) |
| JWT helper bug | `crmService.js:38-49`, `context/AuthContext.jsx:13-24` | read `user_id` claim; v2 tokens have `restaurant_id` → returns null. Latent: all 4 `setCrmAuth` callers pass rid explicitly |
| Dead x-api-key | `crmService.js:15-55,107-115` | CRM ignores header on all `/scan/*` |
| skip-otp dead branches | `pages/LandingPage.jsx:474-486` (409), `api/services/crmSkipOtpRetry.js:25-26,60-61` (429/Retry-After) | CRM never emits 409/429/Retry-After on skip-otp |
| Phone → CRM | `crmService.js:272-281 stripPhonePrefix` | `+91XXXXXXXXXX` → 10 digits ✅; non-+91 → `<cc><number>` ❌ |
| Phone → POS payload | `api/transformers/helpers.js:245-258 extractPhoneNumber` | `+91…` → 10 digits ✅; **non-+91 → `""`** (greedy regex) ❌ |
| Config shared with CRM | `backend/server.py:1054,1211 db.customer_app_config` | `/api/config/478` ≡ CRM `/scan/config/478` (105 keys, same `updated_at`) |
| Live CRM status (UAT, bad/no token) | — | `/scan/auth/me, /scan/orders, /scan/orders/{id}, /scan/loyalty, /scan/points/history, /scan/wallet/history, /scan/coupons, /scan/profile, /scan/addresses` → **401**; `/customer/me/*`, `/scan/points`, `/scan/wallet`, all forgot/reset-password → **404**; `/scan/config/{rid}` → **200 public** |
| OTP | — | `request-otp` sends **no SMS anywhere**, returns `dev_otp`; no password-reset endpoint exists; **CR-2026-09-14-001 quarantine stays** |

---

## 8. Dead-ends / do-not-repeat

1. Don't conclude "customer feature dead" from "backend route not called" — data path is CRM.
2. Don't re-probe CRM paths already tabled above; budget for INV-001 is spent (10/10).
3. Don't create UAT customers via skip-otp without owner "go" (it writes to the shared UAT DB).
4. Don't propose collection drops/migrations — shared DB, cross-team CRITICAL.
5. Don't re-ask decisions in §3.
6. The registry README row for INV-001 was once corrupted by a partial replace — check table rows render before saving.

---

## 9. Recommended first move for the next agent

Ask the owner exactly one thing: **"Go for Planning on CR-2026-09-15-001?"** If yes → Role 2: write `IMPACT_ANALYSIS.md` + `IMPLEMENTATION_PLAN.md` in `change_requests/CR-2026-09-15-001-profile-crm-v2-adapter/` using real UAT responses (rid 689). Files WILL change: `crmService.js` (3 functions), `Profile.jsx`. Files WILL NOT touch: `AuthContext.jsx`, `RestaurantConfigContext.jsx`, `ReviewOrder.jsx`, `server.py`, `.env`. Then stop for owner approval before Implementation.
