# MyGenie CRM — Architecture

> **Version**: 1.1 (2026-07-06 · Sprint 10 closure baseline + consolidated data-flow views)
> **Scope**: Full-stack architecture + primary data flows for the CRM Preprod deployment
> **Related docs**: `/app/memory/PRD.md`, `/app/memory/CR_STATUS_DASHBOARD.md`, `/app/memory/crm/crm_roi_sprint/handoff/SESSION_2026_07_06_SPRINT_CLOSURE.md`
> **Rendered visuals**: `<preview-url>/docs/architecture.html` (§1–6) · `<preview-url>/docs/dataflow.html` (§10–12)

---

## 1 · High-level system architecture

```mermaid
flowchart LR
    subgraph Client["Web + Mobile Clients"]
        Browser["Browser (React SPA)"]
        Capacitor["Capacitor Mobile Shell (iOS / Android)"]
    end

    subgraph Edge["Emergent Kubernetes Ingress"]
        Ingress["nginx / K8s ingress<br/>/api → backend:8001<br/>rest → frontend:3000"]
    end

    subgraph FE["Frontend Pod"]
        React["React (CRACO) + Tailwind + shadcn"]
        RQuery["react-query / fetch"]
    end

    subgraph BE["Backend Pod — FastAPI"]
        Uvicorn["Uvicorn (0.0.0.0:8001)"]
        Server["server.py"]
        subgraph Routers
            R_Auth["routers/auth.py"]
            R_Cust["routers/customers.py<br/>(2200+ LOC — refactor pending)"]
            R_Camp["routers/campaigns.py"]
            R_WA["routers/whatsapp.py<br/>(HOTSPOT, ~4k LOC)"]
            R_POS["routers/pos.py"]
            R_Inv["routers/invoices.py"]
            R_Others["analytics · coupons · feedback · loyalty · menu · points · scan · suggestions · wallet · migration · cron"]
        end
        subgraph Core["core/"]
            C_Helpers["helpers.py<br/>(build_customer_query)"]
            C_Sched["scheduler.py<br/>(APScheduler)"]
            C_Jobs["campaign_jobs.py<br/>(process_due_campaigns)"]
            C_WA["whatsapp.py<br/>(send_bulk_messages)"]
            C_S3["s3.py<br/>(bill logos + invoices)"]
            C_Loyalty["loyalty.py + loyalty_jobs.py"]
            C_Auth["auth.py (JWT + MyGenie SSO helper)"]
        end
        subgraph Services["services/"]
            S_Invoice["invoice_generator.py<br/>(WeasyPrint + Jinja2)"]
            S_Analytics["analytics_service.py"]
            S_Feedback["feedback_service.py"]
            S_PDFRep["pdf_report.py"]
        end
    end

    subgraph Data["Data Layer"]
        Mongo[("MongoDB<br/>52.66.232.149:27017/mygenie<br/>29 collections · 5,971 customers")]
        S3[("AWS S3 mygenie-prod<br/>ap-south-1<br/>bill-logos/ + invoices/")]
    end

    subgraph External["External Services"]
        MyGenie["MyGenie Preprod<br/>preprod.mygenie.online<br/>(SSO + POS)"]
        AuthKey["AuthKey.io<br/>WhatsApp API + templates"]
        Meta["Meta Graph API v21<br/>(status check + /uploads)"]
        Fresh["Freshmarketer<br/>(inbound webhook)"]
    end

    Browser --> Ingress
    Capacitor --> Ingress
    Ingress -->|/*| React
    Ingress -->|/api/*| Uvicorn

    React <--> RQuery
    RQuery -->|REACT_APP_BACKEND_URL/api/*| Ingress

    Uvicorn --> Server
    Server --> R_Auth
    Server --> R_Cust
    Server --> R_Camp
    Server --> R_WA
    Server --> R_POS
    Server --> R_Inv
    Server --> R_Others

    R_Auth --> C_Auth
    R_Cust --> C_Helpers
    R_Camp --> C_Helpers
    R_Camp --> C_Jobs
    R_WA --> C_WA
    R_Inv --> S_Invoice

    C_Sched -.schedules.-> C_Jobs
    C_Jobs --> C_WA
    C_WA --> AuthKey

    R_Auth <--> MyGenie
    R_POS <--> MyGenie
    C_WA <--> AuthKey
    R_WA <--> Meta
    R_WA <--- Fresh

    S_Invoice --> C_S3
    R_Auth --> C_S3
    C_S3 --> S3

    R_Auth --> Mongo
    R_Cust --> Mongo
    R_Camp --> Mongo
    R_WA --> Mongo
    R_POS --> Mongo
    R_Inv --> Mongo
    R_Others --> Mongo
    C_Jobs --> Mongo
    C_Loyalty --> Mongo
```

