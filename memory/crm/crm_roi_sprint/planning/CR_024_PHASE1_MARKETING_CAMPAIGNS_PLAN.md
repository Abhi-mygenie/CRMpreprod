# CR-024 Phase 1: WhatsApp Marketing — Planning Doc

> **Status**: `cr024_phase1_planning_awaiting_approval`
> **Date**: 2026-06-06
> **Scope**: 3 new pages + sidebar restructure + campaign execution engine
> **Reference mock**: `/app/frontend/public/cr024_mock.html`
> **Effort**: ~3-4 days

---

## 1. Sidebar Restructure

### Current (ResponsiveLayout.jsx line 28-37):
```
WhatsApp
  ├── Settings        → /settings
  ├── Templates       → /templates
  ├── Automation      → /whatsapp-automation
  └── Segments        → /segments
```

### New:
```
WhatsApp
  ├── Settings        → /settings
  ├── Templates       → /templates
  ├── Automation      → /whatsapp-automation

Marketing
  ├── Campaigns       → /campaigns              (NEW)
  ├── Audiences       → /audiences              (NEW — replaces /segments)
  └── History         → /campaign-history        (NEW)
```

### File changes:
| File | Change |
|---|---|
| `ResponsiveLayout.jsx` line 17 | Update `whatsappChildPaths` — remove `/segments` |
| `ResponsiveLayout.jsx` line 28-37 | Remove "Segments" from WhatsApp children |
| `ResponsiveLayout.jsx` line 38 | Add new "Marketing" group with 3 children |
| `ResponsiveLayout.jsx` line 18 | Add `marketingChildPaths` array |
| `ResponsiveLayout.jsx` line 20 | Add `isMarketingChildActive` check |
| `App.js` line 49 | Change `/segments` → `/audiences` (keep SegmentsPage component reused for now) |
| `App.js` | Add 3 new routes: `/campaigns`, `/campaigns/new`, `/campaign-history` |

---

## 2. New Routes (App.js)

```jsx
// Marketing routes
<Route path="/audiences" element={<ProtectedRoute><AudiencesPage /></ProtectedRoute>} />
<Route path="/campaigns" element={<ProtectedRoute><CampaignsPage /></ProtectedRoute>} />
<Route path="/campaigns/new" element={<ProtectedRoute><CampaignWizardPage /></ProtectedRoute>} />
<Route path="/campaigns/:id" element={<ProtectedRoute><CampaignWizardPage /></ProtectedRoute>} />
<Route path="/campaign-history" element={<ProtectedRoute><CampaignHistoryPage /></ProtectedRoute>} />
```

Old `/segments` route → redirect to `/audiences` for backward compat.

---

## 3. DB Schema — New Collections

### 3.1 `campaigns` collection

```json
{
  "id": "uuid",
  "user_id": "pos_0001_restaurant_689",
  "name": "Weekend Biryani Festival",         // required (Q4)
  "audience_id": "uuid | all-customers",
  "audience_name": "Gold Customers",           // denormalized for display
  "audience_count": 342,                       // snapshot at creation
  "template_id": "25140",
  "template_name": "weekend_offer",
  "variable_mappings": {"{{1}}": "customer_name", ...},
  "variable_modes": {"{{1}}": "map", ...},
  "schedule_type": "now | scheduled | recurring",
  "scheduled_date": "2026-06-08",             // for scheduled
  "scheduled_time": "10:00",
  "recurring_frequency": "daily | weekly | monthly",  // for recurring
  "recurring_days": ["Mon", "Wed"],           // for weekly
  "recurring_day_of_month": "1",              // for monthly
  "recurring_end_option": "never | after_date | after_occurrences",
  "recurring_end_date": null,
  "recurring_occurrences": null,
  "status": "draft | active | completed | paused",
  "total_sent": 0,
  "total_delivered": 0,
  "total_read": 0,
  "total_failed": 0,
  "last_run_at": null,
  "run_count": 0,
  "created_at": "ISO",
  "updated_at": "ISO"
}
```

### 3.2 `campaign_runs` collection

```json
{
  "id": "uuid",
  "campaign_id": "uuid",
  "user_id": "pos_0001_restaurant_689",
  "audience_id": "uuid",
  "audience_count": 342,
  "opted_out_skipped": 12,
  "target_count": 330,                        // audience_count - opted_out
  "total_sent": 330,
  "total_delivered": 0,                       // updated by webhook callbacks
  "total_read": 0,
  "total_failed": 0,
  "rate_limit_remaining": 670,                // 1000 - 330 remaining today
  "status": "running | completed | failed",
  "started_at": "ISO",
  "completed_at": "ISO",
  "error": null
}
```

### 3.3 `whatsapp_message_logs` — add field

Add `campaign_run_id` field to existing message log docs created during campaign sends. This links individual messages to campaign runs for drill-down.

---

## 4. API Contracts — New Endpoints

### 4.1 Campaign CRUD

**`POST /api/campaigns`** — Create campaign
```
Request:  { name, audience_id, template_id, template_name, variable_mappings, variable_modes, schedule_type, scheduled_date?, scheduled_time?, recurring_*? }
Response: { id, name, status: "draft", ... }
```

