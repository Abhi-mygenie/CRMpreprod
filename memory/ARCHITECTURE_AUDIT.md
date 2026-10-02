# MyGenie CRM — Architecture Audit & Improvement Bible

> **Version**: 1.1 · 2026-07-06 (v1.1 adds §10 Capacity & Breakpoints per owner request)
> **Role**: PRE-RELEASE AUDIT (read-only — no code changed)
> **Goal**: Baseline document for scaling the platform from ~28 tenants to **thousands of clients**.
> **Method**: Every finding below is evidence-based — verified directly against the codebase (`server.py`, `core/`, `routers/`, `services/`, frontend), the preprod environment, and session history. File/line references included.
> **Companion docs**: `/app/memory/ARCHITECTURE.md` (v1.1) · rendered visuals at `/docs/architecture.html`, `/docs/dataflow.html`, `/docs/audit.html`

---

## Executive summary

| Priority | Count | Meaning |
|---|---|---|
| 🔴 **HIGH** | 14 | Blocks safe scaling — fix before onboarding significant tenant volume |
| 🟡 **MEDIUM** | 21 | Will hurt at scale — schedule within the next 1–2 sprints |
| 🟢 **LOW** | 10 | Hygiene / optimization — backlog |

**The five most dangerous facts about the current architecture:**
1. The MongoDB instance is **reachable from the public internet** and has already shown a ransomware indicator database.
2. **Everything runs in one process** — API, scheduler, campaign sends, PDF rendering. There is no path to horizontal scaling today.
3. **Login has a hard dependency on MyGenie preprod SSO** — if MyGenie is down, every tenant is locked out.
4. Multi-tenancy is a **convention, not a guarantee** — a single missed `user_id` filter in any of 21k+ backend LOC leaks one tenant's data to another.
5. There is **no monitoring, no alerting, no CI, and no verified backups** — failures at scale will be discovered by customers, not by engineering.

---

# 1 · SECURITY

### SEC-01 · Publicly exposed MongoDB with active compromise indicator
- **Priority**: 🔴 HIGH (CRITICAL — treat as P0 incident)
- **What**: The preprod/prod MongoDB runs on a public IP (`52.66.232.149:27017`). A `READ_ME_TO_RECOVER_YOUR_DATA` database was observed on this server (classic Mongo ransomware signature). Connection does not use TLS.
- **Why it's a risk**: Any internet host can attempt auth against the DB. The ransomware artifact proves it has already been found by scanners. Credential brute-force, data theft, or wipe-and-ransom are realistic outcomes.
- **Impact at scale**: With thousands of tenants, a single breach exposes every restaurant's full customer PII (names, phones, birthdays, spend history) — regulatory exposure (DPDP Act / GDPR) plus total business trust loss.
- **Fix**:
  1. Move MongoDB into a private subnet / VPC; allow inbound only from app hosts via security group.
  2. Rotate `mygenie_admin` credentials immediately; enable TLS (`tls=true` in connection string).
  3. Delete the ransomware artifact DB after forensic snapshot; verify collections integrity.
  4. Enable MongoDB auditing + `authSource` scoped users (app user should not be admin).
  5. Long-term: managed MongoDB (Atlas) with IP allowlist + encryption at rest.

### SEC-02 · CORS wildcard with credentials
- **Priority**: 🔴 HIGH
- **What**: `server.py:179-185` — `allow_origins=os.environ['CORS_ORIGINS'].split(',')` currently `*`, combined with `allow_credentials=True`, `allow_methods=["*"]`, `allow_headers=["*"]`.
- **Why it's a risk**: Any website can invoke the API from a victim's browser. (Browsers block `*`+credentials, but the config intent is wrong and any origin echo middleware would open it fully.)
- **Impact at scale**: CSRF-style attacks against thousands of tenant dashboards; token exfiltration paths.
- **Fix**: Whitelist exact origins per environment (`https://app.mygenie.online`, preview URL). Fail startup if `CORS_ORIGINS=*` when `ENV=production`.

### SEC-03 · Unauthenticated public webhook (delivery-status forgery)
- **Priority**: 🔴 HIGH
- **What**: `routers/whatsapp.py:1449` — `POST /api/whatsapp/status-callback` is public. HMAC verification code exists (line 1527) but is **dormant** because `AUTHKEY_WEBHOOK_SECRET` is unset.
- **Why it's a risk**: Anyone can POST forged `{logid, mobile, status}` payloads and corrupt delivery statuses, poison campaign ROI metrics, or flood `whatsapp_callback_logs`.
- **Impact at scale**: Campaign analytics (the core value proposition of the ROI sprint) become untrustworthy; storage abuse vector.
- **Fix**: Obtain/set the AuthKey webhook secret (already tracked as CR-041-F3), activate HMAC verification, and add per-IP rate limiting on the endpoint. Reject payloads whose `logid` doesn't exist.

### SEC-04 · Plaintext password stored in localStorage
- **Priority**: 🔴 HIGH
- **What**: `LoginPage.jsx:51` — "Remember me" stores `remembered_password` in plaintext localStorage.
- **Why it's a risk**: Any XSS, malicious browser extension, or shared computer exposes the tenant's actual password — which is also their **MyGenie POS password** (SSO pass-through), so the blast radius includes the POS system.
- **Impact at scale**: One XSS bug × thousands of tenants = mass credential harvest across two products.
- **Fix**: Remove password persistence entirely; remember email only. If "stay signed in" is wanted, use long-lived refresh tokens (see SEC-05), never raw credentials.

### SEC-05 · JWT in localStorage, 24h expiry, no revocation, no refresh
- **Priority**: 🔴 HIGH
- **What**: `AuthContext.jsx:59` stores the JWT in localStorage; `core/auth.py` issues 24-hour HS256 tokens; there is no refresh-token flow, no token revocation list, no logout invalidation server-side.
- **Why it's a risk**: XSS = 24 hours of full account takeover with no way to kill the session. Password change does not invalidate existing tokens.
- **Impact at scale**: Compromised token on any one of thousands of tenants cannot be remotely revoked; incident response is impossible.
- **Fix**: Short-lived access tokens (15 min) + rotating refresh tokens in `httpOnly; Secure; SameSite=Strict` cookies; store a `token_version` per user and bump it on password change/logout-all; check it in `get_current_user`.

