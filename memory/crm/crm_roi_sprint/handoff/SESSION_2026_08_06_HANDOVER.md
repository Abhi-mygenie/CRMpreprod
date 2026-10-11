# Session Handover — 2026-08-06 (Full Session)

**Date**: 2026-08-06
**Branch**: main (Abhi-mygenie/CRMpreprod)
**Pod URL**: https://mygenie-crm-react.preview.emergentagent.com
**DB**: Remote MongoDB 52.66.232.149:27017/mygenie (live preprod data)

---

## What happened this session

### 1. Backend .env updated + services restarted
6 values changed, 6 new keys added from production server:

| Key | Change |
|---|---|
| MYGENIE_CRM_TOKEN_ENDPOINT | /api/v1/crm_token → /api/v1/auth/restaurant-crm-token |
| META_GRAPH_API_URL | v18.0 → v21.0 |
| JWT_SECRET | mygenie_crm_jwt_secret_2024_secure_key → dinepoints-secret-key-2024 |
| POS_REQUEST_LOGGING_PATH_PREFIX | /api/pos/ → /api/pos |
| POS_REQUEST_LOGGING_BODY_MAX_BYTES | 10240 → 50000 |
| POS_REQUEST_LOGGING_CAPTURE_RESPONSE_BODY | false → true |
| NEW: AUTHKEY_WEBHOOK_SECRET | (empty — dormant HMAC) |
| NEW: CRM_EXTERNAL_URL | https://crm.mygenie.online |
| NEW: POS_REQUEST_LOGGING_MASK_HEADERS | authorization,x-api-key,cookie |
| NEW: POS_REQUEST_LOGGING_MASK_BODY_FIELDS | token,api_key,crm_token,password,... |
| NEW: PUBLIC_BACKEND_URL | https://crm.mygenie.online |
| NEW: CRM_TEMPLATES_ALLOWED_RESTAURANT_IDS | 510 |

Services restarted. Health confirmed. Login smoke passed with new JWT_SECRET.

### 2. QA runs executed

| Item | Result | Test iterations |
|---|---|---|
| CR-069 Template Button Variable Mapping | ✅ 5/5 backend + V1-V5 frontend PASS | iter_5 + iter_6 |
| BUG-011 Campaign History counters | ✅ pytest 3/3 PASS | iter_7 |
| BUG-012 View Messages deep-link race | ✅ Playwright 3/3 PASS | iter_7 |
| CR-061 Template gate removal | ✅ pytest 13/13 PASS | iter_8 |

**Bugs found+fixed during QA (no owner action needed):**
- CR-069: `build_body_values()` leaked `btn_url_` keys into body output → fixed in `core/whatsapp.py`
- CR-069: Map Variables dialog missing button preview bubbles → fixed in `TemplatesPage.jsx`
- BUG-011: Missing `resolve_variable` stub in test file → fixed in `tests/test_bug011_run_stats.py`

### 3. Investigation + Registry work
- Investigation confirmed CR-014, CR-023, CR-036 B.1-B.3 were always code-complete (stale dashboard)
- Registry reconciled: all CR/BUG statuses updated across CR_STATUS_DASHBOARD.md + BUG_REGISTRY_CAMPAIGNS.md
- BUG-024 investigated (template button URL 404) → CLOSED per owner decision
- Excel bug report created: /app/frontend/public/bug_registry.xlsx (downloadable)

---

## Current QA state — everything QA'd

| Status | Items |
|---|---|
| ✅ QA PASS + Owner smoke pending | CR-069, CR-076, CR-077, CR-071+072, CR-073, BUG-011, BUG-012, CR-061, BUG-013, BUG-014, BUG-020–023 |
| ✅ Closed | CR-014, CR-023, CR-036 B.1-B.3, BUG-024, CR-024–043 (older items) |
| Self-test only | CRM-2 (testing agent not formally run) |
| 🔴 Open | **NONE** |

