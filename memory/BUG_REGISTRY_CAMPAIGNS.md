# Bug Registry — WhatsApp Campaign Variable Resolution

**Date Registered**: 2026-06-17  
**Reporter**: Investigation during live testing  
**Environment**: https://mygenie-crm-7.preview.emergentagent.com  

---

## BUG-001: Campaign menu_pick_resolved not copied from template mappings

**Severity**: CRITICAL  
**Status**: ✅ FIXED (verified in 17-june branch)  
**Component**: Frontend — CampaignWizardPage.jsx  

**Description**: When creating a campaign and selecting a template, the `menu_pick_resolved` data (static menu item names like "Rpay Test", "Idli Sambar") is never loaded from the template variable map API or set when user selects a template. Campaign always saves `menu_pick_resolved: {}`.

**Root Cause**: Two missing lines in `CampaignWizardPage.jsx`:
1. Line 132-135: `menu_pick_resolved` not extracted from `/whatsapp/template-variable-map` response
2. Line 158-164: `handleTemplateSelect()` doesn't call `setMenuPickResolved()` when template is picked

**Fix Applied**: `allMenuPickResolved` now extracted from map API (line 136) and `handleTemplateSelect` calls `setMenuPickResolved(allMenuPickResolved[tplId])` (line 168).

---

## BUG-002: Event-scoped variables resolve to empty in campaign sends

**Severity**: HIGH  
**Status**: ✅ FIXED (verified in 17-june branch)  
**Component**: Frontend — CampaignWizardPage.jsx  

**Description**: Templates designed for order events use variables like `payment_method`, `order_date`, `restaurant_order_id` etc. that only populate from `event_data` during POS order triggers. When the same template is used in a campaign (broadcast), `event_data` is always `{}`, causing these variables to resolve to `""`.

**Fix Applied**: Red warning box (`data-testid="event-vars-warning"`) at line 428-443, listing unsafe variables and suggesting "Text" mode or a different template.

---

## BUG-003: Campaign template dropdown shows rejected/pending templates

**Severity**: MEDIUM  
**Status**: ✅ FIXED (verified in 17-june branch)  
**Component**: Frontend — CampaignWizardPage.jsx  

**Description**: Campaign wizard template dropdown shows ALL AuthKey templates including rejected (temp_status=3) and pending (temp_status=4).

**Fix Applied**: `.filter(t => t.temp_status === 1)` at line 127.

---

## BUG-004: Campaign test-send not visible in Message Status dashboard

**Severity**: LOW  
**Status**: ✅ FIXED (verified in 17-june branch)  
**Component**: Backend — campaigns.py  

**Description**: Campaign test sends log to `campaign_test_sends` collection but NOT to `whatsapp_message_logs`. 

**Fix Applied**: `log_message_attempt()` call added at line 532-542 with `is_test=True`.

---

## BUG-005: Campaign filter in Message Status queries wrong DB collection

**Severity**: HIGH  
**Status**: ✅ FIXED  
**Component**: Backend — `routers/whatsapp.py` line 1173-1176  
**Date Registered**: 2026-06-17  
**Date Fixed**: 2026-06-17

**Description**: The `/api/whatsapp/message-filters` endpoint populates the "Campaign" filter dropdown from `db.segments` instead of `db.campaigns`. The filter dropdown shows segment names/IDs instead of campaign names/IDs, so selecting a "campaign" in the filter sends a segment ID that never matches any `campaign_id` in `whatsapp_message_logs`.

**Root Cause**: Wrong collection name in query:
```python
# CURRENT (WRONG)
campaigns = await db.segments.find(
    {"user_id": user["id"]}, {"_id": 0, "id": 1, "name": 1}
).to_list(100)

# SHOULD BE
campaigns = await db.campaigns.find(
    {"user_id": user["id"]}, {"_id": 0, "id": 1, "name": 1}
).to_list(100)
```

**Reproduction**:
1. Open Message Status dashboard
2. Click Campaign filter dropdown → shows segment names (e.g., "Gold Customers", "Inactive 30d")
3. Select any → 0 results returned

**Affected Users**: All users trying to filter messages by campaign  

---

## BUG-006: Campaign messages logged with run_id instead of campaign_id

**Severity**: HIGH  
**Status**: ✅ FIXED  
**Component**: Backend — `routers/campaigns.py` lines 311, 818  
**Date Registered**: 2026-06-17  
**Date Fixed**: 2026-06-17

**Description**: When `_execute_campaign_send()` logs messages to `whatsapp_message_logs` via `log_message_attempt()`, it passes `campaign_id=run_id` instead of `campaign_id=campaign_id`. This means the `campaign_id` field in the message log contains the **run UUID**, not the actual **campaign UUID**. The Message Status filter compares against the campaign's `id` field, so it can never match.

Same issue exists in the resend-failed path (line 818: `campaign_id=new_run_id`).

