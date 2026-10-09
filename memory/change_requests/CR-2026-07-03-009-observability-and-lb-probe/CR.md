# CR-2026-07-03-009 — Observability + LB Probe Wiring (Post CR-003)

**Status:** REGISTERED — Planning stage
**Raised:** 2026-07-03
**Author:** E1 (follow-ups from CR-003 shipping)
**Priority:** P1 for F-13 (unclaimed win from CR-003), P3 for F-12
**Severity:** MEDIUM (missing this leaves CR-003's benefit on the table)
**Risk of the change itself:** LOW (ops config + optional logging tweak)
**Depends on:** CR-2026-07-03-003 (shipped — `/api/healthz` exists)

---

## 1. Scope — two items clubbed

| Sub-ID | Item | Owner |
|---|---|---|
| F-13 | Ops / infra team must actually point their LB / uptime probe at `GET /api/healthz` for CR-003 to deliver its value | Ops |
| F-12 | Structured alerting on `pymongo.errors.ServerSelectionTimeoutError` / `NetworkTimeout` in FastAPI logs | Ops + Backend |

Common theme: **CR-003 shipped fast-fail behavior, but only if the surrounding ops surface actually uses it.**

---

## 2. F-13 — LB / uptime probe wiring

### Background
CR-2026-07-03-003 shipped `GET /api/healthz` on 2026-07-03. It returns:
- `200 {ok:true,mongo:up}` in ≤ 2 s under normal conditions.
- `503 {ok:false,mongo:timeout|error}` when Mongo is unreachable.

If ops points the LB at this, the LB will stop routing to a pod when its Mongo dependency is gone → nginx `epoll_wait ... prematurely closed` storm during the next Atlas hiccup is significantly reduced.

### Proposed change (owned by ops, not by code)
1. **Kubernetes** (if in use):
   ```yaml
   livenessProbe:
     httpGet:
       path: /api/healthz
       port: 8001
     initialDelaySeconds: 15
     periodSeconds: 10
     timeoutSeconds: 3      # NOT 500 ms — Atlas RTT is ~260 ms + 2 s ping cap
     failureThreshold: 3    # ≥ 3 failures before restart
     successThreshold: 1
   readinessProbe:
     httpGet:
       path: /api/healthz
       port: 8001
     initialDelaySeconds: 5
     periodSeconds: 5
     timeoutSeconds: 3
     failureThreshold: 3
     successThreshold: 1
   ```

2. **PM2 / Supervisor** (current deployment):
   PM2/Supervisor doesn't natively call HTTP health checks. Options:
   - Add a sidecar cron: `*/1 * * * * curl -sf http://localhost:8001/api/healthz || pm2 restart app-mygenie` (harsh — restarts the process every minute of DB downtime; NOT recommended).
   - Add an external uptime service (BetterUptime, UptimeRobot, Pingdom, Datadog Synthetic) that pings `/api/healthz` from outside the pod → sends alerts, records incidents.
   - Add nginx `upstream ... max_fails=3 fail_timeout=30s` on a probe path — nginx will stop proxying to that upstream when it fails.

3. **nginx sidecar** (if present):
   ```
   location = /healthz {
     proxy_pass http://127.0.0.1:8001/api/healthz;
     proxy_read_timeout 3s;
     proxy_connect_timeout 3s;
     access_log off;
     limit_req zone=healthz burst=1 nodelay;  # optional rate limit
   }
   ```

### Files WILL change (external to repo)
- Kubernetes manifests, PM2 config, nginx config, or uptime service — depending on actual deploy topology. NOT in this repo.

### Risks
| # | Risk | Mitigation |
|---|---|---|
| R1 | Probe timeout too tight → false-negative pod restarts | Use ≥ 3 s timeout, `failureThreshold ≥ 3` |
| R2 | LB routing flap during brief Atlas blips | Backend's own `retryReads=True` (from CR-003) already handles single-blip retries transparently → healthz stays green for those. Only sustained outages flip red. |
| R3 | Ops thinks healthz is authenticated / private | It's intentionally public. Document that. Consider `limit_req` for rate-limiting. |

---

## 3. F-12 — Structured Mongo-error alerting

### Background
Today, `ServerSelectionTimeoutError` and `NetworkTimeout` surface as tracebacks in `/var/log/supervisor/backend.err.log`. No one is paged.

### Proposed change
1. **Log structured JSON alongside the traceback** for grep-based alerting:
   ```python
   except (ServerSelectionTimeoutError, NetworkTimeout) as e:
       logger.error({
         "event": "mongo_unreachable",
         "op": "customer_app_config.find_one",
         "restaurant_id": restaurant_id,
         "err": type(e).__name__,
         "elapsed_ms": ...,
       })
       raise
   ```
2. **Alert rule (owned by ops):**
   - Alert on: `>= 1` occurrence of `event=mongo_unreachable` OR `pymongo.errors.ServerSelectionTimeoutError` in the FastAPI log within any 60 s window.
   - Send to: on-call channel (Slack / PagerDuty / whatever).
3. **Optional metric emission:**
   - If Prometheus / StatsD / OpenTelemetry is in scope, emit a counter `mongo_selection_timeout_total`. Otherwise skip.

### Files WILL change
- `backend/server.py` — wrap `serverSelectionTimeoutError` catches with structured logging (~5-10 LOC). Optional.
- Alerting infra config — external.

### Files WILL NOT touch
- Any endpoint response shape (raise-and-preserve semantics)
- Any other code path

### Risks
| # | Risk | Mitigation |
|---|---|---|
| R1 | Log flood during a real outage triggers alert-storm | Ops rule should dedup: alert once per 5-min window |
| R2 | Adds a new log line — some log-shippers charge per line | Volume is negligible outside outages |

---

## 4. Files WILL change (combined)

- **F-12 code side:** `backend/server.py` (~5-10 LOC additive, optional). If ops does not have log-based alerting, skip this entirely.
- **F-13 code side:** none — pure ops config.

## 5. Files WILL NOT touch
- Frontend
- Any endpoint contract
- `.env`, requirements.txt
- Data / DB
- POS / CRM

## 6. Verification matrix

| Test | F-12 | F-13 |
|---|---|---|
| LB / uptime probe hits `/api/healthz` and gets 200 under normal conditions | — | ✅ |
| Simulate Mongo outage → probe returns 503 → LB stops routing | — | ✅ (in staging) |
| Alerting fires within 60 s of first `ServerSelectionTimeoutError` in log | ✅ | — |
| No new noise under healthy conditions | ✅ | ✅ |

## 7. Owner decisions

1. **F-13 owner:** who wires the probe? Ops? DevOps? Application team?
2. **Deploy topology:** Kubernetes / PM2+nginx / external uptime service? Different config for each.
3. **F-12 needed?** If ops has Datadog / New Relic / Sentry already ingesting `err.log`, the structured JSON step is a nice-to-have. If not, worth doing.
4. **Alert channel:** where do these pages go?

## 8. Effort
- F-13: 30 min – 2 hours (depends on deploy topology; K8s is fastest, external uptime service quickest to demo)
- F-12: 30 min code + ops rule (if code path taken); else 0 code

## 9. Non-goals

- No metrics dashboards / Grafana boards built in this CR
- No SLO / error-budget policy
- No incident-response runbook — separate ops initiative
- No log-shipping infrastructure changes
