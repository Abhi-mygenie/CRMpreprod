# MyGenie CRM — Consolidated Project Baseline

> **Baseline date**: 2026-09-08 · **Status code**: `baseline_2026_09_08_consolidated_awaiting_owner_signoff`
> **Role**: CLOSURE / PRE-RELEASE AUDIT (read-only — no application code changed)
> **Supersedes as entry point**: the "Latest Session Snapshot" in `CR_STATUS_DASHBOARD.md` and the bootstrap-era `PRD.md`. It does **not** replace the CR register, the decisions log, or the per-CR docs — it indexes them.
> **Companion**: `SECURITY_AUDIT_2026-09-08.md` (Phase 0), `ARCHITECTURE_AUDIT.md` v1.1 (2026-07-06), `control/MYGENIE_CRM_AGENT_SYSTEM_PROMPT_v0_2.md` (Phase 2).
> **Evidence rule**: every statement below was verified against the checkout, the running pod, the remote repo HEAD, or the remote MongoDB (read-only) on the baseline date. Where a doc and the code disagree, **code wins** and the doc is listed in §7.

---

## 1. How to use this document

| You are… | Read |
|---|---|
| A new agent starting a session | §2 (snapshot) → §3 (repo state) → §8 (process gaps) → then `README.md` §2 order |
| Owner deciding what to fund next | §9 (consolidated backlog) |
| Anyone touching a hotspot file | §5 + `SECURITY_AUDIT` §3 + addendum §7 regression table |
| Anyone about to trust a memory doc | §7 (known inconsistencies) first |

---

## 2. System snapshot (verified 2026-09-08)

| Item | Value |
|---|---|
| Product | Multi-tenant restaurant/hotel CRM: loyalty, coupons, WhatsApp automation & campaigns, POS integration, e-invoicing, customer intelligence |
| Stack | FastAPI 0.110 / Starlette 0.37.2 · Motor 3.3 · APScheduler · React 19 (CRA + craco) · Tailwind + Radix · WeasyPrint · boto3 (S3) |
| Repo | `Abhi-mygenie/CRMpreprod` — `main` @ `2089f9f` (2026-08-19 "Auto-generated changes") |
| Local checkout | `/app` — 2 platform commits; content == remote except **2 modified files + missing test suites** (see §3) |
| Backend size | 20 routers, 25 `include_router` calls, **26,476 LOC** (routers+core+services+models). Hotspots: `routers/pos.py` 3,619 · `routers/customers.py` 2,506 · `routers/whatsapp.py` 2,506 · `core/coupon.py` 2,457 · `routers/campaigns.py` 1,154 · `core/whatsapp.py` 959 |
| Frontend size | 26 pages, 29 routes in `App.js` |
| Database | Remote MongoDB `52.66.232.149:27017/mygenie` (shared preprod+prod, no TLS, public IP). Databases: `mygenie`, `mygenie_partners`. **39 tenants**, **7,503 customers**, 10 tenants with AuthKey keys. Ransomware artifact DB seen in July is gone. |
| Storage | AWS S3 `mygenie-prod` / `ap-south-1` — logos, media headers (chunked), invoices HTML/PDF, hotel documents. Local-disk fallback removed 2026-09-08 (uncommitted). |
| Integrations | MyGenie POS (SSO pass-through login + order webhooks + CRM-token push) · AuthKey.io (WhatsApp send + status webhook) · Meta Graph API v21 (template submit/status/uploads) · Freshmarketer webhook (`POST /api/pos/webhook`) |
| Scheduler | 2 APScheduler jobs in-process: daily loyalty jobs; per-minute `process_due_campaigns` — **gated OFF** (`CAMPAIGN_SCHEDULER_ENABLED=false`) |
| Feature flags (pod) | `CRM_TEMPLATES_ALLOWED_RESTAURANT_IDS=510` (UI-only visibility; backend gate removed in CR-061) · `POS_REQUEST_LOGGING_ENABLED=false` · `AUTHKEY_WEBHOOK_SECRET=` (empty → HMAC dormant) · `CORS_ORIGINS=*` |
| Health | `GET /api/health` → healthy; login page renders |
| Test credentials | `memory/test_credentials.md` is **EMPTY**. Known aliases from docs: `owner@kunafamahal.com`, `owner@18march.com`, `owner@jehsnest.com`, `owner@hungry.com` (passwords in `CR_STATUS_DASHBOARD.md` history / owner) |
| Test reports | `/app/test_reports/iteration_1..10.json` (latest: CR-079/080/081, 26/26 pass) |