### SEC-06 · No rate limiting or brute-force protection anywhere
- **Priority**: 🔴 HIGH
- **What**: Verified: no `slowapi`/limiter anywhere in the backend. `/api/auth/login`, OTP endpoints (`generate_otp` 6-digit numeric, `routers/auth.py:592`), and the public webhook are all unthrottled.
- **Why it's a risk**: Credential stuffing against login (which proxies to MyGenie — so the attack also hammers the POS vendor); 6-digit OTP is brute-forceable in ~10⁶ guesses without attempt limits.
- **Impact at scale**: Automated account-takeover campaigns; MyGenie may block the CRM's IP for abusive traffic, taking down login for **all** tenants (see REL-01).
- **Fix**: Add `slowapi` (Redis-backed at scale): 5/min per IP on login, 3 attempts + lockout on OTP verification, sane defaults per authenticated user elsewhere. Add CAPTCHA after repeated failures.

### SEC-07 · Secrets management: long-lived keys in flat .env files
- **Priority**: 🟡 MEDIUM
- **What**: Real AWS keys, Mongo admin credentials, JWT secret all live in `/app/backend/.env` in plain text; per-tenant `authkey_api_key` and Meta tokens are stored unencrypted in the `users` collection.
- **Why it's a risk**: Anyone with pod/repo access reads all production secrets; DB compromise (see SEC-01) also leaks every tenant's WhatsApp/Meta credentials.
- **Impact at scale**: Thousands of tenant API keys leaked in one incident; key rotation is manual and effectively never happens.
- **Fix**: Move to a secrets manager (AWS Secrets Manager / SSM) at deployment; encrypt per-tenant third-party credentials at the application layer (envelope encryption, e.g. Fernet with KMS-held master key); add rotation runbooks.

### SEC-08 · POS `X-API-Key` auth — static, unhashed, unscoped
- **Priority**: 🟡 MEDIUM
- **What**: POS endpoints authenticate via a static API key compared against `users.api_key` stored in plaintext; no rotation, no scoping, no expiry.
- **Why it's a risk**: DB read access reveals valid POS keys for all tenants; a leaked key allows fake order injection → fabricated loyalty points (financial liability) and fake analytics.
- **Impact at scale**: Loyalty fraud across tenants; no way to detect which key leaked (no per-key audit).
- **Fix**: Store only a hash of the API key (compare via constant-time hash check); add `key_prefix` for identification; support dual-key rotation windows; log key usage per request (partially exists via `pos_request_logs`, currently disabled by default).

### SEC-09 · Missing security headers & dependency scanning
- **Priority**: 🟡 MEDIUM
- **What**: No CSP, HSTS, X-Frame-Options, Referrer-Policy on frontend or API responses; no `pip-audit`/`yarn audit`/Dependabot process.
- **Why it's a risk**: XSS mitigations absent (directly amplifies SEC-04/05); known-CVE dependencies go unnoticed.
- **Impact at scale**: A single injected script in any page compromises sessions platform-wide.
- **Fix**: Add security-header middleware (or set at ingress); enable automated dependency scanning in CI (see MAI-02).

### SEC-10 · OTP flow hardening review
- **Priority**: 🟢 LOW
- **What**: Password-reset/scan OTPs are 6-digit numeric (`generate_otp`); expiry and attempt-count enforcement should be verified and standardized across `otp_tokens` and `customer_otps`.
- **Fix**: Enforce 5-minute TTL (Mongo TTL index), max 3 verification attempts, and single-use invalidation; constant-time compare.

---

# 2 · SCALABILITY

### SCA-01 · Monolithic single process: API + scheduler + jobs cannot scale horizontally
- **Priority**: 🔴 HIGH
- **What**: One Uvicorn process hosts the API **and** APScheduler (`core/scheduler.py`, started in `server.py` lifespan). Running 2+ replicas would fire the Daily Loyalty job N times (points corruption — financial) and race the campaign processor (mitigated only for campaigns by the atomic claim in `campaign_jobs.py:221`).
- **Why it's a risk**: The only scaling lever today is a bigger single box. CPU-heavy work (WeasyPrint PDFs, analytics aggregations) blocks API latency for everyone.
- **Impact at scale**: Thousands of tenants → login storms, POS webhook bursts at meal times, and campaign fan-out all compete inside one event loop. P99 latency collapses; a single OOM kills orders ingestion + scheduler simultaneously.
- **Fix** (sequenced):
  1. Extract the scheduler into a dedicated worker deployment (same codebase, `ROLE=worker` env flag: API pods never start APScheduler).
  2. Guard **all** cron jobs with a distributed lock (Redis `SET NX PX` or a Mongo lease document), not just campaign claims.
  3. Scale API pods horizontally behind the ingress; add `--workers N` per pod.

### SCA-02 · No message queue — campaign sends execute inside the scheduler tick
- **Priority**: 🔴 HIGH
- **What**: `process_due_campaigns()` (per-minute cron) claims campaigns and sends messages inline via `send_bulk_messages()` (`core/whatsapp.py`: batches with `asyncio.gather`, 15s timeouts, sleep between batches). Due-campaign fetch caps at `to_list(1000)`.
- **Why it's a risk**: Send duration is unbounded relative to the 1-minute tick. `max_instances=1 + coalesce` prevents overlap but means **ticks are skipped** while a large send runs — other tenants' scheduled campaigns silently slip.
- **Impact at scale**: 1,000 tenants each sending 1,000 messages ≈ 10⁶ sends/day through a single sequential tick pipeline. Hours of delay; one slow AuthKey response degrades all tenants ("noisy neighbor").
- **Fix**: Introduce a queue (Redis Streams / RabbitMQ / SQS). Scheduler tick only **enqueues** `(campaign_id, batch)` jobs; a horizontally scalable worker pool consumes them with per-tenant concurrency limits and retry/backoff. Track per-batch progress in `campaign_runs` for resumability.

### SCA-03 · Multi-tenancy enforced only by convention (`user_id` filter in every query)
- **Priority**: 🔴 HIGH
- **What**: Tenant isolation depends on each of the hundreds of Mongo queries across 21k+ LOC remembering to include `user_id`. There is no shared repository layer, no query middleware, and no automated test asserting isolation. All tenants share one unsharded database.
- **Why it's a risk**: One forgotten filter in any new endpoint = cross-tenant data leak (the worst possible bug for a B2B CRM). Reviews can't reliably catch this across hotspot files (see MAI-01).
- **Impact at scale**: At thousands of tenants, a leak is guaranteed to be noticed by a customer and is a contract/regulatory breach. Also: unbounded shared collections make per-tenant index selectivity worse over time.
- **Fix**:
  1. Introduce a thin tenant-scoped data-access helper (`tenant_db(user_id).customers.find(...)` that force-injects the filter) and migrate endpoints incrementally, hotspots first.
  2. Add a cross-tenant isolation pytest suite (two seeded tenants; assert zero leakage on every list endpoint).
  3. Plan shard key `{user_id: 1, _id: 1}` for the big collections (`customers`, `orders`, `whatsapp_message_logs`) before they exceed working-set memory.

