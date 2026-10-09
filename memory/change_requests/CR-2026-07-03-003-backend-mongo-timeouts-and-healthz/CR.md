# CR-2026-07-03-003 — Backend MongoDB Timeouts + Liveness Endpoint

**Status:** REGISTERED — Planning stage
**Raised:** 2026-07-03
**Author:** E1 (INVESTIGATION → PLANNING role handoff)
**Priority:** P1 (prod incident on 2026-07-02 21:30 IST directly caused by absence of these)
**Severity:** HIGH (each incident = user-visible 30 s hang + connection-pool cascade)
**Risk of change:** LOW (single file, additive, no schema change, easy rollback)
**Fast Lane:** eligible in principle (single-file, no HIGH-risk file touched), but
              given this is infra hardening for a real incident, run through
              full planning + owner approval anyway.

Related:
  - Incident PROD-INCIDENT-2026-07-02-001 (Atlas primary unreachable ≥30 s)
  - Artifacts e1.txt (Python stack trace), nginx premature-close log, e2.txt

---

## 1. Background

`backend/server.py` line 24:

```python
client = AsyncIOMotorClient(mongo_url)
```

No options passed. PyMongo/Motor defaults kick in:

| Option | Default | Meaning |
|---|---|---|
| `serverSelectionTimeoutMS` | **30000** (30 s) | how long to wait to find any node that satisfies the read/write preference |
| `connectTimeoutMS` | 20000 (20 s) | TCP connect deadline per node |
| `socketTimeoutMS` | **None (∞)** | how long a single query can wait for bytes back |
| `retryReads` | True (motor 3.x) | one automatic retry on transient errors |
| `retryWrites` | True | one automatic retry on transient errors |
| `maxPoolSize` | 100 | max sockets per host |
| `waitQueueTimeoutMS` | None (∞) | how long a request waits when pool is full |

The 30 s server-selection wait and the unlimited `socketTimeoutMS` /
`waitQueueTimeoutMS` are the reason the 2026-07-02 21:30 IST outage
appeared to users as "the whole app is frozen" for ~30 seconds per
request, plus a 5-10 minute pool-recovery tail.

Additionally, no `/api/healthz` endpoint exists. `curl /api/` returns a
static string, so LB / uptime monitoring can't distinguish "process
alive but DB dead" from "healthy".

## 2. Proposed change

Two edits to a single file (`backend/server.py`):

### 2.1 (A1) — cap Mongo client timeouts

Replace line 24:

```python
client = AsyncIOMotorClient(mongo_url)
```

with (illustrative — subject to review):

```python
client = AsyncIOMotorClient(
    mongo_url,
    serverSelectionTimeoutMS=5000,   # was 30000
    connectTimeoutMS=5000,           # was 20000
    socketTimeoutMS=10000,           # was ∞
    waitQueueTimeoutMS=5000,         # was ∞
    retryReads=True,                 # explicit — was default
    retryWrites=True,                # explicit — was default
    appname="customer-app-backend",  # shows up in Atlas op logs
)
```

**Values chosen to survive a 1-2 s Atlas election blip (via `retryReads`)
but fail fast on a real outage (>5 s).** These are conservative defaults
matching what MongoDB itself recommends for API-tier workloads.

### 2.2 (A2) — add `/api/healthz`

Insert a new route (illustrative placement: after existing `/api/` root
route at line 1346):

```python
@api_router.get("/healthz")
async def healthz():
    import asyncio
    try:
        # Bounded ping — never blocks longer than 2 s regardless of client config.
        await asyncio.wait_for(
            db.command("ping"),
            timeout=2.0,
        )
        return {"ok": True, "mongo": "up"}
    except asyncio.TimeoutError:
        return JSONResponse(
            status_code=503,
            content={"ok": False, "mongo": "timeout"},
        )
    except Exception as e:
        return JSONResponse(
            status_code=503,
            content={"ok": False, "mongo": "error", "detail": str(e)[:200]},
        )
```