**`GET /api/campaigns`** — List campaigns with stats
```
Response: [{ id, name, audience_name, audience_count, template_name, status, schedule_type, total_sent, total_delivered, total_read, total_failed, last_run_at, run_count, created_at }]
```

**`GET /api/campaigns/{id}`** — Get single campaign
```
Response: { ...full campaign doc }
```

**`PUT /api/campaigns/{id}`** — Update draft campaign
```
Request:  { name?, audience_id?, template_id?, schedule_type?, ... }
Response: { ...updated campaign }
```

**`DELETE /api/campaigns/{id}`** — Delete campaign
```
Response: { message: "Campaign deleted" }
```

### 4.2 Campaign Execution

**`POST /api/campaigns/{id}/send`** — Execute campaign NOW (Phase 1 core)
```
Request:  {} (empty — all config already in campaign doc)
Response: { campaign_run_id, target_count, message: "Sending to N customers..." }
```

**Execution flow (server-side, background task):**
1. Load campaign doc
2. Load audience customers via `build_customer_query()`
3. Filter: skip `whatsapp_opt_in: false` (Q3)
4. Rate limit check: count today's sends for this user. If `today_sent + target > 1000` → reject with 429 (Q2)
5. Create `campaign_runs` doc (status: running)
6. For each customer:
   a. Resolve variables via `build_body_values()` using template mappings
   b. Build `WhatsAppMessage` object
7. Call `send_bulk_messages()` with resolved messages
8. For each result: create `whatsapp_message_logs` entry with `campaign_run_id`
9. Update `campaign_runs` doc with final counts
10. Update `campaigns` doc totals + `last_run_at` + `run_count`

### 4.3 Campaign History

**`GET /api/campaigns/{id}/runs`** — List all runs for a campaign
```
Response: [{ id, target_count, total_sent, total_delivered, total_read, total_failed, started_at, completed_at }]
```

**`GET /api/campaign-runs`** — List all campaign runs (for History page)
```
Query: ?campaign_id=&days=30
Response: [{ id, campaign_name, audience_name, template_name, target_count, total_sent, total_delivered, total_read, total_failed, started_at }]
```

### 4.4 Daily Rate Limit

**`GET /api/campaigns/daily-limit`** — Get today's usage
```
Response: { limit: 1000, used: 330, remaining: 670 }
```

---

## 5. File Plan

### 5.1 New Files

| File | Purpose | ~Lines |
|---|---|---|
| `frontend/src/pages/CampaignsPage.jsx` | Campaign list with stats bar, filter tabs, campaign rows | ~200 |
| `frontend/src/pages/CampaignWizardPage.jsx` | Full-page 3-step wizard (Name/Audience → Message → Schedule/Send) | ~400 |
| `frontend/src/pages/AudiencesPage.jsx` | Audience grid (reuses existing segment CRUD, cleaner layout) | ~300 |
| `frontend/src/pages/CampaignHistoryPage.jsx` | History table with stats bar, filters, delivery % bars | ~200 |
| `backend/routers/campaigns.py` | Campaign CRUD + execution + history endpoints | ~300 |

### 5.2 Modified Files

| File | Change |
|---|---|
| `frontend/src/components/ResponsiveLayout.jsx` | Add Marketing group with 3 sub-items, remove Segments from WhatsApp |
| `frontend/src/App.js` | Add 5 new routes, redirect /segments → /audiences |
| `backend/server.py` | Include campaigns router |
| `backend/core/whatsapp.py` | Add `campaign_run_id` param to `log_message_attempt()` |

### 5.3 Reused (no changes)

| File | What's reused |
|---|---|
| `backend/core/helpers.py` → `build_customer_query()` | Audience customer filtering (same logic) |
| `backend/core/whatsapp.py` → `send_bulk_messages()` | Batch sending engine |
| `backend/core/whatsapp.py` → `build_body_values()` | Variable resolution per customer |
| `backend/core/whatsapp.py` → `resolve_variable()` | Individual variable resolution |
| `backend/routers/customers.py` → segments_router | Segment CRUD stays, reused by Audiences page |

---

## 6. Campaign Wizard — Step-by-Step Detail

### Step 1: Name & Audience
- Campaign name input (required — Q4)
- Audience dropdown (existing audiences + "All Customers")
- "Create new audience" link → navigates to `/audiences`
- Green info box: "N customers will receive this campaign" + "M opted out (will be skipped)"
- Next button → Step 2

### Step 2: Message
- Left panel: Template dropdown (only fully-mapped templates) + variable mapping display (read-only from Templates page config)
- Right panel: WhatsApp preview bubble with resolved sample values
- Back/Next buttons

### Step 3: Schedule & Send
- 3 radio options: Send Now / Schedule for Later / Recurring
- Confirmation box (amber):
  - Campaign name
  - Audience name + count + opted-out skipped = target count
  - Template name
  - Schedule type
  - Daily limit: "N of 1,000 remaining today"