### SCA-04 · Unbounded / oversized queries loaded into memory
- **Priority**: 🟡 MEDIUM
- **What**: Verified: 5× `to_list(None)` (fully unbounded), 6× `to_list(10000)` — including campaign audience resolution `routers/campaigns.py:55` which materializes up to 10k full customer docs per request; 2× `to_list(2000)`.
- **Why it's a risk**: Memory spikes proportional to tenant size; a tenant with 50k customers silently gets a **truncated audience** (correctness bug, not just performance).
- **Impact at scale**: Large tenants get wrong campaign reach; concurrent audience previews OOM the single process (SCA-01 compounds this).
- **Fix**: Replace audience materialization with cursor iteration + projection (`{"phone": 1, "id": 1}`); use `count_documents`/aggregation for preview counts; ban `to_list(None)` via lint rule.

### SCA-05 · No caching layer
- **Priority**: 🟡 MEDIUM
- **What**: No Redis/in-memory cache. Dashboard analytics (`analytics_service.py`) run full aggregation pipelines on `orders`/`customers` per page load; tag catalogs, loyalty settings, and template lists are re-fetched every request.
- **Impact at scale**: Dashboard = the most-visited page × thousands of tenants × multi-second aggregations = sustained DB CPU saturation affecting POS ingestion latency.
- **Fix**: Add Redis: cache dashboard stats per tenant (60–300s TTL), loyalty settings and template maps (invalidate on write). Redis also serves SCA-01 locks, SCA-02 queue, and SEC-06 rate limits — one infra addition, four problems.

### SCA-06 · Hardcoded global campaign daily limit with racey counting
- **Priority**: 🟡 MEDIUM
- **What**: `routers/campaigns.py:28` — `DAILY_LIMIT = 1000` module constant, identical for every tenant; enforcement counts today's logs at send time (`campaigns.py:394`), a check-then-act race across concurrent sends/scheduler.
- **Impact at scale**: Cannot monetize tiered plans (500/5k/50k per plan); concurrent sends can exceed the cap; limit resets are timezone-ambiguous.
- **Fix**: Per-tenant `plan.daily_message_limit` on `users`; enforce via atomic counter (`find_one_and_update` with `$inc` on a per-day counter doc, or Redis `INCR` + TTL).

### SCA-07 · MongoDB driver defaults untuned; no connection strategy
- **Priority**: 🟡 MEDIUM
- **What**: `core/database.py` — bare `AsyncIOMotorClient(mongo_url)`: default 100-connection pool, no `serverSelectionTimeoutMS`, no `maxIdleTimeMS`, no read preference, single client per process.
- **Impact at scale**: N API pods × default pools can exhaust `mongod` connection limits; slow server selection during failover blocks requests for 30s (default) instead of failing fast.
- **Fix**: Explicit `maxPoolSize`, `serverSelectionTimeoutMS=5000`, `retryWrites=true`; size pools to (pods × workers); introduce a replica set and route analytics reads to secondaries.

### SCA-08 · CPU-bound PDF rendering in the request path
- **Priority**: 🟢 LOW
- **What**: WeasyPrint invoice PDF generation (`services/invoice_generator.py`) runs synchronously inside API requests.
- **Fix**: Move to the worker/queue (SCA-02 infra); pre-render on invoice creation; serve from S3.

### SCA-09 · Sequential third-party sync loops
- **Priority**: 🟢 LOW
- **What**: AuthKey/Meta template syncs iterate templates serially with per-item HTTP calls.
- **Fix**: Bounded-concurrency `asyncio.gather` (semaphore of 5) once per-tenant rate limits are confirmed with vendors.

---

# 3 · RELIABILITY

### REL-01 · MyGenie SSO is a hard single point of failure for all logins
- **Priority**: 🔴 HIGH
- **What**: `/api/auth/login` synchronously calls MyGenie preprod login + profile on **every** login (`routers/auth.py`). MyGenie down ⇒ no tenant can enter the CRM, even though the CRM's own data and JWT machinery are healthy.
- **Why it's a risk**: Availability of the whole platform is capped by a third party's preprod uptime; no timeout/circuit-breaker policy is defined around these calls.
- **Impact at scale**: A 2-hour MyGenie outage = 2-hour platform-wide login outage for thousands of paying tenants; support flood.
- **Fix**:
  1. Add strict timeouts + circuit breaker on MyGenie calls.
  2. Grace-mode login: if MyGenie is unreachable and the user has logged in before, verify against the locally stored `password_hash` and issue a session flagged `sso_degraded=true` (skip profile refresh, keep POS features that need fresh MyGenie tokens disabled).
  3. Cache the MyGenie profile; refresh asynchronously post-login instead of blocking.

### REL-02 · Backups unverified + active threat = data-loss exposure
- **Priority**: 🔴 HIGH
- **What**: DB backup snapshot failures were observed (2026-07-02, owner-acknowledged) and never re-verified; combined with SEC-01 (exposed instance, ransomware artifact), the platform currently has **no proven restore path**.
- **Impact at scale**: A wipe event is unrecoverable — total loss of all tenants' customers, orders, points ledgers (which are financial liabilities), campaigns, invoices.
- **Fix**: Automated daily snapshots + oplog-based PITR; store backups in a separate account/region; run a quarterly **restore drill** and document RTO/RPO. This is an owner-infra P0 alongside SEC-01.

### REL-03 · S3 local-disk fallback on an ephemeral pod
- **Priority**: 🟡 MEDIUM
- **What**: `core/s3.py` design: when `S3_CONFIGURED=False`, bill logos and invoice artifacts write to pod-local disk — which vanishes on pod restart/reschedule.
- **Impact at scale**: Silent loss of legal documents (invoices) and tenant branding assets; support tickets with no recovery.
- **Fix**: In production, make S3 mandatory (fail-fast on boot if unconfigured — mirrors the .env fail-fast philosophy); keep the disk fallback only for local dev.

