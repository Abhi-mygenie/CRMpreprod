# CR-024 Phase 4 — Polish & Operational Safety

> **Status**: `cr024_phase4_planning_draft`
> **Date**: 2026-06-07
> **Author**: E1 (session 6)
> **Depends on**: CR-024 Phase 1 (closed 2026-06-06), Phase 3 (closed 2026-06-07)
> **Closes gaps**: G7, G8, G11, G13 from discovery + 7 deferred items from Phase 3
> **Effort estimate**: ~9-12 hr total. Splittable into 3 batches.
> **Risk**: LOW-MEDIUM — touches existing flows but all changes additive/guarded.

---

## 1. Code Audit — Ground Truth (2026-06-07)

Before re-planning, I audited the actual codebase. Several "gaps" from the discovery doc are partially or fully closed already. The plan below reflects **actual remaining work**, not stale discovery state.

### 1.1 G7 — Editable segment filters

| Discovery claim | Reality (audited) |
|---|---|
| "`update_segment` only updates `name`. Cannot change filters." | **Partially false.** `routers/customers.py:1413-1429` already accepts `filters` in `SegmentUpdate` and recounts customers. `models/schemas.py:915-917` confirms `SegmentUpdate.filters: Optional[dict]`. |
| → **Gap is frontend-only**: AudiencesPage has no "Edit" button; only Preview + Delete (lines 217-222). |

### 1.2 G8 — Stale customer count

| Discovery claim | Reality (audited) |
|---|---|
| "Count in segment cards can be stale between page loads" | **Backend is fine**: `list_segments` (line 1374) recounts on every list-fetch and persists. **Gap is**: (1) no `last_counted_at` field, (2) recount is O(N) blocking inside the request (slow on large tenants — Kunafa has 2038 customers, runs every Audiences page load), (3) no "refresh now" affordance. |

### 1.3 G11 — "All Customers" synthetic id

| Discovery claim | Reality (audited) |
|---|---|
| "Backend WhatsApp config save fails silently because `segment_id: 'all-customers'` doesn't match any real segment." | **Partially true** — `routers/campaigns.py:48` already special-cases the string `"all-customers"` correctly. Other endpoints that touch `segment_id` (whatsapp_config, segment customers) **don't** handle this token. |
| → Need: audit every `segment_id` consumer + branch the token consistently OR persist a real `is_system=true` row per tenant. |

### 1.4 G13 — In-flow variable mapping

| Discovery claim | Reality (audited) |
|---|---|
| "Template picker only shows fully mapped templates" | **Confirmed** — `CampaignWizardPage.jsx:165` `canStep2 = templateId && isFullyMapped(currentTemplate)`. If not mapped, button disabled, no inline editor. |
| → Need: inline variable mapping editor in Step 2 of wizard. |

### 1.5 Deferred from Phase 3 (new items, NOT in discovery)

These were added to the backlog when Phase 3 closed:

| ID | Item | Source |
|----|------|--------|
| **P4.5** | Show `next_run_at` column on CampaignsPage rows | Phase 3 finish summary |
| **P4.6** | Pause/Resume buttons on scheduled & recurring campaigns | Phase 3 finish summary |
| **P4.7** | Campaign clone (duplicate as draft) | Phase 3 finish summary |
| **P4.8** | Resend failed messages from a campaign_run | Phase 3 finish summary |
| **P4.9** | Edit-while-scheduled guard rails | Phase 3 finish summary |
| **P4.10** | "Test Send" button (1-message dry run before scheduling 2000) | Phase 3 finish summary |
| **P4.11** | "Missed" status badge + tooltip + manual "Re-run now" | Phase 3 design decision (status `missed` set but no UI affordance) |

---

## 2. Scope — Final List (4 + 7 = 11 items)

### 2.1 IN scope

