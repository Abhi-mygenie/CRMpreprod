# CRM Reply Validation — INV-2026-09-15-001 (CRM ref INV-017)

**Role:** Investigation (Role 6) — read-only, no code
**Date:** 2026-09-15 · **Steps used:** 9/10 (cumulative for this INV)
**Inputs validated:** `INV_017_CRM_CONTRACT_REPLY_TO_CUSTOMER_APP.md`, `INV_017_CUSTOMER_APP_CONTRACT_GAPS.md`, `INV_017_CUSTOMER_SCAN_API_CONTRACT_v2.md` (2 uploads were the same reply file; `INV_017_openapi_scan_v2.json` **not received**)
**Method:** each CRM claim checked against (a) live read-only probes on `https://crm.mygenie.online/api` with no/invalid token, (b) Customer App code on `sep15`.

---

## 1. Verdict

CRM's core claim is **correct and confirmed live**: orders / points / wallet exist under `/scan/*`; `/customer/me/*` never existed. Root cause stays **FE partial v2 migration** (our INVESTIGATION_REPORT §3) — CRM classifies it the same way (their GAP matrix §1 "CONFIG/CONTRACT (FE)").

Reply is **ACCEPTED with 4 discrepancies (§3) and 10 Customer-App-side gaps (§4)** that must be carried into the Planning CR. Nothing here requires CRM code for the MVP fix; several items need **owner decisions** (§5).

---

## 2. Claims confirmed (live, 2026-09-15)

| CRM claim | Probe | Result |
|---|---|---|
| `GET /scan/loyalty` exists | bad token | 401 `Invalid customer token` ✅ |
| `GET /scan/points/history?limit=50` exists | bad token | 401 ✅ |
| `GET /scan/wallet/history?limit=50` exists | bad token | 401 ✅ |
| `GET /scan/orders?limit=50`, `/scan/orders/{id}` exist | bad token | 401 ✅ |
| `GET /scan/coupons`, `GET /scan/profile` exist | bad token | 401 ✅ |
| `GET /scan/config/{rid}` public | no token, rid 478 | **200** full config envelope ✅ (see G10) |
| `/customer/me/*`, `/scan/points`, `/scan/wallet`, all forgot/reset paths → 404 | earlier probes | ✅ matches our report §2.2 |
| OTP is dev-only, `dev_otp` echoed; no SMS provider | matches CR-2026-09-14-001 INTAKE §1 | ✅ — quarantine stays |
| `/scan/auth/me` returns `tier,total_points,wallet_balance,addresses[]` | consistent with header card working & AuthContext session restore | ✅ (field-level confirmation needs a UAT token — owner) |
| Envelope `{success,message,data}` | `/scan/config/478` response | ✅ our `crmFetch` adapter already unwraps it |

---

## 3. Discrepancies in the CRM reply (CRM to correct / deliver)

| # | CRM said | Observed | Impact |
|---|---|---|---|
| D1 | Missing `Authorization` header → **403** | **401** `{"detail":"Not authenticated"}` on all 7 authenticated routes | Doc error only. Our interceptors treat 401 as expired token → same handling. Contract §0 row "Transport errors" should read 401. |
| D2 | `INV_017_openapi_scan_v2.json` attached (21 paths, 14 schemas) | **Not in the 4 uploads** (one was a duplicate of the reply .md) | We cannot pin field types/enums machine-readably for the CR verification matrix. **Request the file.** |
| D3 | Contract §base URL: "Preprod pod: `<REACT_APP_BACKEND_URL>/api`"; "production CRM URL not documented" | Our app is pointed at `crm.mygenie.online` — CRM did not say whether that host is UAT or production | **Owner must confirm the environment** before any UAT token is minted or any CR is smoke-tested against it. |
| D4 | `/scan/orders` → `total` = full count; `/scan/points/history` & `/scan/wallet/history` → `total` = rows returned (≤50) | Semantics differ across the three ledgers | "Showing X of N" is only possible for orders. Note for Planning; ask CRM to align (falls under their P-2). |

---

## 4. Customer-App-side gaps (feed the Planning CR — **no code now**)

