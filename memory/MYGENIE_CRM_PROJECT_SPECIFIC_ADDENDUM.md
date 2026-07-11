# MYGENIE_CRM_PROJECT_SPECIFIC_ADDENDUM.md

> **Version**: Alpha v0.1  
> **Discovery Date**: 2026-06-17  
> **Discovery Agent**: E1 — Emergent Labs  
> **Codebase Branch**: `17-june` (from `Abhi-mygenie/CRMpreprod.git`)

---

## 1. Project Identity

| Field | Value |
|---|---|
| **Product Name** | MyGenie CRM (internally: DinePoints) |
| **Business / Domain** | Restaurant CRM — loyalty, coupons, WhatsApp marketing, POS integration, e-invoicing |
| **Current Stage** | Pre-production (preprod). Live data via remote MongoDB. |
| **Owner / Decision Maker** | Abhishek (alias "owner" in all memory docs) |
| **Current Sprint** | `crm_roi_sprint` — ROI Measurement Sprint |
| **Current Milestone** | CR-024 Phase 1 complete (campaigns). Phases 2-3 (Scheduled/Recurring) next. |
| **Code Repository** | `https://github.com/Abhi-mygenie/CRMpreprod.git` |
| **Primary Branch** | `17-june` (rotates per session: `28-may`, `5-june`, `17-june`, etc.) |

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| **Frontend Framework** | React 19 (CRA via `@craco/craco`) |
| **UI Library** | Tailwind CSS 3.4 + Radix UI primitives (shadcn/ui pattern) + Recharts |
| **Backend Framework** | FastAPI 0.110 (Python 3.11+) |
| **ASGI Server** | Uvicorn 0.25 with hot-reload (WatchFiles) |
| **Database** | MongoDB (remote: `52.66.232.149:27017/mygenie`) via Motor 3.3 (async) |
| **Auth Method** | JWT (PyJWT) + bcrypt password hashing. MyGenie SSO pass-through on login. |
| **Package Manager** | `yarn` (frontend), `pip` (backend) |
| **Hosting / Deployment** | Emergent Preview (Kubernetes pod). Supervisor manages processes. |
| **Test Framework** | `pytest` (backend). No frontend test suite. |
| **Build Tools** | craco (frontend), pip freeze (backend) |
| **Scheduler** | APScheduler (AsyncIOScheduler) — daily loyalty cron + per-minute campaign processor |
| **Process Manager** | `supervisord` (backend on 8001, frontend on 3000, nginx, mongodb, code-server) |

---

## 3. Repository and Important Paths

### Source Code

| Path | Description |
|---|---|
| `/app/` | Repo root |
| `/app/backend/` | FastAPI backend |
| `/app/backend/server.py` | Main FastAPI app entry (lifespan, middleware, router registration) |
| `/app/backend/routers/` | All API route modules (15 routers) |
| `/app/backend/core/` | Business logic modules (auth, coupon, loyalty, whatsapp, scheduler, etc.) |
| `/app/backend/models/schemas.py` | All Pydantic models (1221 lines) |
| `/app/backend/services/` | Service layer (invoice generator, analytics, PDF reports, feedback) |
| `/app/backend/templates/` | Jinja2 HTML invoice templates (food, hotel_room, hotel_folio) |
| `/app/backend/migrations/` | One-off migration scripts |
| `/app/backend/scripts/` | Ad-hoc audit/fix scripts |
| `/app/backend/tests/` | pytest test suites (20 files: coupon QA, whatsapp, campaigns, segments) |
| `/app/frontend/` | React frontend |
| `/app/frontend/src/App.js` | Route definitions (31 routes) |
| `/app/frontend/src/pages/` | 26 page components |
| `/app/frontend/src/components/` | Shared components (UI primitives, customers, templates, WhatsApp) |
| `/app/frontend/src/contexts/AuthContext.jsx` | Auth state, API client, login/logout |
| `/app/frontend/src/lib/constants.js` | Country codes, dietary tags, spice levels, etc. |
| `/app/frontend/src/hooks/use-toast.js` | Toast notification hook |

### Configuration

| Path | Description |
|---|---|
| `/app/backend/.env` | `MONGO_URL`, `DB_NAME`, `CORS_ORIGINS` |
| `/app/frontend/.env` | `REACT_APP_BACKEND_URL`, `WDS_SOCKET_PORT`, `ENABLE_HEALTH_CHECK` |
| `/app/frontend/tailwind.config.js` | Tailwind CSS config |
| `/app/frontend/craco.config.js` | CRA overrides (path aliases, plugins) |
| `/app/frontend/components.json` | shadcn/ui component config |

### Documentation & Memory