### REL-04 · Silent failure patterns (`except Exception: pass/warn`)
- **Priority**: 🟡 MEDIUM
- **What**: Verified: 40+ broad `except Exception` blocks (whatsapp router 12, customers 10, pos_request_logger 10…). Startup index creation, `backfill_next_run_at`, and several business hooks log-and-continue or silently pass (`server.py:41,92,106,120`).
- **Why it's a risk**: A missing unique index (e.g. the webhook idempotency index at `server.py:111`) fails silently — the code then *believes* it has idempotency guarantees it doesn't have.
- **Impact at scale**: Duplicate webhooks, unindexed hot queries, and skipped backfills manifest as slow, weird data corruption that is very expensive to trace later.
- **Fix**: Classify startup guards: index creation failures on **unique/idempotency** indexes must abort boot in production; others must emit a metric/alert (MON-01), not just a log line. Replace bare `except Exception` with narrow exceptions in business paths.

### REL-05 · No automatic retry / dead-letter for failed WhatsApp sends
- **Priority**: 🟡 MEDIUM
- **What**: `send_single_message` records failures in `whatsapp_message_logs`; recovery is a manual `/api/whatsapp/resend`. Transient AuthKey timeouts permanently fail messages.
- **Impact at scale**: At 10⁶ sends/day, even a 1% transient-failure rate = 10k messages/day requiring manual owner intervention.
- **Fix**: With the SCA-02 queue: automatic retry with exponential backoff (3 attempts) for timeout/5xx classes only; dead-letter queue + daily digest for permanent failures; never auto-retry provider "rejected" statuses (avoid duplicate customer messages).

### REL-06 · No detection of skipped scheduler ticks
- **Priority**: 🟢 LOW
- **What**: `coalesce=true` silently collapses missed campaign-processor runs; nothing alerts when campaigns fire late.
- **Fix**: Heartbeat doc per tick (`scheduler_heartbeats`); alert when gap > 3 minutes (consumed by MON-01 stack).

---

# 4 · PERFORMANCE

### PER-01 · Live aggregation analytics with no pre-computation
- **Priority**: 🟡 MEDIUM
- **What**: Dashboard/lifecycle/item analytics aggregate raw `orders`/`order_items`/`customers` on every request (`services/analytics_service.py`, 551 LOC of pipelines).
- **Impact at scale**: Order volume grows linearly with tenants × time; pipelines scan ever-larger ranges. Dashboards degrade first, then their scans evict the working set and slow **POS ingestion** (shared DB CPU).
- **Fix**: Nightly (worker) pre-aggregation into `analytics_daily_rollups` keyed `(user_id, date)`; dashboards read rollups + today's delta. Route heavy reads to a replica (SCA-07).

### PER-02 · Missing compound unique index for webhook status lookups
- **Priority**: 🟡 MEDIUM
- **What**: CR-039 made callback lookups use `(message_id, customer_phone)`, but the matching **unique compound index was deferred** (CR-041-F2). Only single-field `idx_wml_message_id` (sparse) exists (`server.py:54-56`).
- **Why it's a risk**: Correctness currently leans on lookup logic; without the unique constraint, duplicate rows per `(logid, phone)` can still be inserted under race, resurrecting the ambiguous-row bug at high callback volume.
- **Impact at scale**: 10⁶ sends/day ⇒ ~10⁶ callbacks/day hitting a partial index; wrong ROI numbers return.
- **Fix**: Ship CR-041-F2: dedupe existing rows, then `create_index([("message_id",1),("customer_phone",1)], unique=True, partialFilterExpression=...)`.

### PER-03 · Unbounded log-collection growth (no TTL/archival)
- **Priority**: 🟡 MEDIUM
- **What**: `whatsapp_message_logs`, `whatsapp_callback_logs`, `webhook_logs`, `cron_job_logs`, `pos_event_logs` grow forever. Only `pos_request_logs` has a TTL (and that feature is off by default).
- **Impact at scale**: Message logs alone: 10⁶/day ⇒ ~365M docs/year — index bloat, slow queries, expensive backups (compounds REL-02).
- **Fix**: TTL indexes on raw audit logs (`whatsapp_callback_logs` 90d, `cron_job_logs` 30d); for `whatsapp_message_logs` (needed for ROI), archive to cold storage after 12 months via worker job; document retention policy per collection.

### PER-04 · Per-request assembly patterns (N+1 style) on detail endpoints
- **Priority**: 🟢 LOW
- **What**: Customer-detail-style endpoints assemble related data via multiple sequential queries; acceptable now, wasteful at scale.
- **Fix**: Consolidate with `$lookup`-based aggregations or parallel `asyncio.gather` reads on the hottest endpoints only (measure first via MON-01).

---

# 5 · DATA MODEL

### DM-01 · Mixed `campaign_id` semantics in message logs (permanent query debt)
- **Priority**: 🟡 MEDIUM
- **What**: Post BUG-006: new rows store `campaign_id=campaign.id`; legacy rows store `campaign_id=run_id` + `reference_id=campaign.id`. Every filter needs a `$or` across both fields forever.
- **Why it's a risk**: Every future feature touching message logs must know this folklore; `$or` queries defeat clean compound indexing.
- **Impact at scale**: Slow campaign-stat queries + a standing trap for new engineers (guaranteed regression source).
- **Fix**: One-time backfill migration normalizing legacy rows (`campaign_id ← reference_id`, preserve `run_id` in its own field), then delete the `$or` branches. Run in the worker with batched writes.

### DM-02 · No database-level schema validation
- **Priority**: 🟡 MEDIUM
- **What**: Validation exists only at the API boundary (Pydantic). Migrations/scripts (`backend/scripts/`, `migrations/`) and future workers write raw dicts with no `$jsonSchema` guard.
- **Impact at scale**: Shape drift accumulates silently across thousands of tenants; every consumer needs defensive `dict.get()` code (already visible in the codebase).
- **Fix**: Add moderate `$jsonSchema` validators (`validationLevel: "moderate"`) on the top 6 collections (`users`, `customers`, `orders`, `campaigns`, `whatsapp_message_logs`, `coupons`); required keys + type checks only, not full strictness.

### DM-03 · Tag catalog as unbounded array on `users`
- **Priority**: 🟢 LOW
- **What**: `users.available_tags` grows without a cap; the 16MB doc limit is distant but the pattern degrades user-doc reads (users doc is fetched on every authenticated request).
- **Fix**: Cap catalog size in the API (e.g. 200 tags) now; move to a `tags` collection if tenants demand more.

### DM-04 · Monetary values stored as floats
- **Priority**: 🟢 LOW
- **What**: Amounts/discount math flow through Python floats and are stored as doubles; coupon engine (2.4k LOC of money math) is float-based.
- **Why it's a risk**: Classic accumulation of rounding errors in discounts/GST at volume; reconciliation mismatches with POS.
- **Fix**: Standardize on integer paise (or `Decimal128`) for new code paths; add round-half-up at defined boundaries; migrate the coupon engine during its next planned QA-heavy change (never casually — per addendum rules).