| # | Gap | Where (code truth) | Severity |
|---|---|---|---|
| G1 | Orders/points/wallet still call v1 `/customer/me/*` | `crmService.js:399,407,415` | **P1** (known root cause) |
| G2 | Points sign logic: anything ≠ `earn` renders as **"−"** → `bonus` (a credit) shows as a deduction | `Profile.jsx:280,288-289` | P1 (wrong money-adjacent display) |
| G3 | Points tab needs **two** calls (`/scan/loyalty` + `/scan/points/history`); `points_value` ← `points_monetary_value` | `Profile.jsx:66-82` | P1 |
| G4 | Orders: `order_type` is raw POS text (`dinein`, `take_away`, `WalkIn`, `pos`…) rendered verbatim; `skip=0` sent but unsupported (harmless); >50 orders unreachable | `Profile.jsx:247`, `crmService.js:400` | P2 |
| G5 | Wallet tab shown unconditionally. Our own config already has `showWallet` (default **false**, `RestaurantConfigContext.jsx:61,462`) but `Profile.jsx` ignores it | `Profile.jsx:298` | P2 — needs owner decision on source (see G10) |
| G6 | JWT claim: both `crmService.js:38-49` and `AuthContext.jsx:13-24` read `decoded.user_id` — v2 tokens carry **`restaurant_id`** → helper always returns `null`. Today harmless: all 4 `setCrmAuth` callers pass `rid` explicitly, and `x-api-key` derivation is moot (G8). Latent bug for legacy-token migration path (`AuthContext.jsx:70`). | as listed | P3 latent |
| G7 | `skip-otp` handling assumes **409** (→ password-setup) and **429 + Retry-After** (→ backoff). CRM: neither is ever emitted. Dead branches in `LandingPage.jsx:474-486` and `crmSkipOtpRetry.js`. **Behavioural consequence:** an existing *password* customer is silently logged in via skip-otp without a password — the "phone locked to OTP/password" design (Q1=b) does not hold. | as listed | **P1 product/security** — owner decision (CRM P-4) |
| G8 | Per-restaurant `x-api-key` map (`REACT_APP_CRM_API_KEY`, `crmService.js:19-55`) is **ignored by CRM** on all `/scan/*` routes → dead mechanism, secret shipped in the FE bundle for nothing | `crmService.js` | P2 security-hygiene (fold into CR-007 env purge) |
| G9 | Order visibility: only ~28% of POS orders carry a `customer_id` (phone supplied at POS). Customers *will* see "No orders yet" for legitimate visits. Not a bug on either side — **product expectation** the owner must accept or fix at POS ingest. | CRM GAP-10 | Owner awareness |
| G10 | **Duplicate config source of truth.** CRM `GET /scan/config/{rid}` returns the *same-shape* restaurant config (banners, codEnabled, categoryTimings, fonts…) as our backend `GET /api/config/{rid}`. App reads ours; CRM recommends reading `showWallet` from theirs. Two writable copies can drift. Ties to BUG-002 / CR-2026-09-12-010. | live probe `/scan/config/478` | **HIGH architectural** — owner decision |

Not gaps (already aligned): `Profile.jsx:253` already reads `item.item_name`; `:280` already compares `transaction_type === 'earn'`; UI does not render `expiring_soon`, `total_received/total_used`, `total_orders` → CRM's "not available" items cost nothing today.

---

## 5. Owner decisions surfaced

| # | Decision | Options |
|---|---|---|
| OD-1 | Which host is `crm.mygenie.online` — UAT or prod? Provide UAT `restaurant_id` via secure channel (D3) | — |
| OD-2 | Wallet tab gating source: our `/api/config.showWallet` (exists, default false) vs CRM `/scan/config.showWallet` (G5/G10) | A) ours B) CRM's C) hide tab until wallet module is live |
| OD-3 | `skip-otp` silently authenticating password customers (G7) | A) accept risk B) ask CRM for P-4 (`Password required` + rate-limit) and keep FE 409 branch |
| OD-4 | Remove dead `x-api-key` mechanism (G8) — fold into CR-007 or separate CR | — |
| OD-5 | Accept 28% order-linkage as product reality or raise a POS-ingest item (G9) | — |
| OD-6 | Config source of truth (G10) — scope into CR-2026-09-12-010 or new INV | — |