| Path | Description |
|---|---|
| `/app/memory/PRD.md` | Product requirements / session log |
| `/app/memory/CR_STATUS_DASHBOARD.md` | Master CR status board (26+ CRs tracked) |
| `/app/memory/BUG_REGISTRY_CAMPAIGNS.md` | Bug tracker (7 bugs, all fixed) |
| `/app/memory/DECISIONS_LOG.md` | Owner-locked decisions (append-only) |
| `/app/memory/IMPL_PLAN_BUG005_006_007.md` | Implementation plan for recent bug fixes |
| `/app/memory/AGENT_PLAYBOOK.md` | Agent operating rules |
| `/app/memory/RUNBOOK.md` | Operational runbook |
| `/app/memory/Old API doc/` | Legacy API documentation (POS, Scan, CRM) |
| `/app/memory/crm/crm_1_0/` | CRM 1.0 baseline docs (analysis, discovery, planning, QA, handoff) |
| `/app/memory/crm/crm_roi_sprint/` | Current sprint docs (discovery, planning, implementation, QA, handoff) |

### Test Reports

| Path | Description |
|---|---|
| `/app/test_reports/` | Test agent output (iteration JSONs) |
| `/app/test_result.md` | Test result summary |
| `/app/backend/tests/` | pytest suites (20 files) |

---

## 4. Environment Setup

### Local Start Commands

```bash
# Backend (managed by supervisor — do not start manually)
sudo supervisorctl start backend     # Uvicorn on 0.0.0.0:8001, hot-reload
sudo supervisorctl start frontend    # CRA dev server on 0.0.0.0:3000

# Restart after .env or dependency changes
sudo supervisorctl restart backend
sudo supervisorctl restart frontend

# Check status
sudo supervisorctl status
```

### Build Commands

```bash
# Frontend
cd /app/frontend && yarn install
cd /app/frontend && yarn build

# Backend
cd /app/backend && pip install -r requirements.txt
```

### Test Commands

```bash
cd /app/backend && pytest tests/ -v
cd /app/backend && pytest tests/test_campaign_jobs.py -v
cd /app/backend && pytest tests/qa_cr001c_c_coupon_v1.py -v
```

### Lint Commands

```bash
# Backend
cd /app/backend && flake8 routers/ core/ services/

# Frontend (via CRA built-in ESLint)
cd /app/frontend && npx eslint src/
```

### URLs

| Environment | URL |
|---|---|
| **Preview (current pod)** | `https://crm-mongo-deploy.preview.emergentagent.com` |
| **MyGenie API (preprod)** | `https://preprod.mygenie.online` |
| **WhatsApp Provider** | `https://console.authkey.io` |

### Required Environment Variables

**Backend (`/app/backend/.env`)**:

| Variable | Purpose | Secret? |
|---|---|---|
| `MONGO_URL` | MongoDB connection string | YES |
| `DB_NAME` | Database name (`mygenie`) | NO |
| `CORS_ORIGINS` | Allowed CORS origins (`*` for preprod) | NO |
| `JWT_SECRET` | JWT signing key (has hardcoded fallback — RISK) | YES |
| `MYGENIE_API_URL` | MyGenie POS API base URL | NO |
| `MYGENIE_LOGIN_ENDPOINT` | MyGenie login path | NO |
| `MYGENIE_PROFILE_ENDPOINT` | MyGenie profile path | NO |
| `CAMPAIGN_SCHEDULER_ENABLED` | Enable campaign auto-firing (`true`/`false`) | NO |
| `CAMPAIGN_TIMEZONE` | Campaign schedule timezone (default: `Asia/Kolkata`) | NO |
| `POS_REQUEST_LOGGING_ENABLED` | Enable POS request logging | NO |
| `REACT_APP_BACKEND_URL` / `CRM_EXTERNAL_URL` | External URL for POS handshake | NO |

**Frontend (`/app/frontend/.env`)**:

| Variable | Purpose | Secret? |
|---|---|---|
| `REACT_APP_BACKEND_URL` | API base URL (used for all `axios` calls) | NO |
| `WDS_SOCKET_PORT` | WebSocket dev server port (`443`) | NO |
| `ENABLE_HEALTH_CHECK` | Enable webpack health-check plugin | NO |

---

## 5. CRM Business Modules

### Module Inventory

