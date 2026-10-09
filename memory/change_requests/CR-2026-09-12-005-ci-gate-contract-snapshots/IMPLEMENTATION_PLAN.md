# IMPLEMENTATION PLAN — CR-2026-09-12-005 Phase 1
# (pytest suite + API contract snapshots + smoke tests — local only)

**Role:** Planning (Role 2) · Stage: Implementation Plan · No code written in this document.
**Date:** 2026-09-13
**Prerequisite gate:** IA approved by owner 2026-09-12 · IA Gate closed 2026-09-13
**Risk:** MEDIUM
**Follows Alpha v0.1 §8 Role 2 output contract.**

---

## 0. Pre-implementation checks (Role 3 must verify these before touching any file)

| Check | Expected | How to verify |
|---|---|---|
| `backend/tests/` directory | Does NOT exist | `ls /app/backend/tests/` → "No such file" |
| `syrupy` in requirements.txt | Absent | `grep syrupy /app/backend/requirements.txt` → no match |
| `pytest-asyncio` in requirements.txt | Absent | `grep pytest.asyncio /app/backend/requirements.txt` → no match |
| `pytest.ini` | EXISTS with xdist content | `cat /app/backend/pytest.ini` → shows `-n 2 --dist loadscope` |
| `.github/workflows/` | Does NOT exist | `ls /app/.github` → "No such file" (Phase 2 only) |
| Live `GET /api/healthz` | 200 + `{"ok":true,"mongo":"up"}` | `curl localhost:8001/api/healthz` |

---

## 1. Files that WILL change (complete list)

| # | Path | Action | Note |
|---|---|---|---|
| 1 | `/app/backend/pytest.ini` | **UPDATE** (overwrite) | Preserve xdist; add markers + asyncio_mode |
| 2 | `/app/backend/requirements.txt` | **APPEND** only (never rewrite) | Add syrupy + pytest-asyncio — addendum rule |
| 3 | `/app/backend/tests/__init__.py` | **CREATE** (empty) | Package root |
| 4 | `/app/backend/tests/conftest.py` | **CREATE** | Shared fixtures |
| 5 | `/app/backend/tests/fixtures/__init__.py` | **CREATE** (empty) | Package |
| 6 | `/app/backend/tests/fixtures/seed_restaurant.py` | **CREATE** | Idempotent UAT seed |
| 7 | `/app/backend/tests/fixtures/snapshots/.gitkeep` | **CREATE** | Holds snapshot JSONs after first run |
| 8 | `/app/backend/tests/contracts/__init__.py` | **CREATE** (empty) | Package |
| 9 | `/app/backend/tests/contracts/test_public_config.py` | **CREATE** | 13 contract snapshots |
| 10 | `/app/backend/tests/contracts/test_dietary.py` | **CREATE** | Dietary contract snapshots |
| 11 | `/app/backend/tests/contracts/test_utility.py` | **CREATE** | Utility + negative snapshots |
| 12 | `/app/backend/tests/contracts/test_upload_serve.py` | **CREATE** | Upload-serve assertion |
| 13 | `/app/backend/tests/smoke/__init__.py` | **CREATE** (empty) | Package |
| 14 | `/app/backend/tests/smoke/test_auth_flows.py` | **CREATE** | 8 auth smoke flows |
| 15 | `/app/backend/tests/smoke/test_config_and_upload.py` | **CREATE** | Config PUT + upload round-trip |
| 16 | `/app/backend/tests/README.md` | **CREATE** | How to run + regenerate |

**Total: 2 modified (pytest.ini overwrite + requirements.txt append) + 14 new files = 16 changes.**

## 1.1 Files that WILL NOT be touched (scope lock)

- `/app/backend/server.py` — **CRITICAL hotspot, untouched** (Alpha v0.1 Part C)
- All `/app/frontend/src/**` — no frontend changes
- `/app/backend/.env`, `/app/frontend/.env` — unchanged
- `/app/.emergent/*` — platform-managed (addendum §12 rule 9)
- `/app/.github/**` — Phase 2 only (deferred to CR-2026-09-12-015)

---

## 2. Edit sequence (Role 3 executes in this exact order)

### Edit 1 — UPDATE `/app/backend/pytest.ini`

**Action:** Overwrite with the following content. Preserves `-n 2 --dist loadscope` and `required_plugins = pytest-xdist`. Adds `contract` + `smoke` markers, `asyncio_mode`, `testpaths`.