---

## 3. Repository state — local vs remote (must be resolved first)

| Finding | Evidence | Impact | Action |
|---|---|---|---|
| **INC-01 · Automated test suites absent from checkout** — **RESOLVED 2026-09-08** | Restored 27 suites unchanged from remote; 330 tests collect; baseline run **257 pass / 69 fail / 2 error / 4 skip** — all failures classified as fixture drift (stale hardcoded JWT/API key/JWT secret) or preprod-data state; **0 confirmed app regressions**. Report: `/app/test_reports/pytest/BASELINE_2026-09-08_REPORT.md`. | Regression net restored for whatsapp/customers/campaigns/loyalty hotspots. `pos.py` suite blocked on API-key fixture; coupon/auth/invoice still uncovered. | Fix 4 fixture-drift suites (REGRESSION role, test files only) — owner approval pending. |
| **INC-02 · Legacy coupon QA suites (142 tests) never reached the repo** | `qa_cr001c_*` / `qa_cr021_*` referenced in addendum §7, CR-021/022 rows ("142/142 PASS") — **not in remote HEAD, not local**. | Coupon engine (`core/coupon.py`, CRITICAL) has no surviving automated tests. | Register a CR to rebuild coupon regression (V1/V2/V3-B/V3-C) from the QA reports' assertion lists. |
| **INC-03 · Uncommitted local changes** | `routers/auth.py`, `routers/whatsapp.py` differ from remote (S3-only refactor, 2026-09-08). No CR/BUG marker, no registry row. | Violates registry rule "no code without ID"; would be lost on re-bootstrap. | Register as `CR-084 S3-only file staging` (or fold into CR-057(b)); push via "Save to GitHub". |
| **INC-04 · Other files not pulled** | `design_guidelines.json`, `backend_test.py`, `data/bug_registry.xlsx`, `data/invoices/*` (legacy local invoice artifacts) | `design_guidelines.json` is needed by design work; invoice files are obsolete after S3 migration. | Pull `design_guidelines.json`; leave `data/invoices` out (S3 is authoritative). |
| **INC-05 · Register/dashboard/PRD drift** | Register lists up to **CR-083**; dashboard board rows end at CR-082; `PRD.md` (bootstrap version) knows none of it; `README.md` §6 says "currently up to CR-016". | New agents pick wrong "next CR number" and wrong sprint context. | This baseline + `PRD.md` refresh (done 2026-09-08). Owner to confirm CR-083 content. |

---

## 4. Module & change-request status matrix (condensed from dashboard + register + QA reports)

Legend: 🟢 closed · ✅ QA pass, **owner smoke pending** · 🟡 implemented, QA pending · 🔵 approved/plan ready · ⏸ parked · 📋 registered only · ❌ cancelled

### 4.1 Shipped and closed (🟢)
CR-002/002B loyalty & birthday · CR-003 coupon analytics P1 · CR-004 WhatsApp utility+marketing (P3.5) · CR-005/006/007/008/009/010 · CR-014 e-invoice (3 modes; hotel `room_info` is POS-side) · CR-015/015a/b/c · CR-017/018 max-redeemable projections · CR-020 variable picker · CR-021/022 coupon engine fixes · CR-023 template builder P1-3 · CR-024 campaigns P1-4 (scheduler flag OFF) · CR-027 env vars · CR-028+BUG-008 POS key settings · CR-029 forgot-password link hidden · CR-030 Freshmarketer webhook · CR-036 media header A→B.3 · CR-039 webhook composite key · CR-041 timestamp gate · CR-063 · CR-065 · BUG-001…009, 011, 012, 015-024

### 4.2 QA passed — **awaiting owner smoke / acceptance** (✅)
CR-033 audience filters · CR-034 tags · CR-035 export/import · CR-037 status sync · CR-042 message export · CR-043 tag filter UX · CR-061 gate removal · CR-066 Meta compliance V11-V23 · CR-069 button mapping · CR-071+072 B2B GST + hotel docs · CR-075 doc migration · CR-076 lifecycle re-engage · CR-077 configurable thresholds · CR-079/080/081 POS customer/loyalty/coupon APIs (POS contract v1.0 published) · CR-078 intelligence report (🟡 QA handover written, agent run pending)