| Module | Backend Router | Frontend Page(s) | DB Collections | Status |
|---|---|---|---|---|
| **Auth / Login** | `routers/auth.py` (829 LOC) | `LoginPage`, `RegisterPage`, `ProfilePage` | `users` | Live |
| **Customers** | `routers/customers.py` (1738 LOC) | `CustomersPage`, `CustomerDetailPage`, `CustomerRegistrationPage` | `customers` | Live |
| **Customer Segments** | `routers/customers.py` (segments_router) | `AudiencesPage`, `SegmentsPage` (redirect) | `segments` | Live |
| **Loyalty / Points** | `routers/points.py` (372 LOC), `core/loyalty.py` (509 LOC) | `LoyaltySettingsPage` | `points_transactions`, `loyalty_settings`, `loyalty_mismatch_logs` | Live |
| **Coupons** | `routers/coupons.py` (313 LOC), `core/coupon.py` (2457 LOC) | `CouponsPage`, `CouponV3Preview`, `CouponAnalyticsPage` | `coupons`, `coupon_usage`, `coupon_transactions` | Live |
| **WhatsApp Automation** | `routers/whatsapp.py` (1550 LOC), `core/whatsapp.py` (907 LOC) | `TemplatesPage`, `WhatsAppAutomationContent`, `MessageStatusPage` | `whatsapp_message_logs`, `whatsapp_callback_logs`, `whatsapp_event_template_map`, `whatsapp_template_variable_map`, `custom_templates` | Live |
| **Template Builder** | `routers/whatsapp.py` (Meta API section) | `TemplateBuilderPage` | `custom_templates` | Live |
| **Campaigns** | `routers/campaigns.py` (871 LOC), `core/campaign_jobs.py` (290 LOC) | `CampaignsPage`, `CampaignWizardPage`, `CampaignHistoryPage` | `campaigns`, `campaign_runs`, `campaign_test_sends` | Live (Phase 1; Phase 2-3 pending) |
| **POS Integration** | `routers/pos.py` (2929 LOC) | — (API-only, consumed by MyGenie POS) | `orders`, `order_items` | Live |
| **Feedback** | `routers/feedback.py` (138 LOC), `services/feedback_service.py` | `FeedbackPage` | `feedback` | Live |
| **Analytics** | `routers/analytics.py` (874 LOC), `services/analytics_service.py` (551 LOC) | `DashboardPage`, `ItemAnalyticsPage`, `CustomerLifecyclePage` | Aggregates from `orders`, `customers`, `order_items` | Live |
| **Invoices** | `routers/invoices.py`, `services/invoice_generator.py` (718 LOC) | — (public HTML/PDF endpoints) | `invoices` | Live |
| **Wallet** | `routers/wallet.py` (122 LOC) | `WalletPage` | `wallet_transactions` | Placeholder (0 tenants active) |
| **Menu** | `routers/menu.py` (97 LOC) | — (POS API) | — (proxies MyGenie API) | Live |
| **Cross-Sell / Suggestions** | `routers/suggestions.py` (158 LOC) | — (POS API) | `orders`, `order_items` | Live |
| **Scan & Order** | `routers/scan.py` (878 LOC) | — (customer-facing QR) | `customer_otps`, `customer_app_config` | Live |
| **Migration** | `routers/migration.py` (872 LOC) | `MigrationPage` | `migration_sync_logs` | Live |
| **QR Code** | — (frontend-only) | `QRCodePage` | — | Live |
| **Settings** | — (profile/settings in auth router) | `SettingsPage` | `users` | Live |
| **Scheduler (Cron)** | `routers/cron.py`, `core/scheduler.py`, `core/loyalty_jobs.py` | — (admin API) | `cron_job_logs` | Live |

---

## 6. Business-Critical Flows

### 6.1 POS Order Ingestion

**Why Critical**: This is the lifeblood of the CRM. Every restaurant order comes through `/api/pos/orders`. It triggers loyalty point calculation, tier updates, coupon application, WhatsApp sends, and invoice generation.

**What Breaks**: If this fails, customers don't earn points, tiers don't update, coupons aren't recorded, WhatsApp bills aren't sent, and the CRM's data is stale.

**Minimum Regression**: 
- POST `/api/pos/orders` with a valid payload → 200
- Points calculated correctly (base + off-peak)
- Customer `total_points`, `total_spent`, `total_visits` incremented
- `send_bill` WhatsApp event fires if mapped
- Coupon usage recorded if `coupon_code` present

### 6.2 Coupon Create → Validate → Apply → Record

**Why Critical**: Coupons are revenue instruments. Wrong discount math = direct financial loss. BOGO/BXG/Nth-item logic is deeply complex (2457 LOC in `core/coupon.py`).

**What Breaks**: Over-discount loses money. Under-discount loses customers. Idempotency failure allows double redemption.

**Minimum Regression**:
- V1 (flat/percentage): `compute_coupon_discount` matches expected
- V2 (item/category scope): eligible_food_ids filtering works
- V3-B (BOGO/BXG): distribute-first selection, same_item_required toggle
- V3-C (Every-Nth): nth_item_number detection
- `/pos/coupons/validate` → `/pos/coupons/apply` → final order recording
- Idempotency: same `(user_id, order_id)` → no duplicate `coupon_usage`