---

# 6 · MAINTAINABILITY

### MAI-01 · Hotspot mega-files concentrate change risk
- **Priority**: 🔴 HIGH
- **What**: `routers/pos.py` ~2.9k LOC (mixes auth, orders, coupons, addresses, messaging), `routers/whatsapp.py` ~4k LOC, `core/coupon.py` ~2.5k LOC, `routers/customers.py` ~2.2k LOC. Already flagged in the closure baseline (CR-041-F1 + iteration_5 recommendation).
- **Why it's a risk**: Every sprint touches these files; merge conflicts, accidental cross-feature regressions, and reviewer fatigue are structural. These are also exactly the files where a missed `user_id` filter (SCA-03) would hide.
- **Impact at scale**: Feature velocity decays as team grows; onboarding cost per engineer is dominated by these four files.
- **Fix**: Execute the planned splits behind pure re-exports (no behavior change): `pos.py → pos_orders / pos_coupons / pos_customers / pos_messaging`; `whatsapp.py → templates / sends / callbacks / logs`; `customers.py → customers / customer_tags / customer_segments / import_export`. One file per sprint, each guarded by the existing pytest suites.

### MAI-02 · No CI pipeline — tests exist but nothing runs them
- **Priority**: 🟡 MEDIUM
- **What**: Verified: no `.github/` workflows; `backend/tests/` currently holds 6 suites (regression suites from earlier sprints live in registry history); lint (`flake8`, `eslint`) is manual.
- **Impact at scale**: With multiple engineers, untested merges to money-adjacent code (coupons, loyalty) are inevitable; the "Do Not Do" rules in the addendum are enforced only by memory.
- **Fix**: GitHub Actions: on PR → `pytest backend/tests -x`, `flake8`, `eslint`, `yarn build`, plus `pip-audit`/`yarn audit` (SEC-09). Protect the main branch; adopt a real branching model (see DEP-01).

### MAI-03 · No API versioning on external contracts
- **Priority**: 🟡 MEDIUM
- **What**: POS endpoints (`/api/pos/*`) are consumed by the external MyGenie POS with no version segment; response-shape changes are silently breaking.
- **Impact at scale**: Thousands of POS installations cannot be force-upgraded simultaneously; every contract change becomes a coordinated big-bang deploy.
- **Fix**: Freeze current contract as `/api/pos/v1/*` (alias the existing paths to v1); all breaking changes go to v2 with a deprecation window. Publish an OpenAPI subset for the POS team.

### MAI-04 · Zero frontend tests; oversized page components
- **Priority**: 🟢 LOW
- **What**: No frontend test suite; several pages (CampaignWizard, TemplatesPage, CustomersPage) exceed comfortable component size.
- **Fix**: Add smoke-level React Testing Library tests for the 3 revenue-critical flows (login, campaign create, template submit); split components opportunistically during feature work — no big-bang refactor.

---

# 7 · DEPLOYMENT

### DEP-01 · No production deployment pipeline, branch model, or release process
- **Priority**: 🔴 HIGH
- **What**: Production deployment is documented as **UNKNOWN** (addendum §13). Git uses throwaway branches per session (`28-may`, `17-june`…) with no `main`, no tags, no changelog-driven releases. The preview pod is effectively the integration environment, pointed at the live preprod DB.
- **Why it's a risk**: There is no reproducible way to ship, no rollback beyond platform checkpoints, and no environment where changes are validated against non-live data.
- **Impact at scale**: You cannot run a business with thousands of clients on "push to a session branch and hope." Any bad deploy hits live tenant data immediately.
- **Fix**:
  1. Adopt `main` + short-lived feature branches + tagged releases (`v1.x`), protected by CI (MAI-02).
  2. Create a true **staging environment** with an anonymized DB copy; preview pods stop pointing at live preprod data by default.
  3. Define the production runbook: build artifacts, env promotion, smoke suite (`/api/health`, login, POS order echo), rollback procedure.

### DEP-02 · Dev-grade serving in the current environment
- **Priority**: 🟡 MEDIUM
- **What**: Frontend runs on the CRA dev server (webpack-dev-server + hot reload); backend runs Uvicorn `--reload` under supervisor. Fine for preview; must not be the production shape.
- **Impact at scale**: Dev servers leak memory, serve unminified bundles, and reload on file events — unfit for real traffic.
- **Fix**: Production: `yarn build` → static hosting/CDN with cache headers; backend via `uvicorn --workers N` (no reload) or gunicorn+uvicorn workers; container images built in CI.

### DEP-03 · Inconsistent config strictness; no boot-time config validation
- **Priority**: 🟡 MEDIUM
- **What**: Some env vars fail fast (`MONGO_URL`, `JWT_SECRET` — good), others silently default or stay dormant (`AUTHKEY_WEBHOOK_SECRET`, `CAMPAIGN_SCHEDULER_ENABLED=false`, `S3` fallback). Nothing verifies a complete config set at startup per environment.
- **Impact at scale**: "Works in preview, broken in prod" incidents — e.g. shipping prod with the scheduler off or webhook verification dormant without any warning.
- **Fix**: A `core/config.py` (pydantic-settings) declaring every variable with per-`ENV` requirements; production boot fails loudly listing missing/insecure values (CORS `*`, unset webhook secret, S3 unconfigured).

### DEP-04 · Single region, no DR posture
- **Priority**: 🟢 LOW
- **What**: One DB host, one region (ap-south-1 implied), no failover target.
- **Fix**: After REL-02: replica set across AZs; document DR runbook (restore-to-new-region) — full multi-region is not justified yet.

---

# 8 · MONITORING & OBSERVABILITY

### MON-01 · No error tracking, metrics, or alerting of any kind
- **Priority**: 🔴 HIGH
- **What**: Verified: plain `logging.basicConfig` to stdout only. No Sentry, no Prometheus/StatsD, no uptime checks, no alert channel. The only "monitoring" is supervisor logs read manually.
- **Why it's a risk**: Every failure mode in this document is currently **invisible until a customer complains**. At thousands of tenants, complaint-driven ops means public outages and churn.
- **Impact at scale**: MTTD/MTTR measured in hours-to-days; silent partial failures (REL-04) never get detected at all.
- **Fix** (highest ROI first):
  1. **Sentry** (backend + frontend) — hours of effort, immediate visibility into exceptions.
  2. Structured JSON logs with `tenant_id`, `request_id` (contextvar middleware) → any log aggregator.
  3. `/metrics` endpoint (prometheus-fastapi-instrumentator): request latency/error rates, scheduler tick duration, queue depth, send success ratio, Mongo pool stats.
  4. Alerts: health-check down, error-rate spike, scheduler heartbeat gap (REL-06), webhook failure surge, daily-limit anomalies.

