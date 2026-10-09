# SESSION HANDOVER — Wave 1a CR-004 Ready to Implement

**Date:** 2026-09-13
**Outgoing session:** Completed CR-005 P1 + CR-007 F-07 implementation and QA closure
**Incoming agent task:** Implement CR-004 (CORS lockdown + rate-limit + middleware)
**Platform URL:** https://react-customer-app-2.preview.emergentagent.com

---

## 1. MANDATORY — Read these files FIRST (in order)

1. `/app/memory/control/MYGENIE_CUSTOMER_APP_AGENT_SYSTEM_PROMPT_ALPHA_v0_1.md` — gate rules, roles, do-not-dos
2. `/app/memory/change_requests/CR-2026-09-12-001-architecture-correction-programme/EXECUTION_PLAN.md` (v1.1) — wave sequence
3. `/app/memory/change_requests/CR-2026-09-12-001-architecture-correction-programme/OWNER_DECISIONS_2026-09-12.md` — all frozen decisions; do NOT re-ask
4. `/app/memory/change_requests/README.md` — full registry; every CR status
5. `/app/memory/PRD.md` — programme status
6. `/app/memory/test_credentials.md` — admin login for restaurant 478
7. **This file** — then proceed

---

## 2. Programme state (verified live 2026-09-13)

```
Wave 0 ────────── ✅ CLOSED (10/10 items + 4/4 notes, 2026-09-12)
Wave 1a:
  CR-005 P1 ────── ✅ CLOSED (22/22 tests PASS, QA verified 2026-09-13)
  CR-007 F-07 ──── ✅ CLOSED (8/8 QA checks PASS, 2026-09-13)
  CR-004 ─────────  📋 IP written — OWNER HAS APPROVED — Role 3 NEXT
Wave 1b → Wave 2:
  CR-015 ─────────  🔒 DEFERRED — needs git access + 6 GitHub secrets
  CR-017 ─────────  🔒 DEFERRED — needs CRM contract + DLT + SMS template
  CR-003 ─────────  🔒 DEFERRED — waits for CR-017
Waves 2–5, Phase B: sequenced, not started
```

---

## 3. Immediate task: implement CR-004

### Role to select
**IMPLEMENTATION (Role 3)** — plan exists, both prerequisites closed, owner approved.

### Session start block to output first
```
Project: MyGenie Customer App
Role selected: IMPLEMENTATION (Role 3)
Reason: CR-004 IA approved 2026-09-12, IP written 2026-09-13, CR-005 P1 + CR-007 F-07
        both CLOSED. Owner approved implementation.
Risk level: CRITICAL (server.py CRITICAL hotspot)
Docs read: Alpha v0.1, EXECUTION_PLAN v1.1, OWNER_DECISIONS_2026-09-12.md,
           CR-004 IMPLEMENTATION_PLAN.md, SESSION_HANDOVER_2026-09-13b.md
Blocked by unknowns: None
Next action: Pre-implementation checks → fix CORS_ORIGINS → execute 6 server.py
             surgical edits in exact plan order → regen snapshots → self-test
```

### Implementation plan location
`/app/memory/change_requests/CR-2026-09-12-004-cors-lockdown-rate-limit-middleware/IMPLEMENTATION_PLAN.md`

---

## 4. ⚠️ CRITICAL PRE-CHECK — fix CORS_ORIGINS BEFORE coding

**Current state (verified live):**
```
grep CORS_ORIGINS /app/backend/.env
→ CORS_ORIGINS="*"
```

**Why this matters:** Edit B of the implementation plan adds a fail-fast check — if `CORS_ORIGINS` contains `*` when credentials are enabled, the server refuses to start. If you implement Edit B before fixing this, the backend will crash on restart.

**Fix required BEFORE Edit B:**
Update `backend/.env` — change `CORS_ORIGINS="*"` to the actual frontend origin:
```
CORS_ORIGINS=https://react-customer-app-2.preview.emergentagent.com
```

This is an `.env` change only (addendum §12 rule: append/edit `.env` values; never rewrite the file). After the edit, restart backend and confirm `healthz` still returns `{"ok":true,"mongo":"up"}` before proceeding to server.py edits.