- Returns `200` when Mongo pings back within 2 s.
- Returns `503` otherwise (timeout, no primary, auth error, network).
- Never blocks longer than 2 s regardless of the caller.
- Body is machine-parsable (`ok: true/false, mongo: <state>`).

## 3. Files WILL change / WILL NOT touch

**WILL change:**
- `backend/server.py` (only)

**WILL NOT touch:**
- Frontend — no client-side timeouts in this CR (deferred to CR-2026-07-03-004).
- Any config file, .env, requirements.txt.
- Any Mongo document schema, index, or migration.
- Auth, payment, order, or admin route bodies.
- Supervisor / deploy config.

## 4. Impact analysis

### 4.1 Steady-state (Mongo healthy)

| Metric | Before | After | Delta |
|---|---|---|---|
| Latency of `find_one` under normal load | ~5-20 ms | ~5-20 ms | none |
| Peak connection count | up to `maxPoolSize=100` | same | none |
| Memory / CPU | baseline | baseline | none |
| Existing endpoints response shape | unchanged | unchanged | none |
| `/api/healthz` cost | endpoint did not exist | 1 ping / call | new tiny cost |

**Steady state is a no-op.** These options only start mattering when Mongo misbehaves.

### 4.2 Under a transient blip (Atlas election, 1-2 s)

| Metric | Before | After |
|---|---|---|
| User request result | 30 s wait → sometimes 500, sometimes success after retry | 5 s wait max → likely success after `retryReads`, else 500 |
| Backend worker | blocked for 30 s | freed within 5 s |
| Pool exhaustion risk | HIGH (30 s pile-up) | LOW |

### 4.3 Under a real outage (Atlas primary gone ≥ 30 s, 2026-07-02 case)

| Metric | Before | After |
|---|---|---|
| Per-request wait | 30 s → 500 | 5 s → 500 (6× faster failure) |
| Post-recovery ripple | 5-10 min pool recovery | <1 min |
| LB behavior | keeps sending traffic to a dying pod | removes pod within 1-2 healthz cycles |
| User-visible symptom | frozen tab, page never renders | clear error surface / retry loop |
| nginx "premature-close" storm on downstream services | present | reduced (fewer stuck upstreams to close) |

### 4.4 Under `socketTimeoutMS` triggering (10 s cap)

- Some legitimately slow queries (aggregations, large report exports) will now be terminated at 10 s.
- **Audit result:** `backend/server.py` has 89 Mongo operations. `grep`-based scan of aggregation pipelines, `find` with heavy filters, and any explicit large `.to_list()`:
  - Longest known heavy operation: admin analytics endpoints (`/api/config/*`, `/api/customer-lookup/*`). These are typically < 500 ms on the current dataset (~40 restaurants, low K customers).
  - **Zero known query is expected to exceed 10 s at current data volumes.**
  - As data grows, individual queries approaching 10 s are themselves a bug (missing index) and should be re-designed, not tolerated.
- **Verification step:** post-deploy, monitor for `pymongo.errors.NetworkTimeout` in logs during the first 48 h. If any legit endpoint trips it, either add an index or use `.max_time_ms(15000)` per-operation override.

### 4.5 Risk of change itself

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| R1 | New tighter timeouts cause a **healthy** but momentarily loaded Mongo (e.g., large index build) to trip | LOW-MED | `retryReads=True` + `retryWrites=True` catch the vast majority. 48 h post-deploy monitor. |
| R2 | `waitQueueTimeoutMS=5000` causes bursts to 503 during traffic spikes | LOW | `maxPoolSize=100` is generous; app not seeing burst traffic today. If it becomes an issue, raise `waitQueueTimeoutMS` first before `maxPoolSize`. |
| R3 | `/api/healthz` gets DDoS'd | LOW | It's authless by design (LB needs it). If abused, put nginx rate-limit `1r/s` on the path. |
| R4 | `db.command("ping")` counts against Atlas op quotas | ZERO-effective | Pings are free (`ping` is not a metered op). |
| R5 | LB starts flapping pods when Mongo is briefly slow | LOW | Combined with `retryReads`, brief slowness rides through. LB config should require ≥3 consecutive failed healthz before marking unhealthy. |