### MON-02 · No audit trail for staff/tenant actions
- **Priority**: 🟡 MEDIUM
- **What**: Changes to money-adjacent config (coupon definitions, loyalty settings, campaign audiences) are not attributed or logged anywhere.
- **Impact at scale**: Billing/points disputes ("who changed the earn rate?") cannot be resolved; insider misuse is undetectable; enterprise clients will require this contractually.
- **Fix**: `audit_logs` collection (append-only, TTL 2 years): `{user_id, actor, action, entity, before, after, at}` written from a small decorator on mutating endpoints of the critical routers.

### MON-03 · Health check is a constant; no readiness semantics
- **Priority**: 🟡 MEDIUM
- **What**: `/api/health` returns `{"status":"healthy"}` unconditionally — it does not check MongoDB, MyGenie, or the scheduler, and there's no separate liveness vs readiness.
- **Impact at scale**: Load balancers keep routing traffic to pods whose DB connection is dead; orchestration cannot self-heal.
- **Fix**: `/api/health/live` (process up) vs `/api/health/ready` (Mongo `ping` with 2s timeout + scheduler heartbeat age); wire readiness into ingress/K8s probes.

### MON-04 · Job logs exist but nothing consumes them
- **Priority**: 🟢 LOW
- **What**: `cron_job_logs` faithfully records scheduler runs; no one reads them programmatically.
- **Fix**: Once MON-01 exists, derive metrics/alerts from job outcomes (failure count, duration percentiles); expose a small "system status" admin page for the owner.

---

# 9 · Prioritized remediation roadmap

### Phase 0 — Stop the bleeding (this week, mostly infra/owner actions)
| Item | Findings | Registered CR |
|---|---|---|
| Lock down MongoDB (network, credentials, TLS) + verified backups + restore drill | SEC-01, REL-02 | **CR-046** |
| Set `AUTHKEY_WEBHOOK_SECRET`, activate HMAC; pin CORS origins | SEC-03, SEC-02 | **CR-047** |
| Remove `remembered_password`; add login/OTP rate limiting | SEC-04, SEC-06 | **CR-048** |

### Phase 1 — Scale foundations (next 1–2 sprints)
| Item | Findings | Registered CR |
|---|---|---|
| Add Redis; split worker from API; distributed job locks | SCA-01, SCA-05, SEC-06 | **CR-049** |
| Queue-based campaign sending with retries + DLQ | SCA-02, REL-05 | **CR-050** |
| Sentry + structured logs + metrics + real health checks | MON-01, MON-03, REL-04, REL-06 | **CR-051** |
| CI pipeline + branch model + staging environment | MAI-02, DEP-01, DEP-02 | **CR-052** |
| Refresh-token auth overhaul (httpOnly cookies, revocation) | SEC-05 | **CR-053** |

### Phase 2 — Hardening (following quarter)
| Item | Findings | Registered CR |
|---|---|---|
| Tenant-scoped data layer + isolation test suite | SCA-03 | **CR-054** |
| Hotspot file splits (one per sprint) | MAI-01 | **CR-041-F1** (pre-existing) |
| CR-041-F2 unique index + DM-01 campaign_id migration + TTL/retention | PER-02, DM-01, PER-03 | **CR-055** |
| MyGenie SSO circuit breaker + degraded login | REL-01 | **CR-056** |
| Config validation module; S3 mandatory in prod; API versioning for POS | DEP-03, REL-03, MAI-03 | **CR-057** |
| Secrets manager + per-tenant credential encryption; hashed POS keys | SEC-07, SEC-08 | **CR-058** |

### Phase 3 — Optimization (as volume demands)
| Item | Findings | Registered CR |
|---|---|---|
| Analytics rollups + replica reads; Mongo pool tuning; shard planning | PER-01, SCA-07, SCA-03 | **CR-059** (umbrella) |
| Per-tenant plan limits (monetizable) | SCA-06 | **CR-059** |
| Audit trail; PDF offload; money-as-integers; frontend tests; DR runbook | MON-02, SCA-08, DM-04, MAI-04, DEP-04 | **CR-059** |

> **Registered 2026-07-06**: all phases converted to CR-046 → CR-059 on `CR_STATUS_DASHBOARD.md` (intake: `crm/crm_roi_sprint/discovery/CR_046_059_AUDIT_REMEDIATION_BATCH_INTAKE.md`).

---

# 10 · Capacity & Breakpoints — how far does this architecture go?

> Added 2026-07-06 per owner request. **Method**: engineering estimates derived from code-verified constraints (single process, 1-minute scheduler tick, sequential campaign loop, measured ~33 msg/s send throughput from the CR-038 discovery, `to_list(10000)` audience cap, unindexed log growth) — **not load-test measurements**. A formal load test is registered as a follow-up under CR-051/CR-052. Baseline reality: 28 tenants, 5,971 customers, 24 campaigns on preprod today.

## 10.1 · Load model (per-tenant averages, owner-approved defaults)

| Driver | Assumption |
|---|---|
| Customers per tenant | ~350 (range 200–500) |
| Orders per tenant/day | ~50 (range 30–80), ~30% concentrated in a 2-hour meal peak |
| Campaigns per tenant | ~1.5/week, avg ~400 recipients, clustered at evening hours |
| Transactional WhatsApp (send_bill etc.) | ≈ 1 per order |
| Delivery callbacks | ≈ 2 per message (delivered + read) |
| Logins / dashboard views | ~3 / ~10 per tenant/day |

## 10.2 · Projected load by tier

| Metric | Today (~30) | **100 tenants** | **1,000 tenants** | **10,000 tenants** |
|---|---|---|---|---|
| Total customers | ~6k (actual) | ~35k | ~350k | ~3.5M |
| Orders/day | ~1.5k | ~5k | ~50k | ~500k |
| Peak order rate (meal window) | ~0.2/s | ~0.6/s | **~6/s** | **~60/s** |
| WhatsApp msgs/day (bill + campaign) | ~2.5k | ~8.5k | ~85k | ~850k |
| Webhook callbacks/day | ~5k | ~17k | ~170k | ~1.7M |
| `whatsapp_message_logs` growth/year | ~1M docs | ~3M | ~31M | ~310M |
| `orders`+`order_items` growth/year | ~3M docs | ~11M | ~110M | ~1.1B |

