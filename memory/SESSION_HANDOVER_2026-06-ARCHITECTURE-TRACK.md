# SESSION HANDOVER — Architecture Correction Track (pre Multi-Outlet)

Date: 2026-06 (session continuing from 2026-09-10 handover)
Written by: Investigation/Discovery agent (read-only on app code except one dev-server fix, see §7)
For: **Next agent — Architecture Correction Planner / Re-investigator**
Owner instruction (verbatim): *"First, I want to correct the architecture. Write a handover for the next agent who will
relook into this investigation which you did about the architecture, and then we will take it from here. Let him suggest
what should be the next step."*

Operating process: `/app/memory/control/MYGENIE_CUSTOMER_APP_AGENT_SYSTEM_PROMPT_ALPHA_v0_1.md` (roles, gates, artefacts).
Start in **Role 6 (Investigation) → Role 2 (Planning)**. Do not implement without owner approval.

---

## 0. TL;DR for the next agent

1. A full architecture/security audit already exists (30 May 2026, `memory/v2/*`): 21 gaps, 11-phase correction plan,
   owner decisions recorded. It was **planned but largely not executed**.
2. This session re-verified every gap against **current code** (§3). Two are fixed, one is moot, the rest are open;
   `server.py` has grown; thick pages are the main change-risk driver.
3. This session's conclusion: the scaling problem is **not** the backend "monolith" — it is the **frontend** (one SPA
   wired directly to 3 backends, business rules inside 1–2k-line pages, no CI). Target = **modular monolith + BFF
   direction**, not microservices (§4).
4. A tiered recommendation exists (§5). Owner has **not** approved it yet; owner wants a second look first.
5. Your job: re-examine §3–§5 with fresh eyes, challenge them, then propose the concrete next step (likely: a CR bundle
   for Tier A + a Planning doc for the FE module structure) and take owner decisions in §8.
6. Master Outlet (multi-outlet discovery) work is **paused** until the architecture track has a decision. Its
   architecture docs are complete and should be treated as a *consumer* of the architecture decisions (§6).

---

## 1. Documents you must read (in this order)

| # | Path | Why |
|---|---|---|
| 1 | `memory/control/MYGENIE_CUSTOMER_APP_AGENT_SYSTEM_PROMPT_ALPHA_v0_1.md` | Process, roles, gates, artefact formats. Mandatory. |
| 2 | `memory/v2/PROJECT_FINAL_BASELINE.md` | Frozen system description (30 May 2026). Still substantively accurate. |
| 3 | `memory/v2/PROJECT_GAP_REGISTER.md` | 21 gaps with severity/bucket. Cross-check with §3 below. |
| 4 | `memory/v2/PROJECT_SECURITY_CONFIG_CONTROL_LAYER_CORRECTION_PLAN.md` | 11-phase plan; Phase 9 = modularization. Reuse, don't rewrite. |
| 5 | `memory/v2/PHASE0_OWNER_DECISIONS.md` | Owner answers already given (rotate YES, rotate-only, stop OTP echo YES, CORS deferred, DB is pre-prod). |
| 6 | `memory/v2/PHASE1_EXECUTION_LOG.md`, `PHASE2_…`, `PHASE3_…` | What was "done locally, patches parked". Verify against code — some never landed. |
| 7 | `memory/change_requests/README.md` | CR registry. Key: CR-000 (done), CR-011 (full POS proxy, registered), CR-012 (doc scrub + CI lint, registered), CR-007 (prod env hardening), CR-2026-07-04-004 (telemetry). |
| 8 | `memory/master_outlet/PRE_MODULE_ARCHITECTURE_READINESS.md` | This session's readiness summary (source of §3–§5). |
| 9 | `memory/master_outlet/ARCHITECTURE_REEVALUATION.md` | Master Outlet architecture (technical). Consumer of architecture decisions. |
| 10 | `memory/master_outlet/Multi-Outlet-Discovery-Team-Discussion.html` | Same, plain-language, for the owner's team. |
| 11 | `memory/SESSION_HANDOVER_2026-09-10.md` | Previous session (Razorpay fix, deployment). |

Missing: `memory_repo/current-state/CURRENT_ARCHITECTURE.md` is referenced by the baseline but **does not exist in this
checkout**. Do not go looking for it; the baseline doc carries the substance.

---

## 2. System shape (verified this session)