---

## 5. CR-004 implementation plan summary (6 surgical server.py edits)

Full detail in `/app/memory/change_requests/CR-2026-09-12-004-cors-lockdown-rate-limit-middleware/IMPLEMENTATION_PLAN.md`.

### Files that WILL change (5 total)
| # | File | Change |
|---|---|---|
| 1 | `backend/requirements.txt` | APPEND `slowapi==0.1.10` |
| 2 | `backend/.env` | Fix CORS_ORIGINS (see §4) + APPEND `CORS_ORIGIN_REGEX` + `RATE_LIMIT_AUTH` |
| 3 | `backend/.env.example` | Uncomment the 2 TODO lines F-07 left as comments |
| 4 | `backend/server.py` | 6 surgical edits A–F (see below) |
| 5 | `backend/tests/fixtures/snapshots/` | Regen after server.py changes are live |

### Files that WILL NOT be touched
- All `frontend/src/**` — zero frontend changes
- `frontend/.env` — unchanged
- `.emergent/*` — platform-managed

### server.py edits in exact order
| Edit | Location | What |
|---|---|---|
| A | After last import (line ~17) | Add slowapi + re imports |
| B | After POS creds fail-fast, before `app = FastAPI(...)` | CORS fail-fast check + limiter init |
| C | After `app = FastAPI(...)` line | Register limiter state + exception handler |
| D | 5 auth route decorators | `@limiter.limit(...)` + ensure `request: Request` param |
| E | Before `app.include_router(api_router)` | Security headers middleware + 500 handler |
| F | Replace existing CORSMiddleware block (~lines 1805–1812) | Hybrid static+regex CORS allow-list |

### Rate limits (D-004-3, frozen)
- `send-otp`: `@limiter.limit("10/minute")`
- `login`: `@limiter.limit("5/minute")`
- `verify-password`: `@limiter.limit("5/minute")`
- `reset-password`: `@limiter.limit("3/minute")`
- `pos/auth-token`: `@limiter.limit("5/minute")` (A-1)

### After server.py edits
1. `pip install slowapi==0.1.10`
2. `sudo supervisorctl restart backend && sleep 10`
3. Confirm `tail -5 /var/log/supervisor/backend.err.log` → `Application startup complete.` (no ValueError)
4. `curl -I localhost:8001/api/healthz` → check for `X-Content-Type-Options: nosniff` + `X-Request-ID` header
5. Rate-limit smoke: 6 rapid login attempts → 6th returns HTTP 429
6. Regen snapshots: `cd /app && pytest -m contract -n 0 --snapshot-update backend/tests/`
7. Full suite: `cd /app && pytest backend/tests/ -v` → 22 pass

---

## 6. Verification matrix for CR-004 (VS-1..VS-11)

| ID | Test | Expected |
|---|---|---|
| VS-1 | Backend starts without ValueError | `Application startup complete.` in logs |
| VS-2 | Security headers present | `X-Content-Type-Options: nosniff` + `X-Frame-Options: DENY` + `X-Request-ID` |
| VS-3 | HSTS header present | `Strict-Transport-Security: max-age=31536000` |
| VS-4 | Rate-limit triggers on 6th rapid auth call | 6th POST → HTTP 429 |
| VS-5 | CORS allows real frontend origin | `Access-Control-Allow-Origin` present for known origin |
| VS-6 | 500 handler returns request_id | `{"error":{...}, "request_id":"<uuid>"}` |
| VS-7 | Contract tests pass after snapshot regen | `pytest -m contract` → 0 failures |
| VS-8 | Smoke tests pass | `pytest -m smoke` → 0 failures |
| VS-9 | No frontend source file changed | `git diff --name-only` → no `frontend/src/**` |
| VS-10 | Snapshot delta is headers-only | `git diff backend/tests/fixtures/snapshots/` → only new header keys |
| VS-11 | requirements.txt append-only | `tail -3 requirements.txt` → `slowapi==0.1.10` at end |

---

## 7. Live code facts (code reality — verified 2026-09-13)