### 6.3 Loyalty Points Earn / Redeem

**Why Critical**: Points are a liability on the restaurant's books. Incorrect earn or redeem = financial discrepancy.

**What Breaks**: Wrong tier assignment, wrong earn percentage, double-redeem, negative balances.

**Minimum Regression**:
- `calculate_points(amount, customer, settings)` returns correct base + off-peak
- `calculate_tier(total_points, settings)` returns correct tier name
- `compute_max_redeemable` respects per-transaction limits
- `redeem_loyalty_points` decrements and logs transaction
- Points transactions have unique IDs

### 6.4 WhatsApp Template Variable Resolution & Send

**Why Critical**: WhatsApp messages are the restaurant's communication channel. Wrong variable resolution → blank messages → Meta rejects → zero delivery.

**What Breaks**: Variables resolve to empty string, template IDs mismatch, AuthKey API failures, callback webhook misparse.

**Minimum Regression**:
- `resolve_variable()` for all 41 registered variables returns non-empty for in-scope events
- `build_body_values()` correctly maps template slots
- `send_bulk_messages()` → AuthKey API → success response
- Status callback updates `whatsapp_message_logs` status
- `menu_pick_resolved` populates for menu variables

### 6.5 Campaign Send (Broadcast)

**Why Critical**: Campaigns send bulk WhatsApp messages to customer segments. A bug can blast wrong messages to thousands of customers.

**What Breaks**: Wrong audience targeting, empty variables, duplicate sends, exceeded daily limit, scheduling failures.

**Minimum Regression**:
- Audience resolution (segment or all-customers) returns correct phones
- Opt-out filtering excludes opted-out customers
- Daily limit (1000/day) is enforced
- `_execute_campaign_send()` resolves all variables and sends
- `whatsapp_message_logs` records every attempt with correct `campaign_id`
- Campaign status transitions: draft → scheduled → active → completed

### 6.6 Customer Create / Update

**Why Critical**: Customer identity is the CRM's anchor. Duplicate or corrupted customer records break loyalty, coupons, WhatsApp, and analytics.

**What Breaks**: Duplicate phone numbers, missing merge on POS sync, wrong tier assignment.

**Minimum Regression**:
- Unique constraint on `(user_id, phone)` — POS create with existing phone merges
- Customer update preserves existing loyalty data
- QR registration creates customer and links to restaurant

### 6.7 Invoice Generation

**Why Critical**: E-invoices are legal documents. GST calculation errors = tax compliance violations.

**What Breaks**: Wrong tax amounts, missing items, PDF rendering failures, token uniqueness violation.

**Minimum Regression**:
- Food invoice: items + CGST/SGST/VAT calculated correctly
- Hotel folio: room charges + F&B grouped by day
- Public URL `/api/invoices/{token}` returns HTML
- `/api/invoices/{token}/pdf` returns downloadable PDF
- Deduplication: same `(user_id, restaurant_order_id)` → same invoice

### 6.8 Analytics / Dashboard Totals

**Why Critical**: Owner decisions are based on dashboard numbers. Wrong totals = wrong business decisions.

**What Breaks**: Aggregate pipeline errors, timezone mismatches, stale caches.

**Minimum Regression**:
- Dashboard stats match manual count of `customers`, `orders`, `points_transactions`
- Revenue totals match sum of `orders.total_amount`
- Customer lifecycle stages count correctly

---

## 7. High-Risk Files / Modules

| File | LOC | Why Risky | What Depends On It | Regression If Touched |
|---|---|---|---|---|
| `core/coupon.py` | 2457 | Complex discount math (V1/V2/V3-B/V3-C). Financial impact. | POS validate, apply, record; Coupons API; campaigns | Run ALL `qa_cr001c_*` + `qa_cr021_*` tests (142+) |
| `routers/pos.py` | 2929 | POS is the external-facing API consumed by MyGenie POS. Any change can break real orders. | All POS operations, loyalty, coupons, WhatsApp triggers, invoices | Full POS order flow test + coupon validate/apply |
| `core/whatsapp.py` | 907 | WhatsApp variable resolution, bulk send, message logging. | All WhatsApp sends (automation + campaigns + test sends) | `test_whatsapp_*` suites + manual send test |
| `routers/whatsapp.py` | 1550 | AuthKey integration, Meta template submission, message logs/filters, status callback webhook | Templates page, Message Status, Automation, Campaigns | Template list + message filter + webhook parsing |
| `core/loyalty.py` | 509 | Points calculation, tier assignment. Financial impact. | POS order processing, points router, loyalty settings | Parity QA harness, manual tier boundary checks |
| `routers/auth.py` | 829 | Login flow (MyGenie SSO pass-through), CRM token push to POS, profile expansion | All authenticated endpoints, POS handshake | Login + /me + profile fields present |
| `models/schemas.py` | 1221 | All Pydantic models. Change breaks serialization/validation everywhere. | Every router and core module | Full test suite |
| `core/campaign_jobs.py` | 290 | Scheduled campaign execution. Atomic claim pattern. | Campaign scheduler | `test_campaign_jobs.py` + manual schedule fire |
| `services/invoice_generator.py` | 718 | Invoice rendering (3 modes: food, hotel_room, hotel_folio). GST math. | Invoice routes, POS send_bill hook | Test all 3 invoice modes with real data |

