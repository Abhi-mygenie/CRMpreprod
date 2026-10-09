# Phase 3 — Defaults Consolidation & De-hardcoding — IMPLEMENTATION PLAN (agent handoff)

> Date (UTC): 2026-05-31 · Baseline `main @ 4612953` · **Planning only so far — next agent implements.**
> Source of truth = code; data baseline = live `mygenie` DB; `db_data/` = non-authoritative.
> Read first: `PROJECT_FINAL_BASELINE.md`, `PROJECT_GAP_REGISTER.md`,
> `DEFAULTS_INVENTORY_AND_FREEZE.md`, `DEFAULTS_3WAY_DIFF.md`,
> `PROJECT_CORRECTION_PLAN_REVISION_2026-05-31.md`.

---

## 0. Owner decisions (FINAL — implement to these)
1. **Fix it** (not deferred). Correct whatever is inconsistent.
2. **Backend is the single source of truth** for app-config defaults.
3. **Canonical default font = `Poppins`** (heading + body). The backend's `Montserrat` is **stale** and must be corrected to `Poppins`.
4. **Value/behaviour preserving** — prove with before/after snapshots.
5. **De-hardcode** tenant/special behaviour: restaurant **716**, default **478**, `pos_id` → config-driven; **`pos_id` is backend-controlled**.
6. **Freeze:** all POS + CRM logic; admin **Menu Order** overrides (ordering / visibility / **timings**); loyalty/coupon/wallet (deferred to CRM sprint).

---

## 1. Why this is needed (root cause, plain)
At runtime, a configured restaurant's settings **do** come from Mongo via the backend — there is **no live outage**. The problem is the **fallback DEFAULTS** (used when a restaurant has **no doc**, or a **field is blank**) are defined in **four** places and have **drifted**:

| Source | File | Role |
|---|---|---|
| Backend `get_app_config` no-doc defaults | `backend/server.py:988–~1110` | used **only** when a restaurant has NO doc |
| FE customer `DEFAULT_CONFIG` | `frontend/src/context/RestaurantConfigContext.jsx:` (`const DEFAULT_CONFIG`) | merged `{...DEFAULT_CONFIG, ...backendData}` — **fills gaps for doc-exists restaurants** |
| FE admin `defaultConfig` | `frontend/src/context/AdminConfigContext.jsx:~19` | admin-panel editing fallback |
| FE color fallback `DEFAULT_THEME` | `frontend/src/constants/theme.js` | apply-time color fallback `config.X \|\| DEFAULT_THEME.X` |

**Key runtime facts (verified):**
- `get_app_config` (`server.py:983–988`): **doc exists → returns the RAW doc** (no default-merge); **no doc → returns the big defaults dict**. ⇒ for a **partial doc**, the missing fields are filled by the **frontend** defaults, not the backend. (This is why both copies are load-bearing.)
- Apply-time fallbacks in `RestaurantConfigContext.jsx`:
  - colors: `config.X || DEFAULT_THEME.X` (`~248–292`)
  - fonts: `config.fontHeading || 'Poppins'` (`:306`), `config.fontBody || 'Poppins'` (`:321`)

**What's actually consistent vs drifted:**
- ✅ **Colors are consistent** — backend hex == `DEFAULT_THEME` exactly (`#E8531E`, `#2E7D32`, `#FFFFFF`, `#FFFFFF`, `#333333`, `#666666`). No visible difference today.
- ✅ Most text/empty diffs are representational (`null` vs `''`).
- ⚠️ **ONLY real drift = default FONT:** backend no-doc default = **Montserrat**; admin default + apply-time fallback = **Poppins**. So a **no-doc** restaurant renders **Montserrat**, while a **doc-without-font** restaurant renders **Poppins**. The backend `Montserrat` is stale.

➡️ **Net:** this is **maintainability/consistency tech-debt** (adding a new setting needs 3 edits → drift), with **one** small visible symptom (the font). Fixing = unify to backend, correct font to Poppins, prove no visible change.

---

## 2. Target design
1. Create ONE canonical default set in the backend: **`DEFAULT_APP_CONFIG`** (a module-level dict, e.g. `backend/config_defaults.py`).
2. **`get_app_config` always returns a COMPLETE config** for BOTH branches:
   ```
   doc = await db.customer_app_config.find_one({"restaurant_id": rid}, {"_id":0})
   return {**DEFAULT_APP_CONFIG, "restaurant_id": rid, **(doc or {})}
   ```
   ⇒ every API response is complete; gap-filling moves from FE → backend (single source).
