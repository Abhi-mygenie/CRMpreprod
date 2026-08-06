# Session Handover — 2026-08-06 B (CR-075 Validation Session)

**Date**: 2026-08-06
**Branch**: main (Abhi-mygenie/CRMpreprod)
**Pod URL**: https://mygenie-crm-preview-2.preview.emergentagent.com
**DB**: Remote MongoDB 52.66.232.149:27017/mygenie (live preprod data)
**Role this session**: Investigation / Validation Agent

---

## What happened this session

### 1. Repo bootstrapped
- Pulled main branch fresh from `Abhi-mygenie/CRMpreprod`
- Backend `.env` configured with all production env vars
- All deps installed (`pip install` + `yarn install`)
- Services UP — backend health confirmed at `/api/health`
- Login page renders correctly at preview URL

### 2. Handover read
- Read `SESSION_2026_08_06_HANDOVER.md` (previous session)
- Confirmed CR-075 was top priority for this session

### 3. CR-075 endpoint validated (live curl)

Ran live `POST` against the POS customer migration endpoint using a real mygenie_token
(restaurant_id=478). Full Python analysis of the JSON response.

**Key findings:**

| Item | Result |
|---|---|
| Endpoint responds | ✅ 64 customers, restaurant_id=478 |
| GST data present | ✅ 9 customers with gst_name + gst_number |
| `booking_documents` field exists | ✅ |
| Real (non-stub) documents | 32 entries across 5 customers |
| Pagination needed | ❌ All 64 returned in one call, no pagination keys |
| `manage.mygenie.online` images | ✅ HTTP 200 (500KB–1MB) |
| `dev.mygenie.online` images | ✅ HTTP 200 |
| `preprod.mygenie.online` images | ❌ HTTP 404 — broken path `/storage/;/IDFile/` |

**Document breakdown:**
- License: 16 · Aadhar card: 10 · Passport: 5 · Other: 1
- 16/32 have back_image · 16/32 front-only
- 9 docs permanently unrecoverable (preprod 404 — POS May 2025 URL bug)
- 23 docs recoverable via download → S3 upload

### 4. Architecture decision locked — NO new button

Owner confirmed: same API, no reason for a second button.
Decision: extend existing `Sync Customers` flow in `background_customer_sync()` to also
process `booking_documents` field (currently ignored). MigrationPage.jsx unchanged.

### 5. Documents updated
- `discovery/CR_075_ENDPOINT_VALIDATION.md` — full rewrite with live findings, Gap 3 (broken URLs), Gap 6 (null names), architecture decision, updated implementation sketch
- `00_register/ROI_MEASUREMENT_CR_REGISTER.md` — CR-075 formally registered (row 28)
- `CR_STATUS_DASHBOARD.md` — CR-075 board row added, session snapshot updated, recent transition added
- `DECISIONS_LOG.md` — 2 new entries (CR-075 registration + same-button decision)
- This handover file created

---

## Test credentials

| Account | Password | Tenant |
|---|---|---|
| owner@kunafamahal.com | Qplazm@10 | Kunafa Mahal (restaurant_689) — primary |
| owner@hungry.com | Qplazm@10 | Hungry Keya (restaurant_634) — WhatsApp templates |
| owner@palmhouse.com | Qplazm@10 | Palm House hotel (restaurant_558) — B2B/documents |
| owner@welcomeresort.com | Qplazm@10 | Welcome Resort (restaurant_474) |
| owner@jehsnest.com | Qplazm@10 | Jeh's Nest hotel (restaurant_635) |

---

## Open items for next session

### Start here — CR-075 Planning
1. **Read first**: `discovery/CR_075_ENDPOINT_VALIDATION.md` (this session's findings)
2. **Q1 to resolve before coding**: Does `booking_documents` appear on paginated pages?
   Test with a paginated call on a hotel tenant (palmhouse=558 or jehsnest=635).
   Confirm exact field name for `mygenie_token` in `users` collection.
3. **Write**: `planning/CR_075_IMPLEMENTATION_PLAN.md` — edit-by-edit plan inside
   `background_customer_sync()` in `routers/migration.py` (+~80 LOC)
4. **Gate**: Owner approval before implementation (per addendum §14 — migration touches live data)

### CRM-2 formal QA (still pending from previous session)
5. `POST /api/pos/customers/{id}/documents` with valid POS key + no file → expect 400
   Self-test PASS. testing_agent_v3 not yet run. Can run alongside CR-075 planning.

### Owner smoke tests (no code — owner action)
6. CR-069: Templates page → `final_bill` → Map Variables → Feedback + Bill button bubbles visible
7. CR-076: Lifecycle page → Churned → Re-engage CTA → Campaign Wizard pre-fills "Churned"
8. CR-077: Loyalty Settings → Lifecycle & Engagement → change threshold → counts update
9. CR-071+072: B2B hotel check-in flow on palmhouse/jehsnest + document upload/view

### One switch to flip (owner must approve)
10. `CAMPAIGN_SCHEDULER_ENABLED=true` in `/app/backend/.env` → restart backend

### POS team flag
11. Inform POS team: 9 documents from `preprod.mygenie.online/storage/;/IDFile/` are
    permanently unrecoverable. No action needed on CRM side — just awareness.
    Future uploads should always go to `manage.mygenie.online`.

---

## Files changed this session

- `/app/memory/crm/crm_roi_sprint/discovery/CR_075_ENDPOINT_VALIDATION.md` — full rewrite
- `/app/memory/crm/crm_roi_sprint/00_register/ROI_MEASUREMENT_CR_REGISTER.md` — row 28 added
- `/app/memory/CR_STATUS_DASHBOARD.md` — header + board row + transition
- `/app/memory/DECISIONS_LOG.md` — 2 new entries
- `/app/memory/crm/crm_roi_sprint/handoff/SESSION_2026_08_06_B_HANDOVER.md` — this file

## No code changes this session
Zero production code was modified. All changes are documentation only.

---

## DO NOT
- Do NOT send live WhatsApp without owner approval (real customer phones)
- Do NOT change coupon/loyalty/POS order math without owner approval
- Do NOT run destructive DB operations on live preprod data
- Do NOT re-introduce demo login (CR-015c)
- Do NOT delete/modify customer B2B fields without the never-downgrade guard
- Do NOT flip `CAMPAIGN_SCHEDULER_ENABLED=true` without owner approval
- Do NOT start CR-075 implementation without owner gate (touches live migration data)
