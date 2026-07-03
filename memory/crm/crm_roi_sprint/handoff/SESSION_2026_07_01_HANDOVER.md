# Session Handover — 2026-07-01 (Branch: 1-july)

> **For**: Next Agent
> **Pod URL**: `https://react-python-crm-4.preview.emergentagent.com`
> **Branch**: `1-july` (from `Abhi-mygenie/CRMpreprod.git`)
> **DB**: Remote MongoDB `52.66.232.149:27017/mygenie` (live preprod data)
> **Written by**: E1 — Emergent

---

## MANDATORY SESSION START PROTOCOL

Before touching any code, do ALL of the following in order:

```
1. READ this handover document in full
2. READ /app/memory/control/MYGENIE_CRM_AGENT_SYSTEM_PROMPT_ALPHA_v0_1.md
3. READ /app/memory/CR_STATUS_DASHBOARD.md
4. READ /app/memory/DECISIONS_LOG.md (last 20 rows)
5. Verify services: sudo supervisorctl status → all RUNNING
6. Verify health: curl https://react-python-crm-4.preview.emergentagent.com/api/health
7. PRESENT OWNER WITH THE WORK QUEUE TABLE BELOW — ask what to pick up first
```

**Do NOT start any implementation until owner confirms priority.**

---

## Test Credentials

| Account | Password | Restaurant |
|---|---|---|
| `owner@cafe103.com` | `Qplazm@10` | CAFE 103 (primary smoke test) |
| `owner@kunafamahal.com` | `Qplazm@10` | Kunafa Mahal |
| `owner@palmhouse.com` | `Qplazm@10` | Palm House (hotel folio testing) |

---

## What Was Done This Session (2026-07-01)

### Implemented ✅
| Item | Files changed | Status |
|---|---|---|
| **CR-033**: 20 Additional Audience Filters | `core/helpers.py` (async build_customer_query + 20 filter blocks), `routers/campaigns.py`, `routers/customers.py`, `AudiencesPage.jsx` | 🟢 IMPLEMENTED |
| **CR-034**: Customer Tag System | `models/schemas.py`, `routers/customers.py` (5 endpoints), `core/helpers.py` (tags filter), `TagChip.jsx` (new), `CustomersPage.jsx`, `AudiencesPage.jsx`, `CustomerDetailPage.jsx`, migration script (2 VIP customers tagged) | 🟢 IMPLEMENTED |

### Bug Fixes ✅
| Bug | Root cause | Fix |
|---|---|---|
| Login 503 | `.env` had wrong MYGENIE_API_URL (`api.mygenie.in` → DNS failure) + full URL as endpoint path (double concat) | Fixed to `preprod.mygenie.online` + path-only endpoints |
| Tag popover navigates to customer detail | Click event bubbled from CommandItem → `<tr onClick={navigate}>` | Added `stopPropagation` on PopoverContent + onPointerDown |

### Investigation Only (INV-004) — no code changes
6 issues investigated. Full report: `/app/memory/crm/crm_roi_sprint/investigations/INV_004_MULTI_ISSUE_INVESTIGATION.md`

### New CRs Registered
| CR | Title | Status |
|---|---|---|
| **CR-035** | Customer List Export & Import | 📋 Registered — blocked on Q1-Q6 |
| **CR-036** | Media Header Upload for Template Builder | 📋 Discovery complete — blocked on Q1-Q3 |
| **CR-037** | Template Status Sync Fix (AuthKey overwrites rejected) | 🔵 Planning complete — gate OPEN |

---

## WORK QUEUE — Present This To Owner

> **Instructions for agent:** Show this table to the owner. Ask: *"Which item should I pick up first?"* Do not start work until owner responds.

### Group A — Ready to implement immediately (no questions needed)

| # | Item | Type | Effort | What it does |
|---|---|---|---|---|
| A1 | **CR-037**: Template status sync fix | Bug fix | ~15 min | `sync_authkey_templates()` overwrites `rejected` status with `approved`. 2-line fix in `routers/whatsapp.py`. Plan exists. |
| A2 | **CR-026**: Campaign "View Messages" deep-link | Feature | ~½ day | "View Messages" button on campaign cards → Message Status page pre-filtered by campaign_id. |
| A3 | **CR-032**: CRM Template feature flag | Feature | ~2 hrs | Per-tenant `features.crm_templates_enabled` toggle in Settings. Hides Template Builder for 79% of tenants who don't use it. Intake exists. |

### Group B — Needs owner questions answered first

| # | Item | Type | Effort | Blocked on |
|---|---|---|---|---|
| B1 | **CR-035**: Customer Export/Import | New Feature | ~8-10 hrs | Q1-Q6: format? fields? duplicate handling? | 
| B2 | **CR-036**: Image/Video header upload | Bug + Feature | ~5.5 hrs | Q1-Q3: which media types? max size? storage? |
| B3 | **CR-025**: Virtual Wallet | Large Feature | ~11-15 days | Owner Q1-Q10 (from CR-025 discovery doc) |

### Group C — Waiting on external dependency

| # | Item | Waiting for |
|---|---|---|
| C1 | **CR-014**: Hotel folio completion | POS team to send `room_info` fields (room_number, check_in, check_out) |
| C2 | **CR-023**: AuthKey button param wiring | Owner E2E Meta test + AuthKey button parameter docs |

### Group D — INV-004 issues requiring owner decision

| # | Issue | Finding | Owner action needed |
|---|---|---|---|
| D1 | **Scheduled campaigns not firing** | `CAMPAIGN_SCHEDULER_ENABLED="false"` in `.env` — intentionally gated | Owner approves flipping to `true` → restart backend |
| D2 | **EN message showing as Hindi** | Language key (`en_US`) is correctly passed to Meta. Root cause is likely AuthKey-side. | Check AuthKey console: look up the WID for the affected template and verify its language |
| D3 | **Loyalty not working (14 restaurants)** | `loyalty_enabled=false` in loyalty_settings. Not a code bug. | Owner goes to Settings → Loyalty → enable for each restaurant |

