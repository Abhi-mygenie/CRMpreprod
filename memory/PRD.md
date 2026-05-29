# MyGenie CRM — PRD & Handover

> **Read this first.** Single canonical entry point for any agent picking up this project.

**Last updated**: 2026-05-29 (CR-015 code complete — T7 committed, T2 skipped, live test parked. CR-015a/b/c done. Next: CR-014 unpark.)
**Branch**: `29-may`
**Codebase pulled from**: `https://github.com/Abhi-mygenie/CRMpreprod.git`
**Working tree**: `/app` (preview pod)
**Preview URL**: `https://crm-variable-mapping.preview.emergentagent.com`

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
- **Preview external (current pod)**: `https://crm-variable-mapping.preview.emergentagent.com`
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
- **Variable mapping is edited ONLY on the Templates page** (the "Map" button). WhatsApp Automation & Segments pages only consume saved mappings (template selection / previews) — no mapping UI there.

### 🗓️ 2026-05-29 cleanup & fixes (this session)
- **CR-015a** ✅ — preview "NA" for 14 T5 order-context variables fixed: 14 static sample values added to `GET /api/customers/sample-data`; frontend registry-`example` fallback in `WhatsAppAutomationContent.jsx` + `TemplatesPage.jsx`. Verified (curl + visual).
- **CR-015b** ✅ — removed orphaned/dead variable-mapping modal cluster on the WhatsApp Automation page (`openVariableMappingModal` was never wired to a button) + unused `availableFields`/`getPreviewMessage` on Segments. Templates page untouched.
- **CR-015c** ✅ — **demo login fully removed** (owner: "there should not be any demo login"). Deleted `/api/auth/demo-login`, `DEMO_EMAIL`/`DEMO_PASSWORD`, `is_demo` schema field, frontend Demo Login button, `demoLogin`/`isDemoMode`, `DemoModeBanner`. `test_segments_crm.py` switched to real login (11 passed). Nothing in DB to clean.
- **CR-015 T7** ✅ — R689 template 25140 slot `{{7}}` fixed (`points_earned` → `points_balance`). Slots `{{4}}`/`{{5}}` were already corrected via Templates page UI. All 7 slots now correct.
- **CR-015 T2** ⏭ SKIPPED — owner decided int→str DB normalization unnecessary. T1 resolver handles it.
- **CR-015 live test** ⏸ PARKED — POS points at production, not preview. Order 009573 didn't land.

### ⏳ Pending owner ops (NOT this agent's work)
- ~~Push branch `28-may` to production CRM~~ — no longer blocking; Option A bypassed need (preview ran full code path successfully).
- Webhook URL **HAS BEEN REGISTERED** in AuthKey console pointing to current preview URL (`https://crm-variable-mapping.preview.emergentagent.com/api/whatsapp/status-callback`) — confirmed working with real form-encoded callbacks from AuthKey egress IP `157.245.105.3` (2026-05-28).
- **Optional**: owner may push `28-may` to `crm.mygenie.online` whenever convenient — code is proven safe; not blocking.
- **Optional**: owner may repoint AuthKey webhook URL back to prod once prod is pushed, OR keep on preview.

