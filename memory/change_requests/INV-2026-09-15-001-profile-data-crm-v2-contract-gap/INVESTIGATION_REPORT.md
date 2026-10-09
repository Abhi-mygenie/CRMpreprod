# INVESTIGATION REPORT — INV-2026-09-15-001

**Title:** Customer Profile page — Orders / Points / Wallet tabs fail on CRM v2
**Role:** Investigation (Alpha v0.1 §8 Role 6) — read-only, zero code changes
**Date:** 2026-09-15
**Branch:** `sep15`
**Steps used:** 7 / 10

---

## 0. Answer to the owner's question first

**Where does Profile data come from?** Directly from the **CRM** (`REACT_APP_CRM_URL` = `https://crm.mygenie.online/api`), **not** from our FastAPI backend. Our backend's `/api/customer/*` routes are genuinely not called by this frontend — that part of INV-2026-09-12-001 stands. But that never meant the *feature* was dead; it meant the *data path moved to CRM*.

**Is it working?** Partially:

| Profile tab / element | Data source (code) | Live status | Why |
|---|---|---|---|
| Header card: name, phone, tier, points, wallet balance | `crmGetProfile` → `GET /scan/auth/me` (v2 branch exists) | ✅ Route exists (401 on bad token = alive) | v2-aware since Phase-1 |
| **Orders tab** | `crmGetOrders` → `GET /customer/me/orders` | ❌ **404 Not Found** | No v2 branch — hits v1 path on a v2 CRM |
| **Points tab** | `crmGetPoints` → `GET /customer/me/points` | ❌ **404 Not Found** | No v2 branch — hits v1 path on a v2 CRM |
| **Wallet tab** | `crmGetWallet` → `GET /customer/me/wallet` | ❌ **404 Not Found** | No v2 branch — hits v1 path on a v2 CRM |
| Addresses (Delivery flow, not Profile) | `crmGetAddresses` → `GET /scan/addresses` | ✅ Route exists (401 on bad token) | v2-aware |

Customer sees toast **"Failed to load orders" / "Failed to load points history" / "Failed to load wallet"** on those tabs. That matches the owner's screenshot concern.

---

## 1. Hypotheses

| # | Hypothesis | Cheapest test | Result |
|---|---|---|---|
| H1 | Profile reads from our backend `/api/customer/*` and those routes are broken | grep `Profile.jsx` imports | **ELIMINATED** — imports only `crmService` functions (`Profile.jsx:4`) |
| H2 | Profile reads from CRM, but `crmGetOrders/Points/Wallet` still use **v1** paths while app runs **v2** | read `crmService.js:399–417`; probe CRM live | **CONFIRMED** — no `isV2()` branch; CRM returns 404 for `/customer/me/*` |
| H3 | CRM v2 has the replacement endpoints and only the FE path is wrong | probe candidate v2 paths | **PARTIAL** — `/scan/orders` exists (401 = alive). No `/scan/points` or `/scan/wallet` found (404). CRM team must confirm |

---

## 2. Evidence

### 2.1 Code (frontend, `sep15`)

`frontend/src/pages/Profile.jsx`
```
4:  import { crmGetOrders, crmGetPoints, crmGetWallet } from '../api/services/crmService';
56: const data = await crmGetOrders(token);      → setOrders(data.orders || [])
69: const data = await crmGetPoints(token);      → data.transactions[] (tx.type → transaction_type)
87: const data = await crmGetWallet(token);      → data.wallet_balance, data.transactions[]
60/78/99: toast.error('Failed to load orders' | '...points history' | '...wallet')
```

`frontend/src/api/services/crmService.js`
```
63:  CRM_API_VERSION = process.env.REACT_APP_CRM_API_VERSION   (env value: v2)
388: crmGetProfile   → isV2() ? '/scan/auth/me' : '/customer/me'     ← v2-aware ✅
399: crmGetOrders    → '/customer/me/orders?limit=&skip='            ← NO v2 branch ❌
407: crmGetPoints    → '/customer/me/points?limit='                  ← NO v2 branch ❌
415: crmGetWallet    → '/customer/me/wallet?limit='                  ← NO v2 branch ❌
430: crmGetAddresses → isV2() ? '/scan/addresses' : '/customer/me/addresses'  ← v2-aware ✅
```

`frontend/src/context/AuthContext.jsx:101` — session restore calls `crmGetProfile(storedToken)`; `user` object rendered on Profile header comes from this call (`user.name/phone/email/tier/total_points/wallet_balance`, `Profile.jsx:143–161, 206–218, 302`).

### 2.2 Live CRM probes (read-only, invalid bearer token, no customer data touched)

Base: `https://crm.mygenie.online/api` · Date: 2026-09-15