**Root Cause**: Parameter value mismatch in two callsites:
```python
# _execute_campaign_send() — line 311
campaign_id=run_id,          # ← WRONG: stores run_id
reference_id=campaign_id,    # ← The actual campaign_id is here

# resend_failed_campaign_run() — line 818
campaign_id=new_run_id,      # ← WRONG: stores new run_id
reference_id=campaign_id,    # ← Correct campaign_id here
```

**Note**: The test-send path (line 536) does it correctly: `campaign_id=campaign_id`.

**Reproduction**:
1. Send a campaign → messages logged with `campaign_id = <run_uuid>`
2. Fix BUG-005 so campaigns show in filter dropdown
3. Select the campaign → 0 results because filter matches campaign.id against run_uuid

**Impact**: Even after BUG-005 is fixed, campaign filtering still won't work. Both bugs must be fixed together.

**Data Migration**: Existing `whatsapp_message_logs` rows have `campaign_id = run_id` and `reference_id = campaign_id`. A one-time migration could swap these for historical data, OR the filter can be changed to match on `reference_id` instead for backward compatibility.

---

## BUG-007: Template preview shows literal `\n` instead of newlines

**Severity**: MEDIUM  
**Status**: ✅ FIXED  
**Component**: Frontend — TemplatesPage.jsx, CampaignWizardPage.jsx, WhatsAppAutomationContent.jsx  
**Date Registered**: 2026-06-17  
**Date Fixed**: 2026-06-17

**Description**: Template body preview displays literal `\n` characters instead of actual line breaks. The AuthKey API returns `temp_body` with escaped newline strings (e.g., `"Hi Unknown,\nGood Morning!"` as a JS string where `\n` is a two-character literal, not an escape). CSS `whitespace-pre-wrap` only renders actual newline characters, not the literal text `\n`.

**Example**:
```
Displayed: Hi Unknown,\n\nGood Morning! Today\'s menu at Mygenie Dev are:\n\n1. Rpay Test\n2. Idli Sambar...
Expected:  
Hi Unknown,

Good Morning! Today's menu at Mygenie Dev are:

1. Rpay Test
2. Idli Sambar...
```

**Root Cause**: AuthKey API `temp_body` field contains JSON-escaped `\n` (literal backslash-n) which the JSON parser may or may not unescape depending on how the response is structured. The frontend renders the raw string without any `\n` → newline conversion.

**Affected Locations** (all preview renders):
1. `TemplatesPage.jsx:574` — Template list preview
2. `TemplatesPage.jsx:697` — Variable mapping modal preview
3. `CampaignWizardPage.jsx:512` — Campaign wizard WhatsApp preview
4. `WhatsAppAutomationContent.jsx:1095` — Automation modal preview
5. `WhatsAppAutomationContent.jsx:180` — Test send preview
6. `WhatsAppAutomationContent.jsx:1276` — New template preview

**Affected Users**: All users viewing template previews across all pages

---

## Cross-Reference Matrix

| Bug | Affects Send | Affects Display | Code Bug | Design Gap | UX Gap | Status |
|---|---|---|---|---|---|---|
| BUG-001 | ✅ Messages fail | — | ✅ | — | — | ✅ FIXED |
| BUG-002 | ✅ Messages fail | — | — | ✅ | ✅ | ✅ FIXED |
| BUG-003 | Risk of using rejected template | ✅ Wrong templates shown | ✅ | — | — | ✅ FIXED |
| BUG-004 | — | ✅ Test sends invisible | ✅ | — | — | ✅ FIXED |
| **BUG-005** | — | **✅ Campaign filter broken** | **✅** | — | — | **✅ FIXED** |
| **BUG-006** | — | **✅ Campaign msgs invisible** | **✅** | — | — | **✅ FIXED** |
| **BUG-007** | — | **✅ Preview unreadable** | **✅** | — | — | **✅ FIXED** |
| **BUG-008** | **✅ Wasted POS call every login** | — | — | — | — | **✅ FIXED** |
| **BUG-009** | — | **✅ Details button on Marketing > History dead** | **✅** | — | — | **✅ FIXED** |

---

## BUG-008: CRM token pushed to POS on every login (should be conditional)

**Severity**: LOW (no functional impact — POS returns 409, login succeeds)
**Status**: ✅ FIXED (2026-06-18)
**Component**: Backend — `routers/auth.py` → `_register_crm_token_with_pos()`
**Related CR**: CR-001 (Push CRM Token to MyGenie on First-Time Login)
**Date Registered**: 2026-06-18
**Reporter**: Investigation Agent — owner asked "why push every login?"

**Description**: `_register_crm_token_with_pos()` is called unconditionally on every login (both existing user path line 512 and new user path line 571). The original CR-001 spec explicitly stated: "Only on FIRST TIME login... NOT on subsequent logins." The `api_key` never changes between logins, so the push is redundant after first successful registration.

