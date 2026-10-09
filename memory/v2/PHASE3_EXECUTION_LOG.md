# Phase 3 — Execution Log (Config / Env Baseline)

> Date (UTC): 2026-05-31 · Owner approval: **"next"** → Phase 3
> Working copy: re-cloned `/tmp/baseline_repo` @ `4612953` (prior /tmp clone was cleared; all Phase 1/2 deliverables preserved as patches in /app/memory/v2)
> Scope done: **GAP-015** (.env.example templates). **GAP-008 deferred** (needs owner G0.7 decision).
> No git push/commit performed.

## What was done (GAP-015)
1. **`backend/.env.example`** (new) — documents all 5 backend runtime vars (`MONGO_URL`, `DB_NAME`, `JWT_SECRET`, `MYGENIE_API_URL`, `CORS_ORIGINS`) with placeholders + guidance; notes the test-only `REACT_APP_BACKEND_URL`. **No real secrets.**
2. **`frontend/.env.example`** (new) — documents all 11 frontend vars (`REACT_APP_BACKEND_URL`, `REACT_APP_API_BASE_URL`, `REACT_APP_CRM_URL`, `REACT_APP_CRM_API_VERSION`, `REACT_APP_CRM_API_KEY`, `REACT_APP_IMAGE_BASE_URL`, `REACT_APP_GOOGLE_MAPS_API_KEY`, `REACT_APP_RESTAURANT_ID`, `REACT_APP_LOGIN_PHONE`, `REACT_APP_LOGIN_PASSWORD`, `NODE_ENV`) with placeholders; flags the POS login pair as legacy/to-be-removed in GAP-002. **No real secrets.**
3. **`.gitignore`** — added a negation block so the template files are committable while the real `.env` files stay ignored:
   ```
   !.env.example
   !*.env.example
   !backend/.env.example
   !frontend/.env.example
   ```
   (Needed because `.env.*` was silently ignoring `.env.example`.)

## Verification (all green)
- Coverage: **every** env var used in code (5 backend + 10 REACT_APP_* frontend) is present in a template. ✓
- Secret scan on templates → **CLEAN** (no real passwords/keys). ✓
- `.env.example` files are now **committable** (no longer git-ignored). ✓
- Real `.env` files (`backend/.env`, `frontend/.env`, `.env`, `.env.production`) **remain ignored**. ✓

## Behavior change
- None at runtime. Pure documentation/onboarding artifacts + a `.gitignore` allow-rule.

## Artifacts (in /app/memory/v2)
- `phase3_backend_env_example.patch`, `phase3_frontend_env_example.patch`, `phase3_gitignore_allow_examples.patch`.

## Deferred in this phase
- **GAP-008 (config-default consolidation + backfill):** behavior-sensitive (must be a 1:1 value-preserving de-duplication of backend `get_app_config()` vs FE `DEFAULT_CONFIG` vs DB). Blocked on owner decision **G0.7** (which layer owns the defaults). Recommended as its own dedicated step.

## Status
GAP-015: **DONE (local, verified)**. Delivery = owner applies patches (parked). GAP-008: pending G0.7.