**Component notes**

- **Frontend (React SPA)** — CRACO build, Tailwind + shadcn UI, Capacitor mobile shell. All API calls go through `REACT_APP_BACKEND_URL` — never localhost.
- **Backend (FastAPI + Motor)** — single Uvicorn process on `:8001`. `server.py` mounts every router under `/api/*`. Motor is the async MongoDB driver. APScheduler runs two jobs: `Daily Loyalty Jobs` @ 00:00 UTC and `Process Due Campaigns` @ every minute (gated by `CAMPAIGN_SCHEDULER_ENABLED`).
- **MongoDB** — 29 preprod collections including `users` (tenants), `customers`, `campaigns`, `campaign_runs`, `whatsapp_message_logs`, `whatsapp_callback_logs`, `custom_templates`, `coupons`, `invoices`, `webhook_logs`.
- **AWS S3** — object storage for bill logos and rendered invoice HTML/PDF (CR-036 Batch A). Falls back to local disk if `S3_CONFIGURED=False`.
- **External integrations** — MyGenie POS/SSO, AuthKey (WhatsApp send + templates), Meta Graph API v21 (status + `/uploads` handle), Freshmarketer (webhook trigger).

---

## 2 · Authentication & session flow

```mermaid
sequenceDiagram
    autonumber
    actor U as Owner (Browser)
    participant FE as React (LoginPage)
    participant BE as FastAPI /api/auth/login
    participant MG as MyGenie preprod
    participant DB as MongoDB users
    participant POS as MyGenie POS

    U->>FE: email + password
    FE->>BE: POST /api/auth/login
    BE->>MG: POST /api/v1/auth/vendoremployee/login
    MG-->>BE: {mygenie_token, restaurant_id}
    BE->>MG: GET /api/v1/vendoremployee/profile
    MG-->>BE: {restaurant profile + POS config}
    BE->>DB: upsert users doc (idempotent)
    alt crm_token_registered_with_pos = false
        BE->>POS: POST /api/v1/crm_token (register api_key)
        POS-->>BE: 200 / 409 (idempotent)
        BE->>DB: set crm_token_registered_with_pos=true
    end
    BE-->>FE: {access_token (JWT 24h), user, pos_config, mygenie_token}
    FE->>FE: store JWT in memory + localStorage
    FE-->>U: redirect to /dashboard
```

**Notes** — `_register_crm_token_with_pos()` was fixed in CR-028+BUG-008 to skip on subsequent logins. JWT_SECRET is per-deployment; sessions are stateless.

---

## 3 · Campaign send data flow (CR-024 + CR-039)

