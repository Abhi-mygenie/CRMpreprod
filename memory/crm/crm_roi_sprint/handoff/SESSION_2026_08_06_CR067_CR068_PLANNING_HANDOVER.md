# Session Handover — 2026-08-06 (CR-067 + CR-068 Planning)

**Date**: 2026-08-06  
**Role**: Planning Agent  
**Branch**: main (Abhi-mygenie/CRMpreprod)  
**DB**: Remote MongoDB 52.66.232.149:27017/mygenie (live preprod)

---

## What happened this session

### 1. CR-075 full lifecycle completed
- Intake → Planning → Impact Analysis → Implementation → QA — all in one session
- 6 edits applied to `routers/customers.py` (+115 LOC)
- QA PASS 10/10 on restaurant_478 (18march): 39 docs migrated, 87 stubs skipped, 9 broken URLs skipped
- Idempotency confirmed (2nd sync: 0 new inserts)
- Test file: `tests/test_cr075_doc_migration.py`

### 2. BUG-011 / BUG-012 / CR-061 / CRM-2 formal QA (iteration_9)
- All 4 items QA PASS (20/20 tests)
- BUG-011: 3/3 pytest — `_augment_run_stats()` aggregation confirmed
- BUG-012: 3/3 Playwright — deep-link filter + last-request-wins guard
- CR-061: 13/13 pytest — gate removed, jehsnest non-403, frontend flag intact
- CRM-2: 1/1 — `POST /api/pos/customers/{id}/documents` returns 400 (not 422) on missing file
- New test file: `tests/test_crm2_doc_upload.py`

### 3. CR-067 + CR-068 — Impact Analysis complete, all decisions locked
Full planning done. Implementation plan NOT yet written — that is the next session's first task.

---

## CR-067 — Summary for next agent

**What**: WhatsApp Template Deletion + Lifecycle Sync

**The problem in plain terms:**
1. Deleting a template from CRM only removes it from local MongoDB — it still exists on Meta and AuthKey
2. If a template is deleted directly on Meta, CRM never finds out — it keeps showing "approved" forever
3. The delete button has no warning/confirmation — user can accidentally delete
4. AuthKey sync never cleans up stale records

**All Q1-Q4 locked:**

| Q | Decision |
|---|---|
| Q1 | **Both** — delete locally + call Meta DELETE API. Warning modal before confirm. |
| Q2 | **Block delete** if template mapped to event or in campaign (already coded — no change needed here) |
| Q3 | **Auto-delete** local MongoDB record during AuthKey sync if `authkey_wid` gone from AuthKey list |
| Q4 | Build now alongside CR-068 |

**Code reality — what exists vs what's missing:**

| | Location | Status |
|---|---|---|
| Local delete endpoint | `whatsapp.py:565` | ✅ exists |
| In-use block (event + campaign check) | `whatsapp.py:571-586` | ✅ exists — Q2 already done |
| Variable map cleanup | `whatsapp.py:593` | ✅ exists |
| **Meta DELETE API call** | `whatsapp.py:565` | ❌ missing (GAP-1) |
| **Warning modal** | `TemplatesPage.jsx:362` | ❌ missing — direct delete, no confirmation |
| **Deleted-template detection in status check** | `whatsapp.py:668` | ❌ missing (GAP-3) |
| **Stale record cleanup in AuthKey sync** | `whatsapp.py:1140` | ❌ missing (GAP-4) |

**Files that WILL change:**
- `routers/whatsapp.py` — 3 edits: (1) Meta DELETE call in `delete_custom_template`, (2) deleted status detection in `check_template_status`, (3) auto-delete orphaned records in `sync_authkey_templates`
- `TemplatesPage.jsx` — warning modal (AlertDialog) on delete button

**Files that WILL NOT change:**
- `core/whatsapp.py` — send path untouched
- `core/campaign_jobs.py` — untouched
- `routers/campaigns.py` — untouched
- `routers/pos.py` — untouched
- `models/schemas.py` — untouched
- `TemplateBuilderPage.jsx` — untouched

**Effort**: ~2.5 hrs  
**Impact Analysis doc**: `planning/CR_067_IMPACT_ANALYSIS.md`

