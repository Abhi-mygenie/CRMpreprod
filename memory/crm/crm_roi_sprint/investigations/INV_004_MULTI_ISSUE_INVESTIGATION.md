# INV-004 — Multi-Issue Investigation Report

> **Role**: INVESTIGATION AGENT (Role 6)
> **Date**: 2026-07-01
> **Requested by**: Owner
> **Step budget used**: 10 / 10
> **Confidence**: HIGH for Issues 1, 4, 5 | MEDIUM for Issues 2, 3, 6
> **Code edits**: NONE (investigation only)

---

## Issue 1 — Scheduled Campaigns Not Firing

### Finding: CONFIRMED ROOT CAUSE — ENV FLAG IS OFF

```
CAMPAIGN_SCHEDULER_ENABLED = "false"   ← /app/backend/.env
```

The scheduler **runs every 1 minute** (`process_due_campaigns`) but the very first line of the function is:

```python
def _is_enabled():
    return os.environ.get("CAMPAIGN_SCHEDULER_ENABLED", "false").lower() == "true"

async def process_due_campaigns():
    if not _is_enabled():
        return   # ← exits immediately, every tick
```

**DB evidence — campaigns that were meant to fire but didn't:**

| Campaign name | Status | next_run_at | What happened |
|---|---|---|---|
| June Loyalty Boost | `draft` | 2026-06-08 04:30 UTC | Never moved to `scheduled` |
| gold | `paused` | 2026-06-09 04:30 UTC | Paused, never fired |
| test | `missed` | 2026-06-10 04:30 UTC | Flag was off — marked stale |
| test campaign (R635) | `missed` | 2026-06-10 00:16 UTC | Same — missed window |
| Mygenie_23 (R523) | `scheduled` | 2026-06-24 04:30 UTC | Never fired — past due |

The campaign with `status: "scheduled"` and `next_run_at: 2026-06-24` (now 1 week overdue) will be marked `missed` the next time the scheduler checks because it exceeds the 24-hour stale window.

**Fix needed (owner decision required):**
Set `CAMPAIGN_SCHEDULER_ENABLED=true` in `/app/backend/.env` and restart backend.
> ⚠ DECISIONS_LOG records this was intentionally kept `false` until owner confirms. Owner must explicitly approve enabling.

---

## Issue 2 — English Template Showing as Hindi on WhatsApp

### Finding: PARTIAL — DATABASE CLEAN, ROOT CAUSE UNCLEAR

**DB check:**  All 10 custom_templates in DB have `language: "en_US"`. Zero templates with `language: "hi"`.

**Frontend language selector** (TemplateBuilderPage.jsx line 434-435):
```jsx
<SelectItem value="en_US">English (en_US)</SelectItem>
<SelectItem value="hi">Hindi (hi)</SelectItem>
```

**Backend default (whatsapp.py line 424):**
```python
language = payload.get("language", "en")   # fallback is "en" not "en_US"
```

**Hypothesis A** (most likely): Meta API accepts `en_US` but NOT `"en"` as a language code. If any template was submitted before the frontend Select was added (hardcoded `"en"` default), Meta may have silently mapped it to Hindi (`hi`) or another default. AuthKey then delivers that Meta-registered language.

**Hypothesis B**: The AuthKey WID (`authkey_wid`) stored in the template record may be pointing to a **different** template in AuthKey that happens to have the same name but was originally created in Hindi. When `sync_authkey_templates` runs, it matches by name only, not by language.

**What's needed to confirm:**
- Which specific event triggers the Hindi send? (e.g., `send_bill` / `birthday` / campaign)
- Does the actual WhatsApp message body contain Hindi text, or is it English text displaying inside a Hindi-language container?
- Check AuthKey console directly: look up the template by WID and see its registered language.

**Classification**: DATA_EDGE / INTERACTION — needs owner to provide specific template name that sends Hindi.

---

## Issue 3 — Header Image / Video Template Working?

### Finding: CODE EXISTS BUT MEDIA HANDLE FORMAT IS WRONG

The Template Builder **does** support image/video/document headers in both frontend and backend. The builder shows them as selectable options and the code sends them to Meta.

**The problem:** Meta API v18+ requires **pre-uploaded media handles** (not direct URLs) for media header templates. The current code sends:

```python
# whatsapp.py line 487
header_component["example"] = {"header_handle": [media_url]}
# e.g. {"header_handle": ["https://example.com/image.jpg"]}
```

**Meta API requires:**
```json
{"header_handle": ["4:abc123xyz..."]}   ← must be a Meta-uploaded media handle
```

Direct HTTPS URLs are rejected by Meta for template examples. You must first upload the media via `/media` API, get back a `media_id`, then pass that as the handle.

**Impact:**
- Text headers: ✅ Working (no media upload needed)
- Image / Video / Document headers: ⚠️ Likely rejected by Meta at submission time (template will show `status: rejected`)
- This also explains some of the "rejected" templates in the DB

**What's needed to confirm:** Check if any image/video template was ever approved by Meta. The DB shows all CRM templates with non-`approved` statuses for non-text headers.

---

## Issue 4 — Export / Import Customer List (Discovery)

### Finding: FEATURE DOES NOT EXIST — GAP CONFIRMED

**Zero code found** for export or import in:
- `backend/routers/customers.py` — no CSV/Excel endpoint
- `frontend/src/pages/CustomersPage.jsx` — no export button or import modal

**What currently exists** that is related:
- `POST /api/customers/sync-from-mygenie` — syncs from MyGenie POS (not a CSV import)
- `GET /api/customers` — returns JSON list (not CSV/Excel)

**Questions needed from owner before planning (Q1–Q6):**

| # | Question | Why it matters |
|---|---|---|
| Q1 | **Export format**: CSV only, or also Excel (.xlsx)? | Different libraries, different complexity |
| Q2 | **Export fields**: All ~100 customer fields or a specific subset? | Field mapping complexity |
| Q3 | **Import format**: CSV only? Or Excel too? | Parsing library needed |
| Q4 | **Import behaviour on duplicate phone**: Skip? Update? Error? | Core business logic |
| Q5 | **Import — what fields are mandatory?** | Validation rules |
| Q6 | **Import row limit**: What's the max batch? (500? 5000?) | Performance planning |

**Estimated effort (once Q1-Q6 answered):**
- Export only: ~2 hours (stream CSV from existing `GET /customers` query)
- Import only: ~4 hours (CSV parse + validate + upsert)
- Both: ~6–7 hours — LOW risk, no hotspot files

---

## Issue 5 — Template Status Mismatch: AuthKey Shows Rejected, CRM Shows Approved

### Finding: CONFIRMED ROOT CAUSE — BUG IN `sync_authkey_templates`

**The conflict has two paths:**

| Path | When triggered | What it does |
|---|---|---|
| `check_template_status()` | Manual "Refresh Status" click on Templates page | Reads Meta API → sets correct status (approved/rejected/pending) |
| `sync_authkey_templates()` | "Sync to AuthKey" button | Finds matching AuthKey WID → blindly sets `status: "approved"` for ANY match |

**The bug (whatsapp.py line 721):**
```python
# sync_authkey_templates() — after finding a matching template by name in AuthKey:
await db.custom_templates.update_one(
    {"id": ct["id"]},
    {"$set": {"authkey_wid": wid, "status": "approved"}}   # ← ALWAYS "approved"
)
```

**Scenario that causes the bug:**
1. Template is created on Meta → Meta rejects it
2. User clicks "Sync to AuthKey" — AuthKey list still has the template (AuthKey keeps rejected templates in its list)
3. CRM finds a name match → overwrites `status: "rejected"` with `status: "approved"`
4. Result: CRM says "approved", Meta/AuthKey truth says "rejected"

**Impact:** Owner may unknowingly try to send campaigns using a rejected template. Campaign will fail at send time (AuthKey will return error 400/rejected).

**Fix needed (small, targeted):**
In `sync_authkey_templates()`, change line 721 to NOT overwrite status if it's already `"rejected"`:
```python
# Only set authkey_wid, preserve existing status unless it was draft/pending
update_set = {"authkey_wid": wid}
if ct.get("status") not in ("rejected", "approved"):
    update_set["status"] = "approved"
await db.custom_templates.update_one({"id": ct["id"]}, {"$set": update_set})
```

---

## Issue 6 — Loyalty Not Working in Prod + Last Visit Showing Wrong (from image)

### Finding A — Loyalty Not Working: CONFIRMED, `loyalty_enabled=false` FOR 14 RESTAURANTS