---

## 6. Ask back to CRM (docs only)

1. Deliver `INV_017_openapi_scan_v2.json` (D2).
2. Correct 403 → 401 for missing header in contract §0 (D1).
3. Confirm which environment `crm.mygenie.online` is (D3).
4. Align `total` semantics across the three ledgers, or document it (D4 → P-2).
5. Confirm `/scan/config/{rid}` is the *same* data our `/api/config/{rid}` serves, or a CRM-owned copy (G10) — who writes it?

---

## 7. Recommendation

Gate sequence respected — **no Planning/Implementation yet**. Next role: **PLANNING (Role 2)** on a new CR *"crmService v2 branches for orders / points / wallet + Profile field mapping"* (Risk **HIGH**, API contract), **but only after** OD-1 (environment + UAT rid) is answered, because the plan's verification matrix needs real responses. OD-2…OD-6 can be answered in parallel or split into separate items.

## 8. Addendum 2026-09-15 (owner reply + OpenAPI received)

| Item | Status |
|---|---|
| D2 | ✅ `INV_017_openapi_scan_v2.json` received (26 operations / 21 paths, 14 schemas) — archived in `crm_reply/`. **Limitation:** all 14 schemas are *request* models; every `200` response schema is `{}` (untyped). Response field types remain prose-only (contract §2–§4). Planning must capture real UAT responses for the verification matrix. |
| D3 | ✅ Owner: `crm.mygenie.online` = **UAT**. Production CRM URL still unknown → `REACT_APP_CRM_URL` for prod is an open deployment item (add to release checklist). |
| D1, D4 | ⏳ Owner obtaining clarification from CRM. |
| New finding (from OpenAPI) | CRM also serves `GET/PUT /scan/config/{rid}` (`AppConfigUpdate` schema ≈ the same ~70 keys as our `RestaurantConfigContext` / backend `/api/config`), `GET/PUT /scan/menu/dietary-tags/{rid}` (≈ our `/api/dietary-tags`), `/scan/call-waiter`, `/scan/request-bill`, `/scan/feedback`. → **G10 is broader than wallet gating: CRM holds a parallel copy of the whole restaurant app-config + dietary-tags surface.** Strengthens the case for a dedicated INV. |

## 9. Proposed next steps per gap (gate-compliant — nothing starts without owner approval + registered ID)

| Gap(s) | Next role | Proposed item | Risk | Blocked by |
|---|---|---|---|---|
| G1 G2 G3 G4 (+G5 if OD-2 = "ours") | **INTAKE → PLANNING** | **CR-A** "Profile v2 adapter: `crmGetOrders/Points/Wallet` → `/scan/*`, points sign/`bonus` mapping, `order_type` normalisation, drop `skip`, wallet-tab gating" — files: `crmService.js`, `Profile.jsx` | HIGH (API contract) | UAT `restaurant_id` via secure channel (to capture real responses in Planning); OD-2 |
| G7 | **OWNER DECISION → INTAKE** | **CR-B** skip-otp password bypass. OD-3=A (accept): P3 cleanup of dead 409/429 branches. OD-3=B: CRM P-4 + FE keeps 409 → password-setup route. Touches `LandingPage.jsx` + `crmSkipOtpRetry.js` | CRITICAL (auth) | OD-3 |
| G8 | **INTAKE** (fold) | Add to **CR-2026-09-12-007** (env purge/API-client facade): remove `REACT_APP_CRM_API_KEY` map + `x-api-key` header logic | MEDIUM | OD-4 |
| G6 | **INTAKE** (fold) | Add to **CR-2026-09-12-007** (session facade): `getRestaurantIdFromToken` read `restaurant_id` claim (both copies) — AuthContext is a CRITICAL hotspot, so not a Fast Lane | HIGH | none |
| G10 (+ new finding) | **INTAKE → INVESTIGATION** | **INV-2026-09-15-002** "Config source of truth: CRM `/scan/config` + `/scan/menu/dietary-tags` vs our `/api/config` + `/api/dietary-tags` — who writes, who reads, drift" → feeds CR-2026-09-12-010 / BUG-002 | — (read-only) | OD-6 |
| G9 | **OWNER AWARENESS** | No Customer-App item. Optional POS-ingest item outside this repo | — | OD-5 |
| D3 prod URL | **DEPLOYMENT checklist** | Add "prod `REACT_APP_CRM_URL` confirmed" to release checklist | — | owner |