```mermaid
sequenceDiagram
    autonumber
    actor U as Owner
    participant FE as CampaignsPage
    participant BE as routers/campaigns.py
    participant Helpers as core/helpers.py<br/>(build_customer_query)
    participant DB as MongoDB
    participant Sched as APScheduler<br/>(process_due_campaigns @1m)
    participant Send as core/whatsapp.py<br/>(send_bulk_messages)
    participant AK as AuthKey API
    participant WA as WhatsApp
    participant Cb as /api/whatsapp/callback

    U->>FE: create campaign (audience + template + schedule)
    FE->>BE: POST /api/campaigns
    BE->>Helpers: resolve audience filter → customer_ids
    Helpers->>DB: filtered find on customers
    BE->>DB: insert campaigns + campaign_runs
    BE-->>FE: 201 Created

    loop every minute (if enabled)
        Sched->>BE: process_due_campaigns()
        BE->>DB: find due campaigns (atomic claim)
        BE->>Send: batch send
        Send->>AK: POST bulkSMS (per recipient)
        AK-->>Send: LogID (may DUPLICATE across recipients)
        Send->>DB: insert N whatsapp_message_logs rows (composite key: message_id + customer_phone)
        AK->>WA: dispatch
    end

    WA-->>AK: delivery status
    AK->>Cb: webhook {logid, mobile, status}
    Cb->>DB: find_one({message_id: logid, customer_phone: mobile})
    Note over Cb,DB: CR-039 fix: composite lookup<br/>(was silently updating row 1 of N)
    Cb->>DB: update status/timestamp<br/>gated behind state machine (CR-041)
```

**Key defensive properties**
- CR-039 composite `(message_id, customer_phone)` webhook lookup with `verdict="ambiguous_row"` skip on persistent mismatch.
- CR-041 timestamp block now AFTER state-machine gate (no overwrite on `transition_ignored`).
- `max_instances=1 + coalesce + 15 s httpx timeouts + atomic claim` — scheduler cannot hang the server.

---

## 4 · WhatsApp template lifecycle (CR-023 + CR-037)

```mermaid
sequenceDiagram
    autonumber
    actor U as Owner
    participant FE as TemplateBuilderPage
    participant BE as routers/whatsapp.py
    participant DB as MongoDB custom_templates
    participant Meta as Meta Graph v21
    participant AK as AuthKey (migrate + list)

    U->>FE: build template (body + variables + header)
    FE->>BE: POST /api/whatsapp/custom-templates
    BE->>DB: insert (status="draft")
    U->>FE: Submit to Meta
    FE->>BE: POST /api/whatsapp/custom-templates/{id}/submit
    BE->>Meta: create WA message template
    Meta-->>BE: {template_id, status="PENDING"}
    BE->>DB: status="pending"

    Note over Meta: async review (mins to hrs)

    U->>FE: click "Refresh status"
    FE->>BE: GET /api/whatsapp/check-template-status/{id}
    BE->>Meta: GET template status
    Meta-->>BE: "APPROVED" | "REJECTED"
    BE->>DB: status="approved" | "rejected"

    U->>FE: click "Sync with AuthKey"
    FE->>BE: POST /api/whatsapp/authkey/sync-templates
    BE->>AK: POST wptemplateMigration
    BE->>AK: GET getAllTemplate
    AK-->>BE: [{template_name, wid}]
    BE->>DB: find user's custom_templates (projection includes status — CR-037 fix)
    loop for each local template
        BE->>DB: if current_status != "rejected" → set status="approved" + authkey_wid<br/>else → set authkey_wid only (preserve rejected)
    end
    Note over BE,DB: CR-037: rejected templates keep their status<br/>but still receive authkey_wid for owner resubmission
```

---

## 5 · Audience segmentation + tagging (CR-033 + CR-034 + CR-043)