```
Browser (React 19 SPA, CRA+craco, react-router 7, TanStack Query, axios+fetch mixed)
   ├── Own FastAPI  (REACT_APP_BACKEND_URL → /api/*)          auth_token (admin JWT), config, loyalty, uploads, POS token issuance
   ├── MyGenie CRM  (REACT_APP_CRM_URL, v2 adapter)           crm_token_{restaurantId}; customer identity, OTP, addresses, points
   └── MyGenie POS  (REACT_APP_API_BASE_URL, manage.mygenie.online)  order_auth_token (issued by our FastAPI), pos_token; menu, orders, Razorpay, distance-api-new
FastAPI (backend/server.py, 1,829 lines, single file) ── MongoDB (external host, pre-prod per owner)
```

- Routing: `/:restaurantId/*` everywhere; hostname → restaurant via `utils/useRestaurantId.js` (`getSubdomain()` →
  `getRestaurantDetails(hostname)`); hard fallback `478`.
- Session/state glue in browser storage: `cart_<rid>`, `delivery_<rid>`, `delivery_charge_<rid>`,
  `scanned_table_<rid>` (sessionStorage; carries `order_type`, table, food_for), `guestCustomer`, `crm_token_<rid>`,
  `restaurant_config_<rid>`, `auth_token`, `pos_token`, `order_auth_token`.
- Order type enters via URL (`?orderType=delivery|takeaway|dinein`) → `hooks/useScannedTable.js`. This is the proven
  cross-origin-safe handoff mechanism (Master Outlet plans to extend it).
- Delivery: `pages/DeliveryAddress.jsx` requires CRM login; fee via `manage.mygenie.online/api/v1/config/distance-api-new`
  (also re-run in `ReviewOrder.jsx` L771-800 with debounce).

---

## 3. Gap register vs. current code (re-verified this session — code is truth)

| Gap | Documented (May) | Code now | Verdict |
|---|---|---|---|
| GAP-002 POS creds in JS bundle | High | `frontend/src` has **zero** references to `REACT_APP_LOGIN_*`; backend `server.py:56-62` reads `MYGENIE_POS_LOGIN_PHONE/PASSWORD`, issues order tokens (CR-000) | ✅ Fixed. ⚠️ dead `REACT_APP_LOGIN_PHONE/PASSWORD` still present in `frontend/.env` — delete |
| GAP-001 secrets in docs | High | `memory/PRD.md:29` shows `mygenie_admin:***` | ✅ Redacted. Rotation = owner-side, **unverified** |
| GAP-003 OTP echo + in-memory store | High | `server.py:366 otp_store = {}`; `server.py:466` returns `"otp_for_testing": otp` | ❌ Open. Owner approved removal (G0.5). SMS not integrated (parked CR) |
| GAP-005 CORS `*`+credentials, no rate-limit | High | `server.py:1806-1809` `allow_credentials=True`, `allow_origins=CORS_ORIGINS or '*'`; `.env` has `CORS_ORIGINS=*` | ❌ Open |
| GAP-010 db_import danger | High | `backend/` contains only `server.py, requirements.txt, pytest.ini, uploads/` — no `db_import.py`/`db_data/` | ✅ Moot in this checkout (confirm in GitHub main) |
| GAP-015 no `.env.example` | Med | Not present in `backend/` or `frontend/` | ❌ Open (Phase 3 patch never applied) |
| GAP-004 no middleware stack | Med | Only `CORSMiddleware` | ❌ Open |
| GAP-006 no FE route guard | Med | No `ProtectedRoute`/`RoleGuard` in `frontend/src/components` | ❌ Open |
| GAP-009 no CI | Med | No `.github/workflows`; `backend/tests/` absent in this checkout (only `pytest.ini`) | ❌ Open |
| GAP-013 single-file backend | Med | `server.py` 1,707 → **1,829** lines | ❌ Open, worsening |
| GAP-014 3 backends / mixed clients / storage-coupled | Med | 19 files read `REACT_APP_*_URL` directly; `fetch` + `axios` mixed; `DeliveryAddress`/`ReviewOrder` call POS `distance-api-new` via raw `fetch` | ❌ Open |
| GAP-008 config default triplication | Med | Not re-verified this session | ? |
| GAP-011/012 token fragmentation / thin RBAC | Med | Not re-verified; token keys listed in §2 still all present | ❌ Presumed open |
| GAP-016 716 hardcoding | Low | `INV-2026-08-03-001-716-HARDCODING-REPORT.md` + `CR-2026-08-03-001` exist | See those docs |
| Thick pages (baseline §5) | — | `ReviewOrder.jsx` **2,070** · `AdminSettings.jsx` 1,324 · `LandingPage.jsx` 1,296 · `DeliveryAddress.jsx` 1,056 · `MenuItems.jsx` 974 · `OrderSuccess.jsx` 852 | ❌ Main change-risk driver |