---

## 8. API / Backend Contracts

### Base URLs

| Context | URL |
|---|---|
| Internal (pod) | `http://0.0.0.0:8001/api` |
| External (preview) | `https://crm-mongo-deploy.preview.emergentagent.com/api` |
| MyGenie POS API | `https://preprod.mygenie.online/api/v1` |
| AuthKey WhatsApp API | `https://console.authkey.io/restapi` |

### Auth Headers

| Endpoint Type | Auth Header |
|---|---|
| Staff CRM endpoints | `Authorization: Bearer <JWT>` (type=staff) |
| Customer scan endpoints | `Authorization: Bearer <JWT>` (type=customer) |
| POS webhook endpoints | `X-API-Key: <api_key>` (from `users.api_key`) |
| AuthKey callback webhook | No auth (public endpoint: `/api/whatsapp/status-callback`) |

### Key Endpoint Groups

**Auth**: `POST /api/auth/login`, `POST /api/auth/register`, `GET /api/auth/me`, `POST /api/auth/mygenie-login`

**Customers**: `GET /api/customers`, `GET /api/customers/:id`, `PUT /api/customers/:id`, `GET /api/customers/segments/stats`, `GET /api/customers/sample-data`

**Segments**: `GET /api/segments`, `POST /api/segments`, `PUT /api/segments/:id`, `DELETE /api/segments/:id`

**Points**: `POST /api/points/award`, `POST /api/points/redeem`, `GET /api/loyalty/settings`, `PUT /api/loyalty/settings`

**Coupons**: `GET /api/coupons`, `POST /api/coupons`, `PUT /api/coupons/:id`, `DELETE /api/coupons/:id`

**WhatsApp**: `GET /api/whatsapp/authkey-templates`, `GET /api/whatsapp/variables`, `GET /api/whatsapp/template-variable-map`, `POST /api/whatsapp/template-variable-map`, `GET /api/whatsapp/event-template-map`, `POST /api/whatsapp/event-template-map/:event_key`, `GET /api/whatsapp/message-logs`, `GET /api/whatsapp/message-stats`, `GET /api/whatsapp/message-filters`, `POST /api/whatsapp/resend`, `POST /api/whatsapp/status-callback`

**Campaigns**: `GET /api/campaigns`, `POST /api/campaigns`, `GET /api/campaigns/:id`, `PUT /api/campaigns/:id`, `DELETE /api/campaigns/:id`, `POST /api/campaigns/:id/send`, `POST /api/campaigns/:id/test-send`, `POST /api/campaigns/:id/pause`, `POST /api/campaigns/:id/resume`, `POST /api/campaigns/:id/clone`, `GET /api/campaigns/daily-limit`, `GET /api/campaigns/history/all`

**POS Gateway**: `POST /api/pos/orders`, `POST /api/pos/customer-lookup`, `POST /api/pos/customers`, `GET /api/pos/customers/:id`, `GET /api/pos/max-redeemable`, `POST /api/pos/coupons/validate`, `POST /api/pos/coupons/apply`, `GET /api/pos/menu/:restaurant_id`

**Invoices**: `GET /api/invoices/:token` (public HTML), `GET /api/invoices/:token/pdf` (public PDF)

**Analytics**: `GET /api/analytics/dashboard`, `GET /api/analytics/lifecycle`, `GET /api/analytics/items`

### Known Backend Quirks

1. **MyGenie SSO pass-through**: `/api/auth/login` delegates to MyGenie preprod API. If MyGenie API is down, CRM login fails entirely.
2. **JWT_SECRET has hardcoded fallback**: `os.environ.get('JWT_SECRET', 'dinepoints-secret-key-2024')` — security risk in production.
3. **POS auth uses `X-API-Key` header** (not JWT): verified via `verify_pos_auth()` function.
4. **AuthKey callback is public**: `/api/whatsapp/status-callback` has no authentication — webhook verification is dormant (HMAC verification code exists but `AUTHKEY_WEBHOOK_SECRET` env var not set).
5. **`$or` query pattern in message-logs**: Uses `$and` wrapping for search + campaign_id `$or` to avoid MongoDB query conflict.
6. **Campaign `campaign_id` vs `reference_id`**: After BUG-006 fix, new logs have `campaign_id=campaign.id`, old logs have `campaign_id=run_id` and `reference_id=campaign.id`. Filter uses `$or` on both fields.