---

## CR-068 — Summary for next agent

**What**: Standalone "Validate Template" button — dry-run V1-V23 compliance check

**The problem in plain terms:**
The Template Builder has a "Submit to Meta" button that runs V1-V23 compliance checks. But these checks are hidden inside the Submit flow — if you don't have Meta WABA credentials, Submit fails with "credentials missing" before the compliance check runs. Result: tenants without WABA cannot see their template errors.

CR-068 adds a **"Validate" button** that runs the same checks immediately, makes zero API calls, works for every tenant.

**All Q1-Q3 locked:**

| Q | Decision |
|---|---|
| Q1 | Frontend-only — reuse existing functions, zero backend changes |
| Q2 | Inline panel below body textarea — errors red, warnings amber, dismissible |
| Q3 | Build alongside CR-067 in same session |

**Code reality — everything already exists:**

| Function | Location | Status |
|---|---|---|
| `validateMetaCompliance(tpl)` | `TemplateBuilderPage.jsx:21` | ✅ full V1-V23 check |
| `getBodyWarnings(body)` | `TemplateBuilderPage.jsx:169` | ✅ soft warnings |
| `getFooterWarnings(footer)` | `TemplateBuilderPage.jsx:200` | ✅ footer warnings |

Currently called ONLY inside `handleSubmitToMeta` (line 451). Gap: no standalone trigger.

**What needs to be added (~35 LOC total, 1 file):**
1. `const [validateResult, setValidateResult] = useState(null)` — 1 new state
2. `handleValidate()` — calls all 3 validation functions, sets state
3. `<Button onClick={handleValidate} data-testid="builder-validate-btn">Validate</Button>` — in top bar alongside "Submit to Meta"
4. Inline result panel below body textarea — conditional render when `validateResult !== null`

**File that WILL change**: `TemplateBuilderPage.jsx` only (+~35 LOC, 0 modified)  
**Files that WILL NOT change**: everything else — zero backend, zero API calls  
**Effort**: ~45 min  
**Impact Analysis doc**: `planning/CR_068_IMPACT_ANALYSIS.md`

---

## Next agent instructions

**Role to pick**: PLANNING (Implementation Plan) or IMPLEMENTATION

**Step 1 — OWNER APPROVAL REQUIRED before any code**

Present owner with this approval gate:

```
OWNER APPROVAL REQUIRED
Items: CR-067 + CR-068
Risk: CR-067 MEDIUM (whatsapp.py hotspot), CR-068 LOW (frontend-only)
Proposed: Write implementation plans for both, then implement in one session
I will not proceed until owner approves.
```

**Step 2 — after approval, write implementation plans for both:**
- CR-067: edit-by-edit plan for 4 changes (Meta DELETE call, status check fix, AuthKey sync cleanup, warning modal)
- CR-068: edit-by-edit plan for 4 additions (useState, handleValidate, button, result panel)

**Step 3 — implement both in same session:**
- CR-068 first (LOW risk, frontend-only, 45 min) — warm up
- CR-067 second (MEDIUM risk, whatsapp.py hotspot, needs careful editing)

**Step 4 — self-test, then QA**

---

## Test credentials

| Account | Password | Tenant | Use for |
|---|---|---|---|
| owner@kunafamahal.com | Qplazm@10 | Kunafa Mahal (689) | Primary test — has custom templates |
| owner@hungry.com | Qplazm@10 | Hungry Keya (634) | WhatsApp templates, `final_bill` template |
| owner@jehsnest.com | Qplazm@10 | Jeh's Nest (635) | Non-allowlisted tenant — gate test |
| owner@18march.com | Qplazm@10 | 18march (478) | Has real booking_documents (CR-075) |

---

## DO NOT
- Do NOT send live WhatsApp without owner approval
- Do NOT change coupon/loyalty/POS order math without owner approval
- Do NOT run destructive DB ops on live preprod data
- Do NOT re-introduce demo login (CR-015c)
- Do NOT flip `CAMPAIGN_SCHEDULER_ENABLED=true` without owner approval
- Do NOT start CR-067 implementation without owner approval (MEDIUM risk — whatsapp.py hotspot)