**Root Cause**: No gating logic before the push call. The `crm_token_registered_with_pos` field is written to the users doc (lines 95, 120) but never read as a gate.

**Impact**:
- Wasted HTTP call + DB write on every login (~10s timeout budget)
- No functional harm — POS returns 409 (already registered), CRM treats as success
- Login latency slightly increased (awaits push response before returning)

**Bonus finding**: `POST /api/pos/api-key/regenerate` generates a new key but does NOT push to POS — POS gets stale key until next login (where the unconditional push accidentally fixes it).

**Proposed fix**:
```python
# In mygenie_login(), existing user path (line ~502-515):
api_key = existing_user.get("api_key")
if not api_key:
    api_key = generate_api_key()
    await db.users.update_one({"id": existing_user["id"]}, {"$set": {"api_key": api_key}})

# Only push if NOT already registered
if not existing_user.get("crm_token_registered_with_pos"):
    await _register_crm_token_with_pos(
        client, mygenie_api_url, restaurant_id,
        api_key, mygenie_token, existing_user["id"]
    )
```

**Also fix**: `regenerate_api_key` endpoint should push new key to POS after regeneration.

**Acceptance Criteria**:
- AC1: First login → push happens, `crm_token_registered_with_pos=true`
- AC2: Second login → push skipped (already registered)
- AC3: If previous push failed (`crm_token_registered_with_pos=false`) → retry on next login
- AC4: After `api_key` regeneration → push new key to POS
- AC5: Login latency reduced on subsequent logins (no unnecessary HTTP call)

## Dependency Graph

```
BUG-005 + BUG-006 → Must both be fixed for campaign filter to work end-to-end
BUG-007          → Independent, can be fixed in parallel
```

---

## BUG-009: "Details" button on Marketing > History does nothing

**Severity**: P2 (dead UX element; discoverability broken; no data / financial impact)
**Status**: ✅ FIXED (2026-07-03; QA iteration_3 PASS)
**Component**: Frontend — `frontend/src/pages/CampaignHistoryPage.jsx` lines 164-166 (now wired to `/message-status?campaign_id=X&run_id=Y`)
**Date Registered**: 2026-07-03
**Reporter**: Owner (verbal report)
**Intake doc**: `crm/crm_roi_sprint/discovery/SESSION_2026_07_03_BATCH_INTAKE.md` § Item 2

**Description**: On page **Marketing > History** (route `/marketing/history`), each row in the campaign runs table has a "Details" button that produces no reaction on click.

**Root cause (code-confirmed)**: The button element has no `onClick` handler:
```jsx
// CampaignHistoryPage.jsx line 164-166
<Button variant="outline" size="sm" className="text-xs rounded-full" data-testid="history-details-btn">
    Details
</Button>
```
No `navigate()`, no dialog trigger, no state change. The sibling "Resend {N}" button (line 168+) IS correctly wired, so this is an isolated missing wire, not a broader break.

**Reproduction**:
1. Log in as `owner@jehsnest.com`
2. Navigate to Marketing > History
3. Click **Details** on any campaign run row → nothing happens (no navigation, no modal, no console error)

**Affected Users**: Every tenant with at least 1 campaign run

**Owner ask (2026-07-03)**: "suggest, why it was planned"

**Recommendation on file (option a — deep-link to filtered Messages)**:
- Wire onClick to `navigate(\`/messages?campaign_id=\${row.campaign_id}&run_id=\${row.run_id}\`)`
- Reuses CR-026 URL-param filter scheme
- ~15 LOC in `CampaignHistoryPage.jsx`
- May need +1 hr backend work to verify `run_id` is a filter dimension on `whatsapp_message_logs` (Planning to confirm)

**Design intent (archaeology)**: Details is the standard drill-down pattern for a summary row — jump from aggregate stats (recipient count, delivery donuts, delivery %) to the per-recipient log entries produced by that specific run. Sibling "Resend" already reuses the same row identity to trigger action; only "Details" was left unwired.

**Awaiting**: Owner confirms option (a) at gate → Bug Fix role dispatch.

**Planning status (2026-07-03)**: 🔵 Impact Analysis complete. LOW risk. ~23 LOC across 3 files (`whatsapp.py` +10 LOC coordinated with CR-042; `CampaignHistoryPage.jsx` +5 LOC onClick+import; `MessageStatusPage.jsx` +8 LOC extend CR-026 URL reader to accept `run_id`). Coordinate backend commit with CR-042. Impact doc: `crm_roi_sprint/planning/BATCH_2026_07_03_IMPACT.md`.