```ini
# CR-2026-09-12-005: updated to add contract/smoke markers and asyncio_mode.
# xdist config preserved from original.
[pytest]
required_plugins = pytest-xdist pytest-asyncio
addopts = -n 2 --dist loadscope
asyncio_mode = auto
testpaths = backend/tests
markers =
    contract: API contract snapshot tests (compare response shape to frozen JSON)
    smoke: Behavioural smoke tests (assert flows, no shape snapshot)
```

**Marker on edit:** `# CR-2026-09-12-005: updated to add contract/smoke markers and asyncio_mode.`

---

### Edit 2 — APPEND to `/app/backend/requirements.txt`

**Action:** Append exactly these two lines to the end of the file. Do NOT rewrite the file.

```
syrupy==6.0.0
pytest-asyncio==1.4.0
```

**Addendum rule:** use `echo -e "syrupy==6.0.0\npytest-asyncio==1.4.0" >> /app/backend/requirements.txt`

---

### Edit 3 — CREATE `/app/backend/tests/__init__.py`

Empty file. Marks `tests/` as a Python package.

---

### Edit 4 — CREATE `/app/backend/tests/conftest.py`

**Purpose:** Shared fixtures for all test files.

**Content spec (Role 3 writes the actual code):**

```python
# CR-2026-09-12-005: shared pytest fixtures for contract + smoke suites.

# Fixtures to provide:
#
# http_client(scope="session") — httpx.AsyncClient pointed at
#     BASE_URL = os.environ.get("TEST_BASE_URL", "http://localhost:8001")
#     (reads the running pod's backend; no ephemeral Mongo needed for Phase 1)
#
# admin_jwt(scope="session") — str
#     POST /api/auth/login with {"phone": ADMIN_PHONE, "password": ADMIN_PASS,
#     "restaurant_id": 478}. Returns the JWT token string.
#     ADMIN_PHONE / ADMIN_PASS read from env TEST_ADMIN_PHONE / TEST_ADMIN_PASS
#     (defaults to credentials in test_credentials.md — never hardcoded here).
#
# strip_dynamic(scope="session") — Callable[[dict], dict]
#     Removes keys: "updated_at", "created_at", "_id", "token", "crm_token",
#     "timestamp", "request_id" from any dict (recursive).
#     Used before snapshot comparison to avoid flaky timestamp drift.
#
# snapshot_dir(scope="session") — Path
#     Returns Path("/app/backend/tests/fixtures/snapshots/").
```

---

### Edit 5 — CREATE `/app/backend/tests/fixtures/__init__.py`

Empty file.

---

### Edit 6 — CREATE `/app/backend/tests/fixtures/seed_restaurant.py`

**Purpose:** Idempotent helper that verifies test restaurants 478 and 716 exist in UAT Mongo. Phase 1 does NOT mutate data — read-only seed verification only (we test the live UAT restaurants, not an ephemeral copy).

**Content spec:**

```python
# CR-2026-09-12-005: seed verification — confirms rids 478 and 716 exist in UAT Mongo.
# Phase 1 = read-only check. Phase 2 will add an ephemeral Mongo service container.
#
# async def verify_test_restaurants(db) -> None:
#     for rid in [478, 716]:
#         doc = await db.customer_app_config.find_one({"restaurant_id": rid})
#         if not doc:
#             raise RuntimeError(f"Seed check: restaurant_id {rid} not found in UAT Mongo.")
```

---

### Edit 7 — CREATE `/app/backend/tests/fixtures/snapshots/.gitkeep`

Empty file. Ensures the snapshots directory is committed before the first `pytest --snapshot-update` run.

---

### Edit 8 — CREATE `/app/backend/tests/contracts/__init__.py`

Empty file.

---

### Edit 9 — CREATE `/app/backend/tests/contracts/test_public_config.py`

**Marker:** `# CR-2026-09-12-005`
**Marks:** `@pytest.mark.contract`

**Content spec — 13 contract-snapshot endpoints:**