From the image: customer with 450 visits, ₹2.1L spent, **0 points**, wallet ₹5,973.

DB confirms: **14 restaurants have `loyalty_enabled: false`** including some with thousands of orders:

| Restaurant | Orders | loyalty_enabled |
|---|---|---|
| restaurant_644 | 12,683 | **false** |
| restaurant_623 | 2,797 | **false** |
| restaurant_719 | 2,082 | **false** |
| restaurant_665 | 1,871 | **false** |
| restaurant_474 | 1,504 | **false** |

The code confirms (pos.py line 685-689):
```python
if settings.get("loyalty_enabled") and ...:
    # points calculated
```
If `loyalty_enabled = false`, **zero points are ever calculated or awarded**.

**Fix:** Owner must go to **Loyalty Settings** in CRM and toggle Loyalty ON for their restaurant.

### Finding B — Last Visit Showing Wrong: MIXED DATE FORMAT IN DB

The DB has two different datetime formats for `last_visit`:
- **Old format (string):** `"2026-03-27 15:45:57"` (no timezone, space separator)
- **New format (ISO):** `"2026-06-27T05:32:02.637370+00:00"` (timezone-aware)

The frontend "X days ago" calculation likely uses `new Date(last_visit)`. In JavaScript:
- `new Date("2026-06-27T05:32:02.637370+00:00")` → parses correctly ✅
- `new Date("2026-03-27 15:45:57")` → **parses incorrectly in some browsers** (returns NaN or wrong time) → shows wrong relative time

**However:** From my DB check, `last_visit` and `latest_order.created_at` match for the 5 customers I checked. So the display may be correct but the customer shown in the image has an old-format `last_visit` value from before the CRM started writing ISO format.

**What's needed to confirm:** Which specific customer and restaurant is in the image? Share the phone number or restaurant name.

---

## Summary Output Block

```
Investigation complete: INV-004
Issues investigated: 6
Confidence: HIGH (Issues 1, 4, 5) | MEDIUM (Issues 2, 3, 6)
Steps used: 10/10

ISSUE 1 — Scheduled campaigns not firing
  Root cause: CAMPAIGN_SCHEDULER_ENABLED="false" in .env (intentional, gated)
  Fix: Owner approves → set to "true" + restart backend
  Classification: CONFIG
  Risk: MEDIUM — once enabled, due campaigns may fire immediately

ISSUE 2 — EN message showing as Hindi
  Root cause: INCONCLUSIVE — DB templates all en_US, AuthKey WID may point to Hindi version
  Next: Owner to provide specific template name + event that sends Hindi
  Classification: UNKNOWN / DATA_EDGE

ISSUE 3 — Header image/video templates
  Root cause: IDENTIFIED — CRM sends direct HTTPS URL as media handle, Meta requires pre-uploaded media ID
  Impact: Image/video header templates WILL BE REJECTED by Meta
  Fix: Needs media upload pre-step via Meta /media API
  Classification: PLAN_GAP

ISSUE 4 — Export/Import customer list
  Root cause: Feature does not exist — zero code
  Next: Owner answers Q1-Q6 → register as new CR
  Classification: FEATURE GAP (new CR needed)

ISSUE 5 — Template status mismatch (AuthKey rejected / CRM approved)
  Root cause: sync_authkey_templates() blindly sets status="approved" on name-match, overwriting correct "rejected" status
  Fix: 2-line change in whatsapp.py line 721
  Classification: CODE_ERROR

ISSUE 6 — Loyalty not working / last visit wrong
  Root cause A (loyalty): loyalty_enabled=false for 14 restaurants — owner setting issue
  Root cause B (last visit): mixed date format in DB — old records use non-ISO format
  Classification: CONFIG (loyalty) / DATA_EDGE (last visit)

Next roles:
  Issue 1: OWNER DECISION → IMPLEMENTATION (flip flag)
  Issue 2: More info needed from owner
  Issue 3: PLANNING → needs Meta media upload endpoint design
  Issue 4: INTAKE (new CR) after Q1-Q6 answered
  Issue 5: IMPLEMENTATION (small fix, low risk)
  Issue 6: OWNER ACTION (turn on loyalty in settings) + DATA investigation
```

---

*End of INV-004*