**Implementation status (2026-07-03)**: ✅ **FIXED**. Details button now navigates to `/messages?campaign_id=X&run_id=Y`. MessageStatusPage reads both URL params + shows green emerald "🎯 Filtered to run" banner with Clear-run-filter button. Backend `run_id` filter added to `/message-logs` via shared `_build_message_log_query()` helper (co-shipped with CR-042). Verified: pytest 11/11 PASS regression, curl B1-B9 all pass. Impl plan: `crm_roi_sprint/planning/BUG_009_CR_042_MESSAGE_EXPORT_AND_DEEP_LINK_IMPL_PLAN.md`. QA handover: `crm_roi_sprint/qa/BUG_009_CR_042_QA_HANDOVER.md`.

---

## BUG-010: Media-header templates created via direct Meta submit lose send_media_url — campaign wizard hard-blocks

**Reported**: 2026-07-11 by owner (tenant: Jeh's Nest, `owner@jehsnest.com`)
**Severity**: P1 · **Risk**: HIGH · **Status**: ✅ FIXED (2026-07-11)

**Symptom**: Template `sampletestlogo` (image header, wid 40529) was created via Template Builder, media uploaded (Meta handle + S3), APPROVED by Meta — yet Campaign Wizard Step 2 showed "⛔ This template has a media header but no uploaded file — messages cannot send."

**Root cause**: `CODE_ERROR` — `create_meta_template()` (`routers/whatsapp.py`, direct Meta-submit path used by `/create-and-sync-template`) built the local `custom_templates` doc WITHOUT persisting `send_media_url` / `header_handle` / `send_media_filename` / `header_media_mime`, even though these were in the incoming payload and the handle was used for Meta approval. Downstream, `/authkey-templates` enrichment computes `has_send_media = bool(send_media_url)` → false → `CampaignWizardPage.isMediaBlocked()` hard-blocks. The draft-flow path (`POST /custom-templates`) persisted these fields correctly; only the direct-submit path had the gap.

**Fix**: (1) `create_meta_template` doc now persists all media fields + `needs_media_reupload: False` (code marker `BUG-010`). (2) Data repair: backfilled `send_media_url` on the two affected docs (`sampletestlogo`, `sampletestlogo2`) from their original S3 uploads (`media-headers/pos_0001_restaurant_635/header/…fork-and-spoon.png`, verified HTTP 200 public).

**Verification (testing agent, iteration_7)**: 6/6 pytest PASS (`backend/tests/test_bug008_media_header_wizard.py`) — `has_send_media=true` for wid 40529 & 40534; UI verified: red banner absent, "Next: Schedule & Send" enabled, Step 3 reachable. No sends, no Meta/AuthKey writes, no drafts persisted.

**Independent QA re-verification (2026-07-11, iteration_10)**: 7/7 QA cases PASS — exact symptom (UI), enrichment, S3 delivery copy HTTP 200, static fix-contract vs TemplateBuilder payload (1:1 field match), draft-flow regression, non-media regression, B.3 resend-gate interplay (`media_still_missing` skip). Reusable suite: `backend/tests/test_bug010_qa_reverify.py`. Zero live sends; all synthetic rows cleaned.

---

## BUG-011: Campaign History — Delivered/Read counters always 0 (never wired)
**Status**: ✅ QA PASS (2026-08-06) — pytest 3/3 PASS (iteration_7) · Owner smoke pending
**Fix applied (2026-07-12 batch)**: `routers/campaigns.py` — `_augment_run_stats()` reads `whatsapp_message_logs` at query time, computes `total_delivered`/`total_read`/`total_sent`/`total_failed` per run. BUG-011 extension also aggregates at campaign-list level. Code markers: `BUG-011` at lines 54–182. NO backfill, NO webhook change — pure read-time fix (option b, owner-locked).
**Test file**: `tests/test_bug011_run_stats.py` — 3/3 unit tests PASS (mock-based; resolve_variable stub added by QA agent).
**Severity**: P2 · **Risk**: MEDIUM (option b locked — campaigns read path only)
**Symptom**: Marketing > History table + summary cards show 0 for Delivered/Read (owner reports Sent also empty on some rows); owner forced to use Dashboard instead.
**Evidence**: `campaign_runs.total_delivered`/`total_read` initialized 0 at `routers/campaigns.py:112-113,279-280,749,844` and **never incremented anywhere in the codebase** (grep-verified). Webhook updates `whatsapp_message_logs.status` only. `CampaignHistoryPage.jsx:78-80,187-189` renders the dead fields. `total_sent` IS written at send time — live-data check needed for owner's "sent empty" claim (possible legacy runs).
**Fix options (for Planning)**: (a) `$inc` on webhook status transition, (b) read-time aggregation from `whatsapp_message_logs` in `GET /campaigns/runs` (retroactive, reuse BUG-006 `$or` compat), (c) both + backfill.
**Intake doc**: `crm/crm_roi_sprint/discovery/SESSION_2026_07_12_BATCH_INTAKE.md` §Item 3.

---

## BUG-012: "View Messages" deep-link — filter shows selected but ALL messages listed
**Status**: ✅ QA PASS (2026-08-06) — Playwright 3/3 PASS (iteration_7) · Owner smoke pending
**Severity**: P2 · **Risk**: LOW-MEDIUM (frontend-only fix)
**Symptom**: Clicking View Messages (CampaignsPage:310/345) or run Details (CampaignHistoryPage:211) lands on Message Status with campaign pre-selected in dropdown, but the table lists ALL messages.
**Root cause (CONFIRMED)**: Mount-time double-fetch race in `MessageStatusPage.jsx` — unfiltered fetch resolved last and overwrote filtered results.
**Fix applied (BUG-012 E-A1/E-A2/E-A3)**: Lazy `useState` initialiser reads `searchParams` once on mount (E-A1); mount `useEffect` removed — seed done at init (E-A2); `fetchSeq` counter drops stale responses (E-A3). Code markers lines 82–187.
**QA verified**: deep-link `?campaign_id=X` pre-filters correctly · no-params regression clean · `?campaign_id=X&run_id=Y` both banners and filtered table.
**Related**: CR-026 (deep-link feature), BUG-009 (closed), BUG-006 (query compat).
**Intake doc**: `crm/crm_roi_sprint/discovery/SESSION_2026_07_12_BATCH_INTAKE.md` §Item 5.

---

## BUG-013: Customer bulk import — Cloudflare 5xx timeout while import silently completes server-side
**Status**: ✅ FIXED (2026-07-14) — pytest 21/21 + testing_agent iteration_18 12/12 PASS · **OWNER SMOKE PENDING**
**Severity**: P1 · **Risk**: MEDIUM (import write path; no hotspot files)
**Fix applied**: `routers/customers.py::import_customers` — classify-all-first, collect `UpdateOne`/`InsertOne` ops, single `await db.customers.bulk_write(ops, ordered=False)` (code marker BUG-013). Measured: 300-row import 2.18 s (was 83-167 s). Q-A=(c): in-file duplicate phones now rejected with HTTP 400 + row list at BOTH `/import-preview` and `/import` (`_find_duplicate_phones`).
**Verification**: `tests/test_bug013_014_import.py` (21/21) + independent `tests/test_bug013_014_iteration18.py` (12/12, testing_agent). Synthetic data cleaned, 0 residuals.
**Hardening notes (QA review, non-blocking)**: BulkWriteError partial failures not itemized in `failed` counter; dup-list message caps at 10 phones.
**Symptom**: Importing ~345 rows → Cloudflare "origin returned invalid or incomplete response" at step 2/3; owner retried → duplicate runs (`import_logs`: same file 06:46 AND 06:48, 345 updated each).
**Root cause (CONFIRMED)**: `routers/customers.py::import_customers` (L1386-1490) awaits one `update_one`/`insert_one` per row sequentially. Remote Mongo RTT ≈ 242 ms (measured) → 345 rows ≈ 83-167 s > ~100 s proxy timeout. Backend finishes after the browser already got the error.
**Fix direction (Planning)**: single `bulk_write()` → <2 s; optional FE 5xx-friendly toast.
**Evidence/Intake**: `investigations/INV_007_OPTIN_EDIT_TAGS_EXPORT_IMPORT_502_2026_07_14.md` §3 · `discovery/SESSION_2026_07_14_BATCH_INTAKE.md` §1.
**Related**: CR-035 (import feature), CR-060 (import modal UX).

---

## BUG-014: Import silently discards "WhatsApp Opt-in" column; NEW imported customers hardcoded opt-in=False
**Status**: ✅ FIXED (2026-07-14) — pytest 21/21 + testing_agent iteration_18 12/12 PASS · **OWNER SMOKE PENDING**
**Severity**: P1 · **Risk**: HIGH (`whatsapp_opt_in` gates ALL campaign sends)
**Fix applied** (code marker BUG-014): `_validate_and_classify_row` parses opt-in under BOTH headers "WhatsApp Opt-in"/"whatsapp_opt_in" (Q-B=a) — yes/true/1→True, no/false/0→False, blank/junk→None=unchanged (D1). Update path applies only explicit values; insert path defaults True (D2, replaces hardcoded False). Sample import template gains `whatsapp_opt_in` 8th column (Q-C=a).
**Verified**: existing customer Yes/No/blank/junk matrix; new-customer default True + explicit No; header variants; template column; export regression (22 headers intact).
**Owner locks**: D1 = honour Yes/No column for existing customers, BLANK leaves unchanged (rule extended: blank = leave-unchanged for ANY field). D2 = NEW imported customers default `whatsapp_opt_in=True` (file value wins if present; blank → True) — replaces hardcoded False at L1456.
**Symptom**: Owner edits WhatsApp Opt-in in exported Excel and re-uploads → values never applied, no warning.
**Root cause (CONFIRMED)**: `_validate_and_classify_row` (`routers/customers.py` L89-123) consumes only 7 columns (name/phone/email/dob/city/address/tags) — opt-in parsed then discarded. Plus L1456 hardcodes `whatsapp_opt_in: False` for NEW imported customers (contradicts Add-form default True → imported customers excluded from campaigns).
**Owner decisions**: D1 honour column for existing (blank = unchanged)? · D2 new-customer default True vs False?
**Evidence/Intake**: INV-007 §4B · `discovery/SESSION_2026_07_14_BATCH_INTAKE.md` §2.
**Related**: CR-035 (export 22 cols vs import 7 asymmetry).

---

## Cross-Reference Matrix (updated)

## BUG-015: CR-066 V19/V21/V22 soft warnings incorrectly hard-blocking template submission

**Status**: ✅ FIXED (2026-07-17)
**Severity**: P1
**Reported**: 2026-07-16 (owner smoke test of CR-066)
**Fixed**: 2026-07-17 — Bug Fix Agent applied 5 edits per plan
**Root cause**: CODE_ERROR — Q2 "hard block all" applied uniformly to all 13 checks. V19 (>550 chars), V21 (category-content mismatch), V22 (ALL CAPS) should be soft warnings. Evidence: 6/10 approved Meta templates on this WABA violate all three simultaneously.
**Impact**: Blocks creation of legitimate templates that Meta would approve. User cannot submit any template resembling their existing approved templates.
**Files changed**: `frontend/src/pages/TemplateBuilderPage.jsx` — `validateMetaCompliance()` function only.
**Fix**: Moved V19/V21/V22 from `errors[]` to `warnings[]`. Added `warnings` array, updated return signature to `{ valid, errors, warnings }`. `handleSubmitToMeta` shows warnings as `toast.warning()` (yellow, non-blocking). Backend unchanged (never had V19/V21/V22).

---

## BUG-016: Preview orphan `_` regex — JS negative lookbehind incompatibility

**Reported**: 2026-07-17 (discovered during QA of CR-066 + BUG-015)
**Severity**: P2 · **Risk**: LOW · **Status**: ✅ FIXED (2026-07-17)
**Also known as**: BUG-QA-01

**Symptom**: WhatsApp preview in TemplateBuilderPage incorrectly failed to highlight orphan `_` markers in some test environments. The red-highlight logic (added in CR-066 E-G edit) used JS `(?<!\w)` negative lookbehind which is unsupported in certain browser/Node.js versions used during QA.

**Root cause**: `CODE_ERROR` — negative lookbehind `(?<!\w)_(?!\w)` used in the preview orphan-marker regex. Lookbehind assertions require ES2018+ and are absent in older Node.js-based test runners used by the QA suite (`qa_cr066_bug015_direct.py`).

**Files changed**: `frontend/src/pages/TemplateBuilderPage.jsx` — orphan marker highlight regex in preview renderer.

**Fix**: Replaced lookbehind with a compatible regex alternative that achieves the same match without lookbehind syntax.

**Verification**: testing_agent iteration_2 (20/20 PASS).

---

## BUG-017: V16 emoji count regex mismatch — frontend over-counts, backend under-counts

**Reported**: 2026-07-17 (discovered during QA of CR-066 + BUG-015)
**Severity**: P1 · **Risk**: MEDIUM · **Status**: ✅ FIXED (2026-07-17)
**Also known as**: BUG-QA-02

**Symptom**: A template body with 11 emoji characters correctly triggered V16 on the frontend (hard block, >10 emoji) but passed the backend safety-net silently. This created a split where a user could bypass the frontend by calling the API directly, OR (future) a server-rendered validation path would not catch the violation.

**Root cause**: `CODE_ERROR` — frontend used `/\p{Emoji}/gu` (Unicode property escape, broad definition — counts modifier sequences, variation selectors, keycap chars) while backend `routers/whatsapp.py` used `[\u{1F300}-\u{1FFFF}]` range (narrower traditional emoji range, misses ZWJ sequences, skin-tone modifiers, etc.). Same 11-emoji test string: frontend = 17 matches, backend = 8 matches.

**Files changed**: `backend/routers/whatsapp.py` — V16 emoji count regex in `create_meta_template` validation block.

**Fix**: Updated backend regex to use the same broad Unicode property escape approach as the frontend, ensuring identical counts on both sides.

**Verification**: testing_agent iteration_2 (20/20 PASS).

---

## BUG-018: Stale inline comment in `routers/whatsapp.py` validation block

**Reported**: 2026-07-17 (discovered during QA of CR-066 + BUG-015)
**Severity**: P3 · **Risk**: LOW · **Status**: ✅ FIXED (2026-07-17)
**Also known as**: BUG-QA-03

**Symptom**: Comment in `create_meta_template()` above the V11-V20 validation block described "V11-V15 only (P0)" — did not reflect the expanded V11-V20 scope shipped in CR-066 E-G.

**Root cause**: `CODE_ERROR` — comment written during CR-066 planning (V11-V15 was P0 scope at that stage) and not updated when implementation expanded to V11-V20.

**Files changed**: `backend/routers/whatsapp.py` — inline comment only.

**Fix**: Updated comment to "V11-V20 safety-net (P0 + P1), runs before WABA check".

**Verification**: testing_agent iteration_2 (20/20 PASS).

---

## BUG-019: Backend V11-V20 validation block ran AFTER Meta WABA check — compliance errors silently dropped

**Reported**: 2026-07-17 (discovered during QA of CR-066 + BUG-015)
**Severity**: P1 · **Risk**: HIGH · **Status**: ✅ FIXED (2026-07-17)
**Also known as**: BUG-QA-04

**Symptom**: Tenants without Meta WABA configured (`meta_waba_id` or `access_token` absent) received a generic "WABA not configured" 503 error when submitting a template, even if the template contained hard-block violations (orphan markers, adjacent variables, etc.). The compliance error detail was never surfaced — the user had no way to know their template was non-compliant.

**Secondary impact**: This was also the root-cause of CR-068 requirement — tenants in pre-WABA onboarding could not use Template Builder's compliance gate at all, which was a usability blocker.

**Root cause**: `CODE_ERROR` (PLAN_GAP in CR-066 E-G) — the V11-V20 validation block in `create_meta_template()` was inserted AFTER the WABA connectivity guard (`if not user.meta_waba_id or not user.access_token: raise 503`). Execution order:
```
(OLD) WABA check → 503 if no WABA → V11-V20 validation (never reached)
(NEW) V11-V20 validation → 400 if violations → WABA check → Meta API call
```

**Files changed**: `backend/routers/whatsapp.py` — statement re-ordering in `create_meta_template()`. V11-V20 validation block moved 15 lines upward, before the WABA guard. Zero logic change.

**Blast radius**: Previously, any tenant without WABA who submitted a non-compliant template would get a misleading "WABA not configured" 503 instead of a descriptive "Unmatched formatting marker" 400. Fix is purely additive and non-regressive — tenants WITH WABA see no change.

**Source of CR-068**: This bug confirmed the need for a standalone "Validate Template" dry-run button (CR-068) so compliance can be tested entirely independent of WABA status.

**Verification**: testing_agent iteration_2 (20/20 PASS). Reports: `/app/tests/qa_cr066_bug015_direct.py`, `/app/test_reports/iteration_2.json`.

---

## BUG-020: "Unknown" customer name sent in WhatsApp templates — should be "Guest"

**Reported**: 2026-08-04 · **Fixed**: 2026-08-04  
**Severity**: P1 · **Risk**: HIGH · **Status**: ✅ FIXED  
**Source**: INV-013A · **Intake**: `discovery/BUG_020_UNKNOWN_NAME_WHATSAPP_INTAKE.md`

**Symptom**: 939/949 Hungry Keya customers were migrated without a name → stored as `name="Unknown"`. When `final_bill` template maps `{{1}}` → `customer_name`, `resolve_variable()` returns `"Unknown"` (not treated as blank). WhatsApp sends "Namaste Unknown, Thank you for dining…"

**Root cause**: `PLAN_GAP` — `core/whatsapp.py::resolve_variable()` line 304 exclusion list is `(None, "", 0)`. The string `"Unknown"` passes through unchecked.

**Decision locked**: `"Unknown"` (any case) → treated as blank → return `"Guest"` for `customer_name`.

**File**: `core/whatsapp.py` · **Blast radius**: LARGE (all migrated tenants, 939+ customers)

---

## BUG-021: POS order does not update existing customer name / email

**Reported**: 2026-08-04 · **Fixed**: 2026-08-04  
**Severity**: P1 · **Risk**: CRITICAL · **Status**: ✅ FIXED  
**Source**: INV-013B · **Intake**: `discovery/BUG_021_POS_ORDER_NO_NAME_EMAIL_UPDATE_INTAKE.md`

**Symptom**: When a real POS order arrives for an existing customer (found by `pos_customer_id` or phone), `customer_update_set` only updates loyalty/behavioural fields. `name` and `email` — the only two demographic fields the order webhook carries — are never written. A migrated customer with `name="Unknown"` stays "Unknown" even after 100 real orders with `cust_name="Rahul Kumar"`.

**Root cause**: `PLAN_GAP` — `customer_update_set` in `routers/pos.py:1464` is loyalty-only by original design. No name/email update was ever added.

**Decision locked**: Always update `name` (if non-empty in order) and `email` (if non-empty and not `@mygenie` synthetic). `phone` — never in update_set.

**File**: `routers/pos.py` · **Blast radius**: LARGE (all tenants, every POS order for existing customers)

---

## BUG-022: Migration re-sync overwrites CRM-edited customer names with "Unknown"

**Reported**: 2026-08-04 · **Fixed**: 2026-08-04  
**Severity**: P1 · **Risk**: CRITICAL · **Status**: ✅ FIXED  
**Source**: INV-013C · **Intake**: `discovery/BUG_022_MIGRATION_RESYNC_NAME_OVERWRITE_INTAKE.md`

**Symptom**: Owner manually edits customer name from "Unknown" to "Priya Singh" in CRM (CRM DB write is correct). When migration re-sync is triggered later (MigrationPage → Sync), the sync fetches the customer from MyGenie POS (POS still has no name → `"" or "Unknown"`), and writes `{"name": "Unknown"}` back to CRM — destroying the manual edit.

**Root cause**: `PLAN_GAP` — `routers/customers.py` migration sync: `customer_data["name"] = mygenie_customer.get("name") or "Unknown"`. Both clean-slate and legacy re-sync paths include `"name"` in the update set without checking whether CRM already has a manually-corrected value.

**Decision locked**: Migration must skip `name` overwrite if existing CRM customer has a non-"Unknown", non-empty name.

**File**: `routers/customers.py` (migration sync) · **Blast radius**: LARGE (all tenants, all manually-edited customers)

---

## BUG-023: `weasyprint` missing from requirements.txt — `einvoice_token` empty in production

**Reported**: 2026-08-04 · **Fixed**: 2026-08-04  
**Severity**: P0 · **Risk**: HIGH · **Status**: ✅ FIXED  
**Intake**: `discovery/BUG_023_WEASYPRINT_EMPTY_EINVOICE_TOKEN_INTAKE.md`

**Symptom**: In production, every POS order's `einvoice_token` is `""`. WhatsApp `send_bill` message fires but the "Bill" button has no token. In this preview pod it works because `weasyprint` was manually pip-installed.

**Root cause**: `weasyprint` is NOT in `requirements.txt` (only `reportlab` is listed). Production deploys from `requirements.txt` → weasyprint missing → `generate_invoice_pdf()` throws `ModuleNotFoundError` → exception silently caught in `pos.py` → `einvoice_token = ""`. Secondary gap: PDF is generated BEFORE DB insert — any PDF failure means token is never stored or returned.

**Files**: `requirements.txt` (add weasyprint) + `services/invoice_generator.py` (move PDF after DB insert)  
**Blast radius**: LARGE — all production tenants, every POS order

---

## BUG-024: Template button URL missing `/api/invoices/` path — "Bill" button opens 404

**Reported**: 2026-08-04  
**Severity**: P1 · **Risk**: MEDIUM · **Status**: ✅ CLOSED (2026-08-06) — Owner handled. Fix applied outside CRM repo (production server / template resubmission per owner decision).  
**Intake**: `discovery/BUG_024_TEMPLATE_BUTTON_URL_MISSING_API_PATH_INTAKE.md`

**Symptom**: Customer taps "Bill" in WhatsApp → opens `https://crm-mygenie.mygenie.online/{token}` → 404. Correct URL is `https://crm-mygenie.mygenie.online/api/invoices/{token}`.

**Root cause**: Templates `bill_4` (Kunafa Mahal), `testbill1` (Kunafa Mahal), `final_bill` (Hungry Keya) were submitted to Meta with wrong button base URL — missing `/api/invoices/` segment. Base URL is locked in Meta-approved template, cannot be changed without resubmission.

**Fix options**: (A) Resubmit templates to Meta with correct URL, (B) Nginx redirect `/{token}` → `/api/invoices/{token}`, (C) React frontend route  
**Blast radius**: MEDIUM — all tenants using these 3 templates

---

## CR-073: AuthKey-created templates not syncing into CRM — buttons invisible, can't map variables

**Registered**: 2026-08-04  
**Severity**: P1 · **Risk**: MEDIUM · **Status**: 📋 REGISTERED  
**Intake**: `discovery/CR_073_AUTHKEY_TEMPLATE_IMPORT_INTAKE.md`

**Symptom**: Templates created directly on AuthKey (e.g. `button1`, `kmfinalbill`) appear in the CRM Templates page (from AuthKey list) but show NO buttons and offer no variable mapping. Owner cannot wire these templates to events like `send_bill`.

**Root cause**: `PLAN_GAP` — `sync_authkey_templates()` in `routers/whatsapp.py` was built as CRM → AuthKey direction only. It back-fills `authkey_wid` on **existing** `custom_templates` entries but never **creates** new entries for templates built outside the CRM Builder. AuthKey API returns no button data. Button data is only available via Meta Graph API.

**Scale**: 9 of 11 Kunafa Mahal AuthKey templates have no `custom_templates` entry.

**Fix**: Add import block in `sync_authkey_templates()` — for each AuthKey template with no matching `custom_templates` entry, create a new stub doc and (if Meta WABA configured) populate button data from Meta API.
 API.
