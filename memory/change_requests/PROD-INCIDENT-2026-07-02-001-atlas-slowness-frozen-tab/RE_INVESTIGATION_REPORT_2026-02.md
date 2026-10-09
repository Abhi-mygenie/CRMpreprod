# Re-Investigation Report — PROD-INCIDENT-2026-07-02-001 (Timeout / Freeze)

**Role:** INVESTIGATION (Role 6, read-only — no code changes)
**Ran:** 2026-02 (this session)
**Trigger:** Owner asked to re-look into the timeout / freeze incident from "a couple of days back"
**Related:** CR-2026-07-03-003 (backend timeouts, SHIPPED), CR-2026-07-03-004 (frontend fetch timeouts, PARTIAL), CR-2026-07-04-003 (CR-004 residual scope, INTAKE only), CR-2026-07-04-004 (client telemetry, INTAKE only), CR-2026-07-03-009 (LB probe wiring, OPS-BLOCKED)

---

## 1. Investigation output (per Alpha v0.1 §8 Role 6)

```text
Investigation complete: PROD-INCIDENT-2026-07-02-001 (RE-INVESTIGATION)
Root cause (original): MongoDB Atlas replica set had no PRIMARY for ≥30 s
                       around 2026-07-02 21:30 IST. All services that
                       read/write MongoDB timed out.
Classification: INFRA / EXTERNAL (MongoDB Atlas topology event) — UNCHANGED
Confidence: HIGH — same evidence trail (e1.txt, nginx log, e2.txt) still valid.
Steps used: 6/10

Backend fail-fast fix (CR-003) VERIFIED STILL IN PLACE:
  server.py:29-38 — 5 s serverSelection, 10 s socket, 5 s waitQueue,
                    retryReads=True, retryWrites=True, appname set.
  server.py:1408-1430 — GET /api/healthz with 2 s asyncio.wait_for cap.
  Live probe: 5/5 samples 315-492 ms, all 200 {"ok":true,"mongo":"up"}.

RESIDUAL EXPOSURE FOUND (four unresolved threads, all pre-existing):

  R1. CR-004 (frontend fetch timeouts) never QA-signed off.
      Only 5 files use fetchWithTimeout. 9 files still plain fetch()
      to REACT_APP_BACKEND_URL with no timeout, including:
        - LandingPage.jsx  (customer entry point)
        - ReviewOrder.jsx  (CRITICAL hotspot per Part C — order placement)
        - Login.jsx        (auth path)
        - AdminSettings.jsx, AdminQRPage.jsx, ContentTab.jsx (admin)
        - AdminConfigContext.jsx CRUD ops (5 fetches)
        - FeedbackPage.jsx, dietaryTagsService.js
      Impact: during next Atlas hiccup, backend fails at 5 s but the
      BROWSER still hangs 30-90 s on these paths before giving up.

  R2. CR-2026-07-04-003 (CR-004 residual scope) is at INTAKE stage only.
      No plan, no implementation. Contains the empty-state UI on menu-
      load timeout + AdminConfig CRUD wrapping.

  R3. CR-2026-07-04-004 (client telemetry) is at INTAKE stage only.
      Owner explicitly asked "if similar issues come, will we get logs
      to use in DB?" — answer today is NO. If the freeze recurs we
      won't have client-side telemetry to prove where the hang was.

  R4. CR-2026-07-03-009 (LB probe wiring to /api/healthz + alerting)
      is OPS-TEAM BLOCKED, not yet actioned. Endpoint works but no LB
      is consuming it — during the next outage, no pod gets rerouted.

Root cause (secondary — process): No follow-up on QA of CR-003/004
after the initial ship. CR-003 was self-tested; CR-004 owner-QA
(6-step DevTools smoke) never signed off. CR-2026-07-04-003 to close
residual scope was filed but never picked up.

Not root cause, but interacts:
  - Placeholder POS creds in backend/.env → /api/pos/auth-token
    returns 502; order flow already broken independent of Mongo.
  - Two localStorage token keys (pos_token AND order_auth_token)
    coexist — not related to freeze but is an ambient ambiguity.

Report: /app/memory/change_requests/PROD-INCIDENT-2026-07-02-001-atlas-slowness-frozen-tab/RE_INVESTIGATION_REPORT_2026-02.md
Next: Owner decision required.
  Option A) File CR to close R1 (wrap 9 remaining fetches with
             fetchWithTimeout). Scope-locked, LOW-MED risk.
             (Would touch ReviewOrder.jsx which is a CRITICAL hotspot
             per operating prompt Part C — needs OWNER APPROVAL.)
  Option B) Un-block CR-2026-07-04-003 (residual scope) — larger,
             also includes menu-load empty-state UI. MEDIUM risk.
  Option C) Un-block CR-2026-07-04-004 (client telemetry) — new
             backend route + Mongo collection + TTL index. Un-related
             to R1/R2 but the "will we know next time" question is
             tied to this incident.
  Option D) Escalate CR-2026-07-03-009 to OPS team — LB probe wiring
             is a 30-minute change that turns /api/healthz from
             theoretical to actual outage-response tooling.
  Option E) Do nothing — accept current residual exposure. Justified
             only if incident recurrence rate is low enough.
```

