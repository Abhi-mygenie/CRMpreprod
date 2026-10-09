# Defaults Inventory & Business-Rule Freeze (read-only)

> Date (UTC): 2026-05-31 · Baseline `main @ 4612953` · **Read-only; no code changed.**
> Purpose: answer "where are ALL defaults baked in the code?" and FREEZE business rules
> before any GAP-008 consolidation. Supports `PROJECT_SECURITY_CONFIG_CONTROL_LAYER_CORRECTION_PLAN.md` Phase 3.

## Hard freeze (owner instruction)
- **No change to business logic/decisions coming from POS API or CRM API.**
- **No change to any business RULE in Mongo/admin config.**
- GAP-008 consolidation is limited to **de-duplicating fallback VALUES into one source, value-for-value identical**. Anything that encodes a *decision* is FROZEN and out of scope.

---

## The 7 places defaults are baked into the code

### TYPE 1 — App-config defaults (branding + feature toggles)  ← THE consolidation target (GAP-008)
Fallback used for the Mongo `customer_app_config` layer when a restaurant has **no config doc** or config fails to load.
| Where | File:Line | Approx size | Role |
|---|---|---|---|
| Backend | `backend/server.py` `get_app_config()` ~`989–1100` | ~87 keys | what the API returns when no DB doc |
| Frontend (customer app) | `frontend/src/context/RestaurantConfigContext.jsx:9` `DEFAULT_CONFIG` | ~98 keys | customer-app fallback |
| Frontend (admin panel) | `frontend/src/context/AdminConfigContext.jsx:19` `defaultConfig` | ~87 keys | admin-editing fallback |
**Status:** pure VALUES (colours, show/hide toggles, labels). Safe to consolidate **value-preserving**. Already drifted (87/98/87).

### TYPE 2 — Loyalty-settings defaults (loyalty MATH/rules)  ← FROZEN (business rule)
| Where | File:Line | Role |
|---|---|---|
| Backend | `backend/server.py:1377–1396` | default `bronze_earn_percent 5.0`, `redemption_value 0.25`, tier mins, bonuses, returned when no `loyalty_settings` doc; plus per-field `.get(field, default)` |
**Status:** encodes loyalty earn/redeem **decisions** → **FROZEN. Not part of GAP-008.**

### TYPE 3 — Default restaurant id (which restaurant shows when URL has none)  ← FROZEN (decision)
| Where | File:Line | Role |
|---|---|---|
| Frontend | `frontend/src/utils/useRestaurantId.js:134` `defaultRestaurantId = "478"` | preview/dev fallback tenant |
| Frontend | `frontend/src/utils/constants.js` (commented `DEFAULT_RESTAURANT_ID`) | alt fallback |
**Status:** a routing **decision** → leave as-is unless separately approved.

### TYPE 4 — Tenant-specific hardcoded rules (Restaurant 716 carve-outs)  ← FROZEN (GAP-016, separate)
| Where | File:Line | Role |
|---|---|---|
| Frontend | `components/TableRoomSelector/TableRoomSelector.jsx:59–114` | 716 room-only ordering flow |
| Frontend | `utils/orderAccessPolicy.js:43–45` | 716 never order-blocked |
| Frontend | `utils/otpPolicy.js`, `components/FaviconRouteReset.jsx`, `components/DocumentTitleManager.jsx` | 716 references |
**Status:** real **business rules** for one tenant → **FROZEN**; tracked separately as GAP-016, not GAP-008.

### TYPE 5 — UI microcopy/label fallbacks (cosmetic)  ← optional, low priority
| Where | Example | Role |
|---|---|---|
| Frontend | `components/PaymentMethodSelector.jsx:23–24` `onlineLabel='Pay Online'`, `codLabel='Pay at Counter'` | payment button labels |
| Frontend | `Header.jsx:18` `'Menu'`, `Sidebar.jsx:20,26` `'Logo'/'Menu'`, `HamburgerMenu.jsx` `'User'/'Welcome'`, `AdminLayout.jsx:88` `'Restaurant'` | display fallbacks when a value is empty |
| Backend models | `payOnlineLabel`/`payAtCounterLabel` default `None` → UI fallback (`server.py:237–238`); Order-Success fields default `None` (`~169`) | admin-overridable labels |
**Status:** cosmetic VALUES. Not required for GAP-008; can be left or folded in later.