3. **Frontend** reduces its duplicate defaults to a **minimal offline fallback**:
   - keep `DEFAULT_THEME` (colors) as the apply-time/offline color fallback (already "single source of truth for colors").
   - shrink `RestaurantConfigContext.DEFAULT_CONFIG` to only what's needed before the first backend response (anti-flash) — it no longer needs to be the authoritative gap-filler.
   - `AdminConfigContext.defaultConfig` derives from the backend response (or a thin shared shape), not a second hand-maintained list.
4. **Canonical font default = `Poppins`** in the backend `DEFAULT_APP_CONFIG` (corrects Montserrat). Apply-time `|| 'Poppins'` stays (harmless, now matches).

---

## 3. Exact change set — Phase 3C (defaults consolidation)

### 3C-BE (backend)
- **New** `backend/config_defaults.py` → `DEFAULT_APP_CONFIG = { ... }` containing the **superset** of all keys.
  - Seed it from the current `get_app_config` no-doc dict (`server.py:990–~1110`) **verbatim**, EXCEPT set `fontHeading="Poppins"`, `fontBody="Poppins"`.
  - **ADD the 13 keys currently missing from backend**, taking each value **verbatim from `RestaurantConfigContext.DEFAULT_CONFIG`** (that is the value in effect for doc-exists restaurants today):
    `allowNonQrOrders, backgroundImageUrl, browseMenuButtonText, menuOrder, mobileBackgroundImageUrl, skipOtpDineIn, skipOtpDineInWithTable, skipOtpTakeaway, skipOtpWalkIn, skipOtpDelivery, skipOtpRoomOrders, successMessage, successTitle`.
- **Edit** `get_app_config` (`server.py:980–~1110`) to `return {**DEFAULT_APP_CONFIG, "restaurant_id": rid, **(doc or {})}` for both branches. Remove the now-duplicated inline defaults dict.

### 3C-FE (frontend)
- `RestaurantConfigContext.jsx`: shrink `DEFAULT_CONFIG` to a minimal anti-flash set; keep cache + `DEFAULT_THEME` color fallback + `|| 'Poppins'`. Do NOT remove the merge `{...DEFAULT_CONFIG, ...backendData}`.
- `AdminConfigContext.jsx`: replace the hand-maintained `defaultConfig` with values derived from the backend response / a thin shared default (no second copy of all keys).
- `constants/theme.js`: unchanged (canonical colors).
- (Optional, Cleanup phase) legacy `pages/AdminSettings.jsx` font literals (`Big Shoulders`/`Montserrat`) — only if confirmed live; else leave to Cleanup.

### 3C — conflict resolution (canonical winners)
| Category | Canonical value | Note |
|---|---|---|
| Colors | backend hex == `DEFAULT_THEME` (`#E8531E`,`#2E7D32`,`#FFFFFF`,`#FFFFFF`,`#333333`,`#666666`) | already consistent — no visible change |
| **Fonts** | **`Poppins`** (heading + body) | corrects stale backend Montserrat |
| Empty text fields | `null` | normalize `''`→`null` |
| Empty structures | `menuOrder={}`, `extraInfoItems=[]` | |
| Labels | `payOnlineLabel="Pay Online"`, `payAtCounterLabel="Pay at Counter"`, `welcomeMessage="Welcome!"` | current values |
| skipOtp* / allowNonQrOrders | copy current `DEFAULT_CONFIG` values verbatim | CR-001/002 behaviour preserved |

---

## 4. Exact change set — Phase 3B (de-hardcode tenant/special behaviour)
> Behaviour-preserving: same behaviour, sourced from config instead of code. Do AFTER 3C.