```
1.  GET /api/                          → strip_dynamic, snapshot
2.  GET /api/healthz                   → assert status 200, assert response["ok"] == True
3.  GET /api/config/478                → strip_dynamic (strip updated_at, created_at),
                                         snapshot; assert len(response.keys()) >= 50
4.  GET /api/config/716                → strip_dynamic, snapshot
5.  GET /api/config/9999               → strip_dynamic, snapshot (defaults-in-code fallback;
                                         asserts a non-empty dict returned, not 404)
6.  GET /api/loyalty-settings/478      → strip_dynamic, snapshot
7.  GET /api/customer-lookup/478
        ?phone=<TEST_PHONE>            → strip_dynamic (strip token fields), snapshot
8.  GET /api/config/feedback/478       → strip_dynamic, snapshot
9.  GET /api/status                    → strip_dynamic, snapshot shape (list)
```

---

### Edit 10 — CREATE `/app/backend/tests/contracts/test_dietary.py`

**Marker:** `@pytest.mark.contract`

```
10. GET /api/dietary-tags/available    → strip_dynamic, snapshot (list of tag strings)
11. GET /api/dietary-tags/478          → strip_dynamic, snapshot
```

---

### Edit 11 — CREATE `/app/backend/tests/contracts/test_utility.py`

**Marker:** `@pytest.mark.contract`

```
12. GET /api/table-config  (no header)  → assert status 401 or 422; snapshot error shape
13. GET /api/docs/bug-tracker          → assert status 200; snapshot shape (plain-text or JSON)
    (one representative /api/docs/* endpoint; CR-006 will flip to 404)
```

---

### Edit 12 — CREATE `/app/backend/tests/contracts/test_upload_serve.py`

**Marker:** `@pytest.mark.contract`

**Content spec:**
```
# GET /api/uploads/<known_seed_filename>
# — Seed: upload a known 1×1 PNG via POST /api/upload/image (admin_jwt fixture)
#   during conftest session setup, store filename.
# — Assert: Content-Type starts with "image/"
# — Assert: len(body) > 0
# — Cleanup: DELETE the seeded file in a try/finally block.
```

---

### Edit 13 — CREATE `/app/backend/tests/smoke/__init__.py`

Empty file.

---

### Edit 14 — CREATE `/app/backend/tests/smoke/test_auth_flows.py`

**Marker:** `@pytest.mark.smoke`

**Content spec — 8 smoke flows (asserted, NOT snapshot-compared):**

```
Smoke 1: POST /api/auth/send-otp {"phone": TEST_PHONE, "restaurant_id": 478}
         → status 200; assert "otp_for_testing" in response
         NOTE: this test WILL FAIL after CR-003 removes the echo — that is the design.

Smoke 2: POST /api/auth/login (admin) {"phone": ADMIN_PHONE, "password": ADMIN_PASS,
         "restaurant_id": 478}
         → status 200; jwt.decode(token) succeeds; decoded["user_type"] == "restaurant"

Smoke 3: GET /api/auth/me (Authorization: Bearer <admin_jwt>)
         → status 200; "restaurant_id" in response

Smoke 4: POST /api/pos/auth-token
         → status 200 (POS up) OR 502 (POS unreachable) — both PASS
         (D-05-9: avoids CI flakiness on preprod outages)

Smoke 5: PUT /api/config/ with admin_jwt + probe flag
         → status 200
         → GET /api/config/478 immediately after → probe flag reflected
         → PUT /api/config/ to restore original value (try/finally)

Smoke 6: GET /api/auth/me (no Authorization header)
         → status 401

Smoke 7: GET /api/auth/me (Authorization: Bearer invalid_token_xyz)
         → status 401

Smoke 8: POST /api/upload/image (admin_jwt, 1×1 PNG bytes)
         → status 200; "filename" in response
         → GET /api/uploads/<filename> → status 200; len(body) > 0
         → Cleanup: os.remove file from /app/backend/uploads/ (try/finally)
```

---

### Edit 15 — CREATE `/app/backend/tests/smoke/test_config_and_upload.py`

**Marker:** `@pytest.mark.smoke`

Note: Upload round-trip smoke is already in Edit 14 Smoke 8. This file handles any additional config-related smokes not covered above. If nothing additional, this can be a placeholder `pass` file with a comment explaining the smoke is in test_auth_flows.py (consolidate at Implementation discretion to avoid duplication).

---

### Edit 16 — CREATE `/app/backend/tests/README.md`

**Content spec:**

