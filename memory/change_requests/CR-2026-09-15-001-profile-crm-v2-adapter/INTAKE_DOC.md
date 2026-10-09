# INTAKE DOC — CR-2026-09-15-001

## Item Identity

| Field | Value |
|-------|-------|
| **CR ID** | CR-2026-09-15-001 |
| **Title** | Profile page → CRM v2 adapter: orders / points / wallet via `/scan/*`, points sign mapping, `order_type` normalisation, wallet-tab gating |
| **Classification** | BUG (customer-visible) + contract alignment |
| **Date Registered** | 2026-09-15 |
| **Reported By** | Owner (Profile tabs empty / "Failed to load"), confirmed by INV-2026-09-15-001 + CRM INV-017 |
| **Severity** | **P1** — core customer feature (order history, points, wallet) broken, no workaround |
| **Risk** | **HIGH** — API contract change on the customer-data path (Alpha v0.1 §5). Not a hotspot file; no Fast Lane. |
| **Status** | 📝 REGISTERED (Role 1 done) — awaiting Planning |
| **Parent** | CR-2026-09-12-001 (Wave 2) · Owner decision **D-A Option A** |
| **Blast radius** | SMALL–MEDIUM — 2 FE files; Profile page only. Header card + AuthContext untouched. |

## 1. Problem (code truth)

`frontend/src/api/services/crmService.js:399,407,415` call v1 paths `/customer/me/{orders,points,wallet}` that **do not exist** on CRM (live 404). `Profile.jsx` shows error toasts and empty lists on Orders / Points / Wallet tabs. Header card works (`/scan/auth/me`).

Evidence: `INV-2026-09-15-001/INVESTIGATION_REPORT.md §2`, `CRM_REPLY_VALIDATION.md §2–§4`, CRM contract `crm_reply/INV_017_CUSTOMER_SCAN_API_CONTRACT_v2.md`.

## 2. Scope

### IN (gaps G1–G5 from CRM_REPLY_VALIDATION §4)
- **G1** `crmGetOrders` → `GET /scan/orders?limit=50` → `{ orders[], total }`; drop `skip`.
- **G3** `crmGetPoints` → two calls: `GET /scan/loyalty` (balance/tier/`points_monetary_value`) + `GET /scan/points/history?limit=50` → `{ transactions[], total }`.
- **G1** `crmGetWallet` → `GET /scan/loyalty` (`wallet_balance`) + `GET /scan/wallet/history?limit=50`.
- **G2** Points sign/label: `earn`,`bonus` → credit (+); `redeem`,`expired` → debit (−). Today anything ≠ `earn` renders as "−".
- **G4** `order_type` normalisation for display: `dinein`→Dine-in, `takeaway`/`take_away`→Takeaway, `delivery`→Delivery, `WalkIn`/`pos`→In-store (labels to be confirmed in Planning).
- **G5** Wallet tab visible only when `RestaurantConfigContext.showWallet` is true (OD-2 moot, single flag).
- Keep v1 branches intact behind `isV2()` (same pattern as `crmGetProfile`).

### OUT
- Header card, `crmGetProfile`, AuthContext, addresses — unchanged.
- JWT `user_id`→`restaurant_id` helper fix (G6) and `x-api-key` removal (G8) → CR-2026-09-12-007.
- Pagination beyond 50 (CRM P-2), `expiring_soon` (CRM P-3) — not built on CRM; UI does not render them.
- Backend `/api/customer/*` retirement → CR-2026-09-12-006 after INV-2026-09-15-002.

### GREY ZONE (Planning decides)
- Whether to show "Showing 50 of N" using `orders.total` (only orders has a true total — D4).
- Whether `bonus` gets its own label or is shown as "earned".

## 3. Duplicate check

| Item | Relationship | Verdict |
|---|---|---|
| INV-2026-09-15-001 | Investigation that produced this CR | RELATED — parent evidence |
| INV-2026-09-12-001 | Backend route trace | DISTINCT (backend, not FE data path) |
| CR-2026-09-12-007 | FE API-client facade | RELATED — G6/G8 folded there, not here |
| Phase-1 CRM v2 migration (`crmService.js` v2 branches) | This CR completes the missed functions | RELATED — same pattern, no conflict |