New this session (not in register): public POS endpoint `GET preprod.mygenie.online/api/v1/master-outlet/478` returns the
full `master_restaurant` object incl. `crm_token: dp_live_…`, `upi_id`, `email`, `live_payment`. **Backend-owned
(POS repo)**, but must be raised to the POS team before Master Outlet ships.

---

## 4. This session's architectural position (challenge it)

**Claim A — "Monolithic" is misdiagnosed.** The FastAPI companion is small and thin. The structural debt is in the
frontend: direct integration with three backends, 3–4 token systems, business rules inside page components, no
automated gate. Splitting the backend into services would add ops cost and fix nothing the owner feels.

**Claim B — Target = modular monolith + BFF direction.**
- Frontend: `src/features/<name>/{pages,components,hooks,api}`; one typed API client per backend behind a facade
  (`api/clients/{pos,crm,own}.js`) with timeouts + interceptors; transformers at the boundary (pattern already exists in
  `api/transformers`); `ProtectedRoute`/`RoleGuard`; one `session.js` facade over the token keys.
- Backend: split `server.py` into `routers/ services/ auth/ db.py middleware/ models/` (Phase 9, behaviour-preserving),
  and progressively route CRM/POS writes through FastAPI (CR-011) so credentials, tokens and rate limits live server-side.

**Claim C — Do not big-bang.** Master Outlet becomes the *first* feature built in the new structure; thick-page
decomposition happens later under CI + contract-snapshot cover.

Questions the next agent should answer explicitly:
- Is Claim A right, or is there backend load/coupling evidence that changes the priority?
- Is a BFF (all traffic via FastAPI) actually desirable given POS/CRM are owned by the same company? Latency, ownership,
  and who fixes what when it breaks.
- Should feature-folder migration be opportunistic (per touched feature) or scheduled?
- What is the minimum CI that gives real safety (build + Jest + backend smoke + contract snapshots)?

---

## 5. Recommendation as it stands (owner has NOT approved; re-evaluate)

**Tier A — before Master Outlet (≈1–2 days; all previously approved in Phase 0):**
1. Remove `otp_for_testing` from `send-otp` response (`server.py:466`).
2. CORS explicit origins via `CORS_ORIGINS`; remove wildcard+credentials.
3. `backend/.env.example` + `frontend/.env.example`; delete dead `REACT_APP_LOGIN_*` from `frontend/.env`.
4. CI gate: `yarn build` + Jest + backend smoke on ephemeral Mongo (never live DB — G0.9).
5. Owner confirms POS + Mongo password rotation actually happened.

**Tier B — built into Master Outlet (no extra calendar time):**
6. `src/features/master-outlet/` as first feature module.
7. API client facade; `masterOutletService` uses it; no new raw `fetch(process.env…)`.
8. `ProtectedRoute` + `session.js` facade.
9. Any new backend endpoint → `backend/routers/<name>.py` (start Phase 9 incrementally).
10. Contract-snapshot harness for existing `/api/*`.

**Tier C — after:** CR-011 POS proxy; middleware stack (Phase 6); persistent OTP + RBAC (Phase 4); config source of
truth (GAP-008); thick-page decomposition; Phase 10 cleanup.

**Not recommended:** microservices; FE rewrite; git-history purge (owner chose rotate-only); pausing Master Outlet for a
full refactor.

---

## 6. Master Outlet track (paused, ready)

- Owner treats the backend brief as a *suggestion*; architecture principles P1–P7 are in `ARCHITECTURE_REEVALUATION.md`.
- Key principles that depend on the architecture track: P4 (URL-based handoff, extends `useScannedTable`), P5 (typed
  hostname resolver `{type: group|restaurant}` extending `useRestaurantId`), P7 (transformer/adapter layer).
