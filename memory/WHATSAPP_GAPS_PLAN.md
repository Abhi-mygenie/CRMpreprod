# WhatsApp Integration Gaps — Impact Analysis & Implementation Plan

**Date**: 2026-06-17  
**Author**: E1 Agent  
**Status**: Investigation Complete — Awaiting Approval  
**Scope**: 2 gaps identified, 1 critical hidden issue discovered

---

## Executive Summary

Two gaps were identified and validated with production data:
1. **Template Approval Status** — AuthKey returns `temp_status` (1=Approved, 3=Rejected, 4=Pending) but the frontend ignores it, displaying all templates as "Approved"
2. **Webhook Failure Description** — Frontend never displays `failure_reason` for failed messages; AuthKey doesn't provide a reason field in failed webhooks

A third critical issue was uncovered during investigation:
3. **Webhook Message Matching Failure** — 94.6% (1135/1201) of webhook callbacks fail to match any message log (`no_matching_row`), causing 47 messages to be stuck in "pending" forever despite actual delivery

---

## GAP 1: Template Approval Status Not Displayed

### Current State
- AuthKey API returns `temp_status` field: `1`=Approved, `3`=Rejected, `4`=Pending
- Also returns `error_desc_creation` (rejection reason — currently None for sampled templates)
- Backend `/whatsapp/authkey-templates` passes the data through correctly
- **Frontend ignores `temp_status` entirely**

### Production Data
| Metric | Value |
|---|---|
| Users with AuthKey configured | 6 / 24 |
| Total AuthKey templates (across all users) | ~43 per shared account |
| Approved templates (temp_status=1) | ~63% |
| Rejected templates (temp_status=3) | ~5% |
| Pending templates (temp_status=4) | ~32% |
| Rejected templates mapped to LIVE events | 1 (Mygenie Dev: `bill_sample` → `new_order_customer`, disabled) |

### Impact Analysis

**Severity: MEDIUM-HIGH**