### Legacy Fields (Do Not Casually "Fix")

- `users.api_key` — POS integration depends on this exact key
- `customers.pos_id` / `customers.restaurant_id` — POS identity linkage
- `whatsapp_message_logs.campaign_id` — mixed semantics (see BUG-006)
- `coupon_usage` idempotency on `(user_id, order_id)` — changing breaks double-redemption guard

---

## 9. Data, Storage, and Runtime Rules

### MongoDB Collections (31 total)

| Collection | Purpose |
|---|---|
| `users` | Restaurant owner/staff accounts |
| `customers` | Customer profiles (per-restaurant) |
| `orders` | POS orders (webhooks from MyGenie) |
| `order_items` | Line items per order |
| `points_transactions` | Loyalty point earn/redeem ledger |
| `loyalty_settings` | Per-restaurant loyalty configuration |
| `loyalty_mismatch_logs` | CRM vs POS loyalty drift audit |
| `coupons` | Coupon definitions |
| `coupon_usage` | Coupon redemption records (idempotent) |
| `coupon_transactions` | Coupon usage audit trail |
| `whatsapp_message_logs` | Every WhatsApp send attempt + delivery status |
| `whatsapp_callback_logs` | Raw AuthKey webhook payloads (audit) |
| `whatsapp_event_template_map` | Event → template bindings |
| `whatsapp_template_variable_map` | Template → variable mappings + modes |
| `custom_templates` | User-created WhatsApp templates (local draft → Meta submission) |
| `campaigns` | Campaign definitions + state machine |
| `campaign_runs` | Campaign execution runs (per-send) |
| `campaign_test_sends` | Test send audit |
| `segments` | Customer segment definitions (filter rules) |
| `segment_whatsapp_config` | Per-segment WhatsApp settings |
| `feedback` | Customer feedback submissions |
| `invoices` | Generated invoice records (token-indexed) |
| `wallet_transactions` | Wallet credit/debit ledger (placeholder) |
| `migration_sync_logs` | POS data migration sync logs |
| `cron_job_logs` | Scheduler execution logs |
| `pos_request_logs` | POS request audit (when logging enabled) |
| `pos_event_logs` | POS event trigger logs |
| `message_logs` | Legacy message log (pre-CR-004) |
| `customer_otps` | OTP codes for scan-and-order |
| `customer_app_config` | Customer-facing app configuration |
| `dietary_tags_mapping` | Item dietary tag mappings |
| `otp_tokens` | Password reset OTP tokens |

### localStorage Keys (Frontend)

| Key | Purpose |
|---|---|
| `token` | JWT access token |
| `remembered_email` | "Remember me" email |
| `remembered_password` | "Remember me" password (⚠️ stored in plain text) |
| `mg_variable_picker_recent` | Recently used template variables |

### sessionStorage Keys (Frontend)

| Key | Purpose |
|---|---|
| `mygenie_token` | MyGenie SSO token (cleared on tab close) |

### Role / Permission Model

| Role | Auth Mechanism | Scope |
|---|---|---|
| Restaurant Staff | JWT (type=staff) | All CRM endpoints for their `user_id` |
| Customer | JWT (type=customer) | Scan-and-order endpoints only |
| POS System | API Key (`X-API-Key`) | POS gateway endpoints only |
| Public | None | Invoice HTML/PDF, AuthKey webhook, customer registration |

**Note**: There is no admin/super-admin role. All staff users have full access to their own restaurant's data. Multi-tenancy is enforced by `user_id` filtering on every query.

---

## 10. Integrations

### 10.1 MyGenie POS

| Field | Value |
|---|---|
| **Direction** | Bidirectional |
| **Protocol** | REST API over HTTPS |
| **Base URL** | `https://preprod.mygenie.online/api/v1` |
| **Auth (CRM → POS)** | Bearer token (MyGenie token from login) |
| **Auth (POS → CRM)** | `X-API-Key` header (CRM-generated `api_key`) |
| **Key Endpoints** | Login, profile, restaurant menu, CRM token push |
| **Webhook from POS** | `POST /api/pos/orders` (order placement) |
| **Data Synced** | Orders, order items, customer lookup/create, loyalty, coupons |

### 10.2 AuthKey.io (WhatsApp)

