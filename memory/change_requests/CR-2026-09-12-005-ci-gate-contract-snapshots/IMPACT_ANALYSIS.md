# IMPACT ANALYSIS — CR-2026-09-12-005 (CI gate + API contract snapshots + backend smoke tests)

**Role:** Planning (Role 2) · Stage: Impact Analysis · No code will be written in this document.
**Date:** 2026-09-12
**Parent:** CR-2026-09-12-001 (Architecture Correction Programme — Wave 1, build slot #1)
**Prior gate:** Wave 0 CLOSED 2026-09-12 (10/10 items + 4/4 notes)
**Follows Alpha v0.1 §8 Role 2 output contract.**

---

## 1. Verification the item is registered

| Check | Evidence | Result |
|---|---|---|
| Registered in registry | `change_requests/README.md` row for CR-2026-09-12-005 | ✅ |
| INTAKE_DOC present | `CR-2026-09-12-005-ci-gate-contract-snapshots/INTAKE_DOC.md` | ✅ |
| Wave sequence approved | `EXECUTION_PLAN.md` Point 3 puts CR-005 first in Wave 1 build order | ✅ |
| Owner Decision unblocks intake | G0.9 (disposable DB) = YES | ✅ |
| Prerequisites | Wave 0 CLOSED | ✅ |
| Adjacent CR-2026-07-03-012 (CI lint) | RELATED — its lint script must plug into this workflow | noted (not a blocker) |

---

## 2. Code reality (evidence — 2026-09-12)

| Fact | Source |
|------|--------|
| Backend has 46 route decorators across 8 routers (`api`, `auth`, `customer`, `config`, `upload`, `dietary`, `diagnostics`, `airbnb`) | `grep -cE "^@[a-z_]+_router\.\|^@app\." backend/server.py` |
| 8 of those are dead `/api/docs/*` routes (targeted for deletion in CR-006) | `server.py:1731–1794` |
| `backend/tests/` contains ONLY `__init__.py` (empty scaffolding) | `ls backend/tests/` |
| Root-level `/app/tests/pytest/` exists (empty) | `ls /app/tests/pytest/` |
| Existing test-related deps in `backend/requirements.txt`: `pytest 9.0.2`, `httpx 0.28.1`, `jsonschema 4.26.0` | grep |
| NO deps for snapshot testing (`syrupy`, `inline-snapshot`, `pytest-asyncio`, `mongomock`) | grep |
| No `.github/workflows/` folder — no CI at all today | `ls /app/.github` = miss |
| Only YAML in repo: `.emergent/emergent.yml` (platform config — **do not modify**, addendum §12 rule 9) | `find` |
| Backend already reads: `MONGO_URL`, `DB_NAME`, `JWT_SECRET`, `MYGENIE_API_URL`, `MYGENIE_POS_LOGIN_PHONE/PASSWORD`; fails-fast on any missing | `server.py:24, 39, 56–65` |

---

## 3. Conflict check (per §10 — no other active CR touching these files)

| CR / INV | Touches `backend/tests/*` or `.github/*` ? | Verdict |
|---|---|---|
| CR-2026-09-12-003 (OTP) | Will change `send-otp` **response shape** — expected snapshot delta after CR-005 lands | No conflict; **that is the design** |
| CR-2026-09-12-004 (CORS) | Will change middleware — no `/api/*` response body change expected | No conflict |
| CR-2026-07-03-007 F-07 (env) | `.env.example` only; no test code | No conflict |
| CR-2026-09-12-006 (backend split) | Depends on CR-005 being CLOSED first | Dependency, not conflict |
| CR-2026-07-03-012 (CI lint) | Will plug an extra ESLint step into the workflow this CR creates | Downstream reuse |
| INV-2026-09-12-001 (legacy routes trace) | Investigation only — no code | No conflict |

**Verdict: no conflicts. This is an additive, greenfield infrastructure CR.**

---

## 4. Data-flow / architectural trace

CR-005 does **not** touch any runtime data flow. It adds three parallel artefacts that observe the runtime from outside:

```text
┌──────────────────────────────────────────────────────────────┐
│  GitHub Actions runner (per PR / per push to main / cron)    │
│                                                              │
│  Job A — frontend                                            │
│    yarn install (frozen lockfile)                            │
│    CI=false yarn build   ← addendum §12 rule 7               │
│    yarn test --watchAll=false                                │
│                                                              │
│  Job B — backend                                             │
│    service mongo:6         ← ephemeral, per-run              │
│    pip install -r requirements.txt                           │
│    python backend/tests/fixtures/seed.py   ← seed test rid   │
│    pytest -m "contract or smoke" backend/tests/              │
│                                                              │
│  Job C — depends on B — post-run diff                        │
│    fail if git diff --exit-code on                           │
│    backend/tests/fixtures/snapshots/ is non-empty            │
│    (i.e. an unintended snapshot mutation)                    │
└──────────────────────────────────────────────────────────────┘

           No runtime app change. No production data touched.
```

The **only** thing this CR guarantees at runtime is: **any future PR that changes an API response body (shape or key set) fails CI unless the author explicitly regenerates the snapshot** — which becomes a review checkpoint.

---

## 5. Snapshot scope — proposed classification

CR-005 must decide which endpoints go into the **contract** bucket (JSON-shape-compared) vs the **smoke** bucket (behaviour asserted, no snapshot). Recommendation:

### 5.1 Contract-snapshot bucket — 13 endpoints

| Endpoint | Method | Why snapshot |
|---|---|---|
| `/api/` | GET | trivial welcome — cheap regression tripwire |
| `/api/healthz` | GET | proves DB connectivity in CI |
| `/api/config/478` | GET | **the biggest shape** — 105 keys today; single-menu Mongo-backed baseline; every FE surface depends on it |
| `/api/config/716` | GET | multi-menu Mongo-backed variant; different key subset from 478 |
| `/api/config/9999` | GET | **Q2-a:** nonexistent-rid → exercises the hard-coded `defaults-in-code` fallback path (~50 keys from `server.py:1051–1155`). Freezing this today makes CR-2026-09-12-010 (Wave 3, moves defaults → DB record) a visible snapshot delta. |
| `/api/dietary-tags/available` | GET | static enum list |
| `/api/dietary-tags/478` | GET | per-restaurant dietary |
| `/api/loyalty-settings/478` | GET | small stable shape |
| `/api/customer-lookup/478?phone={probe}` | GET | shape of check-customer response |
| `/api/config/feedback/478` | GET | feedback listing shape |
| `/api/upload/image/{seed_filename}` | GET | Content-Type + body-size assertion (not JSON) |
| `/api/status` | GET | status listing shape |
| `/api/table-config` | GET | header-gated (`X-POS-Token`) — snapshot the 401 shape too |

### 5.2 Smoke-behaviour bucket — 8 flows (asserted, not compared as JSON)

| Flow | Endpoints | Assertion |
|---|---|---|
| Send OTP (test mode) | `POST /auth/send-otp` | 200 + `otp_for_testing` present TODAY (this snapshot will FAIL after CR-003 removes the echo — that is the design) |
| Login as admin | `POST /auth/login` | 200 + JWT decodes + `user_type=="restaurant"` |
| Auth me | `GET /auth/me` | 200 + `restaurant_id` echoed |
| POS auth-token proxy | `POST /api/pos/auth-token` | 200 + JWT length ≥ 100 (real POS) or 502 (POS unreachable — allowed) |
| Config PUT round-trip | `PUT /api/config/` | 200 + `GET /api/config/{rid}` reflects the change |
| Upload image round-trip | `POST /api/upload/image` + `GET /api/upload/image/{filename}` | 200 + md5(upload)==md5(download) |
| Auth without token | `GET /auth/me` (no Auth header) | 401 |
| Auth with bad token | `GET /auth/me` (bad JWT) | 401 |

### 5.3 Explicitly OUT-of-scope for this CR

- **Playwright / frontend E2E** — later CR.
- **POS/CRM live integration tests** — not deterministic; belongs to a separate contract-test CR.
- **Load / performance / chaos** — out of scope.
- **Airbnb `/api/airbnb/get-order-details/{order_id}`** — out; depends on external state.
- **Feedback POST**, **banner CRUD**, **customer profile PUT** — will be picked up in a follow-up CR (each requires seeded fixture data). Owner may add them later.

---

## 6. Risk verification

Intake asserted MEDIUM. I concur, with these caveats:

| Risk factor | Level | Notes |
|---|---|---|
| App code changes | NONE | no `server.py` / no FE src edit |
| Env changes | NONE | CI reads only ephemeral values |
| Prod data exposure | NONE | CI uses ephemeral Mongo container (Owner G0.9) |
| Snapshot flakiness | LOW | avoid dynamic fields — pre-strip `updated_at`, `_id`, `token`, `created_at` before comparison |
| CI cost | LOW | GitHub Actions minutes only; single Mongo service container |
| **Only material risk** | **MEDIUM** | Getting the JWT_SECRET + POS creds + Mongo URL as secrets into GitHub Actions. Wrong values → CI runs against wrong DB → data corruption. Mitigation: hard-coded `MONGO_URL=mongodb://mongo:27017/mygenie_ci` in the workflow file; secrets used only for `MYGENIE_POS_LOGIN_*` (for the smoke test that hits real POS — that hits preprod, not prod) |

**Final risk verdict: MEDIUM.** Concurs with intake.

---

## 7. Files that WILL change (all NEW — additive)

| # | Path | Type | Role |
|---|---|---|---|
| 1 | `/app/.github/workflows/ci.yml` | NEW | Matrix workflow (FE lint + build + jest ; BE pytest) |
| 2 | `/app/backend/pytest.ini` | NEW | Register `contract` + `smoke` markers, testpaths, asyncio mode |
| 3 | `/app/backend/tests/conftest.py` | NEW | Fixtures: `mongo_client`, `seeded_rid`, `admin_jwt`, `snapshot_dir`, `strip_dynamic_fields` |
| 4 | `/app/backend/tests/fixtures/seed_restaurant.py` | NEW | Idempotent seed of test restaurant(s) into ephemeral Mongo |
| 5 | `/app/backend/tests/fixtures/snapshots/*.json` | NEW (generated on first pytest run, then committed) | Frozen JSON contract per endpoint |
| 6 | `/app/backend/tests/contracts/test_public_config.py` | NEW | `GET /api/config/{rid}` snapshot |
| 7 | `/app/backend/tests/contracts/test_dietary.py` | NEW | `GET /api/dietary-tags/*` snapshot |
| 8 | `/app/backend/tests/contracts/test_utility.py` | NEW | `GET /api/`, `/api/healthz`, `/api/status`, `/api/loyalty-settings`, `/api/customer-lookup`, `/api/table-config`, `/api/config/feedback` snapshots + negative `/api/docs/*` |
| 9 | `/app/backend/tests/contracts/test_upload_serve.py` | NEW | `GET /api/upload/image/{filename}` Content-Type + size assertion |
| 10 | `/app/backend/tests/smoke/test_auth_flows.py` | NEW | send-otp, login, me, pos-auth-token, negative auth cases |
| 11 | `/app/backend/tests/smoke/test_config_and_upload.py` | NEW | Config PUT round-trip + upload byte-perfect round-trip |
| 12 | `/app/backend/requirements.txt` | MODIFIED | Add `pytest-asyncio`, `syrupy` (or `inline-snapshot`), `mongomock` optional |
| 13 | `/app/backend/tests/README.md` | NEW | How to run locally, regenerate snapshots, seed data |

**Total: 12 new files + 1 modified (requirements.txt only appended, never rewritten — addendum rule).**

## 7.1 Files that WILL NOT be touched (scope lock — Alpha v0.1 R4)

- `/app/backend/server.py` — **CRITICAL hotspot, untouched.**
- `/app/backend/.env`, `/app/frontend/.env`
- All frontend source files (`/app/frontend/src/**`)
- `/app/.emergent/*` (platform-managed — addendum §12 rule 9)
- All existing docs under `/app/memory/`
- `package.json` / `yarn.lock` — no new frontend deps

## 7.2 Downstream consumers (informational)

| Consumer | Effect |
|---|---|
| CR-2026-09-12-006 (backend split) | Uses these snapshots as its acceptance gate — **primary consumer** |
| CR-2026-09-12-003 (OTP echo removal) | Will intentionally update the `send-otp` smoke assertion (owner-approved change) |
| CR-2026-09-12-004 (CORS/rate-limit) | Adds middleware assertions; no snapshot change unless response headers become part of the snapshot |
| Master Outlet track | Will consume `resolveTenant`/`get_tenant()` snapshots later |
| Every future CR that touches a route | Must either (a) not change the snapshot, (b) regenerate + get review sign-off |

---

## 8. Owner decisions — FROZEN 2026-09-12

All 10 decisions plus 4 follow-up clarifications are now closed. Verbatim record kept in `OWNER_DECISIONS_2026-09-12.md`. Table below is the working reference.

| # | Decision | Owner answer | Consequence |
|---|---|---|---|
| D-05-1 | Snapshot bucket ⊕ smoke bucket scope | Accept §5.1/§5.2 as-is; owner asked for full endpoint list (delivered) | 13 contracts + 8 negative + 8 smokes = **29 checks total** |
| D-05-2 | Test restaurant IDs | **Real 478 + 716.** More restaurants added as needed later. | Snapshots read real Mongo docs; write-smokes touch UAT 478/716 with `try/finally` cleanup |
| D-05-3 | CI Mongo target | **UAT Mongo (`52.66.232.149:27017`) via current `MONGO_URL`.** Owner G0.9 already permits. | Phase 2 must add `MONGO_URL` to GitHub secrets |
| D-05-4 | Secret list (Phase 2 only) | `MONGO_URL` + `DB_NAME` + `JWT_SECRET` + `MYGENIE_API_URL` + `MYGENIE_POS_LOGIN_PHONE` + `MYGENIE_POS_LOGIN_PASSWORD` (**6 secrets**; no production Mongo URL) | Documented for Phase 2 CR |
| D-05-5 | Snapshot storage | **(a) commit JSON to git** under `backend/tests/fixtures/snapshots/` | Snapshot diffs visible in PR reviews |
| D-05-6 | CI triggers (Phase 2) | **All 3:** PR + push-to-main + weekly cron | Phase 2 only |
| D-05-7 | Failure policy (Phase 2) | **(a) hard fail** — snapshot mismatch blocks merge; regeneration requires explicit commit | Phase 2 only |
| D-05-8 | Snapshot library | `syrupy` accepted after Q3 audit re-validation (see §8.1) | Adds `syrupy` to `requirements.txt` |
| D-05-9 | POS-auth smoke | **(a)** 200 AND 502 both PASS | Avoids CI flakiness on preprod outages |
| D-05-10 | `/api/docs/*` handling | **(a)** snapshot the 8 endpoints at 200 today; CR-006 flip to 404 is a visible diff | 8 negative snapshots added |

### 8.1 Follow-up clarifications — FROZEN 2026-09-12

| # | Question | Owner answer | Consequence in this CR |
|---|---|---|---|
| **Q1** | "Config-in-code is undesirable" — was the earlier response a typo? | **(a) yes, typo — meant "no config in code"**. Hard-coded defaults in `server.py:1051–1155` are a smell; CR-2026-09-12-010 (Wave 3) will replace them with a DB record. | Informational — no in-scope change to CR-005 |
| **Q2** | Snapshot the defaults-in-code fallback path today? | **(a) yes** — snapshot `/api/config/9999` today so CR-010's removal is a visible snapshot delta | Added as the 13th contract endpoint in §5.1 above |
| **Q3** | Audit re-validation of D-05-8 (105-key config still used?) | **(a) audit accepted** — endpoint is live, 18 FE files consume it, no replacement exists (evidence: live grep + curl on 2026-09-12) | Proceeds with `syrupy` as planned |
| **Q4** | File Phase 2 intake now or later? | **(a) file it — but not in this gate.** Owner will invoke Role 1 (INTAKE) in a follow-up gate. | This Planning gate does NOT file the Phase 2 CR. It stays deferred until Owner assigns Role 1. |

### 8.2 2-phase split — FROZEN 2026-09-12

| Phase | Scope | Delivery |
|---|---|---|
| **Phase 1 (this CR — CR-2026-09-12-005)** | pytest suite + snapshot harness + snapshot JSONs + `pytest.ini` + `requirements.txt` addition + `backend/tests/README.md`. **NO `.github/workflows/*.yml`**. Tests run manually via `pytest backend/tests/` inside the pod. | This session (Implementation gate opens after owner "go" on IMPLEMENTATION_PLAN — not yet written) |
| **Phase 2 (separate CR — provisional slot, unfiled)** | `.github/workflows/ci.yml` + the 6 secrets checklist + PR/push/cron triggers + hard-fail policy. Activates automatically on first "Save to GitHub" push. | Filed via a future Role 1 (INTAKE) gate that owner will drive; **NOT filed in this Planning session** (Q4). |

**Value trade-off with Phase 1 alone:**
- ✅ Tests exist on disk; snapshots committed; manual `pytest` catches drift for anyone who remembers.
- ❌ Not gate-enforced on PRs; no cron; no PR merge block.
- ⚠️ CR-006 (Wave 2 backend split) uses `pytest` as its own definition-of-done, discipline-enforced not tooling-enforced.

### 8.3 All previously-tracked assumptions — now RESOLVED

| Assumption | Original state | Final state 2026-09-12 |
|---|---|---|
| 1. GitHub repo write access | Uncertain | **Not available now** → 2-phase split adopted (see §8.2) |
| 2. Preprod POS reachable from GH runners | Uncertain | **N/A for Phase 1** (deferred to Phase 2 CR) |
| 3. `syrupy` snapshots stored as human-readable JSON | Informational | **Confirmed** — this is `syrupy`'s default output |
| 4. CI runtime ≤ 8 min on default GH runner | Informational | **N/A for Phase 1** (deferred to Phase 2 CR) |

---

## 9. Verification matrix (to be executed at Implementation self-test + QA)

| ID | Test | Method | Expected |
|---|---|---|---|
| VS-1 | `pytest --collect-only` discovers all new test files | shell in `/app/backend` | ≥ 12 tests collected under `contract`/`smoke` markers |
| VS-2 | Every contract test PASSES on baseline (post-seed) | `pytest -m contract` | 0 failures |
| VS-3 | Every smoke test PASSES on baseline | `pytest -m smoke` | 0 failures |
| VS-4 | Snapshot delta detected when a field is manually renamed | change 1 key in server.py temporarily, rerun | pytest FAILS with clear diff; revert restores PASS |
| VS-5 | Dynamic fields (`updated_at`, `_id`, tokens) NOT in snapshot | grep snapshot JSONs | 0 hits |
| VS-6 | `.github/workflows/ci.yml` valid | `actionlint` (local) or GH's own validator | 0 errors |
| VS-7 | Frontend `yarn build` step uses `CI=false` | grep workflow | present |
| VS-8 | Backend Mongo service in CI is ephemeral | grep workflow | `services: mongo:6` block, no `MONGO_URL` pointing at preprod |
| VS-9 | No app source file in diff | `git diff --name-only main` at PR time | only paths in `.github/`, `backend/tests/**`, `backend/pytest.ini`, `backend/requirements.txt`, `backend/tests/README.md` |
| VS-10 | Preview-URL smoke unchanged | `curl /api/healthz` after CI CR merges | 200 (proves runtime untouched) |
| VS-11 | CI green on `main` after first merge | GH Actions badge / manual check | green |
| VS-12 | Snapshot regeneration is explicit | try `pytest --snapshot-update` without commit → CI still fails | expected |

---

## 10. Assumptions declared (superseded — see §8.3 for RESOLVED state)

Historical record only. All four assumptions were resolved on 2026-09-12 and their resolutions are captured in §8.3 above.

---

## 11. Compact Planning output (per Alpha v0.1 §8 Role 2) — UPDATED 2026-09-12

```text
Planning complete: CR-2026-09-12-005 (Phase 1 — local pytest + snapshot harness)
Stage: Impact Analysis — ✅ APPROVED BY OWNER 2026-09-12
Wave 1a IA Gate: ✅ CLOSED 2026-09-13 (wave-split decision recorded)
Owner approval literal: "approved document this and close gate 2 session"
Code reality: NONE (backend/tests/ empty; no CI workflow; deps partial — pytest+httpx+jsonschema present, syrupy missing)
Risk: MEDIUM (concurs with intake)
Files WILL change: 12 new + 1 modified (backend/requirements.txt — append only)
Files WILL NOT touch: backend/server.py, all frontend src, all .env, .emergent/*, hotspot files (per Alpha v0.1 Part C), .github/* (deferred to Phase 2)
Owner decisions: ALL FROZEN (D-05-1..10 + Q1..Q4 + Assumptions 1..4)
Wave assignment: WAVE 1a — unblocked, proceed to IMPLEMENTATION_PLAN
Downstream consumers: CR-006 (Wave 2 backend split) — primary; CR-003, CR-004, all future refactors gated by these snapshots
Docs updated: IMPACT_ANALYSIS.md (this file), OWNER_DECISIONS_2026-09-12.md, EXECUTION_PLAN.md v1.1, change_requests/README.md, PRD.md
GATE 2 CLOSED — Impact Analysis stage complete.
Next role/gate: Owner assigns Role 2 for IMPLEMENTATION_PLAN drafting; then owner "go" gates entry to Role 3 (Implementation).
NO CODE WRITTEN. NO IMPLEMENTATION_PLAN WRITTEN YET. Awaiting next owner-driven gate.
```

---

## 12. What comes next (only if owner accepts this Impact Analysis)

- **If accepted:** Planning writes `IMPLEMENTATION_PLAN.md` — edit-by-edit, ordered, with the exact snapshot bucket, seed data, CI YAML skeleton, and a self-test matrix. Then owner gates entry to Implementation (Role 3).
- **If rejected / scope reduced:** Planning revises this document; no code work begins.

**Nothing is coded during Planning.** Alpha v0.1 §8 Role 2 rule enforced.