### ⚠️ Known limitations / intentional gaps
- `message_body_text` field is always `null` on new rows — template body isn't stored in our DB; no fallback per owner decision.
- Historical rows pre-2026-05-28 still have `message_id: null` and will sit in Pending forever (owner declined backfill).
- HMAC verification for inbound webhooks is dormant code (AuthKey doesn't sign — confirmed from real sample). Activates automatically if `AUTHKEY_WEBHOOK_SECRET` ever lands in `.env`.
- Test sends via `/test-template` are hidden from dashboard by default; toggle "Show test sends" to see them.
- `reset_password` (owner OTP) does NOT have an idempotency_key — by design, owner can re-request OTPs freely.

### 🔧 Receive-side hotfix applied 2026-05-28 (post-commit-7)
**File**: `backend/routers/whatsapp.py::message_status_callback`
**Trigger**: Real AuthKey delivery callbacks captured during R689 live test (orders 869310 + 869311) arrived as `application/x-www-form-urlencoded`, NOT JSON. Original locked schema in §9 was derived from a post-parse sample. Parser returned empty dict → `verdict=rejected_no_logid` even though real logid + status + mobile + meta_messageid were present in raw body.
**Fix**: Content-type-aware parser. JSON path unchanged. Adds `urllib.parse.parse_qs` fallback for form-encoded bodies. Defensive: unknown Content-Type tries JSON then form. Single-value lists flattened; repeated keys preserved as lists.
**LoC**: ~+30 / -6 in `routers/whatsapp.py` (parser block + `from urllib.parse import parse_qs` import).
**Validation**: Replayed 3 real captured AuthKey payloads → all 3 parsed cleanly → `verdict=no_matching_row` (expected; rows have `message_id=null` because send-side ran on prod-old-code).
**Status**: lint clean (ruff), backend hot-reloaded, `/api/health` green, lives in `/app` only — NOT pushed to prod yet.

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
- Owner pushes branch to prod **OR** routes POS to preview for Option-A live validation (see §5.1).
- Owner has already registered webhook URL in AuthKey console (✅ confirmed working).
- Optional hardening: IP allowlist for `/api/whatsapp/status-callback` (AuthKey egress IP observed: `157.245.105.3` — DigitalOcean NY), rate limit, 24h replay window.

---

## 5.1. CR-004 P3.5 — CLOSED ✅ (2026-05-28 evening)

**Status**: `cr_004_p3_5_closed_live_test_passed`
**Closure live test**: `memory/crm/crm_roi_sprint/qa/CR_004_PHASE_3_5_LIVE_TEST_REPORT.md`

### Live test summary (Option A — synthetic POS order on preview)

Synthetic order `pos_order_id=E2E1779979662` (Rs.555, abhi at `7505242126`) was fired at preview's `/api/pos/orders`. Within 71 seconds:

```
14:47:43  Order persisted (orders + customer points awarded)
14:47:46  send_bill row written WITH message_id=6c46b572... + idempotency_key + reference_id=order/<UUID> + authkey_raw_response
14:47:53  AuthKey delivered callback → verdict=applied → row.status=delivered, delivered_at set, status_history +1
14:48:53  Customer opened WhatsApp
14:48:54  AuthKey read callback → verdict=applied → row.status=read, read_at set, status_history +1
```

### Acceptance criteria
**17/17 passed** including: send-side logid capture, reference_id linkage, idempotency key, authkey_raw_response audit, form-urlencoded parsing (hotfix), pending→delivered→read transition, status_history growth, IST→UTC time parse, meta_message_id capture, dashboard reflects all timestamps.

### CR is closed
No further code work needed for P3.5. Optional owner ops remain available (push to prod, IP allowlist) but are not blocking.

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
- **Content-Type on the wire**: `application/x-www-form-urlencoded` (NOT JSON — confirmed from 5 real callbacks 2026-05-28). Original §9 schema below was post-parse, not wire format.
- **Real wire-format sample** (R689 order 869311, captured 2026-05-28 13:58:06 UTC):
  ```
  Content-Type: application/x-www-form-urlencoded
  X-Forwarded-For: 157.245.105.3,...
  
  mobile=917505242126&status=delivered&logid=20cba66ccf0559840eeefe641beffb5e
  &time=2026-05-28+19%3A28%3A05&channel=wp
  &meta_messageid=wamid.HBgMOTE3NTA1MjQyMTI2FQIAERgSQzM2QUY2RkFGNTY0NDU0RjAzAA%3D%3D
  &type=text&1=abhishek+jain&2=Rs.2%2C181&3=your+order&4=counter&5=Kunafa+Mahal
  ```
- **Post-parse dict** (after URL-decode + form parse):
  ```json
  {
    "logid": "20cba66ccf0559840eeefe641beffb5e",
    "mobile": "917505242126",
    "status": "delivered",                       // also: read, sent, failed, undelivered, rejected
    "time": "2026-05-28 19:28:05",               // IST, no TZ marker
    "channel": "wp",
    "meta_messageid": "wamid.HBgM...==",         // Meta's wamid (raw, not base64-decoded)
    "type": "text",                              // template type echo
    "1": "abhishek jain", "2": "Rs.2,181", ...   // body_values echo (numeric keys)
    "keypress": null,                            // optional, present on button templates
    "button_param_value": "OTE2NTc3"             // optional, present on button templates
  }
  ```
- Parser (`routers/whatsapp.py::message_status_callback`, post-2026-05-28 hotfix):
  1. Reads `Content-Type`; uses `parse_qs` for `application/x-www-form-urlencoded`, `json.loads` for `application/json`, falls back to the other on parse failure.
  2. Single-value form fields flattened; repeated keys preserved as lists.
  3. `logid` extraction defensive across casings (`logid`/`LogID`/`log_id`/`message_id`/`msgId`).
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
- **CR-014 E-Invoice PDF + Mobile HTML Link** — *Phase 0 Discovery complete (2026-05-28) + Profile-page fields appendix added. PARKED awaiting 2 owner confirmations (§15.6 of discovery doc). Auto-generate mobile-friendly HTML invoice (with PDF download) on every POS order, injected into `send_bill` WhatsApp via `einvoice_link` variable. Direct follow-on from CR-004 P3.5.*
- **CR-015 WhatsApp Template Variable Mapping Fidelity** — *Phase 2 Implementation — **Day 3 DONE** (2026-05-29). Day 1: T1 resolver hardening + T5 registry expansion (14 new vars, 2 formatters). Day 2: T3 `build_order_event_context` + 3 pos.py callsites. Day 3: T4 (4 minor callsite enrichments) + T6 (server 422 validation + frontend error surfacing) + T7 (R689 cleanup script, dry-run done). 119/119 tests pass. **T7 commit awaiting owner approval.** Remaining: T7 commit → Day 4 (T2 DB normalization + live integration test) → CR-015 closure.*
- **CR-015a Preview Sample Data Gap** — *Sub-CR of CR-015. Discovery complete (2026-05-29). Template preview shows "NA" for 14 T5 variables because `GET /api/customers/sample-data` only returns original 23 keys. Fix: add 14 keys to backend endpoint + frontend fallback to registry `example` field. ~22 LoC, ~15 min. Awaiting owner approval of fix approach. Doc: `discovery/CR_015A_PREVIEW_SAMPLE_DATA_GAP_DISCOVERY.md`.*
- **CR-016 Dynamic Event Registry + Trigger Configuration UI** — *Phase 0 Discovery complete (2026-05-28 evening). **DEFERRED to next sprint** (owner decision 2026-05-29: "we have almost definate event we used need to ensure they map and fire correctly"). §7 Q1–Q8 still open; rolls over to next sprint. See `DECISIONS_LOG.md` 2026-05-29 entry.*

### CR-014 Resume signal
> "Resume CR-014" → read `memory/crm/crm_roi_sprint/discovery/CR_014_E_INVOICE_PDF_LINK_DISCOVERY.md` end-to-end, ask owner the 2 confirmations in §15.6 of that doc, then write `planning/CR_014_EINVOICE_PHASE_1_PLAN.md`.

### CR-015 Resume signal
> **CR-015 Day 3 is DONE.** Two owner actions needed: (1) say "commit" for T7 R689 cleanup, (2) approve CR-015a fix approach. After both: implement CR-015a (~15 min), run T7 --commit, then Day 4 = T2 (DB normalization) + live integration test → CR-015 closure. See `implementation/CR_015_VARIABLE_MAPPING_FIDELITY_CLOSEOUT.md` and `implementation/CR_015_DAY_3_IMPLEMENTATION_REPORT.md`.

### CR-015a Resume signal
> Approve fix approach per `discovery/CR_015A_PREVIEW_SAMPLE_DATA_GAP_DISCOVERY.md` §5 (Option A+B recommended: backend adds 14 keys + frontend fallback to registry example). Then implement — no frozen spec needed for ~22 LoC.

### CR-016 Resume signal
> "Resume CR-016" → **DEFERRED to next sprint.** When unparked: read `memory/crm/crm_roi_sprint/discovery/CR_016_DYNAMIC_EVENT_REGISTRY_DISCOVERY.md` end-to-end, ask owner the 8 questions in §7 of that doc (Q1–Q8 still open), then write `planning/CR_016_PHASE_1_PLAN.md`.

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

**Current park status**: `cr_004_p3_5_parked_awaiting_option_a_send_side_live_test`

```bash
# 1. Verify services
sudo supervisorctl status
curl -s http://localhost:8001/api/health

# 2. Run the unit tests as a sanity check
cd /app/backend && python -m pytest tests/test_whatsapp_*.py -v

# 3. Read these in order
view_bulk paths:
  /app/memory/PRD.md                                                                          # this file
  /app/memory/crm/crm_roi_sprint/planning/CR_004_PHASE_3_5_MESSAGE_STATUS_PIPELINE_REFACTOR_PLAN.md
  /app/memory/crm/crm_roi_sprint/implementation/CR_004_P3_5_IMPLEMENTATION_CLOSEOUT.md
  /app/memory/crm/crm_roi_sprint/qa/CR_004_PHASE_3_5_PARTIAL_LIVE_TEST_REPORT_2026_05_28.md   # latest live test

# 4. To UNPARK, ask owner: "Option A (route POS to preview) or Option B (push 28-may to prod)?"
#    - Option A: agent fires one synthetic POS order at preview → real WhatsApp → real callback → dashboard
#    - Option B: owner pushes prod → next real POS order naturally exercises new code path

# 5. After unpark validation succeeds, write closure doc:
#    memory/crm/crm_roi_sprint/qa/CR_004_PHASE_3_5_LIVE_TEST_REPORT.md
#    Update register row to: cr004_p3_5_closed_live_test_passed
```

### Option A — synthetic POS order at preview (one-shot E2E)

```bash
# Replace <ts> with epoch seconds; pos_order_id must be unique
curl -X POST "https://crm-variable-mapping.preview.emergentagent.com/api/pos/orders" \
  -H "X-API-Key: dp_live_-sF0sATfNhf72UbrG9BPaKM4icqWnAb7Q4tB6DN3ktE" \
  -H "Content-Type: application/json" \
  -d '{
        "pos_order_id": "E2E_<ts>",
        "customer_phone": "7505242126",
        "customer_country_code": "91",
        "customer_name": "abhishek jain",
        "total": 100,
        "grand_total": 100,
        "order_items": [...],
        "created_at": "2026-05-28T..."
      }'
# (Shape from real POS payload — refer routers/pos.py for the exact contract)

# Then wait ~30s and run the 5-stage trace (see qa/CR_004_PHASE_3_5_PARTIAL_LIVE_TEST_REPORT_2026_05_28.md §3)
```

### What to investigate first if the dashboard still shows Pending forever post-unpark
1. Read `whatsapp_callback_logs` — are inbound webhooks arriving?
   - If no rows: AuthKey URL no longer pointing here (re-confirm with owner).
   - If rows exist with `verdict=rejected_no_logid`: AuthKey changed field name → update parser in `routers/whatsapp.py::message_status_callback`.
   - If rows exist with `verdict=no_matching_row`: send-side `logid` extraction broke OR row was written by old prod code → check whether `whatsapp_message_logs.message_id` is null on the matching send row.
   - If rows exist with `verdict=unknown_status`: extend `status_map` in webhook handler.
2. Read latest `whatsapp_message_logs` row — does it have `message_id` populated?
   - If null: send-side regressed OR is still on old code path; check AuthKey response shape OR confirm POS hits preview, not prod.
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
│       ├── 00_register/ROI_MEASUREMENT_CR_REGISTER.md                    # all CRs status (incl. P3.5 parked)
│       ├── discovery/                                                    # CR discovery docs
│       ├── planning/
│       │   └── CR_004_PHASE_3_5_MESSAGE_STATUS_PIPELINE_REFACTOR_PLAN.md # P3.5 plan
│       ├── implementation/
│       │   ├── CR_004_P3_5_COMMIT_1_AND_2_HANDOVER.md                    # example per-commit handover
│       │   └── CR_004_P3_5_IMPLEMENTATION_CLOSEOUT.md                    # P3.5 closeout + park status (§14)
│       ├── qa/
│       │   ├── CR_004_PHASE_3_5_PARTIAL_LIVE_TEST_REPORT_2026_05_28.md   # PARK ARTIFACT — receive-side ✅, send-side ⏸
│       │   └── (CR_004_PHASE_3_5_LIVE_TEST_REPORT.md to be written after unpark)
│       └── handoff/                                                       # final handoffs
└── Old API doc/                                                           # legacy API docs
```

---

**End of PRD. The next agent should be able to start cold from this single document.**
start cold from this single document.**