## 10.3 · Subsystem breakpoints (code-verified constraint → where it degrades → where it breaks)

| # | Subsystem | Hard constraint in current code | Degrades from | Breaks around | Fix |
|---|---|---|---|---|---|
| B1 | **Campaign send pipeline** | Sequential `for camp in due:` inside 1-min tick; ~33 msg/s effective throughput (CR-038 measurement: 15k msgs ≈ 7.5 min); `coalesce` silently skips ticks during long sends | **~100–150 tenants** — evening scheduling collisions cause minutes of slip | **~300–500 tenants** — peak waves (50 same-minute campaigns × 400 recipients ≈ 20k msgs ≈ 10 min/wave) cascade into hours of delay | CR-049 + **CR-050** (queue + workers) |
| B2 | **POS order ingestion** | One async process; each order ≈ 10 DB ops + WhatsApp HTTP + optional WeasyPrint PDF (CPU-bound 0.5–2s, blocks event loop) | **~300 tenants** (~2 orders/s peak) — P99 latency visible at meal peaks | **~500–1,000 tenants** (~3–6 orders/s peak) — event-loop saturation; POS timeouts on real restaurant traffic | CR-049 (split) + SCA-08 PDF offload (CR-059) |
| B3 | **Single-tenant audience size** | `to_list(10000)` at `campaigns.py:55` — silent truncation | n/a (tenant-size, not tenant-count) | **The first tenant with >10k customers** gets silently wrong campaign reach — a chain/food-court client triggers this at ANY tier | SCA-04 fix (fold into CR-050) |
| B4 | **Analytics dashboards** | Full aggregation pipelines per page load, no cache, no replica; shares DB CPU with ingestion | **~200–300 tenants** — multi-second dashboards at morning check-in concurrency | **~500–800 tenants** — concurrent pipelines saturate DB CPU and drag down POS ingestion (B2 arrives early) | SCA-05 cache (CR-049) + PER-01 rollups (CR-059) |
| B5 | **MongoDB (single instance)** | No replica set; message-log `$or` filters on partial index; no TTL — indexes outgrow RAM | **~300–500 tenants** (~30M msg-log docs/yr) — log/status queries slow first | **~1,000–2,000 tenants** — working set > RAM on one box; backups (once they exist) take hours | CR-055 (TTL/index/migration) + replica set + tuning (CR-057/059), sharding at 10k |
| B6 | **Webhook callback path** | 2×msgs/day volume; composite lookup w/o unique compound index (CR-041-F2 deferred); race-able duplicates | **~500 tenants** (~2/s avg, ~10/s burst) — lookup latency + duplicate-row risk grows with collection size | **~2,000+ tenants** — sustained bursts + collection bloat = wrong ROI statuses return | CR-055 (unique index) + CR-050 workers |
| B7 | **Login / MyGenie SSO** | 2 synchronous external calls per login; no circuit breaker; vendor availability = platform availability | Blast radius grows linearly from day 1 | **Not a throughput break** — an availability break: one MyGenie outage locks out ALL tenants at any tier | CR-056 (degraded login) — mandatory before 1,000 |
| B8 | **Daily-limit counting** | Global `DAILY_LIMIT=1000` const; check-then-act count query race | **~100 tenants** — big tenants demand plan tiers (commercial, not technical) | **~1,000 tenants** — concurrent sends breach caps under race | SCA-06 atomic per-tenant counters (CR-059) |
| B9 | **Tenant isolation (risk, not load)** | `user_id` filter convention across 21k+ LOC | Leak probability scales with (tenants × code-change rate) — at 1,000 tenants a leak is a company-ending event, not a bug | — | **CR-054 mandatory before 1,000** |

**Reading the table**: the first hard wall is **B1 (campaign pipeline) at ~300–500 tenants**, with B2/B4/B5 arriving together shortly after. Below ~100 tenants the current architecture holds with only Phase-0 fixes.

## 10.4 · What is needed at each tier

### ✅ Tier 1 — up to ~100 tenants (current architecture survives)
**Load**: 5k orders/day · 8.5k msgs/day · 0.6 orders/s peak — single process holds.
| Must do | Why | CR |
|---|---|---|
| Mongo lockdown + verified backups | Scale-independent — existential at any tier | CR-046 |
| Webhook HMAC + CORS + auth quick hardening | Attack surface grows with visibility | CR-047, CR-048 |
| **Observability first** | You cannot see B1–B5 approaching without metrics — this is the tier's most important engineering buy | CR-051 |
| Unique webhook index + TTL on audit logs | Cheap now, expensive to retrofit at 30M docs | CR-055 (a+c parts) |
| CI + branch model | Team safety before velocity | CR-052 |
**Infra footprint**: current pod shape + Redis (small) + Sentry. **No re-architecture needed.**

### ⚠️ Tier 2 — 100 → 1,000 tenants (re-architecture window)
**Load**: 50k orders/day · 85k msgs/day · 6 orders/s peak · 31M log docs/yr. **B1 breaks inside this tier — do these BEFORE ~300 tenants:**
| Must do | Why | CR |
|---|---|---|
| Worker/API split + distributed locks | Unlocks horizontal scaling; kills B2 | CR-049 |
| **Queue-based sending + retry/DLQ** | Kills B1 — the first hard wall | CR-050 |
| Tenant isolation layer + tests | B9 — non-negotiable at this blast radius | CR-054 |
| Full data hygiene (campaign_id migration, retention, validators) | Kills B5/B6 early | CR-055 (full) |
| SSO circuit breaker + degraded login | B7 — outage blast radius = 1,000 businesses | CR-056 |
| Refresh-token auth, config validation, POS API v1, secrets mgmt | Enterprise-readiness cluster | CR-053, CR-057, CR-058 |
| Dashboard caching + analytics rollups + replica reads | Kills B4 before it drags B2 down | SCA-05 (CR-049) + PER-01 (CR-059 promote early) |
**Infra footprint**: 2–4 API pods + 1–2 worker pods · Redis (locks/queue/cache/limits) · Mongo **replica set (3 nodes)**, tuned pools · S3 mandatory · staging env. Estimated infra cost step-change: single-box → small cluster.

