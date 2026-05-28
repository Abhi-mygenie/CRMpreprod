# MyGenie CRM — PRD & Handover

> **Read this first.** Single canonical entry point for any agent picking up this project.

**Last updated**: 2026-05-28 (end of CR-004 P3.5 implementation, Commits 1–7)
**Branch**: `28-may`
**Codebase pulled from**: `https://github.com/Abhi-mygenie/CRMpreprod.git`
**Working tree**: `/app` (preview pod)

---

## 1. What this product is

**MyGenie CRM** — a CRM for restaurants, covering:
- Loyalty program (points, tiers, wallet, redemption)
- Coupon engine (multiple discount types, time-window, BOGO, item/category scope, etc.)
- WhatsApp utility + marketing automation (POS-driven and CRM-driven events, templates, send logs)
- POS integration (`preprod.mygenie.online` POS shares the same MongoDB)
- Customer feedback, segments, analytics

Multi-tenant. Each restaurant = one `user_id` (e.g. R689 Kunafa Mahal = `pos_0001_restaurant_689`).

---

## 2. Tech stack & environment

| Layer | Tech | Path |
|---|---|---|
| Backend | FastAPI (Python 3.11), Motor (async Mongo) | `/app/backend` |
| Frontend | React 19 (CRA + craco), Tailwind, Radix UI, Recharts, sonner toasts | `/app/frontend` |
| Database | **Remote** MongoDB 7.0.30 | `mongodb://mygenie_admin:***@52.66.232.149:27017/mygenie` (DB name: `mygenie`) |
| Scheduler | APScheduler (in-process), daily cron 00:00 UTC | `backend/core/scheduler.py` |
| WhatsApp send | AuthKey.io `requestjson.php` | outbound only |
| WhatsApp receive | AuthKey delivery-report webhook → `/api/whatsapp/status-callback` | inbound, **not yet wired in prod** (see §8) |

### Service URLs
- Backend internal: `http://localhost:8001` (all routes prefixed `/api`)
- Frontend internal: `http://localhost:3000`
- **Preview external**: `https://4855716e-b88e-44a4-bee4-f087b47a51f1.preview.emergentagent.com` (this pod)
- Production: `https://crm.mygenie.online` (owner manages)

### Environment files
- `backend/.env`: `MONGO_URL`, `DB_NAME=mygenie`, `CORS_ORIGINS=*`, `JWT_SECRET`
- `frontend/.env`: `REACT_APP_BACKEND_URL`, `WDS_SOCKET_PORT=443`
- **No AuthKey secrets** in `.env` — AuthKey API key lives in `db.users[<user_id>].authkey_api_key`. AuthKey does not sign webhooks (see §10).

### Supervisor
Both services managed by supervisor. Hot-reload enabled. Restart only after `.env` changes or dependency installs:
```bash
sudo supervisorctl restart backend
sudo supervisorctl restart frontend
sudo supervisorctl status
```

---

## 3. Credentials & test data

### Owner login (R689 — primary live-test tenant)
- Email: `owner@kunafamahal.com`
- Password: `Qplazm@10`
- AuthKey API key (in DB, redacted to last 4): `...fed7`
- WhatsApp brand number: `917666859544`
- Meta WABA ID: `1427078455442831`

### POS API key (X-API-Key header, multi-tenant)
- `dp_live_-sF0sATfNhf72UbrG9BPaKM4icqWnAb7Q4tB6DN3ktE`

### Local test customer
- Customer name: `abhishek jain`
- Phone: `7505242126` (country code `91`)
- Test recipient for live WhatsApp sends from R689

### Hard rules around DB
- **Do NOT call/modify the remote database from scripts without owner approval.** Reads via app endpoints are fine; arbitrary write scripts are not.
- **No backfill of historical rows** has been performed (owner declined).
- **No legacy data migration** has been performed (owner declined).

---

## 4. Current state — what works, what doesn't