| Method | Path | HTTP | Body | Interpretation |
|---|---|---|---|---|
| GET | `/scan/auth/me` | **401** | `Invalid customer token` | Route exists ✅ |
| GET | `/scan/addresses` | **401** | `Invalid customer token` | Route exists ✅ |
| GET | `/scan/orders` | **401** | `Invalid customer token` | Route exists ✅ — likely v2 orders (unconfirmed contract) |
| GET | `/customer/me` | **404** | `Not Found` | v1 path gone |
| GET | `/customer/me/orders` | **404** | `Not Found` | **what Profile calls today** ❌ |
| GET | `/customer/me/points` | **404** | `Not Found` | **what Profile calls today** ❌ |
| GET | `/customer/me/wallet` | **404** | `Not Found` | **what Profile calls today** ❌ |
| GET | `/scan/points`, `/scan/wallet`, `/scan/auth/orders`, `/scan/auth/points`, `/scan/auth/wallet` | **404** | `Not Found` | No obvious v2 points/wallet route — **CRM must tell us** |

OTP / auth routes (POST, empty body — 422 means route exists and validates input):

| Path | HTTP | Interpretation |
|---|---|---|
| `POST /scan/auth/request-otp` | **422** (requires `phone`, `restaurant_id`) | Route exists; SMS delivery unknown (CR-014-001 says `dev_otp` echoed = dev mode) |
| `POST /scan/auth/verify-otp` | **422** (requires `phone`, `otp`, …) | Route exists |
| `POST /scan/auth/skip-otp` | **422** (requires `phone`, `restaurant_id`) | Route exists — this is the **live** login path today |
| `POST /scan/auth/login` | **422** (requires `phone`, `password`, …) | Route exists |
| `POST /scan/auth/register` | **422** (requires `phone`, `name`, …) | Route exists |
| `POST /customer/send-otp`, `/customer/verify-otp` | **404** | v1 gone |
| `POST /customer/forgot-password`, `/customer/reset-password` | **404** | v1 gone — confirms UX-GAP-02 |
| `POST /scan/auth/forgot-password`, `/scan/auth/reset-password` | **404** | **No v2 password-reset exists** |

CRM OpenAPI: `https://crm.mygenie.online/openapi.json` returns the SPA `index.html`; `/api/openapi.json` and `/api/docs` return 404 → **no public machine-readable contract**. CRM team must supply it.

---

## 3. Root cause

**Classification: BACKEND/API (external CRM contract) + FE PARTIAL MIGRATION**

During the Phase-1 CRM v1→v2 migration, `crmService.js` received `isV2()` branches for auth, profile (`/me`) and addresses, but **`crmGetOrders`, `crmGetPoints`, `crmGetWallet` were left on v1 paths**. With `REACT_APP_CRM_API_VERSION=v2` and the CRM having removed all `/customer/*` v1 routes, these three calls return 404 → the Orders / Points / Wallet tabs on `/profile` show error toasts and empty lists.

Header-card values (`user.total_points`, `user.wallet_balance`, `user.tier`) depend on whether `GET /scan/auth/me` returns those fields in v2 — **unconfirmed** (see contract request Q-P1).

**Confidence: HIGH** for the 404 root cause (code + live evidence). **MEDIUM** on what the correct v2 replacement endpoints are (only `/scan/orders` observed; points/wallet unknown).

---

## 4. What this does NOT change

- INV-2026-09-12-001's finding that FastAPI `/api/customer/*` is not called by this frontend remains **true**. Its recommendation language ("can be deleted outright") is **withdrawn pending owner decision** — deletion of backend routes must not be conflated with restoring the Profile feature, and any deletion is a CR-006 owner decision, not an INV conclusion.
- CR-2026-09-14-001's OTP quarantine remains **correct**: v1 OTP/password-reset routes are 404 live, and v2 has no forgot/reset-password.

---

## 5. Recommendation

1. **Owner:** send `CRM_CONTRACT_VERIFICATION_REQUEST.md` (same folder) to the CRM team. It lists exactly what the Customer App calls, what it expects back, what we observed live, and the questions CRM must answer.
2. **On CRM reply → Planning (Role 2):** register a CR *"crmService v2 branches for orders/points/wallet"* — expected scope: `crmService.js` (3 functions) + possibly `Profile.jsx` field mapping. Risk **HIGH** (API contract). No code until owner approves the plan.
3. **OTP:** CRM's answers to Q-O1…Q-O6 decide whether CR-2026-09-12-017 (SMS finalisation) can leave DEFERRED and whether a v2 forgot/reset-password endpoint needs to be requested from CRM (UX-GAP-02).

```text
Investigation complete: INV-2026-09-15-001
Root cause: crmGetOrders/crmGetPoints/crmGetWallet still call CRM v1 /customer/me/* paths; CRM v2 returns 404 for all three → Profile Orders/Points/Wallet tabs fail. Header profile uses v2 /scan/auth/me (alive).
Classification: BE/API (external CRM contract) + FE partial v2 migration
Confidence: HIGH (root cause) / MEDIUM (v2 replacement endpoints)
Steps used: 7/10
Evidence: memory/change_requests/INV-2026-09-15-001-profile-data-crm-v2-contract-gap/INVESTIGATION_REPORT.md §2
Recommendation: Owner → CRM team contract verification → Planning (new CR for crmService v2 orders/points/wallet)
Report: memory/change_requests/INV-2026-09-15-001-profile-data-crm-v2-contract-gap/
```