| Impact Area | Description | Affected Users | Risk |
|---|---|---|---|
| **False visibility** | Rejected templates shown as usable → user trusts the system, maps them → sends fail silently | All 6 AuthKey users | HIGH — silent failures |
| **Wasted user effort** | User maps variables to a Rejected template, configures events, tests — all wasted | Any user creating/editing automations | MEDIUM |
| **Broken "Pending" filter** | Filter shows 0 results despite 14 pending templates existing for some users | All users | LOW — cosmetic but confusing |
| **No rejection context** | Even if status were shown, `error_desc_creation` is not displayed — user can't understand why template was rejected | Users with rejected templates | MEDIUM |
| **Current blast radius** | Only 1 rejected template is mapped to a live event (and it's disabled), so NO active send failures today | Limited today, grows as adoption increases | LOW today, HIGH future |

### Proposed Fix

**Phase 1: Frontend Template Status Display** (Est. 2-3 hours)

1. **TemplatesPage.jsx** — Filter AuthKey templates by `temp_status`:
   - `templateFilter === "approved"` → show only `temp_status === 1`
   - `templateFilter === "pending"` → show `temp_status === 4`
   - `templateFilter === "all"` → show all
   - Add new filter value `"rejected"` → show `temp_status === 3`

2. **TemplatesPage.jsx** — Add status badge to each AuthKey template card:
   - Approved (1): Green badge "Approved"
   - Rejected (3): Red badge "Rejected"
   - Pending (4): Amber badge "Pending Review"

3. **WhatsAppAutomationContent.jsx** — Event mapping template selector:
   - Only show `temp_status === 1` (Approved) templates in the dropdown
   - If a mapped template becomes Rejected, show a warning banner on the event card

4. **TemplatesPage.jsx** — Show `error_desc_creation` for Rejected templates (if available from AuthKey)

**Files to modify:**
- `/app/frontend/src/pages/TemplatesPage.jsx` (filter logic + badge)
- `/app/frontend/src/components/shared/WhatsAppAutomationContent.jsx` (dropdown filter + warning)

**No backend changes required** — data already flows correctly.

### Risk Assessment
| Risk | Mitigation |
|---|---|
| Breaking existing template display | Filter defaults to "approved" (same as current default) — no visible change for happy path |
| AuthKey API `temp_status` values may have undocumented values | Use a safe default: unknown status → show as "Unknown" with gray badge |
| Performance impact of filtering | Filtering is client-side on typically <50 templates — negligible |

---

## GAP 2: Webhook Failure Description Not Shown

### Current State
- Backend stores `failure_reason` in `whatsapp_message_logs` on rejection
- For webhook-reported failures: `failure_reason = payload.get("reason") or raw_status`
- For initial send failures: `failure_reason = result.error`
- **Frontend MessageStatusPage.jsx has NO column/tooltip for failure reason**
- AuthKey webhook for `status: "failed"` does NOT include a `reason` field — only `status`, `logid`, `time`, `mobile`, `channel`, `meta_messageid`

### Production Data
| Metric | Value |
|---|---|
| Total message logs | 78 |
| Rejected/Failed messages | 0 (for this user) |
| Failed webhooks (across all users) | 7 |
| AuthKey failure webhook fields | `mobile`, `status`, `logid`, `time`, `channel`, `keypress`, `meta_messageid` — **NO `reason` field** |
| Stuck pending (>24h) | 47 messages |

### Impact Analysis

**Severity: MEDIUM**

| Impact Area | Description | Affected Users | Risk |
|---|---|---|---|
| **No failure context** | When messages fail, user sees red "Failed" badge but no explanation | All users with failed messages | HIGH — frustrating UX |
| **Initial send errors invisible** | AuthKey API errors (e.g., "insufficient balance", "Invalid template") are stored in `error` field but never shown | All users | MEDIUM |
| **AuthKey webhook has no reason** | Backend fallback to `raw_status` ("failed") is correct given the data — but it's still unhelpful | All users | LOW — can't fix what AuthKey doesn't send |
| **Current blast radius** | 0 rejected messages exist for active users today. 7 failed webhooks historically (all `no_matching_row` anyway) | Limited today | LOW today |

### Proposed Fix

**Phase 2: Frontend Failure Reason Display** (Est. 1-2 hours)

1. **MessageStatusPage.jsx (Desktop table)** — Add expandable row or tooltip:
   - For `rejected` status: show `failure_reason` field
   - For `pending` status with `error`: show `error` field
   - Tooltip on status badge showing the reason

2. **MessageStatusPage.jsx (Mobile cards)** — Add failure reason text:
   - Below the status badge, show `failure_reason` in red text when status is rejected

3. **Backend enhancement** (optional, low priority):
   - Line 1332: Expand fallback chain for failure_reason capture:
     ```python
     set_fields["failure_reason"] = (
         payload.get("reason") or payload.get("Reason") or 
         payload.get("error") or payload.get("Message") or 
         raw_status
     )
     ```
   - This is defensive — AuthKey currently sends none of these, but future API changes may add them

**Files to modify:**
- `/app/frontend/src/pages/MessageStatusPage.jsx` (add failure reason display)
- `/app/backend/routers/whatsapp.py` line 1332 (defensive fallback — optional)

### Risk Assessment
| Risk | Mitigation |
|---|---|
| Showing raw error strings to users | Sanitize/truncate to 200 chars; don't expose AuthKey internal codes |
| Extra column crowding the table | Use tooltip on status badge instead of a new column |
| AuthKey adds reason field later | Defensive fallback already handles this |

---

## GAP 3 (DISCOVERED): Webhook Message Matching Failure

### Current State
- 1135 out of 1201 webhook callbacks (94.6%) fail with `no_matching_row`
- The webhook looks up by `message_id` field: `db.whatsapp_message_logs.find_one({"message_id": logid})`
- 47 messages with valid `message_id` have NO matching callback — delivery status is permanently lost
- 45 out of 47 stuck pending messages have a `message_id` but no callback was ever received for it

### Production Data
| Metric | Value |
|---|---|
| Total callback webhooks received | 1,201 |
| Successfully matched & applied | 50 (4.2%) |
| No matching message log found | 1,135 (94.6%) |
| Transition ignored (out-of-order) | 9 |
| Rejected (no logid) | 4 |
| Unknown status | 3 |
| Messages stuck pending >24h | 47 |
| Messages with message_id but no callback match | 45 |

### Root Cause Hypothesis
The `no_matching_row` verdict means the webhook's `logid` doesn't match any `message_id` in `whatsapp_message_logs`. Two possible causes:

1. **Messages sent BEFORE the logging system was implemented** — old sends from AuthKey account generate callbacks but have no log rows
2. **Messages sent from other systems** (AuthKey console, other integrations) using the same AuthKey account — their callbacks arrive at our webhook but we never logged the send

For the **45 stuck pending with valid message_id**: the AuthKey webhook may be sending a different `logid` than what the send API returned (case mismatch, encoding issue, or AuthKey internally reassigning IDs).

### Impact Analysis

**Severity: HIGH**

| Impact Area | Description | Affected Users | Risk |
|---|---|---|---|
| **Permanent "Pending" status** | 47 messages (60% of all logs) are stuck pending forever — user sees inaccurate dashboard | All 6 active WhatsApp users | HIGH |
| **Inaccurate stats** | Message Status dashboard shows inflated "Pending" count, understated "Delivered"/"Read" | All users | MEDIUM |
| **Wasted webhook processing** | 94.6% of webhooks are effectively dropped — server processes them for nothing | System-level | LOW |
| **Broken resend logic** | Users may resend messages that were actually delivered (pending status is wrong) | Users who resend | MEDIUM — duplicate sends to customers |

### Proposed Investigation & Fix

**Phase 3: Webhook Matching Deep Investigation** (Est. 3-4 hours investigation + 1-2 hours fix)

**Step 1: Investigate** (before any code changes)
- Log a sample of `no_matching_row` callbacks with their `logid`
- Cross-reference against `whatsapp_message_logs.message_id`
- Check if logid format differs (case, prefix, encoding)
- Check if these are from sends made outside this CRM

**Step 2: Potential Fixes** (depending on investigation findings)

Option A — **logid normalization**: If IDs are same but formatted differently, normalize both sides
Option B — **Fallback lookup by phone+time**: If message_id mismatch is systematic, add secondary lookup:
  ```python
  # If logid doesn't match message_id, try matching by phone+time window
  row = await db.whatsapp_message_logs.find_one({"message_id": logid})
  if not row:
      # Fallback: match by phone number within 5-minute window
      row = await db.whatsapp_message_logs.find_one({
          "customer_phone": webhook_mobile[-10:],
          "status": "pending",
          "created_at": {"$gte": ts_utc_iso_minus_5min}
      })
  ```
Option C — **Ignore external sends**: If callbacks are from non-CRM sends, add logging and accept them as expected

**Files to investigate/modify:**
- `/app/backend/routers/whatsapp.py` (webhook handler)
- `/app/backend/core/whatsapp.py` (send response logid extraction)

### Risk Assessment
| Risk | Mitigation |
|---|---|
| Fallback matching could match wrong message | Use tight window (5 min) + phone match; only for pending messages |
| Fixing old stuck messages | One-time migration script to reconcile old pending messages with existing callbacks |
| Breaking working webhook flow | Don't touch the primary `message_id` lookup — only add fallback |

---

## Implementation Priority & Phasing

| Phase | Gap | Priority | Effort | Dependencies | Recommended Order |
|---|---|---|---|---|---|
| **Phase 1** | Template Status Display | P1 | 2-3h | None | 1st — pure frontend, zero risk |
| **Phase 2** | Failure Reason Display | P2 | 1-2h | None | 2nd — pure frontend, zero risk |
| **Phase 3** | Webhook Matching Investigation | P0 | 3-4h investigate + 1-2h fix | Phase 2 (show failure reason before fixing matching) | 3rd — needs investigation before coding |

### Phase 1 Deliverables
- [ ] AuthKey templates filtered by `temp_status` in TemplatesPage
- [ ] Status badge (Approved/Rejected/Pending) on each template card
- [ ] Event mapping dropdown only shows Approved templates
- [ ] Warning banner when mapped template is Rejected

### Phase 2 Deliverables
- [ ] Failure reason tooltip/text on Message Status table (desktop)
- [ ] Failure reason on mobile message cards
- [ ] Backend: defensive fallback chain for failure_reason field

### Phase 3 Deliverables
- [ ] Investigation report: root cause of 94.6% webhook mismatch
- [ ] Fix implemented based on findings (Option A, B, or C)
- [ ] One-time reconciliation of stuck pending messages
- [ ] Monitoring: log `no_matching_row` rate after fix

---

## Testing Strategy

| Phase | Test Type | Method |
|---|---|---|
| Phase 1 | Visual validation | Screenshot comparison: templates page with filter changes |
| Phase 1 | API validation | Verify `/authkey-templates` response contains `temp_status` for all templates |
| Phase 1 | Regression | Confirm event mapping still works, existing mappings not affected |
| Phase 2 | Visual validation | Screenshot: message status page with failure reason visible |
| Phase 2 | API validation | Inject a test rejected message, verify `failure_reason` appears |
| Phase 3 | Data validation | Before/after: count `no_matching_row` callbacks, stuck pending messages |
| Phase 3 | E2E test | Send a real test message, verify webhook updates status correctly |

---

## Appendix: Raw Data Evidence

### AuthKey `temp_status` Values (Validated)
```
temp_status=1 → Approved (usable for sending)
temp_status=3 → Rejected (NOT usable)
temp_status=4 → Pending Meta review (NOT usable)
```

### Webhook Payload for `status: "failed"` (Real Sample)
```json
{
  "mobile": "919015958953",
  "status": "failed",
  "logid": "daf9547cf9d64c90bbdd11a48cee0915",
  "time": "2026-06-03 16:12:08",
  "channel": "wp",
  "keypress": null,
  "meta_messageid": "wamid.HBgMOTE5MDE1OTU4OTUzFQIAERgSNjQwQz..."
}
```
**Note:** No `reason`, `error`, `description`, or `Message` field exists.

### Webhook Verdict Distribution (Full Dataset: 1,201 callbacks)
```
applied:            50  (4.2%)  ← successfully matched & updated
no_matching_row: 1,135  (94.6%) ← logid not found in message logs
transition_ignored:  9  (0.7%)  ← out-of-order (e.g., delivered after read)
rejected_no_logid:   4  (0.3%)  ← webhook had no logid
unknown_status:      3  (0.2%)  ← unrecognized status value
```

### Message Log Status Distribution (78 total)
```
pending:   50  (64.1%)  ← 47 are stuck >24h
read:      25  (32.1%)  ← successfully delivered + read
sent:       2  (2.6%)   ← legacy format
delivered:  1  (1.3%)   ← delivered but not yet read
rejected:   0  (0%)     ← no failures recorded
```