```markdown
# Backend Tests — CR-2026-09-12-005

## Run all tests
cd /app && pytest backend/tests/ -v

## Run only contract snapshots
cd /app && pytest -m contract backend/tests/

## Run only smoke flows
cd /app && pytest -m smoke backend/tests/

## Regenerate snapshots (after an intentional contract change)
cd /app && pytest -m contract --snapshot-update backend/tests/
# Then commit the updated backend/tests/fixtures/snapshots/*.json files.
# A PR that does NOT commit the updated snapshots will fail CI (Phase 2).

## Environment variables needed
- TEST_BASE_URL  (default: http://localhost:8001)
- TEST_ADMIN_PHONE  (see memory/test_credentials.md)
- TEST_ADMIN_PASS   (see memory/test_credentials.md)
- TEST_PHONE        (a registered customer phone for the check-customer smoke)

## Snapshot storage
Snapshots live in backend/tests/fixtures/snapshots/.
They are committed to git and reviewed like code in PRs.
```

---

## 3. Verification matrix (Role 3 self-test — all must PASS before QA handover)

| ID | Test | Command | Expected |
|---|---|---|---|
| VS-1 | pytest discovers all test files | `cd /app && pytest --collect-only backend/tests/` | ≥ 20 items collected across `contract` + `smoke` markers |
| VS-2 | Contract tests pass on baseline | `cd /app && pytest -m contract backend/tests/ -v` | 0 failures |
| VS-3 | Smoke tests pass on baseline | `cd /app && pytest -m smoke backend/tests/ -v` | 0 failures |
| VS-4 | Snapshot delta detected | Manually rename one key in a response fixture temporarily → rerun → FAIL with diff; revert → PASS |
| VS-5 | Dynamic fields absent from snapshots | `grep -r 'updated_at\|created_at\|"_id"\|"token"' backend/tests/fixtures/snapshots/` | 0 hits |
| VS-6 | No app source file changed | `git diff --name-only` | Only paths under `backend/tests/**`, `backend/pytest.ini`, `backend/requirements.txt` |
| VS-7 | Backend still starts clean | `sudo supervisorctl status backend` | RUNNING |
| VS-8 | `/api/healthz` still returns 200 | `curl localhost:8001/api/healthz` | `{"ok":true,"mongo":"up"}` |
| VS-9 | requirements.txt was only appended | `tail -5 /app/backend/requirements.txt` | Shows `syrupy==6.0.0` and `pytest-asyncio==1.4.0` at end |

---

## 4. Code markers

Every new file must begin with: `# CR-2026-09-12-005: <brief description>`
The updated `pytest.ini` must include a comment: `# CR-2026-09-12-005: updated to add contract/smoke markers and asyncio_mode.`

---

## 5. Rollback plan

- All changes are purely additive (new test files + 2 config appends).
- **Runtime impact:** NONE — no `server.py` change, no `.env` change.
- **Rollback:** `git revert <commit>` removes all new files. No DB migration, no data cleanup needed.
- For the requirements.txt append: remove the 2 appended lines manually if revert is partial.

---

## 6. Downstream impact (informational)

| Downstream CR | Impact of this plan |
|---|---|
| CR-2026-09-12-006 (backend split) | Uses these snapshots as acceptance gate — primary consumer |
| CR-2026-09-12-004 (CORS) | One-time snapshot regeneration expected after CR-004 lands (new security headers) |
| CR-2026-09-12-003 (OTP echo) | Smoke 1 (`otp_for_testing` assertion) will fail intentionally after CR-003 ships — that is the design signal |
| CR-2026-09-12-015 (GitHub Actions) | Phase 2 runs these same tests in CI — no change to test code needed |

---

## 7. Compact Planning output (Alpha v0.1 §8 Role 2)

```
Planning complete: CR-2026-09-12-005 Phase 1
Stage: Implementation Plan — WRITTEN 2026-09-13
Risk: MEDIUM
Files WILL change: 16 (2 modified + 14 new — all under backend/tests/ + pytest.ini + requirements.txt)
Files WILL NOT touch: server.py, all frontend src, all .env, .emergent/*, .github/*
Owner decisions: ALL frozen from IA (no new decisions needed)
Verification matrix: 9 checks (VS-1..VS-9)
Rollback: git revert — zero runtime impact
Docs: this file
Next gate: OWNER APPROVAL REQUIRED before Role 3 (Implementation) may start.
```

---

## OWNER APPROVAL GATE

```
OWNER APPROVAL REQUIRED
Reason: Implementation Plan complete. Role 3 (Implementation) may not start until owner approves.
Risk: MEDIUM
Proposed next step: Owner says "go" on CR-005 P1 → Role 3 implements in the exact edit order above.
I will not proceed until owner approves.
```
