# Correction Plan — Revision 2026-05-31 (Config / Defaults / De-hardcoding)

> Layers on top of `PROJECT_SECURITY_CONFIG_CONTROL_LAYER_CORRECTION_PLAN.md`.
> Captures owner decisions from the 2026-05-31 session and **reworks Phase 3**.
> **Planning only — no code changed. Source of truth = code; live `mygenie` DB = data baseline.**

---

## 1. Decision log (this session)

| # | Decision | Effect on plan |
|---|---|---|
| D1 | **Defaults source of truth = BACKEND** (Option A) | Backend `get_app_config()` is the one default set; FE keeps only cache + 1 minimal offline default |
| D2 | **Freeze all POS + CRM business logic/decisions** | Untouched entirely |
| D3 | **Admin "Menu Order" overrides are a business rule** (re-order / hide / **order-timing** on top of POS menu) | FROZEN; only the empty `{}` default participates in consolidation |
| D4 | **Loyalty / coupon / wallet not integrated** (CRM-owned, placeholder defaults) | DEFER to upcoming sprint **after** consolidation (CR-FUTURE-LOYALTY-CRM) |
| D5 | **De-hardcode ALL special/tenant behaviour** → config (backend/admin), not code | NEW objective → **Phase 3B** |
| D6 | **`pos_id` must be BACKEND-CONTROLLED**, not hardcoded | Part of Phase 3B (backend resolves pos_id per restaurant; value stays `0001`) |
| D7 | **Defaults issue = duplication/drift, NOT dead code** | GAP-008 reframed; dead-code stays separate + trace-gated |
| D8 | **Per-restaurant offline branding for cold devices** | Future enhancement (CR-FUTURE-OFFLINE-BRANDING) |
| D9 | **Consolidation must be value/behaviour-preserving** | Hard QA gate: before/after config snapshots must be identical |

---

## 2. Reworked Phase 3 — Config / Env + Defaults Consolidation

### Phase 3A — `.env.example` baseline (GAP-015) — ✅ DONE
Templates + `.gitignore` allow-rule delivered & verified (see `PHASE3_EXECUTION_LOG.md`).

### Phase 3C — Appearance-defaults consolidation (GAP-008)  ← reframed
- **Problem:** the **appearance/feature-toggle defaults** are defined in **3 places** and have drifted (backend `get_app_config` ~87 / FE `RestaurantConfigContext.DEFAULT_CONFIG` ~98 / FE `AdminConfigContext.defaultConfig` ~87). **This is duplication, not dead code.**
- **Target:** ONE authoritative default set in the **backend**; backend always returns a **complete** config. Frontend reduced to: (a) per-restaurant per-device cache, (b) ONE minimal global offline default.
- **Method (safe):**
  1. Produce a **read-only 3-way diff** of the 3 blocks → list every key that differs / is missing.
  2. Resolve each conflict with **current customer-facing value WINS** (no visible change).
  3. Make backend authoritative; trim FE duplicate lists.
  4. **Prove parity:** snapshot `GET /api/config/<rid>` for a no-doc restaurant + key admin/customer screens **before vs after** → must be identical.
- **Frozen inside this step:** menu-order/timing rules (D3) — only the empty `{}` defaults move; loyalty defaults (D4) excluded.

---

## 3. NEW — Phase 3B — De-hardcode tenant / special behaviour (D5, D6)

> Behaviour-preserving: SAME behaviour today, just sourced from config instead of code.

| Item | Today (hardcoded) | Target |
|---|---|---|
| Restaurant **716** carve-outs | `TableRoomSelector.jsx`, `orderAccessPolicy.js`, `otpPolicy.js`, `FaviconRouteReset.jsx`, `DocumentTitleManager.jsx` | driven by **admin settings / config flags** (e.g. `roomOnlyFlow`, `neverBlockOrders`) |
| Default restaurant **478** | `useRestaurantId.js:134` (`"478"`) | from **env** (`REACT_APP_RESTAURANT_ID`) — already exists; remove the hardcoded literal fallback |
| **`pos_id` "0001"** (8 spots) | `server.py:66,79,84,250,257,265,415,443` | **backend-controlled** — backend resolves pos_id per restaurant; stop hardcoding in models/handlers |

- **Risk:** medium — 716 touches ordering/room flow; must keep identical behaviour for 716 and all others.
- **QA:** for restaurant 716 and a normal restaurant, every flow (scan, room select, order block, OTP, favicon/title) behaves identically before/after; pos_id-derived `user_id` keys unchanged (`pos_0001_restaurant_<rid>`).
- **Sequencing:** after Phase 3C (clean config layer first), and each tenant rule migrated as its own small change.

---

## 4. Freeze register (must NOT change)

- POS API data/logic (menu, prices, availability, table, order placement, payment). 
- CRM API data/logic (identity, loyalty, wallet, coupons).
- Admin **Menu Order** overrides (ordering / visibility / **order timing**) — keep working as-is.
- Loyalty / coupon / wallet rules — deferred, untouched.
- All consolidation/de-hardcoding is **value + behaviour preserving**.

---

## 5. Deferred / Future CRs

- **CR-FUTURE-LOYALTY-CRM** — integrate loyalty/coupon/wallet with the real CRM API (next sprint, after consolidation).
- **CR-FUTURE-OFFLINE-BRANDING** — per-restaurant offline branding bundle for cold devices when backend is down.
- **Dead-code removal** (separate, trace-gated): suspected legacy `pages/AdminSettings.jsx`, backend `customer/*` routes, commented `DEFAULT_RESTAURANT_ID` — confirm via usage trace before removing.

---

## 6. Updated status & order

| Phase | Scope | Status |
|---|---|---|
| 1 | Security containment — doc secret redaction + guardrail | ✅ done (local) |
| 2 | db_import safety guard | ✅ done (local) |
| 3A | `.env.example` baseline | ✅ done (local) |
| **3C** | **Appearance-defaults consolidation (backend source, value-preserving)** | ⏭️ next: start with read-only 3-way diff |
| **3B** | **De-hardcode 716 / 478 / pos_id → config (backend/admin)** | ⏳ after 3C |
| 4–10 | Auth/OTP, FE guards, middleware, endpoint, CI, modularization, cleanup | ⏳ per main plan |
| — | Loyalty/coupon/wallet CRM, offline-branding | 🔮 future CRs |

**Parked (owner):** password rotation; apply Phase 1/2/3A patches to GitHub.

---

## 7. Recommended next action
**Generate the read-only 3-way diff of the appearance defaults (Phase 3C step 1)** — zero risk, full visibility — then consolidate to backend with value parity proven.
