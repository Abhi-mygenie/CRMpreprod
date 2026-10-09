# Implementation Plan — CR-2026-07-03-003

**Companion doc:** `CR.md` (same folder).
**Role:** PLANNING (no code will be written yet — awaiting owner approval).

---

## 1. Precise edit diff (illustrative — actual patch applied only after owner approval)

**File:** `backend/server.py`

### Change 1 — line 24, AsyncIOMotorClient options

```diff
-mongo_url = os.environ['MONGO_URL']
-client = AsyncIOMotorClient(mongo_url)
+mongo_url = os.environ['MONGO_URL']
+# CR-2026-07-03-003 — explicit timeouts. Defaults were:
+#   serverSelectionTimeoutMS=30000 (30 s) — caused the 21:30 IST freeze.
+#   socketTimeoutMS=None (∞) — allowed stuck sockets to accumulate.
+#   waitQueueTimeoutMS=None (∞) — allowed unbounded pool-wait queues.
+# retry* are already default-True on motor 3.x; set explicitly for clarity.
+client = AsyncIOMotorClient(
+    mongo_url,
+    serverSelectionTimeoutMS=5000,
+    connectTimeoutMS=5000,
+    socketTimeoutMS=10000,
+    waitQueueTimeoutMS=5000,
+    retryReads=True,
+    retryWrites=True,
+    appname="customer-app-backend",
+)
```

### Change 2 — insert `/api/healthz` (place right after existing `/api/` root route)

```diff
 @api_router.get("/")
 async def root():
     return {"message": "Customer App API"}

+@api_router.get("/healthz")
+async def healthz():
+    """
+    Liveness + Mongo reachability probe.
+    CR-2026-07-03-003 — used by LB / uptime monitoring to detect DB outages
+    (like the 2026-07-02 21:30 IST incident) and stop shipping traffic to
+    unhealthy pods before the connection pool tips over.
+    """
+    import asyncio
+    try:
+        await asyncio.wait_for(db.command("ping"), timeout=2.0)
+        return {"ok": True, "mongo": "up"}
+    except asyncio.TimeoutError:
+        return JSONResponse(
+            status_code=503,
+            content={"ok": False, "mongo": "timeout"},
+        )
+    except Exception as e:
+        return JSONResponse(
+            status_code=503,
+            content={"ok": False, "mongo": "error", "detail": str(e)[:200]},
+        )
+
 @api_router.post("/status", response_model=StatusCheck)
 async def create_status_check(...):
```

### Change 3 — none

No other changes. No new imports required (`asyncio` and `JSONResponse` already imported at top of file; if `JSONResponse` is not, add `from fastapi.responses import JSONResponse` — verify at implementation time).

Net diff: **+18 / −1 LOC** in one file.

---

## 2. Pre-flight checks

Before writing the patch, the IMPLEMENTATION role must confirm:

1. `JSONResponse` is imported at top of `server.py`. If not, add.
2. `db` object is in module scope (it is — line 24 area). If it's inside a factory, access it correctly.
3. No existing `@api_router.get("/healthz")` (I already checked — none).
4. `db.command("ping")` is the correct Motor async idiom (it is — Motor mirrors PyMongo's `command`).

## 3. Self-test script (Playwright / curl — for the IMPLEMENTATION role to run)

```bash
# T1 — healthy path
curl -s -w "\n%{http_code}\n" http://localhost:8001/api/healthz
# expect: {"ok":true,"mongo":"up"}
#         200

# T2 — no regression on existing endpoint
curl -s http://localhost:8001/api/
# expect: {"message":"Customer App API"}

curl -s http://localhost:8001/api/config/698 | python3 -c "import json,sys; d=json.load(sys.stdin); print('OK' if d.get('restaurant_id') else 'BROKEN')"
# expect: OK

# T3 — degraded path (simulate Mongo unreachable)
# Temporarily point MONGO_URL to an invalid host in a shell-local env
MONGO_URL="mongodb://192.0.2.1:27017/mygenie_db" python3 -c "
import asyncio, os
from motor.motor_asyncio import AsyncIOMotorClient
async def go():
    c = AsyncIOMotorClient(os.environ['MONGO_URL'], serverSelectionTimeoutMS=5000, socketTimeoutMS=10000)
    db = c['mygenie_db']
    import time; t = time.time()
    try:
        await asyncio.wait_for(db.command('ping'), timeout=2.0)
        print('unexpected success')
    except asyncio.TimeoutError:
        print(f'timeout OK, elapsed={time.time()-t:.1f}s')
    except Exception as e:
        print(f'error OK, elapsed={time.time()-t:.1f}s, {type(e).__name__}')
asyncio.run(go())
"
# expect: 'timeout OK, elapsed=~2.0s'  (never longer than 2 s)

# T4 — /api/config with the tightened Mongo timeout returns fast under outage
# (run after T3 shows healthz works; simulate by patching MONGO_URL in .env
#  and restarting supervisor, verify latency < 6 s not < 30 s)
```

## 4. Acceptance criteria (from CR §5)

| # | Criterion | How to prove |
|---|---|---|
| 1 | `GET /api/healthz` returns 200 within 100 ms under normal Mongo | curl + `time` |
| 2 | `GET /api/healthz` returns 503 within 2500 ms when Mongo unreachable | iptables block + curl + `time` |
| 3 | `GET /api/config/698` returns 500 within 6000 ms when Mongo unreachable (was 30 s) | same setup + curl + `time` |
| 4 | No regression on 5 hot endpoints (config, auth login, upload check, dietary-tags, customer-lookup) | curl each, compare status codes |
| 5 | ESLint / lint | no code lint applies to a .py-only change |
| 6 | Supervisor restarts cleanly with no traceback in `/var/log/supervisor/backend.err.log` | `sudo supervisorctl status && tail /var/log/supervisor/backend.err.log` |

## 5. Rollback plan

- `git revert <sha>` on the single commit.
- `sudo supervisorctl restart backend`.
- Verify `GET /api/` returns 200. Estimated < 60 s.

## 6. Post-deploy monitor plan (48 h)

Owner-assigned watcher checks daily:

```bash
grep -c "pymongo.errors.NetworkTimeout\|ServerSelectionTimeoutError" \
    /var/log/supervisor/backend.err.log /var/log/supervisor/backend.out.log
```

If count > 0:
- Confirm the endpoint that tripped.
- If it's a legitimately slow admin/reporting endpoint, add a per-op `.max_time_ms(15000)` override rather than raising the global socketTimeoutMS.
- If it correlates with a real Atlas hiccup, that's expected and the timeout is doing its job.

## 7. Exit gate (§8 Role 3) — items to be completed at IMPLEMENTATION

| Item | Status now (planning) |
|---|---|
| 1. Registry updated | ✅ CR.md exists |
| 2. Code markers added | ⏳ IMPL — add `CR-2026-07-03-003` in code comments |
| 3. Self-test complete | ⏳ IMPL |
| 4. Lint / compile clean | ⏳ IMPL |
| 5. QA handover written | ⏳ IMPL — create `QA_HANDOVER.md` |
| 6. Owner sign-off obtained | ⏳ waiting on owner (this doc) |

## 8. Non-goals (repeated for clarity)

- No frontend change in this CR. Frontend fetch timeouts are CR-2026-07-03-004.
- No retry-with-jitter helper. If wanted, separate small CR later.
- No new logging / metrics scaffolding. Owner may add later.
- No load-test. Not warranted for this size of change.