```mermaid
flowchart LR
    subgraph FE_Audience[AudiencesPage.jsx]
        Accordion["5 accordion sections:<br/>Loyalty & Tier · Dates & Occasions<br/>· WhatsApp & Engagement<br/>· Customer Flags & Profile · Tags"]
        Chips["Active-filter chips<br/>(dismissible)"]
        AnyAll["Tags ANY/ALL toggle"]
    end

    subgraph FE_Customers[CustomersPage.jsx]
        ChipStrip["Top-6-by-count tag chip strip<br/>(CR-043 Part A)"]
        RowTags["Per-row TagChip + '+ tag' popover<br/>(CR-034)"]
    end

    subgraph BE_Cust[routers/customers.py]
        ListCust["GET /customers?tags=&tags_mode="]
        TagCRUD["POST/DELETE /customers/{id}/tags"]
        TagCatalog["GET /customers/tags?with_counts=true"]
        BulkTag["POST /customers/bulk-tag · bulk-untag"]
    end

    subgraph BE_Seg[routers/campaigns.py + segments]
        Preview["POST /segments/preview-count"]
        SaveSeg["POST /segments (audience)"]
    end

    subgraph Query[core/helpers.py]
        BCQ["build_customer_query() — async<br/>20 filter blocks (CR-033)<br/>+ tags filter block (CR-034)"]
    end

    subgraph Mongo[MongoDB]
        Customers[("customers<br/>tags: [str]<br/>vip_flag · whatsapp_opt_in · birthday · ...")]
        Users[("users<br/>available_tags: [str] (catalog)")]
        Segments[("segments<br/>filters JSON + count")]
        IdxTags[("idx_customers_user_tags<br/>{user_id:1, tags:1}")]
    end

    Accordion --> Preview
    Chips --> Preview
    AnyAll --> Preview
    Preview --> BCQ
    SaveSeg --> BCQ
    BCQ --> Customers
    BCQ -.uses.-> IdxTags

    ChipStrip --> ListCust
    RowTags --> TagCRUD
    ListCust --> BCQ

    TagCRUD --> Customers
    TagCRUD --> Users
    TagCatalog --> Customers
    TagCatalog --> Users
    BulkTag --> Customers

    SaveSeg --> Segments
```

**BUG-A fix (CR-033)** — the six filters `vip_flag`, `whatsapp_opt_in`, `has_birthday_this_month`, `is_blocked`, `blacklist_flag`, `complaint_flag` are now gated by an explicit `!= 'all'` guard and proper truthy coercion. Previously the criteria were silently ignored (returned all 5,971 customers). Verified this session on preprod DB.

---

## 6 · POS + external send pipeline (CR-DIRECT-SEND + CR-030)

```mermaid
flowchart LR
    subgraph External
        POS["MyGenie POS"]
        FM["Freshmarketer"]
    end

    subgraph BE
        R_POS["routers/pos.py"]
        R_WA_hook["routers/whatsapp.py<br/>POST /api/pos/webhook"]
        Send["core/whatsapp.py<br/>send message"]
        DB[(MongoDB<br/>whatsapp_message_logs<br/>webhook_logs)]
    end

    POS -->|X-API-Key + flat JSON| R_POS
    R_POS -->|resolve template via variable_labels| Send

    FM -->|nested envelope<br/>Body.data.custom_data| R_WA_hook
    R_WA_hook -->|extract + coerce numbers| Send
    R_WA_hook -->|idempotency on Body.id| DB

    Send --> AuthKey["AuthKey.io"]
    Send --> DB
    AuthKey --> Callback["/api/whatsapp/callback"]
    Callback --> DB
```

---

## 7 · Environment + configuration

| Variable | Purpose | Owner-supplied? |
|---|---|---|
| `MONGO_URL` / `DB_NAME` | MongoDB Atlas / self-hosted preprod | ✅ real value in `.env` |
| `JWT_SECRET` | JWT signing | ⚠ rotate for prod |
| `MYGENIE_API_URL` + endpoints | SSO + POS | ✅ preprod URLs |
| `AUTHKEY_*` | WhatsApp send + templates | ✅ preprod URLs (per-tenant key in DB) |
| `META_GRAPH_API_URL` | Template status + `/uploads` | ✅ v18 fixed |
| `PUBLIC_BACKEND_URL` | WeasyPrint absolute URLs for legacy logos | ✅ (CR-036 Batch A.1) |
| `AWS_S3_*` | Bill logos + invoice storage | ✅ real creds in `.env` |
| `CAMPAIGN_SCHEDULER_ENABLED` | Flip to `true` to auto-fire | ⚠ currently `false` |
| `CAMPAIGN_TIMEZONE` | APScheduler timezone | ✅ `Asia/Kolkata` |
| `POS_REQUEST_LOGGING_*` | Optional POS request audit trail | Optional |

