# Intake Doc — CR-2026-07-04-004

**ID:** CR-2026-07-04-004-client-telemetry
**Session:** 2026-07-04
**Operator agent:** E1
**Role:** Role 1 (INTAKE) per Alpha v0.1 §8

---

## 1. Owner report / origin

Filed as follow-up during CR-2026-07-03-004 review. Owner asked: *"if similar issues comes will be get logs to use in db?"* Answer: no — CR-004 gives console-only visibility on the client, nothing persists to DB. This CR fills that gap so future timeout incidents leave a trace.

Owner approval to consolidate (2026-07-04): "option A" — file the three consolidated CRs as proposed.

## 2. Summary

Add minimal client telemetry so timeout events (from CR-004) and other client-side errors are queryable in the DB with 30-day TTL. Enough visibility for post-incident debugging without turning into a full APM.

**Concretely:**
1. New FastAPI endpoint `POST /api/telemetry/client-event` (no auth, IP-hash logged, minimal rate-limit)
2. Frontend hook `sendTelemetry({event_type, url_pattern, restaurant_id, session_id, duration_ms, ...})` called from `fetchWithTimeout.js` on TimeoutError
3. Mongo collection `client_telemetry_events` with 30-day TTL index
4. Admin read endpoint `GET /api/telemetry/timeouts?since=<iso>&restaurant=<id>` (behind admin JWT)

## 3. Classification

| Field | Value |
|---|---|
| Type | CR — code (backend + frontend) |
| Severity | **P2** (observability — enables debugging but not a fix) |
| Risk | **LOW-MEDIUM** — new endpoint + one frontend hook; needs rate-limit to avoid abuse |
| Duplicate check | **DISTINCT** — no telemetry infra exists today |
| Evidence | Owner ask during CR-004 review (2026-07-04); adjacent to but distinct from CR-2026-07-03-009 (LB probe / mongo-error alerting) |
| Blast radius | **SMALL** — 1 new backend endpoint, 1 new admin endpoint, 1 new Mongo collection, ~15 LOC added to `fetchWithTimeout.js` |

## 4. Scope

**IN:**
- New backend endpoint `POST /api/telemetry/client-event` — accepts `{ event_type, url_pattern, restaurant_id, session_id, duration_ms, ua_family, occurred_at_utc }`, hashes IP with a rotating salt (from `backend/.env`), writes to Mongo `client_telemetry_events`.
- URL patternization: `/menu-master?rid=698&t=12345` → `/menu-master?rid=<n>&t=<n>` (no PII, no unique IDs).
- Frontend integration: `fetchWithTimeout.js` on TimeoutError → `sendTelemetry({event_type: 'fetch_timeout', ...})`.
- ErrorBoundary in `App.js` → `sendTelemetry({event_type: 'react_error', ...})` for uncaught renders.
- Mongo collection `client_telemetry_events` — TTL index at 30 days.
- Admin read endpoint `GET /api/telemetry/timeouts` — behind admin JWT, supports `?since=<iso>&restaurant=<id>` filters.
- Rate-limit: 5 events per IP per minute at the FastAPI layer.
- Env vars: `TELEMETRY_IP_HASH_SALT` in `backend/.env` (rotating).

**OUT:**
- Prometheus / StatsD / OpenTelemetry integration (separate concern)
- Full APM (Sentry, Datadog RUM, etc.) — different license / cost decision
- User session recording (privacy nightmare, out of scope)
- SLO dashboards / Grafana boards
- Auto-alerts on telemetry patterns (belongs in CR-2026-07-03-009 F-12)

## 5. Prerequisites

- ✅ CR-2026-07-03-004 SHIPPED (so `fetchWithTimeout.js` exists as the natural hook point)
- ⏳ Owner decision on retention period (default proposed: 30 days)
- ⏳ Owner decision on rate-limit numbers (default proposed: 5 events / IP / min)
- ⏳ Owner decision on whether to also emit metric to a Prometheus-style backend if one exists

## 6. Success criteria (draft — refined at Planning)

| # | Criterion | Verification |
|---|---|---|
| S-01 | `POST /api/telemetry/client-event` returns 202 on valid payload | curl |
| S-02 | Same endpoint returns 429 after 5 events / IP / 60 s | curl loop |
| S-03 | Event lands in Mongo `client_telemetry_events` with hashed IP (not plain) | Mongo shell inspection |
| S-04 | TTL index deletes events > 30 days old | Mongo shell + wait |
| S-05 | Frontend `fetchWithTimeout` fires telemetry on TimeoutError (best-effort, doesn't block user) | DevTools Network + Mongo check |
| S-06 | ErrorBoundary catches an intentional throw and fires telemetry | manual test |
| S-07 | Admin `GET /api/telemetry/timeouts?restaurant=478` returns matching events | curl with admin JWT |
| S-08 | No PII in stored events (no full IP, no User-Agent full string, no user_id) | code review + sample-row inspection |
| S-09 | Telemetry failure never breaks the user flow (silent try/catch) | manual test with backend down |

## 7. Owner decisions needed at Planning gate

| # | Decision | Options |
|---|---|---|
| D-01 | Retention period | (a) 7 days (b) 30 days (c) 90 days |
| D-02 | Rate limit — events per IP per minute | (a) 5 (b) 10 (c) 25 |
| D-03 | IP hashing — rotating salt or static? | (a) rotate weekly (b) rotate monthly (c) static (least secure) |
| D-04 | Include `ua_family` (browser family only, not full UA) or omit entirely? | (a) include family (b) omit |
| D-05 | Include `restaurant_id` in events? (arguably not PII but restaurant-scoped) | (a) yes (b) no |
| D-06 | Emit to Prometheus/StatsD if one exists? | (a) yes (b) no (c) later |

## 8. Estimated effort

- Backend endpoint + Mongo + rate-limit + IP hashing — 1.5 hrs
- Admin read endpoint — 30 min
- Frontend `sendTelemetry` hook + `fetchWithTimeout` integration + ErrorBoundary — 1 hr
- Env var + supervisor restart — 15 min
- Self-test (V-01..V-09) — 45 min
- QA_HANDOVER writeup — 15 min
- **Total: ~4 hrs**

## 9. Related items

- **CR-2026-07-03-004** — provides `fetchWithTimeout.js` as the natural integration point
- **CR-2026-07-03-009** — LB probe + mongo-error alerting (server-side observability, distinct axis)
- Alpha v0.1 §11 R11 (secret hygiene) — the IP-hash-salt env var must not be committed

## 10. Non-goals

- Not a Sentry / Datadog / LogRocket integration
- Not user session replay
- Not a metrics dashboard build
- Not a runbook / on-call rotation

## 11. Compact Role 1 exit block

```text
Intake complete: CR-2026-07-04-004
Classification: CR (code — backend endpoint + frontend hook + Mongo collection)
Severity: P2
Risk: LOW-MEDIUM
Duplicate check: DISTINCT
Evidence: linked (owner ask 2026-07-04 during CR-004 review; distinct from CR-2026-07-03-009 F-12)
Blast radius: SMALL (1 endpoint, 1 collection, ~15 LOC frontend)
Docs updated: memory/change_requests/CR-2026-07-04-004-client-telemetry/{INTAKE_DOC.md, CR.md}, memory/change_requests/README.md (row added)
Blocked by: owner D-01..D-06
Next: Planning (Role 2) — when priorities allow. Not urgent unless a customer incident makes visibility gap painful.
```