| ID | Item | Effort | Priority | Risk |
|----|------|--------|----------|------|
| **P4.1** | AudiencesPage: Edit button → modal with prefilled filters → calls existing PUT `/segments/{id}` | 1.5 hr | P1 | LOW |
| **P4.2** | Segment count: add `last_counted_at` field; refactor `list_segments` to NOT block on recount (return cached + `is_stale` flag); add explicit `POST /segments/{id}/refresh-count`; frontend shows "Last counted X min ago" + refresh icon | 2 hr | P1 | LOW (perf win) |
| **P4.3** | "All Customers" token: audit every endpoint touching `segment_id`, add helper `_resolve_audience_query(user_id, audience_id)` returning Mongo query for both real segment and `"all-customers"`. Apply in 3 consumer sites (campaigns, whatsapp_config, segment customers/preview) | 1 hr | P1 | LOW |
| **P4.4** | Wizard Step 2: when a template is partially mapped, show inline "Map missing variables" panel that hits existing `/templates/{id}/mappings` PUT, replaces the disabled state. Reuses VariablePicker | 1.5 hr | P2 | LOW |
| **P4.5** | CampaignsPage row: add `next_run_at` display ("Next: 8 Jun 10:00 IST" with relative time tooltip); only when `status=scheduled` AND has `next_run_at` | 30 min | P1 | NONE |
| **P4.6** | Pause/Resume: new statuses `paused`. Action button on `scheduled/recurring/active` rows. Backend `POST /campaigns/{id}/pause` + `/resume`. Scheduler skips `status=paused`. Resume recomputes `next_run_at` if past. | 2 hr | P1 | LOW |
| **P4.7** | Campaign clone: backend `POST /campaigns/{id}/clone` returns new draft with copied template+audience+variables, `status=draft`, `schedule_type=now`, blank `next_run_at`, `name="<original> (copy)"`. Frontend "Clone" menu item | 30 min | P2 | NONE |
| **P4.8** | Resend failed: backend `POST /campaigns/{cid}/runs/{rid}/resend-failed` — re-fires only the phones from `whatsapp_message_logs` with `status=failed` and `campaign_id=rid`, creates a NEW campaign_run linked to original. Frontend: "Resend N Failed" button in CampaignHistoryPage drilldown | 2 hr | P2 | MEDIUM (must dedupe; need careful query) |
| **P4.9** | Edit-while-scheduled guard: when wizard opens a campaign with `status=scheduled`, lock audience selector + schedule step. Show banner: "This campaign is scheduled. Cancel & re-create to change audience/schedule." Allow template + variables changes. Backend: `update_campaign` rejects audience_id/schedule_type changes when `status=scheduled` | 1 hr | P1 | LOW |
| **P4.10** | Test Send: backend `POST /campaigns/{id}/test-send` accepts `{phone, country_code}`, sends 1 message via existing send_bulk path, returns delivery result. Frontend: small "Send Test" link in Step 2 with phone input. Does NOT log to campaign_runs (test_sends collection). | 1.5 hr | **P0** | LOW |
| **P4.11** | "Missed" UI: red badge on CampaignsPage, tooltip with `error` text, "Re-run now" action that resets `status=scheduled` + recomputes `next_run_at` (or refuses if too stale). | 45 min | P2 | LOW |

**Total**: ~14 hr. Owner can pick subsets — see §6 batches.

### 2.2 OUT of scope (deferred to a future CR)

- Per-tenant timezone (single global Asia/Kolkata for now)
- Catch-up notifications (email/WhatsApp when `missed`)
- A/B testing on recurring campaigns
- Cost estimation display per send (₹ per message)
- Bulk operations (multi-select campaigns → bulk pause/delete)
- Soft-delete + restore for campaigns
- "Schedule for specific date+time" with recurring pre-template (e.g., "Every Diwali")

### 2.3 Explicit non-goals