`.env` files: `/app/backend/.env` and `/app/frontend/.env`. Ports (8001 backend, 3000 frontend) and Kubernetes ingress rules are locked; the Emergent platform routes `/api/*` → 8001 and everything else → 3000.

---

## 8 · Deployment & operational contract

- **Supervisor**: `sudo supervisorctl {status|restart <service>}` — backend restart is only needed for `.env` or dependency changes; hot-reload handles code.
- **Health check**: `GET /api/health` → `{"status":"healthy","timestamp":"…"}`.
- **Cron**: two APScheduler jobs — Daily Loyalty (00:00 UTC) and Process Due Campaigns (every minute, gated).
- **Data safety**: all destructive customer queries in tests use `AND` of prefix + name-prefix + `user_id` (RCA lock from iteration_4 QA incident).
- **Object storage fallback**: `S3_CONFIGURED=False` → all upload/download paths dual-mode to local disk (Batch A design property — no-op PR without AWS creds).

---

## 9 · Known hotspots & tech debt (open backlog)

- `routers/customers.py` > 2,200 LOC — refactor into `customer_tags.py`, `customer_segments.py`, `customer_import_export.py` (non-blocking rec from iteration_5).
- `routers/whatsapp.py` ~4 k LOC — hotspot flagged; split scheduled as CR-041-F1.
- Compound unique index on `whatsapp_message_logs (message_id, customer_phone)` — CR-041-F2 deferred.
- AuthKey HMAC webhook verification (`AUTHKEY_WEBHOOK_SECRET`) — CR-041-F3 pending owner secret.
- Pytest teardown fixture to clean leaked `TESTTAG_*` catalog entries — micro-CR pending.

---

# Part II · Consolidated data-flow views (v1.1)

> Verified against code reality on 2026-07-06 by grepping every `db.<collection>.<write-op>` across `routers/`, `core/`, `services/`.

## 10 · End-to-end POS order data flow (collections per hop)

The single most important data path in the system — every restaurant order flows through it and fans out into loyalty, coupons, messaging, invoicing and analytics.

```mermaid
sequenceDiagram
    autonumber
    participant POS as MyGenie POS
    participant GW as routers/pos.py<br/>POST /api/pos/orders
    participant Loy as core/loyalty.py
    participant Cpn as core/coupon.py
    participant WA as core/whatsapp.py
    participant Inv as services/invoice_generator.py
    participant AK as AuthKey.io
    participant DB as MongoDB

    POS->>GW: order payload + X-API-Key
    GW->>DB: READ users (api_key → tenant auth)
    GW->>DB: READ/WRITE customers — find or merge on (user_id, phone)
    GW->>Loy: calculate_points(amount, customer, settings)
    Loy->>DB: READ loyalty_settings
    Loy->>DB: WRITE points_transactions (earn ledger)
    Loy->>DB: WRITE customers (total_points · total_spent · total_visits · tier)
    alt coupon_code present
        GW->>Cpn: apply + record (idempotent on user_id+order_id)
        Cpn->>DB: WRITE coupon_usage · coupons.usage_count · customers
    end
    GW->>DB: WRITE orders (insert_one) + order_items (insert_many)
    GW->>WA: trigger_whatsapp_event("send_bill", order context)
    WA->>DB: READ whatsapp_event_template_map + whatsapp_template_variable_map
    WA->>AK: send message (per-tenant authkey_api_key)
    WA->>DB: WRITE whatsapp_message_logs (status=pending)
    GW->>Inv: generate invoice (dedup on user_id+restaurant_order_id)
    Inv->>DB: WRITE invoices (token-indexed)
    Inv->>Inv: HTML/PDF → S3 (fallback: local disk when S3_CONFIGURED=False)
    GW->>DB: WRITE pos_event_logs · webhook_logs · loyalty_mismatch_logs (audit)
    GW-->>POS: 200 (points · tier · invoice URL)

    Note over DB: services/analytics_service.py aggregates orders,<br/>order_items, customers, points_transactions — READ-ONLY
```

