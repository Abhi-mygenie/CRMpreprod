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
| **BUG-009** | — | **✅ Details button on Marketing > History dead** | **✅** | — | — | **🔴 OPEN** |

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
**Status**: 🔴 OPEN
**Component**: Frontend — `frontend/src/pages/CampaignHistoryPage.jsx` lines 164-166
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

---

## Cross-Reference Matrix (updated)
