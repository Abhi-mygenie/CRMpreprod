# INTAKE DOC — CR-2026-09-12-001 (UMBRELLA)

## Item Identity

| Field | Value |
|-------|-------|
| **CR ID** | CR-2026-09-12-001 |
| **Title** | Architecture Correction Programme — umbrella for the pre-multi-brand scalability track (Phase A) + MySQL migration intake (Phase B) |
| **Classification** | CR — Programme / Refactor umbrella (no code of its own; owns sequencing + exit criteria of child CRs) |
| **Date Registered** | 2026-09-12 |
| **Reported By** | Owner |
| **Severity** | P0 (contains P0 security children) |
| **Risk** | CRITICAL (children touch `server.py`, `AuthContext.jsx`, `ReviewOrder.jsx`, interceptors — all CRITICAL/HIGH per Alpha v0.1 Part C) |
| **Status** | INTAKE ✅ — **owner decisions RECORDED 2026-09-12** (see `OWNER_DECISIONS_2026-09-12.md`); execution sequence in `EXECUTION_PLAN.md`; Point 1 approved to start, awaiting owner role assignment |
| **Supersedes** | `/app/memory/ARCHITECTURE_PLAN_2026-06_PHASE_A.md` (pre-intake proposal, now reference-only) |

---

## 1. Owner Request (verbatim)

> "1. correct the architecture so file is no more 1,829-line single file
> 2 fix all high and critical bugs
> 3 remove hardcoding if any
> 4 anythg else u suggets which should be included before moving multitier, so building multibrand is much easier architecture wise no conflict
> … also note we will be moving data base to mysql so those changes needs to be planned separately as phase b"

> "we will need to follow gate and rules — first registering crs"

> "if anything else is pending QA all QA should be done before"

---

## 2. Classification

| Check | Result |
|-------|--------|
| Bug? | Contains P0 security bugs (GAP-003, GAP-005) as children |
| Feature? | No |
| Refactor? | Yes — behaviour-preserving modularisation (BE + FE) |
| Investigation done? | Yes — `v2/PROJECT_GAP_REGISTER.md` (2026-05-30), `SESSION_HANDOVER_2026-06-ARCHITECTURE-TRACK.md` §3 re-verification, live code greps 2026-09-12 (see §5) |
| **Final classification** | **CR — Programme umbrella (Refactor + Security)** |

---

## 3. Duplicate Check

| Related item | Relationship | Verdict |
|---|---|---|
| `v2/PROJECT_SECURITY_CONFIG_CONTROL_LAYER_CORRECTION_PLAN.md` (11-phase plan, May) | Same goals; planned, largely not executed | SUPERSEDED BY this programme — reuse phase content, do not rewrite |
| CR-2026-07-03-011 full POS proxy | Overlaps child CR-007 (FE facade); direction decided by owner NEW-3 | RELATED — kept separate |
| CR-2026-07-03-012 doc scrub + CI lint | Lint rule only; child CR-005 adds CI *gate* | RELATED — kept separate |
| CR-2026-07-03-007 env hardening | Absorbs `.env.example` + dead FE env keys (scope F-07 added 2026-09-12) | FOLDED |
| CR-2026-08-03-001 remove 716 hardcoding | Plan COMPLETE, awaiting owner approval; becomes a Wave-3 member of this programme | ADOPTED (no new CR) |
| CR-2026-07-03-002 remove dead restaurant-info fetch | Already implemented, QA-pending | Wave-0 QA item only |
| Master Outlet track (`master_outlet/*`) | Consumer of this programme; paused | DOWNSTREAM |

**Verdict: DISTINCT as a programme; children de-duplicated individually above.**

---

## 4. Children (registered 2026-09-12)

| Wave | ID | Title | Sev | Risk | Gate blocker |
|---|---|---|---|---|---|
| 0 | CR-2026-09-12-002 | QA backlog closure (all IMPLEMENTED/QA-pending items) | P1 | LOW (QA only) | none — start immediately |
| 1 | CR-2026-09-12-003 | Remove OTP echo + persistent OTP store | P0 | CRITICAL | G0.5 already YES |
| 1 | CR-2026-09-12-004 | CORS lockdown + auth rate-limit + middleware stack | P0 | CRITICAL | G0.4 (origins list) |
| 1 | CR-2026-09-12-005 | CI gate + API contract snapshots + smoke tests | P1 | MEDIUM | G0.9 (disposable DB) |
| 1 | CR-2026-07-03-007 (F-07) | `.env.example` + purge dead FE env keys | P1 | LOW | none |
| 2 | CR-2026-09-12-006 | Backend modular split (`app/{core,db,models,repositories,services,routers}`) + delete dead `/api/docs/*` | P1 | CRITICAL | CR-005 must be CLOSED first |
| 2 | INV-2026-09-12-001 | Legacy `customer/*` FastAPI routes usage trace | — | — | none |
| 3 | CR-2026-09-12-007 | FE API-client facade (`api/clients/{own,pos,crm}`) + `session.js` storage facade | P1 | CRITICAL | NEW-2, NEW-3 |
| 3 | CR-2026-09-12-008 | FE `ProtectedRoute` / `RoleGuard` | P1 | HIGH | NEW-2 |
| 3 | CR-2026-08-03-001 | 716 hardcoding → config flags (existing) | P1 | HIGH | owner approval of existing plan |
| 3 | CR-2026-09-12-009 | Remove default rid `478`, `pos_id`, `+91` hardcoding | P2 | MEDIUM | D-478 |
| 3 | CR-2026-09-12-010 | Config defaults single source of truth (GAP-008) | P1 | HIGH | G0.7 |
| 4 | CR-2026-09-12-011 | Multi-brand tenant readiness (`resolveTenant`, `get_tenant()`, tenant-namespaced storage) | P1 | HIGH | CR-006, CR-007 |
| 5 | CR-2026-09-12-012 | Thick-page decomposition — `ReviewOrder.jsx` | P2 | CRITICAL | CR-005, CR-007 |
| 5 | CR-2026-09-12-013 | Thick-page decomposition — `LandingPage`, `DeliveryAddress`, `OrderSuccess`, legacy `AdminSettings` | P2 | HIGH | CR-012 pattern proven |
| B | CR-2026-09-12-014 | Phase B — MySQL migration (INTAKE ONLY; Planning blocked) | P2 | CRITICAL | CR-006 repositories CLOSED |