---

## Environment State

### `.env` variables (key ones)
```
MONGO_URL        → mongodb://...@52.66.232.149:27017/mygenie (LIVE DB)
MYGENIE_API_URL  → https://preprod.mygenie.online
MYGENIE_LOGIN_ENDPOINT → /api/v1/auth/vendoremployee/login
CAMPAIGN_SCHEDULER_ENABLED → "false"  ← deliberately OFF
CAMPAIGN_TIMEZONE → Asia/Kolkata
```

### Services
```bash
sudo supervisorctl status     # verify all RUNNING
sudo supervisorctl restart backend   # after .env changes
sudo supervisorctl restart frontend  # only after yarn add
```

---

## Key Architecture Notes for Next Agent

### build_customer_query() is now ASYNC
`core/helpers.py::build_customer_query()` was made async in CR-033 (needs DB for P2 cross-join filters). **All 4 callers already await it.** Do not call it sync anywhere new.

### Tag system (CR-034)
- `Customer.tags: List[str] = []` — field exists in schema
- `users.available_tags: List[str]` — stored directly in DB (NOT in Pydantic model)
- 5 endpoints in `routers/customers.py`: `GET /tags`, `POST /{id}/tags`, `DELETE /{id}/tags/{tag}`, `POST /bulk-tag`, `POST /bulk-untag`
- **Routing order critical**: `/tags` and `/bulk-tag` must stay ABOVE `/{customer_id}` in the file

### Template status flow (for CR-037 context)
- `check_template_status()` → reads Meta API → correct status (approved/rejected/pending)  
- `sync_authkey_templates()` → line 721 **blindly sets "approved"** — this is the bug
- Both run sequentially in `create_and_sync_template()` — sync overwrites the correct status

### MYGENIE SSO login
- Login delegates to `https://preprod.mygenie.online/api/v1/auth/vendoremployee/login`
- If MyGenie preprod is down → CRM login fails entirely (by design)
- Test credentials above work against preprod

---

## Key Docs to Reference

| Doc | Purpose |
|---|---|
| `/app/memory/control/MYGENIE_CRM_AGENT_SYSTEM_PROMPT_ALPHA_v0_1.md` | Full agent operating system + CRM addendum |
| `/app/memory/CR_STATUS_DASHBOARD.md` | Master CR board — update after every phase transition |
| `/app/memory/DECISIONS_LOG.md` | Owner-locked decisions — append-only |
| `/app/memory/crm/crm_roi_sprint/investigations/INV_004_MULTI_ISSUE_INVESTIGATION.md` | Full investigation report for the 6 issues |
| `/app/memory/crm/crm_roi_sprint/planning/CR_037_TEMPLATE_STATUS_SYNC_FIX_PLAN.md` | Ready-to-execute fix plan for CR-037 |
| `/app/memory/crm/crm_roi_sprint/planning/CR_033_CR_034_IMPL_PLAN.md` | Completed impl plan for CR-033+034 (reference) |
| `/app/memory/crm/crm_roi_sprint/discovery/CR_035_CUSTOMER_EXPORT_IMPORT_INTAKE.md` | CR-035 intake doc + Q1-Q6 |
| `/app/memory/crm/crm_roi_sprint/discovery/CR_036_MEDIA_HEADER_UPLOAD_DISCOVERY.md` | CR-036 discovery + Q1-Q3 |

---

## DO NOT List

| Rule | Reason |
|---|---|
| Do NOT flip `CAMPAIGN_SCHEDULER_ENABLED=true` without owner approval | Will immediately fire overdue campaigns to real customers |
| Do NOT send live WhatsApp without owner approval | Goes to real customer phones |
| Do NOT re-introduce demo login | Removed in CR-015c by owner decision |
| Do NOT use `npm` | Use `yarn` only — npm breaks CRA dependencies |
| Do NOT run destructive DB operations | This is live preprod data with real customers |
| Do NOT call `testing_agent_v3` without explicit owner OK | Owner sometimes opts out per session |
| Do NOT touch hotspot files without regression plan | `core/coupon.py`, `routers/pos.py`, `core/whatsapp.py`, `core/loyalty.py` |
| Do NOT start implementation without owner priority approval | Always present work queue first |

---

## Handover Agent Suggested Opening Message

When you start, present this to the owner:

```
Hi! I've read the handover from the previous session.

Here's the current work queue. Please tell me which item to pick up first:

GROUP A — Ready to go (no questions needed):
  A1. CR-037: Fix template status bug (15 min) — AuthKey sync marks rejected templates as "approved"
  A2. CR-026: Campaign "View Messages" button (½ day)
  A3. CR-032: CRM Template feature flag toggle in Settings (2 hrs)

GROUP B — Need your answers first:
  B1. CR-035: Customer Export/Import (6 questions)
  B2. CR-036: Image/Video header upload fix (3 questions)
  B3. CR-025: Virtual Wallet (10 questions, already documented)

GROUP C — Waiting on external teams:
  C1. CR-014: Hotel folio (waiting on POS team)
  C2. CR-023: AuthKey button params (waiting on you)

GROUP D — Owner action needed (no code):
  D1. Enable scheduled campaigns → approve CAMPAIGN_SCHEDULER_ENABLED=true
  D2. Hindi template → check AuthKey console for the WID language
  D3. Loyalty for 14 restaurants → Settings → Loyalty → Enable

Which shall I start with?
```

---

*End of Session Handover — 2026-07-01*