| Field | Value |
|---|---|
| **Direction** | Bidirectional |
| **Protocol** | REST API (send) + Webhook (delivery status) |
| **Base URL** | `https://console.authkey.io/restapi` |
| **Auth** | Per-tenant API key stored in `users.authkey_api_key` |
| **Send Endpoint** | `sendBulkSMS.php` (despite name, sends WhatsApp) |
| **Template List** | `getAllTemplate.php` |
| **Meta Template Submit** | Custom templates via Meta WhatsApp Business API v21 |
| **Callback Webhook** | `POST /api/whatsapp/status-callback` (public, no auth) |
| **Status Flow** | pending → delivered → read (or → rejected) |

### 10.3 Meta WhatsApp Business API

| Field | Value |
|---|---|
| **Direction** | Outbound only (via AuthKey) |
| **Protocol** | REST API v21.0 |
| **Purpose** | Template submission, approval status check |
| **Auth** | `WABA_ID` + `ACCESS_TOKEN` (stored per-user or env) |

### 10.4 No Other Active Integrations

- **Payment Gateway**: None active (Stripe library installed but unused)
- **Email/SMS**: None
- **Cloud Storage**: boto3 installed but no active S3 usage found
- **Export/Reporting**: PDF via WeasyPrint (server-side), no external reporting tool

---

## 11. Testing Accounts / Aliases

| Alias | Role / Use Case | Environment | Credentials Location |
|---|---|---|---|
| `owner@kunafamahal.com` | Kunafa Mahal restaurant (primary test tenant) | Preprod | `memory/CR_STATUS_DASHBOARD.md` |
| `owner@palmhouse.com` | Palm House hotel (hotel folio testing) | Preprod | `memory/CR_STATUS_DASHBOARD.md` |
| `mygeniedev` | MyGenie Dev restaurant (developer test tenant) | Preprod | Owner-managed |
| `test-recipient` | Synthetic test customer for campaign test-sends | In-memory only | N/A |

**Note**: Actual passwords are documented in `memory/CR_STATUS_DASHBOARD.md` handover section. Do NOT print here.

---

## 12. Registry / Tracking Rules

### Bug Tracker

| Field | Value |
|---|---|
| **Path** | `/app/memory/BUG_REGISTRY_CAMPAIGNS.md` |
| **ID Format** | `BUG-NNN` (sequential) |
| **Status Values** | `🔴 OPEN`, `✅ FIXED` |
| **Current Range** | BUG-001 through BUG-007 (all FIXED) |

### CR (Change Request) Tracker

| Field | Value |
|---|---|
| **Path** | `/app/memory/CR_STATUS_DASHBOARD.md` |
| **ID Format** | `CR-NNN` (sequential from CR-002) |
| **Status Values** | 🟢 Closed, 🟡 In flight, 🔵 Planning approved, ⏸ Parked, 🔴 Blocked, 📋 Registered, ❌ Cancelled |
| **Current Range** | CR-002 through CR-026 |
| **How to Update** | Edit row's Phase/Status/Last touched → Append to "Recent transitions" |

### Decisions Log

| Field | Value |
|---|---|
| **Path** | `/app/memory/DECISIONS_LOG.md` |
| **Format** | `### YYYY-MM-DD [CR-XXX] §<section> — <short title>` |
| **Rules** | Append-only. Never edit historical rows. Reversals add new row referencing old. |

### Handover Format

Handover notes live in `/app/memory/crm/crm_roi_sprint/handoff/`. Each session produces a handover doc with:
- Current state summary
- What was done
- What's next
- Test credentials
- DO NOT list

---

## 13. Release and Deployment Rules

### Branching Model

- Branch per session: `28-may`, `5-june`, `17-june`, etc.
- No formal `main`/`develop` model
- GitHub pushes via "Save to Github" feature in Emergent platform

### Deployment Process

- Preview pod auto-deploys on code change (hot reload)
- Production deployment: **UNKNOWN** — no production deployment docs found
- Supervisor manages all processes inside the pod

### Build Process

- Frontend: `yarn install` → `craco start` (dev) or `craco build` (prod)
- Backend: `pip install -r requirements.txt` → Uvicorn via supervisor

### Production Checklist

**UNKNOWN** — No formal production checklist found. Recommended:
- [ ] Set `JWT_SECRET` to proper secret (remove hardcoded fallback)
- [ ] Set `AUTHKEY_WEBHOOK_SECRET` for callback verification
- [ ] Set `CAMPAIGN_SCHEDULER_ENABLED=true` for scheduled campaigns
- [ ] Disable `CORS_ORIGINS=*` — whitelist specific domains
- [ ] Remove `remembered_password` from localStorage (plaintext risk)

### Rollback Process

- Emergent platform provides free rollback to any previous checkpoint
- Do NOT use `git reset` — use the platform's rollback feature

### Post-Deploy Smoke Tests

- `GET /api/health` → `{"status": "healthy"}`
- `POST /api/auth/login` with test credentials → JWT returned
- `GET /api/customers` → customer list (auth required)
- `GET /api/whatsapp/authkey-templates` → template list (auth required)
- `GET /api/campaigns` → campaign list (auth required)