Sequencing rule: a wave opens Planning only when the previous wave's CRITICAL items are QA-closed. Wave 5 may run in parallel with Master Outlet build.

---

## 5. Evidence (code is truth — greps 2026-09-12)

| Fact | Source |
|---|---|
| `server.py` = 1,829 lines, ~60 routes, 11 Mongo collections | `wc -l`, route grep |
| `otp_store = {}` in-memory; `otp_for_testing` in send-otp response | `server.py:366`, `:466` |
| CORS `*` + `allow_credentials=True`; no rate-limit | `server.py:1806-1809`; `requirements.txt` has no slowapi |
| 8 dead `/api/docs/*` routes | `server.py:1731-1795` |
| FE: 20 files read `process.env.REACT_APP_*`; 14 raw `fetch` files vs 7 axios; 56 direct storage calls; no `ProtectedRoute` | grep counts |
| Hardcodes: `478` default (`useRestaurantId.js:134`), `716` at 27 sites / 8 files, `pos_id`, `+91` | `INV-2026-08-03-001` + grep |
| `frontend/.env` still holds `REACT_APP_LOGIN_*` and `MYGENIE_POS_LOGIN_*` (dead; POS creds in FE env) | `.env` key list |
| Thick pages: ReviewOrder 2,070 · AdminSettings 1,324 · LandingPage 1,296 · MenuOrderTab 1,231 · DeliveryAddress 1,056 · MenuItems 974 · OrderSuccess 852 | `wc -l` |
| No CI, `backend/tests/` empty | `ls` |

---

## 6. Owner decisions required before Planning gate opens (collect in ONE ask)

| ID | Question | Default if silent | Blocks |
|---|---|---|---|
| G0.1/G0.2 | Were Mongo + POS passwords actually rotated? | Assume NO → CR-007 adds rotation checklist | CR-007 |
| G0.4 | Production CORS origins (hostnames) | Preview URL only | CR-004 |
| G0.7 | Config defaults source of truth: backend / FE / DB | Backend `config_service.DEFAULTS` | CR-010 |
| G0.9 | CI uses disposable DB only, never live | YES | CR-005 |
| NEW-1 | Approve Wave 1 as one bundle | YES | Wave 1 |
| NEW-2 | Feature-folder + API-facade as standard for new modules | YES | CR-007/008 |
| NEW-3 | BFF direction (all traffic via FastAPI, CR-011) vs FE→POS/CRM direct with server-side token issuance only | Facade-first, CR-011 later | CR-007 |
| NEW-4 | Sequencing: Wave 0 → 1 → 2 → 3 → 4 → (Master Outlet ∥ Wave 5) → Phase B | YES | all |
| D-716 | Approve existing CR-2026-08-03-001 plan | — | CR-2026-08-03-001 |
| D-478 | Remove `478` fallback (explicit "restaurant not found" page) vs keep behind dev env var | Remove | CR-009 |
| D-OTP | OTP delivery after echo removal: CRM SMS path only vs new SMS provider | CRM only | CR-003 |
| D-B1 | MySQL flavour/host (MySQL 8 managed / MariaDB / self-hosted) | MySQL 8 | CR-014 Planning |

---

## 7. Blast Radius

**LARGE.** Every API call, every page, every storage key is touched across the programme. Mitigation = Wave 1 CI/contract-snapshot cover before any Wave ≥2 code, one CR at a time, code markers per CR.

---

## 8. Exit criteria (programme CLOSED when)

1. All children CLOSED per Alpha v0.1 §15, or explicitly DEFERRED by owner with rationale.
2. `server.py` ≤ 20 lines (mount only); no `db.` access outside `app/repositories/`.
3. `grep -r "process.env.REACT_APP" src --exclude-dir=api/clients` = 0; `grep -rn "'716'\|\"478\"" src` = 0.
4. No `otp_for_testing`; CORS explicit; `/auth/*` rate-limited.
5. CI green on `main`; contract snapshots unchanged except where a CR intentionally changed them.
6. Master Outlet Planning can reference `resolveTenant` + `get_tenant()` as existing primitives.

---

```text
Intake complete: CR-2026-09-12-001
Classification: CR (Programme umbrella — Refactor + Security)
Severity: P0
Risk: CRITICAL
Duplicate check: DISTINCT (children de-duplicated; 1 folded, 1 adopted)
Evidence: captured (§5)
Blast radius: LARGE
Docs updated: this file; change_requests/README.md; PRD.md
Next: Owner decision gate (§6) → Planning for Wave 0 + Wave 1
```