**Data-integrity anchors on this path**
- Tenant isolation: every query filtered by `user_id` (resolved from `X-API-Key`).
- Customer identity: merge on `(user_id, phone)` — never duplicate.
- Coupon idempotency: `(user_id, order_id)` unique guard in `coupon_usage`.
- Invoice dedup: same `(user_id, restaurant_order_id)` → same invoice token.

## 11 · MongoDB collection read/write ownership map

Solid arrows = writes (owner), dotted = read-only consumers. Grouped by domain (29 preprod collections; ops/scan collections abbreviated).

```mermaid
flowchart LR
    R_Auth["routers/auth.py"]
    R_Cust["routers/customers.py"]
    R_POS["routers/pos.py"]
    R_Camp["routers/campaigns.py"]
    R_WA["routers/whatsapp.py"]
    R_Scan["routers/scan.py"]
    Cpn["coupons router<br/>+ core/coupon.py"]
    C_Loy["core/loyalty.py<br/>+ loyalty_jobs.py"]
    C_Jobs["core/campaign_jobs.py"]
    C_WA["core/whatsapp.py"]
    S_Inv["services/invoice_generator.py"]
    S_Ana["services/analytics_service.py<br/>(READ-ONLY)"]

    subgraph Identity
        users[("users")]
        customers[("customers")]
        segments[("segments")]
    end
    subgraph Commerce
        orders[("orders")]
        order_items[("order_items")]
        invoices[("invoices")]
        coupons[("coupons")]
        coupon_usage[("coupon_usage")]
    end
    subgraph Loyalty
        points_tx[("points_transactions")]
        loyalty_settings[("loyalty_settings")]
        mismatch[("loyalty_mismatch_logs")]
    end
    subgraph Messaging
        wml[("whatsapp_message_logs")]
        wcl[("whatsapp_callback_logs")]
        ct[("custom_templates")]
        etm[("whatsapp_event_template_map")]
        tvm[("whatsapp_template_variable_map")]
    end
    subgraph CampaignsD["Campaigns"]
        campaigns[("campaigns")]
        campaign_runs[("campaign_runs")]
        cts[("campaign_test_sends")]
    end
    subgraph Ops["Ops / Audit"]
        cron_logs[("cron_job_logs")]
        webhook_logs[("webhook_logs")]
        pos_events[("pos_event_logs")]
    end

    R_Auth -->|W upsert on login| users
    R_POS -->|W| customers
    R_POS -->|W| orders
    R_POS -->|W| order_items
    R_POS -->|W| webhook_logs
    R_POS -->|W| pos_events
    R_POS -->|W| mismatch
    R_POS -.R api_key auth.-> users
    R_Cust -->|W profile + tags| customers
    R_Cust -->|W available_tags catalog| users
    R_Cust -->|W| segments
    R_Camp -->|W| campaigns
    R_Camp -->|W| campaign_runs
    R_Camp -->|W| cts
    C_Jobs -->|W atomic claim + status| campaigns
    C_Jobs -->|W| cron_logs
    C_WA -->|W insert send rows| wml
    R_WA -->|W status via callback| wml
    R_WA -->|W| wcl
    R_WA -->|W| ct
    R_WA -->|W| etm
    R_WA -->|W| tvm
    R_WA -->|W authkey/meta creds| users
    Cpn -->|W| coupons
    Cpn -->|W| coupon_usage
    Cpn -->|W redeem state| customers
    C_Loy -->|W| points_tx
    C_Loy -->|W points + tier| customers
    C_Loy -.R.-> loyalty_settings
    S_Inv -->|W| invoices
    R_Scan -->|W QR registration| customers
    S_Ana -.R.-> orders
    S_Ana -.R.-> order_items
    S_Ana -.R.-> customers
    S_Ana -.R.-> points_tx
```