### 4.3 Approved / plan ready, not implemented (🔵)
CR-032 templates feature-flag (superseded in practice by CR-061 — confirm cancel) · CR-062 formatting toolbar (mockup approved; **implemented per CR-066 row — status conflict, see §7**) · CR-067 template deletion lifecycle (decisions log says "Implementation Complete" 2026-08-06 — **status conflict**) · CR-068 validate-template dry run (same conflict) · CR-082 anonymous coupon flag (HIGH, `core/coupon.py`, awaiting approval)

### 4.4 Parked / deferred (⏸)
CR-011 coupon optimizer · CR-012/013 builder+gallery (largely superseded by CR-023) · CR-016 dynamic event registry · CR-025 virtual wallet (Q1-Q10) · CR-031 templates tab restructure · CR-045 bulk customer actions · CR-064 customer delete (hard-vs-soft policy) · CR-023 P2 einvoice_token button wiring (partly delivered by CR-069) · CR-036 B.4 test automation (Q22/Q23)

### 4.5 Registered only (📋) — audit remediation & ops
CR-026 view-messages deep link (largely delivered by BUG-012 — confirm close) · CR-038 scheduler scale-out (Q1-Q4) · CR-040 AuthKey duplicate-LogID vendor escalation · **CR-046 → CR-059 architecture-audit remediation (14 CRs, none started)** · CR-060 import modal · CR-083 (register only — content to confirm)

### 4.6 Cancelled (❌)
CR-019 send_bill key mismatch · BUG-024 (owner-side)

---

## 5. Security gaps — summary (full detail: `SECURITY_AUDIT_2026-09-08.md`)

