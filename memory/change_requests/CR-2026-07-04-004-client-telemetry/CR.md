# CR-2026-07-04-004 — Client Telemetry to Mongo

**Status:** 📝 REGISTERED (Role 1 intake complete)
**Session:** 2026-07-04
**Priority:** P2
**Severity:** P2
**Risk of change:** LOW-MEDIUM — new backend endpoint + frontend hook, minimal
**Fast Lane:** ❌ Not eligible (touches backend + frontend, adds new endpoint surface)

**Related:**
- Parent: [`CR-2026-07-03-004`](../CR-2026-07-03-004-frontend-fetch-timeouts/CR.md) — provides `fetchWithTimeout.js` as the natural integration point
- Sibling axis: [`CR-2026-07-03-009`](../CR-2026-07-03-009-observability-and-lb-probe/CR.md) — server-side observability (LB probe / mongo-error alerting)

---

## 1. Problem

CR-004 caps client fetches at 8/15 s and shows Toast when configs timeout. But **nothing persists to the DB**. If a customer hits a timeout at 10 PM and doesn't report it, we never know. There's no way to answer:

- "How many customers hit a timeout in the last hour?"
- "Is restaurant 698 broken right now, or is it just one customer?"
- "Which upstream (POS / storage / CRM / Maps) is causing timeouts?"
- "Are order-create retries actually being triggered? Any signal that idempotency (D-02 assertion) might be breaking?"

Owner-asked this explicitly during CR-004 review: *"if similar issues comes will be get logs to use in db?"*

## 2. Proposed change

Minimal, privacy-preserving client telemetry:

1. **Backend endpoint** `POST /api/telemetry/client-event` — no auth, rate-limited to 5/IP/min, hashed IP (no plaintext), URL-patternized (no unique IDs).
2. **Frontend hook** — `sendTelemetry(event)` called from `fetchWithTimeout.js` on TimeoutError; also from `App.js` ErrorBoundary on uncaught React errors.
3. **Mongo collection** `client_telemetry_events` — 30-day TTL, ~200 bytes/event, negligible storage cost.
4. **Admin read endpoint** `GET /api/telemetry/timeouts?since=<iso>&restaurant=<id>` — behind admin JWT.
5. **Env var** `TELEMETRY_IP_HASH_SALT` — rotating salt in `backend/.env` (not committed).

## 3. What you can answer after this ships

- Real-time count of client timeouts (last 60 min / 24 hr).
- Group-by upstream (`url_pattern`).
- Filter by `restaurant_id` — "is 698 broken?".
- Cross-reference `event_type=order_retry` with actual orders in `mygenie.orders` — safety net for the D-02 idempotency assumption.
- Feeds a Grafana / Metabase dashboard later if wanted — data model is future-proof.

## 4. Scope

**IN:** 1 new backend endpoint, 1 admin read endpoint, 1 new Mongo collection with TTL, ~15 LOC frontend integration.
**OUT:** Sentry / Datadog RUM / any 3rd-party APM. Full metrics dashboard. Alert rules (belongs in CR-009 F-12). User session replay.

## 5. Success criteria (draft)

See `INTAKE_DOC.md §6` — 9 rows covering endpoint contract, rate-limit, TTL, PII absence, silent-failure behaviour.

## 6. Prerequisites

- ✅ CR-2026-07-03-004 SHIPPED — `fetchWithTimeout.js` exists as integration point
- ⏳ Owner decisions D-01..D-06 (retention, rate-limit, hashing, PII scope, metrics emission)

## 7. Effort

**~4 hrs total** (see `INTAKE_DOC.md §8` breakdown).

## 8. Non-goals

- Not a Sentry / Datadog integration
- Not user session replay
- Not a dashboard build
- Not an alert-rule setup

---

Full Impact Analysis + Implementation Plan written at Role 2 after owner answers D-01..D-06.