### 🔺 Tier 3 — 1,000 → 10,000 tenants (platform build-out)
**Load**: 500k orders/day · 850k msgs/day · 60 orders/s peak · 310M log docs/yr.
| Must do | Why | CR |
|---|---|---|
| Shard MongoDB on `{user_id, _id}` (customers, orders, message logs) | B5 — single replica set exhausted | CR-059 → dedicated CR |
| Per-tenant plan limits + billing tiers | B8 + monetization at volume | CR-059 |
| Dedicated callback-ingestion worker + batched status writes | B6 at 1.7M callbacks/day (~20/s sustained) | CR-059 |
| Cold archival pipeline (12-month message logs → object storage) | Storage + backup windows | CR-055 extension |
| Multi-AZ + DR runbook + restore SLAs | Availability contract expectations | CR-059 / DEP-04 |
| Dedicated analytics path (rollup store / OLAP) | B4 at 10k concurrent dashboards | CR-059 |
| Load-testing + capacity CI gates | Replace this document's estimates with measurements | new CR at promotion |
**Infra footprint**: 8–15 API pods · 4–8 workers · sharded Mongo cluster · Redis cluster · CDN for frontend · on-call rotation. This tier is as much **organizational** (staging discipline, release trains, support tooling) as technical.

## 10.5 · External vendor ceilings (independent of our code)

| Vendor | Constraint | Bite point |
|---|---|---|
| **AuthKey.io** | Unknown contractual throughput; already shows duplicate-LogID defects at 3 concurrent sends (CR-040) | 850k msgs/day at Tier 3 **requires a vendor capacity conversation** — get throughput SLA in writing before Tier 2 exit |
| **Meta WhatsApp tiers** | Business-initiated conversations are capped **per WABA/phone number** (1k → 10k → 100k unique customers/24h, auto-scaling with quality) | Per-tenant numbers mean per-tenant caps — a tenant with >1k daily campaign recipients hits Meta's Tier-1 cap regardless of our architecture. Surface this limit in the campaign UI (good CR-059 sub-item) |
| **MyGenie preprod/prod API** | Login + profile + menu proxy throughput unknown | 2k login-hour bursts at Tier 2 need MyGenie-side confirmation; CR-056 reduces the dependency |

## 10.6 · One-line answer

> **Today's architecture is safe to ~100 tenants with only Phase-0 fixes. The first hard wall is the campaign send pipeline at ~300–500 tenants — CR-049+CR-050 must land before then. 1,000 tenants requires the full Phase-1/2 set (queue, worker split, replica set, isolation layer, SSO resilience). 10,000 tenants is a platform build-out: sharding, dedicated ingestion workers, archival, multi-AZ, and vendor capacity contracts.**

---

## Full findings index

| ID | Category | Finding | Priority |
|---|---|---|---|
| SEC-01 | Security | Public MongoDB + ransomware indicator | 🔴 HIGH |
| SEC-02 | Security | CORS wildcard + credentials | 🔴 HIGH |
| SEC-03 | Security | Unauthenticated status webhook (HMAC dormant) | 🔴 HIGH |
| SEC-04 | Security | Plaintext password in localStorage | 🔴 HIGH |
| SEC-05 | Security | JWT in localStorage, no refresh/revocation | 🔴 HIGH |
| SEC-06 | Security | No rate limiting / brute-force protection | 🔴 HIGH |
| SEC-07 | Security | Flat .env secrets; unencrypted tenant creds in DB | 🟡 MED |
| SEC-08 | Security | Static unhashed POS API keys | 🟡 MED |
| SEC-09 | Security | No security headers / dependency scanning | 🟡 MED |
| SEC-10 | Security | OTP hardening review | 🟢 LOW |
| SCA-01 | Scalability | Monolith: API+scheduler in one process | 🔴 HIGH |
| SCA-02 | Scalability | No queue — sends inside scheduler tick | 🔴 HIGH |
| SCA-03 | Scalability | Tenancy by convention (`user_id` filters) | 🔴 HIGH |
| SCA-04 | Scalability | Unbounded/oversized in-memory queries | 🟡 MED |
| SCA-05 | Scalability | No caching layer | 🟡 MED |
| SCA-06 | Scalability | Hardcoded racey daily limit | 🟡 MED |
| SCA-07 | Scalability | Untuned Mongo driver/pooling | 🟡 MED |
| SCA-08 | Scalability | PDF rendering in request path | 🟢 LOW |
| SCA-09 | Scalability | Sequential vendor sync loops | 🟢 LOW |
| REL-01 | Reliability | MyGenie SSO single point of failure | 🔴 HIGH |
| REL-02 | Reliability | Unverified backups / no restore path | 🔴 HIGH |
| REL-03 | Reliability | S3 local-disk fallback on ephemeral pod | 🟡 MED |
| REL-04 | Reliability | Silent failure patterns | 🟡 MED |
| REL-05 | Reliability | No send retry / dead-letter | 🟡 MED |
| REL-06 | Reliability | No skipped-tick detection | 🟢 LOW |
| PER-01 | Performance | Live aggregation analytics | 🟡 MED |
| PER-02 | Performance | Missing compound unique webhook index | 🟡 MED |
| PER-03 | Performance | Unbounded log growth, no TTL | 🟡 MED |
| PER-04 | Performance | N+1 assembly on detail endpoints | 🟢 LOW |
| DM-01 | Data model | Mixed campaign_id semantics | 🟡 MED |
| DM-02 | Data model | No DB-level schema validation | 🟡 MED |
| DM-03 | Data model | Unbounded tag array on users | 🟢 LOW |
| DM-04 | Data model | Money as floats | 🟢 LOW |
| MAI-01 | Maintainability | Hotspot mega-files | 🔴 HIGH |
| MAI-02 | Maintainability | No CI | 🟡 MED |
| MAI-03 | Maintainability | No API versioning (POS contract) | 🟡 MED |
| MAI-04 | Maintainability | No frontend tests | 🟢 LOW |
| DEP-01 | Deployment | No prod pipeline / branch model / staging | 🔴 HIGH |
| DEP-02 | Deployment | Dev-grade serving | 🟡 MED |
| DEP-03 | Deployment | No boot-time config validation | 🟡 MED |
| DEP-04 | Deployment | Single region, no DR | 🟢 LOW |
| MON-01 | Monitoring | No errors/metrics/alerting | 🔴 HIGH |
| MON-02 | Monitoring | No audit trail | 🟡 MED |
| MON-03 | Monitoring | Health check is a constant | 🟡 MED |
| MON-04 | Monitoring | Job logs unconsumed | 🟢 LOW |

---

*End of ARCHITECTURE_AUDIT.md · v1.0 · 2026-07-06 · 45 findings (14 High / 21 Medium / 10 Low)*