- ❌ Do NOT change existing P1 send-now flow
- ❌ Do NOT migrate the 1 `all-customers` synthetic id to a real DB row (low value, breaks UI assumption that it's filterable by `isDefault`); use a token-aware helper instead
- ❌ Do NOT touch `_execute_campaign_send` core logic (Phase 3 just verified it)
- ❌ Do NOT change scheduler cadence or timezone

---

## 3. Design — File-by-File

### 3.1 P4.1 Editable filters (frontend-only)

**File**: `frontend/src/pages/AudiencesPage.jsx`

Changes:
1. Add `Edit` button next to Preview/Delete (line 217-222):
   ```jsx
   <button onClick={() => handleEdit(seg)} className="px-3 py-1.5 text-xs ...">Edit</button>
   ```
2. Reuse the existing Create dialog by adding `editingSeg` state. Open with prefilled filters:
   ```jsx
   const handleEdit = (seg) => {
     setEditingSeg(seg);
     setNewName(seg.name);
     setNewFilters({ ...defaults, ...seg.filters });
     setShowCreate(true);
   };
   ```
3. Modify `handleCreate` → `handleSave` branches on `editingSeg`:
   ```jsx
   if (editingSeg) {
     await api.put(`/segments/${editingSeg.id}`, { name, filters });
     toast.success("Audience updated");
   } else {
     await api.post(...);
   }
   ```
4. Dialog title changes to "Edit Audience" when editingSeg is set.
5. Clear `editingSeg` on dialog close.

**Backend**: NO CHANGES — `PUT /segments/{id}` already supports filters update.

### 3.2 P4.2 `last_counted_at` + non-blocking list

**Files**: `backend/routers/customers.py`, `backend/models/schemas.py`, `frontend/src/pages/AudiencesPage.jsx`

Backend changes:
```python
# schemas.py
class Segment(BaseModel):
    ...
    last_counted_at: Optional[str] = None  # ISO8601 UTC

# customers.py list_segments — STOP blocking recount on every list
async def list_segments(user: dict = Depends(get_current_user)):
    segments = await db.segments.find({"user_id": user["id"]}, {"_id": 0}).to_list(100)
    return [Segment(**s) for s in segments]  # return cached counts

# NEW endpoint
@segments_router.post("/{segment_id}/refresh-count")
async def refresh_segment_count(segment_id: str, user: dict = Depends(get_current_user)):
    segment = await db.segments.find_one({"id": segment_id, "user_id": user["id"]})
    if not segment:
        raise HTTPException(404, "Segment not found")
    count = await count_customers_by_filters(user["id"], segment["filters"])
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.segments.update_one(
        {"id": segment_id},
        {"$set": {"customer_count": count, "last_counted_at": now_iso}},
    )
    return {"customer_count": count, "last_counted_at": now_iso}

# At create/update — already recounts; just persist last_counted_at too
```

**Migration concern**: existing rows have no `last_counted_at` → frontend should show "—" + show "Refresh" button. NO migration required (additive field).

**Daily auto-refresh**: piggyback on existing `daily_loyalty_jobs` to refresh all segment counts at 00:00 UTC. ~10 LoC.

Frontend changes:
- After `<div className="text-2xl font-extrabold text-[#F26B33] my-2">`, add `<div className="text-[10px] text-gray-400">Counted {relativeTime(last_counted_at)} <RefreshIcon onClick={...}/></div>`
- `RefreshIcon` click → `POST /segments/{id}/refresh-count` → setState locally
- Existing 2038-customer count load won't be slow anymore (cached)

### 3.3 P4.3 "All Customers" token helper

**Files**: `backend/core/helpers.py`, `backend/routers/customers.py`, `backend/routers/campaigns.py`

New helper:
```python
# core/helpers.py
async def resolve_audience(db, user_id: str, audience_id: str) -> tuple[dict, str]:
    """Returns (mongo_query, audience_name). Handles 'all-customers' token + real segment ids.
    Raises HTTPException(404) if audience_id is not 'all-customers' and segment not found.
    """
    if audience_id == "all-customers":
        return ({"user_id": user_id}, "All Customers")
    segment = await db.segments.find_one({"id": audience_id, "user_id": user_id})
    if not segment:
        from fastapi import HTTPException
        raise HTTPException(404, "Audience not found")
    return (build_customer_query(user_id, segment.get("filters", {})), segment.get("name", ""))
```

Apply at 3 sites:
1. `routers/campaigns.py:_resolve_audience_customers` — already correct, just refactor to use helper
2. `routers/customers.py:get_segment_customers` (line 1402) — add `all-customers` branch
3. `routers/customers.py:get_segment` (line 1391) — return synthetic Segment for `all-customers` so wizard's GET works uniformly

### 3.4 P4.4 Inline variable mapping in wizard Step 2

**Files**: `frontend/src/pages/CampaignWizardPage.jsx`

Changes:
1. When `templateId` is selected AND `!isFullyMapped(currentTemplate)`, replace the disabled "Next" state with an inline panel showing the unmapped variables and a `VariablePicker` for each.
2. On save, persist via existing `PUT /templates/{templateId}/mappings` (or equivalent — verify endpoint).
3. After save, refresh `allMappings` state, re-evaluate `isFullyMapped`.

Need to check existing template mapping endpoint — likely `PUT /whatsapp/templates/{id}/mappings`. (Adds ~10 min audit.)

### 3.5 P4.5 `next_run_at` on CampaignsPage rows

**File**: `frontend/src/pages/CampaignsPage.jsx`

In the campaign row render (around line 200 — need to view full render):
```jsx
{c.status === "scheduled" && c.next_run_at && (
  <div className="text-xs text-blue-600 flex items-center gap-1">
    <Clock className="w-3 h-3" />
    Next: {formatIST(c.next_run_at)}
  </div>
)}
```

Add `formatIST()` util: parse UTC ISO → convert to IST → format `"8 Jun 10:00 IST"`. Use `date-fns` (already in package.json).

### 3.6 P4.6 Pause / Resume

**Files**: `backend/routers/campaigns.py`, `backend/core/campaign_jobs.py`, `frontend/src/pages/CampaignsPage.jsx`

Backend:
```python
@router.post("/{campaign_id}/pause")
async def pause_campaign(campaign_id: str, user: dict = Depends(get_current_user)):
    res = await db.campaigns.update_one(
        {"id": campaign_id, "user_id": user["id"],
         "status": {"$in": ["scheduled", "active"]}},
        {"$set": {"status": "paused",
                  "previous_status": "scheduled",  # for resume
                  "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    if res.modified_count == 0:
        raise HTTPException(409, "Cannot pause — campaign not in scheduled/active state")
    return {"status": "paused"}

@router.post("/{campaign_id}/resume")
async def resume_campaign(campaign_id: str, user: dict = Depends(get_current_user)):
    campaign = await db.campaigns.find_one({"id": campaign_id, "user_id": user["id"]})
    if not campaign or campaign.get("status") != "paused":
        raise HTTPException(409, "Cannot resume — campaign not paused")
    from core.campaign_jobs import compute_next_run_at
    next_at = compute_next_run_at(campaign, datetime.now(timezone.utc))
    update = {"status": "scheduled", "updated_at": datetime.now(timezone.utc).isoformat()}
    if next_at:
        update["next_run_at"] = next_at
    await db.campaigns.update_one({"id": campaign_id}, {"$set": update})
    return {"status": "scheduled", "next_run_at": next_at}
```

Scheduler change: `process_due_campaigns()` already queries `status="scheduled"` — paused rows naturally skip. No change needed.

Frontend: add Pause/Resume to dropdown menu in CampaignsPage row.

### 3.7 P4.7 Clone

**Backend**:
```python
@router.post("/{campaign_id}/clone")
async def clone_campaign(campaign_id: str, user: dict = Depends(get_current_user)):
    src = await db.campaigns.find_one({"id": campaign_id, "user_id": user["id"]}, {"_id": 0})
    if not src:
        raise HTTPException(404, "Campaign not found")
    now = datetime.now(timezone.utc).isoformat()
    clone = {**src,
        "id": str(uuid.uuid4()),
        "name": f"{src['name']} (copy)",
        "status": "draft",
        "schedule_type": "now",
        "scheduled_date": None, "scheduled_time": None,
        "recurring_frequency": None, "recurring_days": None,
        "recurring_day_of_month": None, "recurring_end_option": None,
        "recurring_end_date": None, "recurring_occurrences": None,
        "next_run_at": None, "claimed_at": None,
        "total_sent": 0, "total_delivered": 0, "total_read": 0, "total_failed": 0,
        "run_count": 0, "last_run_at": None, "error": None,
        "created_at": now, "updated_at": now,
    }
    await db.campaigns.insert_one(clone)
    clone.pop("_id", None)
    return clone
```

Frontend: add "Clone" item to row dropdown.

### 3.8 P4.8 Resend Failed

**Backend** (most complex item):
```python
@router.post("/{campaign_id}/runs/{run_id}/resend-failed")
async def resend_failed(campaign_id, run_id, background_tasks, user=Depends(get_current_user)):
    # 1. Find failed phones from whatsapp_message_logs for this campaign_run
    failed_logs = await db.whatsapp_message_logs.find({
        "user_id": user["id"],
        "campaign_id": run_id,  # campaign_run.id stored as campaign_id in logs
        "status": {"$in": ["failed", "Failed"]},
    }, {"_id": 0, "phone": 1, "customer_id": 1}).to_list(2000)

    if not failed_logs:
        raise HTTPException(400, "No failed messages to resend in this run")

    phones = list({lg["phone"] for lg in failed_logs})
    # 2. Spawn background task that mimics _execute_campaign_send but on this phone subset
    background_tasks.add_task(_execute_resend_subset, campaign_id, run_id, phones, user["id"])
    return {"resending_count": len(phones)}
```

`_execute_resend_subset()` is a new helper (~80 LoC) that reuses `build_body_values()` + `send_bulk_messages()` but loads only the phone subset. Creates a NEW campaign_run with `parent_run_id=run_id`.

**Frontend**: CampaignHistoryPage row → click "View details" → modal showing per-run breakdown → if `total_failed > 0` show "Resend {N} Failed" button.

### 3.9 P4.9 Edit-while-scheduled guards

**Backend**: `update_campaign` rejects audience/schedule changes when `status=scheduled`:
```python
if campaign.get("status") == "scheduled":
    LOCKED = {"audience_id", "audience_name", "schedule_type", "scheduled_date",
              "scheduled_time", "recurring_frequency", "recurring_days",
              "recurring_day_of_month", "recurring_end_option",
              "recurring_end_date", "recurring_occurrences"}
    bad = LOCKED & set(updates.keys())
    if bad:
        raise HTTPException(409,
            f"Cannot change {sorted(bad)} on a scheduled campaign. Pause first.")
```

**Frontend**: on wizard load, if `c.status === "scheduled"`, disable audience radio in Step 1 + entire Step 3, show amber banner: "This campaign is live in the schedule. Pause to change audience or timing."

### 3.10 P4.10 Test Send (P0 — highest user value)

**Backend**:
```python
@router.post("/{campaign_id}/test-send")
async def test_send(campaign_id: str, body: dict, user=Depends(get_current_user)):
    phone = (body.get("phone") or "").replace(" ", "").replace("-", "")
    country_code = body.get("country_code", "91").replace("+", "")
    if not phone:
        raise HTTPException(400, "Phone required")

    campaign = await db.campaigns.find_one({"id": campaign_id, "user_id": user["id"]})
    if not campaign:
        raise HTTPException(404)
    if not campaign.get("template_id"):
        raise HTTPException(400, "Template not set")

    api_key = await get_user_authkey(db, user["id"])
    if not api_key:
        raise HTTPException(400, "AuthKey not configured")

    # Use a synthetic customer with empty fields + brand_data — picker default values appear
    user_doc = await db.users.find_one({"id": user["id"]}, {"_id": 0,
        "restaurant_name": 1, "einvoice_link": 1, "instagram_link": 1,
        "google_review_link": 1, "feedback_link": 1})
    brand_data = {k: (user_doc or {}).get(k, "") for k in
        ["restaurant_name", "einvoice_link", "instagram_link", "google_review_link", "feedback_link"]}

    body_values = build_body_values(
        list(campaign.get("variable_mappings", {}).keys()),
        campaign.get("variable_mappings", {}),
        {"name": "Test User", "phone": phone, "tier": "Bronze", "total_points": 100},
        {},
        variable_modes=campaign.get("variable_modes", {}),
        brand_data=brand_data,
        menu_pick_resolved=campaign.get("menu_pick_resolved", {}),
    )

    msg = WhatsAppMessage(
        phone=phone, country_code=country_code,
        template_id=campaign["template_id"],
        body_values=body_values, customer_id="test")
    res = await send_bulk_messages(api_key, [msg])
    result = (res.get("results") or [{}])[0]

    # Log to a separate test_sends collection for audit
    await db.campaign_test_sends.insert_one({
        "id": str(uuid.uuid4()), "user_id": user["id"], "campaign_id": campaign_id,
        "phone": phone, "country_code": country_code,
        "success": result.get("success", False), "message_id": result.get("message_id"),
        "error": result.get("error"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"success": result.get("success"), "message_id": result.get("message_id"),
            "error": result.get("error")}
```

**Frontend**: in Step 2 of wizard, below the template preview:
```jsx
<div className="border-t pt-3 mt-3">
  <Label className="text-xs">Send Test Message</Label>
  <div className="flex gap-2 mt-1">
    <Input value={testPhone} onChange={...} placeholder="9999999999" />
    <Button size="sm" onClick={handleTestSend}>Send Test</Button>
  </div>
</div>
```

Per Phase 3's owner lock "no live WhatsApp without explicit approval" — Test Send is the EXPLICIT manual approval surface, single-recipient, fully auditable.

### 3.11 P4.11 Missed UI

**Frontend**: status badge for `status=missed` — red, tooltip from `campaign.error`. Dropdown "Re-run now" → `PUT /campaigns/{id}` `{status: "scheduled"}` + compute new next_run_at via `/send`.

**Backend**: status mapping in `STATUS_CONFIG` (CampaignsPage.jsx line 13) — add `missed: {label: "Missed", color: "bg-red-100 text-red-700"}`.

---

## 4. Open questions for owner

| # | Question | Default if no answer |
|---|----------|----------------------|
| Q1 | All 11 items, top-4 only, or custom subset? | **Top batches** (see §6) |
| Q2 | Should "Test Send" log to a separate collection or skip logging entirely? | **Separate `campaign_test_sends`** for audit |
| Q3 | Resend Failed — create NEW campaign_run linked to original, or extend the original? | **NEW with `parent_run_id`** (cleaner audit) |
| Q4 | Pause behaviour on `active` (currently firing) campaign — wait for current send to finish then pause, or abort mid-send? | **A — Wait — set status=paused, don't kill in-flight task. ✅ LOCKED 2026-06-07.** Tooltip on Pause button: "Pause stops future runs. Messages already in flight will complete (≤2 min for large campaigns)." |
| Q5 | Edit-while-scheduled — should we allow template change too, or lock everything except `name`? | **Allow template + variables + name; lock audience + schedule** |
| Q6 | Clone scope — copy seed data exactly or strip `audience_count` (will be stale)? | **Strip audience_count** (recomputed on first preview) |
| Q7 | Daily auto-refresh of segment counts via existing midnight cron — OK or skip? | **OK — adds ~10 LoC and removes stale data class entirely** |
| Q8 | `last_counted_at` field — add to existing `Segment` model or new collection? | **Add to Segment model** (no migration needed) |

---

## 5. Acceptance criteria

| ID | Behaviour | Verify |
|----|-----------|--------|
| AC-1 | Click Edit on existing audience → modal opens with prefilled filters → change tier=Gold → Save → card refreshes with new count | UI + curl |
| AC-2 | Audiences page loads ≤500ms (cached counts) for 5-segment tenant; "Refresh" click triggers POST and updates count | Network tab + curl |
| AC-3 | `last_counted_at` populated on every recount; "Counted 5m ago" shown in card | Mongo + UI |
| AC-4 | `GET /segments/all-customers` returns synthetic Segment with `customer_count=tenant total`; `GET /segments/all-customers/customers` returns first 1000 customers | curl |
| AC-5 | In wizard Step 2 — pick a partially-mapped template → inline variable picker appears → set values → Next becomes enabled | UI |
| AC-6 | CampaignsPage shows "Next: 8 Jun 04:30 UTC (10:00 IST)" line on scheduled campaigns | UI + screenshot |
| AC-7 | Pause an active campaign → status=paused → scheduler skips it for 1 tick → Resume → status=scheduled + new next_run_at | Mongo over 2 ticks |
| AC-8 | Clone an existing campaign → new draft with `(copy)` suffix, blank stats, schedule_type=now | UI + Mongo |
| AC-9 | Resend Failed: campaign with 3 failed messages → click resend → 3 new send attempts logged with `parent_run_id` | Mongo + WhatsApp logs |
| AC-10 | Open scheduled campaign in wizard → Step 1 audience selector disabled + amber banner; PUT with audience_id change → 409 | UI + curl |
| AC-11 | Test Send: type phone → send → 1 WhatsApp delivered to test number; result logged in `campaign_test_sends` | Live WhatsApp + Mongo |
| AC-12 | Missed campaign shows red badge + tooltip; "Re-run now" action resets to scheduled + new next_run_at | Mongo + UI |
| AC-13 | All existing AC-1 through AC-12 from Phase 3 still pass (regression) | Smoke |

---

## 6. Implementation Batches (Owner Can Pick)

### Batch A — Operational Safety (P0) — ~2.5 hr
Recommended FIRST. Single biggest user-value, lowest risk.
- **P4.10** Test Send (1.5 hr)
- **P4.5** `next_run_at` on CampaignsPage (30 min)
- **P4.11** Missed UI (45 min)

### Batch B — Editability & UX (P1) — ~4.5 hr
- **P4.1** Edit audience filters (1.5 hr)
- **P4.6** Pause / Resume (2 hr)
- **P4.9** Edit-while-scheduled guards (1 hr)

### Batch C — Data Quality (P1) — ~3 hr
- **P4.2** `last_counted_at` + non-blocking list (2 hr)
- **P4.3** "All Customers" helper (1 hr)

### Batch D — Power features (P2) — ~4 hr
- **P4.4** Inline variable mapping (1.5 hr)
- **P4.7** Clone (30 min)
- **P4.8** Resend Failed (2 hr)

**Total all batches**: ~14 hr | Single session: split across 2-3 sessions

---

## 7. Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| Editing filters on a segment used by 4 live campaigns — silent change | **Show warning** "This audience is used in N campaigns. Existing scheduled campaigns will use the new filter at their next fire." |
| Test Send sends a live WhatsApp message — counts toward AuthKey balance | Owner explicitly initiates each test send (manual phone entry). Log every test send. Daily limit does NOT include test_sends (separate collection). |
| Pause an `active` campaign while bulk send is mid-flight — partial fire | Pause flips status to `paused` but does NOT cancel in-flight asyncio task. Result: this run completes; the campaign won't fire again until resumed. Document this in tooltip. |
| Resend Failed could create infinite loop if all retries fail | Resend creates a NEW campaign_run; manual action only. No auto-retry. Hard cap at 5 retries per original-run (enforced via DB count of runs with same `parent_run_id`). |
| Edit-while-scheduled blocks legitimate template fix workflow | Allow template_id + variables + name changes; lock only audience + schedule. Pause-first guidance in banner. |
| `last_counted_at` field missing on existing rows | Frontend shows "—" + Refresh button. No migration. Optional one-shot script to populate. |
| Removing per-list recount → counts drift if customers added/removed | Existing daily cron + manual refresh + auto-refresh on segment edit. Net: counts ≤24h stale instead of fresh-per-page-load. |
| "All Customers" helper change accidentally breaks segment customer fetch | Helper has unit-style branch; add curl regression test for both code paths |

---

## 8. Rollback plan

| Item | Rollback |
|------|----------|
| Any backend change | `git revert` the commit; restart backend |
| New endpoints (test-send, clone, pause, resume, resend-failed, refresh-count) | No-op if not called; frontend hides buttons → safe to leave in place |
| `last_counted_at` field | Additive Mongo field; ignore if unused |
| `paused` / `missed` status values | If owner wants to revert: `db.campaigns.updateMany({status:{$in:["paused","missed"]}}, {$set:{status:"draft"}})` |
| Frontend Edit/Pause/Resume buttons | Feature-flag-able behind a single `PHASE_4_UI_ENABLED` env if owner wants gradual rollout (optional, not in default plan) |

No data destruction in any item.

---

## 9. Deliverables checklist

### Batch A (Operational Safety, P0)
- [ ] `backend/routers/campaigns.py` — `+POST /test-send`, `+POST /{id}/runs/{rid}/resend-failed` placeholder
- [ ] `backend/models/schemas.py` — no changes
- [ ] `frontend/src/pages/CampaignWizardPage.jsx` — Test Send UI in Step 2
- [ ] `frontend/src/pages/CampaignsPage.jsx` — `next_run_at` line, `missed` status badge + tooltip + "Re-run now"
- [ ] curl smoke: test-send returns success, next_run_at displays correctly

### Batch B (Editability & UX, P1)
- [ ] `backend/routers/campaigns.py` — `+POST /{id}/pause`, `+POST /{id}/resume`; `update_campaign` LOCKED set on `status=scheduled`
- [ ] `frontend/src/pages/AudiencesPage.jsx` — Edit button + dialog branch on `editingSeg`
- [ ] `frontend/src/pages/CampaignsPage.jsx` — Pause/Resume dropdown items
- [ ] `frontend/src/pages/CampaignWizardPage.jsx` — disable audience + Step 3 when `status=scheduled`, amber banner

### Batch C (Data Quality, P1)
- [ ] `backend/models/schemas.py` — `Segment.last_counted_at: Optional[str]`
- [ ] `backend/routers/customers.py` — non-blocking `list_segments`, `+POST /{id}/refresh-count`, `all-customers` token in `get_segment`/`get_segment_customers`
- [ ] `backend/core/helpers.py` — `resolve_audience()` helper
- [ ] `backend/core/loyalty_jobs.py` (or new `segment_jobs.py`) — daily auto-refresh of segment counts (piggyback on midnight cron)
- [ ] `frontend/src/pages/AudiencesPage.jsx` — "Counted X ago" + refresh icon

### Batch D (Power features, P2)
- [ ] `backend/routers/campaigns.py` — `+POST /{id}/clone`, `+POST /{id}/runs/{rid}/resend-failed`, helper `_execute_resend_subset()`
- [ ] `frontend/src/pages/CampaignsPage.jsx` — Clone in dropdown
- [ ] `frontend/src/pages/CampaignHistoryPage.jsx` — Resend Failed button
- [ ] `frontend/src/pages/CampaignWizardPage.jsx` — inline variable mapping panel in Step 2

### Cross-batch
- [ ] `/app/memory/PRD.md` updated
- [ ] `/app/memory/CR_STATUS_DASHBOARD.md` row updated (CR-024 Phase 4 IMPLEMENTED)
- [ ] Curl regression: send-now, scheduled, recurring all still fire correctly
- [ ] Unit tests for any new pure helpers (e.g., `resolve_audience` token branch)

---

## 10. Effort & sequence summary

| Batch | Items | Hours | Recommended order |
|-------|-------|-------|-------------------|
| A | Test Send + next_run_at display + Missed UI | 2.5 | **1st** |
| B | Edit filters + Pause/Resume + Edit guards | 4.5 | **2nd** |
| C | Cached counts + All Customers helper | 3.0 | **3rd** |
| D | Inline mapping + Clone + Resend Failed | 4.0 | **4th** |
| **All** | **11 items** | **~14 hr** | |

---

**End of planning doc.**
**Awaiting owner Q1 (which batches?) + Q2-Q8 answers or "go with defaults".**