---

## 14. Project-Specific Do Not Do Rules

| Rule | Reason |
|---|---|
| **Do NOT change coupon discount math** (`core/coupon.py`) without owner approval and full QA suite run | Financial impact — direct money |
| **Do NOT change loyalty point calculation** (`core/loyalty.py`, `core/helpers.py`) without owner approval | Points are a liability on restaurant books |
| **Do NOT change POS order ingestion** (`routers/pos.py` order webhook) without owner approval | Breaks real-time restaurant operations |
| **Do NOT change WhatsApp send/resend logic** (`core/whatsapp.py send_bulk_messages`) without testing | Can blast messages to real customers |
| **Do NOT change customer identity/merge rules** (`routers/pos.py` customer create/lookup) | Duplicate or lost customer data |
| **Do NOT change report/analytics totals** (`services/analytics_service.py`) without verification | Owner makes business decisions on these numbers |
| **Do NOT change auth/login flow** (`routers/auth.py`, MyGenie SSO) without testing | Locks out all users |
| **Do NOT expose API keys or secrets** in code, logs, or responses | Security breach |
| **Do NOT run `testing_agent_v3`** for this sprint | Owner explicitly opted out (DECISIONS_LOG) |
| **Do NOT send live WhatsApp messages** without explicit owner approval | Messages go to real customers' phones |
| **Do NOT re-introduce demo login** | Removed in CR-015c per owner decision |
| **Do NOT delete or reset `.git` or `.emergent` folders** | Required for platform functionality |
| **Do NOT use `npm`** — use `yarn` only for frontend | npm causes breaking dependency changes |

---

## 15. Open Questions / Unknowns

| # | Area | Question | Why It Matters |
|---|---|---|---|
| 1 | **Production Deployment** | What is the production URL and deployment pipeline? No production deployment docs found. | UNKNOWN — cannot confirm if code is deployed to prod or how. |
| 2 | **JWT_SECRET** | Is there a proper JWT_SECRET set in production? Current code has a hardcoded fallback `dinepoints-secret-key-2024`. | UNKNOWN — security risk if fallback is used in prod. |
| 3 | **AuthKey Webhook Secret** | Is `AUTHKEY_WEBHOOK_SECRET` set in any environment? Webhook HMAC verification is coded but dormant. | UNKNOWN — webhook endpoint is currently unauthenticated. |
| 4 | **CAMPAIGN_SCHEDULER_ENABLED** | Is this flag set to `true` in any environment? Campaign auto-firing won't work without it. | UNKNOWN — Phase 2-3 depends on this. Owner must confirm. |
| 5 | **localStorage password storage** | `LoginPage.jsx` stores `remembered_password` in plaintext localStorage. Is this intentional? | UNKNOWN — security risk. Owner should confirm or approve fix. |
| 6 | **Multi-tenant isolation** | All tenant isolation is via `user_id` filter on queries. Are there any shared/global collections? | UNKNOWN — `dietary_tags_mapping` and `customer_app_config` may be shared. Owner must confirm. |
| 7 | **Wallet module** | Discovery doc (CR-025) found 0 active tenants and 12 gaps. 10 owner questions (Q1-Q10) are pending. | UNKNOWN — module exists as placeholder, not ready for use. |
| 8 | **Stripe integration** | `stripe==14.4.0` is in requirements.txt but no Stripe code was found in routers/core. Is payment gateway planned? | UNKNOWN — installed but unused. |
| 9 | **Capacitor mobile** | Frontend `package.json` includes `@capacitor/android`, `@capacitor/ios`, etc. Is a mobile app build planned? | UNKNOWN — dependencies present but no Capacitor config found. |
| 10 | **Production MongoDB** | Is `52.66.232.149:27017/mygenie` the production database or a separate preprod instance? | UNKNOWN — critical to confirm before any destructive operations. |

---

## Appendix: File Size Ranking (Top 15)

| File | Lines |
|---|---|
| `routers/pos.py` | 2,929 |
| `core/coupon.py` | 2,457 |
| `routers/customers.py` | 1,738 |
| `routers/whatsapp.py` | 1,550 |
| `models/schemas.py` | 1,221 |
| `core/whatsapp.py` | 907 |
| `routers/scan.py` | 878 |
| `routers/analytics.py` | 874 |
| `routers/migration.py` | 872 |
| `routers/campaigns.py` | 871 |
| `routers/auth.py` | 829 |
| `services/invoice_generator.py` | 718 |
| `core/whatsapp_variables.py` | 636 |
| `services/analytics_service.py` | 551 |
| `core/loyalty.py` | 509 |
| **Total backend** | **21,749** |