| Fact | Value |
|---|---|
| Backend | RUNNING, port 8001, supervisor-managed |
| MongoDB | UP, `{"ok":true,"mongo":"up"}` |
| Frontend | RUNNING, port 3000 |
| Admin login | `phone_or_email: "owner@18march.com"`, `password: "Qplazm@10"`, `restaurant_id: "478"` |
| OTP test phone | `"9579504871"` |
| server.py size | ~1830 lines, 46 route decorators, single-file monolith |
| CORS block | Lines ~1805–1812 — `allow_origins=os.environ.get('CORS_ORIGINS','*').split(',')` with `allow_credentials=True` |
| Auth routes | send-otp: line 437, login: line 502, verify-password: line 698, reset-password: line 743, pos/auth-token: line 829 |
| CR-005 tests | 22 tests, all PASS — run before and after CR-004 to confirm no regression |
| CORS_ORIGINS | Currently `"*"` — **must be fixed before Edit B** |
| slowapi | Not yet installed — APPEND to requirements.txt, then `pip install slowapi==0.1.10` |

---

## 8. Absolute DO NOTs (Alpha v0.1 addendum + programme rules)

- **DO NOT** rewrite `server.py` wholesale — only the 6 bounded surgical edits (Ground Rule R2)
- **DO NOT** modify `.emergent/emergent.yml`
- **DO NOT** change `REACT_APP_BACKEND_URL` in `frontend/.env`
- **DO NOT** change `MONGO_URL` or `DB_NAME` in `backend/.env`
- **DO NOT** touch `frontend/src/**` — zero frontend changes in this CR
- **DO NOT** start implementation before fixing `CORS_ORIGINS="*"` in `.env`
- **DO NOT** touch Wave 1b or Wave 2 CRs (CR-015, CR-017, CR-003) until Wave 1a closes
- **DO NOT** use `CI=true yarn build` — breaks frontend
- **DO NOT** run `npm` — yarn only

---

## 9. After CR-004 is QA-closed → Wave 1a CLOSES

```
Wave 1a CLOSED
     ↓
Wave 2 opens (when owner-side blockers clear)
  CR-017 (CRM SMS) — owner supplies DLT/CRM contract/template
  CR-003 (OTP echo removal) — after CR-017 closed
  CR-015 (GitHub Actions CI) — after git access + 6 secrets
     ↓
Wave 2 CLOSED → Wave 3 opens (backend split + FE foundations)
```

---

## 10. Key artefact paths

| Artefact | Path |
|---|---|
| Gate rules | `/app/memory/control/MYGENIE_CUSTOMER_APP_AGENT_SYSTEM_PROMPT_ALPHA_v0_1.md` |
| Wave sequence | `/app/memory/change_requests/CR-2026-09-12-001-.../EXECUTION_PLAN.md` |
| All decisions | `/app/memory/change_requests/CR-2026-09-12-001-.../OWNER_DECISIONS_2026-09-12.md` |
| CR registry | `/app/memory/change_requests/README.md` |
| CR-004 IP | `/app/memory/change_requests/CR-2026-09-12-004-.../IMPLEMENTATION_PLAN.md` |
| CR-004 IA | `/app/memory/change_requests/CR-2026-09-12-004-.../IMPACT_ANALYSIS.md` |
| Test credentials | `/app/memory/test_credentials.md` |
| CR-005 tests | `/app/backend/tests/` (22 tests, run with `cd /app && pytest backend/tests/ -v`) |

---

## 11. Compact status block

```
Project: MyGenie Customer App
Wave 1a: 2/3 CRs CLOSED · 1 remaining (CR-004)
CR-005 P1: ✅ CLOSED — 22/22 tests PASS
CR-007 F-07: ✅ CLOSED — .env.example + rotation checklist + orphan key deleted
CR-004: 📋 IP written — owner approved — Role 3 NEXT
CRITICAL pre-check: fix CORS_ORIGINS="*" → explicit origin BEFORE Edit B
Next action: Role 3 implements CR-004 in exact 6-edit order from IMPLEMENTATION_PLAN.md
```