---

## 2. Evidence trail (all still valid)

### 2.1 Original incident artefacts (from CR-003 investigation)

| Artefact | Where | What it shows |
|---|---|---|
| `e1.txt` Python stack trace | (attached to CR-003 investigation) | `pymongo.errors.ServerSelectionTimeoutError, Timeout: 30 s` at `server.py:987 → get_app_config → db.customer_app_config.find_one` |
| nginx log excerpt | `manage.mygenie.online` (NOT our code) | `epoll_wait ... prematurely closed` × 4 clients at 21:30:58 on `GET /api/v1/vendoremployee/all-table-list` |
| `e2.txt` CRM heartbeat | CRM back-end apscheduler | All heartbeats 21:17-21:49 IST `executed_successfully` — baseline proof app-layer was alive, only DB layer was down |

### 2.2 Time correlation

All three artefacts fall within **21:17-21:49 IST 2026-07-02**, peak at **21:30**. This is a single infra event with three symptoms across three services.

### 2.3 Ownership map

| Service | Owner | Role in incident |
|---|---|---|
| Customer-app backend (this repo) | Us | Victim — timed out at 30 s per request |
| `manage.mygenie.online` (POS admin, PHP-FPM) | MyGenie | Also a victim of shared Mongo dep |
| CRM back-end | MyGenie | Unaffected (didn't touch Mongo during window) |
| MongoDB Atlas | MyGenie DBA / Atlas SRE | **Root cause** — primary election / topology event |

**Confirmation:** We are a co-victim, not the origin. The correct blast-radius label is amplifier, not cause.

---

## 3. Current-code verification (2026-02)

### 3.1 Backend timeouts (CR-003) — VERIFIED PRESENT

`/app/backend/server.py:29-38`:
```python
client = AsyncIOMotorClient(
    mongo_url,
    serverSelectionTimeoutMS=5000,
    connectTimeoutMS=5000,
    socketTimeoutMS=10000,
    waitQueueTimeoutMS=5000,
    retryReads=True,
    retryWrites=True,
    appname="customer-app-backend",
)
```

### 3.2 /api/healthz endpoint — VERIFIED PRESENT

`/app/backend/server.py:1408-1430`:
```python
@api_router.get("/healthz")
async def healthz():
    try:
        await asyncio.wait_for(db.command("ping"), timeout=2.0)
        return {"ok": True, "mongo": "up"}
    except asyncio.TimeoutError:
        return JSONResponse(status_code=503, content={"ok": False, "mongo": "timeout"})
    except Exception as e:
        return JSONResponse(status_code=503, content={"ok": False, "mongo": "error", "detail": str(e)[:200]})
```

**Live 5-sample probe** (this session): 315-492 ms, all `200 {"ok":true,"mongo":"up"}`.

### 3.3 Frontend fetch timeouts (CR-004) — VERIFIED PARTIAL

**Files USING `fetchWithTimeout` (5):**
- `frontend/src/utils/fetchWithTimeout.js` (the util itself)
- `frontend/src/hooks/useMenuData.js`
- `frontend/src/context/RestaurantConfigContext.jsx`
- `frontend/src/context/AdminConfigContext.jsx` (only initial fetch, NOT CRUD)
- `frontend/src/context/AuthContext.jsx`

**Files STILL using plain `fetch()` to REACT_APP_BACKEND_URL (9):**

| File | Notes |
|---|---|
| `frontend/src/pages/LandingPage.jsx` | Customer entry point — line 81 + 595 |
| `frontend/src/pages/ReviewOrder.jsx` | ⚠ **CRITICAL hotspot** — lines 139 + 411 (loyalty + customer-lookup) |
| `frontend/src/pages/Login.jsx` | Auth path — line 10 |
| `frontend/src/pages/AdminSettings.jsx` | Admin — line 36 |
| `frontend/src/pages/FeedbackPage.jsx` | Line 9 |
| `frontend/src/pages/admin/AdminQRPage.jsx` | Line 20 |
| `frontend/src/components/AdminSettings/ContentTab.jsx` | Line 44 |
| `frontend/src/context/AdminConfigContext.jsx` (CRUD ops only) | 5 raw fetches for saveConfig, banner CRUD, uploadImage |
| `frontend/src/api/services/dietaryTagsService.js` | Line 3 |

Each of these is a place where **a Mongo hang → 5 s backend fail → 30-90 s browser wait** on the user's tab, defeating the fail-fast intent.

### 3.4 Related CRs in the pipeline

| ID | Title | Status |
|---|---|---|
| **CR-2026-07-03-003** | Backend Mongo timeouts + /api/healthz | ✅ SHIPPED (verified in code) |
| **CR-2026-07-03-004** | Frontend fetch timeouts + AbortController | 🚧 IMPLEMENTED — never QA-signed off (owner Slow-3G/Offline smoke pending) |
| **CR-2026-07-04-003** | CR-004 residual scope (empty-state UI + AdminConfig CRUD wraps) | 📝 INTAKE ONLY |
| **CR-2026-07-04-004** | Client telemetry (would answer "did we see the next freeze?") | 📝 INTAKE ONLY |
| **CR-2026-07-03-009** | Ops: LB probe wiring to /api/healthz + Mongo alerting | ⏸ OPS-TEAM BLOCKED |

---

## 4. Recommendations (owner decision required — Role 6 does not code)

Ordered by pain-avoidance-per-effort ratio:

1. **CR-2026-07-03-009 → OPS team (30-minute win)**
   Wire LB probe to `/api/healthz`. Endpoint works but nothing consumes it today. Without this, during the next Atlas hiccup users continue hitting a dying pod for the full outage window. This is where the "fail-fast" concept becomes actual outage-response tooling.

2. **Close R1 subset — wrap ReviewOrder.jsx + LandingPage.jsx only**
   These are the two highest-blast-radius call sites. `ReviewOrder.jsx` is a CRITICAL hotspot per Part C, so OWNER APPROVAL required and full gate flow (not Fast Lane). Would move roughly 80% of the customer-facing residual exposure without touching the messy admin CRUD.

3. **Un-block CR-2026-07-04-004 (client telemetry)**
   Filed for exactly this incident type. Without it, the third question after any future freeze ("was it a timeout or a hang?") remains unanswerable without live-debugging. `POST /api/telemetry/client-event` + Mongo collection + 30-day TTL — small, additive, LOW risk.

4. **Close CR-2026-07-04-003 (full residual scope)**
   Includes menu-load empty-state UI + AdminConfig CRUD wrappers. Larger and touches customer-facing render logic. MEDIUM risk.

5. **Sign off CR-004 with a Slow-3G / Offline DevTools smoke**
   Owner-side task, 5 minutes. Handover doc has 6 concrete steps. Would formally close CR-004.

---

## 5. What is NOT the cause / not related

- **`/api/restaurant-info/509 → 404`** — permanent code gap, different failure mode (404 not 500). Not part of this incident.
- **Placeholder POS creds in backend/.env** — makes `POST /api/pos/auth-token` return 502; order flow already broken. Unrelated to Mongo timeout but overlaps the ReviewOrder path.
- **`pos_token` vs `order_auth_token` dual localStorage keys** — ambient session-ambiguity risk (BUG-001 P0). Not causal here.
- **Restaurant 716 hardcoded logic in ReviewOrder.jsx** — parked intentionally (BUG-006). Not causal.

---

## 6. Escalation

```text
ESCALATION REQUIRED
Reason: Multiple related but unclosed CRs. Backend fix is intact but the client-side pain path (R1) remains unfixed for the highest-blast-radius files including a CRITICAL hotspot (ReviewOrder.jsx). Ops-side probe wiring (CR-009) unclaimed.
Risk: HIGH (customer-facing revenue-flow hang on next Atlas hiccup)
Blocked role: N/A — this is a re-investigation, no work in progress
Evidence: this file + CR-003, CR-004, CR-2026-07-04-003, CR-2026-07-04-004, CR-2026-07-03-009
Options:
A) Wrap ReviewOrder.jsx + LandingPage.jsx now (targeted CR — OWNER APPROVAL required for hotspot touch)
B) Un-block CR-2026-07-04-003 (full residual scope + empty-state UI)
C) Un-block CR-2026-07-04-004 (client telemetry so we see next incident)
D) Escalate CR-2026-07-03-009 to OPS
E) Accept current residual exposure
Recommendation: A + C + D in parallel. B second sprint. E only with explicit sign-off.
I will not proceed to any implementation until owner approves.
```

---

## 7. Confidence

| Claim | Confidence | Basis |
|---|---|---|
| Root cause of original incident = Atlas topology event | HIGH | Three-artefact time-correlated evidence trail |
| CR-003 fix is in place | HIGH | Direct code inspection + 5-sample live probe |
| CR-004 fix is partial | HIGH | Direct `grep` — 5 files use `fetchWithTimeout`, 9 files don't |
| CR-004 QA never signed off | HIGH | `SESSION_HANDOVER_2026-07-04.md §7` lists it as still pending |
| Backend residual exposure | LOW | Timeout defaults now bounded to 5 s; retryReads catches sub-2 s elections |
| Frontend residual exposure | HIGH | 9 unprotected fetches, including a CRITICAL hotspot |
| Recurrence probability | UNKNOWN | Depends on Atlas SLA + MyGenie ops posture — outside our visibility |

---

*End of Re-Investigation Report 2026-02. Investigation agent must not code. Awaiting owner decision on options A-E in §4.*