- Double confirmation for >500 customers (Q5): extra "Are you sure?" dialog
- Buttons: "Save as Draft" + "Send to N Customers" (green)

---

## 7. Execution Engine — Phase 1 (Send Now only)

```python
async def execute_campaign_send(db, campaign_id, user):
    # 1. Load campaign
    campaign = await db.campaigns.find_one({"id": campaign_id, "user_id": user["id"]})
    
    # 2. Rate limit check (Q2: 1000/day)
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0)
    today_sent = await db.campaign_runs.aggregate([
        {"$match": {"user_id": user["id"], "started_at": {"$gte": today_start.isoformat()}}},
        {"$group": {"_id": None, "total": {"$sum": "$total_sent"}}}
    ]).to_list(1)
    used_today = today_sent[0]["total"] if today_sent else 0
    
    # 3. Load audience customers
    if campaign["audience_id"] == "all-customers":
        query = {"user_id": user["id"]}
    else:
        segment = await db.segments.find_one({"id": campaign["audience_id"]})
        query = build_customer_query(user["id"], segment["filters"])
    
    customers = await db.customers.find(query, {"_id": 0}).to_list(10000)
    
    # 4. Filter opted-out (Q3)
    eligible = [c for c in customers if c.get("whatsapp_opt_in") is not False]
    opted_out = len(customers) - len(eligible)
    
    # 5. Rate limit enforcement
    if used_today + len(eligible) > 1000:
        raise HTTPException(429, f"Daily limit: {1000 - used_today} remaining, need {len(eligible)}")
    
    # 6. Create campaign_run
    run_id = str(uuid.uuid4())
    run_doc = { "id": run_id, ... "status": "running" }
    await db.campaign_runs.insert_one(run_doc)
    
    # 7. Resolve variables + build messages per customer
    # 8. Call send_bulk_messages()
    # 9. Log each message with campaign_run_id
    # 10. Update campaign_runs + campaigns with final stats
```

---

## 8. Acceptance Criteria

| # | AC | Verify |
|---|---|---|
| AC-1 | Sidebar shows Marketing group with Campaigns/Audiences/History | Navigate + screenshot |
| AC-2 | `/campaigns` shows campaign list with stats bar + filter tabs | Load page |
| AC-3 | "New Campaign" → full-page wizard opens at Step 1 | Click button |
| AC-4 | Step 1: Campaign name required, audience selector shows all audiences + counts | Fill form |
| AC-5 | Step 1: Info box shows customer count + opted-out count | Select audience |
| AC-6 | Step 2: Template picker shows only fully-mapped templates | Open dropdown |
| AC-7 | Step 2: Variable mapping displayed + WhatsApp preview resolves sample data | Select template |
| AC-8 | Step 3: Send Now/Schedule/Recurring radio options | Click each |
| AC-9 | Step 3: Confirmation box shows campaign name, audience, template, daily limit | Verify text |
| AC-10 | Step 3: >500 customers triggers double confirmation dialog (Q5) | Select All Customers |
| AC-11 | "Send to N Customers" → backend executes, messages sent via AuthKey | Click + trace logs |
| AC-12 | Opted-out customers skipped (Q3) | Check message_logs count vs audience count |
| AC-13 | Rate limit enforced: >1000/day returns 429 (Q2) | Send 1001 |
| AC-14 | `campaign_runs` doc created with correct stats | Query DB |
| AC-15 | `whatsapp_message_logs` entries have `campaign_run_id` | Query DB |
| AC-16 | `/audiences` shows audience cards with counts + filter tags + Edit/Preview/Delete | Load page |
| AC-17 | `/campaign-history` shows history table with delivery %, resend failed option | Load page |
| AC-18 | Campaign status tracks: draft → active → completed | Full lifecycle test |

---

## 9. Implementation Sequence

```
Day 1: Backend foundation
  ├── campaigns router (CRUD + execution engine)
  ├── campaign_runs collection + indexes
  ├── Rate limit endpoint
  └── whatsapp_message_logs campaign_run_id field

Day 2: Frontend — Sidebar + Pages
  ├── ResponsiveLayout sidebar restructure
  ├── App.js routes
  ├── CampaignsPage (list)
  ├── AudiencesPage (grid)
  └── CampaignHistoryPage (table)

Day 3: Campaign Wizard
  ├── CampaignWizardPage (3 steps)
  ├── Step 1: Name + Audience
  ├── Step 2: Template + Preview
  ├── Step 3: Schedule + Confirm + Send
  └── Double confirmation dialog

Day 4: Integration + Polish
  ├── Wire wizard → backend send endpoint
  ├── Campaign stats aggregation (live delivery counts)
  ├── History page → campaign_runs data
  └── E2E test: create campaign → send → verify delivery
```

---

## 10. Out of Scope (Phase 1)

- Scheduled execution (APScheduler — Phase 3)
- Recurring execution (APScheduler — Phase 3)
- Campaign duplicate/clone
- A/B testing
- Cost estimation display
- Resend failed messages
- Campaign editing after send

---

## 11. Sign-off

**S1**: Approve planning doc for implementation?