## 4. Code exists? **PARTIAL** — `Profile.jsx:253` already reads `item.item_name`; `:280` already compares `transaction_type === 'earn'`; `crmFetch` already unwraps the v2 envelope. Only paths, the two-call points/wallet composition, sign mapping, `order_type` labels and wallet gating are missing.

## 5. Files expected

| Will change | Will NOT touch |
|---|---|
| `frontend/src/api/services/crmService.js` (3 functions) | `AuthContext.jsx`, `RestaurantConfigContext.jsx`, `ReviewOrder.jsx`, `backend/server.py`, any `.env` |
| `frontend/src/pages/Profile.jsx` (fetch mapping, sign logic, order_type label, wallet-tab gate) | |

## 6. Acceptance criteria (for Planning → QA)

1. On UAT tenant **689**, a logged-in customer with linked orders sees Orders list (date, amount, normalised type, +pts, item names).
2. Points tab shows balance/tier from `/scan/loyalty` and ledger with correct +/− per `transaction_type`; `bonus` is a credit.
3. Wallet tab hidden when `showWallet=false` (689 today); when true, balance + credit/debit ledger render.
4. Customer with **no linked orders** sees "No orders yet" with **no error toast** (OD-5: valid state).
5. No regression on header card, addresses, login flows; `yarn build` clean (no `CI=true`).

## 7. Prerequisites
- UAT `restaurant_id` **689** (owner login stored in `memory/test_credentials.md`); a customer token minted via `skip-otp` on UAT during Planning to capture real responses (OpenAPI response schemas are untyped).
- Owner approval of Implementation Plan before any code.

```text
Intake complete: CR-2026-09-15-001
Classification: BUG + contract alignment
Severity: P1
Risk: HIGH
Duplicate check: DISTINCT (related: INV-2026-09-15-001, CR-2026-09-12-007)
Evidence: captured (live 404s, CRM contract, code refs)
Blast radius: SMALL–MEDIUM (2 FE files)
Docs updated: this file, ../README.md, ../../PRD.md, ../../control/OWNER_DECISIONS_2026-09-15.md
Next: Planning (Impact Analysis + Implementation Plan)
```

## 8. Addendum 2026-09-15 — CRM INV-018 (order linkage) inputs

Source: `../INV-2026-09-15-001-profile-data-crm-v2-contract-gap/crm_reply/INV_018_ORDER_LINKAGE_GAPS.md`

| Fact from CRM | Effect on this CR |
|---|---|
| CRM matches customers by **exact phone string**, no normalisation (GAP-14). A `skip-otp` phone in a different format than POS sent → CRM creates a *new empty customer* → `/scan/orders` returns 0, no error. | **Acceptance criterion 6 (new):** the UAT test customer's phone must be stored in CRM in the same 10-digit form POS sends. If Orders tab is empty for a known customer, check for a duplicate customer record **before** calling it a bug. |
| Canonical form agreed by CRM: **10-digit national, digits only**. | **Code truth (verified):** our path already does this for Indian numbers — `react-phone-number-input` gives E.164 → `crmService.stripPhonePrefix` strips `+91` when 12 digits → 10-digit. No change needed here for +91. |
| UAT tenant **689** has **6,357 unlinked orders** (3rd highest). | Expect many customers on 689 to legitimately see "No orders yet". Test with a customer known to have linked orders (Planning to identify one via CRM, no PII in docs). |
| 93% of unlinked orders have **no phone from POS** (DATA-A) — POS/cashier issue. | Out of scope; OD-5 stands. "Empty list is valid" acceptance criterion unchanged. |

**New gap surfaced on our side (registered separately, OUT of this CR):** non-Indian numbers — `transformers/helpers.js:245-258 extractPhoneNumber` does `replace(/^\+\d+/, '')` which deletes the **entire** number for any non-`+91` prefix (POS receives `cust_phone: ""` → order can never link), while `crmService.stripPhonePrefix` sends `<cc><number>` without `+` to CRM. See **CR-2026-09-15-003**.