- Six owner decisions D1–D6 are pending (hosting model, pickup-only cards, mode toggle, cross-host outlets, backend
  eligibility unification, order attribution).
- Backend asks to POS team, ordered: (1) strip private data from public group GET — release blocker; (2) compute
  delivery availability/fee with the same engine as `distance-api-new`; (3) `hostname` instead of `redirect_url`;
  (4) hostname resolver for groups+restaurants; (5) 0-based offset, numeric lat/lng, `nearest`, drop `radius_km`.
- Live preprod evidence captured in `ARCHITECTURE_REEVALUATION.md` §3 (e.g. outlet 510 stored at Surat coords "delivers"
  to Delhi 110001, 1,544 km).
- Brief files: `memory/master_outlet/FRONTEND_MASTER_OUTLET_INTEGRATION.md`, `postman_master_outlet_collection.json`.

---

## 7. Changes made to the working copy this session

| File | Change | Why |
|---|---|---|
| `frontend/craco.config.js` | Added 7-line shim in `devServer` fn: delete deprecated `https` option, map to `server` | Dev server was failing to start (`webpack-dev-server` v5 schema rejects `https`). Dev-only; no effect on `yarn build`. |
| `frontend/public/multi-outlet-discovery.html` | New (copy of the team HTML) | So owner's team can open it via the preview URL. **Delete before pushing to main** if unwanted in repo. |
| `memory/master_outlet/*` | New docs (this track) | Evidence + analysis |
| Untracked `yarn.lock` at `/app/yarn.lock` and `/app/frontend/yarn.lock` | Pre-existing, not created here | Note for git hygiene |

No app behaviour was changed. No .env, DB, or secret changes.

---

## 8. Owner decisions still open (collect these)

| ID | Question | Context |
|---|---|---|
| G0.1/G0.2 | Were Mongo + POS passwords actually rotated? | Phase 0 said YES; no evidence in repo |
| G0.4 | Production CORS origins | Deferred in May; `*` still live |
| G0.7 | Config defaults source of truth (backend / FE / DB) | Blocks GAP-008 |
| G0.9 | CI must use disposable DB — confirm | Blocks Phase 8 |
| NEW-1 | Approve Tier A as one CR bundle? | §5 |
| NEW-2 | Approve feature-folder + API-facade structure as the standard for new modules? | §4 Claim B |
| NEW-3 | Is BFF (CR-011) the long-term direction, or keep FE→POS/CRM direct with server-side token issuance only? | §4 |
| NEW-4 | Sequencing: Tier A first, then Master Outlet planning? | Owner said "first correct the architecture" |
| D1–D6 | Master Outlet decisions | `ARCHITECTURE_REEVALUATION.md` §9 |

---

## 9. Environment / credentials (for verification only)

- Preview: value of `REACT_APP_BACKEND_URL` in `/app/frontend/.env` (do not construct manually).
- POS login (owner-provided for testing): see `/app/memory/test_credentials.md`.
- Services via supervisor (`sudo supervisorctl status`). Frontend takes ~60 s to compile after restart.
- Backend health: `GET {REACT_APP_BACKEND_URL}/api/healthz` → `{"ok":true,"mongo":"up"}`.
- Live POS APIs used for evidence: `https://preprod.mygenie.online/api/v1/master-outlet/478`,
  `POST …/478/verify-location`, `POST https://manage.mygenie.online/api/v1/config/distance-api-new`.

---

## 10. Suggested first actions for the next agent

1. Read §1 docs 1, 3, 4, 5, 8 (≈30 min).
2. Re-verify §3 rows marked "?" or "presumed" (GAP-008, GAP-011, GAP-012) against code — 5 greps.
3. Decide whether you agree with §4 Claims A–C; write a short **Investigation report** (Role 6 format) stating
   agreement/disagreement with evidence.
4. Produce a **Planning report** (Role 2 format) proposing the concrete next step — most likely:
   `CR-2026-06-XX-001-architecture-tier-a` (OTP echo, CORS, .env.example, CI) with QA checklist, plus a
   `PLANNING_FE_MODULE_STRUCTURE.md` defining the feature-folder + API-facade standard that Master Outlet will follow.
5. Bring §8 decisions to the owner in one `ask` — not piecemeal.
6. Do not start Master Outlet implementation until NEW-4 is answered.

_End of handover._