---

## Test credentials

| Account | Password | Tenant |
|---|---|---|
| owner@kunafamahal.com | Qplazm@10 | Kunafa Mahal (restaurant_689) — primary |
| owner@hungry.com | Qplazm@10 | Hungry Keya (restaurant_634) — WhatsApp templates |
| owner@palmhouse.com | Qplazm@10 | Palm House hotel (restaurant_558) — B2B/documents |
| owner@welcomeresort.com | Qplazm@10 | Welcome Resort (restaurant_474) |
| owner@jehsnest.com | Qplazm@10 | Jeh's Nest hotel (restaurant_635) — gate removal test |

---

## Open items for next session

### CR-075 — Start here first
**Document Migration from POS Local Disk** — endpoint validated 2026-08-06.
Key findings (read `discovery/CR_075_ENDPOINT_VALIDATION.md` before starting):
- GST backfill already works via existing migration sync (no new code needed)
- `booking_documents` field confirmed in response: `{name, id_type, front_image, back_image}`
- Images at `manage.mygenie.online/storage/IDFile/` — must download + re-upload to S3
- Most entries are empty stubs (`id_type = "Select document type"`) — must filter
- Needs per-tenant mygenie_token from DB
- Status: **NOT formally registered** → next agent: INTAKE role → register + intake doc

### Owner smoke tests (no code needed)
1. **CR-069**: Templates page → Map Variables on `final_bill` → confirm Feedback + Bill button bubbles visible → map `btn_url_{{1}}` to `einvoice_token`
2. **CR-076**: Lifecycle page → select Churned → "Re-engage Churned (N)" CTA → Campaign Wizard pre-fills "Churned Customers"
3. **CR-077**: Loyalty Settings → Lifecycle & Engagement section → change a threshold → Lifecycle page counts update
4. **CR-071+072**: B2B customer check-in flow on hotel tenant (palmhouse/jehsnest) + document upload

### One switch to flip
5. **CAMPAIGN_SCHEDULER_ENABLED=true** — enables recurring lifecycle campaigns. Currently false (safe default). Flip in .env + restart backend when owner is ready for live auto-firing.

### Formal QA (code done, one testing_agent pending)
6. **CRM-2**: `POST /api/pos/customers/{id}/documents` 400 fix — self-test PASS, testing_agent not run

### Registered, not started
- CR-032 (CRM template feature flag per-tenant)
- CR-062 (Bold/Italic/Strike toolbar in Template Builder)
- CR-067 (Template deletion lifecycle)
- CR-068 (Validate Template dry-run)
- CR-075 (Hotel document migration from POS disk)
- CR-076 B.4 (test automation — Q22/Q23 pending owner approval)
- CR-046–058 (security/infra audit — owner-infra items)

---

## DO NOT
- Do NOT send live WhatsApp without owner approval (real customer phones)
- Do NOT change coupon/loyalty/POS order math without owner approval
- Do NOT run destructive DB operations on live preprod data
- Do NOT re-introduce demo login (CR-015c)
- Do NOT delete/modify customer B2B fields without the never-downgrade guard
- Do NOT flip CAMPAIGN_SCHEDULER_ENABLED=true without owner approval

---

## Key files changed this session
- `/app/backend/.env` — updated with production values
- `/app/backend/core/whatsapp.py` — btn_url_ filter in build_body_values (CR-069 fix)
- `/app/frontend/src/pages/TemplatesPage.jsx` — button bubble rendering in Map dialog (CR-069 fix)
- `/app/backend/tests/test_bug011_run_stats.py` — resolve_variable stub added (test fix)
- `/app/memory/CR_STATUS_DASHBOARD.md` — full registry reconciliation
- `/app/memory/BUG_REGISTRY_CAMPAIGNS.md` — full registry reconciliation
- `/app/frontend/public/bug_registry.xlsx` — downloadable bug report