| Sev | ID | One-liner | Existing CR |
|---|---|---|---|
| 🔴 | SEC-P0-01 | `POST /api/scan/auth/skip-otp` mints customer tokens with no verification | **none — new** |
| 🔴 | SEC-P0-02 | Customer OTP returned in response (`dev_otp`) + logged | SEC-10 / CR-059 (under-scoped) |
| 🔴 | SEC-P0-03 | Staff password-reset OTP returned in response; UI link hidden only (CR-029) | CR-029 (mitigation, not fix) |
| 🔴 | SEC-P0-04 | `meta_access_token` in `/auth/me`; `authkey_api_key` clear in `/whatsapp/settings` | **none — new** |
| 🔴 | SEC-P0-05 | Public Mongo, no TLS, admin app user | CR-046 |
| 🔴 | SEC-P0-06 | Any tenant can run `POST /api/cron/trigger-all-users` (all tenants' loyalty jobs) | **none — new** |
| 🟠 | P1-01…07 | No rate limiting · CORS `*` · webhook HMAC dormant · 24h JWT no revocation · plaintext remember-me password · plaintext tenant credentials · plaintext POS keys | CR-048 · CR-047 · CR-047 · CR-053 · CR-048 · CR-058 · CR-058 |
| 🟡 | P2-01…07 | Open self-registration · 22 CVEs (Starlette 0.37.2, litellm, ecdsa) · no security headers · PII/debug logging · `detail=str(e)` leakage · unscoped secondary reads · flat .env secrets | new · CR-052/058 · CR-058 · new · new · CR-054 · CR-058 |

**Net**: 4 new P0/P2 items have **no registered CR** (skip-otp, secret exposure, cron-all, self-registration). The 14 audit CRs (046-059) registered on 2026-07-06 have **zero implementation progress** in two months while ~20 feature CRs shipped.

---

## 6. Architecture issues — status of the July audit (45 findings)

| Area | Findings | Status 2026-09-08 | Notes |
|---|---|---|---|
| Security (SEC-01…10) | 10 | 2 partially remediated (JWT fallback removed; ransomware artifact gone), 8 open + 4 new | see §5 |
| Scalability (SCA-01…09) | 9 | **all open** | single process (API + scheduler), no queue, isolation by convention, unbounded `to_list(1000)` |
| Reliability (REL-01…06) | 6 | REL-03 remediated (S3-only, uncommitted); 5 open | SSO SPOF, unverified backups, silent `except: pass`, no retry/DLQ, skipped ticks undetected |
| Performance (PER-01…04) | 4 | all open | live aggregations, missing compound unique index, no TTL on log collections |
| Data model (DM-01…04) | 4 | all open | mixed `campaign_id` semantics, no validators, floats for money |
| Maintainability (MAI-01…04) | 4 | worse | hotspots grew (`pos.py` 2,929 → 3,619; `customers.py` 1,738 → 2,506; `whatsapp.py` 1,550 → 2,506); tests exist upstream but **no CI runs them**; zero frontend tests |
| Deployment (DEP-01…04) | 4 | all open | no pipeline/branch model; preview serves live data; no boot-time config validation |
| Monitoring (MON-01…04) | 4 | all open | no Sentry/metrics/alerts; health is a constant |

**Structural conclusion**: the codebase is feature-rich and QA'd per-CR, but platform/NFR work has been consistently out-prioritised. The three findings that gate *everything else* are **CR-046 (DB lockdown + backups)**, **CR-052 (CI running the 28 suites)**, and **CR-049 (scheduler/API split)**.

---

## 7. Known inconsistencies (doc-vs-code, doc-vs-doc)

| # | Where | Says | Reality | Fix owner |
|---|---|---|---|---|
| D-01 | `PRD.md` (bootstrap) | Setup-only doc, 4 backlog lines | 6-month sprint with 83 CRs | Replaced 2026-09-08 (points here) |
| D-02 | `README.md` §6, §9 | "currently up to CR-016"; "Do NOT call testing_agent" | Register at CR-083; testing agent re-enabled 2026-06-18 (dashboard chronology #8) | README update |
| D-03 | Agent prompt addendum §10.4 | "boto3 installed but no active S3 usage" · Stripe "installed but unused" | S3 is core (logos, media, invoices, documents); `stripe` no longer in requirements | Prompt v0.2 |
| D-04 | Addendum §3, §7, §14 | 15 routers · pos.py 2,929 LOC · "Do NOT run testing_agent_v3" · branch `17-june` | 20 routers · 3,619 LOC · testing agent allowed · branch `main` | Prompt v0.2 |
| D-05 | Addendum §4 env table | 11 backend vars | 30+ keys in `.env` (CR-027 + S3 + Meta + templates allowlist) | Prompt v0.2 |
| D-06 | Addendum §11 / README §8 | Credentials live in `CR_STATUS_DASHBOARD.md` / `test_credentials.md` | `test_credentials.md` empty; dashboard has one plaintext credential in "Next-agent message" | Owner to populate `test_credentials.md`; remove plaintext creds from dashboard |
| D-07 | Dashboard header vs body | "Last updated 2026-08-06" | Body still carries the 2026-06-18 "Next-agent handoff message" block and the 2026-07-29 snapshot; "Active queue" table (§240) still lists CR-014/023 as next | Dashboard cleanup |
| D-08 | Dashboard row CR-062 / CR-067 / CR-068 | 🔵 plan gate open | `DECISIONS_LOG` 2026-08-06 "Implementation Complete" for 067/068; CR-066 row says CR-062 toolbar shipped | Reconcile with code markers (`grep CR-062/067/068`) |
| D-09 | Dashboard row CR-063 | Appears twice (📋 and 🟢) | Shipped | Delete stale row |
| D-10 | Dashboard row CR-061 | Two concatenated rows (planning text after QA text) | Shipped/QA pass | Row cleanup |
| D-11 | CR-029 row | "Forgot password disabled (OTP security)" | Backend endpoints still return OTP; only the link is hidden | Track as SEC-P0-03 |
| D-12 | Addendum §7 regression table | "Run ALL `qa_cr001c_*` + `qa_cr021_*` (142+)" | Those files don't exist anywhere | INC-02 |
| D-13 | `BUG_REGISTRY_CAMPAIGNS.md` | BUG-001…009 | Dashboard references BUG-010…024 with no registry rows | Registry backfill |
| D-14 | `README.md` §7 | Preview URL hardcoded `c158ad1e-…` | Pod URL rotates; only `frontend/.env` is truth | README update |
| D-15 | Handover 2026-07-12 | "`backend/.env` has `__PLACEHOLDER_*`" | Real values populated on this pod | Historical — mark as superseded |

---

## 8. Process & governance gaps observed across the sprint (input to prompt v0.2)

| # | Gap | Evidence in history |
|---|---|---|
| G-01 | **Role slide without gate** — investigation/intake sessions drift into edits | README §9.8 exists *because* it happened; CR-069 "one bug found+fixed by testing agent"; CR-030 "3 Pydantic bugs found+fixed by QA agent" (QA must never fix) |
| G-02 | **Missing prerequisites not treated as a stop** | Sessions ran with placeholder `.env` (2026-07-12), empty `test_credentials.md`, absent test suites (this pod) |
| G-03 | **Regression not a workflow step** | Hotspot regression table lives in addendum §7 only; no role output block requires a `REGRESSION RESULT`; 142-test coupon net silently lost |
| G-04 | **Registry sync is optional in practice** | Uncommitted S3 refactor without ID; BUG-010…024 without registry rows; CR status conflicts (D-08) |
| G-05 | **Security debt starved** | CR-046…059 registered 2026-07-06, 0 % progress; 4 new P0s introduced/unnoticed meanwhile |
| G-06 | **Stale project facts in the operating prompt** | D-03/04/05 |
| G-07 | **No session-end enforcement** | Multiple sessions ended without handover (dashboard "latest snapshot" reused for 6 weeks) |
| G-08 | **Platform-vs-project instruction conflicts unresolved** | Testing-agent opt-out vs platform mandate; "add comments" vs code-marker rule |

---

## 9. Consolidated backlog (recommended; owner re-orders)

### P0 — do before any further feature work
1. **Restore `backend/tests/` from remote** (INC-01) and run the 28 suites → record pass/fail as the regression baseline.
2. **Security R1 fast-track** (6 removals, ~1 h): strip OTPs from responses (P0-02, P0-03), drop `meta_access_token` from `/me`, mask `/whatsapp/settings`, gate/remove `cron/trigger-all-users`, remove `dev_otp` log. Register as **BUG-025…029** or one **CR-085 Security R1**.
3. **Gate or delete `skip-otp`** (P0-01) — needs owner decision: is silent kiosk login a product requirement? If yes → POS `X-API-Key` + flag.
4. **CR-046** DB lockdown + backups (owner infra) — unblocks all data migrations.
5. **Register + commit the S3-only refactor** (INC-03).
6. **Populate `test_credentials.md`; purge plaintext credentials from dashboard** (D-06).

### P1 — this sprint
7. **CR-047 + CR-048**: webhook HMAC, CORS pinning, remember-me removal, `slowapi`.
8. **CR-052**: CI running pytest + eslint + `yarn build` + `pip-audit` on PR; protected `main`.
9. **Rebuild coupon regression suite** (INC-02) before CR-082 (anonymous coupon) is implemented.
10. **Dependency bump**: Starlette/FastAPI supported line (SEC-P2-02) behind CI.
11. **Owner smoke for the 15 ✅ items** (§4.2) — each becomes 🟢 or a BUG.
12. **Status reconciliation** for CR-026/032/062/067/068 (D-08) via code markers.

### P2 — next sprint
13. CR-049 → CR-050 (worker split, queue) · CR-051 observability · CR-053 session overhaul · CR-054 tenant isolation layer · CR-055 data hygiene · CR-056 SSO resilience · CR-057 config validation · CR-058 secrets/credential encryption.
14. Registration gate (SEC-P2-01), security headers, PII log masking, `detail=str(e)` cleanup.
15. Feature backlog: CR-082, CR-025, CR-016, CR-045, CR-064, CR-060, CR-038, B.4 automation.

---

## 10. Baseline declaration

```text
Closure/Baseline complete
Items shipped (🟢): 45+ CRs/BUGs
QA-passed awaiting owner smoke (✅): 15
Approved not implemented (🔵): 5 (3 with status conflicts)
Parked (⏸): 9
Registered only (📋): 19 (14 = architecture-audit remediation, 0 % started)
Security: FAIL — 6 P0 (4 unregistered)
Regression net: ABSENT on this pod (restorable: 28 suites upstream; 142 coupon tests lost)
Reconciliation needed: INC-01…05, D-01…15
Report: /app/memory/PROJECT_BASELINE_2026-09-08.md
Next: Owner sign-off on §9 P0 order → Phase 2 agent prompt v0.2 (in progress)
```