**Ownership table (who writes what)**

| Domain | Collection | Write owner(s) | Read-only consumers |
|---|---|---|---|
| Identity | `users` | auth (SSO upsert), customers (tag catalog), whatsapp (creds) | pos (api_key auth), all routers (tenant lookup) |
| Identity | `customers` | pos (merge), customers, scan (QR), loyalty, coupon | campaigns/segments (`build_customer_query`), analytics |
| Identity | `segments` | customers router | campaigns (audience resolution) |
| Commerce | `orders` / `order_items` | pos only | analytics, suggestions |
| Commerce | `invoices` | invoice_generator only | public invoice routes |
| Commerce | `coupons` / `coupon_usage` | coupons router + core/coupon | pos validate/apply |
| Loyalty | `points_transactions` | core/loyalty + loyalty_jobs + pos | analytics, points router |
| Loyalty | `loyalty_settings` | points router | core/loyalty |
| Messaging | `whatsapp_message_logs` | core/whatsapp (insert), whatsapp router (callback status) | Message Status page, campaign stats |
| Messaging | `custom_templates` + maps | whatsapp router | campaigns, automation |
| Campaigns | `campaigns` / `campaign_runs` / `campaign_test_sends` | campaigns router + campaign_jobs (claim) | history page |
| Ops | `cron_job_logs`, `webhook_logs`, `pos_event_logs` | scheduler / pos / webhooks | debugging only |

## 12 · Scheduler & async data flow

```mermaid
flowchart TB
    Lifespan["server.py lifespan startup"] --> Sched["APScheduler — AsyncIOScheduler<br/>max_instances=1 · coalesce=true"]

    Sched -->|"CronTrigger 00:00 UTC"| LoyJob["core/loyalty_jobs.py<br/>Daily Loyalty Jobs"]
    Sched -->|"CronTrigger every minute<br/>gate: CAMPAIGN_SCHEDULER_ENABLED"| CampJob["core/campaign_jobs.py<br/>process_due_campaigns()"]

    LoyJob -->|"W points expiry (update_many)"| PT[("points_transactions")]
    LoyJob -->|"W balance/tier"| Cust[("customers")]

    CampJob -->|"1 · atomic claim (update_one status)"| Camps[("campaigns")]
    CampJob -->|"2 · resolve audience"| BCQ["core/helpers.py<br/>build_customer_query()"]
    BCQ -.R filters + tags.-> Cust
    CampJob -->|"3 · batch send"| Send["core/whatsapp.py<br/>send_bulk_messages()<br/>15s httpx timeout"]
    Send -->|per recipient| AK["AuthKey.io"]
    Send -->|"W row per recipient<br/>key: (message_id, customer_phone)"| WML[("whatsapp_message_logs")]
    CampJob -->|"4 · W run log"| CJL[("cron_job_logs")]

    AK -.->|async delivery status| CB["/api/whatsapp/callback"]
    CB -->|"composite lookup (CR-039)<br/>state-machine gate (CR-041)"| WML
    CB -->|"W raw payload"| WCL[("whatsapp_callback_logs")]
```

**Async safety properties** — atomic claim prevents double-fire across restarts; `max_instances=1 + coalesce` prevents overlap; composite `(message_id, customer_phone)` webhook lookup prevents cross-recipient status corruption; timestamp writes gated behind the status state machine.

---

*End of ARCHITECTURE.md · v1.1 · 2026-07-06*