### ✅ Working end-to-end
- Login (JWT-based for owner), customer CRUD, coupons, points, wallet, segments, feedback.
- POS integration (`/api/pos/orders`, `/api/pos/event`).
- WhatsApp **outbound sends** via AuthKey for R689 (API key configured; every send produces a real `logid`).
- WhatsApp message logs dashboard (`/message-status`) — reads correct data, all filters work, new fields visible.
- Daily cron jobs (birthday, anniversary, points_expiring, coupon_expiring, inactive_customer) — all idempotent per day.
- New webhook endpoint `/api/whatsapp/status-callback` — fully functional on this preview pod; tested with curl probes.

### ⏳ Pending owner ops (NOT this agent's work)
- Push branch `28-may` to production CRM (`crm.mygenie.online`).
- Register webhook URL `https://crm.mygenie.online/api/whatsapp/status-callback` in AuthKey console for R689's WABA. Currently AuthKey posts callbacks to `preprod.mygenie.online` (Laravel), not to this CRM.
- Once both done: send a real WhatsApp from prod → watch dashboard go Pending → Delivered → Read.

### ⚠️ Known limitations / intentional gaps
- `message_body_text` field is always `null` on new rows — template body isn't stored in our DB; no fallback per owner decision.
- Historical rows pre-2026-05-28 still have `message_id: null` and will sit in Pending forever (owner declined backfill).
- HMAC verification for inbound webhooks is dormant code (AuthKey doesn't sign — confirmed from real sample). Activates automatically if `AUTHKEY_WEBHOOK_SECRET` ever lands in `.env`.
- Test sends via `/test-template` are hidden from dashboard by default; toggle "Show test sends" to see them.
- `reset_password` (owner OTP) does NOT have an idempotency_key — by design, owner can re-request OTPs freely.

---

## 5. Active sprint — CR-004 P3.5 Message Status Pipeline Refactor

### Canonical docs (read in this order)
1. `memory/crm/crm_roi_sprint/planning/CR_004_PHASE_3_5_MESSAGE_STATUS_PIPELINE_REFACTOR_PLAN.md` — the plan
2. `memory/crm/crm_roi_sprint/implementation/CR_004_P3_5_IMPLEMENTATION_CLOSEOUT.md` — what was actually done in this session
3. `memory/crm/crm_roi_sprint/implementation/CR_004_P3_5_COMMIT_1_AND_2_HANDOVER.md` — example of the per-commit handover pattern

### One-paragraph summary of what was built
The Message Status dashboard's data pipeline was completely refactored. Before this session, every WhatsApp send wrote a row with `message_id: null`, which meant the webhook's row-lookup-by-id always missed, so rows stayed Pending forever. The fix touched both sides: (a) **send-side** — every send now writes a 30-field row with the real AuthKey `logid` as `message_id`, plus raw response, idempotency key, reference fields, and "no silent black hole" exception handling; (b) **receive-side** — the webhook endpoint was rewritten audit-first, with a locked schema based on a real AuthKey payload sample, a state machine that prevents status regression, IST→UTC timestamp parsing, and a new `whatsapp_callback_logs` audit collection. The frontend dashboard gained date-range filtering, name+phone search, a "Show test sends" toggle, TEST badges on test rows, status-transition timestamps, and a 30-minute in-flight grace window for resend protection.

### Commits delivered (1–7)
| # | What | LoC | Files |
|---|---|---|---|
| 1 | State machine + 15 unit tests | +166 | 2 new |
| 2 | Send-side row refactor + 6 indexes | +90/-25 | 2 edited |
| 3 | Callsite enrichment (22 callsites, idempotency keys) | +200/-30 | 9 edited |
| 4 | Path B (`/test-template`) unification | +35/-15 | 1 edited |
| 5 | Webhook full rewrite (audit-first, state machine, locked parser) | +180/-50 | 1 edited |
| 6 | Dashboard backend extensions (filters, search, resend guard) | +60/-15 | 1 edited |
| 7 | Frontend polish (UI elements, dead-code cleanup) | +90/-25 | 2 edited |

**Total**: 17 files (2 new + 15 edited), ~+820/-160 LoC.

### Commit 8 (NOT yet done — owner-driven)
- Owner pushes branch to prod.
- Owner registers webhook URL in AuthKey console.
- Optional hardening: IP allowlist for `/api/whatsapp/status-callback` (AuthKey egress IP observed: `157.245.105.3` — DigitalOcean NY), rate limit, 24h replay window.

---

## 6. Architecture — Message Status pipeline (what was just built)

```
TRIGGER (POS / cron / auth / wallet / coupon / feedback / loyalty)
   │
   ▼
core.whatsapp.trigger_whatsapp_event(db, user_id, event_type, customer, event_data)
   │  - event_data carries idempotency_key + reference_type + reference_id + pos_order_id
   │
   ▼
AuthKey requestjson.php POST  →  response {logid, Message: "Submitted Successfully"}
   │
   ▼
core.whatsapp.log_message_attempt() writes ONE COMPLETE 30-FIELD ROW
   to whatsapp_message_logs:
     - message_id = logid          (KEY for webhook lookup)
     - status = "pending"
     - reference_type/reference_id (joins back to order/coupon/etc.)
     - idempotency_key             (unique sparse partial index — blocks duplicates)
     - authkey_raw_response        (full audit)
     - all timestamps null         (populated later by webhook)
   │
   ▼
(async, eventually) AuthKey POSTs to /api/whatsapp/status-callback:
   {logid, status, time (IST), mobile, meta_messageid, channel, ...}
   │
   ▼
routers.whatsapp.message_status_callback():
   1. raw body captured to whatsapp_callback_logs (audit-first)
   2. HMAC verifier (dormant — AuthKey doesn't sign)
   3. logid extracted (defensive multi-key fallback)
   4. status translated via locked map
   5. time parsed IST → UTC
   6. row lookup by message_id=logid
   7. core.whatsapp_status.next_status(current, mapped) — state machine guard
   8. mobile sanity check vs row's country_code+customer_phone
   9. $set: status (if transition valid), updated_at, time_raw, delivered_at|read_at|rejected_at,
            failure_reason, meta_message_id, channel, keypress, button_param_value, mobile_mismatch
   10. $push: status_history entry (even on ignored transitions, for audit)
   │
   ▼
Dashboard /message-status reads whatsapp_message_logs (single source of truth)
   - Stats card: Total / Delivered / Read / Pending / Failed
   - Filters: status, event_type, campaign, template, search (name+phone), date range, include_test
   - Table: TEST badge for is_test=true rows; delivered_at/read_at subtext; resend disabled if in-flight
```

---

## 7. Key file locations

### Backend
- `backend/server.py` — FastAPI app, startup indexes, supervisor entrypoint
- `backend/core/whatsapp.py` — `SendResult`, `WhatsAppMessage`, `send_single_message`, `send_bulk_messages`, `log_message_attempt` (canonical row writer), `trigger_whatsapp_event` (main entry), `trigger_points_earned_event` (wrapper), `build_body_values`, `resolve_variable`
- `backend/core/whatsapp_status.py` — pure state machine (`next_status`, `is_terminal`, `ALLOWED_TRANSITIONS`)
- `backend/core/whatsapp_variables.py` — variable registry for template `{{N}}` placeholders
- `backend/core/loyalty.py` — points-redeem helper, fires `points_redeemed` event
- `backend/core/loyalty_jobs.py` — 5 daily cron jobs (birthday, anniversary, points_expiring, coupon_expiring, inactive_customer)
- `backend/core/scheduler.py` — APScheduler setup, daily 00:00 UTC
- `backend/core/coupon.py` — coupon validation + idempotent usage recording
- `backend/core/database.py` — Motor client
- `backend/routers/whatsapp.py` — all WhatsApp HTTP endpoints (1248 lines): `/test-template`, `/message-logs`, `/message-stats`, `/message-filters`, `/status-callback`, `/resend`, plus event-template mapping endpoints
- `backend/routers/pos.py` — POS integration (2867 lines); main order endpoint at line ~1462 fires 4 WhatsApp triggers
- `backend/routers/coupons.py`, `wallet.py`, `points.py`, `auth.py`, `feedback` — each fires WhatsApp events on relevant business events
- `backend/services/feedback_service.py` — feedback POST writes points bonus + fires `feedback_request` trigger
- `backend/models/schemas.py` — Pydantic models + `POS_EVENTS` + `CRM_EVENTS` + `AUTOMATION_EVENTS` constants (27 events total)
- `backend/tests/test_whatsapp_*.py` — 5 test files, 65 tests total (including 15 new state-machine tests)

### Frontend
- `frontend/src/pages/MessageStatusPage.jsx` — message status dashboard (the page touched in Commit 7)
- `frontend/src/components/shared/WhatsAppAutomationContent.jsx` — automation event mapping page
- `frontend/src/pages/TemplatesPage.jsx` — template builder + "Send Test"
- `frontend/src/pages/DashboardPage.jsx` — main dashboard (embeds `MessageStatusContent`)
- `frontend/src/contexts/AuthContext.js` — `api` (axios with JWT) + login state
- `frontend/src/App.js` — route table

---

## 8. MongoDB collections of interest

| Collection | Purpose |
|---|---|
| `users` | tenants (restaurants); contains `authkey_api_key`, `brand_number`, `meta_waba_id` per tenant |
| `customers` | per-tenant customer records (phone, name, country_code, points, tier, wallet_balance) |
| `orders`, `order_items` | POS orders |
| `points_transactions`, `wallet_transactions` | loyalty/wallet audit |
| `coupons`, `coupon_usage` | coupon definitions + usage |
| `feedback` | customer feedback records |
| `segments` | broadcast segments (currently UI-only; broadcast send not built) |
| `whatsapp_event_template_map` | maps each event_type → template_id + is_enabled |
| `whatsapp_template_variable_map` | maps each template's `{{N}}` placeholders → variable_key + mode |
| **`whatsapp_message_logs`** | **30-field per-message audit row (the dashboard's source of truth)** |
| **`whatsapp_callback_logs`** | **NEW — every inbound webhook captured verbatim (audit-first)** |
| `pos_request_logs` | POS request logs (CR-002) |
| `migration_sync_logs` | data migration history |

### Indexes added by this session (Commit 2)
- `whatsapp_message_logs.idx_wml_user_created` `(user_id, created_at DESC)`
- `whatsapp_message_logs.idx_wml_user_status` `(user_id, status)`
- `whatsapp_message_logs.idx_wml_message_id` `(message_id)` sparse — webhook lookup
- `whatsapp_message_logs.idx_wml_user_idem` `(user_id, idempotency_key)` unique + partial filter on string-only — prevents duplicate sends
- `whatsapp_callback_logs.idx_wcl_received` `(received_at DESC)`
- `whatsapp_callback_logs.idx_wcl_logid` `(logid)` sparse

**Lesson**: MongoDB compound `sparse=True` does NOT exclude missing secondary fields — use `partialFilterExpression` for unique compound indexes. This bit us mid-Commit-2; fix documented in plan.

---

## 9. AuthKey integration (locked schemas)

### Outbound (we → AuthKey)
- Endpoint: `https://console.authkey.io/restapi/requestjson.php`
- Auth: `Authorization: Basic <user_doc.authkey_api_key>`
- Body: `{country_code, mobile, wid: template_id, type: "text"|"media", bodyValues: {1: ..., 2: ...}, headerValues?: {...}}`
- Success response: `{"logid":"<32-char hex>","Message":"Submitted Successfully"}`
- Our parser reads `logid` (lowercase canonical), with `LogID`/`log_id`/`message_id`/`msgid` as defensive fallbacks.

### Inbound (AuthKey → us)
- Endpoint: `POST /api/whatsapp/status-callback` (public, unauthenticated)
- AuthKey **does not sign** webhooks (no signature header in real sample)
- Real payload schema (from sample 2026-05-28 15:48:23):
  ```json
  {
    "logid": "6eec3f25a3434aad924c3ccca2009580",
    "mobile": "919306459030",
    "status": "delivered",
    "time": "2026-05-28 15:48:22",            // IST, no TZ marker
    "channel": "wp",
    "meta_messageid": "wamid.HBgM...==",
    "keypress": null,
    "button_param_value": "OTE2NTc3"
  }
  ```
- Status enum we accept: `sent` → `pending`, `delivered`, `read`, `failed`/`undelivered`/`rejected` → `rejected`. Anything else logged with verdict `unknown_status`.

---

## 10. Security posture (webhook endpoint)

AuthKey doesn't sign webhooks. Defense-in-depth without HMAC:
1. **Audit-first**: every inbound POST captured in `whatsapp_callback_logs` regardless of parse success.
2. **Lookup by `logid`** (32-char hex, ~10³⁸ keyspace).
3. **State machine** prevents status regression.
4. **Limited blast radius**: webhook can only set status + timestamps + a few optional fields; cannot alter recipient/template/body/customer_id/user_id.
5. **No PII echoed** in webhook response.

### Optional fast-follow (Commit 8 — owner decides)
- IP allowlist (AuthKey egress: `157.245.105.3`, DigitalOcean NY — confirm full range with AuthKey support).
- Rate limit by source IP.
- Reject `time` > 24h drift (replay protection).

---

## 11. CR sprint context (broader)

This session worked on **CR-004 P3.5** — a follow-up to CR-004 Phase 3 (Event Reconciliation, closed earlier).

### CR-004 overall progress
- P1 Foundation Cleanup ✅
- P2 Variable DB Mapping ✅
- P2.5 Variable Expansion ✅
- P2.5-B Coupon-aware Dynamic Variable Mapping ✅
- P3 Event Reconciliation ✅ (live test passed — order 869305 WhatsApp delivered)
- **P3.5 Message Status Pipeline Refactor ✅** (this session, Commits 1–7 done; owner ops pending)

### Other CRs in flight (per `00_register/ROI_MEASUREMENT_CR_REGISTER.md`)
- CR-011 Coupon Optimizer — discovery
- CR-012 WhatsApp Template Builder Production Readiness — planning
- CR-013 Template Gallery — blocked by CR-012 P1

---

## 12. Verification log (Commits 1–7)

| Gate | Result |
|---|---|
| `ruff check` on every modified Python file | clean |
| `eslint` on both modified JS files | clean (only pre-existing warnings in untouched files) |
| `pytest backend/tests/test_whatsapp_*.py` | **65/65 passed** |
| Backend `/api/health` after each restart | green |
| Remote MongoDB indexes via read-only `list_indexes()` | all 6 new indexes present |
| Webhook integration probes (empty body, unknown logid, unknown status) | classified correctly + audit logged |
| Authenticated curl probes (`/message-stats`, `/message-logs`, `/message-filters`) | working; `include_test` filter verified (2 default vs 4 with toggle) |
| Playwright screenshot of `/message-status` | all new UI elements render |

---

## 13. Strict rules for the next agent

1. **Do NOT call `testing_agent_v3`** — owner has explicitly opted out for this codebase.
2. **Do NOT write to the remote MongoDB** from scripts. Reads via app code are fine; arbitrary write scripts are not. If a migration is genuinely needed, escalate to owner first.
3. **Do NOT modify the CRM 1.0 baseline-close doc** (`memory/crm/crm_1_0/handoff/CRM_1_0_BASELINE_CLOSE_2026_05_26.md`).
4. **Do NOT add AuthKey secrets to `.env`** — AuthKey doesn't sign webhooks, send-side API key is in the user doc.
5. **Do NOT push to production CRM** — owner does this manually.
6. **DO follow** the discovery → planning → implementation → qa → handoff lifecycle documented in `memory/crm/crm_roi_sprint/README.md`.
7. **DO use `mcp_search_replace`** (not file rewrites) for existing-file edits — preserves untouched code.
8. **Watch for MongoDB compound sparse index gotcha**: `sparse=True` on a compound index indexes documents with missing secondary fields as null. Use `partialFilterExpression` for unique compound indexes with optional secondary fields.

---

## 14. Quick start for next agent (if resuming this work)

```bash
# 1. Verify services
sudo supervisorctl status
curl -s http://localhost:8001/api/health

# 2. Run the unit tests as a sanity check
cd /app/backend && python -m pytest tests/test_whatsapp_*.py -v

# 3. Read these in order
view_bulk paths:
  /app/memory/PRD.md                                                                        # this file
  /app/memory/crm/crm_roi_sprint/planning/CR_004_PHASE_3_5_MESSAGE_STATUS_PIPELINE_REFACTOR_PLAN.md
  /app/memory/crm/crm_roi_sprint/implementation/CR_004_P3_5_IMPLEMENTATION_CLOSEOUT.md

# 4. If owner reports prod live-test passed → mark plan status to `closed`
#    and write `memory/crm/crm_roi_sprint/qa/CR_004_PHASE_3_5_LIVE_TEST_REPORT.md`.

# 5. If owner reports issues → root-cause from whatsapp_callback_logs collection first.
#    Every inbound webhook is audit-logged with a verdict; bug is almost certainly visible there.
```

### What to investigate first if the dashboard still shows Pending forever post-prod-push
1. Read `whatsapp_callback_logs` — are inbound webhooks arriving?
   - If no rows: AuthKey URL still points elsewhere (B3 not done).
   - If rows exist with `verdict=rejected_no_logid`: AuthKey changed field name → update parser in `routers/whatsapp.py::message_status_callback`.
   - If rows exist with `verdict=no_matching_row`: send-side `logid` extraction broke → check `core/whatsapp.py:114` area.
   - If rows exist with `verdict=unknown_status`: extend `status_map` in webhook handler.
2. Read latest `whatsapp_message_logs` row — does it have `message_id` populated?
   - If null: send-side regressed; check AuthKey response shape.
3. Check supervisor logs: `tail -n 200 /var/log/supervisor/backend.err.log`.

---

## 15. Doc tree map

```
/app/memory/
├── PRD.md                                                                # this file (canonical entry)
├── crm/
│   ├── crm_1_0/
│   │   └── handoff/CRM_1_0_BASELINE_CLOSE_2026_05_26.md                  # READ-ONLY — do not modify
│   └── crm_roi_sprint/
│       ├── README.md                                                     # sprint overview
│       ├── 00_register/ROI_MEASUREMENT_CR_REGISTER.md                    # all CRs status
│       ├── discovery/                                                    # CR discovery docs
│       ├── planning/
│       │   └── CR_004_PHASE_3_5_MESSAGE_STATUS_PIPELINE_REFACTOR_PLAN.md # THIS sprint's plan
│       ├── implementation/
│       │   ├── CR_004_P3_5_COMMIT_1_AND_2_HANDOVER.md                    # example per-commit handover
│       │   └── CR_004_P3_5_IMPLEMENTATION_CLOSEOUT.md                    # THIS sprint's closeout
│       ├── qa/                                                            # QA reports
│       └── handoff/                                                       # final handoffs
└── Old API doc/                                                           # legacy API docs
```

---

**End of PRD. The next agent should be able to start cold from this single document.**