### TYPE 6 — Seed defaults (WRITE into Mongo, not runtime fallback)  ← different mechanism
| Where | File | Role |
|---|---|---|
| Backend | `backend/seed_defaults.py` | seeds About/openingHours/footer/nav into `customer_app_config` for restaurant users |
| Backend | `backend/seed_demo_data.py` | seeds demo customers/users |
**Status:** one-time data seeding, not a runtime default. Out of GAP-008 scope.

### TYPE 7 — Misc literal defaults
| Where | File:Line | Role |
|---|---|---|
| Backend | `server.py:66` `pos_id = "0001"` | default POS provider id |
**Status:** minor literal; leave unless flagged.

---

## What this means for GAP-008
- **In scope (consolidate, value-preserving):** TYPE 1 only — the 3 app-config default blocks (backend `get_app_config`, FE `DEFAULT_CONFIG`, FE `defaultConfig`).
- **Frozen / out of scope:** TYPE 2 (loyalty rules), TYPE 3 (default restaurant), TYPE 4 (716 rules). These encode business decisions.
- **Optional / later:** TYPE 5 (microcopy), TYPE 6 (seed), TYPE 7 (misc).
- POS (#1) and CRM (#3) data flows are untouched entirely.

## Recommended safe first action
Produce a **read-only 3-way diff** of the TYPE-1 blocks (backend vs FE customer vs FE admin) so every current inconsistency (87 vs 98 vs 87) is visible, then consolidate to a single source with **current customer-facing values winning** every conflict, proven by before/after config snapshots.

---

## Owner directives — round 2 (2026-05-31)

### NEW RULE — Admin "Menu Order" overrides (FREEZE behaviour)
The app's admin panel **"Menu Order"** tab (`frontend/src/components/AdminSettings/MenuOrderTab.jsx`) can **override the POS menu**, stored in `customer_app_config.menuOrder` + timing fields:
- **Re-order** categories / items / stations (`menuOrder.categoryOrder/itemOrder/stationOrder`)
- **Show/hide** categories / items / stations (`menuOrder.*Visibility`)
- **Order timing** — `categoryTimings` / `itemTimings` (e.g. breakfast item available 07:00–11:00) — backend models `server.py:229–231`, defaults `{}`.
➡️ Business meaning: **the menu comes from POS, but the app config layers ON TOP** to re-order, hide, and time-restrict items. This is a **business rule → FROZEN** (keep working exactly as-is; only the empty-default `{}` value participates in TYPE-1 consolidation).

### #1 DECISION — Defaults source of truth = BACKEND (Option A, confirmed)
- Backend `get_app_config()` becomes the single authoritative default set; it always returns a **complete** config.
- Frontend keeps only TWO safety nets (no big duplicated default list):
  1. **Per-restaurant, per-device CACHE** (`localStorage["restaurant_config_<rid>"]`) = the last config the backend successfully returned for that restaurant on that device.
  2. **One minimal global offline default** for a cold device when the backend is unreachable and there is no cache.
- (See "How the offline fallback works" below.)

### #2 RECLASSIFY — Loyalty / Coupon / Wallet = NOT integrated yet (DEFER)
- Owner confirms loyalty/coupon/wallet are **not integrated with the real API**; those **rules belong to the CRM API**. The backend `loyalty_settings` defaults (`server.py:1377–1396`) are **placeholder/non-authoritative**, not a real business default.
- **Action: DEFER** full loyalty/coupon/wallet CRM integration to an **upcoming sprint, AFTER** the consolidation is complete. **Do not touch now.**

### #4 NEW KEY REQUIREMENT — De-hardcode ALL special/tenant behaviour (IN SCOPE)
- **All tenant-specific / special behaviour must be refactored to come from ENV or ADMIN SETTINGS — never hardcoded in code.** This is an explicit, important goal of the refactor (behaviour-preserving: same behaviour, but config-driven).
- Applies to: Restaurant **716** carve-outs (`TableRoomSelector.jsx`, `orderAccessPolicy.js`, `otpPolicy.js`, `FaviconRouteReset.jsx`, `DocumentTitleManager.jsx`), the hardcoded default restaurant **478** (`useRestaurantId.js:134`), and `pos_id` default **"0001"** (see #7). Was GAP-016/TYPE-3/TYPE-7 → now a **firm refactor objective**, done value/behaviour-preserving.

### #5 — Microcopy/label defaults: consolidate + REMOVE DEAD CODE
- Consolidate scattered UI label fallbacks (TYPE 5) and **remove dead code** (e.g., legacy `pages/AdminSettings.jsx` overlap, commented `DEFAULT_RESTAURANT_ID`, unused legacy `customer/*` routes) as part of the cleanup — after a usage trace, nothing deleted blindly.

### #6 — Seed scripts: OUT OF SCOPE (confirmed).

### #7 — `pos_id` explained
- `pos_id` (default `"0001"`) is the **POS provider/aggregator id** (MyGenie = `0001`; others e.g. `petpooja`, `ezzo`). It namespaces a restaurant's records: `user_id = f"pos_{pos_id}_restaurant_{restaurant_id}"` (e.g. `pos_0001_restaurant_478`) — the exact format seen in live `loyalty_settings`.
- It is currently a **hardcoded default in 8 places** (`server.py:66,79,84,250,257,265,415,443`). **Owner directive: `pos_id` must NOT be hardcoded — it is CONTROLLED BY THE BACKEND** (backend resolves/serves the correct `pos_id` per restaurant). Behaviour-preserving: keep `0001` as the effective value, stop hard-coding it in models/handlers.

---

## How the offline fallback works (answer to #1)
Flow in `RestaurantConfigContext.jsx`:
1. Read restaurant id from the URL (`/478` → "478").
2. **Hydrate from per-device cache** `localStorage["restaurant_config_<rid>"]` if present (instant correct branding); else start from the single global `DEFAULT_CONFIG`.
3. **Fetch** `GET /api/config/<rid>` → on success set `{...DEFAULT_CONFIG, ...backendData}` and **save to that restaurant's cache**.
4. **On fetch failure (backend down):** the `catch` only logs — it keeps whatever was already set.

So, when the **backend is off**:
- **Returning device** (visited that restaurant before) → shows the **cached per-restaurant config** = correct branding for that restaurant.
- **Cold device** (never visited, no cache) → shows the **generic global `DEFAULT_CONFIG`** (neutral defaults, e.g. default orange theme) — **NOT** that restaurant's real brand.
- The cache is **per browser/device**, not a server-side per-restaurant store. There is **no per-restaurant default baked into code** — only the global default + per-device cache.

---

## Clarification — "dead code" vs "duplication" (owner challenge, resolved)
- **In the DEFAULTS area there is NO dead code.** All 3 appearance-default blocks are actively used (`RestaurantConfigContext.DEFAULT_CONFIG` ×6, `AdminConfigContext.defaultConfig` ×4, backend `get_app_config` ×1). The problem here is **duplication & drift** (same defaults defined 3×, already inconsistent 87/98/87), **not** dead code. GAP-008 = de-duplicate to one backend source, value-preserving.
- **Dead code is a SEPARATE, smaller concern** and is **only suspected, pending a usage trace** — nothing confirmed dead, nothing deleted blindly:
  - `frontend/src/pages/AdminSettings.jsx` — imported in `App.js:19` but the active "settings" route uses the newer `pages/admin/AdminSettingsPage` (`App.js:28,75`); the old one looks **imported-but-unused** → needs a quick trace to confirm.
  - Backend `customer/*` routes (`server.py:754–952`) — the frontend makes **zero** `/api/customer/*` calls → unused by THIS frontend (other clients may use them) → trace before any removal.
  - `constants.js` commented-out `DEFAULT_RESTAURANT_ID`.
  ➡️ Dead-code removal stays in the **Cleanup phase**, trace-gated; it is **not** part of the defaults consolidation.

---

## Future CR backlog (captured, not in current scope)
- **CR-FUTURE-OFFLINE-BRANDING:** true per-restaurant offline branding for **cold devices** (no cache) when the backend is down — e.g. backend stamps a tiny cached brand bundle per restaurant. Enhancement only; revisit as a future CR.
- **CR-FUTURE-LOYALTY-CRM:** integrate loyalty / coupon / wallet with the real **CRM API** — scheduled for an **upcoming sprint, AFTER** the consolidation is complete.

