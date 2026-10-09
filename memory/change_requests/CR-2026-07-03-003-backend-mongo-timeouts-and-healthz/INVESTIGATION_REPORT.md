# Investigation Report — CR-2026-07-03-003 (companion)

**Related CR:** CR-2026-07-03-003-backend-mongo-timeouts-and-healthz
**Type:** INV inline with CR (prod incident triage)
**Ran:** 2026-07-03
**Trigger:** Owner shared 3 artefacts (e1.txt Python stack trace, nginx log, e2.txt CRM heartbeat) — "what does this error mean, is it same time as earlier"

## Investigation output (per operating prompt §8 Role 6)

```text
Investigation complete: PROD-INCIDENT-2026-07-02-001
Root cause: Production MongoDB replica set had no PRIMARY for ≥30 s
            around 2026-07-02 21:30 IST. All services that read/write
            MongoDB timed out.
Classification: INFRA / EXTERNAL (MongoDB Atlas topology event)
Confidence: HIGH
Steps used: 4/10

Three log fragments = same incident, three symptoms:

  ┌ e1.txt   customer-app FastAPI (app-mygenie / customer-app5th-march)
  │   server.py:987 → get_app_config → db.customer_app_config.find_one
  │   pymongo.errors.ServerSelectionTimeoutError, Timeout: 30s
  │   Meaning: every request hit the 30s default and 500'd.
  │
  ├ nginx log   manage.mygenie.online (MyGenie POS admin, PHP-FPM)
  │   Multiple clients: 172.31.11.179 (private VPC IP, internal caller)
  │   4× concurrent "epoll_wait ... prematurely closed" at 21:30:58
  │   GET /api/v1/vendoremployee/all-table-list
  │   Meaning: PHP upstream hung on same Mongo → clients gave up
  │            → nginx logged premature-close on client side.
  │
  └ e2.txt   CRM backend (crm-back), apscheduler CR-024
      All heartbeats around 21:17-21:49 IST executed_successfully.
      Meaning: baseline — app-layer alive, only DB layer down.

Time correlation: all three within 21:17-21:49 IST 2026-07-02, cluster
peaking at 21:30 IST.

Relation to earlier /api/restaurant-info/509 → 404 investigation:
    UNRELATED. That 404 is a permanent code gap (endpoint never
    implemented). Atlas outage would surface as HTTP 500 +
    ServerSelectionTimeoutError, not 404. Different failure mode.

Ownership of nginx log:
    manage.mygenie.online is NOT our repo — it's the MyGenie POS
    admin (PHP-FPM). We are a VICTIM of the shared-Mongo dependency,
    not the origin of that specific request. Client IP 172.31.11.179 is
    inside MyGenie's VPC.

What we could fix on OUR side to avoid the 30-second freeze next time:
  A1. Explicit Mongo client timeouts (5s server-selection, 10s socket,
      5s waitQueue, retryReads).
      Impact: 6× faster fail (30s → 5s), connection pool recycles.
  A2. GET /api/healthz endpoint with 2s cap on db.command("ping").
      Impact: LB can reroute traffic during outage.
  A3. Frontend fetch timeouts + AbortController (deferred — CR-004).
      Impact: covers non-Mongo backend hangs (POS, storage, CRM).

Report: (this file)
Next: A1 + A2 → CR-2026-07-03-003 (SHIPPED).
      A3 → CR-2026-07-03-004 (PLANNED, waiting on INV-2026-07-03-001 audit).
```

## Files inspected

- Two attached log artefacts (e1.txt, e2.txt) + inline nginx snippet
- `/app/backend/server.py:24` (default AsyncIOMotorClient options)
- `git log --all` on server.py (Mongo client history)

## Non-code output of this investigation

- Owner clarification: nginx log is NOT our code path but IS same incident.
- Concept of "amplifier" vs "root cause" — user's default assumption was
  challenged: Atlas caused the outage; missing client timeouts amplified
  the user pain 6×.
- CR-2026-07-03-003 scoped and shipped from this investigation directly.