## 5. Verification matrix

| Test | Before | After (expected) |
|---|---|---|
| `curl /api/` | 200 `{"message":"Customer App API"}` | unchanged |
| `curl /api/healthz` | 404 | 200 `{"ok":true,"mongo":"up"}` |
| `curl /api/healthz` with Mongo firewalled | (endpoint did not exist) | 503 `{"ok":false,"mongo":"timeout"}` within 2 s |
| `curl /api/config/698` normal | 200 | 200, same body |
| `curl /api/config/698` with Mongo firewalled | hangs 30 s → 500 | 5 s → 500 |
| Admin login normal | 200 | 200 |
| Admin login with Mongo firewalled | hangs 30 s → 500 | 5 s → 500 |
| Existing test-report iteration | pass | pass |
| Backend supervisor restart | clean | clean |

## 6. Owner decisions needed

1. **Approve the timeout values** — 5 s server-selection, 10 s socket, 5 s wait-queue. Any override (e.g., 8/15/8) is fine; I recommend 5/10/5 based on Atlas guidance for API-tier workloads.
2. **Confirm `/api/healthz` should be public** (unauthenticated). Recommended: yes, LB needs it and there is nothing sensitive in the response.
3. **Approve rate limit on `/api/healthz`?** Recommended: `1r/s` at nginx if the deploy has an nginx sidecar; skip if it's directly behind LB.
4. **Post-deploy monitoring plan.** Owner to designate someone to watch backend log for 48 h for unexpected `pymongo.errors.NetworkTimeout`.

## 7. Rollout & rollback

- **Rollout:** single commit, single-file diff, supervisor auto-restart. No migration, no config change.
- **Feature flag:** none needed — the change is intrinsically bounded (only manifests during Mongo trouble).
- **Rollback:** `git revert` of the commit; supervisor auto-restart. Estimated < 60 s from decision to rolled-back-and-live.

## 8. Effort estimate

- Implementation: 10-15 minutes.
- Self-test (curl the healthz, block Mongo with iptables, curl config, restore): 15 minutes.
- QA handover write-up: 5 minutes.
- Total: ~35 minutes.

## 9. Non-goals

Explicitly out of scope for THIS CR:
- Frontend fetch timeouts / AbortController (see CR-2026-07-03-004).
- Retry-with-jitter on read-hot endpoints (see A4 in original recommendation — deferred).
- Any change to `manage.mygenie.online` or MyGenie POS. That is not your codebase.
- Any Atlas configuration change. That is owned by MyGenie infra.
- Alerting / monitoring setup (ops function).

## 10. Registration

- ID: `CR-2026-07-03-003-backend-mongo-timeouts-and-healthz`
- Folder: `/app/memory/change_requests/CR-2026-07-03-003-backend-mongo-timeouts-and-healthz/`
- Companion doc: `IMPLEMENTATION_PLAN.md` (same folder).
- To be added on implementation: `QA_HANDOVER.md`.

---

## 11. Gate summary (Role 2 output)

```text
Planning complete: CR-2026-07-03-003
Stage: Impact Analysis + Implementation Plan
Code reality: PARTIAL (defaults in place, explicit values missing)
Risk: LOW
Files WILL change: backend/server.py (only)
Files WILL NOT touch: frontend/*, .env, requirements.txt, any consumer file
Owner decisions:
  1. Approve timeout values 5/10/5? (default: yes, per Atlas guidance)
  2. Approve /api/healthz to be public? (default: yes)
  3. Approve rate limit on /api/healthz? (default: 1r/s via nginx if applicable)
  4. Assign 48 h post-deploy monitor
Next: Owner approval → IMPLEMENTATION role
```
