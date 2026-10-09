# Architecture & Security Readiness — before starting Multi-Outlet Discovery

Date: 2026-06 · Role: Investigation (read-only) · Sources: `memory/v2/*` (baseline, gap register, correction plan,
phase logs), `memory/change_requests/README.md` + CR folders, verified against current code.

## 1. What documentation exists

| Doc | Date | What it is | State |
|---|---|---|---|
| `v2/PROJECT_FINAL_BASELINE.md` | 2026-05-30 | Frozen description of the system: single-file FastAPI companion + React SPA talking to **3 backends** (FastAPI, CRM, POS) over 3 base URLs and 3–4 token systems | Still accurate |
| `v2/PROJECT_GAP_REGISTER.md` | 2026-05-30 | 21 gaps, classified P0–P3 (5 High) | 1 closed (GAP-021) |
| `v2/PROJECT_SECURITY_CONFIG_CONTROL_LAYER_CORRECTION_PLAN.md` | 2026-05-30 | 11-phase plan: security → config → auth → FE guards → BE middleware → CI → **modularization (Phase 9)** → cleanup | Approved direction; partially executed |
| `v2/PHASE0_OWNER_DECISIONS.md` | 2026-05-30 | Owner said: rotate passwords YES, rotate-only (no git scrub), stop OTP echo YES, CORS deferred, DB is pre-prod | Recorded |
| `v2/PHASE1/2/3_EXECUTION_LOG.md` | 2026-05/06 | Doc redaction, `db_import` guard, `.env.example` — "done locally, patches parked for owner" | Partially landed (see §2) |
| `change_requests/README.md` (CR registry) | 2026-07-03/04 | 16 items; notable: CR-000 POS creds out of bundle (**done**), CR-011 full POS proxy (**registered only**), CR-012 doc scrub + CI lint (registered), CR-007 prod env hardening (registered), CR-2026-07-04-004 telemetry (registered) | Mixed |

Note: `memory_repo/current-state/CURRENT_ARCHITECTURE.md` referenced by the baseline is **not present** in this checkout.

## 2. Documented gaps vs. current code (code is truth)

| Gap | Documented | Code today | Verdict |
|---|---|---|---|
| GAP-002 POS creds in JS bundle | High | FE no longer references `REACT_APP_LOGIN_*`; backend holds `MYGENIE_POS_LOGIN_*` and issues tokens | ✅ Fixed (CR-000). ⚠️ dead `REACT_APP_LOGIN_PHONE/PASSWORD` still in `frontend/.env` — remove |
| GAP-001 secrets in docs | High | `memory/PRD.md` shows `mygenie_admin:***` (redacted) | ✅ Redacted; rotation is owner-side, unverified |
| GAP-003 OTP echoed | High | `server.py:466` still returns `otp_for_testing`; `otp_store = {}` in-memory | ❌ Open (owner already approved removal) |
| GAP-005 CORS `*` + credentials, no rate limit | High | `server.py:1806-1809` unchanged | ❌ Open |
| GAP-010 db_import danger | High | `db_import.py` / `db_data/` no longer in `backend/` | ✅ Moot |
| GAP-015 no `.env.example` | Med | Not present | ❌ Open (patch never applied) |
| GAP-004 no middleware (errors/logging/headers) | Med | Only CORS middleware | ❌ Open |
| GAP-006 no FE route guard | Med | No `ProtectedRoute` | ❌ Open |
| GAP-009 no CI | Med | No `.github/workflows` | ❌ Open |
| GAP-013 single-file backend | Med | `server.py` 1,707 → **1,829 lines** (growing) | ❌ Open, worsening |
| GAP-014 3 backends / mixed axios+fetch / storage-coupled state | Med | Unchanged; 19 files read base-URL env vars directly | ❌ Open |
| Thick pages | (baseline §5) | `ReviewOrder.jsx` 2,070 · `AdminSettings` 1,324 · `LandingPage` 1,296 · `DeliveryAddress` 1,056 | ❌ Open, main change-risk driver |

## 3. Re-framing "monolithic"

The backend is not the scaling problem — it is a small companion service (config, loyalty lookup, admin auth, POS
token issuance). The *real* structural issue is the **frontend**:

- one SPA integrating **three backends directly** with three token systems and browser-storage session glue;
- business rules (fees, GST, order-type gating, per-restaurant carve-outs) living inside 1–2k-line page components;
- no automated gate, so every change is verified by hand.

Splitting into microservices would not help and would add operational load. The right target is:

- **Frontend: modular monolith** — feature folders (`src/features/<name>/{pages,components,hooks,api}`), one typed
  API client per backend behind a facade, transformers at the boundary, route guards + one session facade.
- **Backend: modular FastAPI + BFF direction** — routers/services split (Phase 9), and progressively make FastAPI the
  single API the browser talks to (CR-011), so CRM/POS credentials, tokens and rate-limits live server-side.

## 4. Recommended next steps

### Tier A — do *before* Master Outlet (small, already approved, unblocks safe change)
1. Remove `otp_for_testing` from `send-otp` response (GAP-003 echo; 1 line; owner approved G0.5).
2. CORS: explicit origins via `CORS_ORIGINS` (`*.mygenie.online` + preview); drop wildcard+credentials combo (GAP-005).
3. Add `backend/.env.example` + `frontend/.env.example`; delete dead `REACT_APP_LOGIN_*` from `frontend/.env` (GAP-015/002).
4. **CI gate** (Phase 8): `yarn build` + Jest + backend smoke against ephemeral Mongo. Non-negotiable before any structural work.
5. Owner-side: confirm POS service-account and Mongo passwords were actually rotated (G0.1/G0.2).

### Tier B — do *with* Master Outlet (it becomes the first module built the new way; no big-bang refactor)
6. Introduce `src/features/` and build Master Outlet there; new shared hooks (`useGeoLocation`, `useGroupIdentifier`) under `src/features/shared` or `hooks/`.
7. API client facade: one axios instance per backend (`pos`, `crm`, `own`) with timeouts + interceptors; `masterOutletService` uses it; no new `fetch(process.env…)` calls.
8. `ProtectedRoute` / `RoleGuard` + `session.js` facade (Phase 5) — Master Outlet routes register through the same router table.
9. Backend: any new endpoint (e.g. hostname resolver, group cache) goes into `backend/routers/<name>.py`, starting the Phase 9 split incrementally.
10. Contract-snapshot harness for existing `/api/*` responses so later refactors prove zero behaviour change.

### Tier C — after (plan already exists)
11. CR-011 full POS proxy (BFF) — moves CRM/POS writes behind FastAPI.
12. Backend middleware stack: request-id, structured logs, error envelope, security headers, rate-limit (Phase 6).
13. Persistent OTP store + RBAC/token lifecycle (Phase 4); config source-of-truth (GAP-008).
14. Thick-page decomposition (ReviewOrder, LandingPage, DeliveryAddress) into feature hooks — guarded by CI + snapshots.
15. Cleanup: 716 hardcoding, stubs, stale docs (Phase 10).

### Explicitly not recommended
- Microservices split of the backend.
- Frontend rewrite / framework change.
- Git-history purge (owner chose rotate-only).
- Pausing Master Outlet for a full refactor — Tier A is ~1–2 days; Tier B is *how* we build the module, not extra work.
