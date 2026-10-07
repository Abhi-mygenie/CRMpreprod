# CR-037 — Impact Analysis + Implementation Plan: Template Status Sync Fix

> **Type**: Bug Fix (from INV-004 Issue 5)
> **Date**: 2026-07-01
> **Risk**: LOW
> **Files changed**: 1 (backend/routers/whatsapp.py — 4 lines)
> **Hotspot files touched**: 0

---

## Root Cause (confirmed in INV-004)

`sync_authkey_templates()` in `routers/whatsapp.py` line 721 **always** sets `status: "approved"` when it finds a matching AuthKey WID for a template, regardless of what Meta says the actual status is.

```python
# CURRENT BUG — line 721:
await db.custom_templates.update_one(
    {"id": ct["id"]},
    {"$set": {"authkey_wid": wid, "status": "approved"}}   ← WRONG
)
```

This overwrites a correct `"rejected"` status (set by `check_template_status()`) with a false `"approved"`.

---

## Two Status Paths (conflict diagram)

```
Path A — check_template_status()  [correct]
  GET Meta API → returns "REJECTED"
  → status_map → "rejected"
  → db.update status = "rejected"    ✅ correct

Path B — sync_authkey_templates()  [buggy]
  POST AuthKey migrate → success
  GET AuthKey template list → finds name match
  → db.update status = "approved"    ❌ always "approved", ignores Meta truth
```

Path B runs AFTER Path A when user clicks "Submit to Meta" (via `create_and_sync_template`). So Path B always wins and overwrites the correct status.

---

## Impact Analysis

**Files affected:** 1 — `backend/routers/whatsapp.py`

**DB collections:** `custom_templates` — the `status` field

**Downstream consumers of template status:**

| Consumer | Impact of wrong status |
|---|---|
| TemplateBuilderPage — Submit button | Disabled when `status === "approved"`. Wrongly disabled on rejected templates → user can't resubmit |
| TemplatesPage — template list | Shows green "Approved" badge for rejected templates — confusing |
| Campaign Wizard — template picker | May filter/sort by status. Rejected templates shown as approved |
| `_execute_campaign_send()` | Uses `authkey_wid` to send. If template is rejected, AuthKey returns error → campaign fails |
| DirectSend / Freshmarketer webhook | Same — send attempt will fail silently at AuthKey |

**Risk: LOW** — fix is additive (only changes when status is NOT overwritten). Existing `authkey_wid` assignment is unchanged.

---

## Implementation Plan

### Single edit — `routers/whatsapp.py` line 721

**Current (lines 717–723):**
```python
for ct in local_templates:
    norm_ct = (ct.get("template_name") or "").strip().lower().replace(" ", "_")
    wid = authkey_by_name.get(norm_ct)
    if wid:
        await db.custom_templates.update_one(
            {"id": ct["id"]},
            {"$set": {"authkey_wid": wid, "status": "approved"}}   ← BUG
        )
        wid_updates += 1
```

**Fixed (lines 717–727):**
```python
for ct in local_templates:
    norm_ct = (ct.get("template_name") or "").strip().lower().replace(" ", "_")
    wid = authkey_by_name.get(norm_ct)
    if wid:
        # CR-037: Only update status to "approved" if current status is not
        # already "rejected" (set by Meta status check). Preserves Meta truth.
        current_status = ct.get("status", "draft")
        update_set = {"authkey_wid": wid}
        if current_status not in ("rejected",):
            update_set["status"] = "approved"
        await db.custom_templates.update_one(
            {"id": ct["id"]},
            {"$set": update_set}
        )
        wid_updates += 1
```

**Also fetch current status** (need to include it in the local_templates query):

**Current query (line 712):**
```python
local_templates = await db.custom_templates.find(
    {"user_id": user["id"]}, {"_id": 0, "id": 1, "template_name": 1}
).to_list(None)
```

**Fixed query:**
```python
local_templates = await db.custom_templates.find(
    {"user_id": user["id"]}, {"_id": 0, "id": 1, "template_name": 1, "status": 1}
).to_list(None)
```

---

## Verification Matrix (post-fix)

| # | Check | How to verify |
|---|---|---|
| V1 | Rejected template stays `rejected` after AuthKey sync | Set a template to `status: "rejected"` in DB → run sync → status still `rejected` |
| V2 | `authkey_wid` IS updated even on rejected template | After V1, check DB — `authkey_wid` field is populated ✅ |
| V3 | Draft/pending templates still get set to `approved` on sync | Set template to `draft` → sync → status becomes `approved` |
| V4 | Template Builder submit button: disabled for rejected (not blocked forever) | Rejected template in builder — submit button should be ENABLED (user can resubmit to Meta) |
| V5 | TemplatesPage shows correct rejected badge | Rejected template shows "Rejected" status |

---

## Note on Submit Button (V4 — secondary fix needed)

Currently `TemplateBuilderPage.jsx` line 391:
```jsx
<Button disabled={submitting || status === "approved"}>Submit to Meta</Button>
```

After this fix, rejected templates will correctly show `status: "rejected"` in DB. The Submit button should be re-enabled for rejected templates (so the user can resubmit with corrections). This is a **1-line frontend fix** bundled with the backend fix.

**Fix:**
```jsx
<Button disabled={submitting || status === "approved"}>Submit to Meta</Button>
// No change needed — "rejected" !== "approved" so button stays enabled ✅
// Already correct if status is "rejected"
```

Actually no change needed on frontend — it only disables on `"approved"`, so once status is correctly `"rejected"`, the button auto-enables. ✅

---

## Files WILL Change
- `backend/routers/whatsapp.py` — 2 targeted edits (query + status guard)

## Files WILL NOT Touch
- All hotspot files
- Frontend — no change needed (button logic is already correct)
- DB schema — no change

---

## Planning Output

```
Planning complete: CR-037
Stage: Impact Analysis + Implementation Plan
Risk: LOW
Files WILL change: backend/routers/whatsapp.py (2 edits, ~8 lines)
Files WILL NOT touch: all hotspot files, frontend, schemas
Owner decisions needed: NONE — bug fix, no design choices
Estimated effort: 15 minutes
Verification: V1-V5 above
Next: IMPLEMENTATION on owner approval
```

---

*End of CR-037 Impact Analysis + Plan*