**Recommended order:** OD-2/OD-3/OD-4/OD-6 answered → one INTAKE session registers CR-A, CR-B, INV-002 and the two fold-ins → PLANNING for CR-A first (highest customer value, lowest dependency).

Root cause: CONFIRMED — FE partial v2 migration; CRM /scan/* endpoints exist and are live
Classification: FE (CONFIG/CONTRACT) + 1 architectural finding (duplicate config source, G10)
Confidence: HIGH
Steps used: 9/10
Evidence: CRM_REPLY_VALIDATION.md §2–§4 (live probes + code refs)
Recommendation: Owner decisions OD-3..OD-7 → INTAKE (Role 1) registers CR-A, CR-B, INV-2026-09-15-002 + 2 fold-ins into CR-007 → PLANNING CR-A first (see §9, §10)
Steps used: 10/10 (budget reached — extension needed for further probing)
Report: memory/change_requests/INV-2026-09-15-001-profile-data-crm-v2-contract-gap/CRM_REPLY_VALIDATION.md
```

## 10. Owner fact 2026-09-15 — **CRM and Customer App share the same MongoDB**

**Verified (read-only):** `GET <our backend>/api/config/478` vs `GET https://crm.mygenie.online/api/scan/config/478` → 105/105 keys identical, 0 value differences, same `updated_at` (`…05:50:24.597682+00:00`). Our backend reads `db.customer_app_config` (`server.py:1054,1211`). This is **one document served by two services**, not two copies.

**Consequences (carry into every item in §9):**

| # | Consequence | Affects |
|---|---|---|
| S1 | **G10 reclassified**: not "duplicate data" but **two writers / two default-maps on one collection**. Drift risk is *schema & defaults* (our `PUT /api/config` + `RestaurantConfigContext` defaults vs CRM `PUT /scan/config` + `AppConfigUpdate`), not data divergence. INV-2026-09-15-002 scope = ownership of writes + defaults, plus `dietary_tags`. | INV-002, CR-2026-09-12-010 |
| S2 | **OD-2 is moot**: `showWallet` is one flag. CR-A gates the wallet tab on our existing `RestaurantConfigContext.showWallet`. | CR-A |
| S3 | **Data-destructive items are now cross-team CRITICAL**: any collection drop/rename/migration from our side hits CRM live. INV-2026-09-12-001's "drop `orders` / `status_checks`" feed into **CR-2026-09-12-014 (MySQL migration)** and **CR-2026-09-12-006** must be re-scoped — `db.orders` is CRM's POS-ingest collection (CRM GAP-10). "Route dead in our FE" ≠ "collection unused". **Owner + CRM approval required before any schema/collection change.** | CR-006, CR-014, INV-2026-09-12-001 |
| S4 | Backend `/api/customer/*` routes read the same customer/orders/points data CRM serves via `/scan/*` — redundant *readers*, not orphans. Deleting routes carries no data risk; still a CR-006 owner decision. | CR-006 |
| S5 | Two auth systems issue JWTs over the same customer records (our `JWT_SECRET`, CRM HS256). Whether secrets/claims are shared is **unknown** — add to INV-002. Relates to BUG-001. | INV-002 |
| S6 | Addendum §2 "Database" was stale → updated to "shared with CRM" (Alpha v0.1a). §13 Q1/Q2 remain open. | control doc |
| S7 | Release checklist: prod `MONGO_URL`/`DB_NAME` must be **CRM's production DB** — a separate DB would silently split customer data. Prod CRM URL + prod DB identity are one decision. | Deployment |

Open decisions: **OD-3, OD-4, OD-5, OD-6** + new **OD-7**: who owns *writes* to `customer_app_config` (our admin UI vs CRM admin)?