| Item | Today (hardcoded) | Target |
|---|---|---|
| **Restaurant 716** carve-outs | `components/TableRoomSelector/TableRoomSelector.jsx:59–114`; `utils/orderAccessPolicy.js:43–45`; `utils/otpPolicy.js`; `components/FaviconRouteReset.jsx`; `components/DocumentTitleManager.jsx` | new admin/config flags (e.g. `roomOnlyFlow`, `neverBlockOrders`) read from `customer_app_config`; remove `=== '716'` checks |
| **Default 478** | `utils/useRestaurantId.js:134` (`"478"`) | use `process.env.REACT_APP_RESTAURANT_ID` (already wired elsewhere); drop the hardcoded literal |
| **`pos_id` "0001"** (8 spots) | `server.py:66,79,84,250,257,265,415,443` | **backend resolves pos_id per restaurant** (config/db); stop hardcoding in models/handlers; keep effective value `0001`; preserve `user_id = pos_{pos_id}_restaurant_{rid}` |

Each tenant rule = its **own small PR** with its own before/after check.

---

## 5. Freeze register (must NOT change)
POS data/logic · CRM data/logic · admin **Menu Order** overrides (ordering/visibility/**timings**) · loyalty/coupon/wallet (deferred) · all consolidation is **value+behaviour identical**.

---

## 6. QA / verification protocol (mandatory, per step)
**Pick 3 representative restaurants** from live `mygenie` (read-only):
- **R1 = no config doc** (e.g. a rid NOT in `[364,618,698,478,716]`) → currently hits backend no-doc defaults (Montserrat today!).
- **R2 = doc WITH explicit font** (a configured restaurant that set fontHeading/fontBody).
- **R3 = doc WITHOUT a font field** → currently hits `|| 'Poppins'`.

**Before/after, for each:**
1. Capture `GET /api/config/<rid>` JSON.
2. Capture the **rendered** CSS variables (`--font-heading`, `--font-body`, `--primary-color`, etc.) via a headless screenshot/eval.
3. **Require identical before vs after**, with ONE expected, owner-approved exception: **R1's font changes Montserrat → Poppins** (the intended correction). Confirm no live no-doc restaurant depends on Montserrat; if any does, flag to owner.
4. Run existing FE Jest suite + the (fixed) backend tests; CR-001/002 OTP-skip + non-QR behaviour must still pass.

**Phase 3B QA:** for restaurant **716** and a normal restaurant, every flow (scan, room-select, order-block, OTP, favicon/title) identical before/after; `pos_id`-derived `user_id` keys unchanged.

---

## 7. Rollback
- 3C-BE: keep old inline defaults in git history; revert `config_defaults.py` + the `get_app_config` edit in one commit.
- 3C-FE: DEFAULT_CONFIG/defaultConfig trims are additive-reversible.
- 3B: each tenant rule behind a config flag → flip flag / revert PR.
- Tag baseline before starting. Every step = small, separately-revertible PR.

---

## 8. Implementation order (for the agent)
1. **3C-BE**: add `config_defaults.py` (font→Poppins, +13 keys), make `get_app_config` merge-complete. → QA (snapshots R1/R2/R3).
2. **3C-FE**: trim `DEFAULT_CONFIG` + derive `AdminConfigContext.defaultConfig`. → QA.
3. **3B-pos_id**: backend-resolve `pos_id`. → QA (user_id keys unchanged).
4. **3B-478**: env-driven default restaurant. → QA.
5. **3B-716**: migrate carve-outs to config flags (one rule at a time). → QA per rule.
Each step: separate PR + QA-green before the next.

---

## 9. Definition of Done
- One backend canonical `DEFAULT_APP_CONFIG`; `get_app_config` always returns a complete config.
- Frontend has no second/third authoritative default list (only minimal offline + `DEFAULT_THEME`).
- Default font = Poppins everywhere; colors unchanged.
- No hardcoded `716` / `478` / `pos_id` in code (config/env/backend-driven).
- Snapshot parity proven for R1/R2/R3 (only the approved Montserrat→Poppins delta on R1).
- All existing tests green.

---

## 10. Out of scope / future CRs
- Loyalty/coupon/wallet CRM integration (next sprint, after consolidation).
- Per-restaurant offline branding bundle for cold devices.
- Dead-code removal (legacy `AdminSettings.jsx`, backend `customer/*` routes, commented `DEFAULT_RESTAURANT_ID`) — trace-gated, Cleanup phase.

## 11. Risks
- Backend merge-complete change affects EVERY config response → snapshot parity is the gate.
- 716 de-hardcoding touches ordering/room flow → migrate per-rule with QA.
- Confirm no live no-doc restaurant relies on Montserrat before the font flip.
